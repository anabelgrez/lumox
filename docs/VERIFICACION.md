# Verificación de los cálculos — Lumox v2

Auditoría de cada cálculo: cómo se verificó, qué dio la medición y cuándo. **Nada figura como verificado si la prueba no se ejecutó.**

- Las pruebas automáticas están en `backend/tests/` y se corren con `test.bat` (o `make test`).
- Fecha de la corrida que se informa: **2026-11-15**, en la computadora de desarrollo, con los kernels NAIF y el DEM `LDEM_80S_80M` presentes.
- **"Revisado por"** queda vacía a propósito: la completa una persona del equipo cuando revisa la fila de verdad (rerunea la prueba o repite la comparación) y pone su nombre y la fecha. Si está vacía, ninguna persona la revisó todavía.

## Cálculos

| # | Cálculo | Cómo se verificó | Resultado medido | Estado | Fecha | Revisado por |
|---|---|---|---|---|---|---|
| 1 | Efemérides con SPICE (azimut, elevación, distancia de Sol y Tierra) | Prueba automática `test_spice_against_horizons`: nuestro código SPICE contra el servicio de JPL Horizons, 10 instantes, borde de Shackleton | máx \|ΔAz\| = 5,4e-7°; máx \|ΔEl\| = 4,4e-8°; máx error relativo de distancia = 9,9e-9 | Pasa | 2026-11-15 | |
| 2 | Lectura de Horizons (parseo de la tabla, alineación de horas) | Prueba automática `test_provider_against_independent_horizons_queries`: misma consulta hecha de otra forma (TLIST, un instante por vez), 10 instantes × Sol y Tierra | diferencias 0 en azimut, elevación y distancia (20 muestras) | Pasa al correrla sola (41 s). **Falló una vez** dentro de la corrida completa del 2026-11-15; no se capturó el error. Sospecha (no confirmada): demora o corte de red con Horizons | 2026-11-15 | |
| 3 | Fracción de disco: casos límite | Pruebas `test_segment_limits` y `test_disc_fraction_limits_flat` | x = −1, 0, +1 → f = 0, 0,5, 1 exacto (1e-12) con la fórmula; integración numérica dentro de 2e-3 | Pasa | 2026-11-15 | |
| 4 | Fracción de disco: numérica vs. fórmula del segmento | Prueba `test_numerical_matches_segment_on_flat_horizon`, 61 elevaciones con horizonte recto | máx \|Δf\| < 5e-3 | Pasa | 2026-11-15 | |
| 5 | Fracción de disco con relieve real | Comparación numérica vs. segmento en el escenario Shackleton 15/01/2027 (aparece en la traza, paso `disc_sun`) | máx \|Δf\| = 0,065. Esperable: la fórmula del segmento supone la loma recta y el relieve real no lo es dentro del disco | Informativo, no es una prueba | 2026-11-15 | |
| 6 | Radio angular del Sol | Prueba `test_angular_radius_sun_at_1au` | 0,2665° a 1 UA (± 1e-3) | Pasa | 2026-11-15 | |
| 7 | Ángulo del horizonte (fórmula exacta) | Pruebas `test_horizon_curvature_drop` y `test_horizon_exact_vs_small_angle` | terreno plano queda bajo el horizonte; exacta vs. aproximación a 50 km: < 1e-3° | Pasa | 2026-11-15 | |
| 8 | Interpolación del horizonte (salto 359° → 0°) | Prueba `test_horizon_interpolation_periodic` | correcta | Pasa | 2026-11-15 | |
| 9 | Horizonte con LOLA: ubicación del sitio en el DEM | Lectura del DEM con su proyección polar estereográfica | altura del sitio 1730,5 m sobre la esfera de 1737,4 km; horizonte 0,00…2,86°; 100 % de los rayos dentro del DEM | Medido, sin comparación externa | 2026-11-15 | |
| 10 | Silueta del horizonte vs. LROC Quickmap | Perfil de Quickmap en 4 azimuts por sitio | — | **No ejecutado** | — | |
| 11 | % de iluminación vs. capa de iluminación polar de Quickmap | Comparar el % de Sol con la capa de Quickmap | — | **No ejecutado** | — | |
| 12 | Irradiancia | Prueba `test_irradiance_at_1au` | S = 1361 W/m² a 1 UA exacto | Pasa | 2026-11-15 | |
| 13 | Potencia del panel (con seguimiento y fijo) | Prueba `test_panel_power_tracking_and_fixed` | 500 W en el caso de prueba; 0 W con el Sol detrás del panel | Pasa | 2026-11-15 | |
| 14 | Balance de energía | Prueba `test_energy_balance_night_depletes` | 1000 Wh / 100 W → se vacía en 10 h, 40 h de déficit | Pasa (se encontró y corrigió un error de una hora de más en el déficit) | 2026-11-15 | |
| 15 | Métricas (rachas, cuenta regresiva) | Prueba `test_longest_run_and_metrics` | rachas y tiempos correctos en una serie armada a mano | Pasa | 2026-11-15 | |
| 16 | Veredicto | Prueba `test_verdict_states` | sobrevive / al límite / no sobrevive en los cuatro casos | Pasa | 2026-11-15 | |
| 17 | Calculadora = motor | Prueba `test_calculator_matches_engine` | mismos resultados que el motor | Pasa | 2026-11-15 | |
| 18 | Unidades | Prueba `test_units_dimensionality` (pint) | rechaza metros donde van segundos; 1 UA = 149.597.870.700 m | Pasa | 2026-11-15 | |
| 19 | Traza en vivo | Prueba `test_trace_streams_steps` + prueba manual del WebSocket (19 pasos emitidos en orden) | correcta | Pasa | 2026-11-15 | |
| 20 | Coordenadas de los sitios | Revisión contra fuente primaria | Apollo 17: NSSDC/LROC. Blue Ghost, Chandrayaan-3, Shackleton y Malapert: **sin reverificar** (marcados en la app) | **Pendiente** | — | |

