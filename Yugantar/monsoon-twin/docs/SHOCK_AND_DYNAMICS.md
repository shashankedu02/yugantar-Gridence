# Shocks, dynamics and stability

## 1. What the judge checks (exact)
Source: `scoring.causality_checks`, `causality_points`, `null_consistent` and `make_shock` in the kit.

- **Definitions:**
  - Δ = rollout(shock) − rollout(none), over 10 steps
  - z = |Δ| / std_c, where std_c is the **domain-wide scalar** for each channel from `stats.json`
  - energy E_k(cell) = Σ_c (Δ/std_c)²
  - "near" = the shock box dilated by 3 cells (4-neighbour dilation)
  - "far at day k" = distance from the box > 3 + 8·k cells

| Check | Pass condition |
|---|---|
| non-zero | max z ≥ 1e-3 |
| localised | E_1(near) / E_1(total) ≥ 0.60 |
| propagates | mean of E_k(outside near) over days 4–8 > 1.5 × E_1(outside) **and** > 0.02 × max_k E_k(total); **and** no-teleport: E_k(far)/E_k(total) < 0.05 for every k |
| stable | max z ≤ 5 |
| null | max \|rollout(zeros) − rollout(none)\| / std_c ≤ 1e-3 |

- **Scoring:**
  - Each shock is worth 7.5 points, in quarters.
  - The localised, propagates and stable quarters only count if the response is non-zero and localised.
  - A failed null test halves the 15.
- **Shock definitions:**
  - **warm_ocean:** t2m +3 K and tcwv +15% inside lat 8–20, lon 82–94. That is 12 × 12 cells at centres 8.5–19.5 N and 82.5–93.5 E.
  - **monsoon_stall:** u10 and v10 × 0.6 inside lat 8–20, lon 65–75. That is 12 × 10 cells, touching the western domain edge.

## 2. What we measured (synthetic responses through the kit scorer) [MEASURED on synthetic fields; no model of ours was involved]
- **Setup:**
  - Δ₀ = `make_shock(...)` on a uniform field.
  - Each day: Gaussian spread σ, then a shift by (dx, dy) cells, then multiplied by an amplitude decay factor.
  - Scored with `causality_checks`.

| Response type | Localised | Propagates |
|---|---|---|
| Pure diffusion, decay ≤ 0.9/day, σ ≤ 2 | ✔ (≥ 0.98) | ✘ |
| Pure diffusion, decay 0.9/day, σ = 3 | ✔ | **borderline:** ✘ in our run (scipy `gaussian_filter`, zero padding); ✔ for warm_ocean in the independent re-implementation. Depends on the kernel and edge handling. |
| Pure diffusion, no decay, σ ≥ 2 | ✔ | ✔ (warm_ocean); monsoon_stall needed σ = 3 |
| Advection 1 cell/day, decay 0.9 | ✔ | ✔ |
| Advection 2 cells/day, decay 0.75 | ✔ | ✔ (mostly) |
| Advection 2–3 cells/day, decay 0.6 | ✔ | ✘ |
| Any of the above | no teleport | far-fraction 0.000 |

**Lessons:**
1. Locality was easy for every smooth local operator we tried **[MEASURED, synthetic]**.
2. **Propagation is the hard quarter [MEASURED, synthetic].** The response must survive (amplitude decay no faster than ~25%/day) and must move out of the 3-cell halo by days 4–8.
3. Strong relaxation toward climatology kills it. DAP, or a hard post-hoc blend toward climatology, is expected to score at most 3/4 per shock **[ESTIMATED from the synthetic runs; UNVERIFIED on real models]**.

## 3. Design rules that follow
| Rule | Reason |
|---|---|
| **R-S1** Deterministic inference (`eval()`, no dropout, no noise, CPU, fixed threads) | The null test; GPU non-determinism could break 1e-3 [EVIDENCE B27/B28 discussion; REC] |
| **R-S2** Per-step reach ≤ 9 cells along rows/columns (~12.7 diagonally; B = 4); no down-sampling, global pooling, attention, FFT | Bounded reach makes locality and no-teleport likely **[UNVERIFIED]**, but **not guaranteed**: the scorer uses straight-line distance, so a few diagonal cells are reachable beyond 11 cells on day 1. Verified by battery S1/S2 [EVIDENCE B21] |
| **R-S3** No normalisation layers that use whole-grid statistics (GroupNorm, InstanceNorm, LayerNorm over H×W, BatchNorm in train mode at inference) | A local change would shift global statistics, putting a small response everywhere on day 1 **[ESTIMATED from architecture; not measured]** |
| **R-S4** Residual (tendency) prediction with the previous state carried forward | Anomalies persist and advect rather than being overwritten by a climatology-like output; this is expected to support "propagates" **[UNVERIFIED]** |
| **R-S5** No hard climatology blend after the network; at most a linear rescale with a_k ≥ 1 | A blend with weight < 1 shrinks Δ by the same factor each lead |
| **R-S6** Clamp inputs after adding the perturbation; clamp outputs each step | Live judge shocks can push tp or tcwv negative; validity gate |
| **R-S7** Treat \|Δ\| ≤ 5 std as a test, not an assumption | Rain responses inside heavy-rain windows can be large: σ_tp = 7.55 mm/day in `stats.json`, so the limit is about 38 mm/day of difference at any cell. For t2m it is about 67 K, which is effectively loose |

