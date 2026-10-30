# 🛠️ Zenify — Developer & Architecture Guide

Welcome to the **Zenify Developer Guide**. This document contains comprehensive technical architecture, data flow diagrams, technology stack specifications, local development setup, API endpoints, and contribution instructions.

If you are a music enthusiast or end-user looking to explore Zenify, please visit the main **[README.md](README.md)** or launch the live app at **[listenzenify.vercel.app](https://listenzenify.vercel.app)**.

---

## 📑 Table of Contents

- [🏗️ System Architecture & Data Flow](#️-system-architecture--data-flow)
- [💻 Technology Stack Matrix](#-technology-stack-matrix)
- [⚡ Engineering Capabilities & Feature Matrix](#-engineering-capabilities--feature-matrix)
- [🎛️ Web Audio DSP Pipeline](#️-web-audio-dsp-pipeline)
- [🚀 Local Development & Self-Hosting Guide](#-local-development--self-hosting-guide)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Backend Setup (Fastify 5 + Prisma)](#2-backend-setup-fastify-5--prisma)
  - [3. Frontend Web Client Setup (React 19 + Vite 6)](#3-frontend-web-client-setup-react-19--vite-6)
  - [4. Android Companion App (Flutter 3)](#4-android-companion-app-flutter-3)
- [📡 API Structure & Core Routes](#-api-structure--core-routes)
- [🛡️ Production Security & Hardened Architecture](#️-production-security--hardened-architecture)
- [🤝 Contribution Workflow](#-contribution-workflow)
- [📜 License & Copyright](#-license--copyright)

---

## 🏗️ System Architecture & Data Flow

Zenify is built on a decoupled, high-performance distributed architecture designed for low-latency audio delivery and sub-second multilingual lyric synchronization.

```mermaid
flowchart TB
    subgraph Clients["Frontend Clients"]
        Web["Web Client (React 19 + Vite 6 + Tailwind CSS)"]
        Mobile["Mobile Companion (Flutter 3 + Android Media3)"]
    end

    subgraph BackendGateway["Fastify 5 API Gateway (TypeScript)"]
        Auth["JWT Auth & Refresh Token Rotation"]
        RateLimit["Rate Limiter (trustProxy Guard)"]
        SSRF["SSRF Guard (DNS & IP Assertion)"]
        CORS["Strict Origin Policy"]
        Routes["RESTful Route Handlers"]
    end

    subgraph AudioEngine["Audio & Metadata Engine"]
        iTunes["iTunes CDN AAC Fast-Path (<50ms)"]
        YTStream["Stream Proxy (HTTP 206 Partial Content)"]
        LrcAlign["Sub-Second LRC Token Aligner"]
        Vibrant["Color Aura Palette Extractor"]
        WorkerFFT["Web Worker FFT Frequency Analyzer"]
    end

    subgraph DataStore["Data & Storage Infrastructure"]
        Postgres[("PostgreSQL Database (Prisma ORM 5.10)")]
        CloudR2["Cloudflare R2 / S3 Audio Buckets"]
        Cloudinary["Cloudinary Artwork CDN"]
        IndexedDB["Client-Side IndexedDB Offline Cache"]
    end

    Web -->|HTTPS / WSS| BackendGateway
    Mobile -->|HTTPS REST| BackendGateway
    BackendGateway --> AudioEngine
    BackendGateway --> DataStore
    AudioEngine --> CloudR2
    AudioEngine --> Cloudinary
    Web -.-> IndexedDB
```

---

## 💻 Technology Stack Matrix

| Domain | Framework / Library | Version | Primary Role & Responsibilities |
| :--- | :--- | :--- | :--- |
| **Web Frontend** | `React` / `Vite` | `v19` / `v6` | Single-page application with client-side routing, Web Audio API graph, and offline PWA service workers. |
| **Mobile App** | `Flutter` / `Dart` | `v3.x` / `v3.3+` | Native Android audio app with background daemon, lock-screen controls, and 3D album flip card. |
| **UI & Styling** | `Tailwind CSS`, `Framer Motion`, `Radix UI` | `v3.4` | Liquid glassmorphism UI, spring physics micro-interactions, accessible UI components. |
| **Backend API** | `Fastify`, `TypeScript` | `v5.2` | High-throughput asynchronous REST server with low memory overhead and strict payload schemas. |
| **Database & ORM** | `PostgreSQL`, `Prisma ORM` | `v14+` / `v5.10` | Strongly typed relational models, migrations, foreign key constraints, and connection pooling. |
| **Audio Processing** | `HTML5 Web Audio API`, `ffmpeg`, `yt-dlp` | Latest | Dual-buffer gapless crossfading, biquad filter equalization, convolution reverb, and container demuxing. |
| **Cloud Storage** | `Cloudflare R2`, `Cloudinary` | S3 API | Edge object storage for audio masters, cover artwork, and dynamic transcoding caches. |
| **Security & Auth** | `Fastify JWT`, `bcrypt`, `Zod`, `Helmet` | Latest | Cookie rotation, timing-safe cryptographic comparisons, strict CORS allowlist, and SSRF prevention. |

---

## ⚡ Engineering Capabilities & Feature Matrix

| Capability Domain | Engine Implementation | Technical Specifications |
| :--- | :--- | :--- |
| **StudioFX Multi-Band EQ** | `frontend/src/lib/audio-engine.ts` | Hardware-accelerated biquad filters with ±12dB continuous gain range and right-side glass panel interface. |
| **8D Spatial Audio** | `frontend/src/components/player/audio-fx-menu.tsx` | Binaural `PannerNode` orbiting audio around stereo field with dual LFO oscillators and variable angular velocity. |
| **DJ Speed & Pitch Warper** | `frontend/src/lib/audio-engine.ts` | Nightcore (1.5x speed + pitch), Daycore (0.75x slowed), and 0.50x–2.00x variable playback slider. |
| **Convolution Reverb** | `frontend/src/lib/audio-engine.ts` | Impulse response convolution modelling Small Hall and Cathedral spaces with wet/dry balance controls. |
| **Dynamics Compressor** | `frontend/src/lib/audio-engine.ts` | Peak limiter (-1dB threshold, 10dB knee, 20:1 ratio, 1ms attack) preventing audio clipping and distortion. |
| **Sub-Second Synced Lyrics** | `backend/src/services/lyrics-sync.service.ts` | Phonetic LRC timestamps (`[mm:ss.xx]`) supporting Tamil, Tanglish, Hindi, Hinglish, Malayalam, and English. |
| **Instrumental Gap Protection** | `backend/src/services/lyrics-sync.service.ts` | Detects and formats non-vocal intervals (`[BGM]`, `[Guitar Solo]`, `[Interlude]`, `[Outro]`) to prevent display distortion. |
| **Lyric Sync Studio** | `frontend/src/components/admin/LyricSyncStudio.tsx` | Visual timestamp painter (`KaraokePainterView`) with syllable alignment, tap-to-sync, undo/redo, and `.lrc` import/export. |
| **In-Browser Local Audio Player** | `frontend/src/app/local-library/page.tsx` | Client-side file scanner parsing local MP3, FLAC, WAV, M4A, OGG, and AAC files; extracts ID3 tags and filters stem audio. |
| **Dual-Buffer Audio Engine** | `frontend/src/components/player/global-audio.tsx` | Runs dual `<audio>` players in parallel, preloading the next track 1.5s after play start to eliminate buffering latency. |
| **HTTP 206 Partial Content Proxy** | `backend/src/routes/utils.routes.ts` | Byte-range streaming proxy preserving container headers (`ftyp` for MP4, `EBML` for WebM) for instant seeking. |

---

## 🎛️ Web Audio DSP Pipeline

The Zenify audio pipeline routes raw audio from dual HTML5 media elements through a chained Web Audio graph:

```
[Audio Element A / B] 
         │
         ▼
  [Source Nodes] ──▶ [Dual Gain Nodes] ──▶ [Input Mixer]
                                                │
                                                ▼
                                    [3-Band Biquad Filter EQ]
                                    (60Hz / 1000Hz / 12000Hz)
                                                │
                       ┌────────────────────────┴────────────────────────┐
                       ▼                                                 ▼
                  [Dry Mix Gain]                                 [Convolver Node]
                       │                                                 │
                       │                                                 ▼
                       │                                         [Reverb Wet Gain]
                       │                                                 │
                       └────────────────────────┬────────────────────────┘
                                                │
                                                ▼
                                      [Binaural Panner Node]
                                      (8D Spatial Orbit LFO)
                                                │
                                                ▼
                                   [Dynamics Compressor Node]
                                   (-1dB Limiter, Anti-Clipping)
                                                │
                                                ▼
                                        [Analyser Node]
                                        (FFT Frequency Data)
                                                │
                                                ▼
                                        [Master Gain Node]
                                                │
                                                ▼
                                     [AudioContext.destination]
```

---

## 🚀 Local Development & Self-Hosting Guide

### 1. Prerequisites

Ensure your system has the following installed:
- **Node.js**: `v18.x` or `v20.x`+
- **npm** or **pnpm**
- **PostgreSQL**: `v14`+ (local instance or cloud database such as Supabase / Neon / Railway)
- **Git**

*(Optional for Android Mobile)*:
- **Flutter SDK**: `v3.x`
- **Android Studio / SDK Command-line Tools**

---

### 2. Backend Setup (Fastify 5 + Prisma)

```bash
# 1. Navigate to backend directory
cd backend

# 2. Copy the environment template
cp .env.example .env

# 3. Configure environment variables in .env:
# Ensure JWT_SECRET and REFRESH_TOKEN_SECRET are at least 32 characters long!
# Configure DATABASE_URL with your PostgreSQL connection string.

# 4. Install backend dependencies
npm install

# 5. Run Prisma database migrations and client generation
npx prisma generate
npx prisma db push

# 6. Start backend development server
npm run dev
```

> The Fastify API server initializes at **`http://localhost:3000`**.

#### Essential Backend Environment Variables (`backend/.env`):
```ini
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001,http://localhost:5173

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zenify?schema=public

# Authentication (Must be at least 32 characters long)
JWT_SECRET=change_this_to_a_secure_jwt_secret_min_32_chars
REFRESH_TOKEN_SECRET=change_this_to_a_secure_refresh_secret_min_32_chars

# Cloud Storage (Optional for local development)
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=
R2_BUCKET_NAME=
```

---

### 3. Frontend Web Client Setup (React 19 + Vite 6)

```bash
# 1. Navigate to frontend directory
cd ../frontend

# 2. Copy the environment template
cp .env.example .env

# 3. Install frontend dependencies
npm install

# 4. Start Vite development server
npm run dev
```

> The web player initializes at **`http://localhost:3001`** (or `http://localhost:5173`).

#### Frontend Environment Variables (`frontend/.env`):
```ini
VITE_API_URL=http://localhost:3000
VITE_APP_URL=http://localhost:3001
```

---

### 4. Android Companion App (Flutter 3)

```bash
# 1. Navigate to mobile directory
cd ../zenify_app

# 2. Fetch Flutter packages
flutter pub get

# 3. Connect an Android device or start an emulator
flutter devices

# 4. Run the mobile companion app
flutter run
```

---

## 📡 API Structure & Core Routes

### Authentication & Sessions (`/api/auth`)
* `POST /api/auth/register` — User account registration with salted bcrypt hashing.
* `POST /api/auth/login` — Authentication with JWT and HttpOnly refresh token rotation.
* `POST /api/auth/google` — Secure Google OAuth token verification and account linking.
* `POST /api/auth/refresh` — Refresh expired access tokens.
* `POST /api/auth/logout` — Invalidate user sessions.

### Tracks & Playlists (`/api/tracks`, `/api/playlists`)
* `GET /api/tracks` — Paginated catalog track search and listing.
* `GET /api/tracks/:id` — Track details including lyrics, duration, and color aura.
* `POST /api/tracks/import-instant` — Dynamic on-the-fly audio resolution for search results.
* `GET /api/playlists` — User playlists and featured collections.
* `POST /api/playlists` — Create user custom playlists.

### Metadata & Lyrics Studio (`/api/metadata`)
* `GET /api/metadata` — iTunes CDN fast-preview lookup.
* `POST /api/metadata/sync-lyrics` — AI-assisted syllable-level lyric alignment (Rate limited).
* `POST /api/metadata/import-lyrics` — Admin-guarded Genius scraper with SSRF protection.
* `PATCH /api/metadata/save-synced-lyrics` — Admin-guarded Lyric Sync Studio timestamp persister.

### Audio Streaming & Utilities (`/api/utils`)
* `GET /api/utils/stream-youtube` — Low-latency HTTP 206 Partial Content range stream proxy with container header preservation (`ftyp`/`EBML`).
* `GET /api/utils/proxy-image` — Secure album artwork cache and proxy.

---

## 🛡️ Production Security & Hardened Architecture

1. **Zero Shell Injection:** Outbound binary executions (`ffmpeg`, `yt-dlp`) run exclusively through strict argument arrays (`safeExecFile`) with no shell string interpolation.
2. **SSRF & DNS Rebinding Guard:** All remote URLs pass through `assertSafePublicUrl()`, which validates protocol, eliminates loopback/private IPv4 and IPv6 (`[::1]`, ULA `fc00::/7`, link-local `fe80::/10`), and performs asynchronous DNS lookups on domain hostnames.
3. **Exact CORS Allowlist:** Replaced wildcard preview regexes with an exact allowlist, strictly preventing subdomain hijacking.
4. **Timing-Safe Auth & Cryptographic OTPs:** All sensitive comparisons use `crypto.timingSafeEqual` with a 5-attempt brute-force rate limiter.
5. **Fail-Closed Webhooks:** ZenWallet HMAC-SHA256 signature verification fails closed if the webhook secret is unconfigured or mismatched.
6. **Hardened HTTP Headers:** Injected `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`, and `Strict-Transport-Security` across all client routes.

---

## 🤝 Contribution Workflow

1. **Fork the Repository:** `https://github.com/hackerstudent29/Zenify/fork`
2. **Create a Feature Branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Validate Builds Before Committing:**
   ```bash
   # In backend:
   cd backend && npx tsc --noEmit
   
   # In frontend:
   cd ../frontend && npm run build
   ```
4. **Follow Conventional Commits:** Use clean, standard commit types (`feat`, `fix`, `docs`, `refactor`, `perf`, `chore`).
5. **Push and Open a Pull Request:** Open a PR against `main` using our [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md).

---

## 📜 License & Copyright

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for complete legal terms.

```
MIT License
Copyright (c) 2026 Zenify (hackerstudent29 - Ramanathan S)
```

Built with ❤️ by **[Ramanathan S (hackerstudent29)](https://github.com/hackerstudent29)**.
