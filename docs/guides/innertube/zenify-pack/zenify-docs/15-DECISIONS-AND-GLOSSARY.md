# 15. Decisions, Defaults and Glossary

When the docs are silent, use the default and log it in `DECISIONS_LOG.md` (create at repo root).

## Open decisions and defaults

| Question | Default |
|---|---|
| Catalog provider for remote data | Mock only until you pick one; keep behind `CatalogSource` |
| Lyrics provider | LRCLIB-style API (verify) with local `.lrc` fallback |
| Auth | Guest login; email login later |
| iOS | Not now; keep bridges platform-neutral |
| Crossfade | Implement after gapless works; disabled by default |
| Cast | System output picker first; Google Cast in P4-08 stub, full later |
| Backend language | Spring Boot (matches STOMP choice) |
| Min Android | 7.0 (API 24) |
| Explicit filter | Hides/blocks items flagged `explicit`; no age verification |
| Analytics | None; local Diagnostics only |
| Localization | English strings via ARB from day one; Indic content shown as-is |
| Download format | Whatever the resolved stream is (no transcoding) |
| Shuffle | Fisher-Yates over the context queue, current track pinned first |
| Quality tiers | 128k Normal / 256k High / 320k Extreme map to nearest available audio stream bitrate |

## Glossary

| Term | Meaning |
|---|---|
| Squircle | Continuous-curvature rounded rectangle (iOS style) |
| Spring (response, ζ) | Apple-style spring params; converted to mass/stiffness/damping in `03` |
| Progress-driven transition | One 0→1 value from a gesture drives all layout; spring settles it |
| Glass | Blur + tint + hairline surface |
| AudioProcessor | Media3 PCM processing stage |
| Resolver | Component that turns a track id into a playable stream URL |
| Pre-resolve | Resolving the next tracks while the current plays |
| Day Mix | Time-of-day playlist |
| Blend | 2-person taste-match playlist |
| Together | Synchronized group listening room |
| DJ / Collab | Room control modes |
| Drift | Difference between local and target playback position |
