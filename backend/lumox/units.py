"""Unit registry (pint). One registry for the whole engine.

Use `Q(value, "unit")` to build quantities and `check(q, "unit")` to assert
dimensionality. Arrays stay float64 inside pint quantities.
"""

from __future__ import annotations

import numpy as np
import pint

ureg = pint.UnitRegistry(force_ndarray_like=False)
ureg.define("AU = 149597870700 * meter = astronomical_unit")
Q = ureg.Quantity


def check(q: pint.Quantity, unit: str) -> pint.Quantity:
    """Assert `q` is dimensionally compatible with `unit` and return it in that unit."""
    if not isinstance(q, pint.Quantity):
        raise TypeError(f"expected pint Quantity, got {type(q).__name__}")
    if not q.check(ureg.parse_units(unit)):
        raise pint.DimensionalityError(q.units, ureg.parse_units(unit))
    return q.to(unit)


def mag(q: pint.Quantity, unit: str) -> float | np.ndarray:
    """Magnitude of `q` in `unit`, as float64 (scalar or ndarray)."""
    m = check(q, unit).magnitude
    return np.asarray(m, dtype=np.float64) if np.ndim(m) else float(m)
