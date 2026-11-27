/**
 * Gridence UI Module — Status, Progress & Toast Presentation
 * Pure presentational ES module. No fetch, no global state, no DOM outside el.
 */

const VALID_STATES = new Set(["idle", "loading", "progress", "success", "error", "warning"]);

/**
 * Render an accessible status / progress indicator into `el`.
 * @param {HTMLElement} el
 * @param {{state?: string, message?: string, progress?: number, detail?: string}|null} status
 */
export function renderStatus(el, status) {
  if (!(el instanceof Element)) return;
  el.innerHTML = "";

  if (!status || typeof status !== "object") return;

  const state = VALID_STATES.has(status.state) ? status.state : "idle";
  const box = document.createElement("div");
  box.className = `mt-status mt-status--${state}`;
  box.setAttribute("role", state === "error" ? "alert" : "status");
  box.setAttribute("aria-live", state === "error" ? "assertive" : "polite");

  const row = document.createElement("div");
  row.className = "mt-status-row";

  if (state === "loading" || state === "progress") {
    const spinner = document.createElement("span");
    spinner.className = "mt-spinner";
    spinner.setAttribute("aria-hidden", "true");
    row.appendChild(spinner);
  }

  const msg = document.createElement("span");
  msg.className = "mt-status-msg";
  msg.textContent = typeof status.message === "string" && status.message ? status.message : state.toUpperCase();
  row.appendChild(msg);

  if (typeof status.detail === "string" && status.detail) {
    const det = document.createElement("span");
    det.className = "mt-mono mt-status-detail";
    det.textContent = status.detail;
    row.appendChild(det);
  }

  box.appendChild(row);

  if (state === "progress") {
    const rawPct = Number(status.progress);
    const pct = Number.isFinite(rawPct) ? Math.max(0, Math.min(100, rawPct)) : 0;

    const track = document.createElement("div");
    track.className = "mt-progress";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(Math.round(pct)));

    const fill = document.createElement("div");
    fill.className = "mt-progress-fill";
    fill.style.width = `${pct}%`;

    track.appendChild(fill);
    box.appendChild(track);
  }

  el.appendChild(box);
}

/**
 * Render a toast notification into `el`.
 * @param {HTMLElement} el
 * @param {{type?: string, title?: string, message?: string}|null} toast
 */
export function renderToast(el, toast) {
  if (!(el instanceof Element)) return;
  el.innerHTML = "";

  if (!toast || typeof toast !== "object") return;

  const type = ["info", "success", "warning", "error"].includes(toast.type) ? toast.type : "info";
  const card = document.createElement("div");
  card.className = `mt-toast mt-toast--${type}`;
  card.setAttribute("role", type === "error" ? "alert" : "status");
  card.setAttribute("aria-live", type === "error" ? "assertive" : "polite");

  const body = document.createElement("div");
  body.className = "mt-toast-body";

  if (typeof toast.title === "string" && toast.title) {
    const title = document.createElement("strong");
    title.textContent = toast.title;
    body.appendChild(title);
  }
  if (typeof toast.message === "string" && toast.message) {
    const text = document.createElement("span");
    text.textContent = toast.message;
    body.appendChild(text);
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "mt-btn mt-btn--ghost";
  closeBtn.setAttribute("aria-label", "Dismiss notification");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => {
    el.innerHTML = "";
  });

  card.append(body, closeBtn);
  el.appendChild(card);
}