## 4. Physical plausibility: what a judge will expect to see

These are physical expectations from the literature. **How our model actually responds is UNVERIFIED** until the battery and the L7 review measure it.
Sources: research report §Shocks, [B22–B26].

**warm_ocean (warm Bay of Bengal):**
- **Expected signs:**
  - lower MSL over and around the box
  - cyclonic, convergent low-level inflow
  - more tcwv and more rain in and around the box
  - in monsoon-season windows, a signal later spreading north-west toward central India, along the track of monsoon lows and depressions [B24]
- **Caveat:** convection responds strongly to SST only up to about 28 °C [B23], so the response may be weaker where the Bay is already warm.
- **Note:** the model's "t2m over ocean" is not SST, and nothing holds the anomaly fixed, so the warm anomaly decays. Say this in the brief.

**monsoon_stall (weakened Arabian Sea low-level wind):**
- **Expected signs:**
  - less moisture transport toward the west coast
  - less Western Ghats and west-coast rain within 0–3 cells east of the box on day 1
  - drying spreading east on later days
  - partial recovery of the wind afterwards, because msl, the pressure gradient, was not perturbed [B25, B26]
- **Caveat:** the box touches the western domain edge, so the replicate padding and the edge-distance channel matter here.

**Red flags** (investigate if seen):
- Day-1 response far from the box (spatial-statistics leak, rule R-S3).
- A response that is exactly zero outside the box after 8 days (no dynamics).
- Rain that rises where the moisture supply was cut, consistently across windows.
- Responses that grow every day without bound.

**Signal speeds** [B22]:
- equatorial Rossby waves ~4.5 m/s (~3.5 cells/day)
- the MJO 4–8 m/s
- convectively coupled Kelvin waves 12–15 m/s (~9–12 cells/day)
- dry gravity waves much faster

The judge's 8 cells/day cap (~10 m/s) is reasonable for daily-mean surface fields but is not a physical law. Say so if asked.

## 5. Shock test battery (run by AUD on every candidate checkpoint)
For each of at least 6 validation windows (pick from 2018–2019: an onset day, a heavy-rain day, a pre-monsoon heat day, a cyclone day if present, a winter western-disturbance day, a quiet day):

| ID | Shock | Pass |
|---|---|---|
| S1 | warm_ocean (kit definition) | All 4 checks on ≥ 5/6 windows |
| S2 | monsoon_stall (kit definition) | All 4 checks on ≥ 5/6 windows |
| S0 | zeros | null_consistent on 6/6, **bit-identical** expected |
| S3 | warm_ocean × 2 and × 0.25 | Non-zero, localised, stable; response roughly scales (sanity check of linearity for small shocks) |
| S4 | −10 hPa msl Gaussian blob (σ = 2 cells) in the Bay | Stable, physically signed wind response (cyclonic) |
| S5 | +5 K t2m over Rajasthan (land) | Stable, local, decays over days |
| S6 | tp +30 mm/day over Mumbai cells (≈ 4 σ_tp) | Valid (no negative rain) and stable |
| S7 | Shock on the domain edge (north-east corner) | No crash, no edge blow-up |
| S8 | Extreme: +15 K or −50% tcwv domain-wide; also +50 mm/day rain | Valid and finite outputs (gate). Stability (≤ 5 std) is **not** expected for these sizes. |

The battery reports a table per checkpoint (`eval/reports/shock_battery_<ckpt>.md`). The brief and the demo use S1/S2 numbers from it.

## 6. Initial-condition ensembles (dashboard only)
- **Method:**
  - N members: N = 4 by default (2 +/− pairs), up to 8. Sent **one at a time**, because the server processes calls sequentially.
  - Each perturbation is spatially smooth: Gaussian-filtered white noise with a length scale of about 3–5 cells (~500 km).
  - Scaled to a small fraction of the channel's day-1 error (fitted from validation), with tp and tcwv clipped at ≥ 0 [EVIDENCE B27, B28].
  - Every member is sent through the same `/simulate` endpoint as a perturbation, together with the user's shock.
- **Honest limitation:** initial-condition-only ensembles are under-dispersive and do not represent model error [B28]. The UI must label the spread as "sensitivity to initial conditions", not as a probability.
- **Never on the judged path:** the server stays deterministic. All randomness lives in the browser.
