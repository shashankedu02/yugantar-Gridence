# UI/UX specification: MonsoonTwin Console

Status: specification only. Owner: B2. Research basis: research report §Dashboard, [B31, B32, B36–B39].

## 1. Product intent
A judge should feel they are using a **climate-intelligence instrument**, not a student chart page. Every screen answers three questions:
1. What does the model think will happen?
2. What changes if we alter the world?
3. How confident should we be?

**Non-negotiables:**
1. **Live only.** Every field shown comes from a `/simulate` or `/climatology` call made in this session. There are no pre-rendered images or cached results presented as predictions. The rule is in `CLAUDE.md`.
2. **Honest resolution.** The grid is 1°. Show cells as cells: crisp pixels, or optional bilinear smoothing labelled "display interpolation".
3. **Offline.** No CDN or tile server. All libraries and fonts are vendored in `dashboard/vendor/` with their licences.
4. **Separate from the server.** Plain static HTML/CSS/JS in `dashboard/`, served with `python -m http.server 5500 -d dashboard`. It talks to the API at a configurable base URL (default `http://localhost:8000`).

## 2. Visual direction: "Monsoon Observatory"
- **Theme:** dark, low-glare, scientific. A deep slate background (`#0B1220`), surface panels `#111A2B`, hairline borders `#1F2A3D`. The colour lives in the data, not the chrome.
- **Accent:** monsoon teal `#2EC4B6` for primary actions. Amber `#F4A261` only for "scenario / perturbed" so baseline vs scenario is never ambiguous.
- **Typography:**
  - Inter, OFL, vendored woff2, for UI.
  - JetBrains Mono, OFL, for numbers, so tabular figures align.
  - Fallback is the system font stack.
  - Type scale: 12 / 14 / 16 / 20 / 28 px.
  - Numbers always show units (K or °C toggle, mm/day, m/s, hPa, kg/m²).
- **Motion:** 150–250 ms ease-out on panel transitions. The rollout animation is 400 ms per day by default. No decorative motion.
- **Colour maps** (perceptually uniform, colour-blind safe) [B31, B32]:

| Field | Map | Notes |
|---|---|---|
| t2m | cmocean `thermal` (or Crameri `lajolla`) | Display in °C. Fixed range per season preset. |
| tp | cmocean `rain` with a white/transparent < 1 mm/day | Log-like bins: 1, 2.5, 5, 10, 20, 35, 65, 115 mm |
| u10/v10 | Speed in cmocean `speed` with particles/arrows on top | |
| msl | cmocean `diff` contours or `dense` | Display in hPa |
| tcwv | cmocean `haline` / `ice` | |
| Any difference (scenario − baseline) or anomaly | cmocean `balance` (diverging, zero = neutral grey) | **Symmetric range**, so the zero point is honest |
| Rainfall departure | BrBG (brown = deficit, blue-green = surplus) | IMD departure bands [B44] |

  - No rainbow or jet colour maps [B31].
  - **Colour limits are fixed** across days and between baseline and scenario, so the visual comparison is truthful.

