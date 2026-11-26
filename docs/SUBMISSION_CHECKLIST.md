# Submission checklist

AUD runs this at H22, ticking each box only with evidence. Record the results in `eval/reports/submission_check.md`.

## A. Repository content (PS §3)
- [ ] `serve.py` is at the repo root and starts with `python serve.py --port 8000` on `0.0.0.0`
- [ ] Training code is present and runs (`python -m training.train_localnet --config …`), with real `.backward()`/optimizer steps
- [ ] Weights are in `weights/` (`model.pt`, `climatology.npz`, `dap.npz`, `static.npz`, `norm.json`, `calib.json`); total under 2 GB; each file under 100 MB, or in LFS **and** verified in a fresh clone
- [ ] `weights/MANIFEST.md` lists the commit, config, split and validation scores
- [ ] Dashboard code is in `dashboard/`, separate from the server
- [ ] README explains how to train and how to run (server and dashboard); followed successfully from a fresh clone by someone who didn't write it
- [ ] ERA5 attribution is in the README (NOTICE wording) and nowhere in `serve.py` or `twin/`
- [ ] No `.nc`, `.grib` or `.zarr` files, and no cached data arrays with more than 400 days
- [ ] The repo is **public**: open the URL in an incognito window

## B. Automated-scan self-check
- [ ] Scan of a **clean export** of the final commit (`git worktree add <empty dir> final`) gives **15.0**, flags `[]`, all health fields true; JSON saved
- [ ] `inference_files` lists only `serve.py` and `twin/*`
- [ ] grep for each source name in the CLAUDE.md §4 list in `serve.py twin/` finds nothing
- [ ] grep for date patterns in `serve.py twin/` finds nothing

## C. Sandbox rehearsal (L5) from a fresh clone
- [ ] Clean environment with only the sandbox libraries, network off, repo read-only, 4 CPUs, 6 GB
- [ ] `/health` is ready in under 120 s (record the time)
- [ ] Kit `schema_validator` passes all checks
- [ ] 8 back-to-back calls each finish in under 5 s, with the maximum recorded
- [ ] `model_name` shows the LocalNet (or the DAP, if that was the decision)

## D. Gate (from eval/reports/final)
- [ ] Validity 100% on every validation and test window at 10 and 14 steps
- [ ] Day-4 skill vs persistence > 0
- [ ] Null shock bit-identical, in-process and over HTTP (lists and b64)
- [ ] warm_ocean and monsoon_stall are non-zero and localised (record the propagates and stable results too)

## E. Brief (2 pages, PDF)
- [ ] Exactly 2 pages
- [ ] Page 1: model design, drift/blur prevention, failure modes
- [ ] Page 2: visualization and impact use case
- [ ] Includes the USP and architecture (general PDF)
- [ ] Every number traces to `eval/reports/*`
- [ ] Limitations stated
- [ ] Data attribution included
- [ ] Team name and repo URL on page 1

## F. Demo readiness
- [ ] Dashboard works with Wi-Fi off on the demo laptop
- [ ] A backup screen recording exists, made from live calls
- [ ] DEMO_AND_JUDGING drill done

## G. Final
- [ ] Final commit tagged `final`; the commit hash is written in the submission form
- [ ] No pushes after submission (frozen)
