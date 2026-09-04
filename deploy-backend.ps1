# StockWatch Backend-Only Deployment Script for PowerShell
param (
    [string]$Msg
)

if (-not $Msg) {
    $Msg = Read-Host -Prompt "Enter commit message for backend deploy"
}

if (-not $Msg) {
    Write-Host "`nError: Commit message cannot be empty." -ForegroundColor Red
    exit 1
}

Write-Host "`n=======================================================" -ForegroundColor Cyan
Write-Host "  Deploying Backend to Vercel Serverless" -ForegroundColor Cyan
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
} else {
    Write-Host "`nERROR: Git push failed." -ForegroundColor Red
}
