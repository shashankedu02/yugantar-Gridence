"""PROPOSAL for W2 (tests/ owner): LocalNet network, input pipeline, data preparation and model selection.
Structural and wiring checks on synthetic data; none of them says anything about forecast skill."""
import numpy as np
import pytest

torch = pytest.importorskip("torch")
from torch import nn  # noqa: E402

from localnet_helpers import (clim_table, days_array, norm, select, sha, static, tiny_model, write_dap,  # noqa: E402
                              write_localnet)
from training.data import DatasetError  # noqa: E402
from training.localnet_data import FIT_YEARS, TUNE_YEARS, compute_norm, make_batch, sample_starts, year_mask  # noqa: E402
from twin import Engine, MissingWeightsError, inputs  # noqa: E402
from twin.guards import LOWER, UPPER, clamp_state  # noqa: E402
from twin.net import LocalNet, load_checkpoint, save_checkpoint, to_model_space, to_physical  # noqa: E402

PAIR = (float(np.sin(2 * np.pi * 180 / 365)), float(np.cos(2 * np.pi * 180 / 365)))


# ---- network ----------------------------------------------------------------------------------------------
def test_c64_has_the_agreed_size_and_shapes():
    model = LocalNet().configure(norm(), static())
    assert sum(p.numel() for p in model.parameters()) == 313_735
    assert model.stem.in_channels == 30 and model.stem.kernel_size == (3, 3) and len(model.body) == 4
    assert all(m.padding_mode == "replicate" and m.stride == (1, 1) for m in model.modules()
               if isinstance(m, nn.Conv2d) and m.kernel_size == (3, 3))
    out = model(torch.randn(2, 30, 32, 36))
    assert out.shape == (2, 7, 32, 36) and torch.isfinite(out).all()


def test_no_layer_mixes_the_whole_grid():
    banned = ("BatchNorm", "GroupNorm", "InstanceNorm", "Dropout", "Pool", "Attention", "Upsample", "ConvTranspose")
    names = [type(m).__name__ for m in LocalNet().modules()]
    assert not [n for n in names if any(b in n for b in banned)], names


def test_pixel_norm_statistics_never_cross_cells():
    norm_layer = LocalNet().body[0].norm
    x = torch.randn(1, 64, 32, 36); y = x.clone(); y[0, :, 5, 7] += 10
    diff = (norm_layer(y) - norm_layer(x)).abs().sum(dim=1)[0]
    assert diff[5, 7] > 0
    diff[5, 7] = 0
    assert diff.max() == 0


def test_one_step_reach_is_at_most_nine_cells():
    torch.manual_seed(0)
    model = LocalNet().eval()
    x = torch.randn(1, 30, 32, 36); y = x.clone(); y[0, :, 16, 18] += 5.0
    with torch.inference_mode():
        diff = (model(y) - model(x)).abs().sum(dim=1)[0]
    rows, cols = np.indices((32, 36))
    chebyshev = torch.from_numpy(np.maximum(np.abs(rows - 16), np.abs(cols - 18)))
    assert diff[chebyshev > 9].max() == 0 and diff[(chebyshev > 1) & (chebyshev <= 9)].max() > 0


# ---- shared input pipeline --------------------------------------------------------------------------------
def test_input_has_thirty_channels_in_the_documented_order():
    model = LocalNet(8).configure(norm(), static())
    history_z = to_model_space(torch.from_numpy(days_array(3)))[None]
    clim_z = to_model_space(torch.from_numpy(days_array(1, 9)))
    x = model.build_input(history_z, clim_z, torch.tensor([[0.25, -0.5]]))
    assert x.shape == (1, 30, 32, 36) and torch.isfinite(x).all()
    for day in range(3):
        assert torch.equal(x[0, 6 * day: 6 * day + 6], model.normalise(history_z[:, day])[0])
    assert torch.equal(x[0, 18:24], model.normalise(clim_z)[0])
    feats = torch.from_numpy(inputs.static_features(static(), 1000.0))
    assert torch.equal(x[0, 24:26], feats[:2]) and torch.equal(x[0, 28:30], feats[2:])
    assert (x[0, 26] == 0.25).all() and (x[0, 27] == -0.5).all()


def test_static_features():
    f = inputs.static_features(static(), 1000.0)
    assert f.shape == (4, 32, 36) and np.array_equal(f[0], static()[0]) and np.allclose(f[1], static()[1] / 1000.0)
    assert np.isclose(f[2, 0, 0], (6.5 - 22) / 9) and np.isclose(f[2, 31, 0], (37.5 - 22) / 9)
    assert f[3, 0].max() == 0 and np.isclose(f[3, 1, 10], 0.2) and f[3, 16, 18] == 1.0
    with pytest.raises(ValueError):
        inputs.static_features(static()[:, :31], 1000.0)


