# W3 MonsoonTwin Observatory — Independent QA Report

**Overall Verdict:** **READY WITH MINOR ISSUES** *(All automated Node.js unit/edge-case tests, `.venv\Scripts\python.exe tools\preflight.py` (`465 passed, 2 skipped`), integration contracts, static security scans, and Playwright Chromium checks for `1920×1080`, `1366×768`, `1024×768`, drawers, all 19 controls, and keyboard shortcuts **PASS** with **0 console errors**, **0 page errors**, and **0 external network requests**. One responsive CSS defect was found on `390×844` mobile: `.mt-map-grid` stretches vertically to aspect ratio `0.858` instead of `1.125`.)*

---

## 1. Executive Summary
An independent QA audit was conducted on branch `w3/ui-sandbox-design` (HEAD `28c9142` plus uncommitted W3 P1 remediation changes) without modifying any implementation files. Phase 1–6 automated tests and Playwright Chromium browser verification (`1920×1080`, `1366×768`, `1024×768`, `390×844`) were executed. Desktop, laptop, and tablet layouts, all 19 interactive controls, drawer open/close/`Escape` flows, and keyboard shortcut guards all passed. One mobile (`390×844`) map-cell aspect-ratio defect was identified and documented below.

---

## 2. Branch & Commit Information
- **Repository:** `yugantar-monsoon-kit`
- **Branch:** `w3/ui-sandbox-design`
- **HEAD Commit:** `28c9142 feat(w3): add MonsoonTwin observatory UI and design system`
- **Working Tree (uncommitted W3 P1 remediation):**
  - Modified: `dashboard/css/components.css`, `dashboard/css/layout.css`, `dashboard/js/ui/charts.js`, `dashboard/js/ui/energy.js`, `dashboard/js/ui/legend.js`, `dashboard/ui-sandbox.html`
  - Untracked: `dashboard/js/ui/colormap.js`, `dashboard/js/ui/status.js`

---

## 3. Files Inspected
- **CSS:** `dashboard/css/tokens.css`, `dashboard/css/base.css`, `dashboard/css/layout.css`, `dashboard/css/components.css`
- **JS UI Modules:** `dashboard/js/ui/colormap.js`, `dashboard/js/ui/legend.js`, `dashboard/js/ui/charts.js`, `dashboard/js/ui/energy.js`, `dashboard/js/ui/impact.js`, `dashboard/js/ui/banner.js`, `dashboard/js/ui/model-banner.js`, `dashboard/js/ui/status.js`
- **Sandbox & Tooling:** `dashboard/ui-sandbox.html`, `tools/preflight.py`, `dashboard/README.md`, `CLAUDE.md`

---

## 4. Tests Executed

| Suite / Command | Status | Observed Result |
|---|---|---|
| `.venv\Scripts\python.exe tools\preflight.py` | **PASS** | `465 passed, 2 skipped in 6.99s`; `ok tracked files`; `ok file sizes`; `ok secrets`; `ok serve.py at the repo root`; `ok repo scan 5.5/15, flags: ['no model checkpoint in the repo and no Hugging Face link']`; `ok tests`. |
| Node.js `v24.11.1` ES Module & Edge-Case Suite | **PASS** | `QA_NODE_SUITE_PASSED` — verified `toFiniteNumber`, `valueToRgba`, `renderLegend`, `renderSeries`, `renderEnergyByDistance`, `renderImpactCards`, `renderModelBanner`, `renderStatus`, `renderToast`, re-exports, and `null`/`undefined`/`NaN`/`""`/`0`/malformed/empty-array handling. |
| Static Security & Network Scan (`Select-String`) | **PASS** | Zero matches for `fetch(`, `XMLHttpRequest`, `WebSocket`, `localStorage`, `sessionStorage`, `eval(`; only `http://www.w3.org/2000/svg` XML namespace literal. |
| Playwright Chromium Browser Suite (`http://127.0.0.1:5500/ui-sandbox.html`) | **PASS (with 1 mobile defect)** | All 4 viewports captured; `0` console errors, `0` console warnings, `0` page errors, `0` external requests; all 19 controls, drawers, and keyboard shortcuts verified. `390×844` map aspect ratio failed (`0.858` vs `1.125`). |

---

## 5. Eight P1 Results Individually

