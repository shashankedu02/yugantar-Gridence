/**
 * Colour-scale ranges. Pure functions (no DOM). They choose only HOW values are coloured; values are never changed.
 *
 * "run" mode fits the range to the data of the forecast on screen, and keeps it the same for every lead day and for
 * baseline and scenario, so frames and views can be compared. "fixed" mode uses the same range for every run.
 * Anything outside the range is drawn in the end colour and counted, so the legend can say so.
 */
import { CHANNELS, GRID } from "./config.js";

/** A fitted difference range is never narrower than this (physical units), so numerical noise is not blown up. */
export const DIFF_MIN_SPAN = Object.freeze([0.5, 2, 1, 1, 50, 2]);
const DIVERGING = new Set([2, 3]); // signed wind components: zero must be the neutral colour

/** Round away from zero to 1, 2, 2.5 or 5 times a power of ten. */
export function niceCeil(x) {
  if (!(x > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 2.5, 4, 5, 8, 10]) if (x <= m * p * (1 + 1e-9)) return Number((m * p).toPrecision(6));
  return 10 * p;
}

/** [lo, hi] widened outward to a multiple of a readable step (about a quarter of the span). */
export function niceBounds(lo, hi) {
  const span = hi - lo > 1e-9 ? hi - lo : Math.max(1, Math.abs(hi) * 0.01);
  const p = 10 ** Math.floor(Math.log10(span / 4));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= span / 8) ?? 10 * p;
  const a = Math.floor(lo / step + 1e-9) * step;
  let b = Math.ceil(hi / step - 1e-9) * step;
  if (b <= a) b = a + step;
  return [Number(a.toPrecision(8)), Number(b.toPrecision(8))];
}

/** Sorted finite values of one channel over every day of every rollout given. */
export function channelValues(rollouts, channel) {
  const out = [];
  for (const rollout of rollouts) {
    if (!rollout) continue;
    for (const day of rollout) {
      for (let r = 0; r < GRID.rows; r++) {
        for (let c = 0; c < GRID.cols; c++) {
          const v = day[channel][r][c];
          if (Number.isFinite(v)) out.push(v);
        }
      }
    }
  }
  return Float64Array.from(out).sort();
}

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, q * (sorted.length - 1)));
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function clippedShare(values, min, max) {
  if (!values.length) return 0;
  let n = 0;
  for (const v of values) if (v < min - 1e-9 || v > max + 1e-9) n++;
  return n / values.length;
}

/**
 * Range for a value view (forecast or input field).
 * rollouts: list of [days][6][32][36] arrays that must share one scale.
 */
export function valueScale(channel, rollouts, mode = "run") {
  const spec = CHANNELS[channel];
  const base = { channel: spec.id, unit: spec.unit };
  if (spec.ramp === "rain") return { ...base, min: 0, max: 115, ramp: "rain", fitted: false, clipped: 0 }; // fixed bands
  const values = channelValues(rollouts, channel);
  let min = spec.min;
  let max = spec.max;
  let fitted = false;
  if (mode === "run" && values.length) {
    const lo = quantile(values, 0.01);
    const hi = quantile(values, 0.99);
    if (DIVERGING.has(channel)) {
      max = niceCeil(Math.max(Math.abs(lo), Math.abs(hi), 1));
      min = -max;
    } else {
      [min, max] = niceBounds(lo, hi);
    }
    fitted = true;
  }
  return { ...base, min, max, ramp: spec.ramp, fitted, clipped: clippedShare(values, min, max) };
}

/** Symmetric range for scenario − baseline (or for the shock delta itself). */
export function differenceScale(channel, rollouts, mode = "run") {
  const spec = CHANNELS[channel];
  const values = channelValues(rollouts, channel);
  const magnitudes = Float64Array.from(values, Math.abs).sort();
  const largest = magnitudes.length ? magnitudes[magnitudes.length - 1] : 0;
  let limit = spec.diffMax;
  let fitted = false;
  if (mode === "run" && magnitudes.length) {
    limit = Math.max(DIFF_MIN_SPAN[channel], niceCeil(quantile(magnitudes, 0.995)));
    fitted = true;
  }
  return {
    channel: spec.id, unit: spec.unit, min: -limit, max: limit, ramp: "balance", fitted, largest,
    clipped: clippedShare(values, -limit, limit),
  };
}
