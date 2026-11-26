# MonsoonTwin: final handover

27 Nov 2026, about 01:30 IST. Deadline 10:00 IST. Branch `integration/final-submission`, **local only: nothing has been pushed or merged.**

> **Update after model activation.** LocalNet is now served, with the DAP of the same training run as fallback. `MODEL_ACTIVATION_REPORT.md` is current for the model, tests, performance and limitations. Where the sections below say DAP is served, give test counts or give DAP results, they describe the earlier release candidate. The classification is unchanged. Condition 3 is done; the others remain.

## Classification: **CONDITIONALLY READY**
**The local release candidate works. The public repository does not yet contain it:** `main` on GitHub is still `e45c36d`, which serves a placeholder.

### Conditions before submission (owner)
| # | Condition | Why |
|---|---|---|
| 1 | Complete the **security action** given to you privately | Do this first |
| 2 | **Push the branch and merge it into `main`** (steps below) | Otherwise the judged repository has no model (scan 6.5/15 even with all three work branches) |
| 3 | ~~Decide the model~~ **Done:** LocalNet activated | See `MODEL_ACTIVATION_REPORT.md` |
| 4 | **Accept the label "not independently reproduced"** on scores in the brief and README, or have a second person re-run the comparison | CLAUDE.md's independence rule forbids quoting them without a second run |
| 5 | **Add the team name** to `docs/brief/brief.html` and re-export the PDF; submit the PDF as the form requires | Not known to me, so not invented |
| 6 | Confirm with the organisers: pre-event code is acceptable; shipping four 3-day input states is acceptable | Compliance risks I cannot settle |
| 7 | Stop the old server on port 8000 before any demo | It answers with the placeholder |
| 8 | Do not merge pull request #1 on its own | It would put only W3 on `main` |

## Evidence for the classification
| Area | State | Evidence |
|---|---|---|
| Backend and contract | Verified | Kit validator; 20 edge cases; zero shock bit-identical; deterministic; offline; read-only |
| Repository scan | Verified locally | 15.0/15, no flags, on `git archive` |
| Tests | Verified | 602 Python passed, 1 skipped; 16 JavaScript; 114 browser checks; 10-step demo rehearsal |
| Dashboard | Verified in Edge | Runs, errors and recovery; map = legend colours; energy and impact values against separate calculations; 1366×768 |
| Brief | Draft complete | 2 pages; needs team name and your approval of the figures |
| Forecast quality | **Partly verified** | One person's local replica; not the competition score; no independent run |
| Linux sandbox | **Not tested** | No Docker or Linux here |

## What the submission can and cannot do
- **With DAP (current):** valid, stable, fast, qualifies on the local day-4 and localised-shock gates. Local replica **37.8 of 70**. It **cannot spread a shock**: propagation 0/12, and the two official shocks cannot change rain. If skill is averaged by lead day, its RMSE points could be about zero.
- **With LocalNet (needs approval):** local replica **53.2 of 70**; spreads 8 of 12 shock cases. Open weaknesses: monsoon 2/6, one stability failure, weaker day 8, extreme inputs reach the rain limit, never run on Linux.

## Final deliverables
| # | Deliverable | State |
|---|---|---|
| 1 | Integrated branch | Done, local |
| 2–4 | Backend, dashboard, API integration | Done |
| 5 | Demo cases | Done: four inputs from 2018–2019 |
| 6 | Shocks and impact comparison | Done; DAP limits shown on screen |
| 7 | Tests and scan | Done; limits above |
| 8 | README | Done |
| 9 | Brief | `docs/brief/MonsoonTwin_brief.pdf` (conditions 4 and 5) |
| 10 | Demo instructions | `docs/DEMO_RUNBOOK.md` (rehearsed by script; **rehearse it yourself and record the backup video**) |
| 11 | Changed-file inventory | Below |
| 12 | Limitations and open issues | Below |
| 13 | Readiness assessment | This document |

