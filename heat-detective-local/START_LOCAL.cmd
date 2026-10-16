@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_LOCAL.ps1"
if errorlevel 1 pause
