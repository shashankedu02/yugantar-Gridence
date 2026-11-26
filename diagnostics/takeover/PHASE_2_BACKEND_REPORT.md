# Phase 2: backend and forecasting engine

27 Nov 2026. Served model on this branch: **DAP** (`monsoontwin-dap-unvalidated`). LocalNet code is present but inactive.

## Integrated
- Merged `origin/w1/eval-harness` (evaluation harness, frozen windows; unchanged).
- Imported 23 previously uncommitted W1 files. Left out `data_report.txt` (a printout with local paths).
- Added `weights/MANIFEST.md`. A wrong `norm.json` hash in its first version was caught by checking every hash against the files, and corrected.
- Fix: deeply nested JSON now gets 400, not 500.
- Added: response headers `X-MonsoonTwin-Model` and `X-MonsoonTwin-Fallback`, readable by the dashboard through CORS. Response body unchanged.

## Checks (all inputs synthetic unless stated)
| Check | Result |
|---|---|
| Test suite | 589 passed, 1 skipped (the test for the no-weights state, not applicable with weights present) |
| Kit validator on a clean export | All 6 cases and health pass |
| Zero shock equals no shock | Bit-identical (HTTP, 8 states) |
| Repeatability | Bit-identical |
| Validity (finite, rain ≥ 0, t2m in range) | Pass, including 30 steps and extreme inputs |
| Forecasts before and after the header change | Bit-identical |
| Malformed requests | 400 / 422 with reasons |
| Perturbation | Added to the last input day only, then clamped (code and unit tests) |
| Partial forecast after a LocalNet error | Never returned; whole request answered by DAP (unit tests) |
| Model identity and fallback | `/health` and `/meta` give the start-up model; the new header gives the model that answered each request (tests) |
| Outbound network, server process | 0 attempts; kit not imported |
| Bind address | `0.0.0.0` (`serve.py`) |
| Shipped DAP files | Hashes unchanged; refit from branch code is byte-identical |

## Runtime, 4 logical processors, Windows, this PC
| | Ready after process start | 8 calls of 10 steps, max wall | 30 steps | Peak working set |
|---|---|---|---|---|
| DAP, clean export | 1.3 s | 71 ms | 100 ms | 101 MB |
| LocalNet (scratch copy), torch 2.14.1 | 3.3 s | 123 ms | 276 ms | 622 MB |
| LocalNet, torch 2.15.0+cpu | 3.5 s | 110 ms | 288 ms | 291 MB |
| Limit | 120 s | 5 s | none stated | 6 GB |

These are measurements on an i5-13450HX, not the judge's machine.

## Run
```
pip install -r requirements-serve.txt
python serve.py --port 8000
```

## Not verified
Linux; the judge's processors, Python and torch versions; a read-only mount; any independent re-run.

## Model decision
See `MODEL_SELECTION_DECISION.md`. DAP stays until the owner approves a change.

## Acceptance
| Criterion | Result |
|---|---|
| API contract tests | **Met** |
| Zero-shock equivalence, determinism, valid outputs | **Met** |
| No network at inference | **Met** (socket guard in the server process) |
| Honest model and fallback reporting | **Met** |
| Runtime measured and documented | **Met**, with the platform limits above |

**Phase 2 passes** with DAP as the served model.
