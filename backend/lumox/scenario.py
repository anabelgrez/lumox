"""Scenario orchestration: ephemeris -> horizon -> visibility -> energy ->
metrics -> verdict -> margins. One call, one trace."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime

import numpy as np

from . import margins as _margins
from .constants import R_EARTH, R_SUN, TIME_STEP_HOURS
from .energy import Panel, Power, energy_balance, irradiance, panel_power
from .ephemeris import get_ephemeris
from .horizon import terrain_horizon
from .metrics import compute_metrics, verdict as _verdict
from .sites import Site, get_site
from .timegrid import grid, iso_list, parse_utc
from .trace import Trace, STORE
from .visibility import body_visibility


@dataclass
class ScenarioSpec:
    site_id: str | None = "shackleton"
    lat: float | None = None
    lon: float | None = None
    name: str | None = None
    start: str = "2027-01-15T00:00:00Z"
    duration_days: float = 14.0
    mast_m: float = 2.0
    autonomy_h: float | None = None          # default: battery_wh / load_w
    max_comm_gap_h: float = 48.0
    panel: Panel = field(default_factory=Panel)
    power: Power = field(default_factory=Power)
    step_h: float = TIME_STEP_HOURS.value
    provider: str = "auto"
    dem_file: str | None = None
    margins: bool = True
    max_delay_days: int = 30
    label: str = ""

    def site(self) -> Site:
        if self.lat is not None and self.lon is not None:
            return Site("custom", self.name or f"Custom {self.lat:.3f}, {self.lon:.3f}", float(self.lat),
                        float(self.lon), "custom", "user input", None, False)
        return get_site(self.site_id or "shackleton")

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


def _series(eph, horizon, trace, spec: ScenarioSpec, depends):
    """Visibility series for both bodies on the ephemeris grid."""
    sun = body_visibility("sun", eph.sun_az, eph.sun_el, eph.sun_range, R_SUN.value, horizon, trace, depends)
    earth = body_visibility("earth", eph.earth_az, eph.earth_el, eph.earth_range, R_EARTH.value, horizon, trace, depends)
    return sun, earth


def run_scenario(spec: ScenarioSpec, trace: Trace | None = None, store: bool = True) -> dict:
    """La función que arma todo. El orden importa y es el mismo que ve el usuario
    en el panel de cálculos en vivo:
      efemérides -> horizonte -> fracción de disco -> energía -> métricas -> veredicto -> márgenes
    Cada etapa escribe en la MISMA traza, así cualquier número de la pantalla se
    puede seguir hasta el dato de NASA del que salió."""
    site = spec.site()
    start = parse_utc(spec.start)
    trace = trace or Trace(spec.label or f"{site.name} {spec.start}")
    autonomy = spec.autonomy_h if spec.autonomy_h is not None else spec.power.battery_wh / max(spec.power.load_w, 1e-9)

    trace.note("scenario", "Scenario", f"{site.name} | start {start.isoformat()} | {spec.duration_days} d | mast {spec.mast_m} m "
               f"| autonomy {autonomy:.1f} h | max gap {spec.max_comm_gap_h} h | step {spec.step_h} h")
    if not site.verified:
        trace.note("site_unverified", "Site coordinates not re-verified",
                   f"{site.name}: coordinates from '{site.source}' have not been re-checked against a primary source.")

    # Pedimos la efeméride una sola vez para misión + 30 días de posible atraso:
    # así el margen en días no vuelve a llamar a Horizons/SPICE por cada fecha.
    extra_days = spec.max_delay_days if spec.margins else 0
    times_ext = grid(start, (spec.duration_days + extra_days) * 24.0, spec.step_h)
    n_mission = int(round(spec.duration_days * 24.0 / spec.step_h)) + 1

    eph = get_ephemeris(site.lat, site.lon, site.elevation_m or 0.0, times_ext, trace, spec.provider)
    horizon = terrain_horizon(site.lat, site.lon, spec.mast_m, site.elevation_m, spec.dem_file, trace=trace)
    dep = [eph.step_id, horizon.step_id]

    sun, earth = _series(eph, horizon, trace, spec, dep)
    sl = slice(0, n_mission)
    f_sun, e_vis = sun["fraction"][sl], earth["visible"][sl]

    S, s_irr = irradiance(eph.sun_range[sl], trace, [eph.step_id])
    P, cos_i, s_pow = panel_power(S, eph.sun_az[sl], eph.sun_el[sl], f_sun, spec.panel, trace, [s_irr, sun["step_id"]])
    bal = energy_balance(P, spec.power, spec.step_h, trace, [s_pow])

    metrics = compute_metrics(times_ext[sl], f_sun, eph.sun_el[sl], e_vis, spec.step_h, trace,
                              [sun["step_id"], earth["step_id"]])
    ver = _verdict(metrics["longest_night_h"], autonomy, metrics["longest_comm_gap_h"], spec.max_comm_gap_h,
                   trace=trace, depends=[metrics["step_ids"]["longest_night"], metrics["step_ids"]["longest_gap"]])

    result = {
        "trace_id": trace.id,
        "site": site.to_dict(),
        "spec": spec.to_dict(),
        "autonomy_h": autonomy,
        "data": {
            "ephemeris_provider": eph.provider, "ephemeris_frame": eph.frame, "ephemeris_corrections": eph.corrections,
            "horizon_source": horizon.source, "horizon_resolution_m": horizon.resolution_m,
            "terrain_available": horizon.source != "flat", "site_elevation_m": horizon.site_elevation_m,
            "notes": eph.notes + horizon.notes,
        },
        "series": {
            "time": iso_list(times_ext[sl]),
            "sun_az": eph.sun_az[sl].tolist(), "sun_el": eph.sun_el[sl].tolist(),
            "earth_az": eph.earth_az[sl].tolist(), "earth_el": eph.earth_el[sl].tolist(),
            "sun_fraction": f_sun.tolist(), "earth_fraction": earth["fraction"][sl].tolist(),
            # altura del terreno justo debajo de cada cuerpo, para las frases "esa loma lo tapa"
            "sun_horizon_deg": np.asarray(sun["horizon_at_body_deg"])[sl].tolist(),
            "earth_horizon_deg": np.asarray(earth["horizon_at_body_deg"])[sl].tolist(),
            # a qué distancia está la loma que tapa (o casi tapa) a cada cuerpo; None si se ve entero
            "sun_block_m": _block(horizon, eph.sun_az[sl], f_sun),
            "earth_block_m": _block(horizon, eph.earth_az[sl], earth["fraction"][sl]),
            "sun_rho_deg": sun["angular_radius_deg"][sl].tolist(), "earth_rho_deg": earth["angular_radius_deg"][sl].tolist(),
            "irradiance_wm2": S.tolist(), "power_w": P.tolist(), "soc_frac": bal["soc_frac"].tolist(),
        },
        "events": _events(times_ext[sl], f_sun > 0, e_vis),
        "horizon": {"azimuth": horizon.azimuth.tolist(), "elevation": horizon.elevation.tolist(),
                    "distance_m": np.nan_to_num(horizon.distance, nan=-1).tolist()},
        "metrics": {k: v for k, v in metrics.items() if k != "step_ids"},
        "energy": {k: v for k, v in bal.items() if k not in ("soc_wh", "soc_frac", "step_id")},
        "verdict": {k: v for k, v in ver.items() if k != "step_id"},
        "steps": {"ephemeris": eph.step_id, "horizon": horizon.step_id, "disc_sun": sun["step_id"],
                  "disc_earth": earth["step_id"], "irradiance": s_irr, "panel_power": s_pow,
                  "energy_balance": bal.get("step_id"), "verdict": ver.get("step_id"), **metrics["step_ids"]},
        "limits": LIMITS,
    }
    if spec.margins:
        result["margins"] = _margins.all_margins(spec, site, eph, horizon, sun, earth, n_mission, autonomy, trace)
    if store:
        STORE.put(trace)
    return result


def _block(horizon, az, frac) -> list:
    """Distancia (m) al punto de terreno que define el horizonte en la dirección del
    cuerpo, para las horas en que no se ve entero. Es el mismo punto que usó el
    cálculo del horizonte (el máximo del rayo), tomado en el azimut más cercano."""
    if horizon.source == "flat":
        return [None] * len(frac)
    n = horizon.azimuth.size
    idx = np.rint(np.asarray(az) / 360.0 * n).astype(int) % n
    d = horizon.distance[idx]
    return [None if (f >= 0.999 or not np.isfinite(x)) else float(x) for f, x in zip(np.asarray(frac), d)]


def _events(times, sun_up, earth_up) -> list[dict]:
    """Salidas y puestas en la grilla horaria (precisión ±30 min, igual que todo lo demás).
    El front las usa para la cuenta regresiva desde cualquier hora sin calcular nada."""
    out = []
    for body, m in (("sun", sun_up), ("earth", earth_up)):
        for k in range(1, m.size):
            if bool(m[k]) != bool(m[k - 1]):
                out.append({"idx": k, "t": iso_list(times[k:k + 1])[0], "body": body, "rise": bool(m[k])})
    return sorted(out, key=lambda e: e["idx"])


LIMITS = [
    "'Viable' is geometry only: sunlight and line of sight. No thermal, antenna or detailed power model.",
    "Time step of 1 h: events are resolved to +/- 30 min.",
    "Horizon from the DEM's finite resolution; an unresolved boulder can hide the Sun.",
    "Without a DEM covering the site the horizon is flat (theta = 0) and the result is optimistic; the trace says so.",
    "Limb darkening of the Sun ignored (uniform disc).",
    "Not an official NASA tool.",
]
