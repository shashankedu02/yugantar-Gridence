/**
 * Quantities derived from the server's forecast arrays. Pure functions, no DOM, no invented values:
 * anything that cannot be computed is returned as null.
 */
import { GRID } from "./config.js";

/** [32][36] boolean mask of the cells a perturbation [6][32][36] touches. */
export function shockFootprint(perturbation) {
  return Array.from({ length: GRID.rows }, (_, r) =>
    Array.from({ length: GRID.cols }, (_, c) => perturbation.some((ch) => ch[r][c] !== 0)));
}

/** Distance in grid cells (straight line between cell centres) from each cell to the nearest shocked cell. */
export function distanceToFootprint(mask) {
  const cells = [];
  mask.forEach((row, r) => row.forEach((on, c) => { if (on) cells.push([r, c]); }));
  if (!cells.length) return null;
  return mask.map((row, r) => row.map((_, c) => {
    let best = Infinity;
    for (const [sr, sc] of cells) best = Math.min(best, (r - sr) ** 2 + (c - sc) ** 2);
    return Math.sqrt(best);
  }));
}

/**
 * Response energy of one lead day, per cell: sum over the six channels of (difference / channel std)^2.
 * This is the definition the organisers' scoring code uses, so channels in different units can be added.
 * Bin 0 is the shocked area itself; bin d (1 <= d < maxBin) holds cells with d-1 < distance <= d;
 * the last bin holds everything farther away. Each bar is the mean energy per cell in the bin; an empty bin is null.
 */
export function energyByDistance(differenceDay, perturbation, channelStd, maxBin = 12) {
  if (!differenceDay || !perturbation) return null;
  if (!Array.isArray(channelStd) || channelStd.length !== 6 || !channelStd.every((v) => Number.isFinite(v) && v > 0)) {
    return null;
  }
  const dist = distanceToFootprint(shockFootprint(perturbation));
  if (!dist) return null;
  const sums = new Array(maxBin + 1).fill(0);
  const counts = new Array(maxBin + 1).fill(0);
  let total = 0;
  let outside = 0;
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      let e = 0;
      for (let ch = 0; ch < 6; ch++) e += (differenceDay[ch][r][c] / channelStd[ch]) ** 2;
      const bin = dist[r][c] === 0 ? 0 : Math.min(maxBin, Math.ceil(dist[r][c] - 1e-9));
      sums[bin] += e;
      counts[bin] += 1;
      total += e;
      if (bin > 0) outside += e;
    }
  }
  return {
    labels: sums.map((_, i) => (i === maxBin ? `${maxBin}+` : String(i))),
    meanEnergy: sums.map((s, i) => (counts[i] ? s / counts[i] : null)),
    cellCounts: counts,
    totalEnergy: total,
    outsideShare: total > 0 ? outside / total : null,
  };
}
