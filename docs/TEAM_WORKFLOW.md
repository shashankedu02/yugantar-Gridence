# Team workflow (3 people, 2 PCs, 1 Claude account)

> **Superseded in part (D-25).** Roles are now W1 / W2 / W3 with the ownership table in `CLAUDE.md` §1 and the working rules in `docs/WORKSTREAMS.md`. Read B1 as W1, B2 as W2 (integration) plus W3 (visual design), AUD as W2 (tests, review, merge) plus W3 (brief). The PC-B driver schedule in §2 only applies if team members share a machine; with one machine each, ignore it.

## 1. Roles
**File ownership is defined in one place only: `CLAUDE.md` §1.** This section describes each role's mission.

| Role | Mission | Never does |
|---|---|---|
| **B1: Model Builder** | Data → climatology → DAP → LocalNet → calibration → weights | Edit server, dashboard, eval or tests |
| **B2: Systems & Experience Builder** | Server wrapper, dashboard, impact lens, demo cases | Edit model, training or weights |
| **AUD: Debugger / Technical Auditor** | Independent verification: scoring harness, shock battery, sandbox rehearsal, repo scan, scientific review, merges, brief editor | Silently fix builders' code. AUD files issues instead. Exception: a one-line fix agreed in the chat. |

**Why AUD doesn't fix code:** an auditor who fixes code stops being independent, and two people editing one file is what causes merge conflicts.

## 2. Machines and the PC-B schedule
**Assumption:** we have two PCs. Confirm which one has an NVIDIA GPU (see `OPEN_QUESTIONS.md`).

**The conflict being resolved:** B2 and AUD both need PC-B, and both write code. Taking turns ad hoc doesn't work at 3 a.m. Rule: **each time block has exactly one driver per PC.** The other person works off-keyboard: reviewing in a browser on any device, planning, writing brief notes, or navigating as pair partner.

