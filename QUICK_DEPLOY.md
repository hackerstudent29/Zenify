# 🚀 Quick Deploy to Cloud (5 Minutes)

## Step 1: Backend (Railway)

1. Open Railway Dashboard: https://railway.app/
2. Go to your Zenify backend project
3. Click **Variables** tab
4. Update these:
   ```
   NODE_ENV → production
   FRONTEND_URL → https://zenify.vercel.app (or your domain)
   ```

5. Generate secure secrets (run in terminal):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Copy output and set as `JWT_SECRET`
   
   Run again:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Copy output and set as `REFRESH_TOKEN_SECRET`

6. Click **Deploy** → Railway will redeploy

## Step 2: Frontend (Vercel)

1. Open Vercel Dashboard: https://vercel.com/
2. Go to your Zenify frontend project
3. Click **Settings** → **Environment Variables**
4. Confirm this exists:
   ```
   NEXT_PUBLIC_API_URL = https://zenify-production-7f21.up.railway.app/api
   ```

5. Click **Deployments** → **Redeploy** (if needed)

## Step 3: Test Login

1. Open: https://zenify.vercel.app/login
2. Try logging in
3. If error, check browser console (F12)

## Done! 🎉

Your app is now 100% cloud-based and accessible 24/7.

### URLs:
- **Frontend**: https://zenify.vercel.app
- **Backend**: https://zenify-production-7f21.up.railway.app
- **API Health**: https://zenify-production-7f21.up.railway.app/health

---

## Optional: Setup Redis (Better Performance)

1. Go to: https://upstash.com/
2. Sign up → Create Redis database
3. Copy **Redis URL**
4. In Railway Variables, set:
   ```
   REDIS_URL = <your-upstash-redis-url>
   ```
5. Redeploy

This eliminates Redis connection errors and enables background job processing.

---

Need help? Check `CLOUD_SETUP_GUIDE.md` for detailed instructions.
