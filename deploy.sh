#!/bin/bash

# Zenify Cloud Deployment Script
# This script deploys both backend and frontend to their respective cloud platforms

echo "🚀 Zenify Cloud Deployment"
echo "=========================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if git is available
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Error: git is not installed${NC}"
    exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status -s) ]]; then
    echo -e "${YELLOW}⚠️  You have uncommitted changes${NC}"
    echo "Files to be committed:"
    git status -s
    echo ""
    read -p "Do you want to commit these changes? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter commit message: " commit_msg
        git add .
        git commit -m "$commit_msg"
        echo -e "${GREEN}✅ Changes committed${NC}"
    else
        echo -e "${YELLOW}⚠️  Deploying without committing changes${NC}"
    fi
fi

echo ""
echo "📦 Pushing to Git..."
git push

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Code pushed to repository${NC}"
    echo ""
    echo "📡 Deployment Status:"
    echo ""
    echo "🔧 Backend (Railway):"
    echo "   URL: https://zenify-production-7f21.up.railway.app"
    echo "   Status: Deploying... (check Railway dashboard)"
    echo ""
    echo "🌐 Frontend (Vercel):"
    echo "   URL: https://zenify.vercel.app"
    echo "   Status: Deploying... (check Vercel dashboard)"
    echo ""
    echo -e "${GREEN}✅ Deployment initiated!${NC}"
    echo ""
    echo "⏱️  Typical deployment times:"
    echo "   • Backend: ~2-3 minutes"
    echo "   • Frontend: ~1-2 minutes"
    echo ""
    echo "🔍 Check deployment status:"
    echo "   • Railway: https://railway.app/dashboard"
    echo "   • Vercel: https://vercel.com/dashboard"
    echo ""
    echo "🧪 After deployment completes, test your app:"
    echo "   1. Health Check: curl https://zenify-production-7f21.up.railway.app/health"
    echo "   2. Login: https://zenify.vercel.app/login"
    echo ""
else
    echo -e "${RED}❌ Failed to push code${NC}"
    echo "Please check your git configuration and try again."
    exit 1
fi

# Optional: Wait and test
echo ""
read -p "Do you want to wait and test the deployment? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "⏳ Waiting 120 seconds for deployment to complete..."
    sleep 120
    
    echo ""
    echo "🧪 Testing backend health..."
    health_status=$(curl -s -o /dev/null -w "%{http_code}" https://zenify-production-7f21.up.railway.app/health)
    
    if [ "$health_status" == "200" ]; then
        echo -e "${GREEN}✅ Backend is healthy!${NC}"
        echo ""
        echo "🎉 Deployment successful!"
        echo ""
        echo "Your app is now live at:"
        echo "   Frontend: https://zenify.vercel.app"
        echo "   Backend: https://zenify-production-7f21.up.railway.app"
        echo ""
    else
        echo -e "${YELLOW}⚠️  Backend health check returned: $health_status${NC}"
        echo "Check Railway logs for more details."
    fi
else
    echo ""
    echo "👍 Deployment initiated. Check your dashboards for status."
fi

echo ""
echo "📚 For troubleshooting, see: CLOUD_SETUP_GUIDE.md"
echo ""
