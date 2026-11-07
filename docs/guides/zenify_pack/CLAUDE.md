# Zenify: Agent Instructions

Private test/debug music app. Flutter UI + Android Kotlin audio engine (Media3 + custom DSP). All docs live in `/zenify-docs`. Read `zenify-docs/00-README.md` first, then only the docs the current task names.

## How to work
1. Pick the next unchecked task in `zenify-docs/14-TASK-BACKLOG.md` (in order, never skip a phase).
2. Read the doc sections it references. If docs conflict or are silent, check `15-DECISIONS-AND-GLOSSARY.md`; if still unclear, choose the stated default and log it in `DECISIONS_LOG.md`.
3. Implement, run `flutter analyze` and tests (and `./gradlew test` for Kotlin), then tick the task.
4. End each task by listing what must be verified on a real device.
5. Commit per task: `P2-07: resolver cache per player version`.

## Hard rules
- Colors, text styles, spacing, radii only from design tokens (`02-DESIGN-SYSTEM.md`). No hard-coded values.
- Every tappable widget uses `PressableScale`. Every animation uses `Springs` (`03`). No fixed-duration tween after a drag.
- `BackdropFilter` only in: tab bar, mini player, collapsing nav bars, sheets, toasts. Never in list items.
- Audio thread (`AudioProcessor.queueInput`): no allocation, locks, logging, JNI (`07`).
- Playback position never lives in `PlayerState`; use the position `ValueNotifier`.
- Stream resolution only through the `StreamSource` interface. Catalog only through `CatalogSource`. Lyrics only through `LyricsSource` (`12`).
- Every screen has loading, empty, error and offline states.
- Use mock data (`assets/mock/catalog.json`) until a real source is wired; the app must run fully on mocks.
- Do not add packages not listed in `05` without noting why in `DECISIONS_LOG.md`.
- Never claim something works on device unless it was run; say "needs device verification".

## Commands
```
flutter pub get && dart run build_runner build --delete-conflicting-outputs
flutter analyze && flutter test
flutter run --profile -d <device>        # perf work always in profile mode
cd android && ./gradlew test
```

## Definition of done (per task)
Compiles, analyzer clean, tests added where the doc specifies them, states handled, tokens/springs rules respected, device-verification list written.
