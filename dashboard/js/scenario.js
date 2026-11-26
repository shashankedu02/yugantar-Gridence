/**
 * Shock presets, custom cell/box perturbations, and pre-submission payload validation.
 * W2-owned module. Preset coordinates and formulas match docs/DASHBOARD_API.md §3.
 */

import { GRID, MAX_STEPS, MIN_STEPS, SHOCK_PRESETS } from "./config.js";
import { cloneInitStates, validateCaseData } from "./state.js";

export function createZeroPerturbation() {
  return Array.from({ length: 6 }, () =>
    Array.from({ length: GRID.rows }, () => new Array(GRID.cols).fill(0))
  );
}

export function clonePerturbation(pert) {
  if (!Array.isArray(pert)) return null;
  return pert.map((ch) => ch.map((row) => row.slice()));
}

export function isZeroPerturbation(pert) {
  if (!Array.isArray(pert)) return true;
  for (let ch = 0; ch < pert.length; ch++) {
    for (let r = 0; r < pert[ch].length; r++) {
      for (let c = 0; c < pert[ch][r].length; c++) {
        if (pert[ch][r][c] !== 0) return false;
      }
    }
  }
  return true;
}

function getLatLonArrays(grid) {
  const lat = Array.isArray(grid?.lat) && grid.lat.length === GRID.rows
    ? grid.lat
    : Array.from({ length: GRID.rows }, (_, i) => GRID.latMin + i);
  const lon = Array.isArray(grid?.lon) && grid.lon.length === GRID.cols
    ? grid.lon
    : Array.from({ length: GRID.cols }, (_, i) => GRID.lonMin + i);
  return { lat, lon };
}

/**
 * Build a [6, 32, 36] physical delta from initStates[-1] without mutating initStates.
 */
export function buildPresetPerturbation(presetId, initStates, grid = null) {
  if (!Array.isArray(initStates) || initStates.length !== 3) {
    throw new Error("Cannot build preset perturbation without a valid 3-day initial state.");
  }
  const lastDay = initStates[2];
  const delta = createZeroPerturbation();
  const { lat, lon } = getLatLonArrays(grid);

  if (presetId === "warm_ocean") {
    const box = SHOCK_PRESETS.warm_ocean;
    for (let r = 0; r < GRID.rows; r++) {
      if (lat[r] < box.latMin || lat[r] > box.latMax) continue;
      for (let c = 0; c < GRID.cols; c++) {
        if (lon[c] < box.lonMin || lon[c] > box.lonMax) continue;
        delta[0][r][c] = 3.0;
        delta[5][r][c] = 0.15 * lastDay[5][r][c];
      }
    }
    return delta;
  }

  if (presetId === "monsoon_stall") {
    const box = SHOCK_PRESETS.monsoon_stall;
    for (let r = 0; r < GRID.rows; r++) {
      if (lat[r] < box.latMin || lat[r] > box.latMax) continue;
      for (let c = 0; c < GRID.cols; c++) {
        if (lon[c] < box.lonMin || lon[c] > box.lonMax) continue;
        delta[2][r][c] = -0.40 * lastDay[2][r][c];
        delta[3][r][c] = -0.40 * lastDay[3][r][c];
      }
    }
    return delta;
  }

  throw new Error(`Unknown shock preset: ${presetId}`);
}

/**
 * Apply a brush stamp at (row, col) to a cloned [6, 32, 36] perturbation.
 */
export function applyBrushToPerturbation(
  perturbation,
  initStates,
  { row, col, channelIndex = 0, op = "add", value = 0, radiusCells = 0, shape = "box" }
) {
  if (!Array.isArray(initStates) || initStates.length !== 3) {
    throw new Error("Cannot apply shock brush without a valid initial state.");
  }
  if (!Number.isInteger(row) || row < 0 || row >= GRID.rows || !Number.isInteger(col) || col < 0 || col >= GRID.cols) {
    throw new Error(`Brush centre (${row}, ${col}) is outside the ${GRID.rows}x${GRID.cols} grid.`);
  }
  if (!Number.isInteger(channelIndex) || channelIndex < 0 || channelIndex >= 6) {
    throw new Error(`Invalid channelIndex ${channelIndex}.`);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Brush value must be a finite number.");
  }

  const out = perturbation ? clonePerturbation(perturbation) : createZeroPerturbation();
  const lastDay = initStates[2][channelIndex];
  const rad = Math.max(0, Math.min(10, Math.trunc(Number(radiusCells) || 0)));
  const reach = shape === "gaussian" ? Math.max(1, rad * 2) : rad;
  const sigma = Math.max(0.75, rad);

  for (let r = Math.max(0, row - reach); r <= Math.min(GRID.rows - 1, row + reach); r++) {
    for (let c = Math.max(0, col - reach); c <= Math.min(GRID.cols - 1, col + reach); c++) {
      const dr = r - row;
      const dc = c - col;
      let weight = 0;
      if (shape === "gaussian") {
        weight = Math.exp(-(dr * dr + dc * dc) / (2 * sigma * sigma));
      } else {
        weight = Math.max(Math.abs(dr), Math.abs(dc)) <= rad ? 1 : 0;
      }
      if (weight <= 0) continue;

      const deltaVal = op === "scale_pct"
        ? (value / 100) * lastDay[r][c] * weight
        : value * weight;
      out[channelIndex][r][c] += deltaVal;
    }
  }
  return out;
}

