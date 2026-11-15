"""Physical constants and engine parameters — the only place they live.

Each constant records its value, unit and source so the trace can cite it.
All values are float64 (Python float).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Constant:
    value: float
    unit: str
    source: str
    symbol: str = ""

    def as_input(self, name: str) -> dict:
        return {"name": name, "value": self.value, "unit": self.unit, "source": self.source}


# ---- Bodies -------------------------------------------------------------

R_MOON = Constant(
    1_737_400.0, "m",
    "IAU WGCCRE 2015 mean lunar radius 1737.4 km (Archinal et al. 2018)", "R",
)
R_SUN = Constant(
    695_700_000.0, "m",
    "IAU 2015 Resolution B3 nominal solar radius", "R_\\odot",
)
R_EARTH = Constant(
    6_371_008.8, "m",
    "IAU/IERS mean Earth radius (volumetric); used for angular size only", "R_\\oplus",
)

# ---- Radiometry ---------------------------------------------------------

AU = Constant(
    149_597_870_700.0, "m",
    "IAU 2012 Resolution B2 astronomical unit", "\\mathrm{AU}",
)
SOLAR_CONSTANT = Constant(
    1361.0, "W/m^2",
    "Total solar irradiance at 1 AU, Kopp & Lean (2011) GRL 38, L01706", "S_0",
)

# ---- Engine parameters --------------------------------------------------

HORIZON_MAX_DISTANCE = Constant(
    150_000.0, "m",
    "Engine parameter: maximum terrain distance scanned along each azimuth", "d_{max}",
)
HORIZON_AZIMUTH_STEPS = Constant(
    360.0, "", "Engine parameter: azimuth samples over 360 degrees", "N_{az}",
)
TIME_STEP_HOURS = Constant(
    1.0, "h", "Engine parameter: ephemeris and energy balance step", "\\Delta t",
)
MAST_MIN = Constant(2.0, "m", "Engine parameter: minimum mast height scanned", "h_{min}")
MAST_MAX = Constant(10.0, "m", "Engine parameter: maximum mast height scanned", "h_{max}")
NEIGHBOURHOOD_GRID = Constant(5.0, "", "Engine parameter: grid side (5 x 5 points)", "n")
NEIGHBOURHOOD_SPACING = Constant(2_000.0, "m", "Engine parameter: grid spacing", "\\Delta s")
DISC_INTEGRATION_RINGS = Constant(
    48.0, "", "Engine parameter: radial rings in disc-fraction numerical integration", "N_r",
)
DISC_INTEGRATION_SECTORS = Constant(
    96.0, "", "Engine parameter: angular sectors in disc-fraction numerical integration", "N_\\phi",
)

# Horizons body IDs
HORIZONS_SUN_ID = "10"
HORIZONS_EARTH_ID = "399"
HORIZONS_MOON_ID = "301"
