import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalog } from '../lib/catalog.js';

function fixture(overrides = {}) {
  const entries = [
    { name: 'Bambu PLA Basic @base', sub_path: 'filament/Bambu/Basic.json' },
    { name: 'Generic PETG @System', sub_path: 'filament/PETG.json' },
    { name: 'Generic PLA @System', sub_path: 'filament/PLA.json' },
    { name: 'common', sub_path: 'filament/base/common.json' },
  ];
  const calls = [];
  const catalog = createCatalog(async url => {
    calls.push(url);
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
  assert.equal(calls.length, 3, 'catalog and inherited profiles are cached');
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
  assert.equal(unsafe.calls.length, 1, 'unsafe URL is never fetched');
});
