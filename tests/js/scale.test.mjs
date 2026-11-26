// Colour-scale, legend-position and reference-geography rules.  Run from the repo root:  node --test tests/js/
// All data here is synthetic and only exercises code paths.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DIFF_MIN_SPAN, differenceScale, niceBounds, niceCeil, valueScale } from "../../dashboard/js/scale.js";
import { legendTicks } from "../../dashboard/js/ui/legend.js";
import { RAIN_BINS, buildLegendCss, valueToRgba } from "../../dashboard/js/ui/colormap.js";
import { CHANNELS } from "../../dashboard/js/config.js";
import { loadCoastline } from "../../dashboard/js/geo.js";

const day = (fn) => Array.from({ length: 6 }, (_, ch) => Array.from({ length: 32 }, (_, r) => Array.from({ length: 36 }, (_, c) => fn(ch, r, c))));

test("rounding always widens a range", () => {
  for (const x of [0.013, 0.5, 0.51, 3.22, 7.6, 23.8, 424]) assert.ok(niceCeil(x) >= x && niceCeil(x) <= 2.01 * x, String(x));
  for (const [a, b] of [[275.2, 309.7], [100480.04, 101191.45], [-0.73, 10.02], [5, 5]]) {
    const [lo, hi] = niceBounds(a, b);
    assert.ok(lo <= a && hi >= b && hi > lo, `${a} ${b} -> ${lo} ${hi}`);
  }
});

test("a fitted value range covers the central data, is shared by all rollouts and reports what it clips", () => {
  const cool = [day((_ch, r, c) => 280 + ((r + c) % 10))];
  const warm = [day((_ch, r, c) => 300 + ((r + c) % 10))];
  const both = valueScale(0, [cool, warm]);
  assert.ok(both.fitted && both.min <= 280 && both.max >= 309);
  assert.equal(both.clipped, 0);
  const outlier = [day((_ch, r, c) => (r === 0 && c < 4 ? 400 : 300 + (c % 5)))];
  const s = valueScale(0, [outlier]);
  assert.ok(s.max < 400 && s.clipped > 0 && s.clipped < 0.01, "extremes are clipped and counted");
  const fixed = valueScale(0, [cool], "fixed");
  assert.deepEqual([fixed.min, fixed.max, fixed.fitted], [CHANNELS[0].min, CHANNELS[0].max, false]);
});

test("wind keeps zero in the middle; rain always uses the fixed bands", () => {
  const wind = valueScale(2, [[day((_ch, _r, c) => c / 4 - 1)]]);
  assert.equal(wind.min, -wind.max);
  const rain = valueScale(1, [[day(() => 3)]]);
  assert.deepEqual([rain.ramp, rain.fitted], ["rain", false]);
});

test("a difference range is symmetric, never narrower than the floor, and honest about the largest change", () => {
  for (let ch = 0; ch < 6; ch++) {
    const tiny = differenceScale(ch, [[day(() => 1e-9)]]);
    assert.equal(tiny.max, DIFF_MIN_SPAN[ch], "noise is not blown up");
    assert.equal(tiny.min, -tiny.max);
  }
  const d = differenceScale(0, [[day((_ch, r, c) => (r === 3 && c === 4 ? -9 : r < 8 ? 1.3 : 0))]]);
  assert.ok(d.max >= 1.3 && d.max < 9 && d.largest === 9 && d.clipped > 0);
  assert.equal(differenceScale(0, [[day(() => 1)]], "fixed").max, CHANNELS[0].diffMax);
});

test("every rain label sits exactly where its colour band starts", () => {
  const ticks = legendTicks({ ramp: "rain" });
  const edges = [...buildLegendCss({ ramp: "rain" }).matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]) / 100);
  assert.equal(ticks.length, RAIN_BINS.length + 1);
  RAIN_BINS.forEach((v, i) => {
    assert.equal(ticks[i + 1].text, String(v));
    assert.ok(edges.some((e) => Math.abs(e - ticks[i + 1].at) < 1e-4), `${v} is at a band edge`);
    // the colour just below the boundary differs from the colour at it
    assert.notDeepEqual(valueToRgba(v - 1e-6, { ramp: "rain" }), valueToRgba(v, { ramp: "rain" }));
  });
});

test("continuous legends put their labels at the matching fractions", () => {
  assert.deepEqual(legendTicks({ min: 0, max: 8, ramp: "thermal" }).map((t) => [t.text, t.at]), [["0", 0], ["2", 0.25], ["4", 0.5], ["6", 0.75], ["8", 1]]);
});

test("the reference coastline is coastline only, inside the map area, and bad files are refused", async () => {
  const file = JSON.parse(readFileSync(new URL("../../dashboard/vendor/geo/coastline-ne50m.json", import.meta.url), "utf-8"));
  assert.deepEqual(Object.keys(file).sort(), ["bounds", "lines", "note", "source"]);
  const points = file.lines.flat();
  assert.ok(points.length > 500);
  assert.ok(points.every(([lon, lat]) => lon >= 64 && lon <= 102 && lat >= 5 && lat <= 39));
  const ok = await loadCoastline(async () => ({ ok: true, json: async () => file }));
  assert.equal(ok.length, file.lines.length);
  assert.equal(await loadCoastline(async () => ({ ok: true, json: async () => ({ lines: [[["a", 1]]] }) })), null);
  assert.equal(await loadCoastline(async () => ({ ok: false })), null);
});
