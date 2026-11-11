# Changelog

All notable changes to the Zenify platform are documented in this file.

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

