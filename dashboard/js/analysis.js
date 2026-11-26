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

export const CORE_ZONE = Object.freeze({ latMin: 18, latMax: 28, lonMin: 65, lonMax: 88 }); // core monsoon zone
export const HEAVY_RAIN_MM = 10; // the organisers' heavy-rain threshold, grid-cell daily mean
export const WARM_ANOMALY_K = 3;
const TP = 1;
const T2M = 0;

const latOf = (r) => GRID.latMin + r * GRID.stepDeg;
const lonOf = (c) => GRID.lonMin + c * GRID.stepDeg;
const areaWeight = (r) => Math.cos((latOf(r) * Math.PI) / 180);

export function coreZoneCells() {
  const cells = [];
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      if (latOf(r) >= CORE_ZONE.latMin && latOf(r) <= CORE_ZONE.latMax
          && lonOf(c) >= CORE_ZONE.lonMin && lonOf(c) <= CORE_ZONE.lonMax) cells.push([r, c]);
    }
  }
  return cells;
}

/** Area-weighted mean of one channel over `cells`, for every lead day. */
export function dailyMean(rollout, channel, cells) {
  let wsum = 0;
  for (const [r] of cells) wsum += areaWeight(r);
  return rollout.map((day) => {
    let s = 0;
    for (const [r, c] of cells) s += areaWeight(r) * day[channel][r][c];
    return s / wsum;
  });
}

const sum = (a) => a.reduce((x, y) => x + y, 0);

function countCellDays(rollout, test) {
  let n = 0;
  rollout.forEach((day, k) => {
    for (let r = 0; r < GRID.rows; r++) for (let c = 0; c < GRID.cols; c++) if (test(day, k, r, c)) n++;
  });
  return n;
}

/** Largest absolute scenario-minus-baseline rain difference anywhere, any day. */
export function maxRainChange(baseline, scenario) {
  let m = 0;
  baseline.forEach((day, k) => day[TP].forEach((row, r) => row.forEach((v, c) => {
    m = Math.max(m, Math.abs(scenario[k][TP][r][c] - v));
  })));
  return m;
}

/**
 * All numbers come from the arrays passed in. A quantity that needs data the server did not provide is null.
 * landMask may be null; perturbation is the delta that produced `scenario`.
 */
export function impactNumbers({ baseline, scenario = null, climatology = null, landMask = null, perturbation = null }) {
  const core = coreZoneCells();
  const total = (roll, cells) => sum(dailyMean(roll, TP, cells));
  const both = (fn) => ({ baseline: fn(baseline), scenario: scenario ? fn(scenario) : null });
  const coreRain = both((x) => total(x, core));
  const climRain = climatology ? total(climatology, core) : null;
  const departure = climRain !== null && climRain > 0
    ? both((x) => (100 * (total(x, core) - climRain)) / climRain) : null;
  let shockedRain = null;
  if (scenario && perturbation) {
    const hit = [];
    shockFootprint(perturbation).forEach((row, r) => row.forEach((on, c) => { if (on) hit.push([r, c]); }));
    if (hit.length) shockedRain = { ...both((x) => total(x, hit)), cells: hit.length };
  }
  const heavy = both((x) => countCellDays(x, (day, _k, r, c) => day[TP][r][c] >= HEAVY_RAIN_MM));
  const warm = climatology && landMask
    ? both((x) => countCellDays(x, (day, k, r, c) => landMask[r][c] >= 0.5
      && day[T2M][r][c] - climatology[k][T2M][r][c] >= WARM_ANOMALY_K)) : null;
  return {
    coreRain, climRain, departure, shockedRain, heavy, warm,
    maxRainChange: scenario ? maxRainChange(baseline, scenario) : null,
    daily: {
      baseline: dailyMean(baseline, TP, core),
      scenario: scenario ? dailyMean(scenario, TP, core) : null,
      climatology: climatology ? dailyMean(climatology, TP, core) : null,
    },
  };
}

/** Turn the numbers into labelled proxy cards for the W3 component. */
export function impactCards(n, { steps, modelMode, rainShocked }) {
  const fmt = (v, d = 1) => (v === null || v === undefined ? "—" : v.toFixed(d));
  const signed = (v, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;
  const card = (id, label, pair, unit, d, note, limitation) => {
    const has = pair.scenario !== null;
    const out = { id, label, unit, isProxy: true, note, limitation, value: fmt(has ? pair.scenario : pair.baseline, d) };
    if (has) {
      out.baseline = fmt(pair.baseline, d);
      out.scenario = fmt(pair.scenario, d);
      out.delta = signed(pair.scenario - pair.baseline, d);
    }
    return out;
  };
  const cannotMoveRain = n.maxRainChange === 0 && !rainShocked && modelMode === "dap"
    ? " This model (DAP) forecasts each variable and grid cell on its own, so a shock without a rain change cannot change rain. A zero here is a limit of the model, not a finding about the atmosphere."
    : "";
  const learnedResponse = modelMode === "localnet" && n.maxRainChange !== null
    ? " A shock response is what this trained model does, not verified physics: local tests found cases where a shock did not spread, and one where a small temperature shock removed heavy rain at one place. A total can also hide daily changes of opposite sign."
    : "";
  const cards = [
    card("core-rain", `Core monsoon zone rain, ${steps}-day total`, n.coreRain, "mm", 1,
      "Area-weighted mean of daily rain over 18–28°N, 65–88°E, summed over the forecast days.",
      `1° grid-mean forecast rain, not station or IMD rain.${cannotMoveRain}${learnedResponse}`),
  ];
  if (n.shockedRain) {
    cards.push(card("shocked-area-rain", `Rain over the shocked area, ${steps}-day total`, n.shockedRain, "mm", 1,
      `Area-weighted mean over the ${n.shockedRain.cells} shocked cells, summed over the forecast days.`,
      `Model response only; effects outside these cells are not counted.${cannotMoveRain}${learnedResponse}`));
  }
  if (n.departure) {
    cards.push(card("rain-departure", "Core zone rain vs climatology", n.departure, "%", 1,
      "(forecast total − climatological total) ÷ climatological total, same cells and days.",
      "A few days, not a season: IMD departure categories are not applied."));
  } else {
    cards.push({ id: "rain-departure", label: "Core zone rain vs climatology", value: "unavailable", isProxy: true,
      note: "Needs the climatology from the server.", limitation: "Not computed without it." });
  }
  cards.push(card("heavy-rain", `Heavy-rain cell-days (≥ ${HEAVY_RAIN_MM} mm/day)`, n.heavy, "", 0,
    "Number of (grid cell, day) pairs in the whole domain at or above the organisers' heavy-rain threshold.",
    "Grid-mean rain rarely reaches station extremes. A hazard proxy, not flood risk."));
  if (n.warm) {
    cards.push(card("warm-days", `Warm land cell-days (≥ +${WARM_ANOMALY_K} K)`, n.warm, "", 0,
      "Land (grid cell, day) pairs where daily-mean 2 m temperature is at least 3 K above climatology.",
      "Not an IMD heatwave: IMD uses station daily maximum temperature; this is a daily mean."));
  }
  return cards;
}
