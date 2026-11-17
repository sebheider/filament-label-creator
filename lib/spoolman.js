// Manufacturer data from SpoolmanDB (MIT). Files are selected from this fixed table only;
// user input never becomes part of a URL.
export const SOURCES = [
  { key: 'donkie', label: 'SpoolmanDB', repo: 'Donkie/SpoolmanDB',
    warning: 'Herstellerangaben aus SpoolmanDB (Community-gepflegt). Vor dem Druck prüfen.' },
  { key: 'community', label: 'SpoolmanDB-Community', repo: 'Icezaza2543/SpoolmanDB-Community',
    warning: 'Daten aus SpoolmanDB-Community (ungeprüfter Community-Fork). Werte mit Herstellerangaben abgleichen.' },
];

// [file id, available in Donkie/SpoolmanDB, ...aliases]; the Community fork has every listed file.
const BRANDS = [
  ['bambulab', true, 'bambu lab', 'bambulab', 'bambu', 'bbl'],
  ['prusament', true, 'prusament', 'prusa research', 'prusa'],
  ['makerbot', false, 'makerbot'],
  ['sainsmart', false, 'sainsmart', 'sain smart'],
  ['polymaker', true, 'polymaker'],
  ['esun', true, 'esun'],
  ['sunlu', true, 'sunlu'],
  ['elegoo', true, 'elegoo'],
  ['creality', true, 'creality'],
  ['anycubic', true, 'anycubic'],
  ['overture', true, 'overture'],
  ['hatchbox', true, 'hatchbox'],
  ['eryone', true, 'eryone'],
  ['geeetech', true, 'geeetech'],
  ['flashforge', true, 'flashforge'],
  ['jayo', true, 'jayo'],
  ['kingroon', true, 'kingroon'],
  ['extrudr', true, 'extrudr'],
  ['fillamentum', true, 'fillamentum'],
  ['fiberlogy', true, 'fiberlogy'],
  ['formfutura', true, 'formfutura'],
  ['colorfabb', false, 'colorfabb'],
  ['dasfilament', true, 'das filament', 'dasfilament'],
  ['devildesign', true, 'devil design', 'devildesign'],
  ['3djake', true, '3djake', '3d jake'],
  ['protopasta', true, 'proto-pasta', 'proto pasta', 'protopasta'],
  ['inland', true, 'inland'],
  ['AmazonBasics', true, 'amazon basics', 'amazonbasics'],
  ['matterhackers', false, 'matterhackers'],
  ['ultimaker', false, 'ultimaker'],
  ['raise3d', false, 'raise3d', 'raise 3d'],
  ['qiditech', true, 'qidi tech', 'qiditech', 'qidi'],
  ['snapmaker', true, 'snapmaker'],
  ['spectrum', true, 'spectrum'],
  ['verbatim', true, 'verbatim'],
  ['addnorth', true, 'add:north', 'addnorth', 'add north'],
  ['ninjatek', false, 'ninjatek', 'ninjaflex'],
  ['zyltech', true, 'zyltech'],
  ['3dxtech', true, '3dxtech'],
  ['atomicfilament', false, 'atomic filament', 'atomicfilament'],
  ['AzureFilm', true, 'azurefilm', 'azure film'],
  ['recreus', false, 'recreus'],
  ['artillery', true, 'artillery'],
  ['biqu', true, 'biqu'],
  ['kexcelled', true, 'kexcelled'],
  ['sovol', false, 'sovol'],
  ['amolen', false, 'amolen'],
  ['tinmorry', true, 'tinmorry'],
].map(([id, donkie, ...aliases]) => ({ id, donkie, aliases }));

const FILLER = new Set(['basic', 'standard', 'filament', 'mm', 'kg', 'g', '1.75', '2.85',
  'spool', 'spule', 'rolle', 'refill']);
// Plain colour words (EN/DE) that may describe a colour not listed in the database.
const COLOR_WORDS = new Set(['black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'grey',
  'gray', 'silver', 'gold', 'purple', 'violet', 'pink', 'brown', 'beige', 'clear', 'natural',
  'dark', 'light', 'cyan', 'magenta', 'turquoise', 'schwarz', 'weiss', 'rot', 'blau', 'grun',
  'gruen', 'gelb', 'grau', 'silber', 'lila', 'violett', 'rosa', 'braun', 'natur', 'dunkel',
  'hell', 'turkis', 'tuerkis']);

