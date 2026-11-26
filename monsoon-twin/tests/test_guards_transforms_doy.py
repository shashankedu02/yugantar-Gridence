"""Physical guards, model-space transforms and day-of-year decoding."""
import numpy as np
import pytest

from conftest import doy_pair, make_state
from twin import doy
from twin.guards import LOWER, UPPER, all_finite, clamp_state, replace_nonfinite
from twin.transforms import denormalise, normalise, tp_from_log1p, tp_to_log1p


def test_clamp_enforces_every_channel_limit_and_keeps_units():
    x = np.zeros((6, 4, 5), "f4")
    for c in range(6):
        x[c, 0, 0], x[c, 0, 1] = LOWER[c] - 1e6, UPPER[c] + 1e6
    y = clamp_state(x)
    assert np.allclose(y[:, 0, 0], LOWER) and np.allclose(y[:, 0, 1], UPPER)
    assert y.dtype == np.float32


def test_clamp_leaves_valid_values_untouched():
    st = make_state(0)
    assert np.array_equal(clamp_state(st), st)


def test_negative_rain_is_clamped_to_zero():
    x = make_state(0)[-1].copy(); x[1] = -5.0
    assert clamp_state(x)[1].min() == 0.0


def test_clamp_inside_the_judge_validity_gate():
    assert LOWER[0] >= 233.15 and UPPER[0] <= 333.15 and LOWER[1] >= 0.0


def test_clamp_rejects_wrong_channel_axis():
    with pytest.raises(ValueError):
        clamp_state(np.zeros((5, 4, 4), "f4"))


def test_finite_helpers():
    x = make_state(0)[-1].copy(); fallback = np.zeros_like(x)
    assert all_finite(x)
    x[0, 0, 0] = np.nan; x[1, 1, 1] = np.inf
    assert not all_finite(x)
    fixed = replace_nonfinite(x, fallback)
    assert all_finite(fixed) and fixed[0, 0, 0] == 0.0 and fixed[1, 1, 1] == 0.0


def test_log1p_roundtrip_and_nonnegative_rain():
    st = make_state(0)[-1]
    assert np.allclose(tp_from_log1p(tp_to_log1p(st)), st, rtol=1e-5, atol=1e-5)
    z = tp_to_log1p(st); z[1] = -3.0
    assert tp_from_log1p(z)[1].min() >= 0.0


def test_normalise_roundtrip_and_validation():
    st = make_state(0)
    mean = st.mean(axis=(0, 2, 3)); std = st.std(axis=(0, 2, 3))
    assert np.allclose(denormalise(normalise(st, mean, std), mean, std), st, rtol=1e-5, atol=1e-3)
    with pytest.raises(ValueError):
        normalise(st, mean, np.zeros(6))
    with pytest.raises(ValueError):
        normalise(st, mean[:5], std[:5])


@pytest.mark.parametrize("n", range(1, 366))
def test_doy_roundtrip_every_nominal_day(n):
    assert doy.from_sincos(*doy_pair(n)) == n


def test_doy_rejects_non_pairs():
    for bad in ((0.0, 0.0), (1.0, 1.0), (float("nan"), 0.0)):
        with pytest.raises(ValueError):
            doy.from_sincos(*bad)


def test_doy_advance_wraps():
    assert doy.advance(365, 1) == 1 and doy.advance(1, 364) == 365 and doy.advance(100, 10) == 110


def test_clim_slots_skip_the_leap_slot():
    assert doy.clim_slot(1) == 0 and doy.clim_slot(59) == 58      # 28 February
    assert doy.clim_slot(60) == 60 and doy.clim_slot(365) == 365   # 1 March ... 31 December
    with pytest.raises(ValueError):
        doy.clim_slot(0)
    slots = {doy.clim_slot(n) for n in range(1, 366)}
    assert len(slots) == 365 and 59 not in slots
