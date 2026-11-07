import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../tokens/app_colors.dart';
import '../tokens/app_spacing.dart';
import '../tokens/app_typography.dart';
import 'marquee_text.dart';
import 'monogram_avatar.dart';
import 'pressable_scale.dart';

/// Reusable Apple Music-style Media Card (albums, playlists, tracks, artists)
class MediaCard extends StatelessWidget {
  const MediaCard({
    super.key,
    required this.title,
    this.subtitle,
    this.imageUrl,
    this.isCircular = false,
    this.width = 150.0,
    this.onTap,
  });

  final String title;
  final String? subtitle;
  final String? imageUrl;
  final bool isCircular;
  final double width;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final imageWidget = imageUrl != null && imageUrl!.startsWith('http')
        ? CachedNetworkImage(
            imageUrl: imageUrl!,
            fit: BoxFit.cover,
            width: width,
            height: width,
            placeholder: (context, _) => Container(
              color: AppColors.surface2,
              child: const Center(
                child: Icon(Icons.music_note, color: AppColors.textTertiary, size: 32),
              ),
            ),
            errorWidget: (context, error, stackTrace) => MonogramAvatar(
              name: title,
              size: width,
              isCircle: isCircular,
            ),
          )
        : MonogramAvatar(
            name: title,
            size: width,
            isCircle: isCircular,
          );

    return PressableScale(
      onTap: onTap,
      child: SizedBox(
        width: width,
        child: Column(
          crossAxisAlignment: isCircular ? CrossAxisAlignment.center : CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Artwork with shadow and squircle / circular frame
            Container(
              width: width,
              height: width,
              decoration: BoxDecoration(
                shape: isCircular ? BoxShape.circle : BoxShape.rectangle,
                borderRadius: isCircular ? null : BorderRadius.circular(AppSpacing.rCard),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.35),
                    blurRadius: 16,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: isCircular
                    ? BorderRadius.circular(width / 2)
                    : BorderRadius.circular(AppSpacing.rCard),
                child: imageWidget,
              ),
            ),
            const SizedBox(height: AppSpacing.s8),

            // Title
            MarqueeText(
              title,
              textAlign: isCircular ? TextAlign.center : TextAlign.left,
              style: AppTypography.headline.copyWith(fontSize: 14),
            ),

            // Subtitle
            if (subtitle != null) ...[
              const SizedBox(height: 2),
              MarqueeText(
                subtitle!,
                textAlign: isCircular ? TextAlign.center : TextAlign.left,
                style: AppTypography.subhead.copyWith(fontSize: 12),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
