// Browser-test harness using only Node built-ins and a locally installed Edge or Chrome (DevTools protocol).
// Starts real servers from this checkout. All inputs are the dashboard's own cases or synthetic test input.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SHOTS = join(tmpdir(), "monsoontwin-e2e");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PYTHON = process.env.PYTHON || "python";
const BROWSERS = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const children = new Set();
process.on("exit", () => { for (const c of children) c.kill(); });

function start(cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, stdio: "ignore", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  children.add(child);
  return child;
}

export async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const gone = new Promise((r) => child.once("exit", r));
  child.kill();
  await gone;
  children.delete(child);
}

async function waitFor(fn, what, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await fn()) return; } catch {}
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${what}`);
}

export async function startApi(port, tree = ROOT) {
  const child = start(PYTHON, ["serve.py", "--port", String(port)], tree);
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/health`, { method: "POST" })).ok, `API on ${port}`, 90000);
  return child;
}

/** A copy of the server with no weights: the placeholder persistence forecast. */
export function placeholderTree() {
  const dir = mkdtempSync(join(tmpdir(), "mt-placeholder-"));
  cpSync(join(ROOT, "serve.py"), join(dir, "serve.py"));
  cpSync(join(ROOT, "twin"), join(dir, "twin"), { recursive: true });
  mkdirSync(join(dir, "weights"));
  return dir;
}

/** A copy of this checkout whose LocalNet checkpoint is damaged: the real server must fall back to DAP. */
export function dapFallbackTree() {
  const dir = mkdtempSync(join(tmpdir(), "mt-dapfallback-"));
  cpSync(join(ROOT, "serve.py"), join(dir, "serve.py"));
  cpSync(join(ROOT, "twin"), join(dir, "twin"), { recursive: true });
  cpSync(join(ROOT, "weights"), join(dir, "weights"), { recursive: true });
  const ckpt = join(dir, "weights", "localnet.pt");
  const bytes = readFileSync(ckpt);
  bytes[bytes.length >> 1] ^= 1;
  writeFileSync(ckpt, bytes);
  return dir;
}

export async function startWeb(port) {
  const child = start(PYTHON, ["-m", "http.server", String(port), "--bind", "127.0.0.1", "-d", "dashboard"], ROOT);
  await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/index.html`)).ok, "dashboard server");
  return child;
}

/** Forwards to a real server but reports another model for shocked forecasts, to test the comparability guard. */
export function startMislabellingProxy(port, target, extraHeaders = { "x-monsoontwin-fallback": "whole-request-fallback" }) {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      let shocked = false;
      try { shocked = JSON.parse(body.toString()).perturbation != null; } catch {}
      const up = httpRequest({ host: "127.0.0.1", port: target, path: req.url, method: req.method, headers: req.headers }, (r) => {
        const headers = { ...r.headers };
        if (shocked) Object.assign(headers, extraHeaders);
        res.writeHead(r.statusCode, headers);
        r.pipe(res);
      });
      up.end(body);
    });
  });
  return new Promise((r) => server.listen(port, "127.0.0.1", () => r(server)));
}

export async function openBrowser(debugPort) {
  const exe = BROWSERS.find((p) => existsSync(p));
  if (!exe) throw new Error("No Edge or Chrome found. Set the BROWSER environment variable to its path.");
  mkdirSync(SHOTS, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "mt-profile-"));
  const proc = start(exe, ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--disable-extensions", "--disable-background-networking", "about:blank"], ROOT);
  let target;
  await waitFor(async () => {
    target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((t) => t.type === "page");
    return target;
  }, "the browser");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const log = { console: [], exceptions: [], requests: new Map() };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); return; }
    const p = m.params;
    if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(p.type)) {
      log.console.push(`${p.type}: ${p.args.map((a) => a.value ?? a.description).join(" ")}`);
    }
    if (m.method === "Log.entryAdded" && p.entry.level === "error") log.console.push(`${p.entry.text} ${p.entry.url || ""}`);
    if (m.method === "Runtime.exceptionThrown") log.exceptions.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
    if (m.method === "Network.requestWillBeSent") {
      log.requests.set(p.requestId, { url: p.request.url, method: p.request.method, body: p.request.postData, status: null });
    }
    if (m.method === "Network.responseReceived") {
      const r = log.requests.get(p.requestId);
      if (r) r.status = p.response.status;
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  for (const d of ["Page", "Runtime", "Log", "Network"]) await send(`${d}.enable`);

  const b = {
    send, log, waitFor,
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    viewport: (width, height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }),
    latency: (ms) => send("Network.emulateNetworkConditions", { offline: false, latency: ms, downloadThroughput: -1, uploadThroughput: -1 }),
    async goto(url) { await send("Page.navigate", { url }); await sleep(600); },
    click: (sel) => b.eval(`document.querySelector(${JSON.stringify(sel)}).click()`),
    text: (elementId) => b.eval(`(document.getElementById(${JSON.stringify(elementId)})?.innerText || "").trim()`),
    disabled: (sel) => b.eval(`document.querySelector(${JSON.stringify(sel)}).disabled`),
    posts: (path) => [...log.requests.values()].filter((r) => r.method === "POST" && r.url.endsWith(path)),
    errorText: () => b.eval(`(() => { const e = document.getElementById("error-banner"); return e.classList.contains("hidden") ? "" : e.innerText; })()`),
    resetLog() { log.console.length = 0; log.exceptions.length = 0; log.requests.clear(); },
    async shot(name) {
      const r = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.data, "base64"));
    },
    async key(key, code, vk, extra = {}) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, ...extra });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, ...extra, text: undefined });
    },
    async mouse(type, x, y) {
      await send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: 1 });
    },
    async close() { try { await send("Browser.close"); } catch {} ws.close(); await stop(proc); },
  };
  return b;
}

/** Minimal test runner: every check is recorded; the process fails if any check fails. */
export function checker() {
  let failed = 0, passed = 0;
  return {
    ok(cond, name, detail = "") {
      if (cond) { passed++; console.log(`  PASS ${name}`); }
      else { failed++; console.log(`  FAIL ${name} ${detail}`); }
    },
    done(label) {
      console.log(`${label}: ${passed} passed, ${failed} failed`);
      return failed;
    },
  };
}
