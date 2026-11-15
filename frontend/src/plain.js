// "En criollo": cada paso de la traza traducido a una frase simple, armada con
// plantillas sobre los números que ya calculó el motor. Acá no se calcula nada,
// solo se redactan los resultados. Si un paso no tiene plantilla, se muestra la
// descripción técnica y listo.

const n = (v, d = 1) => (typeof v === "number" ? v.toFixed(d) : "—");
const arr = (v) => (v && v.array ? v : null);

export function plain(step, lang = "es") {
  if (!step) return "";
  const es = lang === "es";
  const r = step.result?.value;
  const inp = Object.fromEntries((step.inputs || []).map((i) => [i.name, i.value]));
  const id = step.id.replace(/#\d+$/, "");
  const sr = arr(r);

  switch (id) {
    case "scenario":
      return es ? "Acá arranca todo: el sitio, la fecha, cuántos días dura la misión y los límites que vos pusiste." : "This is where it starts: site, date, mission length and the limits you set.";
    case "site_unverified":
      return es ? "Ojo con esto: las coordenadas de este sitio salieron de prensa o de un mapa aproximado, todavía nadie las chequeó contra una fuente oficial." : "Heads-up: these coordinates came from press or an approximate map; nobody has checked them against an official source yet.";
    case "ephemeris":
      return es ? `Le preguntamos a ${inp.kernels ? "los kernels de NASA (SPICE)" : "JPL Horizons"} dónde está el Sol y dónde está la Tierra, hora por hora, vistos desde el sitio. Nos da la dirección (azimut), qué tan alto sobre el horizonte (elevación) y la distancia. Incluye el "cabeceo" de la Luna (libración), que es lo que hace que la Tierra suba y baje cada ~27 días.`
        : `We ask ${inp.kernels ? "NASA's kernels (SPICE)" : "JPL Horizons"} where the Sun and the Earth are, hour by hour, as seen from the site: direction (azimuth), height above the horizon (elevation) and distance. It includes the Moon's wobble (libration), which makes the Earth rise and set every ~27 days.`;
    case "horizon":
      if (!sr) return es ? "No hay relieve cargado, así que asumimos que el horizonte es una línea plana. Eso es optimista: las montañas de verdad tapan Sol." : "No terrain loaded, so the horizon is taken as a flat line. That is optimistic: real mountains block the Sun.";
      return es ? `Miramos el relieve real (LOLA) en 360 direcciones, hasta 150 km, y en cada dirección anotamos qué tan alto llega la montaña más alta. Acá el horizonte sube hasta ${n(sr.max, 2)}° (y baja a ${n(sr.min, 2)}° donde el terreno cae). Como la Luna es redonda, lo lejano "se hunde", y la fórmula lo tiene en cuenta sin aproximar.`
        : `We look at the real terrain (LOLA) in 360 directions up to 150 km and note how high the tallest ridge gets in each. Here the horizon climbs to ${n(sr.max, 2)}° (and dips to ${n(sr.min, 2)}° where the ground falls away). Because the Moon is round, far things "sink"; the formula accounts for that exactly.`;
    case "rho_sun":
      return es ? `El Sol no es un punto: visto desde la Luna mide unos ${n(sr?.max ?? r, 3)}° de radio. Importa porque en el polo el Sol roza el horizonte y a veces se ve "medio Sol".` : `The Sun is not a dot: from the Moon it is about ${n(sr?.max ?? r, 3)}° in radius. It matters because at the pole the Sun skims the horizon and you often see "half a Sun".`;
    case "rho_earth":
      return es ? `La Tierra se ve con un radio de ~${n(sr?.max ?? r, 2)}°, casi cuatro veces más grande que el Sol.` : `The Earth shows a radius of ~${n(sr?.max ?? r, 2)}°, almost four times the Sun's.`;
    case "disc_sun":
      return es ? `Hora por hora calculamos qué porción del disco del Sol asoma por encima de las montañas: 1 es Sol entero, 0 es nada. Lo hacemos pintando el disco en puntitos y contando cuántos quedan arriba del horizonte. En promedio en esta misión se ve ${n((sr?.min + sr?.max) / 2, 2)} del disco (va de ${n(sr?.min, 2)} a ${n(sr?.max, 2)}).`
        : `Hour by hour we compute how much of the Sun's disc peeks above the ridges: 1 is full Sun, 0 is none. We "paint" the disc with dots and count how many sit above the horizon.`;
    case "segment_sun": case "segment_earth":
      return es ? "Control de calidad: la misma fracción, pero con una fórmula cerrada (el trozo de un círculo cortado por una línea). Si las dos coinciden, la integración numérica está bien." : "Quality check: the same fraction with a closed formula (a circle cut by a line). If both agree, the numerical integration is right.";
    case "disc_earth":
      return es ? "Lo mismo que con el Sol pero para la Tierra: si asoma aunque sea un pedacito, hay línea de vista para hablar con casa." : "Same as for the Sun but for the Earth: if even a sliver shows, there is line of sight to call home.";
    case "irradiance":
      return es ? `Cuánta energía solar llega por metro cuadrado: ${n(sr?.min, 0)}–${n(sr?.max, 0)} W/m². Varía poco porque la distancia al Sol cambia poco.` : `How much solar energy arrives per square metre: ${n(sr?.min, 0)}–${n(sr?.max, 0)} W/m². It barely changes because the distance to the Sun barely changes.`;
    case "panel_power":
      return es ? `Potencia del panel: irradiancia × área (${inp.A} m²) × eficiencia (${inp.eta}) × cuánto Sol asoma. Pico en esta misión: ${n(sr?.max, 0)} W.` : `Panel power: irradiance × area (${inp.A} m²) × efficiency (${inp.eta}) × visible Sun. Peak this mission: ${n(sr?.max, 0)} W.`;
    case "energy_balance":
      return es ? `Como una cuenta bancaria hora por hora: entra lo del panel, sale lo que consume el módulo (${inp.P_load} W), y la batería (${inp.C} Wh) no puede ir por debajo de cero ni por encima de llena. La carga mínima a la que llega: ${n((r?.min_soc_frac ?? 0) * 100, 0)} %; horas sin poder alimentar la carga: ${n(r?.hours_in_deficit, 0)}.`
        : `Like a bank account hour by hour: panel power comes in, the lander's load (${inp.P_load} W) goes out, and the battery (${inp.C} Wh) can't go below empty or above full. Lowest charge reached: ${n((r?.min_soc_frac ?? 0) * 100, 0)}%; hours unable to feed the load: ${n(r?.hours_in_deficit, 0)}.`;
    case "sun_time":
      return es ? `De todas las horas de la misión, en el ${n(r)} % hay al menos un pedacito de Sol.` : `Of all mission hours, ${n(r)}% have at least a sliver of Sun.`;
    case "longest_night":
      return es ? `La racha más larga sin nada de Sol dura ${n(r, 0)} horas (${n(r / 24, 1)} días). Esto es lo que la batería tiene que aguantar.` : `The longest stretch with no Sun at all lasts ${n(r, 0)} hours (${n(r / 24, 1)} days). This is what the battery must survive.`;
    case "earth_time":
      return es ? `En el ${n(r)} % de las horas se ve la Tierra, o sea que se puede transmitir directo.` : `Earth is in view ${n(r)}% of the hours, so direct transmission is possible.`;
    case "longest_gap":
      return es ? `El silencio más largo con la Tierra dura ${n(r, 0)} horas. Si tu límite es menor, hay problema.` : `The longest silence with Earth lasts ${n(r, 0)} hours. If your limit is lower, there is a problem.`;
    case "sunset_countdown":
      return es ? `Desde la hora de inicio: ${r?.hours_to_sunset == null ? "el Sol no se pone en toda la ventana" : `el Sol se pone en ${n(r.hours_to_sunset, 0)} h`}; ${r?.hours_to_earthset == null ? "la Tierra no se oculta" : `la Tierra se oculta en ${n(r.hours_to_earthset, 0)} h`}.`
        : `From the start: ${r?.hours_to_sunset == null ? "the Sun never sets in the window" : `the Sun sets in ${n(r.hours_to_sunset, 0)} h`}; ${r?.hours_to_earthset == null ? "the Earth never sets" : `the Earth sets in ${n(r.hours_to_earthset, 0)} h`}.`;
    case "verdict":
      return es ? `Comparamos dos números contra dos límites: noche más larga (${n(inp.T_night, 0)} h) contra autonomía (${n(inp["T_aut (battery autonomy)"], 0)} h), y silencio más largo (${n(inp.T_gap, 0)} h) contra el máximo permitido (${n(inp["T_gap,max"], 0)} h). Resultado: ${r === "survives" ? "sobrevive" : r === "marginal" ? "al límite (a menos del 10 %)" : "no sobrevive"}.`
        : `Two numbers against two limits: longest night (${n(inp.T_night, 0)} h) vs autonomy (${n(inp["T_aut (battery autonomy)"], 0)} h), and longest silence (${n(inp.T_gap, 0)} h) vs the allowed max (${n(inp["T_gap,max"], 0)} h). Result: ${r}.`;
    case "margin_days":
      return es ? `Corrimos la fecha de a un día, hasta 30, y repetimos la cuenta. Se puede atrasar ${n(r, 0)} días seguidos sin que deje de ser viable.` : `We shift the date one day at a time, up to 30, and redo the sums. You can slip ${n(r, 0)} consecutive days and stay viable.`;
    case "margin_metres":
      return es ? "Subimos el panel de 2 a 10 m y recalculamos el horizonte cada vez: cuanto más alto, menos montaña tapa. Son los porcentajes de Sol por altura." : "We raise the panel from 2 to 10 m and recompute the horizon each time: the higher, the less ridge in the way. These are the sunlight percentages per height.";
    case "margin_km":
      return es ? "Probamos 25 puntos alrededor del sitio (grilla de 5 × 5 cada 2 km) con su propio horizonte. Verde: ahí la misión sería viable." : "We try 25 points around the site (5 × 5 grid, 2 km apart), each with its own horizon. Green: the mission would be viable there.";
    default:
      if (id.startsWith("calc_")) return es ? "Esto lo pediste vos desde la calculadora, con tus propios valores, usando la misma fórmula del motor." : "You asked for this from the calculator, with your own values, using the engine's own formula.";
      return step.description || "";
  }
}
