import React, { useEffect, useMemo, useState } from "react";
import { Ic } from "./icons.jsx";
import TraceTable from "./TraceTable.jsx";

// Modo Simple: una pregunta por pantalla y lo importante primero.
// Pantalla 1: la pregunta y tres datos. Pantalla 2: la respuesta, tres tarjetas,
// el visor y los márgenes como acciones. Lo técnico queda plegado.
// Todos los números vienen del resultado del motor; acá solo se eligen palabras.

const fmt = (v, d, lang) => (typeof v === "number" && isFinite(v) ? (lang === "es" ? v.toFixed(d).replace(".", ",") : v.toFixed(d)) : "—");
const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * 864e5).toISOString().slice(0, 19) + "Z";

// "¿qué es esto?" de una línea
function Help({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help">
      <button className="help-btn" aria-label={text} aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>?</button>
      {open && <span className="help-pop" role="tooltip">{text}</span>}
    </span>
  );
}

export function verdictText(r, lang) {
  const es = lang === "es", m = r.metrics, v = r.verdict, d = r.margins?.days, aut = r.autonomy_h, gmax = r.spec.max_comm_gap_h;
  const N = (x, k = 0) => fmt(x, k, lang);
  const nightBad = m.longest_night_h > aut, gapBad = m.longest_comm_gap_h > gmax;
  let title, why;
  if (v.state === "survives") {
    title = es ? `Sobrevive${d ? ` con ${d.margin_days} ${d.margin_days === 1 ? "día" : "días"} de margen` : ""}` : `Survives${d ? ` with ${d.margin_days} day${d.margin_days === 1 ? "" : "s"} of margin` : ""}`;
    why = es ? `La noche más larga dura ${N(m.longest_night_h)} h y la batería aguanta ${N(aut)} h; la Tierra no se pierde más de ${N(m.longest_comm_gap_h)} h seguidas.`
      : `The longest night lasts ${N(m.longest_night_h)} h and the battery holds ${N(aut)} h; Earth is never lost for more than ${N(m.longest_comm_gap_h)} h.`;
  } else if (v.state === "marginal") {
    title = es ? "Sobrevive, pero muy justo" : "Survives, but only just";
    why = es ? `La noche más larga (${N(m.longest_night_h)} h) o el silencio más largo (${N(m.longest_comm_gap_h)} h) quedan a menos del 10 % del límite.`
      : `The longest night (${N(m.longest_night_h)} h) or the longest silence (${N(m.longest_comm_gap_h)} h) is within 10% of the limit.`;
  } else if (nightBad) {
    title = es ? `No sobrevive: ${N(m.longest_night_h)} horas sin Sol` : `Does not survive: ${N(m.longest_night_h)} hours without Sun`;
    why = es ? `La batería aguanta ${N(aut)} h, y la noche más larga dura ${N(m.longest_night_h)} h (${N(m.longest_night_h / 24, 1)} días).`
      : `The battery holds ${N(aut)} h, but the longest night lasts ${N(m.longest_night_h)} h (${N(m.longest_night_h / 24, 1)} days).`;
  } else {
    title = es ? `No sobrevive: ${N(m.longest_comm_gap_h)} horas sin hablar con la Tierra` : `Does not survive: ${N(m.longest_comm_gap_h)} hours without contact`;
    why = es ? `El máximo permitido sin comunicación es ${N(gmax)} h, y la Tierra queda escondida ${N(m.longest_comm_gap_h)} h seguidas.`
      : `The allowed maximum without contact is ${N(gmax)} h, and Earth stays hidden for ${N(m.longest_comm_gap_h)} h in a row.`;
  }
  return { title, why, state: v.state, nightBad, gapBad };
}

