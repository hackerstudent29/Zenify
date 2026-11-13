import 'dart:ui';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'story_models.dart';
import 'story_service.dart';

// ═════════════════════════════════════════════════════════════════════════════
// 1. ZENIFY STORY BRAND WATERMARK BADGE
// ═════════════════════════════════════════════════════════════════════════════

class ZenifyStoryBrand extends StatelessWidget {
  const ZenifyStoryBrand({
    super.key,
    this.color,
    this.isLight = false,
    this.iconSize = 18,
    this.showWordmark = true,
  });

  /// Explicit tint color for the brand logo. If null, displays the natural
  /// brand crimson (#E11D48) or adapts cleanly for dark/light backdrops.
  final Color? color;

  /// If true, adapts for a light-background card.
  final bool isLight;

  final double iconSize;
  final bool showWordmark;

  @override
  Widget build(BuildContext context) {
    final effectiveColor = color;
    final h = (iconSize * 1.15).clamp(16.0, 32.0);

    return Semantics(
      label: 'Zenify',
      child: Image.asset(
        'assets/images/zenify_logo.png',
        height: h,
        fit: BoxFit.contain,
        color: effectiveColor,
        errorBuilder: (_, _, _) => Image.asset(
          'assets/images/z_logo.png',
          height: h,
          fit: BoxFit.contain,
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. ART MESH / BLURRED COVER / CHARCOAL BACKGROUND
// ═════════════════════════════════════════════════════════════════════════════

class ArtMeshBackground extends StatelessWidget {
  const ArtMeshBackground({
    super.key,
    required this.coverUrl,
    this.palette,
    this.style = StoryBackgroundStyle.artMesh,
    this.darken = true,
  });

  final String coverUrl;
  final ArtworkPalette? palette;
  final StoryBackgroundStyle style;
  final bool darken;

  @override
  Widget build(BuildContext context) {
    switch (style) {
      case StoryBackgroundStyle.blurredCover:
        return _buildBlurredCover();
      case StoryBackgroundStyle.solidDark:
        return _buildSolidDark();
      case StoryBackgroundStyle.artMesh:
        return _buildArtMesh();
    }
  }

  Widget _buildBlurredCover() {
    return Stack(
      fit: StackFit.expand,
      children: [
        Container(color: const Color(0xFF121214)),
        if (coverUrl.isNotEmpty)
          Positioned.fill(
            child: CachedNetworkImage(
              imageUrl: coverUrl,
              fit: BoxFit.cover,
              errorWidget: (_, _, _) => const SizedBox.shrink(),
            ),
          ),
        BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 55, sigmaY: 55),
          child: Container(
            color: Colors.black.withValues(alpha: darken ? 0.65 : 0.40),
          ),
        ),
      ],
    );
  }

  Widget _buildSolidDark() {
    final p = palette ?? ArtworkPaletteService.instance.getCachedOrFallback(coverUrl);
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            p.background,
            const Color(0xFF0D0D0E),
          ],
        ),
      ),
    );
  }

  Widget _buildArtMesh() {
    final p = palette ?? ArtworkPaletteService.instance.getCachedOrFallback(coverUrl);

    return Container(
      color: p.background,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Radial glow 1 - Primary color (top-left)
          Positioned(
            top: -80,
            left: -80,
            width: 320,
            height: 320,
            child: Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    p.primary.withValues(alpha: 0.85),
                    p.primary.withValues(alpha: 0.0),
                  ],
                ),
              ),
            ),
          ),

          // Radial glow 2 - Secondary color (bottom-right)
          Positioned(
            bottom: -90,
            right: -90,
            width: 340,
            height: 340,
            child: Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    p.secondary.withValues(alpha: 0.80),
                    p.secondary.withValues(alpha: 0.0),
                  ],
                ),
              ),
            ),
          ),

          // Radial glow 3 - Accent color (center-right)
          Positioned(
            top: 200,
            right: -60,
            width: 240,
            height: 240,
            child: Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    p.accent.withValues(alpha: 0.45),
                    p.accent.withValues(alpha: 0.0),
                  ],
                ),
              ),
            ),
          ),

          // Frost blur overlay
          BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 70, sigmaY: 70),
            child: Container(
              color: Colors.black.withValues(alpha: darken ? 0.35 : 0.15),
            ),
          ),
        ],
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. STORY CARD VIEWPORT (9:16 & 1:1 CONSTRAINTS)
// ═════════════════════════════════════════════════════════════════════════════

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
        child: FittedBox(
          fit: BoxFit.contain,
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
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. STORY TEMPLATE SELECTOR
// ═════════════════════════════════════════════════════════════════════════════

class StoryTemplateSelector extends StatelessWidget {
  const StoryTemplateSelector({
    super.key,
    required this.templates,
    required this.selectedTemplate,
    required this.onSelectTemplate,
  });

  final List<StoryTemplate> templates;
  final StoryTemplate selectedTemplate;
  final ValueChanged<StoryTemplate> onSelectTemplate;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 44,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: templates.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final t = templates[index];
          final isSelected = t.id == selectedTemplate.id;

          return GestureDetector(
            onTap: () {
              if (!isSelected) {
                HapticFeedback.selectionClick();
                onSelectTemplate(t);
              }
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected
                    ? Colors.white.withValues(alpha: 0.22)
                    : Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: isSelected
                      ? Colors.white.withValues(alpha: 0.35)
                      : Colors.white.withValues(alpha: 0.08),
                  width: 0.8,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    t.icon,
                    size: 15,
                    color: isSelected ? const Color(0xFFE11D48) : Colors.white70,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    t.name,
                    style: TextStyle(
                      fontFamily: 'SF Pro Text',
                      fontSize: 13,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                      color: isSelected ? Colors.white : Colors.white70,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. STORY SHARE CONTROLS
// ═════════════════════════════════════════════════════════════════════════════

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
    required this.onShareSnapchat,
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
  final VoidCallback onShareSnapchat;
  final VoidCallback onShareMore;
  final VoidCallback onSaveGallery;
  final VoidCallback onCopyLink;
  final bool isExporting;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Customization Toggles
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _CustomizationPill(
                icon: aspectRatio == StoryAspectRatio.story
                    ? Icons.smartphone_rounded
                    : Icons.crop_square_rounded,
                label: aspectRatio.label,
                onTap: onToggleAspectRatio,
              ),
              const SizedBox(width: 8),
              _CustomizationPill(
                icon: backgroundStyle.icon,
                label: backgroundStyle.label,
                onTap: onToggleBackgroundStyle,
              ),
              const SizedBox(width: 8),
              _CustomizationPill(
                icon: textPolarity == StoryTextPolarity.light
                    ? Icons.light_mode_rounded
                    : Icons.dark_mode_rounded,
                label: textPolarity.label,
                onTap: onToggleTextPolarity,
              ),
            ],
          ),
        ),

        const SizedBox(height: 14),

        // Action Share Targets
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              _ShareTargetButton(
                icon: Icons.camera_alt_rounded,
                label: 'Instagram',
                gradient: const [Color(0xFF833AB4), Color(0xFFFD1D1D), Color(0xFFFCB045)],
                onTap: onShareInstagram,
                isLoading: isExporting,
              ),
              _ShareTargetButton(
                icon: Icons.chat_rounded,
                label: 'WhatsApp',
                gradient: const [Color(0xFF25D366), Color(0xFF128C7E)],
                onTap: onShareWhatsApp,
                isLoading: isExporting,
              ),
              _ShareTargetButton(
                icon: Icons.save_alt_rounded,
                label: 'Save',
                gradient: const [Color(0xFF3A3A3C), Color(0xFF1C1C1E)],
                onTap: onSaveGallery,
                isLoading: isExporting,
              ),
              _ShareTargetButton(
                icon: Icons.ios_share_rounded,
                label: 'More',
                gradient: const [Color(0xFF6366F1), Color(0xFF4F46E5)],
                onTap: onShareMore,
                isLoading: isExporting,
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
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.18),
            width: 0.6,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: Colors.white),
            const SizedBox(width: 5),
            Text(
              label,
              style: const TextStyle(
                fontFamily: 'SF Pro Text',
                fontSize: 12,
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

class _ShareTargetButton extends StatelessWidget {
  const _ShareTargetButton({
    required this.icon,
    required this.label,
    required this.gradient,
    required this.onTap,
    this.isLoading = false,
  });

  final IconData icon;
  final String label;
  final List<Color> gradient;
  final VoidCallback onTap;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isLoading ? null : onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: gradient,
              ),
              boxShadow: [
                BoxShadow(
                  color: gradient.first.withValues(alpha: 0.35),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Icon(icon, color: Colors.white, size: 22),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: const TextStyle(
              fontFamily: 'SF Pro Text',
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: Colors.white70,
            ),
          ),
        ],
      ),
    );
  }
}
