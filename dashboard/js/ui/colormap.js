/**
 * MonsoonTwin UI Module — Shared Colour Mapping
 * Single source of truth for map canvas and renderLegend().
 * Pure, colour-blind-safe palettes. No external dependencies.
 */

export const RAIN_BINS = [1, 2.5, 5, 10, 20, 35, 65, 115];
// Dry (< 1 mm/day) is a real value: it is drawn opaque, so it can never be mistaken for the "missing" background.
export const DRY_RGB = [34, 41, 56];

export const PALETTE_STOPS = {
  thermal: [
    [19, 41, 75],
    [51, 65, 154],
    [111, 74, 150],
    [168, 85, 138],
    [218, 106, 102],
    [245, 149, 69],
    [251, 201, 74],
    [243, 245, 140]
  ],
  lajolla: [
    [26, 20, 18],
    [106, 43, 38],
    [182, 77, 46],
    [230, 141, 57],
    [247, 226, 139]
  ],
  // Rain bands (>= 1 mm/day), lightness rises with rain. Drier than 1 mm/day is DRY_RGB.
  rain: [
    [23, 58, 94],
    [23, 87, 134],
    [24, 119, 168],
    [30, 154, 192],
    [56, 188, 198],
    [121, 214, 189],
    [185, 234, 180],
    [244, 249, 184]
  ],
  speed: [
    [15, 23, 42],
    [30, 64, 175],
    [14, 165, 233],
    [46, 196, 182],
    [250, 204, 21]
  ],
  dense: [
    [30, 27, 58],
    [51, 47, 102],
    [75, 74, 143],
    [106, 104, 173],
    [141, 138, 198],
    [178, 175, 220],
    [214, 212, 238],
    [244, 243, 251]
  ],
  diff: [
    [168, 228, 255],
    [79, 176, 238],
    [42, 109, 179],
    [43, 52, 69],
    [156, 65, 54],
    [229, 121, 79],
    [255, 208, 166]
  ],
  haline: [
    [34, 29, 94],
    [29, 74, 142],
    [31, 108, 140],
    [47, 140, 134],
    [82, 169, 121],
    [140, 196, 101],
    [205, 219, 108],
    [248, 236, 156]
  ],
  ice: [
    [11, 18, 32],
    [29, 53, 87],
    [69, 123, 157],
    [168, 218, 220],
    [241, 250, 238]
  ],
  // Diverging: blue (negative) -> dark neutral (0) -> orange (positive); lightness rises away from zero on both sides
  balance: [
    [168, 228, 255],
    [79, 176, 238],
    [42, 109, 179],
    [43, 52, 69],
    [156, 65, 54],
    [229, 121, 79],
    [255, 208, 166]
  ],
  BrBG: [
    [140, 81, 10],
    [216, 179, 101],
    [148, 163, 184],
    [90, 180, 172],
    [1, 102, 94]
  ]
};

