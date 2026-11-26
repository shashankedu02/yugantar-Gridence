# Testing and validation

The **Auditor (AUD)** owns this. Builders run the fast tests before every PR.

The guiding rule: *nothing is "done" until the kit's own code says so*. We reuse the kit's scoring functions, client, schema validator and repo scanner. The kit is installed with `pip install` on team machines, never copied into our repo.

## 1. Test layers
| Layer | Tool | When | Owner |
|---|---|---|---|
| L0 Static | Kit `repo_scan` on a **clean git export** (CLAUDE.md §4.11) + `tests/test_repo_rules.py`, which **imports** `EXTERNAL_WEATHER`, `ROUTE_RE`, `DATE_RE` from `monsoon_r1.repo_scan` and never spells them out (a test that spelled them out scored 5/15) | Every PR | AUD (CI script), builders locally |
| L1 Unit | `pytest tests/` (contract shapes, transforms round-trip, guards, doy decoding, null identity, determinism) | Every PR | AUD writes; B1/B2 keep green |
| L2 Offline scoring | `python -m eval.harness --ckpt weights/ --split val` (kit `scoring.py` functions in-process) | Each candidate checkpoint | AUD |
| L3 Shock battery | `python -m eval.shock_battery` (SHOCK_AND_DYNAMICS §5) | Each candidate checkpoint | AUD |
| L4 API / contract | `python serve.py --port 8000` then `python -m monsoon_r1.schema_validator http://localhost:8000` and `python -m eval.api_check` | Every merge to `main` | AUD |
| L5 Sandbox rehearsal | Docker image with ONLY the sandbox libraries (+ the kit, used by the validator only); repo mounted read-only; internal network; `--memory 6g --cpus 4` (§6) | H5.5–10 (DAP build), H14–17, H20–22 | AUD |
| L6 Dashboard | Manual script below plus one value cross-checked with curl | H14–17, H17–20, H20–22 | AUD + B2 |
| L7 Scientific review | Physical sanity of maps, shocks, extremes | H5.5–10 (DAP), H10–14, H17–20 | AUD |

## 2. Local harness specification (`eval/harness.py`)
- **Inputs:** the Engine (in-process), a split (val = 2018–2019, test = 2020–2021), and the window list.
- **Windows:** at least 40 random validation start days spread over the seasons, **plus** 5 regime windows chosen by AUD to mimic the hidden set: onset, heavy rain, heatwave, cyclone, winter disturbance. Include at least one nearly dry window, for the dry-window anti-blur trap.
  - The regime windows are chosen by date in `eval/` only.
  - Eval code may contain dates **only because** no eval file matches the route pattern: no `/simulate`, `'simulate'` or `"simulate"` (CLAUDE.md §4.1). The harness calls `engine.simulate(...)` in-process; `eval/api_check.py` uses `monsoon_r1.client.call_simulate`.
- **Data loading:** the harness has its own loader for the `.nc` (independent of `training/`).
- **References:**
  - persistence = `init_states[-1]` repeated
  - climatology = `monsoon_r1.stats.climatology(...)` from the installed kit, computed on the training years. This is the judge's own recipe (D-20). The kit's `date(2000, …)` is fine here because eval is not inference.
- **Alignment:** truth for lead day L is the day L after `init_states[-1]` and is compared with `rollout[L-1]` (indices 0/3/7 for days 1/4/8). A unit test checks this on a synthetic sequence.
- **Outputs per checkpoint:**
  - skill per channel per lead, and the mean
  - CSI and CSI skill per lead
  - day-8 variance ratio per channel
  - causality results
  - a **local Stage-1 estimate** (30 + 15 + 10 + 15 points), using `scoring.forecast_points`, `anti_blur_points` and `causality_points`
  - all written to `eval/reports/<ckpt>.md` and `.json`
- **Gate flags:** validity 100%, day-4 skill vs persistence > 0, null identical; shocks: ≥ 1 non-zero and localised for the official gate, **both** on ≥ 5/6 battery windows for G-DAP and EXP-1.

