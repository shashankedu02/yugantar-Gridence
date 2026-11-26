/**
 * Marching-squares contour extraction for 32x36 grids (row 0 = south, col 0 = west).
 * W2-owned module. Offline and dependency-free.
 */

import { GRID } from "./config.js";

// Edge table for marching squares: corners [bl, br, tr, tl] -> edge pairs [e1, e2]
// Edges: 0 = bottom (bl-br), 1 = right (br-tr), 2 = top (tr-tl), 3 = left (tl-bl)
const MS_TABLE = [
  [],
  [[3, 0]],
  [[0, 1]],
  [[3, 1]],
  [[1, 2]],
  [[3, 0], [1, 2]],
  [[0, 2]],
  [[3, 2]],
  [[2, 3]],
  [[2, 0]],
  [[0, 1], [2, 3]],
  [[2, 1]],
  [[1, 3]],
  [[1, 0]],
  [[0, 3]],
  [],
];

function interp(v0, v1, level) {
  const denom = v1 - v0;
  if (Math.abs(denom) < 1e-12) return 0.5;
  return Math.max(0, Math.min(1, (level - v0) / denom));
}

function edgePoint(edge, r, c, v0, v1, v2, v3, level) {
  if (edge === 0) return [r, c + interp(v0, v1, level)];
  if (edge === 1) return [r + interp(v1, v2, level), c + 1];
  if (edge === 2) return [r + 1, c + interp(v3, v2, level)];
  return [r + interp(v0, v3, level), c];
}

/**
 * Extract contour segments in grid index space [row, col] (row 0 = south).
 */
export function extractContours(field, level) {
  if (!Array.isArray(field) || field.length !== GRID.rows) return [];
  const segments = [];
  for (let r = 0; r < GRID.rows - 1; r++) {
    const row0 = field[r];
    const row1 = field[r + 1];
    if (!Array.isArray(row0) || !Array.isArray(row1)) continue;
    for (let c = 0; c < GRID.cols - 1; c++) {
      const v0 = row0[c];
      const v1 = row0[c + 1];
      const v2 = row1[c + 1];
      const v3 = row1[c];
      if (
        !Number.isFinite(v0) ||
        !Number.isFinite(v1) ||
        !Number.isFinite(v2) ||
        !Number.isFinite(v3)
      ) {
        continue;
      }
      const code =
        (v0 >= level ? 1 : 0) |
        (v1 >= level ? 2 : 0) |
        (v2 >= level ? 4 : 0) |
        (v3 >= level ? 8 : 0);
      const pairs = MS_TABLE[code];
      for (let i = 0; i < pairs.length; i++) {
        const [eA, eB] = pairs[i];
        segments.push([
          edgePoint(eA, r, c, v0, v1, v2, v3, level),
          edgePoint(eB, r, c, v0, v1, v2, v3, level),
        ]);
      }
    }
  }
  return segments;
}

function drawSegments(ctx, segments, { width, height, color, lineWidth = 1.25 }) {
  if (!segments.length) return;
  const cellW = width / GRID.cols;
  const cellH = height / GRID.rows;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let i = 0; i < segments.length; i++) {
    const [[r0, c0], [r1, c1]] = segments[i];
    // Row 0 is south (bottom of canvas); row 31 is north (top of canvas).
    const x0 = (c0 + 0.5) * cellW;
    const y0 = (GRID.rows - 0.5 - r0) * cellH;
    const x1 = (c1 + 0.5) * cellW;
    const y1 = (GRID.rows - 0.5 - r1) * cellH;
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw coastline from /meta land_sea_mask at level 0.5.
 * If landSeaMask is null or invalid, draws nothing (never invents boundaries).
 */
export function drawCoastline(ctx, landSeaMask, { width, height, color = "rgba(230, 237, 247, 0.78)", lineWidth = 1.3 } = {}) {
  if (!landSeaMask) return;
  const segments = extractContours(landSeaMask, 0.5);
  drawSegments(ctx, segments, { width, height, color, lineWidth });
}

/**
 * Draw MSL isobars at fixed Pa intervals when msl field is active.
 */
export function drawIsobars(ctx, mslField, { width, height, stepPa = 200, color = "rgba(255, 255, 255, 0.35)", lineWidth = 0.8 } = {}) {
  if (!mslField) return;
  for (let level = 99000; level <= 103000; level += stepPa) {
    const segments = extractContours(mslField, level);
    drawSegments(ctx, segments, { width, height, color, lineWidth });
  }
}
