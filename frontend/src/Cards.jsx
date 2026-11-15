import React from "react";

export const fmtH = (h, t) => (h === null || h === undefined ? t.never : h === 0 ? t.now : h < 48 ? `${h.toFixed(0)} h` : `${(h / 24).toFixed(1)} d`);
export const pct = (v) => `${v.toFixed(1)}`;

function Card({ label, value, unit, sub, onOpen, cls }) {
  return (
    <button className="card" onClick={onOpen} title={onOpen ? "Ver cómo se calculó" : ""}>
      <span className="label">{label}</span>
      <span className={"value " + (cls || "")}>{value}{unit && <small>{unit}</small>}</span>
      {sub && <span className="sub">{sub}</span>}
    </button>
  );
}

export function Verdict({ result, t, open }) {
  const v = result.verdict, st = v.state;
  return (
    <div className={"verdict " + st} role="status">
      <div>
        <div className="small mute">{t.verdict}</div>
        <div className={"state " + (st === "survives" ? "ok" : st === "marginal" ? "warn" : "bad")}>{t[st]}</div>
        <div className="small mute">{t.verdictWhy[st]}</div>
      </div>
      <div className="num small" style={{ marginLeft: "auto", textAlign: "right" }}>
        <div>T_night / T_aut = {v.night_ratio.toFixed(2)}</div>
        <div>T_gap / T_max = {v.gap_ratio.toFixed(2)}</div>
        <button className="btn small" style={{ marginTop: 6 }} onClick={() => open(result.steps.verdict)}>{t.openStep}</button>
      </div>
    </div>
  );
}

export default function Cards({ result, t, open, hour }) {
  const m = result.metrics, e = result.energy, s = result.series, st = result.steps;
  const i = Math.min(hour ?? 0, s.time.length - 1);
  return (
    <div className="stack">
      <Verdict result={result} t={t} open={open} />
      <div className="cards">
        <Card label={t.sunTime} value={pct(m.sun_time_pct)} unit="%" cls="sun" onOpen={() => open(st.sun_time)}
          sub={`${t.sunTime} 100%: ${pct(m.full_sun_time_pct)} %`} />
        <Card label={t.longestNight} value={m.longest_night_h.toFixed(0)} unit="h" onOpen={() => open(st.longest_night)}
          sub={`${t.autonomy}: ${result.autonomy_h.toFixed(0)} h`} cls={m.longest_night_h > result.autonomy_h ? "bad" : ""} />
        <Card label={t.earthTime} value={pct(m.earth_visible_pct)} unit="%" cls="earth" onOpen={() => open(st.earth_time)} />
        <Card label={t.longestGap} value={m.longest_comm_gap_h.toFixed(0)} unit="h" onOpen={() => open(st.longest_gap)}
          sub={`${t.maxGap}: ${result.spec.max_comm_gap_h} h`} cls={m.longest_comm_gap_h > result.spec.max_comm_gap_h ? "bad" : ""} />
        <Card label={t.sunElNow} value={s.sun_el[i].toFixed(2)} unit="°" cls="sun" onOpen={() => open(st.ephemeris)}
          sub={`${t.sun}: ${(s.sun_fraction[i] * 100).toFixed(0)} % · ${t.earth}: ${s.earth_el[i].toFixed(2)}°`} />
        <Card label={t.countdown} value={fmtH(m.hours_to_sunset ?? null, t)} onOpen={() => open(st.countdown)}
          sub={`${t.sunset} · ${t.earthset}: ${fmtH(m.hours_to_earthset ?? null, t)}`} />
        <Card label={t.minSoc} value={(e.min_soc_frac * 100).toFixed(0)} unit="%" onOpen={() => open(st.energy_balance)}
          sub={`${t.deficit}: ${e.hours_in_deficit.toFixed(0)} h`} cls={e.min_soc_frac <= 0 ? "bad" : ""} />
        <Card label={t.energy} value={(e.generated_wh / 1000).toFixed(1)} unit="kWh" onOpen={() => open(st.panel_power)}
          sub={`${t.consumed}: ${(e.consumed_wh / 1000).toFixed(1)} kWh`} />
      </div>
    </div>
  );
}
