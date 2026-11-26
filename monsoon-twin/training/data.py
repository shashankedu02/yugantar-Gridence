"""Training data loader: reads the organisers' NetCDF archive, validates it, and builds leak-free splits.

Expected file (kit build_dataset.export_nc): variable `data` [time, channel, lat, lon] in PHYSICAL units, with a
`channel` coordinate naming t2m, tp, u10, v10, msl, tcwv, `lat`/`lon` coordinates for the 32 x 36 grid, and an
optional variable `static` [static_channel, lat, lon] (land_sea_mask, orography_m).

Nothing is repaired silently: a missing file, a wrong grid, NaN, a non-monotonic time axis or obviously wrong
units raise `DatasetError` with the reason. The original file is only ever read.

    python -m training.data --nc data/india_climate_train.nc        # prints the dataset report
"""
from __future__ import annotations

import argparse
import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np

CHANNELS = ("t2m", "tp", "u10", "v10", "msl", "tcwv")
LAT = np.arange(6.5, 37.5 + 1e-9, 1.0)
LON = np.arange(65.5, 100.5 + 1e-9, 1.0)
GRID = (32, 36)
STATIC_CHANNELS = ("land_sea_mask", "orography_m")
# Chronological split by calendar year (CLAUDE.md section 6). The test years are touched once, at the end.
SPLIT_YEARS = {"train": (2005, 2017), "val": (2018, 2019), "test": (2020, 2021)}
ENV_VAR = "MT_DATA_NC"
REPO_ROOT = Path(__file__).resolve().parent.parent


class DatasetError(RuntimeError):
    """The dataset is missing or does not match what the contract and blueprint expect."""


class DatasetNotFoundError(DatasetError, FileNotFoundError):
    """The NetCDF file is not where we looked."""


@dataclass
class Dataset:
    data: np.ndarray             # float32 [T, 6, 32, 36], physical units
    times: np.ndarray            # datetime64[D] [T], strictly increasing
    static: np.ndarray | None    # float32 [2, 32, 36] or None
    source: Path


def default_path() -> Path:
    """`$MT_DATA_NC` if set, else data/india_climate_train.nc in the repo (git-ignored)."""
    env = os.environ.get(ENV_VAR)
    return Path(env) if env else REPO_ROOT / "data" / "india_climate_train.nc"


# --------------------------------------------------------------------------------------------- pure checks
def check_physical_units(data: np.ndarray) -> list[str]:
    """Catch obvious unit mistakes (Celsius, hPa, metres of rain). Returns a list of problems; empty = plausible."""
    problems = []
    means = data.mean(axis=(0, 2, 3), dtype=np.float64)
    if not 250.0 <= means[0] <= 320.0:
        problems.append(f"t2m mean {means[0]:.1f} is not in 250..320: expected Kelvin")
    if float(data[:, 1].max()) < 1.0:
        problems.append("tp never exceeds 1: expected mm/day (metres would be ~1000x smaller)")
    if float(data[:, 1].min()) < -1e-3:
        problems.append(f"tp has negative values (min {float(data[:, 1].min()):.3f})")
    if not 90000.0 <= means[4] <= 110000.0:
        problems.append(f"msl mean {means[4]:.0f} is not in 90000..110000: expected Pa")
    if not 5.0 <= means[5] <= 60.0:
        problems.append(f"tcwv mean {means[5]:.1f} is not in 5..60: expected kg/m2")
    return problems


def split_masks(times: np.ndarray) -> dict[str, np.ndarray]:
    """Boolean mask per split, by calendar year of each day."""
    years = times.astype("datetime64[Y]").astype(int) + 1970
    return {name: (years >= lo) & (years <= hi) for name, (lo, hi) in SPLIT_YEARS.items()}


def window_starts(times: np.ndarray, mask: np.ndarray, n_in: int = 3, n_out: int = 1) -> np.ndarray:
    """Start indices of windows of n_in input days + n_out target days that are consecutive calendar days and
    lie ENTIRELY inside `mask`. A window therefore never mixes train, validation and test days."""
    length = n_in + n_out
    n = len(times)
    if n < length:
        return np.zeros(0, dtype=np.int64)
    steps_ok = np.diff(times).astype("timedelta64[D]").astype(int) == 1          # [n-1]
    consecutive = np.array([steps_ok[i:i + length - 1].all() for i in range(n - length + 1)])
    inside = np.array([mask[i:i + length].all() for i in range(n - length + 1)])
    return np.nonzero(consecutive & inside)[0].astype(np.int64)


def dataset_statistics(data: np.ndarray, times: np.ndarray) -> dict:
    """Per split and channel: mean, std, min, max (physical units) and the day count."""
    out = {}
    for name, m in split_masks(times).items():
        if not m.any():
            out[name] = {"days": 0}
            continue
        d = data[m]
        out[name] = {
            "days": int(m.sum()),
            "first": str(times[m][0]), "last": str(times[m][-1]),
            **{c: {"mean": float(d[:, i].mean(dtype=np.float64)), "std": float(d[:, i].std(dtype=np.float64)),
                   "min": float(d[:, i].min()), "max": float(d[:, i].max())} for i, c in enumerate(CHANNELS)},
        }
    return out


