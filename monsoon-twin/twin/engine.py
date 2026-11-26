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
# A plausible state, used only to warm the engine up at start-up (never returned to a client).
_WARMUP_STATE = np.array([295.0, 2.0, 0.0, 0.0, 100500.0, 30.0], dtype=np.float32)


class MissingWeightsError(FileNotFoundError):
    """Required model files are absent or inconsistent."""


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
        warm = np.broadcast_to(_WARMUP_STATE[None, :, None, None], (3, 6, 32, 36)).astype(np.float32)
        self.simulate(warm, (0.0, 1.0), 2, None)

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
