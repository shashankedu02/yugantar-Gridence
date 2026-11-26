/**
 * Dashboard configuration, grid constants, channel metadata, and shock presets.
 * W2-owned module. Offline only (no external URLs or CDNs).
 */

export const DEFAULT_API_BASE_URL = "http://localhost:8000";
export const API_BASE_STORAGE_KEY = "monsoontwin.apiBaseUrl";
export const REQUEST_TIMEOUT_MS = 15000;

export const GRID = Object.freeze({
  rows: 32,
  cols: 36,
  latMin: 6.5,
  latMax: 37.5,
  lonMin: 65.5,
  lonMax: 100.5,
  stepDeg: 1.0,
});

export const MIN_STEPS = 1;
export const MAX_STEPS = 30;
export const DEFAULT_STEPS = 10;

export const CHANNELS = Object.freeze([
  { id: "t2m", label: "2m Temperature", unit: "K", displayUnit: "K", min: 270, max: 315, diffMax: 5, ramp: "thermal" },
  { id: "tp", label: "Precipitation", unit: "mm/day", displayUnit: "mm/day", min: 0, max: 65, diffMax: 20, ramp: "rain" },
  { id: "u10", label: "10m U-Wind", unit: "m/s", displayUnit: "m/s", min: -20, max: 20, diffMax: 8, ramp: "balance" },
  { id: "v10", label: "10m V-Wind", unit: "m/s", displayUnit: "m/s", min: -20, max: 20, diffMax: 8, ramp: "balance" },
  { id: "msl", label: "Mean Sea-Level Pressure", unit: "Pa", displayUnit: "Pa", min: 99500, max: 102500, diffMax: 800, ramp: "dense" },
  { id: "tcwv", label: "Column Water Vapour", unit: "kg/m2", displayUnit: "kg/m2", min: 5, max: 75, diffMax: 15, ramp: "haline" },
]);

/**
 * Exact shock preset definitions from docs/DASHBOARD_API.md §3.
 * Bounds are inclusive cell-centre coordinates on the 1° grid.
 */
export const SHOCK_PRESETS = Object.freeze({
  warm_ocean: {
    id: "warm_ocean",
    label: "Warm Bay of Bengal",
    description: "lat 8.5–19.5°N, lon 82.5–93.5°E (12×12): t2m +3.0 K, tcwv +15%",
    latMin: 8.5,
    latMax: 19.5,
    lonMin: 82.5,
    lonMax: 93.5,
  },
  monsoon_stall: {
    id: "monsoon_stall",
    label: "Monsoon Stall (Arabian Sea)",
    description: "lat 8.5–19.5°N, lon 65.5–74.5°E (12×10): u10 & v10 −40%",
    latMin: 8.5,
    latMax: 19.5,
    lonMin: 65.5,
    lonMax: 74.5,
  },
});

export function normalizeApiBaseUrl(raw) {
  const trimmed = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_API_BASE_URL;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return DEFAULT_API_BASE_URL;
    }
    return parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

export function getApiBaseUrl() {
  try {
    const saved = window.localStorage.getItem(API_BASE_STORAGE_KEY);
    if (saved) return normalizeApiBaseUrl(saved);
  } catch {
    // Ignore storage access restrictions.
  }
  return DEFAULT_API_BASE_URL;
}

export function setApiBaseUrl(url) {
  const normalized = normalizeApiBaseUrl(url);
  try {
    window.localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage access restrictions.
  }
  return normalized;
}
