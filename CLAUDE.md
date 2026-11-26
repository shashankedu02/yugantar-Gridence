# CLAUDE.md: MonsoonTwin project rules (authoritative)

This file overrides any other document when they disagree. If you find a contradiction, stop and report it; don't pick one silently.

**Project:** Yugaantar DevForge 2026, Track 2 "Multiverse of Monsoon". Build a daily 1° India weather emulator with shock branching, an offline FastAPI server, and a separate live dashboard.

**Status:** Milestone 1 exists: contract-compliant server (placeholder persistence forecast), DAP code (not fitted, not validated), data loader, tests. No trained weights yet. The organisers' rule that all code is written during the event is **unconfirmed** (`docs/OPEN_QUESTIONS.md`): ask them whether the pre-event Milestone 1 code is acceptable.

## 1. Roles and file ownership (the single source of truth)
Three workstreams (decision D-25; details in `docs/WORKSTREAMS.md`). At the start of each session the user states a role ("I am W1"). **Only edit files owned by that role.** For anything else, write a short note for the owner instead. If no role is stated, ask for it before editing.

| Path | Owner | Notes |
|---|---|---|
| `serve.py`, `twin/`, `training/`, `weights/`, `eval/`, `tools/` (except `tools/preflight.py`), `requirements-*.txt`, `dashboard/cases/` | **W1** (backend / forecasting) | `dashboard/cases/` is data W1 generates for the dashboard |
| `dashboard/index.html`, `dashboard/js/` (except `dashboard/js/ui/`), `dashboard/vendor/` | **W2** (dashboard integration) | |
| `dashboard/css/`, `dashboard/assets/`, `dashboard/js/ui/`, `dashboard/ui-sandbox.html`, `docs/UI_UX_SPECIFICATION.md`, `docs/brief/`, `docs/DEMO_AND_JUDGING.md` | **W3** (UI/UX and impact visualisation, brief) | |
| `tests/`, `third_party/`, `tools/preflight.py`, `pytest.ini`/`conftest.py` | **W2** | W2 is also the merge owner and the independent re-runner of every quoted number |
| `README.md`, `CLAUDE.md`, `LICENSE`, `.gitignore`, `.gitattributes`, `docs/*.md` not listed above, `docs/research/` | **Shared** | Changed only through a PR reviewed by someone other than the author; the merge owner (W2) merges |

Legacy names in older docs: B1 = W1; B2 = W2 (integration) and W3 (visual design); AUD = W2 (tests, review, merge) and W3 (brief). Where `TEAM_WORKFLOW.md` §2 schedules two builders on one PC, it only applies if people actually share a machine.

**Independence rule.** W1 builds `eval/`, so no score, skill number, shock-battery result or latency figure may appear in the brief, the dashboard or a decision until W2 has re-run the same script from a fresh clone and got the same number.

## 2. The contract (never change it)
- Start command: `python serve.py --port 8000`; `serve.py` is at the repo root; bind to `0.0.0.0`.
- `POST /health` (**POST, not GET**) returns `{"status":"ready","model_name":...}`, only after the model is loaded and warmed up. The kit contract, the starter `serve.py` (`@app.post("/health")`) and the kit client used by the validator and the judge (`requests.post(url + "/health")`) all use POST. A GET-only route would answer 405, and the server would never count as ready.
- `POST /simulate` request: `{"init_states":[3,6,32,36], "doy_sincos":[sin,cos], "steps":int, "perturbation":null|[6,32,36]}`.
  - Arrays come as nested lists, but **also accept `{"b64":..., "shape":[...]}` arrays**; the kit validator sends both.
  - Response: `{"rollout":[steps,6,32,36], "inference_ms":float}`, as plain nested JSON lists of finite floats.
- Channels, in order: `t2m` K, `tp` mm/day, `u10` m/s, `v10` m/s, `msl` Pa, `tcwv` kg/m². Physical units on the wire.
- Grid: lat 6.5→37.5 (S→N, 32 rows) and lon 65.5→100.5 (W→E, 36 columns).
- `doy_sincos` refers to the **last** input day. `rollout[k]` is day k+1, never a copy of the input day.
- `perturbation` is a physical delta **added to `init_states[-1]`** by our server before simulating.
- Limits: 10 steps in under 5 s (our target ≤ 1.5 s **[UNVERIFIED]**, based on ~0.8 GMAC/step **[ESTIMATED]**; acceptance ≤ 2 s in the sandbox); 4 CPU, 6 GB, no GPU, no network; repo read-only (write only to `/tmp`); `/health` must be ready within 120 s.
- Sandbox libraries ONLY for inference: torch (CPU), numpy, scipy, pandas, xarray, scikit-learn, lightgbm, onnxruntime, fastapi, flask, uvicorn.

