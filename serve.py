"""MonsoonTwin API server (Round 1 contract). HTTP only: parse, call the Engine, encode.

Run:  python serve.py --port 8000     (binds 0.0.0.0; no network access is needed)

Judged endpoints (kit contract; POST, as the kit client does):
  POST /health   -> {"status": "ready", "model_name": ...}
  POST /simulate -> {"rollout": [steps,6,32,36], "inference_ms": float}
Dashboard-only extras (not scored; see docs/DASHBOARD_API.md):
  POST /meta         -> grid, channels and units, channel_std, land/sea mask, orography, model info (missing parts are null)
  POST /climatology  -> {"climatology": [n,6,32,36], "core_zone_rain_mean": [n] | null, "core_zone_rain_std": [n] | null}

The model is loaded once at import time, and /health is only reachable after that succeeds. CORS is open because the
dashboard is a separate static page on another port of the same offline machine.
"""
import argparse
import logging
import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from twin import Engine
from twin.engine import NotAvailableError
from twin.wire import WireError, encode_rollout, parse_climatology_request, parse_simulate_request

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI()
MODEL_HEADER, FALLBACK_HEADER = "X-MonsoonTwin-Model", "X-MonsoonTwin-Fallback"
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
                   expose_headers=[MODEL_HEADER, FALLBACK_HEADER])
ENGINE = Engine(Path(__file__).resolve().parent / "weights")


@app.post("/health")
def health():
    return {"status": "ready", "model_name": ENGINE.model_name}


@app.post("/simulate")
async def simulate_endpoint(request: Request):
    t0 = time.perf_counter()
    try:
        body = await request.json()
    except (ValueError, RecursionError):      # RecursionError: absurdly deep nesting
        return JSONResponse({"error": "request body is not valid JSON"}, status_code=400)
    try:
        req = parse_simulate_request(body)
        out = ENGINE.simulate(req.init_states, req.doy_sincos, req.steps, req.perturbation)
    except (WireError, ValueError) as e:
        return JSONResponse({"error": str(e)}, status_code=422)
    name, note = ENGINE.served_by()          # read before any await, so it belongs to this request
    headers = {MODEL_HEADER: name}
    if note:
        headers[FALLBACK_HEADER] = note
    return JSONResponse({"rollout": encode_rollout(out), "inference_ms": (time.perf_counter() - t0) * 1000.0},
                        headers=headers)


@app.post("/meta")
def meta():
    return JSONResponse(ENGINE.meta())


@app.post("/climatology")
async def climatology_endpoint(request: Request):
    try:
        body = await request.json()
    except (ValueError, RecursionError):      # RecursionError: absurdly deep nesting
        return JSONResponse({"error": "request body is not valid JSON"}, status_code=400)
    try:
        doy_pair, steps = parse_climatology_request(body)
        clim = ENGINE.climatology(doy_pair, steps)
        try:
            core_mean, core_std = ENGINE.core_zone_rain_stats(doy_pair, steps)
            core = {"core_zone_rain_mean": core_mean.tolist(), "core_zone_rain_std": core_std.tolist()}
        except NotAvailableError:
            core = {"core_zone_rain_mean": None, "core_zone_rain_std": None}
    except NotAvailableError as e:
        return JSONResponse({"error": str(e)}, status_code=503)
    except (WireError, ValueError) as e:
        return JSONResponse({"error": str(e)}, status_code=422)
    return JSONResponse({"climatology": encode_rollout(clim), **core})


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    uvicorn.run(app, host="0.0.0.0", port=ap.parse_args().port, log_level="warning")
