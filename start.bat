@echo off
setlocal
set "STUDYAI_LAUNCH_ROOT=%~dp0"
set "DOTENV_CONFIG_PATH=%STUDYAI_LAUNCH_ROOT%.env"
cd /d "%STUDYAI_LAUNCH_ROOT%"
if errorlevel 1 exit /b 1
npm run dev
endlocal
