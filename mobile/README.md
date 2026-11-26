# Zenify Mobile (Android & iOS)

<div align="center">
  <img src="assets/images/z_logo.png" alt="Zenify Mobile Logo" width="120" />
  <h3>The Official Zenify Mobile Client</h3>
  <p><b>Ad-Free Lossless Audio • Real-Time Synced Lyrics • Studio Audio FX • Room Together</b></p>
</div>

---

## 📱 Overview

**Zenify Mobile** is the native mobile client for Zenify, built with **Flutter 3.44**, **Dart 3.12**, and native Android **Media3 ExoPlayer** integration. It brings the full, signature Zenify audio experience directly into your pocket with zero ads, high-performance background playback, and Apple-grade fluid gestures.

---

## ✨ Features

- **Sound Atlas (177 Countries, 76 Cities, 11 Feeds)**: Interactive vector world map exploration, curated regional cities, and 11 live global country chart feeds (`IN`, `US`, `GB`, `DE`, `CA`, `AU`, `JP`, `FR`, `BR`, `KR`, `AE`).
- **Pristine 320kbps Akamai CDN Audio**: Direct, low-latency full-track stream resolution (strictly zero 30s previews) with instantaneous seeking and byte-range caching.
- **16:9 4K Video Theater & Offline `.mp4` Downloads**: Widescreen 4K music videos, rigid portrait/landscape morphing, background audio playback, and concurrent offline song & video downloads.
- **20 DJ Crossfade Styles & Gapless Playback**: Powered by AndroidX Media3 `1.9.2` with 20 DJ transition styles (`1s–12s` configurable).
- **Syllable-Synced & Plain Lyrics (50+ Languages)**: Word-level karaoke timing, stationary plain full lyrics with persistent Dock & MiniPlayer, script romanization, `• • •` gap indicators, and complete Song Credits.
- **Hardware-Accelerated Studio FX**:
  - 3-Band Parametric Equalizer (Bass, Mid, Treble with ±12dB range)
  - 8D Spatial Audio rotation with customizable orbit speed
  - Dynamic Bass Boost & Stereo Reverb
  - Speed (0.5x – 2.0x) and Pitch Warper (-12 to +12 semitones)
- **Replay & Insights + Story Sharing**: 27 telemetry metrics powering monthly & all-time recaps plus 16 exportable Story Share card templates.
- **Room Together**: Persistent synchronized multi-device rooms (`/api/v1/together`, `/ws/together`) for up to 100 listeners with LiveKit voice chat, synced karaoke lyrics + romanization, floating reactions, pinned moments, song requests, RBAC DJ controls, custom themes, QR/App Links, and PNG recaps.
- **Pure OLED `#000000`, SF Pro & Dynamic Island**: Solid Pure Black OLED mode, offline bundled `SF Pro` typography, and Dynamic Island marquee notifications.
- **Offline Library & Local Music**: Seamlessly cache online tracks or play personal local audio files directly from device storage.
- **Background & Lock-Screen Playback**: Full native MediaSession notification with cover artwork, track scrubber, skip, and like controls.

---

## 🚀 Getting Started

### Prerequisites

- [Flutter SDK](https://docs.flutter.dev/) (v3.24.0 or later, tested with Flutter 3.44.2)
- [Dart SDK](https://dart.dev/) (v3.5.0 or later)
- Android Studio / VS Code with Flutter extension
- Android SDK (API 26 / Android 8.0 or higher)

### Setup & Run

1. **Install dependencies**:
   ```bash
   cd mobile
   flutter pub get
   ```

2. **Run in development mode**:
   ```bash
   # Connect an Android device or launch an emulator
   flutter run
   ```

3. **Build Release APK**:
   ```bash
   flutter build apk --release
   ```
   The generated universal APK will be located at:
   `build/app/outputs/flutter-apk/app-release.apk`

---

## 🏗️ Project Architecture

```text
mobile/
├── android/               # Native Android project, ExoPlayer Media3 & Kotlin engines
│   └── app/src/main/kotlin/com/
│       ├── metrolist/innertube/  # Native Kotlin YouTube Music InnerTube parser
│       └── zenify/mobile/        # MainActivity, audio/, innertube/, yt/
├── assets/                # Mock catalog, sample LRC lyrics, artwork & letters
├── lib/
│   ├── core/theme/        # App theme configuration
│   ├── data/              # Catalog datasources
│   ├── design_system/     # Apple Glass surfaces, tokens, springs & shared widgets
│   ├── models/            # Track, ArtistRef, PlaybackContext & Room Together models
│   ├── services/          # ZenPlayer, InnerTube, Studio FX, Cache & Room Together services
│   ├── utils/             # Media normalizer & share image helpers
│   ├── views/             # Home, Explore, Search, Library, Player, Room Together, Insights, Profile
│   └── main.dart          # App bootstrap & deep link entry
├── scripts/               # Adaptive icon generation scripts
├── test/                  # Unit & widget test suites
└── pubspec.yaml           # Dependencies, SF Pro fonts & release metadata
```

---

## 📦 Package Specifications

| Attribute | Specification |
|---|---|
| **Package ID** | `com.zenify.mobile` |
| **Version** | `1.1.22+2036` |
| **ARM64 Split APK** | `16.2 MB` (`17,008,287` bytes) |
| **Universal APK** | `36.8 MB` (`38,635,649` bytes) |
| **Min SDK** | `Android 8.0 (API 26)` |
| **Target SDK** | `Android 15 (API 35)` |
| **Engine** | `Flutter 3.44.2 / Dart ^3.12.2 / Media3 1.9.2` |
| **License** | `MIT` |
