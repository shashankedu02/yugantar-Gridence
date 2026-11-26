"""LocalNet data preparation: static fields, training-years normalisation, and training samples. No training here.

    python -m training.localnet_data --nc data/india_climate_train.nc

Writes (it never writes or changes climatology.npz or dap.npz in weights/):
    weights/static.npz      the organisers' static fields, unchanged
    weights/norm.json       statistics over 2005-2017, for the final retraining
    runs/tune/              climatology.npz and norm.json over 2005-2015 only (tuning uses 2016-2017), static.npz
The tuning stage must not see 2016-2017 through the climatology either, hence its own climatology table.
Validation (2018-2019) and test (2020-2021) days are rejected by every selector in this module.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from twin import doy
from twin.transforms import tp_to_log1p

from .climatology import build_climatology, save_climatology
from .data import SPLIT_YEARS, DatasetError, load_dataset, load_split, window_starts
from .fit_dap import lag1_pairs

REPO = Path(__file__).resolve().parent.parent
FIT_YEARS = (2005, 2015)       # initial training
TUNE_YEARS = (2016, 2017)      # choosing hyperparameters, loss scaling and epochs
FINAL_YEARS = (2005, 2017)     # one retraining after the choices are frozen


def year_mask(times: np.ndarray, years: tuple[int, int]) -> np.ndarray:
    """Boolean mask for whole calendar years, restricted to the training split."""
    first, last = years
    lo, hi = SPLIT_YEARS["train"]
    if not lo <= first <= last <= hi:
        raise DatasetError(f"years {years} leave the training split {lo}-{hi}: validation and test days are held out")
    y = times.astype("datetime64[Y]").astype(int) + 1970
    return (y >= first) & (y <= last)


def compute_norm(data: np.ndarray, times: np.ndarray, static: np.ndarray, years: tuple[int, int]) -> dict:
    """Per-channel mean/std of the state and std of the one-day change, in model space (rain as log1p)."""
    mask = year_mask(times, years)
    d, t = data[mask], times[mask]
    if len(d) < 2:
        raise DatasetError(f"no usable days in {years}")
    z = tp_to_log1p(d)                                                      # [T,6,H,W]
    i0, i1 = lag1_pairs(t)
    mean = z.mean(axis=(0, 2, 3), dtype=np.float64)
    std = z.std(axis=(0, 2, 3), dtype=np.float64)
    change = (z[i1] - z[i0]).std(axis=(0, 2, 3), dtype=np.float64)
    oro = float(np.asarray(static[1], dtype=np.float64).std())
    if not ((std > 0).all() and (change > 0).all() and oro > 0):
        raise DatasetError("a normalisation std is zero")
    return {"space": "physical units, rain as log1p(mm/day)", "years": list(years), "n_days": int(len(d)),
            "n_day_pairs": int(len(i0)), "state_mean": mean.tolist(), "state_std": std.tolist(),
            "tendency_std": change.tolist(), "orography_scale": oro}


def request_doy_sincos(day: np.datetime64) -> tuple[float, float]:
    """What a request carries for the last input day: the contract formula with the day of year 1..366.
    ASSUMPTION (same as eval/): the judge counts the true day of year."""
    day = np.datetime64(day, "D")
    n = int((day - day.astype("datetime64[Y]").astype("datetime64[D]")).astype(int)) + 1
    a = 2.0 * np.pi * n / 365.0
    return float(np.sin(a)), float(np.cos(a))


def serving_day(day: np.datetime64) -> int:
    """The nominal day the server derives for this last input day. Training must use this, not the calendar slot."""
    return doy.from_sincos(*request_doy_sincos(day))


def sample_starts(times: np.ndarray, years: tuple[int, int], n_out: int) -> np.ndarray:
    """First-day indices of samples (3 input + n_out target days, consecutive) lying entirely inside `years`."""
    return window_starts(times, year_mask(times, years), n_in=3, n_out=n_out)


def make_batch(data: np.ndarray, times: np.ndarray, starts: np.ndarray, n_out: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(history [B,3,6,H,W], n0 [B] serving convention, targets [B,n_out,6,H,W] = the ACTUAL following days)."""
    starts = np.asarray(starts, dtype=np.int64)
    history = data[starts[:, None] + np.arange(3)[None]]
    targets = data[starts[:, None] + 3 + np.arange(n_out)[None]]
    n0 = np.array([serving_day(times[s + 2]) for s in starts], dtype=np.int64)
    return history, n0, targets


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=1) + "\n", encoding="utf-8", newline="\n")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--nc", type=Path, default=None)
    ap.add_argument("--weights-dir", type=Path, default=REPO / "weights")
    ap.add_argument("--tune-dir", type=Path, default=REPO / "runs" / "tune")
    a = ap.parse_args(argv)
    try:
        ds, _ = load_dataset(a.nc)
        if ds.static is None or not np.isfinite(ds.static).all():
            raise DatasetError("the dataset has no finite 'static' variable")
        data, times = load_split(ds, "train")                       # 2005-2017 only from here on
        tune_clim = build_climatology(data[year_mask(times, FIT_YEARS)], times[year_mask(times, FIT_YEARS)])
        tune_norm = compute_norm(data, times, ds.static, FIT_YEARS)
        final_norm = compute_norm(data, times, ds.static, FINAL_YEARS)
    except DatasetError as e:
        print(f"ERROR: {e}")
        return 2
    final_clim = a.weights_dir / "climatology.npz"
    if final_clim.is_file():
        with np.load(final_clim) as z:
            if not np.array_equal(z["clim"], build_climatology(data, times)):
                print(f"ERROR: {final_clim} does not match a {FINAL_YEARS} rebuild; not writing anything")
                return 2
    for folder in (a.weights_dir, a.tune_dir):
        folder.mkdir(parents=True, exist_ok=True)
        np.savez(folder / "static.npz", static=ds.static.astype(np.float32))
    save_climatology(tune_clim, a.tune_dir / "climatology.npz")
    _write_json(a.tune_dir / "norm.json", tune_norm)
    _write_json(a.weights_dir / "norm.json", final_norm)
    for p in (a.weights_dir / "static.npz", a.weights_dir / "norm.json", a.tune_dir / "climatology.npz",
              a.tune_dir / "norm.json", a.tune_dir / "static.npz"):
        print(f"wrote {p}  sha256 {_sha256(p)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
