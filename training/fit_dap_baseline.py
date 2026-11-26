"""F5: a separate DAP baseline fitted on 2005-2015 only, so the comparison with LocalNet uses the same training years.

    python -m training.fit_dap_baseline --nc data/india_climate_train.nc

Writes runs/tune/dap_baseline/. It never writes into weights/, and it uses the unchanged DAP implementation.
"""
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import numpy as np

from .climatology import save_climatology
from .data import load_dataset
from .fit_dap import fit_from_arrays
from .splits import LeakageError, load_splits, load_tuning_setup, require_fit, sha256

REPO = Path(__file__).resolve().parent.parent


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--nc", type=Path, default=None)
    ap.add_argument("--tune-dir", type=Path, default=REPO / "runs" / "tune")
    a = ap.parse_args(argv)
    out = (a.tune_dir / "dap_baseline").resolve()
    if (REPO / "weights").resolve() in (out, *out.parents):
        raise LeakageError("the 2005-2015 baseline must never be written into weights/")
    ds, _ = load_dataset(a.nc)
    fit, _tune = load_splits(ds)
    setup = load_tuning_setup(a.tune_dir, fit, ds.static)
    require_fit(fit)
    model, clim = fit_from_arrays(fit.data, fit.times)
    if not np.array_equal(clim, setup.clim):
        raise LeakageError("baseline climatology differs from the verified tuning climatology")
    out.mkdir(parents=True, exist_ok=True)
    save_climatology(clim, out / "climatology.npz")
    model.save(out / "dap.npz")
    shutil.copy(REPO / "weights" / "stats.json", out / "stats.json")
    record = {"model": "DAP baseline", "train_years": list(fit.years), "n_days": int(len(fit.times)),
              "first_day": str(fit.times[0]), "last_day": str(fit.times[-1]),
              "climatology_sha256": sha256(out / "climatology.npz"), "dap_sha256": sha256(out / "dap.npz")}
    (out / "provenance.json").write_text(json.dumps(record, indent=1) + "\n", encoding="utf-8")
    print(json.dumps(record, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
