/**
 * Application state store, synthetic initial-state generator, and view selectors.
 * W2-owned module.
 */

import { DEFAULT_STEPS, GRID, MAX_STEPS, MIN_STEPS } from "./config.js";

export const VIEWS = Object.freeze(["baseline", "scenario", "difference"]);

function makeZeroGrid(rows = GRID.rows, cols = GRID.cols) {
  return Array.from({ length: rows }, () => new Array(cols).fill(0));
}

export function cloneInitStates(initStates) {
  if (!Array.isArray(initStates)) return null;
  return initStates.map((day) =>
    day.map((ch) => ch.map((row) => row.slice()))
  );
}

/**
 * Deterministic synthetic 3-day initial state [3, 6, 32, 36] in physical units.
 * Used ONLY when no W1 demo case exists in dashboard/cases/*.json.
 */
export function buildSyntheticCase() {
  const rows = GRID.rows;
  const cols = GRID.cols;
  const days = 3;
  const initStates = Array.from({ length: days }, (_, d) => {
    const t2m = makeZeroGrid(rows, cols);
    const tp = makeZeroGrid(rows, cols);
    const u10 = makeZeroGrid(rows, cols);
    const v10 = makeZeroGrid(rows, cols);
    const msl = makeZeroGrid(rows, cols);
    const tcwv = makeZeroGrid(rows, cols);

    for (let r = 0; r < rows; r++) {
      const lat = GRID.latMin + r;
      const southFactor = (GRID.latMax - lat) / (GRID.latMax - GRID.latMin);
      for (let c = 0; c < cols; c++) {
        const lon = GRID.lonMin + c;
        const wave = Math.sin((r * 0.25) + (c * 0.18) + d * 0.2);
        const monsoonBelt = Math.exp(-Math.pow((lat - 16.0) / 7.5, 2));

        t2m[r][c] = Number((284.0 + 17.5 * southFactor + 1.5 * wave).toFixed(3));
        tp[r][c] = Number(Math.max(0, 1.5 + 10.0 * monsoonBelt * Math.max(0, Math.cos((lon - 76.0) * 0.12) + 0.3 * wave)).toFixed(3));
        u10[r][c] = Number((1.0 + 8.5 * monsoonBelt + 1.2 * Math.sin(c * 0.2 + d * 0.15)).toFixed(3));
        v10[r][c] = Number((0.5 + 4.5 * monsoonBelt + 0.9 * Math.cos(r * 0.2 - d * 0.15)).toFixed(3));
        msl[r][c] = Number((100950 - 450 * monsoonBelt + 120 * wave).toFixed(2));
        tcwv[r][c] = Number((22.0 + 28.0 * southFactor + 8.0 * monsoonBelt + 2.0 * wave).toFixed(3));
      }
    }
    return [t2m, tp, u10, v10, msl, tcwv];
  });

  const doy = 180;
  const angle = (2 * Math.PI * doy) / 365;
  return {
    id: "synthetic",
    label: "SYNTHETIC TEST INPUT",
    date_label: "SYNTHETIC TEST INPUT (Nominal DOY 180)",
    isSynthetic: true,
    doy_sincos: [Math.sin(angle), Math.cos(angle)],
    init_states: initStates,
  };
}

export function validateCaseData(c) {
  if (!c || typeof c !== "object") return { ok: false, error: "Case object is missing." };
  if (!Array.isArray(c.doy_sincos) || c.doy_sincos.length !== 2) {
    return { ok: false, error: "Case doy_sincos must be [sin, cos]." };
  }
  const [s, co] = c.doy_sincos;
  if (!Number.isFinite(s) || !Number.isFinite(co) || Math.abs(s * s + co * co - 1) > 0.05) {
    return { ok: false, error: "Case doy_sincos is not a valid unit sin/cos pair." };
  }
  const st = c.init_states;
  if (!Array.isArray(st) || st.length !== 3) {
    return { ok: false, error: "Case init_states must have 3 days." };
  }
  for (let d = 0; d < 3; d++) {
    if (!Array.isArray(st[d]) || st[d].length !== 6) {
      return { ok: false, error: `Case init_states[${d}] must have 6 channels.` };
    }
    for (let ch = 0; ch < 6; ch++) {
      if (!Array.isArray(st[d][ch]) || st[d][ch].length !== GRID.rows) {
        return { ok: false, error: `Case init_states[${d}][${ch}] must have ${GRID.rows} rows.` };
      }
      for (let r = 0; r < GRID.rows; r++) {
        const row = st[d][ch][r];
        if (!Array.isArray(row) || row.length !== GRID.cols) {
          return { ok: false, error: `Case init_states[${d}][${ch}][${r}] must have ${GRID.cols} cols.` };
        }
        for (let col = 0; col < GRID.cols; col++) {
          if (typeof row[col] !== "number" || !Number.isFinite(row[col])) {
            return { ok: false, error: `Non-finite value in init_states[${d}][${ch}][${r}][${col}].` };
          }
        }
      }
    }
  }
  return { ok: true };
}

