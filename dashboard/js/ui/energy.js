/**
 * MonsoonTwin UI Module — Shock Energy vs Distance
 * Contract: renderEnergyByDistance(el, data, options?)
 * Pure presentational ES module using dependency-free SVG.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  if (text !== null) node.textContent = String(text);
  return node;
}

/**
 * Render shock energy vs distance chart into `el`.
 * @param {HTMLElement} el
 * @param {{distances?: number[], baseline?: number[], scenario?: number[]}} data
 * @param {{unit?: string}} [options]
 */
export function renderEnergyByDistance(el, data, options = {}) {
  if (!(el instanceof Element)) return;
  el.innerHTML = "";

  const distances = Array.isArray(data?.distances) ? data.distances : [];
  const baseline = Array.isArray(data?.baseline) ? data.baseline : [];
  const scenario = Array.isArray(data?.scenario) ? data.scenario : [];

  const n = distances.length;
  const allVals = [...baseline, ...scenario].map(Number).filter(Number.isFinite);

  if (n === 0 || allVals.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mt-impact-meta";
    empty.textContent = "No shock energy-vs-distance data available.";
    el.appendChild(empty);
    return;
  }

  const maxVal = Math.max(1e-6, ...allVals);
  const W = 460;
  const H = 160;
  const padL = 42;
  const padR = 14;
  const padT = 24;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const svg = svgEl("svg", {
    class: "mt-chart-svg",
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": "Shock energy by distance in grid cells"
  });

  // Axes
  svg.appendChild(svgEl("line", { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: "#28364F", "stroke-width": 1 }));
  svg.appendChild(svgEl("line", { x1: padL, y1: padT + plotH, x2: padL + plotW, y2: padT + plotH, stroke: "#28364F", "stroke-width": 1 }));

  // Y ticks (0 and max)
  svg.appendChild(svgEl("text", {
    x: padL - 6, y: padT + 6, "text-anchor": "end", fill: "#8A99B3", "font-size": 10, "font-family": "monospace"
  }, maxVal >= 10 ? maxVal.toFixed(1) : maxVal.toFixed(2)));
  svg.appendChild(svgEl("text", {
    x: padL - 6, y: padT + plotH, "text-anchor": "end", fill: "#8A99B3", "font-size": 10, "font-family": "monospace"
  }, "0"));

  // Legend
  svg.appendChild(svgEl("text", { x: padL + 4, y: 14, fill: "#2EC4B6", "font-size": 11, "font-family": "monospace" }, "Baseline"));
  svg.appendChild(svgEl("text", { x: padL + 72, y: 14, fill: "#F4A261", "font-size": 11, "font-family": "monospace" }, "Scenario Δ"));
  if (options?.unit) {
    svg.appendChild(svgEl("text", { x: W - padR, y: 14, "text-anchor": "end", fill: "#8A99B3", "font-size": 10, "font-family": "monospace" }, options.unit));
  }

  const slotW = plotW / n;
  const barW = Math.max(4, Math.min(18, slotW * 0.34));

  for (let i = 0; i < n; i++) {
    const cx = padL + slotW * (i + 0.5);
    const bVal = Number(baseline[i]);
    const sVal = Number(scenario[i]);

    if (Number.isFinite(bVal) && bVal >= 0) {
      const h = (bVal / maxVal) * plotH;
      svg.appendChild(svgEl("rect", {
        x: (cx - barW - 1).toFixed(1),
        y: (padT + plotH - h).toFixed(1),
        width: barW.toFixed(1),
        height: h.toFixed(1),
        rx: 2,
        fill: "#2EC4B6",
        "fill-opacity": "0.85"
      }));
    }

    if (Number.isFinite(sVal) && sVal >= 0) {
      const h = (sVal / maxVal) * plotH;
      svg.appendChild(svgEl("rect", {
        x: (cx + 1).toFixed(1),
        y: (padT + plotH - h).toFixed(1),
        width: barW.toFixed(1),
        height: h.toFixed(1),
        rx: 2,
        fill: "#F4A261",
        "fill-opacity": "0.88"
      }));
    }

    svg.appendChild(svgEl("text", {
      x: cx.toFixed(1),
      y: H - 8,
      "text-anchor": "middle",
      fill: "#8A99B3",
      "font-size": 10,
      "font-family": "monospace"
    }, String(distances[i])));
  }

  el.appendChild(svg);
}
