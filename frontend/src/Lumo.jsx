import React, { useState } from "react";

// Lumo: an original SVG mascot — a small lunar module with a solar panel and
// an antenna. Three states tied to the verdict: happy (survives), worried
// (marginal), asleep (fails). It explains the screen in plain language using
// templates over the backend's numbers, and guides the example in 4 steps.

export function LumoSvg({ state = "happy", size = 92 }) {
  const eye = state === "asleep" ? (
    <>
      <path d="M38 50 q5 4 10 0" stroke="#0b1020" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M54 50 q5 4 10 0" stroke="#0b1020" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ) : state === "worried" ? (
    <>
      <circle cx="43" cy="50" r="3.2" fill="#0b1020" /><circle cx="59" cy="50" r="3.2" fill="#0b1020" />
      <path d="M36 42 l10 4 M66 42 l-10 4" stroke="#0b1020" strokeWidth="2.5" strokeLinecap="round" />
    </>
  ) : (
    <>
      <circle cx="43" cy="49" r="3.5" fill="#0b1020" /><circle cx="59" cy="49" r="3.5" fill="#0b1020" />
      <circle cx="44.5" cy="47.5" r="1.1" fill="#fff" /><circle cx="60.5" cy="47.5" r="1.1" fill="#fff" />
    </>
  );
  const mouth = state === "asleep" ? <path d="M46 60 q5 2 10 0" stroke="#0b1020" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    : state === "worried" ? <path d="M45 62 q6 -4 12 0" stroke="#0b1020" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    : <path d="M44 58 q7 7 14 0" stroke="#0b1020" strokeWidth="2.2" fill="none" strokeLinecap="round" />;
  const panelFill = state === "asleep" ? "#2b3a55" : "#3f8cff";
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-label={`Lumo (${state})`}>
      {/* antenna */}
      <line x1="72" y1="30" x2="84" y2="12" stroke="#c5cedf" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="85" cy="11" r="3.5" fill={state === "fails" ? "#555" : "#f5b120"} />
      {state !== "asleep" && <path d="M88 6 q6 5 0 12" stroke="#f5b120" strokeWidth="1.5" fill="none" opacity="0.7" />}
      {/* solar panel on a mast */}
      <rect x="22" y="31" width="4" height="22" fill="#9aa7bd" />
      <g transform="rotate(-18 24 24)">
        <rect x="4" y="18" width="40" height="13" rx="2" fill={panelFill} stroke="#9fc6ff" strokeWidth="1" />
        {[12, 20, 28, 36].map((x) => <line key={x} x1={x} y1="18" x2={x} y2="31" stroke="#0b1020" strokeWidth="0.8" opacity="0.6" />)}
      </g>
      {/* body */}
      <rect x="28" y="36" width="46" height="36" rx="8" fill="#e9eef7" stroke="#c5cedf" strokeWidth="2" />
      <rect x="33" y="41" width="36" height="26" rx="6" fill="#f7f9fd" />
      {eye}{mouth}
      {/* legs */}
      <path d="M34 72 l-8 14 M68 72 l8 14 M44 72 v14 M58 72 v14" stroke="#9aa7bd" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 87 h10 M70 87 h10 M40 87 h8 M54 87 h8" stroke="#6c7a94" strokeWidth="3" strokeLinecap="round" />
      {state === "asleep" && <text x="80" y="40" fill="#96a3ba" fontSize="12" fontFamily="var(--mono)">z z</text>}
    </svg>
  );
}

export default function Lumo({ result, t, lang, guide, setGuide, visible, setVisible, loadExample, running }) {
  const [step, setStep] = useState(0);
  if (!visible) return <button className="btn lumo-toggle" onClick={() => setVisible(true)}>{t.lumoShow}</button>;
  const state = running ? "worried" : !result ? "happy" : result.verdict.state === "survives" ? "happy" : result.verdict.state === "marginal" ? "worried" : "asleep";
  const say = explain(result, lang, running);
  const steps = guideSteps(lang);
  return (
    <div className="lumo">
      <div className="bubble">
        {guide ? (
          <>
            <div><b>{t.exampleTitle}</b> · {step + 1}/{steps.length}</div>
            <div style={{ marginTop: 4 }}>{steps[step]}</div>
            <div className="nav">
              <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>{t.prev}</button>
              {step < steps.length - 1 ? <button className="btn primary" onClick={() => { if (step === 0) loadExample(); setStep(step + 1); }}>{t.next}</button>
                : <button className="btn primary" onClick={() => { setGuide(false); setStep(0); }}>OK</button>}
              <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setVisible(false)}>{t.lumoHide}</button>
            </div>
          </>
        ) : (
          <>
            <div>{say}</div>
            <div className="nav">
              <button className="btn" onClick={() => { setGuide(true); setStep(0); }}>{t.example}</button>
              <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setVisible(false)}>{t.lumoHide}</button>
            </div>
          </>
        )}
      </div>
      <div onClick={() => setVisible(false)}><LumoSvg state={state} /></div>
    </div>
  );
}

