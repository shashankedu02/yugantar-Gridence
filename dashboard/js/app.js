/**
 * MonsoonTwin dashboard application orchestrator.
 * W2-owned module. Single entry point that wires all W2 modules and
 * dynamically imports W3 modules (dashboard/js/ui/) with clean fallbacks.
 *
 * W3 contract (dashboard/README.md):
 *   ui/banner.js  → renderModelBanner(el, model)
 *   ui/legend.js  → renderLegend(el, {channel, unit, min, max, ramp})
 *   ui/charts.js  → renderSeries(el, {labels, series:[{name,values}], unit})
 *                   renderEnergyByDistance(el, {distances, baseline, scenario})
 *   ui/impact.js  → renderImpactCards(el, indicators:[{id,label,value,unit,status,note,isProxy}])
 */

import { CHANNELS, DEFAULT_STEPS, GRID, SHOCK_PRESETS, getApiBaseUrl } from "./config.js";
import { api, ApiError } from "./api.js";
import {
  createStore,
  getActiveField,
  VIEWS,
} from "./state.js";
import {
  buildPresetPerturbation,
  buildSimulatePayload,
  createZeroPerturbation,
  isZeroPerturbation,
} from "./scenario.js";
import {
  renderMapCanvas,
  bindCanvasInteractions,
  bindTimelineControls,
  formatHoverReadout,
  getFieldRange,
  getChannelSpec,
} from "./render.js";

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------
const store = createStore();

// ---------------------------------------------------------------------------
// W3 dynamic imports with W2 fallbacks
// ---------------------------------------------------------------------------
let w3Banner = null;
let w3Legend = null;
let w3Charts = null;
let w3Impact = null;

async function loadW3Modules() {
  await Promise.allSettled([
    import("./ui/banner.js").then((m) => { w3Banner = m; }).catch(() => {}),
    import("./ui/legend.js").then((m) => { w3Legend = m; }).catch(() => {}),
    import("./ui/charts.js").then((m) => { w3Charts = m; }).catch(() => {}),
    import("./ui/impact.js").then((m) => { w3Impact = m; }).catch(() => {}),
  ]);
}

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const els = {
  apiInput: document.getElementById("api-base-input"),
  apiApplyBtn: document.getElementById("api-apply-btn"),
  statusDot: document.getElementById("api-status-dot"),
  statusText: document.getElementById("api-status-text"),
  queuePill: document.getElementById("queue-status-pill"),
  modelBanner: document.getElementById("model-banner"),
  unvalidatedBadge: document.getElementById("unvalidated-badge"),
  syntheticBadge: document.getElementById("synthetic-badge"),
  errorBanner: document.getElementById("error-banner"),
  errorText: document.getElementById("error-banner-text"),
  errorDismiss: document.getElementById("error-dismiss-btn"),
  caseSelect: document.getElementById("case-select"),
  scenarioControls: document.getElementById("scenario-controls"),
  runBtn: document.getElementById("run-btn"),
  clearShockBtn: document.getElementById("clear-shock-btn"),
  variableSelector: document.getElementById("variable-selector"),
  mapCanvas: document.getElementById("map-canvas"),
  hoverReadout: document.getElementById("map-hover-readout"),
  legendContainer: document.getElementById("legend-container"),
  playBtn: document.getElementById("play-btn"),
  daySlider: document.getElementById("day-slider"),
  dayLabel: document.getElementById("day-label"),
  metaSummary: document.getElementById("meta-summary"),
  impactContainer: document.getElementById("impact-container"),
  seriesChartContainer: document.getElementById("series-chart-container"),
  energyChartContainer: document.getElementById("energy-chart-container"),
  runLog: document.getElementById("run-log"),
};

// ---------------------------------------------------------------------------
// Error / status helpers
// ---------------------------------------------------------------------------
function showError(msg) {
  if (els.errorText) els.errorText.textContent = msg;
  if (els.errorBanner) els.errorBanner.classList.remove("hidden");
}

