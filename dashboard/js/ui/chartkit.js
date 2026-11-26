/**
 * MonsoonTwin UI Module — small SVG chart helpers shared by the line and bar charts.
 * Charts are drawn at their real pixel width, so text is never scaled below its stated size.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

export function svgEl(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  if (text !== null) node.textContent = String(text);
  return node;
}

/** Width to draw at: the container's real width (a default when it is not laid out). */
export function chartWidth(el, fallback = 460) {
  const w = Math.floor(el.clientWidth || 0);
  return w >= 220 ? w : fallback;
}

/** Evenly spaced readable tick values covering [lo, hi]. */
export function niceTicks(lo, hi, count = 4) {
  const span = hi - lo > 1e-12 ? hi - lo : 1;
  const raw = span / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw - 1e-12) ?? 10 * p;
  const first = Math.floor(lo / step + 1e-9) * step;
  const ticks = [];
  for (let v = first; v < hi + step - 1e-9; v += step) ticks.push(Number(v.toPrecision(10)));
  return { ticks, step };
}

export function formatNumber(v, step = null) {
  if (!Number.isFinite(v)) return "—";
  if (step !== null) {
    const magnitude = Math.floor(Math.log10(step) + 1e-9);
    const extra = Math.abs(step / 10 ** magnitude - 2.5) < 1e-9 ? 1 : 0; // 2.5-steps need one more decimal
    return v.toFixed(Math.max(0, Math.min(6, extra - magnitude)));
  }
  const a = Math.abs(v);
  return a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3);
}

/**
 * Pointer and keyboard readout over a chart. `indexAt(svgX)` returns the data index under the pointer;
 * `rows(index)` returns {title, lines: [[label, value, colour?]]}; `mark(index|null)` moves the highlight.
 * Text is always set with textContent.
 */
export function attachReadout(el, svg, { count, indexAt, xOf, rows, mark }) {
  el.style.position = "relative";
  const tip = document.createElement("div");
  tip.className = "mt-tip";
  tip.setAttribute("role", "status");
  tip.hidden = true;
  el.appendChild(tip);
  let current = null;
  const show = (i) => {
    current = i;
    if (i === null) {
      tip.hidden = true;
      mark?.(null);
      return;
    }
    const info = rows(i);
    tip.replaceChildren();
    const title = document.createElement("div");
    title.className = "mt-tip-title";
    title.textContent = info.title;
    tip.appendChild(title);
    for (const [label, value, colour] of info.lines) {
      const line = document.createElement("div");
      line.className = "mt-tip-row";
      const key = document.createElement("i");
      if (colour) key.style.background = colour;
      const v = document.createElement("b");
      v.textContent = value;
      const l = document.createElement("span");
      l.textContent = label;
      line.append(key, v, l);
      tip.appendChild(line);
    }
    tip.hidden = false;
    const box = svg.getBoundingClientRect();
    const scale = box.width / svg.viewBox.baseVal.width || 1;
    const x = xOf(i) * scale;
    const left = x + 12 + tip.offsetWidth > box.width ? x - 12 - tip.offsetWidth : x + 12;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = "22px";
    mark?.(i);
  };
  svg.addEventListener("pointermove", (e) => {
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * svg.viewBox.baseVal.width;
    show(indexAt(x));
  });
  svg.addEventListener("pointerleave", () => show(null));
  svg.setAttribute("tabindex", "0");
  svg.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    e.stopPropagation();
    const next = current === null ? 0 : Math.max(0, Math.min(count - 1, current + (e.key === "ArrowRight" ? 1 : -1)));
    show(next);
  });
  svg.addEventListener("blur", () => show(null));
}
