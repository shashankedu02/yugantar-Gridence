# Demo runbook (current build)

This describes what the current build does. `DEMO_AND_JUDGING.md` is an earlier plan and mentions features that were not built (ensemble, split view, wind particles, break index): do not promise them.

## Before the demo
1. Free port 8000. On Windows: `Get-NetTCPConnection -LocalPort 8000 -State Listen` shows the owning process; make sure it is not an old server.
2. Terminal 1: `python serve.py --port 8000`.
3. Terminal 2: `python -m http.server 5500 -d dashboard`, then open <http://localhost:5500> at 1366×768 or larger.
4. Check the banner under the top bar says **monsoontwin-localnet-c64-unvalidated · mode: localnet** (the top bar shortens long names). If it says DAP, LocalNet did not load: read the reason in terminal 1 (usually `torch` is missing).
5. Turn Wi-Fi off and reload the page. Everything must still work.
6. Record a backup screen capture of the steps below, from live calls.

## Walk-through (about 4 minutes)
1. **Case:** "Active monsoon". Say: these are 3 real input days; the forecast is computed now. Run. Point at the line above the map naming the model.
2. **Time:** press Space to play, arrows to step. Switch variables with 1–6.
3. **Cell:** click a cell: baseline against climatology.
4. **Official shock:** Warm Bay of Bengal → Run → **D** for the difference. Step from day 1 to day 8 and read the energy chart caption: how much of the response is outside the shocked area.
5. **A judge's shock:** open **Custom shock**; choose variable, size and shape; for a blob use *Pick centre on map*. **Add to shock** → **Run**. Several components can be added.
6. **Impact Lens:** read baseline, scenario and change; look at the daily chart, not only the total; open one "ⓘ method" and read the limitation aloud.

## What to say about shocks (LocalNet)
"This is a trained local network. Its response starts where the shock is and can spread. It is not verified physics. In our local tests the warm-ocean shock spread in 6 of 6 windows, the monsoon-stall shock in only 2 of 6, and in one warm-ocean window a small temperature shock removed a heavy rain event at one cell." Do not say which way or how fast a response travels: we have not measured that.

**Do not promise a particular result.** Prefer "let us see what the model does". If a response does not spread, say so; it is a known weakness. If a total shows no change, check the daily chart: positive and negative days can cancel. An added-rain shock mostly fades within about two days in the cases we looked at.

## Likely questions
| Question | Answer |
|---|---|
| Is this a real forecast? | Computed live by our server from the 3 input days; the top line names the model. |
| Why did the rain total barely change? | Look at the daily chart: the response can be positive early and negative later. Added rain mostly fades within a few days in this model. |
| Why is it called unvalidated? | No second person has reproduced our local measurements. |
| How good is it? | Local numbers in the brief, measured by one team member, not independently reproduced. |
| What if the server fails? | The dashboard shows an error and removes old results; press Run again after restart. |
| What about extreme shocks? | Inputs are limited to physical ranges. Far outside real weather, results are not meaningful. |

## If something breaks
- "Offline": check terminal 1, then press **Connect**.
- A notice says a forecast used a fallback: that forecast is DAP's. Say so, then run again; no difference is drawn across a fallback.
- The banner says DAP: LocalNet did not load. You can still demo, but DAP cannot spread a shock, and a shock without rain cannot change rain. Say it is the fallback.
- Wrong model in the banner: another server owns the port. Stop it, restart ours, press Connect.
- Blank page: confirm the second terminal serves the `dashboard` folder.
