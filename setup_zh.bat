@echo off
REM VTuber Song Queue - Terminal Setup Wizard (Traditional Chinese)
REM Double-click this file to run the setup wizard.
REM Runs setup_zh.ps1 with the execution policy bypassed for this
REM process only -- no system settings are changed.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_zh.ps1"
if errorlevel 1 pause
