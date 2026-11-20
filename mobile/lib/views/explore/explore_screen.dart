import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart'
    show
        CupertinoActivityIndicator,
        CupertinoIcons,
        CupertinoSliverRefreshControl,
        RefreshIndicatorMode;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/monogram_avatar.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/library_store.dart';
import '../../services/country_service.dart';
import '../../services/listening_history_service.dart';
import '../../services/player_state.dart';
import '../../services/user_preferences_service.dart';
import '../../utils/media_normalizer.dart';
import '../details/album_screen.dart';
import '../details/artist_popup.dart';
import '../details/artist_screen.dart';
import '../details/category_screen.dart';
import 'explore_data_service.dart';

// ═════════════════════════════════════════════════════════════════════════════
// Physics primitives
// ═════════════════════════════════════════════════════════════════════════════

const _kPressSpring = SpringDescription(mass: 1, stiffness: 430, damping: 21);
const _kRevealSpring = SpringDescription(mass: 1, stiffness: 170, damping: 22);

typedef _Tile = ({
  String title,
  String query,
  IconData icon,
  List<Color> colors,
});

/// Horizontal shelf physics: flings settle on a card with a real spring.
class _SnapPhysics extends ScrollPhysics {
  const _SnapPhysics({super.parent, required this.itemExtent});
  final double itemExtent;

  @override
  _SnapPhysics applyTo(ScrollPhysics? ancestor) =>
      _SnapPhysics(parent: buildParent(ancestor), itemExtent: itemExtent);

  @override
  SpringDescription get spring =>
      SpringDescription.withDampingRatio(mass: 0.5, stiffness: 110, ratio: 1.0);

  double _target(ScrollMetrics m, double velocity) {
    final page = m.pixels / itemExtent;
    final tol = toleranceFor(m).velocity;
    final double t;
    if (velocity < -tol) {
      t = page.floorToDouble();
    } else if (velocity > tol) {
      t = page.ceilToDouble();
    } else {
      t = page.roundToDouble();
    }
    return (t * itemExtent)
        .clamp(m.minScrollExtent, m.maxScrollExtent)
        .toDouble();
  }

  @override
  Simulation? createBallisticSimulation(
    ScrollMetrics position,
    double velocity,
  ) {
    if ((velocity <= 0 && position.pixels <= position.minScrollExtent) ||
        (velocity >= 0 && position.pixels >= position.maxScrollExtent)) {
      return super.createBallisticSimulation(position, velocity);
    }
    final target = _target(position, velocity);
    if ((target - position.pixels).abs() < 0.5) return null;
    return ScrollSpringSimulation(
      spring,
      position.pixels,
      target,
      velocity,
      tolerance: toleranceFor(position),
    );
  }

  @override
  bool get allowImplicitScrolling => false;
}

/// Soft page snapping for the hero + paged rows.
class _SoftPagePhysics extends PageScrollPhysics {
  const _SoftPagePhysics({super.parent});

  @override
  _SoftPagePhysics applyTo(ScrollPhysics? ancestor) =>
      _SoftPagePhysics(parent: buildParent(ancestor));

  @override
  SpringDescription get spring =>
      SpringDescription.withDampingRatio(mass: 0.5, stiffness: 100, ratio: 0.9);
}

/// Press feedback with a real spring.
class _Press extends StatefulWidget {
  const _Press({required this.child, this.onTap, this.scale = 0.97});
  final Widget child;
  final VoidCallback? onTap;
  final double scale;

  @override
  State<_Press> createState() => _PressState();
}

class _PressState extends State<_Press> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: 1,
  );

  void _to(double v) =>
      _c.animateWith(SpringSimulation(_kPressSpring, _c.value, v, 0));

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.onTap == null) return widget.child;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _to(widget.scale),
      onTapUp: (_) => _to(1),
      onTapCancel: () => _to(1),
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, child) => Transform.scale(scale: _c.value, child: child),
      ),
    );
  }
}

/// Spring entrance (fade + rise) when a section scrolls into view.
class _Reveal extends StatefulWidget {
  const _Reveal({super.key, required this.child});
  final Widget child;

  @override
  State<_Reveal> createState() => _RevealState();
}

class _RevealState extends State<_Reveal> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );

  @override
  void initState() {
    super.initState();
    _c.animateWith(SpringSimulation(_kRevealSpring, 0, 1, 0));
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (_, child) {
        final v = _c.value;
        return Opacity(
          opacity: v.clamp(0.0, 1.0).toDouble(),
          child: Transform.translate(
            offset: Offset(0, (1 - v) * 18),
            child: child,
          ),
        );
      },
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Shared primitives
// ═════════════════════════════════════════════════════════════════════════════

TextStyle _display({
  double size = 20,
  FontWeight weight = FontWeight.w700,
  Color color = Colors.white,
  double spacing = -0.3,
  double? height,
}) => TextStyle(
  fontFamily: 'SF Pro Display',
  fontSize: size,
  fontWeight: weight,
  color: color,
  letterSpacing: spacing,
  height: height,
);

TextStyle _body({
  double size = 14,
  FontWeight weight = FontWeight.w500,
  Color color = AppColors.textSecondary,
  double? height,
}) => TextStyle(
  fontFamily: 'SF Pro',
  fontSize: size,
  fontWeight: weight,
  color: color,
  letterSpacing: -0.1,
  height: height,
);

class _Img extends StatelessWidget {
  const _Img(
    this.url, {
    this.radius = 8,
    this.circular = false,
    this.cacheWidth = 520,
  });
  final String url;
  final double radius;
  final bool circular;
  final int cacheWidth;

  @override
  Widget build(BuildContext context) {
    final img = CachedNetworkImage(
      imageUrl: MediaNormalizer.upgradeArtworkUrl(
        url,
        isArtistAvatar: circular,
      ),
      fit: BoxFit.cover,
      memCacheWidth: cacheWidth,
      fadeInDuration: const Duration(milliseconds: 200),
      placeholder: (context, u) => Container(color: AppColors.surface2),
      errorWidget: (context, u, e) => Container(
        color: AppColors.surface2,
        child: Icon(
          circular ? CupertinoIcons.person_fill : Icons.music_note_rounded,
          color: AppColors.textTertiary,
        ),
      ),
    );
    if (circular) return ClipOval(child: img);
    if (radius <= 0) return img;
    return ClipRRect(borderRadius: BorderRadius.circular(radius), child: img);
  }
}

/// Artwork with a hairline edge + soft shadow (Apple Music artwork treatment).
class _Art extends StatelessWidget {
  const _Art({
    required this.url,
    this.radius = 8,
    this.cacheWidth = 520,
    this.circular = false,
  });
  final String url;
  final double radius;
  final int cacheWidth;
  final bool circular;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      position: DecorationPosition.foreground,
      decoration: BoxDecoration(
        shape: circular ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: circular ? null : BorderRadius.circular(radius),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.08),
          width: 0.5,
        ),
      ),
      child: DecoratedBox(
        decoration: BoxDecoration(
          shape: circular ? BoxShape.circle : BoxShape.rectangle,
          borderRadius: circular ? null : BorderRadius.circular(radius),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.28),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: _Img(
          url,
          radius: radius,
          circular: circular,
          cacheWidth: cacheWidth,
        ),
      ),
    );
  }
}

