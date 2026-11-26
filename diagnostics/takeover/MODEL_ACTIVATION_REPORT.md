# LocalNet activation report

27 Nov 2026. Activation approved by the owner, subject to verification. **Nothing was pushed or merged.** No training or tuning was run; the frozen windows and scoring code are unchanged; 2020–2021 data was not used.

All measurements are by one person on one Windows PC. **They are not independently reproduced.** The fresh-checkout results for the final commit are recorded outside the repository, so that the tested commit is the final one.

## Package
| Check | Result |
|---|---|
| Five files against the hashes recorded by the training run | Match |
| All eight candidate files against the backup hash list | Match |
| Five training source files against the run record | Byte-identical to this repository |
| Checkpoint normalisation and static features against `norm.json`, `static.npz` | Equal |
| `climatology.npz`, `norm.json`, DAP coefficients rebuilt in memory from 2005–2015 | Exactly equal |
| Committed model files against recorded hashes | Match |

The DAP fallback is the one of the same package (2005–2015). `model_select.json` is stored with Unix line endings; its JSON is identical to the run's file, and the server does not hash that file.

## CPU-only PyTorch (2.15.0+cpu and 2.6.0+cpu, `torch.version.cuda` is None)
30 of 30 checks passed on each: checkpoint loads on CPU (313,735 parameters); complete 10-day forecasts on four demo cases, in process and over HTTP on 4 processors; zero shock bit-identical to no shock (lists and base64); both official shocks valid, answered by LocalNet, non-zero and local; forced LocalNet failures (with and without a shock) answered by the package DAP, labelled, with matching numbers, and LocalNet again on the next request. Five real start-up failures (damaged, missing or unloadable checkpoint, another run's climatology, `torch` not importable) fell back to DAP: 13 of 13 on each build, including 60 concurrent mixed requests with every label matching its numbers.

2.15.0+cpu gave forecasts bit-identical to the training build (2.14.1, run on the CPU); 2.6.0+cpu differed by at most 0.00004 standard deviations over 10 days and 0.0005 over 30.

| 4 processors, over HTTP | 2.15.0+cpu | 2.6.0+cpu | Limit |
|---|---|---|---|
| Ready | 2.8–3.4 s | 2.8–3.4 s | 120 s |
| Slowest 10-day call measured | 141 ms | 191 ms | 5 s |
| Slowest 30-day call (12 calls) | 329 ms | 354 ms | |
| Peak working set | 251–262 MB | 228–241 MB | 6 GB |
| Outbound connection attempts | 0 | 0 | none |

With writing denied by Windows permissions, the server (2.14.1 build) loaded LocalNet, passed the kit validator and added no file.

## Frozen validation and shock battery
`eval.compare` on the activated folder: 228 forecast calls, 0 fallbacks, exit code 2 (not every shock check passes). Against the earlier report, 2,158 values: only the window-file hash (Windows line endings, confirmed) and timings differ, with the 2.14.1 build and 2.15.0+cpu. On 2.6.0+cpu, 85 further numbers differ by at most 7e-7; no pass/fail result, count or score at two decimals differs. The standalone harness and shock battery agree. Details: `eval/reports/activation/`.

Local replica: **53.2 of 70** (RMSE 29.5/30, heavy rain 0.8/15, anti-blur 9.45/10, causality 13.4/15). Package DAP: 37.7. Not the competition score.

| Window start | Shock | Non-zero | Local | Spreads | Stable |
|---|---|---|---|---|---|
| 2018-01-15 | warm ocean | yes | yes | yes | yes |
| 2018-01-15 | monsoon stall | yes | yes | yes | yes |
| 2018-03-16 | warm ocean | yes | yes | yes | yes |
| 2018-03-16 | monsoon stall | yes | yes | **no** | yes |
| 2018-05-22 | warm ocean | yes | yes | yes | **no** |
| 2018-05-22 | monsoon stall | yes | yes | **no** | yes |
| 2019-07-04 | warm ocean | yes | yes | yes | yes |
| 2019-07-04 | monsoon stall | yes | yes | yes | yes |
| 2018-09-18 | warm ocean | yes | yes | yes | yes |
| 2018-09-18 | monsoon stall | yes | yes | **no** | yes |
| 2018-11-13 | warm ocean | yes | yes | yes | yes |
| 2018-11-13 | monsoon stall | yes | yes | **no** | yes |

All 12: no-teleport check passes; zero shock identical.

**The earlier failures remain. Activation fixes none of them.**
- Stability, warm ocean 2018-05-22: day-6 rain at 19.5°N 87.5°E goes from 57.0 to 6.6 mm/day (6.67 standard deviations, limit 5; three values exceed 5).
- Monsoon stall: on 2018-03-16 and 2018-11-13 the response outside the shocked area fades (late/first-day ratio 0.55 and 0.40; needs above 1.5). On 2018-05-22 and 2018-09-18 it grows (2.06, 1.65) but stays below the kit's minimum size (0.52 and 0.80 of it).
- Causes are not established.

## Changes made during activation
| Change | Reason |
|---|---|
| Line above the map names both models when baseline and scenario differ | It named only the baseline |
| Long model name no longer wraps the top bar | Layout failure found by the browser test |
| Impact cards state the limit of a learned shock response | Actual model behaviour |
| Browser tests expect LocalNet; shock and energy checks compare with independently computed values; a real server with a damaged checkpoint covers DAP | The old expectations described DAP |
| `tests/test_activated_package.py` | Keeps the package files together |

One browser check changed meaning. It required a rain shock to raise the 10-day rain total over the shocked area, which was true of DAP. With LocalNet the response is positive on early days and negative later, and the total was 0.04 mm. The check now requires a rise on day 1 and requires the card to equal the server's 10-day change.

## Behaviour to know before a demo
- On "Active monsoon", neither official shock spreads by the kit's check. See the table in `docs/DEMO_RUNBOOK.md`.
- In the cases examined, most injected rain was gone by day 3.

## Not verified
Linux; the judge's hardware, Python and PyTorch versions; PyTorch older than 2.6.0; a byte-identical retraining; browsers other than Edge; screen readers; colour contrast; a physically disconnected machine; reproduction by a second person. CLAUDE.md's independence rule is therefore still unmet.

## Corrections to earlier statements
- An earlier chat summary said three monsoon-stall failures fade and one grows. The measured split is two and two (above).
- A speed run described as "GPU hidden" did not hide the GPU. The server runs the model on the CPU in any case; the figures quoted here are from CPU-only builds.
- The brief briefly quoted 155 ms as the slowest 10-day call; a later run measured 191 ms.
