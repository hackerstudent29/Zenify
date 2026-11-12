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

- **Pristine 320kbps Akamai CDN Audio**: Direct, low-latency stream resolution with instantaneous seeking and byte-range caching.
- **Syllable-Synced Karaoke Lyrics**: Smooth, word-level synchronized lyric highlighting with automated instrumental pause indicators (`• • •`).
- **Hardware-Accelerated Studio FX**:
  - 3-Band Parametric Equalizer (Bass, Mid, Treble with ±12dB range)
  - 8D Spatial Audio rotation with customizable orbit speed
  - Dynamic Bass Boost & Stereo Reverb
  - Speed (0.5x – 2.0x) and Pitch Warper (-12 to +12 semitones)
- **Room Together (Phase 1 & 2)**: Persistent synchronized multi-device rooms (`/api/v1/together`, `/ws/together` resume replay) with LiveKit voice chat, synced karaoke lyrics + translation/romanization, floating reactions, pinned moments, song requests, RBAC DJ controls, custom themes, QR/WhatsApp deep links, achievements, insights & shareable PNG recaps.
- **Bundled SF Pro & Dynamic Island**: Offline bundled `SF Pro` / `SF Pro Display` typography (zero Google Fonts runtime fallback), Dynamic Island in-app marquee notifications, redesigned Search, Email OTP & Onboarding, and tactile spring physics.
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
| **Version** | `1.0.9+13` |
| **ARM64 Split APK** | `33.2 MB` (`34,861,190` bytes) — SHA-256: `E0B2DFE50F934BB6E20B639F35F68D4579503D980BAF1801BE481F386E1B20BC` |
| **Universal APK** | `75.6 MB` (`79,261,404` bytes) — SHA-256: `3AD8A6A39C757F05661D58A79683B7A70C110BE3C2896744BBE728A0486BF825` |
| **Min SDK** | `Android 8.0 (API 26)` |
| **Target SDK** | `Android 15 (API 35)` |
| **Engine** | `Flutter / Dart (SDK ^3.10)` |
| **License** | `MIT` |
