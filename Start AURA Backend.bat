@echo off
cd /d "%~dp0backend"
if errorlevel 1 (
  echo Could not open the AURA backend folder.
  pause
  exit /b 1
)
npm run dev
echo.
echo The AURA backend has stopped. Leave this window open while using AURA.
pause
