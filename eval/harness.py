"""Offline scoring harness (L2 in docs/TESTING_AND_VALIDATION.md): kit scoring functions, in-process engine.

    python -m eval.harness --nc data/india_climate_train.nc --weights weights --name dap-v0

Runs the frozen windows in eval/windows_val.json through twin.Engine, scores them with monsoon_r1.scoring and writes
eval/reports/<name>.json and .md. Needs the kit installed (pip install third_party/*.whl); the kit is used here only,
never in inference. Numbers exist only after this script has run; nothing here is a result.

ASSUMPTIONS (the judge's exact aggregation is not published):
  * a window's RMSE skill = mean over channels of scoring.skill_vs_best_ref on leads 1, 4, 8 (rmse_lat averages them);
  * the heavy-rain CSI of a window pools leads 1, 4, 8;
  * climatology reference = the kit's recipe on the training years (2005-2017).
So the 'local estimate' is an estimate, not the judge's score.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
from pathlib import Path

import numpy as np

from monsoon_r1 import scoring, stats

from twin.engine import Engine

from .data_io import CHANNELS, doy_sincos, load_archive, split_mask, yyyymmdd

HERE = Path(__file__).resolve().parent
LEADS = (1, 4, 8)


def sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def kit_climatology(data: np.ndarray, times: np.ndarray) -> np.ndarray:
    m = split_mask(times, "train")
    return stats.climatology(data[m], yyyymmdd(times)[m])


def clim_at(clim: np.ndarray, day: np.datetime64) -> np.ndarray:
    d = int(yyyymmdd(np.array([day], dtype="datetime64[D]"))[0])
    import datetime as dt
    return stats.clim_for(clim, dt.date(d // 10000, d // 100 % 100, d % 100))


def score_windows(engine, data: np.ndarray, times: np.ndarray, clim: np.ndarray, windows: list[dict]) -> dict:
    index = {str(t): i for i, t in enumerate(times)}
    per_win, ratios, invalid, null_bad, nondet = [], [], [], [], []
    lead_ss = {L: [] for L in LEADS}            # per lead: [windows, 6] skill vs best ref
    lead_sp = {L: [] for L in LEADS}            # per lead: [windows, 6] skill vs persistence
    zeros = np.zeros((6, 32, 36), np.float32)
    for w in windows:
        s = index[w["first_input_day"]]
        steps = int(w["steps"])
        init = data[s:s + 3]
        last = s + 2
        sc = doy_sincos(times[last])
        out = engine.simulate(init, sc, steps, None)
        bad = scoring.validity(out, steps)
        if bad:
            invalid.append({"window": w["first_input_day"], "violations": bad})
        if not np.array_equal(out, engine.simulate(init, sc, steps, zeros)):
            null_bad.append(w["first_input_day"])
        if not np.array_equal(out, engine.simulate(init, sc, steps, None)):
            nondet.append(w["first_input_day"])
        pred = np.stack([out[L - 1] for L in LEADS])
        true = np.stack([data[last + L] for L in LEADS])
        pers = np.stack([init[-1]] * len(LEADS))
        cl = np.stack([clim_at(clim, times[last + L]) for L in LEADS])
        r = scoring.skill_vs_best_ref(pred, true, pers, cl)
        for j, L in enumerate(LEADS):
            rl = scoring.skill_vs_best_ref(pred[j:j + 1], true[j:j + 1], pers[j:j + 1], cl[j:j + 1])
            lead_ss[L].append(rl["ss"]); lead_sp[L].append(rl["ss_persist"])
        c_m, c_p, c_c = (scoring.csi(pred[:, 1], true[:, 1]), scoring.csi(pers[:, 1], true[:, 1]), scoring.csi(cl[:, 1], true[:, 1]))
        ratios.append(scoring.variance_ratio(out[7], data[last + 8]))
        per_win.append({"first_input_day": w["first_input_day"], "kind": w["kind"],
                        "ss": float(np.nanmean(r["ss"])), "csi": c_m, "csi_persist": c_p, "csi_clim": c_c,
                        "csi_skill": scoring.csi_skill(c_m, c_p, c_c)})
    ratios = np.array(ratios)
    fp = scoring.forecast_points([p["ss"] for p in per_win], [p["csi_skill"] for p in per_win])
    blur = scoring.anti_blur_points(ratios)
    ss4_persist = float(np.nanmean(np.array(lead_sp[4])))
    return {
        "n_windows": len(per_win), "windows": per_win,
        "skill_vs_best_ref_by_lead_channel": {str(L): dict(zip(CHANNELS, np.nanmean(np.array(lead_ss[L]), axis=0).round(4).tolist())) for L in LEADS},
        "skill_vs_persistence_by_lead_channel": {str(L): dict(zip(CHANNELS, np.nanmean(np.array(lead_sp[L]), axis=0).round(4).tolist())) for L in LEADS},
        "mean_day4_skill_vs_persistence": ss4_persist,
        "day8_variance_ratio_by_channel": dict(zip(CHANNELS, np.nanmean(ratios, axis=0).round(4).tolist())),
        "local_estimate_points": {"forecast": fp, "anti_blur_of_10": blur,
                                  "note": "causality (15) comes from eval.shock_battery; repo scan (15) and brief (15) are separate."},
        "gates": {"validity_100pct": not invalid, "day4_skill_vs_persistence_gt_0": bool(ss4_persist > 0),
                  "null_bit_identical": not null_bad, "deterministic": not nondet},
        "failures": {"invalid": invalid, "null_not_identical": null_bad, "not_deterministic": nondet},
    }


def to_markdown(rep: dict) -> str:
    g = rep["gates"]
    lines = [f"# Harness report: {rep['name']}", "",
             f"model: `{rep['model_name']}` | split: {rep['split']} | windows: {rep['result']['n_windows']} | file hash of windows: `{rep['windows_sha256'][:12]}`", "",
             "## Gates (G-DAP items; shock battery is in its own report)"]
    lines += [f"- {k}: **{'PASS' if v else 'FAIL'}**" for k, v in g.items()]
    r = rep["result"]
    lines += ["", f"mean day-4 skill vs persistence: {r['mean_day4_skill_vs_persistence']:.4f}", "",
              "## Skill vs best reference (mean over windows)", "| lead | " + " | ".join(CHANNELS) + " |", "|---|" + "---|" * 6]
    for L, row in r["skill_vs_best_ref_by_lead_channel"].items():
        lines.append(f"| day {L} | " + " | ".join(f"{row[c]:.3f}" for c in CHANNELS) + " |")
    lines += ["", "## Skill vs persistence (mean over windows)", "| lead | " + " | ".join(CHANNELS) + " |", "|---|" + "---|" * 6]
    for L, row in r["skill_vs_persistence_by_lead_channel"].items():
        lines.append(f"| day {L} | " + " | ".join(f"{row[c]:.3f}" for c in CHANNELS) + " |")
    lines += ["", "Day-8 spatial variance ratio (pred/true): " + ", ".join(f"{c} {v:.2f}" for c, v in r["day8_variance_ratio_by_channel"].items()), "",
              f"Local estimate (assumptions in the harness docstring; NOT the judge's score): forecast {r['local_estimate_points']['forecast']['points']:.2f}/45, "
              f"anti-blur {r['local_estimate_points']['anti_blur_of_10']:.2f}/10.", "",
              f"Environment: numpy {rep['numpy']}, python {rep['python']}. Re-run from a fresh clone (W2) and compare these numbers before they are quoted."]
    return "\n".join(lines) + "\n"


def run(nc: Path, weights: Path, windows_path: Path, name: str, out_dir: Path, engine=None) -> dict:
    data, times = load_archive(nc)
    clim = kit_climatology(data, times)
    spec = json.loads(Path(windows_path).read_text())
    engine = engine or Engine(Path(weights))
    result = score_windows(engine, data, times, clim, spec["windows"])
    meta = engine.meta()["model"]
    rep = {"name": name, "split": spec["split"], "model_name": meta.get("name"), "model_mode": meta.get("mode"),
           "windows_sha256": sha256(windows_path), "nc_sha256": sha256(nc),
           "weights_sha256": {p.name: sha256(p) for p in sorted(Path(weights).glob("*")) if p.suffix in {".npz", ".pt", ".json"}},
           "numpy": np.__version__, "python": platform.python_version(), "result": result, "gates": result["gates"]}
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{name}.json").write_text(json.dumps(rep, indent=1, default=float) + "\n")
    (out_dir / f"{name}.md").write_text(to_markdown(rep))
    return rep


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--nc", type=Path, required=True)
    ap.add_argument("--weights", type=Path, default=HERE.parent / "weights")
    ap.add_argument("--windows", type=Path, default=HERE / "windows_val.json")
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", type=Path, default=HERE / "reports")
    a = ap.parse_args(argv)
    if not a.windows.is_file():
        print(f"{a.windows} missing: run `python -m eval.windows --nc ...` first (and commit it before scoring any model).")
        return 1
    rep = run(a.nc, a.weights, a.windows, a.name, a.out)
    print((a.out / f"{a.name}.md").read_text())
    return 0 if all(rep["gates"].values()) else 2


if __name__ == "__main__":
    raise SystemExit(main())
