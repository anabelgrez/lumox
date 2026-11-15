import numpy as np
import pint
import pytest

from lumox import formulas
from lumox.constants import AU, SOLAR_CONSTANT
from lumox.energy import Panel, Power, energy_balance, irradiance, panel_power
from lumox.metrics import compute_metrics, longest_run, verdict
from lumox.trace import Trace
from lumox.units import Q, check


def test_units_dimensionality():
    assert check(Q(1361, "W/m^2"), "W/m^2").magnitude == 1361
    with pytest.raises(pint.DimensionalityError):
        check(Q(1, "m"), "s")
    assert check(Q(1, "AU"), "m").magnitude == pytest.approx(AU.value)


def test_irradiance_at_1au():
    S, _ = irradiance(np.array([AU.value]))
    assert S[0] == pytest.approx(SOLAR_CONSTANT.value)


def test_panel_power_tracking_and_fixed():
    S = np.array([1000.0]); f = np.array([1.0])
    P, cos_i, _ = panel_power(S, np.array([0.0]), np.array([10.0]), f, Panel(1.0, 0.5, True))
    assert P[0] == pytest.approx(500.0)
    # vertical panel facing north, Sun due north at 0 deg elevation -> cos i = 1
    P2, c2, _ = panel_power(S, np.array([0.0]), np.array([0.0]), f, Panel(1.0, 0.5, False, 90.0, 0.0))
    assert c2[0] == pytest.approx(1.0) and P2[0] == pytest.approx(500.0)
    # Sun behind the panel -> 0
    P3, c3, _ = panel_power(S, np.array([180.0]), np.array([0.0]), f, Panel(1.0, 0.5, False, 90.0, 0.0))
    assert c3[0] == 0.0 and P3[0] == 0.0


def test_energy_balance_night_depletes():
    P = np.array([0.0] * 50)
    out = energy_balance(P, Power(load_w=100.0, battery_wh=1000.0), 1.0)
    assert out["min_soc_frac"] == 0.0
    assert out["hours_in_deficit"] == pytest.approx(40.0)   # 1000 Wh / 100 W = 10 h, then 40 h in deficit


def test_longest_run_and_metrics():
    assert longest_run(np.array([1, 1, 0, 1, 1, 1, 0], dtype=bool)) == 3
    t = np.arange(6).astype("datetime64[s]")
    f = np.array([1, 1, 0, 0, 0, 1.0]); e = np.array([1, 0, 0, 1, 1, 1], dtype=bool)
    m = compute_metrics(t, f, np.zeros(6), e, 1.0)
    assert m["longest_night_h"] == 3 and m["longest_comm_gap_h"] == 2
    assert m["hours_to_sunset"] == 2 and m["hours_to_earthset"] == 1


def test_verdict_states():
    assert verdict(10, 40, 10, 48)["state"] == "survives"
    assert verdict(37, 40, 10, 48)["state"] == "marginal"
    assert verdict(41, 40, 10, 48)["state"] == "fails"
    assert verdict(10, 40, 49, 48)["state"] == "fails"


def test_calculator_matches_engine():
    r = formulas.calc("irradiance", {"range_m": AU.value})
    assert r["result"]["value"] == pytest.approx(SOLAR_CONSTANT.value)
    r = formulas.calc("disc_segment", {"el_deg": 0.0, "theta_deg": 0.0, "rho_deg": 0.27})
    assert r["result"]["value"] == pytest.approx(0.5)
    with pytest.raises(KeyError):
        formulas.calc("nope", {})


def test_trace_streams_steps():
    tr = Trace("t"); got = []
    tr.subscribe(got.append)
    tr.add("a", "A", "x=1", [], {"value": 1, "unit": ""})
    tr.add("a", "A again", "x=2", [], {"value": 2, "unit": ""})
    assert [g["step"]["id"] for g in got] == ["a", "a#2"]
    assert "x=1" in tr.to_csv()
