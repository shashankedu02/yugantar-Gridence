/**
 * MonsoonTwin UI Module — Time Series Chart
 * Contract (dashboard/README.md):
 *   - renderSeries(el, data, options?)
 *   - renderEnergyByDistance(el, data, options?)
 * Pure presentational ES module using dependency-free SVG.
 * Strict null/undefined/NaN handling: breaks paths at missing points, never interpolates across gaps.
 * One <path> per series; gridlines and legend keys are <line> elements.
 */

import { toFiniteNumber } from "./colormap.js";
import { attachReadout, chartWidth, formatNumber, niceTicks, svgEl } from "./chartkit.js";
export { renderEnergyByDistance } from "./energy.js";

/** Colour follows the series, never its position. */
export const SERIES_COLOURS = Object.freeze({ baseline: "#338ced", scenario: "#e76624", climatology: "#a3adbf" });

function seriesColor(name, idx) {
  const lower = String(name || "").toLowerCase();
  if (lower.includes("scenario") || lower.includes("shock")) return SERIES_COLOURS.scenario;
  if (lower.includes("clim")) return SERIES_COLOURS.climatology;
  if (lower.includes("base") || idx === 0) return SERIES_COLOURS.baseline;
  return idx === 1 ? SERIES_COLOURS.scenario : SERIES_COLOURS.climatology;
}

