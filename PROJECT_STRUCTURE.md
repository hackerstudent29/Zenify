# Zenify Architecture, File Map & Navigation Guide

This document is the **single source of truth** for navigating, organizing, and developing inside the Zenify codebase. It provides an immediate quick-lookup index for key systems (such as the StudioFX engine), a complete alphabetical tree directory, and strict naming conventions for upcoming file creations.

---

## ⚡ Quick Search ("Where Is It?")

| Feature / Engine | Primary File Path | Description |
|---|---|---|
| **Studio FX Audio Engine** | [`frontend/src/lib/audio-engine.ts`](file:///d:/.gemini/Zenify/frontend/src/lib/audio-engine.ts) | Comprehensive Web Audio API DSP pipeline: 3-band EQ, reorderable FX chain (6 modules), native vocal isolation, 8D spatial audio, DJ-style filter, chorus/echo/reverb, stereo width, speed/pitch control, night mode compression. |
| **Studio FX Glass Panel UI** | [`frontend/src/components/player/audio-fx-modal.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/player/audio-fx-modal.tsx) | 320px right-side collapsible glass panel with 6 accordion sections: Presets (10+ built-in), Tune (EQ/Filter/Warmth), Space (Reverb/Echo/Chorus/Width/8D), Voice (Vocal Isolation), Chain (FX Reordering), Tempo (Speed/Pitch). |
| **Player State & Queue** | [`frontend/src/store/player.ts`](file:///d:/.gemini/Zenify/frontend/src/store/player.ts) | Zustand store with 3-tier queue system (userQueue, contextQueue, playHistory), repeat modes (off/one/two/all), shuffle logic, audioFx settings persistence, vibe-based autoplay. |
| **Global Audio Engine** | [`frontend/src/lib/audio-engine.ts` (class ZenAudioEngine)](file:///d:/.gemini/Zenify/frontend/src/lib/audio-engine.ts) | Dual-buffer gapless playback engine with HTML5 `<audio>` elements, crossfade control, automatic stream recovery, multi-tier CDN fallbacks, and live parameter interpolation. |
| **Desktop Player Bar** | [`frontend/src/components/pc/PCPlayerBar.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/pc/PCPlayerBar.tsx) | Horizontal bottom bar with timeline scrubber, volume slider, Studio FX toggle, queue panel trigger, and playback controls. |
| **Desktop Fullscreen Player** | [`frontend/src/components/pc/PCFullScreenPlayer.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/pc/PCFullScreenPlayer.tsx) | Immersive Apple Music-style overlay with reactive palette background, integrated lyrics, and fullscreen controls. |
| **Mobile Player Sheet** | [`frontend/src/components/mobile/PremiumMobilePlayer.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/mobile/PremiumMobilePlayer.tsx) | Bottom mini-bar expanding to full-height swipeable player card with touch-optimized controls and glass styling. |
| **Queue Management Panel** | [`frontend/src/components/player/queue-panel.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/player/queue-panel.tsx) | Right-side 320px glass panel showing User Queue + Context Queue with drag-and-drop reordering, play controls, and track promotion. |
| **Synced Lyrics Display** | [`frontend/src/components/shared/LyricsView.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/shared/LyricsView.tsx) | Real-time karaoke-style synchronized lyrics with word-level timing, romanized transliterations, autoscroll, and manual offset adjustment. |
| **Dynamic Reactive Backgrounds** | [`frontend/src/components/shared/DynamicBackground.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/shared/DynamicBackground.tsx) | Palette-based reactive mesh animation that extracts colors from album art and pulses with music beat. |
| **Album Color Extraction** | [`frontend/src/lib/theme.ts`](file:///d:/.gemini/Zenify/frontend/src/lib/theme.ts) | High-speed dominant color extraction with debouncing, syncing CSS variables (`--page`, `--side`, `--album-rgb`) for Apple Music-style theming. |
| **Lyric Enrichment Service** | [`backend/src/services/lyric-enrichment.service.ts`](file:///d:/.gemini/Zenify/backend/src/services/lyric-enrichment.service.ts) | 24/7 autonomous worker with Deepgram AI onset alignment, multi-source fetching (LRCLib, lrc.red, STT), instrumental gap detection, and atomic processing with retry logic. |
| **Deepgram Lyrics AI** | [`backend/src/services/deepgram-lyrics.service.ts`](file:///d:/.gemini/Zenify/backend/src/services/deepgram-lyrics.service.ts) | Speech-to-text lyric transcription, onset alignment verification, word-level timing generation, and plain lyrics syncing. |
| **Romanization Service** | [`backend/src/services/romanization.service.ts`](file:///d:/.gemini/Zenify/backend/src/services/romanization.service.ts) | Automatic romanization for Tamil, Hindi, Telugu, Malayalam, Kannada, Bengali, Punjabi, Gujarati with synced timing preservation. |
| **Recommendation Engine** | [`backend/src/services/recommendation-engine.service.ts`](file:///d:/.gemini/Zenify/backend/src/services/recommendation-engine.service.ts) | Vibe-based smart radio analyzing mood, tempo, genre, language, and artist similarity for autoplay queue generation. |
| **Audio Streaming Proxy** | [`backend/src/routes/utils.routes.ts`](file:///d:/.gemini/Zenify/backend/src/routes/utils.routes.ts) | `/stream-youtube` HTTP 206 partial content proxy with container header preservation and multi-tier resolution. |
| **Track Upload Studio** | [`frontend/src/app/admin/page.tsx`](file:///d:/.gemini/Zenify/frontend/src/app/admin/page.tsx) | Admin console for track uploads with metadata editing, audio file processing, and artwork assignment. |
| **Local Offline Library** | [`frontend/src/app/local-library/page.tsx`](file:///d:/.gemini/Zenify/frontend/src/app/local-library/page.tsx) | IndexedDB-powered local file player with MP3/FLAC/WAV/M4A/AAC support, ID3 tag extraction, and embedded cover art parsing. |
| **Track Page** | [`frontend/src/app/track/[id]/TrackPage.tsx`](file:///d:/.gemini/Zenify/frontend/src/app/track/[id]/TrackPage.tsx) | Single track landing page with lyrics display, recommendations, and reactive background. |
| **Artist Page** | [`frontend/src/app/artist/[id]/ArtistPage.tsx`](file:///d:/.gemini/Zenify/frontend/src/app/artist/[id]/ArtistPage.tsx) | Artist profile with discography, top tracks, biography, related artists, and reactive hero background. |
| **Album Page** | [`frontend/src/app/album/[id]/AlbumPage.tsx`](file:///d:/.gemini/Zenify/frontend/src/app/album/[id]/AlbumPage.tsx) | Album view with track listings, metadata, palette-based theming, and play controls. |
| **Settings Modal** | [`frontend/src/components/settings/SettingsModal.tsx`](file:///d:/.gemini/Zenify/frontend/src/components/settings/SettingsModal.tsx) | Comprehensive user preferences with 4 tabs: Audio (quality, crossfade, autoplay), Interface (theme, reactive backgrounds), Playback (keyboard shortcuts), Account (profile, notifications). |

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
