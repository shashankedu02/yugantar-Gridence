"""Fit the DAP coefficients (and the climatology they are relative to) on the TRAINING years only.

    python -m training.fit_dap --nc data/india_climate_train.nc

Writes weights/climatology.npz and weights/dap.npz. The result is NOT validated: score it on the frozen
validation windows (checkpoint G-DAP) before treating it as a safe submission.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from twin.dap import DampedAnomalyPersistence

from .climatology import build_climatology, save_climatology, slot_index
from .data import CHANNELS, DatasetError, load_dataset, load_split

WEIGHTS_DIR = Path(__file__).resolve().parent.parent / "weights"


def lag1_pairs(times: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Indices (i, i+1) of consecutive calendar days inside one chronological array."""
    i = np.nonzero(np.diff(times).astype("timedelta64[D]").astype(int) == 1)[0]
    return i, i + 1


def fit_from_arrays(data: np.ndarray, times: np.ndarray) -> tuple[DampedAnomalyPersistence, np.ndarray]:
    """Fit on arrays that already contain only training days. Returns (fitted DAP, climatology table)."""
    clim = build_climatology(data, times)
    anomalies = data - clim[slot_index(times)]
    i0, i1 = lag1_pairs(times)
    model = DampedAnomalyPersistence().fit(anomalies[i0], anomalies[i1])
    return model, clim


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Fit damped anomaly persistence on the training years.")
    ap.add_argument("--nc", type=Path, default=None)
    ap.add_argument("--weights-dir", type=Path, default=WEIGHTS_DIR)
    args = ap.parse_args(argv)
    try:
        ds, _ = load_dataset(args.nc)
        data, times = load_split(ds, "train")          # validation and test days are never read here
        model, clim = fit_from_arrays(data, times)
    except DatasetError as e:
        print(f"ERROR: {e}")
        return 2
    args.weights_dir.mkdir(parents=True, exist_ok=True)
    save_climatology(clim, args.weights_dir / "climatology.npz")
    model.save(args.weights_dir / "dap.npz")
    print(f"fitted on {len(times)} training days ({times[0]} .. {times[-1]}); wrote climatology.npz and dap.npz to {args.weights_dir}")
    for i, c in enumerate(CHANNELS):
        q = np.quantile(model.phi[i], [0.05, 0.5, 0.95])
        print(f"  phi {c:5s} 5%/50%/95% = {q[0]:.3f} / {q[1]:.3f} / {q[2]:.3f}")
    print("NOT VALIDATED: run the validation harness (checkpoint G-DAP) before relying on these weights.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
