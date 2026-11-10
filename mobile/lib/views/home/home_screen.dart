import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart'
    show CupertinoActivityIndicator, CupertinoPageRoute, CupertinoSliverRefreshControl, RefreshIndicatorMode;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/dynamic_island_header.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/player_state.dart';
import '../details/artist_screen.dart';
import '../details/album_screen.dart';
import '../details/artist_popup.dart';
import '../../models/artist_ref.dart';
import '../../design_system/widgets/interactive_artists_text.dart';
import '../../services/country_service.dart';
import '../../services/listening_history_service.dart';
import '../../services/innertube_service.dart';
import '../../services/update_service.dart';
import '../../utils/media_normalizer.dart';

/* ------------------------------------------------------------------ */
/*  Physics primitives                                                  */
/* ------------------------------------------------------------------ */
const _kPressSpring = SpringDescription(mass: 1, stiffness: 430, damping: 21);
const _kRevealSpring = SpringDescription(mass: 1, stiffness: 170, damping: 22);

/// Horizontal shelf physics: flings settle on a card with a real spring.
class SnapSpringPhysics extends ScrollPhysics {
  const SnapSpringPhysics({super.parent, required this.itemExtent});
  final double itemExtent;

  @override
  SnapSpringPhysics applyTo(ScrollPhysics? ancestor) =>
      SnapSpringPhysics(parent: buildParent(ancestor), itemExtent: itemExtent);

  @override
  SpringDescription get spring =>
      SpringDescription.withDampingRatio(mass: 0.5, stiffness: 120, ratio: 1.05);

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
    return (t * itemExtent).clamp(m.minScrollExtent, m.maxScrollExtent).toDouble();
  }

  @override
  Simulation? createBallisticSimulation(ScrollMetrics position, double velocity) {
    if ((velocity <= 0 && position.pixels <= position.minScrollExtent) ||
        (velocity >= 0 && position.pixels >= position.maxScrollExtent)) {
      return super.createBallisticSimulation(position, velocity);
    }
    final target = _target(position, velocity);
    if ((target - position.pixels).abs() < 0.5) return null;
    return ScrollSpringSimulation(spring, position.pixels, target, velocity,
        tolerance: toleranceFor(position));
  }

  @override
  bool get allowImplicitScrolling => false;
}

/// Press feedback with a real spring (squash on touch-down, bounce back on release).
class SpringPress extends StatefulWidget {
  const SpringPress({super.key, required this.child, this.onTap, this.scale = 0.96});
  final Widget child;
  final VoidCallback? onTap;
  final double scale;

  @override
  State<SpringPress> createState() => _SpringPressState();
}

class _SpringPressState extends State<SpringPress> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 1);

  void _to(double v) => _c.animateWith(SpringSimulation(_kPressSpring, _c.value, v, 0));

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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

/// Spring entrance (fade + rise). Slivers build lazily, so each section
/// animates in the moment it scrolls into view.
class Reveal extends StatefulWidget {
  const Reveal({super.key, required this.child, this.delay = Duration.zero});
  final Widget child;
  final Duration delay;

  @override
  State<Reveal> createState() => _RevealState();
}

class _RevealState extends State<Reveal> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 0);
  Timer? _t;

  @override
  void initState() {
    super.initState();
    void go() => _c.animateWith(SpringSimulation(_kRevealSpring, 0, 1, 0));
    if (widget.delay == Duration.zero) {
      go();
    } else {
      _t = Timer(widget.delay, () {
        if (mounted) go();
      });
    }
  }

  @override
  void dispose() {
    _t?.cancel();
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
          child: Transform.translate(offset: Offset(0, (1 - v) * 28), child: child),
        );
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Small shared widgets                                                */
/* ------------------------------------------------------------------ */
class _Img extends StatelessWidget {
  const _Img(this.url, {this.radius = 10, this.circular = false});
  final String url;
  final double radius;
  final bool circular;

  @override
  Widget build(BuildContext context) {
    final img = CachedNetworkImage(
      imageUrl: MediaNormalizer.upgradeArtworkUrl(url),
      fit: BoxFit.cover,
      fadeInDuration: const Duration(milliseconds: 220),
      placeholder: (context, url) => Container(color: AppColors.surface2),
      errorWidget: (context, url, error) => Container(
        color: AppColors.surface2,
        child: const Icon(Icons.music_note_rounded, color: AppColors.textTertiary),
      ),
    );
    return circular ? ClipOval(child: img) : ClipRRect(borderRadius: BorderRadius.circular(radius), child: img);
  }
}

class _EqBars extends StatefulWidget {
  const _EqBars({required this.playing, this.height = 16});
  final bool playing;
  final double height;

  @override
  State<_EqBars> createState() => _EqBarsState();
}

class _EqBarsState extends State<_EqBars> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

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
              ? 0.3 + 0.7 * (0.5 + 0.5 * math.sin(_c.value * 2 * math.pi * (1 + i * 0.35) + i * 1.3))
              : 0.28;
          return Container(
            width: 3,
            height: widget.height * v,
            margin: const EdgeInsets.only(right: 2),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(1.5)),
          );
        }),
      ),
    );
  }
}

