# Zenify v1.1.15 Release Notes

**Release Date:** November 19, 2026  
**Build:** `1.1.15+2028`  
**Target:** Android 8.0+ (ARM64-v8a, Universal) • Web PWA

---

## 💎 Highlights

### 1. Real-Time Reactive Glass Engine
- **Live Glass Customizer**: Sliders for Fluidity, Blur, Frost, Depth, and Specular Rim now apply instantly in real time without lag or app remount.
- **Unified Surface Styling**: Wired `GlassEngine` to `AppleGlass`, ensuring that `AppleDock`, MiniPlayer (`PlayerShell`), and Dynamic Island header buttons immediately adopt chosen base palettes (Midnight, Wine, Obsidian, Graphite, Default) and fluid chromatic tints (Rose, Ocean, Violet, Emerald, Amber, Aurora).
- **Synchronous Mirroring**: Eliminated 280ms debouncing gaps between `GlassEngine` and `SettingsState`, making custom styling seamless across both local components and global settings.

### 2. Intelligent Navbar Dock Restoration
- **Reliable Dock Visibility**: Resolved an issue where returning from Settings or Account screens caused the bottom navigation tabs to disappear while the MiniPlayer remained visible.
- **Automatic Dock Springing**: Replaced static state hold with an animated transition (`_dockController.animateTo(1.0)`) whenever navigating back to the root tab.
- **Route Pop Safety**: Enhanced `DockVisibility` token management to automatically release hide leases when a page begins its reverse pop animation, eliminating stranded dock states.

### 3. Apple Music Fullview Player & Immersive Lyrics
- **Subtle Apple Music Glow**: Replaced heavy blurred glow bloom on lyrics with clean, elegant typography and subtle text shadows.
- **Progressive Depth-of-Field Blur**: Smooth focus hierarchy that keeps the current active line in sharp focus while softly diffusing upcoming lines down the screen.
- **Frosted Transport Blur & 3s Idle Autohide**: In lyrics mode, the bottom controls sit on a smooth 30px frosted blur that glides away after 3 seconds of inactivity and reappears on tap.
- **Lifted Control Spacing**: Center-balanced 30px transport button spacing and repositioned Scrubber slider for effortless thumb ergonomics.
- **High-Accuracy Lyric Engine**: Multi-source resolution combining LRCLIB, duration tolerance checks, and official YouTube Music InnerTube extraction.

### 4. Lean Release Footprint
- **Split-per-ABI Optimization**: Generated release APK (`app-arm64-v8a-release.apk`) sits at **15.5 MB**, strictly within the $\le 15.5$ MB target.

---

## 📦 Downloads
- **ARM64-v8a Release APK**: [zenify-v1.1.15.apk](https://github.com/hackerstudent29/Zenify/releases/download/v1.1.15/zenify-v1.1.15.apk)
- **Web App**: [listenzenify.vercel.app](https://listenzenify.vercel.app)