The full rules are in `docs/COMPETITION_REQUIREMENTS.md`. The interfaces are in `docs/SYSTEM_ARCHITECTURE.md` §4.

## 3. Architecture principles (decided; see docs/DECISION_LOG.md)
1. **LocalNet:** a residual CNN; 3×3 stem plus B = 4 residual blocks of two 3×3 convs; C = 96; replicate padding; per-pixel LayerNorm only.
   - Per-step reach is ≤ 9 cells along rows and columns (about 12.7 cells diagonally).
   - Locality and no-teleport are **expected but not guaranteed [UNVERIFIED]**. They will be measured by the shock battery.
   - Allowed size variants: **LocalNet-64** (B = 4, C = 64), compared with LocalNet-96 and DAP in EXP-1 (D-21); and B = 3, C = 64 only if locality fails (F1, D-16 as amended by D-21).
2. **Forbidden on the judged path:**
   - down-sampling or U-Nets, global pooling, attention, FFT layers
   - GroupNorm or InstanceNorm, or any normalisation over H×W
   - dropout or noise at inference
3. **Residual (tendency) prediction.** tp lives in log1p space with a non-negative state.
4. **Deterministic inference.** A zero perturbation must give a **bit-identical** output to `perturbation: null`, in-process and over HTTP.
5. **DAP** (damped anomaly persistence) is the fallback model and the per-step NaN fallback.
6. **Post-processing applies to outputs only**, never to the autoregressive state.
   - Every post-processing step is fitted on validation and kept only if the validation score improves.
   - Anomaly rescaling is never applied to tp values below climatology.
7. **No hard blend toward climatology after the network.** It is expected to kill shock propagation: in kit-scorer tests on synthetic responses, an amplitude decay faster than ~25%/day failed "propagates" **[MEASURED on synthetic fields; not on our model]**.
8. Guards: clamp inputs after adding the perturbation, clamp outputs each step, **and clamp once more after post-processing**:
   - t2m 233.2–333.1 K
   - tp 0–1000
   - |u|, |v| ≤ 60
   - msl 85,000–110,000
   - tcwv 0–100

## 4. Repo-scan rules (each one was tested against the kit scanner; breaking one costs 2–10 points)
"Inference files" means `serve.py`, everything it imports locally (`twin/`), and **any `.py` file matching the kit's route pattern**.
1. **No `.py` file other than `serve.py` may contain `/simulate`, `'simulate'` or `"simulate"`.**
   - Eval and test code call the API through the pip-installed kit client (`monsoon_r1.client.call_simulate`) and call the Engine method as `engine.simulate(...)`, which is safe.
   - Never use a dict key, `getattr` or `parametrize` with the quoted word.
2. In inference files, **never write these words, not even in comments or docstrings:**
   - data-source and API names: `weatherbench2`, `cdsapi`, `cds.climate.copernicus`, `gcp-public-data-arco-era5`, `open-meteo`, `openweathermap`, `api.weather`, `weatherapi`, `visualcrossing`, `tomorrow.io`, `api.met.no`, `meteomatics`, `worldweatheronline`, `power.larc.nasa`, `mosdac`, `noaa-gfs`, `imdlib`, `nomads.ncep`, `mausam.imd`
   - UI library names: `streamlit`, `gradio`, `dash(`, `plotly`, `matplotlib.pyplot`
3. **Tests must not contain these strings literally either.** A test that greps for them must import the patterns from `monsoon_r1.repo_scan` (`EXTERNAL_WEATHER`, `ROUTE_RE`, `DATE_RE`), or live in a shell script. A mock test file that spelled them out scored 5/15.
4. In inference files there must be **no calendar dates** (e.g. `2019-06-01`, `20190601`). There must also be no call whose name *ends in* `date`, `datetime` or `Timestamp` with a 19xx/20xx first argument. The pattern has no word boundary, so even `cache.update(2048)` or `validate(1999)` is flagged. Get the day of year from `doy_sincos` with atan2.
5. **Never import the kit (`monsoon_r1`) in inference.** It is not installed in the judge sandbox. Its `stats.py` also uses `date(2000, …)`.
6. **Never commit `.nc`, `.nc4`, `.grib`, `.grib2` or `.zarr` files**, or any `.npy`/`.npz` with shape (n > 400, …, 32, 36). A 366-day climatology is OK. Demo cases of 3 days are OK.
7. Save weights as `.pt` (a state_dict) and tables as `.npz`/JSON. **`.npy` alone does not count as a checkpoint.**
8. **Training code must match the scanner's training pattern** and must never match the route pattern:
   - `train_localnet.py` uses `loss.backward()` and `optimizer.step()`.
   - `fit_dap.py` exposes and calls a `.fit(...)` method.
