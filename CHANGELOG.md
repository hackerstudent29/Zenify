# Changelog

All notable changes to the Zenify platform are documented in this file.

## [1.0.10] - 2026-11-13

### Added
- **Multi-Language Lyrics Anti-Collision Engine**:
  - Implemented pre-sanitization language detection in `Track` constructor to extract `(Telugu)`, `[Tamil]`, `(Hindi)`, etc., and album metadata *before* title normalizers strip bracketed tags.
  - Added native script rune analysis (`LyricsService.detectScriptLanguage`) covering Tamil, Telugu, Devanagari/Hindi, Malayalam, Kannada, Bengali, Gurmukhi, Korean, Japanese, and Arabic.
  - Added romanized transliteration detector (`LyricsService.detectRomanizedLanguage`) for Tanglish, Tenglish, and Hinglish stopwords.
  - Added strict language compatibility gate (`LyricsService.isLanguageCompatible`) to reject wrong-language and wrong-script lyrics (e.g. Tamil lyrics on Telugu song audio like *Ale Ale*, *Arabic Kuthu*, *Chaleya/Hayyoda*).
  - Enhanced multi-query search fallbacks in `_fetchLrclibSynced` and `_fetchLrcRed` with language-scoped queries and candidate scoring.
- **Transparent Zenify Full Brand Logo Across All Story Templates**:
  - Configured `ZenifyStoryBrand` to render the authentic transparent brand mark (`assets/images/zenify_logo.png`) across all 16 story sharing templates.
  - Removed artificial plain text widgets (`Text('Zenify')`), ensuring only the pristine official logo with high-contrast color polarity is rendered on exported stories.
- **Architecture Streamlining for Story Sharing**:
  - Consolidated 21 micro-files and 5 subfolders in `mobile/lib/features/story_sharing/` into 5 high-cohesion modules (`story_models.dart`, `story_service.dart`, `story_widgets.dart`, `story_templates.dart`, `story_preview_screen.dart`, and unified barrel `story_sharing.dart`).

### Changed
- **Removed Camera Buttons App-Wide**: Eliminated standalone camera icons from Now Playing screen, `PlayerShell` meta row, `LyricsSheet` bottom bar, and dropdown action items in favor of the standard three-dot (`...`) context menu.
- **Consolidated Story Sharing Templates into Single Category Files**: Refactored the 16 micro-files into 5 clean, category-based files under `mobile/lib/features/story_sharing/templates/`:
  - `song_templates.dart` (`Classic`, `Full Poster`, `Liquid Glass`, `Editorial`)
  - `lyrics_templates.dart` (`Classic`, `Typography Poster`, `Minimal`)
  - `artist_templates.dart` (`Profile`, `Editorial`, `Discography`)
  - `album_templates.dart` (`Stacked Depth`, `Editorial`, `Liquid`)
  - `playlist_templates.dart` (`Collage`, `Poster`, `Editorial Grid`)
- **Direct Multi-Platform Social Story Redirection**:
  - Added native **Snapchat** Story/Snap sharing support (`com.snapchat.android`).
  - Added automatic fallback to direct `Intent.ACTION_SEND` targeting `com.instagram.android` with explicit URI read permissions if Instagram Story intent is not supported.
  - Added support for WhatsApp Business (`com.whatsapp.w4b`) alongside standard WhatsApp (`com.whatsapp`).
  - Added support for Facebook Lite (`com.facebook.lite`) alongside Facebook Katana (`com.facebook.katana`).
- **Responsive Viewport & Stable Capture Boundary**:
  - Wrapped `StoryCardViewport` in `FittedBox(fit: BoxFit.contain)` to guarantee story and square cards scale responsively without overflow on any mobile screen dimensions.
  - Implemented stable per-template `GlobalKey` caching (`_boundaryKeys`) in `StoryPreviewScreen` to eliminate duplicate key collision warnings and guarantee clean 3.0x pixel-ratio rasterization.