class _EqBars extends StatefulWidget {
  const _EqBars({super.key, required this.playing, this.height = 16});
  final bool playing;
  final double height;

  @override
  State<_EqBars> createState() => _EqBarsState();
}

class _EqBarsState extends State<_EqBars> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void initState() {
    super.initState();
    if (widget.playing) _c.repeat();
  }

  @override
  void didUpdateWidget(covariant _EqBars old) {
    super.didUpdateWidget(old);
    if (widget.playing && !_c.isAnimating) _c.repeat();
    if (!widget.playing) _c.stop();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) => Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: List.generate(4, (i) {
          final v = widget.playing
              ? 0.3 +
                    0.7 *
                        (0.5 +
                            0.5 *
                                math.sin(
                                  _c.value * 2 * math.pi * (1 + i * 0.35) +
                                      i * 1.3,
                                ))
              : 0.28;
          return Container(
            width: 3,
            height: widget.height * v,
            margin: const EdgeInsets.only(right: 2),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(1.5),
            ),
          );
        }),
      ),
    );
  }
}

/// Minimal translucent play button for artwork overlays (no blur = cheap).
class _OverlayPlay extends StatelessWidget {
  const _OverlayPlay({required this.playing, this.size = 40});
  final bool playing;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.black.withValues(alpha: 0.5),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.18),
          width: 0.5,
        ),
      ),
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 220),
        child: playing
            ? _EqBars(
                key: const ValueKey('eq'),
                playing: true,
                height: size * 0.38,
              )
            : Icon(
                Icons.play_arrow_rounded,
                key: const ValueKey('pl'),
                color: Colors.white,
                size: size * 0.6,
              ),
      ),
    );
  }
}

/// Section title: quiet overline + title + chevron.
class _SecHeader extends StatelessWidget {
  const _SecHeader({required this.title, this.overline, this.onMore});
  final String title;
  final String? overline;
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 32, 20, 14),
      child: _Press(
        scale: 0.985,
        onTap: onMore,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (overline != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Text(
                        overline!.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.textTertiary,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.8,
                        ),
                      ),
                    ),
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: _display(
                      size: 22,
                      weight: FontWeight.w700,
                      spacing: -0.6,
                    ),
                  ),
                ],
              ),
            ),
            if (onMore != null)
              const Icon(
                CupertinoIcons.chevron_forward,
                color: AppColors.textTertiary,
                size: 16,
              ),
          ],
        ),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 32, 20, 0),
    child: Container(height: 0.5, color: AppColors.hairline),
  );
}

