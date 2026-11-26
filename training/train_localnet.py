"""Train LocalNet C64 on 2005-2015; take every decision on 2016-2017. 2018-2021 is never read here.

    python -m training.train_localnet --nc data/india_climate_train.nc --run runs/localnet_c64/run1

Stage 1: one-step training, once for each loss scaling ("state": error / spread of the value; "tendency": error /
spread of the one-day change). Stage 2: the winner is fine-tuned through 2 and then 4 autoregressive steps and a
fine-tuned checkpoint is kept only if the tuning score improves. All forward passes use `LocalNet.rollout`, the
function the server uses. Training stops at once on a non-finite loss or gradient.

Tuning score (same kit functions as the evaluation, on every 10-day window inside 2016-2017):
forecast points (of 45) + anti-blur points (of 10); ties are broken by mean RMSE skill. The climatology REFERENCE in
the score is the 2005-2015 table at the true calendar day.
Nothing here validates the model; that is the job of eval/compare.py.
"""
from __future__ import annotations

import argparse
import json
import math
import platform
import shutil
import subprocess
import time
from pathlib import Path

import numpy as np
import torch
from torch.nn import functional as F

from monsoon_r1 import scoring
from monsoon_r1.contract import lat_weights
from twin import doy
from twin.dap import Climatology, DampedAnomalyPersistence
from twin.guards import clamp_state
from twin.net import TP, LocalNet, save_checkpoint, to_model_space, to_physical

from .climatology import slot_index
from .data import load_dataset
from .localnet_data import sample_starts, serving_day
from .splits import Split, TuningSetup, load_splits, load_tuning_setup, require_fit, sha256

REPO = Path(__file__).resolve().parent.parent
CHANNELS = ("t2m", "tp", "u10", "v10", "msl", "tcwv")
LEADS = (1, 4, 8)
EVAL_STEPS = 10
HEAVY_RAIN = 10.0                                # mm/day, the kit's threshold

CONFIG = {
    "channels": 64, "blocks": 4, "seed": 20261126, "batch_size": 32, "weight_decay": 1e-4, "grad_clip_norm": 1.0,
    "rain_bce_weight": 0.1, "loss": "latitude-weighted MSE, equal channel weights, in model space (rain as log1p)",
    "stage1": {"rollout": 1, "lr": 1e-3, "schedule": "cosine to 1% over max_epochs", "max_epochs": 40, "patience": 8},
    "stage2": [{"rollout": 2, "lr": 1e-4, "epochs": 4}, {"rollout": 4, "lr": 5e-5, "epochs": 4}],
    "loss_scalings": ["state", "tendency"],
    "selection": "tuning forecast points + anti-blur points on 2016-2017; ties by mean RMSE skill",
}


class NonFiniteLoss(RuntimeError):
    """Loss or gradient became NaN or infinite. Training stops; nothing from this step is applied."""


# ------------------------------------------------------------------------------------------------ data on device
class Samples:
    """Samples of one split: 3 input days + `n_out` targets, with the SERVING day-of-year for each."""

    def __init__(self, split: Split, n_out: int, device: str, data: torch.Tensor | None = None) -> None:
        split.verify()
        self.split, self.n_out = split, n_out
        self.starts = sample_starts(split.times, split.years, n_out)
        self.n0 = np.array([serving_day(split.times[s + 2]) for s in self.starts], dtype=np.int64)
        self.data = torch.from_numpy(split.data).to(device) if data is None else data
        self.index = torch.from_numpy(self.starts).to(device)

    def __len__(self) -> int:
        return len(self.starts)

    def batch(self, picks: np.ndarray) -> tuple[torch.Tensor, np.ndarray, torch.Tensor]:
        first = self.index[torch.from_numpy(picks).to(self.index.device)]
        history = self.data[first[:, None] + torch.arange(3, device=first.device)[None]]
        targets = self.data[first[:, None] + 3 + torch.arange(self.n_out, device=first.device)[None]]
        return history, self.n0[picks], targets


