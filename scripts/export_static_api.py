"""Snapshot of the GET endpoints the front-end needs, for the static (GitHub Pages) build.

Run with the backend up on :8000:   python scripts/export_static_api.py
Writes frontend/public/static-api/<sanitized url>.json  (same naming rule as frontend/src/api.js staticKey()).
"""
import json
import re
import sys
from pathlib import Path

import httpx

BASE = "http://localhost:8000"
OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "static-api"


def key(url: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]", "_", url.lstrip("/")) + ".json"


def js(x):
    """Number as JavaScript prints it (-86.0 -> -86)."""
    return str(int(x)) if float(x).is_integer() else repr(float(x))


def save(c: httpx.Client, url: str) -> None:
    r = c.get(BASE + url, timeout=300)
    if r.status_code != 200:
        print(f"  skip {url} -> {r.status_code}")
        return
    (OUT / key(url)).write_text(r.text, encoding="utf-8")
    print(f"  ok   {url}")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    with httpx.Client() as c:
        for u in ("/api/status", "/api/sites", "/api/formulas", "/api/limits"):
            save(c, u)
        sites = c.get(BASE + "/api/sites").json()
        for s in sites:
            lat, lon = js(s["lat"]), js(s["lon"])
            save(c, f"/api/terrain?lat={lat}&lon={lon}&half_size_m=12000&n=97")
            save(c, f"/api/terrain?lat={lat}&lon={lon}&half_size_m=1500&n=201&fine=true")
            save(c, f"/api/features?lat={lat}&lon={lon}&radius_km=150&limit=80&psr_radius_m=13000")
    return 0


if __name__ == "__main__":
    sys.exit(main())
