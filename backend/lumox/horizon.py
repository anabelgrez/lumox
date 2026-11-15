"""Terrain horizon from a LOLA DEM.

For each azimuth we walk a great circle on the lunar sphere (R = 1 737 400 m)
up to `HORIZON_MAX_DISTANCE`, sample the DEM at each point and take the
largest elevation angle of the terrain above the observer's local horizontal:

    psi = d / R
    r_t = R + z_terrain,  r_o = R + z_site + h_mast
    theta(d) = atan2(r_t * cos(psi) - r_o,  r_t * sin(psi))
    theta_horizon(az) = max_d theta(d)

This is exact on the sphere (no small-angle approximation). No refraction.

The DEM is read with rasterio using its own CRS; site and ray points are
transformed from lunar geographic coordinates (+proj=longlat +R=1737400)
with pyproj. Without a DEM, `flat_horizon` returns theta = 0 and the trace
records that terrain data is missing.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np

from .constants import HORIZON_AZIMUTH_STEPS, HORIZON_MAX_DISTANCE, R_MOON

ROOT = Path(os.environ.get("LUMOX_DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
DEM_DIR = ROOT / "dem"
MOON_GEOGRAPHIC = "+proj=longlat +R=1737400 +no_defs"


class HorizonError(RuntimeError):
    pass


@dataclass
class Horizon:
    azimuth: np.ndarray            # deg, length N_az (0..360 exclusive)
    elevation: np.ndarray          # deg, terrain elevation angle per azimuth
    distance: np.ndarray           # m, distance at which the maximum occurs
    source: str                    # 'dem:<file>' | 'flat'
    resolution_m: float | None
    site_elevation_m: float
    mast_m: float
    notes: list[str] = field(default_factory=list)
    step_id: str = ""

    def at(self, az_deg: np.ndarray | float) -> np.ndarray | float:
        """Linear interpolation of theta at azimuth(s), periodic in 360."""
        a = np.asarray(az_deg, dtype=np.float64) % 360.0
        n = self.azimuth.size
        x = a / 360.0 * n
        i0 = np.floor(x).astype(int) % n
        f = x - np.floor(x)
        i1 = (i0 + 1) % n
        out = self.elevation[i0] * (1 - f) + self.elevation[i1] * f
        return float(out) if np.ndim(az_deg) == 0 else out


# ---------------------------------------------------------------- geometry

def destination(lat_deg: float, lon_deg: float, az_deg: np.ndarray, dist_m: np.ndarray):
    """Great-circle destination points on a sphere of radius R_MOON (vectorised)."""
    R = R_MOON.value
    la1, lo1 = np.radians(lat_deg), np.radians(lon_deg)
    az = np.radians(az_deg)[:, None]
    psi = (dist_m / R)[None, :]
    la2 = np.arcsin(np.sin(la1) * np.cos(psi) + np.cos(la1) * np.sin(psi) * np.cos(az))
    lo2 = lo1 + np.arctan2(np.sin(az) * np.sin(psi) * np.cos(la1),
                           np.cos(psi) - np.sin(la1) * np.sin(la2))
    return np.degrees(la2), (np.degrees(lo2) + 180.0) % 360.0 - 180.0


def elevation_angle(z_terrain: np.ndarray, dist_m: np.ndarray, z_observer: float) -> np.ndarray:
    """Exact elevation angle of terrain points above the observer's horizontal plane."""
    R = R_MOON.value
    psi = dist_m / R
    r_t = R + z_terrain
    r_o = R + z_observer
    return np.degrees(np.arctan2(r_t * np.cos(psi) - r_o, r_t * np.sin(psi)))


# ---------------------------------------------------------------- DEM access

def list_dems() -> list[dict]:
    """GeoTIFFs, or PDS3 LOLA products (.lbl label + .img data; GDAL opens the .lbl)."""
    out = []
    if DEM_DIR.exists():
        for p in sorted(DEM_DIR.iterdir()):
            if p.suffix.lower() in (".tif", ".tiff"):
                out.append({"file": p.name, "bytes": p.stat().st_size})
            elif p.suffix.lower() == ".lbl" and p.with_suffix(".img").exists():
                out.append({"file": p.name, "bytes": p.with_suffix(".img").stat().st_size})
    return out


