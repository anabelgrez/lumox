# Lumox v2 — Unix equivalents of dev.bat / test.bat / export.bat
PY := .venv/bin/python

.PHONY: setup dev backend frontend test test-offline export

setup:
	python3 -m venv .venv && $(PY) -m pip install -q --upgrade pip && $(PY) -m pip install -q -e "backend[dev]"
	cd frontend && npm install --no-audit --no-fund

backend:
	$(PY) -m uvicorn lumox.api:app --app-dir backend --port 8000 --reload --ws-ping-timeout 300

frontend:
	cd frontend && npm run dev

dev:
	$(MAKE) -j2 backend frontend

test:
	$(PY) -m pytest -q -s backend/tests

test-offline:
	$(PY) -m pytest -q -m "not network" backend/tests

export:
	$(PY) -m lumox.export
