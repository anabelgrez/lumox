import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import Cards from "./Cards.jsx";
import Panorama from "./Panorama.jsx";

// ---- Inferences: fixed rules over backend numbers, each linked to its step.
export function inferences(r, lang) {
  if (!r) return [];
  const es = lang === "es", m = r.metrics, st = r.steps, out = [];
  const add = (level, text, step) => out.push({ level, text, step });
  if (r.data.horizon_source === "flat")
    add("bad", es ? "Sin relieve: el horizonte es plano y todo lo que depende del terreno es optimista." : "No terrain: flat horizon; everything terrain-dependent is optimistic.", st.horizon);
  if (m.longest_night_h > r.autonomy_h)
    add("bad", es ? `La noche más larga (${m.longest_night_h.toFixed(0)} h) supera la autonomía (${r.autonomy_h.toFixed(0)} h).` : `Longest night (${m.longest_night_h.toFixed(0)} h) exceeds autonomy (${r.autonomy_h.toFixed(0)} h).`, st.longest_night);
  else if (m.longest_night_h > 0.9 * r.autonomy_h)
    add("warn", es ? "La noche más larga está a menos del 10 % de la autonomía." : "Longest night is within 10% of autonomy.", st.longest_night);
  if (m.longest_comm_gap_h > r.spec.max_comm_gap_h)
    add("bad", es ? `El corte de comunicación (${m.longest_comm_gap_h.toFixed(0)} h) supera el máximo (${r.spec.max_comm_gap_h} h).` : `Comm gap (${m.longest_comm_gap_h.toFixed(0)} h) exceeds the maximum (${r.spec.max_comm_gap_h} h).`, st.longest_gap);
  if (m.sun_time_pct >= 95 && m.longest_night_h === 0)
    add("ok", es ? "Sol casi permanente en la ventana: la energía no es la restricción." : "Near-permanent sunlight in the window: energy is not the constraint.", st.sun_time);
  if (r.energy.min_soc_frac <= 0)
    add("bad", es ? `La batería llega a cero: ${r.energy.hours_in_deficit.toFixed(0)} h sin poder alimentar la carga.` : `Battery hits zero: ${r.energy.hours_in_deficit.toFixed(0)} h unable to feed the load.`, st.energy_balance);
  if (Math.abs(r.site.lat) > 85 && m.sun_elevation_now_deg < 2)
    add("ok", es ? `Sitio polar: el Sol nunca sube mucho (ahora ${m.sun_elevation_now_deg.toFixed(2)}°); por eso metros de mástil importan.` : `Polar site: the Sun never climbs high (now ${m.sun_elevation_now_deg.toFixed(2)}°); that is why mast metres matter.`, st.ephemeris);
  const d = r.margins?.days;
  if (d && d.viable_now && d.margin_days < 3)
    add("warn", es ? `Margen de solo ${d.margin_days} días de atraso.` : `Only ${d.margin_days} days of delay margin.`, d.step_id);
  if (d && !d.viable_now && d.best_alternatives.length)
    add("warn", es ? `La fecha elegida no es viable; la mejor alternativa es +${d.best_alternatives[0].delay_days} días.` : `Chosen date not viable; best alternative is +${d.best_alternatives[0].delay_days} days.`, d.step_id);
  if (!r.site.verified)
    add("warn", es ? "Coordenadas del sitio sin reverificar contra una fuente primaria." : "Site coordinates not re-verified against a primary source.", "site_unverified");
  if (m.earth_visible_pct < 100 && m.earth_visible_pct > 0)
    add("ok", es ? `La Tierra se oculta ${(100 - m.earth_visible_pct).toFixed(0)} % del tiempo por libración y terreno.` : `Earth is hidden ${(100 - m.earth_visible_pct).toFixed(0)}% of the time by libration and terrain.`, st.earth_time);
  return out;
}

export function Inferences({ result, t, lang, open }) {
  const list = inferences(result, lang);
  return (
    <div className="panel">
      <h2>{t.inferences}</h2>
      <div className="stack" style={{ gap: 6 }}>
        {list.length === 0 && <p className="mute small">—</p>}
        {list.map((i, k) => <div key={k} className={"inf " + i.level}>{i.text}<button onClick={() => open(i.step)}>↗ {i.step}</button></div>)}
      </div>
    </div>
  );
}

