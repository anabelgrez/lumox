"""Static export for the demo fallback:  python -m lumox.export

Computes the preset scenarios and writes JSON (result + full trace) to
frontend/public/scenarios/. The front-end loads these when the backend does
not answer, and labels them as precomputed.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from .scenario import ScenarioSpec, run_scenario
from .sites import SITES
from .trace import STORE

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "scenarios"

PRESETS = [
    {"id": "example-delay", "label": "Example: 9-day delay at Shackleton", "site_id": "shackleton",
     "start": "2027-01-24T00:00:00Z", "duration_days": 14, "max_delay_days": 30},
]


def main(argv: list[str]) -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    jobs = list(PRESETS)
    for s in SITES:
        jobs.append({"id": f"site-{s.id}", "label": s.name, "site_id": s.id, "start": "2027-01-15T00:00:00Z",
                     "duration_days": 14, "max_delay_days": 30})
    index = []
    for j in jobs:
        spec = ScenarioSpec(site_id=j["site_id"], start=j["start"], duration_days=j["duration_days"],
                            max_delay_days=j["max_delay_days"], label=j["label"])
        print(f"computing {j['id']} ...", flush=True)
        try:
            r = run_scenario(spec)
        except Exception as e:
            print(f"  FAILED: {type(e).__name__}: {e}")
            continue
        t = STORE.get(r["trace_id"])
        payload = {"exported": datetime.now(timezone.utc).isoformat(), "precomputed": True, "preset": j,
                   "result": r, "trace": t.to_dict(full=False)}
        (OUT / f"{j['id']}.json").write_text(json.dumps(payload), encoding="utf-8")
        index.append({"id": j["id"], "label": j["label"], "site_id": j["site_id"], "start": j["start"],
                      "verdict": r["verdict"]["state"], "horizon": r["data"]["horizon_source"]})
        print(f"  ok -> {j['id']}.json  verdict={r['verdict']['state']}  horizon={r['data']['horizon_source']}")
    (OUT / "index.json").write_text(json.dumps({"exported": datetime.now(timezone.utc).isoformat(),
                                                "scenarios": index}), encoding="utf-8")
    print(f"wrote {len(index)} scenarios to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