// ---------------------------------------------------------------- Inicio
export function Home({ lang, sites, spec, onStart, onExample, running }) {
  const es = lang === "es";
  const [site, setSite] = useState(spec.site_id);
  const [date, setDate] = useState(spec.start.slice(0, 10));
  const [delay, setDelay] = useState(0);
  return (
    <section className="home">
      <h1>{es ? "¿Tu misión sobrevive si se atrasa?" : "Does your mission survive a delay?"}</h1>
      <p className="lead">{es ? "Elegí dónde y cuándo aluniza, y cuántos días se atrasó. Te decimos si tiene Sol para la batería y la Tierra a la vista para comunicarse." : "Pick where and when it lands, and how many days it slipped. We tell you if it has sunlight for the battery and Earth in view to communicate."}</p>
      <form className="home-form" onSubmit={(e) => { e.preventDefault(); onStart({ site_id: site, start: addDays(`${date}T00:00:00Z`, delay) }); }}>
        <label className="big-field">
          <span>{es ? "Sitio" : "Site"}</span>
          <select value={site} onChange={(e) => setSite(e.target.value)}>
            {sites.length === 0 && <option value={site}>{site}</option>}
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="big-field">
          <span>{es ? "Fecha prevista" : "Planned date"}</span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <label className="big-field">
          <span>{es ? "Días de atraso" : "Days of delay"}</span>
          <input type="number" min={0} max={60} value={delay} onChange={(e) => setDelay(Math.max(0, +e.target.value || 0))} />
        </label>
        <button className="btn primary huge" type="submit" disabled={running}>{running ? (es ? "Calculando…" : "Computing…") : (es ? "Ver si sobrevive" : "Check survival")}</button>
      </form>
      <button className="btn ghost example-link" onClick={onExample}><Ic.book />{es ? "Ver ejemplo: el alunizaje en Shackleton se atrasó 9 días" : "See example: the Shackleton landing slipped 9 days"}</button>
    </section>
  );
}

