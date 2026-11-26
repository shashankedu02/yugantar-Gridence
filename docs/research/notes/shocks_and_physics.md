# Shocks and physics: how ML weather models respond to localized perturbations, and the physics of the warm_ocean and monsoon_stall shocks

Context: small autoregressive CNN emulator (32 x 36 grid, 1 deg, India, daily steps; channels t2m, tp, u10, v10, msl, tcwv), scored on perturbation causality: non-zero response; day-1 locality (>=60% energy within 3 cells of box); days 4-8 growth outside the neighbourhood (>1.5x day-1 and >2% of peak); no teleportation (<5% energy beyond 3 + 8*day cells); |delta| <= 5 std; zero perturbation reproduces control within 1e-3 std.

Grid conversion used throughout (own arithmetic): 1 deg latitude ~ 111 km; at 8-20N, 1 deg longitude ~ 104-110 km. So 1 cell/day ~ 111 km/day ~ 1.29 m/s, and 8 cells/day ~ 890 km/day ~ 10.3 m/s.

## Q1. What have localized-perturbation and dynamical tests of ML weather models found (locality, propagation speed, balance, spurious remote responses)?

### Takeaway
Published tests (mostly on Pangu-Weather) find that localized perturbations produce physically recognisable, mostly local-then-propagating responses: Matsuno-Gill response to tropical heating, geostrophic adjustment in ~6 h, tropical gravity-wave signals at ~20 m/s, and threshold-dependent hurricane growth. Known weaknesses are excessive smoothing (no small-scale "butterfly" growth), single-step "shocks" at time-step boundaries, and responses that depend weakly on perturbation amplitude. None of the papers I could access quantified day-1 "teleportation" explicitly.

