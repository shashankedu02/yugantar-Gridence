# LocalNet vs DAP baseline vs persistence (frozen validation windows)

checkpoint `7014c08477c2e9a6db4554280f6af5d8c07e7dc568faf494cfbcc5580caeedc9`
climatology `e16bb7d65189c3d45007d0c033b7d16cd36fafc9db8cc23f248e2b63617415fd` | train years [2005, 2015] | windows file `eac6e6defa4a`

## Forecast (local estimate, NOT the judge's score)
| measure | localnet_c64 | dap_2005_2015 | persistence | shipped_dap_2005_2017 |
|---|---|---|---|---|
| rmse_of_30 | 29.52 | 16.44 | 0.00 | 16.59 |
| csi_of_15 | 0.76 | 0.00 | 0.00 | 0.00 |
| anti_blur_of_10 | 9.45 | 10.00 | 10.00 | 10.00 |
| causality_of_15 | 13.44 | 11.25 | 11.25 | 11.25 |
| total_of_70 | 53.17 | 37.69 | 21.25 | 37.84 |
| mean RMSE skill vs best ref | +0.1181 | +0.0657 | -0.1781 | +0.0664 |
| mean CSI skill (pooled leads) | +0.0051 | -0.0055 | -0.0585 | -0.0071 |
| mean day-4 skill vs persistence | +0.2491 | +0.1961 | +0.0000 | +0.1966 |
| CSI day 1 | 0.344 | 0.297 | 0.315 | 0.297 |
| CSI day 4 | 0.197 | 0.178 | 0.169 | 0.172 |
| CSI day 8 | 0.154 | 0.215 | 0.143 | 0.220 |
| validity_100pct | PASS | PASS | PASS | PASS |
| null_bit_identical | PASS | PASS | PASS | PASS |
| deterministic | PASS | PASS | PASS | PASS |

## Skill vs best reference
| model, lead | t2m | tp | u10 | v10 | msl | tcwv |
|---|---|---|---|---|---|---|
| localnet_c64, day 1 | +0.290 | +0.250 | +0.246 | +0.273 | +0.257 | +0.338 |
| localnet_c64, day 4 | +0.056 | +0.078 | +0.034 | +0.044 | -0.034 | +0.120 |
| localnet_c64, day 8 | -0.058 | -0.019 | -0.042 | -0.038 | -0.124 | -0.060 |
| dap_2005_2015, day 1 | +0.035 | +0.033 | +0.045 | +0.068 | +0.018 | +0.042 |
| dap_2005_2015, day 4 | -0.010 | -0.004 | -0.000 | -0.006 | -0.107 | -0.025 |
| dap_2005_2015, day 8 | -0.009 | -0.011 | -0.009 | -0.024 | -0.088 | -0.045 |
| persistence, day 1 | -0.004 | -0.112 | -0.036 | -0.014 | -0.053 | -0.001 |
| persistence, day 4 | -0.269 | -0.362 | -0.300 | -0.335 | -0.530 | -0.238 |
| persistence, day 8 | -0.333 | -0.452 | -0.360 | -0.436 | -0.411 | -0.407 |
| shipped_dap_2005_2017, day 1 | +0.036 | +0.036 | +0.044 | +0.068 | +0.021 | +0.042 |
| shipped_dap_2005_2017, day 4 | -0.009 | -0.003 | -0.004 | -0.007 | -0.103 | -0.023 |
| shipped_dap_2005_2017, day 8 | -0.009 | -0.005 | -0.011 | -0.022 | -0.086 | -0.041 |

