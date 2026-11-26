"""The simulation engine behind the API. Knows nothing about HTTP.

Modes, decided once at start-up from the files in `weights/`:
  persistence  no weights present: repeats the last day. A PLACEHOLDER, not a forecasting model.
  dap          `climatology.npz` and `dap.npz` present: damped anomaly persistence. Fitted by
               `training/fit_dap.py`; NOT validated until it passes checkpoint G-DAP.
LocalNet is not implemented yet.

Guarantees (docs/SYSTEM_ARCHITECTURE.md section 4.1): deterministic; a zero perturbation gives output
bit-identical to no perturbation; all output finite and inside the physical limits.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np

from . import doy
from .dap import Climatology, DampedAnomalyPersistence
from .guards import all_finite, clamp_state

log = logging.getLogger("twin.engine")

MODEL_NAME_PLACEHOLDER = "placeholder-persistence"
MODEL_NAME_DAP = "monsoontwin-dap-unvalidated"
MAX_STEPS = 30
_CLIM_FILE = "climatology.npz"
_DAP_FILE = "dap.npz"
_STATIC_FILE = "static.npz"        # optional: array 'static' [2,32,36] = land_sea_mask, orography_m
_STATS_FILE = "stats.json"         # optional: the organisers' stats.json, copied verbatim
_CARD_FILE = "model_card.json"     # optional: free-form model card shown by the dashboard
LAT = [6.5 + i for i in range(32)]
LON = [65.5 + i for i in range(36)]
CHANNELS = ("t2m", "tp", "u10", "v10", "msl", "tcwv")
CHANNEL_UNITS = ("K", "mm/day", "m/s", "m/s", "Pa", "kg/m2")
# A plausible state, used only to warm the engine up at start-up (never returned to a client).
_WARMUP_STATE = np.array([295.0, 2.0, 0.0, 0.0, 100500.0, 30.0], dtype=np.float32)


class MissingWeightsError(FileNotFoundError):
    """Required model files are absent or inconsistent."""


class NotAvailableError(RuntimeError):
    """A dashboard data product needs a file that has not been produced yet (the message says which)."""


class Engine:
    def __init__(self, weights_dir: Path, allow_placeholder: bool = True) -> None:
        self.weights_dir = Path(weights_dir)
        clim_p, dap_p = self.weights_dir / _CLIM_FILE, self.weights_dir / _DAP_FILE
        present = [clim_p.is_file(), dap_p.is_file()]
        self._clim: Climatology | None = None
        self._dap: DampedAnomalyPersistence | None = None
        if all(present):
            self._clim = Climatology.from_npz(clim_p)
            self._dap = DampedAnomalyPersistence.load(dap_p)
            if self._clim.table.shape[1:] != self._dap.phi.shape:
                raise MissingWeightsError(
                    f"{_CLIM_FILE} grid {self._clim.table.shape[1:]} does not match {_DAP_FILE} grid {self._dap.phi.shape}")
            self.mode, self.model_name = "dap", MODEL_NAME_DAP
            log.warning("DAP loaded from %s. It is fitted but NOT validated until checkpoint G-DAP passes.", self.weights_dir)
        elif any(present):
            missing = _DAP_FILE if present[0] else _CLIM_FILE
            raise MissingWeightsError(
                f"{self.weights_dir} holds only one of {_CLIM_FILE} and {_DAP_FILE} (missing: {missing}). "
                "Both come from `python -m training.fit_dap`; copy them together.")
        elif allow_placeholder:
            self.mode, self.model_name = "persistence", MODEL_NAME_PLACEHOLDER
            log.warning("No weights in %s: serving the PLACEHOLDER persistence forecast. This is not a trained model.",
                        self.weights_dir)
        else:
            raise MissingWeightsError(
                f"No model files in {self.weights_dir}. Expected {_CLIM_FILE} and {_DAP_FILE}, "
                "produced by `python -m training.fit_dap` from the real training dataset.")
        self._load_optional()
        warm = np.broadcast_to(_WARMUP_STATE[None, :, None, None], (3, 6, 32, 36)).astype(np.float32)
        self.simulate(warm, (0.0, 1.0), 2, None)

    def _load_optional(self) -> None:
        """Dashboard-side files. Each is optional; absent means the matching endpoint says so instead of guessing."""
        self._static = self._std = self._card = self._core = None
        p = self.weights_dir / _STATIC_FILE
        if p.is_file():
            with np.load(p) as z:
                arr = z["static"].astype(np.float32)
            if arr.shape != (2, 32, 36) or not all_finite(arr):
                raise MissingWeightsError(f"{_STATIC_FILE}: 'static' must be a finite [2,32,36] array, got {arr.shape}")
            self._static = arr
        p = self.weights_dir / _STATS_FILE
        if p.is_file():
            std = json.loads(p.read_text())["std"]
            if len(std) != 6 or not all(isinstance(v, (int, float)) and v > 0 for v in std):
                raise MissingWeightsError(f"{_STATS_FILE}: 'std' must hold 6 positive numbers")
            self._std = [float(v) for v in std]
        p = self.weights_dir / _CARD_FILE
        if p.is_file():
            self._card = json.loads(p.read_text())
        if self._clim is not None:
            with np.load(self.weights_dir / _CLIM_FILE) as z:
                if "core_rain_mean" in z.files and "core_rain_std" in z.files:
                    self._core = (z["core_rain_mean"].astype(np.float32), z["core_rain_std"].astype(np.float32))
                    if self._core[0].shape != (doy.N_SLOTS,) or self._core[1].shape != (doy.N_SLOTS,):
                        raise MissingWeightsError(f"{_CLIM_FILE}: core_rain_mean/std must have {doy.N_SLOTS} values")

    # ---- dashboard data products (read-only; none of these change the forecast path) ----
    def climatology(self, doy_sincos: tuple[float, float], steps: int) -> np.ndarray:
        """Climatology [steps,6,32,36] for lead days 1..steps after the day given by doy_sincos."""
        if self._clim is None:
            raise NotAvailableError(f"climatology is not available yet: {_CLIM_FILE} has not been produced (python -m training.fit_dap)")
        if isinstance(steps, bool) or not isinstance(steps, (int, np.integer)) or not 1 <= steps <= MAX_STEPS:
            raise ValueError(f"steps must be an integer in 1..{MAX_STEPS}, got {steps!r}")
        return self._clim.lead_days(doy.from_sincos(*doy_sincos), int(steps))

    def core_zone_rain_stats(self, doy_sincos: tuple[float, float], steps: int) -> tuple[np.ndarray, np.ndarray]:
        """Mean and std of core-zone (18-28 N, 65-88 E) daily rain for lead days 1..steps."""
        if self._core is None:
            raise NotAvailableError(f"core-zone rain statistics are not available yet: {_CLIM_FILE} has no core_rain_mean/core_rain_std")
        n0 = doy.from_sincos(*doy_sincos)
        slots = [doy.clim_slot(doy.advance(n0, k)) for k in range(1, int(steps) + 1)]
        return self._core[0][slots], self._core[1][slots]

    def static_fields(self) -> np.ndarray | None:
        """[2,32,36] land_sea_mask and orography_m, or None until weights/static.npz exists."""
        return self._static

    def channel_std(self) -> list[float] | None:
        """The organisers' per-channel std (judge units), or None until weights/stats.json exists."""
        return self._std

    def model_card(self) -> dict | None:
        return self._card

    def meta(self) -> dict:
        """Everything the dashboard needs once at start-up. Missing pieces are null, never invented."""
        return {
            "grid": {"lat": LAT, "lon": LON},
            "channels": [{"name": n, "unit": u} for n, u in zip(CHANNELS, CHANNEL_UNITS)],
            "channel_std": self._std,
            "land_sea_mask": None if self._static is None else self._static[0].tolist(),
            "orography_m": None if self._static is None else self._static[1].tolist(),
            "model": {"name": self.model_name, "mode": self.mode,
                      "validated": bool((self._card or {}).get("validated", False)), "card": self._card},
        }

    def simulate(self, init_states: np.ndarray, doy_sincos: tuple[float, float], steps: int,
                 perturbation: np.ndarray | None) -> np.ndarray:
        """init_states [3,6,32,36] physical, oldest first; perturbation [6,32,36] delta or None.

        Returns float32 [steps,6,32,36]; rollout[k] is day k+1 after the last input day.
        """
        x = np.asarray(init_states, dtype=np.float32)
        if x.shape != (3, 6, 32, 36):
            raise ValueError(f"init_states must be [3,6,32,36], got {x.shape}")
        if isinstance(steps, bool) or not isinstance(steps, (int, np.integer)) or not 1 <= steps <= MAX_STEPS:
            raise ValueError(f"steps must be an integer in 1..{MAX_STEPS}, got {steps!r}")
        if not all_finite(x):
            raise ValueError("init_states contains NaN or Inf")
        last = x[-1].copy()
        if perturbation is not None:
            p = np.asarray(perturbation, dtype=np.float32)
            if p.shape != (6, 32, 36):
                raise ValueError(f"perturbation must be [6,32,36], got {p.shape}")
            if not all_finite(p):
                raise ValueError("perturbation contains NaN or Inf")
            if np.any(p != 0.0):          # a null shock must leave the state bit-identical, so skip the add
                last = last + p
        last = clamp_state(last)          # a shock can push rain below zero; clamp before simulating
        if self.mode == "dap":
            n0 = doy.from_sincos(*doy_sincos)
            out = self._dap.forecast(last, n0, int(steps), self._clim)
        else:
            out = np.repeat(last[None], steps, axis=0)
        out = clamp_state(out)
        if not all_finite(out):           # unreachable with finite weights; fail loudly rather than serve NaN
            raise FloatingPointError("engine produced a non-finite value")
        return np.ascontiguousarray(out, dtype=np.float32)
