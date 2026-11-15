"""Ephemeris providers: SPICE (NAIF kernels) or JPL Horizons (HTTP, cached).

`get_ephemeris(site, times, trace)` picks SPICE when kernels are present,
otherwise Horizons, and records the choice in the trace.
"""

from __future__ import annotations

import numpy as np

from .base import Ephemeris, EphemerisError
from . import horizons as _horizons
from . import spice as _spice


def available_providers() -> dict:
    return {"spice": _spice.kernels_status(), "horizons": {"available": True, "cache_dir": str(_horizons.CACHE_DIR)}}


def get_ephemeris(lat: float, lon: float, alt_m: float, times: np.ndarray, trace=None,
                  provider: str = "auto") -> Ephemeris:
    if provider == "auto":
        provider = "spice" if _spice.kernels_status()["available"] else "horizons"
    if provider == "spice":
        return _spice.topocentric(lat, lon, alt_m, times, trace)
    if provider == "horizons":
        return _horizons.topocentric(lat, lon, alt_m, times, trace)
    raise EphemerisError(f"unknown provider '{provider}'")


__all__ = ["Ephemeris", "EphemerisError", "get_ephemeris", "available_providers"]
