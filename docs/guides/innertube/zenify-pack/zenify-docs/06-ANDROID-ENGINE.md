# 06. Android Kotlin Audio Engine

Package: `com.zenify.music`. Gradle deps: `androidx.media3:media3-exoplayer`, `media3-session`, `media3-datasource-okhttp`, `media3-database`, `kotlinx-coroutines-android`, OkHttp, a QuickJS binding (e.g. `app.cash.quickjs` or `quickjs-kt`).

## Files

```
channel/  AudioMethodChannelHandler, AudioEventChannelHandler, FxMethodChannelHandler
dsp/      ZenifyAudioProcessorChain + 7 processors (see 07)
innertube/ InnerTubeClient, CipherSolver, PoTokenProvider, StreamExtractorRepository, StreamFormatSelector
player/   ZenifyExoPlayerManager, ExoPlayerEventListener, MediaSourceFactoryProvider, AudioCacheManager, NtpClockSynchronizer
service/  ZenifyAudioService, MediaNotificationManager, AudioNoisyReceiver, PackageRebootReceiver
```

## Service

- `ZenifyAudioService : MediaLibraryService` (foreground, `mediaPlayback` type), owns `ExoPlayer` and `MediaLibrarySession`.
- Notification via `MediaNotificationManager` (Media3 `DefaultMediaNotificationProvider`), channel `zenify_playback`.
- `AudioNoisyReceiver` pauses on headphone unplug (or use `setHandleAudioBecomingNoisy(true)`).
- Audio focus: `setAudioAttributes(USAGE_MEDIA, CONTENT_TYPE_MUSIC, handleAudioFocus = true)`.
- Wake: `setWakeMode(C.WAKE_MODE_NETWORK)`.
- Flutter attaches to the running service on start and calls `getState()`.

## ExoPlayer setup

```kotlin
val renderers = object : DefaultRenderersFactory(ctx) {
  override fun buildAudioSink(c: Context, floatOut: Boolean, tunnel: Boolean) =
    DefaultAudioSink.Builder(c)
      .setAudioProcessors(chain.processors())      // Sonic is inside the sink for speed/pitch
      .setEnableFloatOutput(true)                  // float PCM for DSP headroom
      .build()
}.setEnableAudioFloatOutput(true)

player = ExoPlayer.Builder(ctx, renderers)
  .setMediaSourceFactory(DefaultMediaSourceFactory(cacheDataSourceFactory))
  .setLoadControl(DefaultLoadControl.Builder()
      .setBufferDurationsMs(15_000, 60_000, 1_500, 3_000).build())
  .build()
```

Speed and pitch: `player.playbackParameters = PlaybackParameters(speed, pitch)` with `pitch = 2^(semitones/12)`. Media3's built-in Sonic handles pitch independent of tempo, so the plan's `SonicAudioProcessor` is satisfied by the sink.

Crossfade: second player instance fading volumes over N seconds, or `ConcatenatingMediaSource` with gapless metadata; implement gapless first, crossfade second.

## Cache

`AudioCacheManager`: `SimpleCache(dir, LeastRecentlyUsedCacheEvictor(maxBytes), StandaloneDatabaseProvider)`. `CacheDataSource.Factory` wraps `OkHttpDataSource`. Max bytes from Settings. Downloads use `CacheWriter` or `DownloadManager` and are pinned (separate non-evicting cache).

## Stream resolution

```kotlin
interface StreamSource {
  suspend fun resolve(trackId: String, quality: Quality): ResolvedStream
}
data class ResolvedStream(val url: String, val mime: String, val bitrate: Int,
                          val itag: Int, val expiresAtMs: Long, val loudnessDb: Float?)
```

- `InnerTubeStreamSource` composes: `InnerTubeClient` (player request on device IP) → `StreamFormatSelector` (audio-only, pick by quality setting: 128k / 256k / 320k tiers, prefer opus/webm then m4a) → `CipherSolver` (QuickJS: load player JS once per player version, evaluate signature and n-param transforms) → `PoTokenProvider` (token generation as needed).
- Cache: `ConcurrentHashMap<trackId, ResolvedStream>` honoring `expiresAtMs`; solver cached per player version hash.
- Pre-resolve the next 1-2 queue items in a background coroutine when the current track passes 30%.
- Resolve via `ResolvingDataSource` so URL refresh on 403/expiry is transparent (re-resolve once, then surface error).
- Fallback chain: try alternate InnerTube client configs, then error event `RESOLVE_FAILED` with details for Diagnostics.
- Everything timed: record `fetchMs, solveMs, totalMs` per track into diagnostics.

