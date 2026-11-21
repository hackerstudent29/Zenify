import 'package:flutter/widgets.dart';

import '../models/atlas_models.dart';
import '../services/passport_store.dart';
import 'globe_controller.dart';
import 'globe_painter.dart';

/// Gestures + painter. Drag rotates with inertia, pinch zooms, tap resolves
/// hits instantly. Double-tap is detected manually so a single tap is never
/// delayed waiting for a second one.
class GlobeView extends StatefulWidget {
  const GlobeView({
    super.key,
    required this.controller,
    required this.countries,
    required this.onTap,
    required this.onInteractionStart,
    this.isDark = true,
  });

  final GlobeController controller;
  final List<AtlasCountry> countries;
  final ValueChanged<Offset> onTap;
  final VoidCallback onInteractionStart;
  final bool isDark;

  @override
  State<GlobeView> createState() => _GlobeViewState();
}

class _GlobeViewState extends State<GlobeView> {
  double _startZoom = 1;
  bool _moved = false;
  int _lastTapMs = 0;
  Offset _lastTapPos = Offset.zero;

  late GlobePainter _painter = _build();

  GlobePainter _build() => GlobePainter(
    controller: widget.controller,
    countries: widget.countries,
    isVisited: PassportStore.instance.isStamped,
    isDark: widget.isDark,
    repaint: Listenable.merge([widget.controller, PassportStore.instance]),
  );

  @override
  void didUpdateWidget(GlobeView old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller ||
        old.countries != widget.countries ||
        old.isDark != widget.isDark) {
      _painter = _build();
    }
  }

  void _tap(Offset p) {
    final now = DateTime.now().millisecondsSinceEpoch;
    if (now - _lastTapMs < 280 && (p - _lastTapPos).distance < 40) {
      _lastTapMs = 0;
      widget.controller.doubleTapZoom(p);
      return;
    }
    _lastTapMs = now;
    _lastTapPos = p;
    widget.onTap(p);
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.controller;
    return LayoutBuilder(
      builder: (context, box) {
        c.viewport = box.biggest;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapUp: (d) => _tap(d.localPosition),
          onScaleStart: (d) {
            _moved = false;
            _startZoom = c.zoom;
            c.touchStart();
          },
          onScaleUpdate: (d) {
            if (!_moved) {
              _moved = true;
              widget.onInteractionStart();
            }
            c.dragBy(d.focalPointDelta);
            if (d.pointerCount > 1) c.pinchTo(_startZoom * d.scale);
          },
          onScaleEnd: (d) => c.touchEnd(d.velocity.pixelsPerSecond),
          child: RepaintBoundary(
            child: CustomPaint(
              painter: _painter,
              size: Size.infinite,
              isComplex: true,
              willChange: true,
            ),
          ),
        );
      },
    );
  }
}