// ---------------------------------------------------------------- Márgenes como acciones
function MarginActions({ r, lang, go, spec }) {
  const es = lang === "es";
  const [tab, setTab] = useState("date");
  const d = r.margins?.days, mt = r.margins?.metres, km = r.margins?.km;
  const [mast, setMast] = useState(r.spec.mast_m);
  useEffect(() => setMast(r.spec.mast_m), [r.spec.mast_m]);
  if (!d) return null;
  const N = (x, k = 0) => fmt(x, k, lang);
  const cur = d.scan[0];
  const row = mt?.scan.find((x) => x.mast_m === mast) || mt?.scan[0];
  const base = mt?.scan.find((x) => x.mast_m === r.spec.mast_m) || mt?.scan[0];
  const cells = km?.cells || [];
  const bestCell = cells.filter((c) => c.viable).sort((a, b) => Math.hypot(a.north_m, a.east_m) - Math.hypot(b.north_m, b.east_m))[0];
  const dir = (c) => {
    const parts = [];
    if (c.north_m) parts.push(`${N(Math.abs(c.north_m) / 1000)} km ${c.north_m > 0 ? (es ? "al norte" : "north") : (es ? "al sur" : "south")}`);
    if (c.east_m) parts.push(`${N(Math.abs(c.east_m) / 1000)} km ${c.east_m > 0 ? (es ? "al este" : "east") : (es ? "al oeste" : "west")}`);
    return parts.join(es ? " y " : " and ");
  };
  return (
    <section className="panel soft-panel" data-tour="margins">
      <h2 className="h2">{es ? "¿Qué podés cambiar?" : "What can you change?"}</h2>
      <div className="seg big" role="tablist">
        {[["date", Ic.cal, es ? "Cambiar fecha" : "Change date"], ["mast", Ic.signal, es ? "Subir el panel" : "Raise the panel"], ["move", Ic.pin, es ? "Mover el sitio" : "Move the site"]].map(([k, I, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><I width="18" height="18" />{l}</button>
        ))}
      </div>

      {tab === "date" && (
        <div className="action-body">
          <p className="action-lead">{d.viable_now
            ? (es ? `Se puede atrasar hasta ${d.margin_days} días más sin perder la misión.` : `It can slip up to ${d.margin_days} more days and still survive.`)
            : d.best_alternatives.length ? (es ? `En esta fecha no sobrevive. Con +${d.best_alternatives[0].delay_days} días, sí.` : `Not on this date. With +${d.best_alternatives[0].delay_days} days, yes.`)
              : (es ? "En los próximos 30 días ninguna fecha sobrevive en este sitio." : "No date in the next 30 days survives at this site.")}</p>
          <div className="daystrip" role="list">
            {d.scan.map((x) => (
              <button key={x.delay_days} role="listitem" className={"day " + (x.viable ? "v" : "n") + (x.delay_days === 0 ? " now" : "")}
                onClick={() => go({ start: addDays(spec.start, x.delay_days) })}
                title={`+${x.delay_days} ${es ? "días" : "days"}: ${x.viable ? (es ? "sobrevive" : "survives") : (es ? "no sobrevive" : "fails")} · ${es ? "noche" : "night"} ${x.longest_night_h} h`}>
                <span>{x.delay_days === 0 ? (es ? "hoy" : "now") : `+${x.delay_days}`}</span>
              </button>
            ))}
          </div>
          <p className="legend-line"><i className="sw v" />{es ? "sobrevive" : "survives"} <i className="sw n" />{es ? "no sobrevive" : "fails"} · {es ? "tocá un día para cargarlo" : "tap a day to load it"}</p>
        </div>
      )}

      {tab === "mast" && mt && (
        <div className="action-body">
          {!mt.applies ? <p className="action-lead">{es ? "Para este sitio no tenemos relieve: subir el panel no cambia el cálculo." : "No terrain for this site: raising the panel does not change the result."}</p> : (<>
            <p className="action-lead">{es
              ? `Con el panel a ${mast} m hay Sol el ${N(row.sun_time_pct)} % del tiempo (ahora: ${N(base.sun_time_pct)} %). Noche más larga: ${N(row.longest_night_h)} h.`
              : `With the panel at ${mast} m there is sunlight ${N(row.sun_time_pct)}% of the time (now: ${N(base.sun_time_pct)}%). Longest night: ${N(row.longest_night_h)} h.`}
              {row.sun_time_pct > base.sun_time_pct && <b className="gain"> {es ? "Mejora" : "Gain"} +{N(row.sun_time_pct - base.sun_time_pct)} {es ? "puntos" : "points"}</b>}</p>
            <div className="mast-row">
              <input type="range" min={mt.scan[0].mast_m} max={mt.scan[mt.scan.length - 1].mast_m} step={1} value={mast} onChange={(e) => setMast(+e.target.value)} aria-label={es ? "Altura del panel en metros" : "Panel height in metres"} />
              <span className="num big-num">{mast} m</span>
              <button className="btn primary" disabled={mast === r.spec.mast_m} onClick={() => go({ mast_m: mast })}>{es ? "Probar con esta altura" : "Try this height"}</button>
            </div>
            <div className="bars" aria-hidden="true">{mt.scan.map((x) => <div key={x.mast_m} className={"bar" + (x.mast_m === mast ? " on" : "")} style={{ height: `${Math.max(2, x.sun_time_pct)}%` }}><span>{N(x.sun_time_pct)}%</span></div>)}</div>
          </>)}
        </div>
      )}

      {tab === "move" && km && (
        <div className="action-body move">
          <div>
            <p className="action-lead">{!km.applies ? (es ? "Para este sitio no tenemos relieve: moverse unos km no cambia el cálculo." : "No terrain for this site: moving a few km does not change the result.")
              : bestCell ? (bestCell.north_m === 0 && bestCell.east_m === 0 ? (es ? "Acá mismo ya sobrevive." : "It already survives right here.") : (es ? `Si aluniza ${dir(bestCell)}, sobrevive.` : `Landing ${dir(bestCell)} survives.`))
                : (es ? "Ninguno de los 25 puntos de alrededor (hasta 4 km) sobrevive." : "None of the 25 nearby points (up to 4 km) survives.")}</p>
            <p className="legend-line"><i className="sw v" />{es ? "sobrevive" : "survives"} <i className="sw n" />{es ? "no sobrevive" : "fails"} · {es ? "cada cuadro, 2 km; el del medio es tu sitio; norte arriba" : "each square is 2 km; the middle one is your site; north up"}</p>
          </div>
          <div className="kmgrid big" role="img" aria-label={es ? "Grilla de 5 por 5 alrededor del sitio" : "5 by 5 grid around the site"}>
            {[...cells].sort((a, b) => b.north_m - a.north_m || a.east_m - b.east_m).map((c, k) => (
              <div key={k} className={"c " + (c.viable ? "v" : "n") + (c.north_m === 0 && c.east_m === 0 ? " center" : "")} title={`${dir(c) || (es ? "tu sitio" : "your site")}: ${es ? "Sol" : "Sun"} ${N(c.sun_time_pct)} %`}>{N(c.sun_time_pct)}%</div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Respuesta
export function Answer({ r, lang, running, precomputed, hour, setHour, playing, setPlaying, patch, webgl, view, setView, go, spec, steps, order, traceId, onAnim, onNew, openStep, renderViewer }) {
  const es = lang === "es";
  const [detail, setDetail] = useState(false);
  const [how, setHow] = useState(false);
  const N = (x, k = 0) => fmt(x, k, lang);
  const v = useMemo(() => r && verdictText(r, lang), [r, lang]);
  if (!r) return <div className="panel empty">{running ? <div className="skeleton" style={{ height: 120 }} /> : "—"}</div>;
  const m = r.metrics, d = r.margins?.days;
  const VIcon = v.state === "survives" ? Ic.okc : v.state === "marginal" ? Ic.alert : Ic.xc;
  return (
    <div className="answer">
      <div className="answer-top">
        <button className="btn ghost" onClick={onNew}>← {es ? "Otra misión" : "Another mission"}</button>
        <span className="mute">{r.site.name} · {r.spec.start.slice(0, 10)} · {r.spec.duration_days} {es ? "días" : "days"}{precomputed ? (es ? " · precalculado" : " · precomputed") : ""}{running ? (es ? " · actualizando…" : " · updating…") : ""}</span>
      </div>

      <section className={"verdict-hero " + v.state} data-tour="verdict" aria-live="polite">
        <VIcon className="vi" />
        <div>
          <h1>{v.title}</h1>
          <p>{v.why}</p>
        </div>
      </section>

      <div className="three" data-tour="cards">
        <article className="card3">
          <div className="c3-h"><Ic.sun className="sun" /><h3>{es ? "Energía" : "Energy"}</h3><Help text={es ? "Parte del tiempo de la misión en que al panel le llega algo de Sol, mirando el relieve real." : "Share of mission time when some sunlight reaches the panel, using the real terrain."} /></div>
          <div className="c3-num">{N(m.sun_time_pct)}<small>%</small></div>
          <p>{es ? `del tiempo con Sol. La noche más larga dura ${N(m.longest_night_h)} h; la batería aguanta ${N(r.autonomy_h)} h.` : `of the time with sunlight. Longest night: ${N(m.longest_night_h)} h; the battery holds ${N(r.autonomy_h)} h.`}</p>
          {v.nightBad && <span className="pill bad">{es ? "La noche es más larga que la batería" : "The night outlasts the battery"}</span>}
        </article>
        <article className="card3">
          <div className="c3-h"><Ic.earth className="earth" /><h3>{es ? "Comunicación" : "Communication"}</h3><Help text={es ? "Parte del tiempo en que la Tierra se ve sobre las lomas, o sea, se puede transmitir directo." : "Share of time when Earth is above the ridges, so direct transmission is possible."} /></div>
          <div className="c3-num">{N(m.earth_visible_pct)}<small>%</small></div>
          <p>{es ? `del tiempo con la Tierra a la vista. El silencio más largo dura ${N(m.longest_comm_gap_h)} h (máximo: ${N(r.spec.max_comm_gap_h)} h).` : `of the time with Earth in view. Longest silence: ${N(m.longest_comm_gap_h)} h (max: ${N(r.spec.max_comm_gap_h)} h).`}</p>
          {v.gapBad && <span className="pill bad">{es ? "Demasiado tiempo sin contacto" : "Too long without contact"}</span>}
        </article>
        <article className="card3">
          <div className="c3-h"><Ic.hourglass /><h3>{es ? "Margen" : "Margin"}</h3><Help text={es ? "Cuántos días más se puede atrasar el alunizaje sin que deje de sobrevivir." : "How many more days the landing can slip and still survive."} /></div>
          <div className="c3-num">{d?.viable_now ? d.margin_days : 0}<small>{es ? " días" : " days"}</small></div>
          <p>{d?.viable_now ? (es ? "más de atraso se pueden tolerar." : "more of delay can be tolerated.")
            : d?.best_alternatives?.length ? (es ? `En esta fecha no hay margen. La mejor alternativa: +${d.best_alternatives[0].delay_days} días.` : `No margin on this date. Best alternative: +${d.best_alternatives[0].delay_days} days.`)
              : (es ? "En esta fecha no hay margen, y en los próximos 30 días tampoco." : "No margin on this date, nor in the next 30 days.")}</p>
        </article>
      </div>

      <button className="btn ghost" onClick={() => setDetail(!detail)} aria-expanded={detail}>{detail ? "▾" : "▸"} {es ? "Ver detalle" : "See detail"}</button>
      {detail && (
        <div className="detail-grid">
          {[
            [es ? "Sol entero (todo el disco)" : "Full Sun (whole disc)", `${N(m.full_sun_time_pct)} %`, r.steps.sun_time, es ? "Horas con el disco del Sol completo sobre las lomas." : "Hours with the whole solar disc above the ridges."],
            [es ? "Altura del Sol al inicio" : "Sun height at start", `${N(m.sun_elevation_now_deg, 2)}°`, r.steps.ephemeris, es ? "Cuántos grados sobre el horizonte está el Sol al comenzar." : "Degrees above the horizon at the start."],
            [es ? "Carga mínima de batería" : "Lowest battery charge", `${N(r.energy.min_soc_frac * 100)} %`, r.steps.energy_balance, es ? "Lo más bajo que llega la batería en la misión." : "Lowest battery level during the mission."],
            [es ? "Horas sin poder alimentar el módulo" : "Hours unable to power the lander", `${N(r.energy.hours_in_deficit)} h`, r.steps.energy_balance, es ? "Horas en que la batería ya estaba vacía y no alcanzó." : "Hours when the battery was empty and it wasn't enough."],
            [es ? "Energía generada" : "Energy generated", `${N(r.energy.generated_wh / 1000, 1)} kWh`, r.steps.panel_power, es ? "Todo lo que produjo el panel en la misión." : "Everything the panel produced."],
            [es ? "Energía consumida" : "Energy consumed", `${N(r.energy.consumed_wh / 1000, 1)} kWh`, r.steps.energy_balance, es ? "Lo que el módulo necesita en toda la misión." : "What the lander needs over the mission."],
          ].map(([l, val, sid, h], k) => (
            <button key={k} className="drow" onClick={() => openStep(sid)}><span>{l} <Help text={h} /></span><b className="num">{val}</b></button>
          ))}
        </div>
      )}

      <section className="panel soft-panel viewer-simple" data-tour="viewer">
        <div className="viewer-h">
          <h2 className="h2">{es ? "Así se ve desde el sitio" : "What it looks like from the site"}</h2>
          <div className="seg" role="group" aria-label={es ? "Vista" : "View"}>
            <button className={view === "2d" ? "on" : ""} onClick={() => setView("2d")}>2D</button>
            <button className={view === "3d" ? "on" : ""} onClick={() => webgl && setView("3d")} disabled={!webgl}>3D</button>
          </div>
        </div>
        {renderViewer ? renderViewer() : null}
      </section>

      <MarginActions r={r} lang={lang} go={go} spec={spec} />

      <section className="panel soft-panel">
        <button className="btn ghost how" onClick={() => setHow(!how)} aria-expanded={how}>{how ? "▾" : "▸"} {es ? "¿Cómo lo calculamos?" : "How did we compute it?"}</button>
        {how && <TraceTable steps={steps} order={order} traceId={traceId} lang={lang} mode="simple" running={running} precomputed={precomputed} onAnim={onAnim} />}
      </section>
    </div>
  );
}
