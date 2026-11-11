# Zenify Project Structure

Clean, organized map of the Zenify monorepo across the **Backend API** (`backend/`), **Web PWA** (`frontend/`), **Android App** (`mobile/`), **Automation** (`scripts/`), and **Documentation** (`docs/`).

> For system design and request/audio data flows, see [ARCHITECTURE.md](./ARCHITECTURE.md). For contributor workflows, see [DEVELOPER.md](./DEVELOPER.md).

---

## Quick Search Guide

| Domain | Where to Look |
| :--- | :--- |
| **HTTP API & Auth** | `backend/src/routes/`, `backend/src/controllers/`, `backend/src/middleware/auth.ts` |
| **Audio & Lyrics Engines** | `backend/src/services/` (`audio-resolver`, `clean-cdn-audio`, `lyrics-sync`), `backend/src/lyrics/` |
| **Room Together (Backend)** | `backend/src/services/together/`, `backend/src/websocket/together-ws.ts`, `backend/src/routes/together-v1.routes.ts` |
| **Database Schema & Seeds** | `backend/prisma/schema.prisma`, `backend/prisma/seed.ts` |
| **Web Pages & Routing** | `frontend/src/router.tsx`, `frontend/src/app/` |
| **Web Audio, Lyrics & UI** | `frontend/src/components/player/`, `frontend/src/components/shared/`, `frontend/src/store/` |
| **Web SEO, Sitemap & PWA** | `frontend/index.html`, `frontend/vite.config.ts`, `frontend/scripts/{generate-sitemap,prerender,verify-all}.mjs` |
| **Flutter UI & Design System** | `mobile/lib/views/`, `mobile/lib/design_system/` |
| **Mobile State & Services** | `mobile/lib/services/` (`zen_player.dart`, `together_service.dart`, `together_phase2.dart`, `stream_resolver_service.dart`) |
| **Android Native DSP & InnerTube** | `mobile/android/app/src/main/kotlin/com/zenify/mobile/` (`audio/`, `yt/`, `innertube/`), `com/metrolist/innertube/` |
| **Deployment & Dev Scripts** | `scripts/`, `Dockerfile`, `docker-compose.yml`, `heroku.yml`, `frontend/vercel.json` |
| **CI/CD & GitHub Templates** | `.github/workflows/`, `.github/ISSUE_TEMPLATE/`, `.github/DISCUSSION_TEMPLATE/` |

---

## Repository Tree

