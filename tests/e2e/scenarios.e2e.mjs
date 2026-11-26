// Demo cases, custom shocks and the Impact Lens in a real browser against the real server.
// Run from the repo root:  node tests/e2e/scenarios.e2e.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checker, openBrowser, ROOT, sleep, startApi, startWeb, stop } from "./harness.mjs";

const API = 8161, WEB = 5561;
const url = (p) => `http://127.0.0.1:${p}`;
const t = checker();
const api = await startApi(API);
const web = await startWeb(WEB);
const b = await openBrowser(9461);
const CASES = JSON.parse(readFileSync(join(ROOT, "dashboard/cases/index.json"), "utf-8")).cases
  .map((n) => JSON.parse(readFileSync(join(ROOT, "dashboard/cases", n), "utf-8")));
const post = async (body) => (await (await fetch(`${url(API)}/${"simulate"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json()).rollout;
const climatology = async (body) => (await (await fetch(`${url(API)}/climatology`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json()).climatology;

// Independent re-computation of the impact numbers (written separately from the dashboard code).
function coreTotal(roll) {
  let total = 0;
  for (const day of roll) {
    let s = 0, w = 0;
    for (let r = 0; r < 32; r++) {
      const lat = 6.5 + r;
      for (let c = 0; c < 36; c++) {
        const lon = 65.5 + c;
        if (lat >= 18 && lat <= 28 && lon >= 65 && lon <= 88) { const k = Math.cos(lat * Math.PI / 180); s += k * day[1][r][c]; w += k; }
      }
    }
    total += s / w;
  }
  return total;
}
const heavy = (roll) => roll.reduce((n, d) => n + d[1].flat().filter((v) => v >= 10).length, 0);

try {
  await b.viewport(1366, 768);
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("monsoontwin.apiBaseUrl", ${JSON.stringify(url(API))})` });
  await b.goto(`${url(WEB)}/index.html`);
  await b.waitFor(async () => (await b.text("api-status-text")).startsWith("Ready"), "connection");
  const idle = () => b.waitFor(async () => !(await b.disabled("#run-btn")), "idle");
  const run = async () => { b.resetLog(); await b.click("#run-btn"); await sleep(250); await idle(); };
  const sent = () => b.posts("/simulate").map((r) => JSON.parse(r.body));
  const set = (id, v) => b.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(String(v))}; e.dispatchEvent(new Event("change")); })()`);
  const cards = () => b.eval(`Object.fromEntries([...document.querySelectorAll("#impact-container article")].map((a) => [a.dataset.indicatorId, a.innerText.replace(/\\s+/g, " ")]))`);
  const num = (text, key) => Number((text.match(new RegExp(key + ": ([+-]?[\\d.]+)")) || [])[1]);

  const options = await b.eval(`[...document.getElementById("case-select").options].map((o) => o.value)`);
  t.ok(JSON.stringify(options) === JSON.stringify([...CASES.map((c) => c.id), "synthetic"]), "all demo cases are offered, the synthetic input last", JSON.stringify(options));
  t.ok((await b.eval(`document.getElementById("synthetic-badge").classList.contains("hidden")`)), "a real case is selected first and not labelled synthetic");
  t.ok((await b.text("notice-text")) === "", "no case loading problems", await b.text("notice-text"));

  // every case loads and runs, and the server receives exactly that case
  for (const c of CASES) {
    await set("case-select", c.id);
    await b.click('[data-preset-id="none"]'); await run();
    const body = sent()[0];
    t.ok(JSON.stringify(body.init_states) === JSON.stringify(c.init_states) && JSON.stringify(body.doy_sincos) === JSON.stringify(c.doy_sincos) && body.perturbation === null,
      `${c.id}: baseline request carries this case and no shock`);
    t.ok((await b.text("result-provenance")).includes(c.label), `${c.id}: result is labelled with the case`);
  }

  // preset on a real case: impact numbers equal an independent computation from the server's arrays
  const mc = CASES.find((c) => c.id === "monsoon-active");
  await set("case-select", mc.id);
  for (const preset of ["warm_ocean", "monsoon_stall"]) {
    await b.click(`[data-preset-id="${preset}"]`); await run();
    const [base, shock] = sent();
    const [a, s] = [await post(base), await post(shock)];
    const k = await cards();
    t.ok(Math.abs(num(k["core-rain"], "B") - coreTotal(a)) < 0.051 && Math.abs(num(k["core-rain"], "S") - coreTotal(s)) < 0.051, `${preset}: core-zone rain matches the arrays`, k["core-rain"]);
    t.ok(num(k["heavy-rain"], "B") === heavy(a) && num(k["heavy-rain"], "S") === heavy(s), `${preset}: heavy-rain cell-days match`, k["heavy-rain"]);
    const cl = await climatology({ doy_sincos: base.doy_sincos, steps: 10 });
    const dep = 100 * (coreTotal(a) - coreTotal(cl)) / coreTotal(cl);
    t.ok(Math.abs(num(k["rain-departure"], "B") - dep) < 0.051, `${preset}: departure from climatology matches`, `${k["rain-departure"]} want ${dep.toFixed(2)}`);
  }
  await b.eval(`document.querySelector('#impact-container [data-indicator-id="core-rain"] details').open = true`);
  const pop = await b.eval(`document.querySelector('#impact-container [data-indicator-id="core-rain"] .mt-popover').innerText`);
  t.ok(pop.includes("Limitation") && pop.includes("not verified physics") && !pop.includes("DAP"), "the card states the limit of a learned response", pop);
  const impactText = await b.text("impact-container");
  t.ok(!/ELEVATED|NOMINAL/.test(impactText) && (await b.eval(`document.querySelectorAll("#impact-container article").length`)) >= 4, "no invented status words; at least four indicators");
  t.ok(await b.eval(`!!document.querySelector("#impact-series svg path")`), "daily core-zone rain is charted over time");
  await b.shot("impact-preset");

  // custom shock: rectangle, then a second component, exactly as configured
  await b.eval(`document.getElementById("custom-shock").open = true`);
  const fill = async (v) => { for (const [id, val] of Object.entries(v)) await set(id, val); };
  await fill({ "custom-channel": 1, "custom-op": "add", "custom-value": 25, "custom-shape": "rectangle", "custom-lat-min": 18.5, "custom-lat-max": 21.5, "custom-lon-min": 75.5, "custom-lon-max": 80.5 });
  await b.click("#custom-add");
  await fill({ "custom-channel": 5, "custom-op": "scale_pct", "custom-value": 10 });
  await b.click("#custom-add");
  t.ok((await b.eval(`document.querySelectorAll("#custom-list li").length`)) === 2, "both components are listed");
  await run();
  const custom = sent()[1];
  const want = Array.from({ length: 6 }, () => Array.from({ length: 32 }, () => Array(36).fill(0)));
  for (let r = 12; r <= 15; r++) for (let c = 10; c <= 15; c++) { want[1][r][c] = 25; want[5][r][c] = 0.10 * mc.init_states[2][5][r][c]; }
  let diff = 0;
  for (let ch = 0; ch < 6; ch++) for (let r = 0; r < 32; r++) for (let c = 0; c < 36; c++) diff = Math.max(diff, Math.abs(custom.perturbation[ch][r][c] - want[ch][r][c]));
  t.ok(diff < 1e-9, "the custom delta is sent exactly as configured", String(diff));
  t.ok(JSON.stringify(custom.init_states) === JSON.stringify(mc.init_states), "the input days are not modified by the shock (the server applies the delta)");
  const k = await cards();
  // LocalNet's response to a rain shock can change sign from day to day, so compare with the server's own arrays.
  const [ca, cs] = [await post(sent()[0]), await post(custom)];
  const areaRain = (day) => { let s = 0, w = 0; for (let r = 12; r <= 15; r++) for (let c = 10; c <= 15; c++) { const q = Math.cos((6.5 + r) * Math.PI / 180); s += q * day[1][r][c]; w += q; } return s / w; };
  const daily = ca.map((day, i) => areaRain(cs[i]) - areaRain(day));
  const totalChange = daily.reduce((x, y) => x + y, 0);
  console.log(`  rain shock, change over the shocked area by day: ${daily.map((v) => v.toFixed(2)).join(" ")} | total ${totalChange.toFixed(3)}`);
  t.ok(daily[0] > 1, "a rain shock raises day-1 rain over the shocked area", daily.map((v) => v.toFixed(2)).join(" "));
  t.ok(Math.abs(num(k["shocked-area-rain"], "Δ") - totalChange) < 0.051, "the shocked-area card equals the server's 10-day change", `${k["shocked-area-rain"]} want ${totalChange.toFixed(2)}`);
  t.ok((await b.text("result-provenance")).includes("Custom:"), "result names the custom shock");

  // smooth blob picked on the map
  await b.click('[data-preset-id="none"]');
  await fill({ "custom-channel": 0, "custom-op": "add", "custom-value": 3, "custom-shape": "smooth", "custom-radius": 2 });
  await b.click("#custom-pick");
  const pt = await b.eval(`(() => { const e = document.getElementById("map-canvas"); e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.x + r.width * (20.5 / 36), y: r.y + r.height * (1 - 14.5 / 32) }; })()`);
  await b.mouse("mousePressed", pt.x, pt.y); await b.mouse("mouseReleased", pt.x, pt.y); await sleep(200);
  const centre = await b.eval(`[document.getElementById("custom-lat").value, document.getElementById("custom-lon").value]`);
  t.ok(centre[0] === "20.5" && centre[1] === "85.5", "clicking the map sets the blob centre", JSON.stringify(centre));
  await b.click("#custom-add"); await run();
  const blob = sent()[1].perturbation;
  t.ok(blob[0][14][20] === 3 && Math.abs(blob[0][14][22] - 3 * Math.exp(-4 / 8)) < 1e-9 && blob[1].flat().every((v) => v === 0), "smooth blob has the stated peak, shape and variable");

  // validation: bad inputs send nothing and say why
  await b.click('[data-preset-id="none"]');
  const message = () => b.text("custom-message");
  for (const [what, v, expect] of [
    ["too large", { "custom-shape": "rectangle", "custom-value": 500 }, "between"],
    ["zero", { "custom-value": 0 }, "does nothing"],
    ["empty", { "custom-value": "" }, "number"],
    ["reversed range", { "custom-value": 2, "custom-lat-min": 30, "custom-lat-max": 10 }, "range"],
    ["off the grid", { "custom-lat-min": 50, "custom-lat-max": 60 }, "No grid cell"],
  ]) {
    await fill(v); await b.click("#custom-add");
    t.ok((await message()).includes(expect) && (await b.text("run-btn")) === "Run Simulation", `${what}: refused with a reason`, await message());
  }
  await run();
  t.ok(sent().length === 1 && sent()[0].perturbation === null, "with no shock only the unperturbed forecast is requested");

  // zero shock over HTTP equals no shock, for a demo case
  const nul = { init_states: mc.init_states, doy_sincos: mc.doy_sincos, steps: 10, perturbation: null };
  const zero = { ...nul, perturbation: want.map((ch) => ch.map((row) => row.map(() => 0))) };
  t.ok(JSON.stringify(await post(nul)) === JSON.stringify(await post(zero)), "zero shock is identical to no shock on a demo case");

  // changing case drops the shock
  await b.click('[data-preset-id="warm_ocean"]'); await set("case-select", "winter");
  t.ok((await b.text("run-btn")) === "Run Simulation" && (await b.text("result-provenance")).startsWith("No forecast"), "changing the case drops the shock and the results");

  // layout still fits with the new panel
  await b.click('[data-preset-id="warm_ocean"]'); await run(); await b.eval(`window.scrollTo(0, 0)`);
  const g = await b.eval(`({ map: document.getElementById("map-canvas").getBoundingClientRect().bottom, play: document.getElementById("play-btn").getBoundingClientRect().bottom, w: document.documentElement.scrollWidth })`);
  t.ok(g.map <= 768 && g.play <= 768 && g.w <= 1366, "1366x768 layout still fits", JSON.stringify(g));
  await b.shot("scenario-final");
  t.ok(b.log.exceptions.length === 0 && !b.log.console.some((m) => m.includes("listener failed")), "no JavaScript errors", [...b.log.exceptions, ...b.log.console].join(" | "));
} finally {
  await b.close(); await stop(web); await stop(api);
}
process.exit(t.done("scenarios e2e") ? 1 : 0);
