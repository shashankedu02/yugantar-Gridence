/**
 * MonsoonTwin UI Module — Monsoon Impact Lens Cards
 * Contract: renderImpactCards(el, indicators, options?)
 * Pure presentational ES module. Preserves proxy disclosures and "ⓘ method" popovers.
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

/**
 * Render Impact Lens indicator cards into `el`.
 * @param {HTMLElement} el
 * @param {Array<{id?: string, label: string, value: string|number, unit?: string, status?: string, note?: string, isProxy?: boolean, baseline?: string|number, scenario?: string|number, delta?: string|number, limitation?: string}>} indicators
 */
export function renderImpactCards(el, indicators) {
  if (!(el instanceof Element)) return;
  el.innerHTML = "";

  const list = document.createElement("div");
  list.className = "mt-impact-list";

  if (!Array.isArray(indicators) || indicators.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mt-impact-card";
    const msg = document.createElement("span");
    msg.className = "mt-impact-meta";
    msg.textContent = "No impact indicators available.";
    empty.appendChild(msg);
    list.appendChild(empty);
    el.appendChild(list);
    return;
  }

  for (const item of indicators) {
    if (!item || typeof item !== "object") continue;

    const card = document.createElement("article");
    card.className = "mt-impact-card";
    if (item.id) card.dataset.indicatorId = String(item.id);

    const top = document.createElement("div");
    top.className = "mt-impact-top";

    const title = document.createElement("h3");
    title.className = "mt-impact-title";
    title.textContent = typeof item.label === "string" && item.label ? item.label : "Indicator";
    top.appendChild(title);

    if (item.note || item.limitation) {
      const details = document.createElement("details");
      details.className = "mt-method-details";

      const summary = document.createElement("summary");
      summary.className = "mt-method-summary";
      summary.textContent = "ⓘ method";

      const popover = document.createElement("div");
      popover.className = "mt-popover";

      if (item.note) {
        const pNote = document.createElement("div");
        pNote.textContent = String(item.note);
        popover.appendChild(pNote);
      }
      if (item.limitation) {
        const pLim = document.createElement("div");
        pLim.style.marginTop = item.note ? "6px" : "0";
        const strong = document.createElement("strong");
        strong.textContent = "Limitation: ";
        pLim.append(strong, document.createTextNode(String(item.limitation)));
        popover.appendChild(pLim);
      }

      details.append(summary, popover);
      top.appendChild(details);
    }

    const valRow = document.createElement("div");
    valRow.className = "mt-impact-value mt-mono";
    valRow.appendChild(document.createTextNode(formatValue(item.value, item.unit) + " "));

    if (item.status) {
      const statusBadge = document.createElement("span");
      statusBadge.className = statusBadgeClass(item.status);
      statusBadge.textContent = String(item.status);
      valRow.appendChild(statusBadge);
    }

    const meta = document.createElement("div");
    meta.className = "mt-impact-meta";

    if (item.isProxy) {
      const proxyBadge = document.createElement("span");
      proxyBadge.className = "mt-badge";
      proxyBadge.textContent = "Proxy";
      meta.appendChild(proxyBadge);
    }

    if (item.baseline !== undefined || item.scenario !== undefined || item.delta !== undefined) {
      const parts = [];
      if (item.baseline !== undefined) parts.push(`B: ${item.baseline}`);
      if (item.scenario !== undefined) parts.push(`S: ${item.scenario}`);
      if (item.delta !== undefined) parts.push(`Δ: ${item.delta}`);
      const cmp = document.createElement("span");
      cmp.className = "mt-mono";
      cmp.textContent = parts.join(" · ");
      meta.appendChild(cmp);
    } else if (item.note && !item.limitation) {
      const notePreview = document.createElement("span");
      notePreview.textContent = String(item.note);
      meta.appendChild(notePreview);
    }

    card.append(top, valRow, meta);
    list.appendChild(card);
  }

  el.appendChild(list);
}
