import assert from "node:assert/strict";
import { test } from "node:test";
import { REGION_BBOX } from "../app/lib/config.server";
import { chunkDateRange, inBbox } from "../app/lib/ign.server";
import { computeFetchStart } from "../app/lib/refresh.server";

test("Tenerife bbox keeps island and nearby offshore events", () => {
  // Santa Cruz de Tenerife
  assert.ok(inBbox({ latitude: 28.4636, longitude: -16.2518 }, REGION_BBOX));
  // Teide
  assert.ok(inBbox({ latitude: 28.2724, longitude: -16.6425 }, REGION_BBOX));
  // Enmedio seamount area (between Tenerife and Gran Canaria)
  assert.ok(inBbox({ latitude: 28.05, longitude: -16.0 }, REGION_BBOX));
});

test("Tenerife bbox excludes other islands", () => {
  // La Palma (Cumbre Vieja)
  assert.ok(!inBbox({ latitude: 28.57, longitude: -17.84 }, REGION_BBOX));
  // Gran Canaria (Las Palmas)
  assert.ok(!inBbox({ latitude: 28.12, longitude: -15.43 }, REGION_BBOX));
  // Alborán Sea (mainland-ish seismicity)
  assert.ok(!inBbox({ latitude: 35.45, longitude: -3.66 }, REGION_BBOX));
});

test("computeFetchStart uses the initial-load date on an empty db", () => {
  // INITIAL_LOAD_FROM defaults to 2025-01-01
  assert.equal(
    computeFetchStart(null).toISOString(),
    "2025-01-01T00:00:00.000Z",
  );
});

test("computeFetchStart overlaps one day behind the newest stored event", () => {
  const newest = new Date("2026-09-10T06:00:00Z");
  assert.equal(
    computeFetchStart(newest).toISOString(),
    "2026-09-09T06:00:00.000Z",
  );
});

test("computeFetchStart never reaches before the initial-load date", () => {
  const newest = new Date("2021-12-01T00:00:00Z"); // older than the window start
  assert.equal(
    computeFetchStart(newest).toISOString(),
    "2025-01-01T00:00:00.000Z",
  );
});

test("chunkDateRange splits long ranges and covers the whole span", () => {
  const start = new Date("2025-01-01T00:00:00Z");
  const end = new Date("2026-09-13T00:00:00Z"); // ~620 days
  const chunks = chunkDateRange(start, end, 180);
  assert.equal(chunks.length, 4);
  assert.equal(chunks[0].start.getTime(), start.getTime());
  assert.equal(chunks[chunks.length - 1].end.getTime(), end.getTime());
  for (let i = 1; i < chunks.length; i++) {
    assert.equal(chunks[i].start.getTime(), chunks[i - 1].end.getTime());
  }
});

test("chunkDateRange keeps a short range as one chunk", () => {
  const start = new Date("2026-09-10T00:00:00Z");
  const end = new Date("2026-09-13T00:00:00Z");
  const chunks = chunkDateRange(start, end, 180);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].start.getTime(), start.getTime());
  assert.equal(chunks[0].end.getTime(), end.getTime());
});
