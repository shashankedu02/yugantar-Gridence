// Dashboard display accuracy, layout, keyboard and safety in a real browser against the real server.
// Run from the repo root:  node tests/e2e/dashboard.e2e.mjs
import { checker, openBrowser, sleep, startApi, startMislabellingProxy, startWeb, stop } from "./harness.mjs";

const API = 8141, PROXY = 8143, WEB = 5541;
const url = (p) => `http://127.0.0.1:${p}`;
const t = checker();
const api = await startApi(API);
const HOSTILE = '<img src=x onerror="window.__injected=1">';
const proxy = await startMislabellingProxy(PROXY, API, { "x-monsoontwin-fallback": HOSTILE });
const web = await startWeb(WEB);
const b = await openBrowser(9441);
const CH = ["t2m", "tp", "u10", "v10", "msl", "tcwv"];
try {
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("monsoontwin.apiBaseUrl", ${JSON.stringify(url(API))})` });
  const idle = () => b.waitFor(async () => !(await b.disabled("#run-btn")), "idle");
  const load = async () => {
    await b.goto(`${url(WEB)}/index.html`);
    await b.waitFor(async () => (await b.text("api-status-text")).startsWith("Ready"), "connection");
    // The expected values below are computed from the synthetic input, so the page must show that input too.
    await b.eval(`(() => { const s = document.getElementById("case-select"); s.value = "synthetic"; s.dispatchEvent(new Event("change")); })()`);
  };
  const run = async (preset = "warm_ocean") => { await b.click(`[data-preset-id="${preset}"]`); await b.click("#run-btn"); await sleep(250); await idle(); };

  // ---- layout ---------------------------------------------------------------------------------------------
  for (const [w, h] of [[1366, 768], [1920, 1080], [1024, 768], [390, 844]]) {
    await b.viewport(w, h); await load(); await run();
    const g = await b.eval(`(() => { window.scrollTo(0, 0);
      const c = document.getElementById("map-canvas").getBoundingClientRect();
      return { pageW: document.documentElement.scrollWidth, mapBottom: Math.round(c.bottom), mapH: Math.round(c.height), mapW: c.width,
        aspect: c.width / c.height, timeline: Math.round(document.getElementById("play-btn").getBoundingClientRect().bottom),
        topbar: Math.round(document.querySelector(".mt-topbar").getBoundingClientRect().height) }; })()`);
    console.log(`  [${w}x${h}] ${JSON.stringify(g)}`);
    t.ok(g.pageW <= w, `${w}: no horizontal scroll`);
    t.ok(Math.abs(g.aspect - 1.125) < 0.01, `${w}: map cells stay square`, String(g.aspect));
    if (w >= 1366) t.ok(g.mapBottom <= h && g.timeline <= h, `${w}x${h}: map and timeline fit without scrolling`, JSON.stringify(g));
    if (w === 1366) t.ok(g.mapH >= 300 && g.topbar <= 64, "1366: map is a usable size and the top bar is one row", JSON.stringify(g));
    await b.shot(`layout-${w}`);
  }

  await b.viewport(1366, 768); await load(); await run();

  // ---- map colours against the legend, read from the page itself ------------------------------------------
  const colourCheck = (view, ch) => b.eval(`(async () => {
    const st = await import("./js/state.js"), sc = await import("./js/scenario.js");
    const base = st.buildSyntheticCase();
    const call = async (pert) => (await (await fetch(${JSON.stringify(url(API))} + "/" + "simulate", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sc.buildSimulatePayload({ activeCase: base, steps: 10, perturbation: pert })) })).json()).rollout;
    const a = await call(null);
    let field = a[0][${ch}];
    if (${JSON.stringify(view)} === "difference") {
      const s = await call(sc.buildPresetPerturbation("warm_ocean", base.init_states));
      field = s[0][${ch}].map((row, r) => row.map((v, c) => v - a[0][${ch}][r][c]));
    }
    // Colour the LEGEND assigns to a value, computed only from its CSS gradient and tick labels.
    const bar = document.querySelector("#legend-container .mt-legend-bar");
    const ticks = [...document.querySelectorAll("#legend-container .mt-legend-ticks span")].map((e) => e.textContent);
    const parts = [...bar.style.background.matchAll(/rgb\\((\\d+), (\\d+), (\\d+)\\)(?: ([\\d.]+)%)?/g)].map((m) => ({ c: [+m[1], +m[2], +m[3]], p: m[4] === undefined ? null : +m[4] }));
    let legendColour;
    if (ticks[0] === "<1") {                      // rain: hard bands; band i starts at tick i
      const bins = ticks.slice(1).map(Number);
      const bands = [parts[0].c];
      for (let i = 2; i < parts.length; i += 2) bands.push(parts[i].c);
      legendColour = (v) => { let i = 0; while (i < bins.length && v >= bins[i]) i++; return bands[i]; };
    } else {
      const lo = Number(ticks[0]), hi = Number(ticks[ticks.length - 1]);
      legendColour = (v) => { const x = Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * (parts.length - 1), k = Math.min(parts.length - 2, Math.floor(x)), f = x - k;
        return parts[k].c.map((q, j) => q + (parts[k + 1].c[j] - q) * f); };
    }
    const ctx = document.getElementById("map-canvas").getContext("2d");
    let n = 0, good = 0, worst = 0;
    for (let r = 1; r < 32; r += 2) for (let c = 1; c < 36; c += 2) {
      // the same point inside each cell as before (3/16 from its top-left corner), at whatever size the canvas now is
      const cv = ctx.canvas, kx = cv.width / 36, ky = cv.height / 32;
      const px = ctx.getImageData(Math.floor((c + 3 / 16) * kx), Math.floor((31 - r + 3 / 16) * ky), 1, 1).data;
      const want = legendColour(field[r][c]);
      const d = Math.hypot(px[0] - want[0], px[1] - want[1], px[2] - want[2]);
      n++; if (d <= 6) good++; worst = Math.max(worst, d);
    }
    return { n, good, worst: Math.round(worst), values: [Math.min(...field.flat()).toFixed(2), Math.max(...field.flat()).toFixed(2)] };
  })()`);
  await b.click('[data-preset-id="none"]'); await b.click("#run-btn"); await sleep(250); await idle();
  for (let ch = 0; ch < 6; ch++) {
    await b.click(`[data-channel-index="${ch}"]`); await sleep(150);
    const r = await colourCheck("baseline", ch);
    // coastline, graticule and isobars may cross a few sampled pixels
    t.ok(r.good / r.n >= 0.9, `${CH[ch]}: map colour = legend colour`, JSON.stringify(r));
  }
  await run("warm_ocean");
  await b.click('.mt-tab[data-view="difference"]');
  for (const ch of [0, 5]) {
    await b.click(`[data-channel-index="${ch}"]`); await sleep(150);
    // the shock marker is an outline with no fill, so shocked cells must match the legend too
    await b.eval(`window.__noop = 1`);
    const r = await colourCheck("difference", ch);
    t.ok(r.good / r.n >= 0.9, `${CH[ch]} difference: map colour = legend colour, shocked cells included`, JSON.stringify(r));
  }

  // ---- energy chart against an independent calculation -----------------------------------------------------
  const energy = await b.eval(`(async () => {
    const st = await import("./js/state.js"), sc = await import("./js/scenario.js");
    const base = st.buildSyntheticCase(), pert = sc.buildPresetPerturbation("warm_ocean", base.init_states);
    const call = async (p) => (await (await fetch(${JSON.stringify(url(API))} + "/" + "simulate", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sc.buildSimulatePayload({ activeCase: base, steps: 10, perturbation: p })) })).json()).rollout;
    const a = await call(null), s = await call(pert);
    const std = (await (await fetch(${JSON.stringify(url(API))} + "/meta", { method: "POST" })).json()).channel_std;
    const hit = []; for (let r = 0; r < 32; r++) for (let c = 0; c < 36; c++) if (pert.some((ch) => ch[r][c] !== 0)) hit.push([r, c]);
    const sum = Array(13).fill(0), cnt = Array(13).fill(0);
    for (let r = 0; r < 32; r++) for (let c = 0; c < 36; c++) {
      const d = Math.min(...hit.map(([i, j]) => Math.hypot(r - i, c - j)));
      let k = 0; if (d > 0) { k = 1; while (k < 12 && d > k + 1e-9) k++; }
      let e = 0; for (let ch = 0; ch < 6; ch++) e += ((s[0][ch][r][c] - a[0][ch][r][c]) / std[ch]) ** 2;
      sum[k] += e; cnt[k]++;
    }
    const want = sum.map((v, i) => v / cnt[i]);
    const total = sum.reduce((x, y) => x + y, 0), outsideShare = (total - sum[0]) / total;
    const svg = document.querySelector("#energy-chart-container svg");
    const bars = [...svg.querySelectorAll("rect")].map((r) => +r.getAttribute("height"));
    const texts = [...svg.querySelectorAll("text")].map((e) => ({ s: e.textContent, r: e.getBoundingClientRect() }));
    let overlap = 0; for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) { const p = texts[i].r, q = texts[j].r;
      if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 2 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 2) overlap++; }
    return { want, outsideShare, bars, legend: texts.map((x) => x.s), overlap, caption: document.querySelector("#energy-chart-container .mt-caption").innerText,
      labelPx: 10 * svg.getBoundingClientRect().width / 460 };
  })()`);
  const max = Math.max(...energy.want), top = Math.max(...energy.bars);
  const wrong = energy.want.map((v, i) => Math.abs((v === 0 ? 1.5 : Math.max(2, (v / max) * top)) - energy.bars[i]) > 0.6 ? i : null).filter((x) => x !== null);
  t.ok(energy.bars.length === 13 && wrong.length === 0, "energy bars match an independent calculation (13 bins)", JSON.stringify({ wrong, want: energy.want.map((v) => +v.toFixed(3)), bars: energy.bars }));
  t.ok(energy.bars[0] === top && energy.want[0] > 0, "the shocked area itself (bin 0) carries the largest response");
  t.ok(!energy.legend.includes("Baseline"), "no invented baseline series");
  t.ok(energy.overlap === 0, "energy chart labels do not overlap", String(energy.overlap));
  t.ok(energy.labelPx >= 8, "chart text is at least 8 px at 1366x768", energy.labelPx.toFixed(1));
  const said = Number((energy.caption.match(/([\d.]+)% of the response energy is outside/) || [])[1]);
  t.ok(Math.abs(said - 100 * energy.outsideShare) < 0.06, "caption share matches an independent calculation", `${energy.caption} want ${(100 * energy.outsideShare).toFixed(2)}`);

  // ---- keyboard --------------------------------------------------------------------------------------------
  await b.click('.mt-tab[data-view="baseline"]');
  await b.eval(`document.activeElement.blur()`);
  const day = () => b.text("day-label");
  const pressed = (sel) => b.eval(`document.querySelector(${JSON.stringify(sel)}).getAttribute("aria-pressed")`);
  await b.key("ArrowRight", "ArrowRight", 39); await b.key("ArrowRight", "ArrowRight", 39); await b.key("ArrowLeft", "ArrowLeft", 37);
  t.ok((await day()) === "Day 2 / 10", "arrow keys change the day", await day());
  await b.key("2", "Digit2", 50, { text: "2" });
  t.ok((await pressed('[data-channel-index="1"]')) === "true", "number keys choose the variable");
  await b.key("d", "KeyD", 68, { text: "d" });
  t.ok((await pressed('.mt-tab[data-view="difference"]')) === "true", "D opens the difference view");
  await b.key("b", "KeyB", 66, { text: "b" });
  await b.eval(`window.__prevented = null; window.addEventListener("keydown", (e) => { if (e.ctrlKey && e.key === "d") window.__prevented = e.defaultPrevented; })`);
  await b.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "d", code: "KeyD", windowsVirtualKeyCode: 68, modifiers: 2 });
  t.ok((await b.eval("window.__prevented")) === false && (await pressed('.mt-tab[data-view="baseline"]')) === "true", "Ctrl+D is left to the browser");
  await b.key(" ", "Space", 32, { text: " " }); await sleep(950);
  t.ok((await b.text("play-btn")) === "Pause", "Space starts playback");
  await b.key(" ", "Space", 32, { text: " " });
  t.ok((await b.text("play-btn")) === "Play", "Space pauses playback");
  await b.eval(`document.querySelector('[data-channel-index="0"]').focus()`);
  const d0 = await day(); await b.key("ArrowRight", "ArrowRight", 39);
  t.ok((await day()) !== d0, "arrows still work after clicking a button", `${d0} -> ${await day()}`);
  await b.eval(`document.getElementById("connection").open = true; document.getElementById("api-base-input").focus()`);   // typing here changes nothing until Connect
  const d1 = await day(); await b.key("ArrowRight", "ArrowRight", 39); await b.key("3", "Digit3", 51, { text: "3" });
  t.ok((await day()) === d1 && (await pressed('[data-channel-index="2"]')) === "false", "shortcuts are ignored while typing");
  await b.eval(`document.getElementById("map-canvas").focus()`);
  const d2 = await day(); await b.key("ArrowUp", "ArrowUp", 38); const r1 = await b.text("map-hover-readout");
  await b.key("ArrowRight", "ArrowRight", 39); const r2 = await b.text("map-hover-readout");
  t.ok(r1 !== r2 && r2.includes("°N") && (await day()) === d2, "the map is keyboard operable: arrows move the cell", `${r1} | ${r2}`);
  t.ok((await b.eval(`!!document.querySelector("#series-chart-container svg")`)), "the selected cell shows its time series");
  const series = await b.eval(`(() => { const s = document.querySelector("#series-chart-container svg"); const x = [...s.querySelectorAll("text")].map((e) => ({ s: e.textContent, r: e.getBoundingClientRect() }));
    let n = 0; for (let i = 0; i < x.length; i++) for (let j = i + 1; j < x.length; j++) { const p = x[i].r, q = x[j].r; if (Math.min(p.right, q.right) - Math.max(p.left, q.left) > 2 && Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top) > 2) n++; }
    return { overlap: n, names: x.map((e) => e.s), paths: s.querySelectorAll("path").length }; })()`);
  t.ok(series.names.includes("Climatology") && series.paths === 3 && series.overlap === 0, "series shows baseline, scenario and climatology without overlapping labels", JSON.stringify(series));
  await b.eval(`document.activeElement.blur()`);
  const popover = await b.eval(`(() => { const d = document.querySelector("#impact-container details"); if (!d) return null; d.open = true; return true; })()`);
  if (popover) { await b.key("Escape", "Escape", 27); t.ok(!(await b.eval(`document.querySelector("#impact-container details").open`)), "Escape closes the method popover"); }
  await b.shot("dashboard-difference");

  // ---- hostile text from a server is never parsed as HTML --------------------------------------------------
  await b.eval(`document.getElementById("api-base-input").value = ${JSON.stringify(url(PROXY))}; document.getElementById("api-apply-btn").click()`);
  await sleep(300); await idle(); await run("warm_ocean"); await sleep(300);
  t.ok((await b.eval("window.__injected === undefined")) && !(await b.eval(`!!document.querySelector("img[src='x']")`)), "server text is not parsed as HTML");
  t.ok((await b.text("notice-text")).includes("<img"), "the hostile text is shown literally");
  t.ok(b.log.exceptions.length === 0, "no uncaught exceptions on the dashboard", b.log.exceptions.join(" | "));

  // ---- W3 sandbox ------------------------------------------------------------------------------------------
  b.resetLog(); await b.goto(`${url(WEB)}/ui-sandbox.html`);
  await b.click('[data-view="baseline"]'); await b.click('[data-channel="tp"]'); await sleep(150);
  const cells = await b.eval(`(() => { const d = document.getElementById("sandbox-map").getContext("2d").getImageData(0, 0, 36, 32).data; let clear = 0, faint = 0; for (let i = 3; i < d.length; i += 4) { if (d[i] === 0) clear++; else if (d[i] < 255) faint++; } return { clear, faint }; })()`);
  t.ok(cells.clear === 20 && cells.faint === 0, "only the 20 missing cells show the missing pattern; dry cells are opaque", JSON.stringify(cells));
  const legendNull = await b.eval(`(async () => { const m = await import("./js/ui/legend.js"); const e = document.createElement("div"); document.body.appendChild(e); m.renderLegend(e, { channel: "t2m", unit: "K", min: null, max: null, ramp: "thermal" }); const s = e.innerText; e.remove(); return s; })()`);
  t.ok(legendNull.includes("unavailable"), "a missing colour range is not invented", legendNull);
  await b.viewport(1024, 768); await b.goto(`${url(WEB)}/ui-sandbox.html`);
  let strays = 0;
  for (let i = 0; i < 30; i++) { await b.key("Tab", "Tab", 9); strays += await b.eval(`document.activeElement.closest(".mt-rail:not(.is-open)") ? 1 : 0`); }
  t.ok(strays === 0, "closed drawers are out of the tab order", String(strays));
  await b.click("#btn-open-left"); await sleep(500);
  t.ok(await b.eval(`!!document.activeElement.closest("#rail-left")`), "focus moves into an opened drawer");
  await b.key("Escape", "Escape", 27); await sleep(400);
  t.ok((await b.eval(`document.activeElement.id`)) === "btn-open-left", "Escape closes the drawer and returns focus");
  t.ok(b.log.exceptions.length === 0 && b.log.console.length === 0, "sandbox console is clean", [...b.log.exceptions, ...b.log.console].join(" | "));
} finally {
  await b.close(); proxy.close(); await stop(web); await stop(api);
}
process.exit(t.done("dashboard e2e") ? 1 : 0);
