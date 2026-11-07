# 14. Task Backlog

Work top to bottom. Tick when done and verified. Doc references in brackets.

## P1 Design system and skeleton [02, 03, 05, 09]
- [ ] P1-01 Create project, folders, analysis_options, DI, flavors
- [ ] P1-02 Color tokens dark/light as ThemeExtension
- [ ] P1-03 Typography tokens, font registration, Indic fallbacks
- [ ] P1-04 Spacing/radius constants; squircle helper (radius ×2)
- [ ] P1-05 `Springs` presets + unit test of stiffness/damping values
- [ ] P1-06 `PressableScale`
- [ ] P1-07 `GlassSurface` with fallback flag
- [ ] P1-08 `SkeletonShimmer`, `SectionHeader`, `MediaCard`, `SongTile`, `PillChip`
- [ ] P1-09 `EmptyState`, `ErrorState`, `OfflineBanner`, `GlassToast`
- [ ] P1-10 `AppShell` with 4-tab StatefulShellRoute and tab bar
- [ ] P1-11 Component gallery (`/dev/gallery`)
- [ ] P1-12 Impeller + high refresh rate setup

## P2 Audio engine [06, 12]
- [ ] P2-01 `ZenifyAudioService` + notification
- [ ] P2-02 `ZenifyExoPlayerManager` + audio focus + noisy receiver
- [ ] P2-03 Channel contract + Dart bridges
- [ ] P2-04 `PlayerBloc` + position notifier (250 ms native → Ticker interpolation)
- [ ] P2-05 Local file playback end to end
- [ ] P2-06 `AudioCacheManager` + settings hook
- [ ] P2-07 `StreamSource` interface + `InnerTubeStreamSource`
- [ ] P2-08 Solver cache per player version, URL expiry map
- [ ] P2-09 `ResolvingDataSource` re-resolve on 403/expiry
- [ ] P2-10 Pre-resolve next 1-2 queue items
- [ ] P2-11 Queue ops (add, remove, move, shuffle, repeat)
- [ ] P2-12 Sleep timer with 60 s fade
- [ ] P2-13 Diagnostics v1
- [ ] P2-14 Process-death reattach via `getState`

## P3 DSP [07]
- [ ] P3-01 `FxProcessor` base + chain + master bypass
- [ ] P3-02 `MidSideVocalProcessor` + tests
- [ ] P3-03 `ParametricEqualizerProcessor` + preamp + tests
- [ ] P3-04 `EchoDelayProcessor`
- [ ] P3-05 `ConvolutionReverbProcessor` (+ synthetic IR fallback)
- [ ] P3-06 `Spatial8DProcessor`
- [ ] P3-07 `DynamicsCompressorProcessor`
- [ ] P3-08 FX channel handler + `AudioFxCubit`
- [ ] P3-09 Speed/pitch via PlaybackParameters
- [ ] P3-10 Click test, CPU and underrun measurements

## P4 Player UI [02, 03]
- [ ] P4-01 `PlayerSheetController` + progress-derived layout
- [ ] P4-02 `MiniPlayerOverlay` (+ swipe prev/next)
- [ ] P4-03 `FullPlayerScreen` layout and dismissal drag
- [ ] P4-04 `ScrubberSlider` (haptics, fine-scrub)
- [ ] P4-05 Ambient background (palette, cached per track)
- [ ] P4-06 Artwork pause/play scale, cover tilt
- [ ] P4-07 Marquee title, like heart, transport controls, repeat modes
- [ ] P4-08 Output picker (system) and Cast stub

## P5 Content screens [04, 12]
- [ ] P5-01 `CatalogSource` + `MockCatalogSource` + mock JSON loaded
- [ ] P5-02 Drift DB (library, likes, history, downloads)
- [ ] P5-03 Home
- [ ] P5-04 Explore
- [ ] P5-05 Search (idle, suggestions, results segments)
- [ ] P5-06 SectionDetail (pagination)
- [ ] P5-07 Artist (tabs, carousels, bio)
- [ ] P5-08 Album
- [ ] P5-09 Playlist (reorder, swipe-delete, recommended)
- [ ] P5-10 Liked Songs
- [ ] P5-11 Library tab
- [ ] P5-12 Day Mix
- [ ] P5-13 Song context menu and Add-to-playlist sheet

## P6 Lyrics, Queue, FX [04, 07, 12]
- [ ] P6-01 LRC parser + tests (multi-timestamp, enhanced, offset)
- [ ] P6-02 `LyricsSource` mock + remote + Drift cache
- [ ] P6-03 `LyricsSheet` (spring scroll, blur, tap-to-seek, word highlight)
- [ ] P6-04 Romanization switch + offset stepper
- [ ] P6-05 `QueueBottomSheet` (now playing, next, context, history)
- [ ] P6-06 `StudioFxSheet` all modules incl. Echo
- [ ] P6-07 Presets persisted and applied
- [ ] P6-08 Sleep Timer sheet

