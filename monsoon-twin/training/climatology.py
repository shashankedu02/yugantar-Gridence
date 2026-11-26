"""Daily climatology from the TRAINING years only.

Recipe (the kit's, so our reference matches the judge's): the mean of each calendar day over the training years,
with the 29th of February in its own slot (366 slots), then a circular running mean over `smooth_days` slots.

    python -m training.climatology --nc data/india_climate_train.nc --out weights/climatology.npz
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from .data import DatasetError, load_dataset, load_split

N_SLOTS = 366
# Days before the first of each month in a leap year: slot = this + day_of_month - 1 (so slot 59 = 29 February).
_CUM_DAYS_LEAP = np.array([0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335])


def slot_index(times: np.ndarray) -> np.ndarray:
    """datetime64[D] [T] -> int [T] in 0..365, with 29 February in its own slot."""
    months = times.astype("datetime64[M]")
    month = months.astype(int) % 12                                   # 0..11
    day = (times - months.astype("datetime64[D]")).astype(int)        # 0-based day of month
    return _CUM_DAYS_LEAP[month] + day


def build_climatology(data: np.ndarray, times: np.ndarray, smooth_days: int = 15) -> np.ndarray:
    """[T, C, H, W] daily fields + times -> [366, C, H, W] float32. Raises if a calendar slot has no sample."""
    slots = slot_index(times)
    counts = np.bincount(slots, minlength=N_SLOTS)
    if (counts == 0).any():
        empty = np.nonzero(counts == 0)[0].tolist()
        raise DatasetError(f"climatology slots without any sample: {empty[:10]}. Need several full years including a leap year.")
    total = np.zeros((N_SLOTS,) + data.shape[1:], dtype=np.float64)
    np.add.at(total, slots, data)
    clim = total / counts[:, None, None, None]
    half = smooth_days // 2
    smooth = sum(np.roll(clim, -o, axis=0) for o in range(-half, half + 1)) / (2 * half + 1)
    return smooth.astype(np.float32)


def save_climatology(table: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez(path, clim=table.astype(np.float32))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build the training-years climatology table.")
    ap.add_argument("--nc", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "weights" / "climatology.npz")
    args = ap.parse_args(argv)
    try:
        ds, _ = load_dataset(args.nc)
        data, times = load_split(ds, "train")
        table = build_climatology(data, times)
    except DatasetError as e:
        print(f"ERROR: {e}")
        return 2
    save_climatology(table, args.out)
    print(f"wrote {args.out}  shape {table.shape}  from {len(times)} training days ({times[0]} .. {times[-1]})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
