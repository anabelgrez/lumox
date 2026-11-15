from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


class EphemerisError(RuntimeError):
    pass


@dataclass
class Ephemeris:
    """Topocentric Sun and Earth positions on a time grid.

    Azimuth: degrees, clockwise from local north (0) through east (90).
    Elevation: degrees above the local horizontal plane (geometric, no refraction).
    Range: metres from the site to the body centre.
    """
    times: np.ndarray                 # datetime64[s]
    sun_az: np.ndarray
    sun_el: np.ndarray
    sun_range: np.ndarray
    earth_az: np.ndarray
    earth_el: np.ndarray
    earth_range: np.ndarray
    provider: str
    frame: str
    corrections: str
    notes: list[str] = field(default_factory=list)
    step_id: str = ""

    def n(self) -> int:
        return int(self.times.size)
