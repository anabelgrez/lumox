"""Validation against JPL Horizons at 10 instants (network; cached after the first run).

Compares:
 * the engine's Horizons provider parsing against an independent raw Horizons query
   with a different step and date formatting (catches parsing/epoch errors);
 * the SPICE provider against Horizons when kernels are present (skipped otherwise).
Measured differences are printed and asserted against explicit tolerances.
"""

import re

import httpx
import numpy as np
import pytest

from lumox.ephemeris import horizons, spice
from lumox.timegrid import grid
from datetime import datetime, timezone

SITE = dict(lat=-89.78, lon=-155.73, alt_m=0.0)
EPOCHS = ["2026-01-03T00:00", "2026-02-14T12:00", "2026-04-01T06:00", "2026-06-21T18:00", "2026-08-09T03:00",
          "2026-10-30T15:00", "2027-01-15T00:00", "2027-03-02T09:00", "2027-05-20T21:00", "2027-07-07T12:00"]


def _raw_horizons(body, epoch):
    """Independent single-epoch query using TLIST (not a start/stop/step table)."""
    q = {"format": "text", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER", "CSV_FORMAT": "YES",
         "ANG_FORMAT": "DEG", "APPARENT": "AIRLESS", "RANGE_UNITS": "KM", "EXTRA_PREC": "YES", "COMMAND": body,
         "CENTER": "coord@301", "COORD_TYPE": "GEODETIC",
         "SITE_COORD": f"{(SITE['lon'] % 360):.6f},{SITE['lat']:.6f},0.000000",
         "QUANTITIES": "4,20", "TLIST": epoch.replace("T", " ").replace("-", "-"), "TIME_TYPE": "UT"}
    r = httpx.get(horizons.ENDPOINT, params={k: (v if k == "format" else f"'{v}'") for k, v in q.items()}, timeout=90)
    r.raise_for_status()
    a, b = r.text.find("$$SOE"), r.text.find("$$EOE")
    assert a > 0 and b > 0, r.text[-300:]
    line = r.text[a + 5:b].strip().splitlines()[0]
    vals = [float(s) for s in [p.strip() for p in line.split(",")][1:]
            if s not in ("", "*") and not re.fullmatch(r"[A-Za-z]", s)]
    return vals[0], vals[1], vals[2] * 1000.0


@pytest.mark.network
def test_provider_against_independent_horizons_queries():
    diffs = []
    for ep in EPOCHS:
        t0 = datetime.fromisoformat(ep).replace(tzinfo=timezone.utc)
        times = grid(t0, 1.0, 1.0)      # 2 epochs, we use the first
        eph = horizons.topocentric(SITE["lat"], SITE["lon"], SITE["alt_m"], times)
        for body, az, el, rng in (("10", eph.sun_az[0], eph.sun_el[0], eph.sun_range[0]),
                                  ("399", eph.earth_az[0], eph.earth_el[0], eph.earth_range[0])):
            raz, rel, rrng = _raw_horizons(body, ep)
            daz = abs((az - raz + 180) % 360 - 180); dele = abs(el - rel); drng = abs(rng - rrng) / rrng
            diffs.append((ep, body, daz, dele, drng))
    worst_az = max(d[2] for d in diffs); worst_el = max(d[3] for d in diffs); worst_r = max(d[4] for d in diffs)
    print(f"\nHorizons self-consistency over {len(diffs)} samples: max |dAz| = {worst_az:.2e} deg, "
          f"max |dEl| = {worst_el:.2e} deg, max rel. range diff = {worst_r:.2e}")
    assert worst_az < 1e-4 and worst_el < 1e-4 and worst_r < 1e-6


@pytest.mark.network
def test_spice_against_horizons():
    if not spice.kernels_status()["available"]:
        pytest.skip("SPICE kernels not present in data/kernels")
    worst = {"az": 0.0, "el": 0.0, "r": 0.0}
    for ep in EPOCHS:
        t0 = datetime.fromisoformat(ep).replace(tzinfo=timezone.utc)
        times = grid(t0, 1.0, 1.0)
        a = spice.topocentric(SITE["lat"], SITE["lon"], SITE["alt_m"], times)
        b = horizons.topocentric(SITE["lat"], SITE["lon"], SITE["alt_m"], times)
        for sa, sb in ((a.sun_az, b.sun_az), (a.earth_az, b.earth_az)):
            worst["az"] = max(worst["az"], float(abs((sa[0] - sb[0] + 180) % 360 - 180)))
        for sa, sb in ((a.sun_el, b.sun_el), (a.earth_el, b.earth_el)):
            worst["el"] = max(worst["el"], float(abs(sa[0] - sb[0])))
        for sa, sb in ((a.sun_range, b.sun_range), (a.earth_range, b.earth_range)):
            worst["r"] = max(worst["r"], float(abs(sa[0] - sb[0]) / sb[0]))
    print(f"\nSPICE vs Horizons over {len(EPOCHS)} epochs: max |dAz| = {worst['az']:.3e} deg, "
          f"max |dEl| = {worst['el']:.3e} deg, max rel. range = {worst['r']:.2e}")
    # MOON_ME (SPICE) vs Horizons lunar frame: expect agreement well below the hourly-grid effect
    assert worst["el"] < 0.02 and worst["az"] < 0.05
