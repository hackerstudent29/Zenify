import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../tokens/app_typography.dart';

/// Apple Music custom scrubber slider with separate position ValueNotifier,
/// tabular figure time display, and touch expansion.
class ScrubberSlider extends StatefulWidget {
  const ScrubberSlider({
    super.key,
    required this.positionNotifier,
    required this.duration,
    required this.onSeek,
  });

  final ValueNotifier<Duration> positionNotifier;
  final Duration duration;
  final ValueChanged<Duration> onSeek;

  @override
  State<ScrubberSlider> createState() => _ScrubberSliderState();
}

class _ScrubberSliderState extends State<ScrubberSlider> {
  bool _isDragging = false;
  double _dragPositionMs = 0;

  String _formatTime(Duration d) {
    final mins = d.inMinutes;
    final secs = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$mins:$secs';
  }

  String _formatRemaining(Duration pos, Duration total) {
    final rem = total - pos;
    if (rem.isNegative) return '-0:00';
    final mins = rem.inMinutes;
    final secs = (rem.inSeconds % 60).toString().padLeft(2, '0');
    return '-$mins:$secs';
  }

  @override
  Widget build(BuildContext context) {
    final totalMs = widget.duration.inMilliseconds.toDouble().clamp(1.0, double.infinity);

    return ValueListenableBuilder<Duration>(
      valueListenable: widget.positionNotifier,
      builder: (context, position, _) {
        final currentMs = _isDragging
            ? _dragPositionMs
            : position.inMilliseconds.toDouble().clamp(0.0, totalMs);
        final progress = (currentMs / totalMs).clamp(0.0, 1.0);

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Interactive Slider Bar with generous touch target & exact bounds
            LayoutBuilder(
              builder: (context, constraints) {
                final trackWidth = constraints.maxWidth;
                final trackHeight = _isDragging ? 12.0 : 9.0;

                return GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onHorizontalDragStart: (details) {
                    setState(() {
                      _isDragging = true;
                      _dragPositionMs = currentMs;
                    });
                    try {
                      HapticFeedback.selectionClick();
                    } catch (_) {}
                  },
                  onHorizontalDragUpdate: (details) {
                    final localX = details.localPosition.dx.clamp(0.0, trackWidth);
                    final fraction = (localX / trackWidth).clamp(0.0, 1.0);
                    setState(() {
                      _dragPositionMs = fraction * totalMs;
                    });
                  },
                  onHorizontalDragEnd: (details) {
                    final seekDuration = Duration(milliseconds: _dragPositionMs.toInt());
                    widget.onSeek(seekDuration);
                    setState(() {
                      _isDragging = false;
                    });
                    try {
                      HapticFeedback.lightImpact();
                    } catch (_) {}
                  },
                  onTapDown: (details) {
                    final localX = details.localPosition.dx.clamp(0.0, trackWidth);
                    final fraction = (localX / trackWidth).clamp(0.0, 1.0);
                    final seekDuration = Duration(milliseconds: (fraction * totalMs).toInt());
                    widget.onSeek(seekDuration);
                    try {
                      HapticFeedback.selectionClick();
                    } catch (_) {}
                  },
                  child: Container(
                    height: 38,
                    alignment: Alignment.center,
                    child: Stack(
                      alignment: Alignment.centerLeft,
                      clipBehavior: Clip.none,
                      children: [
                        // Background Track (glass styled like website h-2 border border-white/5)
                        Container(
                          width: trackWidth,
                          height: trackHeight,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.16),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.06),
                              width: 0.6,
                            ),
                          ),
                        ),

                        // Active Progress Track
                        Container(
                          width: (trackWidth * progress).clamp(0.0, trackWidth),
                          height: trackHeight,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(6),
                          ),
                        ),

                        // Sleek Apple Music Scrubber Thumb (visible when dragging)
                        if (_isDragging)
                          Positioned(
                            left: ((trackWidth - 16) * progress).clamp(0.0, trackWidth - 16),
                            child: Container(
                              width: 16,
                              height: 16,
                              decoration: BoxDecoration(
                                color: Colors.white,
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withValues(alpha: 0.4),
                                    blurRadius: 6,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              },
            ),

            // Time Labels (Elapsed and Remaining) with Tabular Figures
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    _formatTime(_isDragging ? Duration(milliseconds: _dragPositionMs.toInt()) : position),
                    style: AppTypography.timer,
                  ),
                  Text(
                    _formatRemaining(
                      _isDragging ? Duration(milliseconds: _dragPositionMs.toInt()) : position,
                      widget.duration,
                    ),
                    style: AppTypography.timer,
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
