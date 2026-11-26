// Takes the brief's figure from the running system: live server, demo case, a custom rain shock.
//   node tools/brief_figure.mjs      (set PYTHON if needed)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openBrowser, ROOT, sleep, startApi, startWeb, stop } from "../tests/e2e/harness.mjs";

const API = 8181, WEB = 5581;
const dap = await startApi(API), web = await startWeb(WEB), b = await openBrowser(9481);
try {
  await b.viewport(1366, 768);
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("monsoontwin.apiBaseUrl", "http://127.0.0.1:${API}")` });
  await b.goto(`http://127.0.0.1:${WEB}/index.html`);
  await b.waitFor(async () => (await b.text("api-status-text")).startsWith("Ready"), "connection");
  const set = (id, v) => b.eval(`(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(String(v))}; e.dispatchEvent(new Event("change")); })()`);
  await set("case-select", "monsoon-active");
  for (const [id, v] of Object.entries({ "custom-channel": 1, "custom-op": "add", "custom-value": 40, "custom-shape": "smooth", "custom-lat": 22.5, "custom-lon": 78.5, "custom-radius": 3 })) await set(id, v);
  await b.click("#custom-add");
  await b.click("#run-btn"); await sleep(300);
  await b.waitFor(async () => !(await b.disabled("#run-btn")), "the run");
  await b.click('.mt-tab[data-view="difference"]');
  await b.click('[data-channel-index="1"]');
  await b.eval(`window.scrollTo(0, 0)`); await sleep(500);
  const shot = await b.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(ROOT, "docs", "brief", "figure-dashboard.png"), Buffer.from(shot.data, "base64"));
  console.log(await b.text("result-provenance"));
  console.log((await b.text("impact-container")).replace(/\s+/g, " ").slice(0, 600));
} finally {
  await b.close(); await stop(web); await stop(dap);
}
process.exit(0);
