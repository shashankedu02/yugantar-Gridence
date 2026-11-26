"""The dashboard's shock presets must equal the organisers' definitions, and demo cases must be valid inputs.

The presets are built by running the dashboard's own JavaScript in Node and compared with the kit's `make_shock`.
"""
import json
import shutil
import subprocess

import numpy as np
import pytest

from conftest import ROOT, SIM_PATH  # noqa: F401  (conftest puts the repo root on sys.path)

CASES = ROOT / "dashboard" / "cases"
NAMES = json.loads((CASES / "index.json").read_text(encoding="utf-8"))["cases"]
SCRIPT = """
import { readFileSync } from "node:fs";
import { buildPresetPerturbation } from "./dashboard/js/scenario.js";
const c = JSON.parse(readFileSync(process.argv[1], "utf-8"));
process.stdout.write(JSON.stringify(["warm_ocean", "monsoon_stall"].map((p) => buildPresetPerturbation(p, c.init_states))));
"""


@pytest.mark.parametrize("name", NAMES)
def test_presets_equal_the_kit_definitions(name):
    scoring = pytest.importorskip("monsoon_r1.scoring")
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed")
    run = subprocess.run([node, "--input-type=module", "-e", SCRIPT, str(CASES / name)], cwd=ROOT,
                         capture_output=True, text=True, check=True)
    got = np.array(json.loads(run.stdout), np.float64)
    last = np.array(json.loads((CASES / name).read_text(encoding="utf-8"))["init_states"], np.float32)[-1]
    for i, shock in enumerate(("warm_ocean", "monsoon_stall")):
        want = scoring.make_shock(shock, last, np.ones(6, np.float32))
        assert np.array_equal(got[i] != 0, want != 0), f"{shock}: different cells"
        np.testing.assert_allclose(got[i], want, rtol=1e-6, atol=1e-6)


@pytest.mark.parametrize("name", NAMES)
def test_demo_case_is_a_three_day_input_that_the_engine_accepts(name):
    case = json.loads((CASES / name).read_text(encoding="utf-8"))
    state = np.array(case["init_states"], np.float32)
    assert state.shape == (3, 6, 32, 36) and np.isfinite(state).all() and state[:, 1].min() >= 0
    s, c = case["doy_sincos"]
    assert abs(s * s + c * c - 1.0) < 1e-6
    assert not {"targets", "rollout", "forecast", "truth"} & set(case)          # inputs only
    from twin.engine import Engine

    out = Engine(ROOT / "weights").simulate(state, (s, c), 10, None)
    assert out.shape == (10, 6, 32, 36) and np.isfinite(out).all()


def test_the_server_never_reads_demo_cases():
    for path in [ROOT / "serve.py", *(ROOT / "twin").glob("*.py")]:
        assert "cases" not in path.read_text(encoding="utf-8").lower(), path.name
