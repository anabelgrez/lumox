# Lumox v2

**If a south-pole Moon landing slips, how much margin is left?**
Lumox answers in days, in metres of mast and in kilometres of ground — before the lander runs out of sunlight or loses line of sight to Earth.

NASA Space Apps Challenge 2026 · Santiago del Estero · Team *Lunáticos* · Challenge *Lunar Landing Site Navigator*.

- One calculation engine (Python). The front-end computes nothing: every number on screen comes from the backend with a **trace** (formula, inputs with units and sources, result, assumptions, uncertainty, dependencies) that scientists and engineers can open, follow and export.
- Real data only: JPL Horizons or NAIF SPICE kernels for the Sun and the Earth, LOLA DEMs for the terrain. If a dataset is missing, the screen says so; nothing is filled in.

---

## Architecture

```
lumox-v2/
├── backend/            Python 3.11+ · FastAPI · NumPy · pint · spiceypy · rasterio · pyproj · pytest
│   ├── lumox/
│   │   ├── constants.py      every constant with value, unit and source (single place)
│   │   ├── units.py          pint registry + dimensional checks
│   │   ├── trace.py          Step / Trace, live listeners, CSV/JSON export
│   │   ├── ephemeris/        horizons.py (HTTP, disk cache) · spice.py (NAIF kernels, MOON_ME, LT+S)
│   │   ├── horizon.py        terrain horizon from a LOLA DEM, exact on the sphere; flat fallback (declared)
│   │   ├── visibility.py     angular radius, numerical disc fraction + analytic segment check
│   │   ├── energy.py         irradiance, panel power, hourly energy balance
│   │   ├── metrics.py        sunlight %, longest night, Earth %, longest gap, countdown, verdict
│   │   ├── margins.py        margin in days / metres / kilometres
│   │   ├── scenario.py       orchestration: one call → results + one trace
│   │   ├── formulas.py       formula catalogue for the mission calculator
│   │   ├── api.py            REST + WebSocket
│   │   └── export.py         static JSON for the demo fallback
│   └── tests/
├── frontend/           Vite + React 19 (same stack as the reference). Display only.
├── data/               kernels/, dem/, cache/ — real data, outside git
├── referencia/         the previous "lunar-navigator" app (zip from ideas/), untouched, used as reference
├── scripts/download_data.py   downloads the real data (only with explicit flags)
├── dev.bat · test.bat · export.bat · Makefile
└── README.md
```

### Data flow

`site + date + mission parameters` → **ephemeris** (az/el/range of Sun and Earth, hourly) → **terrain horizon** θ(A) → **visible disc fraction** f(t) for Sun and Earth → **irradiance / power / energy balance** → **metrics** → **verdict** → **margins**. Every arrow is a trace step; the WebSocket streams them as they are computed.

---

## How to run

Requirements: Python 3.11+, Node.js 20+. Windows: `dev.bat`. Unix: `make setup && make dev`.

```
dev.bat                 # installs on first run; backend on :8000, frontend on :5173
test.bat                # pytest, including JPL Horizons validation (network)
test.bat offline        # pytest without network tests
export.bat              # precompute preset scenarios → frontend/public/scenarios/ (demo fallback)
```

Backend API docs: http://localhost:8000/docs

| Endpoint | What |
|---|---|
| `POST /api/scenario` | results + `trace_id` |
| `GET /api/trace/{id}?format=json\|csv&full=1` | the full trace, exportable |
| `WS /ws/scenario` | send the spec; receive each step live, then the result |
| `POST /api/calc/{formula}` | mission calculator: any engine formula with your inputs; optional `trace_id` saves it in the scenario trace |
| `GET /api/formulas` | catalogue of formulas, variables, units, sources |
| `GET /api/sites`, `/api/status`, `/api/limits` | sites, data availability, declared limits |

If the backend does not answer, the front-end loads the precomputed JSON and labels it **"precomputed data"**.

### Real data (downloaded only when you ask)

