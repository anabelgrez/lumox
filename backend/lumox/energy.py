"""Solar irradiance, panel power and hourly energy balance.

    S = S0 (AU / r)^2
    P = S * A * eta * cos(i) * f           (f = visible fraction of the solar disc)
    cos(i) = max(0, n_panel . s_sun)       (i = 0 for a Sun-tracking panel)
    E_k+1 = clip(E_k + (P_k - P_load) dt, 0, C)
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .constants import AU, SOLAR_CONSTANT


@dataclass
class Panel:
    area_m2: float = 10.0
    efficiency: float = 0.30
    tracking: bool = True          # if False, fixed normal given by tilt/azimuth
    tilt_deg: float = 90.0         # 0 = facing zenith, 90 = vertical
    azimuth_deg: float = 0.0       # direction the fixed panel faces


@dataclass
class Power:
    load_w: float = 500.0
    battery_wh: float = 20_000.0
    initial_soc: float = 1.0       # fraction of battery_wh at mission start


def _unit(az_deg, el_deg):
    az, el = np.radians(az_deg), np.radians(el_deg)
    return np.stack([np.cos(el) * np.sin(az), np.cos(el) * np.cos(az), np.sin(el)], axis=-1)  # E, N, U


def irradiance(sun_range_m: np.ndarray, trace=None, depends=()) -> tuple[np.ndarray, str]:
    S = SOLAR_CONSTANT.value * (AU.value / np.asarray(sun_range_m, dtype=np.float64)) ** 2
    sid = ""
    if trace is not None:
        s = trace.add(
            "irradiance", "Solar irradiance at the Moon", r"S = S_0 \left(\frac{1\,\mathrm{AU}}{r}\right)^2",
            [SOLAR_CONSTANT.as_input("S_0"), AU.as_input("AU"),
             {"name": "r", "value": np.asarray(sun_range_m), "unit": "m", "source": "ephemeris"}],
            {"value": S, "unit": "W/m^2"}, depends_on=list(depends),
            uncertainty="S_0 varies ~0.1% over the solar cycle (not modelled)",
        )
        sid = s.id
    return S, sid


def panel_power(S: np.ndarray, sun_az, sun_el, f_sun: np.ndarray, panel: Panel, trace=None,
                depends=()) -> tuple[np.ndarray, np.ndarray, str]:
    if panel.tracking:
        cos_i = np.ones_like(np.asarray(sun_el, dtype=np.float64))
        formula_i = r"i = 0\ (\text{tracking})"
    else:
        n = _unit(panel.azimuth_deg, 90.0 - panel.tilt_deg)
        s = _unit(np.asarray(sun_az), np.asarray(sun_el))
        cos_i = np.clip(s @ n, 0.0, None)
        formula_i = r"\cos i = \max(0, \hat n \cdot \hat s)"
    P = S * panel.area_m2 * panel.efficiency * cos_i * f_sun
    sid = ""
    if trace is not None:
        st = trace.add(
            "panel_power", "Panel electrical power",
            r"P = S \cdot A \cdot \eta \cdot \cos i \cdot f,\quad " + formula_i,
            [{"name": "S", "value": S, "unit": "W/m^2", "source": "irradiance"},
             {"name": "A", "value": panel.area_m2, "unit": "m^2", "source": "scenario"},
             {"name": "eta", "value": panel.efficiency, "unit": "", "source": "scenario"},
             {"name": "cos i", "value": cos_i, "unit": "", "source": "panel geometry"},
             {"name": "f (visible disc)", "value": np.asarray(f_sun), "unit": "", "source": "disc_sun"}],
            {"value": P, "unit": "W"}, depends_on=list(depends),
            assumptions=["Panel efficiency constant (temperature and degradation ignored)",
                         "Irradiance taken over the visible fraction of the disc with no limb darkening"],
        )
        sid = st.id
    return P, cos_i, sid


def energy_balance(P: np.ndarray, power: Power, dt_h: float, trace=None, depends=()) -> dict:
    n = P.size
    soc = np.empty(n)
    e = power.battery_wh * power.initial_soc
    deficit_h = 0.0
    for k in range(n):
        soc[k] = e
        if e + P[k] * dt_h < power.load_w * dt_h:      # load cannot be fully served this step
            deficit_h += dt_h
        e = min(max(e + (P[k] - power.load_w) * dt_h, 0.0), power.battery_wh)
    out = {"soc_wh": soc, "soc_frac": soc / power.battery_wh, "min_soc_frac": float(soc.min() / power.battery_wh),
           "hours_in_deficit": deficit_h, "generated_wh": float(np.sum(P) * dt_h),
           "consumed_wh": float(power.load_w * dt_h * n)}
    if trace is not None:
        s = trace.add(
            "energy_balance", "Hourly energy balance and state of charge",
            r"E_{k+1} = \min\big(\max(E_k + (P_k - P_{load})\,\Delta t,\ 0),\ C\big)",
            [{"name": "P", "value": P, "unit": "W", "source": "panel_power"},
             {"name": "P_load", "value": power.load_w, "unit": "W", "source": "scenario"},
             {"name": "C", "value": power.battery_wh, "unit": "Wh", "source": "scenario"},
             {"name": "E_0", "value": power.battery_wh * power.initial_soc, "unit": "Wh", "source": "scenario"},
             {"name": "dt", "value": dt_h, "unit": "h", "source": "engine parameter"}],
            {"value": {"soc_wh": soc, "min_soc_frac": out["min_soc_frac"], "hours_in_deficit": deficit_h}, "unit": "Wh"},
            assumptions=["Constant load; charge/discharge efficiency 100%; no thermal model"],
            depends_on=list(depends),
        )
        out["step_id"] = s.id
    return out
