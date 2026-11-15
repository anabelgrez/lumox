import numpy as np
import pytest

from lumox.horizon import Horizon, elevation_angle, flat_horizon
from lumox.visibility import angular_radius, disc_fraction, segment_fraction
from lumox.constants import R_MOON, R_SUN, AU


def flat():
    return flat_horizon(0.0, 2.0)


@pytest.mark.parametrize("x, expected", [(-1.0, 0.0), (0.0, 0.5), (1.0, 1.0)])
def test_segment_limits(x, expected):
    assert segment_fraction(x * 0.27, 0.0, 0.27) == pytest.approx(expected, abs=1e-12)


def test_segment_symmetry():
    f1 = segment_fraction(0.1, 0.0, 0.27)
    f2 = segment_fraction(-0.1, 0.0, 0.27)
    assert f1 + f2 == pytest.approx(1.0, abs=1e-12)


@pytest.mark.parametrize("el, expected", [(1.0, 1.0), (0.0, 0.5), (-1.0, 0.0)])
def test_disc_fraction_limits_flat(el, expected):
    f = disc_fraction(np.array([90.0]), np.array([el]), np.array([0.27]), flat())
    assert f[0] == pytest.approx(expected, abs=2e-3)


def test_numerical_matches_segment_on_flat_horizon():
    els = np.linspace(-0.3, 0.3, 61)
    rho = np.full_like(els, 0.267)
    num = disc_fraction(np.full_like(els, 45.0), els, rho, flat())
    ana = segment_fraction(els, 0.0, rho)
    assert np.max(np.abs(num - ana)) < 5e-3


def test_angular_radius_sun_at_1au():
    rho = angular_radius(R_SUN.value, AU.value)
    assert rho == pytest.approx(0.2665, abs=1e-3)   # ~16.0 arcmin


def test_horizon_curvature_drop():
    # Flat terrain at the observer's own height must appear BELOW the horizontal with distance.
    d = np.array([1000.0, 10_000.0, 100_000.0])
    th = elevation_angle(np.zeros(3), d, 0.0)
    assert np.all(th < 0)
    # Half-angle of the arc: theta = -d/(2R) to first order
    assert th[0] == pytest.approx(-np.degrees(d[0] / (2 * R_MOON.value)), rel=1e-3)


def test_horizon_exact_vs_small_angle():
    d = np.array([50_000.0])
    h = 300.0
    exact = elevation_angle(np.array([h]), d, 0.0)[0]
    approx = np.degrees(np.arctan(h / d[0] - d[0] / (2 * R_MOON.value)))
    assert abs(exact - approx) < 1e-3  # agree to a millidegree at 50 km


def test_horizon_interpolation_periodic():
    az = np.arange(360.0)
    el = np.zeros(360); el[0] = 2.0
    h = Horizon(az, el, np.zeros(360), "test", None, 0.0, 0.0)
    assert h.at(359.5) == pytest.approx(1.0)
    assert h.at(0.5) == pytest.approx(1.0)
