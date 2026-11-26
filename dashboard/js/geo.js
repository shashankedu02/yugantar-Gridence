/**
 * Loads the vendored reference coastline (Natural Earth, public domain; see vendor/LICENSES.md).
 * It is geography for orientation only. If it cannot be read, the map falls back to the 1° land–sea mask outline.
 */
export async function loadCoastline(fetchImpl = (...a) => window.fetch(...a), url = "vendor/geo/coastline-ne50m.json") {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const data = await res.json();
    const lines = data?.lines;
    const point = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
    if (!Array.isArray(lines) || !lines.every((l) => Array.isArray(l) && l.every(point))) return null;
    return lines;
  } catch {
    return null;
  }
}