function clearError() {
  if (els.errorText) els.errorText.textContent = "";
  if (els.errorBanner) els.errorBanner.classList.add("hidden");
}

function setStatus(state, text) {
  if (els.statusDot) {
    els.statusDot.className = `mt-dot${state ? " " + state : ""}`;
  }
  if (els.statusText) els.statusText.textContent = text;
}

// ---------------------------------------------------------------------------
// W2 fallback banner rendering (used when ui/banner.js is absent)
// ---------------------------------------------------------------------------
function renderFallbackModelBanner(el, model) {
  if (!el) return;
  const mode = model?.mode || "unknown";
  const validated = Boolean(model?.validated);

  if (els.unvalidatedBadge) {
    els.unvalidatedBadge.classList.toggle("hidden", validated);
  }

  const parts = [];
  if (mode === "persistence") {
    parts.push(
      `<div class="mt-banner mt-banner-warn"><strong>Placeholder forecast: the last day repeated. Not a model.</strong><span class="mt-mono">model: ${model?.name ?? "unknown"}</span></div>`
    );
  }
  if (!validated) {
    parts.push(
      `<div class="mt-banner mt-banner-warn"><span>Model validation status: <strong>Unvalidated</strong> (checkpoint not yet passed).</span><span class="mt-badge mt-badge-unvalidated">Unvalidated</span></div>`
    );
  }
  if (model?.card) {
    parts.push(`<div class="mt-banner"><span>Model card: ${model.card}</span></div>`);
  }
  el.innerHTML = parts.join("");
}

function renderModelBannerEl(model) {
  if (w3Banner?.renderModelBanner) {
    try {
      w3Banner.renderModelBanner(els.modelBanner, model);
      return;
    } catch {
      // Fall through to W2 fallback.
    }
  }
  renderFallbackModelBanner(els.modelBanner, model);
}

// ---------------------------------------------------------------------------
// W2 fallback legend rendering
// ---------------------------------------------------------------------------
function renderFallbackLegend(el, { channel, unit, min, max, ramp }) {
  if (!el) return;
  el.innerHTML = `<span class="mt-mono mt-muted" style="font-size:12px;">${channel} · ${unit} · [${min}, ${max}] · ramp:${ramp}</span>`;
}

function renderLegendEl({ channel, unit, min, max, ramp }) {
  if (w3Legend?.renderLegend) {
    try {
      w3Legend.renderLegend(els.legendContainer, { channel, unit, min, max, ramp });
      return;
    } catch {
      // Fall through.
    }
  }
  renderFallbackLegend(els.legendContainer, { channel, unit, min, max, ramp });
}

// ---------------------------------------------------------------------------
// W2 fallback charts
// ---------------------------------------------------------------------------
function renderFallbackSeries(el, { labels, series, unit }) {
  if (!el) return;
  if (!Array.isArray(series) || series.length === 0) {
    el.textContent = "No time series data.";
    return;
  }
  const rows = series.map((s) => {
    const vals = (s.values || []).map((v) =>
      Number.isFinite(v) ? v.toFixed(2) : "—"
    ).join(", ");
    return `${s.name}: [${vals}]`;
  });
  el.innerHTML = `<pre class="mt-mono" style="font-size:11px;overflow:auto;max-height:120px;">${rows.join("\n")}\nunit: ${unit}</pre>`;
}

function renderFallbackEnergyByDistance(el, { distances, baseline, scenario }) {
  if (!el) return;
  if (!Array.isArray(distances) || distances.length === 0) {
    el.textContent = "No energy-by-distance data.";
    return;
  }
  const rows = distances.map((d, i) =>
    `d=${d.toFixed(0)} km  base=${Number.isFinite(baseline?.[i]) ? baseline[i].toFixed(3) : "—"}  scen=${Number.isFinite(scenario?.[i]) ? scenario[i].toFixed(3) : "—"}`
  );
  el.innerHTML = `<pre class="mt-mono" style="font-size:11px;overflow:auto;max-height:80px;">${rows.join("\n")}</pre>`;
}

