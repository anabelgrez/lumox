import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, decodeSpec, encodeSpec, runScenario } from "./api.js";
import { T } from "./i18n.js";
import Panorama from "./Panorama.jsx";
import Cards from "./Cards.jsx";
import TracePanel, { StepModal } from "./Trace.jsx";
import { DaysMargin, Heatmap, KmMargin, MetresMargin } from "./Margins.jsx";
import { Calculator, Compare, Inferences, Profiles, Validation } from "./Views.jsx";
import Lumo from "./Lumo.jsx";

const EXAMPLE = { site_id: "shackleton", start: "2027-01-24T00:00:00Z", duration_days: 14, mast_m: 2, max_comm_gap_h: 48,
  power: { load_w: 500, battery_wh: 20000, initial_soc: 1 }, panel: { area_m2: 10, efficiency: 0.3, tracking: true, tilt_deg: 90, azimuth_deg: 0 },
  max_delay_days: 30, margins: true, label: "Example: 9-day delay" };
const DEFAULT = { ...EXAMPLE, start: "2027-01-15T00:00:00Z", label: "" };

const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * 864e5).toISOString().slice(0, 19) + "Z";

export default function App() {
  const [lang, setLang] = useState(() => (navigator.language || "es").startsWith("es") ? "es" : "en");
  const t = T[lang];
  const [status, setStatus] = useState(null);
  const [sites, setSites] = useState([]);
  const [spec, setSpec] = useState(() => decodeSpec() || DEFAULT);
  const [tab, setTab] = useState("overview");
  const [result, setResult] = useState(null);
  const [steps, setSteps] = useState({});
  const [order, setOrder] = useState([]);
  const [traceId, setTraceId] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [precomputed, setPrecomputed] = useState(false);
  const [modal, setModal] = useState(null);
  const [hour, setHour] = useState(0);
  const [allResults, setAllResults] = useState({});
  const [lumoVisible, setLumoVisible] = useState(true);
  const [guide, setGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const abort = useRef();

  useEffect(() => { api.status().then(setStatus).catch(() => setStatus(null)); api.sites().then(setSites).catch(() => setSites([])); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const run = useCallback(async (s = spec) => {
    abort.current?.abort(); const ctl = new AbortController(); abort.current = ctl;
    setRunning(true); setError(null); setSteps({}); setOrder([]); setTraceId(null); setPrecomputed(false); setHour(0);
    try {
      const out = await runScenario(s, {
        signal: ctl.signal,
        onStart: (id) => setTraceId(id),
        onStep: (st) => { setSteps((p) => ({ ...p, [st.id]: st })); setOrder((p) => [...p, st.id]); },
      });
      setResult(out.result); setTraceId(out.result.trace_id);
      if (out.precomputed) { setPrecomputed(true); const m = {}; out.trace.steps.forEach((x) => { m[x.id] = x; }); setSteps(m); setOrder(out.trace.steps.map((x) => x.id)); }
      setAllResults((p) => ({ ...p, [s.site_id]: out.result }));
    } catch (e) { if (e.name !== "AbortError") setError(String(e.message || e)); }
    finally { setRunning(false); }
  }, [spec]);

  useEffect(() => { run(spec); }, []); // eslint-disable-line

  // Background runs for the heat map (all sites, same spec) — backend computes, we display.
  const loadAllSites = useCallback(async () => {
    for (const s of sites) {
      if (allResults[s.id]) continue;
      try { const out = await runScenario({ ...spec, site_id: s.id }); setAllResults((p) => ({ ...p, [s.id]: out.result })); } catch { /* shown as empty row */ }
    }
  }, [sites, spec, allResults]);
  useEffect(() => { if (tab === "margins" && sites.length) loadAllSites(); }, [tab, sites.length]); // eslint-disable-line

  const update = (patch) => { const s = { ...spec, ...patch }; setSpec(s); setAllResults({}); return s; };
  const runWith = async (patch) => (await runScenario({ ...spec, ...patch, label: "profile" })).result;
  const runB = async ({ site_id, delay }) => (await runScenario({ ...spec, site_id, start: addDays(spec.start, delay), label: "compare-B" })).result;
  const openStep = async (id) => {
    if (!id) return;
    if (steps[id]) { setModal(steps[id]); return; }
    if (traceId) { try { const tr = await api.trace(traceId); const st = tr.steps.find((x) => x.id === id); if (st) { setSteps((p) => ({ ...p, [id]: st })); setModal(st); } } catch { /* ignore */ } }
  };
  const loadExample = () => { setTab("overview"); const s = update(EXAMPLE); run(s); };
  const share = async () => { try { await navigator.clipboard.writeText(encodeSpec(spec)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  const siteInfo = sites.find((s) => s.id === spec.site_id);
  const online = status !== null;

  return (
    <div className="app">
      <header className="panel top">
        <div className="brand"><h1>Lum<b>o</b>x</h1><span className="tag">{t.tagline}</span></div>
        <div className="controls">
          <label className="field">{t.site}
            <select value={spec.site_id} onChange={(e) => update({ site_id: e.target.value })}>
              {sites.length === 0 && <option value={spec.site_id}>{spec.site_id}</option>}
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}{s.dem ? "" : " ·"}</option>)}
            </select></label>
          <label className="field">{t.date}<input type="datetime-local" value={spec.start.slice(0, 16)} onChange={(e) => update({ start: e.target.value + ":00Z" })} /></label>
          <label className="field">{t.duration} ({t.days})<input type="number" min={1} max={120} value={spec.duration_days} onChange={(e) => update({ duration_days: +e.target.value })} /></label>
          <label className="field">{t.mast} ({t.meters})<input type="number" min={0} max={50} step={1} value={spec.mast_m} onChange={(e) => update({ mast_m: +e.target.value })} /></label>
          <label className="field">{t.autonomy} ({t.hours})<input type="number" min={1} value={spec.autonomy_h ?? Math.round(spec.power.battery_wh / spec.power.load_w)} onChange={(e) => update({ autonomy_h: +e.target.value })} /></label>
          <label className="field">{t.maxGap} ({t.hours})<input type="number" min={1} value={spec.max_comm_gap_h} onChange={(e) => update({ max_comm_gap_h: +e.target.value })} /></label>
          <button className="btn primary" disabled={running} onClick={() => run(spec)}>{running ? t.running : t.run}</button>
          <button className="btn sun" onClick={loadExample}>{t.example}</button>
          <button className="btn" onClick={share}>{copied ? t.shared : t.share}</button>
          <div className="seg" role="group" aria-label={t.lang}>{["es", "en"].map((l) => <button key={l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
        </div>
        <div className="status" style={{ width: "100%" }}>
          <span className={"dot " + (online ? "ok" : "bad")} />{online ? t.online : t.offline}
          {status && <span>· {t.provider}: {status.ephemeris.spice.available ? "SPICE" : "Horizons"} · DEM: {status.dems.length}</span>}
          {siteInfo && !siteInfo.verified && <span className="warn">· {t.unverified}</span>}
          {siteInfo && !siteInfo.dem && <span className="warn">· {t.horizonSrc}: flat</span>}
        </div>
      </header>

      <nav className="tabs panel">
        {Object.entries(t.tabs).map(([k, v]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{v}</button>)}
      </nav>

      {error && <div className="errbox">{t.error}: {error}</div>}

      {tab === "overview" && (
        <div className="grid main">
          <div className="stack">
            <Panorama result={result} t={t} hour={hour} setHour={setHour} />
            {result && <Cards result={result} t={t} open={openStep} hour={hour} />}
            {result && <Inferences result={result} t={t} lang={lang} open={openStep} />}
          </div>
          <TracePanel steps={steps} order={order} traceId={traceId} t={t} onOpen={openStep} highlight={modal?.id} precomputed={precomputed} running={running} />
        </div>
      )}

      {tab === "margins" && result && (
        <div className="stack">
          <div className="panel"><h2>{t.heatmap}</h2>
            <Heatmap results={allResults} sites={sites} t={t} selected={{ site_id: spec.site_id, delay: 0 }}
              onPick={(site_id, delay) => { const s = update({ site_id, start: addDays(spec.start, delay) }); setTab("overview"); run(s); }} /></div>
          <div className="grid two">
            <DaysMargin result={result} t={t} open={openStep} onLoadDelay={(d) => { const s = update({ start: addDays(spec.start, d) }); run(s); }} />
            <MetresMargin result={result} t={t} onMast={(m) => { const s = update({ mast_m: m }); run(s); }} />
            <KmMargin result={result} t={t} />
          </div>
        </div>
      )}

      {tab === "compare" && result && <Compare sites={sites} specA={spec} resultA={result} t={t} lang={lang} runB={runB} open={openStep} />}
      {(tab === "science" || tab === "engineering") && result && <Profiles result={result} t={t} lang={lang} runWith={runWith} open={openStep} />}
      {tab === "calc" && <Calculator t={t} traceId={traceId} onSaved={(r) => { setSteps((p) => ({ ...p, [r.step.id]: r.step })); setOrder((p) => [...p, r.step.id]); }} />}
      {tab === "validation" && <Validation status={status} result={result} t={t} lang={lang} />}

      <StepModal step={modal} t={t} onClose={() => setModal(null)} onJump={openStep} steps={steps} />
      <Lumo result={result} t={t} lang={lang} guide={guide} setGuide={setGuide} visible={lumoVisible} setVisible={setLumoVisible} loadExample={loadExample} running={running} />
    </div>
  );
}
