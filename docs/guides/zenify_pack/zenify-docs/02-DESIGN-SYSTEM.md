# 02. Design System (Apple Music style)

## Color tokens (semantic)

| Token | Dark | Light |
|---|---|---|
| `bg` | `#121214` | `#FFFFFF` |
| `surface` (grouped) | `#1C1C1E` | `#F2F2F7` |
| `surface2` (cards/tiles) | `#2C2C2E` | `#E5E5EA` |
| `accent` | `#E11D48` | `#E11D48` |
| `textPrimary` | `#FFFFFF` | `#000000` |
| `textSecondary` | white 60% | black 60% |
| `textTertiary` | white 40% | black 40% |
| `hairline` | white 8% | black 10% |
| `glassTint` | `#1C1C1E` at 70% | `#FFFFFF` at 70% |
| `danger` | `#FF453A` | `#FF3B30` |

The player overrides `accent` with the album-art tint. Derive it with `material_color_utilities` (`QuantizerCelebi` then `Score.score`), computed once per track and cached.

## Typography

| Style | Size / Weight | Use |
|---|---|---|
| Large Title | 34 / Bold | Tab titles |
| Title 1 | 28 / Bold | Album / artist names |
| Title 2 | 22 / Bold | Section headers |
| Headline | 17 / Semibold | Row titles |
| Body | 17 / Regular | Descriptions |
| Subhead | 15 / Regular | Artist names, row subtitles |
| Footnote | 13 / Regular | Metadata |
| Caption | 11-12 / Medium | Badges, tab labels |
| Lyrics Active | 28-32 / Bold | Current line |
| Lyrics Inactive | 28-32 / Bold at 40% | Other lines |

- Font: SF Pro Display (>= 20pt) and SF Pro Text (< 20pt) bundled locally; fallback Inter.
- Indic fallbacks in `fontFamilyFallback`: Noto Sans Tamil, Noto Sans Telugu, Noto Sans Devanagari.
- Tabular figures on timers: `FontFeature.tabularFigures()`.
- Tracking: -0.4 on text >= 22pt.
- Must survive 130% system text scale without clipping.

## Spacing, radius, elevation

- Spacing scale: 4, 8, 12, 16, 20, 24, 32. Screen horizontal padding 16 (20 on Home).
- Radii (design value; code uses ~2x with `ContinuousRectangleBorder`): cards 22, tiles 12, pills full, sheets 28 top.
- Artwork radius: 10 in lists, 22 in grids, 28 on full player.
- Shadows only on artwork and the lifted-row state. No elevation on surfaces.

## Materials (blur)

- `GlassSurface`: `BackdropFilter(blur 25)` + tint + 1px hairline.
- Allowed only on: tab bar, mini player, collapsing nav bars, sheets, toasts.
- Never inside scrolling list items. Low-end fallback: solid tint at 92% opacity (toggle in Settings → Diagnostics).
- Wrap each glass region in `RepaintBoundary`.

## Bottom navigation

Four tabs, mini player floats above:

| Tab | Icon | Contents |
|---|---|---|
| Home | house | Hero, Quick Picks, Day Mix, Trending, Top Artists, Jump Back In |
| Explore | square.grid.2x2 | Categories, moods, charts, new releases, Blend and Together entry cards |
| Library | music.note.list | Playlists, Liked, Downloads, On Device, Blends, Recent Rooms |
| Search | magnifyingglass | Search bar, browse grid, moods |

- Height 49 + bottom safe area. Glass, 0.5pt top hairline, 10pt labels.
- Active: filled icon in accent. Inactive: textSecondary.
- Tap active tab: pop to root; tap again: scroll to top.
- Selection animation: icon scales 1.0 → 1.15 → 1.0 with Bouncy spring, `selectionClick` haptic.
- Use `StatefulShellRoute.indexedStack` so every tab keeps scroll and stack.
- Top-right avatar on Home/Library opens Profile (Settings lives inside Profile).

## Mini player

- 64pt tall, 8-12pt side margins, 12pt above tab bar, squircle, glass.
- Content: 44pt artwork, title (Headline) + artist (Subhead, secondary), play/pause, next.
- Thin progress line along the bottom edge (2pt, accent).
- Tap or swipe up: expands to Full Player (see `03-MOTION-SPRINGS.md`). Swipe left/right: previous/next with spring.
- Hidden when queue is empty.

## Component inventory (`lib/design_system/`)

| Component | Notes |
|---|---|
| `PressableScale` | Spring press to 0.96; wraps all tappables |
| `GlassSurface` | Blur + tint + hairline, fallback flag |
| `MediaCard` | Square and circular variants, skeleton state |
| `SongTile` | Artwork, title, subtitle, explicit badge, equalizer when playing, trailing menu |
| `SectionHeader` | Title 2 + chevron to SectionDetail |
| `PillChip` | Filters, moods, search history |
| `GroupedInsetList`, `SettingRow` | iOS grouped lists |
| `CupertinoSwitch`, `CupertinoSlidingSegmentedControl` | Native-feel controls |
| `EqualizerBars` | CustomPainter, 4 bars |
| `ScrubberSlider` | Grows on touch, haptic ticks, fine-scrub on vertical drag |
| `ContextMenu` | Long-press, blurred backdrop, haptic |
| `GlassToast` | Bottom toast above mini player |
| `SkeletonShimmer` | Loading placeholders |
| `EmptyState`, `ErrorState`, `OfflineBanner` | With retry action |
| `VerticalEqSlider`, `RotaryKnob` | Studio FX |
| `ProgressRing` | Blend compatibility |
| `EmojiBurstCanvas`, `PresenceAvatarRow` | Together |
| `MarqueeText` | Overflowing titles |

## Iconography

SF Symbols style. On Android use Phosphor (regular + fill) or Lucide. One family only.

## Haptics

`selectionClick` on scrubber ticks and tab change, `lightImpact` on taps/toggles, `mediumImpact` on long-press and reorder pickup, `heavyImpact` never.

## Accessibility

Min touch target 44x44, semantic labels on all icon buttons, respect reduce-motion (springs → short fades), contrast >= 4.5:1 for text on glass.
