@echo off
REM VTuber Song Queue - Stream Startup (Traditional Chinese)
REM Double-click this file to start the server every stream.
REM Runs start_zh.ps1 with the execution policy bypassed for this
REM process only -- no system settings are changed.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_zh.ps1"
if errorlevel 1 pause
