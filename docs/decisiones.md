# Por qué elegimos cada cosa — Lumox v2

Documento del equipo Lunáticos para explicar (a nosotros mismos, al jurado y a quien se sume) las decisiones de diseño. Cada punto dice qué elegimos, qué alternativas había y por qué nos quedamos con esto. Los números que aparecen son medidos, no estimados.

---

## 1. Un solo motor de cálculo, en Python, y el front no calcula nada

**Elegimos:** todo el cálculo vive en `backend/lumox`. El front-end (React) solo dibuja lo que recibe.

**Alternativas:** calcular en el navegador (como hacía `referencia/lunar-navigator`, que pedía a Horizons desde el browser y hacía cuentas en JS).

**Por qué:** si hay una sola fuente de verdad, no hay dos versiones de la misma fórmula que se desincronicen. Y si un científico quiere auditar un número, hay un solo lugar donde mirar. Python además tiene las librerías serias para esto (NumPy, spiceypy, rasterio, pyproj, pint). El costo es que la app necesita un backend corriendo; lo resolvemos con el export estático (punto 10).

## 2. Cada cálculo emite su traza

**Elegimos:** `trace.py`. Cada paso registra id, nombre, fórmula en LaTeX, entradas (valor, unidad, fuente), resultado, supuestos, incertidumbre y de qué pasos depende. Se emite en vivo por WebSocket y se exporta en CSV/JSON.

**Por qué:** el desafío pide una herramienta para planificadores de misión. Un planificador no acepta un número sin saber de dónde salió. La traza también nos obliga a nosotros a declarar supuestos (por ejemplo, "horizonte plano porque falta el DEM") en vez de esconderlos. Es la diferencia entre "la app dice 64 %" y "64 % sale de contar horas con f > 0 sobre 337 muestras de Horizons".

## 3. Efemérides: SPICE primero, Horizons como alternativa

**Elegimos:** `ephemeris/spice.py` con kernels oficiales NAIF (DE440, orientación lunar `moon_pa_de440`, marco `MOON_ME`), corrección `LT+S`. Si no hay kernels, `ephemeris/horizons.py` consulta la API de JPL Horizons con caché en disco.

**Alternativas:** fórmulas propias de posición solar (demasiado imprecisas para el polo, donde 0,1° cambia todo), o solo Horizons (depende de internet).

**Por qué:** SPICE es lo que usa NASA para operar misiones; con kernels locales la demo no depende de la red. Horizons usa el mismo DE440 por debajo, así que sirve de control cruzado: **medimos 5,4e-7° de diferencia en azimut y 4,4e-8° en elevación** entre nuestro SPICE y el servicio de JPL en 10 instantes. Esa cifra es la validación más fuerte que tenemos: dos implementaciones independientes, mismo resultado.

**Marco MOON_ME y no MOON_PA:** las coordenadas de sitios (LROC, LOLA) están en el sistema "eje medio de la Tierra" (ME). Usar PA metería un giro de ~1 km en la posición del sitio.

## 4. Horizonte del terreno: fórmula exacta sobre la esfera, sin ángulo pequeño

**Elegimos:** θ = atan2(r_t·cos ψ − r_o, r_t·sin ψ), con ψ = d/R. Rayos por círculo máximo, 360 azimuts, hasta 150 km, un punto por píxel del DEM.

**Alternativas:** la aproximación clásica θ ≈ atan(h/d − d/2R).

**Por qué:** la aproximación anda bien (la probamos: < 1e-3° a 50 km), pero la exacta cuesta lo mismo y no deja dudas. 150 km porque más allá la curvatura hunde el terreno 6,5 km y ya ninguna montaña lunar asoma.

**DEM:** LOLA `LDEM_80S_80M` (115 MB) y no el de 20 m (1,85 GB): a 80 m/px un píxel a 1 km subtiende 4,6°, pero a 10 km subtiende 0,46° y las crestas que tapan el Sol en Shackleton están a decenas de km. Para el hackathon es el equilibrio entre peso y precisión; el código acepta el de 20 m sin cambios.

**Lectura del DEM:** con su propia proyección (polar estereográfica, `pyproj`) en vez de suponer lat/lon rectangulares. Cerca del polo, suponer eso rompe todo.

## 5. Fracción del disco: integración numérica + fórmula de control

**Elegimos:** pintar el disco con 48 anillos × 96 sectores de igual área y contar los puntos sobre el horizonte interpolado. Al lado, la fórmula del segmento circular como control.

**Por qué:** en el polo el Sol pasa semanas rozando crestas; "arriba/abajo" no sirve. La integración numérica respeta que el horizonte no es recto dentro del disco; la fórmula cerrada verifica que no hicimos macana (diferencia < 5e-3 en los tests). El radio angular es el real de cada hora (ρ = asin(R/Δ)), no una constante.

