# Zenify v1.1.18 Release Notes

**Release Date:** November 20, 2026  
**Build:** `1.1.18+2031`  
**Target:** Android 8.0+ (ARM64-v8a, Universal) • Web PWA

---

## 💎 Highlights

### 1. Deeply Personalized Home & Explore Feeds
- **Full Cultural & Taste Alignment**: Home and Explore feeds now dynamically adapt to your selected **Country/Region**, **Selected Languages** (with multi-language fusion), **Selected Genres**, **Favorite Artists**, and real-time **Listening History Telemetry**.
- **Multi-Language Music Fusion**: Seamlessly blends regional charts and new releases across all selected languages (e.g. Tamil, Telugu, Hindi, English, Punjabi) alongside national top hits so users never receive generic national pop alone.
- **Dynamic Time-of-Day Context**: Morning, afternoon, and evening queries blend the user's primary language and preferred genre into the mood shelf.
- **Smart Quick Picks Shelf**: Parallel interleaving of tracks from recent listening seeds, favorite artists, and high-energy hits in selected languages/genres into a rich 16-track personalized shelf.
- **Personalized Top Artists Shelf**: Shows user's top played artists with real play counts, favorite artists, and curated language stars with dynamic overline `"Based on your favorites & taste"`.
- **Personalized Mixes**: Supermix, Discover, Chill, and Energy auto-tune their queries to user's languages and genres.
- **Dynamic Explore Cache**: Explore cache keys incorporate country code + hash of languages + hash of genres + week number. Any change in Settings or Profile immediately invalidates the cache and reloads the view.

### 2. Music Preferences & Taste Controls
- **Dedicated Settings Section**: Added a new "Music Preferences & Taste" section in Settings with live reactive sheets for Region, Languages, Genres, and Favorite Artists.
- **Restored Guided Setup**: Restored the 4-step Guided Setup modal (`OnboardingSheet.show(context, isEditing: true)`) in Profile.

### 3. Offline Local Replay & Guest Insights
- **Local Listening Analytics**: Guest users without account sign-in can now view local replay statistics, total listening time, and streaks directly from `ListeningHistoryService`.

---

## 📦 Downloads
- **ARM64-v8a Release APK**: [zenify-v1.1.18.apk](https://github.com/hackerstudent29/Zenify/releases/download/v1.1.18/zenify-v1.1.18.apk)
- **Universal Release APK**: [zenify-v1.1.18-universal.apk](https://github.com/hackerstudent29/Zenify/releases/download/v1.1.18/zenify-v1.1.18-universal.apk)
- **Web App**: [listenzenify.vercel.app](https://listenzenify.vercel.app)