### 2.1 Frozen windows and EXP-1
- AUD commits `eval/windows_val.json` at H3, before scoring any model. All candidate comparisons use exactly this list (MODEL_STRATEGY §3.7).
- `eval/reports/EXP-1.md` compares DAP, LocalNet-64 and LocalNet-96 on raw outputs with the same harness commit. It is the evidence behind the H10 and H14 model decisions.

## 3. Scientific checks (AUD, L7)
1. Climatology maps look like the known monsoon: a Western Ghats and north-east rain maximum in July, a dry north-west in winter, the north–south t2m gradient.
2. Rollout maps of a July case: rain bands stay in plausible places and don't drift to the edges.
3. Edge check: the per-cell RMSE map shouldn't show a bright frame unless it's explained.
4. Energy and drift: the domain-mean t2m and tcwv over a 14-step rollout stay within the climatological range.
5. Shock responses have the signs in `SHOCK_AND_DYNAMICS.md` §4. Red flags are logged as issues.
6. The tp histogram of forecasts vs truth at days 1/4/8 (under-prediction of extremes is expected before calibration).

## 4. Traceability matrix
Columns run Official requirement → potential failure → test → expected behaviour → evidence.

| # | Requirement (source) | Potential failure | Test | Expected | Evidence |
|---|---|---|---|---|---|
| T-API-1 | `POST /health` ready ≤ 120 s (CON) | Slow torch import or weights load; ready before the model loads | Time from start to ready, L4/L5 | Ready < 30 s, and only after the Engine has warmed up | `eval/reports/api_<date>.md` |
| T-API-1b | `/health` method is POST (CON, template, client) | Route declared as GET, so the kit client gets 405 and the server is never ready | Kit validator's `health:` line; `curl -X POST localhost:8000/health` | `health: OK`, 200 + `status: ready` | validator log |
| T-API-2 | `/simulate` schema (CON) | Wrong shape or key; numpy types not JSON serialisable | Kit `schema_validator` (lists and b64) | All OK | validator log |
| T-API-3 | Output finite (CON) | NaN from the net or log1p overflow | Harness validity on all windows; guard unit test injecting NaN | 0 invalid | harness JSON |
| T-API-4 | Rain ≥ 0 (CON) | Negative tp from a residual | Unit test plus harness | min tp ≥ 0 | |
| T-API-5 | t2m within −40…+60 °C (CON) | Drift in a long rollout | Harness at 14 steps | In range | |
| T-API-6 | 10 steps < 5 s on 4 CPU, 6 GB (CON) | Thread oversubscription; JSON slowness; cold start in the first call | `eval/timing.py` in L5 sandbox: 8 sequential calls back to back, first call included | p100 < 2 s | timing report |
| T-API-7 | Listen 0.0.0.0, `--port` (PS) | Bound to 127.0.0.1 | L5: call from another container or host IP | Reachable | |
| T-API-8 | Perturbation added to the last day (CON) | Added to every day, or ignored | Unit: response day-1 ≠ 0 for a non-zero delta; comparison with manual pre-adding | Equal (bit-identical) to the manual version | |
| T-API-9 | Malformed input doesn't crash the server | 500 or crash | Send bad shapes, NaN, steps = 0/31 | 422, server alive | |
| T-API-10 | Rain ≥ 0 after post-processing (CON) | A rescale or quantile map creates negative rain after the in-loop clamp | Unit test: feed tp = 0 under clim = 5 with a_k = 1.5; check the final clamp | min tp ≥ 0 | |
| T-API-11 | `rollout[k]` = day k+1 (CON) | Off-by-one: the output repeats the input day, or the harness misaligns truth | Synthetic sequence test in engine and harness; check `rollout[0] != init_states[-1]` for a moving field | Correct alignment | |
| T-API-12 | Server responsive under dashboard load | Queued calls make `/health` or later calls time out | 10 sequential `/simulate` calls from the dashboard queue while polling `/health` | All succeed; every call within its own 5 s | |
| T-OFF-1 | Offline, read-only repo, /tmp only (PS) | Code downloads, writes caches into the repo (e.g. torch hub, `__pycache__` write fails silently) | L5 with read-only mount and `--network none`; `PYTHONDONTWRITEBYTECODE=1` not relied on | Starts and serves | |
| T-OFF-2 | Only sandbox libraries (PS) | Import of `monsoon_r1`, yaml, safetensors, etc. in inference | L5 clean venv with only the listed libraries | Starts | pip freeze log |
| T-OFF-3 | Weights in repo, < 2 GB (PS) | LFS pointer not fetched; weights gitignored | Fresh `git clone` into an empty dir, then L5 | Starts, `model_name` = localnet | |
| T-SK-1 | Beat persistence at day 4 (gate) | Model worse than persistence for winds/tp | Harness day-4 skill vs persistence (mean, and per channel) | > 0 mean; report channels | harness |
| T-SK-0 | Model choice is fair (EXP-1) | Candidates scored on different windows, scorer versions or calibration states | Frozen `windows_val.json`; one harness commit; raw outputs; same timing run | One EXP-1 table; decision rule applied | `eval/reports/EXP-1.md` |
| T-SK-2 | RMSE skill (30) | Blur toward climatology fails day 1; drift fails day 8 | Harness skill by lead | Monitored; pick the best checkpoint | |
| T-SK-3 | Heavy-rain CSI (15) | Under-prediction; never crosses 10 mm | Harness CSI vs refs per lead, before and after calibration | CSI skill > 0 at day 1 | |
| T-BL-1 | Anti-blur (10) | Day-8 tp/u/v variance < 40% | Harness variance ratio | ≥ 0.4 all channels, ≤ 2.5 | |
| T-CAU-1 | Null shock (half of 15) | Stochastic layers, dropout left on, ensemble on the server path | Bit-identical check, 6 windows | max diff = 0 | battery |
| T-CAU-1b | Null shock over HTTP (CON) | JSON float round-trip or the b64 path changes values | Kit client: `perturbation: null` vs zeros (lists and b64) through `serve.py` | Identical responses | api report |
| T-CAU-2 | Localised day 1 | Global normalisation or U-Net leak | Battery S1/S2 | near_frac ≥ 0.6 (target ≥ 0.8) | |
| T-CAU-3 | Propagates days 4–8, no teleport | Response decays too fast (see §2 of SHOCK doc) | Battery S1/S2 | Pass ≥ 5/6 windows | |
| T-CAU-4 | Stable ≤ 5 std | Rain blow-up in convective cases | Battery, all windows, including ×2 shocks | max z ≤ 5 | |
| T-CAU-5 | Judge's live shocks (Stage 2) | Crash or NaN for unusual deltas | Battery S3–S8 | Finite, valid, no crash | |
| T-REP-0 | Scan reflects what the judge sees | Local `data/`, caches or stray files inflate or deflate the score | Scan a clean `git worktree`/`git archive` export | 15.0, flags [] | scan JSON |
| T-REP-1 | No weather APIs in inference (PS) | Comment mentioning a source name | Kit `repo_scan` + `tests/test_repo_rules.py` | 0 flags | scan JSON |
| T-REP-2 | No hardcoded dates in inference (PS) | Dates in `twin/`, or eval scripts containing `/simulate` | repo_scan; rule grep | 0 flags | |
| T-REP-3 | No archives (PS) | Cached `.npy`/`.npz` of the training data committed | repo_scan; `.gitignore` | 0 flags | |
| T-REP-4 | Training code real (PS) | Train script also contains `/simulate` (becomes "inference") | repo_scan `health.training_pipeline` | true | |
| T-REP-5 | Weights included (PS) | Weights saved only as `.npy` | repo_scan `health.checkpoint` | true | |
| T-REP-6 | Dashboard separate (PS) | UI words in `serve.py`/`twin/` | repo_scan `server_separate_from_ui` | true | |
| T-REP-7 | README how to train and run (PS) | Missing steps | AUD follows the README on the second PC from a fresh clone | Works | |
| T-DASH-1 | Dashboard live (PS ground rules) | Pre-rendered images; stale cache | Code review; Network tab shows calls; curl cross-check | Values match | screenshot + note |
| T-DASH-2 | Impact module driven by simulation (PS) | Static numbers | Change the shock; indicators change | Changes | |
| T-DASH-3 | Dashboard usable with the real latency | Parallel calls or N = 8 ensembles exceed timeouts | Run preset + ensemble (N = 4, then 8) through the queue | No timeouts; progress shown | |
| T-SUB-1 | Public repo, frozen at the deadline (PS) | Private repo; late push | Open the URL in incognito before the deadline | Visible | |
| T-SUB-2 | 2-page brief PDF (PS) | 3 pages; numbers not backed by eval | Page count; every number traced to `eval/reports` | 2 pages | |

