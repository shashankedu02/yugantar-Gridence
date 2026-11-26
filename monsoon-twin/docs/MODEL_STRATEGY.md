# Model strategy

Citations use [B#] keys from `docs/research/BIBLIOGRAPHY.md`. The full evidence is in `docs/research/RESEARCH_REPORT.md` and the raw notes in `docs/research/notes/`. Each claim has a tag:
- **[EVIDENCE]**: reported in the literature
- **[TEST]**: measured by us with the kit code
- **[REC]**: our judgement
- **[HYPOTHESIS]**: to be measured once the data is downloaded

## 1. The problem in modelling terms
- **The data:**
  - About 6,200 daily samples on a 32 × 36 regional box with no lateral boundary information.
  - 6 surface channels, of which rain is spiky and intermittent.
- **The scoring:**
  - The forecast is scored against the *better* of persistence and climatology, so we must beat persistence early and climatology late.
  - It must stay sharp at day 8 (variance ≥ 40%).
  - It must pass a **causality** test that rewards a response that starts local and travels at a bounded speed, without decaying too fast.
- **The constraints:**
  - CPU inference, under 5 s for 10 steps.
  - Built by beginners in 24 h, on unknown training hardware.

## 2. Candidates compared

| Approach | Accuracy potential | Shock behaviour vs the scorer | CPU & training cost | 24 h risk | Verdict |
|---|---|---|---|---|---|
| **Damped anomaly persistence (DAP)**: clim + φᵏ(x₀ − clim), φ per cell | Low–moderate. Beats persistence late and climatology early [HYPOTHESIS] | Local, non-zero and stable, but **no propagation**: the anomaly only decays in place **[ESTIMATED** from synthetic decay runs, which fail "propagates" **(MEASURED on synthetic fields)**; **UNVERIFIED** on the fitted DAP] | Trivial | Very low | **Keep as the fallback and baseline** |
| Per-cell LightGBM / linear regression | Moderate at day 1 | Local, but there are no spatial interactions, so no propagation **[UNVERIFIED, reasoning]** | Low | Low | Rejected: no dynamics |
| **Local residual CNN (LocalNet)** with a bounded receptive field | Good. CNN/ResNet emulators beat persistence and climatology at coarse resolution [EVIDENCE B3, B4, B5] | Per-step reach bounded (≤ 9 cells along rows/columns, ~12.7 diagonally); locality expected **[UNVERIFIED; to be measured by the battery]**. Can carry and advect anomalies **[UNVERIFIED]**. Teleport limited by its receptive field **[ESTIMATED**, B21; not measured] | ~0.7M params, ~0.8 GMAC/step *(estimate)*; trainable on one GPU in hours, or slowly on CPU | Moderate | **Selected** |
| U-Net (2–3 down-sampling levels) | Good, maybe better | Larger receptive field: at 8×9 resolution the bottleneck sees about the whole domain in one step, so a day-1 shock leaks across the map **[ESTIMATED from architecture; not measured]** | Low | Moderate | Rejected for the judged path. Revisit only if LocalNet's skill falls short *and* the causality tests still pass. |
| ConvLSTM / PredRNN | Moderate | Recurrent state blurs; no primary evidence of an advantage for medium range | Slower, unstable training | Higher | Rejected |
| FourCastNet (AFNO/FFT), SFNO | High on global grids | FFT mixing is global and assumes periodicity/sphere; wrong for a bounded box [EVIDENCE B7, B8]; day-1 response not local **[ESTIMATED from architecture; not measured]** | Large data/compute [EVIDENCE B7] | High | Rejected |
| Pangu / Stormer / ClimaX / Swin transformers | High at scale | Global or windowed attention; data-hungry | Very high training compute [EVIDENCE B9, B43] | High | Rejected |
| GraphCast / Neural-LAM graph models | High; Neural-LAM is built for limited areas [EVIDENCE B10] | Multi-scale mesh mixes widely per step; its LAM version needs boundary forcing we don't get [EVIDENCE B10] | Complex pipeline | High | Rejected (cited as related work) |
| Diffusion / CRPS ensembles (GenCast, FGN, AIFS-CRPS) | Sharp and probabilistic | Stochastic; the null test needs determinism or a fixed seed; heavy compute [EVIDENCE B13, B14] | Very high | Very high | Rejected (future work) |

**Decision:** LocalNet is the primary model, DAP is the fallback and baseline. Rationale in `DECISION_LOG.md` D-01…D-04.

## 3. LocalNet v1 specification (starting configuration, tuned by measurement)

### 3.1 Inputs (per step, 30 channels on the 32 × 36 grid)
| Group | Channels | Transform |
|---|---|---|
| States t−2, t−1, t | 18 | (x − mean_c)/std_c. **tp uses log1p(tp)** with its own mean and std. |
| Climatology of the target day | 6 | Same transforms |
| Static | 2 | land_sea_mask (0–1); orography/std |
| Time | 2 | sin, cos of the target-day doy |
| Latitude | 1 | (lat − 22)/9 |
| Edge distance | 1 | min(distance to domain edge, 5)/5. Lets the net learn edge behaviour, since no boundary data exists [REC; boundary issue per EVIDENCE B10] |

### 3.2 Network
- **Stem:** 3×3 conv, 30 → C (C = 96).
- **Body:** B = 4 residual blocks. Each block is a per-pixel LayerNorm over channels, then conv3×3, GELU, conv3×3, plus the skip connection.
- **Head:** 1×1 conv to 6 tendencies (in tendency-std units) and 1 heavy-rain logit (auxiliary, used in training and calibration).
- **Padding:** `replicate` (non-periodic) [REC; research report, architectures section].
- **Receptive-field reach per step:** 1 + 2·B = **9 cells** along rows and columns (Chebyshev distance), which is about **12.7 cells diagonally**. The scorer measures straight-line distance and calls everything beyond 3 + 8k cells "far" (11 on day 1). So a few corner cells are theoretically reachable on day 1 and many on days 2–3.
  - The no-teleport test (< 5% of energy far away) is therefore **not guaranteed by construction**. It relies on the effective receptive field being concentrated well inside the theoretical one [EVIDENCE B21].
  - It is verified by battery S1/S2 for every candidate.
  - Do not raise B above 4.
- **Forbidden layers:** down-sampling, global pooling, GroupNorm/InstanceNorm/BatchNorm-in-train-mode, attention, FFT.
- **Size [ESTIMATED]:** about 0.7M parameters and about 0.8 GMAC per step, so about 8 GMAC for 10 steps. **Latency [UNVERIFIED]:** target ≤ 1.5 s for 10 steps on 4 cores including JSON, acceptance ≤ 2 s, measured in EXP-1's sandbox timing run [research-notes FLOP estimate of ~10–20 GFLOP for similar sizes; not measured].

### 3.3 Output and state update
- **t2m, u10, v10, msl, tcwv:** x_{t+1} = x_t + σ_Δ,c · Δ̂_c. This is residual (tendency) prediction, normalised by the tendency std [EVIDENCE B6, B9, B10: tendency prediction plus tendency normalisation help].
- **tp:** z_{t+1} = max(0, z_t + σ_Δ,tp · Δ̂_tp), where z = log1p(tp). Then tp = expm1(z) ≥ 0 by construction [EVIDENCE B7 and B3: log-transform of precipitation].
- After the update, `guards.clamp_state` is applied (no-op in normal operation).

### 3.4 Loss
- **Main loss:** latitude-weighted MSE over all 6 channels in normalised next-state space, with **equal channel weights**, because the score averages skill across channels. This deliberately differs from GraphCast's variable weights, since our scoring is different [REC].
- **Auxiliary loss:** λ · weighted BCE on the heavy-rain logit (target: tp > 10 mm/day), with `pos_weight` = negatives/positives in training. λ = 0.1 to start [EVIDENCE B15: removing class weighting collapsed heavy-rain CSI].

### 3.5 Training schedule
| Phase | What | Settings (start) | Exit criterion |
|---|---|---|---|
| P0 | Baselines: persistence, climatology, DAP, scored by `eval/harness.py` on validation | – | Reference numbers recorded in `eval/reports/` |
| P1 | 1-step pre-training | AdamW lr 1e-3, wd 1e-4, cosine, batch 32, up to ~40 epochs, early stopping on validation day-1 skill | Validation day-1 skill > DAP's |
| P2 | Rollout fine-tuning, 2 then 4 steps, back-propagating through the rollout | lr 1e-4, a few epochs each; loss averaged over steps | Validation mean skill (days 1/4/8) improves, and **causality battery still passes** |
| P3 | Calibration on validation (outputs only) | `calibrate.py` | CSI ↑ and blur ratio ≥ 0.4 without a skill drop beyond tolerance |
| ~~P4~~ | *Dropped (D-17):* retraining on all years would make the validation-fitted calibration and the battery results invalid for the shipped weights | – | – |

- **Rollout fine-tuning:** done at a 10–100× lower learning rate with short horizons (Neural-LAM found 4 steps enough) [EVIDENCE B6, B10].
- **The cost of longer horizons:** more blur and a drift toward climatology [EVIDENCE B4, B11]. That is why we stop at 4 steps and monitor variance.

### 3.6 Selection metric (one number per checkpoint)

This section picks checkpoints *within* one model. Choosing *between* DAP, LocalNet-64 and LocalNet-96 follows EXP-1 (§3.7), which adds the latency gate.
`eval/harness.py` computes the **local Stage-1 estimate**: RMSE points + CSI points + blur points + causality points, using the kit's own scoring functions on validation windows. We pick the checkpoint with the highest estimate **subject to the hard gates**:
1. all outputs valid
2. day-4 skill against persistence > 0
3. null shock identical
4. both shocks non-zero and localised

### 3.7 EXP-1: DAP vs LocalNet-64 vs LocalNet-96 (controlled comparison)
- **Purpose:** choose the shipped model by measurement, not by expectation.
- **Candidates:**

| Name | Definition |
|---|---|
| DAP | §5, as fitted at H3–5.5 (or DAP-LW if F0 replaced it) |
| LocalNet-64 | B = 4, C = 64. Same receptive field as -96; only the width differs. |
| LocalNet-96 | B = 4, C = 96 (the default in §3.2) |

- **Held identical across candidates:**
  - **Windows:** one frozen list `eval/windows_val.json`, committed by AUD at H3 before any model is scored. It holds 40 random 2018–2019 start days, the 5 regime windows and the 6 battery windows. Never changed after the first result.
  - **Data:** split (train 2005–2017), normalisation stats, climatology table, and input channels.
  - **Training (LocalNet only):** same recipe, seed, epoch budget and early-stopping rule. If time forces a cut, both get the same wall-clock budget. Phase P1 is compared at H10; phase P2 only for the H10 winner.
  - **Scoring:** same `eval/harness.py` and `eval/shock_battery.py` commit (hash recorded), same references (persistence and the kit's climatology), **raw outputs** (no calibration), so post-processing can't favour one candidate.
  - **Latency:** same `eval/timing.py` run in the L5 sandbox: 8 back-to-back 10-step calls, first call included.
- **Reported per candidate** (`eval/reports/EXP-1.md`, one table):
  - skill vs persistence / climatology / best per lead (1, 4, 8) and channel
  - CSI skill per lead
  - day-8 variance ratio per channel
  - causality checks per shock and window (near-fraction, propagates, far-fraction, max |Δ|/std), null identity
  - local Stage-1 estimate
  - parameters
  - measured p50 and max latency
- **Decision rule:**
  1. Discard any candidate that fails a hard gate: validity 100%, mean day-4 skill vs persistence > 0, null identical, both shocks non-zero and localised on ≥ 5/6 windows, max latency ≤ 2 s.
  2. Highest local Stage-1 estimate wins.
  3. If the top two are within 1.0 point, take the smaller one (DAP < LocalNet-64 < LocalNet-96).
- **No GPU (F2):** run LocalNet-64 only, record "LocalNet-96 not run (compute)", and compare it with DAP.
- **Status:** no result exists yet; every number in `EXP-1.md` must come from running the harness.

## 4. Post-processing (calibration), applied to outputs only
0. **Drizzle floor** (for the dry-window trap, EVALUATION_STRATEGY §4): set tp below a small threshold, fitted on validation, to 0.
1. **tp heavy-rain calibration** [EVIDENCE B15, B16; REC]:
   - Per lead k, a monotone quantile mapping (or a single multiplicative factor) fitted on validation.
   - It maximises CSI skill at 10 mm/day, subject to tp RMSE skill not dropping by more than 0.02.
2. **Variance restoration** (only for channels with a day-8 ratio below 0.45 on validation):
   - x' = clim + a_k·(x − clim), with a_k ≤ 1.5, fitted so the validation ratio is about 0.6–0.8.
   - Accepted only if the validation skill change is ≥ 0 [EVIDENCE B11, B12; derivation in the research report §Blur].
   - **Never applied to tp values below climatology** (a rescale there could create negative rain). The engine clamps every output after post-processing anyway (`SYSTEM_ARCHITECTURE.md` §5).
3. **Shock effects:** both maps are deterministic, so the null shock is unaffected. The linear rescale multiplies shock responses by a_k. If a_1 > a_4…a_8, the days-4–8 to day-1 outside-energy ratio falls, and every a_k > 1 raises the 5-std risk **[ESTIMATED, arithmetic]**. **Re-run the causality battery** after calibrating, to check propagation and the stability limit (≤ 5 std).

## 5. DAP fallback specification
- **Model:** x̂_k = clim(d0+k) + φ^k ⊙ (x_0 − clim(d0)), where φ ∈ [0, 0.99] per channel and cell.
- **Fitting:** least squares on lag-1 anomalies over 2005–2017, implemented as a small class with a `.fit(...)` method that `training/fit_dap.py` calls. The kit scanner recognises `.fit(` as a training pipeline, so the safe submission can score 15/15 before LocalNet's trainer exists. For tp, clamp to ≥ 0.
- **Expected behaviour:**
  - Should beat persistence at day 4 **[UNVERIFIED, measured at G-DAP, H5.5]**.
  - Should pass the gate's shock condition, since its response should be non-zero and localised **[ESTIMATED** from synthetic in-place decay, MEASURED on synthetic fields; **UNVERIFIED** on the fitted DAP].
  - Expected to fail propagation, so at most 11.25/15 causality points **[ESTIMATED]**.
- **Use:** becomes the safe submission at H5.5 **only if it passes the conditional checkpoint G-DAP** (24 h plan); otherwise fallback F0 (lead-wise damping, then LocalNet as the only route). Kept inside the final engine as the per-step NaN fallback in either case.

## 6. Generalisation risks and counter-measures
| Risk | Counter-measure |
|---|---|
| Hidden windows from 2023–24 come from a different regridding path (ARCO 0.25° box mean, not WB2 conservative) [OFFICIAL build_dataset.py] | Inputs are normalised by training statistics. Check the robustness of the engine to ±small bias. The kit states the two paths are consistent; we cannot verify that without the hidden data. |
| Extreme regimes (cyclone, heatwave) are rare in training | Check per-regime validation windows (`TESTING_AND_VALIDATION.md` §3). Guards. Equal channel weighting. |
| Overfitting (~4,700 training days) | Small model, weight decay, early stopping on validation, test years untouched |
| Edge degradation (no boundary data) | Edge-distance channel, replicate padding, climatology input; per-cell skill map in the harness [EVIDENCE B10 shows edge/centre error structure] |
| Warming trend 2005 → 2024 | Residual updates start from the actual recent state, not from climatology; doy-aware input. The input climatology stays on the training years, for consistency with validation. Report it as a limitation. |

## 7. What must be measured before any claim
Measure these first; none of them are known yet:
- persistence / climatology / DAP skill and CSI on validation
- the day-8 variance ratio for each channel
- the causality checks on validation windows
- CPU latency
- the size of the weights

They go into `eval/reports/` and `weights/MANIFEST.md`, and only from there into the brief.
