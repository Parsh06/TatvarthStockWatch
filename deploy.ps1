# StockWatch Master Deployment Script for PowerShell
param (
    [string]$Target,
    [string]$Msg
)

$choice = $Target

if (-not $choice) {
    Write-Host "`n=======================================================" -ForegroundColor Cyan
    Write-Host "             StockWatch Deployment Manager              " -ForegroundColor Cyan
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host " [1] Both (Backend to Vercel + Frontend to Firebase) [Default]"
    Write-Host " [2] Backend Only (Git Push to Vercel Serverless)"
    Write-Host " [3] Frontend Only (Vite Build + Firebase Hosting)"
    Write-Host "=======================================================" -ForegroundColor Cyan
    $userChoice = Read-Host -Prompt "Select target [1/2/3] (Default: 1)"
    if (-not $userChoice) { $userChoice = "1" }
    $choice = $userChoice
}

if ($choice -eq "backend" -or $choice -eq "-b") { $choice = "2" }
if ($choice -eq "frontend" -or $choice -eq "-f") { $choice = "3" }
if ($choice -eq "all" -or $choice -eq "-a") { $choice = "1" }

if (-not $Msg) {
    $Msg = Read-Host -Prompt "`nEnter commit message"
}

if (-not $Msg) {
    Write-Host "`nError: Commit message cannot be empty." -ForegroundColor Red
    exit 1
}

$projectRoot = $PSScriptRoot

if ($choice -eq "1") {
    Write-Host "`n[1/4] Staging files..." -ForegroundColor Cyan
    git add .

    Write-Host "[2/4] Committing changes..." -ForegroundColor Cyan
    git commit -m "$Msg"

    Write-Host "[3/4] Pushing to Git repository (Triggers Vercel Backend)..." -ForegroundColor Cyan
    git push

    Write-Host "[4/4] Building frontend and deploying to Firebase Hosting..." -ForegroundColor Cyan
    Set-Location "$projectRoot\frontend"
    npm run build

    if ($LASTEXITCODE -eq 0) {
        npx firebase deploy --only hosting
        Write-Host "`n=======================================================" -ForegroundColor Green
        Write-Host " SUCCESS: Backend deployed to Vercel" -ForegroundColor Green
        Write-Host " SUCCESS: Frontend deployed to https://tatvarthstockwatch.web.app" -ForegroundColor Green
        Write-Host "=======================================================" -ForegroundColor Green
    } else {
        Write-Host "`nERROR: Frontend build failed. Aborting deployment." -ForegroundColor Red
    }
    Set-Location $projectRoot
} elseif ($choice -eq "2") {
    Write-Host "`n=======================================================" -ForegroundColor Cyan
    Write-Host "  Deploying Backend Only (Vercel Serverless)" -ForegroundColor Cyan
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "[1/3] Staging files..." -ForegroundColor Cyan
    git add .

    Write-Host "[2/3] Committing changes..." -ForegroundColor Cyan
    git commit -m "$Msg"

    Write-Host "[3/3] Pushing to Git repository (Triggers Vercel Deploy)..." -ForegroundColor Cyan
    git push

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n=======================================================" -ForegroundColor Green
        Write-Host " SUCCESS: Backend deployed to https://tatvarth-stock-watch.vercel.app" -ForegroundColor Green
        Write-Host "=======================================================" -ForegroundColor Green
    }
} elseif ($choice -eq "3") {
    Write-Host "`n=======================================================" -ForegroundColor Cyan
    Write-Host "  Deploying Frontend Only (Firebase Hosting)" -ForegroundColor Cyan
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "[1/4] Staging files..." -ForegroundColor Cyan
    git add .

    Write-Host "[2/4] Committing changes..." -ForegroundColor Cyan
    git commit -m "$Msg"

    Write-Host "[3/4] Pushing to Git repository..." -ForegroundColor Cyan
    git push

    Write-Host "[4/4] Building frontend and deploying to Firebase Hosting..." -ForegroundColor Cyan
    Set-Location "$projectRoot\frontend"
    npm run build

    if ($LASTEXITCODE -eq 0) {
        npx firebase deploy --only hosting
        Write-Host "`n=======================================================" -ForegroundColor Green
        Write-Host " SUCCESS: Frontend deployed to https://tatvarthstockwatch.web.app" -ForegroundColor Green
        Write-Host "=======================================================" -ForegroundColor Green
    } else {
        Write-Host "`nERROR: Frontend build failed. Aborting deployment." -ForegroundColor Red
    }
    Set-Location $projectRoot
}
