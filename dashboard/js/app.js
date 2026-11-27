/**
 * Gridence dashboard application orchestrator.
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
  getChannelSpec,
  DOMAIN,
} from "./render.js";
import { differenceScale, valueScale } from "./scale.js";
import { loadCoastline } from "./geo.js";
import { CASE_NOTES, SHOCK_CARDS, VARIABLES, dateAfter, modelLabel, unitLabel } from "./copy.js";
import { CUSTOM_LIMITS } from "./scenario.js";

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
  stageTag: document.getElementById("stage-tag"),
  stageText: document.getElementById("stage-text"),
  caseInfo: document.getElementById("case-info"),
  runHint: document.getElementById("run-hint"),
  modelPlain: document.getElementById("model-plain"),
  mapArea: document.getElementById("map-area"),
  mapFrame: document.getElementById("map-frame"),
  mapFade: document.getElementById("map-fade"),
  mapTip: document.getElementById("map-tip"),
  mapBadge: document.getElementById("map-badge"),
  mapStart: document.getElementById("map-start"),
  mapBusy: document.getElementById("map-busy"),
  mapBusyText: document.getElementById("map-busy-text"),
  latAxis: document.getElementById("lat-axis"),
  lonAxis: document.getElementById("lon-axis"),
  legendNote: document.getElementById("legend-note"),
  prevDay: document.getElementById("prev-day-btn"),
  nextDay: document.getElementById("next-day-btn"),
  dayDate: document.getElementById("day-date"),
  cellQuick: document.getElementById("cell-quick"),
};

let _statusResults = null; // the results the success message is about

/** Progress and outcome of the current run (W3 status component, plain text if it is unavailable). */
function showRunStatus(state, message) {
  if (els.mapBusyText && state === "loading") els.mapBusyText.textContent = message;
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
  if (els.statusText) {
    els.statusText.textContent = text;
    els.statusText.title = text; // the visible text may be shortened with an ellipsis
  }
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
    `model: ${modelLabel(model?.name)} · ${validated ? "validated" : "Unvalidated"}`));
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

