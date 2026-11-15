@echo off
rem Runs the backend test suite. Add "offline" to skip the JPL Horizons network tests.
setlocal
set ROOT=%~dp0
if "%1"=="offline" (
  "%ROOT%.venv\Scripts\python.exe" -m pytest -q -m "not network" "%ROOT%backend\tests"
) else (
  "%ROOT%.venv\Scripts\python.exe" -m pytest -q -s "%ROOT%backend\tests"
)
endlocal
