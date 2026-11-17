import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { MAX_COLORS } from './colors.js';

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
  const colors = Array.isArray(label.colors) ? label.colors : [label.color];
  if (colors.length < 1 || colors.length > MAX_COLORS ||
      colors.some(color => typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) {
    throw new InputError(`Bitte 1 bis ${MAX_COLORS} Farben als sechsstellige Hex-Farbwerte angeben (z. B. #e87939).`);
  }
  const result = { name: text(label.name, 120, true), color: colors[0], colors: [...colors],
    colorName: text(label.colorName, 50) };
  for (const field of fields) result[field] = text(label[field], 50);
  return result;
}

// Lookup input: free text per filament, e.g. "Prusament PETG schwarz"; the hex colour is optional.
export function validateFilaments(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) {
    throw new InputError('Bitte 1 bis 30 Filamente angeben.');
  }
  return items.map(item => {
    if (!item || typeof item !== 'object') throw new InputError('Filament fehlt.');
    if (item.color != null && (typeof item.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.color))) {
      throw new InputError('Farbe muss ein sechsstelliger Hex-Farbwert sein (z. B. #e87939).');
    }
    return { name: text(item.name, 160, true), color: item.color ?? null };
  });
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

function wrapText(value, maxLength, maxLines = 3) {
  const lines = [];
  let line = '';
  for (const word of value.split(/\s+/)) {
    if (line && `${line} ${word}`.length > maxLength) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines[maxLines - 1] = lines.slice(maxLines - 1).join(' ');
    lines.length = maxLines;
  }
  return lines;
}

function icon(name, x, y, size, color = '#10283a') {
  const paths = {
    spool: '<path d="M-23-23h46v46h-46zM-23-9l23 13 23-13M0 4v19"/>',
    nozzle: '<path d="M-11-25v31a17 17 0 1 0 22 0v-31a11 11 0 0 0-22 0zM0-12v29"/>',
    bed: '<path d="M-25 16h50v9h-50zM-16 7c-8-7 8-9 0-17M0 7c-8-7 8-9 0-17M16 7c-8-7 8-9 0-17"/>',
    diameter: '<circle r="19"/><path d="M-28 0h56M-28 0l8-6M-28 0l8 6M28 0l-8-6M28 0l-8 6"/>',
    density: '<path d="m-26-12 26-14 26 14-26 14zM-26 0 0 14 26 0M-26 12 0 26 26 12"/>',
  };
  return `<g transform="translate(${x} ${y}) scale(${size / 56})" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</g>`;
}

function spoolIllustration(x, y, scale = 1, color = '#10283a') {
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="-18" cy="0" rx="33" ry="76"/>
    <path d="M-18-76h43c43 0 68 34 68 76s-25 76-68 76h-43M-18-58h42c31 0 50 24 50 58S55 58 24 58h-42"/>
    <ellipse cx="25" cy="0" rx="21" ry="36"/>
    <path d="M-48-53c17 25 17 81 0 106M-35-65c19 29 19 101 0 130"/>
  </g>`;
}

const colorsOf = label => label.colors ?? [label.color];
const colorNameOf = label => (label.colorName || colorsOf(label).join(' / ')).toUpperCase();
const inkOn = hex => {
  const channels = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255);
  const luminance = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.48 ? '#10283a' : '#ffffff';
};

function colorSwatch(colors, x, y, width, height, radius, id) {
  const stripeWidth = width / colors.length;
  const stripes = colors.map((color, i) =>
    `<rect x="${x + i * stripeWidth}" y="${y}" width="${stripeWidth + 1}" height="${height}" fill="${color}"/>`).join('');
  return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}"/></clipPath></defs>
    <g clip-path="url(#${id})">${stripes}</g>`;
}

