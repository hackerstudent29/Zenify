import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../tokens/app_colors.dart';
import '../tokens/app_typography.dart';
import 'pressable_scale.dart';

const Color _fieldFill = Color(0x1FFFFFFF); // white 12%

/// Reusable Apple-inspired Action Button standardized across Zenify (Library, Artist, Album, etc.).
class ZenActionButton extends StatelessWidget {
  const ZenActionButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
    this.backgroundColor,
    this.height = 46.0,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  final Color? backgroundColor;
  final double height;

  @override
  Widget build(BuildContext context) {
    final accent = color ?? AppColors.accent;

    return PressableScale(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        height: height,
        decoration: ShapeDecoration(
          shape: ContinuousRectangleBorder(
            borderRadius: BorderRadius.circular(24),
          ),
          color: backgroundColor ?? _fieldFill,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 22, color: accent),
            const SizedBox(width: 6),
            Text(
              label,
              style: AppTypography.headline.copyWith(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: accent,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Standardized Play & Shuffle button pair matching the Library page reference.
class ZenActionButtons extends StatelessWidget {
  const ZenActionButtons({
    super.key,
    required this.onPlay,
    required this.onShuffle,
    this.playLabel = 'Play',
    this.shuffleLabel = 'Shuffle',
    this.extraAction,
  });

  final VoidCallback onPlay;
  final VoidCallback onShuffle;
  final String playLabel;
  final String shuffleLabel;
  final Widget? extraAction;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: ZenActionButton(
            icon: Icons.play_arrow_rounded,
            label: playLabel,
            onTap: onPlay,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: ZenActionButton(
            icon: Icons.shuffle_rounded,
            label: shuffleLabel,
            onTap: onShuffle,
          ),
        ),
        if (extraAction != null) ...[
          const SizedBox(width: 12),
          extraAction!,
        ],
      ],
    );
  }
}