// ---- Compare: two scenarios side by side (B is a delay or another site).
export function Compare({ sites, specA, resultA, t, lang, runB, open }) {
  const [bSite, setBSite] = useState(specA.site_id);
  const [bDelay, setBDelay] = useState(9);
  const [resB, setResB] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hour, setHour] = useState(0);
  const go = async () => { setBusy(true); try { setResB(await runB({ site_id: bSite, delay: bDelay })); } finally { setBusy(false); } };
  return (
    <div className="stack">
      <div className="panel" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <b>{t.scenarioB}:</b>
        <label className="field">{t.site}<select value={bSite} onChange={(e) => setBSite(e.target.value)}>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="field">{t.delay} ({t.days})<input type="number" value={bDelay} min={-30} max={60} onChange={(e) => setBDelay(+e.target.value)} /></label>
        <button className="btn primary" disabled={busy} onClick={go}>{busy ? t.running : t.compute}</button>
      </div>
      <div className="grid two">
        <div className="stack"><div className="panel"><h2>{t.scenarioA} · {resultA.site.name} · {resultA.spec.start.slice(0, 10)}</h2></div>
          <Panorama result={resultA} t={t} hour={hour} setHour={setHour} /><Cards result={resultA} t={t} open={open} hour={hour} /></div>
        <div className="stack">{resB ? (<><div className="panel"><h2>{t.scenarioB} · {resB.site.name} · {resB.spec.start.slice(0, 10)}</h2></div>
          <Panorama result={resB} t={t} hour={hour} setHour={setHour} /><Cards result={resB} t={t} open={open} hour={hour} /></>)
          : <div className="panel mute">{t.scenarioB}: —</div>}</div>
      </div>
    </div>
  );
}

// ---- Science / Engineering: each profile loads its requirements; the heat
// map marks the agreement zone (viable under both). Both runs come from the backend.
export function Profiles({ result, t, lang, runWith, open }) {
  const es = lang === "es";
  const [sci, setSci] = useState({ autonomy_h: result.autonomy_h, max_comm_gap_h: result.spec.max_comm_gap_h, min_sun_pct: 60 });
  const [eng, setEng] = useState({ autonomy_h: Math.round(result.autonomy_h * 0.8), max_comm_gap_h: Math.round(result.spec.max_comm_gap_h * 0.5), min_sun_pct: 80 });
  const [rs, setRs] = useState(null); const [re, setRe] = useState(null); const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try {
    const [a, b] = await Promise.all([runWith({ autonomy_h: sci.autonomy_h, max_comm_gap_h: sci.max_comm_gap_h }), runWith({ autonomy_h: eng.autonomy_h, max_comm_gap_h: eng.max_comm_gap_h })]);
    setRs(a); setRe(b); } finally { setBusy(false); } };
  const Req = ({ v, set, title }) => (
    <div className="panel"><h2>{title} · {t.requirements}</h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label className="field">{t.autonomy} (h)<input type="number" value={v.autonomy_h} onChange={(e) => set({ ...v, autonomy_h: +e.target.value })} /></label>
        <label className="field">{t.maxGap} (h)<input type="number" value={v.max_comm_gap_h} onChange={(e) => set({ ...v, max_comm_gap_h: +e.target.value })} /></label>
        <label className="field">{t.sunTime} min (%)<input type="number" value={v.min_sun_pct} onChange={(e) => set({ ...v, min_sun_pct: +e.target.value })} /></label>
      </div></div>);
  const scan = rs && re ? rs.margins.days.scan.map((d, i) => ({ delay: d.delay_days, s: d.viable && d.sun_time_pct >= sci.min_sun_pct, e: re.margins.days.scan[i]?.viable && re.margins.days.scan[i]?.sun_time_pct >= eng.min_sun_pct })) : null;
  return (
    <div className="stack">
      <div className="grid two"><Req v={sci} set={setSci} title={t.science} /><Req v={eng} set={setEng} title={t.engineering} /></div>
      <button className="btn primary" disabled={busy} onClick={go}>{busy ? t.running : t.compute}</button>
      {scan && (
        <div className="panel"><h2>{t.agreement}</h2>
          <div className="heat" style={{ gridTemplateColumns: `110px repeat(${scan.length}, 1fr)` }}>
            <div />{scan.map((d) => <div key={d.delay} className="num mute" style={{ textAlign: "center" }}>{d.delay % 5 === 0 ? `+${d.delay}` : ""}</div>)}
            <div className="rowlab">{t.science}</div>{scan.map((d) => <div key={"s" + d.delay} className={"cell " + (d.s ? "v" : "n")} />)}
            <div className="rowlab">{t.engineering}</div>{scan.map((d) => <div key={"e" + d.delay} className={"cell " + (d.e ? "v" : "n")} />)}
            <div className="rowlab"><b>{t.agreement}</b></div>{scan.map((d) => <div key={"a" + d.delay} className={"cell " + (d.s && d.e ? "v" : "n")} title={`+${d.delay} d`} />)}
          </div>
          <p className="small mute" style={{ marginTop: 6 }}>{t.agreementHint} · {es ? "Umbral de Sol aplicado sobre el % calculado por el motor." : "Sun threshold applied to the engine's computed %."}</p>
        </div>)}
      <div className="grid two">
        <div className="panel"><h2>{t.fundamentals}</h2>
          <ul style={{ margin: "0 0 0 18px", fontSize: 13, lineHeight: 1.6 }}>
            <li>{es ? "Efemérides: " : "Ephemeris: "}{result.data.ephemeris_provider} · {result.data.ephemeris_frame} · {result.data.ephemeris_corrections}</li>
            <li>{es ? "Horizonte: " : "Horizon: "}{result.data.horizon_source}{result.data.horizon_resolution_m ? ` · ${result.data.horizon_resolution_m} m/px` : ""} · θ = atan2(r_t cos ψ − r_o, r_t sin ψ)</li>
            <li>{es ? "Disco: integración numérica + segmento circular de control." : "Disc: numerical integration + circular-segment check."}</li>
            <li>{es ? "Irradiancia S = S₀(AU/r)², potencia P = S·A·η·cos i·f, balance horario." : "Irradiance S = S₀(AU/r)², power P = S·A·η·cos i·f, hourly balance."}</li>
            <li>{es ? "Incertidumbre: cada paso la declara (ver traza)." : "Uncertainty: declared per step (see trace)."}</li>
          </ul></div>
        <div className="panel"><h2>{t.limitsTitle}</h2>
          <ul style={{ margin: "0 0 0 18px", fontSize: 13, lineHeight: 1.6 }}>{result.limits.map((l, i) => <li key={i}>{l}</li>)}</ul></div>
      </div>
      <Inferences result={result} t={t} lang={lang} open={open} />
    </div>
  );
}