function renderLegendEl({ channel, unit, min, max, ramp }, options) {
  if (w3Legend?.renderLegend) {
    try {
      w3Legend.renderLegend(els.legendContainer, { channel, unit, min, max, ramp }, options);
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

function renderSeriesChartEl(data, options) {
  if (w3Charts?.renderSeries) {
    try { w3Charts.renderSeries(els.seriesChartContainer, data, options); return; } catch (err) { console.error(err); }
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
    `model: ${modelLabel(meta.model?.name)} (${meta.model?.mode ?? "?"})`,
    `server model ID: ${meta.model?.name ?? "unknown"}`,
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
    btn.className = "mt-tab";
    btn.type = "button";
    btn.dataset.channelIndex = String(i);
    btn.append(node("small", "", i + 1), document.createTextNode(VARIABLES[i].name));
    btn.title = `${VARIABLES[i].name} (${unitLabel(ch.unit)}). ${VARIABLES[i].help} Key ${i + 1}.`;
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

  els.scenarioControls.replaceChildren();
  const step = (number, title) => {
    const box = node("section", "mt-step");
    const heading = node("h2");
    heading.append(node("span", "mt-num", number), document.createTextNode(title));
    box.appendChild(heading);
    els.scenarioControls.appendChild(box);
    return box;
  };

  // 2. Forecast length
  const horizon = step(2, "Forecast length");
  const row = node("div", "mt-horizon");
  for (const days of [5, 10, 14]) {
    const quick = node("button", "mt-btn", days);
    quick.type = "button";
    quick.title = `Forecast ${days} days`;
    quick.dataset.horizon = String(days);
    quick.addEventListener("click", () => store.setSteps(days));
    row.appendChild(quick);
  }
  const stepsInput = node("input", "mt-input mt-mono");
  stepsInput.id = "steps-input";
  stepsInput.type = "number";
  stepsInput.min = "1";
  stepsInput.max = "30";
  stepsInput.value = String(state.steps);
  stepsInput.title = "Number of forecast days, 1 to 30";
  stepsInput.setAttribute("aria-label", "Number of forecast days");
  stepsInput.addEventListener("change", () => store.setSteps(Number(stepsInput.value)));
  row.append(stepsInput, node("span", "mt-hint", "days"));
  horizon.appendChild(row);

  // 3. Shock
  const shockStep = step(3, "Shock (optional)");
  shockStep.appendChild(node("p", "mt-hint", "A change added to the last input day."));
  const list = node("div", "mt-shock-list");
  list.style.marginTop = "7px";
  for (const id of ["none", ...Object.keys(SHOCK_PRESETS)]) {
    const card = SHOCK_CARDS[id];
    const btn = node("button", "mt-btn mt-shock");
    btn.type = "button";
    btn.dataset.presetId = id;
    btn.title = id === "none" ? card.text : `${SHOCK_PRESETS[id].description}. Where: ${card.where}.`;
    btn.append(node("b", "", card.title), node("span", "", card.text));
    btn.setAttribute("aria-pressed", id === "none" ? "true" : "false");
    btn.addEventListener("click", () => {
      // Choosing what is already chosen changes nothing, so it must not throw the forecast away.
      if (id === store.getState().shock.presetId) return;
      setCustomDirty(false);
      if (id === "none") {
        store.setShock("none", null);
        return;
      }
      const st = store.getState();
      try {
        store.setShock(id, buildPresetPerturbation(id, st.activeCase.init_states, st.meta?.grid || null));
      } catch (err) {
        showError(`Preset error: ${err.message}`);
      }
    });
    list.appendChild(btn);
  }
  shockStep.appendChild(list);
  buildCustomShockPanel(shockStep);
}

// ---------------------------------------------------------------------------
// Custom shock: one or more components, each a physical delta on the last input day
// ---------------------------------------------------------------------------
let _picking = false;
let _components = [];
let _customDirty = false; // custom values were edited after the last "Add to shock"
const NOT_ADDED = "Custom values not added yet: press “Add to shock”. Run does not include them.";

function setCustomDirty(on) {
  _customDirty = on;
  const msg = document.getElementById("custom-message");
  if (msg && (on || msg.textContent === NOT_ADDED)) msg.textContent = on ? NOT_ADDED : "";
  syncRunButtons(store.getState());
}

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

function buildCustomShockPanel(parent) {
  const box = node("details", "mt-custom");
  box.id = "custom-shock";
  box.appendChild(node("summary", "mt-btn", "Custom shock: design your own"));
  const ch = select("custom-channel", CHANNELS.map((c, i) => [String(i), `${VARIABLES[i].name} (${unitLabel(c.unit)})`]));
  const op = select("custom-op", [["add", "add (units)"], ["scale_pct", "change by %"]]);
  const limits = node("p", "mt-hint");
  const showLimits = () => {
    const [lo, hi] = CUSTOM_LIMITS[Number(ch.value)][op.value];
    const unit = op.value === "add" ? unitLabel(CHANNELS[Number(ch.value)].unit) : "%";
    limits.textContent = `Allowed: ${lo} to ${hi} ${unit}.`;
  };
  ch.addEventListener("change", showLimits);
  op.addEventListener("change", showLimits);
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
  for (const type of ["input", "change"]) box.addEventListener(type, () => setCustomDirty(true));
  box.append(field("Variable", ch), field("Operation", op), field("Size of change", numberInput("custom-value", "2")), limits,
    field("Shape", shape), rect, blob, add, msg, list,
    node("p", "mt-muted mt-caption", "The change is added to the last input day only. Press Run to forecast it. Changes far outside real weather give unreliable forecasts."));
  parent.appendChild(box);
  showLimits();
}

function setPicking(on) {
  _picking = on;
  const btn = document.getElementById("custom-pick");
  if (btn) {
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "Click a map cell…" : "Pick centre on map";
  }
  els.mapFrame?.classList.toggle("is-picking", on);
}

function pickCentre(cell) {
  const meta = store.getState().meta;
  document.getElementById("custom-lat").value = String(meta?.grid?.lat?.[cell.row] ?? GRID.latMin + cell.row);
  document.getElementById("custom-lon").value = String(meta?.grid?.lon?.[cell.col] ?? GRID.lonMin + cell.col);
  setPicking(false);
  setCustomDirty(true);
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
    const replaced = continuing ? undefined : SHOCK_PRESETS[st.shock.presetId]?.label;
    _components = continuing ? [..._components, what] : [what];
    _customDirty = false;
    store.setShock("custom", result.perturbation, `Custom: ${_components.join("; ")}`);
    msg.textContent = (result.clampedCells
      ? `Added. In ${result.clampedCells} cells the result is outside physical limits; the server moves it to the limit.`
      : "Added. Press Run to forecast it.")
      + (replaced ? ` It replaces the ${replaced} shock: the two are not combined.` : "");
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

  els.scenarioControls.querySelectorAll("[data-horizon]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(Number(btn.dataset.horizon) === state.steps));
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
    btn.dataset.reason ??= btn.title;
    btn.title = btn.disabled ? "Available after you choose a shock and press Run." : btn.dataset.reason;
  });
}

// ---------------------------------------------------------------------------
// Map rendering
// ---------------------------------------------------------------------------
let _hoverCell = null;
let _coastline = null;
let _scaleMode = "run";
let _rangeCache = null;
let _legendKey = "";
let _startDismissed = false;
let _lastDay = 0;
const mapOptions = { smooth: false, cellGrid: false, places: true };

const hasPending = (state) => !state.scenario && !isZeroPerturbation(state.shock?.perturbation);
const changesChannel = (delta, ch) => Boolean(delta && delta[ch].some((row) => row.some((v) => v !== 0)));

/**
 * What the map shows. Before a forecast it shows real numbers too: the last input day, or the change a selected shock
 * will add. Both are labelled "not a forecast".
 */
function mapContent(state) {
  const ch = state.channelIndex;
  if (state.baseline) return { kind: state.view, field: getActiveField(state) };
  if (hasPending(state) && changesChannel(state.shock.perturbation, ch)) {
    return { kind: "shock", field: state.shock.perturbation[ch] };
  }
  return { kind: "input", field: state.activeCase?.init_states?.[2]?.[ch] || null };
}

/** Colour range for what is on the map; recomputed only when the data or the choice changes. */
function mapRange(state, content) {
  const ch = state.channelIndex;
  const key = [content.kind === "scenario" ? "baseline" : content.kind, ch, _scaleMode, state.baseline, state.scenario,
    state.difference, state.activeCase, content.kind === "shock" ? state.shock.perturbation : null];
  if (_rangeCache && key.every((v, i) => v === _rangeCache.key[i])) return _rangeCache.range;
  let range;
  if (content.kind === "difference") range = differenceScale(ch, [state.difference], _scaleMode);
  else if (content.kind === "shock") range = differenceScale(ch, [[state.shock.perturbation]], "run");
  else if (content.kind === "input") range = valueScale(ch, [[state.activeCase?.init_states?.[2]].filter(Boolean)], _scaleMode);
  else range = valueScale(ch, [state.baseline?.rollout, state.scenario?.rollout], _scaleMode);
  _rangeCache = { key, range };
  return range;
}

function drawMap(state) {
  const content = mapContent(state);
  const range = mapRange(state, content);
  const pending = hasPending(state) ? state.shock.perturbation : null;
  renderMapCanvas(els.mapCanvas, {
    field: content.field,
    range,
    meta: state.meta,
    coastline: _coastline,
    perturbation: state.scenario ? state.runInfo?.perturbation : null,
    pendingPerturbation: pending,
    selectedCell: state.selectedCell,
    hoverCell: _hoverCell,
    showIsobars: state.channelIndex === 4 && content.kind !== "difference" && content.kind !== "shock",
    ...mapOptions,
  });
  return { content, range };
}

/** "Wind U" keeps its capital U inside a sentence. */
const inSentence = (name) => (name.startsWith("Wind") ? name.replace("Wind", "wind") : name.toLowerCase());

function legendNote(content, range) {
  const unit = unitLabel(range.unit);
  const outside = range.clipped > 0
    ? ` ${range.clipped < 0.0005 ? "<0.1" : (100 * range.clipped).toFixed(1)}% of ${content.kind === "input" || content.kind === "shock" ? "cells" : "cell-days"} lie beyond the ends and take the end colour.`
    : "";
  if (content.kind === "shock") return "The change the shock will add. Dark means unchanged.";
  if (content.kind === "difference") {
    const largest = `Largest change in the run: ${range.largest.toPrecision(3)} ${unit}.`;
    return `${range.fitted ? "Range fitted to this run." : "Fixed range."} ${largest}${outside}`;
  }
  if (range.ramp === "rain") return "Fixed rain bands, the same for every run. Dark: under 1 mm/day.";
  const basis = !range.fitted ? "Fixed range, the same for every run."
    : content.kind === "input" ? "Range fitted to this day." : "Range fitted to this run; same for every day.";
  return `${basis}${outside}`;
}

function updateLegend(state, content, range) {
  const vertical = !window.matchMedia("(max-width: 800px)").matches;
  const name = VARIABLES[state.channelIndex].name;
  const title = content.kind === "difference" || content.kind === "shock" ? `Change in ${inSentence(name)}` : name;
  const key = JSON.stringify([title, range.min, range.max, range.ramp, unitLabel(range.unit), vertical]);
  if (key !== _legendKey) {
    _legendKey = key;
    renderLegendEl({ channel: range.channel, unit: unitLabel(range.unit), min: range.min, max: range.max, ramp: range.ramp },
      { orientation: vertical ? "vertical" : "horizontal", title });
  }
  if (els.legendNote) {
    els.legendNote.textContent = legendNote(content, range)
      + (mapOptions.smooth ? " Colours are smoothed for display; each value belongs to a 1° cell." : "");
  }
}

/** One sentence that always says what is on the map. */
function updateStage(state, content, range) {
  const ch = state.channelIndex;
  const name = VARIABLES[ch].name;
  const lower = inSentence(name);
  const k = state.dayIndex + 1;
  const date = (offset) => dateAfter(state.activeCase, offset);
  const dayText = `forecast day ${k}${date(k) ? ` (${date(k)})` : ""}`;
  const pending = hasPending(state);
  let tag = "Input";
  let text;
  if (state.running) {
    [tag, text] = ["Running", "Asking the server for the forecast…"];
  } else if (content.kind === "input") {
    text = state.activeCase?.isSynthetic
      ? `Synthetic test numbers for ${lower}. Not real weather, and not a forecast.`
      : `Real ${lower} on the last input day${date(0) ? `, ${date(0)}` : ""}. The forecast starts from here. This is not a forecast.`;
    if (pending) {
      const changed = VARIABLES.filter((_, i) => changesChannel(state.shock.perturbation, i)).map((v) => inSentence(v.name));
      text = `The selected shock does not change ${lower} directly (it changes ${changed.join(" and ")}). Shown: the real input day, with the shock area dashed.`;
    }
  } else if (content.kind === "shock") {
    [tag, text] = ["Shock preview", `What the shock will add to ${lower} on the last input day. Nothing is forecast yet. Press Run.`];
  } else if (content.kind === "difference") {
    let largest = 0;
    for (const row of content.field || []) for (const v of row) if (Math.abs(v) > Math.abs(largest)) largest = v;
    tag = "Difference";
    text = `Scenario minus baseline, ${lower}, ${dayText}. Largest change today: ${largest >= 0 ? "+" : ""}${largest.toPrecision(3)} ${unitLabel(range.unit)}.`
      + " Orange: higher with the shock. Blue: lower. Dark: little or no change.";
  } else if (content.kind === "scenario") {
    [tag, text] = ["Scenario", `${name} with your shock, ${dayText}. The white outline marks where the shock was applied.`];
  } else {
    tag = "Baseline";
    text = `${name} without any shock, ${dayText}.`;
    if (pending) text += " A new shock is selected (dashed outline): press Run to forecast it.";
    else if (!state.scenario) text += " To compare, choose a shock and run.";
    else text = `${name} without the shock, ${dayText}. To see the shock's effect, click Scenario${state.difference ? " or Difference" : ""} above.`;
  }
  if (els.stageTag) {
    els.stageTag.textContent = tag;
    els.stageTag.dataset.kind = state.running ? "idle" : content.kind === "shock" ? "shock" : content.kind;
  }
  if (els.stageText) els.stageText.textContent = text;
  if (els.mapBadge) {
    const notForecast = content.kind === "input" ? "Input day — not a forecast" : content.kind === "shock" ? "Shock preview — not a forecast" : "";
    // A smoothed picture looks finer than the data, so it is always labelled on the map itself.
    const label = [notForecast, mapOptions.smooth ? "Smoothed colours — data are 1° cells" : ""].filter(Boolean).join(" · ");
    els.mapBadge.textContent = label;
    els.mapBadge.hidden = !label || state.running;
  }
  els.mapStart?.classList.toggle("hidden", Boolean(_startDismissed || state.baseline || state.running || !state.meta));
  els.mapBusy?.classList.toggle("hidden", !state.running);
}

/** A short cross-fade between days while playing. It blends two real frames; it shows no values in between. */
function fadeFromPreviousFrame(state) {
  const fade = els.mapFade;
  if (!fade || !state.playing || state.dayIndex === _lastDay || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  fade.width = els.mapCanvas.width;
  fade.height = els.mapCanvas.height;
  fade.getContext("2d").drawImage(els.mapCanvas, 0, 0);
  fade.style.transition = "none";
  fade.style.opacity = "1";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    fade.style.transition = "opacity 240ms linear";
    fade.style.opacity = "0";
  }));
}

function redrawMap(state) {
  fadeFromPreviousFrame(state);
  _lastDay = state.dayIndex;
  const { content, range } = drawMap(state);
  updateLegend(state, content, range);
  updateStage(state, content, range);
}

/** Give the map all the room that is left, keeping one square per degree. */
function fitMap() {
  if (!els.mapArea || !els.mapCanvas) return;
  const side = els.mapArea.querySelector(".mt-map-side");
  const stackedSide = window.matchMedia("(max-width: 800px)").matches;
  const flowHeight = window.matchMedia("(max-width: 1180px)").matches; // the page scrolls: height is not limited
  const availW = els.mapArea.clientWidth - 34 - (stackedSide ? 0 : (side?.offsetWidth || 0) + 14);
  const availH = flowHeight ? Math.max(360, window.innerHeight - 150) : els.mapArea.clientHeight - 16;
  const cell = Math.max(5, Math.min(availW / 36, availH / 32, 24));
  const w = Math.floor(36 * cell);
  const h = Math.round((w * 32) / 36);
  els.mapCanvas.style.width = `${w}px`;
  els.mapCanvas.style.height = `${h}px`;
  els.latAxis.style.height = `${h}px`;
  els.lonAxis.style.width = `${w}px`;
  els.mapArea.style.setProperty("--legend-h", `${Math.max(130, Math.min(330, h - 190))}px`);
}

function buildAxes() {
  const label = (parent, text, property, share) => {
    const span = node("span", "", text);
    span.style[property] = `${share * 100}%`;
    parent.appendChild(span);
  };
  for (let lat = 10; lat <= 35; lat += 5) label(els.latAxis, `${lat}°N`, "top", (DOMAIN.latMax - lat) / (DOMAIN.latMax - DOMAIN.latMin));
  for (let lon = 70; lon <= 100; lon += 5) label(els.lonAxis, `${lon}°E`, "left", (lon - DOMAIN.lonMin) / (DOMAIN.lonMax - DOMAIN.lonMin));
}

function fillMapTip(cell) {
  const text = formatHoverReadout({ cell, state: store.getState() }).split(" · ");
  els.mapTip.replaceChildren(node("div", "mt-tip-title", text[0]), ...text.slice(2).map((line) => node("div", "mt-tip-row", line)));
}

function updateMapTip(cell, event) {
  const tip = els.mapTip;
  if (!tip) return;
  if (!cell) {
    tip.hidden = true;
    return;
  }
  fillMapTip(cell);
  tip.hidden = false;
  const frame = els.mapFrame.getBoundingClientRect();
  const x = event ? event.clientX - frame.left : ((cell.col + 0.5) / 36) * frame.width;
  const y = event ? event.clientY - frame.top : (1 - (cell.row + 0.5) / 32) * frame.height;
  tip.style.left = `${x + 16 + tip.offsetWidth > frame.width ? Math.max(0, x - 16 - tip.offsetWidth) : x + 16}px`;
  tip.style.top = `${Math.max(0, Math.min(frame.height - tip.offsetHeight, y + 14))}px`;
}

// ---------------------------------------------------------------------------
// Cell time-series chart for selected cell
// ---------------------------------------------------------------------------
function renderCellSeries(state) {
  const el = els.seriesChartContainer;
  if (!el) return;
  const empty = (text) => {
    el.classList.add("mt-empty");
    el.textContent = text;
  };
  if (!state.selectedCell) return empty("Click a grid cell to inspect its rollout.");
  const steps = state.baseline?.rollout?.length || 0;
  const { row, col } = state.selectedCell;
  const lat = state.meta?.grid?.lat?.[row] ?? GRID.latMin + row;
  const lon = state.meta?.grid?.lon?.[col] ?? GRID.lonMin + col;
  if (steps === 0) return empty(`Cell ${lat}°N ${lon}°E selected. Run a forecast to chart it.`);

  const ch = state.channelIndex;
  const spec = getChannelSpec(ch, state.meta);
  const labels = Array.from({ length: steps }, (_, d) => `Day ${d + 1}`);
  const at = (rollout) => labels.map((_, d) => rollout?.[d]?.[ch]?.[row]?.[col] ?? null);
  const series = [{ name: "Baseline", values: at(state.baseline.rollout) }];
  if (state.scenario?.rollout) series.push({ name: "Scenario", values: at(state.scenario.rollout) });
  if (state.climatology) series.push({ name: "Climatology", values: at(state.climatology) });
  el.classList.remove("mt-empty");
  renderSeriesChartEl({ labels, series, unit: `${VARIABLES[ch].name}, ${unitLabel(spec.unit)} at ${lat}°N ${lon}°E` },
    { activeIndex: state.dayIndex, height: 220 });
}

function buildCellQuickPicks() {
  if (!els.cellQuick) return;
  // The 1° cell that CONTAINS the city (cells span whole degrees from 65°E and 6°N).
  for (const [name, lat, lon] of [["New Delhi", 28.61, 77.21], ["Mumbai", 19.08, 72.88], ["Kolkata", 22.57, 88.36], ["Chennai", 13.08, 80.27], ["Bengaluru", 12.97, 77.59]]) {
    const btn = node("button", "mt-btn", name);
    btn.type = "button";
    btn.addEventListener("click", () => store.setSelectedCell({ row: Math.floor(lat - DOMAIN.latMin), col: Math.floor(lon - DOMAIN.lonMin) }));
    els.cellQuick.appendChild(btn);
  }
}

// ---------------------------------------------------------------------------
// Shock response energy against distance from the shocked area
// ---------------------------------------------------------------------------
function renderEnergyChart(state) {
  const el = els.energyChartContainer;
  if (!el) return;
  if (!state.difference) {
    el.classList.add("mt-empty");
    el.textContent = "Run a baseline and a shock scenario to see how far the response reaches.";
    return;
  }
  // The delta that produced THIS result, not whatever is selected now.
  const result = energyByDistance(state.difference[state.dayIndex], state.runInfo?.perturbation, state.meta?.channel_std);
  if (!result) {
    el.textContent = "Energy by distance needs the channel standard deviations from the server (not available).";
    return;
  }
  el.classList.remove("mt-empty");
  const chart = node("div");
  const share = result.outsideShare === null ? "no response on this day"
    : `${(100 * result.outsideShare).toFixed(1)}% of the response energy is outside the shocked area`;
  const caption = node("div", "mt-hint mt-chart-note mt-caption",
    `Day ${state.dayIndex + 1}: mean of Σ(Δ/σ)² per cell, by distance in grid cells (0 = shocked area). ${share}.`);
  el.replaceChildren(chart, caption);
  renderEnergyChartEl(chart, { distances: result.labels, baseline: [], scenario: result.meanEnergy },
    { unit: "Σ(Δ/σ)² per cell", scenarioLabel: "Scenario − baseline", height: 220,
      xTitle: "Distance from the shocked area in grid cells (0 = inside)" });
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
    el.classList.add("mt-empty");
    el.textContent = "Run a forecast to see rain and heat indicators.";
    return;
  }
  // Rebuild only when the results change, so an open method popover stays open while the day or variable changes.
  const key = [state.baseline, state.scenario, state.climatology];
  if (_impactKey && key.every((v, i) => v === _impactKey[i])) return;
  _impactKey = key;
  el.classList.remove("mt-empty");
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
    ? "Big number: scenario. B: baseline, S: scenario, Δ: scenario − baseline. All are proxies computed from this forecast."
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
  if (w3Charts?.renderSeries) w3Charts.renderSeries(chart, data, { height: 180 });
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
  const name = modelLabel(served.model);
  return served.fallback ? `${name} (FALLBACK: ${served.fallback})` : name;
}

