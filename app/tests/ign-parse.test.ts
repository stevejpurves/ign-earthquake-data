import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCatalogGeoJson } from "../app/lib/ign.server";

// Shape taken from a real catalog download (tipoDescarga=geojson).
const CATALOG_GEOJSON = `{"type":"FeatureCollection",
"crs": {"type": "name", "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } },
"features":[
{ "type": "Feature", "properties": {"evid":"es2026msulu","fecha":"01/07/2026","hora":"00:16:49","latitud":28.2394,"longitud":-16.6875,"profundidad":10.0,"intensidad":"","magnitud":1.2,"tipoMagnitud":4,"localizacion":"NE GUÍA DE ISORA.ITF"},"geometry": {"type": "Point", "coordinates": [-16.6875,28.2394] } },
{ "type": "Feature", "properties": {"evid":"es2026micro","fecha":"02/07/2026","hora":"12:00:00","latitud":28.25,"longitud":-16.6,"profundidad":null,"intensidad":"II","magnitud":0.0,"tipoMagnitud":4,"localizacion":"W VILAFLOR.ITF"},"geometry": {"type": "Point", "coordinates": [-16.6,28.25] } },
{ "type": "Feature", "properties": {"evid":"","fecha":"bad","hora":"","latitud":null,"longitud":null,"profundidad":null,"intensidad":"","magnitud":null,"tipoMagnitud":null,"localizacion":""},"geometry": null }
]}`;

test("parses the catalog GeoJSON download", () => {
  const events = parseCatalogGeoJson(CATALOG_GEOJSON);
  assert.equal(events.length, 2);

  const [first, second] = events;
  assert.equal(first.id, "es2026msulu");
  // fecha/hora are UTC (verified against the latest-events feed)
  assert.equal(first.time.toISOString(), "2026-07-01T00:16:49.000Z");
  assert.equal(first.latitude, 28.2394);
  assert.equal(first.longitude, -16.6875);
  assert.equal(first.depthKm, 10.0);
  assert.equal(first.magnitude, 1.2);
  assert.equal(first.magType, "4");
  assert.equal(first.maxIntensity, null);
  assert.equal(first.region, "NE GUÍA DE ISORA.ITF");

  // magnitude 0.0 events are kept — the whole point of using the catalog
  assert.equal(second.magnitude, 0.0);
  assert.equal(second.depthKm, null);
  assert.equal(second.maxIntensity, "II");
});

test("throws a clear error on a non-JSON response", () => {
  assert.throws(
    () => parseCatalogGeoJson("<!DOCTYPE html><html>maintenance page</html>"),
    /not JSON/,
  );
});

test("throws when the JSON has no features array", () => {
  assert.throws(
    () => parseCatalogGeoJson('{"type":"FeatureCollection"}'),
    /no features/,
  );
});
