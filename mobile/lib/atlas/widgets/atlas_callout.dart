import 'package:flutter/widgets.dart';

import '../core/atlas_tokens.dart';
import 'atlas_press.dart';

/// Popover with an arrow pointing at the globe marker. One painted shape
/// (card + arrow + shadow), no blur, so it is free while the globe animates.
class AtlasCallout extends StatelessWidget {
  const AtlasCallout({
    super.key,
    required this.arrowX,
    required this.flipped,
    required this.onOpen,
    required this.child,
  });

  static const double width = 296;
  static const double cardHeight = 140;
  static const double arrowHeight = 9;
  static const double totalHeight = cardHeight + arrowHeight;

  final double arrowX;
  final bool flipped;
  final VoidCallback onOpen;
  final Widget child;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: width,
    height: totalHeight,
    child: CustomPaint(
      painter: _CalloutPainter(arrowX, flipped),
      child: AtlasPress(
        scale: 0.985,
        onTap: onOpen,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            14,
            12 + (flipped ? arrowHeight : 0),
            14,
            12 + (flipped ? 0 : arrowHeight),
          ),
          child: child,
        ),
      ),
    ),
  );
}

class _CalloutPainter extends CustomPainter {
  const _CalloutPainter(this.ax, this.flipped);
  final double ax;
  final bool flipped;

  @override
  void paint(Canvas canvas, Size size) {
    const ah = AtlasCallout.arrowHeight;
    const ch = AtlasCallout.cardHeight;
    final top = flipped ? ah : 0.0;
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(0, top, size.width, ch),
          const Radius.circular(20),
        ),
      );
    final tri = Path();
    if (flipped) {
      tri
        ..moveTo(ax - 9, ah + 1)
        ..lineTo(ax, 0)
        ..lineTo(ax + 9, ah + 1);
    } else {
      tri
        ..moveTo(ax - 9, ch - 1)
        ..lineTo(ax, ch + ah)
        ..lineTo(ax + 9, ch - 1);
    }
    tri.close();
    final shape = Path.combine(PathOperation.union, path, tri);
    canvas.drawShadow(shape, const Color(0xFF000000), 14, true);
    canvas.drawPath(shape, Paint()..color = AtlasColors.surfaceHigh);
  }

  @override
  bool shouldRepaint(_CalloutPainter o) => o.ax != ax || o.flipped != flipped;
}
