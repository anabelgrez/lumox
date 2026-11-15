# Cómo funciona Lumox (para quien no programa)

## La pregunta

Un módulo va a alunizar cerca del polo sur de la Luna. Funciona con paneles solares y habla con la Tierra por radio, en línea recta. Si el lanzamiento se atrasa unos días, **¿sigue teniendo Sol para cargar la batería y la Tierra a la vista para comunicarse?** Y si no, **¿cuánto margen hay?**

En el polo la respuesta cambia muchísimo con pocos días o pocos metros, porque el Sol pasa semanas casi pegado al horizonte, rozando las montañas.

## Los pasos, en orden

Cada paso de abajo aparece en la tabla **Cálculos en vivo** a medida que el motor lo calcula, con su fórmula, sus datos y de dónde salen.

| # | Paso | En palabras simples | Fórmula | Unidades |
|---|---|---|---|---|
| 1 | Posición del Sol y la Tierra | Para cada hora, hacia dónde mirar (azimut) y qué tan alto (elevación). | Kernels SPICE de NASA o JPL Horizons | grados, metros |
| 2 | Horizonte del terreno | En cada una de 360 direcciones, hasta dónde sube la loma más alta, mirando hasta 150 km. | θ = atan2(r_t·cos ψ − r_o, r_t·sin ψ), ψ = d/R | grados |
| 3 | Tamaño del Sol y de la Tierra | Cuánto miden en el cielo vistos desde la Luna. | ρ = asin(radio / distancia) | grados |
| 4 | Cuánto disco se ve | Qué parte del Sol (o de la Tierra) asoma por encima de las lomas: 0 nada, 1 entero. | Integración numérica del disco; control: f = [arccos(−x) + x√(1−x²)]/π | sin unidad |
| 5 | Energía que llega | Cuánta luz del Sol llega por metro cuadrado. | S = 1361 × (1 UA / r)² | W/m² |
| 6 | Potencia del panel | Lo que genera el panel en esa hora. | P = S · A · η · cos i · f | W |
| 7 | Batería | Hora por hora: entra lo del panel, sale lo que gasta el módulo. | E(k+1) = E(k) + (P − consumo) · 1 h, entre 0 y la capacidad | Wh |
| 8 | Métricas | % del tiempo con Sol, noche más larga, % con la Tierra visible, corte de comunicación más largo. | Conteo sobre las horas de la misión | %, h |
| 9 | Veredicto | Sobrevive si la noche más larga entra en la batería y el silencio más largo entra en el máximo permitido. | Comparación de dos números contra dos límites | — |
| 10 | Márgenes | Cuántos días se puede atrasar; cuánto Sol gana subir el panel; qué pasa unos km más allá. | Repetir los pasos 2 a 9 cambiando fecha, altura o lugar | días, m, km |

Símbolos: R = 1.737.400 m (radio lunar), d = distancia sobre la superficie, r_t = R + altura del terreno, r_o = R + altura del sitio + mástil, A = área del panel, η = eficiencia, i = ángulo entre el Sol y el panel, f = parte del disco visible.

## Un ejemplo de punta a punta, con números reales

Escenario: **borde del cráter Shackleton**, alunizaje el **24 de enero de 2027** (el caso del atraso de 9 días), misión de 14 días, mástil de 2 m, panel de 10 m² con 30 % de eficiencia, consumo de 500 W, batería de 20 kWh (40 h de autonomía), corte de comunicación máximo de 48 h. Efemérides de SPICE y relieve LOLA de 80 m.

Miramos la **hora 230** de la misión, **2 de febrero de 2027, 14:00 UTC**:

1. **Posición del Sol** (SPICE): azimut 22,617°, elevación **0,3982°**. Está casi en el horizonte, como siempre en el polo.
2. **Horizonte en esa dirección** (LOLA): el terreno llega a **0,5305°**. O sea, hay una loma un poco más alta que el centro del Sol.
3. **Tamaño del Sol**: radio **0,2709°**. El borde de arriba del Sol está a 0,3982 + 0,2709 = 0,669°, por encima de la loma.
4. **Cuánto disco se ve**: el motor cuenta los puntitos del disco sobre el terreno y da **f = 0,2292**: asoma el 23 % del Sol.
   - Control con la fórmula del segmento (que supone la loma recta): x = (0,3982 − 0,5305) / 0,2709 = −0,488 → f = 0,202. La diferencia (0,027) se debe a que la loma no es recta dentro del disco; la traza lo informa en la incertidumbre de ese paso.
5. **Energía que llega**: el Sol está a 0,9836 UA, así que S = 1361 × (1 / 0,9836)² = **1406,85 W/m²**.
6. **Potencia del panel** (con seguimiento del Sol, cos i = 1): P = 1406,85 × 10 × 0,30 × 1 × 0,2292 = **967,2 W**.
7. **Batería**: en esa hora está en **0 %**. Venía de una noche larga y recién ahora empieza a recibir algo.
8. **Métricas de los 14 días**: Sol el **15,7 %** del tiempo; noche más larga **230 h**; la Tierra no se ve en ningún momento (**0 %**); corte de comunicación **337 h** (toda la misión).
9. **Veredicto**: 230 h de noche contra 40 h de batería, y 337 h de silencio contra 48 h permitidas. **No sobrevive.**
10. **Margen en metros**: con el mástil a 3 m, el Sol pasa a 67,1 %; con 5 m, a 95,0 %. Un par de metros de mástil cambian la misión. Eso es lo que Lumox quiere mostrar.

Todos estos números se pueden ver en la app (Escenario → "Ejemplo: atraso de 9 días", hora 230 en el deslizador) y en la traza exportada a CSV.

## Qué no calcula

- La temperatura, la antena ni el sistema eléctrico en detalle: "viable" es solo luz y línea de vista.
- Paso de 1 hora: las salidas y puestas tienen ±30 min de precisión.
- Sin relieve cargado para un sitio, el horizonte se toma plano y la pantalla lo avisa en rojo.
