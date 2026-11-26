"""Shock battery (L3): the kit's two shocks on 6 frozen windows, scored with the kit's own causality checks.

    python -m eval.shock_battery --nc data/india_climate_train.nc --weights weights --name dap-v0

Reads eval/windows_val.json (battery_first_input_days). Reports measured numbers only; it states no direction or speed
of spread (CLAUDE.md §5). Gate (G-DAP / EXP-1): null identical, and BOTH shocks non-zero and localised on >= 5/6 windows.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from monsoon_r1 import scoring
from monsoon_r1.contract import BOX_ARABIAN_SEA, BOX_BAY_OF_BENGAL

from twin.engine import Engine

from .data_io import doy_sincos, load_archive
from .harness import sha256

HERE = Path(__file__).resolve().parent
SHOCKS = {"warm_ocean": BOX_BAY_OF_BENGAL, "monsoon_stall": BOX_ARABIAN_SEA}


def run_battery(engine, data, times, first_days: list[str], steps: int, std: np.ndarray) -> dict:
    index = {str(t): i for i, t in enumerate(times)}
    rows, null_ok_all = [], True
    for fd in first_days:
        s = index[fd]; init = data[s:s + 3]; sc = doy_sincos(times[s + 2])
        base = engine.simulate(init, sc, steps, None)
        null_ok = scoring.null_consistent(base, engine.simulate(init, sc, steps, np.zeros((6, 32, 36), np.float32)), std)
        null_ok_all &= null_ok
        row = {"first_input_day": fd, "null_ok": null_ok}
        for name, box in SHOCKS.items():
            delta = scoring.make_shock(name, init[-1], std)
            res = scoring.causality_checks(base, engine.simulate(init, sc, steps, delta), box, std)
            row[name] = {k: (bool(v) if isinstance(v, (bool, np.bool_)) else float(v)) for k, v in res.items()}
        rows.append(row)
    both = sum(1 for r in rows if all(r[n]["nonzero"] and r[n]["localized"] for n in SHOCKS))
    return {"windows": rows, "null_ok_all": null_ok_all, "windows_both_nonzero_and_localized": both, "n_windows": len(rows),
            "gate_both_localized_ge_5_of_6": bool(both >= 5 and len(rows) >= 6)}


def to_markdown(name: str, rep: dict) -> str:
    r = rep["result"]
    lines = [f"# Shock battery: {name}", "", f"model: `{rep['model_name']}` | windows: {r['n_windows']} | std source: {rep['std_source']}", "",
             f"- null shock identical on all windows: **{'PASS' if r['null_ok_all'] else 'FAIL'}**",
             f"- both shocks non-zero and localised: {r['windows_both_nonzero_and_localized']}/{r['n_windows']} windows "
             f"(gate >= 5/6: **{'PASS' if r['gate_both_localized_ge_5_of_6'] else 'FAIL'}**)", "",
             "| window | shock | nonzero | localized | propagates | stable | near-frac day1 | far-frac max |", "|---|---|---|---|---|---|---|---|"]
    for w in r["windows"]:
        for n in SHOCKS:
            c = w[n]
            lines.append(f"| {w['first_input_day']} | {n} | {c['nonzero']} | {c['localized']} | {c['propagates']} | {c['stable']} | "
                         f"{c.get('near_frac_day1', float('nan')):.2f} | {c.get('far_frac_max', float('nan')):.3f} |")
    lines += ["", "Measured on the kit's checks with this model. Re-run from a fresh clone (W2) before quoting."]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--nc", type=Path, required=True)
    ap.add_argument("--weights", type=Path, default=HERE.parent / "weights")
    ap.add_argument("--windows", type=Path, default=HERE / "windows_val.json")
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", type=Path, default=HERE / "reports")
    a = ap.parse_args(argv)
    if not a.windows.is_file():
        print(f"{a.windows} missing: run `python -m eval.windows --nc ...` first."); return 1
    spec = json.loads(a.windows.read_text())
    data, times = load_archive(a.nc)
    engine = Engine(a.weights)
    std_list = engine.channel_std()
    std = np.asarray(std_list if std_list is not None else scoring.STD_DEFAULT, np.float32)
    res = run_battery(engine, data, times, spec["battery_first_input_days"], int(spec["steps"]), std)
    rep = {"name": a.name, "model_name": engine.meta()["model"].get("name"), "windows_sha256": sha256(a.windows),
           "std_source": "weights/stats.json" if std_list is not None else "kit STD_DEFAULT (stats.json missing)", "result": res}
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / f"shock_{a.name}.json").write_text(json.dumps(rep, indent=1, default=float) + "\n")
    (a.out / f"shock_{a.name}.md").write_text(to_markdown(a.name, rep))
    print((a.out / f"shock_{a.name}.md").read_text())
    return 0 if res["null_ok_all"] and res["gate_both_localized_ge_5_of_6"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
