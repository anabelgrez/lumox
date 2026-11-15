import React, { useEffect, useMemo, useRef, useState } from "react";

// 360° horizon panorama. Terrain silhouette, Sun and Earth tracks over the
// mission window, current positions (with their real angular radius) and a
// time slider / lunar-day animation. Pure display: every value is backend data.

const W = 1000, H = 300, PAD_L = 42, PAD_B = 26, PAD_T = 12;
const EL_MIN = -6, EL_MAX = 10;

const X = (az) => PAD_L + (az / 360) * (W - PAD_L - 8);
const Y = (el) => PAD_T + (1 - (el - EL_MIN) / (EL_MAX - EL_MIN)) * (H - PAD_T - PAD_B);

function track(az, el) {
  // Break the polyline where azimuth wraps around 360.
  let d = "", prev = null;
  for (let i = 0; i < az.length; i++) {
    const x = X(az[i]), y = Y(Math.max(EL_MIN - 1, Math.min(EL_MAX + 1, el[i])));
    d += prev !== null && Math.abs(az[i] - prev) > 180 ? `M${x},${y}` : (prev === null ? `M${x},${y}` : `L${x},${y}`);
    prev = az[i];
  }
  return d;
}

export default function Panorama({ result, t, hour, setHour, mastHint }) {
  const [playing, setPlaying] = useState(false);
  const raf = useRef();
  const s = result?.series, hz = result?.horizon;
  const n = s?.time.length ?? 0;

  useEffect(() => {
    if (!playing || !n) return;
    let last = performance.now();
    const tick = (now) => {
      if (now - last > 60) { setHour((h) => (h + 1) % n); last = now; }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, n, setHour]);

  const terrain = useMemo(() => {
    if (!hz) return "";
    const az = hz.azimuth, el = hz.elevation;
    let d = `M${X(0)},${Y(EL_MIN)}`;
    for (let i = 0; i < az.length; i++) d += `L${X(az[i])},${Y(el[i])}`;
    d += `L${X(360)},${Y(el[0])}L${X(360)},${Y(EL_MIN)}Z`;
    return d;
  }, [hz]);

  if (!s) return <div className="panel panorama"><h2>{t.panorama}</h2><p className="mute">—</p></div>;
  const i = Math.min(hour, n - 1);
  const flat = result.data.horizon_source === "flat";
  const rSun = Math.max(3, (s.sun_rho_deg[i] / (EL_MAX - EL_MIN)) * (H - PAD_T - PAD_B));
  const rEarth = Math.max(3, (s.earth_rho_deg[i] / (EL_MAX - EL_MIN)) * (H - PAD_T - PAD_B));
  const sunF = s.sun_fraction[i], earthF = s.earth_fraction[i];

  return (
    <div className="panel panorama">
      <h2>{t.panorama}
        <span className="right small num">{s.time[i].replace("T", " ").slice(0, 16)} UTC</span></h2>
      {flat && <div className="warnbox" style={{ marginBottom: 8 }}>{t.flatHorizon}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t.panorama}>
        <defs>
          <clipPath id="above"><rect x={0} y={0} width={W} height={H} /></clipPath>
        </defs>
        {/* grid */}
        {[-5, 0, 5, 10].map((e) => (
          <g key={e}>
            <line x1={PAD_L} x2={W - 8} y1={Y(e)} y2={Y(e)} stroke={e === 0 ? "#7f8ba3" : "#1f2a40"} strokeDasharray={e === 0 ? "" : "3 4"} />
            <text x={PAD_L - 6} y={Y(e) + 4} fill="#96a3ba" fontSize="11" textAnchor="end" fontFamily="var(--mono)">{e}°</text>
          </g>
        ))}
        {[0, 90, 180, 270, 360].map((a) => (
          <g key={a}>
            <line x1={X(a)} x2={X(a)} y1={PAD_T} y2={H - PAD_B} stroke="#1f2a40" />
            <text x={X(a)} y={H - 8} fill="#96a3ba" fontSize="11" textAnchor="middle" fontFamily="var(--mono)">
              {a === 0 || a === 360 ? "N" : a === 90 ? "E" : a === 180 ? "S" : "W"} {a}°</text>
          </g>
        ))}
        {/* tracks */}
        <path d={track(s.sun_az, s.sun_el)} fill="none" stroke="var(--sun)" strokeOpacity="0.45" strokeWidth="1.5" />
        <path d={track(s.earth_az, s.earth_el)} fill="none" stroke="var(--earth)" strokeOpacity="0.45" strokeWidth="1.5" />
        {/* bodies */}
        <circle cx={X(s.earth_az[i])} cy={Y(s.earth_el[i])} r={rEarth} fill="var(--earth)" opacity={earthF > 0 ? 1 : 0.35} />
        <circle cx={X(s.sun_az[i])} cy={Y(s.sun_el[i])} r={rSun} fill="var(--sun)" opacity={sunF > 0 ? 1 : 0.35} />
        {/* terrain drawn on top so it occults the discs */}
        <path d={terrain} fill="var(--terrain)" stroke="var(--terrain-edge)" strokeWidth="1" />
        <text x={X(s.sun_az[i]) + rSun + 4} y={Y(s.sun_el[i]) - rSun - 2} fill="var(--sun)" fontSize="11" fontFamily="var(--mono)">
          ☉ {s.sun_el[i].toFixed(2)}° · {(sunF * 100).toFixed(0)}%</text>
        <text x={X(s.earth_az[i]) + rEarth + 4} y={Y(s.earth_el[i]) + 14} fill="var(--earth)" fontSize="11" fontFamily="var(--mono)">
          ⊕ {s.earth_el[i].toFixed(2)}° · {(earthF * 100).toFixed(0)}%</text>
      </svg>
      <div className="legend">
        <span><i style={{ background: "var(--sun)" }} />{t.sun}</span>
        <span><i style={{ background: "var(--earth)" }} />{t.earth}</span>
        <span><i style={{ background: "var(--terrain)" }} />{t.terrain} ({result.data.horizon_source})</span>
        {mastHint && <span className="mute">{mastHint}</span>}
      </div>
      <div className="slider">
        <button className="btn" onClick={() => setPlaying((p) => !p)}>{playing ? "⏸ " + t.pause : "▶ " + t.play}</button>
        <input type="range" min={0} max={n - 1} value={i} onChange={(e) => { setPlaying(false); setHour(+e.target.value); }} aria-label={t.hourSlider} />
        <span className="num small">{t.hourSlider}: {i} h</span>
      </div>
    </div>
  );
}
