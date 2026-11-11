# Changelog

All notable changes to the Zenify platform are documented in this file.

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

