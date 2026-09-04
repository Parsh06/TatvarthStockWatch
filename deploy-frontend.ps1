# StockWatch Frontend-Only Deployment Script for PowerShell
param (
    [string]$Msg
)

if (-not $Msg) {
    $Msg = Read-Host -Prompt "Enter commit message for frontend deploy"
}

if (-not $Msg) {
    Write-Host "`nError: Commit message cannot be empty." -ForegroundColor Red
    exit 1
}

$projectRoot = $PSScriptRoot

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "  Deploying Frontend to Firebase Hosting" -ForegroundColor Cyan
Write-Host "=======================================================" -ForegroundColor Cyan
Write-Host "[1/4] Staging files..." -ForegroundColor Cyan
git add .

Write-Host "[2/4] Committing changes..." -ForegroundColor Cyan
git commit -m "$Msg"

Write-Host "[3/4] Pushing to Git repository..." -ForegroundColor Cyan
git push

Write-Host "[4/4] Building frontend production bundle and deploying..." -ForegroundColor Cyan
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
