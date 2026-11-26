# Open questions, dependencies and downloads

## A. Ask the organisers (at H0, via the official Yugaantar WhatsApp channel or a desk)
1. The exact start of the 24 h window and the **submission deadline** (date and time, timezone). The aggregator mentions a "Day 1 code freeze 09:00 AM".
2. Is prepared **documentation** (no code) allowed in the repo at the start? Must the repo be public from the start, or only by the deadline?
3. Does Track 2's Round 1 mean the automated model evaluation described in the kit? (The aggregator describes a design-document Round 1.)
4. May the dashboard ship a few 3-day initial-state samples (JSON) from the training data, for the demo?
5. How is skill averaged across channels and leads (mean over channels and leads per window)? Is the climatology reference the kit's `stats.climatology` on 2005–2021?
6. Is `doy` in `doy_sincos` 0- or 1-based (Jan 1 = 0 or 1)?
7. Is the brief submitted as a separate PDF upload, or inside the repo?

## B. Decisions the team must confirm (blueprint approval)
1. Approve the architecture (D-01…D-24 in `DECISION_LOG.md`).
2. Who is B1, B2 and AUD?
3. Which PC is PC-A? **Does either PC have an NVIDIA GPU (model, VRAM)?** This changes the training plan: the base plan with a GPU, fallback F2 without one.
   - Is there any third device (laptop) for AUD? If yes, the PC-B schedule in `TEAM_WORKFLOW.md` §2 is not needed.
4. The team name and the repo name. The proposed folder name is `monsoon-twin`.

## C. Downloads to do BEFORE H0 (official assets, allowed)
| Item | URL | Size | Put it |
|---|---|---|---|
| Training data | https://github.com/OfficialAbhinavSingh/yug-monsoon-kit/releases/download/v1.0.0/india_climate_train.nc | 117 MiB | `D:\Yugantar\data\` (outside the repo; later copied to the gitignored `data/`) |
| Normalisation stats | …/v1.0.0/stats.json | 355 B | same |
| Kit wheel | …/v1.0.0/monsoon_r1_kit-1.0.0-py3-none-any.whl | 23 KB | install on both PCs |
| Contract (copy) | …/v1.0.0/API_CONTRACT.md | 6 KB | same as docs/R1_CONTRACT.md |
| Python 3.11 + wheels | python.org / PyPI | – | both PCs: torch (CPU or CUDA build), numpy, scipy, pandas, xarray, netCDF4, fastapi, uvicorn, scikit-learn, onnxruntime, pytest |
| Docker rehearsal image `mt-sandbox` | Built from `D:\Yugantar\rehearsal\Dockerfile` (TESTING §6), with CPU torch from download.pytorch.org/whl/cpu. Docker builds Linux wheels even on Windows. A Windows `pip download` would fetch Windows wheels, which are useless in Linux. | ~1–2 GB | outside the repo |
| Fonts (Inter, JetBrains Mono; OFL) and optional chart library (ECharts, Apache-2.0) | official sites / npm | small | vendored into `dashboard/vendor/` **during** the event |
| Docker Desktop (for the L5 rehearsal) + pre-pulled `python:3.11-slim` + built `mt-sandbox` image | docker.com | – | **both PCs** (PC-B before H17, PC-A from H18) |

## D. Unknowns that only measurement can settle (first hours of the event)
- Persistence, climatology and DAP skill and CSI on validation.
- Day-8 variance ratios for each channel; whether the dry-window trap exists in the data.
- LocalNet CPU latency and training time on our hardware.
- Shock-battery results for each candidate.
