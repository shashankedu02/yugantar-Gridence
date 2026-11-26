/**
 * MonsoonTwin UI Module — Time Series & Diagnostic Charts
 * Contract (dashboard/README.md):
 *   - renderSeries(el, data, options?)
 *   - renderEnergyByDistance(el, data, options?)
 * Pure presentational ES module using dependency-free SVG.
 * Strict null/undefined/NaN handling: breaks paths at missing points, never interpolates across gaps.
 */

import { toFiniteNumber } from "./colormap.js";
export { renderEnergyByDistance } from "./energy.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  if (text !== null) node.textContent = String(text);
  return node;
}

function seriesColor(name, idx) {
  const lower = String(name || "").toLowerCase();
  if (lower.includes("scenario") || lower.includes("shock")) return "#F4A261";
  if (lower.includes("clim")) return "#94A3B8";
  if (lower.includes("base") || idx === 0) return "#2EC4B6";
  return idx === 1 ? "#F4A261" : "#94A3B8";
}

function buildSegmentedPaths(values, toX, toY) {
  const segments = [];
  const isolatedPoints = [];
  let current = [];

  for (let i = 0; i < values.length; i++) {
    const v = toFiniteNumber(values[i]);
    if (v === null) {
      if (current.length === 1) isolatedPoints.push(current[0]);
      if (current.length >= 2) segments.push(current);
      current = [];
      continue;
    }
    current.push([toX(i), toY(v)]);
  }
  if (current.length === 1) isolatedPoints.push(current[0]);
  if (current.length >= 2) segments.push(current);

  const d = segments
    .map((seg) => seg.map(([x, y], idx) => `${idx === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" "))
    .join(" ");

  return { d, isolatedPoints };
}

/**
 * Render multi-series time series into `el`.
 * @param {HTMLElement} el
 * @param {{labels?: Array<string|number>, series?: Array<{name: string, values: Array<number|null>, lower?: Array<number|null>, upper?: Array<number|null>}>, unit?: string}} data
 * @param {{activeIndex?: number}} [options]
 */
export function renderSeries(el, data, options = {}) {
  if (!(el instanceof Element)) return;
  el.innerHTML = "";

  const labels = Array.isArray(data?.labels) ? data.labels : [];
  const rawSeries = Array.isArray(data?.series) ? data.series : [];
  const unit = typeof data?.unit === "string" ? data.unit : "";

  const allNums = [];
  for (const s of rawSeries) {
    if (!s || !Array.isArray(s.values)) continue;
    for (const v of s.values) { const n = toFiniteNumber(v); if (n !== null) allNums.push(n); }
    if (Array.isArray(s.lower)) for (const v of s.lower) { const n = toFiniteNumber(v); if (n !== null) allNums.push(n); }
    if (Array.isArray(s.upper)) for (const v of s.upper) { const n = toFiniteNumber(v); if (n !== null) allNums.push(n); }
  }

  const maxLen = Math.max(labels.length, ...rawSeries.map((s) => (Array.isArray(s?.values) ? s.values.length : 0)), 0);
  if (maxLen === 0 || allNums.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mt-impact-meta";
    empty.textContent = "No time-series data available.";
    el.appendChild(empty);
    return;
  }

  let minV = Math.min(...allNums);
  let maxV = Math.max(...allNums);
  if (Math.abs(maxV - minV) < 1e-6) {
    minV -= 1;
    maxV += 1;
  }

  const W = 460;
  const H = 160;
  const padL = 42;
  const padR = 14;
  const padT = 24;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toX = (i) => (maxLen === 1 ? padL + plotW / 2 : padL + (i / (maxLen - 1)) * plotW);
  const toY = (v) => padT + plotH - ((v - minV) / (maxV - minV)) * plotH;

  const svg = svgEl("svg", {
    class: "mt-chart-svg",
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": `Time series chart${unit ? ` in ${unit}` : ""}`
  });

  svg.appendChild(svgEl("line", { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: "#28364F", "stroke-width": 1 }));
  svg.appendChild(svgEl("line", { x1: padL, y1: padT + plotH, x2: padL + plotW, y2: padT + plotH, stroke: "#28364F", "stroke-width": 1 }));

  svg.appendChild(svgEl("text", { x: padL - 6, y: padT + 6, "text-anchor": "end", fill: "#8A99B3", "font-size": 10, "font-family": "monospace" }, maxV.toFixed(1)));
  svg.appendChild(svgEl("text", { x: padL - 6, y: padT + plotH, "text-anchor": "end", fill: "#8A99B3", "font-size": 10, "font-family": "monospace" }, minV.toFixed(1)));

  if (Number.isInteger(options?.activeIndex) && options.activeIndex >= 0 && options.activeIndex < maxLen) {
    const ax = toX(options.activeIndex).toFixed(1);
    svg.appendChild(svgEl("line", { x1: ax, y1: padT, x2: ax, y2: padT + plotH, stroke: "#94A3B8", "stroke-dasharray": "3 3", "stroke-width": 1 }));
  }

  if (unit) {
    svg.appendChild(svgEl("text", { x: W - padR, y: 14, "text-anchor": "end", fill: "#8A99B3", "font-size": 10, "font-family": "monospace" }, unit));
  }

  let legendX = padL + 4;
  rawSeries.forEach((s, idx) => {
    if (!s || !Array.isArray(s.values)) return;
    const color = seriesColor(s.name, idx);
    const isClim = String(s.name || "").toLowerCase().includes("clim");

    // Split ±1σ band at missing indices (no interpolation across gaps)
    if (Array.isArray(s.lower) && Array.isArray(s.upper)) {
      const len = Math.min(s.lower.length, s.upper.length);
      let top = [];
      let bot = [];
      const flushBand = () => {
        if (top.length >= 2) {
          svg.appendChild(svgEl("polygon", {
            points: `${top.join(" ")} ${bot.join(" ")}`,
            fill: color,
            "fill-opacity": "0.14"
          }));
        }
        top = [];
        bot = [];
      };
      for (let i = 0; i < len; i++) {
        const lo = toFiniteNumber(s.lower[i]);
        const hi = toFiniteNumber(s.upper[i]);
        if (lo === null || hi === null) {
          flushBand();
          continue;
        }
        top.push(`${toX(i).toFixed(1)},${toY(hi).toFixed(1)}`);
        bot.unshift(`${toX(i).toFixed(1)},${toY(lo).toFixed(1)}`);
      }
      flushBand();
    }

    const { d, isolatedPoints } = buildSegmentedPaths(s.values, toX, toY);
    if (d) {
      svg.appendChild(svgEl("path", {
        d,
        fill: "none",
        stroke: color,
        "stroke-width": isClim ? 1.5 : 2.2,
        "stroke-dasharray": isClim ? "4 3" : null
      }));
    }
    for (const [px, py] of isolatedPoints) {
      svg.appendChild(svgEl("circle", { cx: px.toFixed(1), cy: py.toFixed(1), r: 3, fill: color }));
    }

    const labelText = String(s.name || `Series ${idx + 1}`);
    svg.appendChild(svgEl("text", {
      x: legendX,
      y: 14,
      fill: color,
      "font-size": 11,
      "font-family": "monospace"
    }, labelText));
    legendX += Math.max(54, labelText.length * 7 + 14);
  });

  if (labels.length > 0) {
    const idxs = labels.length <= 3 ? labels.map((_, i) => i) : [0, Math.floor((labels.length - 1) / 2), labels.length - 1];
    for (const i of idxs) {
      svg.appendChild(svgEl("text", {
        x: toX(i).toFixed(1),
        y: H - 8,
        "text-anchor": "middle",
        fill: "#8A99B3",
        "font-size": 10,
        "font-family": "monospace"
      }, String(labels[i] ?? "")));
    }
  }

  el.appendChild(svg);
}
