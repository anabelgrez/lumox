import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { Ic } from "./icons.jsx";
import { pretty } from "./latex.js";

// Calculadora de misión compacta (panel inferior derecho). Usa el catálogo y el
// cálculo del motor (/api/formulas, /api/calc): acá no se calcula nada.

export default function CalcCard({ lang, traceId, onSaved }) {
  const es = lang === "es";
  const [list, setList] = useState([]);
  const [fid, setFid] = useState("irradiance");
  const [vals, setVals] = useState({});
  const [out, setOut] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.formulas().then(setList).catch(() => setErr(es ? "El motor no responde." : "Engine not responding.")); }, []); // eslint-disable-line
  const f = list.find((x) => x.id === fid);
  useEffect(() => { if (f) setVals(Object.fromEntries(f.inputs.map((i) => [i.name, i.default ?? ""]))); setOut(null); setErr(null); }, [fid, list.length]); // eslint-disable-line
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.calc(fid, Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, +v])), traceId || undefined);
      setOut(r); if (traceId) onSaved?.(r);
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };
  const fmt = (v) => (typeof v !== "number" ? String(v) : Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(4) : v.toPrecision(6));
  return (
    <section className="panel calc-card" aria-label={es ? "Calculadora de misión" : "Mission calculator"}>
      <div className="panel-h" style={{ marginBottom: 2 }}><Ic.calc /><h2>{es ? "Calculadora de misión" : "Mission calculator"}</h2></div>
      {!f ? <div className="mute small">{err || (es ? "Cargando fórmulas…" : "Loading formulas…")}</div> : (<>
        <label className="cc-label">{es ? "Fórmula seleccionada" : "Selected formula"}
          <select value={fid} onChange={(e) => setFid(e.target.value)} style={{ marginTop: 6 }}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        </label>
        <div className="cc-formula" title={f.latex}>{pretty(f.latex)}</div>
        <div className="cc-inputs">
          {f.inputs.map((i) => (
            <label key={i.name} title={i.description}>{i.name}{i.unit ? ` (${i.unit})` : ""}
              <input type="number" step="any" value={vals[i.name] ?? ""} onChange={(e) => setVals({ ...vals, [i.name]: e.target.value })} /></label>
          ))}
        </div>
        <button className="btn primary cc-run" onClick={run} disabled={busy}>{busy ? (es ? "Calculando…" : "Computing…") : (es ? "Ejecutar cálculo" : "Run calculation")} →</button>
        <div className="cc-out" aria-live="polite">{out ? `${f.output.name} = ${fmt(out.result.value)} ${out.result.unit}` : ""}</div>
        {err && <div className="cc-err">{err}</div>}
      </>)}
    </section>
  );
}
