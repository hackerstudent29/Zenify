# Zenify Architecture Overview

This document provides a high-level overview of Zenify's system architecture. For detailed information, see the docs folder: [docs/](docs/)

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Layer                               │
├─────────────────────────────────────────────────────────────────┤
│  Web (React 19)          │  Mobile (Flutter)  │  PWA (Offline)   │
│  http://localhost:5173   │  Android APK        │  Install Button  │
└────────────────────┬─────────────────────────┬──────────────────┘
                     │                         │
                     └──────────┬──────────────┘
                                │
            ┌───────────────────┴───────────────────┐
            │                                       │
            ▼                                       ▼
┌─────────────────────────────────┐  ┌────────────────────────────┐
│   API Gateway / Router          │  │  Local Storage / IndexedDB  │
│   (Fastify 5.7)                 │  │  (Offline Cache)           │
│   http://localhost:3000         │  │                            │
├─────────────────────────────────┤  └────────────────────────────┘
│ • Authentication (JWT)          │
│ • Rate Limiting                 │
│ • CORS Handling                 │
│ • Request/Response Logging      │
└─────────────────────────────────┘
            │
    ┌───────┴───────┬───────────┬────────────┐
    │               │           │            │
    ▼               ▼           ▼            ▼
┌────────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐
│  Search    │ │  Audio  │ │ Playback │ │ Lyrics  │
│  Service   │ │ Streaming │ │ Manager  │ │ Service │
│ (Algolia)  │ │ (YouTube) │ │ (Queue)  │ │(LyrCLib)│
└────────────┘ └─────────┘ └──────────┘ └─────────┘
    │
    ▼
┌─────────────────────────────────┐
│   PostgreSQL Database           │
│   (Prisma ORM)                  │
├─────────────────────────────────┤
│ • Users & Auth                  │
│ • Playlists & Favorites         │
│ • Lyrics Cache                  │
│ • Artist Metadata               │
│ • Listening History (optional)  │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│   External Services             │
├─────────────────────────────────┤
│ • iTunes CDN (Audio Streams)    │
│ • YouTube (Fallback Audio)      │
│ • Cloudflare R2 (Storage)       │
│ • Cloudinary (Images)           │
│ • Deepgram (AI Lyrics Sync)     │
└─────────────────────────────────┘
```

---

## 📁 Directory Structure

```
Zenify/
├── backend/                    # Node.js + Fastify backend
│   ├── src/
│   │   ├── routes/            # API endpoints
│   │   ├── services/          # Business logic
│   │   ├── controllers/       # Route handlers
│   │   ├── middleware/        # Auth, logging, etc.
│   │   └── lib/               # Utilities, helpers
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   └── migrations/        # DB version control
│   ├── Dockerfile             # Docker image
│   └── package.json
│
├── frontend/                   # React 19 + Vite
│   ├── src/
│   │   ├── app/               # Next.js app routes
│   │   ├── components/        # UI components
│   │   │   ├── player/        # Player UI
│   │   │   ├── shared/        # Shared components
│   │   │   └── ui/            # Reusable UI elements
│   │   ├── lib/
│   │   │   ├── audio-engine.ts    # Web Audio API
│   │   │   ├── api.ts            # API client
│   │   │   └── utils.ts          # Helpers
│   │   ├── store/             # Zustand state management
│   │   ├── styles/            # Tailwind CSS
│   │   └── public/            # Static assets
│   ├── vite.config.ts         # Build config
│   └── package.json
│
├── docs/                       # Documentation
│   ├── backend_architecture.md
│   ├── frontend_architecture.md
│   ├── database_schema.md
│   └── deployment/
│
├── docker-compose.yml         # Full-stack local dev
├── CONTRIBUTING.md            # Contribution guidelines
├── README.md                  # Main documentation
└── LICENSE
```

---

## 🔄 Data Flow Examples

### 1️⃣ Search for a Song

```
User (Frontend)
    │
    ▼
Search Service (Zustand)
    │
    ├─→ Check local cache (IndexedDB)
    │
    ▼
Backend API /search
    │
    ├─→ Check Redis cache
    │
    ├─→ Query iTunes CDN / YouTube API
    │
    ├─→ Store in PostgreSQL cache
    │
    └─→ Return results to Frontend
    │
    ▼
Update UI with results
```

### 2️⃣ Play a Song

```
User clicks Play
    │
    ▼
Player Store (Zustand)
    │
    ├─→ Set current track
    │
    ▼
Audio Engine (Web Audio API)
    │
    ├─→ Create AudioContext
    │
    ├─→ Fetch audio stream
    │   ├─→ Try iTunes CDN (licensed)
    │   ├─→ Try YouTube CDN (fallback)
    │   └─→ Try local file
    │
    ├─→ Connect audio nodes (EQ, effects, etc.)
    │
    ├─→ Fetch synced lyrics
    │   └─→ Query lyrics service
    │
    ▼
