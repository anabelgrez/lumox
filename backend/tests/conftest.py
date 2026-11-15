import pytest


def pytest_configure(config):
    config.addinivalue_line("markers", "network: needs internet access (JPL Horizons)")
