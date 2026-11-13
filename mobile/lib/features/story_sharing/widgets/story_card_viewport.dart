import 'package:flutter/material.dart';
import '../models/story_customization.dart';

/// Card viewport that establishes exact aspect ratio constraints (9:16 or 1:1)
/// and respects social story safe zones.
class StoryCardViewport extends StatelessWidget {
  const StoryCardViewport({
    super.key,
    required this.aspectRatio,
    required this.child,
    this.boundaryKey,
    this.clipRadius = 24.0,
    this.elevation = 20.0,
  });

  final StoryAspectRatio aspectRatio;
  final Widget child;
  final GlobalKey? boundaryKey;
  final double clipRadius;
  final double elevation;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: aspectRatio.ratio,
      child: Center(
        child: RepaintBoundary(
          key: boundaryKey,
          child: Container(
            width: aspectRatio.width,
            height: aspectRatio.height,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(clipRadius),
              boxShadow: elevation > 0
                  ? [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.45),
                        blurRadius: elevation,
                        offset: const Offset(0, 10),
                      ),
                    ]
                  : null,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(clipRadius),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}

