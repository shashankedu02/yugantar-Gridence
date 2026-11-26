"""PROPOSAL for W2 (tests/ owner): the calendar used by training and by serving, checked against a reference.

The REFERENCE below uses only the Python standard library. It calls nothing from twin/, training/, eval/ or the kit,
so an error shared by the training and serving code cannot also be in the expected values. What is compared with it is
what the real code actually looks up: the climatology slot and sin/cos handed to the network step at leads 1..10,
read out through a probe climatology whose pressure channel holds 90000 + slot.

Reference rules:
  * a request describes the last input day by its day of year yday (1..366, ASSUMED to be what the judge sends) as an
    angle with period 365, so day 366 is the same request as day 1;
  * the target at lead k is the day k later on a 365-day calendar;
  * that day's climatology slot is its position, in a 366-day (leap) year, of the same month and day it has in an
    ordinary 365-day year (the 29th of February slot is therefore skipped).
"""
import calendar
import math
from datetime import date, timedelta

import numpy as np
import pytest

from training.localnet_data import make_batch, request_doy_sincos
from twin import Engine

torch = pytest.importorskip("torch")
from localnet_helpers import clim_table, days_array, norm, static, tiny_model, write_dap, write_localnet  # noqa: E402

LEADS = range(1, 11)
FIRST, LAST = date(2005, 1, 1), date(2019, 12, 31)                              # train + validation years only
ALL_DAYS = [FIRST + timedelta(n) for n in range((LAST - FIRST).days + 1)]
MSL, MARK = 4, 90000.0                                                          # pressure: wide enough for any slot


# ---- independent reference ----------------------------------------------------------------------------------
def ref_pair(last: date) -> tuple[float, float]:
    angle = 2.0 * math.pi * last.timetuple().tm_yday / 365.0
    return math.sin(angle), math.cos(angle)


def ref_nominal(last: date, lead: int) -> int:
    return (last.timetuple().tm_yday - 1 + lead) % 365 + 1


def ref_slot_of_nominal(n: int) -> int:
    same_month_day = date(2001, 1, 1) + timedelta(n - 1)                        # 2001: an ordinary year
    return (date(2000, same_month_day.month, same_month_day.day) - date(2000, 1, 1)).days   # 2000: a leap year


def ref_true_slot(day: date) -> int:
    return (date(2000, day.month, day.day) - date(2000, 1, 1)).days


def ref_slots(last: date) -> list[int]:
    return [ref_slot_of_nominal(ref_nominal(last, k)) for k in LEADS]


def ref_sincos(last: date) -> np.ndarray:
    angles = [2.0 * math.pi * ref_nominal(last, k) / 365.0 for k in LEADS]
    return np.array([[math.sin(a), math.cos(a)] for a in angles])


# Worked out by hand from the calendar (slot 0 = 1 Jan, 31 = 1 Feb, 59 = 29 Feb, 60 = 1 Mar, 365 = 31 Dec).
GOLDEN_LEADS_1_2_3 = {
    "2018-01-01": [1, 2, 3],
    "2018-02-27": [58, 60, 61],          # ordinary year: 28 Feb, 1 Mar, 2 Mar (no 29 Feb)
    "2018-02-28": [60, 61, 62],
    "2018-12-31": [0, 1, 2],
    "2016-02-27": [58, 60, 61],          # leap year: serving skips the 29 Feb slot (true slots 58, 59, 60)
    "2016-02-28": [60, 61, 62],          # true 59, 60, 61
    "2016-02-29": [61, 62, 63],          # true 60, 61, 62
    "2016-07-01": [184, 185, 186],       # true 183, 184, 185
    "2016-12-30": [0, 1, 2],             # true 365, 0, 1
    "2016-12-31": [1, 2, 3],             # true 0, 1, 2
    "2017-12-31": [0, 1, 2],
}


def test_reference_equals_the_plain_calendar_in_ordinary_years():
    for d in ALL_DAYS:
        if not calendar.isleap(d.year):
            assert ref_slots(d) == [ref_true_slot(d + timedelta(k)) for k in LEADS], str(d)


def test_reference_matches_the_hand_written_table():
    for text, expected in GOLDEN_LEADS_1_2_3.items():
        assert ref_slots(date.fromisoformat(text))[:3] == expected, text


def test_requests_sent_by_training_and_eval_match_the_reference():
    from eval.data_io import doy_sincos as eval_doy_sincos
    for d in ALL_DAYS:
        day = np.datetime64(d.isoformat())
        assert np.allclose(request_doy_sincos(day), ref_pair(d), rtol=0, atol=1e-12), str(d)
        assert np.allclose(eval_doy_sincos(day), ref_pair(d), rtol=0, atol=1e-12), str(d)


# ---- probes: what the real code looks up ------------------------------------------------------------------------
def probe_table() -> np.ndarray:
    table = np.zeros((366, 6, 32, 36), np.float32)
    table[:] = np.array([290, 2, 0, 0, MARK, 30], np.float32)[None, :, None, None]
    table[:, MSL] += np.arange(366, dtype=np.float32)[:, None, None]
    return table


def probe_step(record: list):
    """Stands in for the network step: records the slot and sin/cos it was given, and repeats the last state."""
    def step(history_z, clim_z, sincos):
        record.append((torch.round(clim_z[:, MSL, 0, 0] - MARK).long().numpy().copy(), sincos.numpy().copy()))
        return history_z[:, -1].clone(), torch.zeros(history_z.shape[0], 32, 36)
    return step


