import "dotenv/config";

export interface Bbox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

// Where the initial load starts pulling IGN events from. Earlier history can
// be added at any time with `npm run db:backfill` — everything stored is shown.
export const INITIAL_LOAD_FROM: Date = (() => {
  const raw = process.env.INITIAL_LOAD_FROM ?? "2025-01-01";
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid INITIAL_LOAD_FROM date: ${raw}`);
  }
  return d;
})();

// Events are restricted to the area immediately around Tenerife (the island
// plus its offshore surroundings, including the Enmedio seamount toward Gran
// Canaria). Override with REGION_BBOX="latMin,latMax,lonMin,lonMax".
export const REGION_BBOX: Bbox = (() => {
  const raw = process.env.REGION_BBOX ?? "27.7,28.9,-17.3,-15.9";
  const parts = raw.split(",").map((s) => Number.parseFloat(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`Invalid REGION_BBOX: ${raw}`);
  }
  const [latMin, latMax, lonMin, lonMax] = parts;
  return { latMin, latMax, lonMin, lonMax };
})();

export const REGION_NAME = process.env.REGION_NAME ?? "Tenerife";

// Stale-while-revalidate window: page loads render stored data immediately,
// and kick off a background catalog pull when the last successful refresh is
// older than this many minutes.
export const REFRESH_INTERVAL_MINUTES: number = (() => {
  const raw = process.env.REFRESH_INTERVAL_MINUTES ?? "5";
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid REFRESH_INTERVAL_MINUTES: ${raw}`);
  }
  return n;
})();