## 6. Energía: simple y declarado

**Elegimos:** S = S₀(AU/r)², P = S·A·η·cos i·f, balance horario con batería acotada.

**Por qué:** el desafío pide evaluar generación de energía, no diseñar el sistema eléctrico. Lo que no modelamos (temperatura, degradación, eficiencia de carga) está escrito en los supuestos de cada paso y en los límites.

## 7. Paso de 1 hora

**Por qué:** Horizons y SPICE dan lo que les pidas, pero el relieve de 80 m y la física de la misión no justifican más. Los eventos quedan a ±30 min y lo decimos. Cambiarlo es un parámetro (`step_h`).

## 8. Los tres márgenes

**Elegimos:** días (corremos la fecha de a un día hasta 30), metros (mástil de 2 a 10 m recalculando el horizonte), kilómetros (grilla 5 × 5 a 2 km recalculando el horizonte por punto).

**Por qué:** es nuestra respuesta a "¿y si se atrasa?", que ninguno de los repos que relevamos contesta. Para la grilla reutilizamos la efeméride del centro: el error por paralaje es ≤ 9e-4° para la Tierra y lo declaramos en la traza.

**Resultado que nos sorprendió y confirma la idea:** en el borde de Shackleton con mástil de 2 m hay Sol el 15,7 % del tiempo; con 3 m, 67 %; con 5 m, 95 %. Un metro de mástil cambia la misión.

## 9. Sin DEM, horizonte plano **declarado**

**Por qué:** preferimos dar un resultado optimista con un cartel rojo que no dar nada. Pero nunca sin cartel: la traza tiene un paso "MISSING DATA", la API lo informa, el panorama lo muestra y Lumo lo dice.

## 10. Export estático como respaldo de demo

**Elegimos:** `python -m lumox.export` guarda los escenarios preset con su traza en JSON; el front los usa si el backend no contesta y los marca como "precalculados".

**Por qué:** la demo no puede depender de que un servidor esté vivo en el momento del pitch.

## 11. Unidades con pint, constantes en un archivo

**Por qué:** la calculadora acepta valores del usuario; pint rechaza metros donde van segundos. Y si alguien pregunta "¿de dónde sale 1361?", `constants.py` dice Kopp & Lean 2011.

## 12. Front: React + Vite (el stack de la referencia), SVG para el panorama, Three.js para la escena 3D

**Elegimos:** mantener el stack del `lunar-navigator` (React 19 + Vite 7). Panorama 360° en SVG puro. Escena 3D con Three.js usando el parche real del DEM, el Sol como luz direccional en su posición real y sombras calculadas por la GPU.

**Por qué el SVG:** el panorama es el gráfico que más mira un planificador; en SVG es nítido en un proyector y cada elemento es inspeccionable.

**Por qué Three.js ahora y no un globo 3D:** en la idea original descartamos el globo porque todos los equipos lo hacen y no responde ninguna pregunta. La escena local sí responde una: *¿cómo se ve el Sol rasante sobre este relieve a esta hora?* Las sombras no son decoración: salen de la misma dirección solar que usa el motor. No exageramos alturas.

## 13. Lumo, inferencias y "en criollo"

**Elegimos:** una mascota SVG original, inferencias por reglas fijas y traducciones a lenguaje coloquial por cada paso (`plain.js`). Sin modelo de lenguaje dentro de la app.

**Por qué:** el desafío pide que sirva a docentes y público. Pero no queríamos un chatbot que invente: cada frase es una plantilla sobre un número calculado, y cada inferencia tiene un botón que lleva al paso de la traza del que sale.

## 14. Uso de IA

Escribimos este código con Claude (Anthropic) como asistente de programación, bajo nuestra dirección y a partir de nuestra especificación. Lo declaramos en el README. La aplicación en sí no usa IA. Decidimos no "disimular" esto: la validez de un cálculo se juzga por sus fuentes y sus pruebas, no por quién tipeó.

---

## Qué mediría un revisor para destruirnos (y qué respondemos)

| Ataque | Respuesta |
|---|---|
| "Tu SPICE está mal configurado" | 5,4e-7° contra Horizons en 10 instantes. |
| "El DEM está mal proyectado" | Leemos el CRS del archivo; el sitio cae en el píxel correcto (z = 1730 m en el borde de Shackleton, consistente con LOLA). Pendiente: comparar 4 perfiles con Quickmap. |
| "Tu fracción de disco es un invento" | Fórmula cerrada al lado, diferencia < 5e-3. |
| "Sin DEM mentís" | Sin DEM hay cartel rojo en todos lados y paso MISSING DATA en la traza. |
| "Las coordenadas de los sitios son dudosas" | Cuatro de cinco están marcadas *sin reverificar* en la UI y en la API. |
