"""Run the official repo scanner on a clean copy of the tracked source (never on the working folder, which may
hold local data). Patterns come from the kit, so no forbidden words are spelled out in this file.

Expected state until trained weights exist: the ONLY flag is the missing model checkpoint. Never add dummy
weights to silence it.
"""
import shutil

import pytest

from conftest import ROOT

rs = pytest.importorskip("monsoon_r1.repo_scan", reason="install the official kit: pip install -e ..\\yug-monsoon-kit-main")

COPY = ["serve.py", "twin", "training", "tests", "weights", "eval", "dashboard", "requirements-serve.txt", "requirements-train.txt"]
IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc", ".pytest_cache", "*.nc", "*.npz", "*.pt")


@pytest.fixture(scope="module")
def clean_export(tmp_path_factory):
    dst = tmp_path_factory.mktemp("export")
    for name in COPY:
        src = ROOT / name
        if src.is_dir():
            shutil.copytree(src, dst / name, ignore=IGNORE)
        elif src.is_file():
            shutil.copy(src, dst / name)
    (dst / "README.md").write_text("scan fixture")
    return dst


def test_inference_files_are_only_the_server_and_the_twin_package(clean_export):
    res = rs.scan(clean_export)
    files = set(res["inference_files"])
    assert "serve.py" in files and all(f == "serve.py" or f.startswith("twin") for f in files), files


def test_only_expected_flag_is_the_missing_checkpoint(clean_export):
    res = rs.scan(clean_export)
    whats = [f["what"] for f in res["flags"]]
    assert len(whats) == 1 and "no model checkpoint" in whats[0], res["flags"]
    assert res["health"]["training_pipeline"] and res["health"]["server_separate_from_ui"]


def test_no_forbidden_pattern_in_inference_code(clean_export):
    for rel in rs.scan(clean_export)["inference_files"]:
        text = (clean_export / rel).read_text()
        assert not any(__import__("re").search(p, text, __import__("re").I) for p in rs.EXTERNAL_WEATHER), rel
        assert not rs.DATE_RE.search(text) and not rs.DATETIME_CALL.search(text), rel


def test_route_pattern_appears_in_serve_py_only(clean_export):
    hits = [str(p.relative_to(clean_export)) for p in clean_export.rglob("*.py") if rs.ROUTE_RE.search(p.read_text())]
    assert hits == ["serve.py"], hits