## 5. Shock battery
See `SHOCK_AND_DYNAMICS.md` §5 for the S0–S8 definitions and pass rules.

## 6. Sandbox rehearsal recipe (L5)
**Prepare while internet is available** (before H0, or at the venue once). Build a Linux image containing only the sandbox libraries and CPU torch, plus the kit, which the validator needs.
```dockerfile
# rehearsal/Dockerfile   (keep OUTSIDE the repo, e.g. D:\Yugantar\rehearsal\)
FROM python:3.11-slim
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir numpy scipy pandas xarray scikit-learn lightgbm onnxruntime fastapi flask uvicorn requests
COPY monsoon_r1_kit-1.0.0-py3-none-any.whl /tmp/
RUN pip install --no-cache-dir /tmp/monsoon_r1_kit-1.0.0-py3-none-any.whl
```
```bash
docker build -t mt-sandbox D:/Yugantar/rehearsal        # Docker Desktop builds Linux wheels even on Windows
```

**Rehearse** (no internet needed):
```bash
git clone <repo-url> /tmp/fresh    # or copy a fresh clone; never your working folder
docker network create --internal sbx
docker run -d --name mt-srv --network sbx --cpus 4 --memory 6g -v /tmp/fresh:/sub:ro -w /sub \
       -e PYTHONDONTWRITEBYTECODE=1 mt-sandbox python serve.py --port 8000
docker run --rm --network sbx mt-sandbox python -m monsoon_r1.schema_validator http://mt-srv:8000
docker run --rm --network sbx -v /tmp/fresh:/sub:ro -w /sub mt-sandbox python -m eval.timing --url http://mt-srv:8000
docker rm -f mt-srv && docker network rm sbx
```

