# Evaluation strategy

This document explains how each point is earned and how we aim at it. Rule text is in `COMPETITION_REQUIREMENTS.md`. The tests that check each item are in `TESTING_AND_VALIDATION.md`.

Each claim has a tag:
- **[CODE]**: read from the kit scoring code
- **[TEST]**: we ran the kit code
- **[REC]**: our recommendation
- **[UNVERIFIED]**: needs confirmation

---

## 1. Priorities, in order
1. **Pass the gate.** That means valid outputs on 8/8 requests, beating persistence at day 4, and a non-zero localised response to at least one shock. Failing it means no ranking at all, so we test the fallback model (DAP, see `MODEL_STRATEGY.md`) against it at the conditional checkpoint G-DAP (H5.5). DAP is a safe submission only if it passes. If it does not beat persistence at day 4, fallback F0 applies (24 h plan). That DAP passes is **unverified** until measured.
2. **Cheap points first.**
   - Repo 15 is fully in our control.
   - The null shock protects half of the 15 causality points.
   - Anti-blur 10 is likely already earned on t2m, msl and tcwv because the score uses the total field [REC, see §4].
3. **Then the harder points:** RMSE skill 30 and CSI 15. These come from model quality, multi-step training and calibration.
4. **Brief 15.** Numbers and figures collected H14–17, written up on PC-A from H18, finished H20–22, from measured numbers only.

## 2. Score budget (targets, not predictions)

| Part | Max | Realistic target | Why |
|---|---|---|---|
| RMSE skill | 30 | 15–30 | Full marks need a mean skill of 0.12 against the better reference. Day 8 against climatology is hard; day 1 against persistence is easier [REC]. |
| CSI | 15 | 5–15 | Needs heavy-rain calibration (see §5) |
| Anti-blur | 10 | 7–10 | tp, u10 and v10 are the risk channels |
| Causality | 15 | 11.25–15 | DAP is expected to score 11.25: non-zero, localised and stable, but no propagation. **[ESTIMATED** from synthetic in-place-decay tests; **UNVERIFIED** on the fitted DAP]. A CNN may add propagation **[UNVERIFIED]**. |
| Repo | 15 | 15 | Rules in CLAUDE.md, checked with the kit scanner |
| Brief | 15 | 10–15 | Written from measured results |

These are planning targets. No score has been measured yet, because the data is not downloaded.

## 3. Forecast skill (45)

**Mechanics [CODE: scoring.py]**
- RMSE is latitude-weighted with weights cos(lat) normalised to mean 1, per channel.
- Skill per channel = 1 − RMSE / min(RMSE_persistence, RMSE_climatology).
- The leads are days 1, 4 and 8, which are rollout indices 0, 3 and 7.
- Points: 30·clip(mean_ss/0.12, 0, 1) and 15·clip(mean_csi_skill/0.10, 0, 1).
- **[UNVERIFIED]** how `ss_by_window` is built. The orchestration code is not in the kit. It is probably the mean over channels and leads for each window, then the mean over windows. Our local harness computes that and also every lead and channel separately, so we are covered either way.

**Implications [REC]**
- **Which reference matters when:**
  - At day 1, persistence is usually the stronger reference for t2m, msl and tcwv.
  - For tp, climatology may beat persistence even at day 1, since rain is intermittent.
  - At day 8, climatology is the stronger reference for every channel.
  - So the model must be sharp early and stay near climatology late, without blurring (see §4).
- **Climatology as an input:** give the network the climatology for the target day. The same table also serves as the DAP fallback. A 366-day table is allowed: the archive check only fires above 400 days [TEST].
- **Our climatology must mirror the judge's:** the kit's recipe is a per-calendar-day mean with a 15-day circular running mean, over the 366 slots [CODE: stats.py].
  - B1 re-implements it in `training/climatology.py`, on the **training years (2005–2017)**. The table becomes a model input and ships with the weights unchanged. Swapping in an all-years table later would change the inputs of a model that was already validated.
  - AUD's harness uses the kit's own function as the reference (D-20).
  - Do **not** import the kit's `stats.py` into inference: it is not available offline, and its `date(2000, …)` call is a warn flag [TEST].
- **Day of year:** recover it from `doy_sincos` with atan2. **[UNVERIFIED]** whether the judge's doy is 0- or 1-based. With a 15-day-smoothed climatology a one-day offset costs almost nothing.
- **Weight all 6 channels equally** in the loss after normalisation, because the score averages skill over channels.

## 4. Anti-blur (10)
- **Mechanics [CODE]:**
  - ratio = var_space(pred day 8) / var_space(true day 8), per channel, on the **total field**
  - averaged over the windows, then credit = clip(ratio/0.4, 0, 1), set to 0 above 2.5
