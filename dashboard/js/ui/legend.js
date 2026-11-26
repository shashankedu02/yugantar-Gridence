/**
 * MonsoonTwin UI Module — Colour Legend
 * Contract: renderLegend(el, data, options?)
 * Uses shared colour-mapping implementation in ./colormap.js.
 */

import { RAIN_BINS, buildLegendCss, toFiniteNumber } from "./colormap.js";

function formatTick(val) {
  const n = toFiniteNumber(val);
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs === 0) return "0";
  if (abs >= 100) return String(Math.round(n));
  if (abs >= 10) return n.toFixed(1).replace(/\.0$/, "");
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Render a scientific colour-bar legend into `el`.
 * @param {HTMLElement} el
 * @param {{channel?: string, unit?: string, min?: number, max?: number, ramp?: string | Array}} data
 * @param {{bins?: number[], symmetric?: boolean, labels?: string[]}} [options]
 */
export function renderLegend(el, data, options = {}) {
  if (!(el instanceof Element)) return;
  el.innerHTML = "";

  const root = document.createElement("div");
  root.className = "mt-legend";

  if (!data || typeof data !== "object") {
    const empty = document.createElement("div");
    empty.className = "mt-legend-head";
    empty.textContent = "Legend unavailable";
    root.appendChild(empty);
    el.appendChild(root);
    return;
  }

  const channel = typeof data.channel === "string" && data.channel ? data.channel : "Field";
  const unit = typeof data.unit === "string" ? data.unit : "";
  const ramp = data.ramp;

  let min = toFiniteNumber(data.min);
  let max = toFiniteNumber(data.max);
  // Rain uses fixed bins. Any other scale without a real range is reported as unavailable, never assumed.
  if ((min === null || max === null) && ramp !== "rain") {
    const empty = document.createElement("div");
    empty.className = "mt-legend-head";
    empty.textContent = `${channel}: colour scale unavailable`;
    root.appendChild(empty);
    el.appendChild(root);
    return;
  }

  const isSymmetric = Boolean(options?.symmetric || ramp === "balance" || ramp === "diff");
  if (isSymmetric) {
    const absMax = Math.max(Math.abs(min), Math.abs(max), 1e-6);
    min = -absMax;
    max = absMax;
  }

  const head = document.createElement("div");
  head.className = "mt-legend-head";

  const titleEl = document.createElement("span");
  titleEl.textContent = channel;

  const unitEl = document.createElement("span");
  unitEl.className = "mt-mono";
  unitEl.textContent = unit;

  head.append(titleEl, unitEl);

  const bar = document.createElement("div");
  bar.className = "mt-legend-bar";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", `${channel} colour scale from ${formatTick(min)} to ${formatTick(max)} ${unit}`.trim());
  bar.style.background = buildLegendCss({ min, max, ramp, bins: options?.bins, symmetric: isSymmetric });

  const ticksEl = document.createElement("div");
  ticksEl.className = "mt-legend-ticks mt-mono";

  let tickLabels;
  if (Array.isArray(options?.labels) && options.labels.length >= 2) {
    tickLabels = options.labels.map(String);
  } else if (ramp === "rain") {
    const bins = Array.isArray(options?.bins) && options.bins.length >= 2 ? options.bins : RAIN_BINS;
    tickLabels = ["<1", ...bins.map((v) => formatTick(v))];
  } else if (Array.isArray(options?.bins) && options.bins.length >= 2) {
    tickLabels = options.bins.map((v) => formatTick(v));
  } else if (isSymmetric) {
    tickLabels = [formatTick(min), formatTick(min / 2), "0", formatTick(max / 2), formatTick(max)];
  } else {
    const step = (max - min) / 4;
    tickLabels = [0, 1, 2, 3, 4].map((i) => formatTick(min + step * i));
  }

  for (const label of tickLabels) {
    const span = document.createElement("span");
    span.textContent = label;
    ticksEl.appendChild(span);
  }

  root.append(head, bar, ticksEl);
  el.appendChild(root);
}
