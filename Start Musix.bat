@echo off
cd /d "%~dp0"
title Musix Launcher
color 0D

echo.
echo  ^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<^<
echo.
echo        M   M  U   U  SSSS  III  X   X
echo        MM MM  U   U  S      I    X X
echo        M M M  U   U  SSSS   I     X
echo        M   M  U   U     S   I    X X
echo        M   M  UUUUU  SSSS  III  X   X
echo.
echo  ^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>^>
echo.

:: ── Check if port 5000 is already in use ──────────────────────────────────
netstat -ano | findstr ":5000 " | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo  [WARNING] Port 5000 is already in use!
    echo  Another instance of Musix may already be running.
    echo  Close it first or the server will fail to start.
    echo.
    pause
    exit /b 1
)

:: ── Get local IP ──────────────────────────────────────────────────────────
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
    set RAW_IP=%%a
    goto :gotip
)
:gotip
:: trim leading space
set LOCAL_IP=%RAW_IP: =%

echo  [INFO] Starting Musix server...
echo.
echo  +-------------------------------------------------+
echo  ^|  Desktop app : http://localhost:5000            ^|
echo  ^|  On WiFi     : http://%LOCAL_IP%:5000     ^|
echo  ^|                                                 ^|
echo  ^|  Share the WiFi address with your Android app  ^|
echo  +-------------------------------------------------+
echo.

:: ── Open browser after short delay ───────────────────────────────────────
timeout /t 2 /nobreak >nul
start "" "http://localhost:5000"

:: ── Start server (blocking) ───────────────────────────────────────────────
node backend/server.js

:: ── Server stopped — close browser tab (best effort) ─────────────────────
echo.
echo  [INFO] Server stopped. Closing...
timeout /t 1 /nobreak >nul

:: Close any browser window that has localhost:5000 in title (Chrome/Edge)
taskkill /fi "windowtitle eq localhost:5000*" /f >nul 2>&1

echo  Musix has shut down. You can close this window.
pause