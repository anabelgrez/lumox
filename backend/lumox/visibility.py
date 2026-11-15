"""Visible fraction of a body's disc above the terrain horizon.

Angular radius:        rho = asin(R_body / range)
Numerical integration: the disc is sampled on a polar grid in the local
tangent plane around its centre; a sample at (dA, dh) has azimuth
A + dA / cos(h) and elevation h + dh, and is "visible" when its elevation
exceeds the horizon at its azimuth. The visible fraction is the area ratio.
Analytic check (flat horizon at theta(A)): circular segment

    x = (h - theta) / rho clipped to [-1, 1]
    f = [arccos(-x) + x sqrt(1 - x^2)] / pi
"""

from __future__ import annotations

import numpy as np

from .constants import DISC_INTEGRATION_RINGS, DISC_INTEGRATION_SECTORS, R_EARTH, R_SUN
from .horizon import Horizon


def angular_radius(radius_m: float, range_m: np.ndarray | float) -> np.ndarray | float:
    return np.degrees(np.arcsin(np.clip(radius_m / np.asarray(range_m, dtype=np.float64), -1, 1)))


def segment_fraction(el_deg, theta_deg, rho_deg):
    """Analytic visible fraction of a disc against a straight horizon."""
    x = np.clip((np.asarray(el_deg) - np.asarray(theta_deg)) / np.asarray(rho_deg), -1.0, 1.0)
    return (np.arccos(-x) + x * np.sqrt(1.0 - x * x)) / np.pi


def _disc_samples(n_r: int, n_phi: int):
    """Equal-area polar sampling of the unit disc: returns (u, v, weight)."""
    # ring k covers radii [sqrt(k/n_r), sqrt((k+1)/n_r)] -> equal areas; midpoint radius
    r = np.sqrt((np.arange(n_r) + 0.5) / n_r)
    phi = (np.arange(n_phi) + 0.5) * 2 * np.pi / n_phi
    u = (r[:, None] * np.cos(phi)[None, :]).ravel()
    v = (r[:, None] * np.sin(phi)[None, :]).ravel()
    return u, v, 1.0 / (n_r * n_phi)


def disc_fraction(az_deg: np.ndarray, el_deg: np.ndarray, rho_deg: np.ndarray, horizon: Horizon,
                  n_r: int | None = None, n_phi: int | None = None) -> np.ndarray:
    """Fracción del disco que asoma sobre el horizonte, para muchas horas a la vez.

    Por qué numérico y no solo la fórmula del segmento: dentro del disco (medio
    grado) el horizonte puede tener una cresta de un lado y un valle del otro.
    Pintamos el disco con anillos y sectores de igual área (así cada puntito vale
    lo mismo) y contamos los que quedan arriba del terreno en SU azimut. La
    fórmula cerrada queda al lado como control de que no metimos la pata."""
    n_r = n_r or int(DISC_INTEGRATION_RINGS.value)
    n_phi = n_phi or int(DISC_INTEGRATION_SECTORS.value)
    u, v, w = _disc_samples(n_r, n_phi)
    az = np.asarray(az_deg, dtype=np.float64)[:, None]
    el = np.asarray(el_deg, dtype=np.float64)[:, None]
    rho = np.asarray(rho_deg, dtype=np.float64)[:, None]
    # quick exits: fully above / fully below the horizon range of the whole profile
    th_min, th_max = float(horizon.elevation.min()), float(horizon.elevation.max())
    out = np.empty(az.shape[0])
    sample_el = el + rho * v[None, :]
    cos_h = np.cos(np.radians(el))
    sample_az = az + rho * u[None, :] / np.maximum(cos_h, 1e-9)
    theta = horizon.at(sample_az.ravel()).reshape(sample_az.shape)
    out[:] = np.sum((sample_el > theta) * w, axis=1)
    # exact extremes to avoid sampling noise
    out[(el - rho).ravel() > th_max] = 1.0
    out[(el + rho).ravel() < th_min] = 0.0
    return out


def body_visibility(name: str, az, el, rng, body_radius_m: float, horizon: Horizon, trace=None,
                    depends=()) -> dict:
    rho = angular_radius(body_radius_m, rng)
    f_num = disc_fraction(az, el, rho, horizon)
    theta_c = horizon.at(az)
    f_seg = segment_fraction(el, theta_c, rho)
    diff = float(np.max(np.abs(f_num - f_seg))) if np.size(f_num) else 0.0
    res = {"fraction": f_num, "fraction_segment": f_seg, "angular_radius_deg": rho,
           "horizon_at_body_deg": theta_c, "visible": f_num > 0.0, "max_abs_diff": diff}
    if trace is not None:
        src = R_SUN.source if body_radius_m == R_SUN.value else R_EARTH.source
        s1 = trace.add(
            f"rho_{name}", f"Angular radius of the {name}", r"\rho = \arcsin(R_b / \Delta)",
            [{"name": "R_b", "value": body_radius_m, "unit": "m", "source": src},
             {"name": "range", "value": np.asarray(rng), "unit": "m", "source": "ephemeris"}],
            {"value": rho, "unit": "deg"}, depends_on=list(depends),
        )
        s2 = trace.add(
            f"disc_{name}", f"Visible fraction of the {name}'s disc (numerical)",
            r"f = \frac{1}{\pi}\iint_{\text{disc}} \mathbf{1}\big[h + \delta h > \theta(A + \delta A/\cos h)\big]\,dA",
            [{"name": "h", "value": np.asarray(el), "unit": "deg", "source": "ephemeris"},
             {"name": "A", "value": np.asarray(az), "unit": "deg", "source": "ephemeris"},
             {"name": "rho", "value": rho, "unit": "deg", "source": s1.id},
             {"name": "theta(A)", "value": theta_c, "unit": "deg", "source": horizon.step_id or "horizon"},
             {"name": "N_r x N_phi", "value": f"{int(DISC_INTEGRATION_RINGS.value)} x {int(DISC_INTEGRATION_SECTORS.value)}",
              "unit": "", "source": "engine parameter"}],
            {"value": f_num, "unit": ""},
            assumptions=["Uniform disc: limb darkening ignored", "Tangent-plane geometry over the disc (rho < 0.3 deg)",
                         "Horizon linearly interpolated between azimuth samples"],
            uncertainty=f"Equal-area sampling: fraction resolved to ~{1 / (DISC_INTEGRATION_RINGS.value * DISC_INTEGRATION_SECTORS.value):.1e}; "
                        f"max |numerical - segment formula| over the grid = {diff:.4f}",
            depends_on=[s1.id, horizon.step_id] if horizon.step_id else [s1.id],
        )
        trace.add(
            f"segment_{name}", f"Analytic check: circular segment ({name})",
            r"x = \frac{h - \theta}{\rho},\quad f = \frac{\arccos(-x) + x\sqrt{1 - x^2}}{\pi}",
            [{"name": "x", "value": np.clip((np.asarray(el) - theta_c) / rho, -1, 1), "unit": "", "source": s2.id}],
            {"value": f_seg, "unit": ""}, assumptions=["Horizon treated as straight at theta(A) across the disc"],
            depends_on=[s2.id], description="Closed-form check of the numerical integration.",
        )
        res["step_id"] = s2.id
    return res