Expect the resolver to break when upstream changes; keep it isolated and unit-testable with recorded fixtures.

## NTP clock sync (Together)

`NtpClockSynchronizer` exposes `serverOffsetMs` computed against the Together server (not public NTP), see `08-BACKEND-REALTIME.md`. Provide `fun serverNowMs() = System.currentTimeMillis() + offset` to Dart via the method channel `getServerOffset`.

## Channel contract

### `zenify/audio` (MethodChannel)

| Method | Args | Returns |
|---|---|---|
| `play` | `{track, startMs?}` | ok |
| `setQueue` | `{tracks[], startIndex, contextLabel}` | ok |
| `addToQueue` / `playNext` | `{track}` | ok |
| `removeFromQueue` | `{index}` | ok |
| `moveQueueItem` | `{from, to}` | ok |
| `pause` / `resume` / `next` / `previous` | none | ok |
| `seekTo` | `{ms}` | ok |
| `setRepeatMode` | `{mode: 0 off, 1 all, 2 one}` | ok |
| `setShuffle` | `{enabled}` | ok |
| `setSleepTimer` | `{ms}` or `{endOfTrack: true}` or `{cancel: true}` | ok |
| `setCrossfade` | `{seconds}` | ok |
| `setQuality` | `{wifi, cellular}` (128/256/320) | ok |
| `setCacheLimit` | `{bytes}` / `clearCache` | ok |
| `download` / `cancelDownload` | `{trackId}` | ok |
| `getState` | none | full snapshot |
| `getServerOffset` | none | `{offsetMs}` |
| `getDiagnostics` | none | map (see Diagnostics) |
| `scanLocalAudio` | none | `{tracks[]}` (MediaStore) |

### `zenify/audio/events` (EventChannel) payloads

```
{type:'state',    playing, buffering, index, durationMs}
{type:'position', positionMs, bufferedMs, atMs}        // every 250 ms
{type:'track',    track, index, reason}
{type:'queue',    tracks[]}
{type:'error',    code, message, trackId}
{type:'sleep',    remainingMs}
{type:'download', trackId, progress, status}
{type:'diag',     resolveMs, itag, bitrate, bufferMs}
```

### `zenify/fx` (MethodChannel)

`setMaster{enabled}`, `setPreset{name}`, `setEqBand{index, gainDb}`, `setEqAll{gains[10]}`, `setReverb{preset, wet}`, `set8D{enabled, clockwise, speedHz}`, `setKaraoke{amount}` (-1 solo … 0 original … +1 suppress), `setSpeed{value}`, `setPitch{semitones}`, `setEcho{delayMs, feedback, mix}`, `setDynamics{enabled, thresholdDb, ratio}`, `getState`.

All FX setters write into a lock-free `AtomicReference`/volatile params object; the audio thread reads it each buffer (see `07`).

## Error codes

`RESOLVE_FAILED`, `NETWORK`, `FORMAT_UNSUPPORTED`, `CACHE_FULL`, `PERMISSION_DENIED`, `SERVICE_DEAD`.

## Manifest

Permissions: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS`, `READ_MEDIA_AUDIO`, `INTERNET`, `WAKE_LOCK`, `ACCESS_NETWORK_STATE`. `PackageRebootReceiver` restores the notification after update/boot if a session existed.

## Resolver implementation note (see 16)

`InnerTubeStreamSource` in the file list above is implemented as `ExtractorStreamSource`, an adapter over a maintained open-source extractor library chosen in task P10-09. Do not hand-write cipher solving, JS deobfuscation or token generation; `CipherSolver.kt` and `PoTokenProvider.kt` become thin wrappers over the library's documented mechanisms, or are deleted if the library covers them. Dart passes `zenify-yt://<videoId>` as the media URI in device mode; `ResolvingDataSource` resolves it with `UrlCache`, single-flight, concurrency limit and one re-resolve on 403/410. Errors map to the taxonomy in 16. New channel method: `setResolverConfig{maxConcurrentResolves, urlSafetyMarginSec, breaker{threshold, baseCooldownSec, maxCooldownSec}, preResolveCount}`.
