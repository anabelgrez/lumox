import React, { useEffect, useState } from "react";
import { Ic } from "./icons.jsx";

// Cinco animaciones cortas, una por concepto. Son dibujos con valores de
// ejemplo (no datos del escenario): explican la idea, los números de verdad
// están en el paso de la traza que las abre.
// Duran menos de 10 s, se pueden pausar y, si el sistema pide menos
// movimiento, arrancan quietas.

const reduce = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const CSS = `
@keyframes a1-ray { 0%,10% { transform: rotate(-9deg) } 60%,100% { transform: rotate(-2.6deg) } }
@keyframes a1-hit { 0%,55% { opacity: 0 } 65%,100% { opacity: 1 } }
@keyframes a2-sun { 0% { transform: translateY(-30px) } 85%,100% { transform: translateY(30px) } }
@keyframes a3-earth { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-38px) } }
@keyframes a3-radio { 0%,30% { opacity: 1 } 40%,60% { opacity: 0.1 } 70%,100% { opacity: 1 } }
@keyframes a4-fill { 0% { height: 60% } 35% { height: 100% } 70% { height: 8% } 100% { height: 60% } }
@keyframes a4-sky { 0%,40% { opacity: 1 } 45%,95% { opacity: 0.1 } 100% { opacity: 1 } }
@keyframes a5-mast { 0%,15% { transform: scaleY(1) } 55%,100% { transform: scaleY(2.6) } }
@keyframes a5-ray { 0%,15% { transform: rotate(4deg) } 55%,100% { transform: rotate(-1deg) } }
@keyframes a5-sun { 0%,40% { opacity: 0.15 } 55%,100% { opacity: 1 } }
.a1-ray { transform-origin: 46px 120px; animation: a1-ray 8s ease-in-out infinite; }
.a1-hit { animation: a1-hit 8s ease-in-out infinite; }
.a2-sun { animation: a2-sun 9s linear infinite; }
.a3-earth { animation: a3-earth 9s ease-in-out infinite; }
.a3-radio { animation: a3-radio 9s ease-in-out infinite; }
.a4-fill { animation: a4-fill 9s linear infinite; transform-origin: bottom; }
.a4-sky { animation: a4-sky 9s linear infinite; }
.a5-mast { transform-origin: 60px 132px; transform-box: view-box; animation: a5-mast 8s ease-in-out infinite; }
.a5-ray { transform-origin: 60px 104px; animation: a5-ray 8s ease-in-out infinite; }
.a5-sun { animation: a5-sun 8s ease-in-out infinite; }
`;

