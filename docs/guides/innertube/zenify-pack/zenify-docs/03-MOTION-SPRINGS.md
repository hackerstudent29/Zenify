# 03. Motion and Spring Animations

**Strict rule:** every animation is either (a) a spring, or (b) a value driven directly by a gesture and then settled by a spring that inherits the release velocity. No fixed-duration tween after a drag.

## Spring presets

Flutter `SpringDescription`: mass = 1, stiffness = (2π / response)², damping = 4π · ζ / response.

| Preset | Response | ζ | Stiffness | Damping | Use |
|---|---|---|---|---|---|
| `smooth` | 0.5 | 1.0 | 158 | 25.1 | Sheets, navigation, player transition |
| `standard` | 0.5 | 0.825 | 158 | 20.7 | General UI |
| `snappy` | 0.3 | 0.85 | 439 | 35.6 | Taps, toggles, tab icons |
| `bouncy` | 0.5 | 0.65 | 158 | 16.3 | Like heart, emoji, reactions |

```dart
// lib/design_system/motion/springs.dart
import 'package:flutter/physics.dart';

class Springs {
  static const smooth   = SpringDescription(mass: 1, stiffness: 158, damping: 25.1);
  static const standard = SpringDescription(mass: 1, stiffness: 158, damping: 20.7);
  static const snappy   = SpringDescription(mass: 1, stiffness: 439, damping: 35.6);
  static const bouncy   = SpringDescription(mass: 1, stiffness: 158, damping: 16.3);
}
```

## PressableScale

```dart
class PressableScale extends StatefulWidget {
  const PressableScale({super.key, required this.child, this.onTap, this.onLongPress, this.scale = 0.96});
  final Widget child; final VoidCallback? onTap, onLongPress; final double scale;
  @override State<PressableScale> createState() => _PressableScaleState();
}

class _PressableScaleState extends State<PressableScale> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 1);

  void _spring(double to) => _c.animateWith(
      SpringSimulation(Springs.snappy, _c.value, to, _c.velocity));

  @override void dispose() { _c.dispose(); super.dispose(); }

  @override Widget build(BuildContext context) => GestureDetector(
    behavior: HitTestBehavior.opaque,
    onTapDown: (_) => _spring(widget.scale),
    onTapUp: (_) { _spring(1); HapticFeedback.lightImpact(); widget.onTap?.call(); },
    onTapCancel: () => _spring(1),
    onLongPress: widget.onLongPress,
    child: AnimatedBuilder(animation: _c,
      builder: (_, child) => Transform.scale(scale: _c.value, child: child),
      child: widget.child),
  );
}
```

## Mini → Full Player (single progress value)

One `progress` (0 = mini, 1 = full) drives everything. Do not use `Hero` for this.

```dart
class PlayerSheetController {
  final AnimationController progress; // unbounded-safe, clamp on read
  PlayerSheetController(TickerProvider v) : progress = AnimationController.unbounded(vsync: v);

  void onDragUpdate(double dy, double maxHeight) =>
      progress.value = (progress.value - dy / maxHeight).clamp(0.0, 1.0);

  void onDragEnd(double vy, double maxHeight) {
    final v = -vy / maxHeight;                       // normalized velocity
    final target = (progress.value + v * 0.15) > 0.5 ? 1.0 : 0.0;
    progress.animateWith(SpringSimulation(Springs.smooth, progress.value, target, v));
  }
}
```

Derived from `progress` (t):

| Element | Mini (t=0) | Full (t=1) |
|---|---|---|
| Artwork size | 44 | min(screenW - 64, 340) |
| Artwork position | left of mini bar | centered, y ≈ 15% |
| Artwork radius | 10 | 28 |
| Sheet height | 64 | screen height |
| Mini content (title, buttons) opacity | 1 | 0 by t = 0.3 |
| Full content (title, scrubber, controls) opacity | 0 until t = 0.6 | 1 |
| Ambient background opacity | 0 | 1 |
| Tab bar translateY | 0 | +tabBarHeight (slides away) |

Use `Transform` and `Opacity` only; compute layout from `lerpDouble(a, b, t)`.

## Full player dismissal

Drag down: `scale = lerp(1.0, 0.92, d)`, corner radius grows to 38, backdrop dims; release → spring to open or closed using release velocity.

## Interaction spec table

| Interaction | Spring | Detail |
|---|---|---|
| Any tap | snappy | 0.96 scale (0.94 for play/pause) |
| Play/Pause | snappy | Morphing icon (Rive or `AnimatedIcon`) + 0.94 scale |
| Artwork on pause | smooth | 1.0 → 0.8 on pause, 0.8 → 1.0 on play |
| Vinyl / cover tilt | standard | `sensors_plus` or touch point → rotateX/Y max 8°, `Transform` only; settle to 0 on release |
| Like heart | bouncy | Scale 1 → 1.35 → 1, burst particles |
| Hero carousel | smooth | Auto-advance 5 s, pauses on touch, spring page snap |
| Tab change | snappy | Icon bounce; IndexedStack cross-fade 150 ms |
| Page push/pop | Cupertino | Edge-swipe back on Android too |
| Reorder pickup | snappy | Scale 1.03, shadow, `mediumImpact` |
| Swipe-to-delete | smooth | Row follows finger, spring back or fly out |
| Lyrics scroll | smooth | Active line at ~30% from top; others animate opacity 0.4 and blur 0 → 2 |
| Blend ring | smooth | Sweep 0 → score on enter |
| Emoji reaction | bouncy | Rise 300-500 px with horizontal sway, fade at 80% |
| Sheets (Queue, FX, Sleep) | smooth | `smooth_sheets` with snap points 0.5, 0.92 |
| Context menu | bouncy | Scale 0.9 → 1 from anchor |
| Toast | standard | Slide up above mini player |
| Collapsing app bar | scroll-driven | Title crossfade at 60% collapse |

## Performance budget (60/120 fps)

- Frame budget: 16.6 ms (60 Hz) / 8.3 ms (120 Hz). Profile on a real mid-range device with `flutter run --profile`.
- Impeller on. High refresh rate via `flutter_displaymode`.
- `RepaintBoundary` around: every glass region, ambient background, equalizer bars, each lyric line.
- Animate only `Transform` / `Opacity`. Avoid animating clip paths, blur sigma, or layout size in lists.
- Do not nest `BackdropFilter` inside scrollables.
- Images: `cacheWidth` at display size, `precacheImage` for next track, fade-in 150 ms.
- Ambient background: render once per track to an image (palette gradient + blur) and cross-fade between tracks; never blur live.
- Position stream: `ValueNotifier<Duration>` consumed only by scrubber and lyrics.
- Lists: `SliverList.builder` with `itemExtent` where fixed, `addAutomaticKeepAlives: false` for long lists.
- Stagger intro (30 ms per item, max 8 items) on first load only.
- Reduce-motion: replace springs with 150 ms fades and drop tilt/parallax.

## Acceptance

- Dropping frames in mini→full drag: 0 jank frames in 20 repeated drags (DevTools timeline).
- Interrupting an in-flight spring with a new touch continues from current value and velocity.
- All scroll views use `BouncingScrollPhysics`.
