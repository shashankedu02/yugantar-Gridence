# Workstreams: how three people work in parallel

Decision D-25. Ownership of every path is in `CLAUDE.md` §1; this page is the working agreement around it.

## 1. Who does what
| | W1 backend / forecasting | W2 dashboard integration | W3 UI/UX, impact visuals, brief |
|---|---|---|---|
| **Owns** | `serve.py`, `twin/`, `training/`, `weights/`, `eval/`, `tools/`, `dashboard/cases/` | `dashboard/index.html`, `dashboard/js/` (not `ui/`), `dashboard/vendor/`, `tests/`, `third_party/`, `tools/preflight.py` | `dashboard/css/`, `dashboard/assets/`, `dashboard/js/ui/`, `dashboard/ui-sandbox.html`, `docs/UI_UX_SPECIFICATION.md`, `docs/brief/`, `docs/DEMO_AND_JUDGING.md` |
| **Scores** | Forecast skill, dynamics, shock response, repo health (about 85 of 100 points) | Hard-gate safety net (tests), dashboard demo | Brief (15 points), demo flow |
| **Extra duties** | Hand the dashboard real inputs and files (section 4) | **Merge owner.** Re-runs every number W1 quotes, from a fresh clone | Collects the brief numbers only from re-run results |

W2 and W3 duties beyond the first message are defaults chosen to keep the model builder independent of its own grader. Change them by editing `CLAUDE.md` §1 in a PR if the three of you agree something else.

## 2. Git rules
1. **The repo root is the project root** (`serve.py` sits next to `twin/`). The judge runs `python serve.py --port 8000` there.
2. **Never push to `main`.** Branches: `w1/<topic>`, `w2/<topic>`, `w3/<topic>`. One pull request per topic, small and frequent.
3. **Every PR is reviewed by someone other than its author** and merged by W2. W2's own PRs are merged by W1.
4. **Before opening a PR run `python tools/preflight.py`.** It checks: no `.env`, `.nc`, `.pyc`, `__pycache__` or oversized files tracked; no key-like strings; `serve.py` at the root; the official repo scan on a copy of the tracked files; the tests. A PR with a red preflight is not merged.
5. **`main` must always start and pass the kit validator** (`python serve.py --port 8000`, then `python -m monsoon_r1.schema_validator http://localhost:8000`).
6. **Never commit** the dataset, `.env`, API keys, virtual environments or caches. If a secret is committed, rotate it first, then clean the history; deleting the file is not enough.
7. Commit messages: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`). Touch only files you own; for anything else leave a note for the owner or open a PR they review.
8. **Do not edit the same file as someone else.** If you need a change in another person's path, ask them (or send a PR they approve).

Declare your role at the start of each Claude session: "I am W2. I may only edit the files listed for W2 in CLAUDE.md §1."

## 3. Interfaces between the workstreams
| From → to | Interface | Where it is written |
|---|---|---|
| W1 → W2, W3 | The HTTP API: `/health`, `/simulate`, `/meta`, `/climatology`, exact shapes, nulls and errors | `docs/DASHBOARD_API.md` |
| W2 ↔ W3 | Presentational modules in `dashboard/js/ui/` that W2 imports, plus the CSS files W3 owns | `dashboard/README.md` |
| W1 → W2 | Demo input states in `dashboard/cases/*.json` (up to 8, each 3 days, from 2018–2019) | `docs/DASHBOARD_API.md` §6 |
| W1, W2, W3 → W3 | Numbers for the brief, only from re-run results | `CLAUDE.md` §1 independence rule |

If an interface has to change, change its document in a PR first; the other side builds against the document, not against a guess.

## 4. First-day task lists
**W1**
1. Verify the dataset: SHA-256 against the organisers' `SHA256SUMS.txt`, then `python -m training.data --nc <path>`. Record the report.
2. `python -m training.fit_dap`, then evaluate DAP against persistence on the frozen validation windows (`eval/`). Until that passes checkpoint G-DAP there is no safe submission.
3. Within the first hour, so the dashboard can show real structure: write `weights/static.npz` (key `static`, land/sea mask and orography from the dataset's `static` variable) and the 3-day demo states in `dashboard/cases/`. `weights/stats.json` is already in place.
4. Then: shock-response tests, LocalNet and the EXP-1 comparison (`docs/MODEL_STRATEGY.md`).

**W2**
1. Clone, install (`DEVELOPMENT.md`), run `python serve.py --port 8000` and the tests; confirm the validator passes on your machine.
2. Build the dashboard core against `docs/DASHBOARD_API.md`: configurable base URL, request queue (one at a time, 15 s timeout), loading and error states, India map canvas, timeline and variable selectors, baseline vs scenario vs difference.
3. Own `tests/`: add a test for every new server behaviour; keep `tools/preflight.py` green.

**W3**
1. Work in `dashboard/ui-sandbox.html` with mock data so you do not wait for W2: palette and colour ramps, legend, cards, charts, scenario controls, impact indicators, responsive layout, accessibility.
2. Deliver them as modules in `dashboard/js/ui/` using the signatures in `dashboard/README.md`.
3. Draft the demo flow and the brief outline. Numbers go in only after W2 has re-run them.

## 5. Rules that protect the score
- The dashboard shows only live outputs of our server, and says clearly when the model is a placeholder or unvalidated (`docs/DASHBOARD_API.md` §5).
- Impact indicators that are proxies are labelled as proxies (`CLAUDE.md` §5).
- The scan rules in `CLAUDE.md` §4 apply to everything the server imports (`serve.py`, `twin/`).