export function tokens(text) {
  return String(text).toLowerCase().replace(/ß/g, 'ss').replace(/[™®©]/g, ' ').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').match(/[a-z]+(?:\+(?![a-z0-9]))?|\d+(?:[.,]\d+)?/g)
    ?.map(token => token.replace(',', '.')) ?? [];
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const brandPatterns = BRANDS.flatMap(brand => brand.aliases.map(alias => ({ brand,
  pattern: new RegExp(`^\\s*${alias.split(/[\s-]+/).map(escape).join('[\\s-]*')}(?![a-z0-9])`, 'i') })))
  .sort((a, b) => b.pattern.source.length - a.pattern.source.length);

// Returns the brand table entry and the remaining product words, or null for unknown brands.
export function findBrand(name) {
  for (const { brand, pattern } of brandPatterns) {
    const match = String(name).match(pattern);
    if (match) return { brand, rest: String(name).slice(match[0].length) };
  }
  return null;
}

export function fileUrls(source, brand) {
  if (source.key === 'donkie' && !brand.donkie) return null;
  if (!/^[A-Za-z0-9]+$/.test(brand.id)) throw new Error('Ungültige Marke');
  return { raw: `https://raw.githubusercontent.com/${source.repo}/main/filaments/${brand.id}.json`,
    page: `https://github.com/${source.repo}/blob/main/filaments/${brand.id}.json` };
}

const text = (value, max) => typeof value === 'string' && /^[\p{L}\p{N} +\-/().%&']+$/u.test(value.trim()) ?
  value.trim().slice(0, max) : null;
const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) &&
  value >= min && value <= max ? value : null;

function temperature(range, single) {
  if (Array.isArray(range) && range.length === 2) {
    const [low, high] = range.map(value => number(value, 0, 500));
    if (low !== null && high !== null && low <= high) return low === high ? `${low} °C` : `${low}–${high} °C`;
  }
  const value = number(single, 1, 500);
  return value === null ? null : `${value} °C`;
}

function describe(entry) {
  const words = [];
  for (const key of ['finish', 'pattern', 'multi_color_direction']) {
    if (typeof entry[key] === 'string') words.push(...tokens(entry[key]));
  }
  if (entry.multi_color_direction) words.push('multicolor', 'multi', 'color');
  if (entry.glow === true) words.push('glow');
  if (entry.translucent === true) words.push('translucent');
  return words;
}

// Finds the best entry in a SpoolmanDB manufacturer file for the product words after the brand.
export function matchFile(data, rest, brand, materialOf) {
  if (!data || !Array.isArray(data.filaments)) throw new Error('Ungültige SpoolmanDB-Datei');
  const brandWords = new Set([...brand.aliases.flatMap(tokens), ...tokens(data.manufacturer ?? '')]);
  const wanted = tokens(rest).filter(token => !brandWords.has(token) && !FILLER.has(token));
  if (!wanted.length) return null;
  const candidates = [];
  data.filaments.forEach((entry, index) => {
    if (!entry || typeof entry.name !== 'string' || typeof entry.material !== 'string') return;
    const nameWords = tokens(entry.name.replace(/\{color_name\}/g, ' ')).filter(token => !brandWords.has(token));
    const materialWords = tokens(entry.material);
    if (!materialWords.length) return;
    const required = new Set([...nameWords, materialWords[0]]);
    if (![...required].every(token => wanted.includes(token))) return;
    const optional = new Set([...materialWords, ...describe(entry)].filter(token => !required.has(token)));
    const leftover = wanted.filter(token => !required.has(token) && !optional.has(token));
    const colors = Array.isArray(entry.colors) ? entry.colors.map(color => new Set(tokens(color?.name ?? ''))) : [];
    const colorMatch = leftover.length > 0 && colors.some(color => leftover.every(token => color.has(token)));
    if (leftover.length && !colorMatch && !leftover.every(token => COLOR_WORDS.has(token))) return;
    candidates.push({ entry, index, score: wanted.length - leftover.length, colorMatch,
      unmentioned: [...optional].filter(token => !wanted.includes(token)).length });
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || b.colorMatch - a.colorMatch ||
    a.unmentioned - b.unmentioned || a.index - b.index);
  const best = candidates[0];
  const values = ({ entry }) => {
    const diameters = Array.isArray(entry.diameters) ?
      [...new Set(entry.diameters.map(value => number(value, 1, 3.5)).filter(value => value !== null))] : [];
    const density = number(entry.density, 0.5, 5);
    return {
      material: text(entry.material, 30) ?? materialOf(entry.material),
      nozzle: temperature(entry.extruder_temp_range, entry.extruder_temp),
      bed: temperature(entry.bed_temp_range, entry.bed_temp),
      diameter: diameters.length ? `${diameters.join(' / ')} mm` : null,
      density: density === null ? null : `${density} g/cm³`,
    };
  };
  const result = values(best);
  const ambiguous = candidates.slice(1).some(other => other.score === best.score &&
    other.colorMatch === best.colorMatch && other.unmentioned === best.unmentioned &&
    JSON.stringify(values(other)) !== JSON.stringify(result));
  if (!result.nozzle && !result.bed && !result.density) return null;
  const manufacturer = text(data.manufacturer, 40) ?? brand.id;
  let product = best.entry.name.replace(/\{color_name\}/g, ' ').replace(/\s+/g, ' ').trim();
  if (product.toLowerCase().startsWith(`${manufacturer.toLowerCase()} `)) product = product.slice(manufacturer.length);
  product = text(product, 60);
  return { ...result, ambiguous,
    product: [manufacturer, product, result.material && `(${result.material})`].filter(Boolean).join(' ') };
}
