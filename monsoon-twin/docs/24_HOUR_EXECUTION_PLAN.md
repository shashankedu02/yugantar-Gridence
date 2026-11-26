# 24-hour execution plan

- **H0** = the official start of the 24-hour build window. The exact clock time and the submission deadline are **not stated in any official file**, so confirm them at the venue (`OPEN_QUESTIONS.md`).
- If the deadline is earlier than H24, compress by moving the freezes earlier and keeping their order.
- **Before H0 (allowed preparation):**
  - Download the data and wheel from the kit Release.
  - Install Python and the libraries on both PCs.
  - Pre-download wheels for the offline rehearsal.
  - Read these docs.
- Sleep well before the event. The plan has one 60-minute rest block per person, staggered so that two of the three people are always awake. During B1's rest, AUD keeps an eye on PC-A's training run.
- Build the Docker rehearsal image while internet is available (TESTING §6), **on both PCs**: rehearsals run on PC-B before H17 and on PC-A after it.
- **No project code before H0.** The event rules forbid pre-built code (`SOURCE_AUDIT.md` S-08).

## Critical path
```
data load ─► climatology/norm ─► DAP ─► G-DAP check H5.5 (safe submission only if it passes)
                    │
                    └─► LocalNet 1-step ─► rollout fine-tune ─► calibration ─► MODEL FREEZE H17
Engine stub ─► serve.py ─► validator ─► dashboard on live API ─► impact lens ─► CODE FREEZE H20
harness ─► shock battery ─► sandbox rehearsal ─► brief ─► SUBMIT
```
The longest chain is B1's training path. Everything else runs in parallel with it.

## Hour-by-hour