function A1() { // horizonte: el rayo sube hasta tocar la loma más alta
  return (
    <svg viewBox="0 0 400 160">
      <path d="M0 160 Q200 118 400 160 Z" fill="#2a2f38" />
      <path d="M150 140 l30 -28 l28 26 Z" fill="#454b57" />
      <path d="M300 136 l40 -50 l38 46 Z" fill="#5a6070" />
      <rect x="38" y="122" width="16" height="10" rx="2" fill="#e9eef7" />
      <g className="a1-ray"><line x1="46" y1="120" x2="400" y2="120" stroke="var(--sun)" strokeWidth="2" strokeDasharray="6 4" /></g>
      <circle className="a1-hit" cx="340" cy="86" r="6" fill="none" stroke="var(--sun)" strokeWidth="2" />
      <text className="a1-hit" x="250" y="70" fill="var(--sun)" fontSize="12" fontFamily="var(--mono)">θ máx</text>
    </svg>
  );
}
function A2() { // el disco del Sol se tapa de a poco
  return (
    <svg viewBox="0 0 400 160">
      <defs><clipPath id="a2c"><rect x="0" y="0" width="400" height="100" /></clipPath></defs>
      <g clipPath="url(#a2c)"><circle className="a2-sun" cx="200" cy="100" r="34" fill="var(--sun)" /></g>
      <path d="M0 160 L0 100 L400 100 L400 160 Z" fill="#2a2f38" />
      <text x="12" y="150" fill="var(--soft)" fontSize="12">1 = entero · 0,5 = la mitad · 0 = nada</text>
    </svg>
  );
}
function A3() { // la Tierra sube y baja por la libración
  return (
    <svg viewBox="0 0 400 160">
      <path d="M0 160 L0 112 L80 104 L160 116 L240 98 L320 110 L400 104 L400 160 Z" fill="#2a2f38" />
      <g className="a3-earth"><circle cx="240" cy="118" r="14" fill="var(--earth)" /></g>
      <rect x="40" y="96" width="16" height="10" rx="2" fill="#e9eef7" />
      <g className="a3-radio" stroke="var(--earth)" strokeWidth="2" fill="none"><path d="M60 92 q6 -6 0 -12" /><path d="M66 96 q12 -12 0 -24" /></g>
      <text x="12" y="20" fill="var(--soft)" fontSize="12" fontFamily="var(--mono)">~27 días</text>
    </svg>
  );
}
function A4() { // la batería se carga de día y se vacía de noche
  return (
    <svg viewBox="0 0 400 160">
      <circle className="a4-sky" cx="70" cy="50" r="22" fill="var(--sun)" />
      <text className="a4-sky" x="40" y="100" fill="var(--soft)" fontSize="12">entra energía</text>
      <rect x="230" y="30" width="70" height="110" rx="8" fill="none" stroke="var(--soft)" strokeWidth="2" />
      <rect x="252" y="22" width="26" height="8" rx="2" fill="var(--soft)" />
      <g transform="translate(236 134) scale(1 -1)"><rect className="a4-fill" x="0" y="0" width="58" height="60%" rx="4" fill="var(--ok)" style={{ height: 0 }} /></g>
      <text x="320" y="90" fill="var(--soft)" fontSize="12">sale lo que</text>
      <text x="320" y="106" fill="var(--soft)" fontSize="12">gasta el módulo</text>
    </svg>
  );
}
function A5() { // subir el mástil o moverse unos km cambia el horizonte
  return (
    <svg viewBox="0 0 400 160">
      <path d="M0 160 L0 132 L400 132 L400 160 Z" fill="#2a2f38" />
      <path d="M220 132 l40 -34 l40 34 Z" fill="#454b57" />
      <circle className="a5-sun" cx="370" cy="90" r="14" fill="var(--sun)" />
      <rect x="52" y="122" width="16" height="10" rx="2" fill="#e9eef7" />
      <rect className="a5-mast" x="58" y="104" width="4" height="18" fill="#9aa7bd" />
      <g className="a5-ray"><line x1="60" y1="104" x2="400" y2="104" stroke="var(--sun)" strokeWidth="2" strokeDasharray="6 4" /></g>
      <text x="12" y="20" fill="var(--soft)" fontSize="12">más alto → menos loma en el medio</text>
    </svg>
  );
}

export const ANIMS = {
  horizon: { C: A1, es: "Cómo una montaña lejana define el horizonte", en: "How a distant ridge defines the horizon" },
  disc: { C: A2, es: "El disco del Sol tapándose de a poco", en: "The Sun's disc slowly covered" },
  libration: { C: A3, es: "La Tierra subiendo y bajando (libración)", en: "Earth rising and setting (libration)" },
  battery: { C: A4, es: "La batería a lo largo del día lunar", en: "The battery over the lunar day" },
  margins: { C: A5, es: "Qué cambia al subir el mástil o moverse", en: "What changes with a taller mast or a few km" },
};

// Qué animación corresponde a cada paso de la traza.
export function animFor(stepId = "") {
  const id = stepId.replace(/#\d+$/, "");
  if (id === "horizon") return "horizon";
  if (["rho_sun", "disc_sun", "segment_sun", "sun_time", "sunset_countdown"].includes(id)) return "disc";
  if (["ephemeris", "rho_earth", "disc_earth", "segment_earth", "earth_time", "longest_gap"].includes(id)) return "libration";
  if (["irradiance", "panel_power", "energy_balance", "longest_night", "verdict"].includes(id)) return "battery";
  if (["margin_metres", "margin_km", "margin_days"].includes(id)) return "margins";
  return null;
}

export function AnimModal({ kind, caption, lang, onClose }) {
  const [paused, setPaused] = useState(reduce());
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onClose]);
  if (!kind) return null;
  const a = ANIMS[kind], es = lang === "es";
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={a[lang]} onClick={(e) => e.stopPropagation()}>
        <style>{CSS}</style>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h3>{a[lang]}</h3>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn" onClick={() => setPaused(!paused)} autoFocus>{paused ? <Ic.play /> : <Ic.pause />}{paused ? (es ? "Reproducir" : "Play") : (es ? "Pausar" : "Pause")}</button>
            <button className="btn" onClick={onClose}>{es ? "Cerrar" : "Close"}</button>
          </div>
        </div>
        <div className={"anim" + (paused ? " paused" : "")}><a.C /></div>
        {caption && <p className="anim caption">{caption}</p>}
        <p className="xs mute" style={{ marginTop: 8 }}>{es ? "Dibujo con valores de ejemplo. Los números de tu escenario están en la traza." : "Illustration with example values. Your scenario's numbers are in the trace."}</p>
      </div>
    </div>
  );
}
