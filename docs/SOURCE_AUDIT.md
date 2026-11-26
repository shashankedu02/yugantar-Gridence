# Source audit and verification register

Audit date: 26 Nov 2026.
- **Auditors:** local inspection of `D:\Yugantar` plus online checks (research notes in `docs/research/notes/official_sources.md`).
- **Status labels:**
  - **Verified**: content read
  - **Found, not read**: located but not opened
  - **Not found**

## 1. Register

| ID | Resource | Location / URL | Status | Key findings | Open questions |
|---|---|---|---|---|---|
| S-01 | Track 2 problem statement PDF | `D:\Yugantar\Yugaantar DevForge Tracks (2).pdf` (3 pages of text; no embedded links or images with content) | **Verified**, full text extracted | Mission, API, limits, scoring table, ground rules. See COMPETITION_REQUIREMENTS. Mentions `API_CONTRACT.md` and "Releases page" but **contains no URLs**. | Deadline not stated |
| S-02 | General tracks PDF | `D:\Yugantar\Yugaantar DevForge Tracks.pdf` | **Verified** | Universal submission (repo + 2-page brief with USP and architecture); funnel: Top 10 → desk review → Top 2 → Round 3 finals (8 teams) | – |
| S-03 | Kit repo (local copy) | `D:\Yugantar\yug-monsoon-kit-main` | **Verified**: every file read | contract.py, scoring.py, repo_scan.py, client.py, schema_validator.py, build_dataset.py, stats.py, template/serve.py, R1_CONTRACT.md, README, NOTICE, LICENSE (MIT), pyproject (monsoon-r1-kit 1.0.0) | – |
| S-04 | Kit repo (public) | https://github.com/OfficialAbhinavSingh/yug-monsoon-kit | **Verified** (cloned during online research, 26 Nov 2026; see research/notes/official_sources.md) | 1 commit `689c879` (26 Nov 2026 03:03 IST), tag v1.0.0. `monsoon_r1/` identical to the local copy. | Owner affiliation not checked |
| S-05 | Release v1.0.0 assets | `https://github.com/OfficialAbhinavSingh/yug-monsoon-kit/releases/download/v1.0.0/<name>` | **Verified** (online check 26 Nov 2026: HTTP headers; small files read) | `india_climate_train.nc` 122,831,709 B (~117 MiB); `monsoon_r1_kit-1.0.0-py3-none-any.whl` 23,182 B; `stats.json` 355 B; `API_CONTRACT.md` 6,245 B | Full asset list not seen (Releases page rate-limited) |
| S-06 | `API_CONTRACT.md` | Release asset | **Verified** (online check 26 Nov 2026, SHA-256 compared) | **Byte-identical** (SHA-256) to `docs/R1_CONTRACT.md`. The PDF's file name is just this second copy. | – |
| S-07 | `stats.json` | Release asset | **Verified** (online check 26 Nov 2026; re-check after downloading) | channels [t2m, tp, u10, v10, msl, tcwv]; mean [292.3568, 3.6181, 0.8877, 0.1913, 101122.08, 30.0335]; **std [13.4636, 7.5533, 2.8990, 2.4270, 619.02, 20.4944]**. Dynamic channels only. | These std values are what the judge uses for shock energy, the 5-std stability check and the null tolerance (assuming the judge loads this file, as scoring.py says) |
| S-08 | Event listing (aggregator, **secondary**) | https://www.startupgrantsindia.com/competitions/the-devforge-hackathon | **Verified** (secondary only) | Host: Scaler School of Technology (SST), Bengaluru. 3 Oct–27 Nov 2026; Round 2 is a 24 h offline event at SST with desk judging (PPT walkthrough, live demo, codebase analysis); ₹50k prizes; teams of 2–4. **All code must be written during the hackathon**; disqualification for pre-built projects, cloned repos, fabricated git history, or mock-ups or pre-rendered videos presented as live software. "Day 1 code freeze: 09:00 AM". | Round-1 description (a design doc) differs from the kit's. The rules for this track need confirming via the official WhatsApp channel. |
| S-09 | Official event page (Unstop / SST / social) | – | **Not found** | – | Ask organisers |
| S-10 | ISRO BAH 2026 grand-finale page | https://www.isro.gov.in/Bharatiya_Antariksh_Hackathon_2026_Grand_Finale.html | **Verified** | BAH 2026 with 15 problem statements; one was "AI-powered digital twin of India's climate" (via Business Today). The PS number "5" is unconfirmed. | – |
| S-11 | WeatherBench 2 data guide | https://weatherbench2.readthedocs.io/en/latest/data-guide.html | **Verified** (partial) | ERA5 stores end 2023-01-10 18:00, which explains why hidden windows come from ARCO-ERA5 | The exact 360×181 store name was not seen in the part read |
| S-12 | ARCO-ERA5 | https://github.com/google-research/arco-era5 | **Verified** (partial) | 0.25° hourly ERA5, 1979–present, on Google Cloud | – |
| S-13 | ERA5 licence | https://apps.ecmwf.int/datasets/licences/era5 | Found, not read | Kit NOTICE asserts CC BY 4.0 | Use the NOTICE wording for attribution |

## 2. Official requirements vs our recommendations
- **Official requirements:** only S-01, S-02, S-03/04/05/06/07, plus the secondary S-08 for event rules. These are collected in `COMPETITION_REQUIREMENTS.md`.
- **Findings from the starter resources:** behaviour of the kit code, e.g. the repo-scan regexes and the causality maths. Tagged [CODE] and [TEST].
- **Our recommendations:** everything in SYSTEM_ARCHITECTURE, MODEL_STRATEGY, UI_UX, the plan and the workflow. Tagged [REC].
- **Assumptions needing confirmation:** listed in §5 and in `OPEN_QUESTIONS.md`.

