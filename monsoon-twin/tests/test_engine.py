"""Engine behaviour: shapes, units, perturbation handling, determinism, guards, and weight loading.

DAP-mode tests write throw-away weights into pytest's tmp_path to exercise the loader. They are never placed in
weights/ and make no claim about skill.
"""
import numpy as np
import pytest

from conftest import doy_pair, make_state
from twin import Engine, MissingWeightsError, doy
from twin.engine import MODEL_NAME_DAP, MODEL_NAME_PLACEHOLDER
from twin.guards import LOWER, UPPER


@pytest.fixture(scope="module")
def placeholder(tmp_path_factory):
    return Engine(tmp_path_factory.mktemp("empty_weights"))


def test_placeholder_is_honestly_named(placeholder):
    assert placeholder.mode == "persistence" and placeholder.model_name == MODEL_NAME_PLACEHOLDER


@pytest.mark.parametrize("steps", [1, 2, 10, 14, 30])
def test_output_shape_dtype_and_finite(placeholder, state, steps):
    out = placeholder.simulate(state, doy_pair(160), steps, None)
    assert out.shape == (steps, 6, 32, 36) and out.dtype == np.float32 and np.isfinite(out).all()


def test_ten_step_rollout_is_physically_valid(placeholder, state):
    out = placeholder.simulate(state, doy_pair(200), 10, None)
    assert out.shape == (10, 6, 32, 36)
    assert out[:, 1].min() >= 0.0                                   # rain non-negative
    assert out[:, 0].min() >= 233.15 and out[:, 0].max() <= 333.15  # t2m inside the judge's -40..+60 C gate
    assert (out >= LOWER[None, :, None, None]).all() and (out <= UPPER[None, :, None, None]).all()


def test_physical_units_are_preserved(placeholder, state):
    """The placeholder repeats the last day, so every channel keeps its input units and magnitude."""
    out = placeholder.simulate(state, doy_pair(160), 3, None)
    assert np.array_equal(out[0], state[-1]) and np.array_equal(out[2], state[-1])
    assert 250 < out[0, 0].mean() < 320 and 9e4 < out[0, 4].mean() < 1.1e5     # K and Pa, not normalised


def test_perturbation_is_added_to_the_last_day_only(placeholder, state):
    p = np.zeros((6, 32, 36), "f4"); p[0, 10:14, 10:14] = 3.0
    out = placeholder.simulate(state, doy_pair(160), 2, p)
    expected = state[-1].copy(); expected[0, 10:14, 10:14] += 3.0
    assert np.array_equal(out[0], expected)
    changed_a = placeholder.simulate(state, doy_pair(160), 2, None)
    state2 = state.copy(); state2[0] += 50.0                        # earlier days must not matter for persistence
    assert np.array_equal(placeholder.simulate(state2, doy_pair(160), 2, None), changed_a)


def test_zero_perturbation_is_bit_identical_to_none(placeholder, state):
    a = placeholder.simulate(state, doy_pair(160), 10, None)
    b = placeholder.simulate(state, doy_pair(160), 10, np.zeros((6, 32, 36), "f4"))
    assert a.tobytes() == b.tobytes()


def test_negative_zero_state_survives_a_null_shock_bit_for_bit(placeholder, state):
    st = state.copy(); st[-1, 2, 0, 0] = -0.0
    a = placeholder.simulate(st, doy_pair(160), 1, None)
    b = placeholder.simulate(st, doy_pair(160), 1, np.zeros((6, 32, 36), "f4"))
    assert a.tobytes() == b.tobytes()


def test_deterministic(placeholder, state):
    p = np.random.default_rng(0).normal(size=(6, 32, 36)).astype("f4")
    assert (placeholder.simulate(state, doy_pair(10), 10, p).tobytes()
            == placeholder.simulate(state, doy_pair(10), 10, p).tobytes())


