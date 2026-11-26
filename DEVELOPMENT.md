# Development quick start

Read `docs/WORKSTREAMS.md` first (who owns what, git rules). Status: the server serves **LocalNet C64** from `weights/`, with **DAP** as its fallback (see `weights/MANIFEST.md`). Do not run `training.fit_dap` into `weights/`: it overwrites part of that package. For install and run instructions, `README.md` is current; this page keeps team-era notes.

## 1. Get the code (everyone)
```powershell
git clone https://github.com/shashankedu02/yugantar-monsoon-kit
cd yugantar-monsoon-kit
git checkout -b w2/my-first-topic        # w1/..., w2/... or w3/... depending on your role
python -m venv .venv
.\.venv\Scripts\Activate.ps1             # if blocked: Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
pip install -r requirements-serve.txt
pip install pytest requests third_party\monsoon_r1_kit-1.0.0-py3-none-any.whl   # tests and the official validator
```
W1 also needs the training stack: `pip install -r requirements-train.txt`.

## 2. Run the server and the checks
```powershell
python serve.py --port 8000                                      # terminal 1
python -m monsoon_r1.schema_validator http://localhost:8000      # terminal 2: expect "all checks passed"
python -m pytest -q
python tools/preflight.py                                        # before every pull request
```
The dashboard (separate static page): `python -m http.server 5500 -d dashboard`, then open http://localhost:5500. The API it calls is described in `docs/DASHBOARD_API.md`.

## 3. The dataset (W1 only; not in git)
Get `india_climate_train.nc` from the team drive, put it at `data\india_climate_train.nc` (the folder is git-ignored) and verify it before use:
```powershell
mkdir data
Get-FileHash .\data\india_climate_train.nc -Algorithm SHA256    # must equal f37bdbd0bd44e6fe951adf36c9a08620075f9d17de391b04c97d61f06797903b
python -m training.data                                          # validate; prints per-split statistics
python -m training.fit_dap                                       # fit climatology and DAP on 2005-2017 only
```
The hash is the one in the organisers' `SHA256SUMS.txt`. Without the file these commands stop with a message naming it. After fitting, DAP is still not a safe submission until it passes checkpoint G-DAP (`docs/24_HOUR_EXECUTION_PLAN.md`).
`weights/` holds the model files the judged server loads; commit them when they are real (never dummy weights).

## 4. Layout
`serve.py` HTTP only | `twin/` inference package (engine, dap, doy, guards, transforms, wire) | `training/` data, climatology, DAP fit | `weights/` model files | `eval/` scoring harness (W1) | `tests/` | `tools/` | `dashboard/` (see its README) | `third_party/` the official kit wheel (never unpack it into the repo) | `docs/`.
`twin/wire.py` (request parsing) is an addition to the blueprint layout: it keeps `serve.py` thin and lets parsing be tested without a web framework.

## 5. If something secret was committed
Rotate the key first (the old one is compromised the moment it is public), tell the team, then clean the history. Deleting the file in a new commit does not remove it from history.
