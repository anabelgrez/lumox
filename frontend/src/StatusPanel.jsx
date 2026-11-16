import React, { useState } from "react";
import { Ic } from "./icons.jsx";
import { verdictText } from "./SimpleView.jsx";

// Panel derecho: veredicto, métricas, balance energético y cuenta regresiva.
// Todo viene del resultado del motor; la cuenta regresiva busca el próximo
// evento en la lista que ya calculó el backend.

const fmt = (v, d = 1, lang = "es") => (typeof v === "number" ? (lang === "es" ? v.toFixed(d).replace(".", ",") : v.toFixed(d)) : "—");

function EnergyChart({ r, hour, lang }) {
  const es = lang === "es", s = r.series, n = s.power_w.length;
  const load = r.spec.power.load_w;
  const maxP = Math.max(load * 1.2, ...s.power_w, 1);
  const W = 300, H = 120, L = 34, B = 18;
  const X = (i) => L + (i / (n - 1)) * (W - L - 6);
  const Y = (p) => 6 + (1 - p / maxP) * (H - B - 6);
  const path = s.power_w.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p).toFixed(1)}`).join("");
  const soc = s.soc_frac.map((f, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${(6 + (1 - f) * (H - B - 6)).toFixed(1)}`).join("");
  const days = Math.round((n - 1) / 24);
  return (
    <div className="chart">
      <div className="panel-h" style={{ marginBottom: 4 }}>
        <h2 style={{ fontSize: 13 }}>{es ? "Balance energético" : "Energy balance"}</h2>
        <span className="right xs"><span className="lg"><i style={{ background: "var(--ch-gen)" }} />{es ? "Generada" : "Generated"}</span><span className="lg"><i style={{ background: "var(--ch-load)" }} />{es ? "Consumida" : "Load"}</span><span className="lg"><i style={{ background: "var(--ch-soc)" }} />{es ? "Batería" : "Battery"}</span></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={es ? "Potencia generada, consumo y carga de batería" : "Generated power, load and battery charge"}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - 6} y1={Y(maxP * f)} y2={Y(maxP * f)} stroke="var(--line)" />
          <text x={L - 4} y={Y(maxP * f) + 3} textAnchor="end" fontSize="9" fill="var(--mute)" fontFamily="var(--mono)">{(maxP * f / 1000).toFixed(1)}kW</text></g>)}
        <path d={soc} fill="none" stroke="var(--ch-soc)" strokeWidth="1.5" strokeDasharray="4 3" />
        <line x1={L} x2={W - 6} y1={Y(load)} y2={Y(load)} stroke="var(--ch-load)" strokeWidth="1.5" />
        <path d={path} fill="none" stroke="var(--ch-gen)" strokeWidth="2" strokeLinejoin="round" />
        <line x1={X(Math.min(hour, n - 1))} x2={X(Math.min(hour, n - 1))} y1="4" y2={H - B} stroke="var(--soft)" strokeDasharray="2 2" />
        {[0, 0.5, 1].map((f) => <text key={f} x={X(f * (n - 1))} y={H - 4} fontSize="9" fill="var(--mute)" textAnchor="middle" fontFamily="var(--mono)">{Math.round(f * days)}d</text>)}
      </svg>
    </div>
  );
}