| Hour | B1 (model, PC-A) | B2 (systems/UI, PC-B) | AUD (audit, PC-B / browser) |
|---|---|---|---|
| **H0–0.5** | Set up the venv. Copy `india_climate_train.nc` to `data/` (gitignored). | Clone, venv, `pip install` the kit wheel + fastapi/uvicorn | Create the repo; branch rules; post the role list; confirm the deadline with organisers |
| **H0.5–1.5** | `twin/engine.py` **stub** (persistence) obeying the contract. `training/data.py`: load the `.nc`, inspect shapes and units, splits. | `serve.py` from the kit template, wired to `Engine`; 422 handling; CORS; `/meta`, `/climatology` stubs | *(off-keyboard, PC-B schedule)* Navigate B2's validator run; draft the test list and harness design |
| **H1.5** | ✅ **Checkpoint: contract stub passes the validator on `main`** | | |
| **H1.5–3** | `training/climatology.py` (366-day smoothed clim, norm stats, log1p tp stats, tendency std, core-zone rain mean/std); `training/fit_dap.py` (class with `.fit(...)`) | *(off-keyboard: AUD drives PC-B)* palette and layout decisions, the demo-case date list (2018–2019), a paper wireframe of the console; PR reviews | **PC-B driver (AUD block):** harness with its **own** loader and the kit's `monsoon_r1.stats.climatology` (D-20); `eval/shock_battery.py` (kit `causality_checks`); choose the regime and battery windows and **freeze `eval/windows_val.json` by H3**. → **first `[RESULT]`: reference skill, CSI, blur ratios** |
| **H3–5.5** | `twin/dap.py` + Engine uses DAP; export `weights/` (`climatology.npz`, `dap.npz`, `static.npz`, `norm.json`, `stats.json`, `model_card.json`) | `tools/make_demo_cases.py` (6–8 cases from **2018–2019** → JSON); dashboard skeleton (layout, canvas raster, colour LUTs, case loader); map stage: views (baseline / scenario / diff), timeline, colour bar, coastline from LSM | *(background on PC-B)* harness and battery on DAP as soon as it lands; clean-export scan; PR reviews |
| **H5.5** | 🔶 **Conditional checkpoint G-DAP.** DAP becomes the safe submission (tag `safe-dap`) **only if** the harness shows on the frozen validation windows (`eval/windows_val.json`): validity 100%; **mean day-4 skill vs persistence > 0**; null shock bit-identical; both kit shocks non-zero and localised on ≥ 5/6 battery windows; clean-export scan 15/15. **If day-4 skill ≤ 0 → fallback F0.** Until a build passes G-DAP, *we have no safe submission*; say so in the chat. | | |
| **H5.5–10** | `twin/net.py` LocalNet (width configurable); `training/train_localnet.py` P1 (1-step) for **LocalNet-64, then LocalNet-96**, same seed and epoch budget (EXP-1). Start training by ~H7. While it trains: write the rollout fine-tune and `calibrate.py`. **Rest block B1: 60 min while P1 trains.** | **H6.5–9.5 (B2 drives):** scenario builder (presets mirroring the kit shocks, brush); live calls through a one-at-a-time request queue; hover/click time series. *(Off-keyboard H5.5–6.5; **rest H9.5–10.5**.)* | **H5.5–6.5 (AUD block):** run G-DAP, then the first sandbox rehearsal (L5) on the DAP build; tests skeleton. **H6.5–9.5 (off-keyboard):** scientific review of DAP maps from saved figures; background jobs; navigator. **H9.5–10.5 (AUD block):** unit test that the harness equals the kit's functions, then EXP-1 scoring |
| **H10** | ✅ **Go/no-go = EXP-1 (P1 results):** DAP vs LocalNet-64 vs LocalNet-96 on the frozen windows, same scoring (MODEL_STRATEGY §3.7). The winner goes on to P2. **If no LocalNet passes the EXP-1 gates or beats DAP → fallback F1.** | | |
| **H10–14** | P2 rollout fine-tune (2 then 4 steps); export the candidate; timing on CPU | **H10.5–13 (B2 drives):** arrows for wind; Impact Lens v1 (break watch, departure, heavy-rain days, heat-anomaly days). *Stretch:* particles, isobars, ensemble. **H13–14 (off-keyboard):** brief page-2 notes. *(B2's rest block was H9.5–10.5.)* | **H10.5–11.5: AUD rest block.** **H13–14 (AUD block):** full harness + battery on the candidate; timing in the sandbox; post the comparison table |
| **H14** | ✅ **Checkpoint: candidate merged** if its local Stage-1 estimate > DAP's and the gates pass | | |
| **H14–17** | P3 calibration (drizzle floor, tp CSI, variance) on validation; battery again; final test-set check (2020–21) **once** | Polish: energy-vs-distance chart, export PNG, method popovers, error states, offline check; stretch items if time | *(background on PC-B)* battery on the calibrated model; collect brief numbers and figures (written up on PC-A after H17). **Sandbox rehearsal 2** in an agreed 15-minute slot: B2 pauses so the timing isn't skewed. |
| **H17** | 🧊 **MODEL FREEZE**. `weights/MANIFEST.md` final. | | |
| **H17–20** | **H17–18: B1 drives PC-A** (README "how to train and run"; reproducibility smoke test in a fresh clone: regenerate climatology/DAP, 1 epoch of LocalNet training). **From H18:** B1 navigates for AUD on PC-A and supplies the brief's page-1 text | Dashboard bug fixes only; capture figures for page 2; record a backup screen video of the demo, made from live calls | *(H17–18 off-keyboard: brief outline)* **From H18, AUD drives PC-A:** scientific review; fill the brief; the demo hostile-question drill |
| **H20** | 🧊 **CODE FREEZE** (only docs, brief and the demo script after this) | | |
| **H20–22** | Demo rehearsal ×2 (live judge shock) | Demo rehearsal ×2 | Brief PDF final (2 pages); `SUBMISSION_CHECKLIST.md` full run; final sandbox rehearsal 3 from a fresh `git clone` |
| **H22–23** | Submit: repo URL (public, check in incognito), brief PDF, any form fields | | |
| **H23–24** | Buffer. **No pushes** unless the checklist found a gate-breaking bug. | | |

**Who is at which keyboard:** B1 drives PC-A until H17. PC-B alternates between B2 and AUD in fixed blocks, and AUD moves to PC-A after H17. See `TEAM_WORKFLOW.md` §2. The AUD column above is scheduled into those blocks or run as background jobs.

## Fallback decisions (decided now, so nobody argues at 3 a.m.)
| ID | Trigger | Action |
|---|---|---|
| **F0** | G-DAP fails: DAP does not beat persistence at day 4 (or fails another G-DAP item) | (1) **Bug hunt first, max 30 min (AUD + B1):** check output alignment (T-API-11: `rollout[0]` is day +1), the doy decoding, the climatology index for each lead, the units (tp mm/day), and that the harness's persistence reference is `init_states[-1]`. (2) **Lead-wise blend (DAP-LW):** x̂_k = x₀ + w_k,c · (clim(d0+k) − x₀), with one weight per lead and channel (per cell if stable), fitted by least squares on training years. w = 0 is exactly persistence and w = 1 is climatology, so on training data the fit cannot be worse than persistence. Out-of-sample this is **[UNVERIFIED]** and must be re-scored on the same frozen windows. (3) **If DAP-LW also fails:** there is no safe submission. LocalNet becomes the only route to qualification. B2 freezes new dashboard features until a LocalNet candidate passes the gate (B2 still keeps `serve.py` green), and AUD re-checks every gate item on each candidate. Log the outcome as a `[DECISION]`. |
| **F1** | At H10, no LocalNet passes the EXP-1 gates or beats DAP | If only locality fails: try B = 3, C = 64 (D-16 as amended by D-21), 1-step only. If skill is the problem: keep the better LocalNet's P1 and do P2 only if time allows. If still worse than DAP at H14, **ship DAP** (if it passed G-DAP) and use the remaining time on dashboard and brief. |
| **F2** | No GPU on either PC | C = 64, B = 4. Train 1-step on CPU with batch 64 for a fixed time budget (~2.5 h). Rollout fine-tune for 2 steps only. Use Kaggle/Colab only if venue internet is reliable. |
| **F3** | Propagation fails on S1/S2 but everything else passes | Accept it (lose ≤ 3.75 points). Do **not** add tricks that fake spreading. It would be visible in the demo and it is scientifically dishonest. |
| **F4** | The day-8 blur ratio for tp, u10 or v10 is < 0.4 | Apply variance restoration (MODEL_STRATEGY §4) only if validation skill holds; otherwise accept the partial credit |
| **F5** | Timing > 2 s for 10 steps in the sandbox | Reduce C, or export to ONNX Runtime (available in the sandbox); set threads to 4 |
| **F6** | Dashboard behind schedule at H17 | Particles, isobars and ensemble are already stretch goals. Cut, in this order: ensemble → isobars → particles (keep arrows) → small multiples. **Never cut:** live baseline/scenario/difference and the Impact Lens. |
| **F7** | Claude usage limit hit | B1 keeps Claude; B2 continues manually or with another tool; AUD stays on Antigravity |
| **F8** | Late in the event, a gate check fails on `main` | Revert `main` to the last green tag (`safe-dap` exists only if G-DAP passed; else `cand-*`). Tag every green state. |

## Stop-experimenting rule
After **H17** no new architecture, loss or feature on the judged path. After **H20** no code. After **H23** no push, unless a gate-breaking bug was found by the checklist.
