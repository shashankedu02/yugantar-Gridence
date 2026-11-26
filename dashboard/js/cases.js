/**
 * Loads demo input states from dashboard/cases/. Cases are INPUTS only (3 days of state); forecasts always come
 * from the server. dashboard/cases/index.json lists the files: {"cases": ["name.json", ...]}.
 */
import { validateCaseData } from "./state.js";

const SAFE_NAME = /^[A-Za-z0-9_-]+\.json$/;

export async function loadCases(fetchImpl = (...a) => window.fetch(...a), baseUrl = "cases/") {
  const cases = [];
  const problems = [];
  let index;
  try {
    const res = await fetchImpl(`${baseUrl}index.json`);
    if (!res.ok) return { cases, problems: [`no case index (HTTP ${res.status})`] };
    index = await res.json();
  } catch (err) {
    return { cases, problems: [`case index could not be read: ${err.message}`] };
  }
  const files = Array.isArray(index?.cases) ? index.cases : [];
  for (const name of files) {
    if (typeof name !== "string" || !SAFE_NAME.test(name)) {
      problems.push("a case file name in the index is not allowed");
      continue;
    }
    try {
      const res = await fetchImpl(`${baseUrl}${name}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const check = validateCaseData(data);
      if (!check.ok) throw new Error(check.error);
      if (typeof data.id !== "string" || typeof data.label !== "string") throw new Error("id and label are required");
      cases.push({ ...data, isSynthetic: false });
    } catch (err) {
      problems.push(`${name}: ${err.message}`);
    }
  }
  return { cases, problems };
}
