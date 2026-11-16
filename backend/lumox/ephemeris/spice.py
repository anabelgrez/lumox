"""SPICE provider (NAIF kernels) — used automatically when kernels are present
in data/kernels/. Required files (official NAIF, https://naif.jpl.nasa.gov/pub/naif/generic_kernels/):

  lsk/naif0012.tls                              leap seconds              (~5 kB)
  pck/pck00011.tpc                              body constants            (~130 kB)
  spk/planets/de440s.bsp                        planetary ephemeris       (~32 MB)
  pck/moon_pa_de440_200625.bpc                  lunar orientation (DE440) (~13 MB)
  fk/satellites/moon_de440_250416.tf            lunar frames (MOON_ME)    (~10 kB)

Computation: observer fixed on the Moon in the MOON_ME frame (mean Earth/polar
axis), state of Sun / Earth relative to the observer with 'LT+S' (light time +
stellar aberration), then converted to local east-north-up to get azimuth and
elevation. Libration is implicit in the MOON_ME orientation.
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np

from ..constants import R_MOON
from .base import Ephemeris, EphemerisError

ROOT = Path(os.environ.get("LUMOX_DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
KERNEL_DIR = ROOT / "kernels"
REQUIRED = ["naif0012.tls", "pck00011.tpc", "de440s.bsp", "moon_pa_de440_200625.bpc", "moon_de440_250416.tf"]
FRAME = "MOON_ME"

_loaded = False
# CSPICE no se puede usar desde dos hilos a la vez (estado global en C): con escenarios
# en paralelo (mapa de calor, perfiles) daba errores como UNPARSEDTIME o FILEREADFAILED.
import threading
_SPICE_LOCK = threading.RLock()


def kernels_status() -> dict:
    present = {k: (KERNEL_DIR / k).exists() for k in REQUIRED}
    try:
        import spiceypy  # noqa: F401
        lib = True
    except Exception:
        lib = False
    return {"available": lib and all(present.values()), "library": lib, "dir": str(KERNEL_DIR), "files": present}


def _load():
    global _loaded
    if _loaded:
        return
    import spiceypy as sp
    st = kernels_status()
    if not st["available"]:
        missing = [k for k, ok in st["files"].items() if not ok]
        raise EphemerisError(f"SPICE kernels missing in {KERNEL_DIR}: {missing}")
    for k in REQUIRED:
        sp.furnsh(str(KERNEL_DIR / k))
    _loaded = True


def _enu_matrix(lat_deg: float, lon_deg: float) -> np.ndarray:
    """Matriz que pasa de coordenadas fijas a la Luna (MOON_ME) al marco local del
    sitio: este, norte, arriba. Con eso el azimut es atan2(este, norte) y la
    elevación asin(arriba). Es trigonometría de libro; la validamos contra
    Horizons y dio 5e-7 grados."""
    la, lo = np.radians(lat_deg), np.radians(lon_deg)
    east = np.array([-np.sin(lo), np.cos(lo), 0.0])
    north = np.array([-np.sin(la) * np.cos(lo), -np.sin(la) * np.sin(lo), np.cos(la)])
    up = np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])
    return np.vstack([east, north, up])


def topocentric(lat: float, lon: float, alt_m: float, times: np.ndarray, trace=None) -> Ephemeris:
    with _SPICE_LOCK:
        return _topocentric(lat, lon, alt_m, times, trace)


def _topocentric(lat: float, lon: float, alt_m: float, times: np.ndarray, trace=None) -> Ephemeris:
    import spiceypy as sp
    _load()
    R_km = R_MOON.value / 1000.0
    obs = np.asarray(sp.georec(np.radians(lon), np.radians(lat), alt_m / 1000.0, R_km, 0.0))
    M = _enu_matrix(lat, lon)
    ets = np.array([sp.str2et(str(np.datetime64(t, "s")).replace("T", " ") + " UTC") for t in times])
    out = {}
    for body in ("SUN", "EARTH"):
        az = np.empty(ets.size); el = np.empty(ets.size); rng = np.empty(ets.size)
        for i, et in enumerate(ets):
            state, _lt = sp.spkcpo(body, et, FRAME, "OBSERVER", "LT+S", obs, "MOON", FRAME)
            v = np.asarray(state[:3])
            d = np.linalg.norm(v)
            e, n, u = M @ (v / d)
            el[i] = np.degrees(np.arcsin(np.clip(u, -1, 1)))
            az[i] = np.degrees(np.arctan2(e, n)) % 360.0
            rng[i] = d * 1000.0
        out[body] = (az, el, rng)
    eph = Ephemeris(
        times=times, sun_az=out["SUN"][0], sun_el=out["SUN"][1], sun_range=out["SUN"][2],
        earth_az=out["EARTH"][0], earth_el=out["EARTH"][1], earth_range=out["EARTH"][2],
        provider="spice", frame=f"{FRAME} (NAIF moon_de440 frame kernel, DE440 orientation)",
        corrections="LT+S (light time + stellar aberration), no refraction",
    )
    if trace is not None:
        s = trace.add(
            "ephemeris", "Sun and Earth topocentric positions (SPICE)",
            r"\vec r = \mathrm{spkcpo}(\text{body}, t, \text{MOON\_ME}, \text{LT+S}, \vec o);\ "
            r"h = \arcsin(\hat r\cdot\hat u),\ A = \operatorname{atan2}(\hat r\cdot\hat e, \hat r\cdot\hat n)",
            [
                {"name": "latitude", "value": lat, "unit": "deg", "source": "site"},
                {"name": "longitude (east)", "value": lon, "unit": "deg", "source": "site"},
                {"name": "altitude", "value": alt_m, "unit": "m", "source": "site"},
                {"name": "R (lunar radius)", "value": R_MOON.value, "unit": "m", "source": R_MOON.source},
                {"name": "kernels", "value": ", ".join(REQUIRED), "unit": "", "source": "NAIF generic kernels"},
            ],
            {"value": {"sun_az": eph.sun_az, "sun_el": eph.sun_el, "sun_range": eph.sun_range,
                       "earth_az": eph.earth_az, "earth_el": eph.earth_el, "earth_range": eph.earth_range},
             "unit": "deg, deg, m"},
            assumptions=[eph.corrections, "Observer fixed in MOON_ME; libration included in frame orientation",
                         "Spherical Moon for the observer position (flattening 0)"],
            description="Azimuth, elevation and range of the Sun and the Earth from NAIF kernels.",
        )
        eph.step_id = s.id
    return eph