function renderSeriesChartEl(data) {
  if (w3Charts?.renderSeries) {
    try { w3Charts.renderSeries(els.seriesChartContainer, data); return; } catch {}
  }
  renderFallbackSeries(els.seriesChartContainer, data);
}

function renderEnergyChartEl(data) {
  if (w3Charts?.renderEnergyByDistance) {
    try { w3Charts.renderEnergyByDistance(els.energyChartContainer, data); return; } catch {}
  }
  renderFallbackEnergyByDistance(els.energyChartContainer, data);
}

// ---------------------------------------------------------------------------
// W2 fallback impact cards
// ---------------------------------------------------------------------------
function renderFallbackImpactCards(el, indicators) {
  if (!el) return;
  if (!Array.isArray(indicators) || indicators.length === 0) {
    el.textContent = "No impact indicators.";
    return;
  }
  const html = indicators.map((ind) => {
    const badge = ind.isProxy ? ` <span class="mt-badge mt-badge-unvalidated">proxy</span>` : "";
    const statusColor = ind.status === "elevated" ? "var(--mt-amber)" : ind.status === "critical" ? "var(--mt-danger)" : "var(--mt-teal)";
    return `<div style="margin-bottom:6px;"><strong style="color:${statusColor}">${ind.label}:</strong> ${Number.isFinite(Number(ind.value)) ? Number(ind.value).toFixed(2) : ind.value} ${ind.unit}${badge}${ind.note ? ` <span class="mt-muted">(${ind.note})</span>` : ""}</div>`;
  }).join("");
  el.innerHTML = html;
}

function renderImpactCardsEl(indicators) {
  if (w3Impact?.renderImpactCards) {
    try { w3Impact.renderImpactCards(els.impactContainer, indicators); return; } catch {}
  }
  renderFallbackImpactCards(els.impactContainer, indicators);
}

// ---------------------------------------------------------------------------
// Meta summary (W2-owned, right rail)
// ---------------------------------------------------------------------------
function renderMetaSummary(meta) {
  if (!els.metaSummary) return;
  if (!meta) {
    els.metaSummary.textContent = "No metadata available.";
    return;
  }
  const lsm = meta.land_sea_mask === null ? "null (coastline unavailable)" : "loaded";
  const oro = meta.orography_m === null ? "null" : "loaded";
  const std = Array.isArray(meta.channel_std) ? "6 channels" : "null";
  const card = meta.model?.card == null ? "null" : "present";
  const lines = [
    `model: ${meta.model?.name ?? "unknown"} (${meta.model?.mode ?? "?"})`,
    `validated: ${Boolean(meta.model?.validated)}`,
    `grid: ${meta.grid?.lat?.length ?? 0} lat × ${meta.grid?.lon?.length ?? 0} lon`,
    `channel_std: ${std}`,
    `land_sea_mask: ${lsm}`,
    `orography_m: ${oro}`,
    `model_card: ${card}`,
  ];
  els.metaSummary.textContent = lines.join("\n");
  els.metaSummary.style.whiteSpace = "pre-line";
}

// ---------------------------------------------------------------------------
// Case select
// ---------------------------------------------------------------------------
function populateCaseSelect() {
  if (!els.caseSelect) return;
  const state = store.getState();
  els.caseSelect.innerHTML = "";
  for (const c of state.cases) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.label || c.id;
    els.caseSelect.appendChild(opt);
  }
  if (state.activeCase) els.caseSelect.value = state.activeCase.id;
}

