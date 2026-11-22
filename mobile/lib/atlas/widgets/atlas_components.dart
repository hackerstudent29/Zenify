import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';

import '../../design_system/widgets/equalizer_bars.dart';
import '../core/atlas_tokens.dart';
import '../data/atlas_music_source.dart';
import '../models/atlas_models.dart';
import 'artist_avatar.dart';
import 'atlas_back_button.dart';
import 'atlas_press.dart';

/// Large-title nav bar with red back chevron.
class AtlasSliverNav extends StatelessWidget {
  const AtlasSliverNav(this.title, {super.key});
  final String title;

  @override
  Widget build(BuildContext context) => CupertinoSliverNavigationBar(
    automaticallyImplyLeading: false,
    leading: const AtlasBackButton(),
    largeTitle: Text(title, style: AtlasText.largeTitle),
    middle: Text(title, style: AtlasText.headline),
    backgroundColor: AtlasColors.bg.withValues(alpha: 0.88),
    border: null,
  );
}

/// Section title (+ optional red action), Apple Music shelf header.
class AtlasSectionHeader extends StatelessWidget {
  const AtlasSectionHeader(
    this.title, {
    super.key,
    this.subtitle,
    this.actionLabel,
    this.onAction,
  });
  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 26, 20, 12),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: AtlasText.title2),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(subtitle!, style: AtlasText.footnote),
              ],
            ],
          ),
        ),
        if (actionLabel != null && onAction != null)
          AtlasPress(
            onTap: onAction,
            scale: 0.92,
            child: Text(
              actionLabel!,
              style: AtlasText.body.copyWith(
                fontSize: 15,
                color: AtlasColors.accent,
              ),
            ),
          ),
      ],
    ),
  );
}

/// Horizontal shelf with lazy building.
class AtlasShelf extends StatelessWidget {
  const AtlasShelf({
    super.key,
    required this.height,
    required this.count,
    required this.itemBuilder,
    this.gap = 12,
  });
  final double height;
  final int count;
  final IndexedWidgetBuilder itemBuilder;
  final double gap;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: height,
    child: ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      itemCount: count,
      addAutomaticKeepAlives: false,
      separatorBuilder: (_, _) => SizedBox(width: gap),
      itemBuilder: itemBuilder,
    ),
  );
}

/// Solid rounded tile used in shelves.
class AtlasTile extends StatelessWidget {
  const AtlasTile({
    super.key,
    required this.width,
    required this.child,
    this.onTap,
    this.radius = 14,
    this.padding = const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
  });
  final double width;
  final Widget child;
  final VoidCallback? onTap;
  final double radius;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => AtlasPress(
    onTap: onTap,
    scale: 0.96,
    child: Container(
      width: width,
      padding: padding,
      decoration: BoxDecoration(
        color: AtlasColors.surfaceHigh,
        borderRadius: BorderRadius.circular(radius),
      ),
      child: child,
    ),
  );
}

/// Small rounded label, e.g. "Official Charts".
class AtlasBadge extends StatelessWidget {
  const AtlasBadge(this.text, {super.key, this.icon, this.accent = false});
  final String text;
  final IconData? icon;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final c = accent ? AtlasColors.accent : AtlasColors.textSecondary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: accent
            ? AtlasColors.accent.withValues(alpha: 0.16)
            : AtlasColors.fill,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: c),
            const SizedBox(width: 4),
          ],
          Text(
            text,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: c,
            ),
          ),
        ],
      ),
    );
  }
}

/// Capsule filter chip with animated selection.
class AtlasChip extends StatelessWidget {
  const AtlasChip(
    this.label, {
    super.key,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => AtlasPress(
    onTap: onTap,
    scale: 0.94,
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: selected ? AtlasColors.accent : AtlasColors.surfaceHigh,
        borderRadius: BorderRadius.circular(18),
      ),
      child: AnimatedDefaultTextStyle(
        duration: const Duration(milliseconds: 220),
        style: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w600,
          color: selected ? AtlasColors.textPrimary : AtlasColors.textSecondary,
        ),
        child: Text(label),
      ),
    ),
  );
}

/// Round red play button.
class AtlasPlayCircle extends StatelessWidget {
  const AtlasPlayCircle({super.key, required this.onTap, this.size = 36});
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) => AtlasPress(
    onTap: onTap,
    scale: 0.86,
    child: Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: AtlasColors.accent,
        shape: BoxShape.circle,
      ),
      child: Icon(
        CupertinoIcons.play_fill,
        size: size * 0.42,
        color: AtlasColors.textPrimary,
      ),
    ),
  );
}

