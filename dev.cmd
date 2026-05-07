@echo off
rem ============================================================================
rem dev.cmd  -  Windows-side universal launcher (ASCII only, codepage-safe)
rem
rem Why this file exists:
rem   When a Windows terminal sits at a UNC path like \\wsl.localhost\<distro>\..,
rem   cmd.exe refuses UNC as cwd, falls back to C:\Windows, and `npm run dev`
rem   then fails with "Missing script: dev". This .cmd file does NOT depend on
rem   cwd: it derives the project's Linux path from %~dp0 directly and forwards
rem   the launch into WSL via wsl.exe.
rem
rem Usage:
rem   .\dev.cmd                                   default port 3001
rem   set DEV_PORT=4000 ^&^& .\dev.cmd            custom port
rem   set WSL_DISTRO=Ubuntu-24.04 ^&^& .\dev.cmd  custom distro
rem
rem ASCII only: cmd.exe under CP950 / CP932 / CP936 mis-parses non-ASCII bytes
rem inside rem lines, which used to break this script.
rem ============================================================================
setlocal EnableDelayedExpansion

if "%WSL_DISTRO%"=="" set "WSL_DISTRO=Ubuntu-24.04"
if "%DEV_PORT%"==""   set "DEV_PORT=3001"

set "PROJ_WIN=%~dp0"

rem ---- 1) Strip trailing backslash (pushd/cd-friendly) ----
if "!PROJ_WIN:~-1!"=="\" set "PROJ_WIN=!PROJ_WIN:~0,-1!"

rem ---- 2) Try to derive Linux path from a \\wsl.localhost\<distro>\... or
rem        \\wsl$\<distro>\... prefix. Substring substitution is case-sensitive,
rem        so we test both forms verbatim.
set "LINUX_DIR="
set "TMP=!PROJ_WIN:\\wsl.localhost\%WSL_DISTRO%\=!"
if not "!TMP!"=="!PROJ_WIN!" (
  set "LINUX_DIR=/!TMP:\=/!"
)
if not defined LINUX_DIR (
  set "TMP=!PROJ_WIN:\\wsl$\%WSL_DISTRO%\=!"
  if not "!TMP!"=="!PROJ_WIN!" (
    set "LINUX_DIR=/!TMP:\=/!"
  )
)

if not defined LINUX_DIR (
  echo [dev.cmd] Could not derive a WSL Linux path from "%~dp0"
  echo [dev.cmd] Expected the project to live under \\wsl.localhost\%WSL_DISTRO%\... or \\wsl$\%WSL_DISTRO%\...
  echo [dev.cmd] Override the distro name via:  set WSL_DISTRO=^<your-distro^>
  exit /b 1
)

rem Strip trailing slash (defensive)
if "!LINUX_DIR:~-1!"=="/" set "LINUX_DIR=!LINUX_DIR:~0,-1!"

echo [dev.cmd] WSL distro    = %WSL_DISTRO%
echo [dev.cmd] Linux project = !LINUX_DIR!
echo [dev.cmd] DEV_PORT      = %DEV_PORT%

wsl.exe -d %WSL_DISTRO% --cd "!LINUX_DIR!" -- bash -lc "DEV_PORT='%DEV_PORT%' bash scripts/dev-wsl.sh"
set "RC=%ERRORLEVEL%"

endlocal & exit /b %RC%