def test_shock_that_makes_rain_negative_still_gives_valid_output(placeholder, state):
    p = np.zeros((6, 32, 36), "f4"); p[1] = -1e4; p[0] = 1e4
    out = placeholder.simulate(state, doy_pair(160), 10, p)
    assert out[:, 1].min() == 0.0 and np.isfinite(out).all() and out[:, 0].max() <= 333.15


def test_non_finite_input_is_rejected_not_served(placeholder, state):
    bad = state.copy(); bad[0, 0, 0, 0] = np.nan
    with pytest.raises(ValueError):
        placeholder.simulate(bad, doy_pair(1), 1, None)
    p = np.zeros((6, 32, 36), "f4"); p[0, 0, 0] = np.inf
    with pytest.raises(ValueError):
        placeholder.simulate(state, doy_pair(1), 1, p)


@pytest.mark.parametrize("steps", [0, 31, True, 2.5])
def test_bad_steps_rejected(placeholder, state, steps):
    with pytest.raises(ValueError):
        placeholder.simulate(state, doy_pair(1), steps, None)


def test_bad_shapes_rejected(placeholder, state):
    with pytest.raises(ValueError):
        placeholder.simulate(state[:2], doy_pair(1), 1, None)
    with pytest.raises(ValueError):
        placeholder.simulate(state, doy_pair(1), 1, np.zeros((6, 32, 35), "f4"))


def test_missing_weights_message_names_the_files(tmp_path):
    with pytest.raises(MissingWeightsError) as e:
        Engine(tmp_path, allow_placeholder=False)
    assert "climatology.npz" in str(e.value) and "dap.npz" in str(e.value) and "training.fit_dap" in str(e.value)


def test_partial_weights_are_an_error_even_with_placeholder_allowed(tmp_path):
    np.savez(tmp_path / "dap.npz", phi=np.zeros((6, 32, 36), "f4"))
    with pytest.raises(MissingWeightsError):
        Engine(tmp_path, allow_placeholder=True)


def _write_dap_weights(path, phi_value=0.5):
    clim = (np.zeros((doy.N_SLOTS, 6, 32, 36), "f4") + np.array([290, 3, 0, 0, 100000, 30], "f4")[None, :, None, None])
    np.savez(path / "climatology.npz", clim=clim)
    np.savez(path / "dap.npz", phi=np.full((6, 32, 36), phi_value, "f4"))


def test_dap_mode_loads_and_forecasts(tmp_path, state):
    _write_dap_weights(tmp_path)
    eng = Engine(tmp_path, allow_placeholder=False)
    assert eng.mode == "dap" and eng.model_name == MODEL_NAME_DAP and "unvalidated" in eng.model_name
    out = eng.simulate(state, doy_pair(160), 10, None)
    assert out.shape == (10, 6, 32, 36) and np.isfinite(out).all() and out[:, 1].min() >= 0.0
    clim_mean = np.array([290, 3, 0, 0, 100000, 30], "f4")[:, None, None]
    anomaly = np.clip(state[-1], LOWER[:, None, None], UPPER[:, None, None]) - clim_mean
    assert np.allclose(out[1], clim_mean + 0.25 * anomaly, rtol=1e-4, atol=1e-2)      # phi^2 * anomaly


def test_dap_mode_null_shock_bit_identical_and_shock_response_is_local(tmp_path, state):
    _write_dap_weights(tmp_path)
    eng = Engine(tmp_path)
    a = eng.simulate(state, doy_pair(160), 10, None)
    assert a.tobytes() == eng.simulate(state, doy_pair(160), 10, np.zeros((6, 32, 36), "f4")).tobytes()
    p = np.zeros((6, 32, 36), "f4"); p[0, 10:14, 10:14] = 3.0
    diff = eng.simulate(state, doy_pair(160), 10, p) - a
    assert np.abs(diff[:, 0, 10:14, 10:14]).max() > 0 and np.abs(diff[:, 0, :, 20:]).max() == 0.0
    assert np.abs(diff[:, 0]).max() <= 3.0 + 1e-4          # decays in place, never grows (property of this toy weight set)
