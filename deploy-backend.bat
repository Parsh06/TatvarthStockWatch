@echo off
setlocal enabledelayedexpansion

:: =======================================================
::       StockWatch Backend-Only Deployment Script
:: =======================================================

set MSG=%~1
if "%MSG%"=="" (
    set /p MSG="Enter commit message for backend deploy: "
)

if "%MSG%"=="" (
    echo.
    echo Error: Commit message cannot be empty.
    exit /b 1
)

echo.
echo =======================================================
echo  Deploying Backend to Render & GitHub
echo =======================================================
echo [1/3] Staging files...
git add .

echo [2/3] Committing changes...
git commit -m "%MSG%"

echo [3/3] Pushing to Git repository (Branch: main)...
git push

if %ERRORLEVEL% equ 0 (
    set RENDER_HOOK=
    if exist "%~dp0.render_hook" (
        set /p RENDER_HOOK=<"%~dp0.render_hook"
    )
    if defined RENDER_DEPLOY_HOOK_URL (
        set RENDER_HOOK=!RENDER_DEPLOY_HOOK_URL!
    )
    
    if defined RENDER_HOOK (
        echo.
        echo [Render Hook] Triggering instant Render build...
        curl -s -S -X POST "!RENDER_HOOK!" >nul 2>&1
        echo [Render Hook] Instant build triggered on Render successfully!
    ) else (
        echo.
        echo [Render] Commits pushed to GitHub main.
        echo [Render] TIP: If Auto-Deploy is OFF in Render dashboard, turn it ON in Settings
        echo          or save your Deploy Hook URL into a '.render_hook' file for instant triggers!
    )
    echo.
    echo =======================================================
    echo  SUCCESS: Code pushed to GitHub main.
    echo  Backend URL: https://tatvarthstockwatch.onrender.com
    echo =======================================================
) else (
    echo.
    echo ERROR: Git push failed.
    exit /b 1
)

