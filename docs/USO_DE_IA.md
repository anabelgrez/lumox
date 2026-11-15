# Uso de IA en Lumox

El reglamento de NASA Space Apps pide declarar el uso de inteligencia artificial. Esto es lo que usamos y para qué.

## Herramientas

| Herramienta | Para qué la usamos | Qué NO hizo |
|---|---|---|
| **Claude (Anthropic)**, como asistente de programación dentro de Claude Code | Escribir la mayor parte del código del backend (Python) y del front-end (React, Three.js) a partir de nuestra especificación; proponer la estructura del proyecto; redactar borradores de esta documentación; buscar y corregir errores al probar. | No eligió el problema ni la idea (MoonWindow/Lumox es del equipo). No inventó datos: todo número sale de JPL Horizons, de los kernels SPICE de NAIF o del relieve LOLA. |
| **Asistentes de IA generales** (uso del equipo durante la etapa de ideas) | Lluvia de ideas y relevamiento de otros proyectos del desafío, según consta en `ideas/` del repositorio del equipo. | — |
| **Generador de imágenes** | La imagen `referencia-ui.png` que usamos como objetivo de diseño. | La app no usa esa imagen: solo tomamos de ella la distribución de la pantalla. Sus números eran ilustrativos y no se copiaron. |

## Qué revisamos las personas del equipo

- La física y las fórmulas, contra las fuentes citadas en `DECISIONES.md` y en cada paso de la traza.
- Los resultados, con las pruebas automáticas y las comparaciones de `VERIFICACION.md`. La columna "Revisado por" de ese documento la completa una persona cuando lo revisa; si está vacía, nadie del equipo lo revisó todavía.

## La aplicación no usa IA

Lumox no tiene ningún modelo de lenguaje adentro. Las frases "en criollo", los comentarios de Lumo y las inferencias son **plantillas fijas** que se completan con los números que calculó el motor. Se pueden leer en `frontend/src/plain.js` y `frontend/src/Views.jsx`.

## Por qué lo decimos así

Preferimos que el jurado juzgue el proyecto por sus fuentes y sus pruebas, que son verificables, y no por quién escribió cada línea.