- **Unified Story Options Sheet**:
  - Integrated Quick Social Destinations bar directly inside `StoryOptionsSheet` (Instagram, WhatsApp, Facebook, Snapchat, Copy Link) alongside category selection tiles.

## [1.0.9] - 2026-11-12

### Added
- **Apple Music-Inspired "Add to Story" & Music Sharing Suite**: Complete, production-grade social story and card export feature across Song, Lyrics, Artist, Album, and Playlist categories with 16 distinct hand-crafted templates.
  - **Song Sharing Templates (4)**: `Classic` (floating Apple-style poster card with squircle album art, bold typography, and transparent Zenify branding in the footer), `Full Poster` (cinematic full-bleed artwork with dark gradient overlay), `Liquid Glass` (blurred cover background, frosted glass card, waveform visualizer bars, and transparent Zenify logo), and `Editorial` (asymmetric artwork layout with oversized display typography and negative space).
  - **Lyrics Sharing & Dedicated Selection Screen (3 Templates)**:
    - Full-screen `LyricsSelectionScreen` enforcing 1–3 consecutive line selection, tap-to-deselect, non-consecutive tap reset, `appleToast('Select up to 3 lines')` limit guard, and graceful fallback when lyrics are unavailable.
    - `Classic Lyrics` (frosted dark container with stacked lyric lines, mini cover, title, artist, and transparent Zenify logo badge).
    - `Typography Poster` (expressive editorial display typography over warm multi-orb fluid gradient with hairline divider and metadata).
    - `Minimal Lyrics` (clean presentation with generous negative space, quotation styling, and subtle footer metadata).
  - **Artist Sharing Templates (3)**: `Profile` (circular portrait, real listener/subscriber count, and top 3 real songs), `Editorial` (cinematic full-canvas portrait poster), and `Discography` (portrait with 3 representative album/song covers).
  - **Album Sharing Templates (3)**: `Stacked Depth` (main cover with two offset depth layers behind it for 3D depth, release year, and track count), `Editorial` (full-bleed split cover with editorial typography), and `Liquid Album` (floating glass composition).
  - **Playlist Sharing Templates (3)**: `Collage` (2×2 grid adapting gracefully for 1, 2, 3, or 4 album covers), `Poster` (cinematic gradient background with playlist title and featured tracks), and `Editorial Grid` (asymmetrical collage layout).
- **Dynamic Artwork Palette & Fluid Art Mesh Engine**:
  - `ArtworkPaletteService`: Decodes and downsamples artwork pixels to extract 4 complementary vibrant colors with in-memory caching and automatic contrast darkening.
  - `ArtMeshBackground`: Deterministic 4-orb radial gradient mesh with smooth gaussian blur and vignette overlay, supporting `Art Mesh`, `Blurred Cover`, and `Solid Charcoal Dark` styles without relying on active ticking loops during static image capture.
  - `ZenifyStoryBrand`: Transparent brand mark (`assets/images/z_logo.png`) paired with SF Pro Display wordmark, adapting to both dark and light card polarities.
- **Social Stories & Native Android Scoped Storage Pipeline**:
  - Direct native Kotlin `StorySharePlugin` supporting Instagram Stories (`com.instagram.share.ADD_TO_STORY`), Facebook Stories (`com.facebook.stories.ADD_TO_STORY` / `Intent.ACTION_SEND`), WhatsApp (`com.whatsapp`), and scoped-storage `MediaStore.Images.Media` gallery export to `Pictures/Zenify` album on Android 10–15.
  - Configured `androidx.core.content.FileProvider` (`story_file_paths.xml`) and Android package visibility queries, with automatic fallback to `share_plus` system share sheet.
