# Changelog

All notable user updates and improvements to Zenify are documented here.

## [1.1.22] - 2026-11-25

### What's New
- **New Zendrum Instrument Identity**:
  - Updated all Android adaptive/legacy launcher icons (`mdpi`–`xxxhdpi`, foreground/background/monochrome, round icons, `#FFFFFF` background) to the white background + rose Zendrum emblem.
  - Replaced website, mobile-web, and repo favicons plus `"Z"`-only marks (`z_logo.png`, `z_logo_black.png`, `favicon_transparent.png`, `favicon_z_512.png`, `logo-square-dark.png`) with the transparent rose Zendrum logo while keeping full `"ZENIFY"` wordmarks untouched.
- **Smart Single, Album, Video Routing & Offline Video Downloads**:
  - Clicking a song in Singles opens its Single view with an interactive **Artist & Album Redirection Sheet** (`MediaNavigationSheet`) + `AlbumResolver` / `MediaRouter` verification instead of misrouting to an unrelated album or unplugged version; soundtrack singles extract movie albums accurately (`(From "Movie")`).
  - Dedicated Video Single playback view with recommended video songs & artist links, video download support (`DownloadService`), release-type metadata badges (`YouTube.kt` / `PageHelper.kt`), clean `Title + Year` on Artist Video Songs, and `Title + Artist` on Home shelves.
- **Full Song Credits & Plain Static View Lyrics**:
  - Dedicated `SongCreditsScreen` & `SongCreditsService` showing performing artists, movie cast, composers & lyricists, production roles, soundtrack details, and gated `View Lyrics` access.
  - Plain static `FullLyricsScreen` with LRC/word-tag stripping, Arabic RTL & BiDi directionality preservation, stationary `DynamicIslandHeader`, overlapping line tail-glow timing, and zero scroll-to-dock movement.
- **Rigid 90° Portrait ↔ Landscape Player Morph & Landscape Video Controls**:
  - iOS-style rigid 90° rotation morph across `PlayerShell`, `player_kit.dart`, and `BleedArtwork` with neutral white `ScrubberSlider` time labels.
  - Landscape video mode adds ±10s skip controls, double-tap seek accumulation, centered Lyrics/Queue controls, background tap shielding, and a fit/fill zoom toggle.
- **Transparent Liquid Glass Top Picks & Hero**:
  - Refined Top Picks and hero surfaces to use a clean transparent liquid-glass backdrop without heavy frosted borders.

### Fixes & Improvements
- **Media3 `1.9.2` Playback & `LoadControl` Fix**:
  - Aligned `:app` Media3 compile dependencies to `1.9.2` and forwarded every `LoadControl` interface method (including `getBackBufferDurationUs(PlayerId)`, `retainBackBufferFromKeyframe(PlayerId)`, and `shouldContinuePreloading(...)`) in `ZenAudioPlugin.kt`, resolving `PlatformException(zen_audio, getBackBufferDurationUs not implemented)` during audio and video initialization.
- **Native Audio Focus, Buffering Throttle & System Volume Sync**:
  - Added `AudioFocusRequest` + `AudioPlaybackCallback` interruption/resume handling, paused network buffering cap, Android `STREAM_MUSIC` volume sync (`getSystemVolume` / `setSystemVolume`), accurate `getPosition` snapshotting, and hardened `PoTokenGenerator` / `YtDataSource` caching.
- **Persistent Dock & MiniPlayer Across All Detail Pages**:
  - Routed `View Credits`, `View Lyrics`, `Artist`, `Album/Release`, and `Category` navigation from `PlayerShell`, `QueuePanel`, `ZenDropdown`, `showArtistPopup`, `MediaNavigationSheet`, and Home modal sheets through `ShellNavigationScope.openPage` so the bottom Dock and MiniPlayer stay visible.
- **Unified Bottom Scroll Clearance**:
  - Added `180 + safeBottom` clearance across Artist, Album, Library, Song Credits, Full Lyrics, and Sound Atlas screens so bottom text never hides behind the Dock or MiniPlayer.
