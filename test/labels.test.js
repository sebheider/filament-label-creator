import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { inflateSync } from 'node:zlib';
import { validateLabel, validateList, validateSize, renderPng, renderPdf, layout } from '../lib/labels.js';

const label = { name: 'Bambu PLA & <Basic>', color: '#e87939', material: 'PLA',
  nozzle: '190–240 °C', bed: '55 °C', diameter: '1.75 mm', density: '1.26 g/cm³' };

test('validates sizes, label counts, text and colors', () => {
  assert.deepEqual(validateSize({ width: 70, height: 40 }), { width: 70, height: 40 });
  for (const width of [0, 191, '70', NaN, Infinity]) {
    assert.throws(() => validateSize({ width, height: 40 }));
  }
  assert.throws(() => validateSize({ width: 70, height: 278 }));
  for (const items of [[], null, Array(31).fill(label)]) assert.throws(() => validateList(items));
  assert.throws(() => validateLabel({ ...label, color: 'url(https://evil.example)' }));
  assert.throws(() => validateLabel({ ...label, name: 'a'.repeat(121) }));
  assert.throws(() => validateLabel({ ...label, density: {} }));
  assert.equal(validateLabel({ name: 'PLA', color: '#123456' }).bed, '');
  const multi = validateLabel({ ...label, colors: ['#112233', '#445566'], colorName: 'Blau / Rot' });
  assert.deepEqual([multi.color, multi.colors, multi.colorName], ['#112233', ['#112233', '#445566'], 'Blau / Rot']);
  for (const colors of [[], Array(5).fill('#123456'), ['#123456', 'red']]) {
    assert.throws(() => validateLabel({ ...label, colors }));
  }
});

test('renders a safe 300 dpi PNG with requested physical size', async () => {
  const png = await renderPng(validateLabel(label), 70, 40);
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, Math.round(70 / 25.4 * 300));
  assert.equal(metadata.height, Math.round(40 / 25.4 * 300));
  assert.equal(metadata.density, 300);
  const malicious = validateLabel({ ...label, name: '<image href="https://evil.example"/>' });
  assert.ok((await renderPng(malicious, 30, 20)).length > 1000);
  const striped = await renderPng(validateLabel({ ...label, colors: ['#ff0000', '#0000ff'], colorName: 'Rot / Blau' }), 70, 40);
  const { data, info } = await sharp(striped).raw().toBuffer({ resolveWithObject: true });
  const pixel = x => [...data.subarray((10 * info.width + x) * info.channels, (10 * info.width + x) * info.channels + 3)];
  assert.deepEqual(pixel(Math.round(info.width * 0.25)), [255, 0, 0], 'first colour on the left half of the bar');
  assert.deepEqual(pixel(Math.round(info.width * 0.75)), [0, 0, 255], 'second colour on the right half');
});

test('A4 layout respects margins, label sizes and pagination', async () => {
  assert.deepEqual(layout(70, 40), { columns: 2, rows: 6, perPage: 12, gap: 3 });
  assert.equal(layout(190, 277).perPage, 1);
  const data = await renderPdf(Array(3).fill(validateLabel(label)), 190, 140);
  const pdf = await PDFDocument.load(data);
  assert.equal(pdf.getPageCount(), 3);
  for (const page of pdf.getPages()) {
    assert.ok(Math.abs(page.getWidth() - 210 / 25.4 * 72) < 0.001);
    assert.ok(Math.abs(page.getHeight() - 297 / 25.4 * 72) < 0.001);
    const stream = pdf.context.lookup(page.node.Contents().asArray()[0]);
    const commands = inflateSync(stream.getContents()).toString();
    const matrix = [...commands.matchAll(/([\d.]+) 0 0 ([\d.]+) 0 0 cm/g)]
      .find(match => Number(match[1]) > 1 && Number(match[2]) > 1);
    assert.ok(matrix, 'image has a physical-size transformation');
    assert.ok(Math.abs(Number(matrix[1]) - 190 / 25.4 * 72) < 0.001);
    assert.ok(Math.abs(Number(matrix[2]) - 140 / 25.4 * 72) < 0.001);
  }
});
