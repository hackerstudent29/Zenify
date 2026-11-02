# Installation Guide

Complete setup guide for running Zenify locally or in production.

---

## 🚀 Quick Start (Docker)

### Prerequisites
- Docker & Docker Compose installed ([Download](https://www.docker.com/products/docker-desktop))
- Git installed

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/hackerstudent29/Zenify.git
   cd Zenify
   ```

2. **Start the full stack**
   ```bash
   docker-compose up
   ```

3. **Access the app**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - PostgreSQL: localhost:5432 (user: zenify, pass: zenify_dev_password)

That's it! 🎉

---

## 🛠️ Manual Setup (For Development)

### Prerequisites
- Node.js 18+ ([Download](https://nodejs.org/))
- PostgreSQL 14+ ([Download](https://www.postgresql.org/download/))
- Git

### Step 1: Clone Repository

```bash
git clone https://github.com/hackerstudent29/Zenify.git
cd Zenify
```

### Step 2: Backend Setup

```bash
cd backend

# Copy environment file
cp .env.example .env

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push database schema
npx prisma db push

# (Optional) Seed database with sample data
npx prisma db seed

# Start backend development server
npm run dev
```

Backend will run at `http://localhost:3000`.

### Step 3: Frontend Setup

```bash
cd ../frontend

# Copy environment file
cp .env.example .env

# Install dependencies
npm install

# Start frontend development server
npm run dev
```

Frontend will run at `http://localhost:5173`.

---

## 🔧 Configuration

### Backend Environment Variables

Edit `backend/.env`:

```env
# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zenify

# JWT Secrets (Generate secure strings)
JWT_SECRET=your_secure_jwt_secret_here_min_32_chars
REFRESH_TOKEN_SECRET=your_secure_refresh_secret_here_min_32_chars

# Optional: External Services
DEEPGRAM_API_KEY=your_deepgram_key
YOUTUBE_API_KEY=your_youtube_key
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
```

### Frontend Environment Variables

Edit `frontend/.env`:

```env
VITE_API_URL=http://localhost:3000
VITE_APP_NAME=Zenify
VITE_APP_DESCRIPTION=Free, open-source music streaming
```

---

## 📦 Building for Production

### Frontend Build

```bash
cd frontend
npm run build
npm run preview  # Test production build locally
```

Output: `frontend/dist/` (ready to deploy to Vercel, Netlify, etc.)

### Backend Build

```bash
cd backend
npm run build
npm start  # Run production build
```

Or build Docker image:

```bash
docker build -t zenify-backend:latest .
docker run -p 3000:3000 zenify-backend:latest
```

---

## ☁️ Deployment

### Deploy Frontend (Vercel)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd frontend
vercel
```

Or connect GitHub repo to Vercel for automatic deployments.

### Deploy Backend (Railway/Render)

1. **Create account** at [Railway.app](https://railway.app) or [Render.com](https://render.com)
2. **Connect GitHub repository**
3. **Set environment variables** (same as `.env.example`)
4. **Deploy**

### Deploy with Docker

```bash
# Build image
docker build -t myregistry/zenify-backend:latest .

# Push to registry
docker push myregistry/zenify-backend:latest

# Deploy (varies by platform - AWS ECS, Google Cloud Run, etc.)
```

---

## 🐛 Troubleshooting Installation

### Backend Won't Start

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution**: PostgreSQL not running.
```bash
# Windows
pg_ctl -D "C:\Program Files\PostgreSQL\data" start

# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### Frontend Build Fails

**Error**: `ENOSPC: no space left on device`

**Solution**: Clear npm cache.
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### Database Migration Fails

**Error**: `ERROR: relation "users" does not exist`

**Solution**: Reset database.
```bash
cd backend
npx prisma db push --force-reset
npx prisma db seed  # Optional: load sample data
```

### Port Already in Use

**Error**: `Error: listen EADDRINUSE: address already in use :::5173`

**Solution**: Change port or kill process.
```bash
# Use different port
VITE_PORT=5174 npm run dev

# Or kill process using the port
# Windows (PowerShell):
$proc = Get-Process -Name node
Stop-Process -InputObject $proc -Force

# macOS/Linux:
lsof -i :5173 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### "Cannot find module" Errors

**Solution**: Reinstall dependencies.
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## 🧪 Verify Installation

### Test Backend API

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok"}
```

### Test Frontend

Open `http://localhost:5173` in browser. Should see Zenify home page.

### Test Database

```bash
# Using psql
psql -h localhost -U zenify -d zenify

# List tables
\dt
```

---

## 📚 Next Steps

1. **Read [DEVELOPER.md](DEVELOPER.md)** – API documentation & architecture
2. **Check [CONTRIBUTING.md](../CONTRIBUTING.md)** – How to contribute
3. **Join discussions** – [GitHub Discussions](https://github.com/hackerstudent29/Zenify/discussions)
4. **Report issues** – [GitHub Issues](https://github.com/hackerstudent29/Zenify/issues)

---

## 🆘 Need Help?

- **Documentation**: [README.md](../README.md), [DEVELOPER.md](DEVELOPER.md)
- **Troubleshooting**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Issues**: [GitHub Issues](https://github.com/hackerstudent29/Zenify/issues)
- **Email**: hackerstudent29@gmail.com

Happy listening! 🎵