// ---------------------------------------------------------------------------
// Variable selector
// ---------------------------------------------------------------------------
function buildVariableSelector() {
  if (!els.variableSelector) return;
  els.variableSelector.innerHTML = "";
  CHANNELS.forEach((ch, i) => {
    const btn = document.createElement("button");
    btn.className = "mt-btn mt-tab";
    btn.type = "button";
    btn.dataset.channelIndex = String(i);
    btn.textContent = ch.label;
    btn.setAttribute("aria-pressed", i === 0 ? "true" : "false");
    btn.addEventListener("click", () => {
      store.setChannelIndex(i);
    });
    els.variableSelector.appendChild(btn);
  });
}

function syncVariableSelector(state) {
  if (!els.variableSelector) return;
  const btns = els.variableSelector.querySelectorAll("[data-channel-index]");
  btns.forEach((btn) => {
    const idx = Number(btn.dataset.channelIndex);
    btn.setAttribute("aria-pressed", idx === state.channelIndex ? "true" : "false");
  });
}

// ---------------------------------------------------------------------------
// Scenario controls
// ---------------------------------------------------------------------------
function buildScenarioControls() {
  if (!els.scenarioControls) return;
  const state = store.getState();

  els.scenarioControls.innerHTML = "";

  // Steps control
  const stepsRow = document.createElement("div");
  stepsRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;";
  const stepsLabel = document.createElement("label");
  stepsLabel.className = "mt-muted";
  stepsLabel.htmlFor = "steps-input";
  stepsLabel.textContent = "Steps:";
  const stepsInput = document.createElement("input");
  stepsInput.id = "steps-input";
  stepsInput.type = "number";
  stepsInput.className = "mt-input mt-mono";
  stepsInput.min = "1";
  stepsInput.max = "30";
  stepsInput.value = String(state.steps);
  stepsInput.style.width = "72px";
  stepsInput.addEventListener("change", () => store.setSteps(Number(stepsInput.value)));
  stepsRow.appendChild(stepsLabel);
  stepsRow.appendChild(stepsInput);
  els.scenarioControls.appendChild(stepsRow);

  // Preset buttons
  const presetsLabel = document.createElement("p");
  presetsLabel.className = "mt-muted";
  presetsLabel.style.margin = "0 0 6px";
  presetsLabel.textContent = "Shock preset:";
  els.scenarioControls.appendChild(presetsLabel);

  const presetsRow = document.createElement("div");
  presetsRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;";

  const noneBtn = document.createElement("button");
  noneBtn.className = "mt-btn mt-tab";
  noneBtn.type = "button";
  noneBtn.dataset.presetId = "none";
  noneBtn.textContent = "None / Clear";
  noneBtn.setAttribute("aria-pressed", "true");
  noneBtn.addEventListener("click", () => {
    store.setShock("none", null);
    store.clearScenarioResult();
  });
  presetsRow.appendChild(noneBtn);

  for (const preset of Object.values(SHOCK_PRESETS)) {
    const btn = document.createElement("button");
    btn.className = "mt-btn mt-tab";
    btn.type = "button";
    btn.dataset.presetId = preset.id;
    btn.title = preset.description;
    btn.textContent = preset.label;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      const st = store.getState();
      try {
        const pert = buildPresetPerturbation(preset.id, st.activeCase.init_states, st.meta?.grid || null);
        store.setShock(preset.id, pert);
        store.clearScenarioResult();
      } catch (err) {
        showError(`Preset error: ${err.message}`);
      }
    });
    presetsRow.appendChild(btn);
  }

  els.scenarioControls.appendChild(presetsRow);
}

function syncScenarioControls(state) {
  if (!els.scenarioControls) return;
  const btns = els.scenarioControls.querySelectorAll("[data-preset-id]");
  btns.forEach((btn) => {
    const isActive = btn.dataset.presetId === state.shock.presetId;
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  const stepsInput = document.getElementById("steps-input");
  if (stepsInput && document.activeElement !== stepsInput) {
    stepsInput.value = String(state.steps);
  }
}

// ---------------------------------------------------------------------------
// View tabs (baseline / scenario / difference)
// ---------------------------------------------------------------------------
function wireViewTabs() {
  document.querySelectorAll(".mt-tab[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      if (!VIEWS.includes(view)) return;
      const state = store.getState();
      // Disallow switching to scenario/difference if no data
      if (view === "scenario" && !state.scenario?.rollout) return;
      if (view === "difference" && !state.difference) return;
      store.setView(view);
    });
  });
}

