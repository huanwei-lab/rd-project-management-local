@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  echo Please install Node.js 22+ and reopen this window.
  pause
  exit /b 1
)

echo Running LAN diagnostic...
node scripts\lan-diagnostic.mjs
echo.
pause
