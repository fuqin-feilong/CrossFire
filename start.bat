@echo off
setlocal
title FIRE ARENA
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node.js 20+ first.
  pause
  exit /b 1
)

set "CHECK_PORT=%PORT%"
if not defined CHECK_PORT set "CHECK_PORT=3000"
netstat -ano | findstr ":%CHECK_PORT%" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo [ERROR] Port %CHECK_PORT% is already in use.
  echo Run stop.bat first, or change PORT before starting.
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" (
  echo Installing dependencies, please wait...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Starting FIRE ARENA on http://localhost:%CHECK_PORT%
node server/index.js

echo.
echo Server stopped.
pause
