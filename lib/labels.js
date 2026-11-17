import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

export class InputError extends Error {}

const fields = ['material', 'nozzle', 'bed', 'diameter', 'density'];
function text(value, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max ||
      (required && !value.trim()) || /[\x00-\x08\x0b-\x1f]/.test(value)) {
    throw new InputError('Ungültiger Text oder maximale Textlänge überschritten.');
  }
  return value.trim();
}

export function validateLabel(label) {
  if (!label || typeof label !== 'object') throw new InputError('Label fehlt.');
  const result = { name: text(label.name, 120, true), color: label.color };
  if (typeof result.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(result.color)) {
    throw new InputError('Farbe muss ein sechsstelliger Hex-Farbwert sein (z. B. #e87939).');
  }
  for (const field of fields) result[field] = text(label[field], 50);
  return result;
}

export function validateSize(body) {
  const { width, height } = body;
  if (typeof width !== 'number' || typeof height !== 'number' ||
      !Number.isFinite(width) || !Number.isFinite(height) ||
      width < 30 || width > 190 || height < 20 || height > 277) {
    throw new InputError('Labelgröße: Breite 30–190 mm, Höhe 20–277 mm.');
  }
  return { width, height };
}

export function validateList(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) {
    throw new InputError('Bitte 1 bis 30 Filamente angeben.');
  }
  return items.map(validateLabel);
}

const escape = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);

export async function renderPng(label, width, height) {
  const lines = label.name.length <= 38 ? [label.name] :
    [label.name.slice(0, Math.ceil(label.name.length / 2)), label.name.slice(Math.ceil(label.name.length / 2))];
  const fontSize = Math.min(34, 610 / (Math.max(...lines.map(line => line.length)) * 0.62));
  const property = (x, y, title, value) => `<text x="${x}" y="${y}" fill="#687384" font-size="16" letter-spacing="2">${title}</text>
    <text x="${x}" y="${y + 35}" fill="#152237" font-size="${Math.min(27, 270 / ((value || 'k. A.').length * 0.62))}" font-weight="600">${escape(value || 'k. A.')}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width / 25.4 * 300)}" height="${Math.round(height / 25.4 * 300)}" viewBox="0 0 700 400">
    <rect width="700" height="400" fill="white"/>
    <g font-family="DejaVu Sans, sans-serif">
      <rect x="1" y="1" width="698" height="398" rx="18" fill="white" stroke="#dce2e9" stroke-width="2"/>
      <path d="M18 0 H682 Q700 0 700 18 V22 H0 V18 Q0 0 18 0" fill="${label.color}"/>
      <circle cx="48" cy="61" r="13" fill="${label.color}" stroke="#dce2e9"/>
      <text x="74" y="67" font-size="19" font-weight="700" fill="#435169">${escape(label.material || 'FILAMENT')}</text>
      <text x="662" y="65" text-anchor="end" font-size="14" fill="#687384">${label.color.toUpperCase()}</text>
      ${lines.map((line, i) => `<text x="35" y="${115 + i * 36}" font-size="${fontSize}" fill="#152237" font-weight="700">${escape(line)}</text>`).join('')}
      <path d="M35 175 H665" stroke="#e5e9ef"/>
      ${property(35, 213, 'DÜSE', label.nozzle)}
      ${property(365, 213, 'DRUCKBETT¹', label.bed)}
      ${property(35, 299, 'DURCHMESSER', label.diameter)}
      ${property(365, 299, 'DICHTE', label.density)}
      <text x="35" y="377" fill="#687384" font-size="12">¹ Beheizte Platte · Profilwerte vor Verwendung prüfen</text>
    </g>
  </svg>`;
  return sharp(Buffer.from(svg), { limitInputPixels: 10_000_000 })
    .flatten({ background: '#ffffff' }).png().withMetadata({ density: 300 }).toBuffer();
}

export function layout(width, height) {
  const gap = 3;
  const columns = Math.floor((190 + gap) / (width + gap));
  const rows = Math.floor((277 + gap) / (height + gap));
  return { columns, rows, perPage: columns * rows, gap };
}

export async function renderPdf(labels, width, height) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Filament-Labels');
  const mm = 72 / 25.4;
  const { columns, perPage, gap } = layout(width, height);
  let page;
  for (let i = 0; i < labels.length; i++) {
    const position = i % perPage;
    if (position === 0) page = pdf.addPage([210 * mm, 297 * mm]);
    const image = await pdf.embedPng(await renderPng(labels[i], width, height));
    page.drawImage(image, {
      x: (10 + (position % columns) * (width + gap)) * mm,
      y: (297 - 10 - height - Math.floor(position / columns) * (height + gap)) * mm,
      width: width * mm, height: height * mm,
    });
    await image.embed();
  }
  return Buffer.from(await pdf.save());
}
