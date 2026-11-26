# Harness report: DAP

model: `monsoontwin-dap-unvalidated` | split: val | windows: 46 | file hash of windows: `eac6e6defa4a`

## Gates (G-DAP items; shock battery is in its own report)
- validity_100pct: **PASS**
- day4_skill_vs_persistence_gt_0: **PASS**
- null_bit_identical: **PASS**
- deterministic: **PASS**

mean day-4 skill vs persistence: 0.1966

## Skill vs best reference (mean over windows)
| lead | t2m | tp | u10 | v10 | msl | tcwv |
|---|---|---|---|---|---|---|
| day 1 | 0.036 | 0.036 | 0.044 | 0.068 | 0.021 | 0.042 |
| day 4 | -0.009 | -0.003 | -0.004 | -0.007 | -0.103 | -0.023 |
| day 8 | -0.009 | -0.005 | -0.011 | -0.022 | -0.086 | -0.041 |

## Skill vs persistence (mean over windows)
| lead | t2m | tp | u10 | v10 | msl | tcwv |
|---|---|---|---|---|---|---|
| day 1 | 0.040 | 0.116 | 0.075 | 0.080 | 0.065 | 0.043 |
| day 4 | 0.180 | 0.210 | 0.204 | 0.214 | 0.220 | 0.152 |
| day 8 | 0.196 | 0.248 | 0.218 | 0.240 | 0.152 | 0.228 |

Day-8 spatial variance ratio (pred/true): t2m 0.97, tp 0.41, u10 0.70, v10 0.68, msl 0.86, tcwv 0.90

Local estimate (assumptions in the harness docstring; NOT the judge's score): forecast 16.59/45, anti-blur 10.00/10.

Environment: numpy 2.5.5, python 3.13.5. Re-run from a fresh clone (W2) and compare these numbers before they are quoted.
