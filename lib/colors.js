export const MAX_COLORS = 4;

// Approximate swatch colours for plain colour words (DE/EN, keys without umlauts).
const BASE = new Map(Object.entries({
  '#151515': ['schwarz', 'black'],
  '#f7f7f5': ['weiss', 'white'],
  '#8c9196': ['grau', 'grey', 'gray'],
  '#3b4045': ['anthrazit', 'anthracite'],
  '#c3c7cc': ['silber', 'silver'],
  '#d4af37': ['gold'],
  '#9c6a3a': ['bronze'],
  '#b8693d': ['kupfer', 'copper'],
  '#d32f2f': ['rot', 'red'],
  '#1e5bc6': ['blau', 'blue'],
  '#1f2f5c': ['navy', 'marine'],
  '#2e9d43': ['grun', 'gruen', 'green'],
  '#6b7a2a': ['oliv', 'olive'],
  '#8fdcc0': ['mint'],
  '#f5d000': ['gelb', 'yellow'],
  '#f57c00': ['orange'],
  '#7b3fa0': ['lila', 'violett', 'violet', 'purple'],
  '#e94b8a': ['pink'],
  '#f4a7c3': ['rosa'],
  '#7b4a2a': ['braun', 'brown'],
  '#e3d3b4': ['beige'],
  '#f2ead3': ['elfenbein', 'ivory'],
  '#1fb5ad': ['turkis', 'tuerkis', 'turquoise'],
  '#00b7eb': ['cyan'],
  '#d1197b': ['magenta'],
  '#ece8dc': ['natur', 'natural', 'transparent', 'klar', 'clear'],
}).flatMap(([hex, words]) => words.map(word => [word, hex])));
const SHADES = [[['hell', 'light'], '#ffffff', 0.45], [['dunkel', 'dark'], '#000000', 0.4]];
const JOINERS = new Set(['und', 'and']);
const SEPARATOR = /^[\s/,&+|–-]*$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const fold = word => word.toLowerCase().replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

function mix(hex, target, amount) {
  const channel = (color, i) => parseInt(color.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map(i => Math.round(channel(hex, i) * (1 - amount) + channel(target, i) * amount)
    .toString(16).padStart(2, '0')).join('')}`;
}

export function normalizeHex(value) {
  if (typeof value !== 'string' || !HEX.test(value.trim())) return null;
  const hex = value.trim().toLowerCase();
  return hex.length === 4 ? `#${[...hex.slice(1)].map(char => char + char).join('')}` : hex;
}

function baseColor(word) {
  const folded = fold(word);
  // Also accept simple German inflections such as "rote", "blaues", "goldene".
  for (const candidate of [folded, folded.replace(/(?:es|er|en|em|e)$/, '')]) {
    if (BASE.has(candidate)) return BASE.get(candidate);
  }
  for (const [prefixes, target, amount] of SHADES) {
    const prefix = prefixes.find(item => folded.startsWith(item) && folded.length > item.length);
    const base = prefix && baseColor(folded.slice(prefix.length));
    if (base) return mix(base, target, amount);
  }
  return null;
}

const shadeOf = word => SHADES.find(([prefixes]) => prefixes.includes(fold(word))) ?? null;

// True for colour words incl. shades, compounds, inflections and joiners ("dunkelblau", "rote", "light", "und").
export const isColorWord = word => Boolean(baseColor(word) ?? shadeOf(word)) || JOINERS.has(fold(word));
const capitalize = word => word.startsWith('#') ? word.toUpperCase() :
  word.charAt(0).toLocaleUpperCase('de') + word.slice(1);

