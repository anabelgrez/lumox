@echo off
rem Lumox v2 — one command starts backend (FastAPI :8000) and frontend (Vite :5173).
setlocal
set ROOT=%~dp0
if not exist "%ROOT%.venv\Scripts\python.exe" (
  echo [lumox] creating virtualenv and installing backend...
  py -3 -m venv "%ROOT%.venv" 2>nul || python -m venv "%ROOT%.venv"
  "%ROOT%.venv\Scripts\python.exe" -m pip install -q --upgrade pip
  "%ROOT%.venv\Scripts\python.exe" -m pip install -q -e "%ROOT%backend[dev]"
)
if not exist "%ROOT%frontend\node_modules" (
  echo [lumox] installing frontend dependencies...
  pushd "%ROOT%frontend" && call npm install --no-audit --no-fund && popd
)
start "lumox-backend" cmd /k ""%ROOT%.venv\Scripts\python.exe" -m uvicorn lumox.api:app --app-dir "%ROOT%backend" --port 8000 --reload"
start "lumox-frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"
echo [lumox] backend  http://localhost:8000/docs
echo [lumox] frontend http://localhost:5173
endlocal
