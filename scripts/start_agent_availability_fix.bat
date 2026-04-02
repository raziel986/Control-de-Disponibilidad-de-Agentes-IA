@echo off
setlocal
REM Root dir is the repository root (one level up from scripts)
set SCRIPT_DIR=%~dp0
set ROOT_DIR=%SCRIPT_DIR%..\

REM Paths
set VENV_ACT=%ROOT_DIR%venv\Scripts\activate.bat
set PYTHON=%ROOT_DIR%venv\Scripts\python.exe
set SERVER=%ROOT_DIR%backend\server.py

echo Activating virtual environment...
if exist "%VENV_ACT%" (
  call "%VENV_ACT%"
) else (
  echo Venv activate script not found: %VENV_ACT%
  goto :eof
)

echo Starting server...
start "Agent Availability" "%PYTHON%" "%SERVER%"

echo Opening browser...
start "" http://localhost:5000
exit /b