def test_model_space_round_trip():
    x = torch.from_numpy(days_array(2))
    back = to_physical(to_model_space(x))
    assert torch.allclose(back, x, rtol=1e-5, atol=1e-4) and (back[:, 1] >= 0).all()


# ---- rain and limits ---------------------------------------------------------------------------------------
def test_rain_floor_holds_forward_but_keeps_the_gradient_for_a_dry_miss():
    model = LocalNet(8).configure(norm(), static())
    with torch.no_grad():
        model.head.weight.zero_(); model.head.bias.zero_(); model.head.bias[1] = -100.0   # predicts far below zero
    history = torch.from_numpy(days_array(3))[None]
    states, _ = model.rollout(history, np.array([200]), 2, torch.from_numpy(clim_table()))
    assert (states[:, :, 1] == 0).all()                                  # never negative, in training too
    wet_target = torch.full_like(states[:, :, 1], 2.0)
    ((states[:, :, 1] - wet_target) ** 2).mean().backward()
    assert model.head.bias.grad[1] < 0                                   # still pushed towards more rain


def test_rollout_stays_inside_physical_limits_and_finite():
    torch.manual_seed(1)
    model = LocalNet(8).configure(norm(), static()).eval()
    with torch.no_grad():
        model.head.weight *= 50                                          # deliberately wild
        states, logits = model.rollout(torch.from_numpy(days_array(3))[None], np.array([364]), 10, torch.from_numpy(clim_table()))
    assert torch.isfinite(states).all() and logits.shape == (1, 10, 32, 36)
    # the STATE itself must be inside the limits, before any output clamp
    assert (states >= model.lower).all() and (states <= model.upper).all() and (states[:, :, 1] >= 0).all()
    out = to_physical(states[0]).numpy()
    assert np.allclose(out, clamp_state(out), rtol=1e-5, atol=1e-4)


# ---- F1: the limit must hold for ANY finite raw value --------------------------------------------------------
EXTREMES = [-3e38, -1e30, -1e12, -1e9, -1e5, -400.0, -1.0, 0.0, 1.0, 400.0, 1e5, 2e5, 1e9, 1e12, 1e30, 3e38]


@pytest.mark.parametrize("value", EXTREMES)
def test_limit_returns_exactly_the_clipped_value_with_unit_gradient(value):
    model = LocalNet(4).configure(norm(), static())
    raw = torch.full((1, 6, 32, 36), value, dtype=torch.float32, requires_grad=True)
    out = model.limit(raw)
    expected = torch.minimum(torch.maximum(raw.detach(), model.lower), model.upper)
    assert torch.equal(out.detach(), expected)
    assert (out >= model.lower).all() and (out <= model.upper).all()
    out.sum().backward()
    assert torch.equal(raw.grad, torch.ones_like(raw))                       # straight-through, at both bounds


def test_limit_stated_physical_bounds():
    model = LocalNet(4).configure(norm(), static())
    for value, bound in ((1e12, UPPER), (-1e12, LOWER)):
        out = to_physical(model.limit(torch.full((1, 6, 32, 36), value)))[0, :, 0, 0].numpy()
        assert np.allclose(out, bound, rtol=1e-5, atol=1e-4)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_limit_does_not_hide_non_finite_values(value):
    model = LocalNet(4).configure(norm(), static())
    assert not torch.isfinite(model.limit(torch.full((1, 6, 32, 36), value))).any()


@pytest.mark.parametrize("sign", [1.0, -1.0])
def test_exploding_network_keeps_state_in_bounds_and_passes_gradient_through_the_rollout(sign):
    model = LocalNet(4).configure(norm(), static())
    with torch.no_grad():
        model.head.weight.zero_(); model.head.bias.fill_(sign * 1e12)
    states, _ = model.rollout(torch.from_numpy(days_array(3))[None], np.array([200]), 3, torch.from_numpy(clim_table()))
    bound = model.upper if sign > 0 else model.lower
    assert torch.equal(states, bound.unsqueeze(1).expand_as(states))
    target = (model.lower + model.upper).unsqueeze(1) / 2                    # wrong in the direction of the limit
    ((states - target) / model.state_std.unsqueeze(1)).pow(2).mean().backward()
    grad = model.head.bias.grad[:6]
    assert torch.isfinite(grad).all() and (grad * sign > 0).all()            # descent pulls back inside the range