- **Website Disconnection, Leaner Backend & Automated Release Pipeline**:
  - Disconnected legacy website `.env` connections, CORS origins, redirects, and web-only routes while removing AI and Cloudflare R2 keys from the backend (moving Room cover uploads to Cloudinary and preserving Auth, Postgres sync, Room Together, RapidAPI, and Apple Music for Android).
  - Updated `.github/workflows/release.yml` to publish `docs/releases/RELEASE_NOTES_vX.Y.Z.md` directly to GitHub Releases and expanded automated widget/unit test suites across audio focus, lyrics, credits, album resolution, bleed artwork, and video downloads.

## [1.1.21] - 2026-11-24 (Stable Version 1)

> 🎉 **First Stable Version:** Zenify v1.1.21 marks the official **Stable Version 1** milestone release for the Zenify Flutter Android application.

### What's New in Stable Version 1
- **Strict YouTube Music Search Parity**:
  - Unrestricted, pristine search results directly mirroring YouTube Music for queries across songs, video songs, official albums, verified artists, and public playlists.
  - Resolved previous search distortion and missing album/playlist shelves.
- **16:9 Landscape Video Previews**:
  - Native 16:9 landscape thumbnails for video songs in Search History and Search Results (`76x44`).
  - Native 16:9 landscape thumbnails in Playback Queue (`QueuePanel`) and Room Together queue (`76x48`).
- **Instant Search History Tap-to-Play**:
  - Tapping an audio song or video song in search history starts playback instantly without triggering unnecessary re-searches.
  - Tapping an artist or album in search history navigates directly to the target catalog page.
- **Ultra-Fast Lyrics Engine with Video Skip**:
  - Multi-provider parallel resolver (`lrc.red` + `lrclib.net`) fetching synced lyrics in sub-300ms.
  - Automatic video bypass: Video tracks skip lyrical fetching to conserve network bandwidth and eliminate playback latency.
  - Upgraded lyrics storage to `lyrics_cache_v12_` with clean startup cache invalidation.
- **Website Service Migration Notice**:
  - Added notification on the Zenify website recommending users migrate to the Zenify Android App for optimal 320kbps lossless streaming and zero browser restrictions.

## [1.1.20] - 2026-11-23

### What's New
- **Comprehensive Zenify Replay & Insights Architecture**:
  - Full listening telemetry aggregation engine, all-time index, and personalized annual & monthly recaps.
  - 27 interactive analytics features including Listener Personality, Daypart Breakdown, Heatmap Calendar, Marathon Sessions, Loyalty Timeline, and Milestones Trophy Room.
  - Interactive Replay Quiz with dynamic question generation, Replay Match compatibility comparison, and Dedicate a Song social sharing.
- **Robust YouTube & Live Streaming Engine**:
  - Multi-client fallbacks (`ANDROID_VR`, `IOS`, `TVHTML5`) with dual-budget streaming timeouts.
  - Adaptive PoToken generator, RefusedRetryDataSource, and StreamUrlCache for zero-stall audio playback.
  - Native video texture playback in player shell with fluid liquid sheet transitions and landscape side-by-side mode (lyrics + queue).
- **Fast Syllable-Synchronized Lyrics Service**:
  - Multi-provider parallel resolver (Better Lyrics, Unison, LRCLIB, JioSaavn) with syllable-level word tracking and romanization.
  - Strict uniform typography sizing and live interlude pauses.
- **Entity-Intent Search & Dynamic Island Header**:
  - Intelligent entity ranking with music-only video filtering and collapsible floating island header.

## [1.1.19] - 2026-11-21

### What's New
- **Interactive Sound Atlas & 3D Music Globe**:
  - Explore music cultures around the world through a high-performance 60 FPS 3D globe with trigonometry precomputation and 3-tier Level of Detail (LOD).
  - Manual double-tap detection for zero-delay single tap responses.
  - Curated city and country charts, musical journeys, battles, and Sound Passport milestones.
- **Apple Music-Inspired Sound Atlas UI**:
  - Full fluid iOS Cupertino styling with custom glass navigation and haptic feedback.
  - Interactive badges, shelves, and seamless queue playback integration.
