# Demo runbook (current build)

This describes what the current build does. `DEMO_AND_JUDGING.md` is an earlier plan and mentions features that were not built (ensemble, split view, wind particles, break index): do not promise them.

## Before the demo
1. Free port 8000. On Windows: `Get-NetTCPConnection -LocalPort 8000 -State Listen` shows the owning process; make sure it is not an old server.
2. Terminal 1: `python serve.py --port 8000`.
3. Terminal 2: `python -m http.server 5500 -d dashboard`, then open <http://localhost:5500> at 1366×768 or larger.
4. Check the top bar says **Ready (…)** with the model you intend to show.
5. Turn Wi-Fi off and reload the page. Everything must still work.
6. Record a backup screen capture of the steps below, from live calls.

## Walk-through (about 4 minutes)
1. **Case:** "Active monsoon". Say: these are 3 real input days; the forecast is computed now. Run. Point at the line above the map naming the model.
2. **Time:** press Space to play, arrows to step. Switch variables with 1–6.
3. **Cell:** click a cell: baseline against climatology.
4. **Official shock:** Warm Bay of Bengal → Run → **D** for the difference. Open the energy chart caption: how much of the response left the shocked area.
5. **A judge's shock:** open **Custom shock**; choose variable, size and shape; for a blob use *Pick centre on map*. **Add to shock** → **Run**. Several components can be added.
6. **Impact Lens:** read baseline, scenario and change; open one "ⓘ method" and read the limitation aloud.

## What to say when it does not spread (DAP)
"The served model is damped anomaly persistence: each variable and cell on its own. It is stable and cannot drift, but it cannot move a shock. We trained a convolutional model that does spread many shocks; it failed some stability and propagation checks, so you see its numbers in our brief." Change this paragraph if the served model changes.

## Likely questions
| Question | Answer |
|---|---|
| Is this a real forecast? | Computed live by our server from the 3 input days; the top line names the model. |
| Why did rain not change? | With DAP a shock without rain cannot change rain. It is a model limit. |
| How good is it? | Local numbers in the brief, measured by one team member, not independently reproduced. |
| What if the server fails? | The dashboard shows an error and removes old results; press Run again after restart. |
| What about extreme shocks? | Inputs are limited to physical ranges. Far outside real weather, results are not meaningful. |

## If something breaks
- "Offline": check terminal 1, then press **Connect**.
- Wrong model in the banner: another server owns the port. Stop it, restart ours, press Connect.
- Blank page: confirm the second terminal serves the `dashboard` folder.