## Skill vs persistence
| model, lead | t2m | tp | u10 | v10 | msl | tcwv |
|---|---|---|---|---|---|---|
| localnet_c64, day 1 | +0.293 | +0.308 | +0.271 | +0.281 | +0.289 | +0.338 |
| localnet_c64, day 4 | +0.221 | +0.265 | +0.235 | +0.249 | +0.255 | +0.270 |
| localnet_c64, day 8 | +0.157 | +0.236 | +0.200 | +0.223 | +0.125 | +0.207 |
| dap_2005_2015, day 1 | +0.038 | +0.115 | +0.076 | +0.080 | +0.061 | +0.043 |
| dap_2005_2015, day 4 | +0.179 | +0.210 | +0.207 | +0.215 | +0.214 | +0.151 |
| dap_2005_2015, day 8 | +0.196 | +0.243 | +0.220 | +0.239 | +0.151 | +0.224 |
| persistence, day 1 | +0.000 | +0.000 | +0.000 | +0.000 | +0.000 | +0.000 |
| persistence, day 4 | +0.000 | +0.000 | +0.000 | +0.000 | +0.000 | +0.000 |
| persistence, day 8 | +0.000 | +0.000 | +0.000 | +0.000 | +0.000 | +0.000 |
| shipped_dap_2005_2017, day 1 | +0.040 | +0.116 | +0.075 | +0.080 | +0.065 | +0.043 |
| shipped_dap_2005_2017, day 4 | +0.180 | +0.210 | +0.204 | +0.214 | +0.220 | +0.152 |
| shipped_dap_2005_2017, day 8 | +0.196 | +0.248 | +0.218 | +0.240 | +0.152 | +0.228 |

## Day-8 spatial variance ratio
| model | t2m | tp | u10 | v10 | msl | tcwv |
|---|---|---|---|---|---|---|
| localnet_c64 | 0.99 | 0.27 | 0.75 | 0.77 | 0.96 | 0.94 |
| dap_2005_2015 | 0.98 | 0.42 | 0.69 | 0.67 | 0.86 | 0.90 |
| persistence | 0.98 | 1.60 | 1.10 | 1.24 | 1.02 | 1.01 |
| shipped_dap_2005_2017 | 0.97 | 0.41 | 0.70 | 0.68 | 0.86 | 0.90 |

## Shock battery (cases passing, warm_ocean / monsoon_stall, of 6 windows each)
| measure | localnet_c64 | dap_2005_2015 | persistence | shipped_dap_2005_2017 |
|---|---|---|---|---|
| non-zero | 6 / 6 | 6 / 6 | 6 / 6 | 6 / 6 |
| localisation | 6 / 6 | 6 / 6 | 6 / 6 | 6 / 6 |
| propagation | 6 / 2 | 0 / 0 | 0 / 0 | 0 / 0 |
| no teleport | 6 / 6 | 6 / 6 | 6 / 6 | 6 / 6 |
| stability | 5 / 6 | 6 / 6 | 6 / 6 | 6 / 6 |
| null identical | PASS | PASS | PASS | PASS |
| day-1 near fraction (min-max) | 0.94-1.00 | 1.00-1.00 | 1.00-1.00 | 1.00-1.00 |
| far fraction (max) | 0.000 | 0.000 | 0.000 | 0.000 |
| causality points of 15 | 13.44 | 11.25 | 11.25 | 11.25 |

## Paired comparison (RMSE skill per window)
- localnet_c64 - dap_2005_2015: mean difference +0.0523, better on 39/46 windows, bootstrap 95% [+0.0375, +0.0676]
- localnet_c64 - persistence: mean difference +0.2962, better on 46/46 windows, bootstrap 95% [+0.2591, +0.3356]
- localnet_c64 - shipped_dap_2005_2017: mean difference +0.0517, better on 39/46 windows, bootstrap 95% [+0.0365, +0.0678]

LocalNet forecast calls checked: 228, DAP fallbacks: 0 (any fallback rejects the run).
Latency, in-process, 10 steps: localnet_c64 median 41 ms / max 49 ms, dap_2005_2015 median 1 ms / max 1 ms, shipped_dap_2005_2017 median 1 ms / max 1 ms

Single evaluation by W1. Not validated: W2 has not re-run it.
