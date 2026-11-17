import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createCatalog } from './lib/catalog.js';
import { InputError, validateFilaments, validateLabel, validateList, validateSize, renderPng, renderPdf } from './lib/labels.js';
import { normalizeHex, parseFilament, withCatalogColor } from './lib/colors.js';

const catalog = createCatalog();
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Cache-Control': 'no-store',
};

async function jsonBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new InputError('Content-Type application/json erforderlich.');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65_536) throw new InputError('Anfrage zu groß (maximal 64 KiB).');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new InputError('Ungültige JSON-Anfrage.');
  }
}

export function createApp(lookup = filament => catalog.lookup(filament)) {
  let active = 0;
  let exportActive = false;
  return createServer(async (request, response) => {
    const send = (status, data, type = 'application/json; charset=utf-8', extra = {}) => {
      response.writeHead(status, { ...headers, 'Content-Type': type, ...extra });
      response.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
    };
    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
      return send(400, { error: 'Ungültige URL.' });
    }
    if (request.method === 'GET' && pathname === '/health') return send(200, { status: 'ok' });
    if (request.method === 'GET' && assets.has(pathname)) {
      const [file, type] = assets.get(pathname);
      try {
        return send(200, await readFile(new URL(`./public/${file}`, import.meta.url)), type);
      } catch {
        return send(500, { error: 'Oberfläche nicht verfügbar.' });
      }
    }
    if (request.method !== 'POST' || !['/api/lookup', '/api/label', '/api/pdf'].includes(pathname)) {
      return send(404, { error: 'Nicht gefunden.' });
    }
    const isExport = pathname !== '/api/lookup';
    if (active >= 2 || (isExport && exportActive)) {
      return send(429, { error: 'Server ausgelastet. Bitte gleich erneut versuchen.' });
    }
    active++;
    if (isExport) exportActive = true;
    try {
      const body = await jsonBody(request);
      const { width, height } = validateSize(body);
      if (pathname === '/api/lookup') {
        const filaments = validateFilaments(body.filaments);
        const defaultColor = normalizeHex(body.defaultColor) ?? '#e87939';
        const describe = async filament => {
          const parsed = parseFilament(filament.name, filament.color);
          const { matchedColor, ...found } = await lookup({ name: parsed.query, color: parsed.colors[0] ?? defaultColor });
          const { product, colors, colorName, unknownColor } = withCatalogColor(parsed, matchedColor);
          const hint = unknownColor ? `Farbe „${unknownColor}“ nicht erkannt – bitte Etikettenfarbe wählen.` : null;
          const label = { ...found, name: product.slice(0, 120), colors: colors.length ? colors : [defaultColor],
            colorName: colorName?.slice(0, 50) ?? null };
          label.color = label.colors[0];
          if (hint) label.warning = [hint, found.warning].filter(Boolean).join(' ');
          return label;
        };
        const labels = [];
        // Sequential batches bound outbound traffic and share the catalog cache.
        for (let i = 0; i < filaments.length; i += 3) {
          labels.push(...await Promise.all(filaments.slice(i, i + 3).map(describe)));
        }
        return send(200, { labels, width, height });
      }
      if (pathname === '/api/label') {
        return send(200, await renderPng(validateLabel(body.label), width, height), 'image/png',
          { 'Content-Disposition': 'attachment; filename="filament-label.png"' });
      }
      return send(200, await renderPdf(validateList(body.labels), width, height), 'application/pdf',
        { 'Content-Disposition': 'attachment; filename="filament-labels.pdf"' });
    } catch (error) {
      return send(error instanceof InputError ? 400 : 500,
        { error: error instanceof InputError ? error.message : 'Erstellung fehlgeschlagen. Bitte erneut versuchen.' });
    } finally {
      active--;
      if (isExport) exportActive = false;
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp();
  server.requestTimeout = 30_000;
  server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
    console.log(`Filament Label Creator läuft auf Port ${process.env.PORT || 3000}`);
  });
  process.on('SIGTERM', () => server.close());
}
