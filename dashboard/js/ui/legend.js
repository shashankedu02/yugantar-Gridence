/**
 * MonsoonTwin UI Module — Colour Legend
 * Contract: renderLegend(el, data, options?)
 * Pure presentational ES module. No fetch, no global state, no DOM outside el.
 */

const NAMED_RAMPS = {
  thermal: ["#162040", "#3B528B", "#8E4A85", "#D95F52", "#F9B84A"],
  lajolla: ["#1A1412", "#6A2B26", "#B64D2E", "#E68D39", "#F7E28B"],
  rain: ["#0B1220", "#164E63", "#0E7490", "#2EC4B6", "#A7F3D0", "#FDE68A"],
  speed: ["#0F172A", "#1E40AF", "#0EA5E9", "#2EC4B6", "#FACC15"],
  dense: ["#1E293B", "#334155", "#64748B", "#94A3B8", "#E2E8F0"],
  diff: ["#2166AC", "#67A9CF", "#94A3B8", "#EF8A62", "#B2182B"],
  haline: ["#0B132B", "#1C2541", "#3A506B", "#5BC0BE", "#C2F8CB"],
  ice: ["#0B1220", "#1D3557", "#457B9D", "#A8DADC", "#F1FAEE"],
  balance: ["#2166AC", "#67A9CF", "#94A3B8", "#EF8A62", "#B2182B"],
  BrBG: ["#8C510A", "#D8B365", "#94A3B8", "#5AB4AC", "#01665E"]
};

function toCssColor(stop) {
  if (typeof stop === "string" && stop.trim()) {
    return stop.trim();
  }
  if (Array.isArray(stop) && stop.length >= 3) {
    const [r, g, b, a] = stop.map(Number);
    if ([r, g, b].every(Number.isFinite)) {
      if (stop.length >= 4 && Number.isFinite(a)) {
        return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
      }
      return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    }
  }
  return null;
}

function resolveStops(ramp) {
  if (Array.isArray(ramp)) {
    const parsed = ramp.map(toCssColor).filter(Boolean);
    if (parsed.length >= 2) return parsed;
    if (parsed.length === 1) return [parsed[0], parsed[0]];
  }
  if (typeof ramp === "string" && NAMED_RAMPS[ramp]) {
    return NAMED_RAMPS[ramp];
  }
  return ["#1E293B", "#64748B", "#E2E8F0"];
}

function formatTick(val) {
  if (!Number.isFinite(val)) return "—";
  const abs = Math.abs(val);
  if (abs === 0) return "0";
  if (abs >= 100) return String(Math.round(val));
  if (abs >= 10) return val.toFixed(1).replace(/\.0$/, "");
  return val.toFixed(2).replace(/\.?0+$/, "");
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
  const min = Number.isFinite(Number(data.min)) ? Number(data.min) : 0;
  const max = Number.isFinite(Number(data.max)) ? Number(data.max) : 1;
  const stops = resolveStops(data.ramp);

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
  bar.style.background = `linear-gradient(90deg, ${stops.join(", ")})`;

  const ticksEl = document.createElement("div");
  ticksEl.className = "mt-legend-ticks mt-mono";

  let tickLabels;
  if (Array.isArray(options?.labels) && options.labels.length >= 2) {
    tickLabels = options.labels.map(String);
  } else if (Array.isArray(options?.bins) && options.bins.length >= 2) {
    tickLabels = options.bins.map((v) => formatTick(Number(v)));
  } else if (options?.symmetric || (min < 0 && max > 0 && Math.abs(min + max) < 1e-6)) {
    const mid = (min + max) / 2;
    tickLabels = [formatTick(min), formatTick((min + mid) / 2), formatTick(mid), formatTick((mid + max) / 2), formatTick(max)];
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