# ---- data preparation --------------------------------------------------------------------------------------
def _years(first: str, last: str, h: int = 4, w: int = 5):
    t = np.arange(np.datetime64(first), np.datetime64(last) + np.timedelta64(1, "D"))
    r = np.random.default_rng(0)
    d = r.normal(0, 1, (len(t), 6, h, w)).astype(np.float32); d[:, 1] = np.abs(d[:, 1])
    return d, t, r.random((2, h, w)).astype(np.float32) * 100


def test_normalisation_only_sees_the_requested_years():
    d, t, s = _years("2005-01-01", "2017-12-31")
    base = compute_norm(d, t, s, FIT_YEARS)
    d2 = d.copy(); d2[year_mask(t, TUNE_YEARS)] += 100.0
    assert compute_norm(d2, t, s, FIT_YEARS) == base
    assert compute_norm(d2, t, s, (2005, 2017)) != compute_norm(d, t, s, (2005, 2017))
    z = d[year_mask(t, FIT_YEARS)].copy(); z[:, 1] = np.log1p(z[:, 1])
    assert np.allclose(base["state_mean"], z.mean(axis=(0, 2, 3), dtype=np.float64))
    assert np.allclose(base["tendency_std"], np.diff(z, axis=0).std(axis=(0, 2, 3), dtype=np.float64))


@pytest.mark.parametrize("years", [(2005, 2018), (2018, 2019), (2020, 2021), (2004, 2010)])
def test_validation_and_test_years_are_refused(years):
    d, t, s = _years("2004-01-01", "2021-12-31")
    with pytest.raises(DatasetError):
        compute_norm(d, t, s, years)
    with pytest.raises(DatasetError):
        sample_starts(t, years, 1)


def test_samples_stay_inside_their_years_and_targets_are_the_following_days():
    d, t, _ = _years("2005-01-01", "2021-12-31")
    for years in (FIT_YEARS, TUNE_YEARS):
        starts = sample_starts(t, years, 4)
        assert t[starts].min() >= np.datetime64(f"{years[0]}-01-01")
        assert t[starts + 6].max() <= np.datetime64(f"{years[1]}-12-31")
    history, n0, targets = make_batch(d, t, starts[:5], 4)
    for i, s in enumerate(starts[:5]):
        assert np.array_equal(history[i], d[s:s + 3]) and np.array_equal(targets[i], d[s + 3:s + 7])
    assert n0.shape == (5,)


# ---- selection, fallbacks and shock semantics ---------------------------------------------------------------
def _out(engine, state, pert=None):
    return engine.simulate(state, PAIR, 10, pert)


def test_a_checkpoint_file_alone_changes_nothing(tmp_path):
    write_dap(tmp_path); state = days_array(3)
    before = _out(Engine(tmp_path), state)
    write_localnet(tmp_path, tiny_model(), choose=False)
    engine = Engine(tmp_path)
    assert engine.mode == "dap" and engine.selection_error is None and _out(engine, state).tobytes() == before.tobytes()
    select(tmp_path, active="dap")
    assert _out(Engine(tmp_path), state).tobytes() == before.tobytes()


def test_selected_localnet_is_served(tmp_path):
    write_dap(tmp_path); write_localnet(tmp_path, tiny_model()); state = days_array(3)
    engine = Engine(tmp_path)
    assert engine.mode == "localnet" and engine.model_name == "monsoontwin-localnet-c8-unvalidated"
    assert engine.meta()["model"]["mode"] == "localnet" and engine.meta()["model"]["validated"] is False
    out = _out(engine, state)
    assert out.shape == (10, 6, 32, 36) and out.dtype == np.float32 and np.isfinite(out).all()
    assert engine.fallback_steps == 0 and engine.selection_error is None


def test_null_shock_is_bit_identical_and_calls_are_deterministic(tmp_path):
    write_dap(tmp_path); write_localnet(tmp_path, tiny_model()); state = days_array(3)
    engine = Engine(tmp_path)
    a = _out(engine, state)
    assert a.tobytes() == _out(engine, state, np.zeros((6, 32, 36), "f4")).tobytes() == _out(engine, state).tobytes()


