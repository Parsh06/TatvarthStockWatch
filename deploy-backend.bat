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
echo  Deploying Backend to Vercel Serverless
echo =======================================================
echo [1/3] Staging files...
git add .

echo [2/3] Committing changes...
git commit -m "%MSG%"

echo [3/3] Pushing to Git repository (Triggers Vercel Deploy)...
git push

if %ERRORLEVEL% equ 0 (
    echo.
    echo =======================================================
    echo  SUCCESS: Backend deployed to https://tatvarth-stock-watch.vercel.app
    echo =======================================================
) else (
    echo.
    echo ERROR: Git push failed.
    exit /b 1
)
