import React from "react";

// Heat map site x date, margin in days, metres and kilometres. All values come
// from the backend (margins.days.scan, margins.metres.scan, margins.km.cells).

export function Heatmap({ results, sites, t, selected, onPick }) {
  const ids = sites.map((s) => s.id);
  const first = results[ids.find((id) => results[id])];
  if (!first) return <p className="mute small">—</p>;
  const cols = first.margins.days.scan.length;
  return (
    <div>
      <div className="heat" style={{ gridTemplateColumns: `140px repeat(${cols}, 1fr)` }}>
        <div />
        {first.margins.days.scan.map((d) => <div key={d.delay_days} className="num mute" style={{ textAlign: "center" }}>{d.delay_days % 5 === 0 ? `+${d.delay_days}` : ""}</div>)}
        {sites.map((s) => {
          const r = results[s.id];
          return (
            <React.Fragment key={s.id}>
              <div className="rowlab" title={s.name}>{s.name}</div>
              {r ? r.margins.days.scan.map((d) => (
                <div key={d.delay_days} className={"cell " + (d.viable ? "v" : "n") + (selected?.site_id === s.id && selected?.delay === d.delay_days ? " sel" : "")}
                  title={`${s.name} +${d.delay_days} d · night ${d.longest_night_h} h · gap ${d.longest_comm_gap_h} h`}
                  onClick={() => onPick(s.id, d.delay_days)} />
              )) : Array.from({ length: cols }).map((_, k) => <div key={k} className="cell" />)}
            </React.Fragment>
          );
        })}
      </div>
      <p className="small mute" style={{ marginTop: 6 }}>{t.heatHint}</p>
    </div>
  );
}

export function DaysMargin({ result, t, onLoadDelay, open }) {
  const d = result.margins?.days;
  if (!d) return null;
  return (
    <div className="panel">
      <h2>{t.marginDays}<button className="btn small right" onClick={() => open(d.step_id)}>{t.openStep}</button></h2>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className={"big " + (d.viable_now ? "ok" : "bad")}>{d.viable_now ? d.margin_days : "0"}</span>
        <span className="mute">{t.daysTolerated} · {d.viable_now ? t.viableNow : t.notViableNow}</span>
      </div>
      <div className="small mute" style={{ marginTop: 6 }}>{t.bestAlt}:</div>
      {d.best_alternatives.length === 0 ? <p className="mute small">—</p> : (
        <table className="t"><tbody>{d.best_alternatives.map((a) => (
          <tr key={a.delay_days}><td className="num">+{a.delay_days} d</td>
            <td className="num">{t.sunTime} {a.sun_time_pct.toFixed(0)} %</td>
            <td className="num">{t.earthTime} {a.earth_visible_pct.toFixed(0)} %</td>
            <td><button className="btn small" onClick={() => onLoadDelay(a.delay_days)}>{t.loadIt}</button></td></tr>
        ))}</tbody></table>
      )}
    </div>
  );
}

export function MetresMargin({ result, t, onMast }) {
  const m = result.margins?.metres;
  if (!m) return null;
  const max = Math.max(...m.scan.map((r) => r.sun_time_pct), 1);
  return (
    <div className="panel">
      <h2>{t.marginMeters}</h2>
      {m.note && <div className="warnbox" style={{ marginBottom: 8 }}>{m.note}</div>}
      <div className="bars">
        {m.scan.map((r) => (
          <div key={r.mast_m} className="bar" style={{ height: `${(r.sun_time_pct / max) * 100}%`, opacity: r.mast_m === result.spec.mast_m ? 1 : 0.6 }}
            title={`${r.mast_m} m → ${r.sun_time_pct.toFixed(1)} % (${r.gain_pct_points >= 0 ? "+" : ""}${r.gain_pct_points.toFixed(1)} pp)`}
            onClick={() => onMast(r.mast_m)}><span>{r.sun_time_pct.toFixed(0)}%</span></div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }} className="small num mute">
        {m.scan.map((r) => <span key={r.mast_m}>{r.mast_m} m</span>)}
      </div>
      <p className="small mute" style={{ marginTop: 6 }}>{t.mastGain}</p>
    </div>
  );
}

export function KmMargin({ result, t }) {
  const k = result.margins?.km;
  if (!k) return null;
  const n = k.grid;
  return (
    <div className="panel">
      <h2>{t.marginKm} <span className="right small">{t.grid}</span></h2>
      {k.note && <div className="warnbox" style={{ marginBottom: 8 }}>{k.note}</div>}
      <div className="kmgrid">
        {k.cells.map((c, i) => {
          const center = c.north_m === 0 && c.east_m === 0;
          return <div key={i} className={"c " + (c.viable ? "v" : "n") + (center ? " center" : "")}
            title={`N ${c.north_m / 1000} km, E ${c.east_m / 1000} km · ${t.sunTime} ${c.sun_time_pct.toFixed(0)} % · night ${c.longest_night_h} h · gap ${c.longest_comm_gap_h} h`}>
            {c.sun_time_pct.toFixed(0)}</div>;
        })}
      </div>
      <p className="small mute num" style={{ marginTop: 6 }}>{t.north} ↑ · {t.east} → · parallax ≤ {k.parallax_bound_deg.earth.toExponential(1)}° ({t.earth})</p>
    </div>
  );
}
