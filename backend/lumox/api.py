"""FastAPI application.

POST /api/scenario          -> results + trace id
GET  /api/trace/{id}        -> full trace (?format=json|csv, ?full=1 for full arrays)
WS   /ws/scenario           -> send the scenario spec as JSON; receive each step live, then the result
POST /api/calc/{formula}    -> calculator (any engine formula with your inputs)
GET  /api/formulas          -> catalogue
GET  /api/sites, /api/status, /api/limits
GET  /api/features         -> rasgos nombrados (IAU/USGS) y sombras permanentes alrededor de un punto
GET  /api/horizon          -> perfil de horizonte para otra altura de mástil (sin recalcular el escenario)
GET  /api/locate           -> lat/lon -> coordenadas planas locales del sitio
"""

from __future__ import annotations

import asyncio
import json
import threading
from dataclasses import asdict
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field, field_validator

from . import __version__, formulas
from .energy import Panel, Power
from .ephemeris import available_providers
from . import features as feats
from .horizon import dem_coverage, list_dems, terrain_horizon, terrain_patch
from .scenario import LIMITS, ScenarioSpec, run_scenario
from .sites import SITES
from .trace import STORE, Trace
from .timegrid import parse_utc

app = FastAPI(title="Lumox v2 engine", version=__version__,
              description="Lunar landing-site viability with live calculation traces.")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class PanelIn(BaseModel):
    area_m2: float = 10.0
    efficiency: float = Field(0.30, ge=0, le=1)
    tracking: bool = True
    tilt_deg: float = 90.0
    azimuth_deg: float = 0.0


class PowerIn(BaseModel):
    load_w: float = 500.0
    battery_wh: float = 20000.0
    initial_soc: float = Field(1.0, ge=0, le=1)


class ScenarioIn(BaseModel):
    site_id: str | None = "shackleton"
    lat: float | None = None
    lon: float | None = None
    name: str | None = None
    start: str = "2027-01-15T00:00:00Z"
    duration_days: float = Field(14.0, gt=0, le=120)
    mast_m: float = Field(2.0, ge=0, le=50)
    autonomy_h: float | None = None
    max_comm_gap_h: float = 48.0
    panel: PanelIn = PanelIn()
    power: PowerIn = PowerIn()
    step_h: float = Field(1.0, ge=0.25, le=6)
    provider: str = "auto"
    dem_file: str | None = None
    margins: bool = True
    max_delay_days: int = Field(30, ge=0, le=90)
    label: str = ""
    offset_north_m: float = Field(0.0, ge=-60000, le=60000)
    offset_east_m: float = Field(0.0, ge=-60000, le=60000)

    @field_validator("start")
    @classmethod
    def _valid_start(cls, v: str) -> str:
        # una fecha mal escrita es un error del pedido (422), no del motor (500)
        try:
            parse_utc(v)
        except Exception:
            raise ValueError(f"fecha de inicio inválida: '{v}' (formato esperado: 2027-01-24T00:00:00Z)")
        return v

    def to_spec(self) -> ScenarioSpec:
        d = self.model_dump()
        d["panel"] = Panel(**d["panel"])
        d["power"] = Power(**d["power"])
        return ScenarioSpec(**d)


class CalcIn(BaseModel):
    inputs: dict[str, float] = {}
    trace_id: str | None = None      # append to an existing scenario trace


@app.get("/api/status")
def status():
    return {"version": __version__, "ephemeris": available_providers(), "dems": list_dems(), "limits": LIMITS}


@app.get("/api/sites")
def sites():
    out = []
    for s in SITES:
        d = s.to_dict()
        d["dem"] = dem_coverage(s.lat, s.lon)["covered"]
        out.append(d)
    return out


@app.get("/api/limits")
def limits():
    return LIMITS


@app.get("/api/terrain")
def terrain(site_id: str | None = None, lat: float | None = None, lon: float | None = None,
            half_size_m: float = 12000.0, n: int = 97, fine: bool = False):
    """Parche de alturas del DEM alrededor del sitio, para la escena 3D (metros locales)."""
    if lat is None or lon is None:
        from .sites import get_site
        try:
            s = get_site(site_id or "shackleton")
        except KeyError as e:
            raise HTTPException(404, str(e))
        lat, lon = s.lat, s.lon
    patch = terrain_patch(lat, lon, half_size_m, max(9, min(n, 241)), fine=fine)
    if patch is None:
        return {"available": False, "note": "no DEM covers this site; the 3D view shows a flat plane and says so"}
    patch["available"] = True
    return patch


def _site_xy(site_id, lat, lon):
    if lat is None or lon is None:
        from .sites import get_site
        try:
            s = get_site(site_id or "shackleton")
        except KeyError as e:
            raise HTTPException(404, str(e))
        return s.lat, s.lon
    return lat, lon


