"""Formula catalogue for the mission calculator (/api/formulas, /api/calc/{id}).

Every entry calls the SAME engine function used by the scenario, with the
user's own inputs, and returns result + trace. Inputs are checked with pint.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from .constants import AU, R_EARTH, R_MOON, R_SUN, SOLAR_CONSTANT
from .horizon import Horizon, elevation_angle
from .trace import Trace
from .units import Q, mag
from .visibility import angular_radius, segment_fraction, disc_fraction
from .energy import irradiance


@dataclass
class Var:
    name: str
    unit: str
    description: str
    default: float | None = None


@dataclass
class Formula:
    id: str
    name: str
    latex: str
    description: str
    inputs: list[Var]
    output: Var
    fn: Callable[..., tuple[float | np.ndarray, list[str]]]
    source: str = ""

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "latex": self.latex, "description": self.description,
                "inputs": [i.__dict__ for i in self.inputs], "output": self.output.__dict__, "source": self.source}


def _f_horizon(h_m, d_m, z_t_m=0.0, z_s_m=0.0):
    th = float(elevation_angle(np.array([z_t_m]), np.array([d_m]), z_s_m + h_m)[0])
    return th, ["Exact on the sphere; no refraction"]


def _f_rho(radius_m, range_m):
    return float(angular_radius(radius_m, range_m)), []


def _f_segment(el_deg, theta_deg, rho_deg):
    return float(segment_fraction(el_deg, theta_deg, rho_deg)), ["Straight horizon across the disc"]


def _f_irradiance(range_m):
    return float(SOLAR_CONSTANT.value * (AU.value / range_m) ** 2), []


def _f_power(S_wm2, area_m2, eta, cos_i, f):
    return float(S_wm2 * area_m2 * eta * cos_i * f), ["Constant efficiency; uniform disc"]


def _f_autonomy(battery_wh, load_w):
    return float(battery_wh / load_w), ["100% discharge efficiency"]


def _f_verdict_ratio(longest_night_h, autonomy_h):
    return float(longest_night_h / autonomy_h), ["> 1 fails; >= 0.9 marginal"]


def _f_curvature_drop(d_m):
    R = R_MOON.value
    return float(R - np.sqrt(max(R * R - d_m * d_m, 0.0))), ["Drop of the spherical surface below the tangent plane"]


def _f_parallax(offset_m, range_m):
    return float(np.degrees(offset_m / range_m)), ["Small-angle bound"]


CATALOG: list[Formula] = [
    Formula("horizon_angle", "Terrain elevation angle",
            r"\theta = \operatorname{atan2}\big((R+z_t)\cos\psi - (R+z_s+h),\ (R+z_t)\sin\psi\big),\ \psi = d/R",
            "Angle of a terrain point above the observer's horizontal plane, exact on the lunar sphere.",
            [Var("h_m", "m", "mast height", 2.0), Var("d_m", "m", "distance to the terrain point", 5000.0),
             Var("z_t_m", "m", "terrain height", 150.0), Var("z_s_m", "m", "site height", 0.0)],
            Var("theta", "deg", "elevation angle"), _f_horizon, R_MOON.source),
    Formula("angular_radius", "Angular radius of a body", r"\rho = \arcsin(R_b / \Delta)",
            "Half the apparent diameter of the Sun or the Earth from the site.",
            [Var("radius_m", "m", "body radius", R_SUN.value), Var("range_m", "m", "distance to the body", AU.value)],
            Var("rho", "deg", "angular radius"), _f_rho, R_SUN.source),
    Formula("disc_segment", "Visible disc fraction (segment)",
            r"x = \frac{h-\theta}{\rho},\ f = \frac{\arccos(-x) + x\sqrt{1-x^2}}{\pi}",
            "Fraction of a disc above a straight horizon.",
            [Var("el_deg", "deg", "body elevation", 0.1), Var("theta_deg", "deg", "horizon elevation", 0.0),
             Var("rho_deg", "deg", "angular radius", 0.267)],
            Var("f", "", "visible fraction"), _f_segment),
    Formula("irradiance", "Solar irradiance", r"S = S_0 (\mathrm{AU}/r)^2", "Total solar irradiance at distance r.",
            [Var("range_m", "m", "distance to the Sun", AU.value)], Var("S", "W/m^2", "irradiance"),
            _f_irradiance, SOLAR_CONSTANT.source),
    Formula("panel_power", "Panel power", r"P = S A \eta \cos i\, f", "Electrical power of a solar panel.",
            [Var("S_wm2", "W/m^2", "irradiance", 1361.0), Var("area_m2", "m^2", "panel area", 10.0),
             Var("eta", "", "efficiency", 0.3), Var("cos_i", "", "cosine of incidence angle", 1.0),
             Var("f", "", "visible disc fraction", 1.0)],
            Var("P", "W", "power"), _f_power),
    Formula("autonomy", "Battery autonomy", r"T_{aut} = C / P_{load}", "Hours the battery sustains the load.",
            [Var("battery_wh", "Wh", "battery capacity", 20000.0), Var("load_w", "W", "load", 500.0)],
            Var("T_aut", "h", "autonomy"), _f_autonomy),
    Formula("night_ratio", "Night / autonomy ratio", r"r = T_{night} / T_{aut}", "Survival ratio used by the verdict.",
            [Var("longest_night_h", "h", "longest night", 30.0), Var("autonomy_h", "h", "battery autonomy", 40.0)],
            Var("r", "", "ratio"), _f_verdict_ratio),
    Formula("curvature_drop", "Curvature drop", r"\delta = R - \sqrt{R^2 - d^2}",
            "How far the lunar surface falls below the tangent plane at distance d.",
            [Var("d_m", "m", "distance", 10000.0)], Var("delta", "m", "drop"), _f_curvature_drop, R_MOON.source),
    Formula("parallax_bound", "Parallax bound", r"\delta A \le s / \Delta",
            "Maximum direction change from moving s metres (used to justify reusing the ephemeris).",
            [Var("offset_m", "m", "ground offset", 5657.0), Var("range_m", "m", "distance to the body", 384400000.0)],
            Var("dA", "deg", "angle"), _f_parallax),
]

BY_ID = {f.id: f for f in CATALOG}


def calc(formula_id: str, inputs: dict, trace: Trace | None = None) -> dict:
    f = BY_ID.get(formula_id)
    if f is None:
        raise KeyError(f"unknown formula '{formula_id}'")
    args = []
    used = []
    for v in f.inputs:
        if v.name in inputs:
            raw = inputs[v.name]
            val = float(mag(Q(float(raw), v.unit), v.unit)) if v.unit else float(raw)
            src = "user"
        elif v.default is not None:
            val, src = v.default, "default"
        else:
            raise ValueError(f"missing input '{v.name}'")
        args.append(val)
        used.append({"name": v.name, "value": val, "unit": v.unit, "source": src})
    value, assumptions = f.fn(*args)
    trace = trace or Trace(f"calc:{f.id}")
    step = trace.add(f"calc_{f.id}", f.name, f.latex, used, {"value": value, "unit": f.output.unit},
                     assumptions=assumptions, description=f.description)
    return {"formula": f.to_dict(), "inputs": used, "result": {"value": value, "unit": f.output.unit},
            "trace_id": trace.id, "step": step.to_dict(full=True)}
