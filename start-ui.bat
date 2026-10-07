@echo off
cd /d "%~dp0"
echo Starting Web QA Studio... (close this window to stop it)
node ui\server.js
pause