def check_against_reference(days: list[date], slots: np.ndarray, sincos: np.ndarray) -> None:
    """slots [len(days), 10], sincos [len(days), 10, 2] as actually used by the code under test."""
    expected = np.array([ref_slots(d) for d in days])
    wrong = np.nonzero(slots != expected)
    assert not len(wrong[0]), f"first wrong slot: {days[wrong[0][0]]} lead {wrong[1][0] + 1}: " \
                              f"used {slots[wrong[0][0], wrong[1][0]]}, expected {expected[wrong[0][0], wrong[1][0]]}"
    assert np.allclose(sincos, np.stack([ref_sincos(d) for d in days]), rtol=0, atol=1e-6)
    for i, d in enumerate(days):                                                 # restated against the plain calendar
        if not calendar.isleap(d.year):
            assert slots[i].tolist() == [ref_true_slot(d + timedelta(k)) for k in LEADS], str(d)


def test_training_path_uses_the_reference_slots_for_every_day_2005_to_2019():
    from twin.net import LocalNet
    model = LocalNet(4).configure(norm(), static())
    record: list = []
    model.step = probe_step(record)
    table = torch.from_numpy(probe_table())
    times = np.arange(np.datetime64(FIRST.isoformat()) - np.timedelta64(2, "D"),
                      np.datetime64(LAST.isoformat()) + np.timedelta64(11, "D"))
    data = np.zeros((len(times), 6, 32, 36), np.float32)
    slots, sincos = [], []
    for begin in range(0, len(ALL_DAYS), 512):
        starts = np.arange(begin, min(begin + 512, len(ALL_DAYS)))
        history, n0, _ = make_batch(data, times, starts, 10)
        assert times[starts[0] + 2] == np.datetime64(ALL_DAYS[begin].isoformat())
        record.clear()
        model.rollout(torch.from_numpy(history), n0, 10, table)
        slots.append(np.stack([r[0] for r in record], axis=1))
        sincos.append(np.stack([r[1] for r in record], axis=1))
    check_against_reference(ALL_DAYS, np.concatenate(slots), np.concatenate(sincos))


@pytest.fixture(scope="module")
def probe_engine(tmp_path_factory):
    folder = tmp_path_factory.mktemp("probe_weights")
    write_dap(folder, probe_table())
    write_localnet(folder, tiny_model(4))
    engine = Engine(folder)
    assert engine.mode == "localnet", engine.selection_error
    return engine


def test_serving_path_uses_the_reference_slots_for_every_day_2005_to_2019(probe_engine):
    record: list = []
    probe_engine._net.step = probe_step(record)
    state = np.broadcast_to(np.array([290, 2, 0, 0, 100000, 30], np.float32)[None, :, None, None], (3, 6, 32, 36))
    slots, sincos = [], []
    for d in ALL_DAYS:
        record.clear()
        probe_engine.simulate(state, ref_pair(d), 10, None)
        assert probe_engine.last_request["model"] == "localnet", probe_engine.last_request     # not a silent DAP answer
        slots.append([r[0][0] for r in record])
        sincos.append([r[1][0] for r in record])
    assert probe_engine.fallback_requests == 0 and probe_engine.fallback_steps == 0
    check_against_reference(ALL_DAYS, np.array(slots), np.array(sincos))


# ---- end to end through the real network ------------------------------------------------------------------------
@pytest.mark.parametrize("last_day", sorted(GOLDEN_LEADS_1_2_3) + ["2015-12-31", "2017-02-28", "2018-07-15"])
def test_real_network_inputs_on_both_paths_carry_the_reference_calendar(tmp_path, last_day):
    """Reads the climatology and sin/cos CHANNELS of the 30-channel input that the network really receives."""
    d = date.fromisoformat(last_day)
    table = probe_table()
    write_dap(tmp_path, table)
    write_localnet(tmp_path, tiny_model())
    engine = Engine(tmp_path)
    assert engine.mode == "localnet", engine.selection_error
    times = np.arange(np.datetime64(last_day) - np.timedelta64(2, "D"), np.datetime64(last_day) + np.timedelta64(11, "D"))
    data = days_array(len(times), seed=3)
    history, n0, targets = make_batch(data, times, np.array([0]), 10)
    assert times[2] == np.datetime64(last_day) and np.array_equal(targets[0], data[3:13])   # ACTUAL following days

    seen: list = []
    original = engine._net.build_input

    def spy(history_z, clim_z, sincos):
        x = original(history_z, clim_z, sincos)
        seen.append(x.clone())
        return x

    engine._net.build_input = spy
    with torch.inference_mode():
        states, _ = engine._net.rollout(torch.from_numpy(history), n0, 10, torch.from_numpy(table))
    trained, seen[:] = list(seen), []
    served = engine.simulate(data[:3], ref_pair(d), 10, None)

    n = norm()
    for inputs_used in (trained, list(seen)):
        assert len(inputs_used) == 10
        channel = np.array([x[0, 18 + MSL, 0, 0].item() for x in inputs_used])       # normalised climatology pressure
        used = np.rint(channel * n["state_std"][MSL] + n["state_mean"][MSL] - MARK).astype(int)
        assert used.tolist() == ref_slots(d)
        assert np.allclose([[x[0, 26, 0, 0].item(), x[0, 27, 0, 0].item()] for x in inputs_used], ref_sincos(d), atol=1e-6)
    # and the two paths agree bit for bit
    assert all(torch.equal(a, b) for a, b in zip(seen, trained))
    from twin.guards import clamp_state
    from twin.net import to_physical
    assert np.array_equal(served, clamp_state(to_physical(states[0]).numpy()))
    assert engine.fallback_steps == 0 and engine.fallback_requests == 0


def test_probe_table_marks_every_slot_distinctly():
    assert np.array_equal(probe_table()[:, MSL, 0, 0] - MARK, np.arange(366, dtype=np.float32))
    assert not np.array_equal(clim_table()[1], clim_table()[2])