/**
 * Apply a rectangular box shock [rowMin..rowMax, colMin..colMax] (inclusive).
 */
export function applyBoxToPerturbation(
  perturbation,
  initStates,
  { rowMin, rowMax, colMin, colMax, channelIndex = 0, op = "add", value = 0 }
) {
  if (!Array.isArray(initStates) || initStates.length !== 3) {
    throw new Error("Cannot apply box shock without a valid initial state.");
  }
  if (!Number.isInteger(channelIndex) || channelIndex < 0 || channelIndex >= 6) {
    throw new Error(`Invalid channelIndex ${channelIndex}.`);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Box shock value must be a finite number.");
  }
  const r0 = Math.max(0, Math.min(rowMin, rowMax));
  const r1 = Math.min(GRID.rows - 1, Math.max(rowMin, rowMax));
  const c0 = Math.max(0, Math.min(colMin, colMax));
  const c1 = Math.min(GRID.cols - 1, Math.max(colMin, colMax));

  const out = perturbation ? clonePerturbation(perturbation) : createZeroPerturbation();
  const lastDay = initStates[2][channelIndex];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      out[channelIndex][r][c] += op === "scale_pct" ? (value / 100) * lastDay[r][c] : value;
    }
  }
  return out;
}

export function validatePerturbation(pert) {
  if (pert === null || pert === undefined) return { ok: true };
  if (!Array.isArray(pert) || pert.length !== 6) {
    return { ok: false, error: "Perturbation must be null or [6, 32, 36]." };
  }
  for (let ch = 0; ch < 6; ch++) {
    if (!Array.isArray(pert[ch]) || pert[ch].length !== GRID.rows) {
      return { ok: false, error: `Perturbation channel ${ch} must have ${GRID.rows} rows.` };
    }
    for (let r = 0; r < GRID.rows; r++) {
      const row = pert[ch][r];
      if (!Array.isArray(row) || row.length !== GRID.cols) {
        return { ok: false, error: `Perturbation row [${ch}][${r}] must have ${GRID.cols} cols.` };
      }
      for (let c = 0; c < GRID.cols; c++) {
        if (typeof row[c] !== "number" || !Number.isFinite(row[c])) {
          return { ok: false, error: `Non-finite perturbation at [${ch}][${r}][${c}].` };
        }
      }
    }
  }
  return { ok: true };
}

export function validateSimulationPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Simulation payload must be an object." };
  }
  const caseCheck = validateCaseData({
    doy_sincos: payload.doy_sincos,
    init_states: payload.init_states,
  });
  if (!caseCheck.ok) return caseCheck;

  const s = payload.steps;
  if (!Number.isInteger(s) || s < MIN_STEPS || s > MAX_STEPS) {
    return { ok: false, error: `steps must be an integer between ${MIN_STEPS} and ${MAX_STEPS}.` };
  }
  return validatePerturbation(payload.perturbation);
}

export function buildSimulatePayload({ activeCase, steps, perturbation = null }) {
  const payload = {
    init_states: cloneInitStates(activeCase?.init_states),
    doy_sincos: Array.isArray(activeCase?.doy_sincos) ? activeCase.doy_sincos.slice(0, 2) : null,
    steps: Math.trunc(Number(steps)),
    perturbation: perturbation ? clonePerturbation(perturbation) : null,
  };
  const check = validateSimulationPayload(payload);
  if (!check.ok) {
    throw new Error(check.error);
  }
  return payload;
}

/**
 * Input limits for custom shocks. They keep a mistyped number from being sent; they are not a statement about
 * which shocks the model handles well. [min, max] for "add" (physical units) and "scale_pct" (percent of the cell).
 */
