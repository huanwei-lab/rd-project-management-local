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

echo ==========================================
echo RD Project Management Local Server
echo ==========================================
echo Starting server on 0.0.0.0:3000 ...
echo Local:  http://127.0.0.1:3000
echo LAN:    http://Your-IP:3000
echo Press Ctrl+C to stop server.
echo ==========================================
echo.

set HOST=0.0.0.0
set PORT=3000
node server\local-server.mjs

echo.
echo Server stopped.
pause
