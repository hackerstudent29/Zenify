# Zenify v1.1.22 — Zendrum Rebrand, Media3 1.9.2 Fix, Credits & Navigation Release

**Release Version:** `v1.1.22`  
**Build Number:** `2036`  
**Date:** November 25, 2026  
**Package:** `zenify-v1.1.22.apk` (ARM64 · `16.2 MB`) / `zenify-v1.1.22-universal.apk` (Universal · `36.8 MB`)

---

## 🌟 What's New in v1.1.22

### 1. 🎨 New Zendrum Instrument Identity (`zenify-brand-kit`)
- **Android App Icon**: Replaced the legacy launcher icon across all densities (`mdpi`–`xxxhdpi`), adaptive layers (`foreground`, `background`, `monochrome`), round icons, and launcher background color (`#FFFFFF`) with the white background + rose Zendrum emblem.
- **Website & Repo Favicons**: Switched all browser favicons (`favicon.svg`, `favicon.ico`, `favicon-*.png`, `favicon_transparent.png`, `favicon_z_512.png`, `mobile/web/favicon.png`) and `"Z"`-only marks (`z_logo.png`, `z_logo_black.png`, `logo-square-dark.png`) to the transparent rose Zendrum emblem while preserving full `"ZENIFY"` wordmark lockups and the animated splash.

### 2. 📜 Dedicated Song Credits & Stationary Plain Lyrics
- **Full Song Credits (`SongCreditsScreen` & `SongCreditsService`)**: Dedicated credits page showing performing artists, movie/soundtrack cast, composers, lyricists, production roles, soundtrack album links, and gated `View Lyrics` access (dimmed when unavailable).
- **Stationary Plain `View Lyrics` (`FullLyricsScreen`)**: Rebuilt as a pure static full-text reader (`SingleChildScrollView` + `SelectableText`) with LRC/word-tag stripping, RTL/BiDi directional preservation, stationary `DynamicIslandHeader`, and zero scroll-driven dock movement.

### 3. 🧭 Persistent Dock & MiniPlayer Navigation Continuity
- **Unified In-Shell Navigation (`ShellNavigationScope`)**: Routed `View Credits`, `View Lyrics`, `Artist`, `Album`, and `Category` transitions from `PlayerShell`, `QueuePanel`, `ZenDropdown`, `showArtistPopup`, `MediaNavigationSheet`, and Home modal sheets inside the active tab navigator so the bottom Dock and MiniPlayer remain visible across sub-pages.
- **Bottom Scroll Clearance**: Added `180 + safeBottom` bottom padding across Artist, Album, Library, Song Credits, Full Lyrics, and Sound Atlas screens so footer text and lists never hide behind the Dock or MiniPlayer.

### 4. 📱 Rigid 90° Player Morph, Landscape Video Controls & Liquid Glass UI
- **Portrait ↔ Landscape Rotation Morph**: Added rigid 90° rotation transitions across `PlayerShell` components (`player_kit.dart`, `ScrubberSlider` neutral white time labels, `BleedArtwork`).
- **Landscape Video Controls**: Added ±10s skip controls, double-tap seek accumulation, centered Lyrics/Queue actions, fit/fill viewport zoom toggle, and gesture shielding over bottom controls.
- **Transparent Liquid Glass Surfaces**: Refined Top Picks cards and hero banners on Home/Details pages with clean transparent liquid-glass styling.

### 5. 🔍 Smart Single / Album / Video Routing, Downloads & Search Parity
- **Soundtrack & Album Resolution (`AlbumResolver`, `MediaRouter`, `MediaNavigationSheet`)**: Singles stay cleanly on their Single view with multi-artist/album redirection sheets instead of jumping to unrelated albums or unplugged versions; soundtrack/movie names like `(From "Movie")` resolve accurately.
- **Video Downloads & Offline Caching**: Added video track download support in `DownloadService` alongside offline artwork/LRC isolation.
- **YouTube Music Search & Metadata Parity**: Upgraded `ZenInnerTubePlugin`, `YouTube.kt`, `PageHelper.kt`, `MediaNormalizer`, and `SearchParser`/`SearchRanker` for release-type badges, clean `Title + Year` video cards, and accurate artist extraction.

---

## 🛠️ Fixes & Improvements

- **Media3 `1.9.2` Playback & `LoadControl` Fix**: Aligned `:app` Media3 dependencies to `1.9.2` in `mobile/android/app/build.gradle.kts` and replaced `object : LoadControl by baseLoadControl` in `ZenAudioPlugin.kt` with explicit delegation of every `LoadControl` method (`getBackBufferDurationUs(PlayerId)`, `retainBackBufferFromKeyframe(PlayerId)`, `onPrepared`, `onTracksSelected`, `onStopped`, `onReleased`, `getAllocator`, `shouldContinueLoading`, `shouldStartPlayback`, `shouldContinuePreloading`). Fixes `PlatformException(zen_audio, getBackBufferDurationUs not implemented, null, null)` across song, fallback stream, and video playback.
- **Audio Focus, Power & System Volume Sync**: Added native `AudioFocusRequest` + `AudioPlaybackCallback` interruption/resume handling, network buffering throttling (`allowNetworkBuffering`), Android `STREAM_MUSIC` volume observer/sync, and accurate `getPosition` playback snapshots in `ZenAudioPlugin.kt` & `ZenPlayer`.
- **Lyrics Engine Upgrades**: Improved `LyricsService` & `LrcParser` overlapping line tail-glow highlighting, Arabic/RTL & mixed BiDi line rendering, duration-mismatch retry, and Room Together lyrics sync.
- **Automated Test Coverage**: Added and updated widget & unit test suites across `full_lyrics_screen_test.dart`, `song_credits_test.dart`, `player_lyrics_test.dart`, `media_navigation_sheet_test.dart`, `album_resolver_test.dart`, `audio_focus_test.dart`, `bleed_artwork_test.dart`, `island_notification_test.dart`, `lyrics_service_test.dart`, `media_normalizer_video_test.dart`, `search_pipeline_test.dart`, and `video_download_test.dart`.

---

## 🔒 Backend & Infrastructure Changes

- **Website Disconnection & Key Cleanup**: Removed Vercel AI Gateway, NVIDIA, OpenRouter, Replicate, Deepgram, QuickLRC, Happi, and Cloudflare R2 credentials/integrations from web/backend services while migrating Room Together cover uploads to Cloudinary and keeping Android streaming, auth, mail, and wallet APIs intact.
- **Release Automation**: Added automated `notes-file` release notes publishing in `.github/workflows/release.yml` and documented the full release checklist in the `zenify-release` skill.

---

## 📦 Release Packages

| Package | Architecture | Size | Download |
|---|---|---|---|
| **Android ARM64 (Recommended)** | `arm64-v8a` | `16.2 MB` (`17,008,287` bytes) | [zenify-v1.1.22.apk](https://github.com/hackerstudent29/Zenify/releases/download/v1.1.22/zenify-v1.1.22.apk) |
| **Android Universal** | `arm64-v8a`, `armeabi-v7a`, `x86_64` | `36.8 MB` (`38,635,649` bytes) | [zenify-v1.1.22-universal.apk](https://github.com/hackerstudent29/Zenify/releases/download/v1.1.22/zenify-v1.1.22-universal.apk) |
