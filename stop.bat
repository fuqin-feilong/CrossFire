@echo off
setlocal
echo Stopping FIRE ARENA (port 3000)...
set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  set FOUND=1
  taskkill /PID %%a /F >nul 2>nul
)
if "%FOUND%"=="1" (
  echo Server stopped.
) else (
  echo No server was listening on port 3000.
)
pause
