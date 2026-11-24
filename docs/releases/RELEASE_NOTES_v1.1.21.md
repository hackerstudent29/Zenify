# Zenify v1.1.21 — Stable Version 1

> 🎉 **Milestone:** Zenify v1.1.21 is the official **First Stable Version (Stable Version 1)** of Zenify for Android!

**Release Version:** `v1.1.21 (Stable Version 1)`  
**Build Number:** `2035`  
**Milestone:** `Stable Release 1`  
**Date:** November 24, 2026  
**Package:** `zenify-v1.1.21.apk` (ARM64) / `zenify-v1.1.21-universal.apk` (Universal)

---

## 🌟 What's New in Stable Version 1 (v1.1.21)

Zenify v1.1.21 represents the **first production-grade stable release** of the complete Flutter Android client, delivering hardware-accelerated Media3 audio/video streaming, pure YouTube Music search parity, and seamless performance:

### 1. 🔍 Pure YouTube Music Search Parity
- **Unrestricted Discovery**: Search queries now yield 1:1 parity with YouTube Music. Video songs, official studio audio, verified artists, official albums, and playlists now display cleanly without artificial candidate dropping.
- **Popularity & Catalog Integrity**: Restored full shelves and carousels for albums and playlists, ensuring high-intent queries locate famous tracks and records instantly.

### 2. 🎬 16:9 Landscape Video Previews
- **Unified Landscape Thumbnails**: Video songs are now rendered in their native 16:9 widescreen ratio in Search History (`76x44`), Search Rows, the Playback Queue (`QueuePanel`), and Room Together listening rooms.
- **Visual Distinction**: Eliminates cropped square thumbnails for videos so users can immediately distinguish video songs from audio studio tracks.

### 3. ⚡ Instant Search History Playback
- **Direct 1-Tap Play**: Tapping any song or video from your recent search history now immediately queues and plays the media instead of re-executing a search query.
- **Direct Navigation**: Tapping an artist or album from history navigates straight to their dedicated page.

### 4. 🚀 Ultra-Fast Parallel Lyrics Engine with Video Skip
- **Parallel Multi-Provider Racing**: Fast concurrent racing between `lrc.red` and `lrclib.net` delivers syllable-synced lyrics in sub-300ms.
- **Video Song Skip**: Video songs automatically skip lyric resolution requests, eliminating latency and network overhead.
- **Cache v12**: Upgraded to persistent cache v12 with automated invalidation of stale cache entries.

### 5. 🎛️ 20-Style Hardware DJ Crossfade & Studio FX
- **ExoPlayer Dual Pipeline**: Real-time gapless playback and overlapping transitions across 20 distinct DJ crossfade styles (Auto, Smooth, Bass Swap, Stutter Gate, Tape Stop, Vinyl Brake, etc.).
- **Studio DSP Engine**: 3-band parametric hardware equalizer, 8D spatial audio orbital rotation, loudness normalization (-14 LUFS), and $(L+R)/2$ mono downmixing.

### 6. 📢 Web Player Deprecation & Migration Notice
- Informs web player users about upcoming service sunset due to browser audio limitations, ISP blockages, and CORS constraints.
- Direct download link to install the Zenify Android App for unrestricted 320kbps playback, background listening, and offline support.
- Link to Star ⭐ Zenify on GitHub (`https://github.com/hackerstudent29/Zenify`).

---

## 📦 Release Packages
- **Android ARM64 (Recommended)**: [zenify-v1.1.21.apk](https://github.com/hackerstudent29/Zenify/releases/download/v1.1.21/zenify-v1.1.21.apk)
- **Android Universal**: [zenify-v1.1.21-universal.apk](https://github.com/hackerstudent29/Zenify/releases/download/v1.1.21/zenify-v1.1.21-universal.apk)
- **Web App**: [listenzenify.vercel.app](https://listenzenify.vercel.app)