# ------------------------------------------------------------------------------------------------ loss and training
def loss_terms(model: LocalNet, states: torch.Tensor, logits: torch.Tensor, targets: torch.Tensor, scale: torch.Tensor,
               weights: torch.Tensor, pos_weight: torch.Tensor) -> torch.Tensor:
    """states [B,K,6,H,W] model space; targets [B,K,6,H,W] physical; scale [6]; weights [H] latitude."""
    target_z = to_model_space(targets)
    error = (states - target_z) / scale.reshape(1, 1, 6, 1, 1)
    mse = (error.square() * weights.reshape(1, 1, 1, -1, 1)).mean()
    wet = (targets[:, :, TP] > HEAVY_RAIN).float()
    bce = F.binary_cross_entropy_with_logits(logits, wet, pos_weight=pos_weight, reduction="none")
    return mse + CONFIG["rain_bce_weight"] * (bce * weights.reshape(1, 1, -1, 1)).mean()


def train_epoch(model: LocalNet, samples: Samples, optimizer: torch.optim.Optimizer, clim: torch.Tensor,
                scale: torch.Tensor, weights: torch.Tensor, pos_weight: torch.Tensor, rng: np.random.Generator,
                batch_size: int, deadline: float | None = None) -> float:
    require_fit(samples.split)                     # gradient updates on 2005-2015 only
    model.train()
    order = rng.permutation(len(samples))
    total, seen = 0.0, 0
    for begin in range(0, len(order), batch_size):
        picks = order[begin:begin + batch_size]
        history, n0, targets = samples.batch(picks)
        optimizer.zero_grad(set_to_none=True)
        states, logits = model.rollout(history, n0, samples.n_out, clim)
        loss = loss_terms(model, states, logits, targets, scale, weights, pos_weight)
        if not torch.isfinite(loss):
            raise NonFiniteLoss(f"non-finite loss at batch {begin // batch_size}")
        loss.backward()
        norm = torch.nn.utils.clip_grad_norm_(model.parameters(), CONFIG["grad_clip_norm"])
        if not torch.isfinite(norm):
            raise NonFiniteLoss(f"non-finite gradient norm at batch {begin // batch_size}")
        optimizer.step()
        total += float(loss.detach()) * len(picks)
        seen += len(picks)
        if deadline is not None and time.time() > deadline:
            break
    return total / max(seen, 1)


