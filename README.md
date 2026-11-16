## Live demo · Demo en vivo

**https://anabelgrez.github.io/lumox/**

> ⚠️ **EN:** This GitHub Pages demo is **static** and runs on **simulated, precomputed data**.
> It does not run the calculation engine; it shows exported scenarios. For real-time
> calculation with JPL Horizons ephemerides, run it locally (`dev.bat`, or `make setup && make dev`).
>
> ⚠️ **ES:** Esta demo en GitHub Pages es **estática** y usa **datos simulados y precalculados**.
> No ejecuta el motor de cálculo; muestra escenarios ya exportados. Para el cálculo en
> tiempo real con efemérides de JPL Horizons, ejecútalo en local (`dev.bat`, o `make setup && make dev`).

### What is Lumox? · ¿Qué es Lumox?

**EN:** If a south-pole Moon landing slips, how much margin is left before the lander runs out
of sunlight or loses line of sight to Earth? Lumox answers in days, metres of mast and
kilometres of ground. Every number comes with a trace (formula, inputs with units and sources,
assumptions, uncertainty) that can be reviewed and exported.

**ES:** Si un alunizaje en el polo sur lunar se retrasa, ¿cuánto margen queda antes de que el
módulo se quede sin luz solar o pierda la línea de vista con la Tierra? Lumox responde en días,
metros de mástil y kilómetros de terreno. Cada número trae su traza (fórmula, entradas con
unidades y fuentes, supuestos e incertidumbre) para revisarla y exportarla.

### Tech stack · Tecnologías

| | EN | ES |
|---|---|---|
| **Frontend** (display only) | React 19, Vite 7: interface and build. Three.js: 3D view of terrain, Moon and lander. NASA textures and 3D model (LROC, LOLA, Blue Marble, Apollo LM). | React 19, Vite 7: interfaz y compilación. Three.js: vista 3D del terreno, la Luna y el módulo. Texturas y modelo 3D de NASA (LROC, LOLA, Blue Marble, Apollo LM). |
| **Backend** (local only) | Python 3.11+, FastAPI, Uvicorn: REST API and live WebSocket. NumPy: numerics. pint: units. spiceypy (NAIF SPICE): Sun and Earth positions. rasterio, pyproj: LOLA elevation models and projections. pytest: tests. | Python 3.11+, FastAPI, Uvicorn: API REST y WebSocket en vivo. NumPy: cálculo. pint: unidades. spiceypy (NAIF SPICE): posiciones del Sol y la Tierra. rasterio, pyproj: modelos de elevación LOLA y proyecciones. pytest: pruebas. |
| **Data & APIs** | JPL Horizons API (disk-cached ephemerides), NAIF SPICE kernels (DE440, lunar libration), LOLA DEMs (NASA). | API JPL Horizons (efemérides con caché en disco), kernels NAIF SPICE (DE440, libración lunar), DEMs LOLA (NASA). |

### Backend API · API del backend
`POST /api/scenario` · `GET /api/trace/{id}` · `WS /ws/scenario` · `POST /api/calc/{formula}` ·
`GET /api/formulas` · `GET /api/sites` · `GET /api/status`. Docs at / Documentación en `/docs`.

### Status · Estado
**EN:** Presented as a **demo** on GitHub Pages. NASA Space Apps Challenge 2026 · Santiago del Estero · Team *Lunáticos* · Challenge *Lunar Landing Site Navigator*.
**ES:** Presentado como **demo** en GitHub Pages. NASA Space Apps Challenge 2026 · Santiago del Estero · Equipo *Lunáticos* · Reto *Lunar Landing Site Navigator*.
