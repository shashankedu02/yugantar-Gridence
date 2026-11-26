# Independent documentation audit and resolutions

An independent reviewer, who had not seen the drafting, audited the blueprint on 26 Nov 2026 against the PDFs and the kit code. It ran the kit's scanner and scorer on mock repos. **All findings below were resolved in the current docs.** The original report follows the resolution table.

| Finding | Resolution (where) |
|---|---|
| C1 grep test trips the scanner | CLAUDE §4.3; TESTING L0 (tests import patterns from `monsoon_r1.repo_scan`) |
| C2 quoted `'simulate'` also marks inference | CLAUDE §4.1; TESTING §2; CONTRIBUTION §4 |
| C3 negative rain after post-processing | CLAUDE §3.6/§3.8; SYSTEM §5 final clamp; MODEL §4; test T-API-10 |
| M1 DAP-only scan 12/15 | DAP via a `.fit(...)` method (CLAUDE §4.8, MODEL §5); re-verified as 15.0 on a mock |
| M2 scanning the working folder | Clean-export scan everywhere (CLAUDE §4.11, D-19, T-REP-0, checklist B) |
| M3 "no-teleport by construction" | Reworded: bounded reach ≤ 9 Chebyshev / ~12.7 diagonal, verified by the battery (CLAUDE §3.1, MODEL §3.2, SHOCK R-S2, SYSTEM §1, D-01, brief, demo) |
| M4 freeze conflict | Calibration ends at H17; nothing in `weights/` or `twin/` changes after it (CLAUDE §6, TEAM §5) |
| M5 P4 retrain | Dropped (D-17) |
| M6 Engine start-up | Fatal only if climatology/DAP/static/stats are missing; LocalNet failure falls back to DAP (SYSTEM §4.1) |
| M7 endpoints without Engine methods; wrong std | `core_zone_rain_stats`, `channel_std` (stats.json verbatim), `model_card` added (SYSTEM §4.1–4.2) |
| M8 ownership conflicts | One table in CLAUDE §1; others point to it |
| M9 parallel calls / ensemble timeouts | One-at-a-time queue, 15 s per request, N = 4 default (UI §4, D-18, T-DASH-3, T-API-12) |
| M10 rehearsal recipe broken | Rewritten: Docker image with CPU torch, internal network, import check (TESTING §6, OPEN_QUESTIONS C) |
| M11 missing tests | T-REP-0, T-API-10/11/12, T-CAU-1b, T-DASH-3 |
| M12 plan realism | Rest blocks; independent harness loader; first L5 after H5.5; particles/isobars/ensemble as stretch; 1-epoch reproduction smoke test |
| m1–m17 | Model size 0.7M; latency target ≤ 1.5 s / acceptance ≤ 2 s; hours aligned; 0.98 floor; D-16 for F1; b64 in CLAUDE §2; date-call no-boundary note; S6 → 30 mm/day, S8 covers 50 mm/day; demo cases from 2018–19; .gitignore caches; README full NOTICE; `<val est>` placeholder; online-check labels in SOURCE_AUDIT; Pangu cites B43; CORS `allow_origin_regex`; rescale wording; weak Windows read-only note |

---
# Audit report: MonsoonTwin preparation blueprint

