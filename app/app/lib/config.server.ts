import "dotenv/config";

export interface Bbox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

// The catalog window starts here: the initial load pulls IGN events from this
// date, and the loader/refresh ignore anything earlier.
export const INITIAL_LOAD_FROM: Date = (() => {
  const raw = process.env.INITIAL_LOAD_FROM ?? "2026-07-01";
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