| P1 ID | Area | Status | Observed Evidence |
|---|---|---|---|
| **P1-1** | Null & missing data handling | **PASS** | Node.js assertions + Playwright: `#toggle-missing` toggle switches `renderSeries` between broken segments and 2 continuous paths (`missing_off_series_paths: 2`); hatched missing-data pattern visible on canvas in screenshots. |
| **P1-2** | Desktop drawer visibility | **PASS** | Playwright computed style: `drawerLeftDisplay: "none"`, `drawerRightDisplay: "none"`, `drawerCloseDisplays: ["none", "none"]` at `1920×1080` and `1366×768`; `"flex"` at `1024×768` and `390×844`. At `1024×768`, `#btn-open-left` sets `hasOpenClass: true`, `ariaExpanded: "true"`; `Escape` closes it (`false`). `#btn-open-right` opens/closes via `[data-close-drawer='right']`. |
| **P1-3** | Map cell geometry (`36×32`, `1.125` ratio, north-up) | **FAIL** (on `390×844`) | `1920×1080` (`580.94×516.39`, `1.125`), `1366×768` (`412.45×366.63`, `1.125`), `1024×768` (`412.45×366.63`, `1.125`) **PASS**. `390×844` **FAIL**: `346×403.11` (`0.858`, stretched vertically). |
| **P1-4** | Shared map & legend colour mapping | **PASS** | `legend.js` and `ui-sandbox.html` both import `colormap.js`; `<1, 1, 2.5, 5, 10, 20, 35, 65, 115` rainfall bins and neutral-grey difference zero verified. |
| **P1-5** | Loading, progress, error & toast states | **PASS** | Playwright verified all 7 states (`idle`, `loading`, `progress`, `success`, `warning`, `error`, `toast`) render `.mt-status--*` / `.mt-toast` plus `btn-run-sim` completion `"Sandbox rollout ready (synthetic only) 0 ms"`. |
| **P1-6** | Keyboard shortcut conflicts | **PASS** | Playwright verified `ArrowRight` (`Day 3/10`), `ArrowLeft` (`Day 2/10`), `1` (`t2m`), `Control+d` (not intercepted, remained `VIEW: BASELINE · t2m`), `d` (`DIFFERENCE`), `b` (`BASELINE`), `s` (`SCENARIO`), and `Space` while focused on `#btn-run-sim` did not toggle `#btn-play` (`▶ Play`). |
| **P1-7** | Non-functional controls | **PASS** | All 19 controls tested in Playwright and produced expected DOM/state changes. |
| **P1-8** | `1366×768` responsive layout | **PASS** | `scrollWidth: 1366` (no horizontal overflow), primary topbar + banners + map + legend + timeline + both rails fit in `768px` height; bottom dock charts accessible via vertical scroll. |

---

## 6. Four Viewport Results Individually

| Viewport | Status | `scrollWidth` / Overflow | Map Dimensions & Aspect | Drawer Triggers | Charts Visible |
|---|---|---|---|---|---|
| `1920×1080` | **PASS** | `1920` / `false` (`scrollHeight: 1345`) | `580.94 × 516.39` (`1.125`) | `none` / `none` | `true` / `true` |
| `1366×768` | **PASS** | `1366` / `false` (`scrollHeight: 1066`) | `412.45 × 366.63` (`1.125`) | `none` / `none` | `true` / `true` |
| `1024×768` | **PASS** | `1024` / `false` (`scrollHeight: 1156`) | `412.45 × 366.63` (`1.125`) | `flex` / `flex` | `true` / `true` |
| `390×844` | **FAIL** | `390` / `false` (`scrollHeight: 1591`) | `346 × 403.11` (`0.858` ≠ `1.125`) | `flex` / `flex` | `true` / `true` |

---

## 7. Control-by-Control Test Results (`PASS`)

