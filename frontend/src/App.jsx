import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, decodeSpec, encodeSpec, getJSON, getTerrain, runScenario } from "./api.js";
import { Answer, Home } from "./SimpleView.jsx";
import Timeline from "./Timeline.jsx";
import CalcCard from "./CalcCard.jsx";
import { T } from "./i18n.js";
import { Ic, Logo } from "./icons.jsx";
import { PanoramaSvg } from "./Panorama.jsx";
import ZenithMap from "./ZenithMap.jsx";
import Scene3D, { hasWebGL } from "./Scene3D.jsx";
import StatusPanel from "./StatusPanel.jsx";
import TraceTable from "./TraceTable.jsx";
import { StepModal } from "./Trace.jsx";
import { AnimModal, animFor } from "./Animations.jsx";
import { DaysMargin, Heatmap, KmMargin, MetresMargin } from "./Margins.jsx";
import { Calculator, Compare, Inferences, Profiles, Validation } from "./Views.jsx";
import Explainers from "./Explainers.jsx";
import Lumo from "./Lumo.jsx";
import { plain } from "./plain.js";

const BASE = { site_id: "shackleton", start: "2027-01-15T00:00:00Z", duration_days: 14, mast_m: 2, max_comm_gap_h: 48,
  power: { load_w: 500, battery_wh: 20000, initial_soc: 1 }, panel: { area_m2: 10, efficiency: 0.3, tracking: true, tilt_deg: 90, azimuth_deg: 0 },
  max_delay_days: 30, margins: true, label: "" };
// El caso del relato: la misma misión, corrida 9 días.
const PRESETS = {
  base: { es: "Misión base", en: "Baseline mission", spec: BASE },
  delay9: { es: "Ejemplo: atraso de 9 días", en: "Example: 9-day delay", spec: { ...BASE, start: "2027-01-24T00:00:00Z", label: "Example: 9-day delay" } },
};

const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * 864e5).toISOString().slice(0, 19) + "Z";

const NAV = [
  ["overview", Ic.home, "Resumen de misión", "Mission overview"],
  ["explorer", Ic.globe, "Explorador lunar", "Lunar explorer"],
  ["analysis", Ic.mountain, "Análisis de sitio", "Site analysis"],
  ["scenarios", Ic.layers, "Escenarios", "Scenarios"],
  ["calcs", Ic.flow, "Cálculos", "Calculations"],
  ["calculator", Ic.calc, "Calculadora", "Calculator"],
  ["scieng", Ic.atom, "Ciencia e ingeniería", "Science & engineering"],
  ["validation", Ic.check, "Validación", "Validation"],
  ["sources", Ic.db, "Fuentes de datos", "Data sources"],
];

