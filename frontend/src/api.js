// All numbers come from the backend. This module talks to it (WebSocket for
// live traces, REST otherwise) and, if the backend does not answer, loads the
// precomputed JSON exported by `python -m lumox.export` — clearly labelled.

const WS_URL = () => {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws/scenario`;
};

export async function getJSON(url, opts) {
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

// Run a scenario with live step streaming. onStep(step) is called per step.
// Resolves with { result, precomputed:false } or falls back to static JSON.
export function runScenario(spec, { onStep, onStart, signal } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const fail = (e) => { if (!settled) { settled = true; reject(e); } };
    let ws;
    try { ws = new WebSocket(WS_URL()); } catch (e) { return fallback(spec).then(done, fail); }
    const timer = setTimeout(() => { try { ws.close(); } catch {} fallback(spec).then(done, fail); }, 8000);
    ws.onopen = () => { clearTimeout(timer); ws.send(JSON.stringify(spec)); };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "start") onStart?.(m.trace_id);
      else if (m.type === "step") onStep?.(m.step, m.trace_id);
      else if (m.type === "result") done({ result: m.result, precomputed: false });
      else if (m.type === "error") fail(new Error(m.message));
    };
    ws.onerror = () => { clearTimeout(timer); fallback(spec).then(done, fail); };
    ws.onclose = () => { if (!settled) fallback(spec).then(done, fail); };
    signal?.addEventListener("abort", () => { try { ws.close(); } catch {} fail(new DOMException("aborted", "AbortError")); });
  });
}

// Static fallback: only exact presets exist. Anything else is reported as missing.
async function fallback(spec) {
  const idx = await getJSON("/scenarios/index.json").catch(() => null);
  if (!idx) throw new Error("backend offline and no precomputed scenarios found (run: python -m lumox.export)");
  const match = idx.scenarios.find((s) => s.site_id === spec.site_id && s.start === spec.start);
  if (!match) throw new Error("backend offline; this scenario is not among the precomputed ones");
  const data = await getJSON(`/scenarios/${match.id}.json`);
  return { result: data.result, trace: data.trace, precomputed: true, exported: data.exported };
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
