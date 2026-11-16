import React, { useEffect, useState } from "react";
import { Ic } from "./icons.jsx";
import { inferences } from "./Views.jsx";
import { fmtNum } from "./geo.js";

// Paneles del modo Operaciones: requisitos y umbrales contra lo que midió el motor, y alertas.
// La columna "Medido" sale del escenario; "Requisito" lo escribe quien opera. Las marcas Cumple / No cumple
// comparan dos números (como el veredicto del motor): no se simula nada acá.

export function Requirements({ r, spec, lang, onApply, running }) {
  const es = lang === "es", F = (v, d = 0) => fmtNum(v, d, lang);
  const [f, setF] = useState({ autonomy_h: r?.autonomy_h ?? 40, max_comm_gap_h: spec.max_comm_gap_h, min_margin_d: 3 });
  useEffect(() => { if (r) setF((x) => ({ ...x, autonomy_h: r.autonomy_h, max_comm_gap_h: r.spec.max_comm_gap_h })); }, [r?.trace_id]); // eslint-disable-line
  if (!r) return <section className="panel"><div className="empty">—</div></section>;
  const m = r.metrics, d = r.margins?.days, set = (k) => (e) => setF({ ...f, [k]: +e.target.value });
  const rows = [
    [es ? "Noche más larga ≤ autonomía" : "Longest night ≤ autonomy", "autonomy_h", "h", m.longest_night_h, (v) => m.longest_night_h <= v, true],
    [es ? "Silencio con la Tierra ≤ máximo" : "Earth silence ≤ maximum", "max_comm_gap_h", "h", m.longest_comm_gap_h, (v) => m.longest_comm_gap_h <= v, true],
    [es ? "Margen de retraso ≥" : "Delay margin ≥", "min_margin_d", es ? "días" : "days", d ? (d.viable_now ? d.margin_days : 0) : null, (v) => d && d.viable_now && d.margin_days >= v, false],
  ];
  const dirty = f.autonomy_h !== r.autonomy_h || f.max_comm_gap_h !== r.spec.max_comm_gap_h;
  return (
    <section className="panel req" aria-label={es ? "Requisitos y umbrales" : "Requirements and thresholds"}>
      <div className="panel-h"><Ic.check /><h2>{es ? "Requisitos y umbrales" : "Requirements & thresholds"}</h2></div>
      <table className="ttable"><thead><tr><th>{es ? "Condición" : "Condition"}</th><th>{es ? "Requisito" : "Requirement"}</th><th>{es ? "Medido" : "Measured"}</th><th>{es ? "Estado" : "Status"}</th></tr></thead>
        <tbody>{rows.map(([lab, k, u, meas, ok, engine]) => (
          <tr key={k}><td>{lab}</td>
            <td><input className="req-in num" type="number" min={1} value={f[k]} onChange={set(k)} aria-label={lab} /> <span className="mute">{u}</span></td>
            <td className="num">{meas == null ? "—" : `${F(meas)} ${u}`}</td>
            <td className={meas == null ? "mute" : ok(f[k]) ? "ok" : "bad"}>{meas == null ? (es ? "sin dato" : "no data") : ok(f[k]) ? (es ? "Cumple" : "Met") : (es ? "No cumple" : "Not met")}</td></tr>))}</tbody></table>
      <div className="req-foot">
        <span className="mute small">{es ? "El margen mínimo es un requisito de quien opera; autonomía y corte máximo recalculan el veredicto." : "The minimum margin is the operator's requirement; autonomy and max gap recompute the verdict."}</span>
        <button className="btn primary" disabled={!dirty || running} onClick={() => onApply({ autonomy_h: f.autonomy_h, max_comm_gap_h: f.max_comm_gap_h })}>{es ? "Aplicar y recalcular" : "Apply & recompute"}</button>
      </div>
    </section>
  );
}

export function Alerts({ r, lang, open }) {
  const es = lang === "es", list = inferences(r, lang).filter((x) => x.level !== "ok");
  const sev = { bad: es ? "Crítica" : "Critical", warn: es ? "Aviso" : "Warning" };
  return (
    <section className="panel alerts" aria-label={es ? "Alertas" : "Alerts"}>
      <div className="panel-h"><Ic.alert /><h2>{es ? "Alertas" : "Alerts"}</h2><span className="right mute small">{list.length}</span></div>
      {list.length === 0 ? <p className="mute small">{es ? "Sin alertas para este escenario." : "No alerts for this scenario."}</p> : (
        <ul className="al-list">{list.map((a, k) => (
          <li key={k} className={a.level}><b>{sev[a.level] || ""}</b> {a.text}{a.step && <button className="link-btn" onClick={() => open(a.step)} aria-label={es ? "Ver el cálculo" : "See the calculation"}>↗</button>}</li>))}</ul>)}
    </section>
  );
}
