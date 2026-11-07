# 13. Assets Checklist

| Asset | Path | Notes | Status |
|---|---|---|---|
| SF Pro Display (Regular, Medium, Semibold, Bold) | `assets/fonts/` | Private testing only, do not share the build. Obtain from Apple's developer font downloads. | ☐ |
| SF Pro Text (Regular, Medium, Semibold) | `assets/fonts/` | Same | ☐ |
| Inter (400, 500, 600, 700) | `assets/fonts/` | Open license; default fallback | ☐ |
| Noto Sans Tamil / Telugu / Devanagari | `assets/fonts/` | `fontFamilyFallback` | ☐ |
| Impulse responses: studio, room, cathedral, warehouse | `android/app/src/main/assets/ir/*.wav` | Stereo, 48 kHz, ≤ 2.5 s, 16 or 24-bit. Use IRs with a license that allows your use (many free packs exist; check each) or generate synthetic ones | ☐ |
| Icons | `assets/icons/` or package | Phosphor or Lucide; filled + regular for tabs | ☐ |
| Rive: play/pause morph, like heart, equalizer bars | `assets/rive/` | Fallback: `AnimatedIcon` + CustomPainter | ☐ |
| Test audio | `assets/mock/test_tone.mp3` | Short tone and a 30 s music clip you own | ☐ |
| Genre/mood gradients | code | Defined in tokens, no files | ☐ |
| App icon + adaptive icon | `android/app/src/main/res` | Crimson accent on charcoal | ☐ |
| Placeholder artwork | generated | Deterministic gradient from id hash | ☑ |
| Sample `.lrc` files | `assets/mock/lrc/` | 2 synced, 1 plain, 1 Indic with romanization | ☐ |

`pubspec.yaml` asset and font registration is in `starter/pubspec.yaml`.

## IR generation fallback
If no IRs are available yet, generate synthetic ones (exponentially decaying noise, per-preset RT60: studio 0.4 s, room 0.8 s, warehouse 1.8 s, cathedral 2.5 s, with a low-pass tilt) so the reverb can be developed and tested immediately. Replace with real IRs later; no code changes needed.
