"""LocalNet: a local residual CNN that predicts one-day tendencies. Needs PyTorch (imported only when selected).

One `rollout` loop serves both training and inference, so inputs, calendar, rain handling and limits cannot drift apart.

Design (docs/MODEL_STRATEGY.md section 3): 3x3 stem, 4 residual blocks (per-pixel LayerNorm, conv, GELU, conv),
replicate padding, no down-sampling, 1x1 head with 6 tendencies and 1 heavy-rain logit (used in training only).
No layer mixes information across the whole grid. Each step can use inputs up to 9 cells away along rows/columns;
whether a trained model actually spreads a perturbation has NOT been measured.

Model space: physical units, except rain, which is log1p(rain). The state is limited to the physical ranges of
`guards` after every step. The limit uses a straight-through gradient: the forward value is the limited one (rain is
never negative, in training and in serving alike), while the gradient flows as if no limit had been applied, so a
cell that is predicted dry but observed wet can still be corrected.
"""
from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

from . import inputs
from .guards import LOWER, UPPER

CHECKPOINT_FORMAT = "monsoontwin-localnet-1"
DEFAULT_CHANNELS = 64
N_BLOCKS = 4
TP = 1
NORM_KEYS = ("state_mean", "state_std", "tendency_std")


class PixelNorm(nn.Module):
    """LayerNorm over the channels of each grid cell separately; statistics never cross cells."""

    def __init__(self, channels: int) -> None:
        super().__init__()
        self.norm = nn.LayerNorm(channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:              # [B,C,H,W]
        return self.norm(x.permute(0, 2, 3, 1)).permute(0, 3, 1, 2)


def _conv3(n_in: int, n_out: int) -> nn.Conv2d:
    return nn.Conv2d(n_in, n_out, 3, padding=1, padding_mode="replicate")


class ResidualBlock(nn.Module):
    def __init__(self, channels: int) -> None:
        super().__init__()
        self.norm = PixelNorm(channels)
        self.conv1 = _conv3(channels, channels)
        self.conv2 = _conv3(channels, channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x + self.conv2(F.gelu(self.conv1(self.norm(x))))


def _limits_in_model_space(bounds: np.ndarray) -> torch.Tensor:
    t = torch.tensor(np.asarray(bounds, dtype=np.float32))
    t[TP] = torch.log1p(t[TP])
    return t.reshape(1, 6, 1, 1)


def to_model_space(physical: torch.Tensor) -> torch.Tensor:
    """[...,6,H,W] physical -> model space: limited to the physical ranges, rain as log1p."""
    lower = torch.tensor(LOWER, device=physical.device).reshape(6, 1, 1)
    upper = torch.tensor(UPPER, device=physical.device).reshape(6, 1, 1)
    z = torch.minimum(torch.maximum(physical, lower), upper).clone()
    z[..., TP, :, :] = torch.log1p(z[..., TP, :, :])
    return z


def to_physical(z: torch.Tensor) -> torch.Tensor:
    """Inverse of `to_model_space` (rain is expm1 of the stored value)."""
    out = z.clone()
    out[..., TP, :, :] = torch.expm1(out[..., TP, :, :])
    return out


class LocalNet(nn.Module):
    def __init__(self, channels: int = DEFAULT_CHANNELS, blocks: int = N_BLOCKS) -> None:
        super().__init__()
        self.channels, self.blocks = int(channels), int(blocks)
        self.stem = _conv3(inputs.N_INPUT_CHANNELS, channels)
        self.body = nn.Sequential(*[ResidualBlock(channels) for _ in range(blocks)])
        self.head = nn.Conv2d(channels, 7, 1)
        # Normalisation and static features travel inside the checkpoint; `configure` fills them (not parameters).
        self.register_buffer("state_mean", torch.zeros(1, 6, 1, 1))
        self.register_buffer("state_std", torch.ones(1, 6, 1, 1))
        self.register_buffer("tendency_std", torch.ones(1, 6, 1, 1))
        self.register_buffer("static_feats", torch.zeros(4, *inputs.GRID))
        self.register_buffer("lower", _limits_in_model_space(LOWER), persistent=False)
        self.register_buffer("upper", _limits_in_model_space(UPPER), persistent=False)

    def configure(self, norm: dict, static: np.ndarray) -> "LocalNet":
        """Load training-years statistics (as written to norm.json) and the raw static array [2,32,36]."""
        for key in NORM_KEYS:
            value = torch.tensor(np.asarray(norm[key], dtype=np.float32))
            if value.shape != (6,) or not torch.isfinite(value).all() or (key.endswith("std") and not (value > 0).all()):
                raise ValueError(f"norm[{key!r}] must hold 6 finite values (std values positive)")
            getattr(self, key).copy_(value.reshape(1, 6, 1, 1))
        feats = inputs.static_features(static, float(norm["orography_scale"]))
        self.static_feats.copy_(torch.tensor(feats))
        return self

    def forward(self, x: torch.Tensor) -> torch.Tensor:              # [B,30,H,W] -> [B,7,H,W]
        return self.head(self.body(self.stem(x)))

    def normalise(self, z: torch.Tensor) -> torch.Tensor:           # [B,6,H,W]
        return (z - self.state_mean) / self.state_std

    def build_input(self, history_z: torch.Tensor, clim_z: torch.Tensor, sincos: torch.Tensor) -> torch.Tensor:
        """history_z [B,3,6,H,W] and clim_z [B,6,H,W] in model space, sincos [B,2] -> [B,30,H,W]."""
        b, _, _, h, w = history_z.shape
        states = torch.cat([self.normalise(history_z[:, d]) for d in range(inputs.N_DAYS_IN)], dim=1)
        static = self.static_feats.unsqueeze(0).expand(b, -1, -1, -1)
        time = sincos.reshape(b, 2, 1, 1).expand(-1, -1, h, w)
        return torch.cat([states, self.normalise(clim_z), static[:, :2], time, static[:, 2:]], dim=1)

    def step(self, history_z: torch.Tensor, clim_z: torch.Tensor, sincos: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """One day ahead. Returns (raw next state [B,6,H,W] in model space BEFORE limits, rain logit [B,H,W])."""
        out = self.forward(self.build_input(history_z, clim_z, sincos))
        return history_z[:, -1] + self.tendency_std * out[:, :6], out[:, 6]

    def limit(self, raw: torch.Tensor) -> torch.Tensor:
        """Physical limits with a straight-through gradient (see the module docstring)."""
        clipped = torch.minimum(torch.maximum(raw, self.lower), self.upper)
        # Order matters: `raw - raw.detach()` is exactly zero for any finite value, so the forward value is exactly the
        # clipped one. (`raw + (clipped - raw)` loses it to float32 rounding when raw is far outside the range.)
        # A non-finite raw value stays non-finite; it is never hidden behind a limit.
        return clipped.detach() + (raw - raw.detach())

    def rollout(self, history: torch.Tensor, n0: np.ndarray, steps: int, clim_table: torch.Tensor,
                repair: Callable[[int, torch.Tensor, torch.Tensor], torch.Tensor] | None = None,
                ) -> tuple[torch.Tensor, torch.Tensor]:
        """Autoregressive forecast, used unchanged by training and serving.

        history [B,3,6,H,W] physical, oldest first; n0 [B] nominal day of the last input day (`doy.from_sincos`);
        clim_table [366,6,H,W] physical. `repair(lead, history_z, raw)` may return a replacement for a bad raw step.
        Returns (states [B,steps,6,H,W] in MODEL space, rain logits [B,steps,H,W]).
        """
        history_z = to_model_space(history)
        states, logits = [], []
        for lead in range(1, steps + 1):
            days = inputs.target_days(n0, lead)
            slots = torch.as_tensor(inputs.SLOT_OF_DAY[days], device=clim_table.device)
            clim_z = to_model_space(clim_table.index_select(0, slots)).to(history_z.device)
            sincos = torch.as_tensor(inputs.SINCOS_OF_DAY[days], device=history_z.device)
            raw, logit = self.step(history_z, clim_z, sincos)
            if repair is not None:
                raw = repair(lead, history_z, raw)
            nxt = self.limit(raw)
            states.append(nxt)
            logits.append(logit)
            history_z = torch.cat([history_z[:, 1:], nxt.unsqueeze(1)], dim=1)
        return torch.stack(states, dim=1), torch.stack(logits, dim=1)


def save_checkpoint(path: Path, model: LocalNet, meta: dict) -> None:
    """Write weights, buffers and plain-type metadata. `meta` must name the climatology the model was trained with."""
    for key in ("train_years", "climatology_sha256"):
        if key not in meta:
            raise ValueError(f"checkpoint meta needs {key!r}")
    state = {k: v.detach().cpu() for k, v in model.state_dict().items()}
    torch.save({"format": CHECKPOINT_FORMAT, "channels": model.channels, "blocks": model.blocks,
                "meta": dict(meta), "state_dict": state}, path)


def load_checkpoint(path: Path) -> tuple[LocalNet, dict]:
    """Read a checkpoint on the CPU (tensors and plain types only). Raises ValueError on anything unexpected."""
    blob = torch.load(path, map_location="cpu", weights_only=True)
    if not isinstance(blob, dict) or blob.get("format") != CHECKPOINT_FORMAT:
        raise ValueError(f"{path} is not a {CHECKPOINT_FORMAT} checkpoint")
    model = LocalNet(blob["channels"], blob["blocks"])
    model.load_state_dict(blob["state_dict"], strict=True)
    bad = [k for k, v in model.state_dict().items() if not torch.isfinite(v).all()]
    if bad:
        raise ValueError(f"{path} holds non-finite values in {bad[:3]}")
    if not (model.state_std > 0).all() or not (model.tendency_std > 0).all():
        raise ValueError(f"{path} holds a non-positive std")
    return model.eval(), dict(blob["meta"])