export function toFiniteNumber(v) {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseCssOrTuple(stop) {
  if (Array.isArray(stop) && stop.length >= 3) {
    const r = toFiniteNumber(stop[0]);
    const g = toFiniteNumber(stop[1]);
    const b = toFiniteNumber(stop[2]);
    const a = stop.length >= 4 ? toFiniteNumber(stop[3]) : null;
    if (r !== null && g !== null && b !== null) {
      return {
        rgb: [Math.round(r), Math.round(g), Math.round(b)],
        css: a !== null
          ? `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`
          : `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
      };
    }
  }
  if (typeof stop === "string" && stop.trim()) {
    const s = stop.trim();
    const hex = s.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const n = parseInt(hex[1], 16);
      return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], css: s };
    }
    return { rgb: null, css: s };
  }
  return null;
}

const _namedStops = new Map(); // parsed once per named ramp: the map asks for thousands of colours per frame

export function resolveRampStops(ramp) {
  if (Array.isArray(ramp)) {
    const parsed = ramp.map(parseCssOrTuple).filter(Boolean);
    if (parsed.length >= 2) return parsed;
    if (parsed.length === 1) return [parsed[0], parsed[0]];
  }
  if (typeof ramp === "string" && PALETTE_STOPS[ramp]) {
    let stops = _namedStops.get(ramp);
    if (!stops) {
      stops = PALETTE_STOPS[ramp].map(([r, g, b]) => ({ rgb: [r, g, b], css: `rgb(${r}, ${g}, ${b})` }));
      _namedStops.set(ramp, stops);
    }
    return stops;
  }
  return PALETTE_STOPS.dense.map(([r, g, b]) => ({
    rgb: [r, g, b],
    css: `rgb(${r}, ${g}, ${b})`
  }));
}

function lerpRgb(c0, c1, t) {
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * t),
    Math.round(c0[1] + (c1[1] - c0[1]) * t),
    Math.round(c0[2] + (c1[2] - c0[2]) * t)
  ];
}

const _rgbLists = new WeakMap();

function sampleStops(stops, t) {
  const clamped = Math.max(0, Math.min(1, t));
  let rgbs = _rgbLists.get(stops);
  if (!rgbs) {
    rgbs = stops.map((s) => s.rgb).filter(Boolean);
    _rgbLists.set(stops, rgbs);
  }
  if (rgbs.length === 0) return [148, 163, 184];
  if (rgbs.length === 1) return rgbs[0];
  const scaled = clamped * (rgbs.length - 1);
  const idx = Math.min(rgbs.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  return lerpRgb(rgbs[idx], rgbs[idx + 1], frac);
}

/**
 * Shared pure value-to-RGBA mapper for both map canvas and legend.
 * Returns null if value is missing (null/undefined/NaN).
 * @param {number|null|undefined} value
 * @param {{min: number, max: number, ramp?: string|Array, bins?: number[], symmetric?: boolean, belowOneTransparent?: boolean}} spec
 * @returns {[number, number, number, number] | null}
 */
export function valueToRgba(value, spec) {
  const v = toFiniteNumber(value);
  if (v === null) return null;

  const ramp = spec?.ramp;
  const stops = resolveRampStops(ramp);

  // Rainfall (< 1 mm/day white/transparent treatment, discrete log-like bins)
  if (ramp === "rain" || spec?.belowOneTransparent) {
    if (v < 1) {
      return [...DRY_RGB, 255];
    }
    const bins = Array.isArray(spec?.bins) && spec.bins.length >= 2 ? spec.bins : RAIN_BINS;
    let binIdx = bins.length - 1;
    for (let i = 0; i < bins.length - 1; i++) {
      if (v < bins[i + 1]) {
        binIdx = i;
        break;
      }
    }
    const t = bins.length > 1 ? binIdx / (bins.length - 1) : 0;
    const [r, g, b] = sampleStops(stops, t);
    return [r, g, b, 255];
  }

  let min = toFiniteNumber(spec?.min);
  let max = toFiniteNumber(spec?.max);
  if (min === null) min = 0;
  if (max === null) max = 1;

  if (spec?.symmetric || ramp === "balance" || ramp === "diff") {
    const absMax = Math.max(Math.abs(min), Math.abs(max), 1e-6);
    min = -absMax;
    max = absMax;
  }

  const span = max - min;
  const t = Math.abs(span) < 1e-9 ? 0.5 : (v - min) / span;
  const [r, g, b] = sampleStops(stops, t);
  return [r, g, b, 255];
}

/**
 * Build CSS background for the legend bar matching valueToRgba().
 * @param {{min?: number, max?: number, ramp?: string|Array, bins?: number[], symmetric?: boolean}} spec
 */
export function buildLegendCss(spec) {
  const ramp = spec?.ramp;
  const stops = resolveRampStops(ramp);
  if (ramp === "rain") {
    const n = stops.length + 1; // the dry band and one band per colour, all the same width
    const at = (k) => ((k / n) * 100).toFixed(3);
    const bands = [`rgb(${DRY_RGB.join(", ")})`, ...stops.map((s) => s.css)];
    const parts = bands.flatMap((css, k) => [`${css} ${at(k)}%`, `${css} ${at(k + 1)}%`]);
    return `linear-gradient(90deg, ${parts.join(", ")})`;
  }
  return `linear-gradient(90deg, ${stops.map((s) => s.css).join(", ")})`;
}
