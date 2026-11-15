// "En criollo": cada paso de la traza y el estado de cada hora, traducidos a
// frases simples con plantillas sobre los números del motor. Acá no se calcula
// nada nuevo: solo se eligen palabras según números que ya vinieron del backend.

const n = (v, d = 1, lang = "es") => {
  if (typeof v !== "number" || !isFinite(v)) return "—";
  const s = v.toFixed(d);
  return lang === "es" ? s.replace(".", ",") : s;
};
const arr = (v) => (v && v.array ? v : null);

// Frase del momento: qué pasa con el Sol y la Tierra en la hora elegida.
export function nowPhrase(r, hour, lang = "es") {
  if (!r) return "";
  const es = lang === "es", s = r.series, i = Math.min(hour, s.time.length - 1);
  const se = s.sun_el[i], sh = s.sun_horizon_deg?.[i], f = s.sun_fraction[i];
  const ee = s.earth_el[i], eh = s.earth_horizon_deg?.[i], fe = s.earth_fraction[i];
  const N = (v, d = 1) => n(v, d, lang);
  const flat = r.data.horizon_source === "flat";
  let sun;
  if (se < 0) sun = es ? `El Sol está ${N(-se)}° por debajo del horizonte: es de noche.` : `The Sun is ${N(-se)}° below the horizon: it is night.`;
  else if (f === 0) sun = es ? `El Sol está apenas ${N(se)}° sobre el horizonte y ${flat ? "el borde" : "esa loma"} mide ${N(sh)}°: lo tapa.` : `The Sun is only ${N(se)}° above the horizon and ${flat ? "the edge" : "that ridge"} is ${N(sh)}°: it blocks it.`;
  else if (f < 0.999) sun = es ? `El Sol asoma a medias (${n(f * 100, 0)} % del disco) por encima de una loma de ${N(sh)}°.` : `Only part of the Sun shows (${n(f * 100, 0)}% of the disc) over a ${N(sh)}° ridge.`;
  else sun = es ? `El Sol está a ${N(se)}° y el terreno en esa dirección llega a ${N(sh)}°: le da de lleno al panel.` : `The Sun is at ${N(se)}° and the ground that way reaches ${N(sh)}°: the panel gets full light.`;
  let earth;
  if (fe > 0) earth = es ? `La Tierra se ve (${N(ee)}°), hay comunicación directa.` : `Earth is in view (${N(ee)}°): direct link available.`;
  else earth = es ? `La Tierra quedó escondida (${N(ee)}° contra ${N(eh)}° de terreno): no hay radio.` : `Earth is hidden (${N(ee)}° vs ${N(eh)}° of terrain): no radio.`;
  return `${sun} ${earth}`;
}

// Próximo paso que propone Lumo, según el veredicto. Devuelve texto y una acción.
export function nextStep(r, lang = "es") {
  const es = lang === "es";
  if (!r) return { text: es ? "¿Arrancamos con el ejemplo del atraso de 9 días?" : "Shall we start with the 9-day delay example?", action: "example" };
  const v = r.verdict.state, d = r.margins?.days, mt = r.margins?.metres;
  const better = mt?.applies && mt.scan.find((x) => x.mast_m > r.spec.mast_m && x.sun_time_pct - mt.scan[0].sun_time_pct > 20);
  if (v === "survives") return { text: es ? `Todo en orden. ¿Vemos cuánto aguanta si se atrasa más? Hoy el margen es de ${d?.margin_days ?? "—"} días.` : `All good. Want to see how much more delay it takes? Margin today: ${d?.margin_days ?? "—"} days.`, action: "margins" };
  if (v === "marginal") return { text: es ? "Estamos en el límite. ¿Probamos otro sitio?" : "We're on the edge. Shall we try another site?", action: "compare" };
  if (better) return { text: es ? `No sobrevive. Ojo: con el mástil a ${better.mast_m} m el Sol pasa de ${n(mt.scan[0].sun_time_pct, 0)} % a ${n(better.sun_time_pct, 0)} %. ¿Lo probamos?` : `It does not survive. With a ${better.mast_m} m mast sunlight goes from ${n(mt.scan[0].sun_time_pct, 0, "en")}% to ${n(better.sun_time_pct, 0, "en")}%. Try it?`, action: `mast:${better.mast_m}` };
  if (d && d.best_alternatives?.length) return { text: es ? `No sobrevive en esta fecha, pero +${d.best_alternatives[0].delay_days} días sí. ¿La cargo?` : `Not on this date, but +${d.best_alternatives[0].delay_days} days works. Load it?`, action: `delay:${d.best_alternatives[0].delay_days}` };
  return { text: es ? "No sobrevive con estos límites. ¿Probamos otro sitio?" : "It does not survive with these limits. Try another site?", action: "compare" };
}

