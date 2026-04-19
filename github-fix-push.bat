@echo off
title GitHub Fix Push
color 0A
cd /d "%~dp0"

set GIT=git
git --version >nul 2>&1
if errorlevel 1 set GIT="C:\Program Files\Git\bin\git.exe"

echo Working in: %CD%
echo.

:: Set identity if missing
for /f "delims=" %%i in ('%GIT% config user.email 2^>^&1') do set GITEMAIL=%%i
if "%GITEMAIL%"=="" (
    set /p GITNAME="Git name: "
    set /p GITEMAIL="Git email: "
    %GIT% config --global user.name "%GITNAME%"
    %GIT% config --global user.email "%GITEMAIL%"
)

:: Remove ignored files from index
%GIT% rm --cached -r .claude >nul 2>&1
%GIT% rm --cached CLAUDE.md >nul 2>&1
for /d %%D in ("Unit_*_files") do %GIT% rm --cached -r "%%D" >nul 2>&1
for %%F in ("Unit_*.html") do %GIT% rm --cached "%%F" >nul 2>&1

:: Stage everything
%GIT% add .
echo.
echo --- Files staged ---
%GIT% status --short
echo --------------------
echo.

:: Force a commit on main
%GIT% checkout -b main >nul 2>&1
%GIT% commit -m "Initial release: v4.4.0"
echo.

:: Confirm branch exists
echo Current branch:
%GIT% branch
echo.

:: Push
%GIT% remote remove origin >nul 2>&1
%GIT% remote add origin "https://github.com/Zetanegative1/Monash-Moodle-Downloader.git"
echo Pushing to GitHub...
%GIT% push -u origin main

if errorlevel 1 (
    echo.
    echo Push failed. Use Personal Access Token as password.
    echo Generate: GitHub - Settings - Developer settings - Personal access tokens - Generate new classic - check repo
) else (
    echo.
    echo SUCCESS: https://github.com/Zetanegative1/Monash-Moodle-Downloader
)

echo.
pause
