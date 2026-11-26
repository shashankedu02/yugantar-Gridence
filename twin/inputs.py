"""LocalNet input conventions shared by training and serving. NumPy only; no calendar dates anywhere.

Calendar: both sides start from the request pair [sin, cos] of the LAST input day, recover the nominal day with
`doy.from_sincos`, and derive every target day from it. In leap years this convention can sit one climatology slot
later than the true calendar slot (see `doy`). Training deliberately uses the same convention, so the network sees
the inputs it will be served. Training TARGETS are still the actual following days.

Input channel order (30):
   0..17  normalised states of days t-2, t-1, t (6 channels each, oldest first; rain as log1p)
  18..23  normalised climatology of the target day
  24..25  land-sea mask, scaled orography
  26..27  sin, cos of the target day
  28      latitude, (lat - 22) / 9
  29      distance to the domain edge, min(cells, 5) / 5
"""
from __future__ import annotations

import math

import numpy as np

from . import doy

N_STATE = 6
N_DAYS_IN = 3
GRID = (32, 36)
N_INPUT_CHANNELS = 30
LAT_FIRST = 6.5                       # centre of the southernmost row, degrees north (1 degree spacing)
_EDGE_CAP = 5

# Look-up tables over the nominal day n = 1..365 (index 0 is unused), built from the serving functions.
SLOT_OF_DAY = np.array([0] + [doy.clim_slot(n) for n in range(1, doy.N_NOMINAL + 1)], dtype=np.int64)
SINCOS_OF_DAY = np.array(
    [(0.0, 0.0)] + [(math.sin(2.0 * math.pi * n / doy.N_NOMINAL), math.cos(2.0 * math.pi * n / doy.N_NOMINAL))
                    for n in range(1, doy.N_NOMINAL + 1)], dtype=np.float32)


def target_days(n0: np.ndarray, lead: int) -> np.ndarray:
    """Nominal day [B] that lies `lead` days (>= 1) after the nominal last-input days n0 [B]."""
    n0 = np.asarray(n0, dtype=np.int64)
    if n0.ndim != 1 or (n0 < 1).any() or (n0 > doy.N_NOMINAL).any() or lead < 1:
        raise ValueError("n0 must be a 1-D array of nominal days 1..365 and lead must be >= 1")
    return (n0 - 1 + lead) % doy.N_NOMINAL + 1


def calendar_features(doy_sincos: tuple[float, float], lead: int, clim_table: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(climatology [6,32,36], [sin, cos]) of the day `lead` days after the day described by `doy_sincos`."""
    n = target_days(np.array([doy.from_sincos(*doy_sincos)]), lead)[0]
    return np.asarray(clim_table[SLOT_OF_DAY[n]], dtype=np.float32), SINCOS_OF_DAY[n].copy()


def static_features(static: np.ndarray, orography_scale: float) -> np.ndarray:
    """[4,32,36] = land-sea mask, orography / scale, latitude, edge distance, from the raw static array [2,32,36]."""
    static = np.asarray(static, dtype=np.float32)
    if static.shape != (2,) + GRID or not np.isfinite(static).all():
        raise ValueError(f"static must be a finite [2,32,36] array, got {static.shape}")
    if not (math.isfinite(orography_scale) and orography_scale > 0):
        raise ValueError("orography_scale must be a positive number")
    rows, cols = np.indices(GRID)
    lat = (LAT_FIRST + rows - 22.0) / 9.0
    edge = np.minimum(np.minimum(rows, GRID[0] - 1 - rows), np.minimum(cols, GRID[1] - 1 - cols))
    edge = np.minimum(edge, _EDGE_CAP) / _EDGE_CAP
    return np.stack([static[0], static[1] / np.float32(orography_scale), lat, edge]).astype(np.float32)
