# Development quick start (Milestone 1)

Repo root = this folder (`monsoon-twin`). The official kit stays next to it in `..\yug-monsoon-kit-main` and is only installed, never copied.
Status: the server is contract-compliant but serves a **placeholder persistence forecast**. No model is trained or validated.

## Windows PowerShell setup (one virtual environment inside the repo, nothing global)
```powershell
cd D:\Yugantar\monsoon-twin
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # if blocked: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
pip install -r requirements-train.txt  # everything: server + training + tests (needs internet once)
pip install -e ..\yug-monsoon-kit-main # official validator, scorer, repo scanner (tests/eval only; never imported by serve.py or twin/)
```
Inference-only environment (what the judge has): `pip install -r requirements-serve.txt`.

## Run the server
```powershell
python serve.py --port 8000
```
It binds 0.0.0.0. Check it from a second terminal:
```powershell
python -m monsoon_r1.schema_validator http://localhost:8000    # official validator, expect: all checks passed
```

## Tests
```powershell
python -m pytest -q
```
Skips (not fails) the pieces whose packages are missing: HTTP tests need fastapi/uvicorn, the loader tests need xarray, the validator and repo-scan tests need the kit.

## Data and DAP (needs the real archive, nothing is synthesised)
```powershell
mkdir data                                   # git-ignored
copy <path-to>\india_climate_train.nc data\india_climate_train.nc
python -m training.data                      # inspect and validate; prints per-split statistics
python -m training.fit_dap                   # fit climatology + DAP on 2005-2017 only; writes weights\climatology.npz and weights\dap.npz
python serve.py --port 8000                  # now serves "monsoontwin-dap-unvalidated"
```
Without the archive these commands stop with an error naming the file they need. After fitting, DAP is still **not** a safe submission until it passes checkpoint G-DAP (docs/24_HOUR_EXECUTION_PLAN.md).

## Layout
`serve.py` HTTP only | `twin/` inference package (engine, dap, doy, guards, transforms, wire) | `training/` data, climatology, DAP fit | `weights/` model files (committed when real) | `tests/` | `eval/`, `dashboard/` empty for now.
`twin/wire.py` (request parsing) is an addition to the blueprint layout: it keeps `serve.py` thin and lets the parsing be tested without a web framework.
