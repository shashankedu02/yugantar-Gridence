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

import { CHANNELS, GRID, SHOCK_PRESETS, getApiBaseUrl } from "./config.js";
import { api, ApiError } from "./api.js";
import {
  createStore,
  getActiveField,
  VIEWS,
} from "./state.js";
import {
  buildPresetPerturbation,
  buildSimulatePayload,
  clonePerturbation,
  addShockComponent,
  isZeroPerturbation,
} from "./scenario.js";
import { loadCases } from "./cases.js";
import { energyByDistance, impactCards, impactNumbers } from "./analysis.js";
import { buildSyntheticCase } from "./state.js";
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
let w3Status = null;

async function loadW3Modules() {
  await Promise.allSettled([
    import("./ui/banner.js").then((m) => { w3Banner = m; }).catch(() => {}),
    import("./ui/legend.js").then((m) => { w3Legend = m; }).catch(() => {}),
    import("./ui/charts.js").then((m) => { w3Charts = m; }).catch(() => {}),
    import("./ui/impact.js").then((m) => { w3Impact = m; }).catch(() => {}),
    import("./ui/status.js").then((m) => { w3Status = m; }).catch(() => {}),
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
  runStatus: document.getElementById("run-status"),
  provenance: document.getElementById("result-provenance"),
  notice: document.getElementById("notice-text"),
};

/** Progress and outcome of the current run (W3 status component, plain text if it is unavailable). */
function showRunStatus(state, message) {
  if (!els.runStatus) return;
  if (!message) {
    els.runStatus.textContent = "";
    return;
  }
  if (w3Status?.renderStatus) w3Status.renderStatus(els.runStatus, { state, message });
  else els.runStatus.textContent = message;
}

function showNotice(msg) {
  if (!els.notice) return;
  els.notice.textContent = msg || "";
  els.notice.parentElement?.classList.toggle("hidden", !msg);
}

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

/** Build an element with text content only: no string from the server or a file is ever parsed as HTML. */
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
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

  el.replaceChildren();
  if (mode === "persistence") {
    el.appendChild(node("div", "mt-banner mt-banner-warn", "Placeholder forecast: the last day repeated. Not a model."));
  }
  el.appendChild(node("div", validated ? "mt-banner" : "mt-banner mt-banner-warn",
    `model: ${model?.name ?? "unknown"} · ${validated ? "validated" : "Unvalidated"}`));
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
  el.replaceChildren(node("span", "mt-mono mt-muted", `${channel} · ${unit} · [${min}, ${max}] · ramp:${ramp}`));
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
  el.replaceChildren(node("pre", "mt-mono mt-fallback-pre", `${rows.join("\n")}\nunit: ${unit}`));
}

function renderFallbackEnergyByDistance(el, { distances, scenario }) {
  if (!el) return;
  if (!Array.isArray(distances) || distances.length === 0) {
    el.textContent = "No energy-by-distance data.";
    return;
  }
  const rows = distances.map((d, i) => `${d} cells: ${Number.isFinite(scenario?.[i]) ? scenario[i].toFixed(3) : "—"}`);
  el.replaceChildren(node("pre", "mt-mono mt-fallback-pre", rows.join("\n")));
}

function renderSeriesChartEl(data) {
  if (w3Charts?.renderSeries) {
    try { w3Charts.renderSeries(els.seriesChartContainer, data); return; } catch {}
  }
  renderFallbackSeries(els.seriesChartContainer, data);
}

function renderEnergyChartEl(el, data, options) {
  if (w3Charts?.renderEnergyByDistance) {
    try { w3Charts.renderEnergyByDistance(el, data, options); return; } catch (err) { console.error(err); }
  }
  renderFallbackEnergyByDistance(el, data);
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
  el.replaceChildren(...indicators.map((ind) => node("div", "",
    `${ind.label}: ${ind.value} ${ind.unit ?? ""}${ind.isProxy ? " (proxy)" : ""}${ind.note ? ` — ${ind.note}` : ""}`)));
}

function renderImpactCardsEl(el, indicators) {
  if (w3Impact?.renderImpactCards) {
    try { w3Impact.renderImpactCards(el, indicators); return; } catch (err) { console.error(err); }
  }
  renderFallbackImpactCards(el, indicators);
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
    if (c.selection_rule) opt.title = `${c.selection_rule}. ${c.source || ""}`;
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
    btn.textContent = `${i + 1} ${ch.shortLabel}`;
    btn.title = `${ch.label} (${ch.unit})`;
    btn.setAttribute("aria-label", `${ch.label}, ${ch.unit}`);
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
      } catch (err) {
        showError(`Preset error: ${err.message}`);
      }
    });
    presetsRow.appendChild(btn);
  }

  els.scenarioControls.appendChild(presetsRow);
  buildCustomShockPanel();
}

