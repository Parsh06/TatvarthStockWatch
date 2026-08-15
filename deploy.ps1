# StockWatch One-Click Deploy Script for PowerShell
param (
    [string]$msg
)

if (-not $msg) {
    $msg = Read-Host -Prompt "Enter commit message"
}

if (-not $msg) {
    Write-Host "`nError: Commit message cannot be empty." -ForegroundColor Red
    exit 1
}

Write-Host "`n[1/4] Staging files..." -ForegroundColor Cyan
git add .

Write-Host "[2/4] Committing changes..." -ForegroundColor Cyan
git commit -m "$msg"

Write-Host "[3/4] Pushing to Git repository..." -ForegroundColor Cyan
git push

Write-Host "[4/4] Building frontend and deploying to Firebase Hosting..." -ForegroundColor Cyan
$projectRoot = $PSScriptRoot
Set-Location "$projectRoot\frontend"

npm run build

if ($LASTEXITCODE -eq 0) {
    npx firebase deploy --only hosting
    Write-Host "`n=======================================================" -ForegroundColor Green
    Write-Host " SUCCESS: Deployed to https://tatvarthstockwatch.web.app" -ForegroundColor Green
    Write-Host "=======================================================" -ForegroundColor Green
} else {
    Write-Host "`nERROR: Frontend build failed. Aborting deployment." -ForegroundColor Red
}

Set-Location $projectRoot
