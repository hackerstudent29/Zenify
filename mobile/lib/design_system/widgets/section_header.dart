import 'package:flutter/material.dart';
import '../tokens/app_colors.dart';
import '../tokens/app_typography.dart';
import 'pressable_scale.dart';

/// Section Header with Title 2 typography and optional trailing navigation action.
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.actionTitle,
    this.onActionTap,
  });

  final String title;
  final String? actionTitle;
  final VoidCallback? onActionTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.title2,
            ),
          ),
          if (actionTitle != null || onActionTap != null)
            PressableScale(
              onTap: onActionTap,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (actionTitle != null)
                    Text(
                      actionTitle!,
                      style: AppTypography.subhead.copyWith(
                        color: AppColors.accent,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  const SizedBox(width: 4),
                  const Icon(Icons.chevron_right, color: AppColors.accent, size: 18),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

