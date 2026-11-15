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

**Resultado que nos sorprendió y confirma la idea:** en el borde de Shackleton, misión del 24 de enero al 7 de febrero de 2027, con mástil de 2 m hay Sol el 15,7 % del tiempo; con 3 m, 67,1 %; con 5 m, 95,0 %. Un metro de mástil cambia la misión.

## 9. Sin DEM, horizonte plano **declarado**

**Por qué:** preferimos dar un resultado optimista con un cartel rojo que no dar nada. Pero nunca sin cartel: la traza tiene un paso "MISSING DATA", la API lo informa, el panorama lo muestra y Lumo lo dice.

## 10. Export estático como respaldo de demo

**Elegimos:** `python -m lumox.export` guarda los escenarios preset con su traza en JSON; el front los usa si el backend no contesta y los marca como "precalculados".

**Por qué:** la demo no puede depender de que un servidor esté vivo en el momento del pitch.

## 11. Unidades con pint, constantes en un archivo

**Por qué:** la calculadora acepta valores del usuario; pint rechaza metros donde van segundos. Y si alguien pregunta "¿de dónde sale 1361?", `constants.py` dice Kopp & Lean 2011.

## 12. Front: React + Vite, SVG para 2D, Three.js para 3D

**Elegimos:** el stack del `lunar-navigator` (React 19 + Vite 7). El visor tiene dos modos con un botón: **2D** (panorama 360° del horizonte en SVG + mapa cenital del parche de terreno) y **3D** (Three.js). Cambiar de modo conserva sitio, fecha y hora.

**Por qué el SVG en 2D:** el panorama es lo que más mira un planificador; en SVG es nítido en un proyector, no necesita placa de video y cada elemento es inspeccionable.

**Por qué Three.js y no un globo 3D:** en la idea original descartamos el globo porque todos los equipos lo hacen y no responde ninguna pregunta. La escena local sí responde una: *¿cómo se ve el Sol rasante sobre este relieve a esta hora?* Alternativas: CesiumJS (pensado para la Tierra, pesado para un parche lunar) y Babylon.js (equivalente, pero el equipo conoce más Three.js).

**Cómo nos aseguramos de que el 3D diga lo mismo que el cálculo:**
- El terreno es el parche del mismo DEM que usa el horizonte, reducido a 97 × 97 puntos (250 m) para que ande en cualquier compu, con la caída por curvatura ya aplicada por el backend. No exageramos alturas.
- El Sol es una luz direccional en el vector que calculó el motor para esa hora, y su intensidad es la fracción de disco visible que también calculó el motor.
- El parche cubre 24 km, pero el horizonte se calcula hasta 150 km. Para que no falte lo de más lejos, dibujamos un **anillo** con el perfil θ(azimut) del motor. Así, en la vista "desde el módulo" se ve el mismo horizonte que en el panorama 2D.
- Límite que declaramos: las sombras que proyecta la GPU salen solo del parche de 24 km. Lo que tapa el Sol desde más lejos lo refleja la intensidad de la luz (que viene del cálculo), no una sombra dibujada.
- Si el equipo no tiene WebGL, el botón 3D se desactiva y se muestra el 2D.

## 13. Lumo, inferencias y "en criollo"

**Elegimos:** una mascota SVG propia, inferencias por reglas fijas y traducciones a lenguaje coloquial por cada paso (`plain.js`), en español y en inglés. Un interruptor **Simple / Técnico** decide qué se ve primero: la frase o la fórmula con unidades e incertidumbre.

**Por qué:** el desafío pide que sirva a docentes y público. No queríamos un chatbot que invente: cada frase es una plantilla sobre un número calculado ("El Sol está apenas 0,40° sobre el horizonte y esa loma mide 0,53°: lo tapa"), y cada inferencia lleva al paso de la traza del que sale.

**Animaciones:** cinco, una por concepto (horizonte, disco tapado, libración, batería, mástil/vecindario), de menos de 10 s, con pausa y respetando "reducir movimiento" del sistema. Son dibujos con valores de ejemplo y lo dicen; los números reales están en la traza.

## 14. La paleta de colores

**Elegimos:** fondo azul noche casi negro, paneles un tono más claros, azul (#2f80ff) como acento de la interfaz, y tres reglas con significado:
- **ámbar** = Sol (todo lo que es luz o energía);
- **azul** = Tierra (todo lo que es comunicación);
- **verde / amarillo / rojo** = solo el veredicto y la viabilidad. No se usan para decorar.

**Por qué:** en un panel de control el color tiene que decir algo. Si el rojo aparece solo cuando algo falla, se ve en un segundo. Tipografías: Inter Tight para títulos (alternativa libre a la de la referencia, que es paga), Inter para texto y Roboto Mono para números y fórmulas, para que las cifras no "bailen" al cambiar.

**Alternativa descartada:** un tema claro. Con proyector, el fondo oscuro cansa menos y hace resaltar el ámbar y el azul.

## 15. La mascota Lumo

**Elegimos:** un módulo lunar chiquito, dibujado por nosotros en SVG, con panel solar y antena, y tres caras: contento (sobrevive), preocupado (al límite) y dormido (no sobrevive, se quedó sin batería).

**Por qué:** le da a un docente o a un chico un personaje que cuenta lo que pasa en la pantalla con palabras simples y propone el siguiente paso ("Estamos en el límite. ¿Probamos otro sitio?"). La cara está atada al veredicto, así que tampoco es decoración. Se puede ocultar.

**Alternativa descartada:** un astronauta. Lumo es el módulo, que es justamente el que sufre la noche y el silencio.

## 16. Uso de IA

Ver `USO_DE_IA.md`. La aplicación en sí no usa IA.

---

## Qué mediría un revisor para destruirnos (y qué respondemos)

| Ataque | Respuesta |
|---|---|
| "Tu SPICE está mal configurado" | 5,4e-7° contra Horizons en 10 instantes. |
| "El DEM está mal proyectado" | Leemos el CRS del archivo; el sitio cae en el píxel correcto (z = 1730 m en el borde de Shackleton, consistente con LOLA). Pendiente: comparar 4 perfiles con Quickmap. |
| "Tu fracción de disco es un invento" | Fórmula cerrada al lado, diferencia < 5e-3. |
| "Sin DEM mentís" | Sin DEM hay cartel rojo en todos lados y paso MISSING DATA en la traza. |
| "Las coordenadas de los sitios son dudosas" | Cuatro de cinco están marcadas *sin reverificar* en la UI y en la API. |
