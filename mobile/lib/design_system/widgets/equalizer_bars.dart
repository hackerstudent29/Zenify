import 'package:flutter/material.dart';
import '../tokens/app_colors.dart';

/// Animated 4-bar equalizer for active playing track items.
class EqualizerBars extends StatefulWidget {
  const EqualizerBars({
    super.key,
    this.color = AppColors.accent,
    this.size = 14.0,
    this.isPlaying = true,
  });

  final Color color;
  final double size;
  final bool isPlaying;

  @override
  State<EqualizerBars> createState() => _EqualizerBarsState();
}

class _EqualizerBarsState extends State<EqualizerBars> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..repeat(reverse: true);
  }

  @override
  void didUpdateWidget(EqualizerBars oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isPlaying && !_controller.isAnimating) {
      _controller.repeat(reverse: true);
    } else if (!widget.isPlaying && _controller.isAnimating) {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return CustomPaint(
          size: Size(widget.size, widget.size),
          painter: _EqualizerPainter(
            progress: _controller.value,
            color: widget.color,
            isPlaying: widget.isPlaying,
          ),
        );
      },
    );
  }
}

class _EqualizerPainter extends CustomPainter {
  final double progress;
  final Color color;
  final bool isPlaying;

  _EqualizerPainter({required this.progress, required this.color, required this.isPlaying});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    const barCount = 4;
    final barWidth = size.width / 6.0;
    final spacing = (size.width - (barCount * barWidth)) / (barCount - 1);

    final heights = isPlaying
        ? [
            (0.3 + 0.6 * progress).clamp(0.2, 1.0),
            (0.8 - 0.5 * progress).clamp(0.2, 1.0),
            (0.4 + 0.5 * ((progress + 0.5) % 1.0)).clamp(0.2, 1.0),
            (0.9 - 0.6 * ((progress + 0.3) % 1.0)).clamp(0.2, 1.0),
          ]
        : [0.3, 0.5, 0.4, 0.6];

    for (int i = 0; i < barCount; i++) {
      final left = i * (barWidth + spacing);
      final barHeight = size.height * heights[i];
      final top = size.height - barHeight;
      final rrect = RRect.fromRectAndRadius(
        Rect.fromLTWH(left, top, barWidth, barHeight),
        Radius.circular(barWidth / 2),
      );
      canvas.drawRRect(rrect, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _EqualizerPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.isPlaying != isPlaying;
}