- **Initial state selector (`#case-select`):** `synth-onset` selected (**PASS**)
- **Presets (`monsoon_stall`, `warm_bay`, `none`):** `aria-pressed="true"` toggled (**PASS**)
- **Custom brush radius (`#brush-radius`):** `7` updated `#brush-radius-val` (**PASS**)
- **Display interpolation (`#toggle-interp`):** `.is-interpolated` toggled `true` (**PASS**)
- **Missing cells toggle (`#toggle-missing`):** SVG series paths updated (`2` continuous paths when off) (**PASS**)
- **Run Sandbox Rollout (`#btn-run-sim`):** `"Sandbox rollout ready (synthetic only) 0 ms"` (**PASS**)
- **Status selector (`#status-demo-select`):** `idle`, `loading`, `progress`, `success`, `warning`, `error`, `toast` all `true` (**PASS**)
- **Views (`baseline`, `scenario`, `difference`):** HUD updated to `BASELINE`, `SCENARIO`, `DIFFERENCE` (**PASS**)
- **Channels (`t2m`, `tp`, `wind`, `msl`, `tcwv`):** HUD updated to each channel (**PASS**)
- **Day slider (`#day-slider`) & Play/Pause (`#btn-play`):** `Day 5/10`, `❚❚ Pause` → `▶ Play` (**PASS**)

---

## 8. Console Errors & Warnings (`PASS`)
- **Console errors:** `0`
- **Console warnings:** `0`
- **Page errors:** `0`

---

## 9. Screenshots Captured
- `diagnostics/w3-qa-screenshots/viewport-1920x1080.png`
- `diagnostics/w3-qa-screenshots/viewport-1366x768.png`
- `diagnostics/w3-qa-screenshots/viewport-1024x768.png`
- `diagnostics/w3-qa-screenshots/viewport-390x844.png`

---

## 10. Integration Contract Verification (`PASS`)
- `dashboard/js/ui/legend.js` → `renderLegend(el, data, options?)` (**PASS**)
- `dashboard/js/ui/charts.js` → `renderSeries(el, data, options?)` (**PASS**)
- `dashboard/js/ui/charts.js` & `dashboard/js/ui/energy.js` → `renderEnergyByDistance(el, data, options?)` (`===` identity verified) (**PASS**)
- `dashboard/js/ui/impact.js` → `renderImpactCards(el, indicators)` (**PASS**)
- `dashboard/js/ui/banner.js` & `dashboard/js/ui/model-banner.js` → `renderModelBanner(el, model, options?)` (`===` identity verified) (**PASS**)

---

## 11. Security & Regression Findings (`PASS`)
- **External requests observed by Playwright:** `[]` (0 external requests; only `http://127.0.0.1:5500/...`).
- **W1/W2/shared files modified:** `0`.
- **Secrets / storage APIs:** `0`.

---

## 12. Tests Blocked or Not Performed
- **None** — all Phase 1–6 automated and Playwright browser checks were executed.

---

## 13. Remaining Defects & Recommendations

### Defect QA-01: Mobile (`390×844`) Map Canvas Aspect Ratio Stretched & Bottom HUD Clipped
- **Severity:** **Major** (violates P1-3 map cell geometry requirement on mobile `390×844`).
- **File & Lines:** `dashboard/css/components.css` lines `318–340` (`.mt-map-frame` `height: clamp(240px, 48vh, 520px)` and `.mt-map-grid` `height: 100%; max-width: 100%; aspect-ratio: 36 / 32;`).
- **Screenshot:** `diagnostics/w3-qa-screenshots/viewport-390x844.png`.
- **Reproduction Steps:**
  1. Serve `dashboard/` locally and open `http://localhost:5500/ui-sandbox.html` at viewport `390×844`.
  2. Measure `document.getElementById('sandbox-map').getBoundingClientRect()`.
- **Expected Behaviour:** Map canvas maintains `36:32` (`1.125`) aspect ratio with crisp square 1° cells and letterboxed frame, and bottom HUD chips fit cleanly without clipping.
- **Actual Behaviour:** `max-width: 100%` caps width at `346px` while `height: 100%` forces height to `403.11px`, yielding aspect ratio `0.858` (cells stretched vertically), and the bottom HUD chips clip slightly at the bottom edge.
- **Recommendation:** On `.mt-map-frame` / `.mt-map-grid`, avoid forcing `height: 100%` simultaneously with `max-width: 100%` when container width is narrower than `height * 1.125` (e.g., use `width: min(100%, calc(48vh * 36 / 32)); height: auto; aspect-ratio: 36 / 32;` on `.mt-map-grid` and `height: auto; aspect-ratio: 36 / 32;` on `.mt-map-frame` below `768px`).
