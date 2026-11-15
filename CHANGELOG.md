# Changelog

All notable user updates and improvements to Zenify are documented here.

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