```text
Zenify/
├── .github/                              # GitHub Actions CI/CD, Dependabot & community templates
│   ├── DISCUSSION_TEMPLATE/
│   │   └── welcome.md                    # Community discussions welcome guide
│   ├── ISSUE_TEMPLATE/                   # Structured bug, feature & lyrics sync forms
│   │   ├── bug_report.yml
│   │   ├── config.yml
│   │   ├── feature_request.yml
│   │   └── lyrics_sync_report.yml
│   ├── workflows/                        # Automated lint, security, test & APK release pipelines
│   │   ├── lint.yml
│   │   ├── release.yml
│   │   ├── security.yml
│   │   └── test.yml
│   ├── CODEOWNERS
│   ├── dependabot.yml
│   ├── FUNDING.yml
│   └── PULL_REQUEST_TEMPLATE.md
│
├── assets/                               # Brand artwork, display fonts & promotional media
│   ├── fonts/                            # Display font assets
│   ├── images/                           # Logos, animated GIF, letter stamps & icons
│   ├── logo.svg
│   └── Zenify logo animation.html
│
├── backend/                              # Fastify 5 + TypeScript + Prisma + Redis API & WebSocket server
│   ├── config/                           # Cloud object storage CORS config (r2-cors.json)
│   ├── prisma/                           # Prisma schema, SQL migrations & seed scripts
│   │   ├── add_fullview_bg.sql
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   ├── seed_artists.ts
│   │   └── seed_insights.ts
│   ├── scripts/                          # Storage audits, Prisma helpers & E2E smoke checks
│   ├── src/
│   │   ├── config/                       # Environment validation (env.ts)
│   │   ├── constants/                    # Language & metadata constants
│   │   ├── controllers/                  # Request handlers & Zod validation schemas
│   │   ├── jobs/                         # Release scanner, backfill & integrity jobs
│   │   ├── lyrics/                       # Lyrics orchestrator, parsers (LRC/TTML) & multi-provider fetchers
│   │   ├── middleware/                   # JWT auth & request guards
│   │   ├── queues/                       # BullMQ queues & workers (home shelves, imports, lyrics, romanization)
│   │   ├── routes/                       # Fastify REST & Room Together v1 route modules
│   │   ├── services/
│   │   │   ├── together/                 # Room Together modular engine (achievements, DJ queue, voice, analytics)
│   │   │   └── *.service.ts              # Audio resolution, JioSaavn/YT catalog, AI search, Blend, Day Mix, notifications
│   │   ├── types/                        # Custom TypeScript declarations
│   │   ├── utils/                        # Prisma, Redis, S3/R2, Supabase, transcoder & security helpers
│   │   ├── websocket/                    # Real-time Room Together WebSocket server (together-ws.ts)
│   │   ├── workers/                      # Background metadata enrichment worker
│   │   ├── index.ts                      # Fastify entry point & remote config endpoint
│   │   └── set-cors.ts
│   ├── tests/                            # Vitest/integration suites for playback, lyrics, Blend, Day Mix & Rooms
│   ├── .env.example
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
│
├── docs/                                 # Project documentation hub
│   ├── README.md                         # Documentation index
│   ├── PROJECT_STRUCTURE.md              # This repository structure & file locator guide
│   ├── ARCHITECTURE.md                   # System architecture, auth & dual-mode playback flows
│   ├── DEVELOPER.md                      # Local development setup & contributor guide
│   ├── QUICK_START.md                    # 5-minute onboarding guide
│   ├── INSTALLATION.md                   # Detailed setup instructions
│   ├── DEMO.md                           # Feature walkthrough & preview guide
│   ├── FAQ.md                            # Frequently asked questions
│   ├── SUPPORT.md                        # Support channels & contact links
│   ├── TROUBLESHOOTING.md                # Common issues & fixes
│   ├── PRIVACY_POLICY.md                 # Privacy policy & data handling
│   ├── ROADMAP.md                        # Feature roadmap & milestones
│   ├── architecture/                     # Internal technical specs & design docs
│   │   ├── backend_architecture.md
│   │   ├── database_schema.md
│   │   ├── failure_strategy.md
│   │   ├── frontend_architecture.md
│   │   ├── schema-plan.md
│   │   ├── search_implementation_plan.md
│   │   └── website-parity.md
│   ├── deployment/                       # Cloud provisioning & deploy guides
│   │   ├── CLOUD_SETUP_GUIDE.md
│   │   ├── QUICK_DEPLOY.md
│   │   └── README_CLOUD_SETUP.md
│   ├── images/                           # Application UI screenshots
│   ├── releases/                         # Legacy release notes archive
│   │   └── RELEASE_NOTES_v2.5.0.md
│   └── together/                         # Room Together parity & module audit
│       └── AUDIT.md
│
├── frontend/                             # React 19 + Vite 6 + TypeScript Web PWA
│   ├── public/                           # Static icons, favicons, APK download, SEO & PWA files
│   │   ├── assets/letters/               # Monogram avatar assets
│   │   ├── downloads/zenify.apk          # Latest Android release APK (v1.0.8)
│   │   ├── moods/                        # Home mood artwork
│   │   ├── llms.txt                      # AI crawler overview & primary routes
│   │   ├── manifest.json                 # PWA web app manifest
│   │   ├── remote_config.json            # Mobile remote update & feature config
│   │   ├── robots.txt                    # Search crawler directives
│   │   └── sitemap.xml                   # Generated canonical XML sitemap
│   ├── scripts/                          # Build-time SEO & verification automation
│   │   ├── generate-sitemap.mjs
│   │   ├── prerender.mjs
│   │   └── verify-all.mjs
│   ├── src/
│   │   ├── app/                          # Page views (home, search, discover, download, together, track, album, artist, etc.)
│   │   ├── components/                   # Reusable UI, players, lyrics, Studio FX & shared SEO/chrome components
│   │   ├── hooks/                        # Custom React hooks (playback, lyrics, colors, preferences)
│   │   ├── lib/                          # API client, Web Audio DSP, colors, SEO helpers & compatibility adapters
│   │   ├── services/                     # Local library & Room Together WebSocket/HTTP clients
│   │   ├── store/                        # Zustand state stores (auth, player, queue, together, UI)
│   │   ├── workers/                      # Web Workers for palette extraction & audio features
│   │   ├── main.tsx                      # React entry point
│   │   └── router.tsx                    # React Router route table
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── vercel.json                       # Vercel headers, SPA rewrites & static cache rules
│   └── vite.config.ts                    # Vite + VitePWA configuration
│
├── mobile/                               # Flutter (Android/iOS/Desktop) native client + Kotlin audio engine
│   ├── android/                          # Gradle build & Android native Kotlin plugins
│   │   └── app/src/main/kotlin/com/
│   │       ├── metrolist/innertube/      # Kotlin YouTube Music InnerTube parser
│   │       └── zenify/mobile/            # ZenAudioPlugin, ZenFxProcessor (C++/JNI Studio FX), ZenInnerTubePlugin, yt/
│   ├── assets/                           # Bundled artwork, letters, sample LRC & offline mock catalog
│   ├── lib/
│   │   ├── core/theme/                   # Apple-inspired theme configuration
│   │   ├── data/datasources/             # Catalog data sources
│   │   ├── design_system/                # Tokens, motion springs, Apple Glass UI & shared widgets
│   │   ├── models/                       # Track, artist, playback context & Room Together models
│   │   ├── services/                     # ZenPlayer, AudioService, Studio FX bridge, Room Together & InnerTube services
│   │   ├── utils/                        # Media normalizer & share image generator
│   │   ├── views/                        # Screens (Home, Explore, Search, Library, Player, Room Together, Insights, Profile)
│   │   └── main.dart                     # App initialization & deep-link bootstrap
│   ├── scripts/                          # Adaptive launcher icon generator
│   ├── test/                             # Flutter unit & widget tests (lyrics, smart queue, rooms, phase 2)
│   ├── analysis_options.yaml
│   ├── pubspec.yaml                      # App version (1.0.8+12), SF Pro fonts & dependencies
│   └── README.md
│
├── scripts/                              # Root deployment, security & dev helper scripts
│   ├── deploy.ps1                        # Windows PowerShell multi-target deploy script
│   ├── deploy.sh                         # Unix shell deploy script
│   ├── run-mobile.bat                    # Quick Windows Flutter USB dev launcher
│   ├── secret-scan.js                    # Repository secret scanner
│   └── serve-mobile.js                   # Static mobile build preview server
│
├── .dockerignore
├── .editorconfig
├── .gitignore
├── .vercelignore
├── analysis_options.yaml                 # Workspace-level Dart analyzer exclusions
├── CHANGELOG.md                          # Unified release history (through v1.0.8)
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── docker-compose.yml                    # Local Redis, PostgreSQL & backend compose stack
├── Dockerfile                            # Production backend container build
├── heroku.yml                            # Heroku container manifest
├── LICENSE                               # MIT License
├── README.md                             # Main project overview & quick links
└── SECURITY.md                           # Vulnerability disclosure policy
```