export default function StatusPanel({ r, hour, lang, open, running , compact = false, defaultOpen = false, children }) {
  const [more, setMore] = useState(defaultOpen);
  const es = lang === "es";
  if (!r) return (
    <aside className="stack">
      <div className="panel">{running ? <div className="stack" style={{ gap: 8 }}>{[60, 30, 30, 30, 30].map((h, k) => <div key={k} className="skeleton" style={{ height: h }} />)}</div>
        : <div className="empty">{es ? "Sin escenario cargado." : "No scenario loaded."}</div>}</div>
    </aside>
  );
  const m = r.metrics, v = r.verdict, st = r.steps, s = r.series;
  const i = Math.min(hour, s.time.length - 1);
  const label = { survives: es ? "Viable" : "Viable", marginal: es ? "Al límite" : "Marginal", fails: es ? "No viable" : "Not viable" }[v.state];
  // debajo del veredicto, el dato que lo decide (como en la referencia: "Margen de retraso: N días")
  const md = r.margins?.days;
  const why = v.state !== "fails"
    ? (md ? (es ? `Margen de retraso: ${md.margin_days} ${md.margin_days === 1 ? "día" : "días"}` : `Delay margin: ${md.margin_days} day${md.margin_days === 1 ? "" : "s"}`) : (es ? "Dentro de los límites" : "Within limits"))
    : m.longest_night_h > r.autonomy_h
      ? (es ? `Noche más larga ${fmt(m.longest_night_h, 0, lang)} h · batería ${fmt(r.autonomy_h, 0, lang)} h` : `Longest night ${fmt(m.longest_night_h, 0, lang)} h · battery ${fmt(r.autonomy_h, 0, lang)} h`)
      : (es ? `Sin contacto ${fmt(m.longest_comm_gap_h, 0, lang)} h · máximo ${fmt(r.spec.max_comm_gap_h, 0, lang)} h` : `No contact ${fmt(m.longest_comm_gap_h, 0, lang)} h · max ${fmt(r.spec.max_comm_gap_h, 0, lang)} h`);
  const VIcon = v.state === "survives" ? Ic.okc : v.state === "marginal" ? Ic.alert : Ic.xc;
  // próximo evento del Sol desde la hora elegida (la lista ya viene del backend)
  const nextSun = r.events?.find((e) => e.body === "sun" && e.idx > i);
  const hoursTo = nextSun ? nextSun.idx - i : null;
  const sunUp = s.sun_fraction[i] > 0;
  const hhmm = hoursTo == null ? null : `${String(Math.floor(hoursTo / 24)).padStart(2, "0")}d ${String(hoursTo % 24).padStart(2, "0")}h`;
  const rows = [
    [Ic.sun, es ? "Sol disponible" : "Sunlight", `${fmt(m.sun_time_pct, 1, lang)} %`, st.sun_time, "sun"],
    [Ic.earth, es ? "Tierra visible" : "Earth in view", `${fmt(m.earth_visible_pct, 1, lang)} %`, st.earth_time, "earth"],
    [Ic.moon, es ? "Noche más larga" : "Longest night", `${fmt(m.longest_night_h, 0, lang)} h`, st.longest_night, m.longest_night_h > r.autonomy_h ? "bad" : ""],
    [Ic.signal, es ? "Corte de comunicación" : "Comm gap", `${fmt(m.longest_comm_gap_h, 0, lang)} h`, st.longest_gap, m.longest_comm_gap_h > r.spec.max_comm_gap_h ? "bad" : ""],
    [Ic.hourglass, es ? "Margen de retraso" : "Delay margin", r.margins?.days ? `${r.margins.days.viable_now ? r.margins.days.margin_days : 0} ${es ? "días" : "days"}` : "—", r.margins?.days?.step_id, ""],
    [Ic.sun, es ? "Elevación solar ahora" : "Solar elevation now", `${fmt(s.sun_el[i], 2, lang)}°`, st.ephemeris, "sun"],
  ];
  const details = (<>
    <div className="mlist" style={{ marginTop: 10 }}>
      {rows.map(([Icon, lab, val, sid, cls], k) => (
        <button key={k} className="mrow" onClick={() => open(sid)} title={es ? "Ver cómo se calculó" : "See how it was computed"}>
          <Icon className={cls === "sun" ? "sun" : cls === "earth" ? "earth" : ""} /><span>{lab}</span><span className={"v " + (cls === "bad" ? "bad" : "")}>{val}</span>
        </button>
      ))}
    </div>
  </>);
  const energyAndCountdown = (<>
    <div className="panel"><EnergyChart r={r} hour={hour} lang={lang} /></div>
    <div className="panel">
      <button className="countdown" style={{ background: "none", border: 0, padding: 0, width: "100%", textAlign: "left", color: "inherit", cursor: "pointer" }} onClick={() => open(st.countdown)}>
        <Ic.sun />
        <div>
          <div className="small soft">{sunUp ? (es ? "Próxima puesta de Sol" : "Next sunset") : (es ? "Próxima salida del Sol" : "Next sunrise")}</div>
          <div className={"big" + (hhmm ? "" : " text")}>{hhmm ?? (es ? "No ocurre en esta misión" : "Not within this mission")}</div>
          {nextSun && <div className="xs mute num">{nextSun.t.replace("T", " ").slice(0, 16)} UTC · ±30 min</div>}
        </div>
      </button>
    </div>
  </>);
  if (compact) {
    // Panel compacto: el veredicto en una frase y tres tarjetas; el resto se abre a pedido.
    const vt = verdictText(r, lang), mt = r.metrics, d = md;
    const N = (x, k = 0) => fmt(x, k, lang);
    return (
      <aside className="stack" aria-label={es ? "Estado de la misión" : "Mission status"}>
        <div className="panel status-panel">
          <div className="status-head"><Ic.target /><h2>{es ? "Estado de la misión" : "Mission status"}</h2><span className="live"><span className={"dot " + (running ? "warn" : "ok")} />{running ? (es ? "En análisis" : "Analysing") : (es ? "En vivo" : "Live")}</span></div>
          <button className={"verdict " + v.state} style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => open(st.verdict)} aria-label={`${vt.title}. ${vt.why}`}>
            <VIcon />
            <div><div className="state phrase">{vt.title}</div><div className="why">{vt.why}</div></div>
          </button>
          <div className="mini3">
            <button className="mini" onClick={() => open(st.sun_time)}><Ic.sun className="sun" /><span className="num">{N(mt.sun_time_pct)}%</span><small>{es ? "Energía" : "Energy"}</small></button>
            <button className="mini" onClick={() => open(st.earth_time)}><Ic.earth className="earth" /><span className="num">{N(mt.earth_visible_pct)}%</span><small>{es ? "Comunicación" : "Comms"}</small></button>
            <button className="mini" onClick={() => open(d?.step_id)}><Ic.hourglass /><span className="num">{d?.viable_now ? d.margin_days : 0} {es ? "d" : "d"}</span><small>{es ? "Margen" : "Margin"}</small></button>
          </div>
          <button className="btn ghost more" onClick={() => setMore(!more)} aria-expanded={more}>{more ? "▾" : "▸"} {es ? "Ver detalle" : "See detail"}</button>
          {more && details}
        </div>
        {children}
        {more && energyAndCountdown}
      </aside>
    );
  }
  return (
    <aside className="stack" aria-label={es ? "Estado de la misión" : "Mission status"}>
      <div className="panel status-panel">
        <div className="status-head"><Ic.target /><h2>{es ? "Estado de la misión" : "Mission status"}</h2><span className="live"><span className={"dot " + (running ? "warn" : "ok")} />{running ? (es ? "En análisis" : "Analysing") : (es ? "En vivo" : "Live")}</span></div>
        <button className={"verdict " + v.state} style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => open(st.verdict)} aria-label={`${label}. ${why}`}>
          <VIcon />
          <div><div className="state">{label}</div><div className="why">{why}</div></div>
        </button>
        {details}
      </div>
      {children}
      {energyAndCountdown}
    </aside>
  );
}
