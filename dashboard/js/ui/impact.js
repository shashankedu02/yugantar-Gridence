/**
 * MonsoonTwin UI Module — Monsoon Impact Lens Cards
 * Contract: renderImpactCards(el, indicators, options?)
 * Pure presentational ES module. Preserves proxy disclosures and the "method" popovers.
 * A change is shown without good/bad colouring: the numbers are model scenarios, not judgements.
 */

function statusBadgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "ok" || s === "normal" || s === "low") return "mt-badge mt-badge--live";
  if (s === "watch" || s === "warn" || s === "moderate" || s === "deficient") return "mt-badge mt-badge--warn";
  if (s === "break" || s === "alert" || s === "danger" || s === "high" || s === "large_deficient") return "mt-badge mt-badge--danger";
  if (s === "scenario") return "mt-badge mt-badge--scenario";
  return "mt-badge";
}

function formatValue(val, unit) {
  if (val === null || val === undefined || val === "") return "—";
  const str = typeof val === "number" && !Number.isFinite(val) ? "—" : String(val);
  return unit ? `${str} ${unit}` : str;
}

function el_(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Render Impact Lens indicator cards into `el`.
 * @param {HTMLElement} el
 * @param {Array<{id?: string, label: string, value: string|number, unit?: string, status?: string, note?: string, isProxy?: boolean, baseline?: string|number, scenario?: string|number, delta?: string|number, limitation?: string}>} indicators
 */
export function renderImpactCards(el, indicators) {
  if (!(el instanceof Element)) return;
  el.replaceChildren();
  const list = el_("div", "mt-impact-list");

  if (!Array.isArray(indicators) || indicators.length === 0) {
    const empty = el_("div", "mt-impact-card");
    empty.appendChild(el_("span", "mt-impact-meta", "No impact indicators available."));
    list.appendChild(empty);
    el.appendChild(list);
    return;
  }

  for (const item of indicators) {
    if (!item || typeof item !== "object") continue;
    const card = el_("article", "mt-impact-card");
    if (item.id) card.dataset.indicatorId = String(item.id);

    const top = el_("div", "mt-impact-top");
    top.appendChild(el_("h3", "mt-impact-title", typeof item.label === "string" && item.label ? item.label : "Indicator"));
    if (item.note || item.limitation) {
      const details = el_("details", "mt-method-details");
      const summary = el_("summary", "mt-method-summary", "ⓘ method");
      summary.title = "How this number is computed, and its limits";
      const popover = el_("div", "mt-popover");
      if (item.note) popover.appendChild(el_("div", "", String(item.note)));
      if (item.limitation) {
        const lim = el_("div", "mt-popover-limit");
        lim.append(el_("strong", "", "Limitation: "), document.createTextNode(String(item.limitation)));
        popover.appendChild(lim);
      }
      details.append(summary, popover);
      top.appendChild(details);
    }

    const valRow = el_("div", "mt-impact-value");
    valRow.appendChild(document.createTextNode(`${formatValue(item.value, item.unit)} `));
    if (item.status) valRow.appendChild(el_("span", statusBadgeClass(item.status), String(item.status)));

    const meta = el_("div", "mt-impact-meta");
    if (item.isProxy) {
      const proxy = el_("span", "mt-badge", "Proxy");
      proxy.title = "An indirect indicator computed from the forecast grid. Not an official or station measure.";
      meta.appendChild(proxy);
    }
    if (item.baseline !== undefined || item.scenario !== undefined || item.delta !== undefined) {
      const parts = [];
      if (item.baseline !== undefined) parts.push(`B: ${item.baseline}`);
      if (item.scenario !== undefined) parts.push(`S: ${item.scenario}`);
      if (item.delta !== undefined) parts.push(`Δ: ${item.delta}`);
      const cmp = el_("span", "mt-impact-compare", parts.join(" · "));
      cmp.title = "B: baseline forecast. S: scenario (with the shock). Δ: scenario minus baseline.";
      meta.appendChild(cmp);
    } else if (item.note && !item.limitation) {
      meta.appendChild(el_("span", "", String(item.note)));
    }

    card.append(top, valRow, meta);
    list.appendChild(card);
  }
  el.appendChild(list);
}
