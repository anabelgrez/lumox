import React from "react";
import { Ic } from "./icons.jsx";

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
        <span className="right xs"><span className="sun">● {es ? "Generada" : "Generated"}</span> <span className="earth">● {es ? "Consumida" : "Load"}</span> <span className="ok">● {es ? "Batería" : "Battery"}</span></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={es ? "Potencia generada, consumo y carga de batería" : "Generated power, load and battery charge"}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - 6} y1={Y(maxP * f)} y2={Y(maxP * f)} stroke="var(--line)" />
          <text x={L - 4} y={Y(maxP * f) + 3} textAnchor="end" fontSize="9" fill="var(--mute)" fontFamily="var(--mono)">{(maxP * f / 1000).toFixed(1)}kW</text></g>)}
        <path d={soc} fill="none" stroke="var(--ok)" strokeWidth="1" strokeOpacity="0.6" strokeDasharray="3 2" />
        <line x1={L} x2={W - 6} y1={Y(load)} y2={Y(load)} stroke="var(--earth)" strokeWidth="1.6" />
        <path d={path} fill="none" stroke="var(--sun)" strokeWidth="1.8" />
        <line x1={X(Math.min(hour, n - 1))} x2={X(Math.min(hour, n - 1))} y1="4" y2={H - B} stroke="var(--soft)" strokeDasharray="2 2" />
        {[0, 0.5, 1].map((f) => <text key={f} x={X(f * (n - 1))} y={H - 4} fontSize="9" fill="var(--mute)" textAnchor="middle" fontFamily="var(--mono)">{Math.round(f * days)}d</text>)}
      </svg>
    </div>
  );
}

export default function StatusPanel({ r, hour, lang, open, running }) {
  const es = lang === "es";
  if (!r) return (
    <aside className="stack">
      <div className="panel">{running ? <div className="stack" style={{ gap: 8 }}>{[60, 30, 30, 30, 30].map((h, k) => <div key={k} className="skeleton" style={{ height: h }} />)}</div>
        : <div className="empty">{es ? "Sin escenario cargado." : "No scenario loaded."}</div>}</div>
    </aside>
  );
  const m = r.metrics, v = r.verdict, st = r.steps, s = r.series;
  const i = Math.min(hour, s.time.length - 1);
  const label = { survives: es ? "Sobrevive" : "Survives", marginal: es ? "Al límite" : "Marginal", fails: es ? "No sobrevive" : "Does not survive" }[v.state];
  const why = { survives: es ? "Noche y silencio dentro de los límites" : "Night and silence within limits",
    marginal: es ? "A menos del 10 % de un límite" : "Within 10% of a limit",
    fails: es ? "Se pasa de al menos un límite" : "At least one limit exceeded" }[v.state];
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
  return (
    <aside className="stack" aria-label={es ? "Estado de la misión" : "Mission status"}>
      <div className="panel">
        <div className="panel-h"><Ic.atom /><h2>{es ? "Estado de misión" : "Mission status"}</h2><span className="right live"><span className={"dot " + (running ? "warn" : "ok")} />{running ? (es ? "Calculando" : "Computing") : (es ? "En vivo" : "Live")}</span></div>
        <button className={"verdict " + v.state} style={{ width: "100%", textAlign: "left", cursor: "pointer" }} onClick={() => open(st.verdict)} aria-label={`${label}. ${why}`}>
          <VIcon />
          <div><div className="state">{label}</div><div className="why">{why}</div></div>
        </button>
        <div className="mlist" style={{ marginTop: 10 }}>
          {rows.map(([Icon, lab, val, sid, cls], k) => (
            <button key={k} className="mrow" onClick={() => open(sid)} title={es ? "Ver cómo se calculó" : "See how it was computed"}>
              <Icon className={cls === "sun" ? "sun" : cls === "earth" ? "earth" : ""} /><span>{lab}</span><span className={"v " + (cls === "bad" ? "bad" : "")}>{val}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="panel"><EnergyChart r={r} hour={hour} lang={lang} /></div>
      <div className="panel">
        <button className="countdown" style={{ background: "none", border: 0, padding: 0, width: "100%", textAlign: "left", color: "inherit", cursor: "pointer" }} onClick={() => open(st.countdown)}>
          <Ic.sun />
          <div>
            <div className="small soft">{sunUp ? (es ? "Próxima puesta de Sol" : "Next sunset") : (es ? "Próxima salida del Sol" : "Next sunrise")}</div>
            <div className="big">{hhmm ?? (es ? "fuera de la ventana" : "beyond window")}</div>
            {nextSun && <div className="xs mute num">{nextSun.t.replace("T", " ").slice(0, 16)} UTC · ±30 min</div>}
          </div>
        </button>
      </div>
    </aside>
  );
}
