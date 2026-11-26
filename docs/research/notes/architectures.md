# Data-driven weather-forecasting architectures for a small regional daily emulator (32 x 36, 1 deg India, 6 surface channels + 2 static, daily step, ~6,200 training days, CPU inference, 24-hour beginner build)

Scope note: 15 sources were fetched and read in full text this session (Rasp & Thuerey 2021; WeatherBench 2020; Weyn et al. 2020; GraphCast; FourCastNet; SFNO; Stormer; Neural-LAM 2023; Graph-EFM 2024; WeatherBench 2; Ben Bouallegue et al. 2024). Statements about Pangu-Weather, FuXi, ClimaX, Aurora, GenCast, ConvLSTM/PredRNN and LightGBM are mostly second-hand (taken from WeatherBench 2 / Stormer descriptions) or are listed under Gaps as unverified background knowledge. "Inferences" are my own reasoning, not reported results.

## 1. Candidate architectures: core idea, data/compute needs, CPU cost, rollout stability, fit to a tiny non-periodic regional domain

### Takeaway
For this setting the evidence favours a small, local-receptive-field convolutional model (residual CNN/ResNet or small U-Net) that predicts the tendency and is fine-tuned on short multi-step rollouts. It sits on top of strong statistical baselines (damped persistence toward day-of-year climatology, and linear regression). Global/spectral-mixing models (AFNO/FourCastNet, SFNO, Pangu/Swin, ViT/Stormer, GraphCast multi-mesh) were built for periodic or spherical global grids, 0.25-1.4 deg resolution, decades of 6-hourly data and tens to thousands of GPU-hours. Their design assumptions (periodicity, global coupling) do not hold on a 32 x 36 bounded box, and their training budgets are far beyond a 24-hour hackathon.

### Cited Findings

