# CHANGELOG

## 2026-11-26: Targeted correction pass (docs only, no code)
This pass made targeted edits only. It keeps the file structure and the decision history: old decisions are amended by new entries D-21 to D-24, not rewritten.

### 1. README repo-scan command
- **README.md, Self-checks:** replaced `scan('.')` with a clean git-export scan (`git worktree add …`, then scan the export, then remove it), with bash and PowerShell variants.
  - *Why:* the kit scanner walks the folder and ignores `.gitignore`. A local `data/*.nc` was flagged, giving 13.0 instead of 15.0 (verification V3).

### 2. `/health` method
- **Checked against the kit:**
  - `R1_CONTRACT.md` says `POST /health`
  - the starter `serve.py` has `@app.post("/health")`
  - `client.health()` uses `requests.post(...)`, and `schema_validator` and `wait_ready` go through it
- **Result:** every blueprint doc already said POST. Nothing was wrong, but the requirement was implicit.
- **What changed** (made explicit; a GET-only route returns 405 and the server never becomes ready, verification V2):
  - CLAUDE.md §2: "POST, not GET", with sources
  - COMPETITION_REQUIREMENTS §4: sources cited
  - SYSTEM_ARCHITECTURE §4.2: POST required, and the dashboard indicator uses it
  - UI_UX §7: `api.js` gets `health()` via POST
  - TESTING: new test **T-API-1b**
  - DECISION_LOG: **D-24**

### 3. H5.5 DAP checkpoint made conditional
- **24 h plan:** "SAFE SUBMISSION … our insurance" became the **conditional checkpoint G-DAP**. Pass criteria, all on the frozen validation windows:
  - validity 100%
  - mean day-4 skill vs persistence > 0
  - null identical
  - both shocks non-zero and localised on ≥ 5/6 windows
  - clean scan 15/15
- **New fallback F0:**
  1. 30-minute bug hunt: alignment, doy, climatology index, units, persistence reference
  2. lead-wise damping (DAP-LW)
  3. if that fails too: no safe submission, so LocalNet is the only route; B2 freezes new dashboard features
- **Updated consistently:**
  - TEAM_WORKFLOW §5
  - EVALUATION_STRATEGY §1
  - MODEL_STRATEGY §5
  - RISK_REGISTER E2 and P1
  - CONTRIBUTION_GUIDE tags (`safe-dap` only if passed)
  - plan F8
  - **D-22** (amends D-02, whose "Guarantees the gate" became "[UNVERIFIED]")
- *Why:* DAP beating persistence at day 4 is a hypothesis, not a measurement.

### 4. EXP-1 comparison experiment
- **New MODEL_STRATEGY §3.7, EXP-1:** DAP vs **LocalNet-64 (B = 4, C = 64)** vs **LocalNet-96 (B = 4, C = 96)**.
  - **Held identical:** one frozen `eval/windows_val.json` (committed at H3), the same data and training recipe, seed and epoch budget, the same harness commit, raw (uncalibrated) outputs, and the same sandbox timing run.
  - **Reported:** one results table.
  - **Decision rule:** gates first, then the best local Stage-1 estimate; if within 1 point, take the smaller model.
  - **No GPU:** only LocalNet-64 is run.
- **Wired into:**
  - the 24 h plan: H5.5–10 trains 64 then 96; H10 go/no-go = EXP-1; F1 rewritten
  - TESTING §2.1 and **T-SK-0**
  - MODEL §3.6 (pointer to §3.7)
  - DEMO (shows the EXP-1 table)
  - CLAUDE §3.1 (allowed variants)
  - **D-21** (amends D-16: LocalNet-64 keeps B = 4 so that only width varies; B = 3 only if locality fails)
- *Why:* choose the model by measurement under identical conditions.

### 5. Evidence labels for locality, propagation, stability and latency
- **CLAUDE.md §5:** added the label convention.
  - **[MEASURED]** (state what was run)
  - **[ESTIMATED]**
  - **[UNVERIFIED]**
  - A mapping from the older tags.
  - An explicit statement that **nothing about our own model is measured yet**: only the kit scorer on synthetic fields and the scanner on mock repos.
