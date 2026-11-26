"""Freeze the validation windows BEFORE any model is scored (docs/TESTING_AND_VALIDATION.md §2.1).

    python -m eval.windows --nc data/india_climate_train.nc            # writes eval/windows_val.json, refuses to overwrite
    python -m eval.windows --nc ... --force                            # only before any model has been scored

A window = 3 input days + `steps` target days, all inside the validation years (2018-2019).
Selection is seeded and rule-based, not hand-picked. ASSUMPTION: the rules below only imitate the hidden set's
regimes (onset, heavy rain, heatwave, cyclone, winter disturbance, dry); the real hidden windows are unknown.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from .data_io import load_archive, split_mask

HERE = Path(__file__).resolve().parent
OUT = HERE / "windows_val.json"
STEPS = 10
N_IN = 3
SEED = 20260
N_SPREAD = 40


def _month(day: np.datetime64) -> int:
    return int(day.astype("datetime64[M]").astype(int) % 12 + 1)


def build(data: np.ndarray, times: np.ndarray) -> dict:
    vidx = np.nonzero(split_mask(times, "val"))[0]
    lo, hi = int(vidx[0]), int(vidx[-1])
    starts = np.arange(lo, hi - (N_IN + STEPS) + 2)            # first-input-day index; the last target day must be <= hi
    last_in = starts + N_IN - 1
    months = np.array([_month(times[i]) for i in last_in])
    rng = np.random.default_rng(SEED)
    picked: list[tuple[int, str]] = []
    for m in range(1, 13):
        cand = starts[months == m]
        k = 4 if m <= N_SPREAD - 36 else 3                     # 40 = 12*3 + 4
        for s in rng.choice(cand, size=min(k, len(cand)), replace=False):
            picked.append((int(s), "spread"))

    tp = data[:, 1]                                            # [T,H,W]
    t2m = data[:, 0]
    speed = np.hypot(data[:, 2], data[:, 3])

    def score(s: int, fn) -> float:
        return float(fn(slice(s, s + N_IN), slice(s + N_IN, s + N_IN + STEPS)))

    rules = {
        "regime_onset": ((5, 6), lambda i, o: tp[o].mean() - tp[i].mean(), max),
        "regime_heavy_rain": ((6, 7, 8, 9), lambda i, o: tp[o].mean(), max),
        "regime_heatwave": ((4, 5, 6), lambda i, o: t2m[o].mean(), max),
        "regime_cyclone_wind": ((4, 5, 10, 11, 12), lambda i, o: speed[o].max(), max),
        "regime_winter_disturbance": ((12, 1, 2), lambda i, o: tp[o][:, 19:, :].mean(), max),   # rows 19.. = lat >= 25.5
        "regime_nearly_dry": ((11, 12, 1, 2), lambda i, o: tp[i].mean() + tp[o].mean(), min),
    }
    for name, (ms, fn, pick) in rules.items():
        cand = [int(s) for s, m in zip(starts, months) if m in ms]
        best = pick(cand, key=lambda s, fn=fn: score(s, fn))
        picked.append((best, name))

    seen: dict[int, str] = {}
    for s, kind in picked:                                     # a regime tag wins over 'spread' for the same start
        if s not in seen or seen[s] == "spread":
            seen[s] = kind
    wins = [{"first_input_day": str(times[s]), "last_input_day": str(times[s + N_IN - 1]),
             "steps": STEPS, "kind": kind} for s, kind in sorted(seen.items())]
    battery = []
    for m in (1, 3, 5, 7, 9, 11):                              # one spread window per odd month, for the shock battery
        for w in wins:
            if w["kind"] == "spread" and _month(np.datetime64(w["last_input_day"])) == m:
                battery.append(w["first_input_day"]); break
    return {"split": "val", "seed": SEED, "steps": STEPS, "n_input_days": N_IN, "windows": wins,
            "battery_first_input_days": battery}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--nc", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args(argv)
    if a.out.exists() and not a.force:
        print(f"{a.out} already exists and is frozen; refusing to overwrite (use --force before any scoring).")
        return 1
    data, times = load_archive(a.nc)
    spec = build(data, times)
    a.out.write_text(json.dumps(spec, indent=1) + "\n")
    kinds = {}
    for w in spec["windows"]:
        kinds[w["kind"]] = kinds.get(w["kind"], 0) + 1
    print(f"wrote {a.out}: {len(spec['windows'])} windows {kinds}; battery windows: {len(spec['battery_first_input_days'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
