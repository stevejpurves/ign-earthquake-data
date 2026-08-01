import assert from "node:assert/strict";
import { test } from "node:test";
import { REGION_BBOX } from "../app/lib/config.server";
import { inBbox } from "../app/lib/ign.server";
import { computeFetchDays } from "../app/lib/refresh.server";

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

test("computeFetchDays covers back to the initial-load date on empty db", () => {
  // INITIAL_LOAD_FROM defaults to 2026-07-01
  const now = new Date("2026-08-01T12:00:00Z");
  const days = computeFetchDays(null, now);
  assert.ok(days >= 32 && days <= 33, `expected ~32 days, got ${days}`);
});

test("computeFetchDays covers just the gap when recent events exist", () => {
  const now = new Date("2026-08-01T12:00:00Z");
  const newest = new Date("2026-07-30T00:00:00Z");
  const days = computeFetchDays(newest, now);
  assert.ok(days >= 3 && days <= 4, `expected ~3 days, got ${days}`);
});

test("computeFetchDays never reaches before the initial-load date", () => {
  const now = new Date("2026-08-01T12:00:00Z");
  const newest = new Date("2021-12-01T00:00:00Z"); // older than the window start
  const days = computeFetchDays(newest, now);
  assert.ok(days <= 33, `expected window capped at initial-load date, got ${days}`);
});
