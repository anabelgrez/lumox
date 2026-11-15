import React from "react";

// Animaciones 2D didácticas (SVG + CSS). Van "en el medio", entre el panorama y
// las tarjetas, y cuentan en dibujitos lo que el motor hace con números:
//  1. por qué una montaña lejana tapa menos que una cercana (ángulo del horizonte)
//  2. qué es la "fracción del disco" cuando el Sol asoma a medias
//  3. la batería como cuenta bancaria hora por hora
//  4. la Tierra que sube y baja por la libración
// No hay cálculo acá: son ilustraciones con valores fijos de ejemplo.

const css = `
@keyframes lx-ray { 0%{transform:rotate(14deg)} 50%{transform:rotate(3deg)} 100%{transform:rotate(14deg)} }
@keyframes lx-sunrise { 0%{transform:translateY(26px)} 45%{transform:translateY(-4px)} 55%{transform:translateY(-4px)} 100%{transform:translateY(26px)} }
@keyframes lx-batt { 0%{width:70%;background:var(--ok)} 35%{width:100%;background:var(--ok)} 60%{width:35%;background:var(--warn)} 80%{width:4%;background:var(--bad)} 100%{width:70%;background:var(--ok)} }
@keyframes lx-sunbar { 0%{opacity:1} 40%{opacity:1} 50%{opacity:.15} 85%{opacity:.15} 100%{opacity:1} }
@keyframes lx-earth { 0%{transform:translateY(0)} 50%{transform:translateY(-34px)} 100%{transform:translateY(0)} }
@keyframes lx-pct { 0%{content:"0 %"} }
.lx-ray{transform-origin:60px 86px;animation:lx-ray 6s ease-in-out infinite}
.lx-sun{animation:lx-sunrise 7s ease-in-out infinite}
.lx-batt{height:14px;border-radius:7px;animation:lx-batt 8s linear infinite}
.lx-sunbar{animation:lx-sunbar 8s linear infinite}
.lx-earth{animation:lx-earth 9s ease-in-out infinite}
.lx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px}
.lx-card{background:var(--field);border:1px solid var(--line);border-radius:12px;padding:10px}
.lx-card h4{font-size:13px;margin-bottom:6px}
.lx-card p{font-size:12.5px;color:var(--soft)}
.lx-card svg{width:100%;height:auto;display:block;background:var(--sky);border-radius:8px;margin:4px 0}
`;

