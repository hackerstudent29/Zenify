import 'dart:async';
import 'package:flutter/material.dart';

/// Apple Music style MarqueeText for artist names, song titles, and albums.
///
/// If [text] fits within the layout constraints, renders a standard [Text] widget with zero controller overhead.
/// When overflowing, gracefully pauses at the start, scrolls smoothly left-to-right in a loop,
/// and applies soft edge fades on the left and right boundaries.
///
/// Automatically respects [MediaQuery.disableAnimationsOf(context)] and route visibility.
class MarqueeText extends StatefulWidget {
  const MarqueeText(
    this.text, {
    super.key,
    this.style,
    this.pauseAtStart = const Duration(milliseconds: 1200),
    this.velocity = 32.0, // logical px per second
    this.gap = 40.0,
    this.fadeEdge = 14.0,
    this.active = true,
    this.textAlign = TextAlign.start,
  });

  final String text;
  final TextStyle? style;
  final Duration pauseAtStart;
  final double velocity;
  final double gap;
  final double fadeEdge;
  final bool active;
  final TextAlign textAlign;

  @override
  State<MarqueeText> createState() => _MarqueeTextState();
}

class _MarqueeTextState extends State<MarqueeText>
    with SingleTickerProviderStateMixin {
  AnimationController? _controller;
  double _textWidth = 0.0;
  bool _overflows = false;
  Timer? _loopTimer;

  @override
  void dispose() {
    _loopTimer?.cancel();
    _controller?.dispose();
    super.dispose();
  }

  void _calculateMetrics(double maxWidth, TextStyle effectiveStyle) {
    if (maxWidth <= 0 || maxWidth.isInfinite) return;

    final painter = TextPainter(
      text: TextSpan(text: widget.text, style: effectiveStyle),
      maxLines: 1,
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: double.infinity);

    final width = painter.width;
    final overflows = width > maxWidth;

    if (overflows != _overflows || (width - _textWidth).abs() > 1.0) {
      _textWidth = width;
      _overflows = overflows;

      if (_overflows && widget.active) {
        _initAnimation();
      } else {
        _stopAnimation();
      }
    }
  }

  void _initAnimation() {
    _loopTimer?.cancel();
    _controller?.dispose();

    final distance = _textWidth + widget.gap;
    final durationSeconds = (distance / widget.velocity).clamp(1.5, 30.0);
    final scrollDuration = Duration(milliseconds: (durationSeconds * 1000).round());

    _controller = AnimationController(
      vsync: this,
      duration: scrollDuration,
    );

    _controller!.addStatusListener((status) {
      if (status == AnimationStatus.completed) {
        _controller?.reset();
        _loopTimer?.cancel();
        _loopTimer = Timer(widget.pauseAtStart, () {
          if (mounted && _overflows && widget.active) {
            _controller?.forward();
          }
        });
      }
    });

    _loopTimer = Timer(widget.pauseAtStart, () {
      if (mounted && _overflows && widget.active) {
        _controller?.forward();
      }
    });
  }

  void _stopAnimation() {
    _loopTimer?.cancel();
    _controller?.stop();
    _controller?.reset();
  }

  @override
  Widget build(BuildContext context) {
    final disableAnimations = MediaQuery.disableAnimationsOf(context);
    final defaultStyle = DefaultTextStyle.of(context).style;
    final effectiveStyle = defaultStyle.merge(widget.style);

    return LayoutBuilder(
      builder: (context, constraints) {
        final maxWidth = constraints.maxWidth;
        if (maxWidth <= 0 || maxWidth.isInfinite) {
          return Text(
            widget.text,
            style: widget.style,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: widget.textAlign,
          );
        }

        _calculateMetrics(maxWidth, effectiveStyle);

        // If animations disabled or does not overflow, render standard text
        if (disableAnimations || !_overflows || !widget.active || _controller == null) {
          return Text(
            widget.text,
            style: widget.style,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: widget.textAlign,
          );
        }

        final fadeFraction = (widget.fadeEdge / maxWidth).clamp(0.01, 0.2);

        return RepaintBoundary(
          child: ShaderMask(
            blendMode: BlendMode.dstIn,
            shaderCallback: (rect) => LinearGradient(
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
              colors: const [
                Colors.transparent,
                Colors.black,
                Colors.black,
                Colors.transparent,
              ],
              stops: [0.0, fadeFraction, 1.0 - fadeFraction, 1.0],
            ).createShader(rect),
            child: ClipRect(
              child: AnimatedBuilder(
                animation: _controller!,
                builder: (context, _) {
                  final offset = -(_controller!.value * (_textWidth + widget.gap));
                  return Transform.translate(
                    offset: Offset(offset, 0),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.text,
                          style: widget.style,
                          maxLines: 1,
                          softWrap: false,
                        ),
                        SizedBox(width: widget.gap),
                        Text(
                          widget.text,
                          style: widget.style,
                          maxLines: 1,
                          softWrap: false,
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }
}