- **Story Preview & Customization Experience (`StoryPreviewScreen`)**:
  - Full-screen swipeable `PageView` with smooth transitions and bottom frosted pill template selector.
  - Customization toggles: `9:16` Story (`1080×1920`) vs `1:1` Square (`1080×1080`), `Art Mesh` / `Blurred` / `Solid Dark` background styles, and `Light` / `Dark` text polarity.
  - Category-aware template preference persistence via `SharedPreferences`.
  - High-res PNG rasterization via `StoryImageRenderer` (`RepaintBoundary` at `pixelRatio: 3.0`).
- **Seamless App-Wide Entry Points**:
  - Story camera buttons added to Now Playing screen (`now_playing_screen.dart`), `PlayerShell` meta row, and `LyricsSheet` controls bar.
  - "Add to Story" options integrated into `ZenDropdown.showTrackMenu`, Quick Share Stories buttons, Artist menu, Album menu, and Library playlist menu.
- **YouTube Video Streaming in MiniPlayer & Fullscreen Player (`ExoPlayer` + Flutter `Texture`)**: Native Android video surface binding in `ZenAudioPlugin` paired with `ZenPlayer.videoTextureIdNotifier` and reactive MiniPlayer / Fullscreen Player video surfaces when playing video tracks.
- **Redesigned Explore, Search, Profile, Settings & Insights Experience**: Refined `ExploreScreen` and `SearchScreen` layouts, card spacing, mood tiles, `InnerTubeService.searchArtists` artist profile lookup, redesigned `ProfileScreen` / `SettingsScreen` / `InsightsScreen`, unified `ProfileEditSheets`, and region-aware `UserPreferencesService` (`sortedLanguagesForCountry`, `sortedGenresForLanguages`, `curatedArtistsForLanguages`, `age`/`gender`) seeding Home & Explore from Day 1.
- **Rose-White Liquid Aurora Welcome Screen**: Added `palette` & `scrimOpacity` baking to `ArtworkMeshBackground` behind looping transparent `ZenifyAnimatedLogo`, paired with Layer-1 `OnboardingSheet` (`DockVisibility.runModal`) and updated `/api/preferences` validation (`1–8` genres, `1–6` languages, optional `age`, `gender`).
- **Unified Layer-1 `ZenDropdown` Action & Input Sheets**: Replaced legacy `CupertinoActionSheet` / alert dialogs across `ArtistScreen`, `ExploreScreen`, `LibraryScreen`, `RoomTogetherScreen`, `ProfileScreen`, and `SettingsScreen` with Layer-1 `ZenDropdown` & `ZenDropdown.showInputSheet` modals that isolate docks cleanly.