| Block | PC-A driver | PC-B driver | PC-B off-keyboard partner does |
|---|---|---|---|
| H0–0.5 | B1 (venv, data) | B2 (venv, kit wheel) | AUD creates the GitHub repo and pushes the blueprint from a browser, confirms the deadline with organisers |
| H0.5–1.5 | B1 (engine stub, data loader) | B2 (`serve.py` stub) | AUD navigates B2's validator run; drafts the test list |
| H1.5–3 | B1 (climatology, DAP fit) | **AUD** (harness with own loader, shock battery, frozen `windows_val.json` by H3) | B2: palette and layout decisions, demo-case list, PR reviews |
| H3–5.5 | B1 (DAP engine, weights export) | B2 (demo-case tool, dashboard skeleton, map stage) | AUD runs harness jobs in the background on PC-B (separate clone `D:\mt-audit`, low priority) and reviews PRs |
| H5.5–6.5 | B1 (LocalNet code) | **AUD** (G-DAP check, clean scan, sandbox rehearsal 1, tests skeleton) | B2: scenario-builder design, review |
| H6.5–9.5 | B1 (EXP-1 training; **B1 rest 60 min while P1 runs**; AUD watches PC-A's run meanwhile) | B2 (scenario builder, live calls via queue) | AUD: background jobs, `shock_battery.py` review, navigator |
| H9.5–10.5 | B1 | **AUD** (harness-equals-kit unit test, then EXP-1 scoring and battery → H10 decision) | **B2 rest 60 min** |
| H10.5–13 | B1 (P2 on the EXP-1 winner) | B2 (Impact Lens, arrows; stretch items) | **AUD rest 60 min**, then PR reviews |
| H13–14 | B1 | **AUD** (candidate harness, battery, sandbox timing) | B2: brief page-2 notes, figure list |
| H14–17 | B1 (calibration, test-set check) | B2 (polish) | AUD runs battery and harness in the background; collects numbers for the brief; **one agreed 15-minute slot for sandbox rehearsal 2** (B2 pauses so the timing isn't skewed) |
| H17–18 | **B1** (README, 1-epoch reproduction smoke test in a fresh clone) | B2 (dashboard fixes, figures) | AUD: brief outline, checklist prep |
| H18–24 | **AUD** (sandbox rehearsal 3, brief PDF, submission checklist); B1 navigates | B2 (dashboard fixes, backup recording, demo rehearsal) | – |

- **Background jobs:** AUD's long runs (harness, battery) execute on PC-B from a separate clone folder at low priority (`start /low` on Windows), so B2 can keep working. AUD only needs the keyboard to launch them and read results, inside AUD blocks or with a 2-minute interruption agreed in chat.
- **Antigravity:** AUD uses it during AUD blocks on PC-B, and on PC-A from H18.
- **Docker:** install Docker Desktop and the rehearsal image on **both** PCs (rehearsals run on PC-B before H17 and on PC-A from H18).
- **Short interruptions:** a clean-export scan or a job launch during the other person's block is fine as a 2-minute interruption agreed in chat.
- **PC-A rules:** B1 must not start a second heavy job that slows training. While PC-A trains, B1 can review AUD's reports and plan the next experiment.
- **If a third device exists** (any laptop): AUD moves there and this schedule collapses to PC-A = B1, PC-B = B2. Report this in `OPEN_QUESTIONS.md` B3.
- **No GPU:** see `24_HOUR_EXECUTION_PLAN.md` fallback F2 (narrower net, CPU training, Kaggle/Colab T4 if venue internet allows).

## 3. One Claude account, two Claude Code sessions
- **Same instructions:** both builders open the repo in VS Code with Claude Code. `CLAUDE.md` loads automatically, so both sessions follow the same rules.
- **Declare your role in the first prompt:** "I am B1. I may only edit files listed for B1 in CLAUDE.md §1." Claude Code will then refuse or flag edits outside that list.
- **Shared usage limits:** both sessions draw on one account's limits. To manage that:
  - Keep prompts scoped: one module, with file paths.
  - Avoid "rewrite everything" prompts.
  - Use a cheaper/faster model for routine edits and the strongest model for hard debugging.
  - **AUD uses Antigravity**, not Claude, which keeps the Claude budget for the builders and gives a genuinely independent second model's review.
  - If limits are hit: B1's work (the model) has priority over B2's (the dashboard).
- **Never let an AI session:**
  - commit weights it did not produce from a real training run
  - invent metrics
  - edit `weights/MANIFEST.md` numbers by hand
  - push to `main` directly

## 4. Git strategy
- **Repo:** create a new **public** GitHub repo at H0, so the history shows the work was done during the event.
  - Commit the blueprint docs as the first commit, with the message "docs: preparation blueprint (written before the event; no code)".
  - Then add both builders and AUD as collaborators.
- **Branches:**
  - `main` must always start and pass the validator. Only AUD merges into it.
  - Short-lived feature branches: `b1/<topic>` (e.g. `b1/dap`, `b1/localnet`), `b2/<topic>` (e.g. `b2/server`, `b2/dashboard-map`), `aud/<topic>`.
- **Flow:**
  1. `git pull --rebase origin main` before starting work and before opening a PR.
  2. Small commits.
  3. PR into `main`.
  4. AUD runs L0 + L1 (+ L4 if `serve.py`/`twin/` changed) and merges.
  - Target: no branch lives longer than about 3 hours.
- **Commit messages:** Conventional Commits, e.g. `feat(twin): add DAP fallback`, `fix(serve): 422 on bad shape`, `test(eval): shock battery`, `docs(brief): page 1 draft`, `chore(weights): localnet v1 candidate (val est <score from eval/reports>)`.
- **Weights:**
  - Only release candidates go into `weights/`. Each one gets a `MANIFEST.md` entry: commit, config, split, harness score.
  - Experiment checkpoints live in `runs/`, which is gitignored.
  - Each file is a few MB, so no LFS is needed below ~100 MB per file. Use Git LFS only if a file exceeds about 90 MB.
- **Conflicts:** ownership boundaries make them rare.
  - If one happens in a shared file, the file's owner resolves it.
  - For docs, AUD resolves it.
  - Never resolve a conflict by deleting the other person's section.

## 5. Integration checkpoints (all three stop for 10 minutes)
| Time | Checkpoint | Exit criterion |
|---|---|---|
| **H1.5** | Contract stub | `Engine` stub (persistence) + `serve.py` pass the kit validator on `main` |
| **H5.5** | Conditional checkpoint G-DAP | DAP passes the gate items on the frozen validation windows (validity, mean day-4 skill vs persistence > 0, null identical, both shocks non-zero and localised on ≥ 5/6 battery windows) and the clean-export scan gives 15/15 → tag `safe-dap`. Otherwise run fallback F0 (24 h plan). |
| **H10** | Model go/no-go = **EXP-1** | DAP vs LocalNet-64 vs LocalNet-96 on the frozen windows with one harness commit (MODEL_STRATEGY §3.7); the winner goes on to P2, otherwise fallback F1 |
| **H14** | Candidate | LocalNet + rollout fine-tune on `main` if it beats DAP's local Stage-1 estimate and passes the battery |
| **H17** | **Model freeze** | Calibration is finished; nothing in `weights/` or `twin/` changes after this |
| **H20** | **Code freeze** | Only docs, brief and demo after this |
| **H22** | Submission verification | Full checklist (`SUBMISSION_CHECKLIST.md`) |

## 6. Communication protocol
- **One team chat channel**, e.g. a WhatsApp group "MT-dev". Message types are prefixed:
  - `[BLOCKER]`: needs someone now
  - `[PR]`: link to a PR ready for review
  - `[RESULT]`: a metric from `eval/reports`, with a path
  - `[DECISION]`: proposal; AUD logs it in `DECISION_LOG.md`
  - `[FREEZE]`
- **Stand-up:** 3 minutes at every checkpoint. Each person says: done / next / blocked.
- **A metric without a report path is not a result.** "It looks better" is not evidence.
- **Disagreements on technical direction:** if the evidence (harness numbers) doesn't settle it within 10 minutes, AUD decides, and the decision is logged.

## 7. Definition of done (per module)
| Module | Done when |
|---|---|
| `twin/engine.py` | Contract types; deterministic; null identical; guards tested; loads in < 30 s; 10 steps < 2 s on 4 threads (acceptance thresholds, **measured** in the L5 sandbox, not assumed) |
| `training/*` | Climatology, DAP and calibration files regenerate exactly from the `.nc` with a config; LocalNet training runs (a 1-epoch smoke test, not a full retrain); nothing in `training/` matches the route pattern (CLAUDE.md §4.1) |
| `weights/` | Files load with the sandbox libraries; MANIFEST entry; repo scan sees a checkpoint |
| `serve.py` | Kit validator passes; 422 on bad input; CORS for localhost; no UI words |
| `dashboard/` | UI spec §9 |
| `eval/` | Reproduces the kit's functions exactly (unit test against the kit on random arrays); writes reports |
| Brief | 2 pages; every number traced to a report |

## 8. The debugger's job, precisely
AUD is the team's internal judge.
1. **Before code exists:** write `eval/harness.py`, `eval/shock_battery.py` and the tests against the kit. These need only the data and the Engine interface, and can run against the stub.
2. **Each candidate:** run L2/L3 and post `[RESULT]`s; flag regressions.
3. **Scientific review (L7):** look at maps; check shock physics signs; challenge claims.
4. **Compliance:** repo scan, sandbox rehearsal, offline test, README follow-through from a fresh clone.
5. **Merge gatekeeper and decision logger.**
6. **Brief editor:** owns the final PDF; pulls numbers only from reports.
7. **Demo rehearsal lead:** plays the hostile judge (`DEMO_AND_JUDGING.md`).
