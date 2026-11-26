# Dashboard API (server → dashboard)

Owner: W1 (server). Consumers: W2, W3. Verified against `serve.py` by `tests/test_server.py`. Start the server with `python serve.py --port 8000`.

## 1. General
- Base URL default `http://localhost:8000`, configurable in the dashboard. Serve the dashboard from another port: `python -m http.server 5500 -d dashboard`. CORS is open.
- **Every endpoint is `POST`** (the judge's client uses POST). A `GET` returns 405.
- JSON in, JSON out. Errors are `{"error": "<reason>"}` with status **400** (body is not JSON), **422** (invalid fields; the reason names the field) or **503** (needs a file that does not exist yet; the reason names it).
- Send **one request at a time** with a 15 s timeout; the server computes sequentially.
- Physical units everywhere: t2m K, tp mm/day, u10 m/s, v10 m/s, msl Pa, tcwv kg/m². Channel order: `t2m, tp, u10, v10, msl, tcwv`.
- Grid: 32 rows × 36 columns of 1°. **Row 0 is the southernmost row (6.5°N)** and column 0 the westernmost (65.5°E). Flip rows when drawing so that north is up.

## 2. `POST /health`
No body. `200 {"status": "ready", "model_name": "..."}`.

## 3. `POST /simulate`
```json
{"init_states": [[[[0.0]]]], "doy_sincos": [0.5, -0.8], "steps": 10, "perturbation": null}
```
(shapes, not values: `init_states` is `[3,6,32,36]`, `perturbation` is `[6,32,36]` or `null`, `steps` 1–30.) Arrays may also be `{"b64": "<little-endian float32>", "shape": [...]}`.
- `init_states`: 3 consecutive days, oldest first. The forecast starts the day after the last.
- `doy_sincos`: `[sin(2π n/365), cos(2π n/365)]` for the **last** input day, `n` = day of year.
- `perturbation`: a **delta** in physical units. The server adds it to `init_states[-1]`, so do not add it yourself.
- Response: `{"rollout": [steps,6,32,36], "inference_ms": number}`; `rollout[k]` is day k+1. Rain is never negative, every value is finite.
- Response header `X-MonsoonTwin-Model` names the model that **answered this request**. `X-MonsoonTwin-Fallback` is present only if something fell back (`whole-request-fallback` or `repaired-steps=n`). The JSON body is unchanged. Label each forecast with the header, not with `/meta`.
- A baseline run and a scenario run differ only in `perturbation`. A zero perturbation gives a result identical to `null`.

**Shock presets (the organisers' definitions; the dashboard computes the delta from the current last day):**
| Preset | Box (cell centres) | Delta |
|---|---|---|
| Warm Bay of Bengal | lat 8.5–19.5, lon 82.5–93.5 (12 × 12 cells) | t2m +3.0 K; tcwv +15 % of that cell's current tcwv |
| Monsoon stall | lat 8.5–19.5, lon 65.5–74.5 (12 × 10 cells) | u10 and v10 −40 % of that cell's current value |
Other channels are 0. Custom brushes follow the same rule: build a `[6,32,36]` delta.

## 4. `POST /meta`
No body. Called once at start-up.
```json
{
  "grid": {"lat": [6.5, "…32 values…"], "lon": [65.5, "…36 values…"]},
  "channels": [{"name": "t2m", "unit": "K"}, "…6 entries…"],
  "channel_std": [13.46, 7.55, 2.90, 2.43, 619.0, 20.49],
  "land_sea_mask": [[0.0]],
  "orography_m": [[0.0]],
  "model": {"name": "placeholder-persistence", "mode": "persistence", "validated": false, "card": null}
}
```
`channel_std`, `land_sea_mask`, `orography_m` and `model.card` are **`null` until the matching file exists** in `weights/`. Handle null (for example, draw no coastline). `land_sea_mask` and `orography_m` are `[32][36]` arrays (row 0 = south).

## 5. What the UI must always show
- `model.mode == "persistence"`: a visible banner "Placeholder forecast: the last day repeated. Not a model."
- `model.validated == false`: a visible "Unvalidated" badge on every forecast view. It turns off only when W1 sets `"validated": true` in `weights/model_card.json` after the validation checkpoint passes.
- Test inputs created in the browser (before demo cases exist) are labelled "SYNTHETIC TEST INPUT". Nothing pre-rendered is presented as a prediction.

## 6. `POST /climatology`
```json
{"doy_sincos": [0.5, -0.8], "steps": 10}
```
Response `200`:
```json
{"climatology": "[steps,6,32,36]", "core_zone_rain_mean": [1.0], "core_zone_rain_std": [1.0]}
```
`climatology[k]` is the climatological field for lead day k+1. `core_zone_rain_*` (core zone 18–28°N, 65–88°E) are `null` until the statistics exist. The whole call returns **503** until `weights/climatology.npz` exists; show "climatology not available yet" and disable anomaly views.

## 7. Demo input states
`dashboard/cases/index.json` lists the case files: `{"cases": ["name.json"]}`. Each file (written by `tools/make_demo_cases.py` from 2018–2019) is `{"id", "label", "date_label", "selection_rule", "source", "doy_sincos": [s, c], "init_states": [3,6,32,36]}`. They are inputs only; forecasts always come from `/simulate`, and the server never reads them. A clearly labelled synthetic state stays available (section 5).
