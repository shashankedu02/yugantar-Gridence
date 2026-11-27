// The interface defects found in the redesign audit, checked in a real browser against the real server, with real
// mouse and keyboard events.  Run from the repo root:  node tests/e2e/ux.e2e.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { checker, openBrowser, SHOTS, sleep, startApi, startWeb, stop } from "./harness.mjs";

const API = 8171, WEB = 5571, DEAD = 8179;
const url = (p) => `http://127.0.0.1:${p}`;
const t = checker();
const api = await startApi(API);
const web = await startWeb(WEB);
const b = await openBrowser(9471);
const J = (x) => JSON.stringify(x);
try {
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("monsoontwin.apiBaseUrl", "${url(API)}")` });
  const metrics = (w, h, dpr) => b.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  const load = async () => {
    await b.goto(`${url(WEB)}/index.html`);
    await b.waitFor(async () => (await b.text("api-status-text")).startsWith("Ready"), "connection");
    await sleep(500);
  };
  const idle = async () => { await sleep(150); await b.waitFor(async () => !(await b.disabled("#run-btn")), "idle"); await sleep(150); };
  const box = (sel) => b.eval(`(() => { const e = document.querySelector(${J(sel)}); e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const click = async (sel, fx = 0.5, fy = 0.5) => { const r = await box(sel); const x = r.x + r.w * fx, y = r.y + r.h * fy; await b.mouse("mousePressed", x, y); await b.mouse("mouseReleased", x, y); await sleep(150); };
  const key = async (k, code, vk, text) => { await b.key(k, code, vk, text ? { text } : {}); await sleep(200); };
  const pixels = () => b.eval(`(() => { const c = document.getElementById("map-canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 37) h = (h * 31 + d[i]) | 0; return h; })()`);
  const q = (expr) => b.eval(expr);
  const pressedChannel = () => q(`document.querySelector('[data-channel-index][aria-pressed="true"]').dataset.channelIndex`);
  const setCase = (id) => q(`(() => { const e = document.getElementById("case-select"); e.value = ${J(id)}; e.dispatchEvent(new Event("change")); })()`);
  const lastBodies = async () => {
    const out = [];
    for (const [id, r] of b.log.requests) {
      if (r.method !== "POST" || !r.url.endsWith("/simulate")) continue;
      out.push(JSON.parse((await b.send("Network.getResponseBody", { requestId: id })).body).rollout);
    }
    return out;
  };

  await metrics(1536, 730, 1.25);
  await load();

  console.log("-- first screen");
  t.ok((await q(`document.querySelector(".mt-brand p").textContent`)) === "AI-Powered Monsoon Forecasting and Climate Scenario Intelligence" && (await b.text("map-start")).includes("compare the forecasts"), "the header carries the tagline and the first screen says what to do");
  t.ok((await b.text("stage-text")).includes("not a forecast") && !(await q(`document.getElementById("map-badge").hidden`)), "the map shows the real input day, labelled not a forecast", await b.text("stage-text"));
  t.ok(await q(`!document.getElementById("map-start").classList.contains("hidden")`), "a getting-started card is shown");
  t.ok((await q(`document.querySelectorAll("#impact-container article").length`)) === 0, "no impact number is shown before a forecast");
  t.ok((await b.text("result-provenance")).startsWith("No forecast"), "nothing claims to be a forecast");
  const seen = [await pixels()];
  for (let i = 1; i < 6; i++) { await click(`[data-channel-index="${i}"]`); seen.push(await pixels()); }
  t.ok(new Set(seen).size === 6, "D3: all six variable buttons change the map before the first run", String(new Set(seen).size));
  t.ok((await q(`document.querySelector('.mt-tab[data-view="difference"]').title`)).includes("Run"), "D4: an unavailable view says how to enable it");
  await click('[data-channel-index="0"]');

  console.log("-- shock preview");
  b.resetLog();
  const before = await pixels();
  await click('[data-preset-id="warm_ocean"]');
  t.ok((await b.text("stage-tag")).toUpperCase() === "SHOCK PREVIEW" && (await pixels()) !== before, "choosing a shock immediately shows what it will change");
  t.ok(b.posts("/simulate").length === 0, "the preview sends no forecast request");
  await click('[data-channel-index="1"]');
  t.ok((await b.text("stage-text")).includes("does not change rain"), "a variable the shock leaves alone is explained", await b.text("stage-text"));
  await click('[data-channel-index="0"]');

  console.log("-- run, loading state");
  await click('[data-preset-id="none"]');
  await b.latency(600);
  await click("#start-run-btn");
  await sleep(250);
  t.ok(await q(`!document.getElementById("map-busy").classList.contains("hidden") && document.getElementById("run-btn").disabled`), "a loading state covers the map and the controls are locked");
  await idle(); await b.latency(0);
  t.ok(await q(`document.getElementById("map-busy").classList.contains("hidden") && document.getElementById("map-start").classList.contains("hidden") && document.getElementById("map-badge").hidden`), "after the run the loading, start and input labels are gone");
  t.ok((await b.text("result-provenance")).includes("LocalNet C64 (unvalidated)"), "the forecast names the model");
  t.ok((await b.eval(`document.getElementById("meta-summary").textContent`)).includes("server model ID: monsoontwin-localnet-c64-unvalidated"), "the exact server model ID stays available");
  const brand = await b.eval(`document.title + " | " + document.body.innerText.replace(/server model ID:.*$/gm, "")`);
  t.ok(/^Gridence — AI-Powered Monsoon Forecasting and Climate Scenario Intelligence/.test(brand) && !/monsoon\s?-?twin/i.test(brand), "the page is branded Gridence and shows no old product name", brand.match(/.{0,30}monsoon\s?-?twin.{0,30}/i)?.[0] || "");
  t.ok((await b.text("day-date")).length > 6, "forecast days carry calendar dates", await b.text("day-date"));

  console.log("-- keyboard after mouse use");
  await click("#day-slider", 0.5);
  const midDay = await b.text("day-label");
  await key("2", "Digit2", 50, "2");
  t.ok((await pressedChannel()) === "1", "D1: after using the slider, number keys still choose the variable");
  await key(" ", "Space", 32, " "); await sleep(1100);
  const playing = (await b.text("play-btn")) === "Pause" && (await b.text("day-label")) !== midDay;
  await key(" ", "Space", 32, " ");
  t.ok(playing && (await b.text("play-btn")) === "Play", "D1: after using the slider, Space plays and pauses");
  await click('[data-channel-index="3"]');
  await key(" ", "Space", 32, " "); await sleep(900);
  t.ok((await b.text("play-btn")) === "Pause" && (await pressedChannel()) === "3", "D5: after clicking a button, Space plays instead of pressing it again");
  await click("#play-btn");
  const runs = await q(`document.querySelectorAll("#run-log > div").length`);
  await click("#run-btn"); await idle();
  await key(" ", "Space", 32, " "); await sleep(300);
  t.ok((await q(`document.querySelectorAll("#run-log > div").length`)) === runs + 1, "Space after Run does not run again");
  await click("#play-btn");
  // a list chosen with the pointer gives up focus (the native popup itself cannot be driven headless)
  await click("#case-select"); await key("Escape", "Escape", 27);
  await setCase("monsoon-weak");
  const chosen = await q(`document.getElementById("case-select").value`);
  await click("#run-btn"); await idle();
  await key("ArrowDown", "ArrowDown", 40);
  t.ok((await q(`document.getElementById("case-select").value`)) === chosen && !(await b.text("result-provenance")).startsWith("No forecast"), "D2: arrows after choosing a case do not change the case or erase the forecast");
  await q(`document.getElementById("case-select").focus()`);
  t.ok((await q(`document.activeElement.id`)) === "case-select", "keyboard users can still focus and keep the list");
  await q(`document.activeElement.blur()`);

  console.log("-- playback and day buttons");
  await q(`(() => { const e = document.getElementById("day-slider"); e.value = 1; e.dispatchEvent(new Event("input")); })()`);
  await click("#next-day-btn"); await click("#next-day-btn"); await click("#prev-day-btn");
  t.ok((await b.text("day-label")) === "Day 2 / 10", "previous and next buttons step the day", await b.text("day-label"));
  await click("#play-btn"); await sleep(1700); await click("#play-btn");
  const stopped = await b.text("day-label"); await sleep(900);
  t.ok(stopped !== "Day 2 / 10" && (await b.text("day-label")) === stopped, "play advances and pause holds", stopped);

  console.log("-- all variables, all days");
  b.resetLog();
  await click('[data-preset-id="warm_ocean"]'); await click("#run-btn"); await idle();
  const [base, shock] = await lastBodies();
  const frames = new Set();
  for (let ch = 0; ch < 6; ch++) {
    await click(`[data-channel-index="${ch}"]`);
    for (let d = 1; d <= 10; d++) {
      await q(`(() => { const e = document.getElementById("day-slider"); e.value = ${d}; e.dispatchEvent(new Event("input")); })()`);
      frames.add(await pixels());
    }
  }
  t.ok(frames.size === 60, "60 different pictures for 6 variables x 10 days", String(frames.size));

  console.log("-- colour scales");
  const ticks = () => q(`[...document.querySelectorAll("#legend-container .mt-legend-ticks span")].map((e) => e.textContent).join(" ")`);
  await click('[data-channel-index="0"]');
  const atDay = async (d) => { await q(`(() => { const e = document.getElementById("day-slider"); e.value = ${d}; e.dispatchEvent(new Event("input")); })()`); return ticks(); };
  const t1 = await atDay(1), t10 = await atDay(10);
  await click('.mt-tab[data-view="scenario"]'); const tScenario = await ticks();
  t.ok(t1 === t10 && t1 === tScenario, "one value scale for every day, baseline and scenario", `${t1} | ${t10} | ${tScenario}`);
  await click('.mt-tab[data-view="difference"]');
  let largest = 0; for (let d = 0; d < 10; d++) for (let r = 0; r < 32; r++) for (let c = 0; c < 36; c++) largest = Math.max(largest, Math.abs(shock[d][0][r][c] - base[d][0][r][c]));
  const note = await b.text("legend-note");
  t.ok(note.includes("fitted to this run") && note.includes(largest.toPrecision(3)), "F5: the difference range is fitted and states the largest change", `${note} want ${largest.toPrecision(3)}`);
  const limit = Number((await ticks()).split(" ").pop());
  t.ok(limit <= 2 * largest && limit >= 0.5, "F5: the fitted range is close to the real changes", String(limit));
  await q(`(() => { const e = document.getElementById("scale-mode"); e.value = "fixed"; e.dispatchEvent(new Event("change")); })()`);
  t.ok((await ticks()).endsWith(" 5") && (await b.text("legend-note")).startsWith("Fixed range"), "a fixed range can be chosen", await ticks());
  await q(`(() => { const e = document.getElementById("scale-mode"); e.value = "run"; e.dispatchEvent(new Event("change")); })()`);

  await q(`(() => { const e = document.getElementById("opt-smooth"); e.checked = true; e.dispatchEvent(new Event("change")); })()`);
  t.ok((await b.text("map-badge")).toUpperCase().includes("SMOOTHED") && (await b.text("legend-note")).includes("1° cell"), "a smoothed map is labelled on the map and under the legend");
  await q(`(() => { const e = document.getElementById("opt-smooth"); e.checked = false; e.dispatchEvent(new Event("change")); })()`);
  t.ok(await q(`document.getElementById("map-badge").hidden`), "smoothing off removes the label");

  console.log("-- rain legend on screen");
  await click('.mt-tab[data-view="baseline"]'); await click('[data-channel-index="1"]');
  const placed = await q(`(() => { const bar = document.querySelector("#legend-container .mt-legend-bar").getBoundingClientRect();
    const edges = [...new Set([...document.querySelector("#legend-container .mt-legend-bar").style.background.matchAll(/\\) ([\\d.]+)%/g)].map((m) => +m[1]))];
    return [...document.querySelectorAll("#legend-container .mt-legend-ticks span")].slice(1).map((e) => { const r = e.getBoundingClientRect(); const at = 100 * (bar.bottom - (r.y + r.height / 2)) / bar.height; return [e.textContent, +Math.min(...edges.map((x) => Math.abs(x - at))).toFixed(2)]; }); })()`);
  t.ok(placed.length === 8 && placed.every(([, off]) => off <= 1.5), "F4: every rain label is level with its colour boundary (within 1.5 % of the bar)", J(placed));

  console.log("-- pointer, readout values and geography at three pixel densities");
  for (const [w, h, dpr] of [[1366, 768, 1], [1536, 730, 1.25], [1280, 800, 2]]) {
    await metrics(w, h, dpr); await sleep(600);
    const size = await q(`(() => { const c = document.getElementById("map-canvas"), r = c.getBoundingClientRect(); return { bw: c.width, bh: c.height, w: r.width * devicePixelRatio, h: r.height * devicePixelRatio, sw: document.documentElement.scrollWidth }; })()`);
    t.ok(Math.abs(size.bw - size.w) <= 1 && Math.abs(size.bh - size.h) <= 1, `F1 @${dpr}x: one canvas pixel per screen pixel`, J(size));
    t.ok(size.sw <= w, `@${dpr}x: no horizontal scroll`, J(size));
    await q(`window.scrollTo(0, 0)`);
    const wrong = [];
    for (const [row, col] of [[0, 0], [31, 35], [0, 35], [31, 0], [14, 20], [22, 12]]) {
      for (const [dx, dy] of [[0.5, 0.5], [0.08, 0.08], [0.92, 0.92]]) {
        const r = await box("#map-canvas");
        const x = r.x + (r.w * (col + dx)) / 36, y = r.y + (r.h * (31 - row + dy)) / 32;
        await b.mouse("mouseMoved", x, y); await sleep(40);
        const text = await b.text("map-hover-readout");
        if (!text.startsWith(`${(6.5 + row).toFixed(1)}°N ${(65.5 + col).toFixed(1)}°E`)) wrong.push(`${row},${col}+${dx}: ${text.slice(0, 20)}`);
      }
    }
    t.ok(wrong.length === 0, `F8 @${dpr}x: the pointer reports the cell under it (corners, centres and near edges)`, wrong.join(" | "));
    // New Delhi, 28.61 N 77.21 E, drawn where the projection puts it, lies in the 28.5 N 77.5 E cell
    const r = await box("#map-canvas");
    await b.mouse("mouseMoved", r.x + r.w * (77.21 - 65) / 36, r.y + r.h * (38 - 28.61) / 32); await sleep(40);
    t.ok((await b.text("map-hover-readout")).startsWith("28.5°N 77.5°E"), `@${dpr}x: reference geography and cells share one projection`);
    await q(`(() => { const e = document.getElementById("day-slider"); e.value = 4; e.dispatchEvent(new Event("input")); })()`);
    await b.mouse("mouseMoved", r.x + r.w * 20.5 / 36, r.y + r.h * (31 - 14 + 0.5) / 32); await sleep(80);
    const said = Number(((await b.text("map-hover-readout")).match(/baseline (-?[\d.]+)/) || [])[1]);
    t.ok(Math.abs(said - base[3][1][14][20]) < 0.006, `@${dpr}x: the readout value equals the server's array`, `${said} want ${base[3][1][14][20]}`);
  }
  await metrics(1536, 730, 1.25); await sleep(500);

  console.log("-- charts");
  await q(`[...document.querySelectorAll("#cell-quick button")][0].click()`); await sleep(250);
  t.ok((await b.text("series-chart-container")).includes("28.5°N 77.5°E"), "a city button charts the cell that contains it");
  const hover = async (sel, fx, fy) => { await q(`document.querySelector(${J(sel)}).scrollIntoView({ block: "center" })`); await sleep(150); const r = await q(`(() => { const x = document.querySelector(${J(sel)}).getBoundingClientRect(); return { x: x.x, y: x.y, w: x.width, h: x.height }; })()`); await b.mouse("mouseMoved", r.x + r.w * fx, r.y + r.h * fy); await sleep(200); };
  await hover("#series-chart-container svg", 0.995, 0.6);
  const tip = await q(`document.querySelector("#series-chart-container .mt-tip").innerText`);
  t.ok(tip.includes("Day 10") && tip.includes("Baseline") && tip.includes("Scenario"), "the line chart has a hover readout", tip);
  await hover("#energy-chart-container svg", 0.12, 0.5);
  t.ok((await q(`document.querySelector("#energy-chart-container .mt-tip").innerText`)).includes("shocked area"), "the energy chart has a hover readout");
  const clipped = await q(`[...document.querySelectorAll(".mt-chart-svg")].flatMap((s) => { const box = s.getBoundingClientRect(); return [...s.querySelectorAll("text")].filter((x) => { const r = x.getBoundingClientRect(); return r.left < box.left - 1 || r.right > box.right + 1; }).map((x) => x.textContent); })`);
  t.ok(clipped.length === 0, "E3: no chart label is cut off", J(clipped));
  const small = await q(`Math.min(...[...document.querySelectorAll(".mt-chart-svg text")].map((x) => { const s = x.ownerSVGElement; return parseFloat(getComputedStyle(x).fontSize) * s.getBoundingClientRect().width / s.viewBox.baseVal.width; }))`);
  t.ok(small >= 10, "E4: every chart label is drawn at 10 px or more", small.toFixed(1));

  console.log("-- help, errors, narrow screens");
  await q(`window.scrollTo(0, 0)`);
  await click("#help-btn");
  const open = await q(`document.getElementById("help-dialog").open`);
  const dayBefore = await b.text("day-label"); await key("ArrowRight", "ArrowRight", 39);
  const held = (await b.text("day-label")) === dayBefore;
  await key("Escape", "Escape", 27);
  t.ok(open && held && !(await q(`document.getElementById("help-dialog").open`)), "the guide opens, holds shortcuts and closes with Escape");
  await q(`document.getElementById("connection").open = true; document.getElementById("api-base-input").value = ${J(url(DEAD))}; document.getElementById("api-apply-btn").click()`);
  await sleep(1500); await idle();
  t.ok((await b.text("api-status-text")) === "Offline" && (await b.errorText()).includes("Network error") && (await q(`document.getElementById("map-start").classList.contains("hidden")`)), "an unreachable server is reported, with no model or start card");
  await q(`document.getElementById("api-base-input").value = ${J(url(API))}; localStorage.setItem("monsoontwin.apiBaseUrl", ${J(url(API))}); document.getElementById("api-apply-btn").click()`);
  await sleep(800); await idle();
  t.ok((await b.text("api-status-text")).startsWith("Ready") && (await b.errorText()) === "", "reconnecting recovers");
  for (const [w, h, dpr] of [[1536, 730, 1.25], [1366, 768, 1], [1280, 600, 1.5], [1100, 700, 1], [800, 900, 1], [390, 844, 3]]) {
    await metrics(w, h, dpr); await load(); await click('[data-preset-id="warm_ocean"]'); await click("#run-btn"); await idle();
    const g = await q(`(() => { window.scrollTo(0, 0); const c = document.getElementById("map-canvas").getBoundingClientRect(); const R = (s) => document.querySelector(s).getBoundingClientRect();
      const hit = (a, z) => Math.min(a.right, z.right) - Math.max(a.left, z.left) > 1 && Math.min(a.bottom, z.bottom) - Math.max(a.top, z.top) > 1;
      const parts = [".mt-toolbar", ".mt-stage-info", "#result-provenance", "#map-grid", ".mt-map-side", ".mt-timeline"];
      const overlaps = []; for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (hit(R(parts[i]), R(parts[j]))) overlaps.push(parts[i] + " over " + parts[j]);
      const rail = document.querySelector(".mt-rail-scroll"); if (rail.scrollWidth > rail.clientWidth + 1) overlaps.push("left panel scrolls sideways");
      const stage = R(".mt-stage"); for (const s of parts) if (R(s).bottom > stage.bottom + 1) overlaps.push(s + " leaves the map panel");
      return { sw: document.documentElement.scrollWidth, mapW: Math.round(c.width), ratio: +(c.width / c.height).toFixed(3), bottom: Math.round(document.getElementById("play-btn").getBoundingClientRect().bottom), overlaps }; })()`);
    console.log(`  [${w}x${h}@${dpr}] ${J(g)}`);
    t.ok(g.sw <= w && Math.abs(g.ratio - 1.125) < 0.01 && g.mapW >= Math.min(290, w - 90), `${w}x${h}: no sideways scroll, square cells, usable map`, J(g));
    t.ok(g.overlaps.length === 0, `${w}x${h}: nothing in the map panel overlaps`, J(g.overlaps));
    const shot = await b.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, `ux-${w}x${h}.png`), Buffer.from(shot.data, "base64"));
    if (w >= 1280) t.ok(g.bottom <= h, `${w}x${h}: map and timeline fit the first screen`, J(g));
  }

  const everything = [...b.log.requests.values()];
  const outside = everything.filter((r) => /^https?:/.test(r.url) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(r.url));
  t.ok(outside.length === 0, "no request leaves this machine", outside.map((r) => r.url).join(" "));
  const problems = [...b.log.exceptions, ...b.log.console.filter((m) => !m.includes(`:${DEAD}`) && !m.includes("ERR_CONNECTION_REFUSED"))];
  t.ok(problems.length === 0, "no JavaScript errors", problems.join(" | "));
} finally {
  await b.close(); await stop(web); await stop(api);
}
process.exit(t.done("ux e2e") ? 1 : 0);
