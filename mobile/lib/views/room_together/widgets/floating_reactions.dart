import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';

class _P {
  _P({required this.emoji, required this.x, required this.t0, required this.life, required this.amp, required this.freq, required this.phase, required this.scale, required this.rot, required this.rise});
  final String emoji;
  final double x; // 0..1
  final double t0;
  final double life;
  final double amp;
  final double freq;
  final double phase;
  final double scale;
  final double rot;
  final double rise; // 0..1 of height travelled
}

/// Single CustomPainter, one Ticker, zero setState on the screen. Ticker sleeps when empty.
/// Use: `GlobalKey<FloatingReactionsState>` then `key.currentState?.burst('🔥')`.
class FloatingReactions extends StatefulWidget {
  const FloatingReactions({super.key});
  @override
  State<FloatingReactions> createState() => FloatingReactionsState();
}

class FloatingReactionsState extends State<FloatingReactions> with SingleTickerProviderStateMixin {
  static const int _max = 60;
  final List<_P> _ps = [];
  final ValueNotifier<int> _repaint = ValueNotifier(0);
  final math.Random _rng = math.Random();
  late final Ticker _ticker = createTicker(_tick);
  double _now = 0;

  void burst(String emoji, {int count = 1}) {
    if (!mounted) return;
    if (MediaQuery.of(context).disableAnimations) return; // reduced motion
    final style = _styleFor(emoji);
    for (var i = 0; i < count; i++) {
      if (_ps.length >= _max) _ps.removeAt(0);
      _ps.add(_P(
        emoji: emoji,
        x: (0.12 + _rng.nextDouble() * 0.76),
        t0: _now + i * 0.06,
        life: style.life * (0.85 + _rng.nextDouble() * 0.3),
        amp: style.amp * (0.6 + _rng.nextDouble() * 0.8),
        freq: style.freq,
        phase: _rng.nextDouble() * math.pi * 2,
        scale: style.scale * (0.8 + _rng.nextDouble() * 0.5),
        rot: (_rng.nextDouble() - 0.5) * style.rot,
        rise: style.rise,
      ));
    }
    if (!_ticker.isActive) _ticker.start();
  }

  ({double life, double amp, double freq, double scale, double rot, double rise}) _styleFor(String e) {
    switch (e) {
      case '🔥':
        return (life: 2.0, amp: 10, freq: 3.0, scale: 1.0, rot: 0.3, rise: 0.8);
      case '👏':
        return (life: 2.4, amp: 18, freq: 1.5, scale: 1.1, rot: 0.9, rise: 0.65);
      case '😭':
        return (life: 3.2, amp: 26, freq: 1.0, scale: 0.95, rot: 0.5, rise: 0.6);
      case '💃':
        return (life: 3.0, amp: 40, freq: 1.4, scale: 1.1, rot: 0.8, rise: 0.7);
      case '🎧':
        return (life: 2.6, amp: 16, freq: 1.8, scale: 1.0, rot: 0.4, rise: 0.7);
      default: // ❤️
        return (life: 3.0, amp: 30, freq: 1.2, scale: 1.2, rot: 0.5, rise: 0.78);
    }
  }

  void _tick(Duration d) {
    _now = d.inMicroseconds / 1e6;
    _ps.removeWhere((p) => _now - p.t0 > p.life);
    _repaint.value++;
    if (_ps.isEmpty) _ticker.stop();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _repaint.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: RepaintBoundary(
        child: CustomPaint(painter: _Painter(this), size: Size.infinite),
      ),
    );
  }
}

class _Painter extends CustomPainter {
  _Painter(this.s) : super(repaint: s._repaint);
  final FloatingReactionsState s;
  static final Map<String, TextPainter> _tp = {};

  TextPainter _paintFor(String e) => _tp.putIfAbsent(e, () {
        final t = TextPainter(text: TextSpan(text: e, style: const TextStyle(fontSize: 34)), textDirection: TextDirection.ltr)..layout();
        return t;
      });

  @override
  void paint(Canvas canvas, Size size) {
    for (final p in s._ps) {
      final age = (s._now - p.t0) / p.life;
      if (age < 0 || age > 1) continue;
      final rise = Curves.easeOutCubic.transform(age) * size.height * p.rise;
      final dx = math.sin(age * math.pi * 2 * p.freq + p.phase) * p.amp;
      final x = p.x * size.width + dx;
      final y = size.height - 40 - rise;
      final opacity = age < 0.12 ? age / 0.12 : (age > 0.7 ? (1 - age) / 0.3 : 1.0);
      final pop = age < 0.14 ? Curves.easeOutBack.transform(age / 0.14) : 1.0;
      final tp = _paintFor(p.emoji);
      canvas.saveLayer(Rect.fromCenter(center: Offset(x, y), width: 80, height: 80), Paint()..color = Color.fromRGBO(0, 0, 0, opacity.clamp(0.0, 1.0)));
      canvas.translate(x, y);
      canvas.rotate(p.rot * math.sin(age * math.pi));
      canvas.scale(p.scale * pop);
      tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _Painter old) => true;
}

/// Compact glass pill with the six reactions. Per-emoji spring press.
class ReactionPill extends StatelessWidget {
  const ReactionPill({super.key, required this.emojis, required this.counts, required this.onReact, this.enabled = true});
  final List<String> emojis;
  final Map<String, int> counts;
  final void Function(String emoji) onReact;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.4,
      child: AppleBlur(
        borderRadius: BorderRadius.circular(AT.rPill),
        tint: const Color(0x33FFFFFF),
        sigma: 18,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (final e in emojis)
                SpringPressable(
                  pressedScale: 0.78,
                  haptic: false,
                  debounce: const Duration(milliseconds: 90),
                  onTap: enabled
                      ? () {
                          HapticFeedback.lightImpact();
                          onReact(e);
                        }
                      : null,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(e, style: const TextStyle(fontSize: 24)),
                      if ((counts[e] ?? 0) > 0) ...[
                        const SizedBox(width: 3),
                        Text('${counts[e]}', style: AT.micro.copyWith(color: AT.label)),
                      ],
                    ]),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
