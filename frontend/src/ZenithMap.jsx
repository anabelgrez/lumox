import React, { useEffect, useRef } from "react";

// Mapa cenital (visto desde arriba) del parche de terreno: sombreado del relieve,
// marcador del sitio, grilla del vecindario coloreada con el resultado del
// margen en km, y flechas hacia donde están el Sol y la Tierra en la hora elegida.

export default function ZenithMap({ patch, result, hour, lang }) {
  const cv = useRef();
  const es = lang === "es";
  const S = 420;

  useEffect(() => {
    const c = cv.current; if (!c || !patch?.available) return;
    const g = c.getContext("2d"), n = patch.n, h = patch.heights_m;
    const img = g.createImageData(n, n);
    const lo = patch.min_m, hi = patch.max_m, step = patch.step_m;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      // fila 0 del parche = sur (norte negativo); en pantalla el norte va arriba
      const row = n - 1 - i;
      const z = h[i][j];
      // sombreado simple con luz fija del noroeste, solo para leer el relieve
      const dzx = (h[i][Math.min(j + 1, n - 1)] - h[i][Math.max(j - 1, 0)]) / (2 * step);
      const dzy = (h[Math.min(i + 1, n - 1)][j] - h[Math.max(i - 1, 0)][j]) / (2 * step);
      const shade = Math.max(0, Math.min(1, 0.6 - 0.9 * dzx + 0.9 * dzy));
      const base = (z - lo) / Math.max(hi - lo, 1);
      const v = Math.round(255 * (0.25 + 0.45 * base + 0.3 * shade));
      const k = (row * n + j) * 4;
      img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = Math.min(255, v + 6); img.data[k + 3] = 255;
    }
    const tmp = document.createElement("canvas"); tmp.width = n; tmp.height = n; tmp.getContext("2d").putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, S, S);
  }, [patch]);

  if (!result) return null;
  if (!patch) return <div className="skeleton" style={{ height: S }} />;
  const half = patch.half_size_m || 12000;
  const P = (north, east) => [S / 2 + (east / half) * (S / 2), S / 2 - (north / half) * (S / 2)];
  const s = result.series, i = Math.min(hour, s.time.length - 1);
  const arrow = (az, color, label) => {
    const a = (az * Math.PI) / 180, r = S * 0.42;
    const x = S / 2 + Math.sin(a) * r, y = S / 2 - Math.cos(a) * r;
    return <g><line x1={S / 2} y1={S / 2} x2={x} y2={y} stroke={color} strokeWidth="2" strokeDasharray="5 4" /><circle cx={x} cy={y} r="7" fill={color} /><text x={x + 10} y={y + 4} fill={color} fontSize="12" fontFamily="var(--mono)">{label}</text></g>;
  };
  const cells = result.margins?.km?.cells || [];
  const sp = result.margins?.km?.spacing_m || 2000;
  return (
    <div style={{ position: "relative" }}>
      {patch.available ? <canvas ref={cv} width={S} height={S} aria-hidden="true" /> : <div className="empty" style={{ height: S, display: "grid", placeItems: "center", background: "var(--bg-2)", borderRadius: 12 }}>{es ? "Sin relieve para este sitio." : "No terrain for this site."}</div>}
      <svg viewBox={`0 0 ${S} ${S}`} style={{ position: "absolute", inset: 0, background: "none" }} role="img" aria-label={es ? "Mapa cenital del sitio" : "Top-down map of the site"}>
        {cells.map((c, k) => { const [x, y] = P(c.north_m + sp / 2, c.east_m - sp / 2); const w = (sp / half) * (S / 2);
          return <rect key={k} x={x} y={y} width={w} height={w} fill={c.viable ? "rgba(46,204,113,.22)" : "rgba(255,90,82,.18)"} stroke={c.viable ? "var(--ok)" : "var(--bad)"} strokeOpacity="0.7" />; })}
        {arrow(s.sun_az[i], "var(--sun)", `☉ ${s.sun_az[i].toFixed(0)}°`)}
        {arrow(s.earth_az[i], "var(--earth)", `⊕ ${s.earth_az[i].toFixed(0)}°`)}
        <circle cx={S / 2} cy={S / 2} r="9" fill="none" stroke="var(--sun)" strokeWidth="2" /><circle cx={S / 2} cy={S / 2} r="3" fill="var(--sun)" />
        <text x={S / 2} y="18" textAnchor="middle" fill="var(--bad)" fontSize="13" fontWeight="700">N</text>
        <g transform={`translate(12 ${S - 16})`}><line x1="0" x2={(5000 / half) * (S / 2)} y1="0" y2="0" stroke="var(--soft)" strokeWidth="2" /><text x="0" y="-5" fill="var(--soft)" fontSize="11" fontFamily="var(--mono)">5 km</text></g>
      </svg>
      <p className="xs mute" style={{ marginTop: 6 }}>{es ? "Vista desde arriba. Cuadros: grilla del vecindario (verde = viable). Flechas: hacia dónde están el Sol y la Tierra ahora." : "Top-down view. Squares: neighbourhood grid (green = viable). Arrows: where the Sun and Earth are now."}</p>
    </div>
  );
}
