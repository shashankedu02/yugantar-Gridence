# Contribution guide

Read `CLAUDE.md` first: its rules override anything here.

## 1. First 15 minutes (each person)
1. Clone the team repo. Create a venv with Python 3.11 (3.10 or later is fine).
2. Install the libraries:
   - B1: `pip install -r requirements-train.txt` (torch, numpy, scipy, pandas, xarray, netCDF4, pyyaml for training configs only)
   - B2: `pip install -r requirements-serve.txt` (fastapi, uvicorn, numpy, torch)
   - Everyone: `pip install monsoon_r1_kit-1.0.0-py3-none-any.whl` (the kit, for tests and eval only; **never imported by `serve.py` or `twin/`**)
3. Put `india_climate_train.nc` in `data/`. It is gitignored. Never commit it.
4. Run `pytest -q`, then the repo scan **on a clean git export** (CLAUDE.md §4.11), to confirm the baseline is green. Scanning your working folder will flag your local `data/` files.

## 2. Module ownership
The ownership table lives in **`CLAUDE.md` §1** (the single source of truth). If you need a change in someone else's module, post `[BLOCKER]` or open an issue with the exact interface you need. Don't edit it yourself.

## 3. Branch and PR rules
- **Branches:** `b1/<topic>`, `b2/<topic>`, `aud/<topic>`, created from the latest `main`.
- **Keep PRs small:** one concern each, about 300 changed lines or fewer (excluding vendored files and weights).
- **PR description template:**
  ```
  What: …
  Why: … (link to doc section / decision ID)
  Tests run: pytest ✓ / repo_scan on clean export 15/15 ✓ (from G-DAP on; earlier: no unexpected flags) / validator ✓ (if serve or twin changed)
  Metrics (if model): eval/reports/<file>
  ```
- **Merging:** AUD reviews and merges, using squash-merge. Builders don't merge their own PRs into `main`.
- **Tags:** tag green states: `safe-dap` (only if G-DAP passed), `cand-1`, `cand-2`, `final`.

## 4. Coding conventions
- Python 3.10+, type hints on public functions, docstrings in plain words.
- Paths are always relative to `pathlib.Path(__file__).parent`.
- Arrays are float32 at boundaries. Shapes are named in comments as `[T, C, H, W]`.
- **Inference files (`serve.py`, `twin/`):**
  - No calendar dates, no data-source names, and no UI library names, **not even in comments**.
  - No imports outside the sandbox list.
  - No file writes (except to `/tmp`).
- Training, eval and test files may use dates, xarray and yaml, but must never contain `/simulate`, `'simulate'` or `"simulate"` (CLAUDE.md §4.1). Tests never spell out the forbidden words; they import the patterns from `monsoon_r1.repo_scan`.
- JS: ES modules, no build step, no CDN. Vendored files go in `dashboard/vendor/` with their licence.
- Formatting: `black` or `ruff format` if available; otherwise stay consistent.

## 5. Commit messages
Conventional Commits: `feat(scope): …`, `fix(scope): …`, `test(scope): …`, `docs(scope): …`, `chore(weights): …`. Scopes: `twin`, `train`, `serve`, `dash`, `eval`, `tests`, `docs`, `brief`.

## 6. Working with Claude Code
- **Open every session with:** `I am <B1|B2>. Follow CLAUDE.md. Only edit files I own per CLAUDE.md §1. Task: <one specific task with file paths>.`
- **Ask for tests with code:** "write the function and a pytest for it".
- **Never accept generated numbers.** Metrics come from running `eval/`.
- **Before committing, ask Claude:** "check this diff against CLAUDE.md §4 (repo-scan rules)".
- **If Claude proposes changing an interface in `SYSTEM_ARCHITECTURE.md` §4:** stop, and post a `[DECISION]` to the team.

## 7. Definition of done
See `TEAM_WORKFLOW.md` §7.
