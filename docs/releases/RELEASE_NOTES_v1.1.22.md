# Zenify v1.1.22 — Brand Identity, Navigation, Media3 & Security Release

**Release Version:** `v1.1.22`  
**Build Number:** `2036`  
**Date:** November 25, 2026  
**Package:** `zenify-v1.1.22.apk` (ARM64) / `zenify-v1.1.22-universal.apk` (Universal)

---

## 🌟 Highlights in v1.1.22

### 1. 🎨 New Zendrum Instrument Identity
- **Android Adaptive & Legacy Icons**: Updated all Android launcher icons (`mdpi`–`xxxhdpi`, adaptive foreground/background/monochrome, and round icons) with the white background and rose Zendrum instrument emblem (`#D81B3C`).
- **Website & Repo Favicons**: Switched browser favicons (`favicon.svg`, `favicon.ico`, `favicon-*.png`, `favicon_transparent.png`, `favicon_z_512.png`, `mobile/web/favicon.png`) to the transparent rose Zendrum symbol, while preserving full `"ZENIFY"` wordmark lockups and the animated 6-letter splash.

### 2. 🔊 Media3 1.9.2 Playback & `LoadControl` Fix
- Aligned `:app` Media3 compile dependencies (`androidx.media3:media3-*:1.9.2`) with the runtime dependency graph and explicitly forwarded every `LoadControl` interface method (including `getBackBufferDurationUs(PlayerId)`, `retainBackBufferFromKeyframe(PlayerId)`, and `shouldContinuePreloading(...)`) in `ZenAudioPlugin.kt`, eliminating `PlatformException(zen_audio, getBackBufferDurationUs not implemented)` during audio and video initialization.
- Added audio focus interruption recovery, system media volume observer/sync, and accurate `getPosition` playback snapshotting.

### 3. 🧭 Dock & Miniplayer Navigation Preservation + Plain Lyrics View
- Routed View Credits, View Lyrics, Artist, Album, and Category navigation inside `ShellNavigationScope` so the bottom dock and persistent miniplayer stay visible across sub-pages with safe bottom scroll clearance (`safeBottom + 180`).
- Rebuilt `FullLyricsScreen` as a stationary plain-text viewer (`SingleChildScrollView` + static `SelectableText` with LRC tag stripping and RTL directionality preservation) so vertical scrolling no longer shifts screen layout.

### 4. 💿 Soundtrack Metadata & Video Search Parity
- Improved `AlbumResolver` and `SongCreditsService` soundtrack/movie album extraction (`(From "Movie")`) so singles resolve cleanly to their soundtrack/movie album rather than duplicating the song title.
- Improved native InnerTube search parity and video detection in `MediaNormalizer` / `SearchParser`.

### 5. 🔒 Web AI/R2 Key Disconnection
- Removed Vercel AI Gateway, NVIDIA, OpenRouter, Replicate, Deepgram, QuickLRC, Happi, and Cloudflare R2 keys from website/backend configs and isolated Room cover uploads to Cloudinary while keeping all Android streaming, auth, mail, and wallet endpoints intact.

---

## 📦 Release Packages
- **Android ARM64 (Recommended)**: [zenify-v1.1.22.apk](https://github.com/hackerstudent29/Zenify/releases/download/v1.1.22/zenify-v1.1.22.apk) (`16.2 MB`, `17,008,287` bytes)
- **Android Universal**: [zenify-v1.1.22-universal.apk](https://github.com/hackerstudent29/Zenify/releases/download/v1.1.22/zenify-v1.1.22-universal.apk) (`36.8 MB`, `38,635,649` bytes)
