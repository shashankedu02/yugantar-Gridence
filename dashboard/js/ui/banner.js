/**
 * MonsoonTwin UI Module — Model Status & Honesty Banner
 * Contract: renderModelBanner(el, model, options?)
 * Pure presentational ES module. Enforces DASHBOARD_API.md §5 notices.
 */

/**
 * Render model status, placeholder notice, and validation badge into `el`.
 * @param {HTMLElement} el
 * @param {{name?: string, mode?: string, validated?: boolean, card?: object|null}|null} model
 * @param {{climatologyAvailable?: boolean}} [options]
 */
export function renderModelBanner(el, model, options = {}) {
  if (!(el instanceof Element)) return;
  el.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "mt-banner-strip";
  wrap.style.padding = "0";
  wrap.style.background = "transparent";
  wrap.style.borderBottom = "0";

  if (!model || typeof model !== "object") {
    const missing = document.createElement("div");
    missing.className = "mt-banner mt-banner--placeholder";
    missing.setAttribute("role", "status");

    const text = document.createElement("span");
    text.textContent = "Model metadata unavailable.";

    const badge = document.createElement("span");
    badge.className = "mt-badge mt-badge--warn";
    badge.textContent = "Unvalidated";

    missing.append(text, badge);
    wrap.appendChild(missing);
    el.appendChild(wrap);
    return;
  }

  const isPersistence = model.mode === "persistence";
  const isValidated = model.validated === true;
  const modelName = typeof model.name === "string" && model.name ? model.name : "unknown-model";

  const banner = document.createElement("div");
  banner.className = isPersistence ? "mt-banner mt-banner--placeholder" : "mt-banner";
  banner.setAttribute("role", "status");

  const msg = document.createElement("span");
  if (isPersistence) {
    const strong = document.createElement("strong");
    strong.textContent = "Placeholder forecast: ";
    msg.append(strong, document.createTextNode("the last day repeated. Not a model."));
  } else {
    const strong = document.createElement("strong");
    strong.textContent = modelName;
    msg.append(strong, document.createTextNode(model.mode ? ` · mode: ${model.mode}` : ""));
  }

  const badge = document.createElement("span");
  badge.className = isValidated ? "mt-badge mt-badge--live" : "mt-badge mt-badge--warn";
  badge.textContent = isValidated ? "Validated" : "Unvalidated";

  banner.append(msg, badge);
  wrap.appendChild(banner);

  if (options?.climatologyAvailable === false) {
    const clim = document.createElement("div");
    clim.className = "mt-banner mt-banner--unavailable";
    clim.setAttribute("role", "status");
    clim.textContent = "Climatology not available yet (HTTP 503 — anomaly views disabled).";
    wrap.appendChild(clim);
  }

  el.appendChild(wrap);
}
