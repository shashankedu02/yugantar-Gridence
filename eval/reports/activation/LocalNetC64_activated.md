# Harness report: LocalNetC64_activated

model: `monsoontwin-localnet-c64-unvalidated` | split: val | windows: 46 | file hash of windows: `3b2e138472ef`

## Gates (G-DAP items; shock battery is in its own report)
- validity_100pct: **PASS**
- day4_skill_vs_persistence_gt_0: **PASS**
- null_bit_identical: **PASS**
- deterministic: **PASS**

mean day-4 skill vs persistence: 0.2491

## Skill vs best reference (mean over windows)
| lead | t2m | tp | u10 | v10 | msl | tcwv |
|---|---|---|---|---|---|---|
| day 1 | 0.290 | 0.250 | 0.246 | 0.273 | 0.257 | 0.338 |
| day 4 | 0.056 | 0.078 | 0.034 | 0.044 | -0.034 | 0.120 |
| day 8 | -0.058 | -0.019 | -0.042 | -0.038 | -0.124 | -0.060 |

## Skill vs persistence (mean over windows)
| lead | t2m | tp | u10 | v10 | msl | tcwv |
|---|---|---|---|---|---|---|
| day 1 | 0.293 | 0.308 | 0.271 | 0.281 | 0.289 | 0.338 |
| day 4 | 0.221 | 0.265 | 0.235 | 0.249 | 0.255 | 0.270 |
| day 8 | 0.157 | 0.236 | 0.200 | 0.223 | 0.125 | 0.207 |

Day-8 spatial variance ratio (pred/true): t2m 0.99, tp 0.27, u10 0.75, v10 0.77, msl 0.96, tcwv 0.94

Local estimate (assumptions in the harness docstring; NOT the judge's score): forecast 30.29/45, anti-blur 9.45/10.

Environment: numpy 2.5.5, python 3.13.5. Re-run from a fresh clone (W2) and compare these numbers before they are quoted.
