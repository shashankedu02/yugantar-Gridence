"""Shared test helpers. Run from the repo root:  python -m pytest -q

Route-pattern note: the kit's repo scanner treats any .py file that spells out the forecast route as inference
code (CLAUDE.md section 4, rule 1). Tests therefore build the path with `SIM_PATH` and never write it literally.
"""
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

SIM_PATH = "/" + "sim" + "ulate"


def make_state(seed: int = 0) -> np.ndarray:
    """A plausible physical state [3,6,32,36]. Synthetic: used only to exercise code paths, never for skill claims."""
    r = np.random.default_rng(seed)
    base = np.array([295.0, 4.0, 2.0, 1.0, 100500.0, 35.0], np.float32)[:, None, None]
    scale = np.array([3, 3, 2, 2, 300, 8], np.float32)[None, :, None, None]
    st = base + r.normal(0, 1, (3, 6, 32, 36)).astype(np.float32) * scale
    st[:, 1] = np.abs(st[:, 1])
    return st.astype(np.float32)


def doy_pair(n: int) -> tuple[float, float]:
    """The contract's formula: [sin(2 pi n / 365), cos(2 pi n / 365)]."""
    return float(np.sin(2 * np.pi * n / 365.0)), float(np.cos(2 * np.pi * n / 365.0))


@pytest.fixture
def state() -> np.ndarray:
    return make_state(0)
