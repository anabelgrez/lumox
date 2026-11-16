import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, decodeSpec, encodeSpec, getFeatures, getJSON, getTerrain, getTerrainFine, runScenario } from "./api.js";
import { Answer, Home } from "./SimpleView.jsx";
import CalcCard from "./CalcCard.jsx";
import { T } from "./i18n.js";
import { Ic, Logo } from "./icons.jsx";
import { PanoramaSvg } from "./Panorama.jsx";
import ZenithMap from "./ZenithMap.jsx";
import { hasWebGL } from "./Scene3D.jsx";
import SceneViewer from "./SceneViewer.jsx";
import Timeline from "./Timeline.jsx";
import StatusPanel from "./StatusPanel.jsx";
import TraceTable from "./TraceTable.jsx";
import { StepModal } from "./Trace.jsx";
import { AnimModal, animFor } from "./Animations.jsx";
import { DaysMargin, Heatmap, KmMargin, MetresMargin } from "./Margins.jsx";
import { Calculator, Compare, Inferences, Profiles, Validation } from "./Views.jsx";
import { Alerts, Requirements } from "./OpsPanels.jsx";
import Explainers from "./Explainers.jsx";
import Lumo from "./Lumo.jsx";
import { plain } from "./plain.js";

const BASE = { site_id: "shackleton", start: "2027-01-15T00:00:00Z", duration_days: 14, mast_m: 2, max_comm_gap_h: 48,
  power: { load_w: 500, battery_wh: 20000, initial_soc: 1 }, panel: { area_m2: 10, efficiency: 0.3, tracking: true, tilt_deg: 90, azimuth_deg: 0 },
  max_delay_days: 30, margins: true, label: "", offset_north_m: 0, offset_east_m: 0 };
// El caso del relato: la misma misión, corrida 9 días.
const PRESETS = {
  base: { es: "Misión base", en: "Baseline mission", spec: BASE },
  delay9: { es: "Ejemplo: atraso de 9 días", en: "Example: 9-day delay", spec: { ...BASE, start: "2027-01-24T00:00:00Z", label: "Example: 9-day delay" } },
};
const MODES = [["outreach", "Divulgación", "Outreach", "Lenguaje llano y recorrido guiado", "Plain language and guided tour"],
  ["ops", "Operaciones", "Mission Ops", "Requisitos, márgenes, umbrales y alertas", "Requirements, margins, thresholds and alerts"],
  ["science", "Ciencia", "Science", "Fórmulas, traza completa, unidades e incertidumbre", "Formulas, full trace, units and uncertainty"]];

const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * 864e5).toISOString().slice(0, 19) + "Z";