class _Shelf extends StatelessWidget {
  const _Shelf({
    required this.height,
    required this.itemExtent,
    required this.count,
    required this.builder,
  });
  final double height, itemExtent;
  final int count;
  final Widget Function(BuildContext, int) builder;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        physics: _SnapPhysics(
          parent: const BouncingScrollPhysics(),
          itemExtent: itemExtent,
        ),
        itemExtent: itemExtent,
        itemCount: count,
        addAutomaticKeepAlives: false,
        // ignore: deprecated_member_use
        cacheExtent: itemExtent * 2,
        itemBuilder: (c, i) => RepaintBoundary(
          child: Padding(
            padding: const EdgeInsets.only(right: 14),
            child: builder(c, i),
          ),
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// HERO - "Top Picks" editorial pager
//   Large artwork cards with a caption above, Apple Music "Listen Now" style.
// ═════════════════════════════════════════════════════════════════════════════

class _Hero extends StatefulWidget {
  const _Hero({
    required this.tracks,
    required this.countryName,
    required this.isActive,
    required this.playing,
    required this.onPlay,
  });
  final List<Track> tracks;
  final String countryName;
  final bool Function(Track) isActive;
  final bool playing;
  final void Function(int index) onPlay;

  @override
  State<_Hero> createState() => _HeroState();
}

class _HeroState extends State<_Hero> {
  final _pc = PageController(viewportFraction: 0.88);
  int _cur = 0;

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.tracks;
    final n = items.length;
    final w = MediaQuery.sizeOf(context).width;
    final artH = (w * 0.88 - 12) * 0.92;
    final dotCount = math.min(n, 8);
    final prefs = UserPreferencesService.instance.currentPrefs.favoriteArtists;

    return Column(
      children: [
        const SizedBox(height: 8),
        SizedBox(
          height: artH + 84,
          child: PageView.builder(
            controller: _pc,
            physics: const _SoftPagePhysics(parent: BouncingScrollPhysics()),
            itemCount: n,
            onPageChanged: (i) {
              HapticFeedback.selectionClick();
              setState(() => _cur = i);
            },
            itemBuilder: (context, i) {
              final t = items[i];
              final preferred = prefs.any(
                (a) => t.artist.toLowerCase().contains(a.name.toLowerCase()),
              );
              final eyebrow = preferred
                  ? 'Recommended for you'
                  : 'No. ${i + 1} in ${widget.countryName}';
              final playing = widget.isActive(t) && widget.playing;
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 260),
                  opacity: i == _cur ? 1 : 0.5,
                  child: _Press(
                    scale: 0.98,
                    onTap: () {
                      HapticFeedback.lightImpact();
                      widget.onPlay(i);
                    },
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          eyebrow.toUpperCase(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: preferred
                                ? AppColors.accent
                                : AppColors.textTertiary,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          MediaNormalizer.cleanCompactTitle(t.title),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: _display(
                            size: 22,
                            weight: FontWeight.w700,
                            spacing: -0.6,
                          ),
                        ),
                        const SizedBox(height: 1),
                        Text(
                          MediaNormalizer.formatArtists(t.artist),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: _body(size: 15),
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          height: artH,
                          width: double.infinity,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(10),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.4),
                                  blurRadius: 18,
                                  offset: const Offset(0, 10),
                                ),
                              ],
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(10),
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  _Img(t.coverUrl, radius: 0, cacheWidth: 900),
                                  DecoratedBox(
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        begin: Alignment.topCenter,
                                        end: Alignment.bottomCenter,
                                        colors: [
                                          Colors.transparent,
                                          Colors.black.withValues(alpha: 0.45),
                                        ],
                                        stops: const [0.6, 1],
                                      ),
                                    ),
                                  ),
                                  Positioned(
                                    right: 12,
                                    bottom: 12,
                                    child: _OverlayPlay(
                                      playing: playing,
                                      size: 40,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 14),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var i = 0; i < dotCount; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOutCubic,
                width: 6,
                height: 6,
                margin: const EdgeInsets.symmetric(horizontal: 3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(
                    alpha: i == math.min(_cur, dotCount - 1) ? 0.9 : 0.25,
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Category chips
// ═════════════════════════════════════════════════════════════════════════════

class _Pills extends StatelessWidget {
  const _Pills({required this.tiles, required this.onTap});
  final List<_Tile> tiles;
  final void Function(_Tile) onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 62,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
        itemCount: tiles.length,
        separatorBuilder: (context, i) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final t = tiles[i];
          return _Press(
            scale: 0.95,
            onTap: () => onTap(t),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.16),
                  width: 0.8,
                ),
              ),
              child: Text(
                t.title,
                style: _body(
                  size: 13.5,
                  weight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Cards
// ═════════════════════════════════════════════════════════════════════════════

/// Square artwork + title + subtitle, with an optional quiet eyebrow.
class _CoverCard extends StatelessWidget {
  const _CoverCard({
    required this.url,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.eyebrow,
    this.radius = 8,
    this.cacheWidth = 520,
  });
  final String url, title, subtitle;
  final String? eyebrow;
  final double radius;
  final int cacheWidth;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _Press(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: _Art(url: url, radius: radius, cacheWidth: cacheWidth),
          ),
          const SizedBox(height: 10),
          if (eyebrow != null)
            Text(
              eyebrow!.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.textTertiary,
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.7,
              ),
            ),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _display(size: 14.5, weight: FontWeight.w600, spacing: -0.2),
          ),
          const SizedBox(height: 1),
          Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _body(size: 13),
          ),
        ],
      ),
    );
  }
}

/// Wide 16:10 card for curated playlists.
class _WideCard extends StatelessWidget {
  const _WideCard({
    required this.url,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final String url, title, subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _Press(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 16 / 10,
            child: _Art(url: url, radius: 10, cacheWidth: 720),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _display(size: 15.5, weight: FontWeight.w600, spacing: -0.3),
          ),
          const SizedBox(height: 1),
          Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _body(size: 13),
          ),
        ],
      ),
    );
  }
}

