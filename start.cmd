@echo off
rem Double-click to start the app. Runs start.ps1 without changing the system execution policy.
set APP_LAUNCHED_FROM_CMD=1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