**Residual CNN / ResNet (Rasp & Thuerey 2021, WeatherBench ResNet), local receptive field**
- Fully convolutional ResNet with 19 residual blocks. Each block is two [Conv2D -> LeakyReLU(0.3) -> BatchNorm -> Dropout] units with a skip connection. It uses 128 channels and 3x3 kernels; the first layer is 128 channels with kernel 7. Convolutions are periodic in longitude and zero-padded in latitude. Weight decay is 1e-5 and dropout 0.1; dropout was removed for the pretrained model because it validated better. The paper gives no total parameter count. — [Rasp & Thuerey 2021, JAMES, arXiv:2008.08626](https://arxiv.org/pdf/2008.08626)
- Inputs: Z, T, U, V, Q at 7 pressure levels, plus T2M, 6-hourly accumulated precipitation (log-transformed) and TOA incoming solar radiation, each at t, t-6h and t-12h. Constant fields are land-sea mask, orography and latitude: 114 input channels in all. Grid is 5.625 deg (32 x 64). — [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626)
- Training data: about 150 years of CMIP6 MPI-ESM-HR historical runs for pretraining, then ERA5 1979-2015 for training and 2016 for validation. Adam, batch 32, lat-weighted MSE. LR 5e-5, or 5e-7 when fine-tuning a CMIP-pretrained net. LR is divided by 5 twice on 2-epoch plateaus, with early stopping (patience 5). About 1 day per model on one GTX/RTX 2080 GPU (TensorFlow 2). — [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626)
- The authors used direct (one model per lead time) and "continuous" (lead time as an input field) models, not iterative ones. They report that iterative forecasting with this architecture gave self-amplifying errors. Direct models were better up to about 3 days and continuous models were better at longer leads. — [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626)
- Overfitting: pretraining on climate-model data "helps to prevent overfitting and leads to better testing scores". Overfitting is worse at longer leads. Larger networks improved skill but overfit more, which the authors read as a data-limited skill ceiling. — [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626)

**WeatherBench baseline CNN (Rasp et al. 2020), local**
- 5 conv layers, 64 hidden channels, kernel 5, ELU, Adam + MSE. Input and output are 2 channels (Z500, T850), with periodic padding in longitude only. **313,858 trainable parameters.** — [Rasp et al. 2020, WeatherBench, arXiv:2002.00469](https://arxiv.org/pdf/2002.00469)
- The iterative CNN "performs well up to about 1.5 days, then its errors diverge". A linear-regression model iterated as well as it did directly because it is linear. The paper notes that training at longer lead times beats chaining short forecasts (citing Scher & Messori 2019). — [Rasp et al. 2020](https://arxiv.org/pdf/2002.00469)

**DLWP U-Net on cubed sphere (Weyn, Durran & Caruana 2020), local**
- U-Net encoder-decoder with 3x3 convs, 2x2 average pooling/upsampling and concatenating skip connections. Each cube face (48 x 48, about 1.9 deg) is convolved separately. Padding is copied from neighbouring faces so edges stay continuous. — [Weyn et al. 2020, JAMES, arXiv:2003.11927](https://arxiv.org/pdf/2003.11927)
- 4 prognostic variables (Z500, Z1000, 300-700 hPa thickness, T2) plus prescribed TOA insolation, land-sea mask and topography. Two input states (t-6h, t) predict two output states. **About 700,000 parameters** (Table 1 footnote: 672,080). — [Weyn et al. 2020](https://arxiv.org/pdf/2003.11927)
- Training took about 2-3 days on one V100 GPU, with at least 100 epochs and early stopping (patience 50). Inference: a global 4-week forecast takes under 0.2 s, and a 1000-member 1-month ensemble about 3 minutes. — [Weyn et al. 2020](https://arxiv.org/pdf/2003.11927)
- Stability: all 210 four-week forecasts were free of instabilities, and a 1-year free run stayed stable. The authors partly credit a capped leaky ReLU (output capped at 10). — [Weyn et al. 2020](https://arxiv.org/pdf/2003.11927)

**FourCastNet (AFNO), global spectral mixing via FFT**
- AFNO mixes tokens in the Fourier domain: 2D DFT -> block-diagonal MLP -> soft-thresholding -> inverse DFT. The paper calls this "continuous global convolution, implemented efficiently in the Fourier domain with FFTs". It uses a ViT backbone with 8x8 patches and embedding dimension 768. The grid is 720 x 1440 at 0.25 deg with 20 variables, including TCWV, MSLP, U10, V10 and T2m. — [Pathak et al. 2022, arXiv:2202.11214](https://arxiv.org/pdf/2202.11214)
- Data: ERA5 1979-2015 (54,020 six-hourly training samples). Compute: about 16 h on 64 A100s. About 10 GB of memory at batch size 1. — [Pathak et al. 2022](https://arxiv.org/pdf/2202.11214)
- Precipitation is a separate diagnostic model trained on log(1 + TP/1e-5), with a final ReLU for non-negativity. It underestimates extremes (about 35% relative quantile error vs about 15% for IFS), and forecasts are smoother than ERA5. — [Pathak et al. 2022](https://arxiv.org/pdf/2202.11214)

**SFNO (Bonev et al. 2023), global spectral mixing via spherical harmonics**
- The FFT "incorrectly assume[s] a flat geometry", which causes artifacts and dissipation, wrong identification of the poles and incorrect periodicity. AFNO "breaks down early" in their shallow-water test. — [Bonev et al. 2023, arXiv:2306.03838](https://arxiv.org/pdf/2306.03838)
- SFNO autoregressive rollouts stayed stable for over a year (1,460 six-hourly steps), versus 25 days for the FFT-based FNO. The paper says other models except Weyn et al. (2021) "were not stable beyond a few weeks". — [Bonev et al. 2023](https://arxiv.org/pdf/2306.03838)
- ERA5 models have parameters on the order of 10^8-10^9 (Table 2 garbled in extraction; verify against the PDF). Training: each stage took 4 h on 8 DGX machines. Inference: about 500 ms per step on an A6000 GPU. — [Bonev et al. 2023](https://arxiv.org/pdf/2306.03838)
- Framing from the SFNO paper: FNOs "act globally on the entire domain", whereas CNNs/ViTs learn on a fixed grid. ViTs have quadratic complexity, and the FFT allows global interactions in quasi-linear time. — [Bonev et al. 2023](https://arxiv.org/pdf/2306.03838)

**GraphCast (GNN, multi-mesh, global message passing)**
- 36.7M parameters. Two input states (t-6h, t). Forcings are TOA radiation and sin/cos of local time and year progress; statics are land-sea mask, surface geopotential and lat/lon. Training: about 4 weeks on 32 TPU v4. A 10-day 0.25 deg forecast takes under 1 minute on one TPU v4. — [Lam et al. 2023, Science, arXiv:2212.12794](https://arxiv.org/pdf/2212.12794)

**Neural-LAM / Hi-LAM / Graph-EFM (graph-based limited-area models), local-to-regional message passing on a hierarchical mesh**
- Domain: MEPS Nordic, 238 x 268 at 10 km, 17 variables, 3 h steps to 57 h, 6,069 forecasts (April 2021 to March 2023). Latent dimension 64. Training: 3-4 days per model on one A100 80GB. A 57 h Hi-LAM forecast takes 1.5 s on one A100. Parameter counts are not reported. — [Oskarsson et al. 2023, arXiv:2309.17370](https://arxiv.org/pdf/2309.17370)
- Hi-LAM (hierarchical) beats GC-LAM (GraphCast-style multi-scale mesh) and removes circular artifacts around high-degree mesh nodes. The single-level 1L-LAM performs "substantially worse" with severe visual artifacts. No persistence baseline is reported. — [Oskarsson et al. 2023](https://arxiv.org/pdf/2309.17370)
- Graph-EFM (probabilistic, hierarchical): LAM training used about half of the 700-1,400 GPU-hours (8 x A100) spent on the global models. At 57 h, GraphCast* has the lowest z500 RMSE (201 vs 219 for Graph-EFM). The authors see "no clear RMSE benefit from probabilistic modeling at these shorter lead times". — [Oskarsson et al. 2024, arXiv:2406.04759](https://arxiv.org/pdf/2406.04759)

**Stormer (ViT, global self-attention)**
- Standard ViT backbone: 24 blocks, hidden size 1024, patch size 2 (ViT-L-like). Per-variable tokenisation with cross-attention aggregation, and adaLN conditioning on the interval dt. Data: ERA5 at 1.40625 deg (128 x 256) with 13 levels. — [Nguyen et al. 2023, Stormer, arXiv:2312.03876](https://arxiv.org/pdf/2312.03876)
- Training took under 24 h on 128 A100s. For comparison, the paper puts Pangu-Weather at about 60 days on 192 V100s (four models) and GraphCast at about 28 days on 32 TPUv4. It claims about 190x less data than Pangu and about 90x less than GraphCast. — [Nguyen et al. 2023](https://arxiv.org/pdf/2312.03876)
- From day 6, Stormer outperforms Pangu-Weather and GraphCast, and at day 14 it is 10-20% better than GraphCast. The paper says it is the only model that beats climatology at long leads. Larger models and smaller patches help consistently. — [Nguyen et al. 2023](https://arxiv.org/pdf/2312.03876)

**Pangu-Weather, FuXi, Keisler, SphericalCNN, NeuralGCM (as summarised in WeatherBench 2)**
- Pangu-Weather: 0.25 deg transformer. Four models (1, 3, 6 and 24 h steps) are chained for longer leads. FuXi: 0.25 deg cascaded transformer with separate models for days 0-5, 5-10 and 10-15. Keisler (2022): 1 deg GNN on an icosahedron, trained on cumulative error over up to 12 steps (3 days). NeuralGCM: hybrid differentiable dynamical core with learned physics. — [Rasp et al. 2024, WeatherBench 2, arXiv:2308.15560](https://arxiv.org/pdf/2308.15560)
- Pangu-Weather run with a 24 h step is smoother than IFS. Its bias grows almost linearly with lead time, much faster than IFS (especially Z500), and continues beyond day 10. It has no precipitation output. — [Ben Bouallegue et al. 2024, BAMS, arXiv:2307.10128](https://arxiv.org/pdf/2307.10128)

**Linear / statistical baselines**
- On WeatherBench 5.625 deg, direct linear regression reaches Z500 693/783 m2/s2 and T850 3.19/3.44 K at 3/5 days. At 5 days it is "about as good as the weekly climatology". — [Rasp et al. 2020](https://arxiv.org/pdf/2002.00469)
- WB2 climatology is a per-grid-point day-of-year (and time-of-day) mean of ERA5 1990-2019, smoothed with a 61-day sliding window with linearly decaying weights. — [Rasp et al. 2024, WeatherBench 2](https://arxiv.org/pdf/2308.15560)

### Inferences
- **Global mixing vs local receptive field.** AFNO/FourCastNet uses FFT mixing that implicitly treats the domain as periodic. SFNO uses spherical harmonics that assume a full sphere. Pangu (Swin windows on a global grid), ViT/Stormer/ClimaX (global self-attention) and GraphCast (global multi-mesh) all mix globally. On a 32 x 36 India box the FFT would wrap the east edge (100.5E) onto the west edge (65.5E) and the north edge onto the south edge. That is physically meaningless, and SFNO is not applicable without a full sphere. ResNet, U-Net, ConvLSTM, Neural-LAM's graph and LightGBM per cell are local (U-Net/LAM become semi-global through downsampling or hierarchy). Use zero or replicate padding, not the periodic longitude padding the WeatherBench CNNs use.
- **Size of the setting.** 32 x 36 = 1,152 cells x 6 channels x 6,200 days is roughly 1/9 the samples of WeatherBench's 6-hourly 1979-2015 set (about 54k samples per FourCastNet's count), on a grid about 2x smaller than the 32 x 64 global 5.625 deg grid. Rasp & Thuerey already saw data-limited overfitting with a 19-block, 128-channel ResNet on far more data. So a few hundred thousand to about 2M parameters (WeatherBench CNN 314k; DLWP about 700k) is the sensible range. Rough arithmetic from those layer specs puts a 19 x 2 x 128 ch 3x3 ResNet at about 5.6M parameters.
- **CPU cost (my own arithmetic, not a measured source).** One 3x3 conv with 128 input/output channels on 1,152 cells costs about 2 x 9 x 128 x 128 x 1,152 = 0.34 GFLOP. The full 19-block ResNet (38 such convs) is about 13 GFLOP per step, or about 130 GFLOP for 10 steps. On a 4-core CPU sustaining tens of GFLOP/s in PyTorch that is a few seconds, at the edge of the 5 s budget. A 64-channel, 8-block version is about 1.4 GFLOP per step (about 14 GFLOP per 10 steps) and should be well under 1 s. Memory is trivial (a few MB of activations). Verify by timing on the target CPU.
- **Rollout stability ranking for this setting (inference from the cited evidence).** Linear and damped-persistence models are stable by construction. A small CNN/U-Net is stable with tendency prediction plus 2-4 step rollout fine-tuning; the naive WeatherBench iterative CNN diverged after about 1.5 days. Large transformers and spectral models need curricula, data and compute that a 24-hour team does not have. Diffusion models (GenCast) need many denoising steps per forecast step, which multiplies CPU inference cost. Not verified this session; see Gaps.
- **ConvLSTM/PredRNN.** These are local, and their recurrent state increases memory and training time. None of the operational/benchmark leaders fetched here use them. For a 3-day input window, stacking the 3 days as channels in a CNN (as Rasp and Weyn stack t, t-6h, t-12h) does the same job more simply.
- **LightGBM per grid cell.** Plausible as a day-1 or direct-lead model using neighbour-cell features and day-of-year. Autoregressive rollout of 1,152 x 6 tree models is clumsy, though direct per-lead models are possible. No primary source was fetched (see Gaps).

### Gaps
- Pangu-Weather (Bi et al. 2023, Nature, https://www.nature.com/articles/s41586-023-06185-3), FuXi (Chen et al. 2023, npj Clim Atmos Sci, arXiv:2306.12873), ClimaX (Nguyen et al. 2023, arXiv:2301.10343, github.com/microsoft/ClimaX), Aurora (Bodnar et al. 2024/2025, arXiv:2405.13063, github.com/microsoft/aurora) and GenCast (Price et al. 2024/2025, arXiv:2312.15796, Nature) were not fetched this session. From background knowledge, not re-verified here: Pangu uses a 3D Earth-specific Swin transformer with about 64M parameters per model. Aurora is a roughly 1.3B-parameter 3D Swin/Perceiver foundation model pretrained on more than 1M hours of data. GenCast is a conditional diffusion model with a graph-transformer denoiser at 0.25 deg and a 12 h step, and it needs multiple denoiser evaluations per step. ClimaX is a ViT pretrained on CMIP6 and fine-tuned at 5.625/1.40625 deg. The report writer should treat these as unverified.
- No primary source was found or fetched on ConvLSTM/PredRNN for medium-range gridded weather, or on LightGBM per-grid-cell forecasting of ERA5 fields.
- No source gives measured CPU latency for small CNN weather models on grids of about 1,000 cells. Weyn's 0.2 s for a 4-week global forecast is GPU-based (the hardware is not explicit in the extracted text).

## 2. Training techniques with evidence (residual prediction, rollout fine-tuning/curriculum, climatology/day-of-year inputs, normalisation, latitude weighting, noise, ensembling, small-data regularisation)

### Takeaway
The best-supported recipe is consistent across GraphCast, Stormer, FourCastNet, SFNO, Neural-LAM and DLWP:
1. Predict the tendency (state difference), normalised by the standard deviation of the time differences.
2. Weight the loss by latitude and per variable.
3. Supply time-of-year/insolation forcings and the static fields.
4. Pretrain single-step, then fine-tune on short multi-step rollouts (2-4 steps, small LR).

Multi-step training buys long-lead skill at the cost of smoothing toward the mean, and that smoothing lowers RMSE at long leads, which is exactly the day-8-vs-climatology regime. Regularisation and keeping the model small matter at this data size.

### Cited Findings
- **Residual/tendency prediction.** In GraphCast the decoder outputs a difference that is added to the latest input state. Outputs are scaled by the per-variable standard deviation of the 6-hour state differences; the mean is ignored because it is about zero. — [Lam et al. 2023](https://arxiv.org/pdf/2212.12794)
- In Stormer's ablation, forecasting dynamics (X_dt - X_0) beats forecasting absolute states. — [Nguyen et al. 2023](https://arxiv.org/pdf/2312.03876)
- **Normalisation and loss weighting.** GraphCast inputs are standardised per variable and level. The MSE is scaled by the inverse variance of time differences, by per-variable-level weights and by grid-cell area (latitude weight, normalised to unit mean). Surface weights are 2T = 1.0 and others 0.1. — [Lam et al. 2023](https://arxiv.org/pdf/2212.12794)
- Stormer reuses GraphCast's surface weights (T2m 1, U10/V10/MSLP 0.1) plus latitude weighting, and its ablation finds that pressure weighting improves results. — [Nguyen et al. 2023](https://arxiv.org/pdf/2312.03876)
- Neural-LAM uses a GraphCast-like weighted MSE (inverse variance of time differences, level weights) with no grid-node area weighting, since its LAM cells are about equal in area. — [Oskarsson et al. 2023](https://arxiv.org/pdf/2309.17370)
- Rasp & Thuerey train with latitude-weighted MSE. — [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626)
- **Latitude weights (metric).** WeatherBench 1 uses L(j) = cos(lat_j) / mean(cos lat). The RMSE is averaged over forecasts outside the square root. — [Rasp et al. 2020](https://arxiv.org/pdf/2002.00469)
- WB2 uses cell-area weights (sin(lat_upper) - sin(lat_lower), normalised) with the time mean inside the square root. The difference from WB1 is under 2% on average. — [Rasp et al. 2024](https://arxiv.org/pdf/2308.15560)
- **Autoregressive / multi-step curriculum (GraphCast).** Phase 1: 1,000 single-step updates with LR warm-up to 1e-3. Phase 2: 299,000 single-step updates with cosine decay. Phase 3: 11,000 updates growing the rollout from 2 to 12 steps (one more step per 1,000 updates) at LR 3e-7, backpropagating through the full unroll. — [Lam et al. 2023](https://arxiv.org/pdf/2212.12794)
- In GraphCast, longer rollouts improve long-lead skill but make forecasts blurrier at long leads, because the model expresses uncertainty by spatial smoothing. — [Lam et al. 2023](https://arxiv.org/pdf/2212.12794)
- **FourCastNet:** 80 epochs single-step pretraining (LR 5e-4, cosine), then 50 epochs two-step fine-tuning (LR 1e-4) with the loss summed over both steps. — [Pathak et al. 2022](https://arxiv.org/pdf/2202.11214)
- **SFNO:** single-step stage with cosine LR from 1e-3, then multi-step fine-tuning starting at 2 steps, 5 epochs per step count at LR 1e-5. — [Bonev et al. 2023](https://arxiv.org/pdf/2306.03838)
- **Stormer:** K=1 for 100 epochs (LR 5e-4), K=4 for 20 epochs (5e-6), then K=8 for 20 epochs (5e-7). Using the same dt for all K steps was necessary, because randomising it per step destabilised training. Multi-step fine-tuning "significantly improves long-lead performance". — [Nguyen et al. 2023](https://arxiv.org/pdf/2312.03876)
- **Neural-LAM:** 500 epochs single-step, then 200 epochs of 4-step rollout fine-tuning. Longer-rollout fine-tuning gave only minor improvements. — [Oskarsson et al. 2023](https://arxiv.org/pdf/2309.17370)
- **DLWP (Weyn 2020):** the loss is summed over T rollout iterations, with T=2 (two 2-step iterations, 24 h) chosen for efficiency. Large T produced "overly smooth forecasts tending toward climatology". The capped leaky ReLU aided multi-week stability. — [Weyn et al. 2020](https://arxiv.org/pdf/2003.11927)
- **Time-of-year / climatological forcings.** GraphCast uses TOA radiation plus sin/cos of local time and year progress as forcings. — [Lam et al. 2023](https://arxiv.org/pdf/2212.12794)
- Neural-LAM uses TOA flux plus sin/cos time-of-day and time-of-year. — [Oskarsson et al. 2023](https://arxiv.org/pdf/2309.17370)
- In DLWP, TOA insolation gives the diurnal and annual cycle, and adding the prescribed fields (insolation, land-sea mask, topography) "improved validation performance". — [Weyn et al. 2020](https://arxiv.org/pdf/2003.11927)
- Rasp & Thuerey include TOA radiation and the constant fields (land-sea mask, orography, latitude). — [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626)
- **Multiple input time steps.** GraphCast uses 2 input states; 3 did not justify the extra memory. — [Lam et al. 2023](https://arxiv.org/pdf/2212.12794)
- Rasp & Thuerey use 3 input times (t, t-6h, t-12h). — [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626)
- **Precipitation transform.** Both FourCastNet (log(1 + TP/1e-5)) and Rasp & Thuerey log-transform precipitation. — [Pathak et al. 2022](https://arxiv.org/pdf/2202.11214); [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626)
- **Noise / ensembles.** FourCastNet builds ensembles by adding Gaussian noise (sigma = 0.3 in standardised units) to initial conditions, but does not use noise during training for stability. Its ensemble-mean skill is slightly worse under 48 h. — [Pathak et al. 2022](https://arxiv.org/pdf/2202.11214)
- GraphCast's paper does not mention noise injection (per extraction). — [Lam et al. 2023](https://arxiv.org/pdf/2212.12794)
- **Averaging multiple forecasts.** Stormer averages forecasts made from different interval combinations (for example [6,6,6,6], [12,12] or [24] for a 24 h lead). Homogeneous combinations perform about as well as the elaborate "best m in n" selection. — [Nguyen et al. 2023](https://arxiv.org/pdf/2312.03876)
- **Small-data regularisation.** Rasp & Thuerey use weight decay 1e-5, dropout 0.1, LR-on-plateau and early stopping. Larger networks overfit more. Pretraining on 150 years of CMIP output reduced overfitting and improved test scores. — [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626)
- GraphCast uses AdamW with weight decay 0.1 and gradient clipping at norm 32. — [Lam et al. 2023](https://arxiv.org/pdf/2212.12794)
- **Smoothing helps RMSE.** WB2: ML models trained on MSE "hedge their bets" with smooth forecasts that score well on RMSE/ACC but are unrealistic. The IFS ensemble mean's increasing smoothness lowers its RMSE at long leads. Deterministic ML beats the ENS mean only up to about 3-6 days. — [Rasp et al. 2024](https://arxiv.org/pdf/2308.15560)

### Inferences
- **Beating persistence at day 1.** Persistence is hard to beat at day 1 for slowly varying fields (T2m, MSLP, TCWV over large areas) and easy to beat for daily precipitation (WeatherBench: precipitation persistence RMSE is worse than climatology). The cited evidence suggests these help:
  - Tendency prediction, so the "do nothing" solution is the zero-initialised default.
  - Normalising tendencies per channel by their standard deviation, so precipitation and wind are not swamped.
  - Using all 3 input days (gives a trend).
  - Day-of-year sin/cos plus a daily climatology field (or anomaly inputs).
- **Beating climatology at day 8.** Errors from a free-running regional model will saturate. With MSE training and multi-step fine-tuning, forecasts drift smoothly toward the conditional mean, which RMSE rewards. Explicitly anchoring the model to climatology also helps: predict anomalies from day-of-year climatology, and/or blend the output with climatology at long leads (for example a learned or validated per-lead blending weight, effectively damped persistence of anomalies). Ensembling a few seeds or checkpoints is a cheap way to add smoothing. These are inferences; no fetched source tests climatology-blending on a regional daily emulator.
- **Hackathon budget.** Copy the cheap form of the curriculum: about 1-step training to convergence, then 2-4 step fine-tuning at 10-100x lower LR (Neural-LAM found longer rollouts gave minor gains). Full GraphCast-style 12-step unrolls are unnecessary and memory-hungry.

### Gaps
- No fetched source directly tests noise injection during training as a stability device for small CNN emulators. From background knowledge (unverified this session), some later works add input noise or perturbations, for example Keisler 2022 and GenCast.
- No fetched source tests checkpoint averaging (SWA) for deterministic emulators. Graph-EFM's baselines include "GraphCast*+SWAG", but the effect on deterministic RMSE was not extracted.
- No fetched source quantifies the effect of climatology-as-input versus anomaly targets on skill.

## 3. Regional / limited-area emulator issues: lateral boundaries, edge degradation, no boundary data at inference

### Takeaway
Published ML limited-area models (Neural-LAM/Hi-LAM, Graph-EFM) assume boundary forcing is available at every step. At inference they overwrite a 10-cell-wide boundary band with forcing data (ground truth in the experiments; a global forecast operationally) and exclude that band from the loss. None of the fetched sources tests running without boundary data, which is this project's situation. That is an untested regime and a significant risk for skill near the edges at longer leads.

### Cited Findings
- In Neural-LAM the boundary is the 10 grid nodes nearest the edge. After each prediction these nodes are overwritten with the forcing state, and they are excluded from training loss and evaluation. The experiments use dataset ground truth, which an operational system would replace with a host (often global) model forecast. — [Oskarsson et al. 2023](https://arxiv.org/pdf/2309.17370)
- The boundary carries the same 17 variables the model predicts. Forcings from t-1, t and t+1 feed the prediction for t+1. Error grows toward the domain centre, away from the boundary, and boundary information is most useful near the edges. Running without boundary information was not tested. — [Oskarsson et al. 2023](https://arxiv.org/pdf/2309.17370)
- Graph-EFM LAM: "We define the boundary as the outermost 10 grid positions". These are extra nodes processed identically by the GNN layers, and the forecast must stay consistent with them. All LAM models are under-dispersed, which the authors attribute to boundary forcing limiting spread. Using the same dataset for interior and boundary makes it a controlled setup, and they acknowledge operational forcing would differ. — [Oskarsson et al. 2024](https://arxiv.org/pdf/2406.04759)
- WB2's regional evaluation (Europe, 35-75N) uses global models cropped to the region. It is not a standalone regional model. — [Rasp et al. 2024](https://arxiv.org/pdf/2308.15560)
- The WeatherBench CNNs and the Rasp & Thuerey ResNet pad periodically in longitude because they are global; latitude is zero-padded. Weyn copies padding from neighbouring cube faces so edges stay continuous. — [Rasp et al. 2020](https://arxiv.org/pdf/2002.00469); [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626); [Weyn et al. 2020](https://arxiv.org/pdf/2003.11927)

### Inferences
- Without boundary forcing, anything entering the India box is invisible to the model: western disturbances from the west, monsoon inflow across the Arabian Sea and Bay of Bengal edges, systems from the east. Errors should therefore spread inward from the edges with lead time, roughly at the advection speed. At daily steps, a 1 deg domain about 32 cells wide could plausibly be "contaminated" within a few days. That is my inference; no source quantifies it.
- Practical mitigations (inference, no source tested them for this case):
  1. Non-periodic padding (zero, replicate or reflect), never FFT/periodic mixing.
  2. Day-of-year climatology as an input, so the model has a sensible prior near edges once information runs out.
  3. Possibly feeding climatology as pseudo-boundary forcing in an outer ring, which mirrors Neural-LAM's overwrite mechanism with climatology instead of truth.
  4. Evaluating per-cell skill maps to check edge degradation.
  5. Optionally down-weighting the outer 1-2 rows in the loss, only if the scoring metric allows it. If the score covers the whole 32 x 36 grid, edges still count.
- A U-Net's downsampling gives every cell a domain-wide receptive field. That helps propagate interior information but does not create missing upstream information.

### Gaps
- No fetched source evaluates a data-driven regional model running free with no lateral boundary data, or reports edge-degradation curves for such a setup. Stretched-grid approaches (for example Nipen et al. 2024, "Regional data-driven weather modeling with a global stretched-grid", arXiv:2409.02891, from background knowledge, unverified) sidestep the issue by running globally, which is not possible here.

## 4. Realistic skill for coarse CNN models on WeatherBench vs persistence and climatology

### Takeaway
At 5.625 deg global, the best fetched CNN results (Rasp & Thuerey ResNet, 6-hourly inputs, direct or continuous training, CMIP pretraining) roughly halve persistence RMSE for T850/T2M at day 3. They remain clearly better than climatology at day 5. They also beat persistence and climatology for precipitation, but only modestly. A plain small CNN without these tricks was only marginally better than weekly climatology at day 5, and an iterative plain CNN diverged after about 1.5 days. DLWP (U-Net, 2-step loss) beats climatology for T2 until about day 8 and for Z500 beyond day 7. These are global, upper-air-informed results; nothing here is a measured regional daily India number.

### Cited Findings
- RMSE at 3/5 days, 5.625 deg WeatherBench test (2017-2018), from Rasp & Thuerey 2021 Table. — [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626)

| Model | Z500 (m2/s2) | T850 (K) | T2M (K) | Precip (mm) |
|---|---|---|---|---|
| Persistence | 936 / 1033 | 4.23 / 4.56 | 3.00 / 3.27 | 3.23 / 3.24 |
| Climatology | 1075 | 5.51 | 6.07 | 2.36 |
| Weekly climatology | 816 | 3.50 | 3.19 | 2.32 |
| IFS T42 | 489 / 743 | 3.09 / 3.83 | 3.21 / 3.69 | - |
| IFS T63 | 268 / 463 | 1.85 / 2.52 | 2.04 / 2.44 | - |
| Operational IFS | 154 / 334 | 1.36 / 2.03 | 1.35 / 1.77 | 2.36 / 2.59 |
| ResNet direct (CMIP-pretrained) | 268 / 523 | 1.65 / 2.52 | 1.42 / 2.03 | 2.16 / 2.30 |
| ResNet continuous (CMIP-pretrained) | 284 / 499 | 1.72 / 2.41 | 1.48 / 1.92 | 2.23 / 2.33 |

  Some climatology cells were garbled in extraction; the single values are given as climatology is lead-independent.

- WeatherBench 2020 baselines at 3/5 days: linear regression (direct) Z500 693/783, T850 3.19/3.44. CNN (direct) Z500 626/757, T850 2.87/3.37. CNN (iterative) Z500 1114/1559, T850 4.48/9.69, worse than persistence. The direct CNN is "only marginally better than weekly climatology" at 5 days. — [Rasp et al. 2020](https://arxiv.org/pdf/2002.00469)
- DLWP (about 1.9 deg cubed sphere): Z500 RMSE beats persistence at all leads and climatology out to more than 7 days, and beats IFS T42 at all leads. Z500 ACC drops below 0.5 just short of day 7 (S2S operational: 9.5 days). T2 RMSE stays below climatology until about day 8. — [Weyn et al. 2020](https://arxiv.org/pdf/2003.11927)
- Precipitation note from the table above: daily-ish precipitation persistence (3.23 mm) is worse than climatology (2.36 mm). The best ResNet (2.16 at day 3) is only about 8% better than climatology. — [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626)

### Inferences
- **Expectations for this project** (inference; these are not reported results):
  - Day 1: beating persistence on T2m/MSLP/TCWV by a meaningful margin is plausible, given that the global CNNs above cut day-3 persistence error by roughly 40-60% for temperatures. Precipitation should beat persistence easily, but its skill against climatology will be small.
  - Day 4: modest positive skill against max(persistence, climatology).
  - Day 8: near zero. The DLWP T2 crossover with climatology is about day 8, and that model had global information, 6-hourly steps and no boundary problem.
  - Reasons to expect lower skill here: no upper-air fields, a bounded domain, daily resolution and about 1/9 the samples.
  - Reasons to expect higher skill: tropical surface fields like T2m have small day-to-day variance, and climatology is easy to embed.
- Daily averaging reduces noise relative to 6-hourly snapshots, so day-1 persistence of daily means may be harder to beat than 6-hourly persistence. This is unverified.

### Gaps
- No fetched source reports skill for a regional daily emulator over India, or for surface-only (no upper-air) CNNs at 1 deg. No fetched source reports 1-day lead WeatherBench CNN numbers (tables are at 3 and 5 days).

## 5. Parameter counts, FLOPs and CPU latency for small CNNs on grids of about 1,000 cells

### Takeaway
Sourced parameter counts for the relevant small models are 313,858 (WeatherBench CNN), about 700k (DLWP U-Net), and 36.7M (GraphCast, for scale). Larger models run to hundreds of millions or more (SFNO about 10^8-10^9). No fetched source gives CPU latency for small models on about 1,000 cells. By FLOP arithmetic (my own), a sub-2M-parameter CNN on 32 x 36 should run 10 steps on 4 CPU cores in well under 1 s.

### Cited Findings
- WeatherBench CNN: 313,858 trainable parameters (5 layers, 64 channels, kernel 5). — [Rasp et al. 2020](https://arxiv.org/pdf/2002.00469)
- DLWP cubed-sphere U-Net: about 700,000 parameters (672,080 in Table 1). A 4-week global forecast takes under 0.2 s; a 1000-member 1-month ensemble about 3 minutes. — [Weyn et al. 2020](https://arxiv.org/pdf/2003.11927)
- GraphCast: 36.7M parameters. A 10-day forecast takes under 1 minute on one TPU v4. — [Lam et al. 2023](https://arxiv.org/pdf/2212.12794)
- SFNO (ERA5): parameter counts of about 4.3e8-2.2e9 by configuration (extraction garbled). About 500 ms per step on an A6000. — [Bonev et al. 2023](https://arxiv.org/pdf/2306.03838)
- Hi-LAM: a 57 h forecast (19 steps) on a 238 x 268 grid takes 1.5 s on one A100. — [Oskarsson et al. 2023](https://arxiv.org/pdf/2309.17370)
- Rasp & Thuerey ResNet: about 1 day of training per model on one GTX/RTX 2080, at 5.625 deg global with about 37 years of 6-hourly data. — [Rasp & Thuerey 2021](https://arxiv.org/pdf/2008.08626)

### Inferences
- **FLOP arithmetic for a 3x3 conv on 1,152 cells:** FLOPs is about 2 x 9 x C_in x C_out x 1,152.
  - 64 to 64 channels: about 85 MFLOP.
  - 128 to 128 channels: about 340 MFLOP.
- **Example model sizes:**
  - A 4-level U-Net at 32-64-128-256 channels on 32 x 36 (with downsampling) is roughly 1-2M parameters and about 1-2 GFLOP per step.
  - An 8-block 64-channel ResNet is about 0.6M parameters and about 1.4 GFLOP per step.
  - Either is about 10-20 GFLOP for 10 steps, which is sub-second to about 1 s on 4 cores in PyTorch/ONNX.
  - A full Rasp-size ResNet is about 5.6M parameters and about 13 GFLOP per step, about 130 GFLOP per 10 steps. That is a few seconds, risky against the 5 s limit.
  - These numbers are mine; measure on the target machine.
- **Training cost (inference).** 6,200 samples of 8-24 x 32 x 36 are tiny (well under 100 MB as float32). A small CNN epoch should take seconds on a T4 GPU and roughly a minute or less on CPU. Dozens of epochs plus 2-4 step fine-tuning therefore fit comfortably in a hackathon on any of the listed hardware. Rasp's 1-day GPU training was for about 37 years of 6-hourly global data and a much larger net.

### Gaps
- No primary source measured CPU inference latency for small CNN weather emulators. No source gives FLOPs for the WeatherBench CNN or DLWP.
