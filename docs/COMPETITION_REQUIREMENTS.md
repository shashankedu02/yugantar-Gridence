# Competition requirements: Track 2 "Multiverse of Monsoon"

Every line here comes from an official source and has a tag:
- **[PS]**: the Track 2 problem statement PDF, `Yugaantar DevForge Tracks (2).pdf`
- **[GEN]**: the general tracks PDF, `Yugaantar DevForge Tracks.pdf`
- **[CON]**: `docs/R1_CONTRACT.md` in the kit. It is byte-identical to the Release asset `API_CONTRACT.md`.
- **[CODE:file]**: behaviour read from the kit's source code
- **[TEST]**: behaviour we checked by running the kit code (see `SOURCE_AUDIT.md` §4)

Recommendations are not in this file. They live in `SYSTEM_ARCHITECTURE.md` and `MODEL_STRATEGY.md`.

---

## 1. What must be built

| # | Requirement | Source |
|---|---|---|
| R1 | **Simulate (Timeline Prime).** From the last 3 days of state, roll forward day by day, without exploding or blurring into a flat average. | PS §1 |
| R2 | **Branch (Multiverse).** Accept a localized shock and show how it ripples across India. | PS §1 |
| R3 | **Stable rollouts:** 10 steps or more, no NaN/Inf, rain never negative, no collapse into blurry averages. | PS §2 |
| R4 | **Real skill:** beat "repeat yesterday" and climatology, including for heavy rain. | PS §2 |
| R5 | **Causal shocks:** a shock first stays near where it was applied, then spreads outward. A zero shock changes nothing. | PS §2 |
| R6 | **Real impact:** a dashboard and an impact module, both driven live by your own simulation. | PS §2 |
| R7 | **Desk-review demo** of the full system: the engine, an interactive map dashboard, and a scientific or social-impact extension of your choice. Examples given: crop stress under a stalled monsoon, solar/wind generation, heatwave or flood risk, ensemble uncertainty, a policy co-pilot. | PS §1 |
| R8 | No starter model or baseline weights are provided. The starter `serve.py` repeats the last day and scores zero by design. | PS §1 |

## 2. Data

| Item | Value | Source |
|---|---|---|
| File | `india_climate_train.nc`, plus `stats.json` | PS §4, kit README |
| Period | 2005–2021, daily | PS, README |
| Grid | 32 × 36 cells of 1°. Cell centres: lat 6.5…37.5 (south→north), lon 65.5…100.5 (west→east). Each cell is the mean of the 4 surrounding 1° ERA5 points. | CON |
| Dynamic channels (axis 1, in order) | 0 `t2m` K · 1 `tp` mm/day · 2 `u10` m/s · 3 `v10` m/s · 4 `msl` Pa · 5 `tcwv` kg/m² | PS §3, CON, CODE:contract.py |
| Daily aggregation | t2m, u10, v10, msl, tcwv are the mean of the 00/06/12/18 UTC values. tp is the 24 h sum. | CON |
| Static channels | `land_sea_mask` (0–1) and `orography_m` (m), in the variable `static` with shape [2,32,36]. **The API does not send them**, so they must be bundled with the model. | CON, PS §4 |
| `stats.json` | Per-channel mean and std for the 6 dynamic channels, 355 bytes. For use inside the model only. | CON, SOURCE_AUDIT |
| NetCDF layout | `data(time, channel, lat, lon)` and `static(static_channel, lat, lon)` | CODE:build_dataset.export_nc |
| Rain cleaning | ERA5's tiny negative rain values were clipped to 0 in the training archive | CODE:build_dataset.merge |
| Licence | ERA5 modified data, CC BY 4.0. Credit "Contains modified Copernicus Climate Change Service information". | NOTICE |
| Download | Kit GitHub Release v1.0.0 (see SOURCE_AUDIT) | README |

## 3. Runtime environment (the judge's offline sandbox)

| Constraint | Value | Source |
|---|---|---|
| Start command | `python serve.py --port 8000`, with `serve.py` **at the repo root** | PS §3, CON |
| Bind address | `0.0.0.0` | PS, CON |
| RAM / CPU / GPU | 6 GB / 4 cores / none | PS, CON |
| Network | None. Nothing is downloaded at evaluation. | PS, CON |
| Filesystem | The repo is read-only. Write only to `/tmp`. | PS |
| Libraries available | torch (CPU), numpy, scipy, pandas, xarray, scikit-learn, lightgbm, onnxruntime, fastapi, flask, uvicorn, plus gunicorn (contract only). **Anything else must be inside the repo.** | PS, CON |
| Not available | The kit package `monsoon_r1` is not on the list, so **inference code must not import it**. | inferred from PS/CON list |
| Warm-up | The judge polls `POST /health` every 2 s for up to 120 s and only starts once it reads `{"status":"ready"}` | CON, CODE:client.wait_ready |
| Per-call limit | Each `/simulate` call gets 5.0 s wall time measured by the judge (3 s to connect). One attempt, no retries. | CON, CODE:client |
| Response size | Under 80 MB, no redirects | CON |
| Call order | The 8 calls run back to back, once each | CON |

