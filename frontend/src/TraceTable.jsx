import React, { useMemo, useState } from "react";
import { api } from "./api.js";
import { plain } from "./plain.js";
import { animFor } from "./Animations.jsx";
import { Ic } from "./icons.jsx";

// Tabla "Cálculos en vivo". Las filas aparecen a medida que el motor emite cada
// paso. En modo Simple se ve la frase en criollo; en Técnico, fórmula, entradas,
// fuente, incertidumbre y dependencias. Cada fila se abre con Enter o clic.

export const show = (v) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toPrecision(5);
  if (typeof v === "object" && v.array) return v.min != null ? `${v.min.toPrecision(4)} … ${v.max.toPrecision(4)}  [${v.n}]` : `[${v.n}]`;
  if (typeof v === "object") return Object.entries(v).map(([k, x]) => `${k}: ${show(x)}`).join(" · ");
  return String(v);
};

function sourceTag(step) {
  const id = step.id;
  if (id.startsWith("ephemeris")) return step.name.includes("SPICE") ? ["SPICE", "spice"] : ["Horizons", "horizons"];
  if (id.startsWith("horizon")) return step.name.includes("MISSING") ? ["—", "user"] : ["LOLA", "lola"];
  if (id.startsWith("irradiance")) return ["Const.", "const"];
  if (id.startsWith("calc_")) return ["User", "user"];
  if (["scenario", "site_unverified"].includes(id)) return ["Input", "user"];
  return ["Geom.", "geom"];
}

export default function TraceTable({ steps, order, traceId, lang, mode, onAnim, running, precomputed, highlight }) {
  const es = lang === "es";
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  const rows = useMemo(() => order.map((id) => steps[id]).filter((s) => s && (!q || (s.name + s.formula + s.id).toLowerCase().includes(q.toLowerCase()))), [order, steps, q]);
  const tech = mode === "tech";
  const exportJson = async () => {
    const data = await api.trace(traceId, true);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    a.download = `lumox-traza-${traceId}.json`; a.click();
  };
  const toggle = (id) => setOpen(open === id ? null : id);

  return (
    <section className="panel" aria-label={es ? "Cálculos en vivo" : "Live calculations"}>
      <div className="panel-h">
        <Ic.pulse />
        <h2>{es ? "Cálculos en vivo" : "Live computation trace"}</h2>
        <span className="live">{running ? <><span className="dot ok" />{es ? "Calculando en tiempo real…" : "Computing live…"}</> : precomputed ? <><span className="dot warn" />{es ? "Datos precalculados" : "Precomputed data"}</> : <><span className="dot" />{rows.length} {es ? "pasos" : "steps"}</>}</span>
        <div className="right">
          <label className="search"><Ic.search width="16" height="16" /><span className="sr-only">{es ? "Buscar" : "Search"}</span>
            <input placeholder={es ? "Buscar fórmula…" : "Search formula…"} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {traceId && !precomputed && <a className="btn" href={api.traceCsvUrl(traceId)} download><Ic.down />{es ? "Exportar CSV" : "Export CSV"}</a>}
          {traceId && !precomputed && <button className="btn" onClick={exportJson}><Ic.braces />{es ? "Exportar JSON" : "Export JSON"}</button>}
        </div>
      </div>
      {rows.length === 0 ? (
        running ? <div className="stack" style={{ gap: 8 }}>{[0, 1, 2].map((k) => <div key={k} className="skeleton" style={{ height: 34 }} />)}</div>
          : <div className="empty">{es ? "Todavía no hay cálculos. Elegí un sitio y tocá Calcular." : "No calculations yet. Pick a site and press Compute."}</div>
      ) : (
        <div className="table-wrap">
          <table className="ttable">
            <thead><tr>
              <th>#</th><th>{es ? "Cálculo" : "Step"}</th>
              {tech ? <><th>{es ? "Fórmula" : "Formula"}</th><th>{es ? "Fuente" : "Source"}</th></> : <th>{es ? "En criollo" : "In plain words"}</th>}
              <th>{es ? "Resultado" : "Result"}</th>
              {tech && <><th>{es ? "Incertidumbre" : "Uncertainty"}</th><th>{es ? "Depende de" : "Depends on"}</th></>}
              <th><span className="sr-only">{es ? "Abrir" : "Open"}</span></th>
            </tr></thead>
            <tbody>
              {rows.map((s) => {
                const [tag, cls] = sourceTag(s);
                const isOpen = open === s.id || highlight === s.id;
                const anim = animFor(s.id);
                return (
                  <React.Fragment key={s.id}>
                    <tr className={"row" + (isOpen ? " open" : "")} tabIndex={0} aria-expanded={isOpen}
                      onClick={() => toggle(s.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(s.id); } }}>
                      <td className="num mute">{s.index + 1}</td>
                      <td className="name">{s.name}</td>
                      {tech ? <><td className="f" title={s.formula}>{s.formula || "—"}</td><td><span className={"tag " + cls}>{tag}</span></td></>
                        : <td className="soft plaincol">{plain(s, lang)}</td>}
                      <td className="res" title={show(s.result?.value)}>{show(s.result?.value)} <span className="mute">{s.result?.unit}</span></td>
                      {tech && <><td className="xs soft" style={{ maxWidth: 220 }}>{s.uncertainty || "—"}</td><td className="num xs">{s.depends_on?.join(", ") || "—"}</td></>}
                      <td style={{ width: 28 }}><Ic.chev width="16" height="16" style={{ transform: isOpen ? "rotate(180deg)" : "none" }} /></td>
                    </tr>
                    {isOpen && (
                      <tr className="detail"><td colSpan={tech ? 8 : 5}>
                        <div className="cols">
                          <div>
                            <div className="xs mute">{es ? "En criollo" : "In plain words"}</div>
                            <p className="plain" style={{ marginTop: 4 }}>{plain(s, lang)}</p>
                            {anim && <button className="btn" style={{ marginTop: 10 }} onClick={() => onAnim(anim, plain(s, lang))}><Ic.film />{es ? "Ver animación" : "Watch animation"}</button>}
                          </div>
                          {tech && (
                            <div>
                              {s.formula && <><div className="xs mute">{es ? "Fórmula (LaTeX)" : "Formula (LaTeX)"}</div><div className="formula" style={{ marginTop: 4 }}>{s.formula}</div></>}
                              <div className="xs mute" style={{ marginTop: 8 }}>{es ? "Entradas" : "Inputs"}</div>
                              <ul style={{ margin: "4px 0 0 16px", padding: 0 }} className="small">
                                {s.inputs.map((i, k) => <li key={k}><span className="num">{i.name} = {show(i.value)} {i.unit}</span> <span className="mute">· {i.source}</span></li>)}
                                {s.inputs.length === 0 && <li className="mute">—</li>}
                              </ul>
                            </div>
                          )}
                          <div>
                            <div className="xs mute">{es ? "Supuestos" : "Assumptions"}</div>
                            <ul style={{ margin: "4px 0 0 16px", padding: 0 }} className="small">{(s.assumptions.length ? s.assumptions : ["—"]).map((a, k) => <li key={k}>{a}</li>)}</ul>
                            {tech && s.uncertainty && <><div className="xs mute" style={{ marginTop: 8 }}>{es ? "Incertidumbre" : "Uncertainty"}</div><div className="small">{s.uncertainty}</div></>}
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