function renderProvenance(state) {
  if (!els.provenance) return;
  const info = state.runInfo;
  if (!info) {
    els.provenance.textContent = state.running ? "Running: no forecast on screen yet." : "No forecast on screen.";
    return;
  }
  const baselineModel = describeServed(info.baseline);
  const scenarioModel = info.scenario ? describeServed(info.scenario) : null;
  const parts = [
    // The two forecasts are separate requests: name both whenever they were not answered the same way.
    scenarioModel && scenarioModel !== baselineModel
      ? `Forecast on screen: baseline from ${baselineModel}; scenario from ${scenarioModel}`
      : `Forecast on screen: ${baselineModel}`,
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
  if (els.runHint) {
    els.runHint.textContent = state.running ? "Forecasting…" : _connecting ? "Connecting to the server…"
      : !state.meta ? "Not connected. Run will try again."
        : _customDirty ? NOT_ADDED
          : hasShock ? "Two forecasts: without and with the shock." : "One forecast, no shock.";
    els.runHint.classList.toggle("is-warning", _customDirty && !state.running);
  }
  // Inputs of a run cannot change while it is in flight.
  for (const el of [els.caseSelect, els.apiInput, els.apiApplyBtn]) if (el) el.disabled = busy;
  els.scenarioControls?.querySelectorAll("button, input, select").forEach((el) => { el.disabled = busy; });
}

const MODEL_SENTENCES = {
  localnet: "Unvalidated: our test results have not been independently reproduced. Treat forecasts and shock responses as exploratory.",
  dap: "Fallback model: LocalNet is not in use. DAP treats each cell on its own, so it cannot spread a shock. Unvalidated.",
  persistence: "This is not a model: it repeats the last day.",
};

function syncContext(state) {
  if (els.modelPlain) {
    els.modelPlain.textContent = state.meta ? MODEL_SENTENCES[state.meta.model?.mode] || "Unvalidated." : "Not connected, so the model is unknown.";
  }
  if (els.caseInfo) {
    const c = state.activeCase;
    const days = dateAfter(c, -2) ? `Input days: ${dateAfter(c, -2)} to ${dateAfter(c, 0)}.` : "";
    els.caseInfo.textContent = [CASE_NOTES[c?.id] || "", days].filter(Boolean).join(" ");
    els.caseInfo.title = c?.selection_rule ? `How this case was chosen: ${c.selection_rule}. ${c.source || ""}` : "";
  }
  const steps = state.baseline?.rollout?.length || 0;
  if (els.prevDay) els.prevDay.disabled = !steps || state.dayIndex <= 0;
  if (els.nextDay) els.nextDay.disabled = !steps || state.dayIndex >= steps - 1;
  if (els.dayDate) els.dayDate.textContent = steps ? dateAfter(state.activeCase, state.dayIndex + 1) : "no forecast yet";
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
  syncContext(state);
  if (els.hoverReadout) {
    els.hoverReadout.textContent = formatHoverReadout({ cell: _hoverCell, state });
  }
  if (_hoverCell && els.mapTip && !els.mapTip.hidden) fillMapTip(_hoverCell);
  // "Both forecasts received" is only true while those very results are still on screen.
  if (_statusResults && (state.baseline !== _statusResults[0] || state.scenario !== _statusResults[1])) {
    _statusResults = null;
    showRunStatus(null, "");
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
    setStatus("ready", `Ready (${modelLabel(health.model_name)})`);
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
      warnings.push(`The server's model changed since you connected (${modelLabel(reported)} → ${modelLabel(baseline.served.model)}). Press Connect.`);
    }
    if (climatologyNote) warnings.push(climatologyNote);
    showNotice(warnings.join(" "));
    showRunStatus("success", !scenario ? "Baseline received from the server."
      : comparable ? "Both forecasts received. Click Scenario or Difference above the map."
        : "Both forecasts received. Click Scenario above the map.");
    const shown = store.getState();
    _statusResults = [shown.baseline, shown.scenario];
    onStoreChange(store.getState());
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
  if (document.querySelector("dialog[open]")) return;
  const target = e.target;
  if (target instanceof Element) {
    // Only typing (text boxes, drop-down lists) switches the shortcuts off. A slider or checkbox does not.
    const type = target.tagName === "INPUT" ? target.type : "";
    const typing = target.isContentEditable || ["SELECT", "TEXTAREA"].includes(target.tagName)
      || (type && !["range", "checkbox", "radio"].includes(type));
    if (typing) return;
    if (type === "range" && e.key.startsWith("Arrow")) return; // the slider moves itself
    // Space and Enter keep their normal meaning on buttons, links, check boxes and disclosure controls.
    if ((e.key === " " || e.key === "Enter") && (["BUTTON", "A", "SUMMARY"].includes(target.tagName) || type === "checkbox")) return;
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
// Page chrome: sizing, map options, day buttons, help, focus handling
// ---------------------------------------------------------------------------
function bindChrome() {
  let frame = 0;
  const relayout = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      fitMap();
      const state = store.getState();
      redrawMap(state);
      renderCellSeries(state);
      renderEnergyChart(state);
      _impactKey = null;
      renderImpact(state);
    });
  };
  fitMap();
  redrawMap(store.getState());
  let lastSize = "";
  new ResizeObserver(() => {
    const size = `${els.mapArea.clientWidth}x${els.mapArea.clientHeight}x${window.devicePixelRatio}`;
    if (size !== lastSize) {
      lastSize = size;
      relayout();
    }
  }).observe(els.mapArea);
  window.addEventListener("resize", relayout); // also fires when the zoom level or screen scaling changes

  const option = (id, apply) => document.getElementById(id)?.addEventListener("change", (e) => {
    apply(e.target);
    redrawMap(store.getState());
  });
  option("scale-mode", (el) => { _scaleMode = el.value; });
  option("opt-grid", (el) => { mapOptions.cellGrid = el.checked; });
  option("opt-places", (el) => { mapOptions.places = el.checked; });
  option("opt-smooth", (el) => { mapOptions.smooth = el.checked; });

  els.prevDay?.addEventListener("click", () => store.setDayIndex(store.getState().dayIndex - 1));
  els.nextDay?.addEventListener("click", () => store.setDayIndex(store.getState().dayIndex + 1));
  document.getElementById("start-run-btn")?.addEventListener("click", () => runSimulation());
  document.getElementById("start-close-btn")?.addEventListener("click", () => {
    _startDismissed = true;
    redrawMap(store.getState());
  });
  const help = document.getElementById("help-dialog");
  document.getElementById("help-btn")?.addEventListener("click", () => help.showModal());
  document.getElementById("help-close-btn")?.addEventListener("click", () => help.close());
  document.getElementById("error-retry-btn")?.addEventListener("click", () => connectAndLoadMeta());
  document.getElementById("notice-dismiss-btn")?.addEventListener("click", () => showNotice(""));

  // After a MOUSE click a button gives up focus, so that Space and the arrow keys keep driving the map afterwards.
  // Keyboard users (event.detail === 0) keep their focus where it is.
  document.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (e.detail > 0) target?.closest("button, summary")?.blur();
    for (const pop of document.querySelectorAll("details.mt-pop[open]")) if (target && !pop.contains(target)) pop.open = false;
  });
  // The same for a drop-down chosen with the mouse: otherwise an arrow key would silently change the weather case.
  for (const list of document.querySelectorAll("#case-select, #scale-mode")) {
    let byPointer = false;
    list.addEventListener("pointerdown", () => { byPointer = true; });
    list.addEventListener("keydown", (e) => {
      // After a mouse visit, an arrow or Escape means "leave the list", not "pick another weather case".
      if (byPointer && (e.key.startsWith("Arrow") || e.key === "Escape")) {
        e.preventDefault();
        list.blur();
      }
      byPointer = false;
    });
    list.addEventListener("blur", () => { byPointer = false; });
    list.addEventListener("change", () => { if (byPointer) list.blur(); });
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function init() {
  await loadW3Modules(); // fallbacks are used if any module is absent
  loadCoastline().then((lines) => {
    _coastline = lines;
    if (lines) drawMap(store.getState());
  });
  const { cases, problems } = await loadCases();
  if (cases.length) store.setCases([...cases, buildSyntheticCase()]);

  // Populate UI structure before API calls
  buildAxes();
  buildCellQuickPicks();
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

  // Canvas hover / click / keyboard. Pointing only redraws the map, not the whole page.
  bindCanvasInteractions(els.mapCanvas, {
    getSelected: () => store.getState().selectedCell,
    onHover: (cell, event) => {
      _hoverCell = cell;
      if (els.hoverReadout) els.hoverReadout.textContent = formatHoverReadout({ cell, state: store.getState() });
      drawMap(store.getState());
      updateMapTip(cell, event);
    },
    onClick: (cell) => {
      if (_picking) pickCentre(cell);
      store.setSelectedCell(cell);
    },
  });
  bindChrome();

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
      setCustomDirty(false);
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
