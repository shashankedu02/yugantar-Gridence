# Phase 8: final integration and release candidate

27 Nov 2026. **Release candidate: commit `1dcab6e`** on `integration/final-submission`. Later commits add only these reports.

## Integration review
- Merged in order: `main` (`e45c36d`) ← W1 (`1be905a` plus 23 formerly uncommitted files) ← W2 (`a136509`) ← W3 (`28aaa6b`). No Git conflicts.
- All W3 modules are now used. `model-banner.js` is an alias used by the sandbox only.
- Removed leftovers: unused custom-brush state, two unused imports, a "Stage 2B" placeholder text.
- One colour implementation serves the map and the legend. W2's small fallback renderers remain for the case that a W3 module fails to load; they duplicate those modules by design.
- Not done: moving W2's page onto W3's class names (cosmetic).

## Clean-checkout verification of `1dcab6e`
New clone; new virtual environment.
| Step | Result |
|---|---|
| README quick start with **only** `requirements-serve.txt` | Server and dashboard start; no dataset needed |
| Demo runbook rehearsal in a browser, in that environment | **10 / 10**; 39 requests, all to this machine; no failed request; console clean |
| README test section (test dependencies added) | Python **602 passed, 1 skipped** (the no-weights test); JavaScript 16/16; browser 31/31, 46/46, 37/37 |
| Preflight (`--fast`, tests run just before) | PASSED, scan 15.0/15 |
| Official scan on `git archive` | **15.0 / 15, no flags**; all five health checks true |
| Kit schema validator | All pass |
| README evaluation command | Runs |
| Working tree afterwards | Clean |

The rehearsal did not physically disconnect the network; it checked that no browser request left the machine. The server's outbound connections were tested with them blocked in Phase 6.

## Brief against implementation
The brief describes DAP as served and LocalNet as inactive, which matches. Its table matches `eval/reports/`. Its figure was captured from the running system. **If the served model changes, the brief, README, runbook and figure must change with it.**

## Acceptance
**Met:** the project works from a clean checkout of the local branch without hidden or untracked files. It has **not** been checked from GitHub, because nothing has been pushed.