function syncViewTabs(state) {
  document.querySelectorAll(".mt-tab[data-view]").forEach((btn) => {
    const view = btn.dataset.view;
    const isActive = view === state.view;
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    // Disable scenario/difference tabs if no data
    if (view === "scenario") btn.disabled = !state.scenario?.rollout;
    if (view === "difference") btn.disabled = !state.difference;
  });
}

// ---------------------------------------------------------------------------
// Map rendering
// ---------------------------------------------------------------------------
let _hoverCell = null;

function redrawMap(state) {
  const field = getActiveField(state);
  renderMapCanvas(els.mapCanvas, {
    field,
    channelIndex: state.channelIndex,
    view: state.view,
    meta: state.meta,
    perturbation: state.shock?.perturbation || null,
    selectedCell: state.selectedCell,
    hoverCell: _hoverCell,
    showIsobars: state.channelIndex === 4, // msl
  });

  // Legend
  const range = getFieldRange(state.channelIndex, state.view, state.meta);
  renderLegendEl(range);
}

// ---------------------------------------------------------------------------
// Cell time-series chart for selected cell
// ---------------------------------------------------------------------------
function renderCellSeries(state) {
  if (!state.selectedCell) {
    if (els.seriesChartContainer) els.seriesChartContainer.textContent = "Click a grid cell to inspect its rollout.";
    return;
  }
  const { row, col } = state.selectedCell;
  const ch = state.channelIndex;
  const spec = getChannelSpec(ch, state.meta);
  const labels = [];
  const baseVals = [];
  const scenVals = [];

  const steps = state.baseline?.rollout?.length || 0;
  for (let d = 0; d < steps; d++) {
    labels.push(`Day ${d + 1}`);
    baseVals.push(state.baseline?.rollout?.[d]?.[ch]?.[row]?.[col] ?? NaN);
    scenVals.push(state.scenario?.rollout?.[d]?.[ch]?.[row]?.[col] ?? NaN);
  }

  if (steps === 0) {
    if (els.seriesChartContainer) els.seriesChartContainer.textContent = "Run a simulation to see time series.";
    return;
  }

  const series = [{ name: "Baseline", values: baseVals }];
  if (state.scenario?.rollout) series.push({ name: "Scenario", values: scenVals });
  renderSeriesChartEl({ labels, series, unit: spec.unit });
}

// ---------------------------------------------------------------------------
// Shock energy by distance (naive radial aggregation)
// ---------------------------------------------------------------------------
function renderEnergyChart(state) {
  if (!state.difference || !state.shock?.perturbation) {
    if (els.energyChartContainer) els.energyChartContainer.textContent = "Run baseline + scenario to inspect shock spread.";
    return;
  }

  const pert = state.shock.perturbation;
  // Find shock centroid in grid coords
  let sumR = 0; let sumC = 0; let n = 0;
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      for (let ch = 0; ch < 6; ch++) {
        if (pert[ch]?.[r]?.[c] !== 0) { sumR += r; sumC += c; n++; break; }
      }
    }
  }
  if (n === 0) return;
  const centR = sumR / n;
  const centC = sumC / n;

  const maxDist = 20; // cells
  const distances = [];
  const baseline = [];
  const scenario = [];

  for (let d = 0; d <= maxDist; d++) {
    distances.push(d * 111); // ~111 km per degree
    let bEnergy = 0; let sEnergy = 0; let cnt = 0;
    for (let r = 0; r < GRID.rows; r++) {
      for (let c = 0; c < GRID.cols; c++) {
        const dist = Math.sqrt((r - centR) ** 2 + (c - centC) ** 2);
        if (Math.abs(dist - d) > 0.5) continue;
        const diff = state.difference?.[state.dayIndex];
        if (!diff) continue;
        let bEn = 0; let sEn = 0;
        for (let ch = 0; ch < 6; ch++) {
          const dv = diff?.[ch]?.[r]?.[c] ?? 0;
          sEn += dv * dv;
        }
        bEnergy += 0;
        sEnergy += sEn;
        cnt++;
      }
    }
    baseline.push(cnt > 0 ? bEnergy / cnt : 0);
    scenario.push(cnt > 0 ? sEnergy / cnt : 0);
  }

  renderEnergyChartEl({ distances, baseline, scenario });
}