## 4. API contract

**`POST /health`** must return `200 {"status": "ready", "model_name": "..."}`. Anything else counts as not ready. The method is **POST** in the contract [CON], in the starter server's `@app.post("/health")` [CODE:template/serve.py] and in the client's `requests.post(... "/health")` [CODE:client.health]. The schema validator and the judge poll through that client, so a GET-only endpoint fails.

**`POST /simulate`** request:
```json
{"init_states": [3,6,32,36], "doy_sincos": [sin, cos], "steps": 10, "perturbation": null | [6,32,36]}
```
- `init_states`: 3 consecutive days, oldest first, in **physical units**
- `doy_sincos = [sin(2π·doy/365), cos(2π·doy/365)]` for the **last** input day. Forecast step k is that day of year plus k. Calendar years are never sent.
- `perturbation`: a **physical delta added to `init_states[-1]`** before simulating; `null` means none. The server adds it, as the starter does.
- `steps`: the judge sends 10 (`SCORE_STEPS`). The contract allows up to `MAX_STEPS = 14` [CODE:contract.py].

Response: `{"rollout": [steps,6,32,36], "inference_ms": float}`. `rollout[k]` is day k+1 after the last input day.
- **Wire format:** plain nested JSON lists of finite floats, in both directions. NaN and Inf are not valid JSON and fail. A b64 response is tolerated but lists are the contract.
- **Units:** physical on the wire. Normalise inside the model only.

## 5. Stage 1 automatic evaluation (100 points)

### 5.1 The 8 hidden requests [PS §5, CON]
1. 5 real windows from dates after 2023-01-10: monsoon onset, heavy rain, heatwave, cyclone, winter disturbance.
2. 3 shocks on **one** real window (which window is not stated):
   - **warm_ocean:** +3.0 K on t2m and +15% of the current tcwv over the Bay of Bengal box, lat 8–20, lon 82–94
   - **monsoon_stall:** −40% of the current u10 and v10 over the Arabian Sea box, lat 8–20, lon 65–75
   - **null:** a perturbation of all zeros. The output must equal the unperturbed call to within 1e-3 of the channel std.

### 5.2 Points

| Part | Points | Exact rule | Source |
|---|---|---|---|
| RMSE skill | 30 | Skill = 1 − RMSE/min(RMSE_persistence, RMSE_climatology). RMSE is latitude-weighted, at lead days 1, 4 and 8, over all 6 channels and 5 windows. Points = 30 · clip(mean skill / **0.12**, 0, 1). | CON, CODE:scoring |
| Heavy-rain CSI | 15 | CSI on tp > **10 mm/day** at the same leads. Skill = (CSI − ref)/(1 − ref), where ref is the better CSI of persistence and climatology. Points = 15 · clip(mean / **0.10**, 0, 1). | CON, CODE:scoring |
| Anti-blur | 10 | Per channel, day-8 spatial variance divided by the real day-8 variance (total field), averaged over windows. Channel credit = clip(ratio/0.40, 0, 1), and **0 if the ratio is above 2.5**. Points = 10 × mean over channels. | CON, CODE:scoring |
| Shock causality | 15 | Each of 2 shocks is worth 7.5, split into quarters: **non-zero** (max \|Δ\|/std ≥ 1e-3); **localised** (day-1 energy ≥ 60% within 3 cells of the box); **propagates** (outside energy averaged over days 4–8 > 1.5× day-1 outside energy *and* > 2% of peak total energy, *and* < 5% of energy beyond 3 + 8·day cells); **stable** (max \|Δ\|/std ≤ 5). Localised, propagates and stable only count if the response is non-zero *and* localised. **A failed null test halves the 15.** | CON, CODE:scoring.causality_points |
| Repo check | 15 | 8 anti-cheat + 7 code health (see §7) | PS, CODE:repo_scan |
| Brief | 15 | Read by a person | PS |

Here "energy" = Σ over channels of (Δ/std_c)², with std taken from `stats.json` [CODE:scoring._energy].

A failed or invalid window scores 0 for that window. It is never skipped [CON].

