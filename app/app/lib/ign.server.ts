// IGN "Catálogo de terremotos" search download endpoint: a single stateless
// multipart POST returns every catalog event matching a bounding box + date
// range as GeoJSON — including the microseismicity (M < 1.5) that the
// "últimos terremotos" feed leaves out. This is the same export the portal's
// search page (sis-catalogo-terremotos) serves via its download button.
const PORTLET = "IGNSISCatalogoTerremotos_WAR_IGNSISCatalogoTerremotosportlet";
const CATALOG_URL =
  "https://www.ign.es/web/ign/portal/sis-catalogo-terremotos" +
  `?p_p_id=${PORTLET}&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view` +
  "&p_p_cacheability=cacheLevelPage&p_p_col_id=column-1&p_p_col_count=1" +
  `&_${PORTLET}_jspPage=%2Fjsp%2Fterremoto.jsp`;

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

export interface Bbox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

function toFloat(value: unknown): number | null {
  const n =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

/** Parse "dd/mm/yyyy" + "HH:MM:SS" into a Date. Catalog times are UTC —
 * verified against the latest-events feed, which lists both UTC and local. */
function parseUtc(date: unknown, time: unknown): Date | null {
  const m = String(date ?? "")
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T${String(time ?? "").trim()}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseCatalogGeoJson(text: string): IgnEvent[] {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error(
      `IGN catalog response was not JSON (starts with: ${text.slice(0, 120).trim()})`,
    );
  }
  const features = (doc as { features?: unknown })?.features;
  if (!Array.isArray(features)) {
    throw new Error("IGN catalog response has no features array");
  }

  const events: IgnEvent[] = [];
  for (const f of features) {
    const p = (f as { properties?: Record<string, unknown> })?.properties;
    if (!p) continue;
    const id = String(p.evid ?? "").trim();
    const lat = toFloat(p.latitud);
    const lon = toFloat(p.longitud);
    const time = parseUtc(p.fecha, p.hora);
    if (!id || lat === null || lon === null || !time) continue;
    events.push({
      id,
      time,
      latitude: lat,
      longitude: lon,
      depthKm: toFloat(p.profundidad),
      magnitude: toFloat(p.magnitud),
      // tipoMagnitud is IGN's numeric magnitude-type code (e.g. 4 = mbLg)
      magType: p.tipoMagnitud != null ? String(p.tipoMagnitud) : null,
      maxIntensity: String(p.intensidad ?? "").trim() || null,
      region: String(p.localizacion ?? "").trim() || null,
    });
  }
  return events;
}

/** dd/mm/yyyy in UTC, the format the search form expects. */
function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export async function fetchCatalogEvents(
  start: Date,
  end: Date,
  bbox: Bbox,
): Promise<IgnEvent[]> {
  const ns = `_${PORTLET}_`;
  const form = new FormData();
  const fields: Record<string, string> = {
    formDate: String(Date.now()),
    fases: "no",
    selIntensidad: "N",
    selMagnitud: "N",
    selProf: "N",
    latMin: String(bbox.latMin),
    latMax: String(bbox.latMax),
    longMin: String(bbox.lonMin),
    longMax: String(bbox.lonMax),
    startDate: formatDate(start),
    endDate: formatDate(end),
    intMin: "",
    intMax: "",
    magMin: "",
    magMax: "",
    cond: "",
    profMin: "",
    profMax: "",
    tipoDescarga: "geojson",
  };
  for (const [key, value] of Object.entries(fields)) {
    form.append(ns + key, value);
  }

  const res = await fetch(CATALOG_URL, {
    method: "POST",
    body: form,
    headers: { "User-Agent": "ign-earthquake-data-app/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`IGN catalog responded ${res.status} ${res.statusText}`);
  }
  return parseCatalogGeoJson(await res.text());
}

/**
 * Split a date range into consecutive windows of at most `maxDays`, so long
 * backfills become several modest catalog requests instead of one huge one.
 */
export function chunkDateRange(
  start: Date,
  end: Date,
  maxDays = 180,
): { start: Date; end: Date }[] {
  const step = maxDays * 86_400_000;
  const chunks: { start: Date; end: Date }[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += step) {
    chunks.push({
      start: new Date(t),
      end: new Date(Math.min(t + step, end.getTime())),
    });
  }
  return chunks.length > 0 ? chunks : [{ start, end }];
}

export function inBbox(
  e: { latitude: number; longitude: number },
  bbox: Bbox,
): boolean {
  return (
    e.latitude >= bbox.latMin &&
    e.latitude <= bbox.latMax &&
    e.longitude >= bbox.lonMin &&
    e.longitude <= bbox.lonMax
  );
}
