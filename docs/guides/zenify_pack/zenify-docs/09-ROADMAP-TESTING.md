# 09. Roadmap, Testing and Diagnostics

Each phase is done only when every box is checked on a real device (not an emulator).

## Phase 1: Design system and project skeleton

- [ ] Flutter project, flavors (`dev`), lint rules, `get_it`, `go_router`, theme extension
- [ ] Tokens (colors, typography, spacing, radii) for dark + light
- [ ] `Springs`, `PressableScale`, `GlassSurface`, `SkeletonShimmer`, `SectionHeader`, `MediaCard`, `SongTile`
- [ ] Component gallery page (debug only) showing every component and spring preset
- [ ] `AppShell`: 4-tab `StatefulShellRoute`, tab bar, empty mini player slot
- [ ] Impeller on, high refresh rate enabled
- [ ] Check: press animation interrupts cleanly; tab states preserved; 60 fps in gallery

## Phase 2: Audio engine and stream resolver

- [ ] `ZenifyAudioService` with notification and lock-screen controls
- [ ] Channel contract implemented (`06`) with Dart bridges and `PlayerBloc`
- [ ] Local file playback via URI first
- [ ] `StreamSource` + InnerTube resolver, solver cache, pre-resolve next track
- [ ] `SimpleCache` + cache limit setting
- [ ] Diagnostics page v1 (resolve times, URL expiry, errors)
- [ ] Check: 30-minute playback screen-off; headphone unplug pauses; app killed and service survives; second song starts < 1 s after the first ends with pre-resolve

## Phase 3: DSP

Add in this order, testing each in isolation: Karaoke → EQ → Echo → Reverb → 8D → Dynamics.

- [ ] Each processor passes the unit tests in `07`
- [ ] FX channel wired, params smoothed
- [ ] Speed and pitch via `PlaybackParameters`
- [ ] Master bypass is bit-exact passthrough
- [ ] Check: slider sweeps produce no clicks; CPU < 10% callback budget with all FX; underruns = 0

## Phase 4: Player UI

- [ ] Mini player with swipe next/previous
- [ ] `PlayerSheetController` mini → full, gesture-driven with spring settle
- [ ] Scrubber with haptics and fine-scrub
- [ ] Ambient background (cached per track), artwork pause/play scale
- [ ] Marquee title, like heart (bouncy), transport controls
- [ ] Check: 20 drags without jank; interrupt mid-spring continues smoothly; no `BackdropFilter` in lists

## Phase 5: Content screens

- [ ] Home, Explore, Library, Search (+ results segments), Section, Artist, Album, Playlist, Liked
- [ ] Drift DB for library/likes/history
- [ ] Skeleton/empty/error/offline on each
- [ ] Check: long lists at 60 fps in profile mode; image memory stable over 5 min scroll

## Phase 6: Lyrics, Queue, Studio FX

- [ ] Lyrics sync with offset stepper, romanization, tap-to-seek, plain fallback
- [ ] Queue sheet with reorder, swipe-remove, history tab
- [ ] Studio FX sheet with all modules incl. Echo, presets persisted
- [ ] Sleep timer with 60 s fade
- [ ] Check: active lyric within ±100 ms; reorder reflected natively without playback glitch

## Phase 7: Device library, downloads, settings, extras

- [ ] MediaStore scan, tabs, ID3 art, permission flow
- [ ] Downloads manager, offline-only filters
- [ ] Settings, Profile, Notifications, Onboarding, Diagnostics v2

## Phase 8: Backend + Blend + Together

- [ ] Backend per `08`, Docker Compose
- [ ] Blend create/join/detail with ring animation
- [ ] Together hub, room, presence, queue, chat, emoji canvas
- [ ] Clock sync + drift correction
- [ ] Check: two phones stay within ~80 ms (record both speakers with a third phone and compare waveforms); host leave transfers DJ; reconnect restores state

## Diagnostics page (Settings → About → Diagnostics)

| Section | Shows |
|---|---|
| Stream | trackId, itag, mime, bitrate, URL expiry countdown, resolve fetch/solve/total ms |
| Player | state, buffer ahead (ms), underruns, dropped frames, decoder name, output sample rate |
| DSP | each processor on/off, chain latency, callback load % |
| Cache | size/limit, hit rate, entries |
| Network | type, last 20 requests with status/time |
| Together | clock offset, RTT, drift (ms), speed nudge |
| UI | FPS overlay toggle, glass fallback toggle, reduce-motion toggle |
| Logs | `talker` viewer, filter by tag, export to file |

## Test matrix

| Area | Test |
|---|---|
| Devices | Low (3 GB RAM), mid, high-refresh (120 Hz) |
| Network | Wi-Fi, 4G, airplane (offline cache), network switch mid-track |
| Interrupts | Phone call, other audio app, Bluetooth connect/disconnect, screen lock |
| Lifecycle | Background 30 min, swipe app away, device reboot |
| Accessibility | 130% text, TalkBack labels, reduce-motion |
| Locale | Tamil/Telugu/Hindi text rendering in lists, lyrics, romanization |

## Performance targets

| Metric | Target |
|---|---|
| Cold start to first frame | < 1.5 s |
| Tap song to audio | < 1.2 s uncached, < 300 ms cached |
| UI jank | < 1% frames over budget |
| Memory (playing, Home open) | < 350 MB |
| Battery (screen-off playback, 1 h) | < 4% |