/// Section title with Apple's trailing chevron. Optional small line above.
class _SecHeader extends StatelessWidget {
  const _SecHeader({required this.title, this.overline, this.onMore});
  final String title;
  final String? overline;
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 30, 20, 12),
      child: SpringPress(
        scale: 0.985,
        onTap: onMore,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (overline != null)
                    Text(
                      overline!,
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                    ),
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.5,
                          ),
                        ),
                      ),
                      if (onMore != null) ...[
                        const SizedBox(width: 2),
                        const Icon(Icons.chevron_right_rounded, color: AppColors.textTertiary, size: 24),
                      ],
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

class _Shelf extends StatelessWidget {
  const _Shelf({required this.height, required this.itemExtent, required this.count, required this.builder});
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
        physics: SnapSpringPhysics(parent: const BouncingScrollPhysics(), itemExtent: itemExtent),
        itemExtent: itemExtent,
        itemCount: count,
        itemBuilder: (c, i) => Padding(padding: const EdgeInsets.only(right: 14), child: builder(c, i)),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Cards                                                               */
/* ------------------------------------------------------------------ */
class _CoverCard extends StatelessWidget {
  const _CoverCard({
    required this.url,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.artists,
    this.playing = false,
    this.current = false,
    this.circular = false,
    this.radius = 10,
  });
  final String url, title, subtitle;
  final List<ArtistRef>? artists;
  final VoidCallback onTap;
  final bool playing, current, circular;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: circular ? CrossAxisAlignment.center : CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: circular ? BoxShape.circle : BoxShape.rectangle,
                borderRadius: circular ? null : BorderRadius.circular(radius),
                boxShadow: [
                  BoxShadow(color: Colors.black.withValues(alpha: 0.28), blurRadius: 10, offset: const Offset(0, 4)),
                ],
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _Img(url, circular: circular, radius: radius),
                  if (current)
                    Positioned(
                      left: 8,
                      bottom: 8,
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: _EqBars(playing: playing, height: 12),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            MediaNormalizer.cleanCompactTitle(title),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: circular ? TextAlign.center : TextAlign.start,
            style: TextStyle(
              color: current ? AppColors.accent : Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.15,
            ),
          ),
          const SizedBox(height: 2),
          if (artists != null && artists!.isNotEmpty && !circular)
            InteractiveArtistsText(
              artists: artists!,
              maxLines: 1,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            )
          else
            Text(
              circular
                  ? (subtitle.trim().isNotEmpty && subtitle.trim().toLowerCase() != 'unknown artist'
                      ? subtitle.trim()
                      : 'Artist')
                  : MediaNormalizer.formatArtists(subtitle),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: circular ? TextAlign.center : TextAlign.start,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
        ],
      ),
    );
  }
}

