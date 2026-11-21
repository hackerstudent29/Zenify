import 'dart:async';

import 'package:flutter/physics.dart';
import 'package:flutter/widgets.dart';

import '../core/atlas_tokens.dart';
import '../core/spring.dart';
import 'glass.dart';

/// Tiny transient pill. Used only for results the user can't see otherwise
/// (a new stamp, nothing to play). One at a time.
class AtlasToast {
  static OverlayEntry? _entry;

  static void show(BuildContext context, String text) {
    final overlay = Overlay.maybeOf(context, rootOverlay: true);
    if (overlay == null) return;
    _entry?.remove();
    late final OverlayEntry e;
    e = OverlayEntry(
      builder: (_) => _ToastView(
        text: text,
        onDone: () {
          if (_entry == e) _entry = null;
          if (e.mounted) {
            e.remove();
          }
        },
      ),
    );
    _entry = e;
    overlay.insert(e);
  }
}

class _ToastView extends StatefulWidget {
  const _ToastView({required this.text, required this.onDone});
  final String text;
  final VoidCallback onDone;

  @override
  State<_ToastView> createState() => _ToastViewState();
}

class _ToastViewState extends State<_ToastView>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _c.animateWith(SpringSimulation(kAtlasSpring, 0, 1, 0));
    _t = Timer(const Duration(milliseconds: 1900), () async {
      if (!mounted) return;
      await _c.animateWith(
        SpringSimulation(kAtlasSpringSmooth, _c.value, 0, 0),
      );
      if (!mounted) return;
      widget.onDone();
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom + 112;
    return Positioned(
      left: 0,
      right: 0,
      bottom: bottom,
      child: IgnorePointer(
        child: AnimatedBuilder(
          animation: _c,
          builder: (_, child) {
            final v = _c.value;
            final op = v.clamp(0.0, 1.0);
            final content = Transform.translate(
              offset: Offset(0, (1 - v) * 24),
              child: child,
            );
            if (op >= 0.999) return content;
            return Opacity(opacity: op, child: content);
          },
          child: Center(
            child: Glass(
              radius: 22,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 11,
                ),
                child: Text(widget.text, style: AtlasText.headline),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
