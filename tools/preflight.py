"""Pre-PR check. Run from anywhere inside the repo:  python tools/preflight.py   (add --fast to skip the tests)

Checks, on the files git tracks (including staged changes):
  1. nothing that must never be committed: .env files, climate data, .pyc, caches, virtual environments
  2. no oversized files (over 5 MB outside weights/, over 60 MB anywhere)
  3. no key-like strings in text files (values are masked in the report)
  4. serve.py sits at the repo root
  5. the official repo scan on a clean copy of the tracked files (needs the kit: pip install third_party\\*.whl):
     it must give the full 15 points with no flag at all
  6. the test suite
Exit code 0 only when everything passes.
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BAD_SUFFIXES = (".nc", ".nc4", ".grib", ".grib2", ".pyc", ".pyo")
BAD_PARTS = {"__pycache__", ".venv", "venv", "env", "node_modules", ".pytest_cache"}
SECRET_PATTERNS = [re.compile(p) for p in (
    r"cr_[A-Za-z0-9]{24,}", r"sk-[A-Za-z0-9_-]{20,}", r"AKIA[0-9A-Z]{16}", r"gh[pousr]_[A-Za-z0-9]{30,}",
    r"(?i)(api[_-]?key|secret|token|password)\s*[=:]\s*[\"'][^\"']{12,}[\"']")]
SCAN_FULL_MARKS = 15.0


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout


def tracked_files() -> list[Path]:
    names = [n for n in git("ls-files", "-z").split("\0") if n]
    return [ROOT / n for n in names if (ROOT / n).is_file()]


def check_forbidden(files: list[Path]) -> list[str]:
    problems = []
    for p in files:
        rel = p.relative_to(ROOT)
        name = rel.name
        if name.startswith(".env") and name != ".env.example":
            problems.append(f"{rel}: environment file must never be committed")
        elif name.endswith(BAD_SUFFIXES) or set(rel.parts[:-1]) & BAD_PARTS:
            problems.append(f"{rel}: data, cache or environment file must not be tracked")
    return problems


def check_sizes(files: list[Path]) -> list[str]:
    problems = []
    for p in files:
        rel, mb = p.relative_to(ROOT), p.stat().st_size / 1e6
        if mb > 60 or (mb > 5 and rel.parts[0] != "weights"):
            problems.append(f"{rel}: {mb:.1f} MB is too large to commit")
    return problems


def check_secrets(files: list[Path]) -> list[str]:
    problems = []
    for p in files:
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for n, line in enumerate(text.splitlines(), 1):
            for pat in SECRET_PATTERNS:
                if pat.search(line):
                    problems.append(f"{p.relative_to(ROOT)}:{n}: looks like a secret (masked); rotate it if real, then remove it")
                    break
    return problems


def check_scan(files: list[Path]) -> tuple[list[str], str]:
    try:
        from monsoon_r1.repo_scan import scan
    except ImportError:
        return ["official kit not installed: pip install third_party\\monsoon_r1_kit-1.0.0-py3-none-any.whl"], ""
    with tempfile.TemporaryDirectory() as tmp:
        for p in files:
            dst = Path(tmp) / p.relative_to(ROOT)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(p, dst)
        res = scan(Path(tmp))
    bad = [f"scan flag [{f['level']}] {f['what']} {f.get('file', '')}".strip() for f in res["flags"]]
    if res["points"] < SCAN_FULL_MARKS:
        missing = [name for name, ok in res["health"].items() if not ok]
        bad.append(f"repo scan gives {res['points']}/15, not {SCAN_FULL_MARKS:g}; failed health checks: {missing or 'none'}")
    return bad, f"repo scan {res['points']}/15, flags: {[f['what'] for f in res['flags']] or 'none'}"


def main() -> int:
    fast = "--fast" in sys.argv
    try:
        files = tracked_files()
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("FAIL: this folder is not a git repository (or git is not installed)")
        return 1
    failures: list[str] = []
    for title, found in (("tracked files", check_forbidden(files)), ("file sizes", check_sizes(files)), ("secrets", check_secrets(files))):
        print(("ok   " if not found else "FAIL ") + title)
        failures += found
    root_ok = (ROOT / "serve.py").is_file()
    print(("ok   " if root_ok else "FAIL ") + "serve.py at the repo root")
    if not root_ok:
        failures.append("serve.py is not at the repo root")
    scan_problems, summary = check_scan(files)
    print(("ok   " if not scan_problems else "FAIL ") + (summary or "repo scan"))
    failures += scan_problems
    if not fast:
        r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider"], cwd=ROOT)
        print(("ok   " if r.returncode == 0 else "FAIL ") + "tests")
        if r.returncode != 0:
            failures.append("tests failed")
    for f in failures:
        print("  -", f)
    print("PREFLIGHT PASSED" if not failures else f"PREFLIGHT FAILED ({len(failures)} problem(s))")
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