- **Ultra-Compressed 15.7 MB Release APK**:
  - Optimized packaging with ProGuard/R8 code shrinking, resource shrinking, font tree-shaking, and per-ABI architecture splitting.

## [1.1.18] - 2026-11-20

### What's New
- **Deeply Personalized Home & Explore Feeds**:
  - Home and Explore feeds now dynamically adapt to the user's selected **Country/Region**, **Selected Languages** (with multi-language fusion), **Selected Genres**, **Favorite Artists**, and real-time **Listening History Telemetry**.
  - **Dynamic Time-of-Day Context**: Morning, afternoon, and evening queries blend the user's primary language and preferred genre into the mood shelf.
  - **Smart Quick Picks**: Parallel interleaving of tracks from recent listening seeds, favorite artists, and high-energy hits in selected languages/genres into a rich 16-track personalized shelf.
  - **Personalized Top Artists Shelf**: Shows user's top played artists with real play counts, favorite artists, and curated language stars with dynamic overline `"Based on your favorites & taste"`.
  - **Multi-Lingual Regional Releases & Charts**: Concurrently queries fresh drops and charts across all selected languages (e.g. Tamil, Telugu, Hindi, English, Punjabi) and blends them with national charts so users are never served generic national pop alone.
  - **Personalized Mixes**: Supermix, Discover, Chill, and Energy auto-tune their queries to user's languages and genres.
  - **Dynamic Explore Cache**: Explore cache keys incorporate country code + hash of languages + hash of genres + week number. Any change in Settings or Profile immediately invalidates the cache and reloads the view.
- **Settings & Profile Music Taste Controls**:
  - Dedicated "Music Preferences & Taste" section in Settings with live reactive sheets for Region, Languages, Genres, and Favorite Artists.
  - Restored the 4-step Guided Setup modal (`OnboardingSheet.show(context, isEditing: true)`).
- **Offline Local Replay & Guest Insights**:
  - Guest users without account sign-in can now view local replay statistics, total listening time, and streaks directly from `ListeningHistoryService`.

## [1.1.17] - 2026-11-19

### What's New
- **Universal Real-Time Glass Customizer**:
  - Connected `AppleGlass` directly to `GlassSurface` and `GlassEngine`: all presets (Liquid, Prism, Aurora, Frosted, Midnight, Rosé, Crystal, etc.), fluid flow and shimmer motions, prism rainbow dispersion, bevel depth highlights, and frost veils apply instantaneously across the **MiniPlayer**, **Navbar Dock**, and **Dynamic Island buttons/header**.
  - Stripped out legacy hardcoded dark tints that previously blocked dynamic glass effects from rendering outside of the settings navigation buttons.
- **Full-Bleed Artwork Player & Bottom Color Expansion**:
  - Introduced full-bleed album artwork presentation anchored directly above the seekbar, gracefully transitioning into vibrant artwork palette color that expands to the bottom of the screen.
  - Added user preference toggle in Settings to switch between standard floating card and full-bleed artwork mode.
- **Pure YouTube InnerTube Audio & Synced Timestamp Lyrics**:
  - Direct streaming engine prioritizing YouTube InnerTube high-fidelity full audio without snippet fallbacks.
  - Sub-second word-by-word timestamp lyric synchronization aligned directly with official YouTube releases.
- **Intelligent Battery & Performance Optimization**:
  - Active rendering pause: Artwork mesh backgrounds, dynamic shaders, and glass motion tickers automatically pause when leaving the screen or backgrounding the player, preventing CPU and battery waste.
- **Stability & Static Analysis Fixes**:
  - Fixed multiple tickers error in `_ArtworkMeshBackgroundState` with `TickerProviderStateMixin`.
  - Resolved missing parenthesis and undefined `heroHeight` in Category details screen.
  - Cleaned up all linter warnings, flow control braces, and unnecessary parentheses across search, album, and player screens.

## [1.1.16] - 2026-11-19