/// Apple Music "Play / Shuffle" pair.
class AtlasPlayRow extends StatelessWidget {
  const AtlasPlayRow({
    super.key,
    required this.enabled,
    required this.onPlay,
    required this.onShuffle,
  });
  final bool enabled;
  final VoidCallback onPlay;
  final VoidCallback onShuffle;

  Widget _btn(IconData icon, String label, VoidCallback onTap) {
    final c = enabled ? AtlasColors.accent : AtlasColors.textTertiary;
    return Expanded(
      child: AtlasPress(
        onTap: enabled ? onTap : null,
        scale: 0.96,
        child: Container(
          height: 48,
          decoration: BoxDecoration(
            color: AtlasColors.surfaceHigh,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: c),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: c,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => Row(
    children: [
      _btn(CupertinoIcons.play_fill, 'Play', onPlay),
      const SizedBox(width: 12),
      _btn(CupertinoIcons.shuffle, 'Shuffle', onShuffle),
    ],
  );
}

/// Square artwork with placeholder.
class AtlasThumb extends StatelessWidget {
  const AtlasThumb({
    super.key,
    required this.url,
    required this.size,
    this.radius = 6,
  });
  final String? url;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final ph = Container(
      width: size,
      height: size,
      color: AtlasColors.surfaceHigh,
      child: Icon(
        CupertinoIcons.music_note,
        size: size * 0.4,
        color: AtlasColors.textTertiary,
      ),
    );
    final u = url;
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: u == null || u.isEmpty
          ? ph
          : CachedNetworkImage(
              imageUrl: u,
              width: size,
              height: size,
              fit: BoxFit.cover,
              memCacheWidth: (size * 3).round(),
              fadeInDuration: const Duration(milliseconds: 180),
              placeholder: (_, _) => ph,
              errorWidget: (_, _, _) => ph,
            ),
    );
  }
}

/// Circular artist + name (Apple Music artist shelf).
class AtlasArtistItem extends StatelessWidget {
  const AtlasArtistItem({
    super.key,
    required this.name,
    this.imageUrl,
    this.size = 84,
  });
  final String name;
  final String? imageUrl;
  final double size;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: size,
    child: Column(
      children: [
        ArtistAvatar(name: name, size: size, imageUrl: imageUrl),
        const SizedBox(height: 8),
        Text(
          name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: AtlasColors.textPrimary,
          ),
        ),
      ],
    ),
  );
}

/// Song list row: rank, artwork, title/artist, now-playing bars.
class AtlasSongRow extends StatelessWidget {
  const AtlasSongRow({
    super.key,
    required this.song,
    this.rank,
    required this.onTap,
  });
  final AtlasSong song;
  final int? rank;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final inset = rank != null ? 28.0 + 12 : 0.0;
    return AtlasPress(
      onTap: onTap,
      scale: 0.985,
      haptic: false,
      child: SizedBox(
        height: 64,
        child: Stack(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  if (rank != null)
                    SizedBox(
                      width: 28,
                      child: Text(
                        '$rank',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          fontFeatures: const [FontFeature.tabularFigures()],
                          color: rank! <= 3
                              ? AtlasColors.accent
                              : AtlasColors.textSecondary,
                        ),
                      ),
                    ),
                  if (rank != null) const SizedBox(width: 12),
                  AtlasThumb(url: song.thumbnail, size: 48),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          song.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AtlasText.body,
                        ),
                        const SizedBox(height: 1),
                        Text(
                          song.artist,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AtlasText.sub.copyWith(fontSize: 14),
                        ),
                      ],
                    ),
                  ),
                  ValueListenableBuilder<String?>(
                    valueListenable: AtlasMusicSource.instance.nowPlayingId,
                    builder: (_, id, _) => id == song.id
                        ? const Padding(
                            padding: EdgeInsets.only(left: 8),
                            child: EqualizerBars(
                              color: AtlasColors.accent,
                              size: 14,
                            ),
                          )
                        : const SizedBox.shrink(),
                  ),
                ],
              ),
            ),
            Positioned(
              left: 20 + 48 + 12 + inset,
              right: 0,
              bottom: 0,
              child: Container(height: 0.5, color: AtlasColors.divider),
            ),
          ],
        ),
      ),
    );
  }
}
