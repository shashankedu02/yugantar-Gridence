/**
 * Canvas India grid renderer (row 0 = 6.5 N south at bottom, row 31 = 37.5 N north at top),
 * colour ramps, shock overlay, hover/selection coordinate mapping, and timeline binding.
 * W2-owned module. Offline and dependency-free.
 */

import { CHANNELS, GRID } from "./config.js";
import { drawCoastline, drawIsobars } from "./contour.js";

const RAMPS = Object.freeze({
  thermal: [
    [22, 34, 82],
    [43, 92, 143],
    [66, 152, 155],
    [168, 198, 108],
    [237, 162, 69],
    [214, 72, 54],
  ],
  rain: [
    [15, 23, 42],
    [35, 92, 114],
    [46, 160, 158],
    [82, 204, 152],
    [176, 230, 118],
    [248, 240, 130],
  ],
  dense: [
    [17, 25, 48],
    [39, 64, 112],
    [64, 115, 158],
    [118, 168, 189],
    [194, 219, 224],
  ],
  haline: [
    [19, 29, 64],
    [34, 86, 122],
    [45, 146, 132],
    [122, 198, 116],
    [232, 235, 138],
  ],
  balance: [
    [44, 105, 180],
    [120, 168, 214],
    [148, 163, 184],
    [236, 156, 104],
    [198, 62, 54],
  ],
});

function lerpColor(stops, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const a = stops[idx];
  const b = stops[idx + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

export function sampleRamp(rampName, value, min, max, isRain = false) {
  if (!Number.isFinite(value)) return [20, 26, 38, 255];
  if (isRain && value < 1.0) {
    return [14, 22, 38, 255];
  }
  const span = max - min;
  const t = span > 0 ? (value - min) / span : 0.5;
  const stops = RAMPS[rampName] || RAMPS.thermal;
  const [r, g, b] = lerpColor(stops, t);
  return [r, g, b, 255];
}

export function getChannelSpec(channelIndex, meta = null) {
  const fallback = CHANNELS[channelIndex] || CHANNELS[0];
  const apiChannel = meta?.channels?.[channelIndex];
  return {
    id: apiChannel?.name || fallback.id,
    label: fallback.label,
    unit: apiChannel?.unit || fallback.unit,
    min: fallback.min,
    max: fallback.max,
    diffMax: fallback.diffMax,
    ramp: fallback.ramp,
  };
}

export function getFieldRange(channelIndex, view, meta = null) {
  const spec = getChannelSpec(channelIndex, meta);
  if (view === "difference") {
    return {
      min: -spec.diffMax,
      max: spec.diffMax,
      ramp: "balance",
      unit: spec.unit,
      channel: spec.id,
    };
  }
  return {
    min: spec.min,
    max: spec.max,
    ramp: spec.ramp,
    unit: spec.unit,
    channel: spec.id,
  };
}

/**
 * Convert pointer client coordinates to grid { row, col }, where row 0 is south (bottom).
 */
export function canvasPointToCell(canvas, clientX, clientY) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  if (nx < 0 || nx >= 1 || ny < 0 || ny >= 1) return null;
  const col = Math.max(0, Math.min(GRID.cols - 1, Math.floor(nx * GRID.cols)));
  const canvasRow = Math.max(0, Math.min(GRID.rows - 1, Math.floor(ny * GRID.rows)));
  const row = GRID.rows - 1 - canvasRow;
  return { row, col };
}

function drawGraticule(ctx, width, height) {
  const cellW = width / GRID.cols;
  const cellH = height / GRID.rows;
  ctx.save();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let r = 0; r < GRID.rows; r += 5) {
    const y = (GRID.rows - 0.5 - r) * cellH;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  for (let c = 0; c < GRID.cols; c += 5) {
    const x = (c + 0.5) * cellW;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  ctx.stroke();
  ctx.restore();
}

function drawShockOverlay(ctx, perturbation, width, height) {
  if (!Array.isArray(perturbation) || perturbation.length !== 6) return;
  const cellW = width / GRID.cols;
  const cellH = height / GRID.rows;
  ctx.save();
  ctx.strokeStyle = "rgba(244, 162, 97, 0.85)";
  ctx.fillStyle = "rgba(244, 162, 97, 0.14)";
  ctx.lineWidth = 1.25;
  for (let r = 0; r < GRID.rows; r++) {
    const y = (GRID.rows - 1 - r) * cellH;
    for (let c = 0; c < GRID.cols; c++) {
      let active = false;
      for (let ch = 0; ch < 6; ch++) {
        if (perturbation[ch]?.[r]?.[c] !== 0) {
          active = true;
          break;
        }
      }
      if (!active) continue;
      const x = c * cellW;
      ctx.fillRect(x, y, cellW, cellH);
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, cellW - 1), Math.max(1, cellH - 1));
    }
  }
  ctx.restore();
}

