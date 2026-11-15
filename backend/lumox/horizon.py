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


# Un dataset de rasterio abierto no se puede leer desde dos hilos a la vez
# (la API atiende el escenario y el parche 3D en paralelo): serializamos las lecturas.
import threading
_DEM_LOCK = threading.RLock()


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


# ---------------------------------------------------------------- parche 3D

def terrain_patch(lat: float, lon: float, half_size_m: float = 12_000.0, n: int = 97,
                  dem_file: str | None = None) -> dict | None:
    """Grilla de alturas alrededor del sitio, en metros locales (norte/este), para la
    escena 3D. No es un cálculo nuevo: son las mismas muestras del DEM que usa el
    horizonte, relativas a la altura del sitio. Devuelve None si no hay DEM."""
    p = _pick_dem(lat, lon, dem_file)
    if p is None:
        return None
    ds, tf = _open_dem(str(p))
    scale = float(ds.scales[0]) if ds.scales else 1.0
    offset = float(ds.offsets[0]) if ds.offsets else 0.0
    k = np.linspace(-half_size_m, half_size_m, n)
    north, east = np.meshgrid(k, k, indexing="ij")
    dist = np.hypot(north, east)
    az = np.degrees(np.arctan2(east, north)) % 360.0
    # destination() espera (az[:,None], dist[None,:]); acá lo llamo punto a punto en 1D
    R = R_MOON.value
    la1, lo1 = np.radians(lat), np.radians(lon)
    psi = dist / R; a = np.radians(az)
    la2 = np.arcsin(np.sin(la1) * np.cos(psi) + np.cos(la1) * np.sin(psi) * np.cos(a))
    lo2 = lo1 + np.arctan2(np.sin(a) * np.sin(psi) * np.cos(la1), np.cos(psi) - np.sin(la1) * np.sin(la2))
    x, y = tf.transform(np.degrees(lo2).ravel(), np.degrees(la2).ravel())
    from rasterio.transform import rowcol
    rows, cols = rowcol(ds.transform, x, y)
    rows = np.asarray(rows, dtype=np.int64); cols = np.asarray(cols, dtype=np.int64)
    inside = (rows >= 0) & (rows < ds.height) & (cols >= 0) & (cols < ds.width)
    if not inside.any():
        return None
    from rasterio.windows import Window
    r0, r1 = int(rows[inside].min()), int(rows[inside].max()) + 1
    c0, c1 = int(cols[inside].min()), int(cols[inside].max()) + 1
    with _DEM_LOCK:
        win = ds.read(1, window=Window(c0, r0, c1 - c0, r1 - r0)).astype(np.float64)
    if ds.nodata is not None:
        win[win == ds.nodata] = np.nan
    win = win * scale + offset
    if np.nanmedian(win) > 1.0e6:
        win -= R
    z = np.full(rows.shape, np.nan)
    z[inside] = win[rows[inside] - r0, cols[inside] - c0]
    z = z.reshape(n, n)
    centre = z[n // 2, n // 2]
    rel = z - centre
    # Para dibujar en un plano local hay que "bajar" lo lejano por la curvatura:
    # caída = R - sqrt(R² - d²) (≈ d²/2R, unos 41 m a 12 km). Así la escena 3D
    # y el cálculo del horizonte ven el mismo terreno.
    drop = R - np.sqrt(np.maximum(R * R - dist * dist, 0.0))
    local = np.nan_to_num(rel, nan=0.0) - drop
    return {"n": n, "half_size_m": half_size_m, "step_m": float(k[1] - k[0]), "site_z_m": float(centre),
            "heights_m": np.nan_to_num(rel, nan=0.0).tolist(), "heights_local_m": local.tolist(),
            "min_m": float(np.nanmin(rel)), "max_m": float(np.nanmax(rel)),
            "dem": p.name, "resolution_m": float(max(ds.res))}


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
    # Los márgenes piden ~33 horizontes sin traza; los guardamos para no recalcular
    # lo mismo cada vez que cambia la fecha (el relieve no depende de la fecha).
    key = (round(lat, 7), round(lon, 7), mast_m, site_elev_m, dem_file, n_az, max_dist_m)
    if trace is None and key in _HCACHE:
        return _HCACHE[key]
    p = _pick_dem(lat, lon, dem_file)
    if p is None:
        return flat_horizon(site_elev_m or 0.0, mast_m, n_az, trace)
    h = _terrain_horizon(p, lat, lon, mast_m, site_elev_m, n_az, max_dist_m, trace)
    if trace is None:
        if len(_HCACHE) > 400:
            _HCACHE.clear()
        _HCACHE[key] = h
    return h


_HCACHE: dict = {}


def _terrain_horizon(p, lat, lon, mast_m, site_elev_m, n_az, max_dist_m, trace) -> Horizon:
    ds, tf = _open_dem(str(p))
    n = n_az or int(HORIZON_AZIMUTH_STEPS.value)
    dmax = max_dist_m or HORIZON_MAX_DISTANCE.value
    res = float(max(abs(ds.res[0]), abs(ds.res[1])))
    step = res                         # one sample per pixel along the ray
    dist = np.arange(step, dmax + step / 2, step)
    az = np.arange(n) * 360.0 / n

    # El horizonte solo depende del relieve, el punto y el mástil: lo guardamos en
    # disco para que reiniciar el servidor no obligue a recalcular los 33 de los márgenes.
    import hashlib
    ck = hashlib.sha256(f"{p.name}|{lat:.7f}|{lon:.7f}|{mast_m}|{site_elev_m}|{n}|{dmax}|v1".encode()).hexdigest()[:24]
    cf = ROOT / "cache" / "horizon" / f"{ck}.npz"
    if cf.exists():
        c = np.load(cf)
        theta_max, dk = c["theta"], c["dist"]
        z_site, cover, radius_product = float(c["z_site"]), float(c["cover"]), bool(c["radius_product"])
    else:
        with _DEM_LOCK:
            theta_max, dk, z_site, cover, radius_product = _scan(ds, tf, lat, lon, mast_m, site_elev_m, n, az, dist)
        cf.parent.mkdir(parents=True, exist_ok=True)
        np.savez(cf, theta=theta_max, dist=dk, z_site=z_site, cover=cover, radius_product=radius_product)
    h = Horizon(az, theta_max, dk, f"dem:{p.name}", res, float(z_site), mast_m,
                notes=[f"{cover * 100:.1f}% of ray samples inside DEM"])
    return _horizon_step(h, p, res, z_site, site_elev_m, mast_m, dmax, n, cover, radius_product, trace)


def _scan(ds, tf, lat, lon, mast_m, site_elev_m, n, az, dist):
    """Recorre los rayos sobre el DEM y devuelve el ángulo máximo por azimut (grados)."""
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
    from rasterio.transform import rowcol
    rows, cols = rowcol(ds.transform, x, y)
    rows = np.asarray(rows, dtype=np.int64); cols = np.asarray(cols, dtype=np.int64)
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
    return theta_max, dist[k], float(z_site), cover, radius_product


def _horizon_step(h, p, res, z_site, site_elev_m, mast_m, dmax, n, cover, radius_product, trace):
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
