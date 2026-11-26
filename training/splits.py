"""Training-year restrictions, enforced in code.

A `Split` physically holds ONLY the days of its own years, so a sample index cannot reach another period. Gradient
updates accept only the fitting split (2005-2015); 2016-2017 is for tuning decisions; 2018-2021 cannot be built here.
`load_tuning_setup` also refuses to run unless the climatology and normalisation on disk equal a rebuild from the
fitting years alone.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .climatology import build_climatology
from .data import Dataset, load_split
from .localnet_data import FIT_YEARS, TUNE_YEARS, compute_norm, year_mask

ALLOWED = {"fit": FIT_YEARS, "tune": TUNE_YEARS}


class LeakageError(RuntimeError):
    """Data, statistics or a model would cross a split boundary."""


def years_of(times: np.ndarray) -> np.ndarray:
    return times.astype("datetime64[Y]").astype(int) + 1970


@dataclass(frozen=True)
class Split:
    name: str                 # "fit" or "tune"
    data: np.ndarray          # [T,6,32,36] physical, these years only
    times: np.ndarray         # datetime64[D] [T]

    def __post_init__(self) -> None:
        self.verify()

    @property
    def years(self) -> tuple[int, int]:
        return ALLOWED[self.name]

    def verify(self) -> None:
        if self.name not in ALLOWED:
            raise LeakageError(f"unknown split {self.name!r}: only {sorted(ALLOWED)} exist for training code")
        if len(self.data) != len(self.times) or not len(self.times):
            raise LeakageError("split data and times do not match")
        found = years_of(self.times)
        first, last = ALLOWED[self.name]
        if found.min() < first or found.max() > last:
            raise LeakageError(f"split {self.name!r} must stay inside {first}-{last}, found {found.min()}-{found.max()}")

    @classmethod
    def from_arrays(cls, name: str, data: np.ndarray, times: np.ndarray) -> "Split":
        """Copy only this split's years out of arrays that may hold more."""
        if name not in ALLOWED:
            raise LeakageError(f"unknown split {name!r}")
        mask = year_mask(times, ALLOWED[name])
        return cls(name, np.ascontiguousarray(data[mask]), times[mask].copy())


def require_fit(split: Split) -> None:
    """Called by everything that updates or fits parameters."""
    split.verify()
    if split.name != "fit":
        raise LeakageError(f"parameters may be fitted on 2005-2015 only, not on split {split.name!r}")


def load_splits(ds: Dataset) -> tuple[Split, Split]:
    data, times = load_split(ds, "train")                       # 2005-2017: validation and test days are dropped here
    return Split.from_arrays("fit", data, times), Split.from_arrays("tune", data, times)


def sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


@dataclass(frozen=True)
class TuningSetup:
    clim: np.ndarray          # [366,6,32,36] from 2005-2015
    norm: dict
    static: np.ndarray
    clim_path: Path
    norm_path: Path


def load_tuning_setup(tune_dir: Path, fit: Split, static: np.ndarray) -> TuningSetup:
    """The ONLY way the trainer gets a climatology and normalisation: verified against a 2005-2015 rebuild."""
    require_fit(fit)
    clim_path, norm_path = Path(tune_dir) / "climatology.npz", Path(tune_dir) / "norm.json"
    with np.load(clim_path) as z:
        clim = z["clim"]
    if not np.array_equal(clim, build_climatology(fit.data, fit.times)):
        raise LeakageError(f"{clim_path} is not the climatology of 2005-2015 (did it include later years?)")
    norm = json.loads(norm_path.read_text(encoding="utf-8"))
    if norm != compute_norm(fit.data, fit.times, static, FIT_YEARS):
        raise LeakageError(f"{norm_path} does not equal the statistics of 2005-2015")
    return TuningSetup(clim, norm, np.asarray(static, np.float32), clim_path, norm_path)