```
python scripts/download_data.py --list
python scripts/download_data.py --kernels     # NAIF: naif0012.tls, pck00011.tpc, de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf  (45.7 MB)
python scripts/download_data.py --dem 80m     # LOLA LDEM_80S_80M (south pole, 80 m/px, 115.5 MB)
python scripts/download_data.py --dem 20m     # LOLA LDEM_80S_20M (1.85 GB)
```

- Without kernels the engine uses the **JPL Horizons API** (cached on disk) — same physics source (DE ephemeris, lunar libration, light time + aberration, airless).
- Without a DEM the horizon is **flat (θ = 0)** and every screen says so; sunlight %, Earth visibility and night length are then optimistic. The margins in metres and kilometres need the DEM to vary.

---

## Sources and formulas

| Quantity | Formula | Source / method |
|---|---|---|
| Sun / Earth position | `spkcpo(body, t, MOON_ME, LT+S, observer)` → ENU → azimuth, elevation | NAIF SPICE, DE440, lunar PA/ME frames; or Horizons `QUANTITIES=4,20`, `APPARENT=AIRLESS`, `CENTER=coord@301` |
| Terrain elevation angle | θ(d) = atan2(r_t cos ψ − r_o, r_t sin ψ), ψ = d/R, r_t = R + z_t, r_o = R + z_s + h; horizon = max over d ≤ 150 km, 360 azimuths | exact on the sphere, R = 1 737 400 m (IAU 2015); LOLA GDR read through its own projection (pyproj/rasterio) |
| Angular radius | ρ = asin(R_b / Δ) | R_sun 695 700 km (IAU 2015 B3), R_earth 6 371.0088 km |
| Visible disc fraction | numerical integration of the disc against θ(A); check: f = [arccos(−x) + x√(1−x²)]/π, x = (h − θ)/ρ | uniform disc (limb darkening ignored) |
| Irradiance | S = S₀ (AU / r)² | S₀ = 1361 W/m² (Kopp & Lean 2011), AU IAU 2012 |
| Panel power | P = S · A · η · cos i · f | i = 0 tracking, else cos i = max(0, n̂·ŝ) |
| Energy balance | E_{k+1} = clip(E_k + (P_k − P_load) Δt, 0, C) | constant load, 100 % efficiency |
| Metrics | sunlight % = share of hours with f > 0; longest night; Earth %; longest gap; countdown | Δt = 1 h |
| Verdict | survives if T_night ≤ T_aut and T_gap ≤ T_gap,max; marginal within 10 % | compares numbers, does not simulate the battery |
| Margin in days | consecutive whole-day delays that stay viable; best 3 alternatives | daily scan over 30 days |
| Margin in metres | horizon recomputed for mast 2…10 m | needs DEM |
| Margin in kilometres | 5 × 5 grid at 2 km; horizon recomputed per point; centre ephemeris reused (parallax ≤ 9e-4° for Earth) | needs DEM |

All constants live in `backend/lumox/constants.py` with their source. All arithmetic is float64; inputs to the calculator are checked with pint.

---

## Validation (measured)

Run `test.bat` — the numbers below are what the suite measured on 2026-11-15.

| What | Against | Result |
|---|---|---|
| Horizons provider (parsing, epoch alignment, units) | independent single-epoch `TLIST` Horizons queries, Sun and Earth, 10 epochs | max \|ΔAz\| = 0, max \|ΔEl\| = 0, max rel. range diff = 0 (20 samples) |
| **SPICE (our code) vs Horizons (JPL service)** — independent implementations | 10 epochs, Shackleton rim, Sun and Earth | max \|ΔAz\| = 5.4e-7°, max \|ΔEl\| = 4.4e-8°, max rel. range diff = 9.9e-9 |
| Disc fraction limits | x = −1, 0, +1 → f = 0, 0.5, 1 | exact (1e-12) analytic; numerical within 2e-3 |
| Numerical vs analytic disc fraction | 61 elevations across the horizon, flat horizon | max \|Δf\| < 5e-3 |
| Horizon formula | curvature drop of flat ground; exact vs small-angle at 50 km | agree to < 1e-3 ° |
| Angular radius of the Sun at 1 AU | 16.0′ | 0.2665° ± 1e-3 |
| Physical sanity (Shackleton rim, 15 Jan – 14 Feb 2027, 14-day window) | Sun stays within a few degrees of the horizon; Earth oscillates with the ~27-day libration cycle | Sun elevation 0.28…0.67°; Earth elevation −7.00…+6.32° (measured from the exported scenario; the Validation tab shows the loaded one) |
| Terrain horizon with LOLA `LDEM_80S_80M` (Shackleton rim, mast 2 m) | DEM read through its own polar-stereographic CRS | site height 1730.5 m above the 1737.4 km sphere; horizon 0.00…2.86°; 100 % of ray samples inside the DEM |
| Margin in metres (Shackleton rim, 24 Jan 2027 + 14 d) | engine | sunlight 15.7 % at 2 m → 67.1 % at 3 m → 95.0 % at 5 m |
| Horizon silhouette vs LROC Quickmap | 4 azimuths per site | **not measured yet** |
| Units | pint dimensionality | pass |