## P7 Device, Downloads, Settings, extras [04, 06, 09]
- [ ] P7-01 Permission screens (notifications, audio)
- [ ] P7-02 MediaStore scan + Device Library tabs
- [ ] P7-03 Downloads manager
- [ ] P7-04 Settings (all rows wired)
- [ ] P7-05 Profile, Notifications
- [ ] P7-06 Onboarding / Login (guest login first)
- [ ] P7-07 Diagnostics v2 + log export
- [ ] P7-08 Offline mode behavior across screens

## P8 Backend and realtime [08]
- [ ] P8-01 Server skeleton + Docker Compose
- [ ] P8-02 Auth (guest JWT), `/time`
- [ ] P8-03 Rooms REST + STOMP state/presence
- [ ] P8-04 Chat, reactions, rate limits
- [ ] P8-05 Client clock sync + drift correction
- [ ] P8-06 `TogetherBloc` + Hub + Room screens + emoji canvas
- [ ] P8-07 Listening events upload + taste profile
- [ ] P8-08 Blend scoring, shared playlist, daily job
- [ ] P8-09 `BlendBloc` + Hub + Detail + ring animation
- [ ] P8-10 Two-device sync measurement

## P9 Polish and release-to-self
- [ ] P9-01 Reduce-motion and 130% text pass
- [ ] P9-02 Profile-mode jank audit of every screen
- [ ] P9-03 Memory/battery check against targets in 09
- [ ] P9-04 Signed debug/profile APK for test devices

## P10 Resilience [16, 06, 12]
Do P10 tasks in order. Read `16-RESILIENCE-PLAYBOOK.md` first and obey its hard boundaries.
- [ ] P10-01 Adopt `reference/services/*` (transport, InnerTubeService, ArtistService, ApiService); analyzer clean; screens still work on mocks
- [ ] P10-02 Unit tests for `InnerTubeTransport` with a fake `http.Client` (breaker, 403 no-retry, Retry-After, stale-if-error, dedupe, pacing)
- [ ] P10-03 `RemoteConfig` + `RemoteConfigService` from `starter/lib/`; tests for clamping, rollback refusal, version compare
- [ ] P10-04 Make transport, ApiService and caches read tunables and kill switches from `RemoteConfig`
- [ ] P10-05 Kill-switch behavior: killed feature returns cached/empty state, never an error dialog
- [ ] P10-06 Create one release keystore (kept outside the repo), signing config, documented in `RELEASING.md`; verify an update installs over a previous build
- [ ] P10-07 GitHub Releases workflow (build, sign, upload) + Obtainium install instructions for friends
- [ ] P10-08 `UpdateBanner` (soft/hard via `updateState`), opens `updateUrl`
- [ ] P10-09 Choose the extractor library: record name, version, licence, required HTTP interface, and a short test result in `DECISIONS_LOG.md`. Do not write cipher/token code yourself
- [ ] P10-10 `ExtractorStreamSource` + HTTP interface implementation over OkHttp
- [ ] P10-11 `ResolvingDataSource` for `zenify-yt://<id>`: `UrlCache` (expiry-aware), single-flight, concurrency limit, jittered pre-resolve, re-resolve once on 403/410
- [ ] P10-12 Error taxonomy (`RATE_LIMITED`, `BOT_CHECK`, `UNAVAILABLE`, `EXTRACTOR_BROKEN`, `NETWORK`) as channel events + Dart handling + UI copy
- [ ] P10-13 Native `ResolverPolicy` (breaker) and channel method `setResolverConfig`, driven by `RemoteConfig`
- [ ] P10-14 Switch default to `ZENIFY_STREAM_MODE=device`; confirm cloud no longer touches YouTube
- [ ] P10-15 Diagnostics additions: resolver library+version, breaker state, config version, last 20 errors (no URLs/tokens), export to file
- [ ] P10-16 Opt-in `FailureReporter` + `POST /api/diag` aggregate endpoint
- [ ] P10-17 Cool-down UX: banner with remaining time, keep playing cached/downloaded audio
- [ ] P10-18 Drill: simulate "extractor broken" via config; verify banner, fallbacks, cached playback
- [ ] P10-19 Soak test (2 h screen-off queue play) and acceptance criteria from `16`
- [ ] P10-20 (Deferred, only if the user asks) Optional signed-in mode per `16` section 7