// ---------------------------------------------------------------------------
// Impact cards
// ---------------------------------------------------------------------------
function renderImpact(state) {
  if (!state.baseline?.rollout) {
    if (els.impactContainer) els.impactContainer.textContent = "Waiting for rollout / climatology.";
    return;
  }

  const ch_tp = 1; // tp channel
  const rollout = state.baseline.rollout;
  const steps = rollout.length;
  let totalRain = 0; let n = 0;
  for (let d = 0; d < steps; d++) {
    for (let r = 0; r < GRID.rows; r++) {
      for (let c = 0; c < GRID.cols; c++) {
        const v = rollout[d]?.[ch_tp]?.[r]?.[c];
        if (Number.isFinite(v)) { totalRain += v; n++; }
      }
    }
  }
  const meanRain = n > 0 ? totalRain / n : 0;

  const indicators = [
    {
      id: "mean_tp",
      label: "Mean Precipitation",
      value: meanRain.toFixed(2),
      unit: "mm/day",
      status: meanRain > 5 ? "elevated" : "nominal",
      note: "domain-mean across rollout days",
      isProxy: true,
    },
  ];

  if (state.difference) {
    let diffMeanT = 0; let dn = 0;
    const diff = state.difference;
    for (let d = 0; d < diff.length; d++) {
      for (let r = 0; r < GRID.rows; r++) {
        for (let c = 0; c < GRID.cols; c++) {
          const v = diff[d]?.[0]?.[r]?.[c]; // t2m diff
          if (Number.isFinite(v)) { diffMeanT += v; dn++; }
        }
      }
    }
    indicators.push({
      id: "mean_t2m_diff",
      label: "Mean ΔT2m (scenario−baseline)",
      value: dn > 0 ? (diffMeanT / dn).toFixed(3) : "—",
      unit: "K",
      status: "nominal",
      note: "domain-mean temperature anomaly",
      isProxy: true,
    });
  }

  renderImpactCardsEl(indicators);
}

