"""Time grid utilities (UTC, numpy datetime64[s])."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np


def parse_utc(s: str | datetime) -> datetime:
    if isinstance(s, datetime):
        return s if s.tzinfo else s.replace(tzinfo=timezone.utc)
    s = s.strip().replace("Z", "+00:00")
    d = datetime.fromisoformat(s)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def grid(start: datetime, hours: float, step_h: float = 1.0) -> np.ndarray:
    """Inclusive hourly grid from `start` spanning `hours`, as datetime64[s]."""
    n = int(round(hours / step_h)) + 1
    t0 = np.datetime64(start.astimezone(timezone.utc).replace(tzinfo=None), "s")
    return t0 + (np.arange(n) * step_h * 3600).astype("timedelta64[s]")


def to_iso(t: np.datetime64) -> str:
    return str(np.datetime64(t, "s")) + "Z"


def iso_list(ts: np.ndarray) -> list[str]:
    return [to_iso(t) for t in ts]


def add_days(d: datetime, days: float) -> datetime:
    return d + timedelta(days=days)
