# Model selection: DAP or LocalNet

27 Nov 2026. **Current state: DAP is served. LocalNet is NOT activated. Activation needs the owner's approval.**

No training, tuning or architecture change was made. The frozen windows were not changed. 2020–2021 data was not used.

## A rule conflict the owner must decide
CLAUDE.md §1 (independence rule): no score, skill, shock or latency figure may appear in the brief, the dashboard **or a decision** until W2 has re-run the script from a fresh clone. W2 has stopped, so no second person can do this. The reproduction below is by the same person on the same PC. The figures are therefore **not independently verified**. Using them for this decision, and in the brief with that label, needs the owner's acceptance. The alternative is that someone else on the team runs `python -m eval.compare` on their own machine.

## Candidates
| | Shipped DAP | LocalNet C64 |
|---|---|---|
| What | Per-cell damped anomaly persistence | 313,735-parameter residual CNN |
| Training years | 2005–2017 | 2005–2015 (2016–2017 used for model selection) |
| Needs | numpy | numpy and torch |

## Evidence: frozen validation windows (2018–2019)
46 forecast windows and 6 shock windows. **Local replica of the automatic scoring (70 of 100 points). It is not the competition score.**

| Measure | DAP | LocalNet | Maximum |
|---|---|---|---|
| RMSE skill points (pooled aggregation) | 16.59 | **29.52** | 30 |
| Heavy-rain CSI points | 0.00 | **0.76** | 15 |
| Anti-blur points | **10.00** | 9.45 | 10 |
| Shock causality points | 11.25 | **13.44** | 15 |
| **Local total** | **37.84** | **53.17** | 70 |
| Mean day-4 skill vs persistence (qualifying gate) | +0.197 | +0.249 | |
| Valid, deterministic, zero shock identical | pass | pass | |

Paired RMSE skill, LocalNet minus shipped DAP: +0.052 per window, better on 39 of 46, bootstrap 95% interval +0.037 to +0.068.

**Aggregation sensitivity.** The organisers do not publish how skill is averaged. If leads were scored separately and then averaged, the RMSE points would be about **0.0 (DAP) against 22.4 (LocalNet)**, because DAP is slightly worse than the better reference at days 4 and 8. This is arithmetic on window-mean skill, not an official method.

## LocalNet weaknesses (all still true)
| Weakness | Detail |
|---|---|
| Monsoon-stall propagation | Passes 2 of 6 windows (DAP: 0 of 12 over both shocks) |
| Stability | 1 of 12 shock cases exceeds 5 standard deviations (warm ocean, 6.67; DAP: none) |
| Day 8 | Below the better reference on all six channels, and below DAP |
| Day-8 rain variance ratio | 0.27, under the 0.40 anti-blur line (DAP 0.41) |
| Heavy rain, day 8 | CSI 0.154 against DAP 0.220 |
| Water vapour | Exact zeros at some high-altitude cells |
| Extreme inputs | With unrealistic synthetic states or shocks, rain reaches the 1000 mm/day safety ceiling. Outputs remain valid only because of the limit. DAP stayed at or below 358 mm/day on the perturbed versions of ordinary states |
| Causes | Not established (read-only diagnosis) |

## Verification added in this takeover
| Check | Result |
|---|---|
| Reproduction from a clean export of the integration branch | 2,109 values compared with the original report: all match except the window-file hash (Windows against Linux line endings). 228 calls, 0 fallbacks. Same PC, same person: **not independent** |
| DAP refit from the integration code | Byte-identical to the shipped files |
| 4 logical processors, over HTTP, synthetic input | DAP: ready 1.3 s, 10-step max 72 ms, peak 101 MB. LocalNet: ready 3.3 s, max 123 ms, 30 steps 276 ms, peak 622 MB. Limits: 120 s, 5 s, 6 GB. This PC's processors, not the judge's |
| Outbound network | 0 attempts, both models |
| Extreme synthetic inputs, 30 steps | Both always valid; no DAP fallback |
| CPU-only PyTorch builds (Windows) | 2.15.0+cpu: outputs **bit-identical** to the training machine's 2.14.1 build run on CPU, 10 and 30 steps; peak 291 MB; max 110 ms. 2.6.0+cpu: loads and runs; largest difference 0.00004 standard deviations over 10 steps and 0.0011 over 30; repeat and zero-shock identical within the build. Releases older than 2.6.0 not tested |
| Linux sandbox | **Not tested.** No Docker or Linux environment on this PC |

## Risk if LocalNet is activated
- **Fail-safe path.** If torch cannot be imported or the checkpoint cannot load or run, the engine answers with the DAP files in the same folder and says so in `model_name`. After activation those are the **2005–2015** DAP files, which scored 37.69 locally against 37.84 for the shipped ones. So a load failure costs about 0.15 local points compared with shipping DAP. This path is covered by unit tests; it has not been exercised in a Linux sandbox.
- **What the fallback does not cover:** a slow or memory-limited sandbox, or poor behaviour on the judge's windows or new shocks.
- **Per-request fallback is not visible over HTTP.** `/health` and `/meta` show the model chosen at start-up.
- Activation replaces `weights/climatology.npz` and `dap.npz` with the 2005–2015 versions, adds `localnet.pt` and `model_select.json`, and replaces `norm.json`. The shipped files stay in Git history, so reverting is one commit.
- The checkpoint was trained on this PC. Judges may ask how it was trained: `training/train_localnet.py` and `eval/reports/phase2/` are on the branch.

## Recommendation
**Activate LocalNet**, if the owner accepts the weaknesses above.
- The local advantage is large (+15.3 of 70) and holds under both aggregation readings.
- Validity and runtime margins are wide, and a load failure falls back to a DAP that scores almost the same as the shipped one.
- The risks that remain are real: no Linux rehearsal, no independent re-run, and a live demo where an unusual shock could produce implausible rain.

Keeping DAP is the lower-surprise choice. It costs forecast points and, under per-lead aggregation, possibly all RMSE points; and it can never show a shock spreading, which the problem statement asks for.

**Until approval is given, DAP stays.** The dashboard does not depend on the choice.