function filamentTexture(colors, x, y, width, height, id) {
  const lines = Array.from({ length: Math.ceil(width / 12) + 4 }, (_, index) => {
    const start = x - 36 + index * 12;
    const shade = index % 2 ? '#ffffff' : '#10283a';
    const color = colors[index % colors.length];
    const channels = color.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16));
    const target = shade === '#ffffff' ? 255 : 16;
    const toned = `#${channels.map(channel => Math.round(channel * 0.28 + target * 0.72)
      .toString(16).padStart(2, '0')).join('')}`;
    return `<path d="M${start} ${y + height + 5} C${start + 28} ${y + height * 0.7},${start + 33} ${y + height * 0.3},${start + 61} ${y - 5}" stroke="${toned}" stroke-width="7" opacity=".72"/>`;
  }).join('');
  return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="16"/></clipPath></defs>
    <g clip-path="url(#${id})" fill="none" stroke-linecap="round">${lines}</g>`;
}

function propertyCard(x, y, width, height, name, title, value, size) {
  const shown = value || 'k. A.';
  const lines = wrapText(shown, Math.max(12, Math.floor(width / 15)), 2);
  const fontSize = Math.min(size, 280 / (Math.max(...lines.map(line => line.length)) * 0.58));
  const valueY = y + height * 0.73;
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="16" fill="#eef3f6"/>
    ${icon(name, x + 36, y + 34, 38)}
    <text x="${x + 68}" y="${y + 39}" fill="#56697a" font-size="15" font-weight="700" letter-spacing="1.5">${title}</text>
    ${lines.map((line, index) => `<text x="${x + 24}" y="${valueY + index * (fontSize + 4)}" fill="#10283a" font-size="${fontSize}" font-weight="700">${escape(line)}</text>`).join('')}`;
}

function portraitSvg(label, height, widthPx, heightPx) {
  const colors = colorsOf(label);
  const nameLines = wrapText(label.name, 20);
  const nameSize = Math.min(59, 390 / (Math.max(...nameLines.map(line => line.length)) * 0.58));
  const headerHeight = height * 0.15;
  const colorY = height * 0.38;
  const colorHeight = height * 0.145;
  const gridY = height * 0.59;
  const gridBottom = height * 0.92;
  const gap = 12;
  const cellWidth = (630 - gap) / 2;
  const cellHeight = (gridBottom - gridY - gap) / 2;
  const colorInk = inkOn(colors[0]);
  const titleY = height * 0.235;
  const titleLines = nameLines.map((line, index) =>
    `<text x="42" y="${titleY + index * (nameSize + 5)}" fill="#10283a" font-size="${nameSize}" font-weight="800" letter-spacing="-1.5">${escape(line)}</text>`).join('');
  const colorTitle = colorNameOf(label);
  const colorFont = Math.min(33, 470 / (colorTitle.length * 0.58));
  const texture = filamentTexture(colors, 420, colorY, 244, colorHeight, 'portrait-texture');
  const curve = `M402 ${colorY} C432 ${colorY + 10},422 ${colorY + colorHeight - 10},385 ${colorY + colorHeight} H360 C390 ${colorY + colorHeight - 20},377 ${colorY + 10},402 ${colorY} Z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 700 ${height}">
    <rect width="700" height="${height}" fill="#ffffff"/>
    <g font-family="Arial, Helvetica, sans-serif">
      <rect x="10" y="10" width="680" height="${height - 20}" rx="34" fill="#ffffff" stroke="#10283a" stroke-width="5"/>
      <path d="M44 12h612a34 34 0 0 1 34 34v${headerHeight - 36}c-66 26-95 4-151 30H44a34 34 0 0 1-34-34V46a34 34 0 0 1 34-34z" fill="#10283a"/>
      <path d="M535 ${headerHeight}c55-5 89-49 155-43v20c-66-5-98 38-155 43z" fill="#16a7e0"/>
      ${icon('spool', 69, headerHeight * 0.48, 42, '#ffffff')}
      <text x="111" y="${headerHeight * 0.54}" fill="#ffffff" font-size="24" font-weight="700" letter-spacing="2">SPULENWERK</text>
      <text x="652" y="${headerHeight * 0.54}" text-anchor="end" fill="#cfe6f3" font-size="18" font-weight="600">${escape((label.material || 'FILAMENT').toUpperCase())}</text>
      ${titleLines}
      ${spoolIllustration(566, height * 0.265, 0.68, '#687789')}
      <rect x="35" y="${colorY}" width="630" height="${colorHeight}" rx="30" fill="${colors[0]}"/>
      ${texture}
      <path d="${curve}" fill="#ffffff" opacity=".96"/>
      <text x="62" y="${colorY + colorHeight * 0.48}" fill="${colorInk}" font-size="${colorFont}" font-weight="800">${escape(colorTitle)}</text>
      <text x="64" y="${colorY + colorHeight * 0.78}" fill="${colorInk}" font-size="20" font-style="italic" opacity=".9">FILAMENTFARBE</text>
      <path d="M35 ${height * 0.555}h630" stroke="#d9e2e8" stroke-width="2"/>
      <path d="M35 ${height * 0.555}h260q20 0 30 ${height * 0.035}H35z" fill="#10283a"/>
      <text x="54" y="${height * 0.585}" fill="#ffffff" font-size="20" font-weight="700" letter-spacing="1.5">DRUCKPROFIL</text>
      ${propertyCard(35, gridY, cellWidth, cellHeight, 'nozzle', 'DÜSE', label.nozzle, 24)}
      ${propertyCard(35 + cellWidth + gap, gridY, cellWidth, cellHeight, 'bed', 'HEIZBETT', label.bed, 24)}
      ${propertyCard(35, gridY + cellHeight + gap, cellWidth, cellHeight, 'diameter', 'DURCHMESSER', label.diameter, 24)}
      ${propertyCard(35 + cellWidth + gap, gridY + cellHeight + gap, cellWidth, cellHeight, 'density', 'DICHTE', label.density, 24)}
      <text x="35" y="${height * 0.965}" fill="#667888" font-size="13">Profilwerte vor dem Drucken prüfen</text>
    </g>
  </svg>`;
  return svg;
}