### What's New
- **Unified Liquid Glass Dropdown Sheets**:
  - Replaced fragmented option dialogs and custom action sheets with a unified, Apple Music styled liquid-glass `ZenDropdown` sheet component across all pages.
  - Standardized Audio Quality selection, confirmation modals (Clear History, Sign Out, Delete Account), and Region Picker.
- **Instant First-Click Search Results**:
  - Eliminated the double-tap requirement on search submission. Searching now navigates directly to results on the first click without getting trapped in the live suggestions overlay.
- **Weighted Relevance & Popularity Search Ranking**:
  - Refined the YouTube Music ranking algorithm to prioritize famous, popular, and most-streamed tracks.
  - Demoted random artist profiles on generic and song title queries, requiring strict exact matching before presenting an artist hero card.
  - Added server rank priors, official audio bonuses, and duration validation to favor genuine studio tracks over fan covers and short clips.
- **Automatic In-App Update Notice & Changelog**:
  - Older version users are now automatically prompted on app startup with an interactive release sheet showcasing the latest features, fixes, and 1-tap APK update trigger.

## [1.1.15] - 2026-11-19

### What's New
- **Real-Time Reactive Glass Customizer**:
  - `GlassEngine` pipeline completely wired to `AppleGlass` across the entire application: adjustments to fluidity, blur, depth, frost, base palettes (Midnight, Wine, Obsidian, Graphite, Default), and specular rim apply instantaneously in real-time.
  - Custom fluid gradients and tinted glass surfaces (Rose, Ocean, Violet, Emerald, Amber, and drifting Aurora) immediately reflect on `AppleDock`, MiniPlayer (`PlayerShell`), and Dynamic Island header buttons without requiring an app restart.
  - Eliminated legacy debouncing lag, ensuring synchronous state propagation between `GlassEngine` and `SettingsState`.
- **Intelligent Navbar Dock & Subpage Restoration**:
  - Restored reliable navbar dock visibility upon navigating back from Settings, Glass Customizer, Profile, or subpages.
  - Fixed dock collapse lockup by resetting `_depth` on root pop and automatically animating `_dockController` back to rest (`1.0`) with Apple-inspired fluid easing.
  - Hardened `DockVisibility` lease lifecycle: tokens now automatically release during reverse route exit animations to prevent stranded dock states.
- **Apple Music Fullview Player & Immersive Lyrics Polish**:
  - Minimal, high-contrast Apple Music text glow with subtle drop shadows replacing heavy blurred bloom on active lyric lines.
  - Progressive depth-of-field blur on upcoming lyrics.
  - Immersive lyrics mode with 30px frosted background blur on bottom transport controls, seamlessly gliding away after 3 seconds of inactivity and restoring on screen touch.
  - Vertically lifted Scrubber slider and transport buttons with centered, balanced 30px spacing.
  - High-accuracy multi-source lyric engine with duration validation, LRCLIB candidate scoring, and official YouTube InnerTube extraction.
- **Ultra-Lean Release Packaging**:
  - Strict release split-per-ABI packaging (`app-arm64-v8a-release.apk` at 15.5 MB), meeting the performance and size budget.

## [1.1.12] - 2026-11-16