## Publishing steps (not run; need your action)
```bash
cd <integration worktree>
git log --oneline origin/main..HEAD          # review
git push -u origin integration/final-submission
```
Then open a pull request **integration/final-submission → main** on GitHub and merge it with a merge commit. Afterwards verify what the judges will get:
```bash
git clone https://github.com/shashankedu02/yugantar-monsoon-kit verify && cd verify
pip install -r requirements-train.txt pytest requests third_party/monsoon_r1_kit-1.0.0-py3-none-any.whl
python tools/preflight.py                    # must say PASSED with 15.0/15
python serve.py --port 8000                  # then: python -m monsoon_r1.schema_validator http://localhost:8000
```
Check the repository page is public in a private browser window, tag the final commit `final`, put its hash in the form, and push nothing after the deadline.

## Changed files against `main`
| Area | Files |
|---|---|
| Server and inference | `serve.py`, `twin/engine.py` (modified); `twin/inputs.py`, `twin/net.py` |
| Training | `training/{fit_dap_baseline,localnet_data,splits,train_localnet}.py` |
| Evaluation | `eval/{__init__,compare,data_io,harness,shock_battery,windows}.py`, `eval/windows_val.json`, `eval/reports/` |
| Weights | `weights/{climatology.npz,dap.npz,norm.json,static.npz,MANIFEST.md}` |
| Dashboard | `dashboard/index.html`, `ui-sandbox.html`, `js/` (including new `analysis.js`, `cases.js`, `validate.js`), `js/ui/`, `css/`, `cases/`, `vendor/LICENSES.md`, `README.md` |
| Tests | `tests/e2e/`, `tests/js/`, `tests/{localnet_helpers,test_calendar_consistency,test_dashboard_presets,test_localnet,test_preflight}.py`, `tests/test_server.py` (modified) |
| Tools | `tools/preflight.py` (modified), `tools/make_demo_cases.py`, `tools/brief_figure.mjs` |
| Docs | `README.md`, `DEVELOPMENT.md`, `docs/DASHBOARD_API.md`, `docs/DEMO_RUNBOOK.md`, `docs/brief/` |
| Settings | `.gitattributes` (PDF as binary), `requirements-serve.txt`, `requirements-train.txt` |
| Reports | `diagnostics/` (takeover reports; W3's QA report and screenshots) |

Frozen windows, scoring code and `twin/dap.py` are unchanged from the pushed W1 branch. No training or tuning was run. 2020–2021 data was not used.

## Known limitations and unresolved issues
- Everything under "Not tested": Linux, judge hardware and versions, browsers other than Edge, screen readers, colour contrast, physical network disconnection, independent reproduction.
- The original W3 rejection report was never found; its seven P2 items are unverified.
- W3's `diagnostics/W3_QA_REPORT.md` covers its sandbox only and predates this integration; its "ready" statements do not describe the dashboard.
- Monsoon-break index not implemented (core-zone statistics are null).
- Day-of-year base not stated by the contract.
- Request body size unlimited; no authentication (local offline use).
- The old planning documents under `docs/` describe features that were not built; `README.md` and `docs/DEMO_RUNBOOK.md` are current.
- CLAUDE.md ownership rules were set aside for this takeover on the owner's instruction. Its independence rule remains unmet.

## Errors made during the takeover, and how they were caught
| Error | Caught by | Effect |
|---|---|---|
| Wrote an unverified `norm.json` hash into the manifest | Checking every hash against the files | Corrected before release |
| A store rewrite removed a method still in use | Checking every store call | Fixed before testing |
| A commit went through with six failing browser checks (test input no longer matched the screen) | Reading the test output | Test and layout fixed in the next commit |

## Preservation
The original W1 working folder is on `w1/eval-harness` at `1be905a` with all 45 backed-up files unchanged. A verified backup (Git bundle, patch, file archive) is on the same drive; copy it elsewhere.

## Left for you to delete
`D:\Yugantar\tmp\rc` (the release-candidate test clone and its virtual environment) and files beside it. A safety check blocked my removal, and I did not work around it.