def test_shock_is_added_to_the_last_day_only(tmp_path):
    write_dap(tmp_path); write_localnet(tmp_path, tiny_model()); state = days_array(3)
    engine = Engine(tmp_path)
    p = np.zeros((6, 32, 36), "f4"); p[0, 10:14, 10:14] = 3.0
    manual = state.copy(); manual[-1] += p
    assert _out(engine, state, p).tobytes() == _out(engine, manual).tobytes()
    assert not np.array_equal(_out(engine, state, p), _out(engine, state))
    assert np.array_equal(state, days_array(3))                       # the caller's array is not modified


@pytest.mark.parametrize("fault", ["wrong_hash", "corrupt", "missing", "wrong_climatology", "nan_weights", "path_escape"])
def test_unusable_selected_checkpoint_serves_dap_and_says_so(tmp_path, fault):
    write_dap(tmp_path); state = days_array(3)
    dap_out = _out(Engine(tmp_path), state)
    model = tiny_model()
    if fault == "nan_weights":
        with torch.no_grad():
            model.head.bias[0] = float("nan")
    write_localnet(tmp_path, model, clim_sha="0" * 64 if fault == "wrong_climatology" else None)
    path = tmp_path / "localnet.pt"
    if fault == "wrong_hash":
        select(tmp_path, active="localnet", localnet_file="localnet.pt", sha256="0" * 64)
    elif fault == "corrupt":
        path.write_bytes(b"not a checkpoint" * 100)
        select(tmp_path, active="localnet", localnet_file="localnet.pt", sha256=sha(path))
    elif fault == "missing":
        path.unlink()
    elif fault == "path_escape":
        select(tmp_path, active="localnet", localnet_file="../localnet.pt", sha256="0" * 64)
    engine = Engine(tmp_path)
    assert engine.mode == "dap" and engine.model_name == "monsoontwin-dap-unvalidated" and engine.selection_error
    assert _out(engine, state).tobytes() == dap_out.tobytes()


@pytest.mark.parametrize("text", ["not json", "[]", "{}", '{"active": "auto"}'])
def test_malformed_selection_fails_loudly(tmp_path, text):
    write_dap(tmp_path); (tmp_path / "model_select.json").write_text(text)
    with pytest.raises(MissingWeightsError):
        Engine(tmp_path)


def test_selection_without_the_dap_fallback_is_an_error(tmp_path):
    select(tmp_path, active="localnet", localnet_file="localnet.pt", sha256="0" * 64)
    with pytest.raises(MissingWeightsError):
        Engine(tmp_path)


@pytest.mark.parametrize("bad_value", [float("nan"), float("inf")])
def test_non_finite_step_is_replaced_by_one_dap_step_from_the_current_state(tmp_path, bad_value):
    write_dap(tmp_path); write_localnet(tmp_path, tiny_model()); state = days_array(3)
    engine = Engine(tmp_path)
    clean = _out(engine, state)
    original, calls = engine._net.step, []

    def broken(history_z, clim_z, sincos):
        raw, logit = original(history_z, clim_z, sincos)
        calls.append(1)
        if len(calls) == 4:
            raw = raw.clone(); raw[0, 0, 3, 3] = bad_value
        return raw, logit

    engine._net.step = broken
    out = _out(engine, state)
    assert engine.fallback_steps == 1 and np.isfinite(out).all() and np.array_equal(out[:3], clean[:3])
    from twin import doy
    expected = engine._dap.forecast(out[2], doy.advance(doy.from_sincos(*PAIR), 3), 1, engine._clim)[0]
    assert np.allclose(out[3], clamp_state(expected), rtol=1e-5, atol=1e-3)


# ---- F3: byte-order mark --------------------------------------------------------------------------------------
BOM = b"\xef\xbb\xbf"


@pytest.mark.parametrize("active", ["dap", "localnet"])
def test_selection_file_with_a_byte_order_mark_is_accepted(tmp_path, active):
    write_dap(tmp_path); write_localnet(tmp_path, tiny_model())
    path = tmp_path / "model_select.json"
    if active == "dap":
        select(tmp_path, active="dap")
    path.write_bytes(BOM + path.read_bytes())
    assert path.read_bytes().startswith(BOM)
    engine = Engine(tmp_path)
    assert engine.mode == active and engine.selection_error is None


def test_bom_prefixed_garbage_still_fails_loudly(tmp_path):
    write_dap(tmp_path); (tmp_path / "model_select.json").write_bytes(BOM + b"not json")
    with pytest.raises(MissingWeightsError):
        Engine(tmp_path)