@app.get("/api/features")
def features(site_id: str | None = None, lat: float | None = None, lon: float | None = None,
             radius_km: float = 150.0, min_diam_km: float = 3.0, limit: int = 60, psr_radius_m: float = 13000.0):
    """Rasgos nombrados dentro del radio (IAU/USGS) y sombras permanentes (LOLA) cerca del punto.
    Las coordenadas planas (north_m, east_m) son equidistantes azimutales alrededor del punto."""
    lat, lon = _site_xy(site_id, lat, lon)
    return {"center": {"lat": lat, "lon": lon}, "available": feats.available(),
            "features": feats.features_near(lat, lon, min(radius_km, 400.0), min_diam_km, min(limit, 200)),
            "psr": feats.psr_near(lat, lon, min(psr_radius_m, 40000.0)),
            "sources": {"nomenclature": "IAU WGPSN / USGS Astrogeology, Gazetteer of Planetary Nomenclature",
                        "psr": "LOLA permanently shadowed regions > 1 km², Barker et al. 2023 (doi:10.3847/PSJ/acf3e1)"}}


@app.get("/api/horizon")
def horizon_profile(site_id: str | None = None, lat: float | None = None, lon: float | None = None,
                    mast_m: float = 2.0, north_m: float = 0.0, east_m: float = 0.0):
    """Perfil de horizonte (θ por azimut) para una altura de mástil, para que el visor suba la cámara
    y muestre el cambio al instante. Es el mismo cálculo del escenario y queda en caché."""
    lat, lon = _site_xy(site_id, lat, lon)
    if north_m or east_m:
        lat, lon = feats.offset_to_latlon(lat, lon, north_m, east_m)
    h = terrain_horizon(lat, lon, max(0.0, min(mast_m, 50.0)))
    import numpy as np
    return {"mast_m": mast_m, "source": h.source, "resolution_m": h.resolution_m, "site_elevation_m": h.site_elevation_m,
            "azimuth": h.azimuth.tolist(), "elevation": h.elevation.tolist(),
            "distance_m": np.nan_to_num(h.distance, nan=-1).tolist(),
            "feature": feats.name_horizon(lat, lon, h.azimuth, h.distance, h.resolution_m)}


@app.get("/api/locate")
def locate(site_id: str | None = None, lat0: float | None = None, lon0: float | None = None, lat: float = 0.0, lon: float = 0.0):
    """Coordenadas planas locales (norte, este en metros) de una latitud/longitud respecto del sitio."""
    la0, lo0 = _site_xy(site_id, lat0, lon0)
    n, e = feats.latlon_to_offset(la0, lo0, lat, lon)
    return {"north_m": n, "east_m": e, "distance_m": (n * n + e * e) ** 0.5}


@app.on_event("startup")
def _warm():
    """Precalienta lo que tarda la primera vez (sombras permanentes, nomenclátor y los horizontes de los
    sitios con relieve) en segundo plano: el primer cálculo del usuario ya no paga ese costo."""
    def work():
        try:
            feats._load_nomen(); feats._load_psr()
            from .sites import SITES as _S
            for st in _S:
                if dem_coverage(st.lat, st.lon)["covered"]:
                    for m in range(2, 11):
                        terrain_horizon(st.lat, st.lon, float(m), st.elevation_m)
        except Exception:
            pass
    threading.Thread(target=work, daemon=True).start()


@app.get("/api/formulas")
def list_formulas():
    return [f.to_dict() for f in formulas.CATALOG]


@app.post("/api/calc/{formula_id}")
def calc(formula_id: str, body: CalcIn):
    trace = STORE.get(body.trace_id) if body.trace_id else None
    try:
        return formulas.calc(formula_id, body.inputs, trace)
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@app.post("/api/scenario")
async def scenario(body: ScenarioIn):
    try:
        return await asyncio.to_thread(run_scenario, body.to_spec())
    except KeyError as e:
        raise HTTPException(404, str(e))
    except Exception as e:  # engine errors are reported, never hidden
        raise HTTPException(500, f"{type(e).__name__}: {e}")


@app.get("/api/trace/{trace_id}")
def trace(trace_id: str, format: str = "json", full: int = 0):
    t = STORE.get(trace_id)
    if t is None:
        raise HTTPException(404, "trace not found (traces live in memory; rerun the scenario)")
    if format == "csv":
        return PlainTextResponse(t.to_csv(), media_type="text/csv",
                                 headers={"Content-Disposition": f'attachment; filename="trace-{trace_id}.csv"'})
    return t.to_dict(full=bool(full))


@app.websocket("/ws/scenario")
async def ws_scenario(ws: WebSocket):
    await ws.accept()
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    try:
        raw = await ws.receive_text()
        spec = ScenarioIn(**json.loads(raw)).to_spec()
        trace = Trace(spec.label)
        trace.subscribe(lambda payload: loop.call_soon_threadsafe(queue.put_nowait, payload))
        await ws.send_json({"type": "start", "trace_id": trace.id})

        result: dict[str, Any] = {}
        def work():
            try:
                result["value"] = run_scenario(spec, trace)
            except Exception as e:
                result["error"] = f"{type(e).__name__}: {e}"
            loop.call_soon_threadsafe(queue.put_nowait, {"type": "done"})
        threading.Thread(target=work, daemon=True).start()

        while True:
            try:
                msg = await asyncio.wait_for(queue.get(), timeout=5.0)
            except asyncio.TimeoutError:
                await ws.send_json({"type": "hb"})     # latido: sigo calculando
                continue
            if msg["type"] == "done":
                break
            await ws.send_json(msg)
        if "error" in result:
            await ws.send_json({"type": "error", "message": result["error"]})
        else:
            await ws.send_json({"type": "result", "result": result["value"]})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": f"{type(e).__name__}: {e}"})
        except Exception:
            pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass
