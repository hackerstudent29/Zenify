import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../utils/media_normalizer.dart';
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
    this.width = 170.0,
    this.twoLineTitle = false,
    this.borderRadius,
    this.onTap,
  });

  final String title;
  final String? subtitle;
  final String? imageUrl;
  final bool isCircular;
  final double width;
  final bool twoLineTitle;
  final double? borderRadius;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final cleanImg = MediaNormalizer.upgradeArtworkUrl(imageUrl);
    final imageWidget = cleanImg.isNotEmpty && cleanImg.startsWith('http')
        ? CachedNetworkImage(
            imageUrl: cleanImg,
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

    final double effectiveRadius = borderRadius ?? AppSpacing.rCard;

    return PressableScale(
      onTap: onTap,
      child: SizedBox(
        width: width,
        child: Column(
          crossAxisAlignment: isCircular ? CrossAxisAlignment.center : CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Artwork with deep shadow and fullview player-style artwork curve
            Container(
              width: width,
              height: width,
              decoration: BoxDecoration(
                color: const Color(0xFF18181B),
                shape: isCircular ? BoxShape.circle : BoxShape.rectangle,
                borderRadius: isCircular ? null : BorderRadius.circular(effectiveRadius),
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
                    : BorderRadius.circular(effectiveRadius),
                child: imageWidget,
              ),
            ),
            const SizedBox(height: AppSpacing.s8),

            // Title
            twoLineTitle
                ? Text(
                    title,
                    textAlign: isCircular ? TextAlign.center : TextAlign.left,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.headline.copyWith(fontSize: 14),
                  )
                : MarqueeText(
                    isCircular ? title : MediaNormalizer.cleanCompactTitle(title),
                    textAlign: isCircular ? TextAlign.center : TextAlign.left,
                    style: AppTypography.headline.copyWith(fontSize: 14),
                  ),

            // Subtitle
            if (subtitle != null || isCircular) ...[
              const SizedBox(height: 2),
              MarqueeText(
                (isCircular && (subtitle == null || subtitle!.trim().isEmpty || subtitle!.trim().toLowerCase() == 'unknown artist'))
                    ? 'Artist'
                    : MediaNormalizer.formatArtists(subtitle ?? ''),
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