### Fixed
- **Start-of-Track Playback, Seek Recovery & Backend Fallback URL**: Disabled ExoPlayer audio offload (`AUDIO_OFFLOAD_MODE_DISABLED`) alongside `ZenFxProcessor` DSP, keyed `SimpleCache` spans per `itag` (`YtDataSource`) with cache eviction on error (`evictMedia`), preserved `YtEngine` client headers cleanly, fixed ExoPlayer `STATE_IDLE`/`STATE_ENDED` seek preparation and Dart-side start-of-track seek restart (`PlayerState.seek`), preserved `startMs` only on genuine mid-track recovery (>2s & <duration-5s), and routed backend fallback streaming to `/api/utils/stream-youtube` so songs always start from `0:00` and scrub/recover without skipping.
- **Playable YouTube Video Streams & Fullscreen Video Surface**: Excluded unsupported `av01` codecs in `StreamResolverService.resolveVideoStreams` in favor of H.264/MP4 (`avc1` `<=720p`) + MP4/AAC audio (or muxed MP4 fallback), emitted native `error` events in `ZenAudioPlugin.playMediaId(..., isVideo: true)` when native resolution lacks video, and stopped dropping `_onEngineError` during `_isTransitioning` so video streams render reliably in both MiniPlayer and Fullscreen Player.
- **MiniPlayer & Bottom Dock Sheet/Subpage Isolation**: Added `DockVisibility.runModal` wrapping across `AppleSheet.show`, `appleActionSheet`, `showGlassSheet`, `showSpringSheet`, `ProfileEditSheets`, `OnboardingSheet`, and `ZenDropdown` menus/dialogs, enabled `useRootNavigator: true` across modal dialogs/sheets, and enforced `hideMiniPlayerWhileActive => true` on `ProfileScreen`, `RoomTogetherScreen`, `SettingsScreen`, `InsightsScreen`, and `WelcomeScreen`.
- **Welcome Screen Small-Viewport Layout**: Grouped the hero header above CTA controls in `WelcomeScreen` and removed an unbounded `Spacer()` inside `SingleChildScrollView` so compact viewports scroll without `RenderFlex` unbounded height assertions.
- **Dead-Centered Dynamic Island Header Symmetry**: Balanced horizontal clearance and removed per-screen top padding overrides across `Home`, `Explore`, `Library`, `Search`, `Profile`, `Settings`, and `Insights` so `DynamicIslandHeader` aligns center-screen identically to `Album` and `Artist`.
- **Collapsed Scroll MiniPlayer vs Expanded Search Bar De-Overlap**: Tied `AppleDock` search pill contraction to scroll collapse (`dp`) so scrolling down cleanly morphs an expanded Search bar back into the `54x54` right Search button while showing the `54x54` Explore button on the left and centering the MiniPlayer with zero overlap.
- **Artist & Album Verified Badge Placement & Round Buttons**: Fixed verified checkmark positioning next to artist/album names (including missing/blank badge gaps) and standardized pill/round action buttons (`ZenPlayButton`, `ZenShuffleButton`, `ZenActionCircle`).
- **Dynamic Island Notification Pill Sizing**: Constrained `DynamicIslandHeader` alert pills to a compact center footprint so in-app toast alerts no longer overlap top-bar back or profile buttons.
- **Single-Song Smart Queue Isolation on Search Selection**: Playing a single song from Search results now initializes a clean single-track context and populates a related Smart Queue instead of queuing unrelated search rows.
- **Background Playback, Auto-Next & Lock-Screen Real-Time Sync**: Fixed foreground wake mode and `AudioService` queue item removal/addition stability (`ZenAudioPlugin`, `ZenifyAudioHandler`), restored continuous real-time position/play-state updates on system notifications and lock-screen controls, and fixed `DockVisibility` hide/show token imbalance so the miniplayer/dock no longer disappears during active playback.

### Technical
- **Compressed Release APKs (~59% Smaller, Under 14 MB ARM64)**: Enabled `jniLibs.useLegacyPackaging = true`, stripped redundant `META-INF` / `DebugProbesKt.bin` resources in `android/app/build.gradle.kts`, extracted debug symbols via `--split-debug-info`, and subsetted bundled `SF-Pro-*.otf` fonts (`11.4 MB` → `1.58 MB` raw while preserving full Latin, extended diacritics, Greek, Cyrillic, currency, and UI/music symbols alongside OS fallback for Indic/CJK/emoji), cutting the ARM64 APK from `33.2 MB` to `13.7 MB` (`14,373,365` bytes) and the Universal APK from `75.5 MB` to `30.6 MB` (`32,133,871` bytes).
- **Release & Distribution Sync (`v1.0.9` / Build `13`)**: Kept release version `1.0.9+13`, added optional `subtitle` support to `SheetHeader`, keyed `OnboardingSheet` step action buttons across steps, aligned `InsightsScreen`/`HistoryView`/`PersonalityCard` and test suite fixtures (`86` Flutter tests + `flutter analyze` passing), rebuilt fresh compressed ARM64 (`13.7 MB`, `14,373,365` bytes, SHA-256 `1FB85A84F66C301F3ED0121D1158DA647C1EB65420DDE6474B37A394192F0F5D`) and Universal (`30.6 MB`, `32,133,871` bytes, SHA-256 `F0A77CB5712BDB5B89BA9E7CD4110242245A2180D24C5608411A4D674EDC4CE9`) APKs from a clean build, and updated web download page, `remote_config.json`, backend `/download/app`, docs, and GitHub Releases.

