# 📱 Zenify Mobile Client

<div align="center">
  <img src="https://res.cloudinary.com/dzqcuxchc/image/upload/v1779805544/zenify/brand/zenify_logo_purple_pink.png" alt="Zenify Logo" width="220" />
  <br/>
  <b>The Beautiful, Fluid, High-Fidelity Mobile Client for Zenify</b>
</div>

<br/>

Zenify Mobile is the native mobile companion for the Zenify Music streaming platform. Built with **Flutter (Dart)** and **Kotlin**, it offers visual parity with the Next.js web application, featuring immersive glassmorphic cards, smooth 3D flip card animations, and robust background audio service capabilities.

---

## ✨ Immersive Music Player Features

*   **Dynamic 3D Flip Card:** A responsive, hardware-accelerated 3D flip animation that flips the artwork card at the 90-degree Y-rotation threshold, expanding dynamically into a taller layout to display scrollable AI-synchronized lyrics.
*   **Auto-Collapsing Meta Section:** Song title, artist, and details collapse to `height: 0` and fade out automatically when lyrics are active, dynamically shifting the lyrics card to maximize display area on any mobile screen size.
*   **Sleek Rose Scrubber:** A customized progress bar built with a low-profile pink active track (`Color(0xFFF43F5E)`), a tiny thumb, and negative remaining duration calculation (e.g. `-${_formatDuration(remaining)}`).
*   **Persistent Native Background Audio:** Fully integrated with Android's native audio frameworks via `audio_service` and `just_audio`. Continues playing gapless music in the background, displays native lock screen controls, and binds to media button events (headphone controls).
*   **Optimistic Server Likes Sync:** Automatically fetches like statuses for tracks and performs optimistic UI updates when toggling Likes, sending background requests (POST `/tracks/:id/like`) to the API.

---

## 🛠️ Native Android Integration Configurations

To support background media playback on Android 14+ (API 34/35/36), specific configurations are applied to the native layer:

### 1. Host Activity Subclassing
The standard `FlutterActivity` is replaced by `AudioServiceActivity` in [`MainActivity.kt`](file:///d:/.gemini/Zenify/flutter_app/android/app/src/main/kotlin/com/zenify/zenify_app/MainActivity.kt):
```kotlin
package com.zenify.zenify_app

import com.ryanheise.audioservice.AudioServiceActivity

class MainActivity: AudioServiceActivity()
```

### 2. Service and Receiver Declarations
The background service and media receivers are declared inside the `<application>` tag of [`AndroidManifest.xml`](file:///d:/.gemini/Zenify/flutter_app/android/app/src/main/AndroidManifest.xml):
```xml
<service android:name="com.ryanheise.audioservice.AudioService"
    android:foregroundServiceType="mediaPlayback"
    android:exported="true"
    tools:ignore="Instantiatable">
    <intent-filter>
        <action android:name="android.media.browse.MediaBrowserService" />
    </intent-filter>
</service>

<receiver android:name="com.ryanheise.audioservice.MediaButtonReceiver"
    android:exported="true"
    tools:ignore="Instantiatable">
    <intent-filter>
        <action android:name="android.intent.action.MEDIA_BUTTON" />
    </intent-filter>
</receiver>
```

### 3. Foreground Service Permissions
Required permissions added for media playback permissions:
```xml
<uses-permission android:name="android.permission.WAKE_LOCK"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"/>
```

---

## 🚀 Building & Deploying to a Device

### 1. Clean the compiler cache (Recommended for new builds)
To avoid Kotlin compilation daemon drive-mismatch issues:
```bash
flutter clean
```

### 2. Download Dependencies
```bash
flutter pub get
```

### 3. Compile and Run in Release Mode
Run the app in release mode on your connected physical Android device (by bypassing Flutter SDK version mismatch validations):
```bash
flutter run -d <device_id> --release --android-skip-build-dependency-validation
```

*Note: Make sure to unlock your device and click **"Allow/Install via USB"** if prompted on-screen.*
