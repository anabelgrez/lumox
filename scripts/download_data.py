"""Download the real data Lumox uses. Nothing is downloaded unless you pass a flag.

    python scripts/download_data.py --list            show what would be downloaded and sizes
    python scripts/download_data.py --kernels         NAIF SPICE kernels (~45.7 MB) -> data/kernels/
    python scripts/download_data.py --dem 80m         LOLA south-pole DEM 80 m/px (~115.5 MB) -> data/dem/
    python scripts/download_data.py --dem 20m         LOLA south-pole DEM 20 m/px (~1.85 GB)  -> data/dem/

Sources: NAIF generic kernels (naif.jpl.nasa.gov) and LOLA GDR polar products
(PDS Geosciences Node, pds-geosciences.wustl.edu).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1] / "data"
NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
PDS = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/"

KERNELS = [
    ("lsk/naif0012.tls", 5_257), ("pck/pck00011.tpc", 131_226), ("spk/planets/de440s.bsp", 32_726_016),
    ("pck/moon_pa_de440_200625.bpc", 12_863_488), ("fk/satellites/moon_de440_250416.tf", 19_478),
]
DEMS = {
    "80m": [("ldem_80s_80m.lbl", 4_986), ("ldem_80s_80m.img", 115_520_000)],
    "20m": [("ldem_80s_20m.lbl", 5_000), ("ldem_80s_20m.img", 1_848_320_000)],
}


def fetch(url: str, dest: Path, expected: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size == expected:
        print(f"  {dest.name}: already present")
        return
    print(f"  {dest.name}: downloading {expected / 1e6:.1f} MB from {url}")
    with httpx.stream("GET", url, follow_redirects=True, timeout=120) as r:
        r.raise_for_status()
        got = 0
        with open(dest, "wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk); got += len(chunk)
                if expected > 50_000_000 and got % (50 << 20) < (1 << 20):
                    print(f"    {got / 1e6:.0f} / {expected / 1e6:.0f} MB", flush=True)
    print(f"  {dest.name}: done ({dest.stat().st_size} bytes)")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--kernels", action="store_true")
    ap.add_argument("--dem", choices=sorted(DEMS))
    a = ap.parse_args()
    if a.list or not (a.kernels or a.dem):
        print("SPICE kernels -> data/kernels/  (total %.1f MB)" % (sum(s for _, s in KERNELS) / 1e6))
        for k, s in KERNELS:
            print(f"  {NAIF}{k}  {s / 1e6:.2f} MB")
        for key, files in DEMS.items():
            print(f"LOLA DEM {key} -> data/dem/  (total {sum(s for _, s in files) / 1e6:.1f} MB)")
            for k, s in files:
                print(f"  {PDS}{k}  {s / 1e6:.2f} MB")
        return 0
    if a.kernels:
        print("SPICE kernels:")
        for k, s in KERNELS:
            fetch(NAIF + k, ROOT / "kernels" / Path(k).name, s)
    if a.dem:
        print(f"LOLA DEM {a.dem}:")
        for k, s in DEMS[a.dem]:
            fetch(PDS + k, ROOT / "dem" / k, s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
