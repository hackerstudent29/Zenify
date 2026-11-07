# 01. Architecture

## Layers

```
┌───────────────────────── Flutter (Dart) ─────────────────────────┐
│ presentation: pages, widgets, BLoCs/Cubits                       │
│ domain:       entities, repository interfaces                    │
│ data:         datasources, models, repository impls, bridges     │
└───────────────┬───────────────────────────────┬──────────────────┘
        MethodChannel / EventChannel      HTTP + WebSocket
                │                               │
┌───────────────▼───────────────┐      ┌────────▼─────────────────┐
│ Android Kotlin engine         │      │ Backend (Together/Blend) │
│ service, ExoPlayer, DSP,      │      │ STOMP WS + REST + DB     │
│ stream resolver, cache, NTP   │      └──────────────────────────┘
└───────────────────────────────┘
```

## Playback data flow

```
Tap song → PlayerBloc → AudioPlatformBridge.play(track)
  → AudioMethodChannelHandler → ZenifyExoPlayerManager
      1. SimpleCache hit? play from cache
      2. else StreamSource.resolve(trackId) → HTTPS audio URL
      3. MediaSource → ExoPlayer → AudioProcessor chain → AudioTrack
  ← AudioEventChannelHandler → EventChannel → PlayerBloc state
```

## Key decisions

| Topic | Decision |
|---|---|
| Stream provider | Hidden behind `StreamSource { suspend fun resolve(id): ResolvedStream }`. `InnerTubeStreamSource` is the default; others can be added without touching player or UI. |
| Resolver speed | Cache solver per player version; pre-resolve next queue item while current plays; retry with alternate client on failure. |
| State | `flutter_bloc`. Player state is the only high-frequency stream. |
| Position updates | Native sends position every 250 ms. Flutter interpolates with a Ticker and exposes a `ValueNotifier<Duration>` so only the scrubber rebuilds. |
| Persistence | `drift` (SQLite) for library, liked, history, downloads metadata. `shared_preferences` for settings. |
| Offline | `SimpleCache` (LRU, size from Settings) plus explicit downloads. Device files play via file URI. |
| Backend | Needed only for Together, Blend, login/profile sync. Everything else runs on device. |
| Android-first | iOS needs a separate DSP engine; keep the `AudioPlatformBridge` interface platform-neutral. |

## Cross-cutting

- **Logging:** `talker` on Dart side, Logcat tags `ZEN/*` on Kotlin side. Both feed the Diagnostics page.
- **Errors:** every bridge call returns `Result<T>`; UI shows `ErrorState` with retry.
- **Connectivity:** `connectivity_plus` drives the offline banner and the "offline-only" filter.
- **Permissions:** notifications (Android 13+), `READ_MEDIA_AUDIO` for Device Library, requested lazily with a rationale sheet.
- **Process death:** the foreground service owns the player; Flutter reattaches via `getState()` on resume.
