# Phase 1: official contract and architecture audit

27 Nov 2026. Sources: Track 2 problem statement (PS), general tracks PDF (GEN), `API_CONTRACT.md` (CON), and the organisers' kit source (identical to the installed wheel).

**Status words.** Verified: shown by running code. Partly: shown only in part, or only on this PC. Gap: not met. Unknown: not stated officially or not testable here.
"W1 code" means the W1 files that were uncommitted at audit time (run from a scratch copy). They are brought onto the integration branch in Phase 2, which must re-run these checks. All API inputs were **synthetic**; nothing here measures forecast skill.

## A. Runtime and API
| ID | Requirement (source) | Implementation and evidence | Status / gap | Sev | Fix and acceptance test |
|---|---|---|---|---|---|
| C-01 | `python serve.py --port 8000`, root, `0.0.0.0` (PS, CON) | `serve.py:82-85` | Verified (code; server started by this command earlier) | | Re-run from clean export |
| C-02 | `POST /health` → ready only after the model loads (PS, CON) | Engine built and warmed at import, `serve.py:33`; validator OK | Verified | | |
| C-03 | Ready within 120 s (CON) | Engine ready 0.2 s for DAP | Partly: this PC only | P2 | Measure LocalNet too |
| C-04 | Request fields; lists, b64 tolerated (CON) | `twin/wire.py`; 20 edge cases over HTTP | Verified | | |
| C-05 | `doy_sincos` is the last input day; `rollout[k]` is day k+1 (PS, CON) | `twin/doy.py`, `dap.py` uses clim of day n+k; tests with an independent calendar oracle | Verified against our convention | | |
| C-06 | Day-of-year base (0 or 1) | Kit climatology: 366 slots, 1 January is slot 0, same as ours. Kit `doy_sincos` takes an integer without saying its base | **Unknown**: if 0-based we are one day off in a 15-day-smoothed climatology | P3 | Ask organisers; do not guess |
| C-07 | Perturbation: physical delta on `init_states[-1]` (PS, CON) | `engine.py:283-292`; earlier two days untouched; clamped after adding | Verified | | |
| C-08 | Zero shock changes nothing (PS; kit tolerance 1e-3 std) | Bit-identical, lists and b64, 10 and 14 steps | Verified (DAP). LocalNet: frozen-window report says identical; re-check in Phase 2 | | |
| C-09 | Response `{rollout, inference_ms}`, nested finite lists (CON) | Edge probe: exactly those keys | Verified | | |
| C-10 | Six channels in order, physical units (PS, CON) | `guards.CHANNELS` matches `contract.CHANNELS` | Verified | | |
| C-11 | Grid 32×36, 6.5–37.5 N, 65.5–100.5 E, row 0 south (CON) | `engine.LAT/LON` | Verified | | |
| C-12 | Validity: finite, rain ≥ −1e-6, t2m 233.15–333.15 K (kit `validity`) | Clamp limits 233.2–333.1, rain ≥ 0; held under an extreme perturbation | Verified | | |
| C-13 | 10+ stable steps (PS) | 1, 10, 14, 30 steps finite | Verified on synthetic input | | Real-window validity: harness |
| C-14 | Deterministic | Harness gate PASS for DAP and LocalNet (earlier W1 reports) | Partly: re-run in Phase 2 | | |
| C-15 | Under 5 s per call (PS, CON); response under 80 MB | 20 calls: median 53 ms, max 76 ms wall including JSON (DAP, this PC, no core limit) | **Partly**: not on 4 cores / 6 GB; LocalNet HTTP timing not measured | P1 | Phase 2: 4-core affinity and memory peak |
| C-16 | 4 CPU, 6 GB, no GPU, Linux sandbox | No Docker here; installed torch is a CUDA build | **Unknown** for Linux CPU-only | P1 if LocalNet | Linux rehearsal if possible; otherwise state it |
| C-17 | No network at inference (PS) | Earlier probe blocked outbound connects: 0 attempts (DAP) | Verified for DAP; re-check LocalNet | | |
| C-18 | Only listed libraries (PS) | Inference imports: numpy, fastapi (+CORS), uvicorn; torch only for LocalNet. Kit not imported | Verified (scan list and probe) | | |
| C-19 | Repo read-only, write only `/tmp` (PS) | No file writes in `serve.py` or `twin/` inference path; `save` methods are training-only | Partly: code inspection, not run on a read-only mount | P2 | Phase 6 read-only copy run |
| C-20 | Invalid input handled | 400 / 422 with reasons. **Deeply nested JSON gives 500** (server stays up) | Gap | P3 | Catch `RecursionError`; test expects 400 |

