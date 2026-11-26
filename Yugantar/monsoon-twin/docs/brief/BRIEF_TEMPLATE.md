# 2-page brief template (fill from eval/reports only)

This is a template: every `[…]` must be replaced with measured values or removed.
- **Target:** A4, 2 pages, 10–11 pt.
- **Owner:** AUD owns and edits this file. B1 supplies the page-1 text and B2 the page-2 text, by chat or PR comment.

---
## PAGE 1: MonsoonTwin: a local, causal digital twin of India's weather
**Team** […] · **Repo** […] · **Track 2: Multiverse of Monsoon**

**USP (2 lines).** [For example: a CPU emulator answering in [measured] ms, whose per-day reach is bounded (≤ 9 cells), so causes travel at a finite speed. [Only if measured:] this was measured with the organisers' own causality tests. A safety model guarantees valid output.]

**Architecture** (figure: the diagram from SYSTEM_ARCHITECTURE §2, simplified)
- Inputs: 3 days × 6 channels, target-day climatology, static maps, day of year, latitude, edge distance.
- LocalNet: stem + 4 residual blocks (3×3, per-pixel LayerNorm), [params] parameters, receptive field 9 cells per day.
- Residual update in tendency units; rain in log1p space (never negative).
- Training: 1-step, then a 4-step rollout fine-tune. Train 2005–17, validation 2018–19, test 2020–21.

**Preventing drift and blur**
- [residual updates; rollout fine-tune; guards; DAP per-step fallback]
- Day-8 variance ratios: t2m […] tp […] u10 […] v10 […] msl […] tcwv […] (validation)
- [variance or CSI calibration, only if used]

**Results** (validation and test, kit scoring functions)
| Lead | Skill vs best ref | CSI skill | (per-channel in appendix/repo) |
|---|---|---|---|
| Day 1 | […] | […] | |
| Day 4 | […] | […] | |
| Day 8 | […] | […] | |
Shock tests: warm_ocean [pass/fail per check], monsoon_stall […], null: bit-identical. CPU time: [ms] for 10 steps.

**Failure modes we know about**
[edges without boundary data; under-predicted extremes; warm anomaly not sustained; ARCO vs training regridding shift; ensemble under-dispersive]

---
## PAGE 2: Visualization and impact
**MonsoonTwin Console** (figure: screenshot of the Difference view, days 1/4/8, from a live call)
- Baseline / Scenario / Difference / Split views; a shock brush; wind particles; isobars; a coastline from the model's own land-sea mask.
- An energy-vs-distance chart: the judge's locality and propagation metric, live.

**Monsoon Impact Lens**
- Monsoon Break Watch (core zone 18–28 N, 65–88 E; Rajeevan et al. 2010 criterion): [result under monsoon_stall]
- Rainfall departure (IMD bands), heavy-rain days (≥ 10 and ≥ 64.5 mm/day grid-mean), heat-anomaly days (labelled proxy)
- Uncertainty: an 8-member initial-condition ensemble (labelled sensitivity, not probability)

**Use case story** [e.g. a state agriculture department asks: "if the Arabian Sea jet weakens next week, which districts' kharif rain drops most?" Show the numbers.]

**Honesty box:** limitations (1° daily means, no Tmax, ERA5 vs IMD, deterministic model).

**Data:** Contains modified Copernicus Climate Change Service information (ERA5). Key references: [3–5 from BIBLIOGRAPHY].
