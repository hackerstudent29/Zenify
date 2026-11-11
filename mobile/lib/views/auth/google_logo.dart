import 'package:flutter/material.dart';

/// Official 4-color Google "G" identity mark rendered cleanly with transparent cutout.
class GoogleLogo extends StatelessWidget {
  const GoogleLogo({super.key, this.size = 20});

  final double size;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size),
      painter: const _GoogleLogoPainter(),
    );
  }
}

class _GoogleLogoPainter extends CustomPainter {
  const _GoogleLogoPainter();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 24.0, size.height / 24.0);

    final bluePaint = Paint()
      ..color = const Color(0xFF4285F4)
      ..isAntiAlias = true;
    final greenPaint = Paint()
      ..color = const Color(0xFF34A853)
      ..isAntiAlias = true;
    final yellowPaint = Paint()
      ..color = const Color(0xFFFBBC05)
      ..isAntiAlias = true;
    final redPaint = Paint()
      ..color = const Color(0xFFEA4335)
      ..isAntiAlias = true;

    final bluePath = Path()
      ..moveTo(23.52, 12.273)
      ..cubicTo(23.52, 11.422, 23.444, 10.604, 23.302, 9.818)
      ..lineTo(12, 9.818)
      ..lineTo(12, 14.465)
      ..lineTo(18.458, 14.465)
      ..cubicTo(18.18, 15.96, 17.335, 17.225, 16.069, 18.076)
      ..lineTo(16.069, 21.087)
      ..lineTo(19.942, 21.087)
      ..cubicTo(22.205, 19.004, 23.52, 15.938, 23.52, 12.273)
      ..close();
    canvas.drawPath(bluePath, bluePaint);

    final greenPath = Path()
      ..moveTo(12, 24)
      ..cubicTo(15.24, 24, 17.956, 22.925, 19.942, 21.087)
      ..lineTo(16.069, 18.076)
      ..cubicTo(14.995, 18.796, 13.62, 19.227, 12, 19.227)
      ..cubicTo(8.874, 19.227, 6.229, 17.116, 5.285, 14.28)
      ..lineTo(1.287, 14.28)
      ..lineTo(1.287, 17.389)
      ..cubicTo(3.262, 21.311, 7.309, 24, 12, 24)
      ..close();
    canvas.drawPath(greenPath, greenPaint);

    final yellowPath = Path()
      ..moveTo(5.285, 14.28)
      ..cubicTo(5.045, 13.56, 4.909, 12.791, 4.909, 12)
      ..cubicTo(4.909, 11.209, 5.045, 10.44, 5.285, 9.72)
      ..lineTo(5.285, 6.611)
      ..lineTo(1.287, 6.611)
      ..cubicTo(0.469, 8.242, 0, 10.069, 0, 12)
      ..cubicTo(0, 13.931, 0.469, 15.758, 1.287, 17.389)
      ..lineTo(5.285, 14.28)
      ..close();
    canvas.drawPath(yellowPath, yellowPaint);

    final redPath = Path()
      ..moveTo(12, 4.773)
      ..cubicTo(13.762, 4.773, 15.344, 5.378, 16.587, 6.567)
      ..lineTo(20.029, 3.125)
      ..cubicTo(17.951, 1.189, 15.235, 0, 12, 0)
      ..cubicTo(7.309, 0, 3.262, 2.689, 1.287, 6.611)
      ..lineTo(5.285, 9.72)
      ..cubicTo(6.229, 6.884, 8.874, 4.773, 12, 4.773)
      ..close();
    canvas.drawPath(redPath, redPaint);

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