9. The dashboard is plain HTML/JS in `dashboard/`. No Python UI. The `/meta` model card text lives in `weights/model_card.json`, not as literals in `serve.py`.
10. A syntax error in `serve.py` hides its imports from the scanner. Keep it importable.
11. **Scan a clean export, never your working folder.** The scanner ignores `.gitignore`, so your local `data/*.nc` would be flagged:
    ```bash
    rm -rf /tmp/scan && git worktree add /tmp/scan HEAD   # or: rm -rf /tmp/scan && mkdir -p /tmp/scan && git archive HEAD | tar -x -C /tmp/scan
    python -c "from monsoon_r1.repo_scan import scan; import json; print(json.dumps(scan('/tmp/scan'), indent=1))"
    git worktree remove /tmp/scan --force
    ```
    The target is 15.0 with `flags: []`. On Windows, use any empty folder instead of `/tmp/scan`.

## 5. Honesty rules
- Never fabricate metrics, scores, dataset facts or training results. Numbers come only from `eval/reports/*` produced by running code.
- Never create dummy weights or claim a model is trained when it isn't.
- The dashboard shows **only live outputs** of our server. Nothing pre-rendered is presented as a prediction.
- Impact indicators that are proxies must be labelled as proxies: daily-mean t2m is not IMD Tmax, and grid rain is not flood risk.
- Mark assumptions as assumptions in code comments and docs.
- **Evidence labels.** Every claim about shock locality, propagation, stability or CPU latency carries one of:
  - **[MEASURED]**: we ran it. Say on what. So far this covers only the kit scorer on synthetic fields and the kit scanner on mock repos; **nothing about our own model is measured yet**.
  - **[ESTIMATED]**: arithmetic or a literature-based estimate, not run.
  - **[UNVERIFIED]**: an expectation, design intent, hypothesis or target, still to be measured.
  - Older tags map as follows: [TEST] = MEASURED (on kit code, synthetic inputs); *(estimate)* = ESTIMATED; [HYPOTHESIS], *(target)* = UNVERIFIED.
- Statements about how shocks spread (direction, speed) are only made after the battery has measured them.

## 6. Development rules
- Python 3.10+, type hints, `pathlib` relative to `__file__`, float32 at array boundaries, and shapes in comments as `[T,C,H,W]`.
- Data split: train 2005–2017, validation 2018–2019, test 2020–2021. Touch the test set once, at the end. Demo cases come from 2018–2019.
- Every model change is judged by `eval/harness.py` and `eval/shock_battery.py` (kit scoring functions), not by eye.
- Every PR: `pytest -q` is green, and the kit validator passes if `serve.py` or `twin/` changed.
  - **Clean-export repo scan:** from G-DAP (H5.5) on, every PR must give 15/15. Before that, a PR may show no flag beyond the expected missing checkpoint, frontend or trainer (an H1.5-state repo scored 2.5 with only "no model checkpoint"). Never add dummy weights to silence it.
- Git: branches `b1/*`, `b2/*`, `aud/*`; Conventional Commits; never push to `main`; AUD merges; tag green states.
- **Freezes:**
  - calibration ends and **nothing in `weights/` or `twin/` changes after H17**
  - no code changes after H20
  - see `docs/24_HOUR_EXECUTION_PLAN.md`

## 7. Where to look
| Need | Doc |
|---|---|
| Rules and numbers | `docs/COMPETITION_REQUIREMENTS.md` |
| Points | `docs/EVALUATION_STRATEGY.md` |
| Design | `docs/SYSTEM_ARCHITECTURE.md`, `docs/MODEL_STRATEGY.md`, `docs/SHOCK_AND_DYNAMICS.md`, `docs/UI_UX_SPECIFICATION.md` |
| Process | `docs/TEAM_WORKFLOW.md`, `docs/CONTRIBUTION_GUIDE.md`, `docs/24_HOUR_EXECUTION_PLAN.md` |
| Checks | `docs/TESTING_AND_VALIDATION.md`, `docs/SUBMISSION_CHECKLIST.md` |
| Risks, open items | `docs/RISK_REGISTER.md`, `docs/OPEN_QUESTIONS.md` |
| Evidence | `docs/SOURCE_AUDIT.md`, `docs/research/` |
