# Studio FX for Flutter: setup

Status: written without access to your project, never compiled or run on a device. Treat the first build as a test pass.

## Why the engine is native
The web app does its DSP in the browser (Web Audio). Flutter has no Web Audio, and the old sheet only moved sliders. So the effects now run inside the Android player (ExoPlayer) as a custom audio processor. The backend takes no part in live playback.

## Files and where they go
| File | Destination |
|---|---|
| lib/design_system/widgets/glass_kit.dart | same path (new) |
| lib/services/studio_fx_state.dart | replaces the old file |
| lib/services/zen_player.dart | new |
| lib/views/player/studio_fx_sheet.dart | replaces the old file |
| android/.../ZenFxProcessor.kt, ZenAudioPlugin.kt | android/app/src/main/kotlin/<your package>/ (change the `package` line) |
| backend/src/services/audio-convert.service.ts | new; delete the old AudioProcessorService route |

## Steps
1. `pubspec.yaml`: make sure `shared_preferences` and `provider` are present.
2. `android/app/build.gradle(.kts)`:
   ```
   implementation("androidx.media3:media3-exoplayer:1.9.2")
   implementation("androidx.media3:media3-common:1.9.2")
   implementation("androidx.media3:media3-datasource:1.9.2")
   ```
   Check `minSdk` against the Media3 release notes.
3. `MainActivity.kt`:
   ```kotlin
   override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
       super.configureFlutterEngine(flutterEngine)
       flutterEngine.plugins.add(ZenAudioPlugin())
   }
   ```
4. `player_state.dart`: change the import to `import 'zen_player.dart' as ap;` and add `FxEngine get fxEngine => _audioPlayer;` (import `studio_fx_state.dart`).
5. App start: create `StudioFxState`, `await fx.load()`, then `fx.attachEngine(player.fxEngine)`. Provide it with `ChangeNotifierProvider`.
6. `AndroidManifest.xml` (main, not only debug): `INTERNET` permission.
7. Build a release APK, unplug, test on mobile data.

## Known differences from the web engine
- 8D uses an approximated binaural orbit (delay, level, head shadow), not the browser's HRTF.
- Speed and pitch run after the effects, so echo times are stretched with the tempo. The web runs them before.
- Reverb is Freeverb, not a convolution impulse. Adjust `wetG` in `ReverbMod` by ear.
- Android only. iOS needs an AVAudioEngine version, and until then `AudioPlayer` has no playback there.
- Background playback and lock-screen controls still need `audio_service` driving this player.
- Not included yet: the Download Studio screen (offline render of FX to WAV, then `/v1/audio/convert`).