## B. Repository and submission
| ID | Requirement | Evidence | Status / gap | Sev | Acceptance test |
|---|---|---|---|---|---|
| R-01 | Weights inside the repo, under 2 GB (PS) | No branch has model weights | **Gap** | P0 | Clean export serves a model |
| R-02 | Repo check 15/15 (kit scan) | Pushed branches 6.5; with W1 files 15.0 | **Gap** on every pushed ref | P0 | 15.0, no flags, on `git archive` |
| R-03 | Training code (PS) | `training/fit_dap.py` fits the DAP weights; an earlier refit was byte-identical | Verified for DAP; LocalNet trainer uncommitted | P1 | Both on the branch |
| R-04 | No weather APIs, date literals or data archives in inference (PS, scan) | Scan with W1 files: no flags | Verified for W1 code | | Repeat after integration |
| R-05 | Dashboard separate from server (PS) | `dashboard/` static; scan health true | Verified | | |
| R-06 | README: train and run (PS) | README says no code or weights exist | **Gap** | P1 | Phase 7 steps work from a clean checkout |
| R-07 | Public repo (PS, GEN) | GitHub API: public | Verified | | |
| R-08 | Original work, built during the hackathon (PS) | Whether the pre-event Milestone 1 code is acceptable was never confirmed (CLAUDE.md status line) | **Unknown** | owner | Owner confirms with organisers |
| R-09 | No shipped archives of past weather (PS) | Planned demo cases are a few 3-day input states. The kit scan accepts a 3-day case; organiser acceptance is unconfirmed | **Unknown** | owner | Keep to a few inputs, never targets; disclose |
| R-10 | No secrets | One credential in old public history (owner informed) | **Gap** (owner action) | P0 | Owner revokes |
| R-11 | ERA5 attribution | In README on `main` | Verified (present) | | Keep |

## C. Product requirements
| ID | Requirement | Status / gap | Sev | Acceptance test |
|---|---|---|---|---|
| P-01 | Roll forward without blur (PS R1, R3) | DAP local anti-blur 10/10; LocalNet 9.45/10 (rain day-8 variance 0.27) | Partly: W1-only local measurement | | Harness |
| P-02 | Beat persistence at day 4 (hard gate) | Local: DAP +0.197, LocalNet +0.249 mean skill | Partly: local windows only | | Harness re-run |
| P-03 | Beat persistence and climatology, with heavy rain (PS R4) | DAP is slightly **below** the better reference at days 4 and 8; LocalNet below at day 8. Heavy-rain skill near zero for both | Partly | P1 (score) | Report honestly |
| P-04 | Shock local first, then spreads (PS R5; scoring) | DAP: localised 12/12, **propagates 0/12 by construction** (per-cell model). LocalNet: warm 6/6, monsoon 2/6; one stability failure | **Gap** for DAP | P1 (score) | Shock battery |
| P-05 | At least one non-zero localised response (hard gate) | Both models 12/12 locally | Partly: local | | |
| P-06 | Live dashboard on our own simulation (PS ground rules) | Works with open P1 defects | Gap | P1 | Phases 3–5 |
| P-07 | Interactive map and an impact extension; judges apply a new shock (PS §1, §5) | No custom shock; impact cards ignore scenario rain | **Gap** | P1 | Phases 4–5 |
| P-08 | Brief: 2-page PDF. Page 1: design, drift and blur prevention, failure modes. Page 2: visualisation and impact use case (PS). USP, architecture, approach (GEN) | None on any branch | **Gap** | P1 (15 points) | Phase 7 |

## D. Architecture check against CLAUDE.md
| Point | Result |
|---|---|
| LocalNet width | CLAUDE.md §3.1 names C=96 and allows C=64 variants. The trained candidate is **C=64**, B=4: an allowed variant. EXP-1's C=96 comparison was never run |
| Forbidden layers (§3.2) | None: 3×3 convolutions, per-pixel LayerNorm, GELU (code) |
| Residual prediction, rain in log1p (§3.3) | Yes |
| No blend toward climatology (§3.7) | None |
| Guards (§3.8) | Input clamp after perturbation, per-step limit, final clamp |
| DAP as fallback (§3.5) | Per-step and whole-request fallback in `engine.py`; selection only through `model_select.json` with hash checks |
| Contradiction found | `docs/DECISION_LOG.md` D-28 says the old history was discarded; it was not (see Phase 0 §8) |
| API step range | We accept 1–30; the kit's maximum is 14. A superset, harmless |

No frozen evaluation definition was changed.

## Acceptance
Every requirement above has a status or a documented gap. **Phase 1 passes.** Open "Unknown" items needing the owner: C-06, R-08, R-09. C-16 is a tool limit to revisit in Phase 2.
