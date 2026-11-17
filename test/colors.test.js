import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilament, withCatalogColor } from '../lib/colors.js';

test('reads colour words, shades and multi-colour lists from free text', () => {
  const black = parseFilament('Prusament PETG schwarz');
  assert.equal(black.product, 'Prusament PETG');
  assert.equal(black.query, 'Prusament PETG schwarz', 'colour words stay in the catalog query');
  assert.equal(black.colorName, 'Schwarz');
  assert.equal(black.colors.length, 1);
  const tri = parseFilament('Elegoo PLA tri color blau/rot/grün');
  assert.equal(tri.product, 'Elegoo PLA tri color');
  assert.equal(tri.colorName, 'Blau / Rot / Grün');
  assert.equal(tri.colors.length, 3);
  assert.equal(new Set(tri.colors).size, 3);
  const dark = parseFilament('eSUN PLA+ dunkelblau');
  assert.equal(dark.product, 'eSUN PLA+');
  assert.notEqual(dark.colors[0], parseFilament('eSUN PLA+ blau').colors[0]);
  assert.deepEqual(parseFilament('Brand PLA hell grün und rote').colorName, 'Hell Grün / Rote');
  assert.equal(parseFilament('Brand PLA a b c d e rot/blau/gelb/grün/weiß').colors.length, 4);
});

test('keeps hex input, unknown colours and colourless names', () => {
  const legacy = parseFilament('Bambu PLA Basic; #E87939');
  assert.deepEqual([legacy.product, legacy.query, legacy.colors, legacy.colorName],
    ['Bambu PLA Basic', 'Bambu PLA Basic', ['#e87939'], null]);
  assert.deepEqual(parseFilament('Bambu PLA Basic #abc').colors, ['#aabbcc']);
  const unknown = parseFilament('Prusament PETG; mauve');
  assert.deepEqual([unknown.colors, unknown.unknownColor, unknown.query], [[], 'mauve', 'Prusament PETG']);
  assert.deepEqual(parseFilament('Polymaker PolyTerra PLA').colors, []);
  assert.deepEqual(parseFilament('PLA rot', '#123456').colors, ['#123456'], 'explicit colour wins');
});

test('prefers the exact database colour when the input ends with its name', () => {
  const parsed = parseFilament('Bambu PLA Basic Jade White');
  assert.equal(parsed.product, 'Bambu PLA Basic Jade');
  const exact = withCatalogColor(parsed, { hex: '#00ae42', words: ['jade', 'white'] });
  assert.deepEqual([exact.product, exact.colorName, exact.colors], ['Bambu PLA Basic', 'Jade White', ['#00ae42']]);
  const multi = parseFilament('Brand PLA rot/blau');
  assert.equal(withCatalogColor(multi, { hex: '#000000', words: ['blau'] }), multi);
  const mismatch = parseFilament('Brand PLA rot');
  assert.equal(withCatalogColor(mismatch, { hex: '#000000', words: ['galaxy', 'rot'] }), mismatch);
});
