# Anti-blur and heavy-rain skill for a small deterministic daily emulator (32 x 36 grid, 6 channels: t2m, tp, u10, v10, msl, tcwv)

Scoring context (from the assignment, not a source): (1) day-8 per-channel spatial variance of the total field must be 40-250% of truth; (2) heavy-rain CSI at 10 mm/day at days 1, 4, 8, scored as (CSI - ref)/(1 - ref), ref = better of persistence/climatology CSI, full points at skill 0.10; (3) latitude-weighted RMSE over the 6 channels must beat the better of persistence and climatology.

Research method note: 18 tool calls; primary sources were arXiv/PMLR papers, the WeatherBench 2 paper, IMD documents and a Weather and Forecasting paper. One PMC article on ERA5 over India could not be fetched (CAPTCHA wall), so ERA5-daily-extremes evidence is thinner than planned.

## 1. Why MSE-trained autoregressive models blur with lead time

### Takeaway
Blurring follows directly from minimising a point error (MSE) on a partly predictable target. The MSE-optimal forecast shrinks the unpredictable part toward the conditional mean, and that part grows with lead time and is concentrated at small scales and in moisture/precipitation fields. WeatherBench 2, Subich et al. (GraphCast fine-tuning) and the ECMWF AIFS papers all document small-scale power loss growing with lead time, strongest for humidity and precipitation.