def format_report(ds: Dataset, info: dict | None = None) -> str:
    gaps = int((np.diff(ds.times).astype("timedelta64[D]").astype(int) != 1).sum())
    lines = [f"file:   {ds.source}", f"data:   {ds.data.shape} float32, {ds.data.nbytes / 1e6:.0f} MB",
             f"time:   {ds.times[0]} .. {ds.times[-1]}  ({len(ds.times)} days, {gaps} gaps in the daily axis)",
             f"static: {None if ds.static is None else ds.static.shape}"]
    if info:
        lines.append(f"variables: {info['variables']}")
        lines.append(f"units attribute: {info['units']!r}")
    for name, s in dataset_statistics(ds.data, ds.times).items():
        if not s["days"]:
            lines.append(f"[{name}] no days")
            continue
        lines.append(f"[{name}] {s['days']} days {s['first']} .. {s['last']}")
        for c in CHANNELS:
            v = s[c]
            lines.append(f"   {c:5s} mean {v['mean']:12.4f}  std {v['std']:11.4f}  min {v['min']:12.4f}  max {v['max']:12.4f}")
    return "\n".join(lines)


# ------------------------------------------------------------------------------------------------ file I/O
def load_dataset(path: Path | None = None) -> tuple[Dataset, dict]:
    """Read and validate the NetCDF archive. Returns (Dataset, info) where info lists variables and the units attribute."""
    path = Path(path) if path else default_path()
    if not path.is_file():
        raise DatasetNotFoundError(
            f"Training dataset not found: {path}\n"
            "Required: india_climate_train.nc, the organisers' daily 6-channel archive (variable 'data', "
            "[time, channel, lat, lon]). Copy it to data/india_climate_train.nc (git-ignored), or pass --nc PATH, "
            f"or set {ENV_VAR}. It is not generated or substituted here.")
    try:
        import xarray as xr
    except ImportError as e:
        raise DatasetError("xarray is required to read the dataset: pip install -r requirements-train.txt") from e

    with xr.open_dataset(path) as ds:
        info = {"variables": sorted(ds.data_vars), "units": ds["data"].attrs.get("units") if "data" in ds else None}
        if "data" not in ds:
            raise DatasetError(f"{path.name}: no variable 'data'. Found: {sorted(ds.data_vars)}")
        da = ds["data"]
        missing_dims = {"time", "channel", "lat", "lon"} - set(da.dims)
        if missing_dims:
            raise DatasetError(f"{path.name}: 'data' has dims {da.dims}, missing {sorted(missing_dims)}")
        if "channel" not in da.coords or set(map(str, da["channel"].values)) != set(CHANNELS):
            raise DatasetError(f"{path.name}: channel coordinate must name exactly {CHANNELS}")
        da = da.transpose("time", "channel", "lat", "lon").sel(channel=list(CHANNELS))     # map channels by NAME
        if not (np.allclose(da["lat"].values, LAT, atol=1e-3) and np.allclose(da["lon"].values, LON, atol=1e-3)):
            raise DatasetError(f"{path.name}: lat/lon do not match the contract grid (lat 6.5..37.5 S->N, lon 65.5..100.5 W->E)")
        times = da["time"].values.astype("datetime64[D]")
        if len(times) < 10 or not (np.diff(times).astype(int) > 0).all():
            raise DatasetError(f"{path.name}: time axis must be strictly increasing, daily")
        data = np.asarray(da.values, dtype=np.float32)
        static = None
        if "static" in ds:
            sd = ds["static"]
            if "static_channel" in sd.coords:
                sd = sd.sel(static_channel=list(STATIC_CHANNELS))
            static = np.asarray(sd.values, dtype=np.float32)
            if static.shape != (2,) + GRID:
                raise DatasetError(f"{path.name}: 'static' must be [2, 32, 36], got {static.shape}")

    bad = ~np.isfinite(data)
    if bad.any():
        per_channel = {c: int(bad[:, i].sum()) for i, c in enumerate(CHANNELS) if bad[:, i].any()}
        raise DatasetError(f"{path.name}: {int(bad.sum())} missing or non-finite values (per channel: {per_channel}). "
                           "Not imputed; fix the archive or decide on a policy explicitly.")
    problems = check_physical_units(data)
    if problems:
        raise DatasetError(f"{path.name}: units look wrong: " + "; ".join(problems))
    return Dataset(data, times, static, path), info


def load_split(ds: Dataset, name: str, allow_test: bool = False) -> tuple[np.ndarray, np.ndarray]:
    """(data, times) restricted to one split. The test split needs allow_test=True: touch it once, at the end."""
    if name not in SPLIT_YEARS:
        raise ValueError(f"unknown split {name!r}; choose from {sorted(SPLIT_YEARS)}")
    if name == "test" and not allow_test:
        raise DatasetError("the test split (2020-2021) is held out; pass allow_test=True only for the final check")
    m = split_masks(ds.times)[name]
    return ds.data[m], ds.times[m]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Inspect and validate the training NetCDF archive.")
    ap.add_argument("--nc", type=Path, default=None, help=f"path to india_climate_train.nc (default: ${ENV_VAR} or data/)")
    args = ap.parse_args(argv)
    try:
        ds, info = load_dataset(args.nc)
    except DatasetError as e:
        print(f"ERROR: {e}")
        return 2
    print(format_report(ds, info))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