export function computeDifferenceRollout(baselineRollout, scenarioRollout) {
  if (!Array.isArray(baselineRollout) || !Array.isArray(scenarioRollout)) return null;
  const steps = Math.min(baselineRollout.length, scenarioRollout.length);
  if (steps === 0) return null;
  const diff = new Array(steps);
  for (let k = 0; k < steps; k++) {
    diff[k] = new Array(6);
    for (let ch = 0; ch < 6; ch++) {
      diff[k][ch] = new Array(GRID.rows);
      for (let r = 0; r < GRID.rows; r++) {
        const bRow = baselineRollout[k]?.[ch]?.[r];
        const sRow = scenarioRollout[k]?.[ch]?.[r];
        if (!bRow || !sRow) return null;
        const outRow = new Array(GRID.cols);
        for (let c = 0; c < GRID.cols; c++) {
          outRow[c] = sRow[c] - bRow[c];
        }
        diff[k][ch][r] = outRow;
      }
    }
  }
  return diff;
}

export function getActiveField(state) {
  const { view, dayIndex, channelIndex, baseline, scenario, difference } = state;
  let source = null;
  if (view === "baseline") source = baseline?.rollout || null;
  else if (view === "scenario") source = scenario?.rollout || null;
  else if (view === "difference") source = difference || null;

  if (!source || dayIndex < 0 || dayIndex >= source.length) return null;
  return source[dayIndex]?.[channelIndex] || null;
}

export function createStore() {
  const synthetic = buildSyntheticCase();
  const state = {
    health: null,
    meta: null,
    cases: [synthetic],
    activeCase: synthetic,
    steps: DEFAULT_STEPS,
    view: "baseline",
    channelIndex: 0,
    dayIndex: 0,
    selectedCell: null,
    playing: false,
    shock: {
      presetId: "none",
      perturbation: null,
      brush: {
        channelIndex: 0,
        op: "add",
        value: 3.0,
        radiusCells: 2,
        shape: "box",
      },
    },
    baseline: null,
    scenario: null,
    difference: null,
    climatology: null,
    runLog: [],
    error: null,
  };

  const listeners = new Set();

  function notify() {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        // Keep subscribers isolated.
      }
    }
  }

  return {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setMeta(meta) {
      state.meta = meta;
      notify();
    },
    setHealth(health) {
      state.health = health;
      notify();
    },
    setCases(caseList) {
      const valid = (caseList || []).filter((c) => validateCaseData(c).ok);
      state.cases = valid.length > 0 ? valid : [buildSyntheticCase()];
      state.activeCase = state.cases[0];
      state.baseline = null;
      state.scenario = null;
      state.difference = null;
      state.dayIndex = 0;
      notify();
    },
    selectCase(caseId) {
      const found = state.cases.find((c) => c.id === caseId);
      if (!found) return false;
      state.activeCase = found;
      state.baseline = null;
      state.scenario = null;
      state.difference = null;
      state.dayIndex = 0;
      notify();
      return true;
    },
    setSteps(steps) {
      const n = Math.trunc(Number(steps));
      if (!Number.isFinite(n)) return;
      state.steps = Math.max(MIN_STEPS, Math.min(MAX_STEPS, n));
      if (state.dayIndex >= state.steps) state.dayIndex = state.steps - 1;
      notify();
    },
    setView(view) {
      if (!VIEWS.includes(view)) return;
      state.view = view;
      notify();
    },
    setChannelIndex(idx) {
      if (idx >= 0 && idx < 6) {
        state.channelIndex = idx;
        notify();
      }
    },
    setDayIndex(idx) {
      const maxDay = Math.max(0, (state.baseline?.rollout?.length || state.steps) - 1);
      state.dayIndex = Math.max(0, Math.min(maxDay, Math.trunc(idx)));
      notify();
    },
    setSelectedCell(cell) {
      state.selectedCell = cell ? { row: cell.row, col: cell.col } : null;
      notify();
    },
    setPlaying(playing) {
      state.playing = Boolean(playing);
      notify();
    },
    setShock(presetId, perturbation) {
      state.shock.presetId = presetId;
      state.shock.perturbation = perturbation;
      notify();
    },
    updateBrush(patch) {
      Object.assign(state.shock.brush, patch);
      notify();
    },
    setBaselineResult(result) {
      state.baseline = result;
      state.difference = computeDifferenceRollout(state.baseline?.rollout, state.scenario?.rollout);
      if (result?.rollout?.length && state.dayIndex >= result.rollout.length) {
        state.dayIndex = result.rollout.length - 1;
      }
      notify();
    },
    setScenarioResult(result) {
      state.scenario = result;
      state.difference = computeDifferenceRollout(state.baseline?.rollout, state.scenario?.rollout);
      notify();
    },
    clearScenarioResult() {
      state.scenario = null;
      state.difference = null;
      if (state.view !== "baseline") state.view = "baseline";
      notify();
    },
    setClimatology(clim) {
      state.climatology = clim;
      notify();
    },
    appendRunLog(entry) {
      state.runLog = [entry, ...state.runLog].slice(0, 25);
      notify();
    },
    setError(message) {
      state.error = message || null;
      notify();
    },
  };
}