// ---------------------------------------------------------------------------
// Custom shock: one or more components, each a physical delta on the last input day
// ---------------------------------------------------------------------------
let _picking = false;
let _components = [];

function field(labelText, control) {
  const wrap = node("label", "mt-field");
  wrap.append(node("span", "mt-muted", labelText), control);
  return wrap;
}

function numberInput(id, value, step = "any") {
  const el = node("input", "mt-input mt-mono");
  el.id = id;
  el.type = "number";
  el.step = step;
  el.value = value;
  return el;
}

function select(id, options) {
  const el = node("select", "mt-select");
  el.id = id;
  for (const [value, text] of options) {
    const o = node("option", "", text);
    o.value = value;
    el.appendChild(o);
  }
  return el;
}

function buildCustomShockPanel() {
  const box = node("details", "mt-custom");
  box.id = "custom-shock";
  box.appendChild(node("summary", "mt-btn", "Custom shock"));
  const ch = select("custom-channel", CHANNELS.map((c, i) => [String(i), `${c.shortLabel} (${c.unit})`]));
  const op = select("custom-op", [["add", "add (units)"], ["scale_pct", "change by %"]]);
  const shape = select("custom-shape", [["rectangle", "rectangle"], ["smooth", "smooth blob"]]);
  const rect = node("div", "mt-field-row");
  rect.id = "custom-rect";
  rect.append(field("Lat from °N", numberInput("custom-lat-min", "10")), field("to", numberInput("custom-lat-max", "18")),
    field("Lon from °E", numberInput("custom-lon-min", "66")), field("to", numberInput("custom-lon-max", "73")));
  const blob = node("div", "mt-field-row hidden");
  blob.id = "custom-blob";
  const pick = node("button", "mt-btn", "Pick centre on map");
  pick.type = "button";
  pick.id = "custom-pick";
  pick.setAttribute("aria-pressed", "false");
  pick.addEventListener("click", () => setPicking(!_picking));
  blob.append(field("Centre °N", numberInput("custom-lat", "15.5")), field("Centre °E", numberInput("custom-lon", "88.5")),
    field("Radius (cells)", numberInput("custom-radius", "3", "1")), pick);
  shape.addEventListener("change", () => {
    rect.classList.toggle("hidden", shape.value !== "rectangle");
    blob.classList.toggle("hidden", shape.value !== "smooth");
    if (shape.value !== "smooth") setPicking(false);
  });
  const add = node("button", "mt-btn mt-btn-primary", "Add to shock");
  add.type = "button";
  add.id = "custom-add";
  add.addEventListener("click", addCustomComponent);
  const msg = node("div", "mt-caption");
  msg.id = "custom-message";
  msg.setAttribute("role", "status");
  const list = node("ul", "mt-caption");
  list.id = "custom-list";
  box.append(field("Variable", ch), field("Operation", op), field("Size of change", numberInput("custom-value", "2")),
    field("Shape", shape), rect, blob, add, msg, list,
    node("p", "mt-muted mt-caption", "The change is added to the last input day only. Press Run to forecast it. Changes far outside real weather give unreliable forecasts."));
  els.scenarioControls.appendChild(box);
}

function setPicking(on) {
  _picking = on;
  const btn = document.getElementById("custom-pick");
  if (btn) {
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "Click a map cell…" : "Pick centre on map";
  }
}

function pickCentre(cell) {
  const meta = store.getState().meta;
  document.getElementById("custom-lat").value = String(meta?.grid?.lat?.[cell.row] ?? GRID.latMin + cell.row);
  document.getElementById("custom-lon").value = String(meta?.grid?.lon?.[cell.col] ?? GRID.lonMin + cell.col);
  setPicking(false);
}