Render visualizations
    │
    ▼
User hears music 🎵
```

### 3️⃣ Create a Playlist

```
User submits playlist
    │
    ▼
Frontend validates input
    │
    ▼
POST /api/playlists (JWT auth)
    │
    ▼
Backend validates token
    │
    ▼
Create playlist in PostgreSQL
    │
    ▼
Return playlist ID
    │
    ▼
Frontend updates local store
    │
    ▼
Persist to IndexedDB (offline)
```

---

## 🎛️ Technology Stack

### **Frontend**
- **React 19** – UI framework
- **Vite 6** – Build tool (ultra-fast)
- **Tailwind CSS 4** – Styling
- **Zustand** – State management (lightweight)
- **Framer Motion** – Animations
- **React Query** – Server state management
- **Web Audio API** – Audio processing (native, no plugins)
- **Lucide Icons** – Icon library

### **Backend**
- **Node.js 20+** – Runtime
- **Fastify 5.7** – Web framework (performance-focused)
- **TypeScript** – Type safety
- **PostgreSQL 16** – Database (reliability)
- **Prisma 6** – ORM (schema-first)
- **JWT** – Authentication
- **Zod** – Runtime validation

### **Infrastructure**
- **Docker** – Containerization
- **PostgreSQL** – Primary database
- **Redis** – Caching (optional)
- **Cloudflare R2** – Audio file storage
- **Cloudinary** – Image optimization
- **Vercel** – Frontend hosting
- **Railway/Render** – Backend hosting (optional)

### **Mobile**
- **Flutter** – iOS/Android app
- **GetX/Riverpod** – State management
- **SQLite** – Local database

### **AI/ML**
- **Deepgram Nova** – Speech-to-text for lyric alignment
- **Spotify/iTunes APIs** – Metadata enrichment

---

## 🔐 Security Architecture

```
┌─────────────────────────────────────────┐
│      HTTPS/TLS Encryption               │
│   (All data in transit encrypted)       │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│      JWT Authentication                 │
│   (Access token + Refresh token)        │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│      Rate Limiting                      │
│   (Prevent abuse, DDoS mitigation)      │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│      Input Validation (Zod)             │
│   (Type checking at runtime)            │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│      SQL Parameterization (Prisma)      │
│   (Prevent SQL injection)               │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│      CORS Configuration                 │
│   (Whitelist allowed origins)           │
└─────────────────────────────────────────┘
```

---

## 🚀 Deployment Architecture

### **Development**
```
docker-compose up
↓
Local PostgreSQL + Backend + Frontend + Redis
Available at: http://localhost:5173
```

### **Production**
```
GitHub (Push to main)
    │
    ▼
GitHub Actions (CI/CD)
    │
    ├─→ Lint & Test
    │
    ├─→ Build Frontend
    │   └─→ Deploy to Vercel
    │
    └─→ Build Backend Docker
        └─→ Push to Docker Hub
            └─→ Deploy to Railway/Render/AWS ECS
```

---

## 📊 Database Schema (Simplified)

```sql
Users
├── id (UUID)
├── email (unique)
├── password_hash
└── profile_data

Playlists
├── id (UUID)
├── user_id (FK)
├── name
└── description

PlaylistTracks
├── id (UUID)
├── playlist_id (FK)
├── track_id (FK)
└── position

Tracks
├── id (UUID)
├── title
├── artist
├── album
├── duration
├── lyrics_id (FK)
└── metadata

Lyrics
├── id (UUID)
├── track_id (FK)
├── language
├── content (LRC format)
└── synced_at
```

---

## 🎯 Performance Optimization

### Frontend
- Code splitting with dynamic imports
- Image lazy-loading
- CSS minification & tree-shaking
- Service Worker caching strategy
- IndexedDB for offline cache

### Backend
- Database query optimization (indexes)
- Redis caching layer
- Response compression (gzip)
- Connection pooling (PgBouncer optional)
- CDN for static assets

### Network
- HTTP/2 multiplexing
- Browser caching headers
- Cloudflare edge caching
- Audio streaming via CDN

---

## 🔍 Monitoring & Observability

### Logging
- Backend: Pino (structured JSON logs)
- Frontend: Browser console + error tracking

### Monitoring
- Uptime monitoring (Pingdom)
- Performance metrics (Vercel Analytics)
- Error tracking (Sentry optional)
- Database monitoring (PostgreSQL pg_stat_statements)

### Metrics
- API response times
- Database query performance
- Audio playback quality
- User session duration

---

## 🤝 Contributing to Architecture

Interested in improving the architecture?

1. See [docs/](docs/) for detailed architecture docs
2. Check [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines
3. Open a discussion: [GitHub Discussions](https://github.com/hackerstudent29/Zenify/discussions)
4. Submit a PR with changes

---

**Last Updated**: October 2026  
**Architecture Version**: 2.5.0

