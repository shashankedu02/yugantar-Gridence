# MonsoonTwin: a digital twin of India's daily weather

*Yugaantar DevForge 2026 · Track 2 "Multiverse of Monsoon"*

MonsoonTwin takes the last 3 days of India's surface weather, rolls it forward day by day on a 1° grid, and lets you apply a localised shock and compare the two forecasts. It has two parts that run separately: an offline FastAPI server (`serve.py`) and a static web dashboard (`dashboard/`).

**What is served:** damped anomaly persistence (**DAP**), reported by the server as `monsoontwin-dap-unvalidated`. A residual CNN (**LocalNet**) is implemented and trained but **not activated**; see [Models](#models).

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

`torch` is in `requirements-serve.txt` but is imported only if LocalNet is selected.

## Using the dashboard
1. Pick a **case** (3 real input days from 2018–2019, or the labelled synthetic test input).
2. Pick a shock: **Warm Bay of Bengal**, **Monsoon Stall**, none, or **Custom shock** (a rectangle, or a smooth blob you can centre by clicking the map).
3. **Run.** The baseline and then the scenario are computed live by the server. Controls are locked while it runs.
4. Compare **Baseline / Scenario / Difference**, scrub or play the days, click a cell for its time series, and read the shock-energy-by-distance chart and the **Monsoon Impact Lens**.

Keys: ← → day · Space play/pause · 1–6 variable · B S D view · with the map focused, arrow keys move the selected cell.

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
### DAP (served)
For every variable and grid cell separately: `forecast(day d+k) = climatology(d+k) + φ^k × (last input − climatology(d))`.
- Climatology: mean of each calendar day over 2005–2017, 15-day circular running mean, 366 slots.
- φ: least-squares lag-1 coefficient of the anomaly on consecutive training days, limited to 0–0.99.
- It cannot drift or explode: the anomaly only shrinks toward climatology.
- **It cannot spread a shock.** Each cell and variable is independent, so a wind or temperature shock changes neither rain nor neighbouring cells.

### LocalNet (implemented, not activated)
A 313,735-parameter residual CNN (3×3 stem, four residual blocks, 64 channels, per-cell layer normalisation, no down-sampling or global layers) that predicts one-day changes, trained on 2005–2015 with model choices made on 2016–2017. It is selected only by a `weights/model_select.json` file naming a checkpoint by hash. If it cannot load, the server serves DAP and says so in `model_name`; if it fails during a request, the whole request is answered by DAP. In local tests it scored clearly higher than DAP, but it fails some shock checks and has not been run on Linux. Details: [`diagnostics/takeover/MODEL_SELECTION_DECISION.md`](diagnostics/takeover/MODEL_SELECTION_DECISION.md).

## Train
Download `india_climate_train.nc` from the organisers' kit release into `data/` (it is never committed). Its SHA-256 must be `f37bdbd0bd44e6fe951adf36c9a08620075f9d17de391b04c97d61f06797903b`.

```bash
pip install -r requirements-train.txt
python -m training.data                                         # validate the dataset
python -m training.fit_dap --nc data/india_climate_train.nc     # the served model: weights/climatology.npz, weights/dap.npz
```
Re-fitting from this code reproduced the committed DAP files byte for byte.

LocalNet (a GPU is optional; see the comment in `requirements-train.txt`):
```bash
python -m training.localnet_data    --nc data/india_climate_train.nc
python -m training.fit_dap_baseline --nc data/india_climate_train.nc
python -m training.train_localnet   --nc data/india_climate_train.nc --run runs/localnet_c64/run1
```
`localnet_data` rewrites `weights/static.npz` and `weights/norm.json`; the training outputs go to `runs/`, which Git ignores.

Data split: train 2005–2017, validation 2018–2019, test 2020–2021. The test years have not been used.

## Evaluate
`eval/` re-uses the organisers' scoring functions on **frozen** validation windows (`eval/windows_val.json`).
```bash
pip install third_party/monsoon_r1_kit-1.0.0-py3-none-any.whl
python -m eval.harness       --nc data/india_climate_train.nc --name DAP --out eval/cache/rerun
python -m eval.shock_battery --nc data/india_climate_train.nc --name DAP --out eval/cache/rerun
```

### Results for the served DAP model
**Measured locally by one team member and not independently reproduced by a second person. This is a replica of part of the automatic scoring, not the competition score**; the judge uses other windows (2023–24) and does not publish how it averages.

| 46 validation windows (2018–2019) | Result |
|---|---|
| All outputs valid; zero shock identical; deterministic | pass |
| Mean day-4 skill against persistence | +0.197 |
| Skill against the better of persistence and climatology | slightly positive at day 1 (0.02–0.07); slightly **negative** at days 4 and 8 |
| Day-8 spatial variance as a share of the real one | t2m 0.97, tp 0.41, u10 0.70, v10 0.68, msl 0.86, tcwv 0.90 |
| Local replica: forecast skill / anti-blur | 16.6 of 45 / 10.0 of 10 (heavy-rain skill: none) |
| Shock tests, 6 windows × 2 shocks | non-zero and localised 12/12; stable 12/12; **spreads outward 0/12** |

Sources: `eval/reports/dap_validation.json/`, `eval/reports/dap_shocks.json/`.

## Runtime
Measured on a Windows laptop (i5-13450HX) restricted to 4 logical processors, over HTTP. **Not measured on Linux or on the judge's hardware.**

| | DAP |
|---|---|
| Process start to ready | 1.4 s (limit 120 s) |
| 10-step request, slowest of 8, including JSON | 59 ms (limit 5 s) |
| Peak memory of the server process | about 101 MB (limit 6 GB) |

The server makes no outbound connections (checked with them blocked) and ran from a read-only copy of the repository.

## Tests
```bash
pip install pytest requests third_party/monsoon_r1_kit-1.0.0-py3-none-any.whl -r requirements-train.txt
python -m pytest -q                                  # Python: contract, engine, models, server, presets
node --test tests/js/dashboard.test.mjs              # dashboard logic (Node 22 or newer)
node tests/e2e/integration.e2e.mjs                   # real browser + real server (Edge or Chrome)
node tests/e2e/dashboard.e2e.mjs                     # colours, charts, layout, keyboard, safety
node tests/e2e/scenarios.e2e.mjs                     # cases, shocks, impact numbers
python -m monsoon_r1.schema_validator http://localhost:8000
python tools/preflight.py                            # fails on any repo-scan flag
```
Browser tests use `PYTHON` (interpreter with the server requirements) and `BROWSER` (path to Edge or Chrome) if the defaults do not fit.

## Demo cases
`dashboard/cases/` holds four **input** states (3 days each, no targets, no forecasts) written by `tools/make_demo_cases.py`, which picks them by fixed rules on the input days themselves. The server never reads them. All forecasts are computed live.

## Known limitations
- The served model does not spread shocks, so scenario differences stay in the shocked cells, and rain changes only if rain itself is shocked.
- Heavy-rain skill is near zero. This is a 1° daily grid mean: not station rain, not a flood or heatwave warning.
- Impact indicators are proxies and are labelled as such. The IMD monsoon-break index is not computed.
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
