"""The three margins: days (delay tolerance), metres (mast height) and
kilometres (5 x 5 neighbourhood)."""

from __future__ import annotations

import numpy as np

from .constants import (MAST_MAX, MAST_MIN, NEIGHBOURHOOD_GRID, NEIGHBOURHOOD_SPACING, R_EARTH, R_SUN)
from .horizon import destination, terrain_horizon
from .metrics import longest_run
from .visibility import angular_radius, disc_fraction


def _window_metrics(f_sun, e_vis, dt_h):
    sun_up = f_sun > 0
    return {
        "sun_time_pct": float(np.mean(sun_up) * 100), "longest_night_h": longest_run(~sun_up) * dt_h,
        "earth_visible_pct": float(np.mean(e_vis) * 100), "longest_comm_gap_h": longest_run(~e_vis) * dt_h,
    }


def _viable(m, autonomy_h, max_gap_h):
    return m["longest_night_h"] <= autonomy_h and m["longest_comm_gap_h"] <= max_gap_h


def days_margin(spec, sun, earth, n_mission, autonomy_h, trace):
    """¿Cuántos días se puede atrasar el alunizaje sin que deje de ser viable?
    Corremos la ventana de la misión de a un día sobre la serie ya calculada y
    repetimos las cuentas. El margen son los días CONSECUTIVOS viables desde d = 0:
    si el día 3 falla, el margen es 2 aunque el día 10 vuelva a andar (eso va a
    "mejores alternativas")."""
    dt = spec.step_h
    per_day = int(round(24.0 / dt))
    f_all, e_all = sun["fraction"], earth["visible"]
    rows = []
    for d in range(spec.max_delay_days + 1):
        i0 = d * per_day
        if i0 + n_mission > f_all.size:
            break
        m = _window_metrics(f_all[i0:i0 + n_mission], e_all[i0:i0 + n_mission], dt)
        m["delay_days"] = d
        m["viable"] = _viable(m, autonomy_h, spec.max_comm_gap_h)
        m["score"] = m["sun_time_pct"] + m["earth_visible_pct"]
        rows.append(m)
    margin = 0
    for r in rows:
        if not r["viable"]:
            break
        margin += 1
    margin_days = max(margin - 1, 0) if rows and rows[0]["viable"] else 0   # consecutive extra days beyond d = 0
    alts = sorted([r for r in rows if r["viable"] and r["delay_days"] > 0], key=lambda r: -r["score"])[:3]
    out = {"margin_days": margin_days, "viable_now": bool(rows and rows[0]["viable"]), "scan": rows,
           "best_alternatives": alts, "max_delay_scanned": rows[-1]["delay_days"] if rows else 0}
    if trace is not None:
        s = trace.add(
            "margin_days", "Margin in days (delay tolerance)",
            r"M_d = \max\{d : \forall d' \le d,\ T_{night}(d') \le T_{aut} \wedge T_{gap}(d') \le T_{gap,max}\}",
            [{"name": "T_aut", "value": autonomy_h, "unit": "h", "source": "scenario"},
             {"name": "T_gap,max", "value": spec.max_comm_gap_h, "unit": "h", "source": "scenario"},
             {"name": "delays scanned", "value": len(rows), "unit": "d", "source": "engine"},
             {"name": "viable per delay", "value": np.array([r["viable"] for r in rows], dtype=float), "unit": "", "source": "scan"}],
            {"value": margin_days, "unit": "d"}, depends_on=[sun["step_id"], earth["step_id"]],
            assumptions=["Delay scanned in whole days; the mission window keeps its duration"],
            uncertainty="+/- 1 day (daily scan step)",
        )
        out["step_id"] = s.id
    return out


def metres_margin(spec, site, eph, horizon, sun, n_mission, trace):
    hs = np.arange(MAST_MIN.value, MAST_MAX.value + 0.5, 1.0)
    rows = []
    base = None
    for h in hs:
        if horizon.source == "flat":
            f = sun["fraction"][:n_mission]
        else:
            hz = terrain_horizon(site.lat, site.lon, float(h), site.elevation_m, spec.dem_file)
            rho = angular_radius(R_SUN.value, eph.sun_range[:n_mission])
            f = disc_fraction(eph.sun_az[:n_mission], eph.sun_el[:n_mission], rho, hz)
        pct = float(np.mean(f > 0) * 100)
        night = longest_run(~(f > 0)) * spec.step_h
        if base is None:
            base = pct
        rows.append({"mast_m": float(h), "sun_time_pct": pct, "longest_night_h": night, "gain_pct_points": pct - base})
    out = {"scan": rows, "applies": horizon.source != "flat",
           "note": None if horizon.source != "flat" else "Flat horizon: mast height cannot change the result. Needs a DEM."}
    if trace is not None:
        s = trace.add(
            "margin_metres", "Margin in metres (mast height)",
            r"\%_{sun}(h) \text{ with } r_o = R + z_s + h \text{ in the horizon formula}",
            [{"name": "h", "value": hs, "unit": "m", "source": f"{MAST_MIN.source}"}],
            {"value": np.array([r["sun_time_pct"] for r in rows]), "unit": "%"},
            depends_on=[horizon.step_id, sun["step_id"]] if horizon.step_id else [sun["step_id"]],
            assumptions=[out["note"]] if out["note"] else ["Horizon recomputed per mast height; ephemeris unchanged (sub-millidegree effect)"],
        )
        out["step_id"] = s.id
    return out


