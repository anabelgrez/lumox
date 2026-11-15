@echo off
rem Precomputes the preset scenarios into frontend/public/scenarios/ (demo fallback).
"%~dp0.venv\Scripts\python.exe" -m lumox.export
