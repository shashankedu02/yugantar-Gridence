"""Preflight must not report success when the official scan finds a problem."""
import importlib.util

import pytest

from conftest import ROOT

spec = importlib.util.spec_from_file_location("preflight", ROOT / "tools" / "preflight.py")
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


@pytest.mark.parametrize("result", [
    {"points": 6.5, "flags": [{"level": "critical", "what": "no model checkpoint in the repo and no Hugging Face link"}],
     "health": {"checkpoint": False}},
    {"points": 13.0, "flags": [{"level": "warn", "what": "climate data file in repo", "file": "x"}], "health": {}},
    {"points": 14.0, "flags": [], "health": {"frontend_present": False}},
])
def test_any_flag_or_missing_point_fails(monkeypatch, result):
    scan_module = pytest.importorskip("monsoon_r1.repo_scan")
    monkeypatch.setattr(scan_module, "scan", lambda _root: result)
    problems, _summary = preflight.check_scan([])
    assert problems


def test_a_clean_full_scan_passes(monkeypatch):
    scan_module = pytest.importorskip("monsoon_r1.repo_scan")
    monkeypatch.setattr(scan_module, "scan", lambda _root: {"points": 15.0, "flags": [], "health": {}})
    assert preflight.check_scan([])[0] == []
