"use strict";

const byId = (id) => document.getElementById(id);
const lookupForm = byId("lookup-form");
const labelsForm = byId("labels-form");
const list = byId("label-list");
const errorMessage = byId("error-message");
const statusMessage = byId("status-message");
const editableFields = [
  ["name", "Filamentname"],
  ["material", "Material"],
  ["nozzle", "Düse"],
  ["bed", "Druckbett"],
  ["diameter", "Durchmesser"],
  ["density", "Dichte"],
];
let entries = [];
let busy = false;
let editVersion = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function normalizeColor(value, fallback = "#e87939") {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${[...color.slice(1)].map((char) => char + char).join("")}`;
  }
  return fallback;
}

function dimensions() {
  const width = Number(byId("label-width").value);
  const height = Number(byId("label-height").value);
  if (!Number.isFinite(width) || width < 30 || width > 190 ||
      !Number.isFinite(height) || height < 20 || height > 277) {
    throw new Error("Bitte wähle eine Breite von 30–190 mm und eine Höhe von 20–277 mm.");
  }
  return { width, height };
}

function setBusy(value, message = "") {
  busy = value;
  document.querySelectorAll("button, input, textarea").forEach((control) => {
    control.disabled = value;
  });
  byId("results-panel").setAttribute("aria-busy", String(value));
  lookupForm.setAttribute("aria-busy", String(value));
  statusMessage.textContent = message;
  byId("lookup-button").firstElementChild.textContent = value ? "Bitte kurz warten …" : "Etiketten erstellen";
}

function showError(error) {
  errorMessage.textContent = error instanceof Error ? error.message : "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
  errorMessage.hidden = false;
  errorMessage.focus();
}

async function request(path, payload, expectedType) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let message = `Die Anfrage konnte nicht abgeschlossen werden (${response.status}). Bitte versuche es erneut.`;
    try {
      const body = await response.json();
      if (typeof body.error === "string") message = body.error;
      else if (typeof body.message === "string") message = body.message;
    } catch {
      // Non-JSON error pages should not replace the readable fallback.
    }
    throw new Error(message);
  }
  if (expectedType === "json") {
    try {
      return await response.json();
    } catch {
      throw new Error("Die Serverantwort konnte nicht gelesen werden. Bitte versuche es erneut.");
    }
  }
  const blob = await response.blob();
  if (!blob.size || !blob.type.toLowerCase().startsWith(expectedType)) {
    throw new Error("Der Server hat kein gültiges Exportformat geliefert. Bitte versuche es erneut.");
  }
  return blob;
}

async function perform(message, action) {
  if (busy) return;
  errorMessage.hidden = true;
  setBusy(true, message);
  let success = "";
  try {
    success = await action();
  } catch (error) {
    if (error instanceof TypeError) {
      showError(new Error("Keine Verbindung zum Server. Bitte prüfe deine Verbindung und versuche es erneut."));
    } else {
      showError(error);
    }
  } finally {
    setBusy(false, success || "");
  }
}

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function readLabel(entry) {
  const label = { ...entry.original };
  editableFields.forEach(([key]) => {
    label[key] = entry.fields[key].value.trim() || null;
  });
  label.color = entry.fields.color.value;
  return label;
}

function validExport() {
  entries.forEach((entry) => {
    entry.fields.name.setCustomValidity(entry.fields.name.value.trim() ? "" : "Bitte gib einen Filamentnamen ein.");
  });
  return byId("label-width").reportValidity() &&
    byId("label-height").reportValidity() && labelsForm.reportValidity();
}

function filename(name, extension) {
  const safeName = String(name || "filament").normalize("NFKC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return `${safeName || "filament"}.${extension}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = element("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function markChanged() {
  editVersion += 1;
  entries.forEach((entry) => {
    if (entry.previewUrl) entry.previewCaption.textContent = "Eingaben geändert – Vorschau bitte aktualisieren.";
  });
}

function makeCard(raw, index) {
  const original = {};
  ["name", "material", "nozzle", "bed", "diameter", "density", "sourceName", "sourceUrl", "matchType", "warning"].forEach((key) => {
    original[key] = raw[key] == null ? null : String(raw[key]);
  });
  original.color = normalizeColor(raw.color, byId("default-color").value);
  const entry = { original, fields: {}, previewUrl: null };
  const card = element("article", "label-card");
  const heading = element("div", "card-heading");
  heading.append(element("span", "card-number", `ETIKETT ${String(index + 1).padStart(2, "0")}`));
  const matchLabels = { exact: "Profil gefunden", generic: "Allgemeines Profil", unknown: "Keine Profildaten" };
  const matchType = Object.hasOwn(matchLabels, original.matchType) ? original.matchType : "unknown";
  heading.append(element("span", `match-badge match-${matchType}`, matchLabels[matchType]));
  card.append(heading);
  const grid = element("div", "edit-grid");
  editableFields.forEach(([key, title]) => {
    const group = element("div", key === "name" ? "edit-field name-field" : "edit-field");
    const id = `label-${index}-${key}`;
    const label = element("label", "", title);
    label.htmlFor = id;
    const input = element("input");
    input.id = id;
    input.type = "text";
    input.maxLength = key === "name" ? 120 : 50;
    input.value = original[key] || "";
    input.placeholder = "k. A.";
    input.required = key === "name";
    input.addEventListener("input", () => {
      input.setCustomValidity("");
      markChanged();
    });
    entry.fields[key] = input;
    group.append(label, input);
    grid.append(group);
  });
  const colorGroup = element("div", "edit-field card-color-field");
  const colorLabel = element("label", "", "Etikettenfarbe");
  colorLabel.htmlFor = `label-${index}-color`;
  const color = element("input");
  color.type = "color";
  color.id = colorLabel.htmlFor;
  color.value = original.color;
  color.addEventListener("input", markChanged);
  entry.fields.color = color;
  colorGroup.append(colorLabel, color);
  grid.append(colorGroup);
  card.append(grid);
  const source = element("p", "source-line");
  source.append(document.createTextNode("Quelle: "));
  const sourceUrl = safeSourceUrl(original.sourceUrl);
  if (sourceUrl) {
    const link = element("a", "", original.sourceName || "Profil ansehen");
    link.href = sourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    source.append(link);
  } else {
    source.append(document.createTextNode(original.sourceName || "k. A."));
  }
  card.append(source);
  if (original.warning || matchType !== "exact") {
    card.append(element("p", "card-warning", original.warning ||
      (matchType === "generic" ? "Allgemeine Materialwerte – bitte für dein Filament prüfen." : "Kein passendes Profil gefunden. Bitte ergänze die Werte selbst.")));
  }
  const previewArea = element("div", "image-preview");
  previewArea.hidden = true;
  const image = element("img");
  image.alt = `Etikettenvorschau ${index + 1}`;
  const caption = element("p", "preview-caption");
  entry.previewCaption = caption;
  previewArea.append(image, caption);
  card.append(previewArea);
  const actions = element("div", "card-actions");
  const previewButton = element("button", "button button-secondary", "↻ Vorschau erstellen");
  previewButton.type = "button";
  const pngButton = element("button", "button button-text", "↓ PNG herunterladen");
  pngButton.type = "button";
  previewButton.addEventListener("click", () => {
    if (!validExport()) return;
    perform(`Vorschau für Etikett ${index + 1} wird erstellt …`, async () => {
      const size = dimensions();
      const label = readLabel(entry);
      const version = editVersion;
      const blob = await request("/api/label", { label, ...size }, "image/png");
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      entry.previewUrl = URL.createObjectURL(blob);
      image.src = entry.previewUrl;
      image.alt = `Vorschau: ${label.name}`;
      caption.textContent = version === editVersion ? `${size.width} × ${size.height} mm · Aktuelle Vorschau` : "Eingaben geändert – Vorschau bitte aktualisieren.";
      previewArea.hidden = false;
      previewButton.textContent = "↻ Vorschau aktualisieren";
      return "Vorschau erstellt.";
    });
  });
  pngButton.addEventListener("click", () => {
    if (!validExport()) return;
    perform("PNG wird erstellt …", async () => {
      const label = readLabel(entry);
      const blob = await request("/api/label", { label, ...dimensions() }, "image/png");
      download(blob, filename(label.name, "png"));
      return "PNG ist zum Herunterladen bereit.";
    });
  });
  actions.append(previewButton, pngButton);
  card.append(actions);
  return { entry, card };
}

lookupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  perform("Filamentprofile werden gesucht …", async () => {
    const size = dimensions();
    const lines = byId("filaments").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Bitte gib mindestens ein Filament ein.");
    if (lines.length > 30) throw new Error("Bitte gib höchstens 30 Filamente auf einmal ein.");
    const filaments = lines.map((line, index) => {
      const [name, color, ...extra] = line.split(";").map((part) => part.trim());
      if (!name || extra.length || (color !== undefined && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color))) {
        throw new Error(`Bitte prüfe Zeile ${index + 1}: Filamentname; #HEX-Farbe (z. B. #e87939).`);
      }
      return { name, color: normalizeColor(color, byId("default-color").value) };
    });
    const response = await request("/api/lookup", { filaments, ...size }, "json");
    if (!response || !Array.isArray(response.labels) || !response.labels.length ||
        response.labels.length > 30 || response.labels.some((label) => !label || typeof label !== "object" || Array.isArray(label))) {
      throw new Error("Der Server hat keine gültigen Etiketten geliefert. Bitte versuche es erneut.");
    }
    const cards = response.labels.map(makeCard);
    entries.forEach((entry) => {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    });
    entries = cards.map(({ entry }) => entry);
    list.replaceChildren(...cards.map(({ card }) => card));
    byId("empty-state").hidden = true;
    byId("results-content").hidden = false;
    byId("label-count").textContent = String(entries.length);
    byId("preview-hint").textContent = `${entries.length} ${entries.length === 1 ? "Etikett" : "Etiketten"} · Alle Angaben sind editierbar.`;
    byId("format-badge").textContent = `${size.width} × ${size.height} mm`;
    return `${entries.length} ${entries.length === 1 ? "Etikett erstellt" : "Etiketten erstellt"}. Bitte prüfe die gefundenen Werte.`;
  });
});

labelsForm.addEventListener("submit", (event) => event.preventDefault());
byId("pdf-button").addEventListener("click", () => {
  if (!entries.length || !validExport()) return;
  perform("Dein A4-PDF wird erstellt …", async () => {
    const labels = entries.map(readLabel);
    const blob = await request("/api/pdf", { labels, ...dimensions() }, "application/pdf");
    download(blob, "spulenwerk-etiketten.pdf");
    return "PDF ist zum Herunterladen bereit. Beim Drucken bitte 100 % / Originalgröße wählen.";
  });
});
byId("default-color").addEventListener("input", (event) => {
  byId("color-value").textContent = event.target.value.toUpperCase();
});
["label-width", "label-height"].forEach((id) => {
  byId(id).addEventListener("input", () => {
    markChanged();
    try {
      const size = dimensions();
      byId("format-badge").textContent = `${size.width} × ${size.height} mm`;
    } catch {
      byId("format-badge").textContent = "Format prüfen";
    }
  });
});
