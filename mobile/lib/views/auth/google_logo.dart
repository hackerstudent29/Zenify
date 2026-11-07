import 'package:flutter/material.dart';

class GoogleLogo extends StatelessWidget {
  const GoogleLogo({super.key, this.size = 20});
  final double size;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size),
      painter: _GoogleLogoPainter(),
    );
  }
}

class _GoogleLogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final center = Offset(w / 2, h / 2);
    final radius = w / 2;

    final redPaint = Paint()..color = const Color(0xFFEA4335);
    final yellowPaint = Paint()..color = const Color(0xFFFBBC05);
    final greenPaint = Paint()..color = const Color(0xFF34A853);
    final bluePaint = Paint()..color = const Color(0xFF4285F4);

    final rect = Rect.fromCircle(center: center, radius: radius);

    // Blue (Right arc + horizontal bar)
    final bluePath = Path()
      ..moveTo(center.dx, center.dy)
      ..arcTo(rect, -0.785, 1.57, false)
      ..lineTo(center.dx, center.dy);
    canvas.drawPath(bluePath, bluePaint);

    // Green (Bottom arc)
    final greenPath = Path()
      ..moveTo(center.dx, center.dy)
      ..arcTo(rect, 0.785, 1.57, false)
      ..lineTo(center.dx, center.dy);
    canvas.drawPath(greenPath, greenPaint);

    // Yellow (Left bottom arc)
    final yellowPath = Path()
      ..moveTo(center.dx, center.dy)
      ..arcTo(rect, 2.356, 1.57, false)
      ..lineTo(center.dx, center.dy);
    canvas.drawPath(yellowPath, yellowPaint);

    // Red (Top arc)
    final redPath = Path()
      ..moveTo(center.dx, center.dy)
      ..arcTo(rect, 3.927, 1.57, false)
      ..lineTo(center.dx, center.dy);
    canvas.drawPath(redPath, redPaint);

    // Center cutout
    final cutoutPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, radius * 0.58, cutoutPaint);

    // Blue horizontal crossbar
    final barRect = Rect.fromLTRB(
      center.dx - radius * 0.05,
      center.dy - radius * 0.22,
      w,
      center.dy + radius * 0.22,
    );
    canvas.drawRect(barRect, bluePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

