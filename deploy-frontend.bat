@echo off
setlocal enabledelayedexpansion

:: =======================================================
::       StockWatch Frontend-Only Deployment Script
:: =======================================================

set MSG=%~1
if "%MSG%"=="" (
    set /p MSG="Enter commit message for frontend deploy: "
)

if "%MSG%"=="" (
    echo.
    echo Error: Commit message cannot be empty.
    exit /b 1
)

echo.
echo =======================================================
echo  Deploying Frontend to Firebase Hosting
echo =======================================================
echo [1/4] Staging files...
git add .

echo [2/4] Committing changes...
git commit -m "%MSG%"

echo [3/4] Pushing to Git repository...
git push

echo [4/4] Building frontend production bundle and deploying...
cd /d "%~dp0frontend"
call npm run build

if %ERRORLEVEL% equ 0 (
    call npx firebase deploy --only hosting
    echo.
    echo =======================================================
    echo  SUCCESS: Frontend deployed to https://tatvarthstockwatch.web.app
    echo =======================================================
) else (
    echo.
    echo ERROR: Frontend build failed. Aborting Firebase deployment.
    exit /b 1
)

cd /d "%~dp0"
