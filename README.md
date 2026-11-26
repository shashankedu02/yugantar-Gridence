# MonsoonTwin: a digital twin of India's daily weather

*Yugaantar DevForge 2026 · Track 2 "Multiverse of Monsoon"*

MonsoonTwin takes the last 3 days of India's surface weather, rolls it forward day by day on a 1° grid, and lets you apply a localised shock and compare the two forecasts. It has two parts that run separately: an offline FastAPI server (`serve.py`) and a static web dashboard (`dashboard/`).

**What is served:** **LocalNet C64**, a small residual CNN, reported by the server as `monsoontwin-localnet-c64-unvalidated`. Damped anomaly persistence (**DAP**) is the built-in fallback. "Unvalidated" is deliberate: no second person has reproduced our measurements. Read [Known limitations](#known-limitations) before relying on a forecast or a shock response.

## Quick start (serve and use the dashboard)
Requires Python 3.10 or newer. No internet is needed after installation, and no dataset is needed to run.

```bash
git clone https://github.com/shashankedu02/yugantar-monsoon-kit
cd yugantar-monsoon-kit
python -m venv .venv
.venv\Scripts\activate            # Windows.  Linux/macOS: source .venv/bin/activate
pip install -r requirements-serve.txt
python serve.py --port 8000       # terminal 1
```
```bash
python -m http.server 5500 -d dashboard      # terminal 2, then open http://localhost:5500
```
The dashboard connects to `http://localhost:8000` (editable in the top bar; press **Connect**). If an old server already uses port 8000, stop it first: the banner at the top names the model you are really talking to.

The served model needs `torch` (a CPU build is enough; no GPU is used). If `torch` or the checkpoint cannot be loaded, the server still starts, serves DAP and says so in `model_name`.

## Using the dashboard
The first screen shows the real last input day, labelled **not a forecast**, with a short "start here" card. **How to use** in the header explains the terms.

1. Pick a **weather case** (3 real input days from 2018–2019, or the labelled synthetic test input) and a **forecast length**.
2. Pick a **shock**: none, **Warm Bay of Bengal**, **Monsoon Stall**, or **Custom shock** (a rectangle, or a smooth blob you can centre by clicking the map). While no forecast is on screen, the map previews what the shock will add; if a forecast is already shown, the shock area is outlined in yellow dashes. A custom shock takes effect only after **Add to shock**, and it replaces an official shock (the two are not combined).
3. **Run.** The baseline and then the scenario are computed live by the server. Controls are locked while it runs. The map stays on **Baseline**: click **Scenario** or **Difference** above it. Both stay greyed out until a run with a shock has finished, and choosing a different shock removes the old scenario until you run again.
4. Compare **Baseline / Scenario / Difference**, play or step through the days, point at a cell to read it, click it (or pick a city) for its chart, and read the shock-reach chart and the **Monsoon Impact Lens**.

**Reading the map.** Each block is one 1° cell (about 110 km): that is the resolution of the data. The coastline and city names are reference geography; no political boundaries are drawn. A white outline marks where a shock was applied (yellow dashes: selected, not yet run); nothing is painted over the cells. Colour ranges are fitted to the run on screen, the same for all its days, and the legend says so, with the share of values beyond its ends. **Colours from different runs are therefore not comparable** unless you choose *Map options → Fixed*. *Smooth the colours* is a labelled display effect that adds no information.

Optional keys: ← → day · Space play/pause · 1–6 variable · B S D view · with the map focused, arrow keys move the selected cell.

Every forecast on screen is labelled with the model that answered the request. If the server changes or a request fails, old results are removed.

## API
All endpoints are `POST`. Full description: [`docs/DASHBOARD_API.md`](docs/DASHBOARD_API.md); the organisers' contract is in their kit.

| Endpoint | Purpose |
|---|---|
| `/health` | `{"status": "ready", "model_name": "..."}` after the model is loaded |
| `/simulate` | request `{"init_states": [3,6,32,36], "doy_sincos": [sin, cos], "steps": 1–30, "perturbation": null or [6,32,36]}`, response `{"rollout": [steps,6,32,36], "inference_ms": number}` |
| `/meta` | dashboard only: grid, channel standard deviations, static fields, model information |
| `/climatology` | dashboard only: climatology for the forecast days |

- Channels in order: `t2m` K, `tp` mm/day, `u10` m/s, `v10` m/s, `msl` Pa, `tcwv` kg/m². Physical units. Row 0 is the south (6.5°N).
- `doy_sincos` describes the **last** input day; `rollout[k]` is day k+1.
- **Perturbation:** a physical delta added to the last input day only. The result is then clamped to physical limits. A zero delta gives output bit-identical to `null`.
- Response header `X-MonsoonTwin-Model` names the model that answered; `X-MonsoonTwin-Fallback` appears only if a fallback happened. The JSON body is exactly the contract.
- Errors: 400 (not JSON) or 422 (invalid field, with the reason).

## Models
### LocalNet C64 (served)
A 313,735-parameter residual CNN: 3×3 stem, four residual blocks, 64 channels, per-cell layer normalisation, no down-sampling or global layers. It predicts one-day changes (rain in log1p space) from the last 3 days, the target day's climatology, land–sea mask, orography and calendar features, and is applied one day at a time. Trained on 2005–2015: one-step training, then 2- and 4-step rollout fine-tuning. Choices (loss scaling, checkpoint) were made on 2016–2017.

It is selected by `weights/model_select.json`, which names the checkpoint by hash. All model files come from one training run; see [`weights/MANIFEST.md`](weights/MANIFEST.md).

### DAP (fallback)
For every variable and grid cell separately: `forecast(day d+k) = climatology(d+k) + φ^k × (last input − climatology(d))`, with climatology (15-day circular smoothing, 366 slots) and φ (lag-1 least squares, limited to 0–0.99) fitted on 2005–2015. It cannot drift, and it **cannot spread a shock**.

| When | What answers | How you can tell |
|---|---|---|
| `torch` or the checkpoint cannot be loaded at start-up | DAP for every request | `model_name` is `monsoontwin-dap-unvalidated` |
| A runtime error during a request | DAP for that whole request | `X-MonsoonTwin-Fallback: whole-request-fallback` |
| A non-finite LocalNet step | one DAP step inside the forecast | `X-MonsoonTwin-Fallback: repaired-steps=n` |

`/health` and `/meta` name the model chosen at start-up. Only the response headers describe a single request. The dashboard shows them and will not draw a difference between forecasts that were not answered the same way. A fallback does **not** protect against a slow or memory-limited machine, or against a poor but finite forecast.

## Train
Download `india_climate_train.nc` from the organisers' kit release into `data/` (it is never committed). Its SHA-256 must be `f37bdbd0bd44e6fe951adf36c9a08620075f9d17de391b04c97d61f06797903b`.

```bash
pip install -r requirements-train.txt
pip install third_party/monsoon_r1_kit-1.0.0-py3-none-any.whl   # the trainer uses the organisers' scoring functions
python -m training.data                                              # validate the dataset
python -m training.localnet_data    --nc data/india_climate_train.nc
python -m training.fit_dap_baseline --nc data/india_climate_train.nc
python -m training.train_localnet   --nc data/india_climate_train.nc --run runs/localnet_c64/run1
```
The candidate files appear in `runs/localnet_c64/run1/candidate/` (Git ignores `runs/`). `localnet_data` also rewrites `weights/static.npz` and `weights/norm.json`. A GPU is optional; see the comment in `requirements-train.txt`. The shipped run used an NVIDIA RTX 3050 laptop GPU and took under 10 minutes; its configuration and history are in `eval/reports/activation/training_run_record.json`. We have **not** shown that retraining gives a byte-identical checkpoint. The climatology, normalisation and DAP coefficients are exactly reproducible.

(`python -m training.fit_dap` fits a DAP on 2005–2017. It was the model served before LocalNet and is **not** part of the current package: running it overwrites two package files and LocalNet will then refuse to load.)

Data split: train 2005–2017 (the network itself uses 2005–2015), validation 2018–2019, test 2020–2021. The test years have not been used.

## Evaluate
`eval/` re-uses the organisers' scoring functions on **frozen** validation windows (`eval/windows_val.json`). It needs the training extras above.
```bash
python -m eval.harness       --nc data/india_climate_train.nc --name LocalNet --out eval/cache/rerun
python -m eval.shock_battery --nc data/india_climate_train.nc --name LocalNet --out eval/cache/rerun
```
Both evaluate whatever `weights/` selects. For LocalNet, use `eval.compare`, which also rejects the run if any call falls back to DAP (the two commands above do not check this). It exits with code 2 because not every shock check passes:
```bash
python -m eval.compare --nc data/india_climate_train.nc --candidate weights --baseline runs/tune/dap_baseline --out eval/cache/compare
```

### Results
**Measured locally by one team member and not independently reproduced by a second person. This replicates part of the automatic scoring; it is not the competition score.** The judge uses other windows (2023–24) and does not publish how it averages.

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

Against the better of persistence and climatology, LocalNet is clearly ahead at day 1 (+0.25 to +0.34), mostly slightly ahead at day 4 (pressure is −0.03), and **behind on every variable at day 8** (−0.02 to −0.12), where it is also behind DAP. Day-8 spatial variance as a share of the real one: t2m 0.99, **tp 0.27**, u10 0.75, v10 0.77, msl 0.96, tcwv 0.94.

Source: `eval/reports/activation/`. `eval/reports/dap_validation.json/` and `dap_shocks.json/` describe the earlier 2005–2017 DAP, which is no longer shipped.

## Runtime
Measured on a Windows laptop (i5-13450HX) with the server restricted to 4 logical processors, over HTTP, with two CPU-only PyTorch builds. **Not measured on Linux or on the judge's hardware.**

| LocalNet | torch 2.15.0+cpu | torch 2.6.0+cpu | Limit |
|---|---|---|---|
| Process start to ready | 3.4 s | 3.4 s | 120 s |
| 10-step request, slowest of 12, including JSON | 133 ms | 155 ms | 5 s |
| 30-step request, slowest of 12 | 329 ms | 354 ms | |
| Peak memory (working set) of the server process | 262 MB | 241 MB | 6 GB |

A second run on the same builds, mixing null shocks, both official shocks and forced fallbacks, had one 10-step baseline call of **191 ms** (2.6.0+cpu), the slowest 10-step call measured; its peak working set was 251 MB (2.15.0) and 228 MB (2.6.0). The frozen validation windows and all 12 shock cases give the same pass and fail results on both builds.

On four demo cases, 2.15.0+cpu gave forecasts bit-identical to the 2.14.1 build used in training (run on the CPU); 2.6.0+cpu differed by at most 0.00004 standard deviations over 10 days and 0.0005 over 30. Each build is deterministic. Older PyTorch releases are untested. The server made no outbound connection attempt and ran from a copy of the repository in which writing was denied.

## Tests
```bash
pip install pytest requests third_party/monsoon_r1_kit-1.0.0-py3-none-any.whl -r requirements-train.txt
python -m pytest -q                                  # Python: contract, engine, models, server, presets
node --test tests/js/*.test.mjs                      # dashboard logic and colour scales (Node 22 or newer)
node tests/e2e/integration.e2e.mjs                   # real browser + real server (Edge or Chrome)
node tests/e2e/dashboard.e2e.mjs                     # colours, charts, layout, keyboard, safety
node tests/e2e/scenarios.e2e.mjs                     # cases, shocks, impact numbers
node tests/e2e/ux.e2e.mjs                            # first use, keyboard, legend, pointer at 1x-2x, narrow screens
python -m monsoon_r1.schema_validator http://localhost:8000
python tools/preflight.py                            # fails on any repo-scan flag
```
Browser tests use `PYTHON` (interpreter with the server requirements) and `BROWSER` (path to Edge or Chrome) if the defaults do not fit.

## Demo cases
`dashboard/cases/` holds four **input** states (3 days each, no targets, no forecasts) written by `tools/make_demo_cases.py`, which picks them by fixed rules on the input days themselves. The server never reads them. All forecasts are computed live.

## Known limitations
- **Shock responses are not verified physics.** In 6 test windows the monsoon-stall shock spread outward in only 2 (in two others the outside response faded; in two it grew but stayed below the kit's minimum). The warm-ocean shock spread in 6 of 6. We make no claim about direction or speed.
- **One stability failure:** warm-ocean shock, window starting 2018-05-22: day-6 rain at 19.5°N 87.5°E changed from 57.0 to 6.6 mm/day (6.7 standard deviations; the limit is 5).
- **Added rain fades quickly.** In the cases examined, most of an injected rain change was gone by day 3, later days can have the opposite sign, and a 10-day total can then hide the daily response. Look at the daily chart.
- **Day 8 is weak:** behind the better of persistence and climatology, and behind DAP, on all six variables. Rain is visibly smoothed (day-8 variance 0.27 of the real one). Heavy-rain skill is near zero.
- Far outside real weather the output is meaningless: unrealistic synthetic states or shocks drove rain to the 1000 mm/day safety limit. Moisture can reach exactly zero at some high-altitude cells.
- The causes of these weaknesses have not been established.
- None of our measurements has been reproduced by a second person.
- This is a 1° daily grid mean: not station rain, not a flood or heatwave warning. Impact indicators are proxies and are labelled as such. The IMD monsoon-break index is not computed.
- Day-of-year: the contract does not say whether it starts at 0 or 1; we use 1 for 1 January.
- Not tested: Linux, browsers other than Edge, screen readers.
- The server has no authentication and allows any origin, as needed for a local offline dashboard.

## Repository layout
```
serve.py        HTTP server (organisers' contract)
twin/           inference package
training/       dataset checks, climatology, DAP and LocalNet training
weights/        model files (see weights/MANIFEST.md)
eval/           scoring replica, shock battery, frozen windows, reports
dashboard/      static web dashboard and demo input cases
tests/          Python, JavaScript and browser tests
tools/          preflight, demo-case extraction
docs/           design notes written during planning; docs/brief/ has the project brief
```
Some files under `docs/` describe earlier plans. This README and the code are current.

## Data and attribution
Training data: `india_climate_train.nc` from the organisers' [yug-monsoon-kit](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit). Per its NOTICE:

> Contains modified Copernicus Climate Change Service information (ERA5, Hersbach et al. 2020), accessed through Google WeatherBench 2 (Rasp et al. 2024). ERA5 is licensed under CC BY 4.0. Fields were regridded to 1 degree, averaged to daily values and to a 32 x 36 half-degree-centred grid over 6.5N-37.5N, 65.5E-100.5E.

Neither the European Commission nor ECMWF is responsible for any use of this information. (This attribution belongs in the README and docs only, never in `serve.py` or `twin/`; the repo scanner flags data-source names in inference code.)