class _SongRow extends StatelessWidget {
  const _SongRow({
    required this.track,
    required this.current,
    required this.playing,
    required this.onTap,
    this.rank,
    this.subtitleAlbum = false,
    this.divider = true,
  });
  final dynamic track;
  final bool current, playing, subtitleAlbum, divider;
  final int? rank;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      scale: 0.975,
      onTap: onTap,
      child: SizedBox(
        height: 64,
        child: Stack(
          children: [
            Row(
              children: [
                if (rank != null)
                  SizedBox(
                    width: 32,
                    child: Text(
                      '$rank',
                      style: TextStyle(
                        color: rank! <= 3 ? Colors.white : AppColors.textSecondary,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                SizedBox(
                  width: 48,
                  height: 48,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _Img(track.coverUrl, radius: 8),
                      if (current)
                        Container(
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.5),
                            borderRadius: BorderRadius.circular(8),
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
                        style: TextStyle(
                          color: current ? AppColors.accent : Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Flexible(
                            child: InteractiveArtistsText(
                              artists: track is Track ? track.resolvedArtists : (track.artist as String),
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                              maxLines: 1,
                            ),
                          ),
                          if (subtitleAlbum && track.album != null && track.album.toString().isNotEmpty && track.album != 'Single') ...[
                            const Text(' • ', style: TextStyle(color: AppColors.textTertiary, fontSize: 14)),
                            Flexible(
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () {
                                  HapticFeedback.lightImpact();
                                  Navigator.of(context).push(
                                    CupertinoPageRoute(
                                      builder: (_) => AlbumScreen(
                                        albumTitle: MediaNormalizer.cleanTitle(track.album),
                                        artistName: MediaNormalizer.formatArtists(track.artist),
                                        coverUrl: track.coverUrl,
                                      ),
                                    ),
                                  );
                                },
                                child: Text(
                                  MediaNormalizer.cleanCompactTitle(track.album),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(color: AppColors.textTertiary, fontSize: 14),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: IconButton(
                    icon: const Icon(Icons.more_horiz_rounded, color: AppColors.textTertiary, size: 22),
                    onPressed: () {
                      final p = context.read<PlayerState>();
                      final resolvedArtists = track is Track ? track.resolvedArtists : ArtistRef.splitFromName(track.artist as String?);
                      ZenDropdown.showTrackMenu(
                        context: context,
                        trackTitle: track.title,
                        artistName: track.artist,
                        albumName: track.album,
                        onPlayNext: () => p.playNext(track),
                        onPlayLater: () => p.playLast(track),
                        onGoToArtist: () {
                          if (resolvedArtists.length > 1) {
                            showArtistPopup(context, artists: resolvedArtists);
                          } else if (resolvedArtists.isNotEmpty) {
                            Navigator.push(
                              context,
                              CupertinoPageRoute(builder: (_) => ArtistScreen(artistName: resolvedArtists.first.name)),
                            );
                          }
                        },
                        onGoToAlbum: track.album.isNotEmpty && track.album != 'Single'
                            ? () => Navigator.push(
                                  context,
                                  CupertinoPageRoute(
                                    builder: (_) => AlbumScreen(
                                      albumTitle: MediaNormalizer.cleanTitle(track.album),
                                      artistName: MediaNormalizer.formatArtists(track.artist),
                                      coverUrl: track.coverUrl,
                                    ),
                                  ),
                                )
                            : null,
                      );
                    },
                  ),
                ),
              ],
            ),
            if (divider)
              Positioned(
                left: rank != null ? 92 : 60,
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

enum _RowStyle { plain, grouped, ranked }

/// Swipeable pages of song rows: plain list, rounded group, or numbered chart.
class _PagedRows extends StatefulWidget {
  const _PagedRows({
    required this.tracks,
    required this.rows,
    required this.player,
    required this.onPlay,
    this.style = _RowStyle.plain,
    this.album = false,
  });
  final List<dynamic> tracks;
  final int rows;
  final PlayerState player;
  final void Function(int index) onPlay;
  final _RowStyle style;
  final bool album;

  @override
  State<_PagedRows> createState() => _PagedRowsState();
}

class _PagedRowsState extends State<_PagedRows> {
  final _pc = PageController(viewportFraction: 0.9);

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rows = widget.rows;
    final tracks = widget.tracks;
    final pages = (tracks.length / rows).ceil();
    final grouped = widget.style == _RowStyle.grouped;

    return SizedBox(
      height: rows * 64.0,
      child: PageView.builder(
        controller: _pc,
        padEnds: false,
        physics: const BouncingScrollPhysics(),
        itemCount: pages,
        itemBuilder: (_, p) {
          final list = Column(
            children: List.generate(rows, (r) {
              final i = p * rows + r;
              if (i >= tracks.length) return const SizedBox(height: 64);
              final t = tracks[i];
              final cur = widget.player.currentTrack?.id == t.id;
              return _SongRow(
                track: t,
                current: cur,
                playing: cur && widget.player.isPlaying,
                rank: widget.style == _RowStyle.ranked ? i + 1 : null,
                subtitleAlbum: widget.album,
                divider: !(grouped && r == rows - 1),
                onTap: () => widget.onPlay(i),
              );
            }),
          );
          return Padding(
            padding: EdgeInsets.only(left: p == 0 ? 20 : 8, right: 8),
            child: grouped
                ? Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: AppColors.surface2,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: list,
                  )
                : list,
          );
        },
      ),
    );
  }
}


/* ------------------------------------------------------------------ */
/*  Mood chips (YT Music filter row, Apple pill style)                  */
/* ------------------------------------------------------------------ */
const _moods = ['Energize', 'Relax', 'Workout', 'Commute', 'Focus', 'Party', 'Romance', 'Sad', 'Sleep'];

class _Chips extends StatelessWidget {
  const _Chips({required this.selected, required this.onSelect});
  final int selected;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 8),
        itemCount: _moods.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (ctx, i) {
          final on = i == selected;
          return Builder(
            builder: (c) => SpringPress(
              scale: 0.92,
              onTap: () {
                HapticFeedback.selectionClick();
                onSelect(on ? -1 : i);
                Scrollable.ensureVisible(
                  c,
                  alignment: 0.5,
                  duration: const Duration(milliseconds: 500),
                  curve: Curves.easeOutCubic,
                );
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 380),
                curve: Curves.easeOutBack,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: on ? Colors.white : AppColors.surface2,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: AnimatedDefaultTextStyle(
                  duration: const Duration(milliseconds: 260),
                  style: TextStyle(
                    color: on ? Colors.black : Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                  child: Text(_moods[i]),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Genre tiles (flat colour, Apple "Browse" style)                     */
/* ------------------------------------------------------------------ */
class _Genre {
  const _Genre(this.name, this.icon, this.color);
  final String name;
  final IconData icon;
  final Color color;
}

const _genres = [
  _Genre('Pop', Icons.star_rounded, Color(0xFFFA2D48)),
  _Genre('Hip-Hop', Icons.mic_rounded, Color(0xFF5E5CE6)),
  _Genre('Chill', Icons.spa_rounded, Color(0xFF30B0C7)),
  _Genre('Romance', Icons.favorite_rounded, Color(0xFFFF375F)),
  _Genre('Workout', Icons.fitness_center_rounded, Color(0xFFFF9F0A)),
  _Genre('Party', Icons.celebration_rounded, Color(0xFFBF5AF2)),
  _Genre('Focus', Icons.center_focus_strong_rounded, Color(0xFF34C759)),
  _Genre('Sleep', Icons.nightlight_round, Color(0xFF4A5AA8)),
];

class _GenreTile extends StatelessWidget {
  const _GenreTile(this.g);
  final _Genre g;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: () => HapticFeedback.selectionClick(),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: ColoredBox(
          color: g.color,
          child: Stack(
            children: [
              Positioned(
                right: -8,
                bottom: -10,
                child: Transform.rotate(
                  angle: -0.3,
                  child: Icon(g.icon, size: 64, color: Colors.white.withValues(alpha: 0.25)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Text(
                  g.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    letterSpacing: -0.3,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Personalized Mix Cards (Apple Music / YT Music Mix Station style)  */
/* ------------------------------------------------------------------ */
class _MixCard extends StatelessWidget {
  const _MixCard({
    required this.title,
    required this.subtitle,
    required this.gradient,
    required this.icon,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final List<Color> gradient;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: onTap,
      child: Container(
        width: 164,
        height: 164,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: gradient,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.20),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: Colors.white, size: 20),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.8),
                    fontSize: 11.5,
                    fontWeight: FontWeight.w500,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Screen                                                              */
/* ------------------------------------------------------------------ */
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _mood = -1;
  int _refresh = 0;
  bool _loading = true;
  bool _loadingMood = false;

  // Personalized telemetry & shelves
  List<Track> _recentHistory = [];
  List<Track> _rediscover = [];
  List<Track> _quickPicks = [];
  List<Track> _timeOfDayTracks = [];
  String _timeOfDayGreeting = 'Good day';
  String _timeOfDayMoodLabel = 'Curated for you';

  String? _favoriteArtist;
  List<Track> _favoriteArtistTracks = [];
  String? _secondFavoriteArtist;
  List<Track> _secondFavoriteArtistTracks = [];

  List<Track> _chartTracks = [];
  List<({String name, String subs, String image})> _chartArtists = [];
  List<Track> _newReleases = [];
  List<Track> _moodTracks = [];

  @override
  void initState() {
    super.initState();
    CountryService.instance.countryNotifier.addListener(_onCountryChanged);
    ListeningHistoryService.instance.historyNotifier.addListener(_onHistoryChanged);
    _loadAllHomeData();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkAppUpdate();
    });
  }

  Future<void> _checkAppUpdate() async {
    await Future.delayed(const Duration(milliseconds: 1800));
    if (!mounted) return;
    final info = await UpdateService.instance.checkForUpdate(silent: true);
    if (info != null && info.hasUpdate && !UpdateService.instance.hasDismissedPrompt && mounted) {
      UpdateService.instance.showUpdateSheet(context, info);
    }
  }

  void _onCountryChanged() {
    _loadAllHomeData(refresh: true);
  }

  void _onHistoryChanged() {
    if (mounted) {
      setState(() {
        _recentHistory = ListeningHistoryService.instance.getRecentTracks();
        _rediscover = ListeningHistoryService.instance.getRediscoverTracks();
        final fav = ListeningHistoryService.instance.getFavoriteArtist();
        final secondFav = ListeningHistoryService.instance.getSecondFavoriteArtist();
        if (fav != _favoriteArtist) {
          _favoriteArtist = fav;
          if (fav != null) _loadFavoriteArtistTracks(fav);
        }
        if (secondFav != _secondFavoriteArtist) {
          _secondFavoriteArtist = secondFav;
          if (secondFav != null) _loadSecondFavoriteArtistTracks(secondFav);
        }
      });
    }
  }

  @override
  void dispose() {
    CountryService.instance.countryNotifier.removeListener(_onCountryChanged);
    ListeningHistoryService.instance.historyNotifier.removeListener(_onHistoryChanged);
    super.dispose();
  }

  Future<void> _loadAllHomeData({bool refresh = false}) async {
    if (!mounted) return;
    setState(() => _loading = true);

    try {
      final country = CountryService.instance.currentCountry;

      // 1. Load User Listening Telemetry
      _recentHistory = ListeningHistoryService.instance.getRecentTracks();
      _rediscover = ListeningHistoryService.instance.getRediscoverTracks();
      _favoriteArtist = ListeningHistoryService.instance.getFavoriteArtist();
      _secondFavoriteArtist = ListeningHistoryService.instance.getSecondFavoriteArtist();
      final userLang = ListeningHistoryService.instance.primaryLanguage;

      // 2. Time-of-Day Context & Greeting
      final timeCtx = ListeningHistoryService.getTimeOfDayContext(userLang);
      _timeOfDayGreeting = timeCtx.greeting;
      _timeOfDayMoodLabel = timeCtx.moodLabel;

      // 3. Time-of-day shelf query
      InnerTubeService.instance.search(timeCtx.defaultSearchTerm).then((tracks) {
        if (mounted && tracks.isNotEmpty) {
          setState(() => _timeOfDayTracks = tracks.take(12).toList());
        }
      }).catchError((_) {});

      // 4. Personalized Quick Picks based on user's top artist / last track
      if (_favoriteArtist != null && _favoriteArtist!.isNotEmpty) {
        InnerTubeService.instance.search('${_favoriteArtist!} radio').then((tracks) {
          if (mounted && tracks.isNotEmpty) {
            setState(() {
              _quickPicks = tracks.take(12).toList();
              _loading = false;
            });
          }
        }).catchError((_) {});
      } else if (_recentHistory.isNotEmpty) {
        InnerTubeService.instance.fetchRelated(_recentHistory.first).then((tracks) {
          if (mounted && tracks.isNotEmpty) {
            setState(() {
              _quickPicks = tracks.take(12).toList();
              _loading = false;
            });
          }
        }).catchError((_) {});
      } else {
        // Zero history: fetch real live home feed
        InnerTubeService.instance.getHomeFeed(countryCode: country.code).then((tracks) {
          if (mounted && tracks.isNotEmpty && _quickPicks.isEmpty) {
            setState(() {
              _quickPicks = tracks.take(12).toList();
              _loading = false;
            });
          }
        }).catchError((_) {});
      }

      // 5. #1 Favorite Artist Spotlight
      if (_favoriteArtist != null && _favoriteArtist!.isNotEmpty) {
        _loadFavoriteArtistTracks(_favoriteArtist!);
      }

      // 6. #2 Favorite Artist Spotlight
      if (_secondFavoriteArtist != null && _secondFavoriteArtist!.isNotEmpty) {
        _loadSecondFavoriteArtistTracks(_secondFavoriteArtist!);
      }

      // 7. New Releases (filtered by user's dominant language)
      if (userLang.isNotEmpty) {
        InnerTubeService.instance.search('latest $userLang songs').then((tracks) {
          if (mounted && tracks.isNotEmpty) {
            setState(() {
              _newReleases = tracks.take(9).toList();
              _loading = false;
            });
          }
        }).catchError((_) {});
      } else {
        InnerTubeService.instance.getNewReleases(countryCode: country.code).then((tracks) {
          if (mounted && tracks.isNotEmpty) {
            setState(() {
              _newReleases = tracks.take(9).toList();
              _loading = false;
            });
          }
        }).catchError((_) {});
      }

      // 8. Regional Charts & Chart Artists
      InnerTubeService.instance.getCharts(countryCode: country.code).then((data) {
        if (mounted) {
          setState(() {
            if (data.tracks.isNotEmpty) _chartTracks = data.tracks.take(12).toList();
            if (data.artists.isNotEmpty) _chartArtists = data.artists.take(10).toList();
            _loading = false;
          });
        }
      }).catchError((_) {});

      // Fallback guard: ensure loading spinner is dismissed after 3s
      Future.delayed(const Duration(milliseconds: 3000), () {
        if (mounted && _loading) setState(() => _loading = false);
      });
    } catch (e) {
      if (kDebugMode) debugPrint('[HomeScreen] load error: $e');
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadFavoriteArtistTracks(String artistName) async {
    try {
      final tracks = await InnerTubeService.instance.search('$artistName hits');
      if (mounted) {
        setState(() {
          _favoriteArtistTracks = tracks.take(8).toList();
        });
      }
    } catch (_) {}
  }

  Future<void> _loadSecondFavoriteArtistTracks(String artistName) async {
    try {
      final tracks = await InnerTubeService.instance.search('$artistName hits');
      if (mounted) {
        setState(() {
          _secondFavoriteArtistTracks = tracks.take(8).toList();
        });
      }
    } catch (_) {}
  }

  void _onSelectMood(int index) {
    if (_mood == index) {
      setState(() {
        _mood = -1;
        _moodTracks = [];
        _loadingMood = false;
      });
      return;
    }

    setState(() {
      _mood = index;
      _loadingMood = true;
    });

    final mood = _moods[index];
    final userLang = ListeningHistoryService.instance.primaryLanguage;
    final country = CountryService.instance.currentCountry;
    final langPrefix = userLang.isNotEmpty ? '$userLang ' : '${country.name} ';
    final query = '$langPrefix$mood hits';

    InnerTubeService.instance.search(query).then((tracks) {
      if (mounted && _mood == index) {
        setState(() {
          _moodTracks = tracks.take(12).toList();
          _loadingMood = false;
        });
      }
    }).catchError((_) {
      if (mounted && _mood == index) {
        setState(() => _loadingMood = false);
      }
    });
  }

  void _playMix(String mixType) {
    HapticFeedback.mediumImpact();
    final userLang = ListeningHistoryService.instance.primaryLanguage;
    final country = CountryService.instance.currentCountry;
    final langPrefix = userLang.isNotEmpty ? '$userLang ' : '${country.name} ';

    switch (mixType) {
      case 'supermix':
        final pool = <Track>{
          ..._favoriteArtistTracks,
          ..._secondFavoriteArtistTracks,
          ..._quickPicks,
          ..._recentHistory,
        }.toList();
        if (pool.isNotEmpty) {
          pool.shuffle();
          play(pool, 0);
        } else {
          InnerTubeService.instance.search('${langPrefix}top hits supermix').then((tracks) {
            if (tracks.isNotEmpty) play(tracks, 0);
          });
        }
        break;

      case 'discover':
        InnerTubeService.instance.search('${langPrefix}fresh discoveries indie tracks').then((tracks) {
          if (tracks.isNotEmpty) play(tracks, 0);
        });
        break;

      case 'chill':
        InnerTubeService.instance.search('${langPrefix}chill acoustic melodies').then((tracks) {
          if (tracks.isNotEmpty) play(tracks, 0);
        });
        break;

      case 'energy':
        InnerTubeService.instance.search('${langPrefix}workout high energy dance hits').then((tracks) {
          if (tracks.isNotEmpty) play(tracks, 0);
        });
        break;
    }
  }

  int get _seed => (_mood + 1) * 7 + _refresh * 13;

  Widget _sec(String key, Widget child) => SliverToBoxAdapter(
        child: Reveal(key: ValueKey('$_seed-$key'), child: child),
      );

  void _open(Widget screen) => Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  void play(List<Track> list, int i) {
    if (list.isEmpty) return;
    HapticFeedback.lightImpact();
    final startIdx = i.clamp(0, list.length - 1);
    final ctx = PlaybackContext(
      type: PlaybackContextType.homeSection,
      id: 'home',
      tracks: list,
      startTrack: list[startIdx],
    );
    context.read<PlayerState>().setQueue(list, startIndex: startIdx, context: ctx);
  }

  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final top = MediaQuery.paddingOf(context).top;
    final country = CountryService.instance.currentCountry;

    // Real dynamic datasets
    final listenAgain = _recentHistory.isNotEmpty
        ? _recentHistory
        : (_quickPicks.isNotEmpty ? _quickPicks.take(10).toList() : _chartTracks.take(10).toList());

    final quick = _quickPicks.isNotEmpty ? _quickPicks.take(12).toList() : _chartTracks.take(12).toList();
    final charts = _chartTracks.isNotEmpty ? _chartTracks.take(12).toList() : const <Track>[];
    final fresh = _newReleases.isNotEmpty ? _newReleases.take(9).toList() : const <Track>[];

    // Albums for you (extracted from real dynamic releases & quickpicks)
    final albumMap = <String, Track>{};
    for (final t in [..._newReleases, ..._quickPicks, ..._chartTracks, ..._recentHistory]) {
      final alb = MediaNormalizer.cleanTitle(t.album);
      if (alb.isNotEmpty && alb.toLowerCase() != 'single' && !MediaNormalizer.isMetadataNoise(alb)) {
        albumMap.putIfAbsent(alb, () => t);
      }
    }
    final albums = albumMap.values.take(10).toList();

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: _loading && _quickPicks.isEmpty && _chartTracks.isEmpty && _recentHistory.isEmpty
          ? const Center(child: CupertinoActivityIndicator(color: Colors.white70, radius: 14))
          : Stack(
              children: [
                CustomScrollView(
                  physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
                  slivers: [
                    SliverToBoxAdapter(child: SizedBox(height: top + 56)),
                    CupertinoSliverRefreshControl(
                      onRefresh: () async {
                        await _loadAllHomeData(refresh: true);
                        if (mounted) setState(() => _refresh++);
                      },
                      builder: (ctx, mode, pulled, trigger, extent) {
                        final p = (pulled / trigger).clamp(0.0, 1.0).toDouble();
                        final spinning = mode == RefreshIndicatorMode.refresh || mode == RefreshIndicatorMode.done;
                        return Center(
                          child: Opacity(
                            opacity: p,
                            child: spinning
                                ? const CupertinoActivityIndicator(color: Colors.white70, radius: 12)
                                : CupertinoActivityIndicator.partiallyRevealed(
                                    color: Colors.white70, radius: 12, progress: p),
                          ),
                        );
                      },
                    ),

                    // In-App Update Banner
                    SliverToBoxAdapter(
                      child: ValueListenableBuilder<UpdateInfo?>(
                        valueListenable: UpdateService.instance.availableUpdateNotifier,
                        builder: (context, update, _) {
                          if (update == null || !update.hasUpdate) return const SizedBox.shrink();
                          return Padding(
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                color: const Color(0xFF18181B),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: AppColors.crimson.withValues(alpha: 0.35)),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 34,
                                    height: 34,
                                    decoration: BoxDecoration(
                                      color: AppColors.crimson.withValues(alpha: 0.18),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: const Icon(Icons.system_update_rounded, color: AppColors.crimson, size: 18),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Zenify v${update.latestVersion} Available',
                                          style: const TextStyle(
                                            fontSize: 12.5,
                                            fontWeight: FontWeight.w700,
                                            color: Colors.white,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          'Tap to view release notes & update',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.white.withValues(alpha: 0.6),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  GestureDetector(
                                    onTap: () {
                                      HapticFeedback.lightImpact();
                                      UpdateService.instance.showUpdateSheet(context, update);
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                      decoration: BoxDecoration(
                                        color: AppColors.crimson,
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: const Text(
                                        'UPDATE',
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w900,
                                          color: Colors.white,
                                          letterSpacing: 0.8,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),

                    // Mood Chips (Interactive)
                    SliverToBoxAdapter(
                      child: _Chips(
                        selected: _mood,
                        onSelect: _onSelectMood,
                      ),
                    ),

                    // 1. Mood Spotlight Shelf (Active when a mood chip is tapped)
                    if (_mood != -1)
                      _sec('mood-spotlight', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: '${_moods[_mood]} Spotlight',
                            overline: 'Curated for this moment',
                            onMore: () {},
                          ),
                          if (_loadingMood)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 36),
                              child: Center(
                                child: CupertinoActivityIndicator(color: Colors.white70, radius: 12),
                              ),
                            )
                          else if (_moodTracks.isNotEmpty)
                            _PagedRows(
                              tracks: _moodTracks.take(12).toList(),
                              rows: 4,
                              player: player,
                              onPlay: (i) => play(_moodTracks, i),
                            ),
                        ],
                      )),

                    // 2. Personalized Time-of-Day Adaptive Section
                    if (_timeOfDayTracks.isNotEmpty && _mood == -1)
                      _sec('time-of-day', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: _timeOfDayMoodLabel,
                            overline: _timeOfDayGreeting,
                            onMore: () {},
                          ),
                          _PagedRows(
                            tracks: _timeOfDayTracks,
                            rows: 4,
                            player: player,
                            onPlay: (i) => play(_timeOfDayTracks, i),
                          ),
                        ],
                      )),

                    // 3. Personalized "Listen Again" / "Jump Back In"
                    if (listenAgain.isNotEmpty)
                      _sec('again', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: 'Listen again',
                            overline: _recentHistory.isNotEmpty ? 'Jump back in' : 'Trending for you',
                            onMore: () {},
                          ),
                          _Shelf(
                            height: 236,
                            itemExtent: 170,
                            count: listenAgain.length,
                            builder: (c, i) {
                              final t = listenAgain[i];
                              final cur = player.currentTrack?.id == t.id;
                              return _CoverCard(
                                url: t.coverUrl,
                                title: MediaNormalizer.cleanCompactTitle(t.title),
                                subtitle: t.artist,
                                artists: t.resolvedArtists,
                                current: cur,
                                playing: cur && player.isPlaying,
                                onTap: () => play(listenAgain, i),
                              );
                            },
                          ),
                        ],
                      )),

                    // 4. Personalized Quick Picks
                    if (quick.isNotEmpty)
                      _sec('quick', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: 'Quick picks',
                            overline: _favoriteArtist != null ? 'Tailored to your taste' : 'Start radio from a song',
                          ),
                          _PagedRows(
                            tracks: quick,
                            rows: 4,
                            player: player,
                            onPlay: (i) => play(quick, i),
                          ),
                        ],
                      )),

                    // 5. "Mixed For You" (Personalized AI Mix Stations)
                    _sec('mixes', Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _SecHeader(title: 'Mixed for you', overline: 'Personalized stations'),
                        _Shelf(
                          height: 176,
                          itemExtent: 170,
                          count: 4,
                          builder: (c, i) {
                            switch (i) {
                              case 0:
                                return _MixCard(
                                  title: 'My Supermix',
                                  subtitle: 'Your blended favorites',
                                  gradient: const [Color(0xFF9E2339), Color(0xFF4A0E17)],
                                  icon: Icons.all_inclusive_rounded,
                                  onTap: () => _playMix('supermix'),
                                );
                              case 1:
                                return _MixCard(
                                  title: 'Discover Mix',
                                  subtitle: 'Fresh weekly finds',
                                  gradient: const [Color(0xFF0F766E), Color(0xFF134E4A)],
                                  icon: Icons.explore_rounded,
                                  onTap: () => _playMix('discover'),
                                );
                              case 2:
                                return _MixCard(
                                  title: 'Chill Mix',
                                  subtitle: 'Mellow & unhurried',
                                  gradient: const [Color(0xFF1D4ED8), Color(0xFF1E3A8A)],
                                  icon: Icons.spa_rounded,
                                  onTap: () => _playMix('chill'),
                                );
                              default:
                                return _MixCard(
                                  title: 'Energy Mix',
                                  subtitle: 'High-tempo momentum',
                                  gradient: const [Color(0xFFD97706), Color(0xFF78350F)],
                                  icon: Icons.bolt_rounded,
                                  onTap: () => _playMix('energy'),
                                );
                            }
                          },
                        ),
                      ],
                    )),

                    // 6. Because you listen to [_favoriteArtist] (#1 Spotlight)
                    if (_favoriteArtist != null && _favoriteArtistTracks.isNotEmpty)
                      _sec('similar', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            overline: 'Because you listen to',
                            title: _favoriteArtist!,
                            onMore: () => _open(ArtistScreen(artistName: _favoriteArtist!)),
                          ),
                          _Shelf(
                            height: 236,
                            itemExtent: 170,
                            count: _favoriteArtistTracks.length,
                            builder: (c, i) {
                              final t = _favoriteArtistTracks[i];
                              return _CoverCard(
                                url: t.coverUrl,
                                title: MediaNormalizer.cleanCompactTitle(t.title),
                                subtitle: t.artist,
                                artists: t.resolvedArtists,
                                onTap: () => play(_favoriteArtistTracks, i),
                              );
                            },
                          ),
                        ],
                      )),

                    // 7. Because you listen to [_secondFavoriteArtist] (#2 Spotlight)
                    if (_secondFavoriteArtist != null && _secondFavoriteArtistTracks.isNotEmpty)
                      _sec('similar-second', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            overline: 'More by',
                            title: _secondFavoriteArtist!,
                            onMore: () => _open(ArtistScreen(artistName: _secondFavoriteArtist!)),
                          ),
                          _Shelf(
                            height: 236,
                            itemExtent: 170,
                            count: _secondFavoriteArtistTracks.length,
                            builder: (c, i) {
                              final t = _secondFavoriteArtistTracks[i];
                              return _CoverCard(
                                url: t.coverUrl,
                                title: MediaNormalizer.cleanCompactTitle(t.title),
                                subtitle: t.artist,
                                artists: t.resolvedArtists,
                                onTap: () => play(_secondFavoriteArtistTracks, i),
                              );
                            },
                          ),
                        ],
                      )),

                    // 8. Rediscover Your Favorites (Deep cuts from earlier user history)
                    if (_rediscover.isNotEmpty)
                      _sec('rediscover', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const _SecHeader(
                            overline: 'From your past listening',
                            title: 'Rediscover your favorites',
                          ),
                          _Shelf(
                            height: 236,
                            itemExtent: 170,
                            count: _rediscover.length,
                            builder: (c, i) {
                              final t = _rediscover[i];
                              return _CoverCard(
                                url: t.coverUrl,
                                title: MediaNormalizer.cleanCompactTitle(t.title),
                                subtitle: t.artist,
                                artists: t.resolvedArtists,
                                onTap: () => play(_rediscover, i),
                              );
                            },
                          ),
                        ],
                      )),

                    // 9. New Releases (Tailored to user's language)
                    if (fresh.isNotEmpty)
                      _sec('new', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: 'New releases',
                            overline: ListeningHistoryService.instance.primaryLanguage.isNotEmpty
                                ? 'Fresh drops in ${ListeningHistoryService.instance.primaryLanguage.toUpperCase()}'
                                : 'Just dropped',
                            onMore: () {},
                          ),
                          _PagedRows(
                            tracks: fresh,
                            rows: 3,
                            player: player,
                            album: true,
                            style: _RowStyle.grouped,
                            onPlay: (i) => play(fresh, i),
                          ),
                        ],
                      )),

                    // 10. Country-specific Trending & Charts (Ranked 1 to 12)
                    if (charts.isNotEmpty)
                      _sec('charts', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: 'Top Hits in ${country.name}',
                            overline: '${country.flag} Regional Charts',
                            onMore: () {},
                          ),
                          _PagedRows(
                            tracks: charts,
                            rows: 4,
                            player: player,
                            style: _RowStyle.ranked,
                            onPlay: (i) => play(charts, i),
                          ),
                        ],
                      )),

                    // 11. Top Artists for You (User's favorites + regional charts)
                    if (_chartArtists.isNotEmpty)
                      _sec('artists', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: 'Top Artists for You',
                            overline: 'Trending in ${country.name}',
                            onMore: () {},
                          ),
                          _Shelf(
                            height: 236,
                            itemExtent: 170,
                            count: _chartArtists.length,
                            builder: (c, i) {
                              final a = _chartArtists[i];
                              return _CoverCard(
                                url: a.image,
                                title: a.name,
                                subtitle: a.subs,
                                circular: true,
                                onTap: () => _open(ArtistScreen(artistName: a.name, imageUrl: a.image)),
                              );
                            },
                          ),
                        ],
                      )),

                    // 12. Albums For You
                    if (albums.isNotEmpty)
                      _sec('albums', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(title: 'Albums for you', onMore: () {}),
                          _Shelf(
                            height: 236,
                            itemExtent: 170,
                            count: albums.length,
                            builder: (c, i) {
                              final t = albums[i];
                              return _CoverCard(
                                url: t.coverUrl,
                                title: t.album,
                                subtitle: t.artist,
                                artists: t.resolvedArtists,
                                radius: 8,
                                onTap: () => _open(AlbumScreen(
                                  albumTitle: MediaNormalizer.cleanTitle(t.album),
                                  artistName: MediaNormalizer.formatArtists(t.artist),
                                  coverUrl: t.coverUrl,
                                )),
                              );
                            },
                          ),
                        ],
                      )),

