#!/bin/bash

# StockWatch One-Click Deploy Script for Bash / Git Bash

MSG="$1"
if [ -z "$MSG" ]; then
    read -p "Enter commit message: " MSG
fi

if [ -z "$MSG" ]; then
    echo "Error: Commit message cannot be empty."
    exit 1
fi

echo ""
echo "[1/4] Staging files..."
git add .

echo "[2/4] Committing changes..."
git commit -m "$MSG"

echo "[3/4] Pushing to Git repository..."
git push

echo "[4/4] Building frontend and deploying to Firebase Hosting..."
ROOT_DIR="$(pwd)"
cd frontend || exit 1

npm run build

if [ $? -eq 0 ]; then
    npx firebase deploy --only hosting
    echo ""
    echo "======================================================="
    echo " SUCCESS: Deployed to https://tatvarthstockwatch.web.app"
    echo "======================================================="
else
    echo ""
    echo "ERROR: Frontend build failed. Aborting deployment."
fi

cd "$ROOT_DIR"