function addCustomComponent() {
  const st = store.getState();
  if (st.running) return;
  const val = (id) => document.getElementById(id).value;
  const num = (id) => (val(id).trim() === "" ? NaN : Number(val(id)));
  const spec = {
    channelIndex: Number(val("custom-channel")), op: val("custom-op"), value: num("custom-value"), shape: val("custom-shape"),
    latMin: num("custom-lat-min"), latMax: num("custom-lat-max"), lonMin: num("custom-lon-min"), lonMax: num("custom-lon-max"),
    lat: num("custom-lat"), lon: num("custom-lon"), radiusCells: num("custom-radius"),
  };
  const msg = document.getElementById("custom-message");
  try {
    const continuing = st.shock.presetId === "custom";
    const result = addShockComponent(continuing ? st.shock.perturbation : null, st.activeCase.init_states, spec, st.meta?.grid || null);
    const ch = CHANNELS[spec.channelIndex];
    const where = spec.shape === "rectangle"
      ? `${spec.latMin}–${spec.latMax}°N, ${spec.lonMin}–${spec.lonMax}°E`
      : `smooth, centre ${spec.lat}°N ${spec.lon}°E, radius ${spec.radiusCells}`;
    const what = `${ch.shortLabel} ${spec.value > 0 ? "+" : ""}${spec.value}${spec.op === "add" ? ` ${ch.unit}` : " %"}, ${where} (${result.cells} cells)`;
    _components = continuing ? [..._components, what] : [what];
    store.setShock("custom", result.perturbation, `Custom: ${_components.join("; ")}`);
    msg.textContent = result.clampedCells
      ? `Added. In ${result.clampedCells} cells the result is outside physical limits; the server moves it to the limit.`
      : "Added. Press Run to forecast it.";
  } catch (err) {
    msg.textContent = err.message;
  }
}

function syncCustomList(state) {
  const list = document.getElementById("custom-list");
  if (!list) return;
  if (state.shock.presetId !== "custom") _components = [];
  list.replaceChildren(..._components.map((c) => node("li", "", c)));
}

