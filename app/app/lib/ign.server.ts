// The IGN "últimos terremotos" feed — the same catalog behind the
// wms-inspire/geofisica WMS layers, served as an HTML table of recent events.
// `dias` selects how many days back the feed covers (the portal offers up to 30).
const FEED_URL = (days: number) =>
  "https://www.ign.es/web/en/ign/portal/ultimos-terremotos/-/ultimos-terremotos/get10dias" +
  `?_IGNGFSSismoSismicidadReciente_WAR_IGNGFSSismoSismicidadRecienteportlet_formDate=${Date.now()}` +
  `&_IGNGFSSismoSismicidadReciente_WAR_IGNGFSSismoSismicidadRecienteportlet_dias=${days}`;

export interface IgnEvent {
  id: string;
  time: Date;
  latitude: number;
  longitude: number;
  depthKm: number | null;
  magnitude: number | null;
  magType: string | null;
  maxIntensity: string | null;
  region: string | null;
}

function toFloat(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Find a column index by header keywords (English page, Spanish fallback). */
function findColumn(headers: string[], keywords: string[]): number {
  return headers.findIndex((h) => keywords.some((k) => h.includes(k)));
}

/** Parse "dd/mm/yyyy" + "HH:MM:SS" (UTC) into a Date. */
function parseUtc(date: string, time: string): Date | null {
  const m = date.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : date.trim();
  const d = new Date(`${iso}T${time.trim()}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  Ntilde: "Ñ",
};

function cellText(cellHtml: string): string {
  return cellHtml
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&(\w+);/g, (m, name) => NAMED_ENTITIES[name] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

// The feed's table rows are unclosed `<tr>` tags inside a messy Liferay page,
// which trips up lenient DOM parsers (node-html-parser silently drops rows).
// The markup is machine-generated and flat, so splitting on row/cell tags
// directly is the reliable way to read it.
export function parseIgnTable(html: string): IgnEvent[] {
  const start = html.search(/<table[^>]*>/i);
  if (start === -1) throw new Error("No <table> found in IGN feed response");
  const end = html.indexOf("</table>", start);
  const tableHtml = html.slice(start, end === -1 ? html.length : end);

  const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
  const rows = tableHtml
    .split(/<tr[^>]*>/i)
    .slice(1)
    .map((chunk) => Array.from(chunk.matchAll(cellRe), (m) => cellText(m[1])))
    .filter((cells) => cells.length > 0);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.toLowerCase());

  const iEvent = findColumn(headers, ["event", "evento"]);
  const iDate = findColumn(headers, ["date", "fecha"]);
  const iTime = findColumn(headers, ["utc"]);
  const iLat = findColumn(headers, ["latitude", "latitud"]);
  const iLon = findColumn(headers, ["longitude", "longitud"]);
  const iDepth = findColumn(headers, ["depth", "prof"]);
  const iMagType = findColumn(headers, ["mag. type", "tipo mag"]);
  const iMag = headers.findIndex(
    (h, i) => i !== iMagType && (h.includes("magnitude") || h.startsWith("mag")),
  );
  const iMaxInt = findColumn(headers, ["max. int", "int."]);
  const iRegion = findColumn(headers, ["region", "localización", "localizacion"]);

  if (iEvent === -1 || iDate === -1 || iLat === -1 || iLon === -1) {
    throw new Error(`Unrecognized IGN table headers: ${headers.join(" | ")}`);
  }

  const events: IgnEvent[] = [];
  for (const cells of rows.slice(1)) {
    if (cells.length < headers.length - 1) continue;
    const id = cells[iEvent];
    const lat = toFloat(cells[iLat]);
    const lon = toFloat(cells[iLon]);
    const time =
      iTime === -1 ? null : parseUtc(cells[iDate], cells[iTime]);
    if (!id || lat === null || lon === null || !time) continue;
    events.push({
      id,
      time,
      latitude: lat,
      longitude: lon,
      depthKm: iDepth === -1 ? null : toFloat(cells[iDepth]),
      magnitude: iMag === -1 ? null : toFloat(cells[iMag]),
      magType: iMagType === -1 ? null : cells[iMagType] || null,
      maxIntensity: iMaxInt === -1 ? null : cells[iMaxInt] || null,
      region: iRegion === -1 ? null : cells[iRegion] || null,
    });
  }
  return events;
}

export function inBbox(
  e: { latitude: number; longitude: number },
  bbox: { latMin: number; latMax: number; lonMin: number; lonMax: number },
): boolean {
  return (
    e.latitude >= bbox.latMin &&
    e.latitude <= bbox.latMax &&
    e.longitude >= bbox.lonMin &&
    e.longitude <= bbox.lonMax
  );
}

// The feed accepts arbitrary day windows (the original dataset in ../data was
// built with multi-month requests); the clamp is just a sanity bound.
export async function fetchIgnEvents(days: number): Promise<IgnEvent[]> {
  const clamped = Math.min(400, Math.max(1, Math.round(days)));
  const res = await fetch(FEED_URL(clamped), {
    headers: { "User-Agent": "ign-earthquake-data-app/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`IGN feed responded ${res.status} ${res.statusText}`);
  }
  return parseIgnTable(await res.text());
}
