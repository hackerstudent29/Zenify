# Zenify Architecture, File Map & Navigation Guide

This document is the **single source of truth** for navigating, organizing, and developing inside the Zenify codebase. It provides an immediate quick-lookup index for key systems (such as the StudioFX engine), a complete alphabetical tree directory, and strict naming conventions for upcoming file creations.

---

## ⚡ Quick Search ("Where Is It?")

| Feature / Engine | Primary File Path | Description |
|---|---|---|
| **StudioFX Audio Engine** | [`frontend/src/lib/audio-engine.ts`](file:///d:/.gemini/Zenify/frontend/src/lib/audio-engine.ts) | Web Audio API DSP pipeline: 10-band equalizer, dynamic compressor, biquad filters, convolver reverb, 8D audio spatializer, pitch, speed, and bass boost. |
| **StudioFX Equalizer Modal** | [`frontend/src/components/player/audio-fx-modal.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/player/audio-fx-modal.tsx) | Modal UI dialog for interactive frequency gain sliders, bass boost, spatializer toggle, and acoustic environment presets. |
| **StudioFX Dropdown Menu** | [`frontend/src/components/player/audio-fx-menu.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/player/audio-fx-menu.tsx) | Quick popover menu attached to the player controls for one-click StudioFX preset selection. |
| **StudioFX State Store** | [`frontend/src/store/audio-fx-store.ts`](file:///d:/.gemini/Zenify/frontend/src/store/audio-fx-store.ts) | Zustand persistent store managing equalizer band decibels, audio profiles, reverb room sizes, and playback rates. |
| **Global Audio Player Engine** | [`frontend/src/components/player/global-audio.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/player/global-audio.tsx) | Persistent HTML5 `<audio>` engine, media error probing, automatic stream recovery, multi-tier CDN fallbacks, and gapless/crossfade handlers. |
| **Player Bottom Bar (Unified)** | [`frontend/src/components/player-bar.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/player-bar.tsx) | Responsive switcher routing between `PCPlayerBar` and `PremiumMobilePlayer`. |
| **Desktop Player Bar** | [`frontend/src/components/pc/PCPlayerBar.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/pc/PCPlayerBar.tsx) | Desktop horizontal bottom bar with timeline scrub, volume slider, queue trigger, and playback actions. |
| **Desktop Fullscreen Player** | [`frontend/src/components/pc/PCFullScreenPlayer.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/pc/PCFullScreenPlayer.tsx) | Apple Music-style immersive desktop overlay with reactive album mesh background and integrated lyrics. |
| **Mobile Player & Sheet** | [`frontend/src/components/mobile/PremiumMobilePlayer.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/mobile/PremiumMobilePlayer.tsx) | Mobile bottom mini-bar expanding into full-height swipeable player card with touch-optimized controls. |
| **Liquid Motion Lyrics Line** | [`frontend/src/components/shared/LiquidLyricsLine.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/shared/LiquidLyricsLine.tsx) | Syllable-by-syllable synchronized karaoke typography with fluid fluid springs and blur focus. |
| **Synchronized Lyrics Sheet** | [`frontend/src/components/shared/LyricsView.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/shared/LyricsView.tsx) | Full synchronized lyrics canvas with Romanized transliterations, autoscroll physics, and manual offset calibration. |
| **Artwork Color Mesh** | [`frontend/src/components/shared/ArtworkMeshBackground.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/shared/ArtworkMeshBackground.tsx) | Multi-node GPU-accelerated Canvas/WebGL ambient color mesh dynamically adapting to album art hues. |
| **Album Color Extraction** | [`frontend/src/hooks/useAlbumColor.ts`](file:///d:/.gemini/Zenify/frontend/src/hooks/useAlbumColor.ts) & [`frontend/src/lib/theme.ts`](file:///d:/.gemini/Zenify/frontend/src/lib/theme.ts) | High-speed dominant color extraction syncing `--page`, `--side`, `--album-rgb` Apple Music CSS tokens. |
| **Multi-Backup Streaming Proxy** | [`backend/src/routes/utils.routes.ts`](file:///d:/.gemini/Zenify/backend/src/routes/utils.routes.ts) | `/stream-youtube` multi-tier stream resolution (JioSaavn 320k, Apple Akamai CDN AAC, Invidious/Piped, yt-dlp). |
| **Audio Resolver & Backups** | [`backend/src/services/audio-resolver.service.ts`](file:///d:/.gemini/Zenify/backend/src/services/audio-resolver.service.ts) | Algorithmic metadata matching scoring official releases and resolving direct streams. |
| **Clean CDN 320k Service** | [`backend/src/services/clean-cdn-audio.service.ts`](file:///d:/.gemini/Zenify/backend/src/services/clean-cdn-audio.service.ts) | Decrypts and verifies pristine 320kbps and 160kbps CDN audio for regional and international releases. |
| **Catalog Provider Engine** | [`backend/src/services/catalog-provider.service.ts`](file:///d:/.gemini/Zenify/backend/src/services/catalog-provider.service.ts) | Multi-storefront Apple Music / iTunes and RapidAPI catalog aggregator with US and IN country failover. |
| **Track Upload Studio** | [`frontend/src/components/admin/track-upload-studio.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/admin/track-upload-studio.tsx) | Professional admin track intake console with audio waveform trimming, artwork assignment, and copyright tagging. |
| **Local Offline Library** | [`frontend/src/services/localLibraryStore.ts`](file:///d:/.gemini/Zenify/frontend/src/services/localLibraryStore.ts) | IndexedDB persistent client storage for offline audio playback and local ID3 file parsing. |

---

## 📂 Project Navigation Tree (Ascending Order)

```text
Zenify/
├── backend/                             # Fastify Node.js TypeScript API Backend
│   └── src/
│       ├── config/                      # Environment variables, CORS, rate limits
│       ├── constants/                   # Music genres, storefront mappings, status codes
│       ├── controllers/                 # Fastify request handlers
│       │   ├── album.controller.ts
│       │   ├── artist.controller.ts
│       │   ├── auth.controller.ts
│       │   ├── metadata.controller.ts
│       │   ├── playlist.controller.ts
│       │   ├── search.controller.ts
│       │   ├── track.controller.ts
│       │   └── user.controller.ts
│       ├── middleware/                  # JWT auth, role validation, request context
│       ├── queues/                      # BullMQ / In-memory background job queues
│       │   ├── import.queue.ts          # Asynchronous song downloading and R2 upload
│       │   └── lyric-enrichment.worker.ts # Background AI and LRC lyric syncer
│       ├── routes/                      # Fastify HTTP API routes
│       │   ├── admin.routes.ts          # Catalog management, analytics, system health
│       │   ├── album.routes.ts          # Album details, virtual iTunes albums, tracks
│       │   ├── artist.routes.ts         # Artist discography, top tracks, related artists
│       │   ├── auth.routes.ts           # Login, registration, session refresh, OTP
│       │   ├── catalog.routes.ts        # Apple Music & iTunes global catalog discovery
│       │   ├── download.routes.ts       # Track export and multi-format audio conversion
│       │   ├── lyrics.routes.ts         # Timestamped lyrics fetch, sync calibration
│       │   ├── metadata.routes.ts       # External track/album metadata lookup
│       │   ├── playlist.routes.ts       # User playlist CRUD, collaboration, song adding
│       │   ├── radio.routes.ts          # Endless artist and song radio recommendations
│       │   ├── search.routes.ts         # Universal instant multi-provider search
│       │   ├── track.routes.ts          # Track streams, likes, playcounts, refetch-audio
│       │   ├── user.routes.ts           # User profiles, avatar upload, library sync
│       │   └── utils.routes.ts          # /stream-youtube, /proxy-audio, /proxy-image
│       ├── scripts/                     # Maintenance, backfill, and database migrations
│       ├── services/                    # Business logic & external API connectors
│       │   ├── ai-artist.service.ts     # AI artist biographies and high-res imagery
│       │   ├── ai-lyrics.service.ts     # Syllable timestamping & translation
│       │   ├── audio-resolver.service.ts # Best audio match verification algorithm
│       │   ├── catalog-provider.service.ts # iTunes & Apple Music catalog aggregator
│       │   ├── clean-cdn-audio.service.ts # JioSaavn 320kbps pristine CDN stream engine
│       │   ├── country-language.service.ts # Multi-language charts & regional trends
│       │   ├── deduplication.service.ts # Duplicate release and track detection
│       │   ├── external-metadata.service.ts # Scrapers, YouTube Music, Spotify adapters
│       │   ├── home-sections.service.ts # Dynamic personalized home feed builder
│       │   ├── lyrics.service.ts        # LRCLIB, Musixmatch, and Spotify lyrics parser
│       │   ├── mail.service.ts          # Brevo / SMTP transactional email dispatcher
│       │   ├── playlist.service.ts      # Playlist curation and ordering logic
│       │   ├── r2.service.ts            # Cloudflare R2 audio & artwork bucket storage
│       │   ├── recommendations.service.ts # Collaborative filtering & listening queues
│       │   ├── song-playback-health.service.ts # Realtime broken link healer
│       │   ├── system-settings.service.ts # Runtime API keys and toggles
│       │   ├── track.service.ts         # Track state persistence and streaming counts
│       │   └── universal-search.service.ts # Cross-database and cross-provider search
│       ├── types/                       # Shared backend TypeScript interfaces
│       ├── utils/                       # Prisma client, security, hashing, crypto helpers
│       ├── workers/                     # Autonomous scheduled worker tasks
│       └── index.ts                     # Fastify server bootstrapper & plugin loader
│
├── frontend/                            # Next.js / Vite React TypeScript Web App
│   └── src/
│       ├── app/                         # App Router / Page Views
│       │   ├── (auth)/                  # Login, registration, password recovery
│       │   ├── about/                   # Developer credits, version info, social links
│       │   ├── about-zenify/            # Platform architecture & feature overview
│       │   ├── admin/                   # Admin upload studio & system controls
│       │   ├── album/[id]/              # Album page with dominant artwork palette
│       │   ├── artist/[id]/             # Artist profile, top songs, discography
│       │   ├── discover/                # Daily mixes, new releases, personalized charts
│       │   ├── explore/                 # Genres, mood categories, regional music
│       │   ├── history/                 # User listening timeline & playback log
│       │   ├── library/                 # User saved tracks, albums, and playlists
│       │   ├── local-library/           # Offline device audio playback (IndexedDB)
│       │   ├── notifications/           # User activity & platform updates
│       │   ├── onboarding/              # First-time user language & artist picker
│       │   ├── payment/                 # Premium subscription & checkout
│       │   ├── playlist/[id]/           # Playlist view, song sorting, drag reorder
│       │   ├── pricing/                 # Plan comparison & feature tiers
│       │   ├── privacy/                 # Privacy policy & data protection
│       │   ├── profile/                 # User profile settings & avatar customizer
│       │   ├── radio/                   # Infinite smart radio stations
│       │   ├── search/                  # Global search results with live filtering
│       │   ├── section/                 # Dynamic curated horizontal section grid
│       │   ├── settings/                # Audio quality, crossfade, theme preferences
│       │   ├── terms/                   # Terms of service
│       │   ├── track/[id]/              # Single track landing view with lyrics
│       │   ├── globals.css              # Global Apple SF Pro typography & Tailwind CSS
│       │   ├── layout.tsx               # Root HTML wrapper, metadata, font declarations
│       │   └── page.tsx                 # Home dashboard feed
│       ├── components/                  # React UI Components
│       │   ├── account/                 # Profile edit, password reset, security forms
│       │   ├── admin/                   # Track upload studio, recent imports, analytics
│       │   ├── auth/                    # Login, signup, reset-password cards
│       │   ├── docs/                    # Architecture documentation viewer
│       │   ├── home/                    # Carousel hero, quick picks, section grids
│       │   ├── mobile/                  # Mobile-first components
│       │   │   ├── MobileLibraryPage.tsx
│       │   │   ├── MobileMediaCard.tsx
│       │   │   └── PremiumMobilePlayer.tsx # Full-screen touch swipeable player
│       │   ├── pc/                      # Desktop-exclusive components
│       │   │   ├── PCFullScreenPlayer.tsx  # Immersive full-screen desktop canvas
│       │   │   └── PCPlayerBar.tsx         # Bottom dock player capsule
│       │   ├── player/                  # Audio playback components
│       │   │   ├── audio-fx-menu.tsx    # StudioFX quick preset menu
│       │   │   ├── audio-fx-modal.tsx   # StudioFX 10-band equalizer dialog
│       │   │   ├── full-screen-player.tsx # Full player loader and state bridge
│       │   │   ├── global-audio.tsx     # Persistent audio engine & stream recovery
│       │   │   ├── PlayerKit.tsx        # Track controls (play/pause, skip, shuffle)
│       │   │   ├── PlayerProgress.tsx   # Waveform / timeline progress scrubber
│       │   │   └── queue-panel.tsx      # Up Next draggable playlist queue
│       │   ├── shared/                  # Reusable cross-page widgets
│       │   │   ├── AddSongsToPlaylistModal.tsx
│       │   │   ├── AddTrackToPlaylistModal.tsx
│       │   │   ├── ArtistLinks.tsx
│       │   │   ├── ArtworkMeshBackground.tsx # Reactive Apple Music ambient mesh
│       │   │   ├── DownloadModal.tsx    # StudioFX audio export & conversion
│       │   │   ├── DynamicBackground.tsx # Surface-aware background manager
│       │   │   ├── LiquidLyricsLine.tsx # Fluid spring karaoke synchronized lines
│       │   │   ├── LyricsView.tsx       # Fullscreen lyrics canvas with translation
│       │   │   └── UniversalMediaCover.tsx
│       │   ├── ui/                      # Primitive design system widgets (buttons, dropdowns)
│       │   ├── app-layout.tsx           # Global shell (Sidebar, TopBar, PlayerBar, Modals)
│       │   ├── player-bar.tsx           # Responsive PlayerBar switcher
│       │   ├── sidebar.tsx              # Dynamic-tinted left navigation sidebar
│       │   ├── top-bar.tsx              # Sticky header with search, language, profile
│       │   └── track-item.tsx           # Standard list row song component
│       ├── hooks/                       # Custom React Hooks
│       │   ├── useAlbumColor.ts         # Fast dominant color extractor with session cache
│       │   ├── useAudioControls.ts      # Play, pause, seek, volume dispatchers
│       │   ├── useDebounce.ts           # Input throttling for live search
│       │   ├── useDeviceDetect.ts       # Tablet / phone / desktop breakpoint listener
│       │   ├── useIsMobile.ts           # Reactive mobile view threshold detector
│       │   ├── useLocalLibrary.ts       # Offline IndexedDB tracks hook
│       │   └── useRefetchAudio.ts       # Dynamic audio stream renewal trigger
│       ├── lib/                         # Core Utilities & Engines
│       │   ├── api.ts                   # Axios client with bearer token & retry interceptors
│       │   ├── audio-engine.ts          # StudioFX Web Audio API DSP processor
│       │   ├── extract-palette.ts       # Vibrant / Canvas artwork color sampler
│       │   ├── id3Parser.ts             # Client-side MP3 metadata and album art decoder
│       │   ├── indic-transliterator.ts  # Romanization engine for Indian scripts
│       │   ├── theme.ts                 # Apple Music CSS token synchronizer
│       │   └── utils.ts                 # CDN URL resolver, formatters, and helpers
│       ├── services/                    # Client services (Local library storage)
│       ├── store/                       # Zustand Global State
│       │   ├── audio-fx-store.ts        # StudioFX equalizer & DSP parameters
│       │   ├── auth.ts                  # User session, JWT tokens, permissions
│       │   ├── player.ts                # Current track, playlist queue, play state
│       │   └── ui.ts                    # Modals, sidebars, toast alerts, fullscreen state
│       ├── types/                       # Client TypeScript interfaces
│       └── router.tsx                   # Client-side fallback routing table
│
├── flutter_app/                         # Zenify Mobile Client (Flutter / Dart)
│   └── lib/src/features/player/         # Mobile StudioFX and player presentation
├── docs/                                # Technical specifications & blueprints
├── PROJECT_STRUCTURE.md                 # This sitemap & architecture index
└── README.md                            # Project introduction & setup instructions
```

---

## 📐 Standards for Upcoming File Creation

When creating or modifying files in this repository, **strictly follow these rules**:

### 1. Minimal & Purpose-Driven Filenames
- **Rule**: Filenames must instantly describe their role without redundant words or artificial version suffixes (e.g., avoid `audio-fx-v2.tsx`, `new-player.tsx`, or `temp_script.js`).
- **Good Examples**: `audio-engine.ts`, `track-item.tsx`, `useAlbumColor.ts`.

### 2. Naming Conventions by Layer
- **React Components**: Use `PascalCase.tsx` for stand-alone view components (e.g., `LiquidLyricsLine.tsx`, `ArtworkMeshBackground.tsx`) or `kebab-case.tsx` for layout shells (e.g., `player-bar.tsx`, `track-item.tsx`).
- **React Hooks**: Always prefix with `use` in `camelCase.ts` (e.g., `useAlbumColor.ts`, `useAudioControls.ts`).
- **Utilities & Engines**: Use descriptive `kebab-case.ts` in `src/lib/` (e.g., `audio-engine.ts`, `extract-palette.ts`).
- **Zustand Stores**: Place in `src/store/` using `[domain].ts` or `[domain]-store.ts` (e.g., `audio-fx-store.ts`, `player.ts`).
- **Backend Handlers**: Maintain clear architectural suffixes:
  - `*.routes.ts` in `backend/src/routes/`
  - `*.service.ts` in `backend/src/services/`
  - `*.controller.ts` in `backend/src/controllers/`

### 3. Folder Placement & Ascending Order
- **No Scratch Files in `src/`**: One-off scripts belong in temporary scratch directories or `backend/src/scripts/`, never loose inside `frontend/src/`.
- **Single Source of Truth**: Never duplicate an existing engine or component to create a slightly modified version. Refactor or extend the existing component.
- **Zero Dead Code**: Delete unused or deprecated placeholder files (such as empty dummy components returning `null`) immediately.
