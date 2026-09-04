#!/bin/bash

# =======================================================
#       StockWatch Master Deployment Script (Bash)
# =======================================================

TARGET="$1"
MSG="$2"

if [ "$TARGET" = "backend" ] || [ "$TARGET" = "-b" ]; then
    CHOICE="2"
elif [ "$TARGET" = "frontend" ] || [ "$TARGET" = "-f" ]; then
    CHOICE="3"
elif [ "$TARGET" = "all" ] || [ "$TARGET" = "-a" ]; then
    CHOICE="1"
elif [ -n "$TARGET" ]; then
    MSG="$1"
    CHOICE="1"
fi

if [ -z "$CHOICE" ]; then
    echo ""
    echo "======================================================="
    echo "             StockWatch Deployment Manager              "
    echo "======================================================="
    echo " [1] Both (Backend to Vercel + Frontend to Firebase) [Default]"
    echo " [2] Backend Only (Git Push to Vercel Serverless)"
    echo " [3] Frontend Only (Vite Build + Firebase Hosting)"
    echo "======================================================="
    read -p "Select target [1/2/3] (Default: 1): " USER_CHOICE
    CHOICE="${USER_CHOICE:-1}"
fi

if [ -z "$MSG" ]; then
    echo ""
    read -p "Enter commit message: " MSG
fi

if [ -z "$MSG" ]; then
    echo "Error: Commit message cannot be empty."
    exit 1
fi

ROOT_DIR="$(pwd)"

if [ "$CHOICE" = "1" ]; then
    echo ""
    echo "[1/4] Staging all files..."
    git add .
    
    echo "[2/4] Committing changes..."
    git commit -m "$MSG"
    
    echo "[3/4] Pushing to Git repository (Triggers Vercel Backend)..."
    git push
    
    echo "[4/4] Building frontend and deploying to Firebase Hosting..."
    cd frontend || exit 1
    npm run build
    
    if [ $? -eq 0 ]; then
        npx firebase deploy --only hosting
        echo ""
        echo "======================================================="
        echo " SUCCESS: Backend deployed to Vercel"
        echo " SUCCESS: Frontend deployed to https://tatvarthstockwatch.web.app"
        echo "======================================================="
    else
        echo ""
        echo "ERROR: Frontend build failed. Aborting deployment."
    fi
    cd "$ROOT_DIR"
elif [ "$CHOICE" = "2" ]; then
    echo ""
    echo "======================================================="
    echo "  Deploying Backend Only (Vercel Serverless)"
    echo "======================================================="
    echo "[1/3] Staging backend files..."
    git add .
    
    echo "[2/3] Committing changes..."
    git commit -m "$MSG"
    
    echo "[3/3] Pushing to GitHub (Auto-deploys Vercel Backend)..."
    git push
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "======================================================="
        echo " SUCCESS: Backend deployed to https://tatvarth-stock-watch.vercel.app"
        echo "======================================================="
    fi
elif [ "$CHOICE" = "3" ]; then
    echo ""
    echo "======================================================="
    echo "  Deploying Frontend Only (Firebase Hosting)"
    echo "======================================================="
    echo "[1/4] Staging and committing changes..."
    git add .
    git commit -m "$MSG"
    git push
    
    echo "[2/4] Building frontend production bundle..."
    cd frontend || exit 1
    npm run build
    
    if [ $? -eq 0 ]; then
        echo "[3/4] Deploying to Firebase Hosting..."
        npx firebase deploy --only hosting
        echo ""
        echo "======================================================="
        echo " SUCCESS: Frontend deployed to https://tatvarthstockwatch.web.app"
        echo "======================================================="
    fi
    cd "$ROOT_DIR"
fi
