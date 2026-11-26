/**
 * Canvas map of the 32 x 36 one-degree grid (row 0 = 6.5 N at the bottom), pointer mapping and timeline binding.
 * Offline and dependency-free.
 *
 * Projection: equirectangular (plate carrée), one grid cell per degree square. The canvas covers cell EDGES:
 * 65–101°E, 6–38°N. The canvas is backed with the screen's real pixels (CSS size × devicePixelRatio).
 * By default every cell is one flat colour: that is the true resolution of the data.
 */

import { CHANNELS, GRID } from "./config.js";
import { drawCoastline, drawIsobars } from "./contour.js";
import { valueToRgba } from "./ui/colormap.js";

const MISSING_RGBA = [20, 26, 38, 255];
export const DOMAIN = Object.freeze({ lonMin: 65, lonMax: 101, latMin: 6, latMax: 38 });

/** Reference places (geography only, not data). */
const PLACES = Object.freeze([
  ["New Delhi", 28.61, 77.21], ["Mumbai", 19.08, 72.88], ["Kolkata", 22.57, 88.36],
  ["Chennai", 13.08, 80.27], ["Bengaluru", 12.97, 77.59, "left"], // label side, so neighbours do not collide
]);
const SEAS = Object.freeze([["Arabian Sea", 13.4, 68.6], ["Bay of Bengal", 12.2, 88.2]]);

/** Colour of one cell. The legend is built from the same module, so the two cannot disagree. */
export function sampleRamp(rampName, value, min, max) {
  return valueToRgba(value, { min, max, ramp: rampName }) || MISSING_RGBA;
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

/** Give the canvas one backing pixel per screen pixel. Returns the CSS-to-backing factor. */
export function sizeCanvasToDisplay(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(4, window.devicePixelRatio || 1);
  if (rect.width > 0 && rect.height > 0) {
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return w / rect.width;
  }
  return dpr;
}

function projector(width, height) {
  return {
    x: (lon) => ((lon - DOMAIN.lonMin) / (DOMAIN.lonMax - DOMAIN.lonMin)) * width,
    y: (lat) => ((DOMAIN.latMax - lat) / (DOMAIN.latMax - DOMAIN.latMin)) * height,
  };
}

/** Whole-pixel cell edges, so neighbouring cells meet exactly (no seams, no soft edges). */
const edgeX = (i, width) => Math.round((i * width) / GRID.cols);
const edgeY = (j, height) => Math.round((j * height) / GRID.rows); // j counts from the top

function drawCells(ctx, field, range, width, height) {
  for (let r = 0; r < GRID.rows; r++) {
    const j = GRID.rows - 1 - r;
    const y = edgeY(j, height);
    const h = edgeY(j + 1, height) - y;
    for (let c = 0; c < GRID.cols; c++) {
      const [cr, cg, cb] = sampleRamp(range.ramp, field[r]?.[c], range.min, range.max);
      const x = edgeX(c, width);
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.fillRect(x, y, edgeX(c + 1, width) - x, h);
    }
  }
}

/** Bilinear value between the four nearest cell centres (display only; held constant beyond the outer centres). */
export function bilinear(field, rowPos, colPos) {
  const r = Math.max(0, Math.min(GRID.rows - 1, rowPos));
  const c = Math.max(0, Math.min(GRID.cols - 1, colPos));
  const r0 = Math.floor(r);
  const c0 = Math.floor(c);
  const r1 = Math.min(GRID.rows - 1, r0 + 1);
  const c1 = Math.min(GRID.cols - 1, c0 + 1);
  const fr = r - r0;
  const fc = c - c0;
  return (field[r0][c0] * (1 - fc) + field[r0][c1] * fc) * (1 - fr)
    + (field[r1][c0] * (1 - fc) + field[r1][c1] * fc) * fr;
}

let _smooth = null;

/** Optional smoothed picture: VALUES are interpolated and then coloured, so the legend stays exact. */
function drawSmooth(ctx, field, range, width, height) {
  const k = 8; // samples per cell
  const w = GRID.cols * k;
  const h = GRID.rows * k;
  if (!_smooth) {
    _smooth = document.createElement("canvas");
    _smooth.width = w;
    _smooth.height = h;
  }
  const off = _smooth.getContext("2d");
  const img = off.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const rowPos = GRID.rows - (y + 0.5) / k - 0.5;
    for (let x = 0; x < w; x++) {
      const [cr, cg, cb] = sampleRamp(range.ramp, bilinear(field, rowPos, (x + 0.5) / k - 0.5), range.min, range.max);
      const i = (y * w + x) * 4;
      img.data[i] = cr;
      img.data[i + 1] = cg;
      img.data[i + 2] = cb;
      img.data[i + 3] = 255;
    }
  }
  off.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(_smooth, 0, 0, width, height);
  ctx.restore();
}

