// Dashboard <-> real server. Run from the repo root:  node tests/e2e/integration.e2e.mjs
// (set PYTHON to the interpreter that has the server requirements if "python" is not it).
import { checker, dapFallbackTree, openBrowser, placeholderTree, sleep, startApi, startMislabellingProxy, startWeb, stop } from "./harness.mjs";

const API = 8131, PLACEHOLDER = 8132, PROXY = 8133, FALLBACK = 8134, DEAD = 8139, WEB = 5531;
const MODEL = "LocalNet C64 (unvalidated)", DAP_MODEL = "DAP (unvalidated)"; // names as shown on screen
const url = (p) => `http://127.0.0.1:${p}`;
const t = checker();
let api = await startApi(API);
const fallback = await startApi(FALLBACK, dapFallbackTree());
const placeholder = await startApi(PLACEHOLDER, placeholderTree());
const proxy = await startMislabellingProxy(PROXY, API);
const web = await startWeb(WEB);
const b = await openBrowser(9431);
try {
  await b.viewport(1366, 768);
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("monsoontwin.apiBaseUrl", ${JSON.stringify(url(API))})` });
  const idle = () => b.waitFor(async () => !(await b.disabled("#run-btn")), "the run to finish");
  const connect = async (port) => {
    await b.eval(`document.getElementById("api-base-input").value = ${JSON.stringify(url(port))}; document.getElementById("api-apply-btn").click()`);
    await sleep(300); await idle();
  };
  const run = async () => { await b.click("#run-btn"); await sleep(250); await idle(); };
  const load = async () => {
    await b.goto(`${url(WEB)}/index.html`);
    await b.waitFor(async () => (await b.text("api-status-text")).startsWith("Ready"), "connection");
  };
  const dayEnabled = async () => !(await b.disabled("#day-slider"));
  const perturbed = (r) => {
    const p = JSON.parse(r.body).perturbation;
    return p ? ["t2m", "tp", "u10", "v10", "msl", "tcwv"].filter((_, i) => p[i].some((row) => row.some((v) => v !== 0))).join(",") : "none";
  };

  await load();
  t.ok((await b.errorText()) === "", "connecting shows no error", await b.errorText());
  t.ok((await b.text("model-banner")).includes(MODEL), "banner names the connected model");

  b.resetLog(); await run();
  t.ok((await b.text("result-provenance")).includes(MODEL), "result names the model that answered", await b.text("result-provenance"));
  t.ok(await dayEnabled(), "a baseline forecast is on screen");
  const clim = b.posts("/climatology");
  t.ok(clim.length === 1 && clim[0].status === 200 && JSON.parse(clim[0].body).steps === 10, "climatology request carries steps and succeeds");

  // lock while running, snapshot of inputs
  await b.latency(700); b.resetLog();
  await b.click('[data-preset-id="warm_ocean"]'); await b.click("#run-btn");
  const states = [];
  let sentShock = null;
  await sleep(500);
  const locked = await b.eval(`["#run-btn", "#clear-shock-btn", "#case-select", "#steps-input", "#api-apply-btn", '[data-preset-id="monsoon_stall"]', '[data-preset-id="none"]'].filter((s) => !document.querySelector(s).disabled)`);
  t.ok(locked.length === 0, "all run inputs are locked while running", JSON.stringify(locked));
  t.ok((await b.text("result-provenance")).includes("Running"), "the previous forecast is not shown as the new one");
  await b.click('[data-preset-id="monsoon_stall"]'); await b.click('[data-preset-id="none"]');
  for (let i = 0; i < 40 && (await b.disabled("#run-btn")); i++) { states.push(true); await b.click("#run-btn"); await sleep(200); }
  await idle();
  sentShock = b.posts("/simulate").map(perturbed);
  t.ok(b.posts("/simulate").length === 2, "repeated clicks during a run send nothing extra", `sent ${b.posts("/simulate").length}`);
  t.ok(JSON.stringify(sentShock) === JSON.stringify(["none", "t2m,tcwv"]), "the shock sent is the one selected at the click", JSON.stringify(sentShock));
  t.ok((await b.text("result-provenance")).includes("Warm Bay of Bengal"), "result names its scenario");
  t.ok(!(await b.disabled('.mt-tab[data-view="difference"]')), "difference view is available");
  await b.latency(0);

  await b.click('[data-preset-id="monsoon_stall"]');
  t.ok(await b.disabled('.mt-tab[data-view="difference"]'), "choosing another shock removes the old scenario");
  await b.eval(`(() => { const s = document.getElementById("steps-input"); s.value = "5"; s.dispatchEvent(new Event("change")); })()`);
  t.ok(!(await dayEnabled()) && (await b.text("result-provenance")).startsWith("No forecast"), "changing the lead time removes the old result");
  b.resetLog(); await run();
  t.ok((await b.text("day-label")) === "Day 1 / 5" && b.posts("/simulate").every((r) => JSON.parse(r.body).steps === 5), "rerun uses the new lead time");

  // switch server
  await connect(PLACEHOLDER);
  t.ok((await b.text("model-banner")).includes("Not a model"), "placeholder banner shown for the placeholder server");
  t.ok(!(await dayEnabled()) && (await b.text("result-provenance")).startsWith("No forecast"), "old forecast is removed when the server changes");
  b.resetLog(); await run();
  t.ok((await b.text("result-provenance")).includes("placeholder-persistence"), "new result is labelled with the new model");
  t.ok((await b.text("notice-text")).includes("Climatology is not available"), "503 climatology is explained, not an error", await b.text("notice-text"));

  // not comparable
  await connect(PROXY); await b.click('[data-preset-id="warm_ocean"]'); await run();
  t.ok((await b.text("notice-text")).includes("not comparable"), "a fallback is reported", await b.text("notice-text"));
  t.ok(await b.disabled('.mt-tab[data-view="difference"]'), "no difference is drawn across a fallback");
  const mixed = await b.text("result-provenance");
  t.ok(mixed.includes(`baseline from ${MODEL}; scenario from ${MODEL} (FALLBACK: whole-request-fallback)`), "the line above the map names both forecasts when they differ", mixed);

  // a real server whose LocalNet cannot load: it must say DAP everywhere
  await connect(FALLBACK);
  t.ok((await b.text("api-status-text")).includes(DAP_MODEL) && (await b.text("model-banner")).includes(DAP_MODEL) && (await b.text("model-banner")).includes("mode: dap"),
    "damaged checkpoint: status and banner say DAP", await b.text("model-banner"));
  b.resetLog(); await b.click('[data-preset-id="warm_ocean"]'); await run();
  const line = await b.text("result-provenance");
  t.ok(line.includes(DAP_MODEL) && !/localnet/i.test(line), "damaged checkpoint: the result is labelled DAP", line);
  t.ok((await b.eval(`document.querySelector('#impact-container [data-indicator-id="core-rain"] .mt-popover').textContent`)).includes("cannot change rain"),
    "under DAP the card still explains that this shock cannot change rain");
  t.ok((await b.text("run-log")).includes(DAP_MODEL), "the run log records DAP");

  // dead server
  await connect(DEAD);
  t.ok((await b.text("api-status-text")) === "Offline", "status is Offline");
  t.ok(!/localnet|dap|monsoontwin/i.test(await b.text("model-banner")) && !(await b.text("model-banner")).includes("Not a model"), "no model identity is shown while offline", await b.text("model-banner"));
  t.ok(!(await dayEnabled()), "no forecast is shown while offline");
  await connect(API);
  t.ok((await b.errorText()) === "", "reconnecting clears the error");

  // server dies in the middle of a session, then comes back
  await stop(api);
  await run();
  t.ok((await b.errorText()).includes("No forecast is shown"), "a failed run says so", await b.errorText());
  t.ok((await b.text("api-status-text")) === "Offline" && !(await dayEnabled()), "state is honest after the failure");
  t.ok(!(await b.disabled("#run-btn")) && !(await b.disabled("#api-apply-btn")), "controls are usable again");
  api = await startApi(API);
  await run();
  t.ok(await dayEnabled(), "Run recovers once the server is back", await b.errorText());
  t.ok((await b.text("model-banner")).includes(MODEL), "identity is restored on reconnect");
  t.ok(b.log.exceptions.length === 0, "no uncaught JavaScript exceptions", b.log.exceptions.join(" | "));
  t.ok(!b.log.console.some((m) => m.includes("Store listener failed")), "no rendering errors were swallowed", b.log.console.join(" | "));
  await b.shot("integration-final");
} finally {
  await b.close(); proxy.close(); await stop(web); await stop(api); await stop(placeholder); await stop(fallback);
}
process.exit(t.done("integration e2e") ? 1 : 0);