- **Labels added or corrected in:**
  - CLAUDE §2/§3
  - README mission
  - DECISION_LOG D-01, D-02, D-16
  - EVALUATION_STRATEGY §2 and §6
  - MODEL_STRATEGY §2, §3.2 and §5
  - SYSTEM_ARCHITECTURE §1, §5 and §9
  - SHOCK_AND_DYNAMICS §2, §3 and §4
  - DEMO (engineering beat, CNN answer, DAP comparison)
  - TESTING manual step 3 (record, don't expect)
  - UI performance budget
  - BRIEF USP
  - TEAM DoD
- *Why:* several statements read as facts but were expectations or estimates.

### 6. PC allocation conflict (B2 vs AUD)
- **TEAM_WORKFLOW §2:** replaced "taking turns at the keyboard" with a **fixed driver schedule**.
  - Each block has exactly one driver per PC.
  - PC-B alternates between B2 and AUD in named blocks.
  - AUD runs long jobs in the background from a separate clone.
  - Rest blocks are staggered.
  - **AUD moves to PC-A after the H17 model freeze.**
  - If a third device exists, the schedule collapses to PC-A = B1, PC-B = B2.
- **24 h plan:** B2 and AUD columns aligned to these blocks; a pointer note added.
  - AUD's harness, shock battery and frozen windows moved to H1.5–3, because G-DAP needs them by H5.5.
  - B1's reproducibility smoke test moved to PC-A.
- **Also:** OPEN_QUESTIONS B3 (third device?) and **D-23**.
- *Why:* both roles were assigned PC-B with no rule for who drives when.

### 7. Contradiction sweep
- **Ran automated checks** for stale patterns across all docs, with no remaining hits:
  - GET /health
  - `scan('.')`
  - unconditional "safe submission"
  - B = 5 / 0.9M
  - "by construction"
  - "very likely to pass"
  - "taking turns"
- **Fixed the knock-on inconsistencies:**
  - G-DAP needs the battery and windows before H5.5
  - the B2 rest block moved to H9.5–10.5 and the AUD rest block to H10.5–11.5
  - the B2 column for H1.5–3 is now off-keyboard
- Results of the independent verification are below.

### 8. Second round: fixes from the independent verifier
| Finding | Correction | Why |
|---|---|---|
| **F0 formula error:** "w = 1 reproduces persistence" was false with the DAP form; the verifier measured a 0.82 offset | DAP-LW redefined as x̂_k = x₀ + w·(clim(d0+k) − x₀): w = 0 is persistence and w = 1 is climatology (24 h plan F0) | A fallback must be correct |
| 12 locality, propagation or stability claims were unlabelled or tagged [REC]/[TEST] | Labelled [ESTIMATED] or [UNVERIFIED]: MODEL §2 (3 rows) and §4, D-02, D-04, SHOCK R-S3, EVAL §6, UI §3, DEMO (2), RISK T1 | Item 5 completeness |
| The synthetic row "σ ≤ 3 fails propagates" didn't fully reproduce | Split: σ ≤ 2 fails; σ = 3 marked borderline (failed in our run, passed for warm_ocean in the re-implementation) | Don't overstate a measurement |
| Plan vs PC schedule: AUD typing in B2's H6.5–9.5 block; B1 typing on PC-A after H17; Docker only on PC-B; rehearsal 2 unscheduled; "someone always awake on each PC" | The unit test moved to AUD's H9.5–10.5 block. B1 drives PC-A H17–18, AUD from H18. Docker on both PCs. Rehearsal 2 gets an agreed 15-minute slot with B2 paused. The rest-block wording fixed, and AUD watches PC-A during B1's rest. | Item 6 consistency |
| G-DAP wording: TEAM §5 lacked "≥ 5/6"; TESTING gate flags said "shock" (singular) | Both made explicit | Consistency |
| TEAM §5 H10 row didn't name EXP-1 | Now names EXP-1 and the three candidates | Consistency |
| Demo cases said "validation/test years" in SYSTEM §7 and D-15 | Now "validation years (2018–2019)" | Matches CLAUDE §6 and the plan |
| The Claude Code prompts in TEAM §3 and CONTRIBUTION §6 pointed ownership to TEAM_WORKFLOW | Now point to CLAUDE.md §1 | One source of truth |
| "Every PR 15/15" can't hold before H5.5 (an H1.5-state repo scored 2.5) | CLAUDE §6 and the PR template: 15/15 from G-DAP on; before that, no unexpected flags; never add dummy weights | Realistic rule, still honest |
| CLAUDE §4.11's `git archive` alternative failed ("tar: Cannot open") | Added `mkdir -p /tmp/scan`; re-run gives 15.0, no flags | A broken command |
| Stale references: OPEN_QUESTIONS "B2" (now B3); "D-01…D-15" | Fixed to B3 and D-01…D-24 | Accuracy |
| The plan's H0 B1 cell duplicated AUD's repo creation; EVAL said "brief drafted from H14" | Removed the duplicate; the brief timing now matches the plan | Consistency |

### Verification (actually executed; scratch scripts outside the repo, not committed)
- **V1:** the original kit `schema_validator`, run against a throwaway stdlib mock built only from CLAUDE.md §2. Result: `health: OK`, 6/6 `/simulate` checks OK (lists and base64; none, warm_ocean, zeros), "RESULT: all checks passed".
- **V2:** negative control with a GET-only `/health`. The kit `client.health` returned `(False, 'HTTP 405 / not ready')`; the POST mock returned `(True, '')`.
- **V3:** the README bash scan sequence on a scratch git repo with an untracked `data/*.nc`. `scan('.')` gave 13.0 (flag "climate data file in repo"); the clean export gave **15.0**, no flags, all health fields true; the worktree was removed afterwards.
- **V4:** stale-pattern sweep (item 7): no remaining hits.
- **Not executed:** the PowerShell variant of the scan command (no PowerShell here).
- **Independent verifier** (a fresh reviewer that had not seen this pass's reasoning; its own mock and scratch repo):
  - **A. Contract:** PASS. Its own CLAUDE.md-only mock passed the original validator (all checks, exit 0). Null vs zeros was bit-identical; `rollout[0]` was not a copy of the input day. GET-only `/health` gave `(False, 'HTTP 405 / not ready')`.
  - **B. `/health` method:** PASS. The contract, template, client and PDF all say POST; all docs agree.
  - **C. README scan:** PASS. `scan('.')` gave 13.0; the README sequence gave 15.0. One broken alternative command was found and fixed in round 2.
  - **D. Contract facts and scoring constants:** PASS. Includes a recomputed 0.69M parameters / 0.80 GMAC, and all 12 mock-scan scores reproduced. One synthetic table row was borderline (fixed).
  - **E. Contradictions:** FAIL at the time. Every finding was fixed in round 2 (§8).
- **After round 2:**
  - V1 re-run on the final CLAUDE.md text: all checks passed.
  - The stale-pattern sweep was re-run and is clean, including a check that no locality, propagation or stability claim relies on [REC]/[TEST].
  - The `git archive` alternative was executed: 15.0, no flags.
- **Not re-run:** the independent verifier after round 2. Round 2 changed wording, labels and schedule only, not contract text.