export default function Explainers({ lang, result }) {
  const es = lang === "es";
  const mast = result?.spec?.mast_m ?? 2;
  return (
    <div className="panel">
      <style>{css}</style>
      <h2>{es ? "¿Cómo funciona? (en dibujitos)" : "How does it work? (in pictures)"}</h2>
      <div className="lx-grid">
        <div className="lx-card">
          <h4>{es ? "1 · El horizonte no es una línea, es la montaña más alta" : "1 · The horizon is not a line, it is the tallest ridge"}</h4>
          <svg viewBox="0 0 240 110">
            <path d="M0 110 Q120 70 240 110 Z" fill="var(--terrain)" />
            <path d="M150 92 l22 -30 l18 30 Z" fill="#4b5569" />
            <path d="M200 96 l14 -16 l12 16 Z" fill="#4b5569" />
            <rect x="54" y="78" width="12" height="8" fill="#e9eef7" /><line x1="60" y1="78" x2="60" y2={78 - mast * 3} stroke="#9aa7bd" strokeWidth="2" />
            <g className="lx-ray"><line x1="60" y1="86" x2="236" y2="86" stroke="var(--sun)" strokeWidth="1.5" strokeDasharray="4 3" /></g>
            <circle cx="60" cy={78 - mast * 3} r="2.5" fill="var(--sun)" />
            <text x="8" y="14" fill="var(--mute)" fontSize="9" fontFamily="var(--mono)">θ = atan2(r_t cos ψ − r_o, r_t sin ψ)</text>
          </svg>
          <p>{es ? `Desde el módulo trazamos un rayo en cada dirección y anotamos el ángulo más alto que toca terreno. Subir el mástil (acá ${mast} m) baja ese ángulo. Como la Luna es redonda, lo lejano se hunde: a 150 km el suelo "cae" 6,5 km.` : `From the lander we cast a ray in every direction and note the highest angle that touches ground. Raising the mast (here ${mast} m) lowers that angle. The Moon is round, so far ground sinks: at 150 km it drops 6.5 km.`}</p>
        </div>
        <div className="lx-card">
          <h4>{es ? "2 · El Sol asoma a medias: fracción del disco" : "2 · Half a Sun: the disc fraction"}</h4>
          <svg viewBox="0 0 240 110">
            <defs><clipPath id="lx-above"><rect x="0" y="0" width="240" height="70" /></clipPath></defs>
            <g clipPath="url(#lx-above)"><circle className="lx-sun" cx="120" cy="70" r="22" fill="var(--sun)" /></g>
            <path d="M0 110 L0 70 L240 70 L240 110 Z" fill="var(--terrain)" />
            <text x="8" y="14" fill="var(--mute)" fontSize="9" fontFamily="var(--mono)">f = [arccos(−x) + x√(1−x²)] / π</text>
            <text x="8" y="100" fill="var(--soft)" fontSize="9">{es ? "f = 0 (nada)  ·  0,5 (la mitad)  ·  1 (entero)" : "f = 0 (none)  ·  0.5 (half)  ·  1 (full)"}</text>
          </svg>
          <p>{es ? "En el polo el Sol nunca sube mucho: pasa semanas rozando las cumbres. Por eso no alcanza con \"arriba/abajo\": contamos qué porción del disco se ve, y esa porción multiplica la energía del panel." : "At the pole the Sun never climbs high: it spends weeks skimming the peaks. “Up/down” is not enough: we count what portion of the disc shows, and that portion scales the panel's energy."}</p>
        </div>
        <div className="lx-card">
          <h4>{es ? "3 · La batería es una cuenta bancaria" : "3 · The battery is a bank account"}</h4>
          <div style={{ padding: "10px 4px" }}>
            <div className="small mute" style={{ display: "flex", justifyContent: "space-between" }}><span>{es ? "Sol" : "Sun"}</span><span className="lx-sunbar sun">☀ ☀ ☀ ☀</span></div>
            <div style={{ background: "var(--field)", borderRadius: 7, marginTop: 6 }}><div className="lx-batt" /></div>
            <div className="small mute" style={{ marginTop: 6 }}>{es ? "entra (panel) − sale (consumo) · nunca menos de 0 ni más de llena" : "in (panel) − out (load) · never below 0 nor above full"}</div>
          </div>
          <p>{es ? "Hora por hora: con Sol entra energía y la batería se llena; de noche solo sale. Si la noche dura más que la autonomía, la cuenta llega a cero y el módulo se apaga. Eso es lo que decide el veredicto." : "Hour by hour: with Sun, energy comes in and the battery fills; at night it only drains. If the night outlasts the autonomy, the account hits zero and the lander dies. That is what the verdict decides."}</p>
        </div>
        <div className="lx-card">
          <h4>{es ? "4 · La Tierra sube y baja (libración)" : "4 · The Earth bobs up and down (libration)"}</h4>
          <svg viewBox="0 0 240 110">
            <path d="M0 110 L0 72 L60 66 L120 74 L180 62 L240 70 L240 110 Z" fill="var(--terrain)" />
            <g className="lx-earth"><circle cx="150" cy="84" r="9" fill="var(--earth)" /></g>
            <text x="8" y="14" fill="var(--mute)" fontSize="9" fontFamily="var(--mono)">~27 d</text>
          </svg>
          <p>{es ? "La Luna siempre muestra la misma cara, pero \"cabecea\" unos ±7°. Desde el polo sur eso hace que la Tierra aparezca y se esconda cada ~27 días. Cuando está detrás de la cresta, no hay radio: ese es el corte de comunicación." : "The Moon always shows the same face but wobbles about ±7°. From the south pole that makes the Earth appear and hide every ~27 days. When it is behind the ridge there is no radio: that is the comm gap."}</p>
        </div>
      </div>
    </div>
  );
}
