import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/story_customization.dart';

/// Floating customization pill bars and action buttons for Story export.
class StoryShareControls extends StatelessWidget {
  const StoryShareControls({
    super.key,
    required this.aspectRatio,
    required this.backgroundStyle,
    required this.textPolarity,
    required this.onToggleAspectRatio,
    required this.onToggleBackgroundStyle,
    required this.onToggleTextPolarity,
    required this.onShareInstagram,
    required this.onShareFacebook,
    required this.onShareWhatsApp,
    required this.onShareMore,
    required this.onSaveGallery,
    required this.onCopyLink,
    this.isExporting = false,
  });

  final StoryAspectRatio aspectRatio;
  final StoryBackgroundStyle backgroundStyle;
  final StoryTextPolarity textPolarity;
  final VoidCallback onToggleAspectRatio;
  final VoidCallback onToggleBackgroundStyle;
  final VoidCallback onToggleTextPolarity;

  final VoidCallback onShareInstagram;
  final VoidCallback onShareFacebook;
  final VoidCallback onShareWhatsApp;
  final VoidCallback onShareMore;
  final VoidCallback onSaveGallery;
  final VoidCallback onCopyLink;
  final bool isExporting;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // ── Customization Toggles ──
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // 1. Aspect Ratio (9:16 / 1:1)
              _CustomizationPill(
                icon: aspectRatio == StoryAspectRatio.story
                    ? Icons.smartphone_rounded
                    : Icons.crop_square_rounded,
                label: aspectRatio.label,
                onTap: onToggleAspectRatio,
              ),

              const SizedBox(width: 8),

              // 2. Background Style (Mesh / Blurred / Dark)
              _CustomizationPill(
                icon: backgroundStyle.icon,
                label: backgroundStyle.label,
                onTap: onToggleBackgroundStyle,
              ),

              const SizedBox(width: 8),

              // 3. Text Polarity (Light / Dark)
              _CustomizationPill(
                icon: textPolarity == StoryTextPolarity.light
                    ? Icons.light_mode_rounded
                    : Icons.dark_mode_rounded,
                label: textPolarity == StoryTextPolarity.light ? 'Light' : 'Dark',
                onTap: onToggleTextPolarity,
              ),
            ],
          ),
        ),

        const SizedBox(height: 14),

        // ── Primary Action Sharing Buttons ──
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              // Instagram Stories
              _ShareActionButton(
                label: 'Instagram',
                iconWidget: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: const LinearGradient(
                      begin: Alignment.bottomLeft,
                      end: Alignment.topRight,
                      colors: [Color(0xFFF58529), Color(0xFFDD2A7B), Color(0xFF8134AF)],
                    ),
                  ),
                  child: const Icon(CupertinoIcons.camera, color: Colors.white, size: 22),
                ),
                onTap: isExporting ? null : onShareInstagram,
              ),

              // Facebook Stories
              _ShareActionButton(
                label: 'Facebook',
                iconWidget: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    color: const Color(0xFF1877F2),
                  ),
                  child: const Icon(CupertinoIcons.share, color: Colors.white, size: 22),
                ),
                onTap: isExporting ? null : onShareFacebook,
              ),

              // WhatsApp
              _ShareActionButton(
                label: 'WhatsApp',
                iconWidget: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    color: const Color(0xFF25D366),
                  ),
                  child: const Icon(CupertinoIcons.phone_fill, color: Colors.white, size: 22),
                ),
                onTap: isExporting ? null : onShareWhatsApp,
              ),

              // More / System Share
              _ShareActionButton(
                label: 'More',
                iconWidget: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    color: const Color(0xFF2C2C2E),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                  ),
                  child: const Icon(CupertinoIcons.ellipsis, color: Colors.white, size: 20),
                ),
                onTap: isExporting ? null : onShareMore,
              ),

              // Save to Gallery
              _ShareActionButton(
                label: 'Save',
                iconWidget: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    color: const Color(0xFF2C2C2E),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                  ),
                  child: const Icon(CupertinoIcons.arrow_down_to_line, color: Colors.white, size: 20),
                ),
                onTap: isExporting ? null : onSaveGallery,
              ),

              // Copy Link
              _ShareActionButton(
                label: 'Copy',
                iconWidget: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    color: const Color(0xFF2C2C2E),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                  ),
                  child: const Icon(CupertinoIcons.link, color: Colors.white, size: 20),
                ),
                onTap: isExporting ? null : onCopyLink,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CustomizationPill extends StatelessWidget {
  const _CustomizationPill({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: const Color(0x33FFFFFF),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.14), width: 0.8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: Colors.white),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(
                fontFamily: 'SF Pro',
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ShareActionButton extends StatelessWidget {
  const _ShareActionButton({
    required this.label,
    required this.iconWidget,
    required this.onTap,
  });

  final String label;
  final Widget iconWidget;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap != null
          ? () {
              HapticFeedback.lightImpact();
              onTap!();
            }
          : null,
      behavior: HitTestBehavior.opaque,
      child: Opacity(
        opacity: onTap != null ? 1.0 : 0.45,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            iconWidget,
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(
                fontFamily: 'SF Pro',
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: Colors.white.withValues(alpha: 0.75),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