function buildSegmentedPaths(values, toX, toY) {
  const segments = [];
  const isolatedPoints = [];
  let current = [];
  const close = () => {
    if (current.length === 1) isolatedPoints.push(current[0]);
    if (current.length >= 2) segments.push(current);
    current = [];
  };
  for (let i = 0; i < values.length; i++) {
    const v = toFiniteNumber(values[i]);
    if (v === null) close();
    else current.push([toX(i), toY(v)]);
  }
  close();
  const d = segments
    .map((seg) => seg.map(([x, y], idx) => `${idx === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" "))
    .join(" ");
  return { d, isolatedPoints };
}

/**
 * Render a multi-series line chart into `el`.
 * @param {HTMLElement} el
 * @param {{labels?: Array<string|number>, series?: Array<{name: string, values: Array<number|null>}>, unit?: string}} data
 * @param {{activeIndex?: number, height?: number}} [options]
 */
export function renderSeries(el, data, options = {}) {
  if (!(el instanceof Element)) return;
  el.replaceChildren();

  const labels = Array.isArray(data?.labels) ? data.labels : [];
  const series = (Array.isArray(data?.series) ? data.series : []).filter((s) => s && Array.isArray(s.values));
  const unit = typeof data?.unit === "string" ? data.unit : "";
  const nums = series.flatMap((s) => s.values.map(toFiniteNumber)).filter((v) => v !== null);
  const count = Math.max(labels.length, ...series.map((s) => s.values.length), 0);
  if (count === 0 || nums.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mt-impact-meta";
    empty.textContent = "No time-series data available.";
    el.appendChild(empty);
    return;
  }

  let lo = Math.min(...nums);
  let hi = Math.max(...nums);
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  const { ticks, step } = niceTicks(lo, hi, 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const W = chartWidth(el);
  const H = options.height || 200;
  const padL = Math.max(36, Math.max(...ticks.map((t) => formatNumber(t, step).length)) * 6.6 + 10);
  const padR = 14;
  // The legend wraps onto further rows when the chart is narrow; everything below moves down with it.
  const keys = [];
  let keyX = padL;
  let keyRow = 0;
  series.forEach((s, idx) => {
    const name = String(s.name || `Series ${idx + 1}`);
    const wide = 19 + name.length * 6.8;
    if (keyX > padL && keyX + wide > W - padR) {
      keyX = padL;
      keyRow += 1;
    }
    keys.push({ name, x: keyX, y: 10 + keyRow * 16 });
    keyX += wide + 16;
  });
  const unitY = 28 + keyRow * 16;
  const padT = 38 + keyRow * 16;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const toX = (i) => (count === 1 ? padL + plotW / 2 : padL + (i / (count - 1)) * plotW);
  const toY = (v) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const svg = svgEl("svg", {
    class: "mt-chart-svg", viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img",
    "aria-label": `Time series chart${unit ? ` in ${unit}` : ""}. Use left and right arrows to read values.`,
  });

  for (const t of ticks) {
    const y = toY(t).toFixed(1);
    svg.appendChild(svgEl("line", { class: "mt-grid", x1: padL, y1: y, x2: padL + plotW, y2: y }));
    svg.appendChild(svgEl("text", { class: "mt-axis", x: padL - 7, y: Number(y) + 3.5, "text-anchor": "end" }, formatNumber(t, step)));
  }
  if (unit) svg.appendChild(svgEl("text", { class: "mt-axis", x: W - padR, y: unitY, "text-anchor": "end" }, unit));

  if (Number.isInteger(options.activeIndex) && options.activeIndex >= 0 && options.activeIndex < count) {
    const x = toX(options.activeIndex).toFixed(1);
    svg.appendChild(svgEl("line", { class: "mt-now", x1: x, y1: padT, x2: x, y2: padT + plotH }));
  }

  series.forEach((s, idx) => {
    const colour = seriesColor(s.name, idx);
    const dashed = String(s.name || "").toLowerCase().includes("clim");
    const { d, isolatedPoints } = buildSegmentedPaths(s.values, toX, toY);
    if (d) {
      svg.appendChild(svgEl("path", {
        d, fill: "none", stroke: colour, "stroke-width": dashed ? 1.5 : 2, "stroke-linejoin": "round",
        "stroke-linecap": "round", "stroke-dasharray": dashed ? "5 4" : null,
      }));
    }
    for (const [px, py] of isolatedPoints) {
      svg.appendChild(svgEl("circle", { cx: px.toFixed(1), cy: py.toFixed(1), r: 3.5, fill: colour }));
    }
    const { name, x, y } = keys[idx];
    svg.appendChild(svgEl("line", { x1: x, y1: y, x2: x + 14, y2: y, stroke: colour, "stroke-width": 2.5, "stroke-dasharray": dashed ? "4 3" : null }));
    svg.appendChild(svgEl("text", { class: "mt-key", x: x + 19, y: y + 4 }, name));
  });

  // As many x labels as fit without touching, always including the first and last.
  const widest = Math.max(...labels.map((l) => String(l).length), 1) * 6.6 + 10;
  const stride = Math.max(1, Math.ceil((widest * count) / Math.max(1, plotW)));
  for (let i = 0; i < labels.length; i += 1) {
    const last = i === labels.length - 1;
    if (!last && (i % stride !== 0 || labels.length - 1 - i < stride)) continue;
    const anchor = last && count > 1 ? "end" : i === 0 && count > 1 ? "start" : "middle";
    svg.appendChild(svgEl("text", { class: "mt-axis", x: toX(i).toFixed(1), y: H - 7, "text-anchor": anchor }, String(labels[i] ?? "")));
  }

  const cross = svgEl("line", { class: "mt-cross", x1: 0, y1: padT, x2: 0, y2: padT + plotH, visibility: "hidden" });
  const dots = series.map((s, idx) => svgEl("circle", { r: 4, fill: seriesColor(s.name, idx), class: "mt-dotmark", visibility: "hidden" }));
  svg.append(cross, ...dots);
  el.appendChild(svg);

  attachReadout(el, svg, {
    count,
    indexAt: (x) => Math.max(0, Math.min(count - 1, Math.round(((x - padL) / Math.max(1, plotW)) * (count - 1)))),
    xOf: toX,
    rows: (i) => ({
      title: String(labels[i] ?? i + 1),
      lines: series.map((s, idx) => [s.name, `${formatNumber(toFiniteNumber(s.values[i]) ?? NaN)}`, seriesColor(s.name, idx)]),
    }),
    mark: (i) => {
      cross.setAttribute("visibility", i === null ? "hidden" : "visible");
      dots.forEach((dot, idx) => {
        const v = i === null ? null : toFiniteNumber(series[idx].values[i]);
        dot.setAttribute("visibility", v === null ? "hidden" : "visible");
        if (v !== null) {
          dot.setAttribute("cx", toX(i));
          dot.setAttribute("cy", toY(v));
        }
      });
      if (i !== null) {
        cross.setAttribute("x1", toX(i));
        cross.setAttribute("x2", toX(i));
      }
    },
  });
}
