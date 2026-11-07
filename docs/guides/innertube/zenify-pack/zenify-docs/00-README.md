# Zenify Mobile: Build Docs

Private test/debug build. Flutter UI + native Android Kotlin audio engine (Media3 + custom DSP + client-side stream resolver). All screens and features from the master plan are kept.

## File index

| File | What it covers |
|---|---|
| `00-README.md` | This index, conventions, build order |
| `01-ARCHITECTURE.md` | Layers, data flow, decisions, scope |
| `02-DESIGN-SYSTEM.md` | Colors, fonts, spacing, nav bar, mini player, components |
| `03-MOTION-SPRINGS.md` | Spring presets, gesture-driven transitions, performance budget |
| `04-SCREENS.md` | Every screen: route, sections, states, interactions |
| `05-FLUTTER-APP.md` | Packages, folder structure, DI, router, BLoCs |
| `06-ANDROID-ENGINE.md` | Kotlin service, player, channel contract, stream resolver, cache |
| `07-DSP-SPEC.md` | Audio processor chain, parameters, math, presets, tests |
| `08-BACKEND-REALTIME.md` | Together + Blend backend, sync algorithm, schema |
| `09-ROADMAP-TESTING.md` | Phases with checklists, Diagnostics page, acceptance criteria |
| `10-AGENT-PROMPTS.md` | Copy-paste prompts for Claude Code, phase by phase |
| `11-SETUP-ENVIRONMENT.md` | Tools, Gradle, manifest, build flags, troubleshooting |
| `12-CATALOG-LYRICS-API.md` | `CatalogSource` / `LyricsSource` interfaces, JSON shapes, LRC rules, mock requirements |
| `13-ASSETS-CHECKLIST.md` | Fonts, impulse responses, icons, Rive, test audio |
| `14-TASK-BACKLOG.md` | Granular ordered tasks (P1-01 … P9-04) the agent ticks off |
| `15-DECISIONS-AND-GLOSSARY.md` | Defaults for open questions, glossary |
| `16-RESILIENCE-PLAYBOOK.md` | Blocking resilience: device-first, remote config, updates, resolver contract, runbook, tests |

## Conventions

- Dart: null-safe, `freezed` models, BLoC/Cubit for state, no business logic in widgets.
- Kotlin: coroutines for IO, no allocation or logging on the audio thread.
- Every tappable widget uses `PressableScale`.
- Every animated value comes from a spring or a gesture-controlled progress value, never a fixed tween after a drag.
- Colors, text styles, spacing, radii only from tokens in `02-DESIGN-SYSTEM.md`.
- Each phase ends with its checklist in `09-ROADMAP-TESTING.md` passing on a real device.

## Build order (riskiest first)

1. Design system + spring presets
2. Android audio service + stream resolver + plain playback
3. DSP chain, one processor at a time
4. Player UI (mini to full transition, scrubber, ambient background)
5. Content screens (Home, Search, Library, Album, Artist, Playlist, Liked)
6. Lyrics, Queue, Studio FX
7. Device Library, Downloads, Settings, Diagnostics
8. Backend + Blend + Together

## Scope decisions

- Android first. The Kotlin engine is Android-only. iOS would need an AVAudioEngine port of `07-DSP-SPEC.md`.
- Nothing is removed from the original plan. Additions: Library tab, Explore tab, Profile, Notifications, Login/Onboarding, Downloads, Diagnostics, Echo UI, empty/error/offline states.
- Fonts: SF Pro bundled locally for private testing only; Inter as fallback.