### What's New
- **Multi-Source Catalog Search Toggle (Issue #26)**:
  - Added an Apple-style segmented source selector capsule directly above search filters and recents: **[ All · Universal | YouTube Music | Jio Music ]**.
  - **Jio Music Direct Fast-Path**: Direct search against pristine 320kbps Akamai CDN catalog resolving queries in ~250ms with zero stalls.
  - **YouTube Music Direct Path**: Direct query to high-performance InnerTube native streaming endpoints with a strict 4s timeout.
  - **Universal Acceleration**: Parallel concurrent querying with 4-second bounded timeouts, completely eliminating search hangs and endless loading states.
  - Remembers user's preferred search source across sessions with persistent storage.
- **Playlist Import from YouTube Music & Spotify (Issue #25)**:
  - Users can now import existing playlists directly from YouTube Music, YouTube, and Spotify share URLs.
  - Fast headless metadata extraction via backend yt-dlp flat-playlist extraction and Spotify web scrapers.
  - Automatic track resolution and database linking into user's personal Zenify library with dynamic island feedback.
  - Available across Web Player ("Import Link" in Create Playlist modal) and Mobile Flutter App ("Import Playlist" in Library screen).
- **Local Music Player Persistence & Codec Resilience (Issue #24)**:
  - Resolved local library hanging bug when scanning large audio folders (FLAC, ALAC, CAF, Opus, AIFF).
  - Added bounded 2.0s watchdog timer on HTML5 audio duration probes so unsupported platform codecs never freeze file parsing.
  - Multi-tier IndexedDB persistence: folder structures and track metadata are saved with quota safety, preserving scanned folders across page reloads and tab closes.
  - Auto-stream recovery for un-demuxable local codecs (e.g. Apple Lossless ALAC in Chromium on Windows) by falling back seamlessly to pristine 320kbps full-track CDN streams.

## [1.0.13] - 2026-11-15

### What's New
- **Better Lyrics & Unison Syllable-Level TTML Engine**:
  - Real-time, word-by-word synchronized lyrics powered by the official Better Lyrics Apple Music TTML engine and Unison community database.
  - Syllable progress tracking, breathing 3-dot instrumental pauses, and multi-language romanized script switching (Latin, Cyrillic, CJK, Indic, Arabic).
- **Ultra-Lean Live Streaming Storage (80%+ Storage Reduction)**:
  - Redesigned as a pure live streaming client: pruned raw audio hoarding and cut ExoPlayer local audio disk buffer from 512 MB to a lean 64 MB.
  - In-memory decoded image cache capped to 35 MB & 80 objects to keep memory and device cache feather-light.
  - User phones now store only lightweight metadata for recently played tracks and visited artists for instant 0ms resume.
  - Purged 488 legacy unlinked tracks and 609 cached lyric documents from backend; preserved 100% of user accounts, credentials, and liked libraries.
- **Enhanced Application Security & Privacy**:
  - Hardened Android security manifest with `android:allowBackup="false"` to block unauthorized ADB or cloud backup token extraction.
  - ProGuard and R8 bytecode obfuscation enabled in release builds.
  - All auth session tokens secured in Android Keystore / iOS Keychain (`FlutterSecureStorage`) with zero leaked API keys.
- **Story Sharing & Full-Screen Sheet Polish**:
  - Full-bleed presentation for "Add to Story" and Lyric Selection screens via root navigator routing, preventing bottom miniplayer overlap.
  - `DockVisibility` token management ensuring bottom navigation disappears cleanly when creating stories.

## [1.0.12] - 2026-11-15

### What's New
- **Expansive Artist Hero & Balanced Layout**: Restored full-height portrait photography (`480px`) with ~250px of clean breathing room for artist imagery so portraits and expressions are never covered by titles or action controls.
- **Scroll-Linked Dynamic Island**: The center island capsule now stays collapsed and hidden at rest across all artist, album, playlist, and category pages, springing open gracefully to reveal the title only when the user scrolls past the on-screen header.
- **Edge-to-Edge Fullview Player**: Expanded player sheet bounds with seamless full-bleed backdrop coverage, completely eliminating right-side display subpixel gaps on all Android screens.
- **Strict Lyrics & Search Matching**: Enforced multi-word overlap validation and artist verification, eliminating fuzzy lyric mismatches and guaranteeing 100% accurate lyrics with native YouTube official lyrics fallback.
- **Audience & Metric Formatting**: Cleaned artist monthly listeners to format cleanly without duplicate words (e.g. "40.8 crore monthly listeners").

## [1.0.11] - 2026-11-14

### What's New
- **Refined Hero Presentation**: Restored original square aspect ratio and subtle drop shadow for album artwork, and natural viewport fitting for artist hero banners without artificial zoom or image cropping.
- **Zero Background Bleed**: Pure solid black transitions beneath album and artist heroes, completely eliminating transparent or blurred ghosting behind Latest Release, Top Songs, and upcoming tracks.
- **Clean Scrim & Gradient Termination**: Smooth ambient color wash strictly confined above player action buttons, fading to deep neutral dark across all detail pages.
- **Enhanced Playback & Seeking**: Instant responsive track loading with self-healing stream resolution and zero preview limits.

## [1.0.10] - 2026-11-13

### What's New
- **Accurate Multi-Language Lyrics**: Songs released across multiple languages (such as Tamil, Telugu, Hindi, Malayalam, and Kannada) now automatically match and display the exact language lyrics matching your playing audio, preventing cross-language mixups.
- **Authentic Transparent Branding in Stories**: All 16 social story sharing templates now showcase the official transparent Zenify brand mark when sharing your favorite tracks to Instagram, WhatsApp, Snapchat, and Facebook.
- **Faster Story Generation**: Completely streamlined the story rendering engine for instantaneous previews and silky-smooth card generation.
- **Ultra-Compact App Size**: Optimized app packaging down to just 14.5 MB for ultra-fast downloads and minimal device storage usage.

## [1.0.9] - 2026-11-12

### What's New
- **Apple Music-Inspired "Add to Story"**: Share songs, lyrics, artists, albums, and playlists directly to Instagram, WhatsApp, Snapchat, and Facebook with 16 handcrafted editorial designs.
- **Dedicated Lyric Card Sharing**: Highlight and share 1 to 3 favorite lines of synced lyrics with dynamic artwork backgrounds.
- **In-App YouTube Video Playback**: Watch music videos seamlessly inside the floating MiniPlayer and full-screen player with responsive playback controls.
- **Liquid Aurora Welcome Experience**: Refreshed onboarding and sign-in flow with an animated color mesh and quick genre/language setup.

### Improvements & Fixes
- **Instant Playback & Scrubbing Reliability**: Resolved tracks occasionally skipping or delaying when starting from 0:00 or seeking.
- **Seamless Video Surface Handoff**: Fluid transition between MiniPlayer and Fullscreen player when playing video tracks.
- **Dock & Sheet Polish**: Prevented bottom navigation dock from overlapping full-screen sheets, settings, and profile views.
- **Centered Dynamic Island**: Perfected symmetry and spacing for Dynamic Island headers across all app screens.
- **Clean Queue Management**: Selecting a single track from search now initializes a clean listening session with related recommendations.

## [1.0.8] - 2026-11-11

### What's New
- **Room Together Live Listening**: Listen in real-time with friends, synchronized playback, fair queues, and live reactions.
- **Dynamic Island In-App Alerts**: Non-intrusive status pills for queue actions, liked songs, and playlist updates.
- **Apple San Francisco (SF Pro) Typography**: Authentic Apple typography throughout the entire app for sharp, crystal-clear readability.
- **Smarter Search & Browse**: Live search suggestions, categorized browse tiles, and automatic typo correction.

### Improvements & Fixes
- **Smooth Navigation Dock Morphing**: Bottom navigation bar smoothly adapts when scrolling.
- **Background Playback & Lock-Screen Sync**: Rock-solid lock screen playback controls and continuous notification progress bar updates.

## [1.0.7] - 2026-11-11

### What's New
- **Liquid Glass Navigation Dock**: Responsive 3-dock island with one-tap access to Explore, MiniPlayer, and Search.
- **In-App Update Notifications**: Instant in-app alerts when a new update is available with one-tap background download.

## [1.0.6] - 2026-11-10

### What's New
- **Apple-Style Context Menus**: Frosted glass menus for quick track sharing, queuing, and artist navigation.
- **Rich Artist Profiles**: Dedicated artist pages featuring discographies, top songs, and listener stats.
- **Enhanced Search Engine**: Improved phonetic matching for regional and international artist names.

## [1.0.5] - 2026-11-10

### What's New
- **Floating Dynamic Island Header**: Persistent header across all library, artist, album, and settings screens.
- **Reliable Library Sync**: Liked songs, saved albums, and custom playlists sync instantly across sessions.
- **Tailored Music Recommendations**: Home feed personalized to your favorite genres, languages, and listening habits.