Scope: CLAUDE.md, README.md, .gitignore, docs/*.md, docs/brief/BRIEF_TEMPLATE.md, docs/research/BIBLIOGRAPHY.md. Checked against the Track 2 PDF, the general PDF, R1_CONTRACT.md and the kit code (scoring.py, repo_scan.py, contract.py, client.py, schema_validator.py, stats.py, template/serve.py, build_dataset.py).
Method: I read every file and ran the kit's own `repo_scan.scan` and `scoring.causality_checks` on mock repos and synthetic fields (numpy/scipy, `python -I`). No blueprint file was edited.
Note: the blueprint files changed while the audit was running (last change 14:11:19 IST). All quotes below come from a snapshot taken after that time, and the snapshot's checksum matches the current files.

---

## CRITICAL (writing it as the docs describe loses points or fails the gate)

**C1. The planned `tests/test_repo_rules.py` would trip the scanner itself (repo score 5.0).**
- File: TESTING_AND_VALIDATION.md L0 and T-REP-1: "`tests/test_repo_rules.py` (grep rules from CLAUDE.md §4)"
- Problem: a grep test naturally contains the literal `"/simulate"` (to check that only serve.py has it) plus the forbidden words. The `/simulate` literal makes the test file an inference file, so the forbidden words become critical flags, and `plotly`/`streamlit` set `server_separate_from_ui=false`. Mock run: **5.0/15**.
- Fix: never write these strings literally in tests. Import `EXTERNAL_WEATHER`, `ROUTE_RE` and `DATE_RE` from `monsoon_r1.repo_scan`, or keep the grep in a shell script or CI YAML, not in a `.py` file.

**C2. Repo-scan rule 1 is incomplete: quoted `'simulate'` / `"simulate"` also marks a file as inference (repo score 4.0).**
- CLAUDE.md §4: "**Only `serve.py` may contain the string `/simulate`** … Never write that literal in `eval/`, `tests/`…"
- TESTING §2: "Eval code may contain dates, because it never contains the string `/simulate`."
- Kit: `ROUTE_RE = [/'"]simulate['"]|/simulate\b` also matches `getattr(e, 'simulate')`, `{"simulate": …}` and `parametrize("simulate")`.
- Mock: an `eval/harness.py` with a `"simulate"` key and 5 window dates scored **4.0** (critical hardcoded dates, and the training pipeline was hidden).
- COMPETITION_REQUIREMENTS §7 states the rule correctly, so CLAUDE.md, the authoritative file, contradicts it.
- Fix: in CLAUDE §4.1, TESTING §2 and T-REP-2, forbid any `.py` outside serve.py from containing `/simulate`, `'simulate'` or `"simulate"`.

**C3. Variance restoration can produce negative rain after the last clamp, which fails the validity gate.**
- MODEL_STRATEGY §4.2: "x' = clim + a_k·(x − clim), with a_k ≤ 1.5". F4 explicitly allows it for tp.
- SYSTEM_ARCHITECTURE §5 clamps inside the loop, then "Apply post-processing to the outputs only". There is **no clamp after post-processing**.
- Example: tp clim 5, x 0, a 1.5 gives **−2.5 mm/day**. The gate (`out[:,1].min() < -1e-6`) fails, and validity on all 8 calls is a hard gate.
- Fix: add a final `guards.clamp_state` after post-processing in §5 and CLAUDE §3.8. Do not rescale tp anomalies below clim (or rescale only for x > clim). Add a unit test.

---

## MAJOR

**M1. The H5.5 "safe submission … scan 15/15" cannot be reached with a DAP fit alone.**
- 24_HOUR_EXECUTION_PLAN.md L31: "DAP on `main` … scan 15/15. Push. *This is our insurance.*" TEAM_WORKFLOW §5 H5.5 says the same.
- Problem: a numpy least-squares `fit_dap.py` has no `.backward(`, `optimizer.step`, `.fit(`, etc. Mock: **12.0** (`training_pipeline: false`). Before H5.5–10 there is no LocalNet trainer.
- Fix: write DAP with a regex-matching fit (e.g. sklearn `LinearRegression().fit(`; the mock then scored 15.0) or commit the real `train_localnet.py` before H5.5. Otherwise state "12/15 at H5.5".

**M2. The "scan('.') must be 15.0, flags []" rule fails on every team machine.**
- CLAUDE §4.10; CONTRIBUTION_GUIDE §1.4: "Put `india_climate_train.nc` in `data/` … Run `pytest -q` and the repo scan … to confirm the baseline is green"; SUBMISSION_CHECKLIST B: "`scan('.')` gives **15.0**"; PR template "repo_scan 15/15".
- Problem: the scanner walks the filesystem, not git. `.gitignore` does not hide files from it. With `data/india_climate_train.nc` present, a mock scored **10.0** (warn). With an `eval/cache/*.npz` holding more than 400 days, it scored **4.0** (critical).
- Fix: always scan a clean export, e.g. `git clone`/`git worktree add /tmp/scan HEAD` or `git archive HEAD | tar -x -C /tmp/scan`, then `scan('/tmp/scan')`.

**M3. "Locality and no-teleport by construction" and "reach stays inside the limit up to k = 3" are wrong.**
- Files and quotes:
  - SYSTEM_ARCHITECTURE L11: "matches the judge's locality and no-teleport tests by construction"
  - MODEL_STRATEGY L54: "The reach stays inside the limit up to k = 3 (where they are equal)"
  - SHOCK R-S2, DECISION_LOG D-01, BRIEF_TEMPLATE USP
  - DEMO L9: "never faster than about 9 cells a day, because each step can only see 9 cells"
- Problem: a stack of 3×3 convs gives a square (Chebyshev) reach. The scorer uses Euclidean distance to the box.
  - Day 1 reach is up to 12.7 cells diagonally, beyond the 11-cell limit: 7 (Bay) and 6 (Arabian Sea) reachable cells count as "far".
  - Day 2: 50 and 61 such cells. Day 3: 34 for the Arabian Sea box.
  - Locality needs ≥ 60% of day-1 energy within 3 cells (4-neighbour). A 9-cell field of view does not guarantee that; only measurement does.
  - In practice the effective receptive field makes failure unlikely, but it is not "by construction".
  - The DEMO line "travels east" is an unmeasured prediction scripted as fact.
- Fix: reword all of these to "bounded per-step reach (≤ 9 cells Chebyshev, ≈ 12.7 diagonal); locality and no-teleport are verified by battery S1/S2". Make the demo line conditional on measured results.

**M4. Freeze times contradict each other.**
- TEAM_WORKFLOW L71 says at H17 "Model freeze | Only calibration changes after this".
- The plan says H14–17 "P3 calibration" then "H17 MODEL FREEZE. `weights/MANIFEST.md` final", and "After H17 no new architecture, loss or feature". CLAUDE §6 freezes the model at H17.
- Fix: pick one rule, e.g. "calibration ends at H17; after H17 nothing changes in `weights/`".

**M5. The P4 retrain is infeasible and invalidates the selected model.**
- Plan L36: "optional P4 retrain on all years only if ≥ 3 h remain and P1+P2 took ≤ 3 h". The window is H14–17, which already holds P3 and the test check. MODEL_STRATEGY P4 says the same.
- Problem: at H14 exactly 3 h remain and P3 must also fit. Retraining on 2018–19 also makes the validation-fitted calibration (quantile map, variance a_k, drizzle floor) in-sample. The gate and battery results from H14 no longer apply to the shipped weights.
- Fix: drop P4. Or allow it only before P3, and re-run the calibration fit and battery afterwards, with an explicit time budget.

**M6. Engine start-up behaviour contradicts itself.**
- SYSTEM_ARCHITECTURE L82: "raises on missing files (server must not report ready)". L164: "LocalNet weights missing or corrupt at start-up | Engine falls back to DAP".
- Fix: "raises only if the DAP or climatology files are missing; a missing or corrupt LocalNet file falls back to DAP".

**M7. HTTP endpoints need data that the Engine interface (§4.1) does not provide.**
- `/climatology` returns `core_zone_rain_mean`/`core_zone_rain_std`. `/meta` returns "per-channel std from `norm.json` … model card".
- Problem: `Engine` defines only `simulate`, `climatology` (fields) and `static_fields`. B2 (owner of serve.py) would have to read B1-owned files (`climatology.npz`, `norm.json`) directly, or edit `twin/`.
- Also, `norm.json` holds training-split statistics with tp in log1p space and tendency std. The judge's std is `stats.json` (raw tp; [13.4636, 7.5533, 2.8990, 2.4270, 619.02, 20.4944]). So "same units as the judge" holds only if `stats.json`'s raw std is served.
- Fix: add `Engine.core_zone_rain_stats(doy_sincos, steps)`, `Engine.channel_std()` (returning the stats.json values verbatim) and `Engine.model_card()` (loaded from a JSON in `weights/`) to §4.1.

**M8. File ownership is defined differently in different documents.**
- BRIEF_TEMPLATE L5: "B1 writes page 1 and B2 writes page 2". CLAUDE §1 says AUD owns `docs/brief/`.
- `docs/` is shared via PR in CLAUDE §1, "`docs/` (final say)" for AUD in TEAM_WORKFLOW L8, and "ALL" in SYSTEM_ARCH L67.
- The shared-file lists differ: CLAUDE has `docs/*.md`; TEAM_WORKFLOW L10 has `docs/DECISION_LOG.md` only.
- `requirements-train.txt`/`requirements-serve.txt` are assigned only in TEAM_WORKFLOW. `LICENSE`, `.gitattributes` (RISK T5, owner B2) and pytest config appear in no list. Since CLAUDE.md overrides other docs, Claude Code sessions will refuse to edit them.
- Fix: put one ownership table in CLAUDE §1 and make every other doc point to it.

**M9. The UI's parallel calls and ensemble don't fit the server's throughput.**
- UI_UX §4: "Fires baseline and scenario calls in parallel"; Ensemble "N = 8 extra calls"; api.js "timeout 10 s"; DoD §9.2 "under 3 s end to end, including two calls".
- Problem: the kit template uses a single uvicorn worker with an `async def` handler around CPU-bound torch at 4 threads, so calls run one after another. At the 1.5 s target, 2 calls take ≈ 3 s plus JSON parsing. 10 calls take ≈ 15 s, so the later ensemble requests hit the 10 s timeout, and `/health` polling stalls meanwhile.
- Fix: queue requests in the browser (one in flight, a timeout per request starting when it is sent), or batch members server-side in a dashboard-only endpoint. Set the DoD from the measured latency.

**M10. The sandbox rehearsal recipe (L5) does not work as written.**
- TESTING L86–87: `docker run --rm --network none … -p 8000:8000 … pip install --no-index --find-links /wheels …`. OPEN_QUESTIONS L26: `pip download -d D:\Yugantar\wheels …`.
- Problems:
  1. `--network none` disables port publishing, so the validator on the host cannot reach the server. T-API-7 ("call from another container or host IP") is impossible with this command.
  2. `/wheels` is never mounted.
  3. `pip download` on Windows fetches win_amd64 wheels, which fail in a Linux container.
  4. PyPI's Linux torch wheel pulls multi-GB CUDA dependencies.
  5. `python:3.11-slim` must be pulled in advance.
- Fix:
  - Use `docker network create --internal sbx` and run the server and validator containers on it.
  - Add `-v D:\Yugantar\wheels:/wheels:ro`.
  - Download Linux wheels: `pip download --platform manylinux2014_x86_64 --python-version 311 --only-binary=:all:`, with torch from the CPU index (`--index-url https://download.pytorch.org/whl/cpu`).
  - Pre-pull the image.

**M11. Official conditions with no test, or only a weak one, in TESTING_AND_VALIDATION.**
- (a) Repo scan on a clean clone (see M2).
- (b) Validity after post-processing: a final-clamp unit test (see C3).
- (c) Null test **over HTTP**: zeros vs `null` through serve.py's JSON path. T-CAU-1 is in-process only.
- (d) Output alignment: check that `rollout[0]` is day +1, not a copy of `init_states[-1]`, and that the harness lines truth up with lead days 1/4/8 (indices 0/3/7). An off-by-one here silently fakes or destroys skill.
- (e) Server responsiveness under dashboard load (see M9).
- (f) A check that the strings in serve.py's `/meta` model card pass the scan (see m11).

**M12. The 24-hour plan is unrealistic for a beginner team.**
- No sleep or breaks are planned for 3 people over 24 h. P4 (fatigue) is listed in RISK_REGISTER but not planned for.
- H1.5–3: AUD's "first `[RESULT]`" climatology reference depends on B1's `training/climatology.py`, written in the same slot.
- H3–5.5: AUD's first Docker offline rehearsal on Windows comes with the wheel and network problems in M10.
- H10–14: B2 builds particles, isobars (marching squares), the ensemble and 4 Impact Lens indicators in 4 h.
- H17–20: the "reproducibility check from a fresh clone" plus the training DoD ("reproduces the files in `weights/`") would need hours of re-training.
- Fix: plan 2 rest blocks; move the first L5 rehearsal to after H5.5; make the particles and the ensemble stretch goals; shrink the reproduction check to a 1-epoch smoke run.

---

## MINOR

- **m1. Model size is given two ways.** MODEL_STRATEGY §2 says "~1M params, ~1 GMAC/step"; §3.2 says "about 0.7M parameters and about 0.8 GMAC". With C=96, B=4 I compute ≈ 0.69M and 0.79 GMAC. Use the §3.2 numbers.
- **m2. Latency targets differ.** "Below 1 s" (MODEL L56), "Under 1.5 s" (SYSTEM L135), "< 2 s" (TEAM DoD, T-API-6, F5), and "under a second" (DEMO hook, unmeasured). Pick one.
- **m3. Hour numbers drift between docs.**
  - Safe submission: H5.5 in the plan and D-02, "about H6" in EVAL §1, "by H6" in MODEL §5.
  - Brief: "from H18" in EVAL §1, but the plan starts it at H14–17.
  - L5: "H6, H16, H21" vs the plan's H3–5.5 / H14–17 / H20–22.
  - L7: H10/H15/H18 vs the plan.
- **m4. Near-fraction figure differs.** EVAL §6 says "≥ 0.98"; SHOCK §2 says "✔ (≥ 0.99)". My reproduction gives 0.988–1.0 (the other synthetic results reproduced as stated), so 0.98 is the correct floor.
- **m5. Fallback F1 breaks a "decided" rule.** "B = 3 blocks, C = 64" contradicts CLAUDE §3.1 (4 blocks, "decided") with no DECISION entry. Pre-log it as D-16.
- **m6. b64 input missing from CLAUDE §2.** It does not say the server must accept `{"b64","shape"}` **input**. The kit validator sends it, and the H1.5 checkpoint needs a passing validator. SYSTEM §4.2 already says so; copy it into CLAUDE §2.
- **m7. Repo-scan rules miss two details.**
  - COMPETITION_REQ §7's critical list omits "no file serves /simulate".
  - CLAUDE §4.3 misses that `DATETIME_CALL` has no word boundary: `cache.update(2048)` and `validate(1999)` both match (verified).
- **m8. Shock-battery test S6 cannot meet its own pass rule.** S6 "tp +50 mm/day … stable": 50 mm/day is 6.6 σ_tp (5-std limit = 37.8 mm/day). "Stable" will probably fail by design. Relabel it as valid-only or use ≤ 30 mm/day.
- **m9. Demo cases touch the test years.** Plan L29 draws them "from 2019–2021", which includes test years 2020–21. Viewing them repeatedly during development breaks CLAUDE §6 "Touch the test set once". Use 2018–19 only.
- **m10. .gitignore gaps.**
  - `dashboard/cases_local/` "verification views" are specified nowhere else.
  - No rule catches stray `*.npy`/`*.npz` caches outside `data/` and `eval/cache/`.
  - It does not protect the scan anyway (M2).
- **m11. Attribution and model-card wording.** README attribution omits the NOTICE's "accessed through Google WeatherBench 2 (Rasp et al. 2024)" and the regridding statement, yet SUBMISSION A asks for the "NOTICE wording". Fix it in README.md (not scanned), but **never** copy that text into serve.py or the `/meta` model card. A mock serve.py containing "WeatherBench2" scored 4.0. Keep the model card in `weights/*.json`.
- **m12. Example looks like a result.** TEAM_WORKFLOW L54 "`(val est 61.2)`" reads like a measured score. Use `<val est>`.
- **m13. Some audit facts cannot be checked offline.** SOURCE_AUDIT S-04 (commit `689c879`, time), S-05 (byte sizes), S-06 (SHA-256 identity) and S-07 (mean values) cannot be verified from the provided sources. The S-07 std values match the audit-provided values. Mark them as from an online check, with the date.
- **m14. Citations.** All cited keys exist; "B1220" is the hex colour `#0B1220`. MODEL §2's Pangu row cites "[EVIDENCE B6, B9]", but Pangu is B43, which is never cited.
- **m15. CORS spec won't work as written.** SYSTEM §4.2 says "allowing `http://localhost:*`", but Starlette's `allow_origins` has no port wildcard. Specify `allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?"`.
- **m16. Rescaling can hurt propagation.** MODEL §4.3 says "multiplies shock responses by a_k ≥ 1, which never hurts propagation". With a_1 > a_4..8, the days 4–8 / day 1 outside-energy ratio falls, and every a_k > 1 raises the 5-std risk. Reword it.
- **m17. Windows read-only test is weak.** TESTING §6 uses `attrib +R /S`, which does not stop writes into folders on Windows, so it is a weak read-only test.

---

## Checked and correct (no action needed)
- **Contract facts match the official sources:** channel order and units, grid orientation, `doy_sincos` for the last input day, perturbation added to `init_states[-1]`, the 5 s / 120 s / 6 GB / 4-CPU limits, the 80 MB response cap, the 3 s connect timeout, MAX_STEPS 14, and SCORE_STEPS 10.
- **Scoring constants match scoring.py:** SS_REF 0.12, CSI_SS_REF 0.10, RAIN 10, blur 0.40/2.5, NULL_TOL and NONZERO 1e-3, LOCAL 0.60, DILATE 3, 8 cells/day, 5 std, teleport < 0.05, growth > 1.5× and > 2%, and the dependency rules for the causality quarters.
- **Derived numbers check out:**
  - Box sizes: 12×12 cells (Bay) and 12×10 (Arabian Sea).
  - Validity bounds are [233.15, 333.15] K and tp ≥ −1e-6; the clamp ranges sit inside them.
  - With the stats.json std: σ_tp × 5 = 37.8 mm/day and σ_t2m × 5 = 67 K. Absolute null tolerance = [0.0135 K, 0.0076 mm/day, 0.0029 m/s, 0.0024 m/s, 0.62 Pa, 0.020 kg/m²].
  - The DAP maximum of 11.25/15 is correct.
- **Repo-scan details match repo_scan.py:** the 19 source names, UI regex, weight extensions (13, no `.npy`), DATA_EXT, the archive rule (n > 400, last two dims 32×36), and the code-health split 3/2/1/0.5/0.5.
- **Every mock repo score** in EVAL §7 and SOURCE_AUDIT §4.1 reproduced.
- **The synthetic causality table** in SHOCK §2 reproduced.
- **The brief structure** matches the PS (page 1 / page 2) plus the general PDF's USP and architecture. The submission items are complete.
