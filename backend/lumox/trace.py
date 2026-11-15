"""Calculation trace: an ordered list of steps, each with formula, inputs,
result, assumptions and dependencies. Steps are emitted to listeners as they
are recorded, so the API can stream them over a WebSocket.

Arrays are summarised for transport (length, min, max, head); the full array
stays available on the Step object for export.
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

import numpy as np

Listener = Callable[[dict], None]


def _jsonable(v: Any, full: bool = False) -> Any:
    if isinstance(v, np.ndarray):
        a = np.asarray(v, dtype=np.float64).ravel() if v.dtype.kind in "fiub" else v.ravel()
        if full:
            return a.tolist()
        if a.dtype.kind in "fiub" and a.size:
            fin = a[np.isfinite(a.astype(np.float64))]
            return {
                "array": True, "shape": list(v.shape), "n": int(a.size),
                "min": float(fin.min()) if fin.size else None,
                "max": float(fin.max()) if fin.size else None,
                "head": a[:8].tolist(),
            }
        return {"array": True, "shape": list(v.shape), "n": int(a.size), "head": a[:8].tolist()}
    if isinstance(v, (np.floating, np.integer)):
        return v.item()
    if isinstance(v, (np.datetime64,)):
        return str(v)
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: _jsonable(x, full) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_jsonable(x, full) for x in v]
    return v


@dataclass
class Step:
    id: str
    name: str
    formula: str                       # LaTeX
    inputs: list[dict]                 # {name, value, unit, source}
    result: dict                       # {value, unit}
    assumptions: list[str] = field(default_factory=list)
    depends_on: list[str] = field(default_factory=list)
    uncertainty: str | None = None
    description: str = ""
    index: int = 0

    def to_dict(self, full: bool = False) -> dict:
        return {
            "index": self.index, "id": self.id, "name": self.name, "formula": self.formula,
            "description": self.description,
            "inputs": [_jsonable(i, full) for i in self.inputs],
            "result": _jsonable(self.result, full),
            "assumptions": list(self.assumptions), "depends_on": list(self.depends_on),
            "uncertainty": self.uncertainty,
        }


class Trace:
    """Ordered, thread-safe collection of steps with live listeners."""

    def __init__(self, label: str = "", trace_id: str | None = None):
        self.id = trace_id or uuid.uuid4().hex[:12]
        self.label = label
        self.created = datetime.now(timezone.utc)
        self.steps: list[Step] = []
        self._by_id: dict[str, Step] = {}
        self._listeners: list[Listener] = []
        self._lock = threading.Lock()

    # -- listeners ---------------------------------------------------------
    def subscribe(self, cb: Listener) -> Callable[[], None]:
        with self._lock:
            self._listeners.append(cb)
        def off():
            with self._lock:
                if cb in self._listeners:
                    self._listeners.remove(cb)
        return off

    # -- recording ---------------------------------------------------------
    def add(self, id: str, name: str, formula: str, inputs: list[dict], result: dict,
            assumptions: list[str] | None = None, depends_on: list[str] | None = None,
            uncertainty: str | None = None, description: str = "") -> Step:
        with self._lock:
            if id in self._by_id:          # make ids unique per trace
                k = 2
                while f"{id}#{k}" in self._by_id:
                    k += 1
                id = f"{id}#{k}"
            step = Step(id, name, formula, inputs, result, list(assumptions or []),
                        list(depends_on or []), uncertainty, description, len(self.steps))
            self.steps.append(step)
            self._by_id[id] = step
            listeners = list(self._listeners)
        payload = {"type": "step", "trace_id": self.id, "step": step.to_dict()}
        for cb in listeners:
            try:
                cb(payload)
            except Exception:  # a broken listener must not break the calculation
                pass
        return step

    def note(self, id: str, name: str, text: str, depends_on: list[str] | None = None) -> Step:
        """A non-numeric step: a declared assumption, a missing-data notice, a decision."""
        return self.add(id, name, "", [], {"value": text, "unit": ""}, [], depends_on)

    def get(self, step_id: str) -> Step | None:
        return self._by_id.get(step_id)

    # -- export ------------------------------------------------------------
    def to_dict(self, full: bool = False) -> dict:
        return {
            "id": self.id, "label": self.label, "created": self.created.isoformat(),
            "n_steps": len(self.steps), "steps": [s.to_dict(full) for s in self.steps],
        }

    def to_csv(self) -> str:
        import csv
        import io
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["index", "id", "name", "formula", "inputs", "result_value", "result_unit",
                    "assumptions", "depends_on", "uncertainty"])
        for s in self.steps:
            ins = "; ".join(f"{i.get('name')}={_scalar(i.get('value'))} {i.get('unit','')} [{i.get('source','')}]"
                            for i in s.inputs)
            w.writerow([s.index, s.id, s.name, s.formula, ins, _scalar(s.result.get("value")),
                        s.result.get("unit", ""), " | ".join(s.assumptions),
                        ",".join(s.depends_on), s.uncertainty or ""])
        return buf.getvalue()


def _scalar(v: Any) -> Any:
    if isinstance(v, np.ndarray):
        a = v.ravel()
        return f"array[{a.size}] {a[:4].tolist()}..."
    if isinstance(v, (np.floating, np.integer)):
        return v.item()
    return v


class TraceStore:
    """In-memory store of traces (bounded)."""

    def __init__(self, limit: int = 200):
        self.limit = limit
        self._traces: dict[str, Trace] = {}
        self._order: list[str] = []
        self._lock = threading.Lock()

    def put(self, t: Trace) -> None:
        with self._lock:
            self._traces[t.id] = t
            self._order.append(t.id)
            while len(self._order) > self.limit:
                old = self._order.pop(0)
                self._traces.pop(old, None)

    def get(self, trace_id: str) -> Trace | None:
        return self._traces.get(trace_id)


STORE = TraceStore()