function drawCellHighlight(ctx, cell, color, width, height) {
  if (!cell) return;
  const cellW = width / GRID.cols;
  const cellH = height / GRID.rows;
  const x = cell.col * cellW;
  const y = (GRID.rows - 1 - cell.row) * cellH;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, Math.max(1, cellW - 2), Math.max(1, cellH - 2));
  ctx.restore();
}

let _offscreen = null;

function getOffscreenContext() {
  if (!_offscreen && typeof document !== "undefined") {
    _offscreen = document.createElement("canvas");
    _offscreen.width = GRID.cols;
    _offscreen.height = GRID.rows;
  }
  return _offscreen ? _offscreen.getContext("2d") : null;
}

/**
 * Render a [32, 36] weather field (row 0 = south) onto the target canvas.
 */
export function renderMapCanvas(
  canvas,
  { field, channelIndex = 0, view = "baseline", meta = null, perturbation = null, selectedCell = null, hoverCell = null, showIsobars = false }
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#070c16";
  ctx.fillRect(0, 0, width, height);

  if (!Array.isArray(field) || field.length !== GRID.rows) {
    drawGraticule(ctx, width, height);
    drawShockOverlay(ctx, perturbation, width, height);
    drawCoastline(ctx, meta?.land_sea_mask || null, { width, height });
    ctx.fillStyle = "#93a4be";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      view === "baseline"
        ? "Run Simulation to populate the India 1° forecast grid."
        : `No ${view} rollout available yet.`,
      width / 2,
      height / 2
    );
    return;
  }

  const range = getFieldRange(channelIndex, view, meta);
  const isRain = range.channel === "tp" && view !== "difference";
  const offCtx = getOffscreenContext();

  if (offCtx) {
    const img = offCtx.createImageData(GRID.cols, GRID.rows);
    for (let r = 0; r < GRID.rows; r++) {
      // Flip vertically: row 0 (6.5°N south) -> bottom row (GRID.rows - 1)
      const canvasRow = GRID.rows - 1 - r;
      const rowData = field[r];
      for (let c = 0; c < GRID.cols; c++) {
        const val = Array.isArray(rowData) ? rowData[c] : NaN;
        const [cr, cg, cb, ca] = sampleRamp(range.ramp, val, range.min, range.max, isRain);
        const idx = (canvasRow * GRID.cols + c) * 4;
        img.data[idx] = cr;
        img.data[idx + 1] = cg;
        img.data[idx + 2] = cb;
        img.data[idx + 3] = ca;
      }
    }
    offCtx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(_offscreen, 0, 0, width, height);
    ctx.restore();
  }

  drawGraticule(ctx, width, height);
  if (showIsobars && range.channel === "msl" && view !== "difference") {
    drawIsobars(ctx, field, { width, height });
  }
  // Coastline drawn ONLY if land_sea_mask is non-null in /meta
  drawCoastline(ctx, meta?.land_sea_mask || null, { width, height });
  drawShockOverlay(ctx, perturbation, width, height);
  drawCellHighlight(ctx, hoverCell, "rgba(255, 255, 255, 0.85)", width, height);
  drawCellHighlight(ctx, selectedCell, "#2ec4b6", width, height);
}

