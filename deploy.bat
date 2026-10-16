@echo off
setlocal enabledelayedexpansion

:: =======================================================
::        StockWatch Master Deployment Script (CMD)
:: =======================================================

set TARGET=%~1
set MSG=%~2

:: Handle case where user passed only commit message as first argument (legacy behavior)
if "%TARGET%"=="backend" (
    set CHOICE=2
) else if "%TARGET%"=="-b" (
    set CHOICE=2
) else if "%TARGET%"=="frontend" (
    set CHOICE=3
) else if "%TARGET%"=="-f" (
    set CHOICE=3
) else if "%TARGET%"=="all" (
    set CHOICE=1
) else if "%TARGET%"=="-a" (
    set CHOICE=1
) else if not "%TARGET%"=="" (
    :: First arg is the commit message, default to FULL
    set MSG=%~1
    set CHOICE=1
) else (
    set CHOICE=
)

:: Show interactive menu if no target choice was predetermined
if "%CHOICE%"=="" (
    echo.
    echo =======================================================
    echo             StockWatch Deployment Manager              
    echo =======================================================
    echo  [1] Both - Backend to Render and Frontend to Firebase [Default]
    echo  [2] Backend Only - Git Push to Render Web Service
    echo  [3] Frontend Only - Vite Build + Firebase Hosting
    echo =======================================================
    set /p USER_CHOICE="Select target [1/2/3] (Default: 1): "
    if "!USER_CHOICE!"=="" set USER_CHOICE=1
    set CHOICE=!USER_CHOICE!
)

:: Prompt for commit message if needed
set NEED_MSG=0
if "%CHOICE%"=="1" set NEED_MSG=1
if "%CHOICE%"=="2" set NEED_MSG=1
if "%CHOICE%"=="3" set NEED_MSG=1

if "%NEED_MSG%"=="1" (
    if "%MSG%"=="" (
        echo.
        set /p MSG="Enter commit message: "
    )
    if "!MSG!"=="" (
        echo.
        echo Error: Commit message cannot be empty.
        exit /b 1
    )
)

:: Check for Render Deploy Hook (optional instant trigger)
set RENDER_HOOK=
if exist "%~dp0.render_hook" (
    set /p RENDER_HOOK=<"%~dp0.render_hook"
)
if defined RENDER_DEPLOY_HOOK_URL (
    set RENDER_HOOK=!RENDER_DEPLOY_HOOK_URL!
)

:: =======================================================
:: TARGET 1: FULL DEPLOY (Both Backend & Frontend)
:: =======================================================
if "%CHOICE%"=="1" (
    echo.
    echo [1/4] Staging all files...
    git add .
    
    echo [2/4] Committing changes...
    git commit -m "!MSG!"
    
    echo [3/4] Pushing to Git repository (Branch: main)...
    git push
    
    if defined RENDER_HOOK (
        echo [Render Hook] Triggering instant Render build...
        curl -s -S -X POST "!RENDER_HOOK!" >nul 2>&1
        echo [Render Hook] Instant build triggered on Render!
    ) else (
        echo [Render] Pushed to GitHub main.
        echo [Render] TIP: If Auto-Deploy is OFF in Render dashboard, turn it ON in Settings
        echo          or save your Deploy Hook URL into a '.render_hook' file for instant triggers!
    )
    
    echo [4/4] Building frontend and deploying to Firebase Hosting...
    cd /d "%~dp0frontend"
    call npm run build
    if !ERRORLEVEL! equ 0 (
        cd /d "%~dp0"
        call npx firebase deploy --only hosting --non-interactive
        echo.
        echo =======================================================
        echo  SUCCESS: Backend pushed to GitHub main (Render)
        echo  Backend URL:  https://tatvarthstockwatch.onrender.com
        echo  SUCCESS: Frontend deployed to Firebase Hosting
        echo  Frontend URL: https://tatvarthstockwatch.web.app
        echo =======================================================
    ) else (
        echo.
        echo ERROR: Frontend build failed. Aborting Firebase deployment.
    )
    cd /d "%~dp0"
    exit /b 0
)

:: =======================================================
:: TARGET 2: BACKEND ONLY (Render Web Service)
:: =======================================================
if "%CHOICE%"=="2" (
    echo.
    echo =======================================================
    echo  Deploying Backend Only - Render Web Service
    echo =======================================================
    echo [1/3] Staging backend files...
    git add .
    
    echo [2/3] Committing changes...
    git commit -m "!MSG!"
    
    echo [3/3] Pushing to GitHub (Branch: main)...
    git push
    
    if !ERRORLEVEL! equ 0 (
        if defined RENDER_HOOK (
            echo [Render Hook] Triggering instant Render build...
            curl -s -S -X POST "!RENDER_HOOK!" >nul 2>&1
            echo [Render Hook] Instant build triggered on Render!
        ) else (
            echo [Render] Pushed to GitHub main.
            echo [Render] TIP: If Auto-Deploy is OFF in Render dashboard, turn it ON in Settings
            echo          or save your Deploy Hook URL into a '.render_hook' file for instant triggers!
        )
        echo.
        echo =======================================================
        echo  SUCCESS: Backend pushed to GitHub main.
        echo  Backend URL: https://tatvarthstockwatch.onrender.com
        echo =======================================================
    ) else (
        echo.
        echo ERROR: Git push failed.
    )
    exit /b 0
)

:: =======================================================
:: TARGET 3: FRONTEND ONLY (Firebase Hosting)
:: =======================================================
if "%CHOICE%"=="3" (
    echo.
    echo =======================================================
    echo  Deploying Frontend Only - Firebase Hosting
    echo =======================================================
    
    :: Stage & commit frontend changes
    echo [1/3] Staging and committing changes...
    git add .
    git commit -m "!MSG!"
    git push
    
    echo [2/3] Building frontend production bundle...
    cd /d "%~dp0frontend"
    call npm run build
    
    if !ERRORLEVEL! equ 0 (
        cd /d "%~dp0"
        echo [3/3] Deploying to Firebase Hosting...
        call npx firebase deploy --only hosting --non-interactive
        echo.
        echo =======================================================
        echo  SUCCESS: Frontend deployed to https://tatvarthstockwatch.web.app
        echo =======================================================
    ) else (
        echo.
        echo ERROR: Frontend build failed. Aborting Firebase deployment.
    )
    cd /d "%~dp0"
    exit /b 0
)

echo.
echo Invalid choice selected. Exiting.
exit /b 1

