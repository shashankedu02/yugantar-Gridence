"""Damped anomaly persistence (DAP) and its lead-wise fallback (DAP-LW). Pure NumPy, independent of the API.

Definitions (docs/MODEL_STRATEGY.md section 5 and docs/24_HOUR_EXECUTION_PLAN.md fallback F0):

  DAP     x_k = clim(d0 + k) + phi^k * (x_0 - clim(d0)),  phi in [0, 0.99] per channel and cell.
  DAP-LW  x_k = x_0 + w[k, c] * (clim(d0 + k) - x_0),     w in [0, 1] per lead k and channel c.
          w = 0 is persistence and w = 1 is climatology.

Status: NOT VALIDATED. Nothing here is fitted until `training/fit_dap.py` runs on the real dataset, and it only
counts as a safe submission after it passes checkpoint G-DAP on the frozen validation windows.

Shapes: states are [C, H, W] with C = 6 in contract order; rollouts are [steps, C, H, W].
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from . import doy

PHI_MAX = 0.99
_EPS = 1e-12


class Climatology:
    """A 366-slot daily climatology table [366, C, H, W] (see `doy` for the slot convention)."""

    def __init__(self, table: np.ndarray) -> None:
        table = np.asarray(table, dtype=np.float32)
        if table.ndim != 4 or table.shape[0] != doy.N_SLOTS:
            raise ValueError(f"climatology table must be [{doy.N_SLOTS}, C, H, W], got {table.shape}")
        if not np.isfinite(table).all():
            raise ValueError("climatology table contains NaN or Inf")
        self.table = table

    @classmethod
    def from_npz(cls, path: Path) -> "Climatology":
        with np.load(path) as z:
            if "clim" not in z.files:
                raise ValueError(f"{path} has no array named 'clim' (found {z.files})")
            return cls(z["clim"])

    def at_day(self, n: int) -> np.ndarray:
        """Climatology [C, H, W] for nominal day of year n (1..365)."""
        return self.table[doy.clim_slot(n)]

    def lead_days(self, n0: int, steps: int) -> np.ndarray:
        """Climatology for lead days 1..steps after nominal day n0: [steps, C, H, W]."""
        return np.stack([self.at_day(doy.advance(n0, k)) for k in range(1, steps + 1)])


class DampedAnomalyPersistence:
    """Per-cell damping of the last-day anomaly towards climatology."""

    def __init__(self, phi: np.ndarray | None = None) -> None:
        self.phi: np.ndarray | None = None
        if phi is not None:
            self.phi = self._check_phi(phi)

    @staticmethod
    def _check_phi(phi: np.ndarray) -> np.ndarray:
        phi = np.asarray(phi, dtype=np.float32)
        if phi.ndim != 3 or not np.isfinite(phi).all():
            raise ValueError("phi must be a finite [C, H, W] array")
        return np.clip(phi, 0.0, PHI_MAX).astype(np.float32)

    def fit(self, anom_now: np.ndarray, anom_next: np.ndarray) -> "DampedAnomalyPersistence":
        """Least squares on lag-1 anomalies, one coefficient per channel and cell, no intercept.

        anom_now[n] and anom_next[n] are anomalies of consecutive days, [N, C, H, W]. The caller must pass only
        pairs from the training years (no validation or test days) and only truly consecutive days.
        """
        a0 = np.asarray(anom_now, dtype=np.float32)
        a1 = np.asarray(anom_next, dtype=np.float32)
        if a0.shape != a1.shape or a0.ndim != 4 or a0.shape[0] < 2:
            raise ValueError(f"need two matching [N, C, H, W] arrays with N >= 2, got {a0.shape} and {a1.shape}")
        num = np.einsum("nchw,nchw->chw", a0, a1, dtype=np.float64)
        den = np.einsum("nchw,nchw->chw", a0, a0, dtype=np.float64)
        phi = np.where(den > _EPS, num / np.maximum(den, _EPS), 0.0)
        self.phi = self._check_phi(phi)
        return self

    def forecast(self, x_last: np.ndarray, n0: int, steps: int, clim: Climatology) -> np.ndarray:
        """Forecast [steps, C, H, W] for lead days 1..steps from the last input day `x_last` [C, H, W] (day n0)."""
        if self.phi is None:
            raise RuntimeError("DAP has no coefficients: run training/fit_dap.py, or load them with DampedAnomalyPersistence.load")
        x_last = np.asarray(x_last, dtype=np.float32)
        if x_last.shape != self.phi.shape:
            raise ValueError(f"x_last {x_last.shape} does not match phi {self.phi.shape}")
        anomaly = x_last - clim.at_day(n0)
        powers = self.phi[None] ** np.arange(1, steps + 1, dtype=np.float32)[:, None, None, None]
        return (clim.lead_days(n0, steps) + powers * anomaly[None]).astype(np.float32)

    def save(self, path: Path) -> None:
        if self.phi is None:
            raise RuntimeError("nothing to save: DAP is not fitted")
        np.savez(path, phi=self.phi)

    @classmethod
    def load(cls, path: Path) -> "DampedAnomalyPersistence":
        with np.load(path) as z:
            if "phi" not in z.files:
                raise ValueError(f"{path} has no array named 'phi' (found {z.files})")
            return cls(z["phi"])


class LeadWiseBlend:
    """DAP-LW fallback: one blend weight per lead day and channel between persistence (0) and climatology (1)."""

    def __init__(self, w: np.ndarray | None = None) -> None:
        self.w: np.ndarray | None = None if w is None else self._check_w(w)

    @staticmethod
    def _check_w(w: np.ndarray) -> np.ndarray:
        w = np.asarray(w, dtype=np.float32)
        if w.ndim != 2 or not np.isfinite(w).all():
            raise ValueError("w must be a finite [steps, C] array")
        return np.clip(w, 0.0, 1.0).astype(np.float32)

    def fit(self, x0: np.ndarray, clim_leads: np.ndarray, truth_leads: np.ndarray) -> "LeadWiseBlend":
        """Least squares for x_true_k - x0 = w * (clim_k - x0), pooled over samples and cells.

        x0 [N, C, H, W]; clim_leads and truth_leads [N, K, C, H, W]. Training years only.
        """
        x0 = np.asarray(x0, dtype=np.float32)[:, None]
        d_clim = np.asarray(clim_leads, dtype=np.float32) - x0
        d_true = np.asarray(truth_leads, dtype=np.float32) - x0
        if d_clim.shape != d_true.shape or d_clim.ndim != 5:
            raise ValueError(f"need matching [N, K, C, H, W] arrays, got {d_clim.shape} and {d_true.shape}")
        num = np.einsum("nkchw,nkchw->kc", d_true, d_clim, dtype=np.float64)
        den = np.einsum("nkchw,nkchw->kc", d_clim, d_clim, dtype=np.float64)
        self.w = self._check_w(np.where(den > _EPS, num / np.maximum(den, _EPS), 0.0))
        return self

    def forecast(self, x_last: np.ndarray, n0: int, steps: int, clim: Climatology) -> np.ndarray:
        if self.w is None:
            raise RuntimeError("DAP-LW has no weights: fit it first")
        if steps > self.w.shape[0]:
            raise ValueError(f"DAP-LW was fitted for {self.w.shape[0]} leads, asked for {steps}")
        x_last = np.asarray(x_last, dtype=np.float32)
        w = self.w[:steps, :, None, None]
        return (x_last[None] + w * (clim.lead_days(n0, steps) - x_last[None])).astype(np.float32)