// Plain-language templates over the backend's numbers. No model, no guessing.
function explain(r, lang, running) {
  const es = lang === "es";
  if (running) return es ? "Estoy calculando… cada paso aparece a la derecha a medida que sale del motor." : "Computing… each step shows on the right as the engine emits it.";
  if (!r) return es ? "¡Hola! Soy Lumo. Elegí un sitio y una fecha, o tocá «Ver ejemplo»." : "Hi! I'm Lumo. Pick a site and a date, or press “See example”.";
  const m = r.metrics, v = r.verdict.state, flat = r.data.horizon_source === "flat";
  const night = m.longest_night_h.toFixed(0), aut = r.autonomy_h.toFixed(0), gap = m.longest_comm_gap_h.toFixed(0), gmax = r.spec.max_comm_gap_h;
  const sun = m.sun_time_pct.toFixed(0), earth = m.earth_visible_pct.toFixed(0), md = r.margins?.days?.margin_days;
  const parts = [];
  if (es) {
    parts.push(`En ${r.site.name} hay Sol el ${sun} % del tiempo y la Tierra se ve el ${earth} %.`);
    parts.push(`La noche más larga dura ${night} h con ${aut} h de batería; el corte de comunicación más largo es de ${gap} h contra ${gmax} h permitidas.`);
    parts.push(v === "survives" ? "Entra en los límites: sobrevive." : v === "marginal" ? "Está al límite: cualquier atraso puede romperlo." : "No sobrevive con estos límites.");
    if (md !== undefined) parts.push(r.margins.days.viable_now ? `Podés atrasarte hasta ${md} días sin perder viabilidad.` : "En esta fecha no es viable; mirá las alternativas.");
    if (flat) parts.push("Ojo: no hay relieve cargado, así que el horizonte es plano y esto es optimista.");
  } else {
    parts.push(`At ${r.site.name} there is sunlight ${sun}% of the time and Earth is in view ${earth}%.`);
    parts.push(`The longest night lasts ${night} h with ${aut} h of battery; the longest comm gap is ${gap} h versus ${gmax} h allowed.`);
    parts.push(v === "survives" ? "Within limits: it survives." : v === "marginal" ? "Marginal: any delay may break it." : "Does not survive with these limits.");
    if (md !== undefined) parts.push(r.margins.days.viable_now ? `You can slip up to ${md} days and stay viable.` : "Not viable on this date; check the alternatives.");
    if (flat) parts.push("Note: no terrain loaded, so the horizon is flat and this is optimistic.");
  }
  return parts.join(" ");
}

function guideSteps(lang) {
  return lang === "es" ? [
    "Paso 1: un módulo iba a alunizar cerca del polo sur (Shackleton) el 15 de enero de 2027, pero el cohete se atrasó 9 días. Tocá «Siguiente» y cargo el caso.",
    "Paso 2: mirá el panorama. La silueta es el terreno; el Sol roza las montañas y la Tierra sube y baja cada ~27 días.",
    "Paso 3: las tarjetas dicen cuánto dura la noche más larga y el corte de comunicación; el veredicto compara con la batería y el límite de corte.",
    "Paso 4: en «Márgenes» ves cuántos días más podés atrasarte, qué gana subir el panel y qué pasa si aterrizás unos kilómetros más allá.",
  ] : [
    "Step 1: a lander was to touch down near the south pole (Shackleton) on 15 Jan 2027, but the rocket slipped 9 days. Press “Next” and I load the case.",
    "Step 2: look at the panorama. The silhouette is the terrain; the Sun skims the ridges and the Earth rises and sets every ~27 days.",
    "Step 3: the cards show the longest night and the longest comm gap; the verdict compares them with the battery and the gap limit.",
    "Step 4: in “Margins” you see how many more days you can slip, what raising the panel buys, and what happens a few kilometres away.",
  ];
}
