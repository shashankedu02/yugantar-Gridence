"""Input dimensions, input encodings, NaN/Inf rejection and field validation (twin/wire.py)."""
import base64

import numpy as np
import pytest

from conftest import doy_pair, make_state
from twin.wire import WireError, decode_array, encode_rollout, parse_simulate_request


def b64(a):
    a = np.ascontiguousarray(a, dtype="<f4")
    return {"b64": base64.b64encode(a.tobytes()).decode("ascii"), "shape": list(a.shape)}


def body(**over):
    st = make_state(1)
    b = {"init_states": st.tolist(), "doy_sincos": list(doy_pair(160)), "steps": 10, "perturbation": None}
    b.update(over)
    return b


def test_lists_and_b64_decode_to_the_same_array():
    st = make_state(2)
    assert np.array_equal(parse_simulate_request(body(init_states=st.tolist())).init_states,
                          parse_simulate_request(body(init_states=b64(st))).init_states)


def test_perturbation_in_both_formats_and_null():
    p = np.random.default_rng(3).normal(size=(6, 32, 36)).astype("f4")
    assert parse_simulate_request(body(perturbation=None)).perturbation is None
    assert np.array_equal(parse_simulate_request(body(perturbation=p.tolist())).perturbation, p)
    assert np.array_equal(parse_simulate_request(body(perturbation=b64(p))).perturbation, p)


def test_perturbation_key_may_be_absent():
    b = body(); del b["perturbation"]
    assert parse_simulate_request(b).perturbation is None


@pytest.mark.parametrize("bad_shape", [(2, 6, 32, 36), (3, 5, 32, 36), (3, 6, 31, 36), (3, 6, 32, 35), (6, 32, 36)])
def test_wrong_init_state_shape_rejected(bad_shape):
    with pytest.raises(WireError):
        parse_simulate_request(body(init_states=np.zeros(bad_shape, "f4").tolist()))


def test_wrong_perturbation_shape_rejected():
    with pytest.raises(WireError):
        parse_simulate_request(body(perturbation=np.zeros((3, 6, 32, 36), "f4").tolist()))


def test_b64_shape_and_length_mismatch_rejected():
    st = make_state(0)
    bad = b64(st); bad["shape"] = [3, 6, 32, 35]
    with pytest.raises(WireError):
        parse_simulate_request(body(init_states=bad))
    short = b64(st); short["b64"] = base64.b64encode(b"\x00" * 16).decode()
    with pytest.raises(WireError):
        parse_simulate_request(body(init_states=short))
    with pytest.raises(WireError):
        parse_simulate_request(body(init_states={"b64": "!!!not base64!!!", "shape": [3, 6, 32, 36]}))


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_non_finite_input_rejected_in_both_formats(bad):
    st = make_state(0); st[1, 2, 3, 4] = bad
    with pytest.raises(WireError):
        parse_simulate_request(body(init_states=st.tolist()))
    with pytest.raises(WireError):
        parse_simulate_request(body(init_states=b64(st)))
    p = np.zeros((6, 32, 36), "f4"); p[0, 0, 0] = bad
    with pytest.raises(WireError):
        parse_simulate_request(body(perturbation=p.tolist()))


def test_float32_overflow_counts_as_non_finite():
    st = make_state(0).astype("f8"); st[0, 0, 0, 0] = 1e300
    with pytest.raises(WireError):
        parse_simulate_request(body(init_states=st.tolist()))


def test_ragged_and_non_numeric_rejected():
    with pytest.raises(WireError):
        decode_array([[1, 2], [3]], (2, 2), "x")
    with pytest.raises(WireError):
        decode_array([["a", "b"], ["c", "d"]], (2, 2), "x")
    with pytest.raises(WireError):
        decode_array("text", (2, 2), "x")


@pytest.mark.parametrize("steps", [0, -1, 31, 2.5, True, "10", None])
def test_bad_steps_rejected(steps):
    with pytest.raises(WireError):
        parse_simulate_request(body(steps=steps))


@pytest.mark.parametrize("steps", [1, 10, 14, 30, 10.0])
def test_good_steps_accepted(steps):
    assert parse_simulate_request(body(steps=steps)).steps == int(steps)


@pytest.mark.parametrize("d", [[0.0], [0.0, 1.0, 2.0], "ab", [float("nan"), 0.0], [True, 0.0], None])
def test_bad_doy_rejected(d):
    with pytest.raises(WireError):
        parse_simulate_request(body(doy_sincos=d))


@pytest.mark.parametrize("missing", ["init_states", "doy_sincos", "steps"])
def test_missing_required_field(missing):
    b = body(); del b[missing]
    with pytest.raises(WireError):
        parse_simulate_request(b)


def test_non_object_body_rejected():
    for b in ([], "x", 3, None):
        with pytest.raises(WireError):
            parse_simulate_request(b)


def test_encode_rollout_is_plain_lists_with_the_right_shape():
    out = encode_rollout(np.zeros((10, 6, 32, 36), "f4"))
    assert isinstance(out, list) and np.asarray(out).shape == (10, 6, 32, 36)


from twin.wire import parse_climatology_request


def test_climatology_request_parsing():
    assert parse_climatology_request({"doy_sincos": [0.0, 1.0], "steps": 10}) == ((0.0, 1.0), 10)
    for bad in ({}, {"doy_sincos": [0.0, 1.0]}, {"steps": 3}, {"doy_sincos": [0.0], "steps": 3},
                {"doy_sincos": [0.0, 1.0], "steps": 0}, {"doy_sincos": [0.0, 1.0], "steps": 31},
                {"doy_sincos": [0.0, 1.0], "steps": True}, {"doy_sincos": [float("nan"), 1.0], "steps": 2}, []):
        with pytest.raises(WireError):
            parse_climatology_request(bad)
