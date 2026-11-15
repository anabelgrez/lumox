"""Curated landing sites. Coordinates carry their source; `verified=False`
means the team has not yet re-checked them against a primary source and the
UI must say so.

Longitude is east-positive, degrees. Latitude degrees. Elevation (m) relative
to the 1737.4 km sphere; None means "take it from the DEM when available".
"""

from __future__ import annotations

from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class Site:
    id: str
    name: str
    lat: float
    lon: float
    category: str                 # apollo | clps | other-country | candidate
    source: str
    elevation_m: float | None = None
    verified: bool = True
    note: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


SITES: list[Site] = [
    Site("apollo17", "Apollo 17 (Taurus-Littrow)", 20.1911, 30.7723, "apollo",
         "NASA NSSDC / LROC coordinates of the Apollo 17 LM", 0.0, True,
         "Equatorial reference site: contrast with the polar cases."),
    Site("blueghost1", "Blue Ghost M1 (Mare Crisium)", 18.562, 61.81, "clps",
         "Firefly Aerospace / NASA CLPS press material, March 2025", 0.0, False,
         "Coordinates from press material; re-verify against LROC."),
    Site("chandrayaan3", "Chandrayaan-3 (Shiv Shakti)", -69.373, 32.319, "other-country",
         "ISRO announcement, Aug 2023; LROC NAC confirmation", 0.0, False,
         "High-latitude southern site."),
    Site("shackleton", "Shackleton crater rim", -89.78, -155.73, "candidate",
         "Approximate rim location used in NASA Artemis site studies", None, False,
         "Polar candidate. Coordinates approximate; horizon dominated by crater rim."),
    Site("malapert", "Malapert Massif", -86.0, 0.0, "candidate",
         "Approximate summit location; NASA Artemis III candidate region", None, False,
         "Polar candidate. Coordinates approximate."),
]

SITE_BY_ID = {s.id: s for s in SITES}


def get_site(site_id: str) -> Site:
    try:
        return SITE_BY_ID[site_id]
    except KeyError:
        raise KeyError(f"unknown site '{site_id}'; known: {sorted(SITE_BY_ID)}") from None
