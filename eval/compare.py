"""Compare a LocalNet candidate with the 2005-2015 DAP baseline and persistence on the FROZEN validation windows.

    python -m eval.compare --nc data/india_climate_train.nc --candidate runs/localnet_c64/run1/candidate \\
        --baseline runs/tune/dap_baseline --out eval/reports/phase2

Scoring is done by the unchanged `eval.harness.score_windows` and `eval.shock_battery.run_battery` (kit functions).
A LocalNet run is REJECTED (exit code 4, no scores reported) on any model-selection error, any wrong model mode, or any
fallback to DAP, whole request or single step; this is checked after every single forecast call.
Every evaluation that touches the frozen windows is appended to a log. The 2020-2021 days are dropped right after the
archive is read. ASSUMPTION: the causality total averages the kit's `causality_points` over the 12 window-shock cases.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import platform
import time
from pathlib import Path

import numpy as np

from monsoon_r1 import scoring

from twin.engine import Engine
from twin.guards import clamp_state

from .data_io import CHANNELS, doy_sincos, load_archive
from .harness import clim_at, kit_climatology, score_windows, sha256
from .shock_battery import SHOCKS, run_battery

HERE = Path(__file__).resolve().parent
LEADS = (1, 4, 8)
TRAIN_YEARS = [2005, 2015]
LAST_YEAR_ALLOWED = 2019


class RejectedRun(RuntimeError):
    """The run cannot be attributed to the model it claims to evaluate."""


class StrictEngine:
    """Passes calls to an Engine in LocalNet mode and rejects the whole evaluation at the first sign of DAP."""

    def __init__(self, engine) -> None:
        self.engine = engine
        self.calls = 0
        self.check("at start-up")

    def check(self, when: str) -> None:
        e = self.engine
        if e.selection_error is not None:
            raise RejectedRun(f"{when}: model selection error: {e.selection_error}")
        if e.mode != "localnet":
            raise RejectedRun(f"{when}: model mode is {e.mode!r}, not 'localnet'")
        if e.fallback_requests or e.fallback_steps:
            raise RejectedRun(f"{when}: LocalNet fell back to DAP (whole requests {e.fallback_requests}, steps "
                              f"{e.fallback_steps}): {e.last_fallback_reason or 'non-finite step'}")

    def simulate(self, *args) -> np.ndarray:
        out = self.engine.simulate(*args)
        self.calls += 1
        self.check(f"forecast call {self.calls}")
        info = self.engine.last_request
        if info is None or info["model"] != "localnet" or info["repaired_steps"]:
            raise RejectedRun(f"forecast call {self.calls}: not a clean LocalNet answer: {info}")
        return out

    def meta(self) -> dict:
        return self.engine.meta()

    def channel_std(self):
        return self.engine.channel_std()


class Persistence:
    """The last input day (with any shock, inside the physical limits) repeated."""

    def simulate(self, init_states, doy_pair, steps, perturbation) -> np.ndarray:
        last = np.array(init_states[-1], dtype=np.float32)
        if perturbation is not None and np.any(perturbation != 0):
            last = last + perturbation
        return np.repeat(clamp_state(last)[None], steps, axis=0)


def provenance_checks(candidate: Path, baseline: Path) -> dict:
    """Training years and file hashes of both models must be consistent before anything is scored."""
    import torch

    select = json.loads((candidate / "model_select.json").read_text(encoding="utf-8-sig"))
    ckpt = candidate / select["localnet_file"]
    blob = torch.load(ckpt, map_location="cpu", weights_only=True)
    meta = blob["meta"]
    base = json.loads((baseline / "provenance.json").read_text(encoding="utf-8"))
    norm = json.loads((candidate / "norm.json").read_text(encoding="utf-8"))
    clim_sha = sha256(candidate / "climatology.npz")
    problems = []
    if meta.get("train_years") != TRAIN_YEARS:
        problems.append(f"LocalNet train_years {meta.get('train_years')} != {TRAIN_YEARS}")
    if base.get("train_years") != TRAIN_YEARS:
        problems.append(f"DAP baseline train_years {base.get('train_years')} != {TRAIN_YEARS}")
    if norm.get("years") != TRAIN_YEARS:
        problems.append(f"norm.json years {norm.get('years')} != {TRAIN_YEARS}")
    for key in ("state_mean", "state_std", "tendency_std"):
        stored = blob["state_dict"][key].reshape(-1).numpy()
        if not np.allclose(stored, np.asarray(norm[key], np.float32), rtol=1e-6, atol=0):
            problems.append(f"checkpoint buffer {key} differs from norm.json")
    if not (clim_sha == meta.get("climatology_sha256") == base.get("climatology_sha256") == sha256(baseline / "climatology.npz")):
        problems.append("climatology hashes of checkpoint, candidate and baseline do not all agree")
    if sha256(baseline / "dap.npz") != base.get("dap_sha256"):
        problems.append("baseline dap.npz does not match its provenance record")
    if sha256(ckpt) != select["sha256"]:
        problems.append("checkpoint hash differs from model_select.json")
    if (baseline / "model_select.json").exists() or (baseline / "localnet.pt").exists():
        problems.append("the baseline folder must hold DAP only")
    if problems:
        raise RejectedRun("provenance: " + "; ".join(problems))
    return {"checkpoint_sha256": sha256(ckpt), "climatology_sha256": clim_sha, "norm_json_sha256": sha256(candidate / "norm.json"),
            "baseline_dap_sha256": base["dap_sha256"], "normalisation": norm, "train_years": TRAIN_YEARS,
            "checkpoint_meta": {k: v for k, v in meta.items()}, "channels": blob["channels"], "blocks": blob["blocks"]}


def per_lead_csi(engine, data, times, clim, windows) -> dict:
    """Mean CSI at 10 mm/day for each lead separately, and CSI skill against the better reference."""
    index = {str(t): i for i, t in enumerate(times)}
    values = {L: [] for L in LEADS}
    for w in windows:
        s = index[w["first_input_day"]]
        last = s + 2
        out = engine.simulate(data[s:s + 3], doy_sincos(times[last]), int(w["steps"]), None)
        for L in LEADS:
            truth = data[last + L, 1]
            m = scoring.csi(out[L - 1, 1], truth)
            ref_p = scoring.csi(data[last, 1], truth)
            ref_c = scoring.csi(clim_at(clim, times[last + L])[1], truth)
            values[L].append((m, scoring.csi_skill(m, ref_p, ref_c)))

    def mean(v):
        v = np.array(v, float)
        return float(v[np.isfinite(v)].mean()) if np.isfinite(v).any() else float("nan")

    return {str(L): {"csi": mean([a for a, _ in v]), "csi_skill": mean([b for _, b in v])} for L, v in values.items()}


def latency(engine, data, times, first_day: str, calls: int = 8) -> dict:
    index = {str(t): i for i, t in enumerate(times)}
    s = index[first_day]
    sc = doy_sincos(times[s + 2])
    took = []
    for _ in range(calls):
        t0 = time.perf_counter()
        engine.simulate(data[s:s + 3], sc, 10, None)
        took.append((time.perf_counter() - t0) * 1000.0)
    return {"calls": calls, "steps": 10, "median_ms": float(np.median(took)), "max_ms": float(np.max(took))}


def shock_summary(report: dict) -> dict:
    cases = [w[n] for w in report["windows"] for n in SHOCKS]
    out = {"n_cases": len(cases), "null_identical_all_windows": report["null_ok_all"],
           "windows_both_nonzero_and_localized": report["windows_both_nonzero_and_localized"], "n_windows": report["n_windows"],
           "causality_points_of_15": scoring.causality_points(cases, report["null_ok_all"])}
    for check in ("nonzero", "localized", "propagates", "no_teleport", "stable"):
        out[check] = {n: int(sum(bool(w[n].get(check)) for w in report["windows"])) for n in SHOCKS}
    for key in ("near_frac_day1", "far_frac_max"):
        out[key + "_range"] = [float(min(c[key] for c in cases)), float(max(c[key] for c in cases))]
    return out


def evaluate(name: str, engine, data, times, clim, spec: dict, std: np.ndarray) -> dict:
    result = score_windows(engine, data, times, clim, spec["windows"])
    battery = run_battery(engine, data, times, spec["battery_first_input_days"], int(spec["steps"]), std)
    shocks = shock_summary(battery)
    blur = result["local_estimate_points"]["anti_blur_of_10"]
    forecast = result["local_estimate_points"]["forecast"]
    return {"name": name, "harness": result, "csi_by_lead": per_lead_csi(engine, data, times, clim, spec["windows"]),
            "shock_battery": battery, "shocks": shocks,
            "local_estimate": {"forecast_of_45": forecast["points"], "rmse_of_30": forecast["rmse_pts"], "csi_of_15": forecast["csi_pts"],
                               "anti_blur_of_10": blur, "causality_of_15": shocks["causality_points_of_15"],
                               "total_of_70": forecast["points"] + blur + shocks["causality_points_of_15"]}}


def paired(a: dict, b: dict) -> dict:
    """Per-window RMSE-skill difference a - b, with a bootstrap interval over windows (windows are not independent)."""
    d = np.array([x["ss"] - y["ss"] for x, y in zip(a["harness"]["windows"], b["harness"]["windows"])])
    rng = np.random.default_rng(0)
    boot = rng.choice(d, size=(10000, len(d)), replace=True).mean(axis=1)
    return {"mean_ss_difference": float(d.mean()), "windows_better": int((d > 0).sum()), "n_windows": len(d),
            "bootstrap_95pct": [float(np.quantile(boot, 0.025)), float(np.quantile(boot, 0.975))]}


def to_markdown(rep: dict) -> str:
    models = rep["models"]
    names = list(models)
    row = lambda label, fn: f"| {label} | " + " | ".join(fn(models[n]) for n in names) + " |"
    head = ["| measure | " + " | ".join(names) + " |", "|---|" + "---|" * len(names)]
    lines = ["# LocalNet vs DAP baseline vs persistence (frozen validation windows)", "",
             f"checkpoint `{rep['provenance']['checkpoint_sha256']}`", f"climatology `{rep['provenance']['climatology_sha256']}` | "
             f"train years {rep['provenance']['train_years']} | windows file `{rep['windows_sha256'][:12]}`", "",
             "## Forecast (local estimate, NOT the judge's score)"] + head
    for key in ("rmse_of_30", "csi_of_15", "anti_blur_of_10", "causality_of_15", "total_of_70"):
        lines.append(row(key, lambda m, k=key: f"{m['local_estimate'][k]:.2f}"))
    lines.append(row("mean RMSE skill vs best ref", lambda m: f"{m['harness']['local_estimate_points']['forecast']['mean_ss']:+.4f}"))
    lines.append(row("mean CSI skill (pooled leads)", lambda m: f"{m['harness']['local_estimate_points']['forecast']['mean_csi_skill']:+.4f}"))
    lines.append(row("mean day-4 skill vs persistence", lambda m: f"{m['harness']['mean_day4_skill_vs_persistence']:+.4f}"))
    for L in LEADS:
        lines.append(row(f"CSI day {L}", lambda m, L=L: f"{m['csi_by_lead'][str(L)]['csi']:.3f}"))
    for gate in ("validity_100pct", "null_bit_identical", "deterministic"):
        lines.append(row(gate, lambda m, g=gate: "PASS" if m["harness"]["gates"][g] else "FAIL"))
    for ref, title in (("skill_vs_best_ref_by_lead_channel", "Skill vs best reference"),
                       ("skill_vs_persistence_by_lead_channel", "Skill vs persistence")):
        lines += ["", f"## {title}", "| model, lead | " + " | ".join(CHANNELS) + " |", "|---|" + "---|" * 6]
        for n in names:
            for L, v in models[n]["harness"][ref].items():
                lines.append(f"| {n}, day {L} | " + " | ".join(f"{v[c]:+.3f}" for c in CHANNELS) + " |")
    lines += ["", "## Day-8 spatial variance ratio", "| model | " + " | ".join(CHANNELS) + " |", "|---|" + "---|" * 6]
    for n in names:
        lines.append(f"| {n} | " + " | ".join(f"{models[n]['harness']['day8_variance_ratio_by_channel'][c]:.2f}" for c in CHANNELS) + " |")
    lines += ["", "## Shock battery (cases passing, warm_ocean / monsoon_stall, of 6 windows each)"] + head
    for check, label in (("nonzero", "non-zero"), ("localized", "localisation"), ("propagates", "propagation"),
                         ("no_teleport", "no teleport"), ("stable", "stability")):
        lines.append(row(label, lambda m, c=check: f"{m['shocks'][c]['warm_ocean']} / {m['shocks'][c]['monsoon_stall']}"))
    lines.append(row("null identical", lambda m: "PASS" if m["shocks"]["null_identical_all_windows"] else "FAIL"))
    lines.append(row("day-1 near fraction (min-max)", lambda m: "{:.2f}-{:.2f}".format(*m["shocks"]["near_frac_day1_range"])))
    lines.append(row("far fraction (max)", lambda m: f"{m['shocks']['far_frac_max_range'][1]:.3f}"))
    lines.append(row("causality points of 15", lambda m: f"{m['shocks']['causality_points_of_15']:.2f}"))
    lines += ["", "## Paired comparison (RMSE skill per window)"]
    for k, v in rep["paired"].items():
        lines.append(f"- {k}: mean difference {v['mean_ss_difference']:+.4f}, better on {v['windows_better']}/{v['n_windows']} "
                     f"windows, bootstrap 95% [{v['bootstrap_95pct'][0]:+.4f}, {v['bootstrap_95pct'][1]:+.4f}]")
    lines += ["", f"LocalNet forecast calls checked: {rep['localnet_calls_checked']}, DAP fallbacks: 0 (any fallback rejects the run).",
              f"Latency, in-process, 10 steps: " + ", ".join(f"{n} median {v['median_ms']:.0f} ms / max {v['max_ms']:.0f} ms"
                                                              for n, v in rep["latency"].items()),
              "", "Single evaluation by W1. Not validated: W2 has not re-run it."]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--nc", type=Path, required=True)
    ap.add_argument("--candidate", type=Path, required=True)
    ap.add_argument("--baseline", type=Path, required=True)
    ap.add_argument("--shipped", type=Path, default=None, help="optional: the shipped DAP weights folder, reported as a reference")
    ap.add_argument("--windows", type=Path, default=HERE / "windows_val.json")
    ap.add_argument("--out", type=Path, default=HERE / "reports" / "phase2")
    ap.add_argument("--log", type=Path, default=HERE.parent / "runs" / "frozen_eval_log.jsonl")
    a = ap.parse_args(argv)
    try:
        provenance = provenance_checks(a.candidate, a.baseline)
        spec = json.loads(a.windows.read_text())
        data, times = load_archive(a.nc)
        keep = times.astype("datetime64[Y]").astype(int) + 1970 <= LAST_YEAR_ALLOWED
        data, times = data[keep], times[keep]                       # the test years are dropped here
        clim = kit_climatology(data, times)
        localnet = StrictEngine(Engine(a.candidate, allow_placeholder=False))
        baseline = Engine(a.baseline, allow_placeholder=False)
        if baseline.mode != "dap":
            raise RejectedRun(f"the baseline engine is in mode {baseline.mode!r}, not 'dap'")
        std = np.asarray(localnet.channel_std(), np.float32)
        a.log.parent.mkdir(parents=True, exist_ok=True)
        with a.log.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"at": dt.datetime.now().isoformat(timespec="seconds"), "checkpoint_sha256": provenance["checkpoint_sha256"],
                                "windows_sha256": sha256(a.windows)}) + "\n")
        engines = {"localnet_c64": localnet, "dap_2005_2015": baseline, "persistence": Persistence()}
        if a.shipped is not None:
            shipped = Engine(a.shipped, allow_placeholder=False)
            if shipped.mode != "dap":
                raise RejectedRun(f"the shipped reference is in mode {shipped.mode!r}, not 'dap'")
            engines["shipped_dap_2005_2017"] = shipped
        models = {n: evaluate(n, e, data, times, clim, spec, std) for n, e in engines.items()}
        first = spec["battery_first_input_days"][0]
        timings = {n: latency(e, data, times, first) for n, e in engines.items() if n != "persistence"}
        fresh = StrictEngine(Engine(a.candidate, allow_placeholder=False))
        index = {str(t): i for i, t in enumerate(times)}
        same = True
        for day in spec["battery_first_input_days"]:
            s = index[day]
            args = (data[s:s + 3], doy_sincos(times[s + 2]), 10, None)
            same &= localnet.simulate(*args).tobytes() == fresh.simulate(*args).tobytes()
        localnet.check("at the end")
    except RejectedRun as exc:
        print(f"REJECTED: {exc}")
        return 4
    rep = {"windows_sha256": sha256(a.windows), "nc_sha256": sha256(a.nc), "provenance": provenance, "models": models,
           "paired": {f"localnet_c64 - {n}": paired(models["localnet_c64"], models[n]) for n in models if n != "localnet_c64"},
           "latency": timings, "deterministic_across_engine_instances": bool(same),
           "localnet_calls_checked": localnet.calls + fresh.calls, "numpy": np.__version__, "python": platform.python_version()}
    a.out.mkdir(parents=True, exist_ok=True)
    (a.out / "compare.json").write_text(json.dumps(rep, indent=1, default=float) + "\n", encoding="utf-8")
    (a.out / "compare.md").write_text(to_markdown(rep), encoding="utf-8")
    print(to_markdown(rep))
    ln, base = models["localnet_c64"], models["dap_2005_2015"]
    flags = {
        "valid_and_deterministic": all(ln["harness"]["gates"].values()) and bool(same),
        "improves_on_dap_baseline": ln["local_estimate"]["total_of_70"] > base["local_estimate"]["total_of_70"]
                                    and rep["paired"]["localnet_c64 - dap_2005_2015"]["mean_ss_difference"] > 0,
        "propagation_in_all_cases": all(v == ln["shocks"]["n_windows"] for v in ln["shocks"]["propagates"].values()),
        "stable_in_all_cases": all(v == ln["shocks"]["n_windows"] for v in ln["shocks"]["stable"].values()),
    }
    print("flags:", json.dumps(flags))
    return 0 if all(flags.values()) else 2


if __name__ == "__main__":
    raise SystemExit(main())