function syncScenarioControls(state) {
  if (!els.scenarioControls) return;
  const btns = els.scenarioControls.querySelectorAll("[data-preset-id]");
  btns.forEach((btn) => {
    const isActive = btn.dataset.presetId === state.shock.presetId;
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  syncCustomList(state);

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
  if (state.climatology) {
    series.push({ name: "Climatology", values: labels.map((_, d) => state.climatology[d]?.[ch]?.[row]?.[col] ?? null) });
  }
  const lat = state.meta?.grid?.lat?.[row];
  const lon = state.meta?.grid?.lon?.[col];
  renderSeriesChartEl({ labels, series, unit: `${spec.id} ${spec.unit} at ${lat}°N ${lon}°E` });
}

// ---------------------------------------------------------------------------
// Shock response energy against distance from the shocked area
// ---------------------------------------------------------------------------
function renderEnergyChart(state) {
  const el = els.energyChartContainer;
  if (!el) return;
  if (!state.difference) {
    el.textContent = "Run a baseline and a shock scenario to see how far the response reaches.";
    return;
  }
  // The delta that produced THIS result, not whatever is selected now.
  const result = energyByDistance(state.difference[state.dayIndex], state.runInfo?.perturbation, state.meta?.channel_std);
  if (!result) {
    el.textContent = "Energy by distance needs the channel standard deviations from the server (not available).";
    return;
  }
  const chart = node("div");
  const share = result.outsideShare === null ? "no response on this day"
    : `${(100 * result.outsideShare).toFixed(1)}% of the response energy is outside the shocked area`;
  const caption = node("div", "mt-mono mt-muted mt-caption",
    `Day ${state.dayIndex + 1}: mean of Σ(Δ/σ)² per cell, by distance in grid cells (0 = shocked area). ${share}.`);
  el.replaceChildren(chart, caption);
  renderEnergyChartEl(chart, { distances: result.labels, baseline: [], scenario: result.meanEnergy },
    { unit: "Σ(Δ/σ)² per cell", scenarioLabel: "Scenario − baseline" });
}

// ---------------------------------------------------------------------------
// Monsoon Impact Lens: proxies computed from the forecast arrays on screen
// ---------------------------------------------------------------------------
let _impactKey = null;

function renderImpact(state) {
  const el = els.impactContainer;
  if (!el) return;
  if (!state.baseline?.rollout) {
    _impactKey = null;
    el.textContent = "Run a forecast to see rain and heat indicators.";
    return;
  }
  // Rebuild only when the results change, so an open method popover stays open while the day or variable changes.
  const key = [state.baseline, state.scenario, state.climatology];
  if (_impactKey && key.every((v, i) => v === _impactKey[i])) return;
  _impactKey = key;
  const perturbation = state.scenario ? state.runInfo?.perturbation : null;
  const numbers = impactNumbers({
    baseline: state.baseline.rollout,
    scenario: state.difference ? state.scenario.rollout : null,
    climatology: state.climatology,
    landMask: state.meta?.land_sea_mask || null,
    perturbation,
  });
  const cards = impactCards(numbers, {
    steps: state.baseline.rollout.length,
    modelMode: state.meta?.model?.mode,
    rainShocked: Boolean(perturbation && perturbation[1].some((row) => row.some((v) => v !== 0))),
  });
  const heading = node("div", "mt-caption mt-muted", state.difference
    ? "Value = scenario. B: baseline, S: scenario, Δ: scenario − baseline. All are proxies computed from this forecast."
    : "Baseline forecast only. All are proxies computed from this forecast.");
  const cardBox = node("div");
  const chartTitle = node("div", "mt-caption mt-muted", "Core monsoon zone: daily rain by forecast day");
  const chart = node("div");
  chart.id = "impact-series";
  el.replaceChildren(heading, cardBox, chartTitle, chart);
  renderImpactCardsEl(cardBox, cards);
  const series = [{ name: "Baseline", values: numbers.daily.baseline }];
  if (numbers.daily.scenario) series.push({ name: "Scenario", values: numbers.daily.scenario });
  if (numbers.daily.climatology) series.push({ name: "Climatology", values: numbers.daily.climatology });
  const data = { labels: numbers.daily.baseline.map((_, i) => `D${i + 1}`), series, unit: "mm/day" };
  if (w3Charts?.renderSeries) w3Charts.renderSeries(chart, data);
  else renderFallbackSeries(chart, data);
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
  els.runLog.replaceChildren(...state.runLog.map((entry) => {
    const ms = Number.isFinite(entry.inferenceMs) ? `${entry.inferenceMs.toFixed(0)} ms` : "no timing";
    const line = node("div", "", [entry.time, entry.type, `${entry.steps} days`, entry.error ? null : ms,
      entry.preset, entry.model].filter(Boolean).join(" · "));
    if (entry.error) line.appendChild(node("span", "mt-error-text", ` · ${entry.error}`));
    return line;
  }));
}

// ---------------------------------------------------------------------------
// Synthetic badge sync
// ---------------------------------------------------------------------------
function syncSyntheticBadge(state) {
  if (!els.syntheticBadge) return;
  els.syntheticBadge.classList.toggle("hidden", !state.activeCase?.isSynthetic);
}

// ---------------------------------------------------------------------------
// Provenance of what is on screen
// ---------------------------------------------------------------------------
function describeServed(served) {
  if (!served?.model) return "model not reported by the server";
  return served.fallback ? `${served.model} (FALLBACK: ${served.fallback})` : served.model;
}

function renderProvenance(state) {
  if (!els.provenance) return;
  const info = state.runInfo;
  if (!info) {
    els.provenance.textContent = state.running ? "Running: no forecast on screen yet." : "No forecast on screen.";
    return;
  }
  const parts = [
    `Forecast on screen: ${describeServed(info.baseline)}`,
    `input: ${info.caseLabel}`,
    `${info.steps} days`,
    info.scenario ? `scenario: ${info.shockLabel}` : "baseline only",
  ];
  els.provenance.textContent = parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Run buttons
// ---------------------------------------------------------------------------
let _connecting = false;

function syncRunButtons(state) {
  const hasShock = !isZeroPerturbation(state.shock?.perturbation);
  const busy = state.running || _connecting;
  if (els.runBtn) {
    els.runBtn.disabled = busy;
    els.runBtn.textContent = state.running ? "Running…" : hasShock ? "Run Baseline + Scenario" : "Run Simulation";
    els.runBtn.setAttribute("aria-busy", state.running ? "true" : "false");
  }
  if (els.clearShockBtn) els.clearShockBtn.disabled = busy || !hasShock;
  // Inputs of a run cannot change while it is in flight.
  for (const el of [els.caseSelect, els.apiInput, els.apiApplyBtn]) if (el) el.disabled = busy;
  els.scenarioControls?.querySelectorAll("button, input, select").forEach((el) => { el.disabled = busy; });
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
  renderProvenance(state);
  if (els.hoverReadout) {
    els.hoverReadout.textContent = formatHoverReadout({ cell: _hoverCell, state });
  }
}

// ---------------------------------------------------------------------------
// API: connect and load meta
// ---------------------------------------------------------------------------
async function connectAndLoadMeta() {
  if (_connecting || store.getState().running) return false;
  _connecting = true;
  clearError();
  showNotice("");
  showRunStatus(null, "");
  store.setError(null);
  store.resetConnection(); // nothing from an earlier server stays on screen
  renderModelBannerEl(null);
  if (els.metaSummary) els.metaSummary.textContent = "Connecting to server...";
  setStatus("loading", "Connecting…");
  try {
    const health = await api.health();
    const meta = await api.meta();
    store.setHealth(health);
    store.setMeta(meta);
    renderModelBannerEl(meta.model);
    setStatus("ready", `Ready (${health.model_name})`);
    return true;
  } catch (err) {
    setStatus("error", err.kind === "timeout" ? "Timeout (15 s)" : "Offline");
    if (els.metaSummary) els.metaSummary.textContent = "Not connected: model unknown.";
    showError(err.message);
    return false;
  } finally {
    _connecting = false;
    syncRunButtons(store.getState());
  }
}

// ---------------------------------------------------------------------------
// Run simulation: one snapshot of the inputs, all results or none
// ---------------------------------------------------------------------------
async function runSimulation() {
  if (store.getState().running || _connecting) return;
  if (!store.getState().meta && !(await connectAndLoadMeta())) return; // reconnect after a failure
  clearError();
  showNotice("");

  // Snapshot everything at the click. The live state is not read again for this run.
  const live = store.getState();
  const activeCase = live.activeCase;
  const steps = live.steps;
  const hasShock = !isZeroPerturbation(live.shock.perturbation);
  const presetId = live.shock.presetId;
  const shockLabel = hasShock ? live.shock.label || SHOCK_PRESETS[presetId]?.label || presetId : null;
  const perturbation = hasShock ? clonePerturbation(live.shock.perturbation) : null;

  let baselinePayload;
  let scenarioPayload = null;
  try {
    baselinePayload = buildSimulatePayload({ activeCase, steps, perturbation: null });
    if (hasShock) scenarioPayload = buildSimulatePayload({ activeCase, steps, perturbation: live.shock.perturbation });
  } catch (err) {
    showError(`Payload error: ${err.message}`);
    return;
  }

  if (!store.beginRun()) return;
  const logEntry = (type, extra) => ({ time: new Date().toLocaleTimeString(), type, steps, ...extra });
  const toResult = (res) => ({ rollout: res.rollout, inferenceMs: res.inference_ms ?? null, served: res.servedBy });
  let stage = "Baseline";
  try {
    showRunStatus("loading", "Running baseline forecast…");
    const baseline = toResult(await api.simulate(baselinePayload));

    let scenario = null;
    if (scenarioPayload) {
      stage = "Scenario";
      showRunStatus("loading", "Running scenario forecast…");
      scenario = toResult(await api.simulate(scenarioPayload));
    }

    let climatology = null;
    let climatologyNote = null;
    showRunStatus("loading", "Loading climatology…");
    try {
      climatology = (await api.climatology({ doy_sincos: baselinePayload.doy_sincos, steps })).climatology;
    } catch (err) {
      climatologyNote = err.status === 503
        ? "Climatology is not available on this server."
        : `Climatology could not be loaded: ${err.message}`;
    }

    // A difference is only meaningful when both forecasts came from the same model with no fallback.
    const comparable = !scenario
      || (baseline.served.model === scenario.served.model && !baseline.served.fallback && !scenario.served.fallback);
    const info = {
      caseLabel: activeCase.label,
      steps,
      shockLabel,
      baseline: baseline.served,
      scenario: scenario ? scenario.served : null,
      comparable,
      perturbation,
    };
    store.completeRun({ baseline, scenario, climatology, climatologyNote, info });

    for (const [type, result] of [["baseline", baseline], ["scenario", scenario]]) {
      if (!result) continue;
      store.appendRunLog(logEntry(type, {
        inferenceMs: result.inferenceMs,
        model: describeServed(result.served),
        preset: type === "scenario" ? shockLabel : undefined,
      }));
    }

    const warnings = [];
    for (const [name, result] of [["Baseline", baseline], ["Scenario", scenario]]) {
      if (result?.served.fallback) warnings.push(`${name} used a fallback: ${describeServed(result.served)}.`);
    }
    if (!comparable) warnings.push("The two forecasts are not comparable, so no difference is shown.");
    const reported = store.getState().meta?.model?.name;
    if (baseline.served.model && !baseline.served.fallback && reported && baseline.served.model !== reported) {
      warnings.push(`The server's model changed since you connected (${reported} → ${baseline.served.model}). Press Connect.`);
    }
    if (climatologyNote) warnings.push(climatologyNote);
    showNotice(warnings.join(" "));
    showRunStatus("success", scenario ? "Baseline and scenario received from the server." : "Baseline received from the server.");
  } catch (err) {
    store.failRun();
    store.appendRunLog(logEntry(stage.toLowerCase(), { error: err.message }));
    const msg = formatApiError(`${stage} forecast failed`, err);
    showError(`${msg} No forecast is shown.`);
    showRunStatus("error", "Run failed.");
    if (err.kind === "network" || err.kind === "timeout") {
      store.resetConnection(); // the server may have gone or been replaced: do not keep showing its identity
      renderModelBannerEl(null);
      setStatus("error", err.kind === "timeout" ? "Timeout (15 s)" : "Offline");
      if (els.metaSummary) els.metaSummary.textContent = "Not connected: model unknown.";
    }
  }
}

function formatApiError(prefix, err) {
  if (err.kind === "timeout") return `${prefix}: request timed out after 15 s.`;
  if (err.kind === "network") return `${prefix}: network error — ${err.message}`;
  if (err.kind === "validation") return `${prefix}: 422 Validation — ${err.message}`;
  if (err.kind === "unavailable") return `${prefix}: 503 Service unavailable — ${err.message}`;
  if (err.kind === "bad_json") return `${prefix}: bad JSON — ${err.message}`;
  return `${prefix}: ${err.message}`;
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts. Never with Ctrl/Cmd/Alt (browser shortcuts), never while typing or using a form control.
// ---------------------------------------------------------------------------
function handleShortcut(e) {
  if (e.key === "Escape") {
    document.querySelectorAll("details[open]").forEach((d) => { d.open = false; });
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  const target = e.target;
  if (target instanceof Element) {
    if (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
    // Space and Enter keep their normal meaning on buttons, links and disclosure controls.
    if ((e.key === " " || e.key === "Enter") && ["BUTTON", "A", "SUMMARY"].includes(target.tagName)) return;
  }
  const state = store.getState();
  const key = e.key.toLowerCase();
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    if (!state.baseline) return;
    e.preventDefault();
    store.setDayIndex(state.dayIndex + (e.key === "ArrowRight" ? 1 : -1));
  } else if (e.key === " ") {
    if (els.playBtn && !els.playBtn.disabled) {
      e.preventDefault();
      els.playBtn.click();
    }
  } else if (/^[1-6]$/.test(e.key)) {
    store.setChannelIndex(Number(e.key) - 1);
  } else if (key === "b" || key === "s" || key === "d") {
    const view = { b: "baseline", s: "scenario", d: "difference" }[key];
    const tab = document.querySelector(`.mt-tab[data-view="${view}"]`);
    if (tab && !tab.disabled) tab.click();
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function init() {
  await loadW3Modules(); // fallbacks are used if any module is absent
  const { cases, problems } = await loadCases();
  if (cases.length) store.setCases([...cases, buildSyntheticCase()]);

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

  document.addEventListener("keydown", handleShortcut);

  // Canvas hover / click / keyboard
  bindCanvasInteractions(els.mapCanvas, {
    getSelected: () => store.getState().selectedCell,
    onHover: (cell) => {
      _hoverCell = cell;
      if (els.hoverReadout) {
        els.hoverReadout.textContent = formatHoverReadout({ cell, state: store.getState() });
      }
      redrawMap(store.getState());
    },
    onClick: (cell) => {
      if (_picking) pickCentre(cell);
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
  if (problems.length) showNotice(`Demo cases: ${problems.join("; ")}`);
}

init();