**Notes:**
- An `--internal` network has no internet, so this mimics the offline judge. `--network none` would also block the validator, and `-p` does not work with it.
- The kit client refuses private addresses by default. `eval/timing.py` and `eval/api_check.py` must call `call_simulate(..., allow_private=True)`, as the validator does.
- **Import check without the kit:** run `docker run --rm -v /tmp/fresh:/sub:ro -w /sub mt-sandbox python -c "import sys; sys.modules['monsoon_r1']=None; import serve"`. It must succeed, which proves inference doesn't import the kit.
- **Without Docker:** use a fresh venv with only the listed packages, plus a fresh clone and Wi-Fi off. On Windows, `attrib +R` does **not** stop writes into folders, so it is a weak read-only test. Prefer the Docker run, where `:ro` is real.

## 7. Dashboard manual test script (L6)
1. Start the server and the static server; open `http://localhost:5500`. The API indicator is green.
2. Load the July case and Run baseline: the map appears and `inference_ms` is shown.
3. Apply *Warm Bay*, then Run, then the Difference view. **Check and record** whether day 1 is localised and whether days 4–8 spread. This is an observation, not an expectation; compare with the battery numbers.
4. Click a cell in the Bay. The time series shows baseline vs scenario. Cross-check day-3 tp against `curl` output.
5. Ensemble on (N = 4, then 8): requests go one at a time with progress shown; the band appears and the label reads "sensitivity to initial conditions".
6. Impact Lens: Monsoon Break Watch changes under *Monsoon stall*.
7. Paint a custom +20 mm/day rain blob at the edge: no errors.
8. Wi-Fi off and repeat 2–3.
