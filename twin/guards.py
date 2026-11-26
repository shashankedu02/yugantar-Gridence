"""Physical guards for model states and outputs.

Ranges are the ones fixed in CLAUDE.md section 3 (item 8). They sit just inside the judge's validity gate
(t2m within -40..+60 C, rain never negative), so a clamped state always passes that gate.

Shapes are written [..., C, H, W] with C = 6 channels in contract order: t2m, tp, u10, v10, msl, tcwv.
"""
from __future__ import annotations

import numpy as np

CHANNELS: tuple[str, ...] = ("t2m", "tp", "u10", "v10", "msl", "tcwv")
N_CHANNELS = 6

# Physical limits per channel: K, mm/day, m/s, m/s, Pa, kg/m2.
LOWER = np.array([233.2, 0.0, -60.0, -60.0, 85000.0, 0.0], dtype=np.float32)
UPPER = np.array([333.1, 1000.0, 60.0, 60.0, 110000.0, 100.0], dtype=np.float32)


def all_finite(x: np.ndarray) -> bool:
    """True when `x` holds no NaN and no Inf."""
    return bool(np.isfinite(x).all())


def clamp_state(x: np.ndarray) -> np.ndarray:
    """Clip a state array [..., 6, H, W] into the physical limits. Returns a new float32 array.

    NaN is not repaired here (np.clip passes it through): check `all_finite` first, or use `replace_nonfinite`.
    """
    x = np.asarray(x, dtype=np.float32)
    if x.ndim < 3 or x.shape[-3] != N_CHANNELS:
        raise ValueError(f"expected [..., {N_CHANNELS}, H, W], got shape {x.shape}")
    return np.clip(x, LOWER[:, None, None], UPPER[:, None, None]).astype(np.float32, copy=False)


def replace_nonfinite(x: np.ndarray, fallback: np.ndarray) -> np.ndarray:
    """Return `x` with every NaN/Inf entry taken from `fallback` (same shape)."""
    x = np.asarray(x, dtype=np.float32)
    return np.where(np.isfinite(x), x, np.asarray(fallback, dtype=np.float32)).astype(np.float32, copy=False)
