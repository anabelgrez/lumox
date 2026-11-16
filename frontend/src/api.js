// All numbers come from the backend. This module talks to it (WebSocket for
// live traces, REST otherwise) and, if the backend does not answer, loads the
// precomputed JSON exported by `python -m lumox.export` — clearly labelled.

const WS_URL = () => {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws/scenario`;
};

// Build estático (GitHub Pages): sin backend. Los GET se leen de instantáneas en public/static-api
// y los escenarios de public/scenarios; todo es precalculado y la interfaz lo avisa.
export const STATIC = import.meta.env.VITE_STATIC === "1";
const BASE = import.meta.env.BASE_URL;
export const assetUrl = (p) => BASE + p.replace(/^\//, "");
const staticKey = (url) => url.replace(/^\//, "").replace(/[^a-zA-Z0-9._-]/g, "_") + ".json";

export async function getJSON(url, opts) {
  if (STATIC) {
    if (opts?.method && opts.method !== "GET") throw new Error("503: demo estática, sin motor de cálculo (ejecútalo en local)");
    url = url.startsWith("/scenarios/") ? assetUrl(url) : assetUrl("static-api/" + staticKey(url));
  }
  const r = await fetch(url, opts);
  if (!r.ok) {
    let detail = r.statusText;
    try { detail = (await r.json()).detail ?? detail; } catch { /* keep statusText */ }
    throw new Error(`${r.status}: ${detail}`);
  }
  return r.json();
}

export const api = {
  status: () => getJSON("/api/status"),
  sites: () => getJSON("/api/sites"),
  formulas: () => getJSON("/api/formulas"),
  trace: (id, full = false) => getJSON(`/api/trace/${id}${full ? "?full=1" : ""}`),
  traceCsvUrl: (id) => `/api/trace/${id}?format=csv`,
  calc: (id, inputs, trace_id) =>
    getJSON(`/api/calc/${id}`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputs, trace_id }) }),
  scenarioRest: (spec) =>
    getJSON("/api/scenario", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(spec) }),
};

// Corre un escenario con los pasos en vivo (WebSocket). Si el WebSocket se corta antes de terminar
// (cálculos largos, proxy, red), se reintenta por REST con el mismo pedido; y solo si el motor no
// responde para nada, se usa el JSON precalculado, rotulado como tal.
export function runScenario(spec, { onStep, onStart, signal } = {}) {
  if (STATIC) return fallback(spec);
  return new Promise((resolve, reject) => {
    let settled = false, ws = null, wsDone = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const fail = (e) => { if (!settled) { settled = true; reject(e); } };
    const viaRest = async () => {
      if (wsDone) return; wsDone = true;
      try {
        const result = await api.scenarioRest(spec);
        const trace = await api.trace(result.trace_id).catch(() => null);
        done({ result, trace, precomputed: false, viaRest: true });
      } catch (e) {
        if (String(e.message || e).startsWith("422") || String(e.message || e).startsWith("404")) return fail(e);   // error del pedido: no se tapa con un precalculado
        fallback(spec).then(done, () => fail(e));
      }
    };
    try { ws = new WebSocket(WS_URL()); } catch { viaRest(); return; }
    const timer = setTimeout(() => { try { ws.close(); } catch { /* nada */ } viaRest(); }, 8000);
    ws.onopen = () => { clearTimeout(timer); ws.send(JSON.stringify(spec)); };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "start") onStart?.(m.trace_id);
      else if (m.type === "step") onStep?.(m.step, m.trace_id);
      else if (m.type === "result") { wsDone = true; done({ result: m.result, precomputed: false }); }
      else if (m.type === "error") { wsDone = true; fail(new Error(m.message)); }
      // m.type === "hb": latido del servidor, solo mantiene viva la conexión
    };
    ws.onerror = () => { clearTimeout(timer); viaRest(); };
    ws.onclose = () => { if (!settled) viaRest(); };
    signal?.addEventListener("abort", () => { wsDone = true; try { ws.close(); } catch { /* nada */ } fail(new DOMException("aborted", "AbortError")); });
  });
}

// Static fallback: only exact presets exist. Anything else is reported as missing.
async function fallback(spec) {
  const idx = await getJSON("/scenarios/index.json").catch(() => null);
  if (!idx) throw new Error("backend offline and no precomputed scenarios found (run: python -m lumox.export)");
  const match = idx.scenarios.find((s) => s.site_id === spec.site_id && s.start === spec.start)
    || (STATIC ? idx.scenarios.find((s) => s.id === `site-${spec.site_id}`) : null);
  if (!match) throw new Error("backend offline; this scenario is not among the precomputed ones");
  const data = await getJSON(`/scenarios/${match.id}.json`);
  return { result: data.result, trace: data.trace, precomputed: true, exported: data.exported };
}

// Rasgos nombrados (IAU/USGS) y sombras permanentes (LOLA) alrededor del sitio; el relieve no cambia con la fecha.
const featCache = new Map();
export function getFeatures(lat, lon, radius_km = 150) {
  const k = `${lat},${lon},${radius_km}`;
  if (!featCache.has(k)) {
    const p = getJSON(`/api/features?lat=${lat}&lon=${lon}&radius_km=${radius_km}&limit=80&psr_radius_m=13000`).catch((e) => { featCache.delete(k); return { features: [], psr: [], available: {}, error: String(e.message || e) }; });
    featCache.set(k, p);
  }
  return featCache.get(k);
}
// Horizonte para otra altura de mástil / otro punto, sin recalcular el escenario.
export const getHorizon = (lat, lon, mast_m, north_m = 0, east_m = 0) =>
  getJSON(`/api/horizon?lat=${lat}&lon=${lon}&mast_m=${mast_m}&north_m=${north_m}&east_m=${east_m}`);
export const locate = (lat0, lon0, lat, lon) => getJSON(`/api/locate?lat0=${lat0}&lon0=${lon0}&lat=${lat}&lon=${lon}`);

// Parche de terreno para 2D/3D, con caché por sitio (no cambia con la fecha).
const terrainCache = new Map();
export function getTerrain(lat, lon) {
  const k = `${lat},${lon}`;
  if (!terrainCache.has(k)) {
    const p = getJSON(`/api/terrain?lat=${lat}&lon=${lon}&half_size_m=12000&n=97`).catch((e) => { terrainCache.delete(k); throw e; });
    terrainCache.set(k, p);
  }
  return terrainCache.get(k);
}

// Parche fino (DEM de 5 m del sitio, solo visual) para el nivel de detalle cercano.
export function getTerrainFine(lat, lon) {
  const k = `fine:${lat},${lon}`;
  if (!terrainCache.has(k)) {
    const p = getJSON(`/api/terrain?lat=${lat}&lon=${lon}&half_size_m=1500&n=201&fine=true`).catch(() => ({ available: false }));
    terrainCache.set(k, p);
  }
  return terrainCache.get(k);
}

// Shareable link: the whole spec lives in the URL hash.
export function encodeSpec(spec, extra = {}) {
  const s = btoa(unescape(encodeURIComponent(JSON.stringify({ ...spec, ...extra }))));
  return `${location.origin}${location.pathname}#s=${s}`;
}
export function decodeSpec() {
  const m = location.hash.match(/#s=(.+)$/);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch { return null; }
}