## [1.0.8] - 2026-11-11

### Added
- **Dynamic Island In-App Notifications (`IslandNotifier`)**: Queued Dynamic Island header toast and marquee ticker notifications (`_NotifTicker`) across library actions (liked songs, followed artists, saved albums, playlists), queue/player actions (play next, add to queue, queue cleared, sleep timer set/ended/cancelled), auth/profile/audio quality updates, link copies, and settings cache/history clears.
- **Apple Music Search Experience Redesign**: Rebuilt `SearchScreen` with four spring-animated phases (`landing`, `suggestions`, `loading`, `results`), 10 gradient browse category tiles, trending artist pills, live suggestion query highlighting, shimmer loading skeleton, `Did you mean` typo pill, glassmorphic Top Result card with action controls, intent-ordered `MediaCard` carousels with spring snap physics, filter chips (`All`, `Songs`, `Artists`, `Albums`, `Playlists`, `Videos`), and infinite scroll pagination.
- **Apple Music Auth & Onboarding Redesign**: Redesigned `WelcomeScreen`, `EmailOtpSheet`, `OnboardingSheet`, and vector `GoogleLogo` with an animated spatial aurora backdrop, breathing logo mark with spring pulse, clipboard 6-digit OTP auto-detection with auto-submit and harmonic shake feedback on error, plus a 4-step onboarding sheet with spring-driven segmented progress bar and keyboard-adaptive sizing.
- **Canonical Action Pill & Circle Controls**: Added unified `ZenPlayButton`, `ZenShuffleButton`, and `ZenActionCircle` components (`action_buttons.dart`) across Library, Explore, and Search.
- **Room Together Overhaul (Phase 1 & Phase 2)**:
  - **Backend Persistence, Versioning & Lifecycle**: Added PostgreSQL/Prisma room models (`TogetherRoom`, `TogetherRoomMember`, `TogetherRoomEvent`, `TogetherRoomAudit`, `TogetherBookmark`, `TogetherReaction`, `TogetherSongRequest`, `TogetherInvite`, `TogetherChatMessage`, `TogetherUserSession`, `TogetherAchievementDef`, `TogetherUserAchievement`, `TogetherRoomRecap`), modular services under `backend/src/services/together/`, `/api/v1/together/*` routes (with `/api/together/*` delegation), versioned `/ws/together` event envelopes with `RESUME { lastSeq }` replay, queue revision conflict detection (`409 QUEUE_CONFLICT`), Android App Links (`/.well-known/assetlinks.json`, `/room/:code`), and `RoomLifecycleScheduler` (90s host failover, stale member cleanup, `ROOM_ENDING_SOON` alerts, expiry, and recap generation).
  - **Mobile Collaborative Features & Apple Design Kit**: Introduced `apple_tokens.dart` and `apple_kit.dart`, rebuilt `RoomTogetherScreen` with RBAC roles & waiting-room approvals, LiveKit voice rooms (`VoiceController`, `VoiceSheet`), synced room lyrics with translation/romanization toggles, floating reactions & reaction timeline, timestamped moments/bookmarks, song requests & DJ settings, room taste discovery recommendations, customizable room themes, expiring QR/WhatsApp invites & deep links (`zenify://room`, `https://zenify.app/room`, `https://listenzenify.com/room`), chat reply/edit/delete, achievements, insights, and shareable PNG room recap cards.
- **Automated GitHub Releases CI Workflow**: Added `.github/workflows/release.yml` to build split ARM64 and universal APKs and publish release assets automatically.

