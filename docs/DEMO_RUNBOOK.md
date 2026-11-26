# Demo runbook (current build)

This describes what the current build does. `DEMO_AND_JUDGING.md` is an earlier plan and mentions features that were not built (ensemble, split view, wind particles, break index): do not promise them.

## Before the demo
1. Free port 8000. On Windows: `Get-NetTCPConnection -LocalPort 8000 -State Listen` shows the owning process; make sure it is not an old server.
2. Terminal 1: `python serve.py --port 8000`.
3. Terminal 2: `python -m http.server 5500 -d dashboard`, then open <http://localhost:5500> and press **Ctrl+F5** (the simple file server lets the browser keep old files after an update).
4. Check the **Model answering** card at the top right says **monsoontwin-localnet-c64-unvalidated · mode: localnet** (the header shortens long names). If it says DAP, LocalNet did not load: read the reason in terminal 1 (usually `torch` is missing).
5. Turn Wi-Fi off and reload the page. Everything must still work.
6. Record a backup screen capture of the steps below, from live calls.

## Walk-through (about 4 minutes)
1. **First screen:** say what it shows: real weather on the last input day, labelled "not a forecast". Click two variable buttons to show it responds.
2. **Run:** with "Active monsoon" and no shock, press **Run forecast**. Point at the line above the map naming the model.
3. **Time and cells:** press **Play**, then use the arrow buttons beside it or the slider. Point at the map to read a cell. Pick a city under **Cell inspector** to chart it against climatology.
4. **Official shock:** change the case to **Weak monsoon spell** and click **Warm Bay of Bengal**. The map previews what the shock adds. Run, then open **Difference**. Step from day 1 to day 8 and read the energy chart caption: how much of the response is outside the shocked area. Say why you changed case: on "Active monsoon" neither official shock spreads by the organisers' check (see the table below).
5. **A judge's shock:** open **Custom shock**; choose variable, size and shape; for a blob use *Pick centre on map*. **Add to shock** → **Run** → **Difference**. Several components can be added; a custom shock replaces an official one. Pick another shock only when you are ready to run again: it removes the scenario on screen.
6. **Impact Lens:** read baseline, scenario and change; look at the daily chart, not only the total; open one "ⓘ method" and read the limitation aloud.

**Say about the map:** each block is a real 1° value; the white outline only shows where the shock was applied; the colour range is fitted to this run, so read the legend's numbers, and do not compare colours between two runs (or choose *Map options → Fixed* first).

## Which official shocks spread on the demo cases
Measured with the organisers' propagation check on CPU-only PyTorch 2.15.0 and 2.6.0 (same result on both). All eight were non-zero, local on day 1 and within the stability limit. These four cases are not the frozen test windows. If a judge picks another case or shock, report what you see.

| Case | Warm Bay of Bengal | Monsoon Stall |
|---|---|---|
| Active monsoon | does not spread | does not spread |
| Weak monsoon spell | spreads | does not spread |
| Pre-monsoon heat | spreads | spreads |
| Winter | spreads | does not spread |

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
