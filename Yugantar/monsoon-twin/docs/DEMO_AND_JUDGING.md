# Demo and judging

## 1. Seven-minute demo flow (desk review)
| Min | Beat | On screen | Say (in short) |
|---|---|---|---|
| 0:00 | Hook | Console, July case, rain field day 0 | "MonsoonTwin is a 1° digital twin of India's surface weather. It rolls forward day by day on a laptop CPU in [measured] ms per 10 days, and lets you branch the timeline." |
| 0:40 | Timeline Prime | Run baseline and play days 1–10 | "Every frame comes from our `/simulate`, live. Here is the inference time." Point at `inference_ms`. |
| 1:30 | Skill | One slide or panel: validation skill vs persistence and climatology, days 1/4/8, from `eval/reports` | "Measured with the organisers' own scoring code on held-out years." |
| 2:15 | Multiverse | Preset Monsoon stall, Run, Difference view, days 1 → 8 | Describe **only what the battery measured**, e.g. "Day 1: [near-fraction]% of the change stays near the box. By days 4–8 it spreads [measured direction]. Each step can only reach about 9 cells, so the spread speed is bounded (architectural bound, **[ESTIMATED]**)." |
| 3:15 | Judge's shock | Hand the judge the brush: any channel, place and size | Let them choose, then Run. Read out stability (max Δ in std units) and locality from the energy-vs-distance chart. |
| 4:15 | Impact Lens | Monsoon Break Watch, rain departure, heavy-rain days, baseline vs scenario | "A 40% weaker Arabian Sea jet cuts west-coast rain by X% over 10 days, and the core-zone index moves toward break." Use measured numbers only. |
| 5:15 | Uncertainty | Ensemble on | "Spread from initial-condition sensitivity: honest but under-dispersive." |
| 5:45 | Engineering | Architecture diagram | Bounded reach by design (locality as **measured** by the battery: [result]), residual updates, log-rain, DAP fallback, deterministic null |
| 6:30 | Limits | One slide | See §4 |

**Backups:**
- A screen recording of the same flow made from live calls, used only if the hardware fails. Say that it is a recording.
- The DAP engine, if LocalNet won't load.

## 2. Pre-demo checklist
- Server running from a fresh clone; validator green.
- Dashboard on `localhost:5500`; Wi-Fi off test passed.
- Laptop on power; display at 1920×1080; font sizes checked on the projector.
- `eval/reports/final.md` open in a tab for numbers.

## 3. Expected judge questions with honest answers
Fill the measured numbers from reports. **Never guess a number in front of judges.**

| Question | Answer outline |
|---|---|
| Why a CNN and not a transformer or GraphCast? | 6,200 days of data and a bounded box. Global-mixing models can spread a local change across the whole grid in one step (**[ESTIMATED]** from architecture, not measured by us), assume periodic or spherical domains, and need far more compute [B6–B9]. A local residual CNN matches both the data size and the causality test. |
| How do you stop drift and explosion? | Residual updates in normalised tendency units; rollout fine-tuning over 4 steps; physical guards; a DAP fallback per step; rain in log1p space so it can't go negative. |
| How do you stop blur? | Monitor the day-8 variance ratio; limit the rollout horizon in training; per-lead variance restoration accepted only if skill holds. We report the trade-off with RMSE honestly. |
| How does heavy rain work? | log1p target, a heavy-rain auxiliary head with class weighting [B15], and per-lead calibration that maximises CSI on validation. |
| Is the shock response physical? | Show the signs: Bay warming gives more moisture, lower pressure and more rain nearby. The Arabian Sea wind cut reduces west-coast rain. Admit where it isn't, e.g. the warm anomaly decays because t2m over the sea isn't held fixed like SST. |
| What happens at the domain edges? | No boundary data. Replicate padding, an edge-distance input, and the climatology prior. Show the edge-skill map. |
| What if I perturb rain to negative values? | Inputs are clamped after the shock; the output is always valid. |
| Is the zero shock really zero? | Bit-identical: deterministic CPU inference. Show the test. |
| Why should we trust the skill numbers? | Kit scoring functions; held-out 2018–19 validation; 2020–21 test touched once; numbers from `eval/reports`. |
| Isn't this just climatology plus persistence? | Show the EXP-1 table (DAP vs LocalNet-64 vs LocalNet-96), and the propagation results **only if the battery measured them**. |
| What would you do with more time? | CRPS or diffusion ensembles for sharpness, a larger domain with boundary forcing, pressure levels, SST as a forcing field, IMD gauge-based rain for verification. |
| Can it predict a heatwave? | It predicts daily-mean temperature anomalies. IMD heatwaves are defined on station maximum temperature, so we show a labelled "heat-anomaly" proxy. |

## 4. Honest limitations (put them in the brief and on the last slide)
1. 1° daily means: no sub-grid extremes, no diurnal cycle, and no daily maximum temperature.
2. Surface-only state: no vertical structure, no SST forcing, no radiation.
3. No lateral boundary information, so edges are less reliable.
4. Trained on ERA5 2005–2021; ERA5 rain differs from IMD gauges [B18].
5. A deterministic model under-represents extremes and blurs at long leads.
6. The ensemble covers initial conditions only, so it is under-dispersive [B28].
7. Shock responses are statistical-dynamical emulation, not causal physics; the warm-ocean anomaly isn't sustained.

## 5. Hostile-judge drill (AUD runs it at H20–22)
AUD applies five unseen shocks, chosen without telling the builders, and asks five unscripted questions from §3. Every wobble becomes a fix to the script or the UI, never to the model after the freeze.