- **Implication:** t2m, msl and tcwv carry a large fixed north–south gradient that climatology alone keeps. tp, u10 and v10 are much more weather-driven, and are where an MSE model's smoothing shows. We will measure the ratio for each channel on validation; until then it is unmeasured.
- **Plan [REC], from the blur research notes:**
  1. Log the per-channel variance ratio at days 1, 4 and 8 every epoch.
  2. If tp, u10 or v10 sits below 0.4 at day 8, apply a **per-channel, per-lead anomaly rescaling** fitted on validation, aiming at a ratio of 0.6–0.8, not 1.0.
  3. Accept it only if the validation skill change is not negative.
  - **Dry-window trap:** the ratio is averaged over windows *before* the 2.5 cut-off. In a nearly dry window (heatwave, winter) the true tp variance is tiny, so even light model drizzle gives a huge ratio and can push the average above 2.5, which zeroes the tp channel. Mitigation: a drizzle floor (set tp below a small threshold, fitted on validation, to 0) and the dry regime windows in the harness.
  - Full variance restoration raises RMSE. Inflating an imperfect forecast to full variance ties climatology at a correlation of about 0.5 (derivation in the research report).

## 5. Heavy-rain CSI (15)
- **Mechanics:** hits, misses and false alarms of tp > 10 mm/day, pooled per lead (as we assume). Skill is measured against the better of persistence and climatology.
- **Why plain MSE fails:** MSE on rain under-predicts the peaks, so a smooth forecast rarely crosses 10 mm/day. Climatology crosses it only where the long-term mean is above 10, i.e. in the core monsoon areas.
- **Plan [REC]:**
  1. Predict tp in log1p space with non-negative output.
  2. Add an auxiliary heavy-rain head (weighted BCE for > 10 mm/day). The research notes cite a large CSI loss when class weighting is removed.
  3. **Calibrate on validation:** per lead, apply quantile mapping or a multiplicative factor to tp, chosen to maximise CSI skill, subject to tp RMSE skill not getting worse by more than a set margin.
  4. Persistence and climatology CSI at 10 mm/day over India could not be found in the literature. We compute them ourselves on validation as the first experiment.

## 6. Shock causality (15)

**Mechanics:** see `COMPETITION_REQUIREMENTS.md` §5.2. The std used is the per-channel domain-wide scalar from `stats.json` [CODE: `std[None,:,None,None]`].

**What we tested [MEASURED on synthetic fields, not on any model of ours]:** synthetic responses scored with the kit's `causality_checks` on both boxes. Script and output are in `SOURCE_AUDIT.md` §4.
- Every smooth response we tried passed **localised** (day-1 near fraction ≥ 0.98) and **no-teleport**.
- **Propagates failed** whenever the response amplitude decayed faster than about 25% per day, even when it advected 1–3 cells/day.
  - Pure diffusion with no advection passed only with no decay and a spread of ≥ 2 cells/day.
  - Advection at about 2 cells/day passed with an amplitude decay of 0.75/day or slower.
- **Consequence for design:**
  - A model that pulls anomalies hard toward climatology (DAP, or a hard climatology blend applied after the network) is expected to **fail propagation** **[ESTIMATED** from the synthetic results; **UNVERIFIED** on real models].
  - The dynamical core must carry and move the anomaly. Relaxation toward climatology must be learned and moderate, not a strong post-hoc blend. This becomes a hard acceptance test for every candidate model (T-CAU-3).

**Design rules [REC]**, detail in `SHOCK_AND_DYNAMICS.md`:
1. Deterministic inference: `model.eval()`, no dropout, no random noise, CPU only, fixed thread count. Adding a zeros array is exactly the identity in float32, so the null test passes.
2. A bounded per-step receptive field. No downsampling or upsampling, no global pooling, no FFT or attention layers, and **no normalisation that uses statistics over the whole spatial grid** (GroupNorm, InstanceNorm, LayerNorm over H×W). Per-pixel normalisation, or none, is expected to keep day 1 local **[UNVERIFIED]**.
3. Clamp physical ranges after each step, as a guardrail only.
4. Keep the amplitude under 5 std. Watch rain responses inside a heavy-rain window.

## 7. Repository check (15)
Measured with the kit scanner on mock repos [TEST]:

| Situation | Score |
|---|---|
| Clean layout | **15/15** |
| `weatherbench2` mentioned in a comment of an inference module | **7** (critical) |
| Dashboard written in Python with `plotly` and a `/simulate` call | 13 |
| A comment in serve.py mentioning `plotly` | 13 |
| An eval script containing `/simulate` that imports training code with 3 dates | 10. Training was hidden and dates were flagged. |
| A `.nc` file in the repo | 13 |
| A (401, 6, 32, 36) `.npy` cache | 7 |
| Weights only as `.npy` | 6.5 (no checkpoint) |
| `datetime.date(2000, 1, 1)` in an inference module | 13 |
| A (3, 6, 32, 36) demo case, or a (366, 6, 32, 36) climatology | 15, fine |

These are turned into hard rules in `CLAUDE.md` §4. Always scan a **clean git export**: the scanner ignores `.gitignore`, so a local `data/*.nc` or cache would be flagged.

## 8. Brief (15)
A person reads it. Structure (page 1 design, drift/blur and failure modes; page 2 visualization and impact) and a template are in `docs/brief/BRIEF_TEMPLATE.md`. Every number must come from `eval/` output.

## 9. Desk review (Top 10 → Top 2)
- Judges apply a new shock live, so the engine must handle **any** delta field: any channel, sign, size and place.
- Inputs are clamped to physical ranges after adding the perturbation.
- We pre-test a battery of shocks (`TESTING_AND_VALIDATION.md` §5).
- Explanation and questions: `DEMO_AND_JUDGING.md`.