function words(text) {
  return [...String(text).matchAll(/#[0-9a-f]{6}(?![0-9a-z])|#[0-9a-f]{3}(?![0-9a-z])|[\p{L}\p{N}]+/giu)]
    .map(match => ({ text: match[0], start: match.index, end: match.index + match[0].length }));
}

function parseColors(list) {
  const colors = [];
  let shade = null;
  let current = [];
  for (const word of list) {
    if (JOINERS.has(fold(word.text))) {
      shade = null;
      current = [];
    } else if (shadeOf(word.text)) {
      shade = shadeOf(word.text);
      current.push(word.text);
    } else {
      const hex = normalizeHex(word.text) ?? baseColor(word.text);
      if (!hex) return null;
      colors.push({ hex: shade ? mix(hex, shade[1], shade[2]) : hex, name: [...current, word.text].map(capitalize).join(' ') });
      shade = null;
      current = [];
    }
  }
  return colors.length ? colors : null;
}

// Splits the trailing colour phrase (e.g. "dunkelblau", "blau/rot/grün", "#e87939") from a product name.
function trailingColors(text) {
  const list = words(text);
  const isColor = word => Boolean(normalizeHex(word.text) ?? baseColor(word.text));
  let start = list.length;
  while (start > 0) {
    const word = list[start - 1];
    const next = list[start];
    if (next && !SEPARATOR.test(text.slice(word.end, next.start))) break;
    if (start === list.length ? !isColor(word) : !isColor(word) && !shadeOf(word.text) && !JOINERS.has(fold(word.text))) break;
    start--;
  }
  while (start < list.length && JOINERS.has(fold(list[start].text))) start++;
  const colors = start < list.length ? parseColors(list.slice(start)) : null;
  if (!colors) return { product: text.trim(), colors: [] };
  const product = text.slice(0, list[start].start).replace(/[\s/,&|–-]+$/, '').trim();
  return { product, colors };
}

/**
 * Interprets free filament input such as "Prusament PETG schwarz", "Elegoo PLA tri color blau/rot/grün"
 * or the legacy "Bambu PLA Basic; #e87939".
 */
export function parseFilament(input, explicitColor = null) {
  const [main, ...extra] = String(input).split(';');
  const colorText = extra.join(' ').trim();
  const parsed = trailingColors(main);
  let colors = parsed.colors;
  let product = parsed.product;
  let unknownColor = null;
  if (colorText) {
    const given = parseColors(words(colorText));
    if (given) colors = given;
    else unknownColor = colorText;
  }
  if (!product) product = main.trim();
  const explicit = normalizeHex(explicitColor);
  const named = colors.filter(color => !color.name.startsWith('#'));
  const query = `${main} ${unknownColor ? '' : colorText}`.replace(/#[0-9a-f]{3,6}(?![0-9a-z])/gi, ' ')
    .replace(/\s+/g, ' ').trim() || product;
  return {
    query,
    product,
    colors: explicit ? [explicit] : colors.slice(0, MAX_COLORS).map(color => color.hex),
    colorName: (unknownColor ? capitalize(unknownColor) : named.map(color => color.name).join(' / ')) || null,
    explicit: Boolean(explicit) || colors.some(color => color.name.startsWith('#')),
    unknownColor,
  };
}

/**
 * Prefers the exact colour of a SpoolmanDB entry (e.g. "Jade White") when the input ends with its name.
 */
export function withCatalogColor(parsed, matched) {
  if (!matched || parsed.explicit || parsed.colors.length > 1 || !Array.isArray(matched.words) ||
      !normalizeHex(matched.hex)) return parsed;
  const list = words(parsed.query);
  const wanted = new Set(matched.words);
  let start = list.length;
  const found = new Set();
  while (start > 0 && found.size < wanted.size) {
    const folded = fold(list[start - 1].text);
    if (!wanted.has(folded)) break;
    found.add(folded);
    start--;
  }
  if (found.size !== wanted.size || start === 0) return parsed;
  const product = parsed.query.slice(0, list[start].start).replace(/[\s/,&|–-]+$/, '').trim();
  return { ...parsed, product, colors: [normalizeHex(matched.hex)],
    colorName: list.slice(start).map(word => capitalize(word.text)).join(' ') };
}