function drawCellGrid(ctx, width, height) {
  ctx.save();
  ctx.fillStyle = "rgba(6, 10, 20, 0.28)";
  for (let i = 1; i < GRID.cols; i++) ctx.fillRect(edgeX(i, width), 0, 1, height);
  for (let j = 1; j < GRID.rows; j++) ctx.fillRect(0, edgeY(j, height), width, 1);
  ctx.restore();
}

function drawGraticule(ctx, width, height, s) {
  const p = projector(width, height);
  ctx.save();
  ctx.strokeStyle = "rgba(203, 213, 225, 0.13)";
  ctx.lineWidth = Math.max(1, Math.round(s));
  ctx.beginPath();
  for (let lon = 70; lon <= 100; lon += 10) {
    const x = Math.round(p.x(lon)) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let lat = 10; lat <= 30; lat += 10) {
    const y = Math.round(p.y(lat)) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.restore();
}

function strokeTwice(ctx, build, s, { halo = "rgba(4, 8, 16, 0.55)", haloWidth = 2.6, ink, inkWidth = 1.05, dash = null }) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  build();
  ctx.strokeStyle = halo;
  ctx.lineWidth = haloWidth * s;
  ctx.stroke();
  if (dash) ctx.setLineDash(dash.map((d) => d * s));
  ctx.strokeStyle = ink;
  ctx.lineWidth = inkWidth * s;
  ctx.stroke();
  ctx.restore();
}

/** Reference coastline (finer than the data) when loaded; otherwise the 1-degree land–sea mask outline. */
function drawGeography(ctx, coastline, mask, width, height, s) {
  if (Array.isArray(coastline) && coastline.length) {
    const p = projector(width, height);
    strokeTwice(ctx, () => {
      for (const line of coastline) {
        line.forEach(([lon, lat], i) => (i ? ctx.lineTo(p.x(lon), p.y(lat)) : ctx.moveTo(p.x(lon), p.y(lat))));
      }
    }, s, { ink: "rgba(241, 246, 255, 0.92)" });
  } else {
    drawCoastline(ctx, mask, { width, height, lineWidth: 1.3 * s });
  }
}

