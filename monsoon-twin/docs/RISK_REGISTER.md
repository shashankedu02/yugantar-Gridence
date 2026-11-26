# Risk register

- **Likelihood (L) and impact (I):** H, M or L.
- **Owner:** B1, B2 or AUD.
- **Review:** at every checkpoint, AUD updates the Status column.

## Evaluation risks
| ID | Risk | L | I | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| E1 | An invalid output (NaN, negative rain, t2m out of range) on one of 8 calls fails the gate | M | **H** | Guards and clamps; DAP fallback for each non-finite step; harness validity on more than 45 windows at 14 steps | B1/AUD | open |
| E2 | Doesn't beat persistence at day 4, so not qualified | L–M | **H** | Conditional checkpoint G-DAP at H5.5; fallback F0 (bug hunt, lead-wise damping, then LocalNet-only route); LocalNet only replaces DAP if better | B1 | open |
| E3 | Null shock not identical: half the causality points lost | L | M | Deterministic CPU inference; bit-identical test T-CAU-1 | B1/AUD | open |
| E4 | The shock response decays too fast, so "propagates" fails (−1.875 per shock) | **H** for DAP, M for LocalNet | M | Residual design, no hard climatology blend, battery gate (see SHOCK §2) | B1 | open |
| E5 | Day-1 response leaks globally (spatial-statistics normalisation, U-Net) | M if the rules are ignored | M | Architecture rules R-S2/R-S3; battery | B1/AUD | open |
| E6 | tp/u/v blur at day 8 (< 40%) | M | M (≤ 5 pts) | Monitor; variance rescale fitted on validation; F4 | B1 | open |
| E7 | **Dry-window trap:** drizzle in a dry window pushes the averaged tp variance ratio above 2.5, so the tp anti-blur score is 0 | M | M | Drizzle floor fitted on validation; dry regime windows in the harness | B1/AUD | open |
| E8 | CSI ≈ persistence (under-predicted heavy rain) | **H** | M (≤ 15) | log1p tp, heavy-rain head, per-lead quantile mapping on validation | B1 | open |
| E9 | The grader averages skill differently from our assumption | M | L–M | Harness reports per lead and per channel; we optimise the whole table, not one aggregate | AUD | open |
| E10 | Repo-scan flag (source names, dates, archives, `.npy`-only weights, UI words in the server) | M (easy mistake) | **H** (−8) | CLAUDE.md §4 rules; kit scan of a **clean git export** on every PR | AUD | open |
| E11 | Distribution shift: hidden windows built through the ARCO path, 2023–24 | M | M | Normalised inputs; small model; regime windows; cannot be fully tested | B1 | accepted |
| E12 | The third input day has the shock but the first two don't, so the model reads a fake trend and extrapolates it | M | M | Battery S1–S3 checks the scaling and stability; if extrapolation shows, reduce the weight of explicit trend inputs or train with occasional single-day noise on day 3 | B1 | open |
| E13 | Edge effects (the Arabian Sea box touches the west edge; no boundary data) | M | M | Replicate padding, edge-distance channel, per-cell skill map | B1 | open |

## Technical / runtime risks
| ID | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| T1 | Inference over 5 s in the sandbox (thread oversubscription, cold start) | L **[ESTIMATED** from ~0.8 GMAC/step; latency UNVERIFIED] | **H** | Warm-up before `/health` says ready; `torch.set_num_threads(4)`; timing test; ONNX fallback (F5) | B2/AUD |
| T2 | Server needs a library missing from the sandbox (yaml, safetensors, the kit) | M | **H** | Clean-venv rehearsal L5; use `torch.save` (.pt), JSON and NPZ only | AUD |
| T3 | Weights missing from a fresh clone (gitignored, LFS) | M | **H** | Fresh-clone test; no LFS unless needed | AUD |
| T4 | Torch version mismatch when loading weights (sandbox torch version unknown) | M | **H** | Save `state_dict` only (not pickled modules), with `torch.save(..., _use_new_zipfile_serialization=True)`. Load with `weights_only=True` where supported; fall back gracefully on older torch. Optionally also export ONNX. | B1 |
| T5 | Windows vs Linux path or line-ending bugs (team on Windows, judge on Linux) | M | M | `pathlib` relative to `__file__`; L5 Docker rehearsal; `.gitattributes` text=auto | B2 |
| T6 | No GPU, so training takes too long | M | M | F2 (smaller net, fixed time budget) | B1 |
| T7 | Memory over 6 GB | L | **H** | Small model; no dataset loaded at inference | AUD |
| T8 | Port or CORS issues block the dashboard during the demo | M | M | Test on both laptops; configurable API URL | B2 |

## Scientific risks
| ID | Risk | Mitigation |
|---|---|---|
| S1 | Unphysical shock responses (wrong sign) noticed by judges | L7 review using the expected signs in SHOCK §4; discuss honestly in the demo |
| S2 | Over-claiming impact (heatwave, flood) | The UI spec labels proxies; method popovers; brief wording reviewed by AUD |
| S3 | ERA5 rain differs from IMD observations | State it as a limitation [B18] |
| S4 | The ensemble presented as a probability | Labelled "sensitivity to initial conditions" [B28] |

## Time / team risks
| ID | Risk | Mitigation |
|---|---|---|
| P1 | Training finishes late, so nothing better than DAP | If G-DAP passed, the safe submission exists; if not, F0 applies; freeze times are fixed; F1 |
| P2 | Merge conflicts | Ownership map; short branches; AUD merges |
| P3 | Claude usage limit on the shared account | Antigravity for AUD; scoped prompts; F7 |
| P4 | Fatigue errors after H18 | Planned rest blocks (24 h plan); freezes; checklist; no risky pushes after H20 |
| P5 | Rules ambiguity (pre-written code, private repo, deadline) | Ask organisers at H0 (OPEN_QUESTIONS) |

## Compliance / integrity risks
| ID | Risk | Mitigation |
|---|---|---|
| C1 | Code written before the event gets disqualified (event rule) | No code in this blueprint. All code starts at H0 in the new repo. |
| C2 | The dashboard shows pre-rendered output | UI non-negotiables; T-DASH-1 |
| C3 | Demo cases mistaken for an "archive" | At most 8 cases of 3 days each, JSON, input only; never read by the server |
