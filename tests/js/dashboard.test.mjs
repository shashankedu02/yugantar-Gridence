// Dashboard unit tests. Run from the repo root:  node --test tests/js/
// All data here is synthetic and only exercises code paths.
import test from "node:test";
import assert from "node:assert/strict";

import { ApiError, MonsoonApiClient } from "../../dashboard/js/api.js";
import { createStore, buildSyntheticCase } from "../../dashboard/js/state.js";
import { buildPresetPerturbation, buildSimulatePayload } from "../../dashboard/js/scenario.js";
import { loadCases } from "../../dashboard/js/cases.js";

const grid = (v) => Array.from({ length: 32 }, () => new Array(36).fill(v));
export const rollout = (steps, v = 1) => Array.from({ length: steps }, () => Array.from({ length: 6 }, () => grid(v)));

function reply(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status < 400,
    status,
    statusText: "",
    headers: { get: (k) => headers[k] ?? null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}
const client = (fetchImpl, timeoutMs = 2000) => new MonsoonApiClient({ baseUrl: "http://x", fetchImpl, timeoutMs });

test("simulate reports which model answered, from the response headers", async () => {
  const api = client(async () => reply({ rollout: rollout(2), inference_ms: 1 }, {
    headers: { "X-MonsoonTwin-Model": "m1", "X-MonsoonTwin-Fallback": "whole-request-fallback" },
  }));
  const res = await api.simulate({ steps: 2 });
  assert.deepEqual(res.servedBy, { model: "m1", fallback: "whole-request-fallback" });
});

test("climatology sends steps", async () => {
  let sent;
  const api = client(async (_u, init) => { sent = JSON.parse(init.body); return reply({ climatology: rollout(3) }); });
  await api.climatology({ doy_sincos: [0, 1], steps: 3 });
  assert.deepEqual(sent, { doy_sincos: [0, 1], steps: 3 });
});

for (const [name, body] of [
  ["wrong number of days", { rollout: rollout(1) }],
  ["a null value", { rollout: (() => { const r = rollout(2); r[1][2][3][4] = null; return r; })() }],
  ["a missing channel", { rollout: rollout(2).map((d) => d.slice(0, 5)) }],
  ["no rollout", {}],
]) {
  test(`a response with ${name} is refused, never drawn`, async () => {
    await assert.rejects(client(async () => reply(body)).simulate({ steps: 2 }),
      (e) => e instanceof ApiError && e.kind === "bad_response");
  });
}

test("non-JSON, HTTP errors and network errors are classified", async () => {
  await assert.rejects(client(async () => reply("<html>")).health(), (e) => e.kind === "bad_json");
  await assert.rejects(client(async () => reply({ error: "no" }, { status: 422 })).health(), (e) => e.kind === "validation");
  await assert.rejects(client(async () => { throw new TypeError("refused"); }).health(), (e) => e.kind === "network");
});

test("the timeout also covers a response body that stalls", async () => {
  const api = client(async (_u, init) => ({
    ...reply({}),
    text: () => new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" })))),
  }), 50);
  await assert.rejects(api.health(), (e) => e.kind === "timeout");
});

test("requests are sent one at a time", async () => {
  let open = 0, peak = 0;
  const api = client(async () => {
    peak = Math.max(peak, ++open);
    await new Promise((r) => setTimeout(r, 10));
    open--;
    return reply({ status: "ready", model_name: "m" });
  });
  await Promise.all([api.health(), api.health(), api.health()]);
  assert.equal(peak, 1);
});

const info = (extra = {}) => ({ caseLabel: "c", steps: 2, shockLabel: null, baseline: { model: "m" }, scenario: null, comparable: true, ...extra });

test("while a run is in flight its inputs cannot change and no result is on screen", () => {
  const store = createStore();
  store.completeRun({ baseline: { rollout: rollout(2) }, info: info() });
  assert.equal(store.beginRun(), true);
  assert.equal(store.beginRun(), false, "a second run cannot start");
  const s = store.getState();
  assert.equal(s.baseline, null, "the previous result is not shown as the new one");
  store.setSteps(5);
  assert.equal(store.setShock("warm_ocean", []), false);
  assert.equal(store.selectCase("synthetic"), false);
  assert.equal(s.steps, 10);
  assert.equal(s.shock.presetId, "none");
});

test("a failed run leaves nothing on screen", () => {
  const store = createStore();
  store.beginRun();
  store.failRun();
  const s = store.getState();
  assert.equal(s.running, false);
  assert.equal(s.baseline, null);
  assert.equal(s.runInfo, null);
});

test("no difference is computed when the two forecasts are not comparable", () => {
  const store = createStore();
  const base = { rollout: rollout(2, 1) }, scen = { rollout: rollout(2, 3) };
  store.completeRun({ baseline: base, scenario: scen, info: info({ comparable: false }) });
  assert.equal(store.getState().difference, null);
  store.completeRun({ baseline: base, scenario: scen, info: info() });
  assert.equal(store.getState().difference[1][4][31][35], 2);
});

test("changing the shock removes the old scenario; changing steps or server removes every result", () => {
  const store = createStore();
  const run = () => store.completeRun({ baseline: { rollout: rollout(10) }, scenario: { rollout: rollout(10) }, info: info({ scenario: { model: "m" } }) });
  run();
  store.setShock("none", null);
  assert.ok(store.getState().baseline);
  assert.equal(store.getState().scenario, null);
  assert.equal(store.getState().difference, null);
  run();
  store.setSteps(5);
  assert.equal(store.getState().baseline, null);
  run();
  store.resetConnection();
  assert.equal(store.getState().baseline, null);
  assert.equal(store.getState().meta, null);
});

test("selecting another case drops the preset delta built from the previous case", () => {
  const store = createStore();
  const a = { ...buildSyntheticCase(), id: "a", label: "A" }, b = { ...buildSyntheticCase(), id: "b", label: "B" };
  store.setCases([a, b]);
  store.setShock("warm_ocean", buildPresetPerturbation("warm_ocean", a.init_states));
  store.selectCase("b");
  assert.equal(store.getState().shock.perturbation, null);
});

test("a request payload is a copy: later edits do not change it", () => {
  const c = buildSyntheticCase();
  const delta = buildPresetPerturbation("monsoon_stall", c.init_states);
  const payload = buildSimulatePayload({ activeCase: c, steps: 4, perturbation: delta });
  delta[2][5][2] = 999;
  c.init_states[2][2][5][2] = 999;
  assert.notEqual(payload.perturbation[2][5][2], 999);
  assert.notEqual(payload.init_states[2][2][5][2], 999);
});

test("the case loader keeps valid cases and reports the rest", async () => {
  const good = { id: "g", label: "G", doy_sincos: [0, 1], init_states: buildSyntheticCase().init_states };
  const files = { "cases/index.json": { cases: ["good.json", "bad.json", "../x.json", "gone.json"] }, "cases/good.json": good, "cases/bad.json": { id: "b" } };
  const { cases, problems } = await loadCases(async (url) => (url in files
    ? { ok: true, json: async () => files[url] } : { ok: false, status: 404 }));
  assert.deepEqual(cases.map((c) => c.id), ["g"]);
  assert.equal(cases[0].isSynthetic, false);
  assert.equal(problems.length, 3);
  const none = await loadCases(async () => ({ ok: false, status: 404 }));
  assert.equal(none.cases.length, 0);
});