# ------------------------------------------------------------------------------------------------ tuning evaluation
class TuneBench:
    """Every 10-day window inside 2016-2017 with persistence and climatology references."""

    def __init__(self, tune: Split, setup: TuningSetup) -> None:
        tune.verify()
        if tune.name != "tune":
            raise ValueError("the tuning benchmark needs the tuning split")
        self.starts = sample_starts(tune.times, tune.years, EVAL_STEPS)
        offsets = np.array(LEADS)
        self.history = tune.data[self.starts[:, None] + np.arange(3)[None]]
        self.truth = tune.data[self.starts[:, None] + 2 + offsets[None]]                    # [N,3,6,H,W]
        self.persist = np.repeat(self.history[:, 2:3], len(LEADS), axis=1)
        self.clim_ref = setup.clim[slot_index(tune.times)[self.starts[:, None] + 2 + offsets[None]]]
        self.n0 = np.array([serving_day(tune.times[s + 2]) for s in self.starts], dtype=np.int64)
        self.truth8 = self.truth[:, 2]

    def score(self, forecast: np.ndarray) -> dict:
        """forecast [N,3,6,H,W]: leads 1, 4, 8."""
        ss, csi_skill, ratios = [], [], []
        by_lead = {L: [] for L in LEADS}
        for i in range(len(self.starts)):
            r = scoring.skill_vs_best_ref(forecast[i], self.truth[i], self.persist[i], self.clim_ref[i])
            ss.append(float(np.nanmean(r["ss"])))
            for j, L in enumerate(LEADS):
                one = scoring.skill_vs_best_ref(forecast[i, j:j + 1], self.truth[i, j:j + 1], self.persist[i, j:j + 1],
                                                self.clim_ref[i, j:j + 1])
                by_lead[L].append(np.stack([one["ss"], one["ss_persist"]]))
            t = self.truth[i, :, TP]
            csi_skill.append(scoring.csi_skill(scoring.csi(forecast[i, :, TP], t), scoring.csi(self.persist[i, :, TP], t),
                                               scoring.csi(self.clim_ref[i, :, TP], t)))
            ratios.append(scoring.variance_ratio(forecast[i, 2], self.truth8[i]))
        fp = scoring.forecast_points(ss, csi_skill)
        blur = scoring.anti_blur_points(np.array(ratios))
        lead_means = {str(L): np.nanmean(np.stack(v), axis=0) for L, v in by_lead.items()}
        return {"n_windows": len(ss), "mean_ss": fp["mean_ss"], "mean_csi_skill": fp["mean_csi_skill"],
                "forecast_points": fp["points"], "anti_blur_points": blur, "points": fp["points"] + blur,
                "ss_vs_best_ref": {L: dict(zip(CHANNELS, v[0].round(4).tolist())) for L, v in lead_means.items()},
                "ss_vs_persistence": {L: dict(zip(CHANNELS, v[1].round(4).tolist())) for L, v in lead_means.items()},
                "day8_variance_ratio": dict(zip(CHANNELS, np.nanmean(np.array(ratios), axis=0).round(4).tolist()))}

    @torch.no_grad()
    def forecast_localnet(self, model: LocalNet, clim: torch.Tensor, device: str, batch: int = 128) -> np.ndarray:
        model.eval()
        keep = [L - 1 for L in LEADS]
        parts = []
        for begin in range(0, len(self.starts), batch):
            history = torch.from_numpy(self.history[begin:begin + batch]).to(device)
            states, _ = model.rollout(history, self.n0[begin:begin + batch], EVAL_STEPS, clim)
            parts.append(to_physical(states[:, keep]).cpu().numpy())
        out = np.concatenate(parts)
        if not np.isfinite(out).all():
            raise NonFiniteLoss("the tuning forecast holds non-finite values")
        return clamp_state(out)

    def forecast_dap(self, dap: DampedAnomalyPersistence, clim: np.ndarray) -> np.ndarray:
        table, keep = Climatology(clim), [L - 1 for L in LEADS]
        return np.stack([clamp_state(dap.forecast(clamp_state(h[2]), int(n), EVAL_STEPS, table)[keep])
                         for h, n in zip(self.history, self.n0)])


def better(a: dict, b: dict | None) -> bool:
    return b is None or (round(a["points"], 3), a["mean_ss"]) > (round(b["points"], 3), b["mean_ss"])


def brief(s: dict) -> str:
    return (f"points {s['points']:6.2f} (forecast {s['forecast_points']:.2f}, blur {s['anti_blur_points']:.2f}) "
            f"mean_ss {s['mean_ss']:+.4f} csi_skill {s['mean_csi_skill']:+.4f} tp_var8 {s['day8_variance_ratio']['tp']:.2f}")


# ------------------------------------------------------------------------------------------------------- driver
def run_stage(model: LocalNet, samples: Samples, bench: TuneBench, clim: torch.Tensor, scale: torch.Tensor,
              weights: torch.Tensor, pos_weight: torch.Tensor, device: str, lr: float, epochs: int, patience: int | None,
              cosine: bool, rng: np.random.Generator, best: dict | None, best_state: dict | None, label: str,
              history: list, deadline: float) -> tuple[dict, dict]:
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=CONFIG["weight_decay"])
    schedule = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, epochs, eta_min=lr * 0.01) if cosine else None
    stale = 0
    for epoch in range(1, epochs + 1):
        t0 = time.time()
        loss = train_epoch(model, samples, optimizer, clim, scale, weights, pos_weight, rng, CONFIG["batch_size"], deadline)
        t1 = time.time()
        score = bench.score(bench.forecast_localnet(model, clim, device))
        history.append({"stage": label, "epoch": epoch, "train_loss": loss, "train_s": round(t1 - t0, 2),
                        "tune_s": round(time.time() - t1, 2),
                        **{k: score[k] for k in ("points", "mean_ss", "mean_csi_skill", "anti_blur_points")}})
        improved = better(score, best)
        if improved:
            best, stale = {**score, "stage": label, "epoch": epoch}, 0
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        else:
            stale += 1
        print(f"[{label}] epoch {epoch:2d} loss {loss:.4f} | {brief(score)}{'  *' if improved else ''}", flush=True)
        if schedule:
            schedule.step()
        if (patience and stale >= patience) or time.time() > deadline:
            print(f"[{label}] stopping: {'time limit' if time.time() > deadline else 'no improvement'}", flush=True)
            break
    return best, best_state


