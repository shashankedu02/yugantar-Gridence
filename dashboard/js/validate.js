/**
 * Shape and value checks for server responses. Pure functions: each returns "" when the response is usable,
 * otherwise a short reason. A response that fails is never drawn.
 */
import { GRID } from "./config.js";

/** x must be [steps][6][32][36] of finite numbers. */
export function checkRollout(x, steps) {
  if (!Array.isArray(x) || x.length !== steps) {
    return `expected ${steps} lead days, got ${Array.isArray(x) ? x.length : typeof x}`;
  }
  for (let k = 0; k < steps; k++) {
    if (!Array.isArray(x[k]) || x[k].length !== 6) return `day ${k + 1}: expected 6 channels`;
    for (let ch = 0; ch < 6; ch++) {
      if (!Array.isArray(x[k][ch]) || x[k][ch].length !== GRID.rows) {
        return `day ${k + 1}, channel ${ch}: expected ${GRID.rows} rows`;
      }
      for (let r = 0; r < GRID.rows; r++) {
        const row = x[k][ch][r];
        if (!Array.isArray(row) || row.length !== GRID.cols) {
          return `day ${k + 1}, channel ${ch}, row ${r}: expected ${GRID.cols} columns`;
        }
        for (let c = 0; c < GRID.cols; c++) {
          if (typeof row[c] !== "number" || !Number.isFinite(row[c])) {
            return `day ${k + 1}, channel ${ch}: a value is missing or not finite`;
          }
        }
      }
    }
  }
  return "";
}

export function checkHealthResponse(r) {
  return r && r.status === "ready" && typeof r.model_name === "string" ? "" : "the server does not report ready";
}

export function checkMetaResponse(r) {
  if (!r || !r.model || typeof r.model.name !== "string") return "model information is missing";
  if (!Array.isArray(r.grid?.lat) || r.grid.lat.length !== GRID.rows) return "grid latitudes are missing";
  if (!Array.isArray(r.grid?.lon) || r.grid.lon.length !== GRID.cols) return "grid longitudes are missing";
  return "";
}

export function checkSimulateResponse(r, steps) {
  return checkRollout(r?.rollout, steps);
}

export function checkClimatologyResponse(r, steps) {
  return checkRollout(r?.climatology, steps);
}
