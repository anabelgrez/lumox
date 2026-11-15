"""Mission metrics from hourly visibility series, and the survival verdict."""

from __future__ import annotations

import numpy as np


def longest_run(mask: np.ndarray) -> int:
    """Longest run of True in a boolean array (in samples)."""
    best = cur = 0
    for m in mask:
        cur = cur + 1 if m else 0
        best = max(best, cur)
    return int(best)


def next_transition_h(mask: np.ndarray, dt_h: float, start_idx: int = 0, to_state: bool = False) -> float | None:
    """Hours from start_idx to the first index where mask becomes `to_state`; None if never."""
    for k in range(start_idx, mask.size):
        if bool(mask[k]) == to_state:
            if k == start_idx:
                return 0.0
            return (k - start_idx) * dt_h
    return None


def compute_metrics(times: np.ndarray, f_sun: np.ndarray, sun_el: np.ndarray, earth_visible: np.ndarray,
                    dt_h: float, trace=None, depends=()) -> dict:
    sun_up = f_sun > 0.0
    full_sun = f_sun >= 0.999
    night_h = longest_run(~sun_up) * dt_h
    gap_h = longest_run(~earth_visible) * dt_h
    m = {
        "sun_time_pct": float(np.mean(sun_up) * 100.0),
        "full_sun_time_pct": float(np.mean(full_sun) * 100.0),
        "mean_sun_fraction": float(np.mean(f_sun)),
        "longest_night_h": float(night_h),
        "earth_visible_pct": float(np.mean(earth_visible) * 100.0),
        "longest_comm_gap_h": float(gap_h),
        "sun_elevation_now_deg": float(sun_el[0]),
        "sun_fraction_now": float(f_sun[0]),
        "hours_to_sunset": next_transition_h(sun_up, dt_h, 0, False) if sun_up[0] else 0.0,
        "hours_to_sunrise": next_transition_h(sun_up, dt_h, 0, True) if not sun_up[0] else 0.0,
        "hours_to_earthset": next_transition_h(earth_visible, dt_h, 0, False) if earth_visible[0] else 0.0,
        "hours_to_earthrise": next_transition_h(earth_visible, dt_h, 0, True) if not earth_visible[0] else 0.0,
        "n_samples": int(times.size), "dt_h": dt_h,
    }
    if trace is not None:
        ins = [{"name": "f_sun", "value": f_sun, "unit": "", "source": "disc_sun"},
               {"name": "earth_visible", "value": earth_visible.astype(float), "unit": "", "source": "disc_earth"},
               {"name": "dt", "value": dt_h, "unit": "h", "source": "engine parameter"}]
        s1 = trace.add("sun_time", "Share of mission time with sunlight",
                       r"\%_{sun} = \frac{100}{N}\sum_k \mathbf{1}[f_k > 0]", ins[:1] + ins[2:],
                       {"value": m["sun_time_pct"], "unit": "%"}, depends_on=list(depends),
                       assumptions=["'Sunlight' = any part of the solar disc above the terrain horizon"])
        s2 = trace.add("longest_night", "Longest night", r"T_{night} = \Delta t \cdot \max\ \text{run}(f_k = 0)",
                       ins[:1] + ins[2:], {"value": m["longest_night_h"], "unit": "h"}, depends_on=list(depends),
                       uncertainty=f"Resolution +/- {dt_h:.1f} h (time step)")
        s3 = trace.add("earth_time", "Share of mission time with the Earth visible",
                       r"\%_{E} = \frac{100}{N}\sum_k \mathbf{1}[\text{Earth}_k\ \text{visible}]", ins[1:],
                       {"value": m["earth_visible_pct"], "unit": "%"}, depends_on=list(depends))
        s4 = trace.add("longest_gap", "Longest direct-to-Earth communication gap",
                       r"T_{gap} = \Delta t \cdot \max\ \text{run}(\neg\text{visible}_k)", ins[1:],
                       {"value": m["longest_comm_gap_h"], "unit": "h"}, depends_on=list(depends),
                       uncertainty=f"Resolution +/- {dt_h:.1f} h (time step)")
        s5 = trace.add("sunset_countdown", "Time to the next sunset / sunrise",
                       r"T = \Delta t \cdot \min\{k : f_k = 0\}",
                       [{"name": "f_sun", "value": f_sun, "unit": "", "source": "disc_sun"}],
                       {"value": {"hours_to_sunset": m["hours_to_sunset"], "hours_to_sunrise": m["hours_to_sunrise"],
                                  "hours_to_earthset": m["hours_to_earthset"], "hours_to_earthrise": m["hours_to_earthrise"]},
                        "unit": "h"}, depends_on=list(depends), uncertainty=f"+/- {dt_h:.1f} h")
        m["step_ids"] = {"sun_time": s1.id, "longest_night": s2.id, "earth_time": s3.id,
                         "longest_gap": s4.id, "countdown": s5.id}
    return m


def verdict(longest_night_h: float, autonomy_h: float, longest_gap_h: float, max_gap_h: float,
            limit_band: float = 0.10, trace=None, depends=()) -> dict:
    """Sobrevive / al límite / no sobrevive. A propósito es una comparación de
    dos números contra dos límites, no una simulación: el planificador tiene que
    poder verificarla a mano. 'Al límite' es estar a menos del 10 % del límite;
    el 10 % es una convención nuestra y está escrita en la fórmula de la traza."""
    night_ratio = longest_night_h / autonomy_h if autonomy_h > 0 else np.inf
    gap_ratio = longest_gap_h / max_gap_h if max_gap_h > 0 else np.inf
    worst = max(night_ratio, gap_ratio)
    if worst > 1.0:
        state = "fails"
    elif worst >= 1.0 - limit_band:
        state = "marginal"
    else:
        state = "survives"
    v = {"state": state, "night_ratio": float(night_ratio), "gap_ratio": float(gap_ratio),
         "night_margin_h": float(autonomy_h - longest_night_h), "gap_margin_h": float(max_gap_h - longest_gap_h)}
    if trace is not None:
        s = trace.add(
            "verdict", "Survival verdict",
            r"\text{survives} \iff T_{night} \le T_{aut} \wedge T_{gap} \le T_{gap,max};\ "
            r"\text{marginal if } \max(T_{night}/T_{aut}, T_{gap}/T_{gap,max}) \ge 1 - 0.1",
            [{"name": "T_night", "value": longest_night_h, "unit": "h", "source": "longest_night"},
             {"name": "T_aut (battery autonomy)", "value": autonomy_h, "unit": "h", "source": "scenario"},
             {"name": "T_gap", "value": longest_gap_h, "unit": "h", "source": "longest_gap"},
             {"name": "T_gap,max", "value": max_gap_h, "unit": "h", "source": "scenario"}],
            {"value": state, "unit": ""}, depends_on=list(depends),
            assumptions=["Verdict compares two numbers; it does not simulate the battery (see energy balance)"],
        )
        v["step_id"] = s.id
    return v
