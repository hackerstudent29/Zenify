# 🛠️ Zenify — Developer & Architecture Guide

Welcome to the **Zenify Developer Guide**. This document contains comprehensive technical architecture, data flow diagrams, technology stack specifications, local development setup, API endpoints, and contribution instructions.

If you are a music enthusiast or end-user looking to explore Zenify, please visit the main **[README.md](../README.md)** or launch the live app at **[listenzenify.vercel.app](https://listenzenify.vercel.app)**.

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
| **Web Frontend** | `React` / `Vite` | `v19` / `v6` | Single-page application with client-side routing, Web Audio API graph, and PWA service workers with offline caching. |
| **State Management** | `Zustand`, `TanStack Query` | `v5`, `v5` | Global state management with persist middleware and server state synchronization with smart caching. |
| **UI Components** | `Radix UI`, `Framer Motion`, `GSAP` | Latest, `v12`, `v3` | Accessible component primitives, spring physics animations, and advanced timeline animations. |
| **Styling** | `Tailwind CSS` | `v4` | Utility-first CSS framework with custom design tokens for glassmorphism and reactive backgrounds. |
| **Backend API** | `Fastify`, `TypeScript` | `v5.7` | High-throughput asynchronous REST server with low memory overhead and strict Zod payload validation. |
| **Database & ORM** | `PostgreSQL`, `Prisma ORM` | `v14+` / `v5.10` | Strongly typed relational models, automatic migrations, foreign key constraints, and connection pooling. |
| **Background Jobs** | `BullMQ`, `Redis` | `v5`, Latest | Job queue system for lyric enrichment, analytics, and scheduled tasks with retry logic and concurrency control. |
| **AI/ML Services** | `Deepgram`, `OpenAI` | Latest | AI-powered speech-to-text for lyric onset alignment, artist bio generation, and lyrics meaning analysis. |
| **Audio Processing** | `HTML5 Web Audio API`, `ffmpeg`, `yt-dlp` | Native, Latest | Dual-buffer gapless crossfading, biquad filter DSP, convolution reverb, and audio container demuxing. |
| **Cloud Storage** | `Cloudflare R2`, `Cloudinary`, `AWS S3` | S3 API | Edge object storage for audio masters (R2/S3), cover artwork CDN (Cloudinary), and dynamic transcoding caches. |
| **Security & Auth** | `Fastify JWT`, `bcryptjs`, `Helmet` | Latest | JWT with refresh token rotation, timing-safe password comparison, strict CORS allowlist, and SSRF prevention. |
| **Developer Tools** | `ESLint`, `TypeScript`, `Prettier` | `v9`, `v5`, Latest | Linting, type checking, and code formatting across monorepo with shared configurations. |

---

## ⚡ Engineering Capabilities & Feature Matrix

| Capability Domain | Engine Implementation | Technical Specifications |
| :--- | :--- | :--- |
| **Studio FX Glass Panel** | `frontend/src/components/player/audio-fx-modal.tsx` | 320px right-side glass panel with 6 collapsible accordion sections (Presets, Tune, Space, Voice, Chain, Tempo) matching Queue/Lyrics panel design. |
| **3-Band Parametric EQ** | `frontend/src/lib/audio-engine.ts` | Hardware-accelerated biquad filters at Bass (110Hz), Mid (1.5kHz), Treble (8kHz) with ±12dB continuous gain range. |
| **Reorderable FX Chain** | `frontend/src/lib/audio-engine.ts` | Drag-and-drop customizable signal routing order: EQ → Filter → Drive → Chorus → Echo → Reverb for creative sound design. |
| **Native Vocal Isolation** | `frontend/src/lib/audio-engine.ts` | Zero-latency WebAudio Mid-Side processor with no ML model required—extracts or isolates vocals/instruments in real-time. |
| **8D Spatial Audio** | `frontend/src/lib/audio-engine.ts` | Binaural `PannerNode` with dual LFO oscillators creating bi-directional (clockwise/counter-clockwise) audio orbiting with adjustable speed (0.03-0.30 revolutions/sec). |
| **DJ-Style Filter** | `frontend/src/lib/audio-engine.ts` | Continuous high-pass/low-pass filter sweep (20Hz-20kHz) with frequency visualization and zero-snap reset at center. |
| **Speed & Pitch Control** | `frontend/src/lib/audio-engine.ts` | Independent speed (0.5x-2.0x) and pitch shifting (-12 to +12 semitones) for Nightcore, Daycore, and creative remixes. Tape mode links both. |
| **Advanced Effects Suite** | `frontend/src/lib/audio-engine.ts` | Chorus (BBD emulation), Echo (with feedback and time control), Reverb (Small Hall/Cathedral impulse responses), Warmth/Drive (tube saturation), Stereo Width (0% mono to 200% ultra-wide). |
| **Night Mode Dynamics** | `frontend/src/lib/audio-engine.ts` | Multiband dynamics compressor with makeup gain, preventing audio clipping and ensuring consistent volume for late-night listening. |
| **10+ Studio Presets** | `frontend/src/components/player/audio-fx-modal.tsx` | Built-in presets (Original, After Hours, Immersive, Studio Clarity, Headphones, Bass Boost, Vocal Boost, Concert Hall, Lo-Fi, Dream Echo) with custom preset save/load. |
| **AI-Powered Synced Lyrics** | `backend/src/services/lyric-enrichment.service.ts` | 24/7 autonomous enrichment worker with Deepgram AI onset alignment, multi-source fetching (LRCLib, lrc.red, STT), and sub-second accuracy. |
| **Word-Level Timing** | `backend/src/services/deepgram-lyrics.service.ts` | Apple Music-style word-by-word synchronization with `<mm:ss.xx>` inline timestamps, enabling karaoke-grade highlighting. |
| **Instrumental Gap Detection** | `backend/src/services/lyric-enrichment.service.ts` | Automatically inserts `• • •` markers during instrumental breaks >3.2s (intro, interlude, solo, outro) to prevent lyric display glitches. |
| **Automatic Romanization** | `backend/src/services/romanization.service.ts` | Real-time romanization for Tamil, Hindi, Telugu, Malayalam, Kannada, Bengali, Punjabi, Gujarati—preserving synced timing. |
| **Intelligent 3-Tier Queue** | `frontend/src/store/player.ts` | User Queue (FIFO, preserved during shuffle) + Context Queue (album/playlist, affected by shuffle) + Play History (last 50 tracks for back navigation). |
| **Vibe-Based Autoplay** | `backend/src/services/recommendation-engine.service.ts` | AI-powered radio that analyzes track mood, tempo, genre, language, and artist similarity to auto-queue when user queue ends. |
| **In-Browser Local Player** | `frontend/src/app/local-library/page.tsx` | Client-side MP3, FLAC, WAV, M4A, AAC parser with ID3 tag extraction and embedded cover art—files never leave device. |
| **Dual-Buffer Gapless Engine** | `frontend/src/lib/audio-engine.ts` | Runs dual `<audio>` elements with intelligent preloading (starts 1.5s after play), enabling seamless crossfade and zero buffering gaps. |
| **Palette Reactive Backgrounds** | `frontend/src/components/shared/DynamicBackground.tsx` | Canvas-based mesh gradient animation extracting and pulsing dominant colors from album art in sync with music beat. |
| **HTTP 206 Partial Content** | `backend/src/routes/utils.routes.ts` | Byte-range streaming proxy preserving container headers (`ftyp` for MP4, `EBML` for WebM) for instant seeking and efficient bandwidth usage. |
| **PWA Offline Support** | `frontend/vite.config.ts` | Service worker with offline caching, lock screen media controls, Bluetooth media button support, and installable on all platforms. |

---

## 🎛️ Web Audio DSP Pipeline

The Zenify audio engine routes raw audio through a sophisticated Web Audio graph with reorderable FX chain:

```
[Dual HTML5 Audio Elements A/B]
         │
         ├──▶ [Source Node A] ──▶ [Gain A (volume/crossfade)]
         └──▶ [Source Node B] ──▶ [Gain B (volume/crossfade)]
                                            │
                                            ▼
                                     [Input Mixer]
                                            │
                     ┌──────────────────────┴───────────────────────┐
                     ▼                                              ▼
              [Vocal Dry Path]                          [Vocal Isolation Path]
                     │                                   (Mid-Side Processor)
                     │                                              │
                     └──────────────────────┬───────────────────────┘
                                            ▼
                                       [Vocal Sum]
                                            │
                                            ▼
                        ╔═══════════════════════════════════╗
                        ║  REORDERABLE FX CHAIN (6 modules) ║
                        ║  Default order (user-customizable): ║
                        ╠═══════════════════════════════════╣
                        ║  1. EQ (3-band Biquad)           ║
                        ║  2. Filter (High/Low Pass)       ║
                        ║  3. Drive (Warmth/Saturation)    ║
                        ║  4. Chorus (BBD Emulation)       ║
                        ║  5. Echo (Delay + Feedback)      ║
                        ║  6. Reverb (Convolver)           ║
                        ╚═══════════════════════════════════╝
                                            │
                                            ▼
                                      [FX Gate]
                                  (Bypass Toggle)
                                            │
                                            ▼
                                 [Stereo Width Matrix]
                             (Splitter → Gain Matrix → Merger)
                                            │
                                            ▼
                                  [8D Panner Node]
                              (LFO-driven X/Z Position)
                                            │
                                            ▼
                            [Dynamics Compressor (Night Mode)]
                             (Threshold -24dB, Ratio 12:1)
                                            │
                                            ▼
                                  [Compression Makeup Gain]
                                            │
                                            ▼
                                      [Master Gain Node]
                                      (User Volume 0-1)
                                            │
                    ┌───────────────────────┴────────────────────────┐
                    ▼                                                ▼
            [Analyser Node]                               [Viz Analyser Node]
          (Player FFT 256)                            (Spectrum Display 2048)
                    │                                                │
                    └───────────────────────┬────────────────────────┘
                                            ▼
                                 [AudioContext.destination]
                                    (Hardware Output)
```

**Key Features:**
- **Dual-buffer preloading** for gapless playback with crossfade
- **Native vocal isolation** using Mid-Side stereo processing (zero ML inference latency)
- **Drag-and-drop FX reordering** for creative signal routing
- **Live parameter interpolation** (no clicks/pops during adjustment)
- **Separate analysis paths** for player UI and visual spectrum display

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
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/zenify?schema=public

# Authentication (Must be at least 32 characters long)
JWT_SECRET=change_this_to_a_secure_jwt_secret_min_32_chars_please
REFRESH_TOKEN_SECRET=change_this_to_a_secure_refresh_secret_min_32_chars

# Cloud Storage (Required for audio/image uploads)
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_BUCKET_NAME=zenify-audio
R2_PUBLIC_URL=https://your-r2-public-domain.com

# Cloudinary (for image hosting)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# AI Services (Optional - for lyric enrichment and AI features)
DEEPGRAM_API_KEY=your_deepgram_api_key
OPENAI_API_KEY=your_openai_api_key

# Redis (Required for background jobs)
REDIS_URL=redis://localhost:6379

# Rate Limiting
RATE_LIMIT_MAX=300  # requests per minute per IP
RATE_LIMIT_WINDOW=60000  # milliseconds

# Optional: Payment Gateway
ZENPAY_SECRET_KEY=
ZENPAY_WEBHOOK_SECRET=
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
* `POST /api/auth/register` — User account registration with salted bcryptjs hashing.
* `POST /api/auth/login` — Authentication with JWT and HttpOnly refresh token rotation.
* `POST /api/auth/google` — Secure Google OAuth token verification and account linking.
* `POST /api/auth/refresh` — Refresh expired access tokens using refresh tokens.
* `POST /api/auth/logout` — Invalidate user sessions and clear tokens.

### Tracks & Albums (`/api/tracks`, `/api/albums`)
* `GET /api/tracks` — Paginated catalog track search and listing with filters.
* `GET /api/tracks/:id` — Track details including lyrics, synced_lyrics, duration, palette, and metadata.
* `POST /api/tracks/upload` — Multi-part track upload with metadata and audio file.
* `POST /api/tracks/import-instant` — Dynamic on-the-fly audio resolution for search results.
* `POST /api/tracks/:id/like` — Like/unlike track toggle.
* `POST /api/tracks/:id/play` — Record track play event for analytics.
* `GET /api/albums` — Album listing with artist information.
* `GET /api/albums/:id` — Album details with track listings.

### Artists & Playlists (`/api/artists`, `/api/playlists`)
* `GET /api/artists` — Artist directory with pagination and search.
* `GET /api/artists/:id` — Artist profile with discography, related artists, and biography.
* `GET /api/playlists` — User playlists and featured collections.
* `POST /api/playlists` — Create user custom playlists.
* `PUT /api/playlists/:id` — Update playlist metadata.
* `POST /api/playlists/:id/tracks` — Add track to playlist.
* `DELETE /api/playlists/:id/tracks/:trackId` — Remove track from playlist.

### Search & Discovery (`/api/search`, `/api/discover`)
* `GET /api/search` — Universal search (tracks, artists, albums, playlists) with instant results.
* `GET /api/search/suggestions` — Search autocomplete suggestions.
* `GET /api/discover` — Personalized recommendations based on user profile.
* `GET /api/discover/radio` — Vibe-based radio for current track.

### Lyrics & Metadata (`/api/metadata`, `/api/lyrics`)
* `GET /api/metadata/:trackId` — Track metadata including enrichment status.
* `POST /api/lyrics/enrich/:trackId` — Trigger lyric enrichment for specific track (admin/user-initiated).
* `GET /api/lyrics/:trackId/romanized` — Get romanized lyrics for Indian language tracks.
* `POST /api/lyrics/:trackId/offset` — Adjust lyric timing offset.

### User Features (`/api/user`, `/api/preferences`)
* `GET /api/user/profile` — Current user profile information.
* `PUT /api/user/profile` — Update user profile (name, avatar, username).
* `GET /api/user/history` — Listening history with pagination.
* `GET /api/user/liked` — Liked tracks collection.
* `GET /api/preferences` — User preferences (audio quality, theme, reactive backgrounds, etc.).
* `PUT /api/preferences` — Update user preferences.
* `POST /api/preferences/onboarding` — Complete onboarding with interests.

### Homepage & Analytics (`/api/homepage`, `/api/analytics`)
* `GET /api/homepage` — Curated homepage sections (featured, trending, new releases).
* `GET /api/homepage/shelves` — Dynamic content shelves based on user profile.
* `POST /api/analytics/track-event` — Track user activity events.
* `GET /api/analytics/stats` — User listening stats (total minutes, favorite genres, top artists).

### Audio Streaming & Utilities (`/api/utils`)
* `GET /api/utils/stream-youtube` — Low-latency HTTP 206 Partial Content range stream proxy with container header preservation.
* `GET /api/utils/proxy-image` — Secure album artwork cache and proxy with Cloudinary fallback.
* `GET /api/utils/extract-colors` — Extract dominant color palette from image URL.

### Billing & Subscriptions (`/api/billing`, `/webhooks`)
* `POST /api/billing/create-checkout` — Create subscription checkout session.
* `GET /api/billing/subscription` — Get current subscription status.
* `POST /webhooks/payment` — Payment gateway webhooks (ZenPay/ZenWallet).

### Admin Routes (`/api/admin`)
* `GET /api/admin/database` — Database admin console access.
* `POST /api/admin/featured` — Manage featured content.
* `POST /api/admin/notify` — Broadcast notifications to users.
* `POST /api/admin/metadata/deduplicate` — Run metadata deduplication tasks.

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

Distributed under the **MIT License**. See [`LICENSE`](../LICENSE) for complete legal terms.

```
MIT License
Copyright (c) 2026 Zenify (hackerstudent29 - Ramanathan S)
```

Built with ❤️ by **[Ramanathan S (hackerstudent29)](https://github.com/hackerstudent29)**.
