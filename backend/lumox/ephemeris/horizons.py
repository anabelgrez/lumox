"""JPL Horizons API provider (https://ssd.jpl.nasa.gov/api/horizons.api).

Observer: a point on the lunar surface (CENTER='coord@301', SITE_COORD=lon,lat,alt).
QUANTITIES 4 = apparent azimuth/elevation (AIRLESS: no refraction),
QUANTITIES 20 = observer range and range-rate.
Horizons applies light-time and stellar aberration to the apparent direction
and uses the DE lunar orientation (libration included).

Responses are cached on disk under data/cache/horizons/ keyed by the query.
Horizons asks for sequential requests; a process-wide lock enforces that.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
from pathlib import Path

import httpx
import numpy as np

from ..constants import HORIZONS_EARTH_ID, HORIZONS_SUN_ID
from .base import Ephemeris, EphemerisError

ENDPOINT = "https://ssd.jpl.nasa.gov/api/horizons.api"
ROOT = Path(os.environ.get("LUMOX_DATA_DIR", Path(__file__).resolve().parents[3] / "data"))
CACHE_DIR = ROOT / "cache" / "horizons"
_LOCK = threading.Lock()
_MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}


def _fmt(t: np.datetime64) -> str:
    s = str(np.datetime64(t, "s"))         # 2026-11-15T12:00:00
    return s.replace("T", " ")[:16]


def _lon360(lon: float) -> float:
    return (lon % 360.0 + 360.0) % 360.0


def build_query(body: str, lat: float, lon: float, alt_m: float, times: np.ndarray) -> dict:
    if times.size < 2:
        raise EphemerisError("need at least two epochs")
    step_s = int((times[1] - times[0]) / np.timedelta64(1, "s"))
    if step_s % 60:
        raise EphemerisError("Horizons step must be whole minutes")
    return {
        "format": "text", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER",
        "CSV_FORMAT": "YES", "CAL_FORMAT": "CAL", "ANG_FORMAT": "DEG", "TIME_DIGITS": "MINUTES",
        "APPARENT": "AIRLESS", "RANGE_UNITS": "KM", "EXTRA_PREC": "YES",
        "COMMAND": body, "CENTER": "coord@301", "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"{_lon360(lon):.6f},{lat:.6f},{alt_m / 1000.0:.6f}",
        "QUANTITIES": "4,20",
        "START_TIME": _fmt(times[0]), "STOP_TIME": _fmt(times[-1]),
        "STEP_SIZE": f"{step_s // 60}m",
    }


def _quote(k: str, v: str) -> str:
    return v if k == "format" else f"'{v}'"


def _cache_path(q: dict) -> Path:
    key = hashlib.sha256(json.dumps(q, sort_keys=True).encode()).hexdigest()[:24]
    return CACHE_DIR / f"{key}.json"


def _parse(text: str, expected: int) -> np.ndarray:
    a, b = text.find("$$SOE"), text.find("$$EOE")
    if a < 0 or b < 0:
        tail = text.strip()[-400:]
        raise EphemerisError(f"Horizons returned no ephemeris table: ...{tail}")
    rows = []
    for line in text[a + 5:b].strip().splitlines():
        p = [s.strip() for s in line.split(",")]
        m = re.match(r"^(\d{4})-(\w{3})-(\d{2}) (\d{2}):(\d{2})", p[0])
        if not m:
            raise EphemerisError(f"unexpected date format: {p[0]}")
        t = np.datetime64(f"{m[1]}-{_MONTHS[m[2]]:02d}-{m[3]}T{m[4]}:{m[5]}:00", "s")
        vals = [float(s) for s in p[1:] if s not in ("", "*") and not re.fullmatch(r"[A-Za-z]", s)]
        if len(vals) < 4:
            raise EphemerisError(f"unexpected column count in row: {line}")
        rows.append((t.astype("int64"), vals[0], vals[1], vals[2]))   # az, el, delta[km]
    if len(rows) != expected:
        raise EphemerisError(f"Horizons returned {len(rows)} rows, expected {expected}")
    return np.array(rows, dtype=np.float64)


def fetch_table(body: str, lat: float, lon: float, alt_m: float, times: np.ndarray,
                timeout: float = 90.0) -> tuple[np.ndarray, str]:
    """Devuelve (array[n,4]: t_unix, az, el, range_km) y de dónde salió: 'cache' o 'network'.

    La caché en disco no es un lujo: Horizons pide que no le peguen en paralelo
    y tarda ~3 s por consulta. Durante la demo todo lo que mostramos ya está
    cacheado, así que si se cae internet, sigue andando igual."""
    q = build_query(body, lat, lon, alt_m, times)
    path = _cache_path(q)
    if path.exists():
        return np.array(json.loads(path.read_text())["rows"], dtype=np.float64), "cache"
    url = ENDPOINT + "?" + "&".join(f"{k}={httpx.QueryParams({'v': _quote(k, v)})['v']}" for k, v in q.items())
    with _LOCK:
        try:
            r = httpx.get(ENDPOINT, params={k: _quote(k, v) for k, v in q.items()}, timeout=timeout)
        except httpx.HTTPError as e:
            raise EphemerisError(f"Horizons request failed: {e}") from e
    if r.status_code != 200:
        raise EphemerisError(f"Horizons HTTP {r.status_code}")
    arr = _parse(r.text, times.size)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"query": q, "url": url, "rows": arr.tolist()}))
    return arr, "network"


def topocentric(lat: float, lon: float, alt_m: float, times: np.ndarray, trace=None) -> Ephemeris:
    sun, src_s = fetch_table(HORIZONS_SUN_ID, lat, lon, alt_m, times)
    earth, src_e = fetch_table(HORIZONS_EARTH_ID, lat, lon, alt_m, times)
    t_unix = times.astype("datetime64[s]").astype("int64").astype(np.float64)
    if not (np.allclose(sun[:, 0], t_unix) and np.allclose(earth[:, 0], t_unix)):
        raise EphemerisError("Horizons epochs do not match the requested grid")
    eph = Ephemeris(
        times=times, sun_az=sun[:, 1], sun_el=sun[:, 2], sun_range=sun[:, 3] * 1000.0,
        earth_az=earth[:, 1], earth_el=earth[:, 2], earth_range=earth[:, 3] * 1000.0,
        provider="horizons", frame="Horizons lunar body-fixed (DE lunar orientation)",
        corrections="apparent: light-time + stellar aberration; AIRLESS (no refraction)",
        notes=[f"sun table from {src_s}", f"earth table from {src_e}"],
    )
    if trace is not None:
        s = trace.add(
            "ephemeris", "Sun and Earth topocentric positions (JPL Horizons)",
            r"(A, h, \Delta) = \mathrm{Horizons}(\text{coord@301}, \lambda, \varphi, z;\ t)",
            [
                {"name": "latitude", "value": lat, "unit": "deg", "source": "site"},
                {"name": "longitude (east)", "value": lon, "unit": "deg", "source": "site"},
                {"name": "altitude", "value": alt_m, "unit": "m", "source": "site"},
                {"name": "epochs", "value": int(times.size), "unit": "", "source": "time grid"},
                {"name": "QUANTITIES", "value": "4,20", "unit": "", "source": "Horizons API"},
            ],
            {"value": {"sun_az": eph.sun_az, "sun_el": eph.sun_el, "sun_range": eph.sun_range,
                       "earth_az": eph.earth_az, "earth_el": eph.earth_el, "earth_range": eph.earth_range},
             "unit": "deg, deg, m"},
            assumptions=[eph.corrections, "Lunar orientation (libration) from the DE ephemeris used by Horizons",
                         "Site altitude as given; Horizons geodetic coordinates on the lunar reference sphere"],
            uncertainty="Horizons positional accuracy far exceeds the 1-hour grid; interpolation between epochs is linear",
            description="Azimuth, elevation and range of the Sun and the Earth as seen from the site, hour by hour.",
        )
        eph.step_id = s.id
    return eph