// ---- Calculator connected to /api/calc.
export function Calculator({ t, traceId, onSaved }) {
  const [list, setList] = useState([]); const [fid, setFid] = useState(""); const [vals, setVals] = useState({});
  const [out, setOut] = useState(null); const [err, setErr] = useState(null);
  useEffect(() => { api.formulas().then((l) => { setList(l); setFid(l[0]?.id || ""); }).catch((e) => setErr(String(e))); }, []);
  const f = list.find((x) => x.id === fid);
  useEffect(() => { if (f) setVals(Object.fromEntries(f.inputs.map((i) => [i.name, i.default ?? ""]))); setOut(null); }, [fid]); // eslint-disable-line
  const run = async (save) => { setErr(null); try {
    const inputs = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, +v]));
    const r = await api.calc(fid, inputs, save ? traceId : undefined); setOut(r); if (save) onSaved?.(r);
  } catch (e) { setErr(String(e.message || e)); } };
  if (!f) return <div className="panel mute">{err || "—"}</div>;
  return (
    <div className="panel"><h2>{t.calculator}</h2>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label className="field">{t.formula}<select value={fid} onChange={(e) => setFid(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      </div>
      <div className="formula" style={{ margin: "8px 0" }}>{f.latex}</div>
      <p className="small mute">{f.description}{f.source ? ` · ${f.source}` : ""}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "8px 0" }}>
        {f.inputs.map((i) => <label key={i.name} className="field">{i.name} ({i.unit || "—"})<input type="number" step="any" value={vals[i.name] ?? ""} onChange={(e) => setVals({ ...vals, [i.name]: e.target.value })} title={i.description} /></label>)}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn primary" onClick={() => run(false)}>{t.compute}</button>
        {traceId && <button className="btn" onClick={() => run(true)}>{t.applyToTrace}</button>}
      </div>
      {err && <div className="errbox" style={{ marginTop: 8 }}>{err}</div>}
      {out && <div className="formula sun" style={{ marginTop: 8 }}>{f.output.name} = {typeof out.result.value === "number" ? out.result.value.toPrecision(8) : String(out.result.value)} {out.result.unit}
        <div className="mute small" style={{ fontFamily: "var(--sans)" }}>{out.step.assumptions?.join(" · ")}</div></div>}
    </div>
  );
}

