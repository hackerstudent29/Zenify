# ☁️ Zenify Cloud Configuration Guide

## Overview
This guide configures Zenify to use 100% cloud services - no localhost dependencies.

## ✅ Changes Applied

### 1. Frontend Configuration
**File**: `frontend/.env`

```env
# ✅ Changed from localhost to production Railway backend
NEXT_PUBLIC_API_URL="https://zenify-production-7f21.up.railway.app/api"
VITE_API_URL="https://zenify-production-7f21.up.railway.app/api"
```

### 2. Backend Configuration
**File**: `backend/.env`

```env
# ✅ Changed to production mode
NODE_ENV="production"

# ✅ Frontend URL (update to your Vercel domain)
FRONTEND_URL="https://listenzenify.vercel.app"

# ✅ Updated JWT secrets (IMPORTANT: Use your own secure keys)
JWT_SECRET="zenify-prod-jwt-secret-2026-secure-key-change-this"
REFRESH_TOKEN_SECRET="zenify-prod-refresh-token-secret-2026-change-this"

# ⚠️ Redis URL (see setup below)
REDIS_URL=""
```

## 🔧 Required Cloud Services Setup

### 1. ✅ Database (Already Configured)
- **Service**: Supabase PostgreSQL
- **Status**: ✅ Already connected
- **Connection**: AWS Asia Pacific (Mumbai)

### 2. ⚠️ Redis Cache (Needs Setup)

You have 3 options:

#### Option A: Upstash Redis (Recommended - FREE)
1. Go to: https://upstash.com/
2. Sign up with GitHub/Google
3. Create a new Redis database
4. Select region closest to your backend (Asia Pacific)
5. Copy the **Redis URL** (format: `redis://...upstash.io:6379`)
6. Update `backend/.env`:
   ```env
   REDIS_URL="redis://default:YOUR_PASSWORD@your-redis.upstash.io:6379"
   ```

#### Option B: Redis Cloud (FREE tier available)
1. Go to: https://redis.com/try-free/
2. Create account and new database
3. Copy connection URL
4. Update `backend/.env` with the URL

#### Option C: Railway Redis (Paid but simple)
1. In Railway dashboard, add Redis service
2. Connect to your backend
3. Copy `REDIS_URL` from Railway variables
4. Paste into `backend/.env`

#### Option D: No Redis (Fallback Mode) ✅ Current
- App already works without Redis
- Uses in-memory cache (resets on restart)
- Job queue runs inline (no background workers)
- **Good for**: Development, low traffic
- **Not ideal for**: Production with high traffic

### 3. ✅ File Storage (Already Configured)
- **Service**: Cloudinary (images/avatars)
- **Service**: Cloudflare R2 (audio files)
- **Status**: ✅ Already configured

### 4. ✅ Email Service (Already Configured)
- **Service**: Gmail SMTP + Brevo
- **Status**: ✅ Already configured

## 🌐 Deployment Checklist

### Frontend (Vercel)
1. **Update Environment Variables in Vercel Dashboard**:
   ```
   NEXT_PUBLIC_API_URL=https://zenify-production-7f21.up.railway.app/api
   ```

2. **Verify Domain**:
   - Check your Vercel domain (likely `listenzenify.vercel.app` or custom domain)
   - Update `FRONTEND_URL` in backend `.env` to match

3. **Redeploy**:
   ```bash
   cd frontend
   git add .
   git commit -m "Update to cloud configuration"
   git push
   # Vercel will auto-deploy
   ```

### Backend (Railway)
1. **Update Environment Variables in Railway Dashboard**:
   ```
   NODE_ENV=production
   FRONTEND_URL=https://listenzenify.vercel.app
   JWT_SECRET=<your-secure-secret-32-chars>
   REFRESH_TOKEN_SECRET=<your-secure-secret-32-chars>
   REDIS_URL=<upstash-redis-url-if-using>
   ```

2. **Important**: Generate secure JWT secrets:
   ```bash
   # In terminal, run:
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # Copy output as JWT_SECRET
   
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # Copy output as REFRESH_TOKEN_SECRET
   ```

3. **Redeploy**:
   ```bash
   cd backend
   git add .
   git commit -m "Update to production configuration"
   git push
   # Railway will auto-deploy
   ```

## 🔒 Security Checklist