### Cited Findings
- Under MSE a forecast is penalised twice for a misplaced feature: once for missing it where it is and again for putting it where it isn't (the "double penalty"). For a partly predictable target, the MSE-optimal prediction has a smaller amplitude than the target whenever forecast-truth correlation is below 1, so unpredictable fine scales are damped — [Subich et al. 2025, "Fixing the Double Penalty in Data-Driven Weather Forecasting Through a Modified Spherical Harmonic Loss Function", ICML/PMLR 267](https://proceedings.mlr.press/v267/subich25a.html); [arXiv HTML v2](https://arxiv.org/html/2501.19374v2)
- Subich et al. also report that fine scales are less predictable than coarse ones, and that standard architectures learn to reduce fine-scale amplitude faster than they learn to predict it — [Subich et al. 2025](https://arxiv.org/html/2501.19374v2)
- A control GraphCast (MSE-trained) loses 25% of per-wavenumber energy at spherical wavenumber 32 (~1,250 km) by day 5, and its tropical-cyclone weak-intensity bias grows with lead time — [Subich et al. 2025](https://arxiv.org/html/2501.19374v2)
- WeatherBench 2: "the AI models show a significant drop in small scale variability from 6h to 3d", which the authors attribute to these models optimising their blurring for those time ranges. GraphCast (and Keisler 2022) show a large increase in wind-speed bias with lead time (too-weak winds); Pangu-Weather does not show this bias — [Rasp et al. 2024, WeatherBench 2, arXiv:2308.15560](https://arxiv.org/pdf/2308.15560)
- WeatherBench 2 describes the result as "a direct consequence of these models minimizing a deterministic mean error (such as MSE)", producing "blurry forecasts that perform well on some skill metrics (like RMSE or ACC) but do not represent a possible weather state". Matching the observed spectrum is "a necessary but not sufficient condition for 'realism'" — [WeatherBench 2](https://arxiv.org/pdf/2308.15560)
- The IFS ensemble mean "shows an increasing drop-off in power with lead time", starting at small wavelengths and moving to large ones; humidity and precipitation show the effect more strongly (linked to Lorenz 1969 upscale error growth). The mean "will become increasingly smooth with lead time, eventually converging to the climatological mean", which lowers its RMSE: ENS-mean beats HRES on RMSE after ~2 days for large-scale variables and after ~12 h for wind and humidity — [WeatherBench 2](https://arxiv.org/pdf/2308.15560)
- For precipitation, RMSE/ACC "heavily favor unrealistically smooth forecasts". On SEEPS the sharp IFS HRES is most skilful and blurrier models such as the ENS mean are less skilful; "on RMSE, the order of the models is reversed" — [WeatherBench 2](https://arxiv.org/pdf/2308.15560)
- ECMWF: the MSE objective "incentivises the smoothing of forecast fields with lead-time and a reduction of forecast activity". The deterministic AIFS "loses small-scale detail with forecast lead time" and progressively loses energy at high wavenumbers — [Lang et al. 2024, AIFS-CRPS, arXiv:2412.15832](https://arxiv.org/html/2412.15832v1)
- FGN authors call blurring "a common but 'unphysical' way deterministic ML-based weather models achieve lower RMSE", and use spectral analysis to diagnose it — [Alet et al. 2025, "Skillful joint probabilistic weather forecasting from marginals", arXiv:2506.10772](https://arxiv.org/html/2506.10772v1)

### Inferences
- (Own derivation, standard statistics.) For a standardised anomaly with forecast-truth correlation r, the MSE-optimal forecast has anomaly variance r² times the truth's. If r drops to about 0.4 by day 8, the anomaly variance ratio is about 0.16. This is why a day-8 variance floor bites: MSE training pushes the anomaly variance toward r².
- The anti-blur score uses the total field, not the anomaly. Total spatial variance is roughly the variance of the climatological pattern plus the anomaly variance (plus a covariance term). Channels with strong fixed spatial gradients over the domain (t2m north-south and land-sea contrast, msl monsoon trough, tcwv moist-south/dry-northwest) will probably pass 40% even when the anomaly is heavily blurred, provided the model reproduces the climatological pattern. The main risks are tp, then u10/v10, where daily variance is dominated by transient small-scale structure. Teams should measure this; it is not established by any source.
- On a 32 x 36 grid at about 1° there are few "small scales" to lose. The blur that matters is mostly synoptic and mesoscale rain-band amplitude loss, especially in tp.

### Gaps
- No source found that gives day-8 spatial-variance ratios for coarse (about 1°) regional emulators over India specifically.
- FourCastNet and Pangu spectra specifics were not separately retrieved. WeatherBench 2 notes Pangu lacks GraphCast's wind-speed bias, but no Pangu spectral numbers were extracted.

## 2. Remedies, evidence and feasibility for a 24-hour hackathon with a small CNN

### Takeaway
Remedies that work at scale (AMSE fine-tuning, CRPS ensembles, diffusion) all trade some deterministic RMSE for realism, or need stochastic or multi-member training. For a small deterministic CNN with a variance window as wide as 40-250%, the cheapest, lowest-risk path is MSE training plus post-hoc per-channel, per-lead variance (anomaly) rescaling tuned on validation. Optional extras are a light spectral or variance penalty term and short multi-step fine-tuning.

### Cited Findings
**Adjusted MSE (AMSE; Subich et al. 2025)**
- AMSE splits spectral MSE into amplitude and coherence terms: AMSE = Σ_k [(√PSD_k(x) − √PSD_k(y))² + 2·max(PSD_k(x), PSD_k(y))·(1 − Coh_k(x,y))]. It is zero only if x = y, has the same Taylor expansion as MSE about x = y, is parameter-free, and has MSE units — [Subich et al. 2025](https://arxiv.org/html/2501.19374v2)
- Applied as fine-tuning of the 1/4° GraphCast operational checkpoint. Curriculum: 25,000 single-step batches, then 2,500 batches each at 2 and 4 steps, then 1,250 each at 8 and 12 steps (batch size 8). Cost about 26.2 A100 GPU-days — [Subich et al. 2025](https://arxiv.org/html/2501.19374v2)
- AMSE with 12-step fine-tuning (AR12) shows no fine-scale dissipation (effective resolution about 160 km) and keeps HRES-level cyclone intensity. Single-step AMSE (AR1) is sharper but less coherent and has lower skill at all scales at longer leads. Multi-step AR fine-tuning still smooths intermediate scales somewhat — [Subich et al. 2025](https://arxiv.org/html/2501.19374v2)
- Limitation: AMSE needs a spherical-harmonic transform in the loop. For limited-area models a wavelet-type decomposition "might" work but is untested. No precipitation-specific verification is reported — [Subich et al. 2025](https://arxiv.org/html/2501.19374v2)

**CRPS-trained ensembles (AIFS-CRPS, FGN)**
- AIFS-CRPS trains a stochastic model (per-step Gaussian noise) on the almost-fair CRPS: afCRPS_α = (1/M)Σ_j|x_j − y| − ((1−ε)/(2M(M−1)))Σ_jΣ_k|x_j − x_k|, with α = 0.95 and ε = (1−α)/M. Members "maintain realistic variability throughout the forecast range", with "no dampening of smaller scales with lead time". Without truncating the reference field, spurious small-scale energy grew and propagated upscale — [Lang et al. 2024](https://arxiv.org/html/2412.15832v1)
- AIFS-CRPS trade-offs: over-dispersive in the extra-tropics, under-dispersive in the tropics, and stratospheric skill sensitive to the loss's vertical scaling. N320 total precipitation beat the IFS ensemble for about the first 8 days; O96 total precipitation was less skilful — [Lang et al. 2024](https://arxiv.org/html/2412.15832v1)
- FGN trains on a per-location fair CRPS using only N = 2 samples per target, with noise injected via a 32-dimensional vector into conditional layer norms. It "avoids the loss of power at high frequencies characterizing blurry predictions" out to 15 days. Cost: about 490 TPU-days per model; precipitation results were kept to the appendix because of doubts about ground truth — [Alet et al. 2025](https://arxiv.org/html/2506.10772v1)

**Diffusion (GenCast)**
- GenCast (Price et al., Nature 2024; arXiv:2312.15796) is a diffusion ensemble used as the sharp-ensemble baseline that FGN compares against. FGN is reported as about 8x faster than GenCast at inference — [Alet et al. 2025](https://arxiv.org/html/2506.10772v1); [GenCast arXiv](https://arxiv.org/abs/2312.15796v2)

**Ensemble mean versus member**
- An ensemble mean is "not a realistic realization of weather" and blurs toward climatology, so CRPS or diffusion ensembles only help the variance score if a single member (not the mean) is submitted. A single member gives up the RMSE benefit of averaging — [WeatherBench 2](https://arxiv.org/pdf/2308.15560)

### Inferences (own suggestions, ranked by feasibility for a 24-hour build)
1. **Post-hoc variance rescaling (highest value, about 1 hour).** Predict, or decompose into, climatology plus anomaly. At each lead L and channel c, set x' = clim + a_{c,L}·(x − clim), with a_{c,L} fitted on validation so the day-8 total-field variance ratio sits safely inside the window (for example 0.6-0.8, not 1.0). Rationale (own derivation): for a standardised anomaly with correlation r, the MSE-optimal forecast has MSE 1 − r² (in units of climatological variance). Inflating it to full variance gives MSE 2(1 − r). Climatology has MSE 1 and persistence has MSE 2(1 − ρ_lag). At r = 0.5, full inflation exactly ties climatology, so inflating all the way to 100% at day 8 risks losing to climatology on RMSE. Because the floor is only 40% of total-field variance, minimal inflation (or none, for channels that already pass) is the RMSE-safe choice.
2. **Lead-time and channel monitoring.** Compute the variance ratio every epoch (see section 5) so blur is caught before final submission.
3. **Light auxiliary variance or spectral term (about 2-3 hours, moderate risk).** Add λ·(log var(pred) − log var(true))² per channel, or a 2D-FFT amplitude-matching term (a planar analogue of AMSE's amplitude term), to an MSE loss. AMSE itself needs spherical harmonics, and its limited-area version is untested per Subich et al., so a planar FFT version is an extrapolation.
4. **Short multi-step (2-4 step) rollout fine-tuning.** Subich et al. found that single-step training alone (with AMSE) hurt coherence while multi-step training helped skill. For a CNN, a few unrolled steps can cut error growth, but plain-MSE rollout training is a known source of extra smoothing (WeatherBench 2: models "optimize their blurring" for the trained range). Pair it with item 1.
5. **CRPS with 2 noisy members (FGN-style N = 2).** Feasible in principle for a small CNN: concatenate a noise channel, run two forward passes, use fair CRPS. It is riskier in 24 hours (tuning, calibration), and a single stochastic member will usually have higher RMSE than an MSE model, which threatens the RMSE gate.
6. **GAN or diffusion: not recommended** for a 24-hour hackathon. They are training-unstable or costly, and no source here shows a small-CNN success at this timescale.

### Gaps
- No published evidence found for planar-FFT spectral losses on small regional daily emulators. Suggestions 3-5 are extrapolations.
- No source quantifies how much deterministic RMSE AMSE costs; Subich et al. report ensemble metrics but no deterministic RMSE numbers in the retrieved text.

## 3. Precipitation handling for heavy-rain CSI (10 mm/day) without wrecking RMSE

### Takeaway
MSE-type training under-predicts high rain amounts and spreads drizzle, which hurts CSI at fixed thresholds. Proven fixes are a class or occurrence head with class-weighted cross-entropy (a large CSI gain in PostRainBench) and frequency matching / quantile mapping calibration (reduces frequency bias and raises ETS in NCEP work, with limits for extremes and when pattern errors dominate). These fixes raise tp RMSE somewhat, so decouple the CSI decision field from the RMSE field where the scoring allows.

### Cited Findings
- PostRainBench uses a hybrid loss L = L_cls + α·L_reg: class-weighted cross-entropy over {no rain, rain, heavy rain} plus an MSE regression head, with α = 100 and class weights [1, 5, 30] (Korea, Germany) or [1, 15, 10] (China) — [PostRainBench, arXiv:2310.02676](https://arxiv.org/html/2310.02676v3)
- Ablation (Germany): removing the weighted loss cut heavy-rain CSI from 0.209 to 0.042, and adding it to a plain Swin-Unet raised heavy-rain CSI from 0.000 to 0.188. Heavy-rain CSI of the NWP baseline versus the model: Korea 0.045 → 0.052, Germany 0.178 → 0.209, China 0.110 → 0.145 (hourly thresholds of 10 mm/h Korea and 2 mm/h Germany/China) — [PostRainBench](https://arxiv.org/html/2310.02676v3)
- Frequency-matching calibration (Zhu & Luo 2015): for each threshold, it matches the forecast exceedance frequency to the observed frequency over a domain (with a decaying-average history), then applies a correction ratio to the forecast. Zero forecasts are left untouched — [Zhu & Luo 2015, Weather and Forecasting 30, 1109-1124, doi:10.1175/WAF-D-13-00049.1](https://www.emc.ncep.noaa.gov/gmb/yzhu/gif/pub/WAF2015_Zhu_Luo.pdf)
- Results: "the frequency bias is reduced and the ETS is increased in the calibrated forecasts", most at short leads. At high thresholds gains are "limited due to fewer training samples". In summer, frequency bias improved but ETS did not. When pattern errors dominate, "frequency bias is reduced at the expense of an increase in random error". RMSE dropped for the higher-resolution GFS but not the lower-resolution GEFS control; MAE fell for both. A dry bias (areas with no forecast rain) "can never be removed" — [Zhu & Luo 2015](https://www.emc.ncep.noaa.gov/gmb/yzhu/gif/pub/WAF2015_Zhu_Luo.pdf)
- AI global models over the Indian monsoon underrepresent days above 50 mm/day and overestimate light-to-moderate rain. GraphCast most underestimates the extreme tail; AIFS (CRPS-trained lineage) tails agree best with ERA5/IMD. At 10-day leads, models "severely underestimate extremes" while overpredicting rain across much of the season — [MAUSAM evaluation, arXiv:2509.01879](https://arxiv.org/pdf/2509.01879)

### Inferences (own suggestions)
- **Transform the target.** Train tp in log1p(tp_mm) or sqrt space. This compresses the heavy tail so MSE does not shrink peaks as hard, and stops large monsoon cells from dominating the loss. Invert with expm1 and clamp at 0 (or use a softplus/ReLU output head) to keep it non-negative. Watch units: ERA5 tp is in metres, so multiply by 1000 for mm/day before thresholding at 10. This is a classic silent CSI-killer.
- **Two outputs for tp:** (a) an amount head trained with MSE (in transformed space) and used for RMSE; (b) an exceedance head P(tp > 10 mm/day) trained with weighted BCE (positive weight about the inverse class frequency, PostRainBench-style). If the scorer reads CSI from the tp field itself, fold (b) back in: where P > p*, set tp = max(tp, 10 + δ); where P < p*, cap tp below 10. This changes few grid cells, so the RMSE cost is small.
- **Threshold tuning per lead.** On validation, choose the decision threshold (p* or a rescaled amount threshold t*_L) that maximises CSI separately at days 1, 4 and 8. For low-skill forecasts the CSI-maximising choice usually over-forecasts (frequency bias above 1). This is standard verification knowledge, not sourced here.
- **Quantile mapping / CDF matching** of the tp amount field per lead (and optionally per region or month) against training-truth distributions restores the missing heavy tail. Per Zhu & Luo it can raise random error when pattern errors dominate (day 8). Apply it only to the CSI-decision field, or blend it, and check that tp RMSE still beats persistence/climatology.
- **Beating the CSI reference.** ref = max(persistence CSI, climatology CSI). At day 1, persistence is probably a strong ref in the monsoon (rain bands persist). At day 8, climatology CSI at 10 mm/day may be non-trivial over the Western Ghats/NE India, where the daily climatological mean itself can exceed 10 mm in July-August. Full points need CSI ≥ ref + 0.10·(1 − ref), for example ref 0.30 → CSI 0.37. Report CSI by lead with the reference beside it.

### Gaps
- No source found giving persistence or climatology CSI at about 10 mm/day for daily rain at about 1° over India. Typical NWP CSI/ETS at this threshold over India was not retrieved (MAUSAM arXiv:2509.01879 reports no CSI/ETS). Teams must compute baselines on their own data.
- No quantitative source on the RMSE versus CSI trade-off for daily gridded rain beyond WeatherBench 2's qualitative "order reversed" finding and Zhu & Luo's caveats.
- "A Free Knob: A Sensitivity Audit for Calibration in Threshold-based Evaluation" (arXiv:2609.33457) appeared in search and looks relevant but was not read or verified.

## 4. Indian monsoon rainfall specifics: what "heavy" means in 1° ERA5 daily means

### Takeaway
IMD's "heavy rain" starts at 64.5 mm/day at station scale. The 10 mm/day threshold falls in IMD's "moderate" class, which suits area-averaged 1° daily ERA5, where station-scale heavy values are rare. ERA5 is used as truth here; it does not assimilate Indian rain gauges, differs from IMD regionally (often wetter than IMD in the north/northeast), and AI models trained on it underestimate extremes.

### Cited Findings
- Current IMD categories (2020 press release): heavy rain 64.5-115.5 mm, very heavy 115.6-204.4 mm, extremely heavy ≥204.5 mm — [IMD press release, 24 Nov 2020](https://internal.imd.gov.in/press_release/20201124_pr_932.pdf)
- An older IMD (Pune) glossary gives a fuller but different scale: very light 0.1-2.4, light 2.5-7.5, moderate 7.6-35.5, rather heavy 35.6-64.4, heavy 64.5-124.4, very heavy 124.5-244.4, extremely heavy ≥244.5 mm/day. "Exceptionally heavy" is used when a day's rain is near the station's monthly or seasonal record and above 120 mm. A rainy day is ≥2.5 mm — [IMD Pune glossary](https://imdpune.gov.in:443/Reports/glossary.pdf). **Conflict:** the upper bounds of heavy and very heavy differ from the 2020 press release. The glossary appears to be the older scheme; cite the 2020 values as current.
- ERA5 does not assimilate Indian precipitation data. AI models trained on ERA5 match ERA5 more closely than IMD. Their wet bias relative to IMD is attributed (untested) to gauge undercatch and interpolation in IMD. MAE against 458 stations is 15-45% larger than against ERA5 — [MAUSAM evaluation, arXiv:2509.01879](https://arxiv.org/pdf/2509.01879)
- Water-balance study: ERA5 annual precipitation averages about 9% above IMD for all India (up to 19%). It is 56% higher in the Brahmaputra basin, about 9% higher in the Ganga and about 6% higher in the Indus. In the peninsular west-flowing river basins ERA5 is similar to or lower than IMD. The authors argue IMD itself grossly underestimates precipitation — [Goteti & Famiglietti 2024, "Extent of gross underestimation of precipitation in India", HESS 28, 3435-3455](https://hess.copernicus.org/articles/28/3435/2024/)
- Models analysed in the MAUSAM study define heavy precipitation as >50 mm/day and underrepresent its frequency — [arXiv:2509.01879](https://arxiv.org/pdf/2509.01879)

### Inferences
- On a 1° grid, daily means smooth convective peaks. Exceedances of 10 mm/day will be concentrated along the Western Ghats, the monsoon trough / central India, and the northeast during JJAS, and will be rare elsewhere and outside the season. Class imbalance is therefore strongly seasonal. Stratify validation by season so a model is not tuned only on dry-season zeros.
- Because truth is ERA5, ERA5's known biases do not penalise the team. Under-forecasting the ERA5 tail does. Calibrate against the ERA5 training distribution, not IMD.

### Gaps
- No retrieved source quantified ERA5's daily drizzle (wet-day frequency) bias or extreme-tail underestimation against IMD gridded data at daily resolution. The PMC article (PMC11589684) that may cover this was blocked by a CAPTCHA. The common claim that reanalyses have a drizzle bias and underestimate extremes is therefore unverified here.
- No source found on typical spatial standard deviation of daily 1° rainfall over India.

## 5. Measuring blur cheaply during training

### Takeaway
Track (a) the per-channel spatial-variance ratio of the total field by lead time (exactly the competition metric) and (b) a 2D power spectrum ratio per channel. Both cost seconds on a validation batch. WeatherBench 2 and the AIFS/FGN papers use spectra as the standard blur diagnostic.

### Cited Findings
- WeatherBench 2 computes zonal energy spectra per latitude line via a discrete Fourier transform: S_0 = C|F_0|², S_k = 2C|F_k|² for k = 1..⌊L/2⌋, normalised so that Parseval holds, then averaged over 30°-60° latitude. ERA5's spectrum is a lead-time-constant reference — [WeatherBench 2](https://arxiv.org/pdf/2308.15560)
- Spectral analysis is described as the diagnostic for the "unphysical" blurring of deterministic ML models — [Alet et al. 2025](https://arxiv.org/html/2506.10772v1)
- Subich et al. measure "effective resolution" as the wavenumber where the forecast/analysis amplitude ratio drops, and separate amplitude from coherence per wavenumber — [Subich et al. 2025](https://arxiv.org/html/2501.19374v2)

### Inferences (own suggestions)
- **Variance ratio (exact score proxy).** For each validation init, lead L and channel c: VR = var_xy(pred[c, L]) / var_xy(truth[c, L]), computed on the total field in physical units over the 32 x 36 grid. Average over inits (or take a median) and log a heatmap of channels against leads 1-8 each epoch. Alarm if any day-8 channel falls below about 0.5 (margin above 0.4) or rises above about 2.0.
- **Pair VR with an anomaly variance ratio** (subtract day-of-year climatology) to see the true blur; the total-field ratio can hide it.
- **2D spectrum.** Apply a Hann window (the domain is not periodic), np.fft.rfft2, radial binning, then the ratio pred/truth per wavenumber bin by lead. On 32 x 36 there are only about 16 bins, so this is cheap and readable.
- **Coherence per bin** (Subich-style): Re⟨F_pred F_truth*⟩ / √(PSD_pred·PSD_truth). Low coherence plus a forced amplitude ratio near 1 means noise is being added rather than skill.
- Log RMSE against persistence and climatology on the same dashboard, so any sharpening knob (a_{c,L}, the λ of a variance loss, quantile mapping) is accepted only if all three scores improve or hold.

### Gaps
- No published guidance found on spectral diagnostics for very small (32 x 36) regional grids. The windowing and binning suggestions are standard signal-processing practice, not sourced from the weather-ML literature.
