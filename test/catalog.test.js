import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalog } from '../lib/catalog.js';

function fixture(overrides = {}, spoolman = {}) {
  const entries = [
    { name: 'Bambu PLA Basic @base', sub_path: 'filament/Bambu/Basic.json' },
    { name: 'Generic PETG @System', sub_path: 'filament/PETG.json' },
    { name: 'Generic PLA @System', sub_path: 'filament/PLA.json' },
    { name: 'common', sub_path: 'filament/base/common.json' },
  ];
  const calls = [];
  const catalog = createCatalog(async url => {
    calls.push(url);
    if (url.includes('SpoolmanDB')) {
      const data = spoolman[url.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/main\/filaments\/([A-Za-z0-9]+)\.json$/)?.slice(1).join(':')];
      if (data instanceof Error) throw data;
      return data ?? null;
    }
    if (url.endsWith('OrcaFilamentLibrary.json')) return { filament_list: entries };
    if (url.endsWith('Basic.json')) return { inherits: 'common', filament_density: ['1.26'], ...overrides };
    if (url.endsWith('PETG.json')) return { inherits: 'common', nozzle_temperature_range_low: ['230'],
      nozzle_temperature_range_high: ['250'], hot_plate_temp: ['80'] };
    if (url.endsWith('PLA.json')) return { inherits: 'common' };
    return { nozzle_temperature_range_low: ['190'], nozzle_temperature_range_high: ['240'],
      hot_plate_temp: ['55'], filament_diameter: ['1.75'] };
  });
  return { catalog, calls, entries };
}
const filament = name => ({ name, color: '#ff6600' });

