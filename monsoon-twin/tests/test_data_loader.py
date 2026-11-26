"""NetCDF loader checks. Needs xarray; skipped where it is not installed.

The files are tiny SYNTHETIC archives written to pytest's tmp_path, only to exercise the reader and its error
messages. They are never used for training and say nothing about the real dataset.
"""
import hashlib

import numpy as np
import pytest

xr = pytest.importorskip("xarray")

from training.data import CHANNELS, LAT, LON, DatasetError, DatasetNotFoundError, load_dataset, load_split


def synthetic(n_days=30, channels=CHANNELS, lat=LAT, lon=LON):
    rng = np.random.default_rng(0)
    data = np.zeros((n_days, 6, len(lat), len(lon)), "f4")
    data[:, 0] = 295 + rng.normal(size=data[:, 0].shape)
    data[:, 1] = np.abs(rng.normal(5, 8, size=data[:, 1].shape))
    data[:, 4] = 100500 + rng.normal(0, 200, size=data[:, 4].shape)
    data[:, 5] = 30 + rng.normal(size=data[:, 5].shape)
    times = np.arange(np.datetime64("2018-06-01"), np.datetime64("2018-06-01") + n_days, dtype="datetime64[D]").astype("datetime64[ns]")
    order = [CHANNELS.index(c) for c in channels]
    ds = xr.Dataset({"data": (("time", "channel", "lat", "lon"), data[:, order])},
                    coords={"time": times, "channel": list(channels), "lat": lat, "lon": lon})
    ds["data"].attrs["units"] = "t2m K | tp mm/day | u10 m/s | v10 m/s | msl Pa | tcwv kg/m2"
    ds["static"] = (("static_channel", "lat", "lon"), np.zeros((2, len(lat), len(lon)), "f4"))
    ds = ds.assign_coords(static_channel=["land_sea_mask", "orography_m"])
    return ds, data


def write(ds, path):
    ds.to_netcdf(path, engine="scipy")
    return path


def test_loads_validates_and_reports(tmp_path):
    ds, data = synthetic()
    d, info = load_dataset(write(ds, tmp_path / "x.nc"))
    assert d.data.shape == (30, 6, 32, 36) and d.data.dtype == np.float32
    assert np.array_equal(d.data, data) and d.static.shape == (2, 32, 36)
    assert str(d.times[0]) == "2018-06-01" and "data" in info["variables"] and "K" in info["units"]
    assert load_split(d, "val")[0].shape[0] == 30


def test_channels_are_mapped_by_name_not_position(tmp_path):
    shuffled = ("tcwv", "msl", "v10", "u10", "tp", "t2m")
    ds, data = synthetic(channels=shuffled)
    d, _ = load_dataset(write(ds, tmp_path / "x.nc"))
    assert np.array_equal(d.data, data)           # `data` was built in contract order; the loader must restore it


def test_missing_file_gives_an_actionable_message(tmp_path):
    with pytest.raises(DatasetNotFoundError) as e:
        load_dataset(tmp_path / "nope.nc")
    assert "india_climate_train.nc" in str(e.value) and "not generated or substituted" in str(e.value)


def test_nan_is_rejected_not_imputed(tmp_path):
    ds, _ = synthetic()
    ds["data"].values[3, 2, 4, 5] = np.nan
    with pytest.raises(DatasetError, match="missing or non-finite"):
        load_dataset(write(ds, tmp_path / "x.nc"))


def test_wrong_grid_and_wrong_units_are_rejected(tmp_path):
    ds, _ = synthetic(lat=LAT[::-1].copy())
    with pytest.raises(DatasetError, match="lat/lon"):
        load_dataset(write(ds, tmp_path / "flipped.nc"))
    ds2, _ = synthetic()
    ds2["data"].values[:, 0] -= 273.15
    with pytest.raises(DatasetError, match="units look wrong"):
        load_dataset(write(ds2, tmp_path / "celsius.nc"))


def test_original_file_is_never_modified(tmp_path):
    ds, _ = synthetic()
    p = write(ds, tmp_path / "x.nc")
    before = hashlib.sha256(p.read_bytes()).hexdigest()
    load_dataset(p)
    assert hashlib.sha256(p.read_bytes()).hexdigest() == before