export default function App() {
  const [lang, setLang] = useState(() => (navigator.language || "es").startsWith("es") ? "es" : "en");
  const t = T[lang], es = lang === "es";
  const [mode, setMode] = useState("tech");                // tech = la vista de la referencia; simple = guiada
  // en Simple: primero la pregunta, después la respuesta
  const [screen, setScreen] = useState(() => (decodeSpec() ? "answer" : "home"));
  const [section, setSection] = useState("overview");
  const [view, setView] = useState("3d");                   // 2d | 3d
  const webgl = useMemo(hasWebGL, []);
  const [status, setStatus] = useState(null);
  const [sites, setSites] = useState([]);
  const [preset, setPreset] = useState("base");
  const [spec, setSpec] = useState(() => decodeSpec() || BASE);
  const [result, setResult] = useState(null);
  const [steps, setSteps] = useState({});
  const [order, setOrder] = useState([]);
  const [traceId, setTraceId] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [precomputed, setPrecomputed] = useState(false);
  const [modal, setModal] = useState(null);
  const [anim, setAnim] = useState(null);
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [allResults, setAllResults] = useState({});
  const [patch, setPatch] = useState(null);
  const [lumoVisible, setLumoVisible] = useState(() => window.innerWidth > 860);
  const [guide, setGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const abort = useRef();

  useEffect(() => { api.status().then(setStatus).catch(() => setStatus(null)); api.sites().then(setSites).catch(() => setSites([])); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const run = useCallback(async (s = spec, { keep = false } = {}) => {
    abort.current?.abort(); const ctl = new AbortController(); abort.current = ctl;
    setRunning(true); setError(null); setPlaying(false);
    // keep: se deja a la vista lo que ya hay (por ejemplo, el precalculado) mientras llega lo nuevo
    if (!keep) { setSteps({}); setOrder([]); setTraceId(null); setPrecomputed(false); setHour(0); }
    try {
      let first = keep;
      const out = await runScenario(s, {
        signal: ctl.signal,
        onStart: (id) => { if (!keep) setTraceId(id); },
        onStep: (st) => {
          if (first) { first = false; setSteps({}); setOrder([]); }
          setSteps((p) => ({ ...p, [st.id]: st })); setOrder((p) => [...p, st.id]);
        },
      });
      setResult(out.result); setTraceId(out.result.trace_id); setPrecomputed(false);
      if (out.precomputed) { setPrecomputed(true); const m = {}; out.trace.steps.forEach((x) => { m[x.id] = x; }); setSteps(m); setOrder(out.trace.steps.map((x) => x.id)); }
      setAllResults((p) => ({ ...p, [s.site_id]: out.result }));
    } catch (e) { if (e.name !== "AbortError") setError(String(e.message || e)); }
    finally { setRunning(false); }
  }, [spec]);
  // al abrir solo calculamos si vino un escenario en el enlace; si no, se espera la pregunta.
  // "#ejemplo" abre directo el caso del atraso (sirve para la demo y para las capturas).
  useEffect(() => {
    if (location.hash === "#ejemplo") { loadExample(); return; }
    if (decodeSpec()) { run(spec); return; }
    if (mode === "tech") loadPre("base", "site-shackleton");   // la misión base, precalculada
  }, []); // eslint-disable-line
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) { firstMode.current = false; return; }
    if (mode === "tech" && !result && !running) loadPre("base", "site-shackleton");
  }, [mode]); // eslint-disable-line

  // el parche de terreno depende solo del sitio
  useEffect(() => {
    if (!result) return;
    setPatch(null);
    getTerrain(result.site.lat, result.site.lon).then(setPatch).catch(() => setPatch({ available: false }));
  }, [result?.site?.lat, result?.site?.lon]); // eslint-disable-line

  // reproducir: avanza la hora; con "menos movimiento" va de a pasos más grandes
  useEffect(() => {
    if (!playing || !result) return;
    const n = result.series.time.length;
    const slow = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(() => setHour((h) => (h + (slow ? 12 : 1)) % n), slow ? 800 : 70);
    return () => clearInterval(id);
  }, [playing, result]);

  const update = (patchSpec) => { const s = { ...spec, ...patchSpec }; setSpec(s); setAllResults({}); return s; };
  const go = (patchSpec) => run(update(patchSpec), { keep: true });
  const loadPreset = (k) => { setPreset(k); const s = { ...PRESETS[k].spec, site_id: spec.site_id }; setSpec(s); run(s, { keep: true }); };
  // El ejemplo abre al instante con el resultado precalculado (export.py) y
  // después se refresca con el motor en vivo, sin vaciar la pantalla.
  const loadExample = () => loadPre("delay9", "example-delay");
  // Abre un escenario precalculado (export.py) al instante y lo refresca en vivo sin vaciar la pantalla.
  const loadPre = async (key, file) => {
    setSection("overview"); setPreset(key); setScreen("answer");
    const s = PRESETS[key].spec; setSpec(s); setAllResults({});
    try {
      const pre = await getJSON(`/scenarios/${file}.json`);
      setResult(pre.result); setPrecomputed(true); setHour(0);
      const st = {}; pre.trace.steps.forEach((x) => { st[x.id] = x; }); setSteps(st); setOrder(pre.trace.steps.map((x) => x.id)); setTraceId(null);
      run(s, { keep: true });
    } catch { run(s); }
  };
  const startSimple = (p) => { const s = { ...spec, ...p }; setSpec(s); setAllResults({}); setScreen("answer"); setResult(null); run(s); };
  const runWith = async (p) => (await runScenario({ ...spec, ...p, label: "profile" })).result;
  const runB = async ({ site_id, delay }) => (await runScenario({ ...spec, site_id, start: addDays(spec.start, delay), label: "compare-B" })).result;
  const openStep = async (id) => {
    if (!id) return;
    if (steps[id]) { setModal(steps[id]); return; }
    if (traceId) { try { const tr = await api.trace(traceId); const st = tr.steps.find((x) => x.id === id); if (st) setModal(st); } catch { /* sin traza */ } }
  };
  const onLumo = (a) => {
    if (a === "margins") setSection("analysis");
    else if (a === "compare") setSection("scenarios");
    else if (a.startsWith("mast:")) go({ mast_m: +a.slice(5) });
    else if (a.startsWith("delay:")) go({ start: addDays(spec.start, +a.slice(6)) });
  };
  const share = async () => { try { await navigator.clipboard.writeText(encodeSpec(spec)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sin portapapeles */ } };

  // lazy-load de todos los sitios para el mapa de calor
  useEffect(() => {
    if (section !== "analysis" || !sites.length) return;
    let cancel = false;
    (async () => { for (const s of sites) { if (cancel || allResults[s.id]) continue;
      try { const o = await runScenario({ ...spec, site_id: s.id }); if (!cancel) setAllResults((p) => ({ ...p, [s.id]: o.result })); } catch { /* fila vacía */ } } })();
    return () => { cancel = true; };
  }, [section, sites.length]); // eslint-disable-line

  const site = sites.find((s) => s.id === spec.site_id);
  const n = result?.series.time.length ?? 1;
  const curTime = result ? result.series.time[Math.min(hour, n - 1)] : spec.start;
  const startDate = spec.start.slice(0, 10), startTime = spec.start.slice(11, 16);
  const showViewer = section === "overview" || section === "explorer";
  const [sceneKey, setSceneKey] = useState(0);            // remontar la escena = volver a la vista inicial
  const viewerRef = useRef();
  const fullscreen = () => { const el = viewerRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); };

  // ojo: es una función y no un componente, para que la escena 3D no se rearme en cada render
  const viewer = (big) => (
    <section className="panel viewer" ref={viewerRef} aria-label={es ? "Visor del sitio" : "Site viewer"}>
      <div className="vtop seg" role="group" aria-label={es ? "Vista" : "View"}>
        <button className={view === "2d" ? "on" : ""} onClick={() => setView("2d")}><Ic.globe width="18" height="18" />2D</button>
        <button className={view === "3d" ? "on" : ""} onClick={() => webgl && setView("3d")} disabled={!webgl} title={webgl ? "" : (es ? "Tu equipo no soporta WebGL" : "WebGL not available")}><Ic.cube width="18" height="18" />3D</button>
      </div>
      {!result ? (
        running ? <div className="skeleton" style={{ height: 480 }} /> : <div className="empty" style={{ height: 300, display: "grid", placeItems: "center" }}>{error ? (es ? "No se pudo calcular el escenario." : "Could not compute the scenario.") : "—"}</div>
      ) : view === "3d" && webgl ? (
        <>
          <Scene3D key={sceneKey} patch={patch} result={result} hour={hour} lang={lang} />
          <div className="v-tools" role="group" aria-label={es ? "Controles del visor" : "Viewer controls"}>
            <button onClick={() => setSceneKey((k) => k + 1)} title={es ? "Volver a la vista inicial" : "Reset view"} aria-label={es ? "Volver a la vista inicial" : "Reset view"}><Ic.target /></button>
            <button onClick={fullscreen} title={es ? "Pantalla completa" : "Full screen"} aria-label={es ? "Pantalla completa" : "Full screen"}><Ic.expand /></button>
          </div>
        </>
      ) : (
        <div className="view2d" style={big ? { gridTemplateColumns: "1fr" } : undefined}>
          <div>
            {!webgl && <div className="infobox" style={{ marginBottom: 8 }}>{es ? "Tu equipo no soporta 3D (WebGL): te mostramos la vista 2D." : "No WebGL on this device: showing the 2D view."}</div>}
            {result.data.horizon_source === "flat" && <div className="warnbox" style={{ marginBottom: 8 }}>{t.flatHorizon}</div>}
            <div className="xs mute" style={{ marginBottom: 4 }}>{es ? "Panorama del horizonte (360°)" : "Horizon panorama (360°)"}</div>
            <PanoramaSvg result={result} hour={hour} lang={lang} />
          </div>
          <div>
            <div className="xs mute" style={{ marginBottom: 4 }}>{es ? "Mapa cenital" : "Top-down map"}</div>
            <ZenithMap patch={patch} result={result} hour={hour} lang={lang} />
          </div>
        </div>
      )}
      {result && <Timeline result={result} hour={hour} setHour={setHour} playing={playing} setPlaying={setPlaying} lang={lang} />}
    </section>
  );

  const modals = (
    <>
      <StepModal step={modal} t={t} lang={lang} onClose={() => setModal(null)} onJump={openStep} steps={steps}
        onAnim={modal && animFor(modal.id) ? () => { const k = animFor(modal.id), c = plain(modal, lang); setModal(null); setAnim({ kind: k, caption: c }); } : null} />
      {anim && <AnimModal kind={anim.kind} caption={anim.caption} lang={lang} onClose={() => setAnim(null)} />}
      <Lumo result={screen === "home" && mode === "simple" ? null : result} t={t} lang={lang} hour={hour} guide={guide} setGuide={setGuide}
        visible={lumoVisible} setVisible={setLumoVisible} loadExample={loadExample} running={running} onAction={onLumo}
        tourReady={mode === "simple" && screen === "answer" && !!result} compact={mode === "tech"} />
    </>
  );
  const modeSwitch = (
    <div className="seg" role="group" aria-label={es ? "Nivel de detalle" : "Detail level"}>
      <button className={mode === "simple" ? "on" : ""} onClick={() => setMode("simple")}>Simple</button>
      <button className={mode === "tech" ? "on" : ""} onClick={() => setMode("tech")}>{es ? "Técnico" : "Technical"}</button>
    </div>
  );
  const langSwitch = <div className="seg" role="group" aria-label={es ? "Idioma" : "Language"}>{["es", "en"].map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>;

  // ---------------- Modo Simple: una pregunta por pantalla
  if (mode === "simple") return (
    <div className="simple-shell">
      <header className="simple-top">
        <button className="brand-s" onClick={() => setScreen("home")} aria-label={es ? "Volver al inicio" : "Back to start"}><Logo /><b>LUMOX</b></button>
        <span className="spacer" />
        {langSwitch}{modeSwitch}
        <button className="btn" onClick={loadExample}><Ic.book />{es ? "Ver ejemplo" : "See example"}</button>
      </header>
      <main className="simple-main" id="main">
        {error && <div className="errbox" role="alert"><b>{es ? "No pudimos calcular:" : "We couldn't compute:"}</b> {error} <button className="btn" style={{ marginLeft: 8 }} onClick={() => run(spec)}>{es ? "Reintentar" : "Retry"}</button></div>}
        {screen === "home"
          ? <Home lang={lang} sites={sites} spec={spec} onStart={startSimple} onExample={loadExample} running={running} />
          : <Answer r={result} lang={lang} running={running} precomputed={precomputed} hour={hour} setHour={setHour} playing={playing} setPlaying={setPlaying}
              patch={patch} webgl={webgl} view={view} setView={setView} go={go} spec={spec} steps={steps} order={order} traceId={traceId}
              onAnim={(k, c) => setAnim({ kind: k, caption: c })} onNew={() => setScreen("home")} openStep={openStep} />}
      </main>
      <footer className="simple-foot">{es ? "Datos: NASA/JPL Horizons, NAIF SPICE, LRO LOLA y LROC, NASA SVS. Lumox no es un producto oficial de NASA." : "Data: NASA/JPL Horizons, NAIF SPICE, LRO LOLA and LROC, NASA SVS. Lumox is not an official NASA product."} <a href="https://github.com/anabelgrez/lumox/blob/v3-explorador/docs/FUENTES.md" target="_blank" rel="noreferrer">{es ? "Fuentes" : "Sources"}</a></footer>
      {modals}
    </div>
  );

  // ---------------- Modo Técnico: todo lo que había
  return (
    <div className="shell">
      <div className="brand"><Logo /><div><b>LUMOX</b><span>Lunar Mission Planner</span></div></div>

      <header className="topbar">
        <div className="ctl preset-ctl"><div><label htmlFor="preset">{es ? "Escenario" : "Scenario"}</label>
          <select id="preset" value={preset} onChange={(e) => loadPreset(e.target.value)}>{Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p[lang]}</option>)}</select></div></div>
        <div className="ctl"><Ic.pin /><div><label htmlFor="site">{site ? `${Math.abs(site.lat).toFixed(2)}°${site.lat < 0 ? "S" : "N"}, ${Math.abs(site.lon).toFixed(2)}°${site.lon < 0 ? (es ? "O" : "W") : "E"}` : (es ? "Sitio" : "Site")}</label>
          <select id="site" value={spec.site_id} onChange={(e) => go({ site_id: e.target.value })} aria-label={es ? "Sitio" : "Site"}>
            {sites.length === 0 && <option value={spec.site_id}>{spec.site_id}</option>}
            {sites.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></div></div>
        <div className="ctl"><Ic.cal /><div><label htmlFor="date">{es ? "Fecha de alunizaje" : "Landing date"}</label>
          <input id="date" type="date" value={startDate} onChange={(e) => e.target.value && update({ start: `${e.target.value}T${startTime}:00Z` })} /></div></div>
        <div className="ctl"><Ic.clock /><div><label htmlFor="time">{es ? "Hora (UTC)" : "Time (UTC)"}</label>
          <input id="time" type="time" value={startTime} onChange={(e) => e.target.value && update({ start: `${startDate}T${e.target.value}:00Z` })} /></div>
          <button className="btn icon ghost" onClick={() => setPlaying(!playing)} disabled={!result} aria-label={playing ? (es ? "Pausar" : "Pause") : (es ? "Reproducir la misión" : "Play the mission")}>{playing ? <Ic.pause /> : <Ic.play />}</button></div>
        <span className="spacer" />
        <div className="tb-cluster">
          <details className="params">
            <summary className="btn icon" title={es ? "Parámetros de la misión" : "Mission parameters"} aria-label={es ? "Parámetros de la misión" : "Mission parameters"}><Ic.sliders /></summary>
            <div className="pop">
              <label className="field">{es ? "Duración (días)" : "Duration (days)"}<input type="number" min={1} max={120} value={spec.duration_days} onChange={(e) => update({ duration_days: +e.target.value })} /></label>
              <label className="field">{es ? "Mástil (m)" : "Mast (m)"}<input type="number" min={0} max={50} value={spec.mast_m} onChange={(e) => update({ mast_m: +e.target.value })} /></label>
              <label className="field">{es ? "Autonomía de batería (h)" : "Battery autonomy (h)"}<input type="number" min={1} value={spec.autonomy_h ?? Math.round(spec.power.battery_wh / spec.power.load_w)} onChange={(e) => update({ autonomy_h: +e.target.value })} /></label>
              <label className="field">{es ? "Corte máximo (h)" : "Max comm gap (h)"}<input type="number" min={1} value={spec.max_comm_gap_h} onChange={(e) => update({ max_comm_gap_h: +e.target.value })} /></label>
              <label className="field">{es ? "Consumo (W)" : "Load (W)"}<input type="number" min={1} value={spec.power.load_w} onChange={(e) => update({ power: { ...spec.power, load_w: +e.target.value } })} /></label>
              <label className="field">{es ? "Panel (m²)" : "Panel (m²)"}<input type="number" min={0.1} step={0.5} value={spec.panel.area_m2} onChange={(e) => update({ panel: { ...spec.panel, area_m2: +e.target.value } })} /></label>
            </div>
          </details>
          <button className="btn primary" onClick={() => run(spec, { keep: true })} disabled={running}>{running ? (es ? "Calculando…" : "Computing…") : (es ? "Calcular" : "Compute")}</button>
          <button className="btn icon" onClick={share} title={copied ? (es ? "Enlace copiado" : "Link copied") : (es ? "Copiar enlace al escenario" : "Copy scenario link")} aria-label={es ? "Compartir" : "Share"}><Ic.link /></button>
        </div>
        <div className="tb-sep tb-item">{modeSwitch}</div>
        <div className="tb-sep tb-item"><div className="seg lang-seg" role="group" aria-label={es ? "Idioma" : "Language"}>{["es", "en"].map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div></div>
        <button className="btn example-btn" onClick={loadExample} aria-label={es ? "Ver ejemplo" : "See example"}><Ic.book /><span className="lbl">{es ? "Ver ejemplo" : "See example"}</span></button>
      </header>

      <nav className="sidebar" aria-label={es ? "Secciones" : "Sections"}>
        {NAV.map(([k, Icon, l1, l2]) => <button key={k} className={section === k ? "on" : ""} aria-current={section === k ? "page" : undefined} onClick={() => setSection(k)}><Icon />{es ? l1 : l2}</button>)}
        <div className="foot">
          {es ? "Planificar · Analizar · Explorar" : "Plan · Analyse · Explore"}
          <div className="sb-status">
            <div><span className={"dot " + (status ? "ok" : "bad")} /> {status ? (es ? "Motor en vivo" : "Engine live") : (es ? "Motor sin conexión" : "Engine offline")}</div>
            {status && <div className="num">{status.ephemeris.spice.available ? "SPICE" : "Horizons"} · DEM {status.dems.length}</div>}
            {site && !site.verified && <div className="warn">{es ? "Coordenadas sin reverificar" : "Coordinates not re-verified"}</div>}
          </div>
        </div>
      </nav>

      <main className={"main" + (section === "overview" ? " overview" : "")} id="main">
        {error && <div className="errbox" role="alert"><b>{es ? "Algo falló:" : "Something failed:"}</b> {error} <button className="btn" style={{ marginLeft: 8 }} onClick={() => run(spec)}>{es ? "Reintentar" : "Retry"}</button></div>}

        {showViewer && (
          <div className="workspace">
            {viewer(section === "explorer")}
            <StatusPanel r={result} hour={hour} lang={lang} open={openStep} running={running} />
          </div>
        )}
        {section === "overview" && (
          <div className="bottom-row">
            <TraceTable steps={steps} order={order} traceId={traceId} lang={lang} mode={mode} running={running} precomputed={precomputed}
              onAnim={(k, c) => setAnim({ kind: k, caption: c })} />
            <CalcCard lang={lang} traceId={precomputed ? null : traceId} onSaved={(r) => { setSteps((p) => ({ ...p, [r.step.id]: r.step })); setOrder((p) => [...p, r.step.id]); }} />
          </div>)}
        {section === "explorer" && result && <Inferences result={result} t={t} lang={lang} open={openStep} />}

        {section === "analysis" && (result ? (
          <div className="stack">
            <div className="panel"><div className="panel-h"><Ic.mountain /><h2>{t.heatmap}</h2></div>
              <Heatmap results={allResults} sites={sites} t={t} selected={{ site_id: spec.site_id, delay: 0 }}
                onPick={(site_id, delay) => { setSection("overview"); go({ site_id, start: addDays(spec.start, delay) }); }} /></div>
            <div className="grid2">
              <DaysMargin result={result} t={t} open={openStep} onLoadDelay={(d) => go({ start: addDays(spec.start, d) })} />
              <MetresMargin result={result} t={t} onMast={(m) => go({ mast_m: m })} />
              <KmMargin result={result} t={t} />
            </div>
          </div>) : <div className="panel empty">{running ? (es ? "Calculando…" : "Computing…") : "—"}</div>)}

        {section === "scenarios" && result && <Compare sites={sites} specA={spec} resultA={result} t={t} lang={lang} runB={runB} open={openStep} />}
        {section === "calcs" && (
          <div className="stack">
            <TraceTable steps={steps} order={order} traceId={traceId} lang={lang} mode={mode} running={running} precomputed={precomputed} onAnim={(k, c) => setAnim({ kind: k, caption: c })} />
            {mode === "simple" && <Explainers lang={lang} result={result} />}
          </div>)}
        {section === "calculator" && <Calculator t={t} traceId={traceId} onSaved={(r) => { setSteps((p) => ({ ...p, [r.step.id]: r.step })); setOrder((p) => [...p, r.step.id]); }} />}
        {section === "scieng" && result && <Profiles result={result} t={t} lang={lang} runWith={runWith} open={openStep} />}
        {(section === "validation" || section === "sources") && <Validation status={status} result={result} t={t} lang={lang} />}
      </main>

      <footer className="app-foot">
        <div className="fb"><Logo /><b>LUMOX</b><span className="div" /><span>Lunar Mission Planner</span></div>
        <div className="tag-line">{es ? "Ciencia precisa · Decisiones informadas" : "Precise science · Informed decisions"}</div>
        <div className="ds">
          <span className={"dot " + (status ? "ok" : "bad")} />
          <span>{es ? "Datos" : "Data"}: NASA/JPL · LOLA · SPICE</span>
          {precomputed && <span className="mute">· {es ? "precalculado, actualizando" : "precomputed, updating"}</span>}
          <a href="https://github.com/anabelgrez/lumox/blob/v3-explorador/docs/FUENTES.md" target="_blank" rel="noreferrer" className="mute">{es ? "Fuentes" : "Sources"}</a>
        </div>
      </footer>

      {modals}
    </div>
  );
}
