/**
 * Gridence UI Module — Colour Legend
 * Contract: renderLegend(el, data, options?)
 * Uses the same colour mapping as the map (./colormap.js). Every label is positioned at the exact place on the bar
 * where its value is drawn: for rain, at the boundary between two colour bands.
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

/** [{text, at}] with `at` in 0..1 along the bar. */
export function legendTicks({ min, max, ramp }, { bins, labels, symmetric = false } = {}) {
  const even = (texts) => texts.map((text, i) => ({ text, at: texts.length > 1 ? i / (texts.length - 1) : 0.5 }));
  if (Array.isArray(labels) && labels.length >= 2) return even(labels.map(String));
  if (ramp === "rain") {
    const edges = Array.isArray(bins) && bins.length >= 2 ? bins : RAIN_BINS;
    const bands = edges.length + 1; // the dry band plus one per bin
    return [{ text: "<1", at: 0.5 / bands }, ...edges.map((v, i) => ({ text: formatTick(v), at: (i + 1) / bands }))];
  }
  if (Array.isArray(bins) && bins.length >= 2) return even(bins.map(formatTick));
  if (symmetric) return even([formatTick(min), formatTick(min / 2), "0", formatTick(max / 2), formatTick(max)]);
  const step = (max - min) / 4;
  return even([0, 1, 2, 3, 4].map((i) => formatTick(min + step * i)));
}

/**
 * Render a colour-bar legend into `el`.
 * @param {HTMLElement} el
 * @param {{channel?: string, unit?: string, min?: number, max?: number, ramp?: string | Array}} data
 * @param {{bins?: number[], symmetric?: boolean, labels?: string[], orientation?: "horizontal"|"vertical", title?: string}} [options]
 */
export function renderLegend(el, data, options = {}) {
  if (!(el instanceof Element)) return;
  el.replaceChildren();

  const root = document.createElement("div");
  const vertical = options.orientation === "vertical";
  root.className = vertical ? "mt-legend mt-legend--vertical" : "mt-legend";

  const unavailable = (text) => {
    const empty = document.createElement("div");
    empty.className = "mt-legend-head";
    empty.textContent = text;
    root.appendChild(empty);
    el.appendChild(root);
  };
  if (!data || typeof data !== "object") return unavailable("Legend unavailable");

  const channel = typeof data.channel === "string" && data.channel ? data.channel : "Field";
  const unit = typeof data.unit === "string" ? data.unit : "";
  const ramp = data.ramp;

  let min = toFiniteNumber(data.min);
  let max = toFiniteNumber(data.max);
  // Rain uses fixed bins. Any other scale without a real range is reported as unavailable, never assumed.
  if ((min === null || max === null) && ramp !== "rain") return unavailable(`${channel}: colour scale unavailable`);

  const symmetric = Boolean(options.symmetric || ramp === "balance" || ramp === "diff");
  if (symmetric) {
    const absMax = Math.max(Math.abs(min), Math.abs(max), 1e-6);
    min = -absMax;
    max = absMax;
  }

  const head = document.createElement("div");
  head.className = "mt-legend-head";
  const titleEl = document.createElement("span");
  titleEl.textContent = options.title || channel;
  const unitEl = document.createElement("span");
  unitEl.className = "mt-legend-unit";
  unitEl.textContent = unit;
  head.append(titleEl, unitEl);

  const body = document.createElement("div");
  body.className = "mt-legend-body";
  const bar = document.createElement("div");
  bar.className = "mt-legend-bar";
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", `${channel} colour scale from ${formatTick(min)} to ${formatTick(max)} ${unit}`.trim());
  const css = buildLegendCss({ min, max, ramp, bins: options.bins, symmetric });
  bar.style.background = vertical ? css.replace("90deg", "0deg") : css;

  const ticksEl = document.createElement("div");
  ticksEl.className = "mt-legend-ticks";
  ticksEl.style.position = "relative";
  if (!vertical) ticksEl.style.cssText = "position:relative;display:block;height:15px;";
  for (const { text, at } of legendTicks({ min, max, ramp }, { ...options, symmetric })) {
    const span = document.createElement("span");
    span.textContent = text;
    span.style.position = "absolute";
    span.style.whiteSpace = "nowrap";
    const pct = `${(at * 100).toFixed(3)}%`;
    if (vertical) {
      span.style.bottom = pct;
      span.style.transform = `translateY(${at <= 0.001 ? "0" : at >= 0.999 ? "100%" : "50%"})`;
    } else {
      span.style.left = pct;
      span.style.transform = `translateX(${at <= 0.001 ? "0" : at >= 0.999 ? "-100%" : "-50%"})`;
    }
    ticksEl.appendChild(span);
  }

  body.append(bar, ticksEl);
  root.append(head, body);
  el.appendChild(root);
}
