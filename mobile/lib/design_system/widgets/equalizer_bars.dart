import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

/// Apple Music style 4-bar equalizer: slow, soft, organic.
/// • Each bar mixes two slow sine waves with different periods (never loops visibly)
/// • Pause/resume eases between motion and rest (no snapping, no phase jump)
/// • Ticker-driven repaint only: no widget rebuilds per frame
/// • Ticker stops completely when paused; respects "reduce motion"
class EqualizerBars extends StatefulWidget {
  const EqualizerBars({
    super.key,
    this.color = Colors.white,
    this.size = 16.0,
    this.height,
    bool? isPlaying,
    bool? playing,
    this.bottomAligned = false,
  }) : isPlaying = isPlaying ?? playing ?? true;

  final Color color;
  final double size;
  final double? height;
  final bool isPlaying;

  /// false = bars grow from the center (your original), true = from the baseline.
  final bool bottomAligned;

  @override
  State<EqualizerBars> createState() => _EqualizerBarsState();
}

class _EqualizerBarsState extends State<EqualizerBars>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  final _frame = ValueNotifier<int>(0);

  final _heights = List<double>.filled(4, 0.0);
  double _phase = 0; // advances only while playing
  double _blend = 0; // 0 = resting, 1 = fully animated
  Duration _last = Duration.zero;
  bool _reduceMotion = false;

  static const _rest = [0.35, 0.70, 0.45, 0.58];

  // radians / second -> periods of roughly 1.0 to 2.4 s (medium)
  static const _w1 = [4.4, 5.8, 5.0, 6.4];
  static const _w2 = [2.6, 3.4, 3.0, 2.2];
  static const _p1 = [0.3, 1.8, 3.4, 4.9];
  static const _p2 = [2.0, 0.6, 4.1, 1.2];

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_tick);
    _computeHeights();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotion = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    _sync();
  }

  @override
  void didUpdateWidget(EqualizerBars old) {
    super.didUpdateWidget(old);
    _sync();
  }

  void _sync() {
    final shouldRun = widget.isPlaying && !_reduceMotion;
    if (shouldRun) {
      if (!_ticker.isActive) {
        _last = Duration.zero;
        _ticker.start();
      }
    } else if (_ticker.isActive && _blend <= 0.001) {
      _stopAtRest();
    } else if (!_ticker.isActive && _blend > 0.001) {
      _last = Duration.zero;
      _ticker.start(); // ease back to rest
    } else if (!_ticker.isActive) {
      _computeHeights();
      _frame.value++;
    }
  }

  void _stopAtRest() {
    _ticker.stop();
    _blend = 0;
    _computeHeights();
    _frame.value++;
  }

  void _tick(Duration elapsed) {
    final dt = _last == Duration.zero
        ? 0.016
        : ((elapsed - _last).inMicroseconds / 1e6).clamp(0.0, 0.05);
    _last = elapsed;

    final playing = widget.isPlaying && !_reduceMotion;
    // critically-damped-ish easing: ~0.5 s to settle either way
    final target = playing ? 1.0 : 0.0;
    _blend += (target - _blend) * (1 - math.exp(-dt * 5.0));
    _phase += dt * _blend; // slows down smoothly as it winds to rest

    _computeHeights();
    _frame.value++;

    if (!playing && _blend < 0.001) _stopAtRest();
  }

  void _computeHeights() {
    for (var i = 0; i < 4; i++) {
      final wave =
          0.5 +
          0.5 *
              (0.62 * math.sin(_phase * _w1[i] + _p1[i]) +
                  0.38 * math.sin(_phase * _w2[i] + _p2[i]));
      final active = 0.28 + 0.72 * wave; // 0.28 .. 1.0
      _heights[i] = _rest[i] + (active - _rest[i]) * _blend;
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    _frame.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final h = widget.height ?? widget.size;
    final w = widget.height != null && widget.size == 16.0
        ? widget.height!
        : widget.size;
    return RepaintBoundary(
      child: CustomPaint(
        size: Size(w, h),
        painter: _EqualizerPainter(
          repaint: _frame,
          heights: _heights,
          color: widget.color,
          bottomAligned: widget.bottomAligned,
        ),
      ),
    );
  }
}

class _EqualizerPainter extends CustomPainter {
  _EqualizerPainter({
    required Listenable repaint,
    required this.heights,
    required this.color,
    required this.bottomAligned,
  }) : _paint = Paint()
         ..color = color
         ..style = PaintingStyle.fill
         ..isAntiAlias = true,
       super(repaint: repaint);

  final List<double> heights;
  final Color color;
  final bool bottomAligned;
  final Paint _paint;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    const n = 4;
    final bw = (size.width / 5.6).clamp(1.5, 4.0);
    final gap = (size.width - n * bw) / (n - 1);
    final r = Radius.circular(bw / 2);

    for (var i = 0; i < n; i++) {
      final bh = (size.height * heights[i]).clamp(bw, size.height);
      final top = bottomAligned ? size.height - bh : (size.height - bh) / 2;
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(i * (bw + gap), top, bw, bh), r),
        _paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _EqualizerPainter old) =>
      old.color != color || old.bottomAligned != bottomAligned;
}
