/** Plain-language descriptions shown in the interface. Text only: no scores or measured results belong here. */

export const VARIABLES = Object.freeze([
  { name: "Temperature", help: "Air temperature 2 m above ground, daily mean." },
  { name: "Rain", help: "Total rain per day, averaged over each 1° cell." },
  { name: "Wind U", help: "East–west wind at 10 m. Positive blows towards the east." },
  { name: "Wind V", help: "North–south wind at 10 m. Positive blows towards the north." },
  { name: "Pressure", help: "Air pressure reduced to mean sea level. Lines join equal pressure." },
  { name: "Moisture", help: "Water vapour in the whole air column above each cell." },
]);

/**
 * Readable name of a model for the screen. Only the two known server IDs are shortened; anything else, including an
 * unexpected or altered ID, is shown exactly as the server sent it.
 */
export function modelLabel(id) {
  const local = /^monsoontwin-localnet-c(\d+)-unvalidated$/.exec(id ?? "");
  if (local) return `LocalNet C${local[1]} (unvalidated)`;
  return id === "monsoontwin-dap-unvalidated" ? "DAP (unvalidated)" : String(id ?? "unknown");
}

export const UNIT_LABELS = Object.freeze({ "kg/m2": "kg/m²" });
export const unitLabel = (u) => UNIT_LABELS[u] || u;

export const CASE_NOTES = Object.freeze({
  "monsoon-active": "A wet spell in the monsoon season.",
  "monsoon-weak": "A weak spell: little rain over central India.",
  "pre-monsoon-heat": "Hot weeks before the monsoon arrives.",
  winter: "A cool, mostly dry winter spell.",
  synthetic: "Artificial numbers made in the browser to test the screen. Not weather.",
});

export const SHOCK_CARDS = Object.freeze({
  none: { title: "No shock", text: "Forecast the real conditions only." },
  warm_ocean: { title: "Warm Bay of Bengal", text: "Warmer, moister air over the bay: +3.0 K and +15 % water vapour.", where: "8.5–19.5°N, 82.5–93.5°E" },
  monsoon_stall: { title: "Monsoon Stall (Arabian Sea)", text: "Weaker winds over the Arabian Sea: both wind parts reduced by 40 %.", where: "8.5–19.5°N, 65.5–74.5°E" },
});

/** "3 input days ending 2019-07-16" -> Date of the last input day (UTC), or null. */
export function lastInputDate(activeCase) {
  if (!activeCase || activeCase.isSynthetic) return null;
  const m = String(activeCase.date_label || activeCase.label || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

const FORMAT = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };
/** Calendar date `offset` days after the last input day, e.g. "17 Jul 2019"; "" when unknown. */
export function dateAfter(activeCase, offset) {
  const base = lastInputDate(activeCase);
  return base ? new Date(base.getTime() + offset * 86400000).toLocaleDateString("en-GB", FORMAT) : "";
}