@lru_cache(maxsize=4)
def _open_dem(path: str):
    import rasterio
    from pyproj import CRS, Transformer
    ds = rasterio.open(path)
    if ds.crs is None:
        raise HorizonError(f"DEM {path} has no CRS; cannot place lunar coordinates on it")
    tf = Transformer.from_crs(CRS.from_proj4(MOON_GEOGRAPHIC), ds.crs, always_xy=True)
    return ds, tf


def _pick_dem(lat: float, lon: float, dem_file: str | None):
    dems = list_dems()
    if not dems:
        return None
    if dem_file:
        p = DEM_DIR / dem_file
        if not p.exists():
            raise HorizonError(f"DEM file not found: {p}")
        return p
    # First DEM whose bounds contain the site.
    for d in dems:
        p = DEM_DIR / d["file"]
        try:
            ds, tf = _open_dem(str(p))
            x, y = tf.transform(lon, lat)
            b = ds.bounds
            if b.left <= x <= b.right and b.bottom <= y <= b.top:
                return p
        except Exception:
            continue
    return None


def dem_coverage(lat: float, lon: float, dem_file: str | None = None) -> dict:
    p = _pick_dem(lat, lon, dem_file)
    return {"covered": p is not None, "file": p.name if p else None, "available": list_dems()}


# ---------------------------------------------------------------- horizon

def flat_horizon(site_elev_m: float, mast_m: float, n_az: int | None = None, trace=None,
                 reason: str = "no DEM covers this site") -> Horizon:
    n = n_az or int(HORIZON_AZIMUTH_STEPS.value)
    az = np.arange(n) * 360.0 / n
    h = Horizon(az, np.zeros(n), np.full(n, np.nan), "flat", None, site_elev_m, mast_m,
                notes=[f"Terrain horizon NOT computed: {reason}. theta = 0 for every azimuth."])
    if trace is not None:
        s = trace.add(
            "horizon", "Terrain horizon — MISSING DATA (flat horizon assumed)", r"\theta(A) = 0",
            [{"name": "reason", "value": reason, "unit": "", "source": "data directory"}],
            {"value": h.elevation, "unit": "deg"},
            assumptions=["No LOLA DEM available for this site: horizon taken as the local horizontal plane",
                         "Results that depend on terrain (sunlight %, Earth visibility, night length) are optimistic"],
            uncertainty="Unbounded: real terrain near the poles can raise the horizon by several degrees",
        )
        h.step_id = s.id
    return h


