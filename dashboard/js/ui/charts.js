/**
 * MonsoonTwin UI Module — Time Series & Diagnostic Charts
 * Contract (dashboard/README.md):
 *   - renderSeries(el, data, options?)
 *   - renderEnergyByDistance(el, data, options?)
 * Pure presentational ES module using dependency-free SVG.
 */

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

function buildSegmentedPath(values, toX, toY) {
  let d = "";
  let penUp = true;
  for (let i = 0; i < values.length; i++) {
    const v = Number(values[i]);
    if (!Number.isFinite(v)) {
      penUp = true;
      continue;
    }
    const cmd = penUp ? "M" : "L";
    d += `${d ? " " : ""}${cmd}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`;
    penUp = false;
  }
  return d;
}

/**
 * Render multi-series time series into `el`.
 * @param {HTMLElement} el
 * @param {{labels?: Array<string|number>, series?: Array<{name: string, values: number[], lower?: number[], upper?: number[]}>, unit?: string}} data
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
    for (const v of s.values) if (Number.isFinite(Number(v))) allNums.push(Number(v));
    if (Array.isArray(s.lower)) for (const v of s.lower) if (Number.isFinite(Number(v))) allNums.push(Number(v));
    if (Array.isArray(s.upper)) for (const v of s.upper) if (Number.isFinite(Number(v))) allNums.push(Number(v));
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

  // Axes
  svg.appendChild(svgEl("line", { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: "#28364F", "stroke-width": 1 }));
  svg.appendChild(svgEl("line", { x1: padL, y1: padT + plotH, x2: padL + plotW, y2: padT + plotH, stroke: "#28364F", "stroke-width": 1 }));

  // Y-axis min/max labels
  svg.appendChild(svgEl("text", { x: padL - 6, y: padT + 6, "text-anchor": "end", fill: "#8A99B3", "font-size": 10, "font-family": "monospace" }, maxV.toFixed(1)));
  svg.appendChild(svgEl("text", { x: padL - 6, y: padT + plotH, "text-anchor": "end", fill: "#8A99B3", "font-size": 10, "font-family": "monospace" }, minV.toFixed(1)));

  // Active lead-day marker if provided
  if (Number.isInteger(options?.activeIndex) && options.activeIndex >= 0 && options.activeIndex < maxLen) {
    const ax = toX(options.activeIndex).toFixed(1);
    svg.appendChild(svgEl("line", { x1: ax, y1: padT, x2: ax, y2: padT + plotH, stroke: "#94A3B8", "stroke-dasharray": "3 3", "stroke-width": 1 }));
  }

  // Unit label
  if (unit) {
    svg.appendChild(svgEl("text", { x: W - padR, y: 14, "text-anchor": "end", fill: "#8A99B3", "font-size": 10, "font-family": "monospace" }, unit));
  }

  // Series lines & optional ±1σ bands
  let legendX = padL + 4;
  rawSeries.forEach((s, idx) => {
    if (!s || !Array.isArray(s.values)) return;
    const color = seriesColor(s.name, idx);
    const isClim = String(s.name || "").toLowerCase().includes("clim");

    if (Array.isArray(s.lower) && Array.isArray(s.upper)) {
      const ptsTop = [];
      const ptsBot = [];
      const len = Math.min(s.lower.length, s.upper.length);
      for (let i = 0; i < len; i++) {
        const lo = Number(s.lower[i]);
        const hi = Number(s.upper[i]);
        if (Number.isFinite(lo) && Number.isFinite(hi)) {
          ptsTop.push(`${toX(i).toFixed(1)},${toY(hi).toFixed(1)}`);
          ptsBot.unshift(`${toX(i).toFixed(1)},${toY(lo).toFixed(1)}`);
        }
      }
      if (ptsTop.length >= 2) {
        svg.appendChild(svgEl("polygon", {
          points: `${ptsTop.join(" ")} ${ptsBot.join(" ")}`,
          fill: color,
          "fill-opacity": "0.14"
        }));
      }
    }

    const pathD = buildSegmentedPath(s.values, toX, toY);
    if (pathD) {
      svg.appendChild(svgEl("path", {
        d: pathD,
        fill: "none",
        stroke: color,
        "stroke-width": isClim ? 1.5 : 2.2,
        "stroke-dasharray": isClim ? "4 3" : null
      }));
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

  // X-axis tick labels (first, middle, last)
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
      }, String(labels[i])));
    }
  }

  el.appendChild(svg);
}
