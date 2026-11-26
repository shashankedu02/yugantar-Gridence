# Phase 0: discovery and safe environment

27 Nov 2026, 00:28–00:55 IST. Deadline: 10:00 IST the same day.

## 1. Authority
CLAUDE.md §1 limits each session to one workstream. The project owner has instructed that W1, W2 and W3 have stopped development and that this takeover covers all three, inside the integration worktree only. This is recorded here so the departure from §1 is explicit. All other CLAUDE.md rules still apply. Not authorised: push, merge to `main`, force-push, branch deletion, changes to the original W1 workspace or the frozen windows, training, or activating LocalNet without approval.

## 2. Git and remote state
| Ref | Commit | Notes |
|---|---|---|
| `origin/main` | `e45c36d` | Default branch. **Integration base** |
| `origin/w1/eval-harness` | `1be905a` | 2 ahead, 0 behind |
| `origin/w2/dashboard-integration` | `a136509` | 1 ahead, 0 behind. Unchanged since the first review |
| `origin/w3/ui-sandbox-design` | `28aaa6b` | 2 ahead, 0 behind |

- All three fork from `e45c36d`; no file is changed by two branches.
- Pull request #1 is **open, not merged**: W3 into `main`, head `28aaa6b` (public GitHub API).
- The repository is **public**.
- Local branches have no unpushed commits. Unpushed work on other people's machines cannot be checked.
- The W1 working tree had 24 uncommitted files. No stash.
- An older non-Git copy of the project exists beside the repository. It is an earlier state, not additional work.