## 3. Discrepancies found
| # | Discrepancy | Resolution |
|---|---|---|
| D1 | The PDF cites `API_CONTRACT.md`, but the kit has `docs/R1_CONTRACT.md` | Same file (S-06) |
| D2 | The contract text talks about public URLs, tunnels and 48 h uptime, and also says "Default: the organisers run your repo themselves, offline". The PDF says no public URL is needed. | Follow the PDF and the default: offline run of our repo. No hosting. |
| D3 | `repo_scan` accepts a Hugging Face link as a checkpoint, but the PDF says a link alone is not enough | Weights inside the repo (PDF is stricter) |
| D4 | The aggregator's Round 1 is a design doc and it says code is written only during the event; the kit describes a trained-model Round 1 | Treat the 24 h event as the build window. Confirm with organisers. Our blueprint contains no code. |
| D5 | The PDF library list omits `gunicorn`; the contract includes it | Irrelevant (we use uvicorn) |
| D6 | The general PDF asks the brief to cover USP and architecture; the Track 2 PDF fixes page 1 = model design, page 2 = visualization and impact | Do both (brief template) |

## 4. Kit behaviour verified by running it [TEST]
- **Environment:** Python 3, numpy 2.5.3, scipy. Kit `monsoon_r1` copied to a scratch directory, never into our repo.

**4.1 Repo scan on mock repositories** (`repo_scan.scan`):
| Mock repo | Points | Flag / effect |
|---|---|---|
| serve.py (route) + twin/ package + train.py (`loss.backward()`) + weights/model.pt + dashboard/index.html + README | **15.0** | none |
| as above + `# trained on WeatherBench2 ERA5` in `twin/model.py` | **7.0** | critical: external data source in inference code |
| as above + `datetime.date(2000,1,1)` in `twin/model.py` | 13.0 | warn: hardcoded dates (0 literals, the call itself triggers it) |
| 3 ISO dates in a comment in `twin/model.py` | 13.0 | warn |
| `twin/data.py` with 5 date literals, imported relatively by `twin/model.py` | 7.0 | critical (relative imports are followed) |
| `from monsoon_r1 import stats` in `twin/` (kit installed, not in repo) | 15.0 | not followed (not local). **But the kit isn't available in the judge sandbox**, so never import it in inference. |
| eval script containing `/simulate` that imports train.py (3 dates) | 10.0 | train.py became "inference": dates warned, training_pipeline false |
| a python dashboard with `import plotly` that calls `/simulate` | 13.0 | server_separate_from_ui false |
| a comment `# dashboard uses plotly` in serve.py | 13.0 | server_separate_from_ui false |
| a `.nc` file in the repo | 13.0 | warn |
| a (401,6,32,36) `.npy` file | 7.0 | critical archive |
| a (366,6,32,36) `.npy` climatology, or a (3,6,32,36) case | 15.0 | fine |
| weights only as `.npy` | 6.5 | critical: no checkpoint (`.npy` is not a weight extension) |
| *(independent audit)* a test file that spells out `/simulate` and the forbidden words | 5.0 | it becomes "inference"; critical + UI flags |
| *(independent audit)* an eval file with a `"simulate"` dict key and 5 dates | 4.0 | the quoted word matches the route pattern |
| *(independent audit)* the working folder with `data/*.nc` present | 10.0 | the scanner ignores `.gitignore` |
| *(independent audit)* DAP fit in plain numpy, no LocalNet trainer yet | 12.0 | training_pipeline false; a `.fit(` call fixes it |
| no dashboard folder | 14.0 | frontend_present false |

(Mock files that weren't valid Python silently broke import tracing during the first try, which is a reminder that the scanner uses `ast.parse`: **a syntax error in serve.py hides its imports from the scan**.)

**4.2 Causality checks on synthetic responses:** results are in `SHOCK_AND_DYNAMICS.md` §2. Main lesson: an amplitude decay faster than ~25%/day fails "propagates".

**4.3 Scoring constants** (scoring.py):
| Constant | Value |
|---|---|
| SS_REF | 0.12 |
| CSI_SS_REF | 0.10 |
| RAIN_THRESH | 10 |
| BLUR ratio | 0.40–2.5 |
| NULL_TOL | 1e-3 |
| NONZERO_MIN | 1e-3 |
| LOCAL_MIN_FRAC | 0.60 |
| DILATE | 3 |
| MAX_SPEED | 8 cells/day |
| STABLE_MAX | 5 std |
| Teleport fraction | < 0.05 |
| Growth | > 1.5× and > 2% |

## 5. Unresolved items (need organisers or measurement)
1. The submission deadline and the start of the 24 h window (the aggregator mentions "Day 1 code freeze 09:00 AM").
2. Whether a private repo is allowed until the deadline. We plan public from H0.
3. How the grader aggregates skill across channels and leads per window. The orchestration code is not shipped.
4. Which real window carries the 3 shocks.
5. The day-of-year convention (0- or 1-based) in `doy_sincos`.
6. Whether the grader's climatology reference equals the kit's `stats.climatology` recipe on 2005–2021. Very likely, but not shown.
7. Whether the Release has assets beyond the 4 probed.
8. ERA5 CC BY 4.0 confirmation from the primary page (low importance; NOTICE wording suffices).