# ---- F4: a runtime error means the WHOLE request is answered by DAP --------------------------------------------
def _failing_step(engine, at_call: int, error: BaseException, nan_at: int | None = None):
    """Make the network step raise on its `at_call`-th call (and optionally return NaN on an earlier call)."""
    original, calls = engine._net.step, []

    def step(history_z, clim_z, sincos):
        calls.append(1)
        if len(calls) == at_call:
            raise error
        raw, logit = original(history_z, clim_z, sincos)
        if len(calls) == nan_at:
            raw = raw.clone(); raw[0, 0, 0, 0] = float("nan")
        return raw, logit

    engine._net.step = step
    return calls, original


def _engines(tmp_path):
    """(LocalNet engine, plain DAP engine) over the same weights."""
    dap_dir, ln_dir = tmp_path / "dap", tmp_path / "ln"
    dap_dir.mkdir(); ln_dir.mkdir()
    write_dap(dap_dir); write_dap(ln_dir); write_localnet(ln_dir, tiny_model())
    ln, dap = Engine(ln_dir), Engine(dap_dir)
    assert ln.mode == "localnet" and dap.mode == "dap"
    assert ln.fallback_requests == 0 and ln.fallback_steps == 0 and ln.last_request is None
    return ln, dap


def _shock():
    p = np.zeros((6, 32, 36), "f4"); p[0, 10:14, 10:14] = 3.0
    return p


@pytest.mark.parametrize("at_call", [1, 4, 10])
@pytest.mark.parametrize("error", [RuntimeError("torch blew up"), MemoryError("out of memory"), ValueError("bad tensor")])
def test_runtime_error_discards_the_partial_forecast_and_serves_complete_dap(tmp_path, caplog, at_call, error):
    engine, dap = _engines(tmp_path)
    calls, _ = _failing_step(engine, at_call, error)
    state = days_array(3)
    with caplog.at_level("ERROR", logger="twin.engine"):
        out = engine.simulate(state, PAIR, 10, _shock())
    assert len(calls) == at_call                                             # it really failed part-way
    assert out.tobytes() == dap.simulate(state, PAIR, 10, _shock()).tobytes()   # ALL ten steps are DAP's, shock included
    assert engine.fallback_requests == 1 and engine.fallback_steps == 0
    reason = f"{type(error).__name__}: {error}"
    assert engine.last_fallback_reason == reason
    assert engine.last_request == {"model": "dap", "repaired_steps": 0, "fallback_reason": reason}
    assert any("WHOLE request" in r.message and r.levelname == "ERROR" for r in caplog.records)
    assert engine.selection_error is None and engine.mode == "localnet"       # a request failure, not a load failure


def test_requests_are_counted_one_by_one_and_success_is_reported_as_localnet(tmp_path):
    engine, dap = _engines(tmp_path)
    state = days_array(3)
    clean = engine.simulate(state, PAIR, 10, None)
    assert engine.last_request == {"model": "localnet", "repaired_steps": 0, "fallback_reason": None}
    original = engine._net.step
    for number in (1, 2):
        _failing_step(engine, 2, RuntimeError(f"failure {number}"))
        engine.simulate(state, PAIR, 10, None)
        assert engine.fallback_requests == number and engine.last_fallback_reason == f"RuntimeError: failure {number}"
        engine._net.step = original
    assert engine.simulate(state, PAIR, 10, None).tobytes() == clean.tobytes()
    assert engine.last_request["model"] == "localnet" and engine.fallback_requests == 2 and engine.fallback_steps == 0
    assert engine.last_fallback_reason == "RuntimeError: failure 2"          # history is kept
    assert dap.fallback_requests == 0 and dap.fallback_steps == 0 and dap.last_request is None


def test_served_by_names_the_model_that_answered_each_request(tmp_path):
    engine, dap = _engines(tmp_path)
    state = days_array(3)
    engine.simulate(state, PAIR, 10, None)
    assert engine.served_by() == (engine.model_name, "")
    original = engine._net.step
    _failing_step(engine, 2, RuntimeError("boom"))
    engine.simulate(state, PAIR, 10, None)
    assert engine.served_by() == (dap.model_name, "whole-request-fallback")   # never reported as LocalNet
    engine._net.step = original
    _failing_step(engine, 99, RuntimeError("unused"), nan_at=2)
    engine.simulate(state, PAIR, 10, None)
    assert engine.served_by() == (engine.model_name, "repaired-steps=1")
    dap.simulate(state, PAIR, 10, None)
    assert dap.served_by() == (dap.model_name, "")


