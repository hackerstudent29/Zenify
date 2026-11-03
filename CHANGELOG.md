# Changelog

All notable changes to the Zenify platform are documented in this file.

## [2.6.0] - 2026-11-03

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