- [ ] JWT secrets changed from default values
- [ ] `NODE_ENV` set to `production`
- [ ] Database credentials secured (not in git)
- [ ] CORS configured with actual frontend domain
- [ ] HTTPS enabled on all services
- [ ] Rate limiting enabled for auth endpoints (optional)

## 🎯 CORS Configuration

Your backend needs to allow your frontend domain. Check `backend/src/index.ts`:

```typescript
server.register(cors, {
    origin: (origin, cb) => {
        const allowedOrigins = [
            'https://listenzenify.vercel.app',
            'https://your-custom-domain.com',
            // Add all your frontend domains
        ];
        if (!origin || allowedOrigins.some(o => origin.includes(o))) {
            cb(null, true);
            return;
        }
        cb(null, false);
    },
    credentials: true,
});
```

## 📊 Verification Steps

### 1. Test Backend Health
```bash
curl https://zenify-production-7f21.up.railway.app/health
# Should return: {"status":"ok"}
```

### 2. Test Login API
```bash
curl -X POST https://zenify-production-7f21.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  -v
```

### 3. Test Frontend
- Open: https://listenzenify.vercel.app/login
- Try logging in
- Check browser console (F12) for errors
- Verify cookies are being set

## 🚨 Troubleshooting

### Issue: "CORS Error"
**Solution**: Update `allowedOrigins` in `backend/src/index.ts` to include your Vercel domain

### Issue: "401 Unauthorized" on Login
**Causes**:
1. User not verified in database
2. Wrong password
3. JWT secret mismatch

**Fix**:
```sql
-- Verify user exists and is verified
SELECT email, "isVerified" FROM "User" WHERE email = 'your-email@example.com';

-- If not verified:
UPDATE "User" SET "isVerified" = true WHERE email = 'your-email@example.com';
```

### Issue: "Network Error" / Can't reach backend
**Check**:
1. Railway backend is running: https://zenify-production-7f21.up.railway.app/health
2. Frontend `.env` has correct API URL
3. No firewall blocking requests

### Issue: Redis Connection Errors
**Solution**: 
- App works fine without Redis (fallback mode active)
- To eliminate errors, either:
  - Set up Upstash Redis (see above)
  - Or comment out Redis initialization in code

## 📝 Environment Variables Summary

### Backend (Railway Dashboard)
```env
NODE_ENV=production
DATABASE_URL=<supabase-url>
DIRECT_URL=<supabase-direct-url>
REDIS_URL=<upstash-redis-url-or-leave-empty>
JWT_SECRET=<32-char-random-string>
REFRESH_TOKEN_SECRET=<32-char-random-string>
FRONTEND_URL=https://listenzenify.vercel.app
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-secret>
CLOUDINARY_CLOUD_NAME=dzqcuxchc
CLOUDINARY_API_KEY=<your-key>
CLOUDINARY_API_SECRET=<your-secret>
R2_ACCESS_KEY_ID=<your-r2-key>
R2_SECRET_ACCESS_KEY=<your-r2-secret>
R2_ENDPOINT=<your-r2-endpoint>
R2_BUCKET_NAME=zenify-audio
R2_PUBLIC_DOMAIN=<your-r2-public-domain>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<your-email>
SMTP_PASS=<your-app-password>
```

### Frontend (Vercel Dashboard)
```env
NEXT_PUBLIC_API_URL=https://zenify-production-7f21.up.railway.app/api
NEXT_PUBLIC_ZENWALLET_PUBLIC_KEY=<your-zenwallet-key>
NEXT_PUBLIC_ZENWALLET_SCRIPT_URL=/zenwallet.js
```

## 🎉 You're All Set!

Once deployed:
1. Frontend: `https://listenzenify.vercel.app`
2. Backend: `https://zenify-production-7f21.up.railway.app`
3. Database: Supabase (cloud)
4. Storage: Cloudinary + Cloudflare R2 (cloud)
5. Cache: In-memory or Upstash Redis (optional)

Everything runs 24/7 in the cloud! ☁️

## Next Steps

1. **Set up Upstash Redis** (10 minutes) - Recommended for production
2. **Update JWT secrets** in Railway - Critical for security
3. **Test login flow** - Verify everything works
4. **Monitor logs** - Check Railway logs for any issues

---

**Updated**: September 4, 2026  
**Status**: ✅ Configured for cloud deployment
