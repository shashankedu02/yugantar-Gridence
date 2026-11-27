/**
 * Gridence UI Module — Shock Energy vs Distance
 * Contract: renderEnergyByDistance(el, data, options?)
 * Pure presentational ES module using dependency-free SVG.
 * Strict null/undefined/NaN handling (never coerces missing to 0). Only the bars are <rect> elements.
 */

import { toFiniteNumber } from "./colormap.js";
import { attachReadout, chartWidth, formatNumber, svgEl } from "./chartkit.js";

const BASELINE = "#338ced";
const RESPONSE = "#e76624";

/**
 * Render shock energy vs distance into `el`.
 * @param {HTMLElement} el
 * @param {{distances?: Array<number|string>, baseline?: Array<number|null>, scenario?: Array<number|null>}} data
 * @param {{unit?: string, scenarioLabel?: string, height?: number, xTitle?: string}} [options]
 */
export function renderEnergyByDistance(el, data, options = {}) {
  if (!(el instanceof Element)) return;
  el.replaceChildren();

  const distances = Array.isArray(data?.distances) ? data.distances : [];
  const baseline = Array.isArray(data?.baseline) ? data.baseline : [];
  const scenario = Array.isArray(data?.scenario) ? data.scenario : [];
  const n = distances.length;
  const values = [...baseline, ...scenario].map(toFiniteNumber).filter((v) => v !== null);
  if (n === 0 || values.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mt-impact-meta";
    empty.textContent = "No shock energy-vs-distance data available.";
    el.appendChild(empty);
    return;
  }

  const maxVal = Math.max(1e-6, ...values);
  const W = chartWidth(el);
  const H = options.height || 200;
  const padL = 46;
  const padR = 14;
  const padT = 38;
  const padB = options.xTitle ? 38 : 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const svg = svgEl("svg", {
    class: "mt-chart-svg", viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img",
    "aria-label": "Shock response energy by distance in grid cells. Use left and right arrows to read values.",
  });
  const label = (v) => (v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toPrecision(2));
  for (const [share, text] of [[1, label(maxVal)], [0.5, label(maxVal / 2)], [0, "0"]]) {
    const y = padT + plotH * (1 - share);
    svg.appendChild(svgEl("line", { class: "mt-grid", x1: padL, y1: y, x2: padL + plotW, y2: y }));
    svg.appendChild(svgEl("text", { class: "mt-axis", x: padL - 7, y: y + 3.5, "text-anchor": "end" }, text));
  }

  // A series is named in the legend only if it has data.
  const hasBaseline = baseline.some((v) => toFiniteNumber(v) !== null);
  const name = options.scenarioLabel || "Scenario Δ";
  let keyX = padL;
  const key = (colour, text) => {
    svg.appendChild(svgEl("line", { x1: keyX, y1: 10, x2: keyX + 12, y2: 10, stroke: colour, "stroke-width": 6 }));
    svg.appendChild(svgEl("text", { class: "mt-key", x: keyX + 17, y: 14 }, text));
    keyX += 17 + text.length * 6.6 + 18;
  };
  if (hasBaseline) key(BASELINE, "Baseline");
  key(RESPONSE, name);
  if (options.unit) svg.appendChild(svgEl("text", { class: "mt-axis", x: W - padR, y: 28, "text-anchor": "end" }, options.unit));

  const slot = plotW / n;
  const barW = Math.max(4, Math.min(22, slot * (hasBaseline ? 0.34 : 0.56)));
  const bar = (v, x, colour) => {
    if (v === null || v < 0) return;
    // An actual zero is a 1.5 px tick; a missing value draws nothing.
    const h = v === 0 ? 1.5 : Math.max(2, (v / maxVal) * plotH);
    svg.appendChild(svgEl("rect", { x: x.toFixed(1), y: (padT + plotH - h).toFixed(1), width: barW.toFixed(1), height: h.toFixed(1), rx: v === 0 ? 0 : 2, fill: colour }));
  };
  for (let i = 0; i < n; i++) {
    const cx = padL + slot * (i + 0.5);
    bar(toFiniteNumber(baseline[i]), cx - barW - 1, BASELINE);
    bar(toFiniteNumber(scenario[i]), hasBaseline ? cx + 1 : cx - barW / 2, RESPONSE);
    if (slot >= 20 || i % 2 === 0) {
      svg.appendChild(svgEl("text", { class: "mt-axis", x: cx.toFixed(1), y: padT + plotH + 15, "text-anchor": "middle" }, String(distances[i] ?? "")));
    }
  }
  if (options.xTitle) svg.appendChild(svgEl("text", { class: "mt-axis", x: padL + plotW / 2, y: H - 5, "text-anchor": "middle" }, options.xTitle));

  const cross = svgEl("line", { class: "mt-cross", x1: 0, y1: padT, x2: 0, y2: padT + plotH, visibility: "hidden" });
  svg.appendChild(cross);
  el.appendChild(svg);

  attachReadout(el, svg, {
    count: n,
    indexAt: (x) => Math.max(0, Math.min(n - 1, Math.floor((x - padL) / slot))),
    xOf: (i) => padL + slot * (i + 0.5),
    rows: (i) => ({
      title: i === 0 ? "Inside the shocked area" : `${distances[i]} cells from the shocked area`,
      lines: [[`${name} (mean per cell)`, formatNumber(toFiniteNumber(scenario[i]) ?? NaN), RESPONSE]],
    }),
    mark: (i) => {
      cross.setAttribute("visibility", i === null ? "hidden" : "visible");
      if (i !== null) {
        const x = padL + slot * (i + 0.5);
        cross.setAttribute("x1", x);
        cross.setAttribute("x2", x);
      }
    },
  });
}
