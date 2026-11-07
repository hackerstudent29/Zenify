# 10. Agent Prompts (Claude Code)

Put the `zenify-docs/` folder in the repo root. Start every session by attaching `00-README.md`, then only the docs a prompt names. Keep sessions per phase and commit after each checklist item.

## Project memory (`CLAUDE.md` in repo root)

```
# Zenify
Flutter UI + Android Kotlin audio engine. Docs in /zenify-docs.
Rules:
- Follow zenify-docs exactly; if something conflicts, ask before deviating.
- All colors/text styles/spacing from design tokens (02). No hard-coded values.
- Every tappable uses PressableScale. Every animation uses Springs (03). No fixed tweens after drags.
- BackdropFilter only in tab bar, mini player, nav bars, sheets, toasts.
- Audio thread: no allocation, locks, logging (07).
- Position never lives in PlayerState; use the position ValueNotifier.
- After each task: run flutter analyze and tests, list what to verify on device.
```

## Phase prompts

**1. Design system**
> Read 00, 02, 03, 05. Create the Flutter project with the folder structure from 05. Implement theme tokens (dark+light) as a ThemeExtension, `Springs`, `PressableScale`, `GlassSurface`, `SkeletonShimmer`, `MediaCard`, `SongTile`, `SectionHeader`, and a debug-only component gallery. Build `AppShell` with the 4-tab StatefulShellRoute and the tab bar per 02. Do not build any screens yet.

**2. Audio engine**
> Read 01, 05, 06. Implement `ZenifyAudioService`, `ZenifyExoPlayerManager`, cache, and the full channel contract in 06 with Dart `AudioPlatformBridge` and `PlayerBloc`. Start with local-file playback and the `StreamSource` interface with a stub; then add `InnerTubeStreamSource` with solver caching and pre-resolve. Add the Diagnostics page v1. List device checks from phase 2 in 09.

**3. DSP** (run once per processor)
> Read 07 section N and 06's FX channel. Implement processor N with parameter smoothing and a JVM unit test per the spec. Wire it into `ZenifyAudioProcessorChain` and `FxMethodChannelHandler`. Do not touch other processors.

**4. Player UI**
> Read 02, 03, 05. Implement `MiniPlayerOverlay`, `FullPlayerScreen` and `PlayerSheetController` exactly as the progress-driven model in 03 (no Hero). Include scrubber, ambient background cached per track using material_color_utilities, artwork pause scale, marquee, like heart. Wrap glass and animated regions in RepaintBoundary.

**5. Content screens** (one screen per prompt)
> Read 04 section for <Screen>, 02, 05. Implement `<Screen>` with BLoC, repository stubs returning mock data, skeleton/empty/error/offline states, collapsing app bar, and staggered first-load animation. Use only design-system components.

**6. Lyrics, Queue, FX sheet**
> Read 04 sections 17-19, 03, 07. Implement `LyricsSheet` (LRC parse, offset stepper, romanization switch, tap-to-seek, word highlight), `QueueBottomSheet` (reorder synced to native queue), `StudioFxSheet` with every module including Echo, using `smooth_sheets`.

**7. Device, Downloads, Settings, extras**
> Read 04 sections 10, 20, 21, 06. Implement MediaStore scan and permission flow, Downloads, Settings (every row wired to native or prefs), Profile, Notifications, Onboarding, Diagnostics v2 per 09.

**8. Backend and realtime**
> Read 08, 04 sections 12-15. Create the backend in `/server` with docker-compose, implement REST and STOMP per 08, then `BlendBloc`/`TogetherBloc` and screens. Implement clock sync and drift correction exactly as specified and expose their values on the Diagnostics page.

## Review prompts (use after each phase)

> Review the diff against zenify-docs. List deviations, missing states (loading/empty/error/offline), any BackdropFilter in a list, any fixed-duration animation after a gesture, and anything allocating on the audio thread.

> Profile guidance: tell me exactly which screens/interactions to record in DevTools (profile mode) for this phase and what thresholds from 09 to check.

## Debugging prompts

> Playback fails for track X. Using the Diagnostics output below, identify whether the failure is in resolve, URL expiry, cache, or the decoder, and propose the smallest fix: <paste diag + logcat ZEN/*>

> I hear clicks when moving <slider>. Review the processor and smoothing code in 07 terms and find the discontinuity.

## Phase 10: Resilience

**10a. Adopt and test the transport**
> Read 16 and CLAUDE.md. Copy `reference/services/*` into `lib/services/`, fix imports, make analyzer clean (P10-01). Write the unit tests in P10-02 with a fake `http.Client`. Do not change behavior except to fix bugs you can demonstrate with a test, and list any.

**10b. Remote config and kill switches**
> Read 16 sections 3-4. Add `lib/services/remote_config_service.dart` from `starter/lib/` (P10-03). Wire the transport, ApiService and caches to read `RemoteConfig.current` (P10-04) and implement kill-switch behavior (P10-05). Tests for clamping and rollback refusal. Never let a config value exceed the clamps.

**10c. Releases and updates**
> Read 16 section 4. Set up a single release keystore outside the repo, signing config, `RELEASING.md`, a GitHub Actions workflow that builds, signs and uploads the APK, and the `UpdateBanner` (P10-06 to P10-08). Show me how to verify an update installs over the previous build.

**10d. Choose the extractor**
> Read 16 sections 1-2 and 06. Evaluate maintained open-source stream-extractor libraries for Kotlin/JVM. Report name, latest version, licence, activity, required HTTP interface, and whether it handles current playback requirements through its own documented mechanisms. Recommend one. Do NOT implement any cipher solving or token generation yourself. Write the decision in DECISIONS_LOG.md and stop for my approval.

**10e. Native resolver**
> After I approve the library: implement P10-10 to P10-13. `ExtractorStreamSource`, `ResolvingDataSource` for `zenify-yt://<id>`, `UrlCache`, single-flight, concurrency limit, jittered pre-resolve, one re-resolve on 403/410, error taxonomy events, `ResolverPolicy` with `setResolverConfig`. Unit-test with a fake resolver. List device checks.

**10f. UX, diagnostics, reporting**
> Read 16 sections 2, 6, 8. Implement cool-down banner, per-error UX, Diagnostics additions (no URLs or tokens), opt-in `FailureReporter` and `POST /api/diag` (P10-15 to P10-17). Then write the drill (P10-18) and soak test script (P10-19) and report results with what still needs a real device.

**Break-glass prompt**
> Playback is failing on several devices. Use this Diagnostics export: <paste>. Classify the layer and error code using 16, propose the smallest mitigation (kill switch or config message first, library bump second), and write the runbook entry.