/// Circular artist with a quiet text follow action.
class _ArtistCard extends StatelessWidget {
  const _ArtistCard({
    required this.name,
    required this.subs,
    required this.photo,
    required this.store,
    required this.onTap,
  });
  final String name, subs, photo;
  final LibraryStore store;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _Press(
          scale: 0.95,
          onTap: onTap,
          child: AspectRatio(
            aspectRatio: 1,
            child: photo.isNotEmpty
                ? _Art(url: photo, circular: true, cacheWidth: 320)
                : MonogramAvatar(name: name, size: 100),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: _display(size: 14, weight: FontWeight.w600, spacing: -0.2),
        ),
        const SizedBox(height: 1),
        Text(
          subs,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: _body(size: 12, color: AppColors.textTertiary),
        ),
        const SizedBox(height: 6),
        AnimatedBuilder(
          animation: store,
          builder: (context, _) {
            final followed = store.isFollowing(name);
            return _Press(
              scale: 0.92,
              onTap: () {
                HapticFeedback.selectionClick();
                store.toggleFollow(name, photo);
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 8),
                child: Text(
                  followed ? 'Following' : 'Follow',
                  style: _body(
                    size: 12.5,
                    weight: FontWeight.w600,
                    color: followed ? AppColors.textTertiary : AppColors.accent,
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _SongRow extends StatelessWidget {
  const _SongRow({
    required this.track,
    required this.rank,
    required this.current,
    required this.playing,
    required this.onTap,
    required this.onMore,
    this.divider = true,
  });
  final Track track;
  final int rank;
  final bool current, playing, divider;
  final VoidCallback onTap, onMore;

  @override
  Widget build(BuildContext context) {
    return _Press(
      scale: 0.98,
      onTap: onTap,
      child: SizedBox(
        height: 68,
        child: Stack(
          children: [
            Row(
              children: [
                SizedBox(
                  width: 30,
                  child: Text(
                    '$rank',
                    style: _display(
                      size: 17,
                      weight: FontWeight.w600,
                      color: current
                          ? AppColors.accent
                          : AppColors.textTertiary,
                    ),
                  ),
                ),
                SizedBox(
                  width: 52,
                  height: 52,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _Img(track.coverUrl, radius: 6, cacheWidth: 200),
                      if (current)
                        Container(
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.5),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          alignment: Alignment.center,
                          child: _EqBars(playing: playing, height: 16),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        MediaNormalizer.cleanCompactTitle(track.title),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: _display(
                          size: 15.5,
                          weight: FontWeight.w500,
                          spacing: -0.2,
                          color: current ? AppColors.accent : Colors.white,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        MediaNormalizer.formatArtists(track.artist),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: _body(size: 13.5),
                      ),
                    ],
                  ),
                ),
                _Press(
                  scale: 0.88,
                  onTap: onMore,
                  child: const Padding(
                    padding: EdgeInsets.all(8),
                    child: Icon(
                      Icons.more_horiz_rounded,
                      color: AppColors.textTertiary,
                      size: 22,
                    ),
                  ),
                ),
              ],
            ),
            if (divider)
              Positioned(
                left: 94,
                right: 0,
                bottom: 0,
                child: Container(height: 0.5, color: AppColors.hairline),
              ),
          ],
        ),
      ),
    );
  }
}

/// Swipeable pages of ranked rows.
class _PagedRows extends StatefulWidget {
  const _PagedRows({
    required this.tracks,
    required this.isActive,
    required this.playing,
    required this.onPlay,
    required this.onMore,
  });
  final List<Track> tracks;
  final bool Function(Track) isActive;
  final bool playing;
  final void Function(int index) onPlay;
  final void Function(Track) onMore;

  @override
  State<_PagedRows> createState() => _PagedRowsState();
}

class _PagedRowsState extends State<_PagedRows> {
  static const rows = 4;
  static const rowH = 68.0;
  final _pc = PageController(viewportFraction: 0.9);

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tracks = widget.tracks;
    final pages = (tracks.length / rows).ceil();

    return SizedBox(
      height: rows * rowH,
      child: PageView.builder(
        controller: _pc,
        padEnds: false,
        physics: const _SoftPagePhysics(parent: BouncingScrollPhysics()),
        itemCount: pages,
        itemBuilder: (_, p) {
          return RepaintBoundary(
            child: Padding(
              padding: EdgeInsets.only(left: p == 0 ? 20 : 8, right: 8),
              child: Column(
                children: List.generate(rows, (r) {
                  final i = p * rows + r;
                  if (i >= tracks.length) return const SizedBox(height: rowH);
                  final t = tracks[i];
                  final cur = widget.isActive(t);
                  return _SongRow(
                    track: t,
                    rank: i + 1,
                    current: cur,
                    playing: cur && widget.playing,
                    divider: r < rows - 1,
                    onTap: () => widget.onPlay(i),
                    onMore: () => widget.onMore(t),
                  );
                }),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Play / Shuffle action pair.
class _ActionBtn extends StatelessWidget {
  const _ActionBtn({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _Press(
      scale: 0.96,
      onTap: onTap,
      child: Container(
        height: 42,
        decoration: BoxDecoration(
          color: AppColors.surface2,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 16, color: AppColors.accent),
            const SizedBox(width: 8),
            Text(
              label,
              style: _body(
                size: 15,
                weight: FontWeight.w600,
                color: AppColors.accent,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Browse grid (static, muted category tiles)
// ═════════════════════════════════════════════════════════════════════════════

class _CategoryTile extends StatelessWidget {
  const _CategoryTile({required this.tile, required this.onTap});
  final _Tile tile;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = tile.colors;
    final base = Color.lerp(
      c.isNotEmpty ? c.first : AppColors.accent,
      Colors.black,
      0.4,
    )!;
    final end = Color.lerp(c.length > 1 ? c.last : base, Colors.black, 0.72)!;
    return _Press(
      scale: 0.97,
      onTap: onTap,
      child: Container(
        height: 76,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [base, end],
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              right: -8,
              bottom: -10,
              child: Icon(
                tile.icon,
                size: 64,
                color: Colors.white.withValues(alpha: 0.1),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 40, 0),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  tile.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: _display(
                    size: 15.5,
                    weight: FontWeight.w700,
                    spacing: -0.3,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BrowseGrid extends StatelessWidget {
  const _BrowseGrid({required this.tiles, required this.onTap});
  final List<_Tile> tiles;
  final void Function(_Tile) onTap;

  @override
  Widget build(BuildContext context) {
    final rows = (tiles.length / 2).ceil();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: [
          for (var r = 0; r < rows; r++)
            Padding(
              padding: EdgeInsets.only(bottom: r == rows - 1 ? 0 : 12),
              child: Row(
                children: [
                  for (var k = 0; k < 2; k++) ...[
                    if (k == 1) const SizedBox(width: 12),
                    Expanded(
                      child: r * 2 + k < tiles.length
                          ? _CategoryTile(
                              tile: tiles[r * 2 + k],
                              onTap: () => onTap(tiles[r * 2 + k]),
                            )
                          : const SizedBox(height: 76),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// "See all" sheet (above everything via the root navigator)
// ═════════════════════════════════════════════════════════════════════════════

class _ListEntry {
  const _ListEntry({
    required this.title,
    required this.subtitle,
    required this.cover,
    required this.onTap,
    this.track,
    this.circular = false,
    this.closeOnTap = false,
  });
  final String title, subtitle, cover;
  final Track? track;
  final bool circular, closeOnTap;
  final VoidCallback onTap;
}

class _SectionSheet extends StatefulWidget {
  const _SectionSheet({
    required this.title,
    required this.entries,
    required this.player,
    required this.onMenu,
    this.overline,
  });
  final String title;
  final String? overline;
  final List<_ListEntry> entries;
  final PlayerState player;
  final void Function(BuildContext ctx, Track t) onMenu;

  @override
  State<_SectionSheet> createState() => _SectionSheetState();
}

class _SectionSheetState extends State<_SectionSheet>
    with SingleTickerProviderStateMixin {
  final ValueNotifier<double> _dy = ValueNotifier<double>(0);
  late final AnimationController _back = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 280),
  );
  double _from = 0;

  @override
  void initState() {
    super.initState();
    _back.addListener(
      () =>
          _dy.value = _from * (1 - Curves.easeOutCubic.transform(_back.value)),
    );
  }

  @override
  void dispose() {
    _back.dispose();
    _dy.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final topGap = mq.padding.top + 10;

    return Material(
      type: MaterialType.transparency,
      child: Align(
        alignment: Alignment.bottomCenter,
        child: ValueListenableBuilder<double>(
          valueListenable: _dy,
          builder: (context, dy, child) =>
              Transform.translate(offset: Offset(0, dy), child: child),
          child: Container(
            height: mq.size.height - topGap,
            decoration: const BoxDecoration(
              color: AppColors.bg,
              borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(16),
              ),
              child: Column(
                children: [
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onVerticalDragStart: (_) => _back.stop(),
                    onVerticalDragUpdate: (d) =>
                        _dy.value = math.max(0, _dy.value + d.delta.dy),
                    onVerticalDragEnd: (d) {
                      if (_dy.value > 140 || (d.primaryVelocity ?? 0) > 800) {
                        Navigator.of(context).pop();
                      } else {
                        _from = _dy.value;
                        _back.forward(from: 0);
                      }
                    },
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 8, 16, 14),
                      child: Column(
                        children: [
                          Container(
                            width: 38,
                            height: 5,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.25),
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (widget.overline != null)
                                      Text(
                                        widget.overline!.toUpperCase(),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          color: AppColors.textTertiary,
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          letterSpacing: 0.8,
                                        ),
                                      ),
                                    Text(
                                      widget.title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: _display(
                                        size: 24,
                                        weight: FontWeight.w700,
                                        spacing: -0.7,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              _Press(
                                scale: 0.9,
                                onTap: () => Navigator.of(context).pop(),
                                child: Container(
                                  width: 32,
                                  height: 32,
                                  decoration: const BoxDecoration(
                                    color: AppColors.surface2,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(
                                    Icons.close_rounded,
                                    color: AppColors.textSecondary,
                                    size: 18,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  Container(height: 0.5, color: AppColors.hairline),
                  Expanded(
                    child: ListenableBuilder(
                      listenable: widget.player,
                      builder: (context, _) {
                        final cur = widget.player.currentTrack?.id;
                        return ListView.builder(
                          physics: const BouncingScrollPhysics(
                            parent: AlwaysScrollableScrollPhysics(),
                          ),
                          padding: EdgeInsets.only(
                            bottom: mq.padding.bottom + 24,
                          ),
                          itemExtent: 76,
                          itemCount: widget.entries.length,
                          addAutomaticKeepAlives: false,
                          itemBuilder: (context, i) {
                            final e = widget.entries[i];
                            final isCur = e.track != null && cur == e.track!.id;
                            return _SheetRow(
                              entry: e,
                              current: isCur,
                              playing: isCur && widget.player.isPlaying,
                              onTap: () {
                                if (e.closeOnTap) Navigator.of(context).pop();
                                e.onTap();
                              },
                              onMenu: e.track == null
                                  ? null
                                  : () => widget.onMenu(context, e.track!),
                            );
                          },
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SheetRow extends StatelessWidget {
  const _SheetRow({
    required this.entry,
    required this.current,
    required this.playing,
    required this.onTap,
    this.onMenu,
  });
  final _ListEntry entry;
  final bool current, playing;
  final VoidCallback onTap;
  final VoidCallback? onMenu;

  @override
  Widget build(BuildContext context) {
    return _Press(
      scale: 0.985,
      onTap: onTap,
      child: Stack(
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 20),
            child: Row(
              children: [
                SizedBox(
                  width: 56,
                  height: 56,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _Img(
                        entry.cover,
                        radius: 5,
                        circular: entry.circular,
                        cacheWidth: 220,
                      ),
                      if (current)
                        Container(
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.5),
                            borderRadius: BorderRadius.circular(5),
                          ),
                          alignment: Alignment.center,
                          child: _EqBars(playing: playing, height: 18),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: current ? AppColors.accent : Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w400,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        entry.subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: _body(size: 13.5),
                      ),
                    ],
                  ),
                ),
                if (onMenu != null)
                  IconButton(
                    onPressed: onMenu,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(
                      minWidth: 48,
                      minHeight: 48,
                    ),
                    icon: const Icon(
                      Icons.more_vert_rounded,
                      color: AppColors.textSecondary,
                      size: 22,
                    ),
                  )
                else
                  const SizedBox(width: 20),
              ],
            ),
          ),
          Positioned(
            left: 90,
            right: 0,
            bottom: 0,
            child: Container(height: 0.5, color: AppColors.hairline),
          ),
        ],
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ExploreScreen
// ═════════════════════════════════════════════════════════════════════════════

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({
    super.key,
    this.onOpenTogether,
    this.onOpenBlend,
    this.onOpenProfile,
    this.onOpenCategory,
  });

  final VoidCallback? onOpenTogether;
  final VoidCallback? onOpenBlend;
  final VoidCallback? onOpenProfile;
  final ValueChanged<String>? onOpenCategory;

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final ExploreDataService _dataService = ExploreDataService.instance;
  late ExploreCountry _country;

  ExplorePageData? _pageData;
  bool _isLoading = true;
  int _refresh = 0;

  final ScrollController _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _country = _dataService.currentCountry;
    // Single load: initCountry resolves the saved/detected region first.
    _dataService.initCountry().then((_) {
      if (!mounted) return;
      setState(() => _country = _dataService.currentCountry);
      _loadData();
    });
    CatalogDataSource.tracksNotifier.addListener(_onCatalogUpdated);
    CountryService.instance.countryNotifier.addListener(_onPrefsChanged);
    UserPreferencesService.instance.prefsNotifier.addListener(_onPrefsChanged);
    ListeningHistoryService.instance.historyNotifier.addListener(_onPrefsChanged);
  }

  void _onPrefsChanged() {
    if (!mounted) return;
    _dataService.clearCache();
    final c = _dataService.currentCountry;
    if (c.code != _country.code) {
      setState(() => _country = c);
    }
    _loadData(force: true);
  }

  void _onCatalogUpdated() {
    if (mounted &&
        (_pageData == null || _pageData!.weeklyTopSongs.isEmpty) &&
        !_isLoading) {
      _loadData();
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    CatalogDataSource.tracksNotifier.removeListener(_onCatalogUpdated);
    CountryService.instance.countryNotifier.removeListener(_onPrefsChanged);
    UserPreferencesService.instance.prefsNotifier.removeListener(_onPrefsChanged);
    ListeningHistoryService.instance.historyNotifier.removeListener(_onPrefsChanged);
    super.dispose();
  }

  Future<void> _loadData({bool force = false}) async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final data = await _dataService.getExploreDataForCountry(
        _country,
        forceRefresh: force,
      );
      if (mounted) {
        setState(() {
          _pageData = data;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── Playback / navigation ──────────────────────────────────────────────────

  void _play(List<Track> list, int index, {String title = 'Weekly Top'}) {
    if (list.isEmpty) return;
    final startIdx = index.clamp(0, list.length - 1);
    final ctx = PlaybackContext(
      type: PlaybackContextType.homeSection,
      id: 'explore_trending_${_country.code}',
      tracks: list,
      startTrack: list[startIdx],
      title: title,
    );
    context.read<PlayerState>().setQueue(
      list,
      startIndex: startIdx,
      context: ctx,
    );
  }

  void _shuffle(List<Track> list) {
    if (list.isEmpty) return;
    HapticFeedback.selectionClick();
    final ctx = PlaybackContext(
      type: PlaybackContextType.homeSection,
      id: 'explore_trending_${_country.code}',
      tracks: list,
      startTrack: list.first,
      title: 'Weekly Top • ${_country.name}',
    );
    context.read<PlayerState>().setQueue(
      list,
      startIndex: 0,
      shuffle: true,
      context: ctx,
    );
  }

  void _openCategory(
    String query,
    String title, {
    List<Color>? colors,
    String? heroLabel,
  }) {
    HapticFeedback.lightImpact();
    if (widget.onOpenCategory != null) {
      widget.onOpenCategory!(query);
      return;
    }
    Navigator.push(
      context,
      ZenPageRoute(
        builder: (_) => CategoryScreen(
          title: title,
          query: query,
          heroLabel: heroLabel,
          colors: colors,
        ),
      ),
    );
  }

  void _openAlbum(
    String title,
    String artist,
    String cover, {
    String? browseId,
    List<Track>? initialTracks,
  }) {
    HapticFeedback.lightImpact();
    Navigator.push(
      context,
      ZenPageRoute(
        builder: (_) => AlbumScreen(
          albumTitle: title,
          artistName: artist,
          coverUrl: cover,
          browseId: browseId,
          initialTracks: initialTracks,
        ),
      ),
    );
  }

  void _openArtist(ExploreArtistItem a) {
    HapticFeedback.lightImpact();
    Navigator.push(
      context,
      ZenPageRoute(
        builder: (_) => ArtistScreen(
          artistName: a.name,
          imageUrl: a.photo,
          browseId: a.browseId,
        ),
      ),
    );
  }

  void _showTrackMenu(Track track, {BuildContext? ctx}) {
    HapticFeedback.mediumImpact();
    final c = ctx ?? context;
    final player = context.read<PlayerState>();
    final artists = track.resolvedArtists;
    ZenDropdown.showTrackMenu(
      context: c,
      track: track,
      trackTitle: track.title,
      artistName: track.artist,
      albumName: track.album,
      coverUrl: track.coverUrl,
      onPlayNext: () => player.playNext(track),
      onPlayLater: () => player.playLast(track),
      onGoToArtist: () {
        if (artists.length > 1) {
          showArtistPopup(c, artists: artists);
        } else if (artists.isNotEmpty) {
          Navigator.push(
            c,
            ZenPageRoute(
              builder: (_) => ArtistScreen(
                artistName: artists.first.name,
                browseId: artists.first.id,
              ),
            ),
          );
        }
      },
      onGoToAlbum: track.album.isNotEmpty
          ? () => _openAlbum(
              track.album,
              track.artist,
              track.coverUrl,
              browseId: track.albumBrowseId,
            )
          : null,
    );
  }

  bool _isActive(Track t, String? activeId) {
    if (activeId == null || activeId.isEmpty) return false;
    return activeId == t.id ||
        activeId == 'yt-${t.id}' ||
        t.id == 'yt-$activeId';
  }

  List<_ListEntry> _trackEntries(List<Track> list, String title) => [
    for (var i = 0; i < list.length; i++)
      _ListEntry(
        title: MediaNormalizer.cleanCompactTitle(list[i].title),
        subtitle: 'Song • ${MediaNormalizer.formatArtists(list[i].artist)}',
        cover: list[i].coverUrl,
        track: list[i],
        onTap: () => _play(list, i, title: title),
      ),
  ];

  void _openSection({
    required String title,
    String? overline,
    required List<_ListEntry> entries,
  }) {
    if (entries.isEmpty) return;
    HapticFeedback.selectionClick();
    final player = context.read<PlayerState>();
    showGeneralDialog(
      context: context,
      useRootNavigator: true,
      barrierDismissible: true,
      barrierLabel: 'Close',
      barrierColor: Colors.black.withValues(alpha: 0.55),
      transitionDuration: const Duration(milliseconds: 420),
      pageBuilder: (ctx, _, _) => _SectionSheet(
        title: title,
        overline: overline,
        entries: entries,
        player: player,
        onMenu: (c, t) => _showTrackMenu(t, ctx: c),
      ),
      transitionBuilder: (ctx, anim, _, child) => SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, 1), end: Offset.zero)
            .animate(
              CurvedAnimation(
                parent: anim,
                curve: Curves.easeOutCubic,
                reverseCurve: Curves.easeInCubic,
              ),
            ),
        child: child,
      ),
    );
  }

  Widget _sec(String key, Widget child) => SliverToBoxAdapter(
    child: _Reveal(key: ValueKey('$_refresh-$key'), child: child),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Build
  // ═══════════════════════════════════════════════════════════════════════════

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final topInset = MediaQuery.paddingOf(context).top;
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    final w = MediaQuery.sizeOf(context).width;

    // Rebuild only when the track / play state changes (not every position tick).
    final activeId = context.select<PlayerState, String?>(
      (p) => p.currentTrack?.id,
    );
    final playing = context.select<PlayerState, bool>((p) => p.isPlaying);
    bool isActive(Track t) => _isActive(t, activeId);

    final data = _pageData;
    final List<Widget> slivers = [
      SliverToBoxAdapter(child: SizedBox(height: topInset + 56)),
      CupertinoSliverRefreshControl(
        onRefresh: () async {
          await _loadData(force: true);
          if (mounted) setState(() => _refresh++);
        },
        builder: (ctx, mode, pulled, trigger, extent) {
          final p = (pulled / trigger).clamp(0.0, 1.0).toDouble();
          final spinning =
              mode == RefreshIndicatorMode.refresh ||
              mode == RefreshIndicatorMode.done;
          return Center(
            child: Opacity(
              opacity: p,
              child: spinning
                  ? const CupertinoActivityIndicator(
                      color: Colors.white70,
                      radius: 12,
                    )
                  : CupertinoActivityIndicator.partiallyRevealed(
                      color: Colors.white70,
                      radius: 12,
                      progress: p,
                    ),
            ),
          );
        },
      ),
    ];

    if (data == null && _isLoading) {
      slivers.add(const SliverToBoxAdapter(child: _ExploreSkeleton()));
    } else if (data == null || data.weeklyTopSongs.isEmpty) {
      slivers.add(SliverToBoxAdapter(child: _buildEmpty()));
    } else {
      slivers.addAll(_buildSections(data, w, isActive, playing));
    }
    slivers.add(SliverToBoxAdapter(child: SizedBox(height: 180 + bottomInset)));

    return Scaffold(
      backgroundColor: Zen.bg,
      body: Stack(
        children: [
          CustomScrollView(
            controller: _scroll,
            key: const PageStorageKey<String>('explore_scroll_view'),
            physics: const BouncingScrollPhysics(
              parent: AlwaysScrollableScrollPhysics(),
            ),
            // ignore: deprecated_member_use
            cacheExtent: 900,
            slivers: slivers,
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandHeader(
              title: 'Explore',
              subtitle: 'Weekly Top • ${_country.name}',
              showBack: false,
              isDockPage: true,
              scrollController: _scroll,
              showProfile: true,
              onProfileTap: widget.onOpenProfile,
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildSections(
    ExplorePageData data,
    double w,
    bool Function(Track) isActive,
    bool playing,
  ) {
    final country = _country.name;

    // Geometry
    final artistExt = (w - 20) / 3.3;
    final artistSize = artistExt - 14;
    final newExt = w * 0.46;
    final newSize = newExt - 14;
    final wideExt = w * 0.76;
    final wideSize = wideExt - 14;
    final albumExt = (w - 20) / 2.7;
    final albumSize = albumExt - 14;

    final top = data.weeklyTopSongs.take(20).toList();
    final heroTracks = data.featured.isNotEmpty
        ? data.featured.take(10).toList()
        : top.take(8).toList();

    // Albums from real data
    final albumMap = <String, Track>{};
    for (final t in [...data.featured, ...top]) {
      final alb = MediaNormalizer.cleanTitle(t.album);
      if (alb.isNotEmpty &&
          alb.toLowerCase() != 'single' &&
          !MediaNormalizer.isMetadataNoise(alb)) {
        albumMap.putIfAbsent(alb, () => t);
      }
    }
    final albums = albumMap.values.take(10).toList();

    // Mood & genre tiles
    final prefs = UserPreferencesService.instance.currentPrefs;
    final genres = _dataService.getSortedGenres(
      preferredGenres: prefs.genres,
      preferredLanguages: prefs.languages,
    );
    final moods = _dataService.moods;
    final genreTiles = <_Tile>[
      for (final g in genres.take(6))
        (
          title: g.title,
          query: g.searchQuery,
          icon: g.icon,
          colors: List<Color>.from(g.gradient),
        ),
    ];
    final moodTiles = <_Tile>[
      for (final m in moods.take(6))
        (
          title: m.title,
          query: m.searchQuery,
          icon: m.icon,
          colors: List<Color>.from(m.gradient),
        ),
    ];
    final pillTiles = <_Tile>[...moodTiles.take(5), ...genreTiles.take(5)];
    final browseTiles = <_Tile>[...genreTiles, ...moodTiles];

    return [
      // 1. HERO - editorial top picks
      SliverToBoxAdapter(
        child: _Hero(
          tracks: heroTracks,
          countryName: country,
          isActive: isActive,
          playing: playing,
          onPlay: (i) => _play(heroTracks, i, title: 'Featured'),
        ),
      ),

      // 2. Category chips
      if (pillTiles.isNotEmpty)
        SliverToBoxAdapter(
          child: _Pills(
            tiles: pillTiles,
            onTap: (t) => _openCategory(t.query, t.title, colors: t.colors),
          ),
        ),

      // 3. Weekly Top Charts
      _sec(
        'charts',
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SecHeader(
              title: 'Weekly Top Charts',
              overline: 'Top ${top.length} in $country',
              onMore: () => _openSection(
                title: 'Weekly Top Charts',
                overline: 'Top ${top.length} in $country',
                entries: _trackEntries(top, 'Weekly Top • $country'),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Row(
                children: [
                  Expanded(
                    child: _ActionBtn(
                      icon: CupertinoIcons.play_fill,
                      label: 'Play',
                      onTap: () =>
                          _play(top, 0, title: 'Weekly Top • $country'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _ActionBtn(
                      icon: CupertinoIcons.shuffle,
                      label: 'Shuffle',
                      onTap: () => _shuffle(top),
                    ),
                  ),
                ],
              ),
            ),
            _PagedRows(
              tracks: top,
              isActive: isActive,
              playing: playing,
              onPlay: (i) => _play(top, i, title: 'Weekly Top • $country'),
              onMore: _showTrackMenu,
            ),
          ],
        ),
      ),

      // 4. Famous artists
      if (data.topArtists.isNotEmpty)
        _sec(
          'artists',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _Divider(),
              _SecHeader(
                title: 'Famous Artists of the Week',
                overline: 'Trending in $country',
                onMore: () => _openSection(
                  title: 'Famous Artists of the Week',
                  overline: 'Trending in $country',
                  entries: [
                    for (final a in data.topArtists)
                      _ListEntry(
                        title: a.name,
                        subtitle: a.subs,
                        cover: a.photo,
                        circular: true,
                        closeOnTap: true,
                        onTap: () => _openArtist(a),
                      ),
                  ],
                ),
              ),
              _Shelf(
                height: artistSize + 84,
                itemExtent: artistExt,
                count: data.topArtists.length,
                builder: (c, i) {
                  final a = data.topArtists[i];
                  return _ArtistCard(
                    name: a.name,
                    subs: a.subs,
                    photo: a.photo,
                    store: LibraryStore.instance,
                    onTap: () => _openArtist(a),
                  );
                },
              ),
            ],
          ),
        ),

      // 5. New releases
      if (data.newReleases.isNotEmpty)
        _sec(
          'new',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _Divider(),
              _SecHeader(
                title: 'New Releases',
                overline: 'Fresh albums & singles in $country',
                onMore: () => _openSection(
                  title: 'New Releases',
                  overline: 'Fresh albums & singles in $country',
                  entries: [
                    for (final r in data.newReleases)
                      _ListEntry(
                        title: MediaNormalizer.cleanCompactTitle(r.title),
                        subtitle: '${r.type} • ${r.artist}',
                        cover: r.coverUrl,
                        closeOnTap: true,
                        onTap: () => _openAlbum(
                          r.title,
                          r.artist,
                          r.coverUrl,
                          browseId: r.browseId,
                          initialTracks: r.tracks,
                        ),
                      ),
                  ],
                ),
              ),
              _Shelf(
                height: newSize + 76,
                itemExtent: newExt,
                count: data.newReleases.length,
                builder: (c, i) {
                  final r = data.newReleases[i];
                  return _CoverCard(
                    url: r.coverUrl,
                    eyebrow: r.type,
                    title: MediaNormalizer.cleanCompactTitle(r.title),
                    subtitle: r.artist,
                    cacheWidth: 640,
                    onTap: () => _openAlbum(
                      r.title,
                      r.artist,
                      r.coverUrl,
                      browseId: r.browseId,
                      initialTracks: r.tracks,
                    ),
                  );
                },
              ),
            ],
          ),
        ),

      // 6. Essential playlists
      if (data.playlists.isNotEmpty)
        _sec(
          'playlists',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _Divider(),
              _SecHeader(
                title: 'Essential Playlists',
                overline: 'Curated charts for $country',
                onMore: () => _openSection(
                  title: 'Essential Playlists',
                  overline: 'Curated charts for $country',
                  entries: [
                    for (final p in data.playlists)
                      _ListEntry(
                        title: p.title,
                        subtitle: p.description,
                        cover: p.coverUrl,
                        closeOnTap: true,
                        onTap: () => _openCategory(
                          p.searchQuery,
                          p.title,
                          heroLabel: 'Essentials',
                        ),
                      ),
                  ],
                ),
              ),
              _Shelf(
                height: wideSize * 0.625 + 62,
                itemExtent: wideExt,
                count: data.playlists.length,
                builder: (c, i) {
                  final p = data.playlists[i];
                  return _WideCard(
                    url: p.coverUrl,
                    title: p.title,
                    subtitle: p.description,
                    onTap: () => _openCategory(
                      p.searchQuery,
                      p.title,
                      heroLabel: 'Essentials',
                    ),
                  );
                },
              ),
            ],
          ),
        ),

      // 7. Trending albums
      if (albums.isNotEmpty)
        _sec(
          'albums',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _Divider(),
              _SecHeader(
                title: 'Trending Albums',
                overline: 'From this week\'s charts',
                onMore: () => _openSection(
                  title: 'Trending Albums',
                  entries: [
                    for (final t in albums)
                      _ListEntry(
                        title: MediaNormalizer.cleanTitle(t.album),
                        subtitle:
                            'Album • ${MediaNormalizer.formatArtists(t.artist)}',
                        cover: t.coverUrl,
                        closeOnTap: true,
                        onTap: () => _openAlbum(
                          MediaNormalizer.cleanTitle(t.album),
                          MediaNormalizer.formatArtists(t.artist),
                          t.coverUrl,
                          browseId: t.albumBrowseId,
                        ),
                      ),
                  ],
                ),
              ),
              _Shelf(
                height: albumSize + 56,
                itemExtent: albumExt,
                count: albums.length,
                builder: (c, i) {
                  final t = albums[i];
                  return _CoverCard(
                    url: t.coverUrl,
                    title: MediaNormalizer.cleanTitle(t.album),
                    subtitle: MediaNormalizer.formatArtists(t.artist),
                    radius: 6,
                    cacheWidth: 420,
                    onTap: () => _openAlbum(
                      MediaNormalizer.cleanTitle(t.album),
                      MediaNormalizer.formatArtists(t.artist),
                      t.coverUrl,
                      browseId: t.albumBrowseId,
                    ),
                  );
                },
              ),
            ],
          ),
        ),

      // 8. Browse by mood & genre (static grid)
      if (browseTiles.isNotEmpty)
        _sec(
          'browse',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _Divider(),
              const _SecHeader(
                title: 'Browse by Mood & Genre',
                overline: 'Explore sounds that fit your day',
              ),
              _BrowseGrid(
                tiles: browseTiles,
                onTap: (t) => _openCategory(t.query, t.title, colors: t.colors),
              ),
            ],
          ),
        ),
    ];
  }

  Widget _buildEmpty() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 120, 32, 0),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Couldn\'t load music for ${_country.name}',
              style: _display(size: 19),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Check your connection and try again.',
              style: _body(size: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 22),
            _Press(
              onTap: () => _loadData(force: true),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 11,
                ),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(22),
                ),
                child: Text(
                  'Try Again',
                  style: _body(
                    size: 14,
                    weight: FontWeight.w700,
                    color: Colors.black,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Loading skeleton
// ═════════════════════════════════════════════════════════════════════════════

class _ExploreSkeleton extends StatefulWidget {
  const _ExploreSkeleton();

  @override
  State<_ExploreSkeleton> createState() => _ExploreSkeletonState();
}

class _ExploreSkeletonState extends State<_ExploreSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Widget _bone(double w, double h, {double r = 8}) => Container(
    width: w,
    height: h,
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(r),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    return FadeTransition(
      opacity: Tween(
        begin: 0.45,
        end: 1.0,
      ).animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 10),
            _bone(90, 11, r: 4),
            const SizedBox(height: 8),
            _bone(200, 22, r: 6),
            const SizedBox(height: 6),
            _bone(120, 14, r: 5),
            const SizedBox(height: 12),
            _bone(w - 40, (w - 40) * 0.8, r: 10),
            const SizedBox(height: 34),
            _bone(190, 22, r: 6),
            const SizedBox(height: 14),
            for (var i = 0; i < 4; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  children: [
                    _bone(52, 52, r: 6),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _bone(180, 15, r: 5),
                        const SizedBox(height: 7),
                        _bone(110, 13, r: 5),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
