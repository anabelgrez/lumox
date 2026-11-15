import React, { useEffect, useRef } from "react";
import { api } from "./api.js";
import { plain } from "./plain.js";

// Live trace panel: steps appear as the engine emits them. Clicking a step
// opens its detail (formula, inputs with units and sources, result,
// assumptions, uncertainty, dependencies). Export CSV / JSON from the backend.

const show = (v) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toPrecision(6);
  if (typeof v === "object" && v.array) return `[${v.n}] ${v.min !== undefined && v.min !== null ? `${v.min.toPrecision(4)} … ${v.max.toPrecision(4)}` : ""}`;
  if (typeof v === "object") return Object.entries(v).map(([k, x]) => `${k}: ${show(x)}`).join("; ");
  return String(v);
};

export function StepModal({ step, t, lang, onClose, onJump, steps, onAnim }) {
  useEffect(() => {
    if (!step) return;
    const k = (e) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [step, onClose]);
  if (!step) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span className="num mute">#{step.index}</span>
          <h3>{step.name}</h3>
          <button className="btn" style={{ marginLeft: "auto" }} onClick={onClose} autoFocus>{t.close}</button>
        </div>
        <div className="small mute" style={{ marginBottom: 8 }}>{step.description} <span className="num">[{step.id}]</span></div>
        {/* primero la versión en criollo, después la fórmula: el que quiere el detalle baja */}
        <div className="infobox" style={{ marginBottom: 10 }}><b>{t.plainTitle}:</b> {plain(step, lang)}
          {onAnim && <div style={{ marginTop: 8 }}><button className="btn" onClick={onAnim}>▶ {lang === "es" ? "Ver animación" : "Watch animation"}</button></div>}</div>
        {step.formula && <><div className="small mute">{t.formula} (LaTeX)</div><div className="formula">{step.formula}</div></>}
        {step.inputs?.length > 0 && (
          <>
            <div className="small mute" style={{ marginTop: 10 }}>{t.inputs}</div>
            <table className="t"><thead><tr><th>#</th><th>{t.result.toLowerCase() === "resultado" ? "valor" : "value"}</th><th>unit</th><th>{t.source}</th></tr></thead>
              <tbody>{step.inputs.map((i, k) => (
                <tr key={k}><td>{i.name}</td><td className="num">{show(i.value)}</td><td className="num">{i.unit}</td>
                  <td className="small">{steps?.[i.source] ? <button className="inf-link btn small" onClick={() => onJump(i.source)}>↗ {i.source}</button> : i.source}</td></tr>
              ))}</tbody></table>
          </>
        )}
        <div className="small mute" style={{ marginTop: 10 }}>{t.result}</div>
        <div className="formula sun">{show(step.result?.value)} <span className="mute">{step.result?.unit}</span></div>
        {step.assumptions?.length > 0 && (
          <><div className="small mute" style={{ marginTop: 10 }}>{t.assumptions}</div>
            <ul style={{ margin: "4px 0 0 18px", fontSize: 13 }}>{step.assumptions.map((a, k) => <li key={k}>{a}</li>)}</ul></>
        )}
        {step.uncertainty && <><div className="small mute" style={{ marginTop: 10 }}>{t.uncertainty}</div><div style={{ fontSize: 13 }}>{step.uncertainty}</div></>}
        {step.depends_on?.length > 0 && (
          <><div className="small mute" style={{ marginTop: 10 }}>{t.dependsOn}</div>
            <div className="chips">{step.depends_on.map((d) => <button key={d} className="chip" onClick={() => onJump(d)}>{d}</button>)}</div></>
        )}
      </div>
    </div>
  );
}

export default function TracePanel({ steps, order, traceId, t, lang, didactic, onOpen, highlight, precomputed, running }) {
  const ref = useRef();
  useEffect(() => { if (running && ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [order.length, running]);
  const exportJson = async () => {
    const data = await api.trace(traceId, true);
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `lumox-trace-${traceId}.json`; a.click();
  };
  return (
    <div className="panel">
      <h2>{t.liveCalc}
        <span className="right small num">{order.length} {t.steps}{running ? " …" : ""}</span></h2>
      {precomputed && <div className="infobox" style={{ marginBottom: 8 }}>{t.precomputed}</div>}
      <div className="trace" ref={ref}>
        {order.map((id) => { const s = steps[id]; return (
          <div key={id} className={"step" + (highlight === id ? " hi" : "")} onClick={() => onOpen(id)}>
            <div className="h"><span className="idx">#{s.index}</span><span>{s.name}</span></div>
            {s.formula && <div className="f">{s.formula}</div>}
            <div className="r">= {show(s.result?.value)} {s.result?.unit}</div>
            {didactic && <div className="small" style={{ marginTop: 4, color: "var(--soft)" }}>{plain(s, lang)}</div>}
          </div>); })}
        {order.length === 0 && <p className="mute small">—</p>}
      </div>
      {traceId && !precomputed && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <a className="btn" href={api.traceCsvUrl(traceId)} download>{t.exportCsv}</a>
          <button className="btn" onClick={exportJson}>{t.exportJson}</button>
        </div>
      )}
    </div>
  );
}
