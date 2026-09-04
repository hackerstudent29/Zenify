# Zenify Cloud Deployment Script (PowerShell)
# This script deploys both backend and frontend to their respective cloud platforms

Write-Host "🚀 Zenify Cloud Deployment" -ForegroundColor Cyan
Write-Host "==========================" -ForegroundColor Cyan
Write-Host ""

# Check if git is available
try {
    git --version | Out-Null
} catch {
    Write-Host "❌ Error: git is not installed" -ForegroundColor Red
    exit 1
}

# Check for uncommitted changes
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "⚠️  You have uncommitted changes" -ForegroundColor Yellow
    Write-Host "Files to be committed:"
    git status -s
    Write-Host ""
    $commit = Read-Host "Do you want to commit these changes? (y/n)"
    if ($commit -eq 'y' -or $commit -eq 'Y') {
        $commitMsg = Read-Host "Enter commit message"
        git add .
        git commit -m $commitMsg
        Write-Host "✅ Changes committed" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Deploying without committing changes" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "📦 Pushing to Git..."
git push

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Code pushed to repository" -ForegroundColor Green
    Write-Host ""
    Write-Host "📡 Deployment Status:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🔧 Backend (Railway):"
    Write-Host "   URL: https://zenify-production-7f21.up.railway.app"
    Write-Host "   Status: Deploying... (check Railway dashboard)"
    Write-Host ""
    Write-Host "🌐 Frontend (Vercel):"
    Write-Host "   URL: https://listenzenify.vercel.app"
    Write-Host "   Status: Deploying... (check Vercel dashboard)"
    Write-Host ""
    Write-Host "✅ Deployment initiated!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⏱️  Typical deployment times:"
    Write-Host "   • Backend: ~2-3 minutes"
    Write-Host "   • Frontend: ~1-2 minutes"
    Write-Host ""
    Write-Host "🔍 Check deployment status:"
    Write-Host "   • Railway: https://railway.app/dashboard"
    Write-Host "   • Vercel: https://vercel.com/dashboard"
    Write-Host ""
    Write-Host "🧪 After deployment completes, test your app:"
    Write-Host "   1. Health Check: Invoke-WebRequest https://zenify-production-7f21.up.railway.app/health"
    Write-Host "   2. Login: https://listenzenify.vercel.app/login"
    Write-Host ""
} else {
    Write-Host "❌ Failed to push code" -ForegroundColor Red
    Write-Host "Please check your git configuration and try again."
    exit 1
}

# Optional: Wait and test
$test = Read-Host "Do you want to wait and test the deployment? (y/n)"
if ($test -eq 'y' -or $test -eq 'Y') {
    Write-Host ""
    Write-Host "⏳ Waiting 120 seconds for deployment to complete..."
    Start-Sleep -Seconds 120
    
    Write-Host ""
    Write-Host "🧪 Testing backend health..."
    try {
        $response = Invoke-WebRequest -Uri "https://zenify-production-7f21.up.railway.app/health" -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Backend is healthy!" -ForegroundColor Green
            Write-Host ""
            Write-Host "🎉 Deployment successful!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Your app is now live at:"
            Write-Host "   Frontend: https://listenzenify.vercel.app"
            Write-Host "   Backend: https://zenify-production-7f21.up.railway.app"
            Write-Host ""
        }
    } catch {
        Write-Host "⚠️  Backend health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Check Railway logs for more details."
    }
} else {
    Write-Host ""
    Write-Host "👍 Deployment initiated. Check your dashboards for status."
}

Write-Host ""
Write-Host "📚 For troubleshooting, see: CLOUD_SETUP_GUIDE.md"
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
