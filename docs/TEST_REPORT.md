# Testing and validation report

Recorded on 27 November 2026 (IST), on one Windows 11 laptop (Python 3.13.5). **Two different things are reported here. Software tests show that the code behaves as intended. They say nothing about forecast accuracy.** The model is **UNVALIDATED**.

## 1. Software tests

Run on the application code of this release. Later commits change documentation only.

| Suite | What it covers | Result |
|---|---|---|
| `python -m pytest -q` | Contract, engine, models, server, shock presets | 610 passed, 1 skipped |
| `node --test tests/js/*.test.mjs` | Dashboard logic, colour scales, model names | 24/24 |
| `tests/e2e/integration.e2e.mjs` | Real browser with real server: connection, runs, failures, fallbacks | 36/36 |
| `tests/e2e/dashboard.e2e.mjs` | Map colours, charts, layout, keyboard, safety | 41/41 |
| `tests/e2e/scenarios.e2e.mjs` | Input cases, shocks, impact numbers | 38/38 |
| `tests/e2e/ux.e2e.mjs` | First use, branding, legend, pointer, narrow screens | 72/72 |
| `python tools/preflight.py` | Tracked files, secrets, `serve.py` at root, organisers' repository scan, tests | Passed; repository scan 15/15, no flags |

Some integration tests use stand-ins (a placeholder server and a proxy that alters headers) to reach error paths. Browser tests run in headless Microsoft Edge.

## 2. Official validator

`python -m monsoon_r1.schema_validator http://localhost:8000`, exit status 0:

```
health: OK
  [JSON lists (canonical)] no perturbation  OK
  [JSON lists (canonical)] warm_ocean       OK
  [JSON lists (canonical)] zeros            OK
  [base64 (also tolerated)] no perturbation  OK
  [base64 (also tolerated)] warm_ocean       OK
  [base64 (also tolerated)] zeros            OK
RESULT: all checks passed
```
(Timings removed. The validator checks the interface, not accuracy.)

## 3. Clean installation

A fresh clone with a new virtual environment and only `pip install -r requirements.txt` (PyTorch 2.15.0, CPU) started the server with the shipped LocalNet model (ready in 5.7 s) and passed the validator. The server was run with every non-local connection and name lookup blocked: none was attempted. The suites in section 1 also passed from that clone. A first attempt in a very deep folder failed on the Windows long-path limit; see the README.

## 4. Functional audit of the dashboard

A separate audit drove the running dashboard with real mouse and keyboard input and a live backend, with no mocked forecasts: **409 of 409 checks passed** on this release's application code.

- Both official shocks, six variables, days 1–10: 1,476 cell readouts across Baseline, Scenario and Difference equal the server's arrays, and Difference equals Scenario − Baseline.
- All five inputs with both official shocks open Scenario and Difference. The shocks sent equal the organisers' `make_shock`, and replaying the browser's requests gives bit-identical forecasts.
- Impact cards, the core-zone rain chart and sampled days of the shock-reach chart equal a separate recalculation.
- Custom shocks (limits and invalid input), forecast lengths, playback, map options, keyboard use, failed requests, and screen sizes 1920×1080, 1536×730, 1366×768, 1024×768 and 390×844.

The audit scripts are not part of this repository.

## 5. Model evaluation (local, not independently reproduced)

The figures are in the [README](../README.md#local-results); the source files are in [`eval/reports/activation/`](../eval/reports/activation/), produced by `eval/` on frozen 2018–2019 windows with the organisers' scoring functions. The test years 2020–2021 were not used. **One team member ran them; no second person has reproduced them. They are not the competition score.** Known weaknesses are listed under [Limitations](../README.md#limitations-and-validation-status).

## 6. Not tested

Linux and macOS; the judge's hardware; browsers other than Edge; a visible (non-headless) browser window in these automated runs; mouse selection inside the browser's drop-down list; touch devices; projectors; screen readers; a contrast audit; physically disconnecting the network; forecast accuracy beyond section 5.