def build_candidate(out: Path, model: LocalNet, meta: dict, setup: TuningSetup, baseline: Path) -> dict:
    """A self-contained weights folder: LocalNet selected, with the 2005-2015 DAP as its fallback."""
    out.mkdir(parents=True, exist_ok=True)
    shutil.copy(setup.clim_path, out / "climatology.npz")
    shutil.copy(setup.norm_path, out / "norm.json")
    shutil.copy(setup.clim_path.parent / "static.npz", out / "static.npz")
    for name in ("dap.npz", "stats.json", "provenance.json"):
        shutil.copy(baseline / name, out / name)
    save_checkpoint(out / "localnet.pt", model, {**meta, "climatology_sha256": sha256(out / "climatology.npz")})
    hashes = {n: sha256(out / n) for n in ("localnet.pt", "climatology.npz", "norm.json", "dap.npz", "static.npz")}
    (out / "model_select.json").write_text(json.dumps(
        {"active": "localnet", "localnet_file": "localnet.pt", "sha256": hashes["localnet.pt"]}, indent=1) + "\n",
        encoding="utf-8")
    return hashes


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--nc", type=Path, default=None)
    ap.add_argument("--tune-dir", type=Path, default=REPO / "runs" / "tune")
    ap.add_argument("--run", type=Path, required=True)
    ap.add_argument("--max-minutes", type=float, default=60.0)
    a = ap.parse_args(argv)
    if (REPO / "weights").resolve() in (a.run.resolve(), *a.run.resolve().parents):
        raise ValueError("training runs are never written into weights/")
    if (a.run / "run_record.json").exists():
        raise ValueError(f"{a.run} already holds a run; choose a new folder")
    a.run.mkdir(parents=True, exist_ok=True)
    started = time.time()
    deadline = started + 60.0 * a.max_minutes
    device = "cuda" if torch.cuda.is_available() else "cpu"
    torch.backends.cudnn.benchmark = False

    ds, _ = load_dataset(a.nc)
    fit, tune = load_splits(ds)
    setup = load_tuning_setup(a.tune_dir, fit, ds.static)
    baseline = a.tune_dir / "dap_baseline"
    provenance = json.loads((baseline / "provenance.json").read_text(encoding="utf-8"))
    if provenance["train_years"] != list(fit.years) or provenance["climatology_sha256"] != sha256(setup.clim_path) \
            or provenance["dap_sha256"] != sha256(baseline / "dap.npz"):
        raise ValueError("the DAP baseline is missing or not the 2005-2015 one: run training.fit_dap_baseline")
    del ds

    bench = TuneBench(tune, setup)
    clim = torch.from_numpy(setup.clim).to(device)
    weights = torch.from_numpy(lat_weights().astype(np.float32)).to(device)
    wet_fraction = float((fit.data[:, TP] > HEAVY_RAIN).mean())
    pos_weight = torch.tensor((1.0 - wet_fraction) / wet_fraction, device=device)
    first = Samples(fit, 1, device)
    references = {
        "persistence": bench.score(bench.persist.copy()),
        "dap_2005_2015": bench.score(bench.forecast_dap(DampedAnomalyPersistence.load(baseline / "dap.npz"), setup.clim)),
    }
    for name, s in references.items():
        print(f"reference {name:14s}| {brief(s)}", flush=True)

    history: list = []
    results: dict = {}
    states: dict = {}
    try:
        for scaling in CONFIG["loss_scalings"]:
            torch.manual_seed(CONFIG["seed"])
            rng = np.random.default_rng(CONFIG["seed"])
            model = LocalNet(CONFIG["channels"], CONFIG["blocks"]).configure(setup.norm, setup.static).to(device)
            scale = (model.state_std if scaling == "state" else model.tendency_std).reshape(6).clone()
            share = max(deadline - time.time(), 60.0) * (0.4 if scaling == CONFIG["loss_scalings"][0] else 0.65)
            s1 = CONFIG["stage1"]
            results[scaling], states[scaling] = run_stage(
                model, first, bench, clim, scale, weights, pos_weight, device, s1["lr"], s1["max_epochs"], s1["patience"],
                True, rng, None, None, f"stage1-{scaling}", history, time.time() + share)
            torch.save({"state_dict": states[scaling]}, a.run / f"stage1_{scaling}_state.pt")
        winner = max(results, key=lambda k: (round(results[k]["points"], 3), results[k]["mean_ss"]))
        print(f"loss scaling chosen on 2016-2017: {winner}", flush=True)

        best, best_state = results[winner], states[winner]
        model = LocalNet(CONFIG["channels"], CONFIG["blocks"]).configure(setup.norm, setup.static).to(device)
        scale = (model.state_std if winner == "state" else model.tendency_std).reshape(6).clone()
        rng = np.random.default_rng(CONFIG["seed"] + 1)
        for stage in CONFIG["stage2"]:
            if time.time() > deadline:
                break
            model.load_state_dict(best_state)                      # always continue from the best so far
            samples = Samples(fit, stage["rollout"], device, data=first.data)
            best, best_state = run_stage(model, samples, bench, clim, scale, weights, pos_weight, device, stage["lr"],
                                         stage["epochs"], None, False, rng, best, best_state,
                                         f"stage2-rollout{stage['rollout']}", history, deadline)
    except NonFiniteLoss as exc:
        (a.run / "FAILED_non_finite.json").write_text(json.dumps({"error": str(exc), "history": history}, indent=1))
        print(f"STOPPED: {exc}", flush=True)
        return 3

    model.load_state_dict(best_state)
    model.cpu().eval()
    git = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True, text=True).stdout.strip()
    meta = {"train_years": list(fit.years), "tune_years": list(tune.years), "loss_scaling": winner,
            "best_stage": best["stage"], "best_epoch": int(best["epoch"]), "seed": CONFIG["seed"]}
    hashes = build_candidate(a.run / "candidate", model, meta, setup, baseline)
    record = {
        "config": CONFIG, "max_minutes": a.max_minutes, "device": device,
        "gpu": torch.cuda.get_device_name(0) if device == "cuda" else None, "torch": torch.__version__,
        "python": platform.python_version(), "numpy": np.__version__, "git_head": git,
        "note": "code is uncommitted; source_sha256 identifies it", "heavy_rain_pos_weight": float(pos_weight),
        "source_sha256": {p: sha256(REPO / p) for p in ("twin/net.py", "twin/inputs.py", "training/train_localnet.py",
                                                        "training/splits.py", "training/localnet_data.py")},
        "samples": {"fit_1step": len(first), "tune_windows": len(bench.starts)},
        "fit_days": [str(fit.times[0]), str(fit.times[-1])], "tune_days": [str(tune.times[0]), str(tune.times[-1])],
        "normalisation": setup.norm, "sha256": {**hashes, "dataset": sha256(a.nc) if a.nc else None},
        "loss_scaling_chosen": winner, "stage1_best": results, "best": best, "references_on_tune": references,
        "beats_dap_baseline_on_tune": bool(better(best, references["dap_2005_2015"])
                                           and best["mean_ss"] > references["dap_2005_2015"]["mean_ss"]),
        "total_minutes": round((time.time() - started) / 60.0, 2), "history": history,
    }
    (a.run / "run_record.json").write_text(json.dumps(record, indent=1, default=float) + "\n", encoding="utf-8")
    print(f"best: {best['stage']} epoch {best['epoch']} | {brief(best)}")
    print(f"checkpoint sha256 {hashes['localnet.pt']}")
    print(f"beats the 2005-2015 DAP on 2016-2017: {record['beats_dap_baseline_on_tune']} | total {record['total_minutes']} min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
