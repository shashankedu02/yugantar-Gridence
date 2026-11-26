"""DAP and DAP-LW mechanics. These are MATH unit tests on synthetic arrays: they check that the code implements the
formulas, and say nothing about forecast skill on real data."""
import numpy as np
import pytest

from twin import doy
from twin.dap import PHI_MAX, Climatology, DampedAnomalyPersistence, LeadWiseBlend

C, H, W = 6, 4, 5


def clim_table(offset=0.0):
    t = np.arange(doy.N_SLOTS, dtype="f4")[:, None, None, None] * 0.01
    return (np.zeros((doy.N_SLOTS, C, H, W), "f4") + t + offset).astype("f4")


def test_climatology_interface_and_validation():
    clim = Climatology(clim_table())
    assert clim.at_day(1).shape == (C, H, W)
    leads = clim.lead_days(364, 3)                      # wraps over the year end
    assert leads.shape == (3, C, H, W)
    assert np.allclose(leads[0], clim.at_day(365)) and np.allclose(leads[1], clim.at_day(1))
    with pytest.raises(ValueError):
        Climatology(np.zeros((365, C, H, W), "f4"))
    bad = clim_table(); bad[3, 0, 0, 0] = np.nan
    with pytest.raises(ValueError):
        Climatology(bad)


def test_fit_recovers_a_known_ar1_coefficient():
    rng = np.random.default_rng(0)
    phi_true = np.linspace(0.2, 0.9, C * H * W, dtype="f4").reshape(C, H, W)
    a = np.zeros((4000, C, H, W), "f4")
    for t in range(1, len(a)):
        a[t] = phi_true * a[t - 1] + rng.normal(0, 1, (C, H, W)).astype("f4")
    model = DampedAnomalyPersistence().fit(a[:-1], a[1:])
    assert np.abs(model.phi - phi_true).max() < 0.05


def test_fit_clips_to_0_and_phi_max_and_handles_zero_variance():
    a0 = np.ones((10, C, H, W), "f4")
    a1_hi, a1_neg = 5.0 * a0, -3.0 * a0
    assert np.allclose(DampedAnomalyPersistence().fit(a0, a1_hi).phi, PHI_MAX)
    assert np.allclose(DampedAnomalyPersistence().fit(a0, a1_neg).phi, 0.0)
    assert np.allclose(DampedAnomalyPersistence().fit(np.zeros_like(a0), a1_hi).phi, 0.0)


def test_forecast_follows_the_dap_formula():
    clim = Climatology(clim_table())
    phi = np.full((C, H, W), 0.5, "f4")
    model = DampedAnomalyPersistence(phi)
    n0, steps = 100, 4
    x0 = clim.at_day(n0) + 2.0
    out = model.forecast(x0, n0, steps, clim)
    assert out.shape == (steps, C, H, W) and out.dtype == np.float32
    for k in range(1, steps + 1):
        expected = clim.at_day(doy.advance(n0, k)) + (0.5 ** k) * 2.0
        assert np.allclose(out[k - 1], expected, atol=1e-5)


def test_phi_zero_gives_climatology_and_phi_max_decays_slowly():
    clim = Climatology(clim_table())
    x0 = clim.at_day(50) + 1.0
    zero = DampedAnomalyPersistence(np.zeros((C, H, W), "f4")).forecast(x0, 50, 3, clim)
    assert np.allclose(zero, clim.lead_days(50, 3))
    slow = DampedAnomalyPersistence(np.ones((C, H, W), "f4")).forecast(x0, 50, 1, clim)
    assert np.allclose(slow[0] - clim.lead_days(50, 1)[0], PHI_MAX * 1.0, atol=1e-5)


def test_forecast_requires_fit_and_matching_shape(tmp_path):
    clim = Climatology(clim_table())
    with pytest.raises(RuntimeError):
        DampedAnomalyPersistence().forecast(np.zeros((C, H, W), "f4"), 1, 1, clim)
    with pytest.raises(ValueError):
        DampedAnomalyPersistence(np.zeros((C, H, W), "f4")).forecast(np.zeros((C, H, W + 1), "f4"), 1, 1, clim)


def test_save_load_roundtrip(tmp_path):
    phi = np.random.default_rng(1).uniform(0, 0.9, (C, H, W)).astype("f4")
    DampedAnomalyPersistence(phi).save(tmp_path / "dap.npz")
    assert np.allclose(DampedAnomalyPersistence.load(tmp_path / "dap.npz").phi, phi)
    np.savez(tmp_path / "wrong.npz", other=phi)
    with pytest.raises(ValueError):
        DampedAnomalyPersistence.load(tmp_path / "wrong.npz")


def test_lead_wise_blend_recovers_weights_and_endpoints():
    rng = np.random.default_rng(2)
    n, k = 200, 3
    x0 = rng.normal(size=(n, C, H, W)).astype("f4")
    clim_l = rng.normal(size=(n, k, C, H, W)).astype("f4")
    w_true = np.array([[0.1] * C, [0.5] * C, [0.9] * C], "f4")
    truth = x0[:, None] + w_true[None, :, :, None, None] * (clim_l - x0[:, None])
    blend = LeadWiseBlend().fit(x0, clim_l, truth)
    assert np.abs(blend.w - w_true).max() < 1e-4
    # w = 0 is exactly persistence, w = 1 is exactly climatology
    clim = Climatology(clim_table())
    x_last = rng.normal(size=(C, H, W)).astype("f4")
    assert np.array_equal(LeadWiseBlend(np.zeros((2, C))).forecast(x_last, 10, 2, clim), np.repeat(x_last[None], 2, 0))
    assert np.allclose(LeadWiseBlend(np.ones((2, C))).forecast(x_last, 10, 2, clim), clim.lead_days(10, 2), atol=1e-5)
    with pytest.raises(ValueError):
        LeadWiseBlend(np.zeros((2, C))).forecast(x_last, 10, 3, clim)