// ---------------------------------------------------------------------------
// Run log
// ---------------------------------------------------------------------------
function renderRunLog(state) {
  if (!els.runLog) return;
  if (!state.runLog || state.runLog.length === 0) {
    els.runLog.textContent = "No runs yet.";
    return;
  }
  els.runLog.innerHTML = state.runLog
    .map(
      (entry) =>
        `<div>${entry.time} · <strong>${entry.type}</strong> · ${entry.steps} steps · ${entry.inferenceMs ?? "?"}ms` +
        (entry.error ? ` · <span style="color:var(--mt-danger)">${entry.error}</span>` : "") +
        `</div>`
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Synthetic badge sync
// ---------------------------------------------------------------------------
function syncSyntheticBadge(state) {
  if (!els.syntheticBadge) return;
  els.syntheticBadge.classList.toggle("hidden", !state.activeCase?.isSynthetic);
}

// ---------------------------------------------------------------------------
// Run buttons
// ---------------------------------------------------------------------------
function syncRunButtons(state) {
  const hasShock = !isZeroPerturbation(state.shock?.perturbation);
  if (els.runBtn) {
    els.runBtn.disabled = false;
    els.runBtn.textContent = hasShock ? "Run Baseline + Scenario" : "Run Simulation";
  }
  if (els.clearShockBtn) {
    els.clearShockBtn.disabled = !hasShock;
  }
}

// ---------------------------------------------------------------------------
// Master re-render on every store change
// ---------------------------------------------------------------------------
function onStoreChange(state) {
  redrawMap(state);
  syncViewTabs(state);
  syncVariableSelector(state);
  syncScenarioControls(state);
  syncSyntheticBadge(state);
  syncRunButtons(state);
  renderMetaSummary(state.meta);
  renderCellSeries(state);
  renderEnergyChart(state);
  renderImpact(state);
  renderRunLog(state);
  if (els.hoverReadout) {
    els.hoverReadout.textContent = formatHoverReadout({ cell: _hoverCell, state });
  }
}

// ---------------------------------------------------------------------------
// API: connect and load meta
// ---------------------------------------------------------------------------
async function connectAndLoadMeta() {
  clearError();
  store.setError(null);
  setStatus("loading", "Connecting…");

  let health;
  try {
    health = await api.health();
    store.setHealth(health);
    setStatus("ready", `Ready (${health.model_name})`);
  } catch (err) {
    setStatus("error", err.kind === "timeout" ? "Timeout (15 s)" : "Offline");
    showError(err.message);
    return;
  }

  try {
    const meta = await api.meta();
    store.setMeta(meta);
    renderModelBannerEl(meta.model);
    renderMetaSummary(meta);
  } catch (err) {
    showError(`/meta failed: ${err.message}`);
  }

  // Attempt climatology (503 is expected; handled gracefully)
  try {
    const state = store.getState();
    const payload = {
      init_states: state.activeCase?.init_states,
      doy_sincos: state.activeCase?.doy_sincos,
    };
    const clim = await api.climatology(payload);
    store.setClimatology(clim);
  } catch (err) {
    if (err.status === 503) {
      if (els.metaSummary) {
        const extra = document.createElement("div");
        extra.className = "mt-muted";
        extra.style.marginTop = "6px";
        extra.textContent = "Climatology unavailable (503): anomaly views disabled.";
        if (els.metaSummary.parentNode) els.metaSummary.parentNode.appendChild(extra);
      }
    } else {
      showError(`/climatology: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Run simulation
// ---------------------------------------------------------------------------
async function runSimulation() {
  clearError();
  const state = store.getState();
  const hasShock = !isZeroPerturbation(state.shock?.perturbation);
  const t0 = Date.now();

  if (els.runBtn) els.runBtn.disabled = true;

  // Baseline
  let baselinePayload;
  try {
    baselinePayload = buildSimulatePayload({
      activeCase: state.activeCase,
      steps: state.steps,
      perturbation: null,
    });
  } catch (err) {
    showError(`Payload error: ${err.message}`);
    if (els.runBtn) els.runBtn.disabled = false;
    return;
  }

  let baselineResult;
  try {
    const res = await api.simulate(baselinePayload);
    baselineResult = { rollout: res.rollout, inferenceMs: res.inference_ms ?? null };
    store.setBaselineResult(baselineResult);
    store.appendRunLog({
      time: new Date().toLocaleTimeString(),
      type: "baseline",
      steps: state.steps,
      inferenceMs: baselineResult.inferenceMs,
    });
  } catch (err) {
    const msg = formatApiError("Baseline /simulate failed", err);
    showError(msg);
    store.appendRunLog({
      time: new Date().toLocaleTimeString(),
      type: "baseline",
      steps: state.steps,
      error: err.message,
    });
    if (els.runBtn) els.runBtn.disabled = false;
    return;
  }

  // Scenario (only if shock is active)
  if (hasShock) {
    let scenarioPayload;
    try {
      scenarioPayload = buildSimulatePayload({
        activeCase: state.activeCase,
        steps: state.steps,
        perturbation: state.shock.perturbation,
      });
    } catch (err) {
      showError(`Scenario payload error: ${err.message}`);
      if (els.runBtn) els.runBtn.disabled = false;
      return;
    }

    try {
      const res = await api.simulate(scenarioPayload);
      const scenarioResult = { rollout: res.rollout, inferenceMs: res.inference_ms ?? null };
      store.setScenarioResult(scenarioResult);
      store.appendRunLog({
        time: new Date().toLocaleTimeString(),
        type: "scenario",
        steps: state.steps,
        inferenceMs: scenarioResult.inferenceMs,
        preset: state.shock.presetId,
      });
    } catch (err) {
      const msg = formatApiError("Scenario /simulate failed", err);
      showError(msg);
      store.appendRunLog({
        time: new Date().toLocaleTimeString(),
        type: "scenario",
        steps: state.steps,
        error: err.message,
      });
    }
  }

  if (els.runBtn) els.runBtn.disabled = false;
}

function formatApiError(prefix, err) {
  if (err.kind === "timeout") return `${prefix}: request timed out after 15 s.`;
  if (err.kind === "network") return `${prefix}: network error — ${err.message}`;
  if (err.kind === "validation") return `${prefix}: 422 Validation — ${err.message}`;
  if (err.kind === "unavailable") return `${prefix}: 503 Service unavailable — ${err.message}`;
  if (err.kind === "bad_json") return `${prefix}: 400 Bad request — ${err.message}`;
  return `${prefix}: ${err.message}`;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function init() {
  // Load W3 modules concurrently (non-blocking; fallbacks used if absent)
  loadW3Modules();

  // Populate UI structure before API calls
  buildVariableSelector();
  buildScenarioControls();
  populateCaseSelect();
  wireViewTabs();

  // Sync initial state
  onStoreChange(store.getState());

  // Store subscription
  store.subscribe(onStoreChange);

  // Timeline controls
  bindTimelineControls(
    { sliderEl: els.daySlider, labelEl: els.dayLabel, playBtn: els.playBtn },
    store
  );

  // Canvas hover / click
  bindCanvasInteractions(els.mapCanvas, {
    onHover: (cell) => {
      _hoverCell = cell;
      if (els.hoverReadout) {
        els.hoverReadout.textContent = formatHoverReadout({ cell, state: store.getState() });
      }
      redrawMap(store.getState());
    },
    onClick: (cell) => {
      store.setSelectedCell(cell);
    },
  });

  // API base URL controls
  if (els.apiInput) els.apiInput.value = getApiBaseUrl();
  if (els.apiApplyBtn) {
    els.apiApplyBtn.addEventListener("click", () => {
      if (els.apiInput) api.setBaseUrl(els.apiInput.value);
      connectAndLoadMeta();
    });
  }

  // Error dismiss
  if (els.errorDismiss) els.errorDismiss.addEventListener("click", clearError);

  // Case select
  if (els.caseSelect) {
    els.caseSelect.addEventListener("change", () => {
      store.selectCase(els.caseSelect.value);
    });
  }

  // Run button
  if (els.runBtn) {
    els.runBtn.addEventListener("click", () => runSimulation());
  }

  // Clear shock button
  if (els.clearShockBtn) {
    els.clearShockBtn.addEventListener("click", () => {
      store.setShock("none", null);
      store.clearScenarioResult();
    });
  }

  // Queue status pill
  api.queue.subscribe(({ inFlight, pendingCount, currentTaskName }) => {
    if (!els.queuePill) return;
    if (!inFlight && pendingCount === 0) {
      els.queuePill.classList.add("hidden");
    } else {
      els.queuePill.classList.remove("hidden");
      els.queuePill.textContent = `Queue: ${currentTaskName || "busy"} (+${pendingCount} waiting)`;
    }
  });

  // Initial connection
  await connectAndLoadMeta();
}

init();