function drawPlaces(ctx, width, height, s) {
  const p = projector(width, height);
  const size = Math.max(9, Math.min(12, width / s / 48)) * s;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(4, 8, 16, 0.78)";
  ctx.lineWidth = 3 * s;
  ctx.font = `500 ${size}px "Segoe UI", system-ui, sans-serif`;
  for (const [name, lat, lon, side] of PLACES) {
    const x = p.x(lon);
    const y = p.y(lat);
    ctx.beginPath();
    ctx.arc(x, y, 2 * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#f8fafc";
    ctx.fill();
    ctx.textAlign = side === "left" ? "right" : "left";
    const at = side === "left" ? x - 5 * s : x + 5 * s;
    ctx.strokeText(name, at, y);
    ctx.fillText(name, at, y);
  }
  ctx.font = `italic 400 ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  for (const [name, lat, lon] of SEAS) {
    ctx.strokeText(name, p.x(lon), p.y(lat));
    ctx.fillStyle = "rgba(226, 232, 240, 0.85)";
    ctx.fillText(name, p.x(lon), p.y(lat));
  }
  ctx.restore();
}

export const isShockedCell = (perturbation, r, c) => perturbation.some((ch) => ch[r]?.[c] !== 0);

/**
 * Outline of the shocked area: only its OUTER edges, and no fill, so the values inside stay readable.
 * pending = selected but not yet forecast (dashed).
 */
function drawShockOutline(ctx, perturbation, width, height, s, pending) {
  if (!Array.isArray(perturbation) || perturbation.length !== 6) return;
  const on = (r, c) => r >= 0 && r < GRID.rows && c >= 0 && c < GRID.cols && isShockedCell(perturbation, r, c);
  strokeTwice(ctx, () => {
    for (let r = 0; r < GRID.rows; r++) {
      const j = GRID.rows - 1 - r;
      for (let c = 0; c < GRID.cols; c++) {
        if (!on(r, c)) continue;
        const x0 = edgeX(c, width);
        const x1 = edgeX(c + 1, width);
        const y0 = edgeY(j, height);
        const y1 = edgeY(j + 1, height);
        if (!on(r + 1, c)) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
        if (!on(r - 1, c)) { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
        if (!on(r, c - 1)) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
        if (!on(r, c + 1)) { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
      }
    }
  }, s, {
    halo: "rgba(4, 8, 16, 0.75)", haloWidth: 3.6, inkWidth: 1.7,
    ink: pending ? "#fde047" : "#ffffff", dash: pending ? [5, 4] : null,
  });
}

function drawCellHighlight(ctx, cell, color, width, height, s) {
  if (!cell) return;
  const j = GRID.rows - 1 - cell.row;
  const x = edgeX(cell.col, width);
  const y = edgeY(j, height);
  const w = edgeX(cell.col + 1, width) - x;
  const h = edgeY(j + 1, height) - y;
  strokeTwice(ctx, () => ctx.rect(x, y, w, h), s, { halo: "rgba(4, 8, 16, 0.85)", haloWidth: 4, ink: color, inkWidth: 2 });
}

/**
 * Draw a [32][36] field (row 0 = south). `range` = {min, max, ramp, channel} from scale.js.
 * perturbation: shock of the forecast on screen; pendingPerturbation: selected but not yet forecast.
 */
export function renderMapCanvas(canvas, {
  field, range, meta = null, coastline = null, perturbation = null, pendingPerturbation = null, selectedCell = null,
  hoverCell = null, showIsobars = false, smooth = false, cellGrid = false, places = true,
}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const s = sizeCanvasToDisplay(canvas);
  const { width, height } = canvas;
  // Everything except the two cell highlights is kept in an off-screen layer, so that pointing at the map stays quick.
  const key = [field, range?.min, range?.max, range?.ramp, width, height, s, meta?.land_sea_mask, coastline, perturbation,
    pendingPerturbation, showIsobars, smooth, cellGrid, places];
  let layer = _layers.get(canvas);
  if (!layer || key.some((v, i) => v !== layer.key[i])) {
    const base = layer?.base || document.createElement("canvas");
    base.width = width;
    base.height = height;
    drawBaseLayer(base.getContext("2d"), width, height, s, {
      field, range, meta, coastline, perturbation, pendingPerturbation, showIsobars, smooth, cellGrid, places,
    });
    layer = { base, key };
    _layers.set(canvas, layer);
  }
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(layer.base, 0, 0);
  drawCellHighlight(ctx, hoverCell, "#ffffff", width, height, s);
  drawCellHighlight(ctx, selectedCell, "#2dd4bf", width, height, s);
}

const _layers = new WeakMap();

function drawBaseLayer(ctx, width, height, s, {
  field, range, meta, coastline, perturbation, pendingPerturbation, showIsobars, smooth, cellGrid, places,
}) {
  ctx.fillStyle = "#0b1322";
  ctx.fillRect(0, 0, width, height);

  if (Array.isArray(field) && field.length === GRID.rows && range) {
    if (smooth) drawSmooth(ctx, field, range, width, height);
    else drawCells(ctx, field, range, width, height);
    if (cellGrid) drawCellGrid(ctx, width, height);
  }
  drawGraticule(ctx, width, height, s);
  if (showIsobars && Array.isArray(field)) drawIsobars(ctx, field, { width, height, lineWidth: 0.8 * s });
  drawGeography(ctx, coastline, meta?.land_sea_mask || null, width, height, s);
  if (places) drawPlaces(ctx, width, height, s);
  drawShockOutline(ctx, perturbation, width, height, s, false);
  drawShockOutline(ctx, pendingPerturbation, width, height, s, true);
}

/** One line describing a cell: where it is and every value available for it on the day shown. */
export function formatHoverReadout({ cell, state }) {
  if (!cell) return "Point at the map to read a cell. Click it to chart all forecast days.";
  const { row, col } = cell;
  const lat = state.meta?.grid?.lat?.[row] ?? (GRID.latMin + row);
  const lon = state.meta?.grid?.lon?.[col] ?? (GRID.lonMin + col);
  const spec = getChannelSpec(state.channelIndex, state.meta);
  const ch = state.channelIndex;
  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");
  const parts = [`${lat.toFixed(1)}°N ${lon.toFixed(1)}°E`, spec.id];
  if (!state.baseline) {
    parts.push(`input day: ${fmt(state.activeCase?.init_states?.[2]?.[ch]?.[row]?.[col])} ${spec.unit}`);
    const delta = state.shock?.perturbation?.[ch]?.[row]?.[col];
    if (delta) parts.push(`shock adds ${delta >= 0 ? "+" : ""}${fmt(delta)} ${spec.unit}`);
    return parts.join(" · ");
  }
  const d = state.dayIndex;
  const bVal = state.baseline.rollout?.[d]?.[ch]?.[row]?.[col];
  const sVal = state.scenario?.rollout?.[d]?.[ch]?.[row]?.[col];
  const dVal = state.difference?.[d]?.[ch]?.[row]?.[col];
  parts.push(`baseline ${fmt(bVal)}`);
  if (sVal !== undefined) parts.push(`scenario ${fmt(sVal)}`);
  if (dVal !== undefined) parts.push(`Δ ${dVal >= 0 ? "+" : ""}${fmt(dVal)}`);
  parts.push(spec.unit);
  return parts.join(" · ");
}

export function bindCanvasInteractions(canvas, { onHover, onClick, getSelected }) {
  if (!canvas) return () => {};
  const handleMove = (e) => onHover?.(canvasPointToCell(canvas, e.clientX, e.clientY), e);
  const handleLeave = () => onHover?.(null);
  const handleClick = (e) => {
    const cell = canvasPointToCell(canvas, e.clientX, e.clientY);
    if (cell) onClick?.(cell);
  };
  canvas.addEventListener("mousemove", handleMove);
  canvas.addEventListener("mouseleave", handleLeave);
  canvas.addEventListener("click", handleClick);
  const MOVES = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  const handleKey = (e) => {
    const move = MOVES[e.key];
    if (!move || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation(); // arrows belong to the map while it has focus
    const from = getSelected?.() || { row: Math.floor(GRID.rows / 2), col: Math.floor(GRID.cols / 2) };
    const cell = {
      row: Math.max(0, Math.min(GRID.rows - 1, from.row + move[0])),
      col: Math.max(0, Math.min(GRID.cols - 1, from.col + move[1])),
    };
    onClick?.(cell);
    onHover?.(cell);
  };
  canvas.addEventListener("keydown", handleKey);
  return () => {
    canvas.removeEventListener("keydown", handleKey);
    canvas.removeEventListener("mousemove", handleMove);
    canvas.removeEventListener("mouseleave", handleLeave);
    canvas.removeEventListener("click", handleClick);
  };
}

export function bindTimelineControls({ sliderEl, labelEl, playBtn }, store, { intervalMs = 700 } = {}) {
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
