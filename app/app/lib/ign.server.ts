import { parse } from "node-html-parser";

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

export function parseIgnTable(html: string): IgnEvent[] {
  const root = parse(html);
  const table = root.querySelector("table");
  if (!table) throw new Error("No <table> found in IGN feed response");

  const rows = table.querySelectorAll("tr");
  if (rows.length < 2) return [];

  const headers = rows[0]
    .querySelectorAll("th, td")
    .map((c) => c.text.trim().toLowerCase());

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
  for (const row of rows.slice(1)) {
    const cells = row.querySelectorAll("td").map((c) => c.text.trim());
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

export async function fetchIgnEvents(days: number): Promise<IgnEvent[]> {
  const clamped = Math.min(30, Math.max(1, Math.round(days)));
  const res = await fetch(FEED_URL(clamped), {
    headers: { "User-Agent": "ign-earthquake-data-app/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`IGN feed responded ${res.status} ${res.statusText}`);
  }
  return parseIgnTable(await res.text());
}