// Enlaces directos: #ejemplo&modo=ops&h=233&cam=module&v=3d&luz=real  (sirve para la demo, el video y las capturas)
function hashParams() {
  const out = {};
  (location.hash || "").replace(/^#/, "").split("&").filter(Boolean).forEach((kv) => { const [k, v] = kv.split("="); out[k] = v ?? true; });
  return out;
}
const HP = hashParams();
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } } };

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
  const [lang, setLang] = useState(() => HP.lang || ((navigator.language || "es").startsWith("es") ? "es" : "en"));
  const t = T[lang], es = lang === "es";
  const [mode, setModeRaw] = useState(() => (["outreach", "ops", "science"].includes(HP.modo) ? HP.modo : store.get("lumox.mode", "science")));
  const setMode = (m) => { setModeRaw(m); store.set("lumox.mode", m); };
  const outreach = mode === "outreach", sci = mode === "science", ops = mode === "ops";
  const [screen, setScreen] = useState(() => (decodeSpec() || HP.ejemplo ? "answer" : "home"));
  const [section, setSection] = useState("overview");
  const [view, setView] = useState(HP.v === "2d" ? "2d" : "3d");
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
  const [fine, setFine] = useState(null);
  const [features, setFeatures] = useState(null);
  const [places, setPlaces] = useState(() => store.get("lumox.places", []));
  const [lumoVisible, setLumoVisible] = useState(() => window.innerWidth > 860);
  const [guide, setGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const abort = useRef();
  const urlHour = useRef(HP.h != null ? +HP.h : null);

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
      setResult(out.result); setTraceId(out.result.trace_id); setPrecomputed(!!out.precomputed);
      if (out.trace) { const m = {}; out.trace.steps.forEach((x) => { m[x.id] = x; }); setSteps(m); setOrder(out.trace.steps.map((x) => x.id)); }
      if (!s.offset_north_m && !s.offset_east_m) setAllResults((p) => ({ ...p, [s.site_id]: out.result }));
    } catch (e) { if (e.name !== "AbortError") setError(String(e.message || e)); }
    finally { setRunning(false); }
  }, [spec]);

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
  const loadExample = () => loadPre("delay9", "example-delay");
  useEffect(() => {
    if (HP.ejemplo) { loadExample(); return; }
    if (decodeSpec()) { run(spec); return; }
    if (!outreach) loadPre("base", "site-shackleton");   // la misión base, precalculada
  }, []); // eslint-disable-line
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) { firstMode.current = false; return; }
    if (!outreach && !result && !running) loadPre("base", "site-shackleton");
  }, [mode]); // eslint-disable-line
  // hora pedida por el enlace (una sola vez, cuando llega el primer resultado)
  // se aplica con el precalculado y otra vez con el resultado en vivo (que no lo pisa)
  const urlHourUses = useRef(0);
  useEffect(() => {
    if (result && urlHour.current != null) {
      setHour(Math.min(urlHour.current, result.series.time.length - 1));
      if (++urlHourUses.current >= 2) urlHour.current = null;
    }
  }, [result]);

  // El sitio base (donde está centrado el relieve) no cambia cuando se analiza otro punto dentro de él
  const anchor = useMemo(() => sites.find((s) => s.id === spec.site_id) || null, [sites, spec.site_id]);
  useEffect(() => {
    if (!anchor) return;
    setPatch(null); setFine(null); setFeatures(null);
    getTerrain(anchor.lat, anchor.lon).then(setPatch).catch(() => setPatch({ available: false }));
    getTerrainFine(anchor.lat, anchor.lon).then(setFine);
    getFeatures(anchor.lat, anchor.lon, 150).then(setFeatures);
  }, [anchor?.id]); // eslint-disable-line

  // reproducir: avanza la hora; con "menos movimiento" va de a pasos más grandes
  useEffect(() => {
    if (!playing || !result) return;
    const n = result.series.time.length;
    const slow = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(() => setHour((h) => (h + (slow ? 12 : 1)) % n), slow ? 800 : 70);
    return () => clearInterval(id);
  }, [playing, result]);

  const update = (p) => { const s = { ...spec, ...p }; setSpec(s); setAllResults({}); return s; };
  const go = (p) => run(update(p), { keep: true });
  const loadPreset = (k) => { setPreset(k); const s = { ...PRESETS[k].spec, site_id: spec.site_id }; setSpec(s); run(s, { keep: true }); };
  const startSimple = (p) => { const s = { ...spec, ...p, offset_north_m: 0, offset_east_m: 0, margins: true }; setSpec(s); setAllResults({}); setScreen("answer"); setResult(null); run(s); };
  const goSite = (id) => go({ site_id: id, offset_north_m: 0, offset_east_m: 0, margins: true });
  // "Analizar este punto": el mismo cálculo en otro lugar del relieve. Sin márgenes (cada punto nuevo necesita ~33 horizontes);
  // los márgenes se piden aparte.
  const analyze = (pos) => go({ offset_north_m: Math.round(pos.north), offset_east_m: Math.round(pos.east), margins: false });
  const computeMargins = () => go({ margins: true });
  const setMast = (m) => go({ mast_m: m });
  const runWith = async (p) => (await runScenario({ ...spec, ...p, label: "profile" })).result;
  const runB = async ({ site_id, delay }) => (await runScenario({ ...spec, site_id, start: addDays(spec.start, delay), label: "compare-B" })).result;
  const openStep = async (id) => {
    if (!id) return;
    if (steps[id]) { setModal(steps[id]); return; }
    if (traceId) { try { const tr = await api.trace(traceId); const st = tr.steps.find((x) => x.id === id); if (st) setModal(st); } catch { /* sin traza */ } }
  };
  const stepNo = (id) => (steps[id] ? steps[id].index + 1 : null);
  const onLumo = (a) => {
    if (a === "margins") { if (outreach) document.querySelector('[data-tour="margins"]')?.scrollIntoView({ behavior: "smooth", block: "center" }); else setSection("analysis"); }
    else if (a === "compare") { if (outreach) setMode("ops"); setSection("scenarios"); }
    else if (a.startsWith("mast:")) go({ mast_m: +a.slice(5) });
    else if (a.startsWith("delay:")) go({ start: addDays(spec.start, +a.slice(6)) });
  };
  const share = async () => { try { await navigator.clipboard.writeText(encodeSpec(spec)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sin portapapeles */ } };

  // lugares guardados (escenario + punto), en el navegador
  const savePlace = (pos) => {
    const name = `${anchor?.name || spec.site_id} · ${spec.start.slice(0, 10)}${pos && (pos.north || pos.east) ? ` · N ${(pos.north / 1000).toFixed(1)} E ${(pos.east / 1000).toFixed(1)} km` : ""}`;
    const next = [...places, { id: String(Date.now()), name, spec: { ...spec, offset_north_m: Math.round(pos?.north || 0), offset_east_m: Math.round(pos?.east || 0), margins: !(pos?.north || pos?.east) } }];
    setPlaces(next); store.set("lumox.places", next);
  };
  const goPlace = (p) => { setSpec(p.spec); setAllResults({}); run(p.spec, { keep: true }); };
  const delPlace = (id) => { const next = places.filter((x) => x.id !== id); setPlaces(next); store.set("lumox.places", next); };

  // comparación de escenarios (Operaciones y Análisis): todos los sitios con la misma configuración, en segundo plano
  useEffect(() => {
    if (!(ops || section === "analysis") || !sites.length || outreach) return;
    let cancel = false;
    (async () => { for (const s of sites) { if (cancel || allResults[s.id]) continue;
      try { const o = await runScenario({ ...spec, site_id: s.id, offset_north_m: 0, offset_east_m: 0, margins: true }); if (!cancel) setAllResults((p) => ({ ...p, [s.id]: o.result })); } catch { /* fila vacía */ } } })();
    return () => { cancel = true; };
  }, [ops, section, sites.length]); // eslint-disable-line

  const site = sites.find((s) => s.id === spec.site_id);
  const startDate = spec.start.slice(0, 10), startTime = spec.start.slice(11, 16);
  const showViewer = section === "overview" || section === "explorer";
  const noMargins = result && !result.margins;

  const viewerNode = (variant) => (
    view === "3d" && webgl ? (
      <SceneViewer key={anchor?.id || "none"} lang={lang} variant={variant} sites={sites} anchor={anchor} patch={patch} fine={fine} features={features} result={result} hour={hour} setHour={setHour}
        playing={playing} setPlaying={setPlaying} onAnalyze={analyze} onMast={setMast} onGoSite={goSite} places={places} onSavePlace={savePlace} onGoPlace={goPlace} onDeletePlace={delPlace}
        view={view} setView={variant === "explorer" ? setView : undefined} webgl={webgl} init={{ cam: HP.cam, luz: HP.luz, exag: HP.exag, panel: HP.panel }} />
    ) : (
      <div className="view2d-wrap">
        {variant === "explorer" && <div className="sv-tools"><div className="seg" role="group" aria-label={es ? "Vista" : "View"}>
          <button className="on"><Ic.globe width="18" height="18" />2D</button>
          <button onClick={() => webgl && setView("3d")} disabled={!webgl} title={webgl ? "" : (es ? "Tu equipo no soporta WebGL" : "WebGL not available")}><Ic.cube width="18" height="18" />3D</button></div></div>}
        {!result ? <div className="skeleton" style={{ height: 320 }} /> : (
          <div className="view2d">
            <div>
              {!webgl && <div className="infobox" style={{ marginBottom: 8 }}>{es ? "Tu equipo no soporta 3D (WebGL): te mostramos la vista 2D." : "No WebGL on this device: showing the 2D view."}</div>}
              {result.data.horizon_source === "flat" && <div className="warnbox" style={{ marginBottom: 8 }}>{t.flatHorizon}</div>}
              <div className="xs mute" style={{ marginBottom: 4 }}>{es ? "Panorama del horizonte (360°)" : "Horizon panorama (360°)"}</div>
              <PanoramaSvg result={result} hour={hour} lang={lang} />
            </div>
            <div><div className="xs mute" style={{ marginBottom: 4 }}>{es ? "Mapa cenital" : "Top-down map"}</div><ZenithMap patch={patch} result={result} hour={hour} lang={lang} /></div>
          </div>)}
        {result && <Timeline result={result} hour={hour} setHour={setHour} playing={playing} setPlaying={setPlaying} lang={lang} />}
      </div>
    )
  );

  const modals = (
    <>
      <StepModal step={modal} t={t} lang={lang} onClose={() => setModal(null)} onJump={openStep} steps={steps}
        onAnim={modal && animFor(modal.id) ? () => { const k = animFor(modal.id), c = plain(modal, lang); setModal(null); setAnim({ kind: k, caption: c }); } : null} />
      {anim && <AnimModal kind={anim.kind} caption={anim.caption} lang={lang} onClose={() => setAnim(null)} />}
      <Lumo key={outreach ? "friendly" : "sci"} result={screen === "home" && outreach ? null : result} t={t} lang={lang} hour={hour} guide={guide} setGuide={setGuide}
        visible={lumoVisible} setVisible={setLumoVisible} loadExample={loadExample} running={running} onAction={onLumo}
        tourReady={outreach && screen === "answer" && !!result} compact={!outreach} scientific={!outreach} stepNo={stepNo} />
    </>
  );
  const modeSwitch = (
    <div className="seg mode-seg" role="group" aria-label={es ? "Modo" : "Mode"}>
      {MODES.map(([k, a, b, ta, tb]) => <button key={k} className={mode === k ? "on" : ""} onClick={() => setMode(k)} aria-pressed={mode === k} title={es ? ta : tb}>{es ? a : b}</button>)}
    </div>
  );
  const langSwitch = <div className="seg lang-seg" role="group" aria-label={es ? "Idioma" : "Language"}>{["es", "en"].map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>;

  // ---------------- Divulgación: una pregunta por pantalla
  if (outreach) return (
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
              renderViewer={() => viewerNode("outreach")} renderFlat={() => viewerNode("outreach-2d")}
              onAnim={(k, c) => setAnim({ kind: k, caption: c })} onNew={() => setScreen("home")} openStep={openStep} />}
      </main>
      <footer className="simple-foot">{es ? "Datos: NASA/JPL Horizons, NAIF SPICE, LRO LOLA y LROC, NASA SVS, IAU/USGS. Lumox no es un producto oficial de NASA." : "Data: NASA/JPL Horizons, NAIF SPICE, LRO LOLA and LROC, NASA SVS, IAU/USGS. Lumox is not an official NASA product."} <a href="https://github.com/anabelgrez/lumox/blob/v3-explorador/docs/FUENTES.md" target="_blank" rel="noreferrer">{es ? "Fuentes" : "Sources"}</a></footer>
      {modals}
    </div>
  );

  // ---------------- Operaciones y Ciencia: el explorador
  const rightPanel = (
    <StatusPanel r={result} hour={hour} lang={lang} open={openStep} running={running} compact defaultOpen={sci}>
      {ops && result && <Alerts r={result} lang={lang} open={openStep} />}
      {noMargins && (
        <div className="panel"><p className="small soft">{es ? "Este punto se analizó sin márgenes: cada punto nuevo necesita recalcular decenas de horizontes." : "This point was analysed without margins: every new point needs dozens of horizons recomputed."}</p>
          <button className="btn primary" style={{ marginTop: 8 }} onClick={computeMargins} disabled={running}>{es ? "Calcular márgenes de este punto" : "Compute margins for this point"}</button></div>)}
    </StatusPanel>
  );
  return (
    <div className="shell">
      <div className="brand"><Logo /><div><b>LUMOX</b><span>Lunar Mission Planner</span></div></div>

      <header className="topbar">
        <div className="ctl preset-ctl"><div><label htmlFor="preset">{es ? "Escenario" : "Scenario"}</label>
          <select id="preset" value={preset} onChange={(e) => loadPreset(e.target.value)}>{Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>{p[lang]}</option>)}</select></div></div>
        <div className="ctl"><Ic.pin /><div><label htmlFor="site">{site ? `${Math.abs(site.lat).toFixed(2)}°${site.lat < 0 ? "S" : "N"}, ${Math.abs(site.lon).toFixed(2)}°${site.lon < 0 ? (es ? "O" : "W") : "E"}` : (es ? "Sitio" : "Site")}</label>
          <select id="site" value={spec.site_id} onChange={(e) => goSite(e.target.value)} aria-label={es ? "Sitio" : "Site"}>
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
        <div className="tb-sep tb-item">{langSwitch}</div>
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
            <section className="panel viewer" aria-label={es ? "Visor del sitio" : "Site viewer"}>
              {!result && !running ? <div className="empty" style={{ height: 300, display: "grid", placeItems: "center" }}>{error ? (es ? "No se pudo calcular el escenario." : "Could not compute the scenario.") : "—"}</div>
                : !result ? <div className="skeleton" style={{ height: 480 }} /> : viewerNode("explorer")}
            </section>
            {rightPanel}
          </div>
        )}
        {section === "overview" && sci && (
          <div className="bottom-row">
            <TraceTable steps={steps} order={order} traceId={traceId} lang={lang} mode="tech" running={running} precomputed={precomputed} onAnim={(k, c) => setAnim({ kind: k, caption: c })} />
            <CalcCard lang={lang} traceId={precomputed ? null : traceId} onSaved={(r) => { setSteps((p) => ({ ...p, [r.step.id]: r.step })); setOrder((p) => [...p, r.step.id]); }} />
          </div>)}
        {section === "overview" && ops && (
          <div className="bottom-row ops">
            <Requirements r={result} spec={spec} lang={lang} running={running} onApply={(p) => go({ autonomy_h: p.autonomy_h, max_comm_gap_h: p.max_comm_gap_h })} />
            <section className="panel scroll-panel" aria-label={es ? "Márgenes" : "Margins"}>
              <div className="panel-h"><Ic.hourglass /><h2>{es ? "Márgenes" : "Margins"}</h2></div>
              {result?.margins ? <div className="stack"><DaysMargin result={result} t={t} open={openStep} onLoadDelay={(d) => go({ start: addDays(spec.start, d) })} /><MetresMargin result={result} t={t} onMast={(m) => go({ mast_m: m })} /></div>
                : <p className="mute small">{es ? "Sin márgenes para este punto." : "No margins for this point."}</p>}
            </section>
            <section className="panel scroll-panel" aria-label={es ? "Comparación de escenarios" : "Scenario comparison"}>
              <div className="panel-h"><Ic.layers /><h2>{es ? "Comparación de escenarios" : "Scenario comparison"}</h2></div>
              <Heatmap results={allResults} sites={sites} t={t} selected={{ site_id: spec.site_id, delay: 0 }} onPick={(site_id, delay) => go({ site_id, start: addDays(BASE.start, delay), offset_north_m: 0, offset_east_m: 0, margins: true })} />
            </section>
          </div>)}
        {section === "explorer" && result && <Inferences result={result} t={t} lang={lang} open={openStep} />}

        {section === "analysis" && (result?.margins ? (
          <div className="stack">
            <div className="panel"><div className="panel-h"><Ic.mountain /><h2>{t.heatmap}</h2></div>
              <Heatmap results={allResults} sites={sites} t={t} selected={{ site_id: spec.site_id, delay: 0 }}
                onPick={(site_id, delay) => { setSection("overview"); go({ site_id, start: addDays(spec.start, delay), offset_north_m: 0, offset_east_m: 0, margins: true }); }} /></div>
            <div className="grid2">
              <DaysMargin result={result} t={t} open={openStep} onLoadDelay={(d) => go({ start: addDays(spec.start, d) })} />
              <MetresMargin result={result} t={t} onMast={(m) => go({ mast_m: m })} />
              <KmMargin result={result} t={t} />
            </div>
          </div>) : <div className="panel empty">{running ? (es ? "Calculando…" : "Computing…") : (es ? "Este punto no tiene márgenes calculados." : "This point has no margins computed.")}</div>)}

        {section === "scenarios" && result && <Compare sites={sites} specA={spec} resultA={result} t={t} lang={lang} runB={runB} open={openStep} />}
        {section === "calcs" && (
          <div className="stack">
            <TraceTable steps={steps} order={order} traceId={traceId} lang={lang} mode="tech" running={running} precomputed={precomputed} onAnim={(k, c) => setAnim({ kind: k, caption: c })} />
            <Explainers lang={lang} result={result} />
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
          <span>{es ? "Datos" : "Data"}: NASA/JPL · LOLA · SPICE · IAU/USGS</span>
          {precomputed && <span className="mute">· {es ? "precalculado, actualizando" : "precomputed, updating"}</span>}
          <a href="https://github.com/anabelgrez/lumox/blob/v3-explorador/docs/FUENTES.md" target="_blank" rel="noreferrer" className="mute">{es ? "Fuentes" : "Sources"}</a>
        </div>
      </footer>

      {modals}
    </div>
  );
}
