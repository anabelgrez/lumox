"""La API corre varios escenarios a la vez (mapa de calor, perfiles). CSPICE y los
DEM de rasterio no aguantan acceso simultáneo, así que el motor los serializa.
Estas pruebas fallaban antes de los locks (2026-11-15)."""

import threading
from datetime import datetime, timezone

import numpy as np
import pytest

from lumox.ephemeris import spice
from lumox.timegrid import grid

SITES = [(-89.78, -155.73), (-86.0, 0.0), (20.19, 30.77), (-69.37, 32.32)]


def _run_parallel(fn):
    errs, out = [], {}
    def work(k, lat, lon):
        try:
            out[k] = fn(lat, lon)
        except Exception as e:  # cualquier error de la biblioteca cuenta como falla
            errs.append(f"{type(e).__name__}: {str(e)[:80]}")
    ts = [threading.Thread(target=work, args=(k, *s)) for k, s in enumerate(SITES)]
    [t.start() for t in ts]; [t.join() for t in ts]
    return errs, out


def test_spice_in_parallel_matches_serial():
    if not spice.kernels_status()["available"]:
        pytest.skip("SPICE kernels not present")
    t = grid(datetime(2027, 1, 15, tzinfo=timezone.utc), 48)
    errs, par = _run_parallel(lambda lat, lon: spice.topocentric(lat, lon, 0.0, t))
    assert errs == []
    for k, (lat, lon) in enumerate(SITES):
        ser = spice.topocentric(lat, lon, 0.0, t)
        assert np.array_equal(ser.sun_el, par[k].sun_el)
        assert np.array_equal(ser.earth_az, par[k].earth_az)


def test_bad_start_date_is_422_not_500():
    from fastapi.testclient import TestClient
    from lumox.api import app
    c = TestClient(app)
    for bad in ["2027-13-45T99:00:00Z", "", "mañana"]:
        r = c.post("/api/scenario", json={"site_id": "apollo17", "start": bad})
        assert r.status_code == 422, (bad, r.status_code)
