# Project overview: MonsoonTwin

## Problem
- Weather apps answer "will it rain tomorrow?". Track 2 asks for a **climate digital twin**:
  - a fast model that evolves India's surface atmosphere day by day
  - the ability to answer "what if?" when the starting state is changed locally
- The reference is the organisers' ERA5-derived dataset: 2005–2021, daily, 1°, 32 × 36 cells over 6.5–37.5 N and 65.5–100.5 E, with 6 variables.

## Objectives
1. **Forecast:** from 3 days of state, produce a stable 10-day rollout that beats both persistence and climatology, including heavy rain.
2. **Branch:** propagate a localised shock causally: local first, spreading at a finite speed, stable, and no change for a zero shock.
3. **Show:** a live, offline, premium dashboard for baseline, scenario and difference views.
4. **Matter:** a Monsoon Impact Lens (break watch, rainfall departure, heavy-rain and heat-anomaly proxies) with honest uncertainty.
5. **Qualify and rank:** pass the automated gate, then reach the Top 10 and aim for the Top 2.

## Scope
**In scope:**
- the LocalNet emulator and DAP fallback
- the training pipeline
- the FastAPI server
- the static dashboard
- the impact lens
- the eval harness
- the 2-page brief

**Out of scope:**
- global or pressure-level modelling
- probabilistic training (CRPS/diffusion)
- hosting
- real-time data feeds (forbidden anyway)
- political boundary maps

## Success criteria
| Level | Criterion | Measured by |
|---|---|---|
| Must | Gate passed on our local replica (validity 100%, day-4 > persistence, localised shock, null identical) | `eval/harness.py` |
| Must | Repo scan 15/15; sandbox rehearsal passes | kit `repo_scan`, L5 |
| Must | Dashboard runs live and offline | L6 |
| Should | Local Stage-1 estimate ≥ 70/85 (excluding the brief) | harness |
| Should | Both shocks pass all 4 causality checks on ≥ 5/6 validation windows | battery |
| Could | CSI skill ≥ 0.10 at day 1 | harness |

These are targets, not results. Nothing has been trained yet.

## Document map
| Need | Read |
|---|---|
| Rules | `CLAUDE.md`, `COMPETITION_REQUIREMENTS.md` |
| How points are earned | `EVALUATION_STRATEGY.md` |
| What we build | `SYSTEM_ARCHITECTURE.md`, `MODEL_STRATEGY.md`, `SHOCK_AND_DYNAMICS.md`, `UI_UX_SPECIFICATION.md` |
| How we work | `TEAM_WORKFLOW.md`, `CONTRIBUTION_GUIDE.md`, `24_HOUR_EXECUTION_PLAN.md` |
| How we check | `TESTING_AND_VALIDATION.md`, `SUBMISSION_CHECKLIST.md` |
| What could go wrong | `RISK_REGISTER.md`, `OPEN_QUESTIONS.md` |
| Judges | `DEMO_AND_JUDGING.md`, `brief/BRIEF_TEMPLATE.md` |
| Evidence | `SOURCE_AUDIT.md`, `research/RESEARCH_REPORT.md`, `research/BIBLIOGRAPHY.md`, `DECISION_LOG.md` |
