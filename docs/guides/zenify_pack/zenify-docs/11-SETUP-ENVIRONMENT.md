# 11. Setup and Environment

## Tools
- Flutter stable (3.x) with Impeller; Dart SDK matching.
- Android Studio (latest stable), Android SDK 35, NDK (for QuickJS/FFT if native), JDK 17.
- A real Android device (Android 10+ ; ideally one mid-range 60 Hz and one 120 Hz). Emulators are fine for logic, not for audio glitches or frame timing.
- Docker (backend, phase 8), Node or JDK for the server.
- Optional: Perfetto UI, Flutter DevTools, `adb`.

Verify all versions against current releases before pinning.

## Bootstrap
```
flutter create --org com.zenify --project-name zenify --platforms android .
# then copy starter/pubspec.yaml deps, starter/analysis_options.yaml, starter/assets/*
flutter pub get
```
`scripts/bootstrap.sh` automates this (untested template; review before running).

## Android Gradle (app module) essentials
```
android {
  namespace = "com.zenify.music"
  compileSdk = 35
  defaultConfig { applicationId = "com.zenify.music"; minSdk = 24; targetSdk = 35 }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
  buildTypes { debug { isMinifyEnabled = false } profile { } release { isMinifyEnabled = true; signingConfig = signingConfigs.getByName("debug") } }
  packaging { jniLibs { useLegacyPackaging = false } }
}
dependencies {
  implementation("androidx.media3:media3-exoplayer:<ver>")
  implementation("androidx.media3:media3-session:<ver>")
  implementation("androidx.media3:media3-datasource-okhttp:<ver>")
  implementation("androidx.media3:media3-database:<ver>")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:<ver>")
  implementation("com.squareup.okhttp3:okhttp:<ver>")
  implementation("com.github.wendykierp:JTransforms:<ver>")   // FFT for reverb
  // QuickJS binding of your choice
  testImplementation("junit:junit:<ver>")
}
```
Use one Media3 version for all artifacts. Test release builds with R8: keep rules for the QuickJS binding and any reflection-based classes in `proguard-rules.pro`.

## AndroidManifest essentials
```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>

<service android:name=".service.ZenifyAudioService" android:exported="true"
         android:foregroundServiceType="mediaPlayback">
  <intent-filter><action android:name="androidx.media3.session.MediaLibraryService"/></intent-filter>
</service>
<receiver android:name=".service.PackageRebootReceiver" android:exported="false">
  <intent-filter>
    <action android:name="android.intent.action.MY_PACKAGE_REPLACED"/>
    <action android:name="android.intent.action.BOOT_COMPLETED"/>
  </intent-filter>
</receiver>
```
Add `android:usesCleartextTraffic="true"` in the debug manifest only, for the LAN backend.

## Flutter config
- `MainActivity` extends `FlutterActivity`; register channels in `configureFlutterEngine` and bind to the service.
- Enable high refresh rate in `main()` via `flutter_displaymode`.
- Debug-only routes: `/dev/gallery`, `/settings/diagnostics`.
- Env/config via `--dart-define=API_BASE=http://192.168.x.x:8080 --dart-define=WS_URL=ws://192.168.x.x:8080/ws`.

## Backend (phase 8)
`/server/docker-compose.yml` with Postgres + Redis + app; expose on LAN; phones and PC on the same Wi-Fi.

## Troubleshooting quick list
| Symptom | Check |
|---|---|
| No notification on Android 13+ | `POST_NOTIFICATIONS` granted at runtime |
| Service killed in background | Battery optimization exemption on the test device |
| Choppy UI only in debug | Use `--profile` |
| Clicks in audio | Param smoothing, buffer sizes, underrun counter |
| 403 on stream mid-song | URL expiry; confirm `ResolvingDataSource` re-resolves once |