### Cited Findings
**Hakim & Masanam (Pangu-Weather), "Dynamical Tests of a Deep-Learning Weather Prediction Model"** (arXiv 2309.10867; the brief names the venue as AI for Earth Systems 2024, but I could not confirm the DOI) — [arXiv abstract](https://arxiv.org/abs/2309.10867); [ar5iv full text](https://ar5iv.labs.arxiv.org/html/2309.10867); [AMS 2024 abstract](https://ams.confex.com/ams/104ANNUAL/webprogram/Paper438827.html)
- Four classical experiments add localized perturbations to time-mean background states. The abstract says they "assess the propagation speed and structural evolution of signals away from the local source." — [arXiv](https://arxiv.org/abs/2309.10867)
- Steady tropical heating (0.1 K/day, 1000-200 hPa, Gaspari-Cohn localized in longitude with L = 10,000 km at 120E, cos(6 phi) within 15 deg of the Equator, on a DJF mean state) "results in a classical Matsuno-Gill response near the heating", with planetary waves radiating poleward. — [arXiv](https://arxiv.org/abs/2309.10867); [ar5iv](https://ar5iv.labs.arxiv.org/html/2309.10867)
- The heating response grows slowly. There is a "small 500 hPa height increase over the heating region after 5 days", the wave train grows over days 5-20, and the "maximum anomalies [are] over 100m at day 20". The response is described as "nearly stationary". — [ar5iv](https://ar5iv.labs.arxiv.org/html/2309.10867)
- Equatorial adjustment: signals propagate in both directions "at around 20 m s-1 ... typical of tropical gravity waves", with a weaker signal at the speed of sound. — [ar5iv](https://ar5iv.labs.arxiv.org/html/2309.10867)
- Extratropical cyclone (a 500 hPa trough at 40N, 150E, localized with L = 2,000 km "to insure a spatially localized disturbance") produces realistic cyclones and fronts. The baroclinic wave packet travels downstream at the group velocity, "faster than the phase of individual troughs", and reaches Europe by about day 10. — [ar5iv](https://ar5iv.labs.arxiv.org/html/2309.10867)
- Geostrophic adjustment: perturbing only 500 hPa height (no wind or temperature anomaly, so an unbalanced state) "yields adjustment from a state of rest to one of wind-pressure balance over ~6 hours". Wind reaches ~5 m/s at 1 h and peaks near 10 m/s at 3 h; at 6 h the flow is nearly parallel to the height contours. — [arXiv](https://arxiv.org/abs/2309.10867); [ar5iv](https://ar5iv.labs.arxiv.org/html/2309.10867)
- Hurricanes (MSLP pattern regressed at 15N, 40W, localized with L = 1,000 km) develop only if "the initial amplitude exceeds about 5 hPa". With initial humidity set to zero, no hurricane develops. This shows the response is nonlinear and moisture-dependent. — [arXiv](https://arxiv.org/abs/2309.10867)
- Artifacts: the authors found "abrupt differences in the time tendency at intervals of 3, 6, and 24 hours" (single-step "shocks" caused by Pangu's separate 1/3/6/24 h models). These "do not appear to adversely affect the solution at subsequent times". — [ar5iv](https://ar5iv.labs.arxiv.org/html/2309.10867)
- Limitations the authors state: there is no identical experiment in a physics-based model to compare against, the experiments were "subjectively chosen", and "Pangu-weather doesn't explicitly model condensational heating". The Southern Hemisphere heating response was "notably weaker", and summer cyclone development was "much weaker". — [ar5iv](https://ar5iv.labs.arxiv.org/html/2309.10867)
- The authors conclude "the model encodes realistic physics in all experiments" and suggest it can be used "as a tool for rapidly testing ideas". — [arXiv](https://arxiv.org/abs/2309.10867)

**Selz & Craig 2023, "Can Artificial Intelligence-Based Weather Prediction Models Simulate the Butterfly Effect?"** GRL 50, e2023GL105747, https://doi.org/10.1029/2023GL105747 — [PDF](https://epub.ub.uni-muenchen.de/110134/1/Geophysical_Research_Letters_-_2023_-_Selz_-_Can_Artificial_Intelligence%E2%80%90Based_Weather_Prediction_Models_Simulate_the__1_.pdf)
- The study compares Pangu with the physics model ICON, using ECMWF EDA perturbations at 100% amplitude and scaled down to 0.1%. Note that these are global, not localized, perturbations. — [PDF](https://epub.ub.uni-muenchen.de/110134/1/Geophysical_Research_Letters_-_2023_-_Selz_-_Can_Artificial_Intelligence%E2%80%90Based_Weather_Prediction_Models_Simulate_the__1_.pdf)
- At realistic (100%) amplitude, Pangu's growth rate (~2.2/day) is similar to ICON's (~1.7/day), and growth at scales larger than ~1,000 km looks realistic. At 0.1%, Pangu "completely fails to reproduce the rapid initial growth rates": its DKE grows only ~3.1x over 72 h, while ICON's is about 5 orders of magnitude higher. — [PDF](https://epub.ub.uni-muenchen.de/110134/1/Geophysical_Research_Letters_-_2023_-_Selz_-_Can_Artificial_Intelligence%E2%80%90Based_Weather_Prediction_Models_Simulate_the__1_.pdf)
- Pangu's effective resolution is ~500 km (~20 dx), against ~200 km for ICON-LR. Small scales are smoothed away in the first 24 h. — [PDF](https://epub.ub.uni-muenchen.de/110134/1/Geophysical_Research_Letters_-_2023_-_Selz_-_Can_Artificial_Intelligence%E2%80%90Based_Weather_Prediction_Models_Simulate_the__1_.pdf)
- Pangu's 100% and 0.1% runs give nearly identical difference-energy patterns (spatial correlation 0.74). The pattern of spread is therefore set by the model and flow rather than by the perturbation size. — [PDF](https://epub.ub.uni-muenchen.de/110134/1/Geophysical_Research_Letters_-_2023_-_Selz_-_Can_Artificial_Intelligence%E2%80%90Based_Weather_Prediction_Models_Simulate_the__1_.pdf)
- The authors suggest the deficit may matter more "in extreme situations and in the tropics". — [PDF](https://epub.ub.uni-muenchen.de/110134/1/Geophysical_Research_Letters_-_2023_-_Selz_-_Can_Artificial_Intelligence%E2%80%90Based_Weather_Prediction_Models_Simulate_the__1_.pdf)

**Bonavita, "On some limitations of current Machine Learning weather prediction models"** (arXiv 2309.08473; I could not confirm the venue or DOI from the page I fetched) — [arXiv](https://arxiv.org/abs/2309.08473v2)
- Pangu-Weather forecasts "do not have the fidelity and physical consistency of physics-based models". Their higher deterministic scores "can be at least partly attributed to these peculiarities", meaning smoothing and an imbalance between skill and physical consistency. — [arXiv](https://arxiv.org/abs/2309.08473v2)

**Baño-Medina et al. 2025, "Are AI weather models learning atmospheric physics? A sensitivity analysis of cyclone Xynthia"**, npj Climate and Atmospheric Science 8, 92, DOI 10.1038/s41612-025-00949-6 — [CW3E notice](https://cw3e.ucsd.edu/cw3e-publication-notice-are-ai-weather-models-learning-atmospheric-physics-a-sensitivity-analysis-of-cyclone-xynthia/)
- The study takes gradients by backpropagation of 36-h kinetic energy with respect to initial conditions in an AI global model and compares them with adjoint-model sensitivities. The AI sensitivities "exhibit spatio-temporal patterns that are consistent with those from physics-based models". When perturbations are scaled by initial-condition uncertainty, "the AI-derived response closely resembles that of the physics-based model". — [CW3E](https://cw3e.ucsd.edu/cw3e-publication-notice-are-ai-weather-models-learning-atmospheric-physics-a-sensitivity-analysis-of-cyclone-xynthia/)

**Related, non-weather:** Gao et al. (arXiv 2510.02683) use effective-receptive-field / Dirac-delta perturbation analysis on PDE neural operators. They report that "spatial domain models (e.g. CNO and GT-former) effectively learn the spatial dependencies, whereas functional domain models (e.g. DeepONet and T1) struggle", and that adding local 3x3 convolutions to FNO cut wave-equation error from 2.77 to 2.08. — [arXiv](https://arxiv.org/html/2510.02683v1)

### Inferences
- The experiments above follow the same pattern as the competition scorer: add a localized anomaly to a background state, difference against the control, and watch where and how fast the signal goes. Teams can cite Hakim & Masanam as precedent and present their shock tests the same way ("Matsuno-Gill-like", "adjustment within one step").
- Selz & Craig imply that a smooth ML emulator will damp small or very local perturbations. For the "non-zero" and "days 4-8 growth" criteria, the bigger risk for a CNN is a response that fades out, not one that blows up. A 3 K / 15% shock over a ~12 x 12 cell box is large and broad, so it should survive. Smaller live shocks (single cells, <1 std) may be smoothed to almost nothing.
- Since no paper reports explicit day-1 remote-response statistics, the scorer's "teleportation" test goes beyond what the literature quantifies. A team that reports energy-vs-distance curves would be doing something novel.

### Gaps
- I could not access the final AIES version of Hakim & Masanam, so I have no DOI and no figure-level far-field diagnostics. They report no day-1 global-response statistic.
- I could not open Bonavita's full text (venue, spectra, balance diagnostics).
- I found no study that runs localized-perturbation tests on a regional (limited-area) CNN emulator, or on India or the monsoon specifically.

## Q2. Receptive field (RF) and effective receptive field (ERF): how they bound propagation in autoregressive rollouts, and why spectral/global models can respond non-locally

### Takeaway
A CNN's output at a cell can depend only on inputs within its theoretical RF. In practice the dependence is Gaussian-shaped and much narrower than the theoretical RF (Luo et al. 2016). In a rollout, signals therefore travel at most R cells per step, where R is the per-step RF radius. Spectral (FFT/AFNO/SFNO) and global-attention layers have, by construction, a whole-domain RF in one step, so a local shock can change distant cells on day 1.

### Cited Findings
- Luo, Li, Urtasun & Zemel (NeurIPS 2016), "Understanding the Effective Receptive Field in Deep Convolutional Neural Networks": the ERF "has a Gaussian distribution" and "only occupies a fraction of the full theoretical receptive field". The paper analyses the effects of nonlinear activations, dropout, sub-sampling and skip connections, and suggests ways to counter the ERF being too small. — [arXiv 1701.04128](https://arxiv.org/abs/1701.04128); [NeurIPS proceedings](https://proceedings.neurips.cc/paper/2016/hash/c8067ad1937f728f51288b3eb986afaa-Abstract.html)
- Gao et al. measure ERF with Dirac-delta perturbations and find that spatial-domain (convolutional) operators learn local spatial dependencies better than function-space/global operators. Adding local convolutions to FNO helps. — [arXiv 2510.02683](https://arxiv.org/html/2510.02683v1)
- Hakim & Masanam note that a global ML model raises the concern that localized features could immediately produce a global response. Their tests examined propagation away from the source rather than assuming locality. — [ar5iv](https://ar5iv.labs.arxiv.org/html/2309.10867)

### Inferences
- (Background knowledge; I did not verify it in the abstract I fetched.) Luo et al. also show that ERF size grows roughly as sqrt(n) for n stacked layers, while the theoretical RF grows linearly. By analogy, a k-step rollout of a local CNN spreads energy roughly diffusively (~sqrt(k) x R_eff) plus any learned advection. This fits the scorer's "local on day 1, spreading over days 4-8" pattern.
- Hard bound (own reasoning): with L stride-1 conv layers of kernel size k, dilation d=1 and no pooling, the per-step RF radius is R = L(k-1)/2 cells. After t steps, cells farther than 3 (box margin) + R*t cannot respond at all. To guarantee "no teleportation" by construction, R <= 8. To make day-1 energy mostly within 3 cells, R_eff should be ~2-4 cells. For example, 4-6 layers of 3x3 give R = 4-6. A U-Net with 2-3 downsamplings on 32x36 has an RF covering the whole domain, so day-1 leakage becomes possible, even though the ERF may still be concentrated.
- Other ways to break locality (own reasoning): global pooling, squeeze-and-excitation or channel attention with spatial averaging, per-sample normalisation over the domain (InstanceNorm/LayerNorm over H,W, or batch statistics in train mode), FFT layers, global attention, and fully connected bottlenecks. Each lets a shock in the Bay of Bengal change Rajasthan on day 1. Use per-channel fixed normalisation (dataset mean/std), GroupNorm only over channels, or no norm, and run in eval mode.
- Boundaries: zero padding creates edge artifacts that are identical in both runs and so cancel in the difference. However, the Arabian Sea box (65-75E) may sit near the western edge of a 32x36 domain. Responses "pile up" at walls, so check how far the domain edge is from the box.
- With global spectral layers (AFNO/FFT), any localized input change alters all Fourier coefficients. Day-1 responses at remote cells are then nonzero by construction, though possibly small. Whether they pass a 5% energy threshold depends on training. This is a structural reason to prefer a pure local CNN for this scorer.

### Gaps
- I did not find a published, peer-reviewed measurement of day-1 remote response amplitude in AFNO/FourCastNet/SFNO or GraphCast. The non-locality claim for spectral models above rests on architectural reasoning, not on a cited experiment.

## Q3. Physical propagation speeds: is ~8 cells/day (~900 km/day, ~10 m/s) a reasonable cap, and what does it imply for per-step RF?

### Takeaway
About 10 m/s is a moderate cap. It is faster than equatorial Rossby waves, the MJO and moisture-mode-like signals (4-8 m/s), comparable to or a bit slower than convectively coupled Kelvin waves (12-18 m/s), and much slower than dry gravity waves (20-50 m/s). It is physically defensible for daily-mean surface fields, where high-speed gravity-wave signals carry little energy, but it is not a hard physical limit.

### Cited Findings
- Kiladis et al. 2009, "Convectively coupled equatorial waves", Rev. Geophys. 47, RG2003, https://doi.org/10.1029/2008RG000266 — [PDF](https://www.meteo.physik.uni-muenchen.de/~roger/Lectures/TropicalMetweb/Literature/RevGeoph_2009_Kiladis_etal.pdf):
  - Convectively coupled Kelvin waves: 12-18 m/s (Nakazawa 1988); 15-20 m/s (west Pacific superclusters); 12-15 m/s over the Indian Ocean (Yang et al. 2007).
  - n=1 equatorial Rossby waves: ~4.5 m/s westward. MJO: 4-8 m/s eastward. MRG waves: phase 15-25 m/s westward, eastward group velocity ~5 m/s.
  - Westward inertio-gravity waves: ~29 m/s in a composite (observed range 10 to >30 m/s). n=0 EIG: ~30 m/s.
  - Dry gravity/Kelvin speeds for deep tropospheric heating (he ~ 200 m): 44-53 m/s. Gravity speeds from heating decomposition: 49 m/s and 23 m/s (Haertel & Kiladis 2004). Speed by equivalent depth: he = 10, 20, 50, 100, 200 m gives 9.9, 14.0, 22.1, 31.3, 44.3 m/s.
- Pangu showed tropical gravity-wave signals at ~20 m/s in adjustment experiments. — [ar5iv](https://ar5iv.labs.arxiv.org/html/2309.10867)
- Baroclinic wave packets travel at group velocity faster than the phase of individual troughs (Pangu reaches Europe from the North Pacific in ~10 days). — [ar5iv](https://ar5iv.labs.arxiv.org/html/2309.10867)

### Inferences
Conversion to cells/day at 1 deg (own arithmetic, 1 m/s ~ 0.78 cells/day):

| Process | Speed | Cells/day |
|---|---|---|
| Equatorial Rossby wave | 4.5 m/s | ~3.5 |
| MJO | 4-8 m/s | ~3-6 |
| Convectively coupled Kelvin (Indian Ocean) | 12-15 m/s | ~9-12 |
| Pangu tropical gravity signal | 20 m/s | ~15.5 |
| Dry deep gravity waves | 44-53 m/s | ~34-41 |

- So the 3 + 8*day cap would be violated by real dry gravity-wave adjustment. But in daily-mean 10 m winds and MSL, those signals are small and fast-dispersing. The scorer only forbids >5% of energy beyond the cap, so a physically sensible model should pass.
- Advection: monsoon low-level westerlies over the Arabian Sea and Somali jet are typically ~10-15 m/s at 850 hPa (background knowledge; I could not source a jet-core number in this session, see Gaps). Advection of moisture or temperature anomalies by the strongest jet core could therefore approach or slightly exceed 8 cells/day. Mean 10 m winds are weaker (~5-10 m/s, background knowledge).
- Per-step RF guidance: with daily steps, the scorer's speed cap equals 8 cells per step. A theoretical per-step RF radius R <= 8 guarantees compliance by construction. Because the ERF is Gaussian and narrower, R = 4-8 with most weight in the inner 2-3 cells gives physical-looking propagation (~3-10 m/s effective) and passes day-1 locality. R << 3 (e.g. 2 layers of 3x3, R = 2) may make it hard to meet the day 4-8 growth criterion unless learned dynamics advect energy outward.
- Training data must contain the relevant dynamics. With daily steps, sub-daily gravity-wave adjustment is absorbed within one step. The response on day 1 is effectively the "adjusted" state (compare Pangu's ~6 h geostrophic adjustment).

### Gaps
- I found no sourced value for typical Somali jet / Findlater jet core speed at 850 hPa or 10 m in this session. Findlater 1969/1971 and IMD climatologies would supply it.
- I found no sourced northward propagation speed for the boreal summer intraseasonal oscillation (BSISO) in this session. It is commonly quoted as ~1 deg latitude/day, but that is unverified here.

## Q4. Expected physics of the two shocks (warm Bay of Bengal; weakened Arabian Sea low-level wind)

### Takeaway
A warm, moist Bay of Bengal anomaly should over a few days produce:
- lower MSL and low-level cyclonic convergence over and near the box;
- more rainfall and tcwv there;
- a signal that spreads west/northwest toward the monsoon trough and central India, the track of Bay-of-Bengal-born low-pressure systems.

Weakening the Arabian Sea low-level westerlies should reduce moisture flux and rainfall over the Western Ghats and west coast, resembling a monsoon "break". Unbalanced wind cuts should partly re-adjust toward the pressure field.

### Cited Findings
**Warm Bay of Bengal (warm_ocean)**
- Over Indian Ocean monsoon regions, monthly cloudiness (convection) increases with SST, but above ~28 C SST stops being a dominant factor. Gadgil, Joseph & Joshi 1984, "Ocean-atmosphere coupling over monsoon regions", Nature 312, 141-143. — [IISc eprint](https://eprints.iisc.ac.in/20252); [Nature PDF](https://www.nature.com/articles/312141a0.pdf)
- Samanta et al. 2018 ("Impact of a Narrow Coastal Bay of Bengal Sea Surface Temperature Front on an Indian Summer Monsoon Simulation", Sci. Rep. 8, 17694, DOI 10.1038/s41598-018-35735-3) — [Sci. Rep.](https://link.springer.com/10.1038/s41598-018-35735-3):
  - Many monsoon lows and depressions that rain on central India originate in the northwest Bay of Bengal.
  - The warm coastal SST front (gradients up to 0.5 C/100 km) "helps to sustain deep and intense convection in its vicinity", which "may be a source for the vortex cores seeding the monsoon low-pressure systems". This is stated as a hypothesis.
  - Weakening the front (deeper mixed layer) reduced rainfall over the Bay of Bengal and central India. The authors attribute the enhancement more to wind shear than to direct moisture transport inland.
  - The northwest Bay's shallow (5-10 m), low-salinity mixed layer makes it highly sensitive to surface fluxes.
- Pangu reproduces a Matsuno-Gill response to steady tropical heating: a stationary pattern near the heating with waves radiating away. — [arXiv](https://arxiv.org/abs/2309.10867)
- Without moisture, Pangu does not intensify tropical lows into hurricanes. Moist anomalies matter for cyclogenesis in ML models too. — [arXiv](https://arxiv.org/abs/2309.10867)

**Weakened Arabian Sea winds (monsoon_stall)**
- Rai, Joshi, Dimri & Turner, "The role of potential vorticity anomalies in the Somali Jet on Indian Summer Monsoon Intraseasonal Variability". This is an accepted manuscript; the ID CLDY-D-16-00950 suggests Climate Dynamics, but I did not confirm the venue. — [UEA eprint](https://ueaeprints.uea.ac.uk/64658/1/CLDY_D_16_00950_R1acceptedversion.pdf):
  - Indian monsoon rainfall relies largely on moisture carried by the "strong cross-equatorial Somali Jet winds".
  - Following Findlater (1971), the jet splits over the Arabian Sea. The northern branch reaches the west coast near 17N; the southern branch passes just south of India.
  - Active spells have "a stronger Somali Jet that curves to the east over southern India". Breaks have "weaker westerly winds over southern India" and negative rainfall anomalies over the Western Ghats.
  - Following Rodwell & Hoskins (1995), the jet can turn anticyclonically away from India, reducing moisture flux.
- Annamalai & Sperber 2004 (J. Atmos. Sci., "Regional heat sources and the active and break phases of boreal summer intraseasonal (30-50 day) variability") — [OSTI](https://www.osti.gov/servlets/purl/859923):
  - The active Indian monsoon has "stronger cross-equatorial flow and cyclonic vorticity over the northern Indian Ocean".
  - In the transition to break, cross-equatorial flow weakens and "the available moisture at 850hPa over the Arabian Sea diminishes rapidly", and the monsoon trough collapses.
- The geostrophic adjustment test shows ML models (Pangu) adjust unbalanced mass/wind fields within ~6 h. A wind-only perturbation without a matching pressure change is unbalanced. — [ar5iv](https://ar5iv.labs.arxiv.org/html/2309.10867)

### Inferences
These are own suggestions for physically sensible signs, to check in a team's response maps.

**warm_ocean, day 1:**
- t2m stays positive over the box.
- tcwv stays positive (+15% at +3 K is below the ~20% Clausius-Clapeyron scaling of ~7%/K at constant relative humidity; background knowledge), so the shock is roughly self-consistent.
- msl should go negative over or just west/north of the box (thermal low / heating). Expect a small drop of order 1 hPa or less; no source for the magnitude.
- tp should increase in and around the box.
- u10/v10 should show cyclonic, convergent anomalies around the low: southwesterly anomalies on its south/east side, easterly on its north side.

**warm_ocean, days 2-8:**
- Signal spreads northwest toward Odisha, central India and the monsoon trough, following LPS tracks (Samanta et al. 2018).
- Possible Gill-type pattern: cyclonic Rossby gyres to the west of the heating and Kelvin-type easterlies/westerlies along the Equator to the east (Matsuno-Gill).

**warm_ocean, red flags:**
- msl rising over the warm anomaly.
- Rain decreasing over the box on day 1.
- Biggest response over Rajasthan or the Arabian Sea on day 1.

**monsoon_stall, day 1:**
- u10 and v10 strongly negative in the box (the shock itself).
- tp should drop over and downstream (east) of the box: the Kerala-Konkan coast and Western Ghats at ~74-77E, which sit 0-3 cells east of the box edge, consistent with the day-1 locality rule.
- tcwv may slightly decrease downstream. It may pile up or stay unchanged in the box because of reduced export; the sign is uncertain.

**monsoon_stall, days 2-8:**
- Drying spreads east across peninsular India toward the Bay of Bengal (break-like), and the monsoon trough weakens.
- t2m over land may warm under reduced cloud and rain. Over sea, reduced evaporation could warm t2m slightly; the model has no explicit SST, so this is uncertain.

**monsoon_stall, recovery:**
- Because the pressure gradient was not changed, part of the wind deficit should "recover" within one or two steps. Some decay of the u/v anomaly is physical, not a bug.
- A persistent zero-change in msl with a large wind cut suggests the model is not coupling channels.

**Stability (5 std) check:**
- A -40% cut of ~8-12 m/s mean westerlies is ~3-5 m/s, probably ~1-2 std.
- +3 K t2m is small relative to a domain-wide t2m std (several K) but large relative to the local daily std over open ocean (often <1 K; background knowledge, unsourced). Whether the scorer's channel_std is a single domain scalar or per-gridpoint matters a lot for the 5-std test.

### Gaps
- I found no quantitative source for how much MSL drops or rainfall rises per K of Bay of Bengal SST warming at daily scales. Coupled-model sensitivity studies (e.g. IITM CFSv2 experiments) would be needed.
- I found no sourced 850 hPa / 10 m jet-core speed (Findlater 1969, Joseph & Sijikumar 2004 J. Climate were identified but not read).
- The Rai et al. venue and year are not confirmed. The Joseph & Sijikumar 2004 paper ("Intraseasonal Variability of the Low-Level Jet Stream of the Asian Summer Monsoon", J. Climate) showing LLJ weakening in breaks was located only as a catalogue record: [record](https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_proquest_journals_222872766).

## Q5. Legitimate initial-condition ensembles (spatially correlated noise, breeding) and their limits in a deterministic model

### Takeaway
Bred vectors seeded with spatially correlated noise (~500 km scales) and amplitudes tied to forecast error are the current best practice for deterministic ML models. Plain independent Gaussian noise gives too little spread. All IC-only ensembles of a deterministic emulator are underdispersive because they ignore model error. Combining with multiple trained checkpoints helps.

### Cited Findings
- Mahesh et al., "Huge Ensembles Part I: Design of Ensemble Weather Forecasts using Spherical Fourier Neural Operators" (arXiv 2408.03100v3, 2025) — [arXiv](https://www.arxiv.org/pdf/2408.03100v3):
  - Bred vectors start from spherical noise "correlated on 500 km length scales" added to Z500 at t-2. The perturbed-minus-control difference is cycled through t-1 and t0, then applied to all variables.
  - Amplitudes are scaled to 0.35 x the 48 h RMSE: e.g. 0.37 K for t2m, 0.52 m/s for u10, 0.95 mm for tcwv.
  - Perturbations are added and subtracted (paired members), and tcwv is clipped so it is non-negative.
  - The authors state "simple Gaussian perturbations do not yield sufficiently dispersive ML ensembles", and that correlated spherical noise "would not serve well as an additive perturbation to surface fields". Bred vectors give physically structured perturbations, such as land-sea contrast and larger tropical humidity perturbations.
  - Bred vectors alone are "underdispersive on synoptic time scales (3-5 days)". Multiple checkpoints alone are underdispersive early. Combining both is best, with spread saturating at ~29 checkpoints.
- Bülte, Horat, Quinting & Lerch, "Uncertainty quantification for data-driven weather models" (arXiv 2403.13458v2, 2025) — [arXiv](https://arxiv.org/pdf/2403.13458):
  - On Pangu-Weather (50 members), they tested Gaussian noise scaled by variable std (gamma = 0.001; 0.3 used elsewhere for FourCastNet), random-field perturbations (scaled differences of two random past ERA5 states from the same month, following Magnusson et al. 2009), and IFS perturbed ICs.
  - All IC methods underestimate uncertainty ("the standard deviation is notably lower than the RMSE") and are underdispersed for surface variables. Random-field perturbations were the best IC method at longer leads. Post-processing methods (DRN, EasyUQ) were best calibrated.
  - IC approaches "cannot represent model error".
- Selz & Craig: the spread pattern in Pangu barely depends on perturbation amplitude (correlation 0.74 between 100% and 0.1% runs), and growth from tiny perturbations is far too slow. Deterministic ML models give near-constant growth that "would falsely imply unlimited predictability". — [GRL PDF](https://epub.ub.uni-muenchen.de/110134/1/Geophysical_Research_Letters_-_2023_-_Selz_-_Can_Artificial_Intelligence%E2%80%90Based_Weather_Prediction_Models_Simulate_the__1_.pdf)

### Inferences
These are own suggestions for the competition emulator.
- For the uncertainty display, use Gaussian-filtered noise (e.g. sigma ~ 2-5 cells ~ 200-500 km) per channel, scaled to ~0.3-0.5 x the 1-day RMSE of the emulator. Use +/- pairs and clip tp and tcwv to >= 0. Optionally run 2-3 breeding cycles from the previous days. A random-field alternative is scaled differences of two random same-month training states, which automatically gives physically balanced, multivariate structure.
- Critical for the scorer: keep the ensemble noise out of the scored shocked-minus-control difference, or apply identical noise to both runs (common random numbers). Otherwise the zero-perturbation test (<1e-3 std) and the day-1 locality test will fail, because noise energy is everywhere. Keep inference deterministic: eval mode, no dropout, fixed seeds, deterministic cuDNN or CPU, and float32 or float64 consistently. GPU non-determinism can itself exceed 1e-3 std after many steps of a chaotic rollout, so test it.
- Label ensemble spread honestly as "initial-condition spread only, underdispersive". A single small CNN has no model-error term. Cheap complements are multiple seeds/checkpoints, or MC-dropout used only in a separate UQ mode, never in the scored path.
- A shock response that is much smaller than the IC-ensemble spread is not "significant". Showing shock delta versus ensemble spread is a good judge-facing visual.

### Gaps
- I found no study of IC-ensemble design for small regional CNN emulators specifically. All the cited evidence is for global models (Pangu, SFNO, FourCastNet).
- I did not verify GPU non-determinism magnitudes for small CNNs from a source. That point is own reasoning.
