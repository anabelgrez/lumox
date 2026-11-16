"""Rasgos nombrados de la Luna y regiones en sombra permanente.

Fuentes (se citan en docs/FUENTES.md):
  * Gazetteer of Planetary Nomenclature (IAU WGPSN / USGS Astrogeology), capa de
    puntos centrales de la Luna: nombre, tipo, diámetro (km), lat/lon del centro.
    Longitud este-positiva de 0 a 360, marco LOLA (misma convención que el DEM).
  * Regiones en sombra permanente LOLA, polígonos > 1 km² (Barker et al. 2023),
    en proyección estereográfica polar (solo al sur de 80°S).

Todas las distancias salen de la esfera lunar (R = 1 737 400 m), igual que el
resto del motor. Los datos se cargan una vez y quedan en memoria.
"""

from __future__ import annotations

import os
import threading
from functools import lru_cache
from pathlib import Path

import numpy as np

from .constants import R_MOON

ROOT = Path(os.environ.get("LUMOX_DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
FEAT_DIR = ROOT / "features"
NOMEN = FEAT_DIR / "nomen" / "MOON_nomenclature_center_pts.shp"
PSR = FEAT_DIR / "LPSR_80S_20MPP_ADJ_1km2.shp"
_LOCK = threading.RLock()

# tipos que se dibujan (los "satélite" son cráteres chicos con letra y llenarían la pantalla)
KINDS = {"Crater": "crater", "Mons": "mons", "Dorsum": "dorsum", "Rupes": "rupes", "Vallis": "vallis",
         "Catena": "catena", "Mare": "mare", "Montes": "mons", "Promontorium": "mons"}
KIND_ES = {"crater": "Cráter", "mons": "Monte", "dorsum": "Cresta", "rupes": "Escarpe", "vallis": "Valle",
           "catena": "Cadena de cráteres", "mare": "Mar"}

R = R_MOON.value


# ---------------------------------------------------------------- geodesia (esfera)
def dist_az(lat0, lon0, lat, lon):
    """Distancia (m) y rumbo (° desde el norte, hacia el este) del punto 0 a los puntos (lat, lon)."""
    a, b = np.radians(lat0), np.radians(lon0)
    c, d = np.radians(np.asarray(lat, dtype=np.float64)), np.radians(np.asarray(lon, dtype=np.float64))
    dl = d - b
    h = np.sin((c - a) / 2) ** 2 + np.cos(a) * np.cos(c) * np.sin(dl / 2) ** 2
    dist = 2 * R * np.arcsin(np.clip(np.sqrt(h), 0, 1))
    az = np.degrees(np.arctan2(np.sin(dl) * np.cos(c), np.cos(a) * np.sin(c) - np.sin(a) * np.cos(c) * np.cos(dl))) % 360.0
    return dist, az


def destination_pw(lat0, lon0, az_deg, dist_m):
    """Punto de llegada para pares (azimut, distancia) del mismo largo (a diferencia de horizon.destination)."""
    la1, lo1 = np.radians(lat0), np.radians(lon0)
    az = np.radians(np.asarray(az_deg, dtype=np.float64)); psi = np.asarray(dist_m, dtype=np.float64) / R
    la2 = np.arcsin(np.sin(la1) * np.cos(psi) + np.cos(la1) * np.sin(psi) * np.cos(az))
    lo2 = lo1 + np.arctan2(np.sin(az) * np.sin(psi) * np.cos(la1), np.cos(psi) - np.sin(la1) * np.sin(la2))
    return np.degrees(la2), (np.degrees(lo2) + 180.0) % 360.0 - 180.0


def offset_to_latlon(lat0, lon0, north_m, east_m):
    """Coordenadas planas locales (equidistantes azimutales: la distancia y el rumbo desde
    el sitio son exactos) → latitud y longitud."""
    d = float(np.hypot(north_m, east_m))
    if d == 0.0:
        return float(lat0), float(lon0)
    az = float(np.degrees(np.arctan2(east_m, north_m)) % 360.0)
    la, lo = destination_pw(lat0, lon0, az, d)
    return float(la), float(lo)


def latlon_to_offset(lat0, lon0, lat, lon):
    d, az = dist_az(lat0, lon0, lat, lon)
    return float(d * np.cos(np.radians(az))), float(d * np.sin(np.radians(az)))


# ---------------------------------------------------------------- nomenclátor
@lru_cache(maxsize=1)
def _load_nomen() -> dict | None:
    if not NOMEN.exists():
        return None
    import shapefile
    r = shapefile.Reader(str(NOMEN), encoding="utf-8")
    F = [f[0] for f in r.fields[1:]]
    names, clean, kinds, types, diam, lat, lon = [], [], [], [], [], [], []
    for rec in r.records():
        d = dict(zip(F, rec))
        kind = KINDS.get(str(d["type"]).split(",")[0].split(" ")[0])
        if kind is None or not d["diameter"] or d["diameter"] <= 0:
            continue
        clean.append(str(d["clean_name"])); kinds.append(kind); types.append(str(d["type"]))
        diam.append(float(d["diameter"])); lat.append(float(d["center_lat"]))
        lon.append(((float(d["center_lon"]) + 180.0) % 360.0) - 180.0)
        names.append(str(d["approval"]))
    return {"name": np.array(clean), "kind": np.array(kinds), "diam_km": np.array(diam), "lat": np.array(lat),
            "lon": np.array(lon), "approval": np.array(names), "n": len(clean)}


def available() -> dict:
    nm = _load_nomen()
    return {"nomenclature": nm is not None, "n_features": nm["n"] if nm else 0, "psr": PSR.exists()}


def features_near(lat0: float, lon0: float, radius_km: float = 150.0, min_diam_km: float = 3.0, limit: int = 60) -> list[dict]:
    """Rasgos con el centro dentro del radio, o cuyo borde lo toca. Ordenados por tamaño aparente."""
    nm = _load_nomen()
    if nm is None:
        return []
    d, az = dist_az(lat0, lon0, nm["lat"], nm["lon"])
    reach = radius_km * 1000.0 + nm["diam_km"] * 500.0
    ok = (d <= reach) & (nm["diam_km"] >= min_diam_km)
    idx = np.where(ok)[0]
    # tamaño angular visto desde el sitio: los grandes y cercanos primero
    order = idx[np.argsort(-(nm["diam_km"][idx] * 1000.0) / np.maximum(d[idx], 500.0))][:limit]
    out = []
    for i in order:
        n_m = float(d[i] * np.cos(np.radians(az[i]))); e_m = float(d[i] * np.sin(np.radians(az[i])))
        out.append({"name": str(nm["name"][i]), "kind": str(nm["kind"][i]), "kind_es": KIND_ES[str(nm["kind"][i])],
                    "diameter_km": float(nm["diam_km"][i]), "lat": float(nm["lat"][i]), "lon": float(nm["lon"][i]),
                    "distance_km": float(d[i] / 1000.0), "bearing_deg": float(az[i]), "north_m": n_m, "east_m": e_m,
                    "approval": str(nm["approval"][i])})
    return out


def name_horizon(lat0: float, lon0: float, azimuth: np.ndarray, distance_m: np.ndarray, pixel_m: float | None) -> list:
    """Para cada azimut, ¿a qué rasgo nombrado pertenece el punto de terreno que define el horizonte?
    Regla: el punto cae en el borde (±15 % del radio, mínimo 2 píxeles del DEM) de un cráter, o dentro de un
    monte o cresta. Si ningún rasgo lo contiene, queda None y la interfaz dice "relieve sin nombre"."""
    nm = _load_nomen()
    n = len(azimuth)
    if nm is None or not np.all(np.isfinite(distance_m)) or np.all(distance_m <= 0):
        return [None] * n
    plat, plon = destination_pw(lat0, lon0, azimuth, np.where(distance_m > 0, distance_m, 1.0))
    # candidatos: centros a menos de 150 km del sitio
    dc, _ = dist_az(lat0, lon0, nm["lat"], nm["lon"])
    cand = np.where((dc < 150_000.0 + nm["diam_km"] * 500.0))[0]
    out = []
    px = (pixel_m or 80.0) * 2
    for k in range(n):
        if distance_m[k] <= 0:
            out.append(None); continue
        d, _ = dist_az(plat[k], plon[k], nm["lat"][cand], nm["lon"][cand])
        Rj = nm["diam_km"][cand] * 500.0
        rel = d / Rj
        best, best_score = None, 9.0
        for j in np.where(rel <= 1.3)[0]:
            kind = nm["kind"][cand[j]]
            band = max(0.15 * Rj[j], px)
            if kind in ("crater", "catena"):
                if abs(d[j] - Rj[j]) <= band:
                    score, relation = abs(d[j] - Rj[j]) / Rj[j], "rim"
                elif d[j] < Rj[j]:
                    score, relation = 1.0 + Rj[j] / 1e7, "inside"     # el más chico que lo contiene
                else:
                    continue
            else:                                                     # monte, cresta, escarpe...
                if d[j] <= Rj[j]:
                    score, relation = 0.5 + Rj[j] / 1e7, "on"
                else:
                    continue
            if score < best_score:
                best_score, best = score, (cand[j], relation)
        if best is None:
            out.append(None)
        else:
            i, relation = best
            out.append({"name": str(nm["name"][i]), "kind": str(nm["kind"][i]), "kind_es": KIND_ES[str(nm["kind"][i])],
                        "relation": relation, "diameter_km": float(nm["diam_km"][i])})
    return out


# ---------------------------------------------------------------- sombras permanentes
@lru_cache(maxsize=1)
def _load_psr():
    if not PSR.exists():
        return None
    import shapefile
    from pyproj import CRS, Transformer
    r = shapefile.Reader(str(PSR))
    prj = PSR.with_suffix(".PRJ")
    crs = CRS.from_wkt(prj.read_text()) if prj.exists() else None
    if crs is None:
        return None
    shapes = [(sh.bbox, sh.parts, np.asarray(sh.points, dtype=np.float64), rec[1], rec[2]) for sh, rec in zip(r.shapes(), r.records())]
    to_plane = Transformer.from_crs(CRS.from_proj4("+proj=longlat +R=1737400 +no_defs"), crs, always_xy=True)
    to_geo = Transformer.from_crs(crs, CRS.from_proj4("+proj=longlat +R=1737400 +no_defs"), always_xy=True)
    return {"shapes": shapes, "to_plane": to_plane, "to_geo": to_geo}


def psr_near(lat0: float, lon0: float, radius_m: float = 12_000.0, max_vertices: int = 220) -> list[dict]:
    """Polígonos de sombra permanente que tocan el cuadrado de radio `radius_m` alrededor del sitio, en
    coordenadas planas locales (norte, este) en metros. Los contornos se simplifican por tramos para
    dibujarlos (el relieve de 20 m/px es escalonado): es solo dibujo, no cambia ningún cálculo."""
    d = _load_psr()
    if d is None:
        return []
    x0, y0 = d["to_plane"].transform(lon0, lat0)
    out = []
    for bbox, parts, pts, area, gid in d["shapes"]:
        if bbox[2] < x0 - radius_m or bbox[0] > x0 + radius_m or bbox[3] < y0 - radius_m or bbox[1] > y0 + radius_m:
            continue
        rings = []
        ends = list(parts[1:]) + [len(pts)]
        for s, e in zip(parts, ends):
            ring = pts[s:e]
            if len(ring) < 4:
                continue
            step = max(1, int(np.ceil(len(ring) / max_vertices)))
            ring = ring[::step]
            lon, lat = d["to_geo"].transform(ring[:, 0], ring[:, 1])
            dist, az = dist_az(lat0, lon0, lat, lon)
            n_m, e_m = dist * np.cos(np.radians(az)), dist * np.sin(np.radians(az))
            if np.all(dist > radius_m * 1.8):
                continue
            rings.append(np.stack([n_m, e_m], axis=1).round(1).tolist())
        if rings:
            out.append({"id": str(gid).strip().strip('"'), "area_km2": float(str(area).strip() or 0), "rings": rings})
    return out
