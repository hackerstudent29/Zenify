# Zenify Mobile (Android) — Technical Architecture & Overview

<div align="center">
  <img src="assets/images/z_logo.png" alt="Zenify Logo" width="100" />
  <h2>Zenify Android Client</h2>
  <p><b>Next-Generation Lossless Music & Video Streaming Platform</b></p>
  <p><i>Apple-Grade Editorial Aesthetic • 320kbps Pristine Audio • Hardware DSP Studio FX • Multi-User Room Together</i></p>
</div>

---

## 📑 Table of Contents
1. [Executive Summary](#-executive-summary)
2. [Application Specifications](#-application-specifications)
3. [System Requirements (Minimum & Recommended)](#-system-requirements-minimum--recommended)
4. [Technology Stacks & Architecture](#-technology-stacks--architecture)
   - [Frontend & UI Framework](#1-frontend--ui-framework)
   - [Native Android & Audio Engine](#2-native-android--audio-engine)
   - [Streaming, Network & Ingestion Layer](#3-streaming-network--ingestion-layer)
   - [Real-Time Social & WebRTC](#4-real-time-social--webrtc)
   - [Local Storage, Cache & Offline Database](#5-local-storage-cache--offline-database)
   - [Backend Services & Infrastructure](#6-backend-services--infrastructure)
5. [Core Architectural Features](#-core-architectural-features)
   - [ExoPlayer Media3 Native Audio/Video Pipeline](#1-exoplayer-media3-native-audiovideo-pipeline)
   - [Clean CDN & Zero 30-Second Previews Policy](#2-clean-cdn--zero-30-second-previews-policy)
   - [DSP Studio FX & Hardware Processing](#3-dsp-studio-fx--hardware-processing)
   - [Crossfade & Gapless Transition Engine](#4-crossfade--gapless-transition-engine)
   - [Real-Time Volume Normalization (-14 LUFS)](#5-real-time-volume-normalization--14-lufs)
   - [Mono Audio Channel Downmixing](#6-mono-audio-channel-downmixing)
   - [Fluid Mesh Canvas & Pure OLED Black Mode](#7-fluid-mesh-canvas--pure-oled-black-mode)
   - [16:9 Music Video Shelf & Dedicated Singles View](#8-169-music-video-shelf--dedicated-singles-view)
   - [Intelligent Wi-Fi Only Download Guardian](#9-intelligent-wi-fi-only-download-guardian)
   - [Word-by-Word Syllable-Synced Karaoke Lyrics](#10-word-by-word-syllable-synced-karaoke-lyrics)
   - [Room Together Multi-Device Spatial Sync](#11-room-together-multi-device-spatial-sync)
6. [Directory Layout](#-directory-layout)
7. [Build, Testing & Distribution](#-build-testing--distribution)

---

## 🌟 Executive Summary

**Zenify Mobile** is a high-performance Android music streaming client engineered for audiophiles, everyday listeners, and collaborative sessions. It combines an editorial Apple Music-grade interface with a custom native Android DSP engine powered by **AndroidX Media3 ExoPlayer**.

Unlike conventional wrappers, Zenify interfaces directly with low-level audio rendering pipelines, implementing custom PCM processors for spatial 8D audio, loudness normalization, parametric equalization, and dynamic video texture rendering with zero telemetry lag or intrusive advertisements.

---

## 📋 Application Specifications

| Attribute | Specification |
|---|---|
| **Application Name** | Zenify |
| **Package ID** | `com.zenify.mobile` |
| **Current Version** | `v1.1.22` |
| **Build Number** | `2036` |
| **Target OS** | Android 15 (API level 35) |
| **Minimum OS** | Android 8.0 (API level 26 - Oreo) |
| **Native Compilation** | Kotlin 2.0.21 / JVM 17 |
| **Cross-Platform Engine** | Flutter 3.44.2 / Dart 3.12.2 |
| **Universal APK Size** | `36.8 MB` (`38,635,649` bytes) |
| **ARM64 Optimized Split**| `16.2 MB` (`17,008,287` bytes) |
| **Audio Bitrates** | 320 kbps (Lossless/HQ), 160 kbps (Opus), 128 kbps (AAC), 70 kbps (Data Saver) |
| **Video Streaming** | 360p, 480p, 720p, 1080p, 4K (60fps) |

---

## ⚡ System Requirements (Minimum & Recommended)

### Hardware & OS Compatibility Matrix

| Requirement | Minimum (To Run the App) | Recommended (Optimal Experience) |
|---|---|---|
| **Android OS Version** | **Android 8.0 (Oreo / API 26)** | **Android 12 to Android 15 (API 31–35)** |
| **RAM** | **2 GB RAM** | **4 GB RAM or higher** |
| **Free Storage Space** | **100 MB** *(App install + database)* | **1 GB – 3 GB+** *(For offline songs & HD videos)* |
| **Processor (CPU)** | Quad-Core 1.5 GHz (ARM64-v8a / ARMv7) | Octa-Core 2.0 GHz+ (Snapdragon, MediaTek, Tensor) |
| **Display Resolution** | HD (720 × 1280 pixels) | FHD+ (1080 × 2400 pixels) or higher |
| **Display Refresh Rate**| Standard 60 Hz | 90 Hz / 120 Hz ProMotion displays |
| **Network (Streaming)** | 1.5 Mbps (3G / 4G / Wi-Fi) | 5–10 Mbps+ (4G LTE / 5G / High-Speed Wi-Fi) |
| **Offline Playback** | None (0 KB/s — Works 100% offline) | None |

### Detailed Performance & Resource Profiles

#### 1. Android OS Coverage
* **Minimum: Android 8.0 (API Level 26 - Oreo)**: Ensures broad backward compatibility with over 96% of all active Android devices globally (phones manufactured from 2017 to present).
* **Target: Android 15 (API Level 35)**: Features native edge-to-edge system gestures, predictive back transitions, dynamic themed adaptive icons, and low-latency Android Media3 notification and lock-screen controls.

#### 2. RAM Footprint & Budget
* **Idle & Background Audio**: Uses approximately **85 MB to 140 MB of RAM** during 320kbps audio streaming with DSP Studio FX active.
* **Music Video & Room Together**: Uses approximately **180 MB to 260 MB of RAM** when streaming live 1080p video textures accompanied by real-time LiveKit WebRTC room voice chat.
* **Why 2 GB RAM is sufficient**: ExoPlayer delegates audio demuxing and hardware video decoding directly to Android's native MediaCodec pipeline, preventing heavy garbage collection pauses in Flutter.

#### 3. Storage Footprint & Offline Sizing
* **Application Package Sizes**:
  * **ARM64 Split APK**: **~16.2 MB** (`17,008,287` bytes)
  * **Universal APK**: **~36.8 MB** (`38,635,649` bytes)
* **Installed Application Footprint**: **~45 MB – 65 MB** (app binary + SQLite index).
* **Offline Media File Sizing**:
  * **Single Audio Song (320kbps / 160kbps)**: **~3 MB to 6 MB** per track (`.m4a`).
  * **100 Downloaded Songs**: **~400 MB to 550 MB** of disk space.
  * **HD Music Video Single (720p/1080p)**: **~25 MB to 60 MB** per video (`.mp4`).
  * **Streaming Buffer Cache**: Auto-capped at **250 MB** by default (customizable between 0.1 GB to 1.0 GB in *Settings → Storage Management*).

#### 4. Network Bandwidth & Streaming Thresholds
* **Data Saver Mode (70kbps Opus)**: Streams reliably on low-bandwidth 2G/3G connections (~150–250 kbps).
* **Lossless / HQ Audio (320kbps)**: Requires a stable ~1.5 Mbps connection for instantaneous starts and zero buffer pauses.
* **1080p / 4K Music Videos**: Requires 5 Mbps to 15 Mbps.
* **Offline Mode**: Completely network-independent. Downloaded audio, videos, synced lyrics, and artwork function with 0 network usage.

---

## 🛠 Technology Stacks & Architecture

### 1. Frontend & UI Framework
* **Flutter SDK (`v3.44.2`) & Dart (`v3.12.2`)**: High-framerate UI rendering supporting native 60Hz and 120Hz ProMotion display panels.
* **Design System & Aesthetics**:
  * **Typography**: Bundled offline Apple `SF Pro Display` & `SF Pro Text` typography (zero runtime Google Fonts requests).
  * **Surfaces**: Custom `AppleGlass` frosted backdrop filters, dynamic specular rim lighting, and fluid glass shaders.
  * **Physics**: Damped harmonic oscillator springs (`SpringDescription`) replicating iOS gesture responsiveness.
  * **Backgrounds**: Multi-section organic wave canvas splits (`bg-white` / `#F3F3F2` in light mode, `#121214` / `#18181B` neutral charcoal in dark mode) with pure OLED `#000000` blackout support.
* **State Management**:
  * Decoupled `ChangeNotifier` and `ValueNotifier` architecture.
  * Isolated 120fps scrubbers via `positionNotifier` to eliminate unnecessary widget re-renders during playback.

### 2. Native Android & Audio Engine
* **AndroidX Media3 ExoPlayer (`1.9.2`)**: Industry-standard media streaming core providing robust `LoadControl` buffer management, native audio focus handling, and low-latency chunk parsing.
* **Kotlin Native Plugins (`ZenAudioPlugin.kt`)**: Bidirectional platform channels (`MethodChannel` & `EventChannel`) bridging Flutter and native Android audio threads.
* **Native Audio Processing (`ZenFxProcessor.kt`)**: Custom `BaseAudioProcessor` operating directly on 16-bit PCM audio buffers:
  * **3-Band Parametric Equalizer**: Low Shelf, Peaking Mid, and High Shelf biquad IIR filters with ±12 dB gain adjustment.
  * **Spatial 8D Audio Rotation**: Dynamic ITD (Interaural Time Difference) and IID (Interaural Intensity Difference) orbital simulator.
  * **Dynamic Compressor & Limiter**: Lookahead peak limiter with fast attack and soft exponential release curves.
  * **Loudness Normalizer**: -14 LUFS gain adjustment matching YouTube loudness tags.
  * **Stereo-to-Mono Downmixer**: Real-time channel averaging `(L + R) * 0.5f`.
* **Hardware Video Decoders**: `SurfaceTexture` / `TextureRegistry` video pipeline rendering live YouTube streams directly into Flutter textures without intermediate view hierarchies.

### 3. Streaming, Network & Ingestion Layer
* **InnerTubeX Parser**: Integrated Kotlin client (`com.metrolist.innertube`) rotating client spoofing tokens (`ANDROID_VR`, `IOS`, `WEB_REMIX`) for uninterrupted playback.
* **Visitor & PO Token Generator (`PoTokenGenerator.kt`)**: Cryptographic attestation generator eliminating YouTube `HTTP 403 Forbidden` / `Sign in to confirm you're not a bot` obstacles.
* **Akamai & Clean CDN Resolution (`CleanCdnAudioService`)**: Direct resolution of pristine 320kbps audio files for regional (Tamil, Telugu, Hindi, Malayalam, Punjabi) and international releases.
* **RefusedRetryDataSource**: Resilience interceptor that automatically retries broken sockets and shifts to alternate chunk CDN endpoints without stuttering.
* **OkHttp 4 & Byte-Range Caching**: Native HTTP 206 Partial Content range requests enabling instantaneous seeking and streaming cache re-use.

### 4. Real-Time Social & WebRTC
* **WebSockets (`ws://`, `/ws/together`)**: Low-overhead bidirectional socket connection handling room participant rosters, track synchronizations, and DJ queue operations.
* **LiveKit WebRTC (`livekit_client`)**: Sub-100ms ultra-low latency voice chat engine allowing users in a Room Together session to talk and listen concurrently.
* **Synced Micro-Ticks**: Precision timekeeper synchronizing song timestamps to within ±15 milliseconds across geographically distributed devices.

### 5. Local Storage, Cache & Offline Database
* **SQLite Database (`sqflite 2.4.5`)**: High-speed relational database indexing offline library tracks, playlists, playback history, and listening stats.
* **Encrypted Storage (`flutter_secure_storage 9.2.4`)**: Hardware-backed AES-256 keychain storing user credentials and auth tokens.
* **Disk Media Cache (`path_provider 2.1.5`)**: Multi-tiered disk cache storing offline `.m4a` audio, `.mp4` video singles, compressed album artwork, and synced `.lyrics.json` files.
* **SharedPreferences**: Instant key-value store for local UI states, EQ sliders, and playback toggles.

### 6. Backend Services & Infrastructure
* **Backend Runtime**: Node.js & Fastify API server with TypeScript strict mode.
* **Database & Caching**: PostgreSQL (hosted on Neon) coupled with Serverless Redis (Upstash) for session caches and leaderboards.
* **Object Storage**: Cloudflare R2 bucket (`pub-2e8a5f55356644999b77124c45ef0753.r2.dev`) hosting persistent lossless media and metadata.

---

## 🎯 Core Architectural Features

### 1. ExoPlayer Media3 Native Audio/Video Pipeline
The Android client utilizes a unified `ExoPlayer` instance that splits audio and video tracks intelligently:
* Audio plays continuously in the background using `AudioSink` with offload disabled to guarantee DSP continuity.
* When a music video is displayed, Flutter allocates a native texture (`TextureRegistry.SurfaceTextureEntry`), which attaches to ExoPlayer via `setVideoSurface()`.
* When dismissed or backgrounded, `clearVideoSurface()` is called immediately to conserve GPU cycles and battery while audio plays on seamlessly.

### 2. Clean CDN & Zero 30-Second Previews Policy
Zenify enforces a strict ban on 30-second iTunes snippets (`mzstatic.com`, `apple.com/preview`).
* All tracks resolve through JioSaavn 320kbps Akamai CDN or full-length YouTube streaming proxies.
* If a playback error occurs, the client automatically triggers `/tracks/:id/refetch-audio` for full song recovery rather than falling back to low-quality previews.

### 3. DSP Studio FX & Hardware Processing
Built into `ZenFxProcessor.kt`, the DSP engine operates at 44.1kHz / 48kHz:
* **Equalizer**: 32Hz–16kHz bands with zero-latency IIR biquad structures.
* **8D Spatial Audio**: Simulates an orbital listener head-related impulse response, sweeping sound across the stereo soundstage at customizable RPM speeds.
* **Vocal Isolator & Clarity**: Inverts and scales center-panned vocal frequencies to enhance instrumentals or elevate vocal definition.

### 4. 20 DJ Crossfade Styles & Gapless Transition Engine
* Dual ExoPlayer design (`player` and `fadePlayer`) coordinated by an Android `ValueAnimator`.
* Choose from **20 DJ-grade transition styles** with customizable **1s to 12s** fade curves alongside standard `0s` gapless playback.

### 5. Real-Time Volume Normalization (-14 LUFS)
* Intercepts YouTube loudness metadata (`loudnessDb`).
* Dynamically calculates target linear gain:
  $$\text{gain} = 10^{\frac{-\text{loudnessDb}}{20}}$$
* Automatically boosts quiet tracks and attenuates overly loud recordings, maintaining a consistent listening level across different albums and eras.

### 6. Mono Audio Channel Downmixing
* Accessibility-first channel combiner.
* When enabled in Settings, the DSP engine averages both channels before and after effect processing:
  $$M = \frac{L + R}{2}$$
* Guarantees listeners with single-sided hearing impairment or single-earbud listeners never miss stereo-separated instruments or vocals.

### 7. Fluid Mesh Canvas & Pure OLED Black Mode
* The Now Playing backdrop features `BleedBackdrop`, which samples dominant palette colors from the cover artwork and animates gentle fluid color waves.
* **Pure Black Mode**: When "Fluid Mesh Canvas" is turned off, the player shell renders a solid `#000000` canvas with zero color bleed and transparent ambient glow, maximizing battery efficiency on OLED displays.

### 8. 16:9 Music Video Shelf & Dedicated Singles View
* **Home Screen**: Features a dedicated horizontal "Music Videos" shelf with 16:9 widescreen thumbnails, clean track titles, and artist names without cluttering audio shelves.
* **Single Track View**: Tapping a video song routes to `AlbumScreen(isVideo: true)`, which adjusts the hero card geometry to a **16:9 widescreen rectangle** (`insetW * 9 / 16`) and displays related videos by that artist instead of fake album tracklists.

### 9. Intelligent Wi-Fi Only Download Guardian
* Monitors hardware network capabilities via Android's `ConnectivityManager`:
  * `NetworkCapabilities.TRANSPORT_WIFI`
  * `NetworkCapabilities.TRANSPORT_ETHERNET`
* When "Download on Wi-Fi Only" is toggled in Settings, cellular downloads are blocked automatically to protect user mobile data limits.

### 10. Word-by-Word Karaoke, Stationary Plain Lyrics & Song Credits
* Parses synced LRC and InnerTube JSON lyrics into word-level timestamps, plus a dedicated stationary plain-text full lyrics view with persistent Dock & MiniPlayer navigation and full `SongCreditsScreen` metadata.
* Covers **50+ global and regional languages** with script romanization, `• • •` instrumental countdown indicators, and interactive lyric seek jumping.

### 11. Room Together, Sound Atlas (177 Countries) & Replay Insights
* **Room Together**: Collaborative listening rooms supporting up to 100 concurrent participants with role-based access control (Host, Co-Host, DJ, Guest), synchronized song queues, reactions, Story Moments, and LiveKit voice chat.
* **Sound Atlas Global Discovery**: Interactive 177-country vector world map, 76 curated cities, and 11 live country chart feeds (`IN`, `US`, `GB`, `DE`, `CA`, `AU`, `JP`, `FR`, `BR`, `KR`, `AE`).
* **Replay & Insights + Story Sharing**: 27 listening telemetry metrics with monthly/all-time Replay recaps and 16 share card export templates.
* **16:9 4K Video Theater & Offline `.mp4` Downloads**: Dual landscape/portrait 4K video toggle, background playback continuity, and concurrent offline audio + `.mp4` video downloads.

---

## 📂 Directory Layout

```text
mobile/
├── android/                                  # Native Android Studio project
│   └── app/src/main/kotlin/com/
│       ├── metrolist/innertube/              # Native Kotlin YouTube Music InnerTube parser
│       │   └── models/                       # Response models & decoders
│       └── zenify/mobile/
│           ├── MainActivity.kt               # Flutter engine lifecycle & window insets
│           ├── audio/                        # Core Audio & DSP subsystem
│           │   ├── ZenAudioPlugin.kt         # MethodChannel & ExoPlayer bridge
│           │   └── ZenFxProcessor.kt         # Custom 16-bit PCM AudioProcessor (EQ, 8D, Normalizer)
│           └── yt/                           # YouTube stream proxy & crypto
│               ├── PoTokenGenerator.kt       # Visitor attestation & PO token generator
│               ├── RefusedRetryDataSource.kt # Connection resiliency interceptor
│               ├── StreamUrlCache.kt         # Memory & disk URL cache
│               ├── YtDataSource.kt           # Custom ExoPlayer DataSource factory
│               └── YtEngine.kt               # Direct client resolution engine
├── assets/                                   # Offline bundled assets
│   ├── fonts/                                # SF Pro Display & SF Pro Text TTF fonts
│   ├── images/                               # Brand logos, covers & banners
│   └── lrc/                                  # Fallback synced karaoke lyrics
├── lib/                                      # Flutter application code
│   ├── atlas/                                # Sound Atlas musical exploration
│   ├── core/theme/                           # Theme tokens & typography
│   ├── data/                                 # Static catalog data sources
│   ├── design_system/                        # Reusable Apple design components
│   │   ├── apple/                            # Apple Music layout primitives
│   │   ├── tokens/                           # AppColors, typography, paddings
│   │   └── widgets/                          # AppleGlass, SpringPress, ZenDropdown
│   ├── features/                             # Modular application features
│   │   ├── replay/                           # Annual listening insights & replay
│   │   └── story_sharing/                    # Instagram/Snapchat story card generator
│   ├── models/                               # Data models (Track, Album, Artist, User)
│   ├── services/                             # Core singleton business services
│   │   ├── download_service.dart             # Offline media storage manager
│   │   ├── innertube_service.dart            # Search & recommendations engine
│   │   ├── lyrics_service.dart               # Synced karaoke lyrics fetcher
│   │   ├── player_state.dart                 # High-level playback & queue manager
│   │   ├── settings_service.dart             # Local preferences & cloud sync
│   │   ├── stream_resolver_service.dart      # Akamai CDN & stream resolution
│   │   └── zen_player.dart                   # Low-level platform channel interface
│   ├── utils/                                # Helpers & string normalizers
│   ├── views/                                # Application screens & tabs
│   │   ├── details/                          # AlbumScreen & ArtistScreen
│   │   ├── home/                             # HomeScreen with Music Videos shelf
│   │   ├── library/                          # LibraryScreen with Dual Tabs (Songs/Videos)
│   │   ├── player/                           # PlayerShell, QueuePanel, StudioFXSheet
│   │   ├── profile/                          # ProfileScreen & edit sheets
│   │   ├── room_together/                    # RoomTogetherScreen & chat
│   │   ├── search/                           # SearchScreen with category tiles
│   │   └── settings/                         # SettingsScreen configuration
│   └── main.dart                             # Application bootstrap & dependency injection
├── pubspec.yaml                              # Dependencies & package metadata
└── ZENIFY_ANDROID_APP.md                     # Technical architecture documentation
```

---

## 🔨 Build, Testing & Distribution

### Building Universal & Split APKs

```bash
# 1. Fetch dependencies
flutter pub get

# 2. Analyze code quality
flutter analyze lib/

# 3. Build optimized release APK (Universal)
flutter build apk --release

# 4. Build architecture-split release APKs (ARM64, ARMv7, x86_64)
flutter build apk --split-per-abi --release
```

Generated packages will be located in:
* `build/app/outputs/flutter-apk/app-release.apk` (Universal)
* `build/app/outputs/flutter-apk/app-arm64-v8a-release.apk` (Optimized ARM64, ~16.2 MB)

---

## 🛡️ License & Trademarks

All proprietary brand elements, logos, and custom UI components are part of the **Zenify Music Project**. Third-party open-source libraries are licensed under their respective MIT, Apache 2.0, and BSD licenses.
