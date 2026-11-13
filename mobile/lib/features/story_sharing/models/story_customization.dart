import 'package:flutter/material.dart';

/// Aspect ratios supported for story & poster export.
enum StoryAspectRatio {
  story(
    label: '9:16',
    sublabel: 'Story',
    width: 360,
    height: 640,
    exportWidth: 1080,
    exportHeight: 1920,
    ratio: 9 / 16,
  ),
  square(
    label: '1:1',
    sublabel: 'Square',
    width: 360,
    height: 360,
    exportWidth: 1080,
    exportHeight: 1080,
    ratio: 1.0,
  );

  const StoryAspectRatio({
    required this.label,
    required this.sublabel,
    required this.width,
    required this.height,
    required this.exportWidth,
    required this.exportHeight,
    required this.ratio,
  });

  final String label;
  final String sublabel;
  final double width;
  final double height;
  final double exportWidth;
  final double exportHeight;
  final double ratio;
}

/// Dynamic background style selection.
enum StoryBackgroundStyle {
  artMesh(label: 'Art Mesh', icon: Icons.gradient_rounded),
  blurredCover(label: 'Blurred', icon: Icons.blur_on_rounded),
  solidDark(label: 'Charcoal', icon: Icons.dark_mode_rounded);

  const StoryBackgroundStyle({required this.label, required this.icon});
  final String label;
  final IconData icon;
}

/// Color polarity / text brightness mode.
enum StoryTextPolarity {
  light(label: 'Light Text', textColor: Colors.white, secondaryColor: Color(0xB3FFFFFF)),
  dark(label: 'Dark Text', textColor: Color(0xFF121214), secondaryColor: Color(0x99121214));

  const StoryTextPolarity({
    required this.label,
    required this.textColor,
    required this.secondaryColor,
  });

  final String label;
  final Color textColor;
  final Color secondaryColor;
}