def terrain_horizon(lat: float, lon: float, mast_m: float, site_elev_m: float | None = None,
                    dem_file: str | None = None, n_az: int | None = None,
                    max_dist_m: float | None = None, trace=None) -> Horizon:
    """Compute the terrain horizon from a DEM; fall back to flat with a trace notice."""
    p = _pick_dem(lat, lon, dem_file)
    if p is None:
        return flat_horizon(site_elev_m or 0.0, mast_m, n_az, trace)
    ds, tf = _open_dem(str(p))
    n = n_az or int(HORIZON_AZIMUTH_STEPS.value)
    dmax = max_dist_m or HORIZON_MAX_DISTANCE.value
    res = float(max(abs(ds.res[0]), abs(ds.res[1])))
    step = res                         # one sample per pixel along the ray
    dist = np.arange(step, dmax + step / 2, step)
    az = np.arange(n) * 360.0 / n

    # Site elevation from the DEM unless given
    sx, sy = tf.transform(lon, lat)
    z_site = site_elev_m
    if z_site is None:
        raw = float(next(ds.sample([(sx, sy)]))[0])
        if ds.nodata is not None and raw == ds.nodata:
            raise HorizonError("site falls on DEM nodata")
        z_site = raw * (float(ds.scales[0]) if ds.scales else 1.0) + (float(ds.offsets[0]) if ds.offsets else 0.0)
        if z_site > 1.0e6:
            z_site -= R_MOON.value
    z_obs = z_site + mast_m

    lat2, lon2 = destination(lat, lon, az, dist)
    x, y = tf.transform(lon2.ravel(), lat2.ravel())
    rows, cols = ds.index(x, y)
    rows = np.asarray(rows); cols = np.asarray(cols)
    inside = (rows >= 0) & (rows < ds.height) & (cols >= 0) & (cols < ds.width)
    # Read only the window that the rays touch
    r0, r1 = int(rows[inside].min()), int(rows[inside].max()) + 1
    c0, c1 = int(cols[inside].min()), int(cols[inside].max()) + 1
    from rasterio.windows import Window
    win = ds.read(1, window=Window(c0, r0, c1 - c0, r1 - r0)).astype(np.float64)
    if ds.nodata is not None:
        win[win == ds.nodata] = np.nan
    scale = float(ds.scales[0]) if ds.scales else 1.0
    offset = float(ds.offsets[0]) if ds.offsets else 0.0
    win = win * scale + offset
    # LOLA GDR products store planetary RADIUS (offset 1737400 m); convert to height above the sphere.
    radius_product = bool(np.nanmedian(win) > 1.0e6)
    if radius_product:
        win = win - R_MOON.value
    z = np.full(rows.shape, np.nan)
    z[inside] = win[rows[inside] - r0, cols[inside] - c0]
    z = z.reshape(n, dist.size)

    theta = elevation_angle(z, dist[None, :], z_obs)
    theta = np.where(np.isnan(theta), -np.inf, theta)
    k = np.argmax(theta, axis=1)
    theta_max = theta[np.arange(n), k]
    theta_max = np.where(np.isfinite(theta_max), theta_max, 0.0)
    cover = float(np.mean(inside))
    h = Horizon(az, theta_max, dist[k], f"dem:{p.name}", res, float(z_site), mast_m,
                notes=[f"{cover * 100:.1f}% of ray samples inside DEM"])
    if trace is not None:
        s = trace.add(
            "horizon", "Terrain horizon from LOLA DEM",
            r"\theta(A) = \max_{d \le d_{max}} \operatorname{atan2}\big(r_t\cos\psi - r_o,\ r_t\sin\psi\big),\ "
            r"\psi = d/R,\ r_t = R + z_t,\ r_o = R + z_s + h",
            [
                {"name": "R", "value": R_MOON.value, "unit": "m", "source": R_MOON.source},
                {"name": "DEM", "value": p.name, "unit": "", "source": "NASA LOLA (PDS Geosciences Node)"},
                {"name": "DEM resolution", "value": res, "unit": "m/px", "source": "DEM metadata"},
                {"name": "z_site", "value": float(z_site), "unit": "m", "source": "DEM sample at site" if site_elev_m is None else "site"},
                {"name": "h (mast)", "value": mast_m, "unit": "m", "source": "scenario"},
                {"name": "d_max", "value": dmax, "unit": "m", "source": HORIZON_MAX_DISTANCE.source},
                {"name": "N_az", "value": n, "unit": "", "source": HORIZON_AZIMUTH_STEPS.source},
            ],
            {"value": h.elevation, "unit": "deg"},
            assumptions=["Spherical Moon of radius R for ray geometry; DEM heights relative to that sphere"
                         + (" (LOLA radius product: height = radius - R)" if radius_product else ""),
                         "Nearest-pixel sampling of the DEM along each ray", "No refraction (airless)",
                         f"Ray samples outside the DEM ({(1 - cover) * 100:.1f}%) ignored"],
            uncertainty=f"Angular resolution limited by DEM: one pixel ({res:.0f} m) at 1 km subtends "
                        f"{np.degrees(np.arctan(res / 1000)):.2f} deg; unresolved boulders may hide the Sun",
            description="Elevation angle of the highest terrain along each azimuth, exact on the sphere.",
        )
        h.step_id = s.id
    return h
