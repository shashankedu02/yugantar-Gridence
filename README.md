# Gridence

**Gridence — AI-Powered Monsoon Forecasting and Climate Scenario Intelligence**

*Yugaantar DevForge 2026 · Track 2 "Multiverse of Monsoon"*

Gridence takes the last three days of India's surface weather, forecasts the following days on a 1° grid, and lets you change today's conditions in one area and compare the two forecasts. It runs offline on a CPU.

> **Model status: UNVALIDATED.** Our measurements were made by one team member and have not been independently reproduced. Treat forecasts and shock responses as exploratory. See [Limitations](#14-limitations-and-validation-status).

![Gridence dashboard: difference between a scenario and the baseline forecast](docs/brief/figure-dashboard.png)

**For evaluators:** [install](#10-installation) → [start](#11-start-the-backend-and-the-dashboard) → [validate](#12-official-validator-and-tests). The two-page brief is [`docs/brief/Gridence_brief.pdf`](docs/brief/Gridence_brief.pdf). The server is [`serve.py`](serve.py). The model weights are ordinary files in [`weights/`](weights/MANIFEST.md) (no Git LFS, no download).

Contents: [1](#1-gridence) · [2 Problem](#2-the-problem) · [3 What it does](#3-what-gridence-does) · [4 Architecture](#4-system-architecture) · [5 Technology](#5-technology) · [6 Data](#6-data-and-inputs) · [7 Models](#7-models) · [8 Scenarios](#8-baseline-and-scenario) · [9 Difference](#9-difference) · [10 Install](#10-installation) · [11 Start](#11-start-the-backend-and-the-dashboard) · [12 Validate](#12-official-validator-and-tests) · [13 Demo](#13-demo) · [14 Limitations](#14-limitations-and-validation-status) · [15 Layout](#15-repository-structure) · [16 Licence](#16-licence-and-attribution)

## 1. Gridence
An offline forecast server ([`serve.py`](serve.py), FastAPI) and a separate static web dashboard ([`dashboard/`](dashboard/)). The product was developed under the working name *MonsoonTwin*; some internal identifiers keep that name because the API, the model file and the saved evaluation reports depend on them (see the note at the end of section 4).

## 2. The problem
A forecast answers "what is likely?". A planner often also needs "what if conditions here were different today?": warmer water in the Bay of Bengal, weaker monsoon winds, a burst of rain over one region. The track asks for a daily 1° India weather emulator that accepts such a localised shock, keeps its first response local, and rolls it forward, served offline within strict CPU, memory and time limits.

## 3. What Gridence does
- Forecasts six surface variables, 1 to 30 days ahead (the dashboard offers 5, 10, 14 or a typed number).
- Applies one of the organisers' two shocks, or a custom rectangle or smooth shock on any variable.
- Shows **Baseline**, **Scenario** and **Difference** maps, per-cell time series against climatology, how far the response reaches from the shocked area, and labelled impact proxies.
- Names the model that answered every forecast, and removes old results when anything changes.

## 4. System architecture
```
 dashboard/ (static HTML, CSS, JavaScript)          serve.py (FastAPI, HTTP only)              twin/ (inference)
 weather case + shock  ── POST /simulate ─────────▶  parse and validate the request ───────▶  add shock to the last input day,
 maps, charts, impact  ◀─ forecast + model header ─  encode the response           ◀───────  clamp to physical limits, roll
                          POST /health /meta /climatology                                     forward: LocalNet C64, DAP fallback
                                                                                                  ▲ weights/ (read only)
```
| Endpoint (all `POST`) | Purpose |
|---|---|
| `/health` | `{"status": "ready", "model_name": "..."}` once the model is loaded |
| `/simulate` | request `{"init_states": [3,6,32,36], "doy_sincos": [sin, cos], "steps": 1–30, "perturbation": null or [6,32,36]}`; response `{"rollout": [steps,6,32,36], "inference_ms": number}` |
| `/meta` | dashboard only: grid, channel standard deviations, static fields, model information |
| `/climatology` | dashboard only: climatology for the forecast days |

Details: [`docs/DASHBOARD_API.md`](docs/DASHBOARD_API.md). The response header `X-MonsoonTwin-Model` names the model that answered; `X-MonsoonTwin-Fallback` appears only after a fallback. Errors are 400 (not JSON) or 422 (invalid field, with the reason).

**Internal identifiers that keep the earlier name:** the two response headers above, the model IDs `monsoontwin-localnet-c64-unvalidated` and `monsoontwin-dap-unvalidated`, the checkpoint format tag inside `localnet.pt`, the browser storage key for the server address, test fixtures, and code comments in the backend. The dashboard shows readable model names ("LocalNet C64 (unvalidated)") and lists the exact ID under **Technical details**.

## 5. Technology
| Part | Used |
|---|---|
| Server | Python 3.10+, FastAPI, Uvicorn, NumPy |
| Model | PyTorch (CPU for serving; no GPU needed) |
| Dashboard | Plain HTML, CSS and ES modules; SVG and canvas charts; no framework, no CDN, no build step |
| Training and evaluation | SciPy, xarray, netCDF4, the organisers' `monsoon_r1` kit |
| Tests | pytest, Node's built-in test runner, headless Edge or Chrome |

## 6. Data and inputs
- **Grid:** 32 × 36 cells of 1°, centres 6.5–37.5°N (row 0 = south) and 65.5–100.5°E. Daily values.
- **Channels, in order:** `t2m` K, `tp` mm/day, `u10` m/s, `v10` m/s, `msl` Pa, `tcwv` kg/m². Physical units everywhere.
- **Forecast input:** three consecutive days and `doy_sincos`, the sine and cosine of the day of year of the **last** input day (1 = 1 January; the contract does not state the base). `rollout[k]` is day k+1.
- **Training data:** the organisers' `india_climate_train.nc` (ERA5-based), SHA-256 `f37bdbd0bd44e6fe951adf36c9a08620075f9d17de391b04c97d61f06797903b`. It is **not** in the repository and is not needed to run Gridence.
- **Split:** network training 2005–2015; model choices 2016–2017; frozen validation 2018–2019; test years 2020–2021 **not used**.
- **Included inputs:** [`dashboard/cases/`](dashboard/cases/) holds four real 3-day input states from 2018–2019 (inputs only, no targets or forecasts), chosen by fixed rules by `tools/make_demo_cases.py`. A clearly labelled synthetic input is also available. All forecasts are computed live.

## 7. Models
**LocalNet C64 (served).** A 313,735-parameter residual CNN: 3×3 stem, four residual blocks, 64 channels, per-cell layer normalisation, no down-sampling or global layers. It predicts one-day changes (rain in log1p space) from the last 3 days, the target day's climatology, land–sea mask, orography and calendar features, one day at a time. Trained on 2005–2015: one-step training, then 2- and 4-step rollout fine-tuning. `weights/model_select.json` names the checkpoint by hash; all model files come from one training run ([`weights/MANIFEST.md`](weights/MANIFEST.md)).

**DAP (fallback).** Damped anomaly persistence, for each variable and cell: `forecast(d+k) = climatology(d+k) + φ^k × (last input − climatology(d))`, fitted on 2005–2015. It cannot drift, and it **cannot spread a shock**.

| When | What answers | How you can tell |
|---|---|---|
| `torch` or the checkpoint cannot be loaded at start-up | DAP for every request | `model_name` is `monsoontwin-dap-unvalidated` |
| A runtime error during a request | DAP for that whole request | `X-MonsoonTwin-Fallback: whole-request-fallback` |
| A non-finite LocalNet step | one DAP step inside the forecast | `X-MonsoonTwin-Fallback: repaired-steps=n` |

The dashboard does not draw a difference between forecasts that were not answered the same way. A fallback does **not** protect against a slow or memory-limited machine, or against a poor but finite forecast.

### Local results
**Measured locally by one team member and not independently reproduced by a second person. This replicates part of the automatic scoring; it is not the competition score.** The judge uses other windows and does not publish how it averages.

| 46 forecast windows and 6 × 2 shock tests, 2018–2019 | LocalNet (served) | DAP fallback |
|---|---|---|
| All outputs valid; zero shock identical; deterministic | pass | pass |
| Mean day-4 skill against persistence | +0.249 | +0.196 |
| Local replica, RMSE skill (of 30) · heavy rain (of 15) | 29.5 · 0.8 | 16.4 · 0.0 |
| Local replica, anti-blur (of 10) · shock causality (of 15) | 9.45 · 13.4 | 10.0 · 11.25 |
| **Local replica total (of 70)** | **53.2** | **37.7** |
| Heavy-rain CSI at day 1 · 4 · 8 | 0.34 · 0.20 · 0.15 | 0.30 · 0.18 · 0.22 |
| Shocks non-zero and local on day 1 | 12/12 | 12/12 |
| Shocks spreading outward: warm ocean · monsoon stall | **6/6 · 2/6** | 0/6 · 0/6 |
| Shocks within the stability limit | **11/12** | 12/12 |

Against the better of persistence and climatology, LocalNet is clearly ahead at day 1 (+0.25 to +0.34), mostly slightly ahead at day 4 (pressure is −0.03), and **behind on every variable at day 8** (−0.02 to −0.12), where it is also behind DAP. Day-8 spatial variance as a share of the real one: t2m 0.99, **tp 0.27**, u10 0.75, v10 0.77, msl 0.96, tcwv 0.94. Source: [`eval/reports/activation/`](eval/reports/activation/).

### Runtime
Measured on a Windows laptop (i5-13450HX), server restricted to 4 logical processors, over HTTP, with two CPU-only PyTorch builds. **Not measured on Linux or on the judge's hardware.**

| LocalNet | torch 2.15.0+cpu | torch 2.6.0+cpu | Limit |
|---|---|---|---|
| Process start to ready | 3.4 s | 3.4 s | 120 s |
| 10-step request, slowest of 12, including JSON | 133 ms | 155 ms | 5 s |
| 30-step request, slowest of 12 | 329 ms | 354 ms | |
| Peak memory of the server process | 262 MB | 241 MB | 6 GB |

The slowest 10-step call measured in any run was 191 ms (2.6.0+cpu, a second run that mixed shocks and forced fallbacks). On four demo cases, 2.15.0+cpu matched the 2.14.1 build used in training bit for bit (on the CPU); 2.6.0+cpu differed by at most 0.00004 standard deviations over 10 days and 0.0005 over 30. Older PyTorch releases are untested. The server made no outbound connection attempt and ran from a read-only copy of the repository.

## 8. Baseline and scenario
- **Baseline:** the forecast from the three input days, unchanged (`perturbation: null`).
- **Shock:** a change in physical units added to the **last input day only**; the server then limits values to physical ranges.
- **Scenario:** the forecast from the shocked input. A zero shock gives output bit-identical to the baseline.

| Official shock | Area (cell centres) | Change |
|---|---|---|
| Warm Bay of Bengal | 8.5–19.5°N, 82.5–93.5°E (12 × 12) | temperature +3.0 K; water vapour +15 % of each cell's value |
| Monsoon Stall (Arabian Sea) | 8.5–19.5°N, 65.5–74.5°E (12 × 10) | both wind components −40 % |

**Custom shock:** one variable at a time, add or percentage change, rectangle or smooth blob; several parts can be added together. It replaces a selected official shock rather than combining with it.

## 9. Difference
`Difference = Scenario − Baseline`, cell by cell, for every day and variable, computed in the browser from the two server responses. **Orange:** higher with the shock. **Blue:** lower. **Dark:** little or no change. The colour range is symmetric about zero and the same for all days of a run, so late differences can look faint; point at a cell to read the numbers. "How far the shock reaches" uses the organisers' definition of response energy against distance from the shocked area.

## 10. Installation
Requires **Python 3.10 or newer** and Git. Internet is needed only to install packages. No dataset and no model download is needed.

**Windows (PowerShell)**
```powershell
git clone https://github.com/shashankedu02/yugantar-monsoon-kit
cd yugantar-monsoon-kit
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```
**Linux or macOS**
```bash
git clone https://github.com/shashankedu02/yugantar-monsoon-kit
cd yugantar-monsoon-kit
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```
For a smaller CPU-only PyTorch on Linux, first run `.venv/bin/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu`.

We have run these steps on Windows only. **Linux and macOS are untested.**

## 11. Start the backend and the dashboard
Terminal 1, backend:
```powershell
.\.venv\Scripts\python.exe serve.py --port 8000        # Linux/macOS: .venv/bin/python serve.py --port 8000
```
Terminal 2, dashboard:
```powershell
.\.venv\Scripts\python.exe -m http.server 5500 -d dashboard      # Linux/macOS: .venv/bin/python -m http.server 5500 -d dashboard
```
Open **http://localhost:5500** and press **Ctrl+F5** (this simple file server lets a browser keep old files). The header must say **Ready (LocalNet C64 (unvalidated))**. If it says DAP, LocalNet did not load; terminal 1 gives the reason (usually `torch` is missing). If port 8000 is taken, stop the old server first, or start on another port and enter its address under **Connection**.

## 12. Official validator and tests
With the server running, in a third terminal:
```powershell
.\.venv\Scripts\python.exe -m pip install requests third_party/monsoon_r1_kit-1.0.0-py3-none-any.whl
.\.venv\Scripts\python.exe -m monsoon_r1.schema_validator http://localhost:8000
```
(Linux/macOS: use `.venv/bin/python`.) It should end with `RESULT: all checks passed`.

<details><summary>Full test suite (developers)</summary>

```bash
pip install -r requirements-train.txt third_party/monsoon_r1_kit-1.0.0-py3-none-any.whl
python -m pytest -q                       # contract, engine, models, server, shock presets
node --test tests/js/*.test.mjs           # dashboard logic, colour scales, names (Node 22 or newer)
node tests/e2e/integration.e2e.mjs        # real browser + real server (Edge or Chrome)
node tests/e2e/dashboard.e2e.mjs          # colours, charts, layout, keyboard, safety
node tests/e2e/scenarios.e2e.mjs          # cases, shocks, impact numbers
node tests/e2e/ux.e2e.mjs                 # first use, branding, legend, pointer, narrow screens
python tools/preflight.py                 # tracked files, secrets, official repository scan, tests
```
Browser tests use `PYTHON` (an interpreter with the server requirements) and `BROWSER` (path to Edge or Chrome) if the defaults do not fit.
</details>

<details><summary>Reproducing training and evaluation</summary>

Put the dataset at `data/india_climate_train.nc` (ignored by Git) and check its SHA-256 (section 6).
```bash
python -m training.data                                              # validate the dataset
python -m training.localnet_data    --nc data/india_climate_train.nc
python -m training.fit_dap_baseline --nc data/india_climate_train.nc
python -m training.train_localnet   --nc data/india_climate_train.nc --run runs/localnet_c64/run1
python -m eval.compare --nc data/india_climate_train.nc --candidate weights --baseline runs/tune/dap_baseline --out eval/cache/compare
```
Candidate model files appear in `runs/localnet_c64/run1/candidate/`. `localnet_data` also rewrites `weights/static.npz` and `weights/norm.json`. `eval.compare` rejects a run if any call falls back to DAP, and exits with code 2 because not every shock check passes. The shipped run took under 10 minutes on an NVIDIA RTX 3050 laptop GPU (see the comment in `requirements-train.txt`); its record is `eval/reports/activation/training_run_record.json`. We have **not** shown that retraining gives a byte-identical checkpoint; the climatology, normalisation and DAP coefficients are exactly reproducible.

**Do not run `python -m training.fit_dap` on this checkout:** it fits the earlier 2005–2017 DAP and overwrites two files of the shipped model package, after which LocalNet refuses to load.

Validation windows are frozen in `eval/windows_val.json`. Some code comments cite planning documents that are no longer in the tree; they remain in the Git history (commit `7b12fe1`).
</details>

## 13. Demo
Full script: [`docs/DEMO_RUNBOOK.md`](docs/DEMO_RUNBOOK.md). Short version:
1. Choose the case **Weak monsoon spell** and keep 10 days.
2. Click **Warm Bay of Bengal**; the map outlines what the shock adds.
3. Click **Run Baseline + Scenario**.
4. The map stays on **Baseline**. Click **Scenario**, then **Difference**.
5. Step from day 1 to day 8, switch variables (Temperature and Moisture first), point at a cell to read baseline, scenario and Δ, and click it for its chart.

Scenario and Difference stay greyed out until a run with a shock has finished. Changing the shock, case or length removes the old scenario: run again. A custom shock counts only after **Add to shock**. On the opening case, "Active monsoon", neither official shock spreads by the organisers' check; the runbook lists which cases do.

## 14. Limitations and validation status
- **Unvalidated.** None of our measurements has been reproduced by a second person.
- **Shock responses are not verified physics.** In 6 test windows the monsoon-stall shock spread outward in only 2; the warm-ocean shock in 6 of 6. We make no claim about direction or speed.
- **One stability failure:** warm-ocean shock, window starting 2018-05-22: day-6 rain at 19.5°N 87.5°E changed from 57.0 to 6.6 mm/day (6.7 standard deviations; the limit is 5).
- **Added rain fades quickly**; later days can have the opposite sign, so a multi-day total can hide the daily response.
- **Day 8 is weak:** behind the better of persistence and climatology, and behind DAP, on all six variables. Rain is visibly smoothed; heavy-rain skill is near zero.
- Far outside real weather the output is meaningless: unrealistic inputs drove rain to the 1000 mm/day safety limit. Moisture can reach exactly zero at some high-altitude cells. The causes of these weaknesses have not been established.
- 1° daily grid means: not station rain, not daily maximum temperature, **not a flood or heatwave warning**. Impact indicators are proxies. The monsoon-break index is not computed.
- **Dashboard:** emptying the days box gives 1 day; one custom part cannot be removed on its own; the cell readout clears when the pointer leaves; a warning message floats over the toolbar until dismissed.
- **Not tested:** Linux, macOS, browsers other than Edge, touch devices, screen readers.
- The server has no authentication and allows any origin, as needed for a local offline dashboard.

## 15. Repository structure
```
serve.py                 HTTP server (the organisers' contract)
requirements.txt         what is needed to run (includes requirements-serve.txt)
requirements-train.txt   training, evaluation and test extras
twin/                    inference package
weights/                 model files, plain Git (see weights/MANIFEST.md)
dashboard/               web dashboard, demo input cases, reference coastline
training/                dataset checks, climatology, DAP and LocalNet training
eval/                    scoring replica, shock battery, frozen windows, activation reports
tests/                   Python, JavaScript and browser tests
tools/                   preflight, demo-case extraction, brief figure and PDF
docs/                    API reference, demo runbook, two-page brief
third_party/             the organisers' kit wheel (validator, scorer)
```

## 16. Licence and attribution
**No open-source licence has been chosen for this project's own code**, so no reuse rights are granted beyond what the competition requires.

- **Weather data:** the training data and demo inputs come from the organisers' [yug-monsoon-kit](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit). Per its NOTICE:

  > Contains modified Copernicus Climate Change Service information (ERA5, Hersbach et al. 2020), accessed through Google WeatherBench 2 (Rasp et al. 2024). ERA5 is licensed under CC BY 4.0. Fields were regridded to 1 degree, averaged to daily values and to a 32 x 36 half-degree-centred grid over 6.5N-37.5N, 65.5E-100.5E.

  Neither the European Commission nor ECMWF is responsible for any use of this information.
- **Organisers' kit:** the wheel in `third_party/` is the organisers' work, included so the validator can be run.
- **Coastline:** Natural Earth 1:50m, public domain ([details](dashboard/vendor/LICENSES.md)). No political boundaries are drawn.