Suite status (2026-11-15, kernels and DEM present): **22 passed, 0 skipped** (`test.bat`). A full scenario with margins takes ~60 s with SPICE + DEM (33 horizon recomputations); ~7 s with Horizons cache and flat horizon.

---

## Limits (declared on screen too)

- "Viable" is geometry: sunlight and line of sight. No thermal model, no antenna model, no detailed power system.
- 1-hour step: events are resolved to ± 30 min.
- DEM resolution bounds the horizon; an unresolved boulder can hide the Sun. Without a DEM the horizon is flat and the result optimistic.
- Limb darkening ignored; panel efficiency constant.
- Site coordinates marked *not re-verified* come from press or approximate sources; the UI flags them.
- Not an official NASA tool. No NASA logo or copyrighted material is used.

Out of scope: 3D globe, AI chatbot, thermal model, user accounts, mobile app.

---

## Why we chose each thing

See [docs/decisiones.md](docs/decisiones.md) (Spanish): every design decision with its alternatives and the measured numbers behind it.

## Front-end

**3D scene (Three.js):** the real DEM patch around the site (24 km, no vertical exaggeration, served by `GET /api/terrain`), the lander with its mast, the Sun as a directional light at its real azimuth/elevation for the selected hour (intensity scaled by the computed visible-disc fraction) and the Earth on the sky. Shadows on the relief come from the real Sun direction. A fixed fill light keeps the terrain readable at night; it is labelled as a visual aid.

**Teaching mode:** every trace step has a plain-language version ("en criollo", `src/plain.js`, templates over the computed numbers), shown in the step modal and under each live step; four animated 2D explainers (horizon angle, disc fraction, battery as a bank account, libration) sit between the panorama and the cards.

Top bar (site, date, duration, mast, autonomy, max gap, language, **See example** = 9-day delay) · 360° horizon panorama with Sun and Earth, hour slider, lunar-day animation, countdown · metric cards and verdict (each number opens its trace step) · **Live calculations** panel with CSV/JSON export · heat map site × date · the three margins · side-by-side comparison · Science / Engineering views with requirements and the agreement zone · rule-based inferences linked to steps · mission calculator on `/api/calc` · shareable link (scenario in the URL) · validation, limits and credits · **Lumo**, an original SVG mascot (lunar module with solar panel and antenna; happy / worried / asleep by verdict) that explains the screen with templates over the numbers and guides the example in 4 steps. Dark lunar theme, amber Sun, blue Earth, green/yellow/red only for the verdict, monospaced numbers, CSS variables, responsive.

## Use of AI

This repository was written with Claude (Anthropic) working as a coding assistant under the team's direction, from the team's specification (`referencia/` and the MoonWindow/Lumox idea documents). The application itself contains no language model: inferences are fixed rules and Lumo's sentences are templates over computed values. All physics, constants and data sources are cited above and inside each trace step.

## Credits

JPL Horizons (NASA/JPL SSD) · NAIF SPICE toolkit and generic kernels · LOLA (LRO) DEMs, PDS Geosciences Node · LROC Quickmap (ASU) · IAU 2015 nominal radii · Kopp & Lean (2011) total solar irradiance.
