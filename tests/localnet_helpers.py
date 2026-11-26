"""Synthetic fixtures shared by the proposed LocalNet tests. Throw-away weights only; no claim about skill."""
import hashlib
import json

import numpy as np
import torch

from twin.net import LocalNet, save_checkpoint

BASE = np.array([295.0, 4.0, 1.0, 0.5, 100500.0, 35.0], np.float32)[:, None, None]
SCALE = np.array([3.0, 3.0, 2.0, 2.0, 300.0, 8.0], np.float32)[:, None, None]


def days_array(n: int, seed: int = 0) -> np.ndarray:
    r = np.random.default_rng(seed)
    x = BASE[None] + r.normal(0, 1, (n, 6, 32, 36)).astype(np.float32) * SCALE[None]
    x[:, 1] = np.abs(x[:, 1])
    return x.astype(np.float32)


def clim_table(seed: int = 1) -> np.ndarray:
    """A climatology whose every slot is different, so a wrong slot changes the inputs."""
    slot = np.arange(366, dtype=np.float32)[:, None, None, None]
    return (days_array(1, seed) + slot * np.array([0.01, 0.002, 0.003, 0.003, 1.0, 0.02], np.float32)[None, :, None, None]).astype(np.float32)


def norm() -> dict:
    return {"state_mean": [292, 0.9, 1, 0.2, 101000, 30], "state_std": [13, 1.1, 3, 2.4, 600, 20],
            "tendency_std": [1.5, 0.7, 1.4, 1.3, 150, 4], "orography_scale": 1000.0}


def static() -> np.ndarray:
    r = np.random.default_rng(2)
    return np.stack([r.random((32, 36)), r.random((32, 36)) * 4000]).astype(np.float32)


def tiny_model(channels: int = 8, seed: int = 0) -> LocalNet:
    torch.manual_seed(seed)
    model = LocalNet(channels).configure(norm(), static()).eval()
    with torch.no_grad():
        model.head.weight *= 0.05          # keep the untrained rollout inside the physical limits
        model.head.bias *= 0.05
    return model


def sha(path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_dap(folder, clim: np.ndarray | None = None) -> None:
    np.savez(folder / "climatology.npz", clim=clim_table() if clim is None else clim)
    np.savez(folder / "dap.npz", phi=np.full((6, 32, 36), 0.7, "f4"))


def select(folder, **choice) -> None:
    (folder / "model_select.json").write_text(json.dumps(choice))


def write_localnet(folder, model: LocalNet, clim_sha: str | None = None, choose: bool = True) -> None:
    path = folder / "localnet.pt"
    save_checkpoint(path, model, {"train_years": [2005, 2015],
                                  "climatology_sha256": clim_sha or sha(folder / "climatology.npz")})
    if choose:
        select(folder, active="localnet", localnet_file="localnet.pt", sha256=sha(path))
