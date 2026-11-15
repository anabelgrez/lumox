# Fuentes y recursos externos — Lumox

Cada recurso externo, con su enlace, condiciones de uso y para qué lo usamos. Todos se verificaron (enlace, peso y condiciones) el 2026-11-15 antes de descargarse.
Ningún recurso incluido muestra el logo ni la insignia de NASA. Lumox no es un producto oficial de NASA ni está respaldado por NASA.

Condiciones generales de NASA ([Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)): el material de NASA, incluidas texturas y modelos 3D, en general no tiene copyright en EE. UU. y puede usarse de manera fáctica sin sugerir respaldo. El logo, la insignia y los identificadores de NASA **no** son de dominio público.

## Datos que usa el motor de cálculo

| Recurso | Enlace | Condiciones | Uso |
|---|---|---|---|
| JPL Horizons | https://ssd.jpl.nasa.gov/horizons/ | Servicio público de NASA/JPL | Posición del Sol y la Tierra (alternativa y validación) |
| Kernels SPICE de NAIF (naif0012.tls, pck00011.tpc, de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf) | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ | Públicos, NASA/JPL NAIF | Posición del Sol y la Tierra (principal) |
| LOLA LDEM_80S_80M (80 m/px, polo sur) | https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ | NASA PDS Geosciences Node | Horizonte del terreno |

## Recursos solo para el visor (no cambian ningún número)

| Archivo | Enlace | Condiciones y crédito | Peso | Uso |
|---|---|---|---|---|
| `lroc_color_2k.jpg` | [CGI Moon Kit, NASA SVS 4720](https://svs.gsfc.nasa.gov/4720) | Dominio público (NASA SVS). Crédito: NASA's Scientific Visualization Studio, Ernie Wright; datos LRO/LROC | 0,46 MB | Textura de la Luna de contexto (recuadro del 3D) |
| `ldem_3_8bit.jpg` | ídem | ídem; datos LRO/LOLA | 0,11 MB | Relieve de la Luna de contexto |
| `earth_blue_marble_5400.jpg` (world.topo.bathy.200412, 5400 × 2700) | [NASA Visible Earth 73909](https://visibleearth.nasa.gov/images/73909) | NASA Earth Observatory, Reto Stöckli; sin copyright en EE. UU., con crédito | 2,57 MB | Esfera de la Tierra (con su fase) |
| `apollo_lunar_module.glb` | [NASA 3D Resources](https://science.nasa.gov/3d-resources/apollo-lunar-module/) · [GitHub](https://github.com/nasa/NASA-3D-Resources) | "Free and without copyright" según el repositorio. Revisamos sus texturas: bandera de EE. UU. y el rótulo "UNITED STATES"; **sin logo de NASA** | 0,72 MB | Módulo en el sitio, rotulado "modelo ilustrativo" (es un Módulo Lunar Apollo, no el de una misión CLPS) |
| `Site04_final_adj_5mpp_surf.tif` (LOLA 5 m/px, Shackleton rim) | [PGDA product 78](https://pgda.gsfc.nasa.gov/products/78) | NASA GSFC PGDA. Cita: Barker, M. K., et al. (2021), *Planetary and Space Science* 203, 105119, doi:10.1016/j.pss.2020.105119 | 41,0 MB (fuera de git, en `data/dem_site/`) | Terreno fino de 3 km alrededor del módulo, solo visual |
| `Site23_final_adj_5mpp_surf.tif` (LOLA 5 m/px, Malapert massif) | ídem | ídem | 70,6 MB (fuera de git) | ídem para Malapert |

Descargado y descartado: `lroc_color_poles_2k.tif` (CGI Moon Kit). Los navegadores no leen TIFF y la página no documenta la proyección, así que no podíamos ubicarlo con precisión sobre el terreno.

## Por qué el DEM de 5 m no entra al cálculo

Usarlo cambiaría todos los resultados y la validación de `VERIFICACION.md`, que está hecha con el de 80 m. Además cubre solo dos de los cinco sitios. Es una decisión que el equipo puede tomar después, a propósito y volviendo a validar. Por eso los archivos están en `data/dem_site/`, una carpeta que el motor no mira.

## Software

Three.js (MIT), React (MIT), Vite (MIT), FastAPI (MIT), NumPy (BSD), SpiceyPy (MIT), rasterio (BSD), pyproj (MIT), pint (BSD). Fuentes tipográficas Inter, Inter Tight y Roboto Mono (SIL Open Font License), vía Google Fonts.
