@echo off
cd /d "%~dp0\.."
node "%~dp0..\node_modules\tsx\dist\cli.mjs" scripts\backup.ts
exit /b %ERRORLEVEL%
