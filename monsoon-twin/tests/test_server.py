"""End-to-end HTTP tests: start `python serve.py` as a subprocess (the way the judge does) and call it.

Needs fastapi and uvicorn (requirements-serve.txt); skipped otherwise. The official kit validator is exercised
separately (see DEVELOPMENT.md), and by test_kit_validator when the kit package is importable.
"""
import base64
import socket
import subprocess
import sys
import time

import numpy as np
import pytest
import requests

pytest.importorskip("fastapi")
pytest.importorskip("uvicorn")

from conftest import ROOT, SIM_PATH, doy_pair, make_state


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def url():
    port = _free_port()
    proc = subprocess.Popen([sys.executable, str(ROOT / "serve.py"), "--port", str(port)], cwd=ROOT,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{port}"
    deadline = time.time() + 60
    try:
        while time.time() < deadline:
            if proc.poll() is not None:
                pytest.fail("serve.py exited early:\n" + proc.stdout.read().decode(errors="replace"))
            try:
                if requests.post(base + "/health", timeout=2).status_code == 200:
                    break
            except requests.ConnectionError:
                time.sleep(0.3)
        else:
            pytest.fail("server never became ready")
        yield base
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


def payload(st=None, pert=None, steps=10, enc=lambda a: a.tolist()):
    st = make_state(0) if st is None else st
    return {"init_states": enc(st), "doy_sincos": list(doy_pair(160)), "steps": steps,
            "perturbation": None if pert is None else enc(pert)}


def b64(a):
    a = np.ascontiguousarray(a, dtype="<f4")
    return {"b64": base64.b64encode(a.tobytes()).decode("ascii"), "shape": list(a.shape)}


def post(url, body):
    return requests.post(url + SIM_PATH, json=body, timeout=10)


def test_health_is_post_and_get_is_refused(url):
    r = requests.post(url + "/health", timeout=5)
    js = r.json()
    assert r.status_code == 200 and js["status"] == "ready" and isinstance(js["model_name"], str)
    assert requests.get(url + "/health", timeout=5).status_code == 405       # the kit client uses POST only


def test_simulate_ten_steps_with_lists(url):
    r = post(url, payload())
    assert r.status_code == 200
    js = r.json()
    out = np.asarray(js["rollout"], dtype="f4")
    assert out.shape == (10, 6, 32, 36) and np.isfinite(out).all() and out[:, 1].min() >= 0
    assert isinstance(js["inference_ms"], float) and js["inference_ms"] >= 0


def test_simulate_accepts_base64_and_matches_lists(url):
    st = make_state(5)
    a = np.asarray(post(url, payload(st)).json()["rollout"], "f4")
    b = np.asarray(post(url, payload(st, enc=b64)).json()["rollout"], "f4")
    assert np.array_equal(a, b)


def test_zero_perturbation_equals_null_over_http(url):
    st = make_state(6)
    a = post(url, payload(st)).json()["rollout"]
    b = post(url, payload(st, pert=np.zeros((6, 32, 36), "f4"))).json()["rollout"]
    assert a == b


def test_perturbation_changes_the_response(url):
    st = make_state(7)
    p = np.zeros((6, 32, 36), "f4"); p[0, 8:20, 18:30] = 3.0
    a = np.asarray(post(url, payload(st)).json()["rollout"], "f4")
    b = np.asarray(post(url, payload(st, pert=p)).json()["rollout"], "f4")
    assert np.abs(b - a).max() > 0


@pytest.mark.parametrize("mutate", [
    lambda b: b.update(steps=0),
    lambda b: b.update(init_states=b["init_states"][:2]),
    lambda b: b.update(perturbation=[[0.0]]),
    lambda b: b.update(doy_sincos=[0.0]),
    lambda b: b.pop("steps"),
])
def test_malformed_requests_get_422_with_a_message(url, mutate):
    body = payload()
    mutate(body)
    r = post(url, body)
    assert r.status_code == 422 and "error" in r.json()


def test_non_json_body_gets_400(url):
    r = requests.post(url + SIM_PATH, data=b"not json", headers={"Content-Type": "application/json"}, timeout=5)
    assert r.status_code == 400


def test_nan_literal_in_json_is_rejected(url):
    text = '{"init_states": %s, "doy_sincos": [0.0, 1.0], "steps": 1}' % str(np.full((3, 6, 32, 36), np.nan).tolist()).replace("nan", "NaN")
    r = requests.post(url + SIM_PATH, data=text, headers={"Content-Type": "application/json"}, timeout=10)
    assert r.status_code == 422


def test_ten_step_call_is_far_inside_the_five_second_limit(url):
    t0 = time.perf_counter()
    post(url, payload())
    assert time.perf_counter() - t0 < 5.0      # the placeholder is trivially fast; this guards against accidental regressions only


def test_kit_validator_passes(url):
    sv = pytest.importorskip("monsoon_r1.schema_validator", reason="install the official kit: pip install -e ..\\yug-monsoon-kit-main")
    assert sv.main([url]) == 0