// ---- Validation panel, limits, credits.
export function Validation({ status, result, t, lang }) {
  const es = lang === "es";
  return (
    <div className="stack">
      <div className="panel"><h2>{t.validation}</h2>
        <table className="t"><thead><tr><th>{es ? "Qué se valida" : "What"}</th><th>{es ? "Contra qué" : "Against"}</th><th>{es ? "Resultado medido" : "Measured"}</th></tr></thead>
          <tbody>
            <tr><td>{es ? "Lectura de Horizons (parseo y alineación de épocas)" : "Horizons parsing and epoch alignment"}</td><td>{es ? "Consultas independientes TLIST en 10 instantes" : "Independent TLIST queries at 10 epochs"}</td><td className="num">max |ΔAz| = 0, |ΔEl| = 0 (tests/test_validation_horizons.py)</td></tr>
            <tr><td>{es ? "SPICE vs Horizons" : "SPICE vs Horizons"}</td><td>{es ? "10 instantes, mismo sitio" : "10 epochs, same site"}</td><td className="num">{status?.ephemeris?.spice?.available ? (es ? "ver salida de pytest" : "see pytest output") : (es ? "sin kernels: no medido" : "no kernels: not measured")}</td></tr>
            <tr><td>{es ? "Fracción de disco" : "Disc fraction"}</td><td>{es ? "Casos 0, 0,5 y 1 y segmento analítico" : "Cases 0, 0.5, 1 and analytic segment"}</td><td className="num">{result ? `max |num − seg| en este escenario: ${result.series ? "ver traza disc_sun" : "—"}` : "—"} · tests: &lt; 5e-3</td></tr>
            <tr><td>{es ? "Cordura física" : "Physical sanity"}</td><td>{es ? "En el polo el Sol no supera ~1,5°; la Tierra oscila con ~27 d" : "At the pole the Sun stays below ~1.5°; Earth oscillates with ~27 d"}</td><td className="num">{result ? `Sol max ${Math.max(...result.series.sun_el).toFixed(2)}°, Tierra ${Math.min(...result.series.earth_el).toFixed(1)}…${Math.max(...result.series.earth_el).toFixed(1)}°` : "—"}</td></tr>
            <tr><td>{es ? "Silueta del horizonte" : "Horizon profile"}</td><td>Quickmap (LROC)</td><td className="num">{result?.data.terrain_available ? (es ? "pendiente de medir" : "pending") : (es ? "sin relieve: no medido" : "no terrain: not measured")}</td></tr>
            <tr><td>{es ? "Unidades" : "Units"}</td><td>pint</td><td className="num">tests/test_units_and_formulas.py</td></tr>
          </tbody></table>
        <p className="small mute" style={{ marginTop: 6 }}>{es ? "Los números se escriben cuando están medidos. Si no hay medición, dice «no medido»." : "Numbers are written only once measured; otherwise it says “not measured”."}</p>
      </div>
      <div className="panel"><h2>{t.limitsTitle}</h2><ul style={{ margin: "0 0 0 18px", fontSize: 13, lineHeight: 1.6 }}>{(result?.limits || status?.limits || []).map((l, i) => <li key={i}>{l}</li>)}</ul></div>
      <div className="panel"><h2>{t.credits}</h2>
        <ul style={{ margin: "0 0 0 18px", fontSize: 13, lineHeight: 1.6 }}>
          <li>JPL Horizons System — NASA/JPL Solar System Dynamics, https://ssd.jpl.nasa.gov/horizons/</li>
          <li>NAIF SPICE toolkit and generic kernels (DE440, lunar PA/ME frames) — https://naif.jpl.nasa.gov/</li>
          <li>LOLA (Lunar Orbiter Laser Altimeter) DEMs — NASA PDS Geosciences Node</li>
          <li>LROC Quickmap — Arizona State University, https://quickmap.lroc.asu.edu/</li>
          <li>{es ? "Constantes: IAU 2015 (radios), IAU 2012 (UA), Kopp & Lean 2011 (S₀). Ver backend/lumox/constants.py" : "Constants: IAU 2015 (radii), IAU 2012 (AU), Kopp & Lean 2011 (S₀). See backend/lumox/constants.py"}</li>
          <li>{es ? "Sin logo de NASA ni material con derechos. No es una herramienta oficial de NASA." : "No NASA logo or copyrighted material. Not an official NASA tool."}</li>
        </ul>
        <p className="small mute" style={{ marginTop: 6 }}>{es ? "Motor" : "Engine"}: {status?.version} · {t.provider}: {status?.ephemeris?.spice?.available ? "SPICE" : "Horizons"} · DEMs: {status?.dems?.length ?? 0}</p>
      </div>
    </div>
  );
}