export function plain(step, lang = "es") {
  if (!step) return "";
  const es = lang === "es";
  const N = (v, d = 1) => n(v, d, lang);
  const r = step.result?.value;
  const inp = Object.fromEntries((step.inputs || []).map((i) => [i.name, i.value]));
  const id = step.id.replace(/#\d+$/, "");
  const sr = arr(r);

  switch (id) {
    case "scenario":
      return es ? "Acá arranca todo: el sitio, la fecha, cuántos días dura la misión y los límites que pusiste." : "This is where it starts: site, date, mission length and the limits you set.";
    case "site_unverified":
      return es ? "Ojo: las coordenadas de este sitio salieron de prensa o de un mapa aproximado; todavía nadie las chequeó contra una fuente oficial." : "Heads-up: these coordinates came from press or an approximate map; nobody has checked them against an official source yet.";
    case "ephemeris":
      return es ? `Le preguntamos a ${inp.kernels ? "los archivos de NASA (SPICE)" : "JPL Horizons"} dónde están el Sol y la Tierra, hora por hora, vistos desde el sitio: hacia dónde mirar (azimut), qué tan alto (elevación) y a qué distancia. Ya incluye el "cabeceo" de la Luna, que hace subir y bajar a la Tierra cada ~27 días.`
        : `We ask ${inp.kernels ? "NASA's files (SPICE)" : "JPL Horizons"} where the Sun and the Earth are, hour by hour, from the site: which way (azimuth), how high (elevation) and how far. It already includes the Moon's wobble, which makes the Earth rise and set every ~27 days.`;
    case "horizon":
      if (!sr) return es ? "No hay relieve cargado, así que tomamos el horizonte como una línea plana. Es optimista: las montañas de verdad tapan Sol." : "No terrain loaded, so the horizon is a flat line. That is optimistic: real mountains block the Sun.";
      return es ? `Miramos el relieve real en 360 direcciones, hasta 150 km, y en cada una anotamos hasta dónde sube la loma más alta. Acá el horizonte llega a ${N(sr.max, 2)}°. Como la Luna es redonda, lo lejano "se hunde", y la cuenta lo tiene en cuenta.`
        : `We scan the real terrain in 360 directions, up to 150 km, and note how high the tallest ridge gets in each. Here the horizon reaches ${N(sr.max, 2)}°. The Moon is round, so far ground "sinks"; the formula accounts for it.`;
    case "rho_sun":
      return es ? `El Sol no es un punto: desde la Luna mide unos ${N(sr?.max ?? r, 3)}° de radio. Importa porque en el polo pasa días rozando las lomas y se ve "medio Sol".` : `The Sun is not a dot: from the Moon it is about ${N(sr?.max ?? r, 3)}° in radius. It matters because at the pole it skims the ridges for days.`;
    case "rho_earth":
      return es ? `La Tierra se ve con un radio de ~${N(sr?.max ?? r, 2)}°: casi cuatro veces el Sol.` : `The Earth has a radius of ~${N(sr?.max ?? r, 2)}°: almost four times the Sun.`;
    case "disc_sun":
      return es ? `Hora por hora vemos qué parte del Sol asoma por encima de las lomas: 1 es entero, 0 es nada. Pintamos el disco con puntitos y contamos cuántos quedan arriba del terreno.` : `Hour by hour we check how much of the Sun peeks over the ridges: 1 is all, 0 is none. We dot the disc and count how many dots sit above the terrain.`;
    case "segment_sun": case "segment_earth":
      return es ? "Control: la misma cuenta con una fórmula cerrada (un círculo cortado por una línea). Si coinciden, la cuenta con puntitos está bien." : "Check: the same thing with a closed formula (a circle cut by a line). If both agree, the dot-counting is right.";
    case "disc_earth":
      return es ? "Lo mismo que con el Sol pero para la Tierra: si asoma aunque sea un pedacito, hay línea de vista para hablar con casa." : "Same as the Sun but for the Earth: if even a sliver shows, there is line of sight to call home.";
    case "irradiance":
      return es ? `Cuánta energía del Sol llega por metro cuadrado: entre ${N(sr?.min, 0)} y ${N(sr?.max, 0)} W/m². Casi no cambia porque la distancia al Sol casi no cambia.` : `Solar energy per square metre: ${N(sr?.min, 0)} to ${N(sr?.max, 0)} W/m². Barely changes because the distance to the Sun barely changes.`;
    case "panel_power":
      return es ? `Lo que da el panel: energía que llega × área (${inp.A} m²) × eficiencia (${inp.eta}) × parte del Sol que se ve. Lo máximo en esta misión: ${N(sr?.max, 0)} W.` : `Panel output: incoming energy × area (${inp.A} m²) × efficiency (${inp.eta}) × visible Sun. Peak this mission: ${N(sr?.max, 0)} W.`;
    case "energy_balance":
      return es ? `Como una cuenta bancaria hora por hora: entra lo del panel, sale lo que gasta el módulo (${inp.P_load} W), y la batería (${inp.C} Wh) ni baja de cero ni pasa de llena. Lo más bajo que llega: ${N((r?.min_soc_frac ?? 0) * 100, 0)} %. Horas sin poder alimentar todo: ${N(r?.hours_in_deficit, 0)}.`
        : `Like a bank account hour by hour: panel power in, lander load (${inp.P_load} W) out, battery (${inp.C} Wh) never below empty or above full. Lowest charge: ${N((r?.min_soc_frac ?? 0) * 100, 0)}%. Hours unable to power everything: ${N(r?.hours_in_deficit, 0)}.`;
    case "sun_time":
      return es ? `De todas las horas de la misión, en el ${N(r)} % hay al menos un pedacito de Sol.` : `Of all mission hours, ${N(r)}% have at least a sliver of Sun.`;
    case "longest_night":
      return es ? `La racha más larga sin nada de Sol dura ${N(r, 0)} horas (${N(r / 24, 1)} días). Eso es lo que tiene que aguantar la batería.` : `The longest stretch without any Sun lasts ${N(r, 0)} hours (${N(r / 24, 1)} days). That is what the battery must survive.`;
    case "earth_time":
      return es ? `En el ${N(r)} % de las horas se ve la Tierra, o sea que se puede transmitir directo.` : `Earth is in view ${N(r)}% of the hours, so direct transmission is possible.`;
    case "longest_gap":
      return es ? `El silencio más largo con la Tierra dura ${N(r, 0)} horas.` : `The longest silence with Earth lasts ${N(r, 0)} hours.`;
    case "sunset_countdown":
      return es ? `Desde el inicio: ${r?.hours_to_sunset == null ? "el Sol no se pone en toda la ventana" : `el Sol se pone en ${N(r.hours_to_sunset, 0)} h`}; ${r?.hours_to_earthset == null ? "la Tierra no se esconde" : `la Tierra se esconde en ${N(r.hours_to_earthset, 0)} h`}.`
        : `From the start: ${r?.hours_to_sunset == null ? "the Sun never sets in the window" : `the Sun sets in ${N(r.hours_to_sunset, 0)} h`}; ${r?.hours_to_earthset == null ? "the Earth never sets" : `the Earth sets in ${N(r.hours_to_earthset, 0)} h`}.`;
    case "verdict":
      return es ? `Comparamos dos números con dos límites: noche más larga (${N(inp.T_night, 0)} h) contra batería (${N(inp["T_aut (battery autonomy)"], 0)} h), y silencio más largo (${N(inp.T_gap, 0)} h) contra el máximo (${N(inp["T_gap,max"], 0)} h). ${r === "survives" ? "Entra: sobrevive." : r === "marginal" ? "Queda a menos del 10 %: al límite." : "No entra: no sobrevive."}`
        : `Two numbers against two limits: longest night (${N(inp.T_night, 0)} h) vs battery (${N(inp["T_aut (battery autonomy)"], 0)} h), and longest silence (${N(inp.T_gap, 0)} h) vs the max (${N(inp["T_gap,max"], 0)} h). ${r === "survives" ? "It fits: survives." : r === "marginal" ? "Within 10%: marginal." : "It doesn't fit: fails."}`;
    case "margin_days":
      return es ? `Corrimos la fecha de a un día, hasta 30, y repetimos todo. Se puede atrasar ${N(r, 0)} días seguidos sin dejar de ser viable.` : `We shift the date one day at a time, up to 30, and redo everything. It can slip ${N(r, 0)} consecutive days and stay viable.`;
    case "margin_metres":
      return es ? "Subimos el panel de 2 a 10 m y recalculamos el horizonte cada vez: más alto, menos loma en el medio." : "We raise the panel from 2 to 10 m and recompute the horizon each time: higher means less ridge in the way.";
    case "margin_km":
      return es ? "Probamos 25 puntos alrededor (5 × 5, cada 2 km), cada uno con su horizonte. Verde: ahí sería viable." : "We try 25 points around (5 × 5, 2 km apart), each with its own horizon. Green: viable there.";
    default:
      if (id.startsWith("calc_")) return es ? "Esto lo pediste desde la calculadora, con tus valores, usando la misma fórmula del motor." : "You asked for this in the calculator, with your values, using the engine's own formula.";
      return step.description || "";
  }
}
