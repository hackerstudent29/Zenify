# Changelog

All notable changes to Zenify will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.5.0] - 2026-02-28 🚀 **Current**

### ✨ Added
- **Studio FX Glass Panel** – Redesigned audio effects interface with glassmorphism aesthetic
- **Improved Settings UI** – Cleaner, more intuitive settings modal
- **Tamil/Hindi/Malayalam Synced Lyrics** – Real-time word-level highlighting with karaoke mode
- **3-Band Parametric EQ** – Professional audio control (Bass/Mid/Treble ±12dB)
- **8D Spatial Audio** – Immersive bi-directional panning with adjustable orbit speed
- **Vocal Isolation** – Extract vocals or background instruments (zero-latency)
- **DJ Controls** – Speed (0.5x-2x) + independent pitch shifting (-12 to +12 semitones)
- **Advanced Effects** – Chorus, Echo, Reverb (Small Hall/Cathedral), Drive/Warmth, Stereo Width
- **Night Mode** – Dynamic compression for comfortable late-night listening
- **10+ Audio Presets** – After Hours, Immersive, Bass Boost, Vocal Boost, Lo-Fi, Dream Echo, etc.
- **Local File Playback** – MP3, FLAC, WAV, M4A, AAC (100% private, no upload)
- **Full Offline Support** – PWA with cached content + local files
- **Reactive Backgrounds** – Album colors pulse with beat
- **Smart Queue System** – Preserved user queue + context queue + smart autoplay

### 🎨 Improved
- Fixed artwork theme application (no more flicker)
- Cleaned up settings page layout and organization
- Improved mobile responsiveness across all screen sizes
- Better error messages for failed audio loads
- Faster local file indexing with id3 tag extraction

### 🐛 Fixed
- Audio flicker on track transitions
- Settings modal z-index conflicts
- Lyrics sync drift after long playback sessions
- PWA cache invalidation on app updates

### 📦 Technical
- Upgraded React to 19.x
- Updated Vite to 6.x
- PostgreSQL database with Prisma ORM
- Fastify 5.7 backend API
- Web Audio API for real-time DSP

---

## [2.4.0] - 2026-02-15

### ✨ Added
- Gapless playback with configurable crossfade
- YouTube audio streaming as fallback source
- iTunes CDN priority for official releases
- Improved lyrics syncing accuracy (sub-second)

### 🎨 Improved
- Better mobile UI responsiveness
- Faster search indexing with PostgreSQL full-text search
- Improved artist page layout

### 🐛 Fixed
- Audio context not resuming on mobile
- Search results pagination issue
- Lyrics timing drift on slower connections

---

## [2.3.0] - 2026-01-30

### ✨ Added
- Local library management (favorites, playlists)
- Basic audio visualization with canvas
- User profile customization

### 🐛 Fixed
- Mobile player controls sometimes unresponsive
- Search timeout on large queries

---

## [2.2.0] - 2026-01-15

### ✨ Added
- Initial Flutter Android companion app
- Basic synced lyrics (Tamil, Hindi)
- Simple equalizer

### 🐛 Fixed
- Backend API rate limiting issues
- Frontend build optimization

---

## [2.1.0] - 2026-01-01

### ✨ Added
- Improved UI with glassmorphism design
- Better artist pages with related artists
- User authentication & playlists

---

## [2.0.0] - 2025-12-15 🎉 **Major Release**

### ✨ Added
- Complete web player redesign
- PostgreSQL database migration from MongoDB
- Full backend refactor (Fastify)
- Real-time lyrics support
- Multi-language support foundation

---

## [1.0.0] - 2025-11-01

### ✨ Added
- Initial Zenify web player launch
- YouTube audio streaming
- Basic search functionality
- Simple UI with React

---

## Legend

- ✨ **Added** – New features
- 🎨 **Improved** – Enhancements to existing features
- 🐛 **Fixed** – Bug fixes
- ⚠️ **Changed** – Breaking changes or significant modifications
- 🔒 **Security** – Security patches
- 📦 **Technical** – Technical improvements, dependencies, refactors

---

## How to Contribute Changes

When adding a new version:

1. Add a new section at the top with format: `## [X.Y.Z] - YYYY-MM-DD`
2. Add relevant categories (Added, Improved, Fixed, etc.)
3. Use clear, user-facing descriptions
4. Link to related pull requests or issues if applicable
5. Follow [Semantic Versioning](https://semver.org/):
   - **MAJOR** version for incompatible API changes
   - **MINOR** version for backwards-compatible new features
   - **PATCH** version for bug fixes