def test_repairs_in_a_discarded_forecast_are_not_counted_as_served_steps(tmp_path):
    engine, dap = _engines(tmp_path)
    _failing_step(engine, 6, RuntimeError("late failure"), nan_at=2)
    state = days_array(3)
    assert engine.simulate(state, PAIR, 10, None).tobytes() == dap.simulate(state, PAIR, 10, None).tobytes()
    assert engine.fallback_requests == 1 and engine.fallback_steps == 0 and engine.last_request["repaired_steps"] == 0


@pytest.mark.parametrize("nan_at", [1, 10])
def test_step_repairs_in_a_served_forecast_are_counted(tmp_path, nan_at):
    engine, _ = _engines(tmp_path)
    _failing_step(engine, 99, RuntimeError("never reached"), nan_at=nan_at)
    engine.simulate(days_array(3), PAIR, 10, None)
    assert engine.fallback_steps == 1 and engine.fallback_requests == 0
    assert engine.last_request == {"model": "localnet", "repaired_steps": 1, "fallback_reason": None}


def test_unusable_forecast_shape_falls_back_for_the_whole_request(tmp_path):
    engine, dap = _engines(tmp_path)
    engine._run_localnet = lambda history, n0, steps, repaired: np.zeros((steps - 1, 6, 32, 36), "f4")
    state = days_array(3)
    assert engine.simulate(state, PAIR, 5, None).tobytes() == dap.simulate(state, PAIR, 5, None).tobytes()
    assert engine.fallback_requests == 1 and engine.last_request["model"] == "dap"


def test_input_errors_are_not_turned_into_fallbacks(tmp_path):
    engine, _ = _engines(tmp_path)
    state = days_array(3)
    nan_state = state.copy(); nan_state[0, 0, 0, 0] = np.nan
    for args in ((state, (3.0, 4.0), 10, None), (nan_state, PAIR, 10, None), (state, PAIR, 0, None),
                 (state, PAIR, 10, np.zeros((6, 32, 35), "f4"))):
        with pytest.raises(ValueError):
            engine.simulate(*args)
    assert engine.fallback_requests == 0 and engine.fallback_steps == 0 and engine.last_request is None


def test_keyboard_interrupt_is_not_swallowed(tmp_path):
    engine, _ = _engines(tmp_path)
    _failing_step(engine, 2, KeyboardInterrupt())
    with pytest.raises(KeyboardInterrupt):
        engine.simulate(days_array(3), PAIR, 10, None)
    assert engine.fallback_requests == 0


def test_null_shock_stays_bit_identical_when_localnet_always_fails(tmp_path):
    engine, dap = _engines(tmp_path)

    def always(*_):
        raise RuntimeError("persistent failure")

    engine._net.step = always
    state = days_array(3)
    a = engine.simulate(state, PAIR, 10, None)
    b = engine.simulate(state, PAIR, 10, np.zeros((6, 32, 36), "f4"))
    assert a.tobytes() == b.tobytes() == dap.simulate(state, PAIR, 10, None).tobytes() and engine.fallback_requests == 2


@pytest.mark.parametrize("mode", ["raises", "returns_nan"])
def test_localnet_that_fails_warm_up_is_rejected_at_start(tmp_path, monkeypatch, mode):
    write_dap(tmp_path); write_localnet(tmp_path, tiny_model())

    def bad_step(self, history_z, clim_z, sincos):
        if mode == "raises":
            raise RuntimeError("cannot run on this machine")
        return torch.full_like(history_z[:, -1], float("nan")), torch.zeros(1, 32, 36)

    monkeypatch.setattr(LocalNet, "step", bad_step)
    engine = Engine(tmp_path)
    assert engine.mode == "dap" and engine.model_name == "monsoontwin-dap-unvalidated"
    assert ("cannot run on this machine" if mode == "raises" else "non-finite") in engine.selection_error
    assert engine.fallback_requests == 0 and engine.fallback_steps == 0 and engine.last_request is None


# ---- checkpoint and scanner ----------------------------------------------------------------------------------
def test_checkpoint_round_trip_keeps_normalisation_and_static(tmp_path):
    model = tiny_model()
    save_checkpoint(tmp_path / "m.pt", model, {"train_years": [2005, 2015], "climatology_sha256": "a" * 64})
    loaded, meta = load_checkpoint(tmp_path / "m.pt")
    assert meta["train_years"] == [2005, 2015] and not loaded.training
    assert all(torch.equal(v, loaded.state_dict()[k]) for k, v in model.state_dict().items())
    with pytest.raises(ValueError):
        save_checkpoint(tmp_path / "n.pt", model, {})
