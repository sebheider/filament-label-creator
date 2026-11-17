import { SOURCES, fileUrls, findBrand, matchFile } from './spoolman.js';

const ROOT = 'https://raw.githubusercontent.com/SoftFever/OrcaSlicer/main/resources/profiles/';
const LIBRARY = 'OrcaFilamentLibrary';
const TTL = 60 * 60 * 1000;

function normalize(name) {
  return name.toLowerCase().replace(/bambu\s*lab/g, 'bambu')
    .replace(/^polymaker\s+/, '').replace(/\s+/g, ' ').trim();
}

function materialOf(name) {
  return name.toUpperCase().match(/(?:^|[^A-Z0-9])((?:PETG|PLA|ABS|ASA|TPU|PCTG|PPA|PPS|PAHT|PA12|PA6|PA|PC|PVA|HIPS|PET|PP)(?:[- ](?:CF|GF))?)(?=$|[^A-Z0-9])/)?.[1].replace(' ', '-') ?? null;
}

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Onlinebibliothek nicht erreichbar');
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 2_000_000) throw new Error('Onlineprofil zu groß');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Only catalog paths on this fixed upstream are fetched, never user-supplied URLs.
function profileUrl(path) {
  if (typeof path !== 'string' || !path.startsWith('filament/') ||
      !path.endsWith('.json') || path.split('/').some(part => !part || part === '..' || part === '.') ||
      /[\\?#:\x00-\x1f]/.test(path)) throw new Error('Ungültiger Profilpfad');
  return `${ROOT}${LIBRARY}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function createCatalog(fetchJson = download) {
  const cache = new Map();
  async function get(url) {
    const previous = cache.get(url);
    if (previous?.expires > Date.now()) return previous.value;
    const value = Promise.resolve().then(() => fetchJson(url));
    cache.set(url, { value, expires: Date.now() + TTL });
    try {
      return await value;
    } catch (error) {
      cache.delete(url);
      throw error;
    }
  }

  async function orcaLookup(filament, empty) {
    const { filament_list: entries } = await get(`${ROOT}${LIBRARY}.json`);
    if (!Array.isArray(entries)) throw new Error('Ungültiger Katalog');
    const candidates = entries.filter(entry => typeof entry.name === 'string' &&
      / @(?:base|System)$/.test(entry.name));
    const productName = entry => entry.name.split(' @')[0];
    const preferBase = matches => matches.find(entry => entry.name.endsWith(' @base')) ?? matches[0];
    let match = preferBase(candidates.filter(entry =>
      normalize(productName(entry)) === normalize(filament.name)));
    const exact = Boolean(match) && !/^generic /i.test(productName(match));
    if (!match && empty.material) {
      match = preferBase(candidates.filter(entry =>
        normalize(productName(entry)) === normalize(`Generic ${empty.material}`)));
    }
    if (!match) return null;
    const visited = new Set();
    async function resolve(entry) {
      if (visited.has(entry.name) || visited.size >= 12) throw new Error('Ungültige Profilvererbung');
      visited.add(entry.name);
      const profile = await get(profileUrl(entry.sub_path));
      if (!profile) throw new Error('Profil fehlt');
      if (!profile.inherits) return profile;
      const parent = entries.find(item => item.name === profile.inherits);
      if (!parent) throw new Error('Basisprofil fehlt');
      return { ...await resolve(parent), ...profile };
    }
    const profile = await resolve(match);
    const value = key => {
      const raw = Array.isArray(profile[key]) ? profile[key][0] : profile[key];
      const number = Number(raw);
      return Number.isFinite(number) && number > 0 ? number : null;
    };
    const low = value('nozzle_temperature_range_low');
    const high = value('nozzle_temperature_range_high');
    const nozzle = low && high ? `${low}–${high} °C` :
      value('nozzle_temperature') ? `${value('nozzle_temperature')} °C` : null;
    const bed = value('hot_plate_temp');
    const diameter = value('filament_diameter');
    const density = value('filament_density');
    return { ...empty, material: materialOf(productName(match)) ?? empty.material,
      nozzle, bed: bed ? `${bed} °C` : null,
      diameter: diameter ? `${diameter} mm` : null, density: density ? `${density} g/cm³` : null,
      sourceName: match.name, sourceUrl: profileUrl(match.sub_path),
      matchType: exact ? 'exact' : 'generic',
      warning: exact ? 'Slicerprofil (ggf. geerbte Werte), keine garantierte Herstellerempfehlung. Vor dem Druck prüfen.' :
        'Nur generisches Materialprofil gefunden, kein produktspezifisches Datenblatt. Werte prüfen.' };
  }

  // Source priority: SpoolmanDB → OrcaSlicer product profile → SpoolmanDB-Community → OrcaSlicer generic.
  async function lookup(filament) {
    const empty = { ...filament, material: materialOf(filament.name), nozzle: null, bed: null,
      diameter: null, density: null, sourceName: null, sourceUrl: null, matchType: 'unknown' };
    const brand = findBrand(filament.name);
    let failed = false;
    async function spoolman(source) {
      const urls = brand && fileUrls(source, brand.brand);
      if (!urls) return null;
      try {
        const data = await get(urls.raw);
        const match = data === null ? null : matchFile(data, brand.rest, brand.brand, materialOf);
        if (!match) return null;
        return { ...empty, material: match.material ?? empty.material, nozzle: match.nozzle, bed: match.bed,
          diameter: match.diameter, density: match.density, sourceName: `${source.label}: ${match.product}`,
          sourceUrl: urls.page, matchType: 'exact', matchedColor: match.color, warning: source.warning +
            (match.ambiguous ? ' Mehrere Einträge mit abweichenden Werten passen – Produktnamen präzisieren.' : '') };
      } catch {
        failed = true;
        return null;
      }
    }
    async function orca() {
      try {
        return await orcaLookup(filament, empty);
      } catch {
        failed = true;
        return null;
      }
    }
    const primary = await spoolman(SOURCES[0]);
    if (primary) return primary;
    const slicer = await orca();
    if (slicer?.matchType === 'exact') return slicer;
    const community = await spoolman(SOURCES[1]);
    if (community) return community;
    if (slicer) return slicer;
    return { ...empty, warning: failed ?
      'Online-Recherche fehlgeschlagen. Werte bitte manuell ergänzen oder später erneut versuchen.' :
      'Kein passendes Onlineprofil. Werte bitte manuell ergänzen.' };
  }
  return { lookup };
}
