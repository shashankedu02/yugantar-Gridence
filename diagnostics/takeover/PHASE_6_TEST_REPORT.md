# Phase 6: testing, security and performance

27 Nov 2026. Tested commit: `991c9e3`. Browser and API inputs are the dashboard demo cases or synthetic states. **Only the evaluation reruns say anything about forecast quality, and they are not independent.**

## Test results
| Suite | Where | Result |
|---|---|---|
| Python (pytest), includes contract, engine, DAP, LocalNet, server, presets, preflight | Fresh clone, new virtual environment (torch 2.15.0+cpu) | **602 passed, 1 skipped** |
| Skip explained | | `test_server.py`: the test for the state with no weights; weights are present |
| JavaScript unit tests (`node --test tests/js/`) | Fresh clone | 16 / 16 |
| Browser: integration and errors | Fresh clone, headless Edge | 31 / 31 |
| Browser: display accuracy, layout, keyboard, safety | Fresh clone | 46 / 46 |
| Browser: cases, custom shocks, impact | Fresh clone | 37 / 37 |
| Kit schema validator | Fresh clone; and a write-denied copy | All pass |
| Preflight (fixed) | Fresh clone | PASSED: scan 15.0/15, no flags |
| Preflight on the earlier pushed-only merge | | **FAILS** as it should (6.5/15) |
| DAP harness rerun, frozen windows | Integration branch, output to scratch | 390 values compared: match, apart from the window-file hash (line endings) and two extra weight files listed |
| DAP shock battery rerun | Same | 116 values match apart from that hash. Null identical; localised 6/6 windows; **propagation 0/12** |

The browser tests compare against independently computed values: map pixels against colours read from the legend's CSS, energy bars and impact numbers against separate calculations, and presets against the kit's `make_shock`.

## Preflight defect fixed
It removed "no model checkpoint" from its failures, so it passed a tree scoring 6.5/15. It now fails on any flag or any missing point, with a test.

## Offline, read-only, performance
| Check | Result |
|---|---|
| Server process with outbound connections blocked | 0 attempts; kit not imported |
| Repository made read-only by Windows permissions, Python cache writing left on | Server ready, validator passes, no files added |
| DAP, 4 logical processors | Ready 1.4 s; 8 back-to-back 10-step calls max 59 ms; 30 steps 98 ms; peak 101 MB |
| LocalNet (Phase 2, scratch copy) | Ready ≤ 6.4 s; 10 steps ≤ 130 ms; 30 steps ≤ 288 ms; peak ≤ 622 MB |

## Security
| Check | Result |
|---|---|
| Secret patterns in lines added since `main`, and in the tracked tree | None |
| `.env`, climate data, caches, virtual environments, `runs/`, `data/` tracked | None |
| Largest tracked file; total | `weights/climatology.npz` 10.1 MB; 12.3 MB |
| Local user paths or e-mail addresses | None (one match is the public repository URL) |
| Loading code | `torch.load(weights_only=True)`; NumPy loads without pickle; no `eval`, `pickle`, shell calls |
| Inference network imports | None |
| Dashboard | No external URLs; server and file text is never parsed as HTML (tested with a hostile header) |
| **Open: older public history** | See the Phase 0 report. Owner action |
| Accepted by design | The server listens on all interfaces without authentication and allows any origin, as the contract and the separate dashboard require. Do not expose it to an untrusted network |
| P3 | Request body size is not limited |

## Not verified
- Linux, and the judge's processor, Python and PyTorch versions.
- Browsers other than Edge; a screen reader; colour-contrast measurement.
- A physically disconnected machine (outbound connections were blocked in the server process).
- Any re-run by a second person.

## Acceptance
| Criterion | Result |
|---|---|
| Required tests pass; skips explained | **Met** |
| Scan genuinely clean | **Met** |
| Offline inference | **Met** within the stated method |
| Performance measured | **Met** on this PC |
| No secret or unwanted artifact committed on this branch | **Met**. The older history item is not from this branch and remains the owner's action |
