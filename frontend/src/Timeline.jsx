import React from "react";
import { Ic } from "./icons.jsx";

// Línea de tiempo bajo el visor. Las marcas de salida y puesta vienen de la lista
// de eventos que calcula el backend; acá solo se dibujan en su hora.

export default function Timeline({ result, hour, setHour, playing, setPlaying, lang }) {
  const es = lang === "es";
  if (!result) return null;
  const s = result.series, n = s.time.length, i = Math.min(hour, n - 1);
  const pct = (k) => `${(k / (n - 1)) * 100}%`;
  const ev = result.events || [];
  const t = s.time[i].replace("T", " ").slice(0, 16);
  return (
    <div className="timeline" data-tour="timeline">
      <button className="btn icon" onClick={() => setPlaying(!playing)} aria-label={playing ? (es ? "Pausar" : "Pause") : (es ? "Reproducir la misión" : "Play the mission")}>
        {playing ? <Ic.pause /> : <Ic.play />}
      </button>
      <div className="tl-track">
        {/* franjas de Sol y de Tierra visibles, hora por hora */}
        <div className="tl-bands" aria-hidden="true">
          <div className="tl-row">{s.sun_fraction.map((f, k) => <span key={k} style={{ background: f > 0 ? "var(--sun)" : "transparent", opacity: 0.25 + 0.6 * f }} />)}</div>
          <div className="tl-row">{s.earth_fraction.map((f, k) => <span key={k} style={{ background: f > 0 ? "var(--earth)" : "transparent", opacity: 0.7 }} />)}</div>
        </div>
        {ev.map((e, k) => (
          <span key={k} className={"tl-mark " + e.body} style={{ left: pct(e.idx) }}
            title={`${e.body === "sun" ? (es ? "Sol" : "Sun") : (es ? "Tierra" : "Earth")} ${e.rise ? (es ? "sale" : "rises") : (es ? "se pone" : "sets")} · ${e.t.replace("T", " ").slice(0, 16)} UTC`}>
            {e.rise ? "▲" : "▼"}
          </span>
        ))}
        <input type="range" min={0} max={n - 1} value={i} onChange={(e) => { setPlaying(false); setHour(+e.target.value); }}
          aria-label={es ? "Momento de la misión" : "Mission moment"} aria-valuetext={t} />
      </div>
      <div className="tl-time">
        <div className="num">{t} UTC</div>
        <div className="mute">{es ? "día" : "day"} {Math.floor(i / 24) + 1} · {String(i % 24).padStart(2, "0")} h</div>
      </div>
      <div className="tl-legend">
        <span><i style={{ background: "var(--sun)" }} />{es ? "hay Sol" : "Sun up"}</span>
        <span><i style={{ background: "var(--earth)" }} />{es ? "se ve la Tierra" : "Earth in view"}</span>
        <span>▲ {es ? "sale" : "rises"} ▼ {es ? "se pone" : "sets"}</span>
      </div>
    </div>
  );
}
