@echo off
setlocal enabledelayedexpansion

:: StockWatch One-Click Deploy Script for Windows CMD / Terminal

set MSG=%~1
if "%MSG%"=="" (
    set /p MSG="Enter commit message: "
)

if "%MSG%"=="" (
    echo.
    echo Error: Commit message cannot be empty.
    exit /b 1
)

echo.
echo [1/4] Staging files...
git add .

echo [2/4] Committing changes...
git commit -m "%MSG%"

echo [3/4] Pushing to Git...
git push

echo [4/4] Building frontend and deploying to Firebase Hosting...
cd /d "%~dp0frontend"
call npm run build

if %ERRORLEVEL% equ 0 (
    call npx firebase deploy --only hosting
    echo.
    echo =======================================================
    echo  SUCCESS: Deployed to https://tatvarthstockwatch.web.app
    echo =======================================================
) else (
    echo.
    echo ERROR: Frontend build failed. Aborting Firebase deployment.
)

cd /d "%~dp0"
