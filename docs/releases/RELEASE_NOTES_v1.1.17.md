# Zenify v1.1.17 Release Notes

**Release Date:** November 19, 2026  
**Build:** `1.1.17+2030`  
**Target:** Android 8.0+ (ARM64-v8a, Universal) • Web PWA

---

## 💎 Highlights

### 1. Universal Real-Time Glass Customizer
- **Complete Component Unification**: Connected `AppleGlass` directly to `GlassSurface` and `GlassEngine`. All presets (Liquid, Prism, Aurora, Frosted, Midnight, Rosé, Crystal, etc.), fluid flow and shimmer motion shaders, rainbow prism dispersion, bevel depth highlights, and frost veils now apply universally in real time across the **MiniPlayer**, **Navbar Dock** (`AppleDock`), and **Dynamic Island buttons/header**.
- **Stripped Blocking Tints**: Removed legacy hardcoded dark tints that previously masked dynamic glass effects from rendering outside of the settings navigation buttons.

### 2. Apple Music Full-Bleed Artwork Player & Bottom Color Expansion
- **Immersive Full-Bleed Mode**: Introduced a dynamic fullview layout that places the album artwork directly above the seekbar and seamlessly transitions into vibrant extracted artwork palette color expanding to the bottom of the screen.
- **User Preference Toggle**: Added an instant toggle in Settings (`Artwork Bleed Mode`) allowing users to easily choose between the standard floating artwork card and full-bleed bottom expansion.

### 3. Pure YouTube InnerTube Audio & Synced Timestamp Lyrics
- **Pristine YouTube Streaming**: Direct streaming pipeline optimization for high-fidelity full-length audio with zero 30-second snippet fallbacks.
- **Sub-Second Syllable & Word Timestamps**: Exact lyric timestamp synchronization aligned directly with official YouTube releases, backed by multi-tiered verification.

### 4. Smart Battery & Resource Optimization
- **Active Rendering Pause**: Artwork mesh background shaders, dynamic animations, and liquid glass motion tickers automatically pause when leaving the screen or when the player is idle, conserving battery and CPU.
- **Fixed Ticker Assertion**: Resolved the multiple tickers crash in `_ArtworkMeshBackgroundState` by upgrading to `TickerProviderStateMixin`.

### 5. Layout & Static Analysis Fixes
- **Category Details**: Resolved syntax issues (missing bracket, undefined `heroHeight`).
- **Clean Linter Baseline**: Cleaned up all linter warnings, flow control braces, and unnecessary parentheses across search, album, and player screens.
- **Analytics & History**: Enhanced listening history payload validation for seamless playback tracking.

---

## 📦 Downloads
- **ARM64-v8a Release APK**: [zenify-v1.1.17.apk](https://github.com/hackerstudent29/Zenify/releases/download/v1.1.17/zenify-v1.1.17.apk)
- **Web App**: [listenzenify.vercel.app](https://listenzenify.vercel.app)