## 3. Information architecture
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Top bar: MonsoonTwin · case selector · model badge (name, live/DAP) · API ● │
├───────────────┬──────────────────────────────────────────────┬──────────────┤
│ LEFT RAIL     │ MAP STAGE                                    │ RIGHT RAIL   │
│ 1 Scenario    │  [Baseline] [Scenario] [Difference] [Split]  │ Impact Lens  │
│   builder     │  channel tabs: Temp Rain Wind Pressure Moist │  - Monsoon   │
│ 2 Presets     │  ┌───────────────── canvas ───────────────┐  │    break     │
│   warm Bay    │  │ 32×36 field, coastline from LSM,       │  │  - Rain dep. │
│   stall AS    │  │ graticule, shock outline, particles    │  │  - Heavy-rain│
│   custom      │  └────────────────────────────────────────┘  │    days      │
│ 3 Ensemble    │  timeline: Day 1 … Day 10 ▶ (scrub/play)     │  - Heat-anom.│
│   N, spread   │  colour bar with units                       │    days      │
│ 4 Run ▶       │                                              │ Uncertainty  │
├───────────────┴──────────────────────────────────────────────┴──────────────┤
│ BOTTOM DOCK: click-a-cell time series (baseline vs scenario vs clim, ens band)│
│ · shock energy-vs-distance chart (locality and spread, the judge's own metric)│
│ · run log: inference_ms, steps, model_name, timestamp                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Views:**
1. **Baseline**: the rollout with `perturbation: null`.
2. **Scenario**: the rollout with the painted shock.
3. **Difference**: scenario − baseline, diverging colour map, with the shock box outlined. This is where "local first, then spreading" would be visible; whether our model does it is **[UNVERIFIED]** until the battery measures it.
4. **Split**: baseline and scenario side by side, with linked cursors.
5. **Small multiples** (optional): days 1, 2, 4, 6, 8, 10 in one strip, for the brief's figure.

## 4. Key interactions
| Interaction | Behaviour |
|---|---|
| Choose case | Loads `cases/<id>.json` (3 days of state and doy_sincos) and shows "Initial state: day 0" |
| Presets | *Warm Bay of Bengal* and *Monsoon stall* build exactly the kit's shock deltas client-side from the current state (same boxes and factors). *Cyclone seed* is a −10 hPa Gaussian in the Bay. |
| Custom brush | Choose channel, operation (add / scale %), magnitude, radius in cells, Gaussian or box. Click or drag on the map to paint. A live preview shows the delta. "Clear" resets it. |
| Run | Queues the baseline call, then the scenario call. **One request in flight at a time**, because the server processes CPU-bound calls sequentially (D-18). Shows a progress state and `inference_ms` per call. If the user re-runs, the old results stay visible until the new ones arrive. |
| Timeline | Scrub or play days 1–10; keys ← → and space |
| Hover | Tooltip: lat/lon, value with units, baseline vs scenario vs climatology |
| Click cell | Bottom-dock time series |
| Ensemble | Toggle on, then N = 4 extra calls by default (up to 8) with smooth noise (see `SHOCK_AND_DYNAMICS.md` §6), sent through the same one-at-a-time queue with a progress bar. Shows the mean and a ±1σ band in the time series, and a spread map. Labelled "sensitivity to initial conditions". |
| Export | PNG of the current map (for the brief) and JSON of the current rollout. Exports are clearly labelled with timestamp and model name. |

## 5. Rendering strategy
- **Field raster:** draw onto a 36 × 32 offscreen canvas (one pixel per cell, via a colour lookup table), then scale it to the stage with `imageSmoothingEnabled=false` (crisp cells) or `true` (labelled interpolation). This is cheap and needs no dependency [research report §Dashboard].
- **Projection:** equirectangular, x = lon and y = lat. The domain is small, so the distortion is acceptable and simple.
- **Coastline:** a marching-squares contour of `land_sea_mask` at 0.5, from `/meta`. This uses the model's own geography, works offline, and **draws no political boundaries**. That avoids the Survey of India boundary-depiction requirements for maps of India [B37, B38].
  - Optional extra: approximate city markers (Mumbai, Delhi, Kolkata, Chennai, Bengaluru, Guwahati) as reference points.
- **Wind:** a custom canvas particle tracer (bilinear interpolation of u10/v10, about 1,500 particles, fading trails) after cambecc/earth (MIT) [B39]. There is an **arrow toggle** (one arrow per 2×2 cells) for honesty about resolution.
- **Pressure:** contour lines every 2 hPa over the field. Marching squares, same code as the coastline.
- **Charts:** a small vendored library (ECharts, Apache-2.0, or hand-rolled SVG) for the time series and the energy-vs-distance chart.
- **Performance budget [UNVERIFIED targets]:** first paint under 1 s from local files; a day change under 16 ms; the particle animation at 60 fps for about 1,500 particles.

## 6. The Monsoon Impact Lens (impact extension)
All indicators are computed **in the browser from the live rollout and `/climatology`** (fields, plus core-zone rain mean and std). Each shows baseline, scenario and Δ. Each has an "ⓘ method" popover with the definition and its limitation.

| Indicator | Definition (on 1° grid-mean daily values) | Honest limitation |
|---|---|---|
| **Monsoon Break Watch** (flagship) | Core monsoon zone 18–28 N, 65–88 E (inside our grid) [B33]. Daily zone-mean rain anomaly normalised by the climatological std for that day; a break is ≤ −1.0 for ≥ 3 consecutive days (Rajeevan et al. criterion, used for July–August) [B33]. Shows a 10-day index sparkline, baseline vs scenario. | The official criterion uses IMD gridded rain; ERA5 differs from IMD [B18]. A 10-day horizon can only *flag* a break onset. **Needs a per-doy std of zone-mean rain**: computed in training (366 numbers) and served by `/climatology`. |
| Rainfall departure map | Rollout total vs climatological total over the same days, binned into IMD departure categories (Excess ≥ +20%, Normal −19…+19%, Deficient −20…−59%, Large deficient ≤ −60%) [B44] | Over a 10-day window, not a season |
| Heavy-rain hazard days | Per cell, the count of days with grid-mean tp ≥ 10 mm/day (the scorer's threshold) and ≥ 64.5 mm/day (IMD "heavy" [B34]) | Grid means rarely reach station-level extremes; a hazard proxy, **not** flood risk |
| Heat-anomaly days | Days with t2m − climatology ≥ +3 K and ≥ +5 K | **Not** IMD heatwave: IMD uses station daily maximum temperature [B35]; our t2m is the daily mean. Thresholds live in config, since IMD criteria may change [research notes]. |
| Uncertainty | Ensemble spread of the indicator (min–max across members) | Under-dispersive, initial-condition only [B28] |

**Story for judges:** "A 40% weaker Arabian Sea wind → here is how much west-coast rain and core-zone rain drop over 10 days, and whether the model starts flagging a monsoon break."

## 7. Component inventory (all in `dashboard/js/`)
| File | Responsibility |
|---|---|
| `config.js` | API base URL, colour ranges, impact thresholds |
| `api.js` | `health()` (POST `/health`, drives the API ● indicator), `simulate()`, `climatology()`, `meta()`; a one-at-a-time request queue; per-request timeout 15 s, starting when the request is sent; error toasts |
| `state.js` | A single store (current case, shock, results, view, day) |
| `render.js` | Field raster, colour LUTs, colour bar |
| `contour.js` | Marching squares (coastline, isobars) |
| `wind.js` | Particles and arrows |
| `scenario.js` | Presets, brush, delta construction (mirrors the kit shocks exactly) |
| `ensemble.js` | Smooth-noise generator, parallel calls, statistics |
| `impact.js` | Impact Lens indicators |
| `charts.js` | Time series, energy-vs-distance |
| `app.js` | Wiring, keyboard shortcuts |

## 8. Accessibility and responsiveness
- Contrast ≥ 4.5:1 for text.
- Colour maps are colour-blind safe, and difference maps always have a numeric colour bar.
- Keyboard: ←/→ change the day, space plays, 1–5 switch channel, B/S/D switch view.
- Layout targets a 1920 × 1080 projector and a 1366 × 768 laptop. Below 1200 px wide, the rails collapse into drawers.

## 9. Definition of done (dashboard)
1. Works with the server running offline (Wi-Fi off) on both team laptops.
2. A preset shock run (two queued calls) completes in at most 2 × the measured single-call latency + 0.5 s.
3. The difference view shows the response from the live call. The auditor verifies one cell value against a direct `curl` call.
4. Every indicator has a method popover with its limitation.
5. No console errors. Vendored licences are present in `dashboard/vendor/LICENSES.md`.
6. The repo scan still gives `server_separate_from_ui: true` and `frontend_present: true`.
