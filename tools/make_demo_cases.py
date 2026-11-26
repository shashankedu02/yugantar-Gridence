"""Write a few demo INPUT states for the dashboard from the validation years (2018-2019).

    python tools/make_demo_cases.py --nc data/india_climate_train.nc

Each case holds only the 3 input days and the calendar pair of the last one: no targets, no forecasts. The server
never reads these files; every forecast shown on the dashboard is computed live from them. Cases are chosen by fixed
rules on the INPUT days themselves, never by how well any model does on them.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from eval.data_io import doy_sincos, load_archive  # noqa: E402

CORE_ZONE = (18.0, 28.0, 65.0, 88.0)          # lat0, lat1, lon0, lon1 (core monsoon zone)
YEARS = (2018, 2019)


def _core(field: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    la = (lat >= CORE_ZONE[0]) & (lat <= CORE_ZONE[1])
    lo = (lon >= CORE_ZONE[2]) & (lon <= CORE_ZONE[3])
    return field[..., la, :][..., lo].mean(axis=(-2, -1))


def _pick(days: np.ndarray, score: np.ndarray, months: tuple[int, ...]) -> int:
    """Index of the highest score among last-input days in `months` of the validation years."""
    years = days.astype("datetime64[Y]").astype(int) + 1970
    month = days.astype("datetime64[M]").astype(int) % 12 + 1
    ok = np.isin(years, YEARS) & np.isin(month, months)
    ok[:2] = False
    ok[2:] &= (days[2:] - days[:-2]) == np.timedelta64(2, "D")      # three consecutive days
    return int(np.flatnonzero(ok)[np.argmax(score[ok])])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--nc", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=ROOT / "dashboard" / "cases")
    a = ap.parse_args()
    import xarray as xr

    data, times = load_archive(a.nc)
    with xr.open_dataset(a.nc) as ds:
        static = np.asarray(ds["static"].values, dtype=np.float32)   # [2,32,36]: land-sea mask, orography
    days = times.astype("datetime64[D]")
    keep = days <= np.datetime64(f"{YEARS[-1]}-12-31")              # the test years are dropped before any use
    data, days = data[keep], days[keep]
    lat, lon = 6.5 + np.arange(32), 65.5 + np.arange(36)
    land = static[0] >= 0.5
    rain3 = _core(data[:, 1], lat, lon)
    rain3 = np.convolve(rain3, np.ones(3) / 3.0)[: len(rain3)]       # mean of days t-2..t
    land_t = data[:, 0][:, land].mean(axis=1)

    rules = [
        ("monsoon-active", "Active monsoon", _pick(days, rain3, (7, 8)),
         "July-August input window with the most core-zone rain"),
        ("monsoon-weak", "Weak monsoon spell", _pick(days, -rain3, (7, 8)),
         "July-August input window with the least core-zone rain"),
        ("pre-monsoon-heat", "Pre-monsoon heat", _pick(days, land_t, (4, 5)),
         "April-May last input day with the warmest land mean"),
        ("winter", "Winter", _pick(days, -land_t, (12, 1, 2)),
         "December-February last input day with the coolest land mean"),
    ]
    a.out.mkdir(parents=True, exist_ok=True)
    names = []
    for case_id, title, i, rule in rules:
        state = np.round(data[i - 2: i + 1].astype(np.float64), 3)
        state[:, 1] = np.maximum(state[:, 1], 0.0)
        pair = doy_sincos(days[i])
        case = {"id": case_id, "label": f"{title} (ERA5 input to {days[i]})",
                "date_label": f"3 input days ending {days[i]}", "selection_rule": rule,
                "source": "Contains modified Copernicus Climate Change Service information (ERA5), CC BY 4.0",
                "doy_sincos": [float(pair[0]), float(pair[1])], "init_states": state.tolist()}
        (a.out / f"{case_id}.json").write_text(json.dumps(case, separators=(",", ":")) + "\n", encoding="utf-8")
        names.append(f"{case_id}.json")
        print(f"{case_id:18s} last input day {days[i]}  ({rule})")
    (a.out / "index.json").write_text(json.dumps({"cases": names}, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