### Improved
- **Complete Native SF Pro Typography Overhaul**: Migrated all remaining screens, modals, bottom sheets, player views, insights cards, settings, and `ZenDropdown` from `GoogleFonts.inter` to bundled `SF Pro` and `SF Pro Display` fonts, completely removing the `google_fonts` package dependency.
- **Apple Music Weights & Tabular Figures**: Replaced thin/hairline weights (`w100`–`w300`) with balanced medium (`w500`), semibold (`w600`), and bold (`w700`) typography and applied `FontFeature.tabularFigures()` across track numbers, playback timers, and counters.
- **Scroll-Driven Dock Morphing & Explore Layout**: Updated `ShellScreen` to track `ScrollNotification` deltas (`ScrollUpdateNotification` + `UserScrollNotification`) for responsive 240ms dock morphing across pages regardless of track state, and refreshed `ExploreScreen` section ordering and mood/genre chip category routing.
- **Non-Intrusive Notification Polish**: Replaced legacy `ScaffoldMessenger` `SnackBar` popups in `ZenDropdown`, `AlbumScreen`, `ArtistScreen`, and `SettingsScreen` with Dynamic Island notifications.

### Fixed
- **Search Back Navigation & Suggestion Precedence**: Restored `SearchScreen.onBack` handling in `PopScope` and prioritized live suggestions over loading spinners while typing.
- **InnerTube Automix Null-Safety & Smart Queue Fallback**: Replaced unsafe `get(0)` / `!!` / `getOrThrow()` calls in `YouTube.kt` (`getNext`) with nullable `getOrNull` checks so playlist schema mismatches do not crash queue loading; added an autoplay buffer cap (`autoCount >= 6`) in `QueueState` and multi-tier fallback (`getNextQueue` -> `fetchRelated` -> `ApiService.search` -> `CatalogDataSource`) in `SmartQueueEngine`.
- **Dynamic Island Ticker Font Resolution**: Updated `_NotifTicker` body spans in `DynamicIslandHeader` to `'SF Pro'` (`w500`) so bundled fonts render reliably without fallback.

### Technical
- **Release & Distribution Sync (`v1.0.8` / Build `12`)**: Combined Room Together Phase 1 & 2 with `v1.0.8` (bumped Android build number `1.0.8+12` in `pubspec.yaml`, `SettingsScreen`, `UpdateService`, and `remote_config.json`), added `org.webrtc.**` and `io.livekit.**` R8/ProGuard rules (`proguard-rules.pro`), purged legacy APK packages (`v1.0.3`, `v1.0.4`, `v1.0.7`, old `v1.0.8`), published fresh ARM64 & Universal APKs across web/backend/GitHub Releases, updated `README.md`, `download/page.tsx`, `about/page.tsx`, `about-zenify/page.tsx`, `sidebar.tsx`, `sitemap.xml`, `llms.txt`, and `homeSeo.ts`, and added Room Together unit tests (`lyrics_test.dart`, `phase2_test.dart`, `room_models_test.dart`) and backend audit documentation (`docs/together/AUDIT.md`).

## [1.0.7] - 2026-11-11

### Added
- **Native Apple San Francisco Pro (SF Pro) Typography**: Packaged authentic SF Pro fonts (Text Regular, Medium, Semibold, Bold, and Display Bold) into application assets and bound to global `ThemeData`, eliminating Google Fonts runtime network latency and matching Apple Music's exact visual identity.
- **Round-Shaped Stadium Edges for 3-Dock Island**: Left dock and right search dock in the collapsed 3-dock island now use pure circular stadium edges ($h / 2 = 27\text{px}$) with zero boxy/squircle corners.
- **Restoration Action for Left Dock Button**: Tapping the collapsed left dock button now smoothly expands the resting navbar dock, miniplayer, and search dock without inadvertently navigating away to the Explore tab.
- **In-App Force Update Engine & Rich Release Notice**: Integrated mandatory force update protection with detailed changelog breakdown (Features, Fixes, Improvements), release timestamp, and one-tap auto-update downloading.

