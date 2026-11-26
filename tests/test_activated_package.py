"""The shipped LocalNet package must stay one package: files from different runs must never be mixed.

The hashes are those recorded by the training run that produced the checkpoint (see weights/MANIFEST.md). Changing the
served model is a deliberate act: update these values together with the files and the manifest.
"""
from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import numpy as np
import pytest

from twin import inputs
from twin.engine import MODEL_NAME_DAP, Engine

WEIGHTS = Path(__file__).resolve().parent.parent / "weights"
SELECT = WEIGHTS / "model_select.json"
RECORDED = {
    "localnet.pt": "7014c08477c2e9a6db4554280f6af5d8c07e7dc568faf494cfbcc5580caeedc9",
    "climatology.npz": "e16bb7d65189c3d45007d0c033b7d16cd36fafc9db8cc23f248e2b63617415fd",
    "norm.json": "0af029f261de5985dafdbf358cf91d4bdaf63729cccafddae84c4b1b3f4a5aea",
    "dap.npz": "512a04649aec8295df3ba227da17621123402d93f8154c198783b00c01c81af8",
    "static.npz": "dd2f5647825affa7daa71dd9dd933235bba0f44b89176ed7f0edad277f7cc248",
}

pytestmark = pytest.mark.skipif(not SELECT.is_file(), reason="no model is selected: the shipped weights are DAP only")


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.mark.parametrize("name", sorted(RECORDED))
def test_file_is_the_recorded_one(name: str) -> None:
    assert _sha(WEIGHTS / name) == RECORDED[name]


def test_parts_refer_to_each_other() -> None:
    torch = pytest.importorskip("torch")
    blob = torch.load(WEIGHTS / "localnet.pt", map_location="cpu", weights_only=True)
    norm = json.loads((WEIGHTS / "norm.json").read_text(encoding="utf-8"))
    dap_record = json.loads((WEIGHTS / "provenance.json").read_text(encoding="utf-8"))
    assert json.loads(SELECT.read_text(encoding="utf-8"))["sha256"] == _sha(WEIGHTS / "localnet.pt")
    assert blob["meta"]["climatology_sha256"] == dap_record["climatology_sha256"] == _sha(WEIGHTS / "climatology.npz")
    assert dap_record["dap_sha256"] == _sha(WEIGHTS / "dap.npz")
    assert blob["meta"]["train_years"] == dap_record["train_years"] == norm["years"]
    for key in ("state_mean", "state_std", "tendency_std"):
        np.testing.assert_allclose(blob["state_dict"][key].reshape(-1).numpy(), np.asarray(norm[key], np.float32), rtol=1e-6)
    with np.load(WEIGHTS / "static.npz") as z:
        expected = inputs.static_features(z["static"].astype(np.float32), norm["orography_scale"])
    np.testing.assert_array_equal(blob["state_dict"]["static_feats"].numpy(), expected)


def test_localnet_is_served_cleanly() -> None:
    pytest.importorskip("torch")
    engine = Engine(WEIGHTS, allow_placeholder=False)
    assert engine.mode == "localnet" and engine.selection_error is None
    assert engine.fallback_steps == 0 and engine.fallback_requests == 0


def test_damaged_checkpoint_falls_back_to_the_same_package_dap(tmp_path: Path) -> None:
    shutil.copytree(WEIGHTS, tmp_path / "damaged")
    shutil.copytree(WEIGHTS, tmp_path / "dap_only")
    (tmp_path / "dap_only" / "model_select.json").unlink()
    damaged = bytearray((tmp_path / "damaged" / "localnet.pt").read_bytes())
    damaged[len(damaged) // 2] ^= 1
    (tmp_path / "damaged" / "localnet.pt").write_bytes(bytes(damaged))
    fallback, plain = Engine(tmp_path / "damaged"), Engine(tmp_path / "dap_only")
    assert fallback.mode == "dap" and fallback.model_name == MODEL_NAME_DAP and "sha256" in fallback.selection_error
    state = np.broadcast_to(np.array([295.0, 3.0, 1.0, 1.0, 100500.0, 30.0], np.float32)[None, :, None, None], (3, 6, 32, 36))
    out = fallback.simulate(state, (0.0, 1.0), 10, None)
    assert out.tobytes() == plain.simulate(state, (0.0, 1.0), 10, None).tobytes()
    assert fallback.served_by() == (MODEL_NAME_DAP, "")
