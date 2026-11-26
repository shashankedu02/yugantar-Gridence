"""Training-side logic that needs no NetCDF reader: splits, leak-free windows, climatology, DAP fitting.
Synthetic arrays, small grid; these test the code paths and make no claim about real-data results."""
import numpy as np
import pytest

from training.climatology import N_SLOTS, build_climatology, slot_index
from training.data import (DatasetError, Dataset, check_physical_units, dataset_statistics, load_split,
                           split_masks, window_starts)
from training.fit_dap import fit_from_arrays, lag1_pairs


def days(start, end):
    return np.arange(np.datetime64(start), np.datetime64(end) + np.timedelta64(1, "D"), dtype="datetime64[D]")


def test_splits_are_disjoint_chronological_and_by_year():
    t = days("2005-01-01", "2021-12-31")
    m = split_masks(t)
    assert not (m["train"] & m["val"]).any() and not (m["val"] & m["test"]).any() and not (m["train"] & m["test"]).any()
    assert m["train"].sum() + m["val"].sum() + m["test"].sum() == len(t)
    assert t[m["train"]].max() < t[m["val"]].min() and t[m["val"]].max() < t[m["test"]].min()
    assert str(t[m["train"]][0]) == "2005-01-01" and str(t[m["train"]][-1]) == "2017-12-31"
    assert str(t[m["val"]][0]) == "2018-01-01" and str(t[m["val"]][-1]) == "2019-12-31"


def test_windows_never_straddle_a_split_boundary():
    t = days("2005-01-01", "2021-12-31")
    m = split_masks(t)
    tr = window_starts(t, m["train"], n_in=3, n_out=4)
    va = window_starts(t, m["val"], n_in=3, n_out=4)
    assert t[tr + 6].max() <= np.datetime64("2017-12-31") and t[va].min() >= np.datetime64("2018-01-01")
    assert t[va + 6].max() <= np.datetime64("2019-12-31")
    assert len(set(tr) & set(va)) == 0
    assert len(tr) == m["train"].sum() - 6                 # every train window fits except the last 6 starts


def test_windows_skip_gaps_in_the_daily_axis():
    t = np.concatenate([days("2010-01-01", "2010-01-10"), days("2010-01-13", "2010-01-20")])
    starts = window_starts(t, np.ones(len(t), bool), n_in=3, n_out=1)
    for s in starts:
        assert (np.diff(t[s:s + 4]).astype(int) == 1).all()
    assert not ({7, 8, 9} & set(starts.tolist()))          # these windows span the 10th -> 13th jump
    assert {6, 10} <= set(starts.tolist())                 # the last window before the gap and the first after it are fine


def test_test_split_is_locked_unless_explicitly_allowed():
    t = days("2020-01-01", "2020-01-20")
    ds = Dataset(np.zeros((len(t), 6, 2, 2), "f4"), t, None, "x")
    with pytest.raises(DatasetError):
        load_split(ds, "test")
    assert load_split(ds, "test", allow_test=True)[0].shape[0] == len(t)
    with pytest.raises(ValueError):
        load_split(ds, "nope")


def test_unit_checks_flag_celsius_hpa_and_metres():
    good = np.zeros((20, 6, 2, 2), "f4"); good[:, 0] = 295; good[:, 1] = np.linspace(0, 80, 20)[:, None, None]
    good[:, 4] = 100500; good[:, 5] = 30
    assert check_physical_units(good) == []
    celsius = good.copy(); celsius[:, 0] = 22
    hpa = good.copy(); hpa[:, 4] = 1005
    metres = good.copy(); metres[:, 1] = metres[:, 1] / 1000.0
    assert any("t2m" in p for p in check_physical_units(celsius))
    assert any("msl" in p for p in check_physical_units(hpa))
    assert any("tp" in p for p in check_physical_units(metres))


def test_statistics_report_per_split():
    t = days("2017-12-25", "2018-01-05")
    data = np.random.default_rng(0).normal(size=(len(t), 6, 2, 2)).astype("f4")
    s = dataset_statistics(data, t)
    assert s["train"]["days"] == 7 and s["val"]["days"] == 5 and s["test"]["days"] == 0


def test_slot_index_gives_leap_day_its_own_slot():
    t = np.array(["2008-01-01", "2008-02-28", "2008-02-29", "2008-03-01", "2009-03-01", "2008-12-31"], dtype="datetime64[D]")
    assert slot_index(t).tolist() == [0, 58, 59, 60, 60, 365]


def test_climatology_recovers_a_seasonal_cycle_and_needs_a_leap_year():
    t = days("2005-01-01", "2017-12-31")
    slots = slot_index(t)
    cycle = np.sin(2 * np.pi * slots / 366.0).astype("f4")
    data = np.broadcast_to(cycle[:, None, None, None], (len(t), 6, 2, 3)).copy()
    clim = build_climatology(data, t, smooth_days=1)
    assert clim.shape == (N_SLOTS, 6, 2, 3)
    assert np.allclose(clim[:, 0, 0, 0], np.sin(2 * np.pi * np.arange(N_SLOTS) / 366.0), atol=1e-5)
    smooth = build_climatology(data, t, smooth_days=15)
    assert np.abs(smooth[:, 0, 0, 0] - clim[:, 0, 0, 0]).max() < 0.01            # a 15-day mean barely moves a smooth cycle
    with pytest.raises(DatasetError):
        build_climatology(data[:365], t[:365])                                   # one year: no leap slot, others empty


def test_lag1_pairs_only_consecutive_days():
    t = np.concatenate([days("2010-01-01", "2010-01-03"), days("2010-01-06", "2010-01-07")])
    i0, i1 = lag1_pairs(t)
    assert i0.tolist() == [0, 1, 3] and i1.tolist() == [1, 2, 4]


def test_fit_from_arrays_on_synthetic_ar1_anomalies():
    t = days("2005-01-01", "2017-12-31")
    rng = np.random.default_rng(0)
    phi_true = 0.6
    a = np.zeros((len(t), 6, 3, 4), "f4")
    for k in range(1, len(t)):
        a[k] = phi_true * a[k - 1] + rng.normal(0, 1, a.shape[1:]).astype("f4")
    seasonal = (10 * np.sin(2 * np.pi * slot_index(t) / 366.0)).astype("f4")[:, None, None, None]
    model, clim = fit_from_arrays(a + seasonal, t)
    assert clim.shape == (N_SLOTS, 6, 3, 4)
    assert abs(float(model.phi.mean()) - phi_true) < 0.05