## [1.0.6] - 2026-11-10

### Added
- **Liquid Glass Three-Dock Morphing Island**: On scroll down, the bottom navigation dock fluidly collapses into the Apple Music 3-dock island layout (Explore squircle launcher in rose, Center mini player island with album artwork, title, artists, and playback controls, and Right Search squircle).
- **Apple Music Contextual Dropdown & Action Sheet**: Rebuilt all 3-dots menus into docked liquid glass modal bottom sheets with 25px blur, `#1C1C1E` background, song information header with artwork and like heart, 4 circular quick-share shortcuts (Copy Link, Message, Instagram Stories, Facebook Stories), and 6 clean action rows with single dividers.
- **Featured Artists Docked Bottom Sheet**: 60px circular artist avatars matching profile pages, listeners/subscribers count, Apple Music Follow button, and View artist profile navigation.
- **Unified Inter Typography**: Standardized typography across all components, sheets, and pages using `GoogleFonts.inter`.
- **Rebuilt InnerTube Search Pipeline & Ranking Engine**: Multi-tier phonetic transliteration matching, strict query intent routing (exactArtist, artistType, songTitle, album), and complete zero-missing-name regression protection.

## [1.0.5] - 2026-11-10

### Added
- **Floating Dynamic Island Header Everywhere**: Dynamic Island 3-dock headers now float permanently above scrollable content on Settings, Profile, Room Together, Insights & Replay, Album, Artist, and Search screens.
- **Unified Library Profile Dock**: Clean single Apple-style frosted profile avatar dock at the top right of the Library screen matching Home and Explore.
- **Robust Library Persistence**: Liked songs, saved albums, followed artists, and playlists reliably stored with metadata and dual-key backup protection.
- **In-Playlist Online Song Search**: Instant YouTube Music InnerTube search with debounced typing and Apple Music-style pill controls.
- **Room Together Synchronized Collaborative Listening**: Sub-millisecond NTP clock sync, democratic fair queue, and multi-client playback synchronization.



### Added
- **Canonical Provider Data Identity**: Integrated provider-based IDs (`providerId`, `provider`) for Artists, Albums, and Tracks with relational `TrackArtist` role mapping (`primary`, `music`, `singer`, `featured`).
- **Catalog Provider Architecture**: Abstracted JioSaavn provider behind `ICatalogProvider` interface with PostgreSQL-backed TTL caching (`ProviderCache`).
- **Verified Language Preferences**: Added strict 1 to 6 music language selection chips modal with 16 verified catalog languages, blocking 7th language selections, browser locale auto-suggestions, and guest `localStorage` merge on login.
- **Personalization Engine**: Listen event tracking (`ListenEvent`) with 30-day half-life exponential affinity decay, dynamic language weighting, diversity caps, candidate generation from JioSaavn radio/suggestions, and privacy controls (clear listening history, toggle personalization).
- **Unified 8-Section JioSaavn-Style Feed**: Redesigned home feed for desktop and mobile with canonical sections (Jump Back In, Recommended for You, Artists You May Like, Trending Now, New Releases, Top Charts, Albums for You, Because You Listened to X), strict image validation, and removal of unknown artist fallbacks.
- **Privacy & Security**: Enforced owner-only access for listening history, account deletion cascade, zero PII on creator page, and EXIF-stripped WebP creator image.

### Fixed
- **Mobile Queue Accidental Playback**: Enlarged remove button touch target to 44x44px with event propagation guards and ID-based removal.
- **Numeric Provider Artist Resolution**: Fixed numeric artist ID parsing ensuring canonical provider artist pages and exact tracklists load without name-search fallbacks.
- **Stale Mobile Home Cache**: Replaced divergent mobile logic and stale client IndexedDB caching with unified `/api/homepage/feed` using private cache-control headers.

