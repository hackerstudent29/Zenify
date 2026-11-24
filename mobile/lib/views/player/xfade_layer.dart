import 'package:flutter/widgets.dart';
import '../../services/crossfade_controller.dart';

/// Wrap any "current track" widget. Idle = renders [incoming] only.
/// During a crossfade the outgoing track's version fades out on top (artwork)
/// or both cross-dissolve (text, seekbar: [crossDissolve]).
class XfadeLayer extends StatelessWidget {
  const XfadeLayer({
    super.key,
    required this.incoming,
    required this.outgoing,
    this.crossDissolve = false,
    this.motion = false,
  });

  final Widget incoming;
  final Widget Function(XfadeSession s) outgoing;
  final bool crossDissolve; // transparent widgets (text, seekbar, times)
  final bool motion;        // Apple-style subtle scale drift (artwork)

  @override
  Widget build(BuildContext context) {
    final xf = CrossfadeController.instance;
    return ValueListenableBuilder<XfadeSession?>(
      valueListenable: xf.session,
      child: incoming,
      builder: (_, s, inc) => ValueListenableBuilder<double>(
        valueListenable: xf.progress,
        child: inc,
        builder: (_, f, inc2) {
          final (o, i) = s == null ? (1.0, 1.0) : CrossfadeCurves.visual(s.style, f);
          Widget base = inc2!;
          if (motion) base = Transform.scale(scale: s == null ? 1.0 : 1 + 0.035 * (1 - i), child: base);
          if (crossDissolve) base = Opacity(opacity: s == null ? 1.0 : i.clamp(0.0, 1.0), child: base);
          Widget? out;
          if (s != null) {
            out = outgoing(s);
            if (motion) out = Transform.scale(scale: 1 - 0.05 * (1 - o), child: out);
            out = Positioned.fill(
              child: IgnorePointer(child: Opacity(opacity: o.clamp(0.0, 1.0), child: out)),
            );
          }
          return Stack(clipBehavior: Clip.none, children: [base, ?out]);
        },
      ),
    );
  }
}
