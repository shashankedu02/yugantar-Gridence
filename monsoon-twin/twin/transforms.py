"""Model-space transforms: per-channel normalisation and the log1p transform for rainfall.

The API always speaks physical units. These helpers are for use INSIDE a model only (LocalNet later); the DAP
and the persistence placeholder do not need them. Statistics (mean, std per channel) must come from the real
training data: nothing here ships default numbers.

Shapes: x is [..., 6, H, W]; mean and std are [6].
"""
from __future__ import annotations

import numpy as np

TP_CHANNEL = 1


def _check(x: np.ndarray, mean: np.ndarray, std: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mean = np.asarray(mean, dtype=np.float32).reshape(-1)
    std = np.asarray(std, dtype=np.float32).reshape(-1)
    if x.ndim < 3 or x.shape[-3] != 6 or mean.shape != (6,) or std.shape != (6,):
        raise ValueError(f"expected x [..., 6, H, W] and mean/std [6]; got {x.shape}, {mean.shape}, {std.shape}")
    if not (std > 0).all():
        raise ValueError("std must be positive for every channel")
    return mean[:, None, None], std[:, None, None]


def tp_to_log1p(x: np.ndarray) -> np.ndarray:
    """Copy of `x` with the rain channel replaced by log1p(max(tp, 0))."""
    out = np.array(x, dtype=np.float32, copy=True)
    out[..., TP_CHANNEL, :, :] = np.log1p(np.maximum(out[..., TP_CHANNEL, :, :], 0.0))
    return out


def tp_from_log1p(x: np.ndarray) -> np.ndarray:
    """Inverse of `tp_to_log1p`: rain is expm1 of the stored value, never negative."""
    out = np.array(x, dtype=np.float32, copy=True)
    out[..., TP_CHANNEL, :, :] = np.maximum(np.expm1(out[..., TP_CHANNEL, :, :]), 0.0)
    return out


def normalise(x: np.ndarray, mean: np.ndarray, std: np.ndarray) -> np.ndarray:
    """(x - mean) / std per channel, float32."""
    x = np.asarray(x, dtype=np.float32)
    m, s = _check(x, mean, std)
    return ((x - m) / s).astype(np.float32, copy=False)


def denormalise(z: np.ndarray, mean: np.ndarray, std: np.ndarray) -> np.ndarray:
    """Inverse of `normalise`."""
    z = np.asarray(z, dtype=np.float32)
    m, s = _check(z, mean, std)
    return (z * s + m).astype(np.float32, copy=False)
