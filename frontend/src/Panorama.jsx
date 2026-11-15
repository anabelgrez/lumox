import React, { useMemo } from "react";

// Panorama 360° del horizonte: silueta del terreno, recorrido del Sol y de la
// Tierra en la ventana, y los dos discos en la hora elegida con su radio real.
// El terreno se dibuja encima de los discos para que los tape igual que en el cálculo.

const W = 1000, H = 300, PL = 42, PB = 26, PT = 12;
const EMIN = -6, EMAX = 10;
const X = (az) => PL + (az / 360) * (W - PL - 8);
const Y = (el) => PT + (1 - (el - EMIN) / (EMAX - EMIN)) * (H - PT - PB);

function track(az, el) {
  // cortamos la línea cuando el azimut da la vuelta (359° → 0°)
  let d = "", prev = null;
  for (let i = 0; i < az.length; i++) {
    const x = X(az[i]), y = Y(Math.max(EMIN - 1, Math.min(EMAX + 1, el[i])));
    d += prev === null || Math.abs(az[i] - prev) > 180 ? `M${x},${y}` : `L${x},${y}`;
    prev = az[i];
  }
  return d;
}

export function PanoramaSvg({ result, hour, lang = "es" }) {
  const s = result.series, hz = result.horizon, i = Math.min(hour, s.time.length - 1);
  const terrain = useMemo(() => {
    let d = `M${X(0)},${Y(EMIN)}`;
    hz.azimuth.forEach((a, k) => { d += `L${X(a)},${Y(hz.elevation[k])}`; });
    return d + `L${X(360)},${Y(hz.elevation[0])}L${X(360)},${Y(EMIN)}Z`;
  }, [hz]);
  const px = (deg) => Math.max(3, (deg / (EMAX - EMIN)) * (H - PT - PB));
  const es = lang === "es";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={es ? `Panorama: Sol a ${s.sun_el[i].toFixed(2)}°, Tierra a ${s.earth_el[i].toFixed(2)}°` : `Panorama: Sun at ${s.sun_el[i].toFixed(2)}°, Earth at ${s.earth_el[i].toFixed(2)}°`}>
      {[-5, 0, 5, 10].map((e) => (
        <g key={e}>
          <line x1={PL} x2={W - 8} y1={Y(e)} y2={Y(e)} stroke={e === 0 ? "#6b7385" : "#162238"} strokeDasharray={e === 0 ? "" : "3 4"} />
          <text x={PL - 6} y={Y(e) + 4} fill="#7f8ca6" fontSize="11" textAnchor="end" fontFamily="var(--mono)">{e}°</text>
        </g>
      ))}
      {[0, 90, 180, 270, 360].map((a) => (
        <g key={a}>
          <line x1={X(a)} x2={X(a)} y1={PT} y2={H - PB} stroke="#162238" />
          <text x={X(a)} y={H - 8} fill="#7f8ca6" fontSize="11" textAnchor="middle" fontFamily="var(--mono)">{["N", "E", "S", es ? "O" : "W", "N"][a / 90]} {a}°</text>
        </g>
      ))}
      <path d={track(s.sun_az, s.sun_el)} fill="none" stroke="var(--sun)" strokeOpacity="0.45" strokeWidth="1.5" />
      <path d={track(s.earth_az, s.earth_el)} fill="none" stroke="var(--earth)" strokeOpacity="0.45" strokeWidth="1.5" />
      <circle cx={X(s.earth_az[i])} cy={Y(s.earth_el[i])} r={px(s.earth_rho_deg[i])} fill="var(--earth)" opacity={s.earth_fraction[i] > 0 ? 1 : 0.35} />
      <circle cx={X(s.sun_az[i])} cy={Y(s.sun_el[i])} r={px(s.sun_rho_deg[i])} fill="var(--sun)" opacity={s.sun_fraction[i] > 0 ? 1 : 0.35} />
      <path d={terrain} fill="var(--terrain)" stroke="var(--terrain-edge)" strokeWidth="1" />
      <text x={X(s.sun_az[i]) + 10} y={Y(s.sun_el[i]) - 10} fill="var(--sun)" fontSize="12" fontFamily="var(--mono)">☉ {s.sun_el[i].toFixed(2)}° · {(s.sun_fraction[i] * 100).toFixed(0)}%</text>
      <text x={X(s.earth_az[i]) + 14} y={Y(s.earth_el[i]) + 16} fill="var(--earth)" fontSize="12" fontFamily="var(--mono)">⊕ {s.earth_el[i].toFixed(2)}°</text>
    </svg>
  );
}

// Versión con panel, usada en Comparar.
export default function Panorama({ result, t, hour, lang }) {
  if (!result) return <div className="panel empty">—</div>;
  return (
    <div className="panel panorama">
      <div className="panel-h"><h2>{t?.panorama || "Panorama"}</h2><span className="right xs num mute">{result.series.time[Math.min(hour, result.series.time.length - 1)].replace("T", " ").slice(0, 16)} UTC</span></div>
      {result.data.horizon_source === "flat" && <div className="warnbox" style={{ marginBottom: 8 }}>{t?.flatHorizon}</div>}
      <PanoramaSvg result={result} hour={hour} lang={lang} />
    </div>
  );
}
