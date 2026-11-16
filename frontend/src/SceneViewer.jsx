import React, { useEffect, useMemo, useRef, useState } from "react";
import Scene3D from "./Scene3D.jsx";
import Timeline from "./Timeline.jsx";
import { Ic } from "./icons.jsx";
import { clampPos, fmtLat, fmtLon, fmtNum, profile, sample } from "./geo.js";

// Visor 3D con la interfaz tipo explorador. Mantiene el estado propio del visor (cámara, luz, capas, posición,
// regla) y le avisa a la app solo lo que cambia el cálculo: analizar un punto o cambiar la altura del mástil.

const LAYERS = [
  ["craters", "Cráteres y rasgos", "Craters & features"], ["shadows", "Sombras del terreno", "Terrain shadows"],
  ["los", "Líneas de vista al Sol y la Tierra", "Lines of sight to Sun & Earth"], ["grid", "Grilla del vecindario", "Neighbourhood grid"],
  ["ideal", "Horizonte ideal", "Ideal horizon"], ["psr", "Sombra permanente", "Permanent shadow"],
];

// ---------------------------------------------------------------- brújula con controles
function Compass({ handle, lang }) {
  const es = lang === "es";
  const [h, setH] = useState(0);
  useEffect(() => { const t = setInterval(() => setH(handle.current?.heading?.() ?? 0), 120); return () => clearInterval(t); }, [handle]);
  const B = ({ onClick, label, children, cls }) => <button className={"cb " + (cls || "")} onClick={onClick} aria-label={label} title={label}>{children}</button>;
  return (
    <div className="compass-ctl" role="group" aria-label={es ? "Brújula y controles de cámara" : "Compass and camera controls"}>
      <div className="rose" aria-hidden="true">
        <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="35" fill="rgba(4,8,15,.78)" stroke="var(--border-hi)" />
          <g style={{ transform: `rotate(${-h}deg)`, transformOrigin: "40px 40px" }}>
            <path d="M40 10 L46 40 L40 36 L34 40 Z" fill="var(--bad)" /><path d="M40 70 L46 40 L40 44 L34 40 Z" fill="var(--faint)" />
            <text x="40" y="9" textAnchor="middle" fontSize="13" fill="var(--text)" fontWeight="600">N</text>
            <text x="73" y="44" textAnchor="middle" fontSize="13" fill="var(--soft)">E</text><text x="40" y="78" textAnchor="middle" fontSize="13" fill="var(--soft)">S</text><text x="7" y="44" textAnchor="middle" fontSize="13" fill="var(--soft)">{es ? "O" : "W"}</text>
          </g></svg>
      </div>
      <div className="cb-row">
        <B onClick={() => handle.current?.yawBy(-15)} label={es ? "Girar a la izquierda" : "Turn left"}>◀</B>
        <B onClick={() => handle.current?.north()} label={es ? "Volver al norte" : "Reset to north"} cls="n">N</B>
        <B onClick={() => handle.current?.yawBy(15)} label={es ? "Girar a la derecha" : "Turn right"}>▶</B>
      </div>
      <div className="cb-row">
        <B onClick={() => handle.current?.pitchBy(10)} label={es ? "Inclinar hacia arriba" : "Tilt up"}>▲</B>
        <B onClick={() => handle.current?.pitchBy(-10)} label={es ? "Inclinar hacia abajo" : "Tilt down"}>▼</B>
        <B onClick={() => handle.current?.zoomBy(0.8)} label={es ? "Acercar" : "Zoom in"}>＋</B>
        <B onClick={() => handle.current?.zoomBy(1.25)} label={es ? "Alejar" : "Zoom out"}>－</B>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- panel izquierdo: Buscar / Lugares / Capas
function ExplorerPanel({ lang, sites, siteId, features, layers, setLayers, places, onGoSite, onGoFeature, onGoCoords, onSavePlace, onGoPlace, onDeletePlace, hasTerrain, open, setOpen, hasPsr }) {
  const es = lang === "es";
  const [q, setQ] = useState(""), [msg, setMsg] = useState(null), [sec, setSec] = useState({ s: true, p: true, l: true });
  const res = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return [];
    const out = [];
    sites.filter((s) => s.name.toLowerCase().includes(t)).forEach((s) => out.push({ k: "site", s }));
    (features?.features || []).filter((f) => f.name.toLowerCase().includes(t)).forEach((f) => out.push({ k: "feat", f }));
    return out.slice(0, 8);
  }, [q, sites, features]);
  const coords = (() => { const m = q.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)$/); return m ? [parseFloat(m[1].replace(",", ".")), parseFloat(m[2].replace(",", "."))] : null; })();
  const toggle = (k) => setSec((x) => ({ ...x, [k]: !x[k] }));
  if (!open) return <button className="ep-open" onClick={() => setOpen(true)} aria-label={es ? "Abrir el panel del explorador" : "Open the explorer panel"} title={es ? "Explorador" : "Explorer"}><Ic.layers /></button>;
  return (
    <aside className="ep" aria-label={es ? "Explorador" : "Explorer"}>
      <div className="ep-h"><b>{es ? "Explorador" : "Explorer"}</b><button className="cb" onClick={() => setOpen(false)} aria-label={es ? "Plegar el panel" : "Collapse panel"}>‹</button></div>
      <div className="ep-sec">
        <button className="ep-t" onClick={() => toggle("s")} aria-expanded={sec.s}>{sec.s ? "▾" : "▸"} {es ? "Buscar" : "Search"}</button>
        {sec.s && <div className="ep-b">
          <label className="search"><Ic.search width="16" height="16" /><span className="sr-only">{es ? "Buscar sitio, cráter o coordenadas" : "Search site, crater or coordinates"}</span>
            <input value={q} onChange={(e) => { setQ(e.target.value); setMsg(null); }} placeholder={es ? "Sitio, cráter o lat, lon" : "Site, crater or lat, lon"}
              onKeyDown={(e) => { if (e.key === "Enter" && coords) onGoCoords(coords[0], coords[1]).then((m) => setMsg(m)); }} /></label>
          {coords && <button className="ep-item" onClick={() => onGoCoords(coords[0], coords[1]).then((m) => setMsg(m))}><Ic.pin width="16" height="16" />{es ? "Ir a" : "Go to"} {fmtNum(coords[0], 4, lang)}°, {fmtNum(coords[1], 4, lang)}°</button>}
          {res.map((r, i) => r.k === "site"
            ? <button key={i} className="ep-item" onClick={() => onGoSite(r.s.id)}><Ic.pin width="16" height="16" />{r.s.name}</button>
            : <button key={i} className="ep-item" onClick={() => setMsg(onGoFeature(r.f))}><Ic.mountain width="16" height="16" />{r.f.name} <span className="mute">Ø {fmtNum(r.f.diameter_km, 1, lang)} km · {fmtNum(r.f.distance_km, 1, lang)} km</span></button>)}
          {msg && <p className="ep-note" role="status">{msg}</p>}
          {!hasTerrain && <p className="ep-note">{es ? "Este sitio no tiene relieve: no hay por dónde moverse." : "This site has no terrain: nowhere to move."}</p>}
        </div>}
      </div>
      <div className="ep-sec">
        <button className="ep-t" onClick={() => toggle("p")} aria-expanded={sec.p}>{sec.p ? "▾" : "▸"} {es ? "Lugares" : "Places"}</button>
        {sec.p && <div className="ep-b">
          {sites.map((s) => <button key={s.id} className={"ep-item" + (s.id === siteId ? " on" : "")} onDoubleClick={() => onGoSite(s.id)} onKeyDown={(e) => { if (e.key === "Enter") onGoSite(s.id); }} title={es ? "Doble clic para ir" : "Double-click to go"}><Ic.pin width="16" height="16" />{s.name}</button>)}
          {places.map((p) => (
            <div key={p.id} className="ep-item saved"><button onDoubleClick={() => onGoPlace(p)} onKeyDown={(e) => { if (e.key === "Enter") onGoPlace(p); }} title={es ? "Doble clic para ir" : "Double-click to go"}><Ic.layers width="16" height="16" />{p.name}</button>
              <button className="cb" onClick={() => onDeletePlace(p.id)} aria-label={es ? `Borrar ${p.name}` : `Delete ${p.name}`}>×</button></div>))}
          <button className="btn" onClick={onSavePlace}>{es ? "Guardar escenario actual" : "Save current scenario"}</button>
        </div>}
      </div>
      <div className="ep-sec">
        <button className="ep-t" onClick={() => toggle("l")} aria-expanded={sec.l}>{sec.l ? "▾" : "▸"} {es ? "Capas" : "Layers"}</button>
        {sec.l && <div className="ep-b">
          {LAYERS.map(([k, a, b]) => (
            <label key={k} className="ep-check"><input type="checkbox" checked={!!layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />{es ? a : b}
              {k === "psr" && !hasPsr && <span className="mute"> · {es ? "solo al sur de 80°S" : "south of 80°S only"}</span>}</label>))}
        </div>}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- regla: distancia y perfil de elevación
function RulerPanel({ pts, patch, fine, lang, onClear }) {
  const es = lang === "es";
  const pr = useMemo(() => (pts.length === 2 ? profile(patch, fine, pts[0], pts[1]) : null), [pts, patch, fine]);
  let chart = null;
  if (pr) {
    const el = pr.points.map((p) => p.elev), lo = Math.min(...el), hi = Math.max(...el), W = 260, H = 70, rng = Math.max(hi - lo, 1);
    const path = pr.points.map((p, i) => `${i ? "L" : "M"}${((p.d / pr.length_m) * W).toFixed(1)},${(H - ((p.elev - lo) / rng) * (H - 8) - 4).toFixed(1)}`).join("");
    chart = <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={es ? "Perfil de elevación entre los dos puntos" : "Elevation profile between the two points"}><path d={path} fill="none" stroke="var(--sci)" strokeWidth="1.6" /></svg>;
    var stats = { lo, hi, gain: el.reduce((a, v, i) => (i && v > el[i - 1] ? a + v - el[i - 1] : a), 0) };
  }
  return (
    <div className="ruler-panel" role="region" aria-label={es ? "Regla" : "Ruler"}>
      <div className="rp-h"><b>{es ? "Regla" : "Ruler"}</b><button className="cb" onClick={onClear} aria-label={es ? "Borrar la regla" : "Clear ruler"}>×</button></div>
      {!pr ? <p className="ep-note">{pts.length === 0 ? (es ? "Hacé clic en dos puntos del terreno." : "Click two points on the terrain.") : (es ? "Falta el segundo punto." : "Second point needed.")}</p> : (<>
        <div className="num rp-d">{pr.length_m >= 1000 ? `${fmtNum(pr.length_m / 1000, 2, lang)} km` : `${fmtNum(pr.length_m, 0, lang)} m`}</div>
        {chart}
        <div className="rp-s num">{es ? "mín" : "min"} {fmtNum(stats.lo, 0, lang)} m · {es ? "máx" : "max"} {fmtNum(stats.hi, 0, lang)} m · {es ? "desnivel" : "relief"} {fmtNum(stats.hi - stats.lo, 0, lang)} m</div>
        <p className="ep-note">{es ? "Distancia en el plano local del sitio (±0,1 %); alturas del DEM LOLA sobre la esfera de 1737,4 km." : "Distance in the site's local plane (±0.1%); LOLA DEM heights above the 1737.4 km sphere."}</p>
      </>)}
    </div>
  );
}

// ---------------------------------------------------------------- barra de estado
function StatusBar({ lang, info, handle, result, hour, mastShown, cam }) {
  const es = lang === "es";
  const [h, setH] = useState(0);
  useEffect(() => { const t = setInterval(() => setH(handle.current?.heading?.() ?? 0), 150); return () => clearInterval(t); }, [handle]);
  const t = result ? result.series.time[Math.min(hour, result.series.time.length - 1)].replace("T", " ").slice(0, 16) : "—";
  const Item = ({ k, v }) => <span className="sb-i"><span className="mute">{k}</span> <b className="num">{v}</b></span>;
  return (
    <div className="statusbar" role="status" aria-label={es ? "Barra de estado" : "Status bar"}>
      <Item k={es ? "Lat" : "Lat"} v={fmtLat(info.lat, lang)} /><Item k={es ? "Lon" : "Lon"} v={fmtLon(info.lon, lang)} />
      <Item k={es ? "Elevación del terreno" : "Terrain elevation"} v={info.elev == null ? "—" : `${fmtNum(info.elev, 0, lang)} m`} />
      <Item k={es ? "Cámara" : "Camera"} v={cam === "module" ? `${fmtNum(mastShown, 1, lang)} m ${es ? "sobre el suelo" : "above ground"}` : es ? "vista exterior" : "outside view"} />
      <Item k={es ? "Rumbo" : "Heading"} v={`${Math.round(h)}°`} />
      <Item k={es ? "Fecha y hora" : "Date & time"} v={`${t} UTC`} />
    </div>
  );
}

// ---------------------------------------------------------------- visor completo
export default function SceneViewer({ lang, variant = "explorer", sites, anchor, patch, fine, features, result, hour, setHour, playing, setPlaying, onAnalyze, onMast, onGoSite, places, onSavePlace, onGoPlace, onDeletePlace, view, setView, webgl, init }) {
  const es = lang === "es";
  const explorer = variant === "explorer";
  const handle = useRef();
  const apos = useMemo(() => ({ north: result?.spec?.offset_north_m || 0, east: result?.spec?.offset_east_m || 0 }), [result?.spec?.offset_north_m, result?.spec?.offset_east_m]);
  const [cam, setCam] = useState(["module", "aerial", "tour"].includes(init?.cam) ? init.cam : explorer ? "module" : "aerial");
  const [studio, setStudio] = useState(init?.luz !== "real"), [exag, setExag] = useState(init?.exag === "3" ? 3 : 1);
  const [layers, setLayers] = useState({ craters: true, shadows: true, los: true, grid: false, ideal: true, psr: true });
  const [pos, setPos] = useState(apos);
  const [open, setOpen] = useState(explorer && (init?.panel === "1" || (init?.panel !== "0" && typeof window !== "undefined" && window.innerWidth > 1500 && window.innerHeight > 1000)));
  const [hover, setHover] = useState(null);
  const [ruler, setRuler] = useState({ on: false, pts: [] });
  const [mastLocal, setMastLocal] = useState(result?.spec?.mast_m ?? 2);
  const deb = useRef();
  useEffect(() => { setPos(apos); }, [apos.north, apos.east]);          // un lugar guardado o un análisis nuevo mueven la cámara
  useEffect(() => { if (result?.spec?.mast_m != null) setMastLocal(result.spec.mast_m); }, [result?.spec?.mast_m]);
  const moved = Math.hypot(pos.north - apos.north, pos.east - apos.east) > 1;
  const hasTerrain = !!patch?.available;
  const move = (p) => { if (!hasTerrain) return; setPos(clampPos(patch, p)); };
  const onPick = (p) => {
    if (ruler.on) { setRuler((r) => ({ ...r, pts: r.pts.length >= 2 ? [p] : [...r.pts, p] })); return; }
    move(p);
  };
  const info = useMemo(() => { const p = hover || pos; const s = sample(patch, fine, p.north, p.east); return { lat: s.lat, lon: s.lon, elev: s.elev }; }, [hover, pos, patch, fine]);
  const setMast = (m) => { setMastLocal(m); clearTimeout(deb.current); deb.current = setTimeout(() => onMast?.(m), 450); };

  const goFeature = (f) => {
    if (!hasTerrain) return es ? "Este sitio no tiene relieve." : "This site has no terrain.";
    const lim = patch.half_size_m - 200;
    // el borde del rasgo más cercano al sitio, si cae dentro del relieve; si no, se avisa
    const d = Math.hypot(f.north_m, f.east_m), Rm = f.diameter_km * 500;
    const tgt = { north: Rm > d ? f.north_m : f.north_m * (1 - Rm / d), east: Rm > d ? f.east_m : f.east_m * (1 - Rm / d) };
    if (Math.abs(tgt.north) > lim || Math.abs(tgt.east) > lim) return es ? `${f.name} está a ${fmtNum(f.distance_km, 1, lang)} km: fuera del relieve disponible (±${fmtNum(patch.half_size_m / 1000, 0, lang)} km). Se ve en el horizonte, rumbo ${Math.round(f.bearing_deg)}°.` : `${f.name} is ${fmtNum(f.distance_km, 1, lang)} km away: outside the available terrain (±${fmtNum(patch.half_size_m / 1000, 0, lang)} km). It shows on the horizon, bearing ${Math.round(f.bearing_deg)}°.`;
    move(tgt); return es ? `Cámara en el borde de ${f.name}.` : `Camera at the rim of ${f.name}.`;
  };
  const goCoords = async (lat, lon) => {
    try {
      const r = await fetch(`/api/locate?lat0=${anchor.lat}&lon0=${anchor.lon}&lat=${lat}&lon=${lon}`).then((x) => x.json());
      const lim = (patch?.half_size_m || 12000) - 200;
      if (!hasTerrain || Math.abs(r.north_m) > lim || Math.abs(r.east_m) > lim) return es ? `Fuera del relieve disponible (±${fmtNum((patch?.half_size_m || 12000) / 1000, 0, lang)} km alrededor de ${anchor.name}).` : `Outside the available terrain (±${fmtNum((patch?.half_size_m || 12000) / 1000, 0, lang)} km around ${anchor.name}).`;
      move({ north: r.north_m, east: r.east_m }); return es ? "Cámara movida." : "Camera moved.";
    } catch { return es ? "No se pudo ubicar ese punto." : "Could not locate that point."; }
  };

  // función y no componente: así los botones no se recrean (ni pierden el foco) en cada render
  const seg = ({ value, opts, set, label }) => (
    <div className="seg" role="group" aria-label={label}>{opts.map(([k, l]) => <button key={String(k)} className={value === k ? "on" : ""} onClick={() => set(k)}>{l}</button>)}</div>);

  return (
    <div className={"sv " + variant}>
      <div className="sv-tools">
        {setView && <div className="seg" role="group" aria-label={es ? "Vista" : "View"}>
          <button className={view === "2d" ? "on" : ""} onClick={() => setView("2d")}><Ic.globe width="18" height="18" />2D</button>
          <button className="on" disabled={!webgl}><Ic.cube width="18" height="18" />3D</button></div>}
        {seg({ value: cam, set: setCam, label: es ? "Cámara" : "Camera", opts: [["module", es ? "Desde el módulo" : "From the lander"], ["aerial", es ? "Aérea" : "Aerial"], ["tour", es ? "Recorrido" : "Fly-around"]] })}
        {seg({ value: studio, set: setStudio, label: es ? "Iluminación" : "Lighting", opts: [[false, es ? "Luz real" : "Real light"], [true, es ? "Luz de estudio" : "Studio light"]] })}
        {seg({ value: exag, set: setExag, label: es ? "Exageración vertical" : "Vertical exaggeration", opts: [[1, "×1"], [3, "×3"]] })}
        {explorer && (
          <label className="mast-ctl"><span>{es ? "Mástil" : "Mast"}</span>
            <input type="range" min={2} max={10} step={1} value={mastLocal} onChange={(e) => setMast(+e.target.value)} aria-label={es ? "Altura del mástil en metros" : "Mast height in metres"} /><b className="num">{mastLocal} m</b></label>)}
        {explorer && <button className={"btn" + (ruler.on ? " primary" : "")} onClick={() => setRuler((r) => ({ on: !r.on, pts: [] }))} aria-pressed={ruler.on}><Ic.layers width="16" height="16" />{es ? "Regla" : "Ruler"}</button>}
      </div>
      <div className="sv-stage">
        <Scene3D ref={handle} patch={patch} fine={fine} result={result} hour={hour} lang={lang} features={features} layers={layers} pos={pos} apos={apos} onPos={setPos}
          cam={cam} studio={studio} exag={exag} mast={mastLocal} onHover={setHover} onPick={onPick} rulerPts={ruler.pts} minimal={!explorer} />
        {explorer && <>
          <ExplorerPanel lang={lang} sites={sites} siteId={anchor?.id} features={features} layers={layers} setLayers={setLayers} places={places} hasTerrain={hasTerrain} open={open} setOpen={setOpen}
            hasPsr={!!features?.psr?.length} onGoSite={onGoSite} onGoFeature={goFeature} onGoCoords={goCoords} onSavePlace={() => onSavePlace?.(pos)} onGoPlace={(p) => { onGoPlace?.(p); }} onDeletePlace={onDeletePlace} />
          <Compass handle={handle} lang={lang} />
          {ruler.on && <RulerPanel pts={ruler.pts} patch={patch} fine={fine} lang={lang} onClear={() => setRuler({ on: false, pts: [] })} />}
        </>}
        {explorer && moved && (
          <div className="analyze-chip" role="group">
            <button className="btn primary" onClick={() => onAnalyze?.(pos)}><Ic.target width="16" height="16" />{es ? "Analizar este punto" : "Analyse this point"}</button>
            <span className="num mute">N {fmtNum(pos.north / 1000, 2, lang)} km · E {fmtNum(pos.east / 1000, 2, lang)} km</span>
            <button className="btn ghost" onClick={() => setPos(apos)}>{es ? "Volver" : "Back"}</button>
          </div>)}
        {explorer && !moved && (apos.north || apos.east) ? <div className="analyze-chip"><span className="num mute">{es ? "Analizado:" : "Analysed:"} N {fmtNum(apos.north / 1000, 2, lang)} km · E {fmtNum(apos.east / 1000, 2, lang)} km · {es ? "sin márgenes (se calculan a pedido)" : "no margins (computed on request)"}</span></div> : null}
      </div>
      <Timeline result={result} hour={hour} setHour={setHour} playing={playing} setPlaying={setPlaying} lang={lang} />
      {explorer && <StatusBar lang={lang} info={info} handle={handle} result={result} hour={hour} mastShown={mastLocal} cam={cam} />}
    </div>
  );
}