### 5.3 Hard gate to qualify [PS §5, CON]
1. Valid outputs on all 8 requests. Validity means the shape is right, values are finite, rain is ≥ −1e-6, and t2m is within [233.15, 333.15] K [CODE:scoring.validity].
2. Beat persistence at day 4.
3. A non-zero, localised response to at least one shock.

The Top 10 qualifying teams by score go through.

## 6. Stage 2 and finals [PS §5, GEN]
- **Top 10:** live demo and desk review. Judges apply **a new shock on the spot**, review the impact extension, and ask about the model's design and its limits. This stage is judged by people.
- **Top 2** go to the Round 3 finals and present to the official panel.

## 7. Repository requirements

| Requirement | Source |
|---|---|
| Public GitHub repo, created during the hackathon | PS §3, GEN |
| Training code, and `serve.py` at the repo root | PS §3 |
| Model weights inside the repo. Git LFS is fine; keep the total under 2 GB. **A Hugging Face link alone is not enough.** | PS §3 |
| Dashboard code, separate from the server code | PS §3 |
| A README on how to train and run | PS §3 |
| No weather APIs, no hardcoded dates or data archives, real training code, weights included | PS §5 |
| Frozen at the deadline; later changes are ignored | PS §6 |
| Original work: the repo, training, weights and dashboard are built during the hackathon. Open-source libraries are fine. | PS §6 |

**Automated scan details** [CODE:repo_scan, TEST]:
- **Inference code** means every `.py` file containing `/simulate` (or `'simulate'` or `"simulate"`), plus every local module it imports, followed transitively.
- **The scanner walks the folder, not git.** `.gitignore` does not hide files from it, so always scan a clean export.
- **Critical flag (lose all 8 anti-cheat points), any of:**
  - a weather or data-source name in inference code, including comments and docstrings: `open-meteo`, `openweathermap`, `api.weather`, `weatherapi`, `visualcrossing`, `tomorrow.io`, `api.met.no`, `meteomatics`, `worldweatheronline`, `power.larc.nasa`, `cdsapi`, `cds.climate.copernicus`, `gcp-public-data-arco-era5`, `weatherbench2`, `mosdac`, `noaa-gfs`, `imdlib`, `nomads.ncep`, `mausam.imd`
  - 5 or more date literals in one inference file
  - any `.npy` or `.npz` file anywhere in the repo with shape (n > 400, …, 32, 36)
  - no checkpoint
  - no file serves `/simulate` at all
- **Warn flag (−2 each):**
  - 3–4 date literals in one inference file, or any `date(`/`datetime(`/`Timestamp(` call with a 19xx/20xx year. There is no word boundary, so `update(2048` also matches.
  - each `.nc`, `.nc4`, `.grib`, `.grib2` or `.zarr` file in the repo
- **Code health (7 points):**

| Points | Check |
|---|---|
| 3 | Training pipeline: a non-inference file containing `.backward(`, `optimizer.step`, `.fit(`, `train_step`, `Trainer(` or `lightning` |
| 2 | Server separate from UI: no inference file matches `streamlit`, `gradio`, `dash(`, `plotly` or `matplotlib.pyplot` (comments included) |
| 1 | Frontend present |
| 0.5 | README present |
| 0.5 | Checkpoint present |

- **What counts as a checkpoint:** a file with extension `.pt`, `.pth`, `.ckpt`, `.safetensors`, `.onnx`, `.h5`, `.keras`, `.joblib`, `.pkl`, `.pickle`, `.npz`, `.msgpack` or `.bin`, larger than 1 KB. **`.npy` is not on the list.**

## 8. Brief (2 pages, PDF) [PS §3]
- **Page 1:** model design, how drift and blur are prevented, failure modes
- **Page 2:** visualization and the impact use case
- **GEN also asks for:** the USP, system architecture and technical approach, all within 2 pages

## 9. Ground rules [PS §6]
1. Offline only. No external weather APIs or internet at inference.
2. No lookup tricks. Hardcoded dates, lookup tables or shipped archives of past weather fail the shock tests and the repo scan, and lead to disqualification.
3. Real coupling. The dashboard must run on live output from your own `/simulate`, not pre-rendered results.
4. Frozen at the deadline.
5. Original work, built during the hackathon.

## 10. Not stated anywhere official (must be confirmed)
See `SOURCE_AUDIT.md` §5. The main open points:
- the submission deadline and time
- whether the repo may be private until the deadline
- how the grader averages skill across channels and leads
- which window the shocks use
- the exact day-of-year convention (0- or 1-based)