function landscapeSvg(label, logicalHeight, widthPx, heightPx) {
  const colors = colorsOf(label);
  const nameLines = wrapText(label.name, 30, 2);
  const titleSize = Math.min(42, 600 / (Math.max(...nameLines.map(line => line.length)) * 0.58));
  const title = nameLines.map((line, index) =>
    `<text x="34" y="${124 + index * (titleSize + 5)}" fill="#10283a" font-size="${titleSize}" font-weight="800">${escape(line)}</text>`).join('');
  const swatch = colorSwatch(colors, 34, 153, 632, 54, 14, 'landscape-swatch');
  const colorText = colorNameOf(label);
  const colorFont = Math.min(25, 390 / (colorText.length * 0.58));
  const colorInk = inkOn(colors[0]);
  const texture = filamentTexture(colors, 430, 153, 236, 54, 'landscape-texture');
  const property = (x, y, name, titleText, value) => {
    const shown = value || 'k. A.';
    const size = Math.min(19, 255 / (shown.length * 0.58));
    return `<rect x="${x}" y="${y}" width="306" height="71" rx="12" fill="#eef3f6"/>
      ${icon(name, x + 25, y + 35, 34)}
      <text x="${x + 53}" y="${y + 29}" fill="#667888" font-size="11" font-weight="700" letter-spacing="1">${titleText}</text>
      <text x="${x + 53}" y="${y + 54}" fill="#10283a" font-size="${size}" font-weight="700">${escape(shown)}</text>`;
  };
  const scale = logicalHeight < 400 ? logicalHeight / 400 : 1;
  const tx = logicalHeight < 400 ? (700 - 700 * scale) / 2 : 0;
  const ty = logicalHeight < 400 ? 0 : (logicalHeight - 400) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 700 ${logicalHeight}">
    <rect width="700" height="${logicalHeight}" fill="#ffffff"/>
    <g transform="translate(${tx} ${ty}) scale(${scale})" font-family="Arial, Helvetica, sans-serif">
      <rect x="8" y="8" width="684" height="384" rx="26" fill="#ffffff" stroke="#10283a" stroke-width="4"/>
      <path d="M10 34a24 24 0 0 1 24-24h632a24 24 0 0 1 24 24v24H10z" fill="#10283a"/>
      ${icon('spool', 43, 34, 30, '#ffffff')}
      <text x="76" y="41" fill="#ffffff" font-size="17" font-weight="700" letter-spacing="1.5">SPULENWERK</text>
      <text x="666" y="41" text-anchor="end" fill="#d0e6f3" font-size="15" font-weight="700">${escape((label.material || 'FILAMENT').toUpperCase())}</text>
      ${title}
      ${spoolIllustration(620, 104, 0.37, '#687789')}
      <rect x="34" y="153" width="632" height="54" rx="14" fill="${colors[0]}"/>
      ${swatch}
      ${texture}
      <text x="52" y="187" fill="${colorInk}" font-size="${colorFont}" font-weight="700">${escape(colorText)}</text>
      ${property(34, 224, 'nozzle', 'DÜSE', label.nozzle)}
      ${property(360, 224, 'bed', 'HEIZBETT', label.bed)}
      ${property(34, 306, 'diameter', 'DURCHMESSER', label.diameter)}
      ${property(360, 306, 'density', 'DICHTE', label.density)}
      <text x="350" y="386" text-anchor="middle" fill="#71818e" font-size="10">Profilwerte vor dem Drucken prüfen</text>
    </g>
  </svg>`;
}

export async function renderPng(label, width, height) {
  const widthPx = Math.round(width / 25.4 * 300);
  const heightPx = Math.round(height / 25.4 * 300);
  const logicalHeight = 700 * height / width;
  const svg = height / width > 1.15
    ? portraitSvg(label, logicalHeight, widthPx, heightPx)
    : landscapeSvg(label, logicalHeight, widthPx, heightPx);
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