## Resumen de la corrida completa (2026-11-15)

`pytest -v` con red: **21 pasaron, 1 falló** (fila 2; pasó al correrla sola). Sin pruebas salteadas.

## Cordura física (sin prueba automática)

| Qué esperamos | Qué medimos | Fecha |
|---|---|---|
| En el polo el Sol se mantiene a pocos grados del horizonte | Shackleton, 24/01–07/02/2027: elevación solar entre 0,28° y 0,67° | 2026-11-15 |
| La Tierra sube y baja con la libración (~27 días) | Shackleton, misma ventana: elevación de la Tierra entre −7,00° y +6,32° | 2026-11-15 |

## Prueba de comprensión con personas de afuera del equipo

**Criterio:** una persona que nunca vio Lumox abre el ejemplo (`http://localhost:5173/#ejemplo`) y, en 10 segundos y sin ayuda, puede decir si la misión sobrevive y por qué.

**Cómo hacerla:** con 3 a 5 personas que no conozcan el proyecto (por ejemplo, de otra mesa de la sede). Abrir el enlace, decir solo "mirá esta pantalla", cronometrar y preguntar dos cosas: "¿sobrevive?" y "¿por qué?". No explicar nada antes. La prueba pasa si al menos 4 de 5 responden bien las dos en menos de 10 s.

| # | Persona (sin nombre) | ¿Sobrevive? (respuesta) | ¿Por qué? (respuesta) | Segundos | ¿Correcto? | Dónde dudó | Anotó |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |

Todavía no se hizo.

## Cómo completar "Revisado por"

1. Correr `test.bat` (o la prueba de esa fila) y comparar con el resultado de la tabla.
2. Si coincide, poner nombre y fecha. Si no coincide, anotar lo que dio y avisar al equipo; no tocar la columna "Resultado medido" sin volver a correr.