def km_margin(spec, site, eph, horizon, sun, earth, n_mission, autonomy_h, trace):
    """Grilla de 5 x 5 puntos cada 2 km. En cada punto recalculamos el horizonte
    (es lo único que cambia de verdad al moverse unos km) y reusamos la efeméride
    del centro: la Tierra está a ~380.000 km, así que correrse 5,7 km mueve su
    dirección menos de 0,001°. El número exacto queda en la traza."""
    n = int(NEIGHBOURHOOD_GRID.value)
    sp = NEIGHBOURHOOD_SPACING.value
    k = np.arange(n) - n // 2
    cells = []
    # Parallax bound for reusing the centre ephemeris at the farthest grid point
    off_max = sp * (n // 2) * np.sqrt(2)
    parallax_earth = np.degrees(off_max / float(np.min(eph.earth_range)))
    parallax_sun = np.degrees(off_max / float(np.min(eph.sun_range)))
    for i in k:            # north offset
        for j in k:        # east offset
            dn, de = i * sp, j * sp
            dist = float(np.hypot(dn, de))
            az = float(np.degrees(np.arctan2(de, dn)) % 360) if dist > 0 else 0.0
            lat2, lon2 = destination(site.lat, site.lon, np.array([az]), np.array([dist]))
            lat2, lon2 = float(lat2[0, 0]), float(lon2[0, 0])
            if horizon.source == "flat" or dist == 0:
                f_s, v_e = sun["fraction"][:n_mission], earth["visible"][:n_mission]
            else:
                hz = terrain_horizon(lat2, lon2, spec.mast_m, None, spec.dem_file)
                f_s = disc_fraction(eph.sun_az[:n_mission], eph.sun_el[:n_mission],
                                    angular_radius(R_SUN.value, eph.sun_range[:n_mission]), hz)
                f_e = disc_fraction(eph.earth_az[:n_mission], eph.earth_el[:n_mission],
                                    angular_radius(R_EARTH.value, eph.earth_range[:n_mission]), hz)
                v_e = f_e > 0
            m = _window_metrics(f_s, v_e, spec.step_h)
            m.update({"north_m": float(dn), "east_m": float(de), "lat": lat2, "lon": lon2,
                      "viable": _viable(m, autonomy_h, spec.max_comm_gap_h)})
            cells.append(m)
    out = {"grid": n, "spacing_m": sp, "cells": cells, "applies": horizon.source != "flat",
           "parallax_bound_deg": {"earth": float(parallax_earth), "sun": float(parallax_sun)},
           "note": None if horizon.source != "flat" else "Flat horizon: every grid point is identical. Needs a DEM."}
    if trace is not None:
        s = trace.add(
            "margin_km", "Margin in kilometres (5 x 5 neighbourhood)",
            r"\text{viable}(\Delta n, \Delta e) \text{ with the horizon recomputed at each point}",
            [{"name": "grid", "value": f"{n} x {n}", "unit": "", "source": NEIGHBOURHOOD_GRID.source},
             {"name": "spacing", "value": sp, "unit": "m", "source": NEIGHBOURHOOD_SPACING.source},
             {"name": "max parallax (Earth)", "value": float(parallax_earth), "unit": "deg", "source": "offset / range"},
             {"name": "max parallax (Sun)", "value": float(parallax_sun), "unit": "deg", "source": "offset / range"}],
            {"value": np.array([c["viable"] for c in cells], dtype=float).reshape(n, n), "unit": ""},
            depends_on=[horizon.step_id, sun["step_id"], earth["step_id"]] if horizon.step_id else [sun["step_id"]],
            assumptions=[out["note"]] if out["note"] else
            [f"Centre-site ephemeris reused for all grid points (parallax <= {parallax_earth:.1e} deg for the Earth)"],
        )
        out["step_id"] = s.id
    return out


def all_margins(spec, site, eph, horizon, sun, earth, n_mission, autonomy_h, trace):
    return {
        "days": days_margin(spec, sun, earth, n_mission, autonomy_h, trace),
        "metres": metres_margin(spec, site, eph, horizon, sun, n_mission, trace),
        "km": km_margin(spec, site, eph, horizon, sun, earth, n_mission, autonomy_h, trace),
    }
