# 05. Flutter App

## Packages (verify latest versions before pinning)

```yaml
dependencies:
  flutter_bloc: ^8
  get_it: ^7
  go_router: ^14
  dio: ^5
  freezed_annotation: ^2
  json_annotation: ^4
  drift: ^2
  sqlite3_flutter_libs: any
  shared_preferences: ^2
  flutter_secure_storage: ^9
  cached_network_image: ^3
  material_color_utilities: ^0.11
  motor: any                 # spring presets / motion helpers
  smooth_sheets: any         # iOS-style draggable sheets
  flutter_animate: ^4
  rive: any                  # play/pause, like, equalizer
  shimmer: ^3
  text_scroll: any           # marquee
  scrollable_positioned_list: ^0.3
  sensors_plus: ^5           # cover tilt
  flutter_displaymode: any   # 90/120 Hz
  on_audio_query: any        # MediaStore
  permission_handler: ^11
  connectivity_plus: ^6
  share_plus: ^9
  stomp_dart_client: any     # Together/Blend
  web_socket_channel: ^3
  talker_flutter: any        # log viewer
  cast: any                  # Google Cast (optional)
dev_dependencies:
  build_runner: any
  freezed: any
  json_serializable: any
  drift_dev: any
  bloc_test: any
  mocktail: any
```

Optional: `liquid_glass_renderer` for the newer glass look; `sentry_flutter` for crash capture.

## Folder structure

```
lib/
├── main.dart
├── core/
│   ├── constants/{api_endpoints,app_constants}.dart
│   ├── di/injection_container.dart
│   ├── network/{api_client,websocket_client}.dart
│   ├── router/{app_router,route_guards}.dart
│   ├── storage/{preferences_service,secure_storage}.dart
│   └── theme/{app_colors,app_theme,app_typography}.dart
├── design_system/                  # reusable widgets + motion (see 02, 03)
│   ├── motion/springs.dart
│   ├── pressable_scale.dart
│   ├── glass_surface.dart
│   └── ...
├── data/
│   ├── datasources/{local_media,remote_catalog,together_ws}_datasource.dart
│   ├── models/{album,artist,lyrics,playlist,track}_model.dart
│   ├── platform/{audio,fx}_platform_bridge.dart
│   ├── db/app_database.dart        # drift tables
│   └── repositories/*_impl.dart
├── domain/
│   ├── entities/{album,artist,audio_fx,blend_session,lyrics,playlist,together_room,track}.dart
│   └── repositories/*.dart
└── presentation/
    ├── blocs/{auth,blend,fx,home,lyrics,player,search,together,library,downloads}/
    ├── pages/…                     # per 04-SCREENS.md
    └── widgets/{full_player_screen,mini_player_overlay,queue_bottom_sheet,studio_fx_sheet,lyrics_sheet,…}.dart
```

(97 files in the original blueprint; this adds `design_system/`, `db/`, library and downloads blocs, and the extra screens.)

## Routing

```dart
final router = GoRouter(
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (c, s, shell) => AppShell(shell: shell), // tab bar + mini player + player sheet
      branches: [
        StatefulShellBranch(routes: [GoRoute(path: '/', builder: …)]),
        StatefulShellBranch(routes: [GoRoute(path: '/explore', builder: …)]),
        StatefulShellBranch(routes: [GoRoute(path: '/library', builder: …)]),
        StatefulShellBranch(routes: [GoRoute(path: '/search', builder: …)]),
      ],
    ),
    // Pushed routes use CupertinoPage for edge-swipe back on Android
  ],
);
```

`AppShell` is a `Stack`: tab content → mini player → tab bar → full-player sheet (driven by `PlayerSheetController`). Pushed pages sit above the shell but below the full player.

## State management

| BLoC/Cubit | Owns |
|---|---|
| `PlayerBloc` | Current track, queue, playing/buffering, repeat/shuffle, errors. Subscribes to the audio EventChannel. |
| `AudioFxCubit` | All FX params; persists last settings; pushes to FX bridge debounced 16 ms |
| `LyricsCubit` | Fetch/parse LRC, romanization, offset, active line index |
| `HomeBloc`, `SearchBloc` | Feeds, debounced search (300 ms) |
| `LibraryBloc`, `DownloadsBloc` | Playlists, liked, downloads progress |
| `AuthBloc` | Session, profile |
| `BlendBloc`, `TogetherBloc` | Realtime sessions (see `08`) |

Rules: events in, immutable states out (`freezed`); never put the position in `PlayerState` (use the position notifier).

## Models (core)

```dart
@freezed class Track with _$Track {
  const factory Track({
    required String id, required String title, required List<ArtistRef> artists,
    AlbumRef? album, required Duration duration, String? artUrl,
    @Default(false) bool explicit, @Default(TrackSource.remote) TrackSource source,
    String? localUri,
  }) = _Track;
}
enum TrackSource { remote, local, downloaded }
```

`Lyrics`: `List<LyricLine{Duration start, String text, List<WordTiming>? words, Map<String,String> romanized}>`, `bool synced`.

## Platform bridges

`AudioPlatformBridge` and `FxPlatformBridge` wrap the channels defined in `06-ANDROID-ENGINE.md`. They expose `Stream<AudioEvent>`, never raw maps, to the rest of the app. Keep the interface platform-neutral so an iOS implementation can be added later.

## Theming

`AppTheme.dark/light` built from tokens in `02-DESIGN-SYSTEM.md`. Use `ThemeExtension<ZenifyColors>` so widgets read `context.zen.accent`, and the player overrides it with `Theme(extensions: [tinted])`.

## Testing

Unit: blocs with `bloc_test`. Widget: golden tests for `SongTile`, `MediaCard`, `MiniPlayer`. Integration: smoke test that plays a local file and asserts position advances.