test('matches manufacturer aliases and resolves inherited data with source', async () => {
  const { catalog, calls } = fixture();
  const result = await catalog.lookup(filament('Bambu Lab PLA Basic'));
  assert.equal(result.matchType, 'exact');
  assert.equal(result.nozzle, '190–240 °C');
  assert.equal(result.density, '1.26 g/cm³');
  assert.equal(result.diameter, '1.75 mm');
  assert.match(result.sourceUrl, /^https:\/\/raw\.githubusercontent\.com\//);
  await catalog.lookup(filament('Bambu PLA Basic'));
  assert.equal(calls.filter(url => !url.includes('SpoolmanDB')).length, 3, 'catalog and inherited profiles are cached');
});

test('generic fallback is explicit and not confused with a product match', async () => {
  const { catalog } = fixture();
  const result = await catalog.lookup(filament('Unknown PETG'));
  assert.equal(result.matchType, 'generic');
  assert.equal(result.material, 'PETG');
  assert.equal(result.bed, '80 °C');
  assert.match(result.warning, /generisches/);
  const generic = await catalog.lookup(filament('Generic PLA'));
  assert.equal(generic.matchType, 'generic');
});

test('does not silently substitute PLA for composites or unknown materials', async () => {
  const { catalog } = fixture();
  for (const name of ['Mystery resin', 'Brand PLA-CF']) {
    const result = await catalog.lookup(filament(name));
    assert.equal(result.matchType, 'unknown');
    assert.equal(result.nozzle, null);
    assert.equal(result.sourceUrl, null);
  }
});

test('upstream failures are recoverable and never invent values', async () => {
  let count = 0;
  const catalog = createCatalog(async () => { count++; throw new Error('offline'); });
  for (let i = 0; i < 2; i++) {
    const result = await catalog.lookup(filament('PLA'));
    assert.equal(result.matchType, 'unknown');
    assert.equal(result.nozzle, null);
    assert.match(result.warning, /fehlgeschlagen/);
  }
  assert.equal(count, 2, 'failed requests do not poison cache');
});

test('cycles and unsafe remote paths fail closed', async () => {
  const cyclic = fixture({ inherits: 'Bambu PLA Basic @base' });
  assert.equal((await cyclic.catalog.lookup(filament('Bambu PLA Basic'))).matchType, 'unknown');
  const unsafe = fixture();
  unsafe.entries[0].sub_path = 'filament/../../secrets.json';
  assert.equal((await unsafe.catalog.lookup(filament('Bambu PLA Basic'))).matchType, 'unknown');
  assert.equal(unsafe.calls.filter(url => !url.includes('SpoolmanDB')).length, 1, 'unsafe URL is never fetched');
});

const DONKIE = 'Donkie/SpoolmanDB';
const COMMUNITY = 'Icezaza2543/SpoolmanDB-Community';
const bambu = { manufacturer: 'Bambu Lab', filaments: [
  { name: '{color_name}', material: 'PLA', density: 1.24, diameters: [1.75], extruder_temp: 220, bed_temp: 60,
    colors: [{ name: 'Jade White', hex: 'FFFFFF' }] },
  { name: '{color_name}', material: 'PLA+WOOD', density: 1.21, diameters: [1.75], extruder_temp: 215, bed_temp: 40,
    colors: [{ name: 'Black Walnut' }] },
  { name: 'Matte {color_name}', material: 'PLA', density: 1.31, diameters: [1.75], extruder_temp: 220, bed_temp: 60,
    finish: 'matte', colors: [{ name: 'Ivory White' }] },
  { name: 'Lite {color_name}', material: 'PLA', density: 1.4, diameters: [1.75], extruder_temp: 210, bed_temp: 35,
    colors: [{ name: 'Gray' }] },
  { name: '{color_name}', material: 'PLA', density: 1.24, diameters: [1.75], extruder_temp: 220, bed_temp: 40,
    multi_color_direction: 'longitudinal', colors: [{ name: 'Arctic Whisper' }] },
] };
const prusament = { manufacturer: 'Prusament', filaments: [
  { name: '{color_name}', material: 'PETG', density: 1.27, diameters: [1.75], extruder_temp_range: [240, 260],
    bed_temp_range: [70, 90], colors: [{ name: 'Galaxy Black' }] },
  { name: 'PC Blend Carbon Fiber {color_name}', material: 'PC-CF', density: 1.22, diameters: [1.75],
    extruder_temp_range: [275, 295], bed_temp_range: [100, 120], colors: [{ name: 'Black' }] },
  { name: 'Blend {color_name}', material: 'PC', density: 1.22, diameters: [1.75],
    extruder_temp_range: [265, 285], bed_temp_range: [100, 120], colors: [{ name: 'Natural' }] },
] };
const makerbot = { manufacturer: 'MakerBot', filaments: [
  { name: 'MakerBot PLA {color_name}', material: 'PLA', density: 1.24, diameters: [1.75],
    extruder_temp_range: [210, 220], bed_temp_range: [0, 60], colors: [{ name: 'True Red' }] },
  { name: 'MakerBot Tough PLA {color_name}', material: 'PLA', density: 1.24, diameters: [1.75],
    extruder_temp_range: [210, 225], bed_temp_range: [0, 60], colors: [{ name: 'Safety Orange' }] },
] };
const sainsmart = { manufacturer: 'SainSmart', filaments: [
  { name: 'SainSmart TPU {color_name}', material: 'TPU', density: 1.21, diameters: [1.75],
    extruder_temp_range: [200, 220], bed_temp_range: [40, 60], colors: [{ name: 'Black' }] },
  { name: 'Gt 3 Matte PLA {color_name}', material: 'PLA', density: 1.24, diameters: [1.75],
    extruder_temp_range: [190, 230], bed_temp_range: [50, 70], finish: 'matte', colors: [{ name: 'Black' }] },
] };
const spoolmanData = { [`${DONKIE}:bambulab`]: bambu, [`${DONKIE}:prusament`]: prusament,
  [`${COMMUNITY}:makerbot`]: makerbot, [`${COMMUNITY}:sainsmart`]: sainsmart };

test('SpoolmanDB manufacturer data has priority and matches product variants', async () => {
  const { catalog } = fixture({}, spoolmanData);
  const basic = await catalog.lookup(filament('Bambu Lab PLA Basic'));
  assert.equal(basic.matchType, 'exact');
  assert.equal(basic.nozzle, '220 °C');
  assert.equal(basic.bed, '60 °C');
  assert.equal(basic.density, '1.24 g/cm³');
  assert.equal(basic.sourceUrl, 'https://github.com/Donkie/SpoolmanDB/blob/main/filaments/bambulab.json');
  assert.match(basic.sourceName, /^SpoolmanDB: Bambu Lab/);
  assert.match(basic.warning, /SpoolmanDB/);
  assert.doesNotMatch(basic.warning, /Mehrere/);
  const matte = await catalog.lookup(filament('Bambu PLA Matte Ivory White'));
  assert.equal(matte.density, '1.31 g/cm³');
  assert.equal((await catalog.lookup(filament('BambuLab PLA Lite rot'))).bed, '35 °C');
  const petg = await catalog.lookup(filament('Prusament PETG Galaxy Black'));
  assert.equal(petg.nozzle, '240–260 °C');
  assert.equal(petg.bed, '70–90 °C');
  const carbon = await catalog.lookup(filament('Prusa PC Blend Carbon Fiber'));
  assert.equal(carbon.material, 'PC-CF');
  assert.equal(carbon.nozzle, '275–295 °C');
});

test('unknown product words are not mapped to another product', async () => {
  const { catalog } = fixture({}, spoolmanData);
  const result = await catalog.lookup(filament('Bambu PLA Tough'));
  assert.notEqual(result.sourceUrl, 'https://github.com/Donkie/SpoolmanDB/blob/main/filaments/bambulab.json');
  const unknown = await catalog.lookup(filament('Prusament PC Blend Glass Fiber'));
  assert.doesNotMatch(unknown.sourceName ?? '', /SpoolmanDB/);
});

test('community data covers MakerBot and SainSmart with a distinct warning', async () => {
  const { catalog, calls } = fixture({}, spoolmanData);
  const tough = await catalog.lookup(filament('MakerBot Tough PLA'));
  assert.equal(tough.matchType, 'exact');
  assert.equal(tough.nozzle, '210–225 °C');
  assert.equal(tough.bed, '0–60 °C');
  assert.equal(tough.sourceName, 'SpoolmanDB-Community: MakerBot Tough PLA (PLA)');
  assert.equal(tough.sourceUrl, 'https://github.com/Icezaza2543/SpoolmanDB-Community/blob/main/filaments/makerbot.json');
  assert.match(tough.warning, /ungeprüfter Community-Fork/);
  assert.ok(!calls.some(url => url.includes('Donkie/SpoolmanDB/main/filaments/makerbot')),
    'brands missing in SpoolmanDB are not requested there');
  assert.equal((await catalog.lookup(filament('SainSmart TPU'))).nozzle, '200–220 °C');
  const gt3 = await catalog.lookup(filament('SainSmart GT-3 Matte PLA'));
  assert.equal(gt3.nozzle, '190–230 °C');
  assert.equal(gt3.bed, '50–70 °C');
});

test('remote SpoolmanDB values are validated and failures fall back to slicer profiles', async () => {
  const hostile = { manufacturer: '<script>', filaments: [{ name: '{color_name}', material: 'PLA<img>',
    density: 99, diameters: [1.75, 'x'], extruder_temp_range: [260, 200], extruder_temp: 9999, bed_temp: 60 }] };
  const { catalog } = fixture({}, { [`${DONKIE}:bambulab`]: hostile });
  const result = await catalog.lookup(filament('Bambu PLA'));
  assert.equal(result.material, 'PLA');
  assert.equal(result.nozzle, null);
  assert.equal(result.density, null);
  assert.equal(result.bed, '60 °C');
  assert.equal(result.sourceName, 'SpoolmanDB: bambulab (PLA)');
  const offline = fixture({}, { [`${DONKIE}:bambulab`]: new Error('offline') });
  const fallback = await offline.catalog.lookup(filament('Bambu Lab PLA Basic'));
  assert.equal(fallback.sourceName, 'Bambu PLA Basic @base');
  const broken = fixture({}, { [`${COMMUNITY}:makerbot`]: { filaments: 'nope' } });
  const failed = await broken.catalog.lookup(filament('MakerBot Tough PLA'));
  assert.equal(failed.matchType, 'generic', 'invalid community file falls back to the generic profile');
  assert.equal(failed.sourceName, 'Generic PLA @System');
});

test('ambiguous SpoolmanDB matches are flagged', async () => {
  const data = { manufacturer: 'eSUN', filaments: [
    { name: '{color_name}', material: 'PLA+', extruder_temp: 210, bed_temp: 60 },
    { name: '{color_name}', material: 'PLA+', extruder_temp: 220, bed_temp: 60 },
  ] };
  const { catalog } = fixture({}, { [`${DONKIE}:esun`]: data });
  const result = await catalog.lookup(filament('eSUN PLA+'));
  assert.equal(result.nozzle, '210 °C');
  assert.match(result.warning, /Mehrere Einträge/);
});
