import React, { useEffect, useState } from "react";
import { nextStep, nowPhrase } from "./plain.js";

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
    <svg className="mascot" viewBox="0 0 100 100" width={size} height={size} aria-label={`Lumo (${state})`}>
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

const TOUR_KEY = "lumox.tour.v1";

export default function Lumo({ result, t, lang, hour = 0, guide, setGuide, visible, setVisible, loadExample, running, onAction, tourReady, compact = false }) {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(!compact);
  useEffect(() => setOpen(!compact), [compact]);
  const es = lang === "es";
  const steps = guideSteps(lang);

  // la primera vez que aparece una respuesta, arranca el recorrido (se puede saltar)
  useEffect(() => {
    if (!tourReady) return;
    let done = false;
    try { done = localStorage.getItem(TOUR_KEY) === "1"; } catch { /* sin almacenamiento: lo mostramos igual */ }
    if (!done) { setVisible(true); setGuide(true); setStep(0); }
  }, [tourReady]); // eslint-disable-line

  // resalta la parte de la pantalla de la que habla cada paso
  useEffect(() => {
    document.querySelectorAll(".tour-hi").forEach((e) => e.classList.remove("tour-hi"));
    if (!guide || !tourReady) return;
    const el = document.querySelector(`[data-tour="${steps[step]?.target}"]`);
    if (el) { el.classList.add("tour-hi"); el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); }
  }, [guide, step, tourReady, lang]); // eslint-disable-line

  const endTour = () => {
    setGuide(false); setStep(0);
    try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* sin almacenamiento */ }
    document.querySelectorAll(".tour-hi").forEach((e) => e.classList.remove("tour-hi"));
  };

  if (!visible) return <button className="btn lumo-toggle" onClick={() => setVisible(true)}>{t.lumoShow}</button>;
  const state = running ? "worried" : !result ? "happy" : result.verdict.state === "survives" ? "happy" : result.verdict.state === "marginal" ? "worried" : "asleep";
  // Lumo usa las mismas frases que la traza: primero qué pasa ahora, después qué hacer
  const next = nextStep(running ? null : result, lang);
  const say = running ? (es ? "Estoy calculando… cada paso aparece abajo, en la tabla." : "Computing… each step shows up in the table below.")
    : result ? nowPhrase(result, hour, lang) : (es ? "¡Hola! Soy Lumo." : "Hi! I'm Lumo.");
  return (
    <div className={"lumo" + (open || guide ? "" : " compact")} role="complementary" aria-label="Lumo">
      {(open || guide) && <div className="bubble" aria-live="polite">
        {guide ? (
          <>
            <div className="small mute">{es ? "Recorrido" : "Tour"} · {step + 1}/{steps.length}</div>
            <div style={{ marginTop: 4 }}><b>{steps[step].title}</b></div>
            <div style={{ marginTop: 4 }}>{steps[step].text}</div>
            <div className="acts">
              <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>{t.prev}</button>
              {step < steps.length - 1 ? <button className="btn primary" onClick={() => { if (!result) loadExample(); setStep(step + 1); }}>{t.next}</button>
                : <button className="btn primary" onClick={endTour}>{es ? "Listo" : "Done"}</button>}
              <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={endTour}>{es ? "Saltar" : "Skip"}</button>
            </div>
          </>
        ) : (
          <>
            <div>{say}</div>
            {!running && <div style={{ marginTop: 8, fontWeight: 600 }}>{next.text}</div>}
            <div className="acts">
              {!running && <button className="btn primary" onClick={() => next.action === "example" ? loadExample() : onAction?.(next.action)}>{es ? "Dale" : "Go"}</button>}
              <button className="btn" onClick={() => { if (!result) loadExample(); setGuide(true); setStep(0); }}>{es ? "Recorrido" : "Tour"}</button>
              <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => setVisible(false)}>{t.lumoHide}</button>
            </div>
          </>
        )}
      </div>}
      <button style={{ background: "none", border: 0, padding: 0 }} onClick={() => (compact ? setOpen(!open) : setVisible(false))} aria-label={compact ? (es ? "Hablar con Lumo" : "Talk to Lumo") : t.lumoHide} aria-expanded={open}><LumoSvg state={state} size={110} /></button>
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

// Recorrido de 4 pasos: qué dice el veredicto, qué es el visor, cómo mover la fecha
// y cómo probar otra cosa. "target" es el data-tour de la parte que se resalta.
function guideSteps(lang) {
  return lang === "es" ? [
    { target: "verdict", title: "1. La respuesta", text: "Arriba de todo está el veredicto: si la misión sobrevive y por qué, en una oración. El color dice lo mismo: verde sobrevive, amarillo justo, rojo no." },
    { target: "viewer", title: "2. Lo que se ve desde el sitio", text: "Esto es el relieve real alrededor del módulo. El Sol y la Tierra están donde el cálculo dice. Si una loma los tapa, la línea se pone roja." },
    { target: "timeline", title: "3. Mover el tiempo", text: "Arrastrá esta barra para recorrer la misión hora por hora. Las franjas muestran cuándo hay Sol y cuándo se ve la Tierra." },
    { target: "margins", title: "4. Probar otra cosa", text: "Acá podés cambiar la fecha, subir el panel o mover el sitio unos km, y ver al instante si mejora." },
  ] : [
    { target: "verdict", title: "1. The answer", text: "At the top is the verdict: whether the mission survives and why, in one sentence. The colour says the same: green survives, yellow barely, red fails." },
    { target: "viewer", title: "2. What the site looks like", text: "This is the real terrain around the lander. Sun and Earth are where the calculation puts them. If a ridge blocks them, the line turns red." },
    { target: "timeline", title: "3. Move through time", text: "Drag this bar to go through the mission hour by hour. The bands show when there is Sun and when Earth is in view." },
    { target: "margins", title: "4. Try something else", text: "Here you can change the date, raise the panel or move the site a few km, and see right away whether it helps." },
  ];
}