## 3. Preservation
| Item | Result |
|---|---|
| Backup contents | Git bundle of all refs; binary patch of tracked changes; archive of 45 files (24 uncommitted, plus the ignored `runs/` folder with the LocalNet candidate and run records, plus one evaluation log); SHA-256 list |
| Excluded | `.env` files, virtual environment, caches, dataset (byte-identical to the organisers' original, hash `f37bdbd0…`) |
| Restore test 1 | All 45 files extract byte-identical |
| Restore test 2 | Clone from bundle + patch + untracked files gives the same `git status`; the 24 files match apart from line endings; all four remote commits present |
| Limitation | The backup is on the same drive as the original. Copy it elsewhere if possible |
| Integration worktree | New folder, branch `integration/final-submission`, created from `origin/main` without upstream tracking |
| Original workspace | Still on `w1/eval-harness` at `1be905a`; file hashes unchanged |

## 4. Official materials
- Track 2 problem statement PDF, `API_CONTRACT.md` (identical text to `docs/R1_CONTRACT.md` in the kit) and kit README read.
- Kit wheel, dataset, `stats.json` and contract match the organisers' `SHA256SUMS.txt`.
- `docs/COMPETITION_REQUIREMENTS.md` is consistent with the problem statement on the points compared. Requirement-by-requirement audit follows in Phase 1.

## 5. Contributions and ownership map
| Area | Origin | State |
|---|---|---|
| `serve.py`, `twin/`, `training/` (base), `tests/`, `tools/`, docs | `main` | Contract-compliant server; placeholder forecast without weights |
| `eval/` harness, shock battery, frozen windows | W1, pushed | Complete |
| LocalNet (`twin/net.py`, `twin/inputs.py`, engine changes, `training/{localnet_data,splits,train_localnet,fit_dap_baseline}.py`, `eval/compare.py`, 3 test files) | W1, **uncommitted** | Trained once; one frozen-window evaluation |
| DAP weights (`weights/{climatology,dap,norm,static}.*`) | W1, **uncommitted** | Fitted on 2005–2017 |
| `dashboard/index.html`, `dashboard/js/*.js`, `dashboard/vendor/` | W2 | Works end to end; P1 defects |
| `dashboard/css/`, `dashboard/js/ui/`, `ui-sandbox.html`, `diagnostics/` | W3 | Modules work; sandbox largely passes; weak integration |

Dependencies: `serve.py` → `twin/` → `weights/`. `dashboard/js/app.js` → `api.js`, `state.js`, `scenario.js`, `render.js` → `contour.js`, `config.js`; and dynamically `js/ui/{banner,legend,charts,impact}.js`; `charts.js` → `energy.js`, `colormap.js`. `eval/` and `tests/` use the kit; `twin/` and `serve.py` must not.

## 6. Existing evidence (not re-run in this phase)
| Report | Key result | Standing |
|---|---|---|
| DAP validation, 46 windows | Local forecast 16.59/45, anti-blur 10/10; day-4 skill vs persistence +0.197 | W1 only |
| DAP shock battery, 6 windows | Null identical; non-zero and localised 6/6; **propagation 0/12** | W1 only |
| LocalNet vs DAP, same windows | Local total of 70: **LocalNet 53.17, shipped DAP 37.84**, persistence 21.25 | One W1 run; not independently reproduced |
| LocalNet weaknesses in that run | Monsoon propagation 2/6; warm stability 5/6; day-8 skill below DAP on all six channels; day-8 rain variance ratio 0.27; heavy-rain CSI at day 8 below DAP | |
| Shock diagnostic and Phase 3 diagnosis | 12 cases reproduced; causes of propagation failures not established; recommendation: no further experiments | Read-only analyses |
| Final integration review | W2/W3 P0 none; dashboard P1s open | Browser-tested, synthetic input |
| W3 QA report | Sandbox only; does not hold for the dashboard | W3 self-check |
| Original W3 rejection report | **Not found.** Its seven P2 items remain unverified | |

"Local total of 70" is the repository's replica of the 70 automatic points that can be measured locally. It is not the judge's score: the judge uses different windows (2023–24) and its aggregation across channels and leads is not published.

## 7. Tool limits on this PC
No Docker, `gh` or Playwright. Installed PyTorch is a CUDA build (inference can be run on CPU). No PDF library; Edge can print HTML to PDF. A Linux CPU-only rehearsal is **not yet shown to be possible** here.

## 8. Security
- Pattern search of every new branch commit and the uncommitted files: no match.
- Pattern search of **all history**: **one credential-like value exists in older public history**. Details were given to the project owner privately and are deliberately not in this file. **Owner action: revoke or rotate it; verify, do not assume.** No history rewrite has been or will be done without approval.
- No `.env` file or climate data file was found in any commit by name. Two early commits contain compiled Python cache files (clutter).

## 9. Master issue register
Severity: P0 blocks submission or serious security; P1 major function, contract or judging; P2 noticeable; P3 minor.

| ID | Sev | Phase | Issue and root cause | Depends on | Acceptance criterion |
|---|---|---|---|---|---|
| SEC-1 | P0 | owner | Credential in public history (committed script) | Key issuer | Owner confirms revocation |
| I-01 | P0 | 2 | No branch contains a model; weights and engine changes never committed | | Clean export serves a real model; scan 15.0, no flags |
| I-02 | P1 | 7 | README still says no code, weights or results exist | 2–6 | README steps work from a clean checkout |
| I-03 | P1 | 7 | No technical brief | 2, 6 | Two-page PDF; every number traces to a report |
| I-04 | P1 | 3 | Climatology request omits `steps` | | No error on connect; 200 or handled 503 |
| I-05 | P1 | 3 | Old results and model identity survive a server change or failure | | Reconnect clears stale state; each result tied to its model |
| I-06 | P1 | 3 | Run re-enabled mid-run (every store change enables it) | | One run in flight; button disabled until done |
| I-07 | P1 | 3 | Live state re-read after `await`, so mid-run changes alter the request | I-06 | Request matches the state at the click; controls locked |
| I-08 | P1 | 3, 5 | No `dashboard/cases/` and nothing loads them | Organiser rule on shipping input samples (unconfirmed) | A supported case loads and runs |
| I-09 | P1 | 4 | Legend and map use different palettes and rain scales (two colour implementations) | | Legend colour equals map colour at tested values, all channels |
| I-10 | P1 | 4 | Energy chart: invented zero baseline, empty centre bin, mixed units, unreadable labels | | Values match an independent calculation |
| I-11 | P1 | 4 | Layout fails at 1366×768 (full-width inputs, sticky tall bar, fixed canvas) | | Map and timeline visible without scrolling |
| I-12 | P1 | 4, 5 | No custom shock control although functions exist | I-07 | Custom delta is sent exactly as configured |
| I-13 | P1 | 4, 5 | Impact Lens ignores scenario rain; arbitrary status word; no limitation | | Rain difference matches the arrays; labelled proxy with limitation |
| I-14 | P2 | 4 | W3 modules and styles only partly used (class names differ) | | Used modules verified; unused code explained |
| I-15 | P2 | 4 | No dashboard shortcuts; map not focusable; drawer focus (sandbox) | | Keyboard use verified; browser shortcuts untouched |
| I-16 | P2 | 4 | Server text inserted as HTML | | No unescaped dynamic HTML |
| I-17 | P2 | 4 | Sandbox: dry cells look missing; null legend range invents 0–1; charts shrink at 1366×768 | | Verified in browser |
| I-18 | P2 | 6 | No JavaScript tests | | Committed tests cover fixed defects |
| I-19 | P2 | 6 | Preflight passes a tree with a critical missing-checkpoint flag | I-01 | Preflight fails on any flag |
| I-20 | decision | 2 | **Model choice.** LocalNet scores much higher locally but has open propagation, stability and day-8 weaknesses; Linux CPU and independent reproduction unverified | Owner approval | Written decision with evidence; DAP stays the safe default |
| I-21 | P1 (score) | 2 | DAP cannot spread a shock outside its box, so judged propagation and a live new-shock demo show no spreading | I-20 | Documented |
| I-22 | P2 | 2, 3 | Per-request LocalNet fallback is not visible over HTTP | I-20 | Reporting verified, contract unchanged |
| I-23 | P2 | 2, 7 | `torch>=2.4` floor untested; no `weights/MANIFEST.md`; DAP's gate never formally closed | | Documented and verified where possible |
| I-24 | P2 | 5 | Core-zone rain statistics are null, so the break index cannot be computed | | Either computed from training years or the feature is not claimed |
| I-25 | P2 | 7 | The rule that a second person re-runs quoted numbers cannot be met | | Brief labels numbers as single-team local measurements |
| I-26 | P2 | 8 | Reviewer reports and screenshots inside the repository (`diagnostics/`) | | Decide what ships |
| I-27 | P2 | 8 | Stale development docs (placeholder wording) | | Reconciled |
| E-1 | P1 (demo) | owner | An old placeholder server occupies port 8000 on this PC | | Stopped before rehearsal |
| E-2 | open | owner | Organiser questions unanswered: whether pre-event code is acceptable under "original work"; whether input samples may ship; day-of-year base; PR #1 should not be merged by anyone meanwhile | Organisers | Owner decision |

## 10. Phase plan and time budget (estimates)
| Phase | Content | Budget |
|---|---|---|
| 1 | Contract and architecture audit | 30 min |
| 2 | Backend; model decision with evidence | 75 min |
| 3 | API and dashboard integration | 60 min |
| 4 | Dashboard function and UI | 110 min |
| 5 | Cases, custom shocks, impact | 60 min |
| 6 | Testing, security, performance | 50 min |
| 7 | Documentation and brief | 75 min |
| 8 | Release candidate | 45 min |
| | Reserve, rehearsal and owner steps (push, form) | the remainder, at least 30 min |

## 11. Phase 0 acceptance
| Criterion | Result |
|---|---|
| Original W1 work preserved | **Met** (hashes unchanged; backup restore verified) |
| Integration branch isolated | **Met** |
| No unnecessary source change | **Met** (only this report added) |
| Major incomplete items recorded | **Met**, with the limit that the original W3 rejection report is unavailable |
| Important existing work not overlooked | **Met** for what is on this PC and on the remote |