                    // 13. Moods & Genres Flat Color Grid
                    SliverToBoxAdapter(
                      child: Reveal(
                        key: ValueKey('$_seed-genres-h'),
                        child: const _SecHeader(title: 'Moods & genres'),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      sliver: SliverGrid(
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 12,
                          crossAxisSpacing: 12,
                          childAspectRatio: 2.2,
                        ),
                        delegate: SliverChildBuilderDelegate(
                          (c, i) => Reveal(
                            key: ValueKey('$_seed-g$i'),
                            delay: Duration(milliseconds: 40 * (i % 2) + 60 * (i ~/ 2)),
                            child: SpringPress(
                              onTap: () {
                                HapticFeedback.selectionClick();
                                final genre = _genres[i].name;
                                final userLang = ListeningHistoryService.instance.primaryLanguage;
                                final q = userLang.isNotEmpty ? '$userLang $genre hits' : '$genre hits';
                                InnerTubeService.instance.search(q).then((tracks) {
                                  if (tracks.isNotEmpty) play(tracks, 0);
                                });
                              },
                              child: _GenreTile(_genres[i]),
                            ),
                          ),
                          childCount: _genres.length,
                        ),
                      ),
                    ),

                    // Clearance for floating mini player + persistent dock
                    SliverToBoxAdapter(
                      child: SizedBox(height: 180 + MediaQuery.paddingOf(context).bottom),
                    ),
                  ],
                ),
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: DynamicIslandHeader(
                    title: 'Home',
                    showBack: false,
                    isDockPage: true,
                    showProfile: true,
                    topPadding: top + 4,
                  ),
                ),
              ],
            ),
    );
  }
}