export function formatHoverReadout({ cell, state }) {
  if (!cell) {
    return "Hover or click a grid cell (row 0 = 6.5°N south, row 31 = 37.5°N north).";
  }
  const { row, col } = cell;
  const lat = state.meta?.grid?.lat?.[row] ?? (GRID.latMin + row);
  const lon = state.meta?.grid?.lon?.[col] ?? (GRID.lonMin + col);
  const spec = getChannelSpec(state.channelIndex, state.meta);
  const d = state.dayIndex;
  const ch = state.channelIndex;

  const bVal = state.baseline?.rollout?.[d]?.[ch]?.[row]?.[col];
  const sVal = state.scenario?.rollout?.[d]?.[ch]?.[row]?.[col];
  const dVal = state.difference?.[d]?.[ch]?.[row]?.[col];

  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");
  const parts = [`${lat.toFixed(1)}°N, ${lon.toFixed(1)}°E (r=${row}, c=${col})`, `${spec.id}:`];
  parts.push(`base=${fmt(bVal)} ${spec.unit}`);
  if (sVal !== undefined) parts.push(`scen=${fmt(sVal)} ${spec.unit}`);
  if (dVal !== undefined) parts.push(`Δ=${dVal >= 0 ? "+" : ""}${fmt(dVal)} ${spec.unit}`);
  return parts.join(" · ");
}

export function bindCanvasInteractions(canvas, { onHover, onClick }) {
  if (!canvas) return () => {};
  const handleMove = (e) => onHover?.(canvasPointToCell(canvas, e.clientX, e.clientY));
  const handleLeave = () => onHover?.(null);
  const handleClick = (e) => {
    const cell = canvasPointToCell(canvas, e.clientX, e.clientY);
    if (cell) onClick?.(cell);
  };
  canvas.addEventListener("mousemove", handleMove);
  canvas.addEventListener("mouseleave", handleLeave);
  canvas.addEventListener("click", handleClick);
  return () => {
    canvas.removeEventListener("mousemove", handleMove);
    canvas.removeEventListener("mouseleave", handleLeave);
    canvas.removeEventListener("click", handleClick);
  };
}

export function bindTimelineControls({ sliderEl, labelEl, playBtn }, store, { intervalMs = 400 } = {}) {
  let timer = null;

  function stopPlayback() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (store.getState().playing) store.setPlaying(false);
  }

  function sync(state) {
    const maxSteps = state.baseline?.rollout?.length || state.steps;
    const hasRollout = Boolean(state.baseline?.rollout?.length || state.scenario?.rollout?.length);
    if (!hasRollout && timer !== null) stopPlayback();
    if (sliderEl) {
      sliderEl.min = "1";
      sliderEl.max = String(maxSteps);
      sliderEl.value = String(Math.min(maxSteps, state.dayIndex + 1));
      sliderEl.disabled = !hasRollout;
    }
    if (labelEl) {
      labelEl.textContent = `Day ${Math.min(maxSteps, state.dayIndex + 1)} / ${maxSteps}`;
    }
    if (playBtn) {
      playBtn.disabled = !hasRollout || maxSteps <= 1;
      playBtn.textContent = state.playing ? "Pause" : "Play";
    }
  }

  const onInput = () => {
    stopPlayback();
    store.setDayIndex(Number(sliderEl.value) - 1);
  };

  const onPlayClick = () => {
    const st = store.getState();
    const maxSteps = st.baseline?.rollout?.length || st.steps;
    if (maxSteps <= 1) return;
    if (st.playing) {
      stopPlayback();
      return;
    }
    store.setPlaying(true);
    timer = setInterval(() => {
      const cur = store.getState();
      const total = cur.baseline?.rollout?.length || cur.steps;
      store.setDayIndex((cur.dayIndex + 1) % total);
    }, intervalMs);
  };

  sliderEl?.addEventListener("input", onInput);
  playBtn?.addEventListener("click", onPlayClick);
  const unsub = store.subscribe(sync);
  sync(store.getState());

  return () => {
    stopPlayback();
    unsub();
    sliderEl?.removeEventListener("input", onInput);
    playBtn?.removeEventListener("click", onPlayClick);
  };
}
