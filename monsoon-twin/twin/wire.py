"""Request parsing and response encoding for the HTTP layer. No web framework is imported here.

Contract (kit docs/R1_CONTRACT.md): arrays arrive as nested JSON lists, or as {"b64": ..., "shape": [...]} with
little-endian float32 bytes (the kit validator sends both). Everything is physical units. This module only
validates and converts; it never repairs input.
"""
from __future__ import annotations

import base64
import binascii
import math
from dataclasses import dataclass

import numpy as np

STATE_SHAPE = (3, 6, 32, 36)
PERTURBATION_SHAPE = (6, 32, 36)
MAX_STEPS = 30


class WireError(ValueError):
    """The request is malformed. The message is safe to return to the client."""


@dataclass(frozen=True)
class SimulateRequest:
    init_states: np.ndarray            # float32 [3, 6, 32, 36], oldest first
    doy_sincos: tuple[float, float]    # sin, cos of the day of year of init_states[-1]
    steps: int                         # 1..MAX_STEPS
    perturbation: np.ndarray | None    # float32 [6, 32, 36] or None


def decode_array(x: object, expect_shape: tuple[int, ...], name: str) -> np.ndarray:
    """Nested lists or a base64 dict to a finite float32 array of exactly `expect_shape`."""
    if isinstance(x, dict):
        b64, shape = x.get("b64"), x.get("shape")
        if not isinstance(b64, str) or not isinstance(shape, list):
            raise WireError(f"{name}: an array object needs a string 'b64' and a list 'shape'")
        try:
            shape_t = tuple(int(s) for s in shape)
        except (TypeError, ValueError):
            raise WireError(f"{name}: 'shape' must be a list of integers") from None
        if shape_t != tuple(expect_shape):
            raise WireError(f"{name}: shape {list(shape_t)} != expected {list(expect_shape)}")
        try:
            raw = base64.b64decode(b64, validate=True)
        except (binascii.Error, ValueError):
            raise WireError(f"{name}: 'b64' is not valid base64") from None
        if len(raw) != int(np.prod(shape_t)) * 4:
            raise WireError(f"{name}: 'b64' holds {len(raw)} bytes, expected {int(np.prod(shape_t)) * 4} (float32)")
        arr = np.frombuffer(raw, dtype="<f4").reshape(shape_t).astype(np.float32)
    elif isinstance(x, list):
        try:
            with np.errstate(over="ignore"):
                arr = np.asarray(x, dtype=np.float32)
        except (TypeError, ValueError):
            raise WireError(f"{name}: not a rectangular array of numbers") from None
        if arr.shape != tuple(expect_shape):
            raise WireError(f"{name}: shape {list(arr.shape)} != expected {list(expect_shape)}")
    else:
        raise WireError(f"{name}: expected nested lists or a {{'b64','shape'}} object")
    if not np.isfinite(arr).all():
        raise WireError(f"{name}: contains NaN or Inf")
    return arr


def _number(v: object, name: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise WireError(f"{name}: expected finite numbers")
    return float(v)


def parse_simulate_request(body: object) -> SimulateRequest:
    """Validate a decoded JSON body and return typed arrays."""
    if not isinstance(body, dict):
        raise WireError("request body must be a JSON object")
    for key in ("init_states", "doy_sincos", "steps"):
        if key not in body:
            raise WireError(f"missing field '{key}'")
    init = decode_array(body["init_states"], STATE_SHAPE, "init_states")

    d = body["doy_sincos"]
    if not isinstance(d, (list, tuple)) or len(d) != 2:
        raise WireError("doy_sincos must be a list [sin, cos]")
    doy_pair = (_number(d[0], "doy_sincos"), _number(d[1], "doy_sincos"))

    s = body["steps"]
    if isinstance(s, bool) or not isinstance(s, (int, float)) or not float(s).is_integer():
        raise WireError("steps must be an integer")
    steps = int(s)
    if not 1 <= steps <= MAX_STEPS:
        raise WireError(f"steps must be between 1 and {MAX_STEPS}, got {steps}")

    pert_raw = body.get("perturbation")
    pert = None if pert_raw is None else decode_array(pert_raw, PERTURBATION_SHAPE, "perturbation")
    return SimulateRequest(init, doy_pair, steps, pert)


def encode_rollout(out: np.ndarray) -> list:
    """The canonical response format: plain nested lists of finite floats."""
    return np.asarray(out, dtype=np.float32).tolist()