export const CUSTOM_LIMITS = Object.freeze([
  { add: [-20, 20], scale_pct: [-5, 5] },          // t2m, K
  { add: [-300, 300], scale_pct: [-100, 500] },    // tp, mm/day
  { add: [-30, 30], scale_pct: [-100, 200] },      // u10, m/s
  { add: [-30, 30], scale_pct: [-100, 200] },      // v10, m/s
  { add: [-5000, 5000], scale_pct: [-3, 3] },      // msl, Pa
  { add: [-40, 40], scale_pct: [-100, 100] },      // tcwv, kg/m2
]);
// The server's physical limits (docs, guards): a shocked input outside them is moved to the limit before forecasting.
const STATE_LIMITS = [[233.2, 333.1], [0, 1000], [-60, 60], [-60, 60], [85000, 110000], [0, 100]];

/**
 * Add one component to a perturbation [6][32][36] (a physical delta on the last input day), without mutating inputs.
 * spec: { channelIndex, op: "add"|"scale_pct", value, shape: "rectangle"|"smooth",
 *         latMin, latMax, lonMin, lonMax  (rectangle),  lat, lon, radiusCells  (smooth) }
 * Returns { perturbation, cells, clampedCells }. Throws Error with a message for the user.
 */
export function addShockComponent(perturbation, initStates, spec, grid = null) {
  const { channelIndex: ch, op, value, shape } = spec;
  if (!Number.isInteger(ch) || ch < 0 || ch > 5) throw new Error("Choose a variable.");
  if (op !== "add" && op !== "scale_pct") throw new Error("Choose an operation.");
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Enter a number for the size of the change.");
  const [lo, hi] = CUSTOM_LIMITS[ch][op];
  if (value < lo || value > hi) throw new Error(`The change must be between ${lo} and ${hi} for this variable.`);
  if (value === 0) throw new Error("A change of 0 does nothing. Use None / Clear for no shock.");
  const { lat, lon } = getLatLonArrays(grid);
  const inRange = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
  let out;
  if (shape === "rectangle") {
    const { latMin, latMax, lonMin, lonMax } = spec;
    if (![latMin, latMax, lonMin, lonMax].every(Number.isFinite) || latMin > latMax || lonMin > lonMax) {
      throw new Error("Enter a latitude range and a longitude range (from ≤ to).");
    }
    const rows = lat.map((v, i) => i).filter((i) => lat[i] >= latMin && lat[i] <= latMax);
    const cols = lon.map((v, i) => i).filter((i) => lon[i] >= lonMin && lon[i] <= lonMax);
    if (!rows.length || !cols.length) throw new Error("No grid cell centre lies in that rectangle (6.5–37.5°N, 65.5–100.5°E).");
    out = applyBoxToPerturbation(perturbation, initStates, {
      rowMin: rows[0], rowMax: rows[rows.length - 1], colMin: cols[0], colMax: cols[cols.length - 1],
      channelIndex: ch, op, value,
    });
  } else if (shape === "smooth") {
    if (!inRange(spec.lat, lat[0] - 0.5, lat[lat.length - 1] + 0.5) || !inRange(spec.lon, lon[0] - 0.5, lon[lon.length - 1] + 0.5)) {
      throw new Error("The centre must be on the grid (6.5–37.5°N, 65.5–100.5°E). Click the map to set it.");
    }
    if (!Number.isInteger(spec.radiusCells) || spec.radiusCells < 1 || spec.radiusCells > 10) {
      throw new Error("The radius must be a whole number of cells from 1 to 10.");
    }
    const nearest = (axis, v) => axis.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(axis[best] - v) ? i : best), 0);
    out = applyBrushToPerturbation(perturbation, initStates, {
      row: nearest(lat, spec.lat), col: nearest(lon, spec.lon), channelIndex: ch, op, value,
      radiusCells: spec.radiusCells, shape: "gaussian",
    });
  } else {
    throw new Error("Choose a shape.");
  }
  let cells = 0;
  let clampedCells = 0;
  const before = perturbation;
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      if (out[ch][r][c] !== (before ? before[ch][r][c] : 0)) cells++;
      const shocked = initStates[2][ch][r][c] + out[ch][r][c];
      if (out[ch][r][c] !== 0 && (shocked < STATE_LIMITS[ch][0] || shocked > STATE_LIMITS[ch][1])) clampedCells++;
    }
  }
  return { perturbation: out, cells, clampedCells };
}
