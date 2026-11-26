# MonsoonTwin: a causal digital twin of India's weather

*Yugaantar DevForge 2026 · Track 2 "Multiverse of Monsoon"*

> **Status: preparation blueprint.** This repository currently contains planning documents only. No code, weights or results exist yet. All code will be written during the 24-hour event. Sections marked *(to be filled)* are placeholders.

## Mission
MonsoonTwin will be a fast, physics-aware emulator of India's daily surface weather on a 1° grid (32 × 36 cells, 6.5–37.5 N, 65.5–100.5 E). It has two jobs:
1. **Timeline Prime:** roll 3 days of observed state forward 10+ days on a laptop CPU, without exploding or blurring.
2. **Multiverse:** accept a localised shock (e.g. a warmer Bay of Bengal, a weaker Arabian Sea monsoon wind) and show how it spreads across India: locally first, then outward at a finite speed. These are design goals; they are **unverified** until measured with the organisers' scoring code.

A live, offline dashboard and a **Monsoon Impact Lens** (monsoon-break watch, rainfall departure, heavy-rain and heat-anomaly proxies, ensemble sensitivity) turn the simulations into decisions.

## Scope
- **Engine:** LocalNet, a local residual CNN with a 9-cell per-day receptive field, plus a damped-anomaly-persistence fallback.
- **Server:** FastAPI `serve.py` implementing the organisers' contract (`/health`, `/simulate`).
- **Dashboard:** static HTML/JS in `dashboard/`, separate from the server.
- **Training and evaluation:** a reproducible pipeline; a local replica of the organisers' scoring.

## Planned repository layout
```
serve.py            HTTP server (contract)                 [to be written at the event]
twin/               inference package (model, fallback, guards)
training/           data loading, climatology, training, calibration
weights/            trained weights + MANIFEST.md
eval/  tests/       scoring harness, shock battery, tests
dashboard/          MonsoonTwin Console (HTML/JS, vendored libs)
tools/              demo-case extraction
docs/               blueprint, research, brief
```

## Setup expectations *(to be finalised at the event)*
- Python 3.10+.
- **Training:** `pip install -r requirements-train.txt`; place `india_climate_train.nc` (kit Release v1.0.0) in `data/`. It is never committed.
- **Serving:** `pip install -r requirements-serve.txt`, then `python serve.py --port 8000`.
- **Dashboard:** `python -m http.server 5500 -d dashboard` and open http://localhost:5500.
- **Self-checks** (kit installed from its wheel):
  ```bash
  python -m monsoon_r1.schema_validator http://localhost:8000
  ```
  Scan a **clean git export**, never the working folder. The scanner walks the folder and ignores `.gitignore`, so a local `data/*.nc` or cache would be flagged (CLAUDE.md §4.11):
  ```bash
  # bash / Git Bash
  rm -rf /tmp/mt-scan && git worktree add /tmp/mt-scan HEAD
  python -c "from monsoon_r1.repo_scan import scan; import json; print(json.dumps(scan('/tmp/mt-scan'), indent=1))"
  git worktree remove --force /tmp/mt-scan
  ```
  ```powershell
  # Windows PowerShell
  git worktree add $env:TEMP\mt-scan HEAD
  python -c "from monsoon_r1.repo_scan import scan; import json, os; print(json.dumps(scan(os.path.join(os.environ['TEMP'], 'mt-scan')), indent=1))"
  git worktree remove --force $env:TEMP\mt-scan
  ```

## How to train *(to be filled)*
## How to run *(to be filled)*
## Results *(to be filled from eval/reports only)*

## Documentation
Start with [`CLAUDE.md`](CLAUDE.md) (project rules), then [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md), which has the full document map.

## Data and attribution
Training data: `india_climate_train.nc` from the organisers' [yug-monsoon-kit](https://github.com/OfficialAbhinavSingh/yug-monsoon-kit). Per its NOTICE:

> Contains modified Copernicus Climate Change Service information (ERA5, Hersbach et al. 2020), accessed through Google WeatherBench 2 (Rasp et al. 2024). ERA5 is licensed under CC BY 4.0. Fields were regridded to 1 degree, averaged to daily values and to a 32 x 36 half-degree-centred grid over 6.5N-37.5N, 65.5E-100.5E.

Neither the European Commission nor ECMWF is responsible for any use of this information. (This attribution belongs in the README and docs only, never in `serve.py` or `twin/`; the repo scanner flags data-source names in inference code.)
