import assert from "node:assert/strict";
import { test } from "node:test";
import { parseIgnTable } from "../app/lib/ign.server";

const ENGLISH_FEED = `
<div class="journal-content-article">
<table class="tabla_terremotos" summary="Latest earthquakes">
  <tr>
    <th>Event</th><th>Date</th><th>UTC time</th><th>Local time(*)</th>
    <th>Latitude</th><th>Longitude</th><th>Depth(km)</th>
    <th>Magnitude</th><th>Mag. type</th><th>Max. int</th><th>Region</th><th>More Info</th>
  </tr>
  <tr>
    <td>es2026abcde</td><td>27/07/2026</td><td>23:15:02</td><td>01:15:02</td>
    <td>28.5701</td><td>-17.8402</td><td>10.0</td>
    <td>3.1</td><td>mbLg</td><td></td><td>SW VILLA DE MAZO.ILP</td><td></td>
  </tr>
  <tr>
    <td>es2026fghij</td><td>28/07/2026</td><td>04:02:44</td><td>06:02:44</td>
    <td>36.6765</td><td>-11.2736</td><td></td>
    <td>2.8</td><td>mb</td><td>II</td><td>SW CABO DE SAN VICENTE</td><td></td>
  </tr>
  <tr>
    <td>badrow</td><td>not-a-date</td><td>xx</td><td>xx</td>
    <td>abc</td><td>def</td><td></td><td></td><td></td><td></td><td></td><td></td>
  </tr>
</table>
</div>`;

test("parses the English IGN latest-earthquakes table", () => {
  const events = parseIgnTable(ENGLISH_FEED);
  assert.equal(events.length, 2);

  const [first, second] = events;
  assert.equal(first.id, "es2026abcde");
  assert.equal(first.time.toISOString(), "2026-07-27T23:15:02.000Z");
  assert.equal(first.latitude, 28.5701);
  assert.equal(first.longitude, -17.8402);
  assert.equal(first.depthKm, 10.0);
  assert.equal(first.magnitude, 3.1);
  assert.equal(first.magType, "mbLg");
  assert.equal(first.maxIntensity, null);
  assert.equal(first.region, "SW VILLA DE MAZO.ILP");

  assert.equal(second.depthKm, null);
  assert.equal(second.maxIntensity, "II");
});

const SPANISH_FEED = `
<table>
  <tr>
    <th>Evento</th><th>Fecha</th><th>Hora UTC</th>
    <th>Latitud</th><th>Longitud</th><th>Prof. (Km)</th>
    <th>Mag.</th><th>Tipo Mag.</th><th>Int. máx.</th><th>Localización</th>
  </tr>
  <tr>
    <td>es2026klmno</td><td>28/07/2026</td><td>12:00:00</td>
    <td>28,1119</td><td>-16,2225</td><td>21,0</td>
    <td>0,9</td><td>4</td><td></td><td>ATLÁNTICO-CANARIAS</td>
  </tr>
</table>`;

test("parses the Spanish header variant with comma decimals", () => {
  const events = parseIgnTable(SPANISH_FEED);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "es2026klmno");
  assert.equal(events[0].latitude, 28.1119);
  assert.equal(events[0].depthKm, 21.0);
  assert.equal(events[0].magnitude, 0.9);
  assert.equal(events[0].region, "ATLÁNTICO-CANARIAS");
});

test("throws when no table is present", () => {
  assert.throws(() => parseIgnTable("<html><body>maintenance</body></html>"));
});

// Mirrors the real feed markup: full Liferay page, unclosed <tr> tags,
// INFO links inside header cells, &nbsp; for empty cells.
const LIVE_STYLE_FEED = `
<!DOCTYPE html> <html class="aui ltr"><head><title>Latest earthquakes</title></head>
<body><div><p>seismic analysis. </p></div> <div class="w90 mcenter tar fr"> </div>
<table> <tr> <th>Event</th> <th>Date</th> <th>UTC time</th>
<th>Local time<br/><span style="font-size:9px;">(*)</span></th>
<th>Latitude</th> <th>Longitude</th> <th>Depth&nbsp;(km)</th> <th>Magnitude</th>
<th>Mag. type <a href="#"><img alt="INFO: Magnitude type"/></a></th>
<th>Max. int <a href="#"><img alt="INFO: Intensity scale"/></a></th>
<th>Region <a href="#"><img alt="INFO: Region"/></a></th> <th>More Info</th>
<tr> <td>es2026pogdh</td> <td>10/08/2026</td> <td>04:53:53</td> <td>05:53:53</td>
<td>28.2331</td> <td>-16.3681</td> <td>16.0</td> <td>1.6</td> <td>mbLg</td>
<td>&nbsp;</td> <td>E FASNIA.ITF</td> <td><a href="#">+ info</a></td>
<tr> <td>es2026pnrgf</td> <td>09/08/2026</td> <td>21:22:42</td> <td>22:22:42</td>
<td>28.0908</td> <td>-16.2352</td> <td>8.0</td> <td>1.6</td> <td>mbLg</td>
<td>&nbsp;</td> <td>ATL&Aacute;NTICO-CANARIAS</td> <td><a href="#">+ info</a></td>
</table></body></html>`;

test("parses live-style markup with unclosed rows and header decorations", () => {
  const events = parseIgnTable(LIVE_STYLE_FEED);
  assert.equal(events.length, 2);
  assert.equal(events[0].id, "es2026pogdh");
  assert.equal(events[0].time.toISOString(), "2026-08-10T04:53:53.000Z");
  assert.equal(events[0].depthKm, 16.0);
  assert.equal(events[0].maxIntensity, null);
  assert.equal(events[0].region, "E FASNIA.ITF");
  assert.equal(events[1].region, "ATLÁNTICO-CANARIAS");
});
