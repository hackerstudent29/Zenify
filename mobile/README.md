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
- **Room Together**: Synchronized multi-device listening rooms with low-drift playback coordination.
- **Offline Library & Local Music**: Seamlessly cache online tracks or play personal local audio files directly from device storage.
- **Background & Lock-Screen Playback**: Full native MediaSession notification with cover artwork, track scrubber, skip, and like controls.
- **Fluid Apple-Inspired UI**: Custom spring physics (`linear()` spring curves), glassmorphism, dynamic artwork mesh gradients, and haptic feedback.

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

```
mobile/
├── android/               # Native Android project with Kotlin plugins & ExoPlayer Media3
│   └── app/src/main/kotlin/com/zenify/mobile/
│       ├── MainActivity.kt
│       └── audio/         # ZenAudioPlugin & ZenFxProcessor (Native DSP)
├── assets/                # Local mock catalogs, LRC files, and brand vector assets
├── lib/
│   ├── core/              # Theme tokens, colors, typography, and spacing constants
│   ├── data/              # Data sources and network catalog integration
│   ├── design_system/     # Reusable glass surfaces, buttons, springs, and sliders
│   ├── models/            # Track, ArtistRef, and Player state models
│   ├── services/          # Audio playback bridge, Innertube resolver, cache, & FX
│   │   ├── zen_player.dart
│   │   ├── stream_resolver_service.dart
│   │   ├── lyrics_service.dart
│   │   ├── studio_fx_state.dart
│   │   └── cache_service.dart
│   └── views/             # Screens: Home, Explore, Search, Player, Lyrics, Profile
└── pubspec.yaml           # Dependencies and build metadata
```

---

## 📦 Package Specifications

| Attribute | Specification |
|---|---|
| **Package ID** | `com.zenify.mobile` |
| **Version** | `2.6.0+1` |
| **Min SDK** | `Android 8.0 (API 26)` |
| **Target SDK** | `Android 15 (API 35)` |
| **Engine** | `Flutter 3.44.2 / Dart 3.12.2` |
| **License** | `MIT` |
