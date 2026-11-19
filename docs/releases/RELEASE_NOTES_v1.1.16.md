# Zenify v1.1.16 Release Notes

**Release Date:** November 19, 2026  
**Build:** `1.1.16+2029`  
**Target:** Android 8.0+ (ARM64-v8a, Universal) • Web PWA

---

## 💎 Highlights

### 1. Unified Liquid Glass Dropdown Sheets
- **Single Component Architecture**: Replaced fragmented iOS Cupertino sheets, custom dialogs, and one-off action sheets across Settings, Profile, and Apple Music Kit with the canonical `ZenDropdown` liquid-glass modal sheet.
- **Consistent UX Across Pages**: Audio Quality picker, Region selection, and account confirmation modals (Clear Search History, Sign Out, Delete Account) now use a standardized, Apple Music-inspired blurred backdrop and haptic-responsive action controls.

### 2. Instant First-Click Search Results
- **Zero-Delay Query Submission**: Fixed an issue where submitting a search required clicking search a second time. The navigation state and view phase now instantly transition to loading and results on the first click.
- **Eliminated Suggestion Trap**: `search_screen.dart` prioritizes submitted query state over lingering asynchronous suggestions, ensuring results are rendered immediately upon tapping Enter or Search.

### 3. Smart Relevance & Popularity Search Ranking
- **Popularity & Streaming Weight**: Integrated server rank priors (`1 / (1 + rawRank)`), official studio audio bonuses (`+0.04`), and track duration weighting to ensure the most famous, popular, and relevant songs appear at the top.
- **Demoted Random Artist Cards**: Fixed an issue where generic and song title searches were hijacked by artist profile hero cards. Exact artist matching is now strictly required before presenting an artist hero card.

### 4. Automatic In-App Update Notice with Changelog
- **Proactive Remote Check**: Integrated automatic background update verification into `shell_screen.dart` that checks `remote_config.json` upon startup.
- **Interactive Changelog Sheet**: Automatically presents older version users with a rich modal sheet detailing the latest version, features, fixes, and improvements, along with a 1-tap direct APK update launcher.

### 5. Ultra-Lean Release Footprint
- **Split-per-ABI Optimization**: Generated release APK (`app-arm64-v8a-release.apk`) sits at **15.5 MB**, strictly within the size budget with zero advertisement overhead.

---

## 📦 Downloads
- **ARM64-v8a Release APK**: [zenify-v1.1.16.apk](https://github.com/hackerstudent29/Zenify/releases/download/v1.1.16/zenify-v1.1.16.apk)
- **Web App**: [listenzenify.vercel.app](https://listenzenify.vercel.app)
