@echo off
REM VTuber Song Queue - Stream Startup
REM Double-click this file to start the server every stream.
REM Runs start.ps1 with the execution policy bypassed for this
REM process only -- no system settings are changed.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 pause
