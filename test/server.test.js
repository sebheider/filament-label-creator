import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

test('API validates input, handles batches and delivers image/PDF downloads', async t => {
  const server = createApp(async filament => ({ ...filament, material: 'PLA', matchType: 'exact' }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  assert.equal((await post('/api/lookup', null)).status, 400);
  assert.equal((await post('/api/lookup', { width: 70, height: 40, filaments: [] })).status, 400);
  const filaments = [{ name: 'PLA', color: '#123456' }, { name: 'PETG', color: '#ffffff' }];
  const result = await post('/api/lookup', { width: 70, height: 40, filaments });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).labels.length, 2);
  const image = await post('/api/label', { width: 70, height: 40, label: filaments[0] });
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await image.arrayBuffer()).subarray(1, 4).toString(), 'PNG');
  const pdf = await post('/api/pdf', { width: 70, height: 40, labels: filaments });
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.match(pdf.headers.get('content-disposition'), /attachment/);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  const invalid = await post('/api/label', { width: 70, height: 40, label: { name: 'a', color: '<svg>' } });
  assert.equal(invalid.status, 400);
  assert.match(invalid.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('only one memory-intensive export runs at a time', async t => {
  const server = createApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/pdf`;
  const exportRequest = () => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ width: 190, height: 277, labels: [{ name: 'PLA', color: '#123456' }] }),
  });
  const responses = await Promise.all([exportRequest(), exportRequest()]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 429]);
  await Promise.all(responses.map(response => response.arrayBuffer()));
  const next = await exportRequest();
  assert.equal(next.status, 200, 'export slot is released on completion');
  await next.arrayBuffer();
});
