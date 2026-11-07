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

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/monogram_avatar.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../models/track.dart';
import '../../services/auth_state.dart';
import '../../services/player_state.dart';
import '../details/artist_screen.dart';
import '../details/album_screen.dart';
import '../profile/profile_screen.dart';
import '../../services/country_service.dart';
import '../../services/listening_history_service.dart';
import '../../services/innertube_service.dart';

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
      imageUrl: url,
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
    this.onSubtitleTap,
    this.playing = false,
    this.current = false,
    this.circular = false,
    this.radius = 10,
  });
  final String url, title, subtitle;
  final VoidCallback onTap;
  final VoidCallback? onSubtitleTap;
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
            title,
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
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onSubtitleTap,
            child: Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: circular ? TextAlign.center : TextAlign.start,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
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
                        track.title,
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
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: () {
                                HapticFeedback.lightImpact();
                                Navigator.of(context).push(
                                  CupertinoPageRoute(builder: (_) => ArtistScreen(artistName: track.artist)),
                                );
                              },
                              child: Text(
                                track.artist,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                              ),
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
                                        albumTitle: track.album,
                                        artistName: track.artist,
                                        coverUrl: track.coverUrl,
                                      ),
                                    ),
                                  );
                                },
                                child: Text(
                                  track.album,
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
                      ZenDropdown.showTrackMenu(
                        context: context,
                        trackTitle: track.title,
                        artistName: track.artist,
                        albumName: track.album,
                        onPlayNext: () => p.playNext(track),
                        onPlayLater: () => p.playLast(track),
                        onGoToArtist: () => Navigator.push(
                          context,
                          CupertinoPageRoute(builder: (_) => ArtistScreen(artistName: track.artist)),
                        ),
                        onGoToAlbum: track.album.isNotEmpty && track.album != 'Single'
                            ? () => Navigator.push(
                                  context,
                                  CupertinoPageRoute(
                                    builder: (_) => AlbumScreen(
                                      albumTitle: track.album,
                                      artistName: track.artist,
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
/*  Header: large title that collapses, avatar only                     */
/* ------------------------------------------------------------------ */
class _NavDelegate extends SliverPersistentHeaderDelegate {
  _NavDelegate({required this.top, required this.title});
  final double top;
  final String title;
  static const double bar = 52, large = 46;

  @override
  double get maxExtent => top + bar + large;
  @override
  double get minExtent => top + bar;

  @override
  Widget build(BuildContext context, double shrink, bool overlaps) {
    final t = (shrink / large).clamp(0.0, 1.0).toDouble();
    return Container(
      color: AppColors.bg,
      child: Stack(
        children: [
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(height: 0.5, color: AppColors.hairline.withValues(alpha: t)),
          ),
          // collapsed title
          Positioned(
            top: top,
            left: 0,
            right: 0,
            height: bar,
            child: Center(
              child: Opacity(
                opacity: ((t - 0.6) / 0.4).clamp(0.0, 1.0).toDouble(),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Image.asset(
                      'assets/images/z_logo.png',
                      width: 20,
                      height: 20,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const SizedBox.shrink(),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      title,
                      style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
            ),
          ),
          // profile
          Positioned(
            top: top,
            right: 16,
            height: bar,
            child: Center(
              child: SpringPress(
                onTap: () {
                  HapticFeedback.lightImpact();
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen()));
                },
                child: SizedBox(
                  width: 34,
                  height: 34,
                  child: Consumer<AuthState>(
                    builder: (context, auth, _) {
                      final avatar = auth.user?.avatarUrl;
                      if (avatar != null && avatar.startsWith('http')) {
                        return ClipOval(
                          child: CachedNetworkImage(
                            imageUrl: avatar,
                            fit: BoxFit.cover,
                            placeholder: (_, _) => MonogramAvatar(name: auth.user?.name ?? 'Z', size: 34),
                            errorWidget: (_, _, _) => MonogramAvatar(name: auth.user?.name ?? 'Z', size: 34),
                          ),
                        );
                      }
                      return MonogramAvatar(
                        name: auth.user?.name ?? 'Zenify',
                        size: 34,
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
          // large title
          Positioned(
            left: 20,
            bottom: 6,
            child: Opacity(
              opacity: (1 - t * 1.6).clamp(0.0, 1.0).toDouble(),
              child: Transform.translate(
                offset: Offset(0, -shrink * 0.2),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Image.asset(
                      'assets/images/z_logo.png',
                      width: 34,
                      height: 34,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const SizedBox.shrink(),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 34,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -1,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _NavDelegate old) => old.top != top || old.title != title;
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

  List<Track> _quickPicks = [];
  List<Track> _chartTracks = [];
  List<({String name, String subs, String image})> _chartArtists = [];
  List<Track> _newReleases = [];
  List<Track> _recentHistory = [];
  String? _favoriteArtist;
  List<Track> _favoriteArtistTracks = [];

  @override
  void initState() {
    super.initState();
    CountryService.instance.countryNotifier.addListener(_onCountryChanged);
    ListeningHistoryService.instance.historyNotifier.addListener(_onHistoryChanged);
    _loadAllHomeData();
  }

  void _onCountryChanged() {
    _loadAllHomeData(refresh: true);
  }

  void _onHistoryChanged() {
    if (mounted) {
      setState(() {
        _recentHistory = ListeningHistoryService.instance.getRecentTracks();
        final fav = ListeningHistoryService.instance.getFavoriteArtist();
        if (fav != _favoriteArtist) {
          _favoriteArtist = fav;
          if (fav != null) _loadFavoriteArtistTracks(fav);
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

      _recentHistory = ListeningHistoryService.instance.getRecentTracks();
      _favoriteArtist = ListeningHistoryService.instance.getFavoriteArtist();

      // Progressive loading: don't block the screen with Future.wait!
      // 1. Home feed / Quick picks
      InnerTubeService.instance.getHomeFeed(countryCode: country.code).then((tracks) {
        if (mounted && tracks.isNotEmpty) {
          setState(() {
            _quickPicks = tracks;
            _loading = false;
          });
        }
      }).catchError((_) async {
        try {
          final ytSearchFallback = await InnerTubeService.instance.search('Top Songs').timeout(const Duration(seconds: 5));
          if (mounted && ytSearchFallback.isNotEmpty) {
            setState(() {
              _quickPicks = ytSearchFallback;
              _loading = false;
            });
            return;
          }
        } catch (_) {}
        if (mounted) {
          setState(() {
            _quickPicks = CatalogDataSource.allTracks;
            _loading = false;
          });
        }
      });

      // 2. Regional Charts
      InnerTubeService.instance.getCharts(countryCode: country.code).then((data) {
        if (mounted) {
          setState(() {
            if (data.tracks.isNotEmpty) _chartTracks = data.tracks;
            if (data.artists.isNotEmpty) _chartArtists = data.artists;
            _loading = false;
          });
        }
      }).catchError((_) {});

      // 3. New Releases
      InnerTubeService.instance.getNewReleases(countryCode: country.code).then((tracks) {
        if (mounted && tracks.isNotEmpty) {
          setState(() {
            _newReleases = tracks;
            _loading = false;
          });
        }
      }).catchError((_) {});

      // 4. Fallback guard: after 3s, ensure screen never hangs
      Future.delayed(const Duration(milliseconds: 3000), () async {
        if (mounted && _quickPicks.isEmpty) {
          try {
            final ytFallback = await InnerTubeService.instance.search('Trending Hits').timeout(const Duration(seconds: 4));
            if (mounted && ytFallback.isNotEmpty) {
              setState(() {
                _quickPicks = ytFallback;
                _loading = false;
              });
              return;
            }
          } catch (_) {}
          if (mounted) {
            setState(() {
              if (CatalogDataSource.allTracks.isNotEmpty) {
                _quickPicks = CatalogDataSource.allTracks;
              }
              _loading = false;
            });
          }
        }
      });

      if (_favoriteArtist != null) {
        _loadFavoriteArtistTracks(_favoriteArtist!);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[HomeScreen] load error: $e');
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadFavoriteArtistTracks(String artistName) async {
    try {
      final tracks = await InnerTubeService.instance.search(artistName);
      if (mounted) {
        setState(() {
          _favoriteArtistTracks = tracks.take(8).toList();
        });
      }
    } catch (_) {}
  }

  int get _seed => (_mood + 1) * 7 + _refresh * 13;

  Widget _sec(String key, Widget child) => SliverToBoxAdapter(
        child: Reveal(key: ValueKey('$_seed-$key'), child: child),
      );

  void _open(Widget screen) => Navigator.push(context, MaterialPageRoute(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final top = MediaQuery.paddingOf(context).top;
    final country = CountryService.instance.currentCountry;

    void play(List<Track> list, int i) {
      HapticFeedback.lightImpact();
      player.setQueue(list, startIndex: i);
    }

    // 1. Personalised "Listen again" (Real listening history, fallback to quickPicks)
    final listenAgain = _recentHistory.isNotEmpty
        ? _recentHistory
        : (_quickPicks.isNotEmpty ? _quickPicks.take(10).toList() : CatalogDataSource.allTracks.take(10).toList());

    // 2. Real Quick picks from YouTube Music
    final quick = _quickPicks.isNotEmpty ? _quickPicks.take(12).toList() : CatalogDataSource.allTracks.take(12).toList();

    // 3. Country-specific Trending & Charts
    final charts = _chartTracks.isNotEmpty ? _chartTracks.take(12).toList() : CatalogDataSource.allTracks.take(12).toList();

    // 4. Fresh Releases
    final fresh = _newReleases.isNotEmpty ? _newReleases.take(9).toList() : CatalogDataSource.allTracks.take(9).toList();

    // 5. Albums for you (extracted from real releases)
    final albumMap = <String, Track>{};
    for (final t in [..._newReleases, ..._quickPicks, ..._chartTracks]) {
      if (t.album.isNotEmpty && t.album != 'Single') {
        albumMap.putIfAbsent(t.album, () => t);
      }
    }
    final albums = albumMap.values.take(10).toList();

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: _loading && _quickPicks.isEmpty && _chartTracks.isEmpty && CatalogDataSource.allTracks.isEmpty
          ? const Center(child: CupertinoActivityIndicator(color: Colors.white70, radius: 14))
          : CustomScrollView(
              physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
              slivers: [
                SliverPersistentHeader(pinned: true, delegate: _NavDelegate(top: top, title: 'Home')),
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

                // Mood chips (scroll away with the page)
                SliverToBoxAdapter(
                  child: _Chips(
                    selected: _mood,
                    onSelect: (i) {
                      setState(() => _mood = i);
                    },
                  ),
                ),

                // 1. Personalised "Listen again": real listening history
                _sec('again', Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _SecHeader(
                      title: 'Listen again',
                      overline: _recentHistory.isNotEmpty ? 'Jump back in' : 'Made for you',
                      onMore: () {},
                    ),
                    _Shelf(
                      height: 196,
                      itemExtent: 150,
                      count: listenAgain.length,
                      builder: (c, i) {
                        final t = listenAgain[i];
                        final cur = player.currentTrack?.id == t.id;
                        return _CoverCard(
                          url: t.coverUrl,
                          title: t.title,
                          subtitle: t.artist,
                          current: cur,
                          playing: cur && player.isPlaying,
                          onTap: () => play(listenAgain, i),
                          onSubtitleTap: () => _open(ArtistScreen(artistName: t.artist)),
                        );
                      },
                    ),
                  ],
                )),

                // 2. Quick picks: real YouTube Music quick picks
                if (quick.isNotEmpty)
                  _sec('quick', Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _SecHeader(title: 'Quick picks', overline: 'Start radio from a song'),
                      _PagedRows(tracks: quick, rows: 4, player: player, onPlay: (i) => play(quick, i)),
                    ],
                  )),

                // 3. Country-specific Trending & Charts
                if (charts.isNotEmpty)
                  _sec('charts', Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SecHeader(title: 'Top Hits in ${country.name}', overline: '${country.flag} Charts', onMore: () {}),
                      _PagedRows(
                        tracks: charts,
                        rows: 4,
                        player: player,
                        style: _RowStyle.ranked,
                        onPlay: (i) => play(charts, i),
                      ),
                    ],
                  )),

                // 4. Country Top Artists
                if (_chartArtists.isNotEmpty)
                  _sec('artists', Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SecHeader(title: 'Top Artists in ${country.name}', onMore: () {}),
                      _Shelf(
                        height: 160,
                        itemExtent: 124,
                        count: _chartArtists.length,
                        builder: (c, i) {
                          final a = _chartArtists[i];
                          return _CoverCard(
                            url: a.image,
                            title: a.name,
                            subtitle: a.subs,
                            circular: true,
                            onTap: () => _open(ArtistScreen(artistName: a.name)),
                          );
                        },
                      ),
                    ],
                  )),

                // 5. New Releases
                if (fresh.isNotEmpty)
                  _sec('new', Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SecHeader(title: 'New releases', overline: 'Just dropped', onMore: () {}),
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

                // 6. Albums for you
                if (albums.isNotEmpty)
                  _sec('albums', Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SecHeader(title: 'Albums for you', onMore: () {}),
                      _Shelf(
                        height: 232,
                        itemExtent: 184,
                        count: albums.length,
                        builder: (c, i) {
                          final t = albums[i];
                          return _CoverCard(
                            url: t.coverUrl,
                            title: t.album,
                            subtitle: t.artist,
                            radius: 8,
                            onSubtitleTap: () => _open(ArtistScreen(artistName: t.artist)),
                            onTap: () => _open(AlbumScreen(
                              albumTitle: t.album,
                              artistName: t.artist,
                              coverUrl: t.coverUrl,
                            )),
                          );
                        },
                      ),
                    ],
                  )),

                // 7. Personalised Similar to [Favorite Artist]
                if (_favoriteArtist != null && _favoriteArtistTracks.isNotEmpty)
                  _sec('similar', Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _SecHeader(
                        overline: 'Similar to',
                        title: _favoriteArtist!,
                        onMore: () => _open(ArtistScreen(artistName: _favoriteArtist!)),
                      ),
                      _Shelf(
                        height: 176,
                        itemExtent: 132,
                        count: _favoriteArtistTracks.length,
                        builder: (c, i) {
                          final t = _favoriteArtistTracks[i];
                          return _CoverCard(
                            url: t.coverUrl,
                            title: t.title,
                            subtitle: t.artist,
                            onTap: () => play(_favoriteArtistTracks, i),
                            onSubtitleTap: () => _open(ArtistScreen(artistName: t.artist)),
                          );
                        },
                      ),
                    ],
                  )),

                // 8. Moods & genres: flat colour grid
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
                        child: _GenreTile(_genres[i]),
                      ),
                      childCount: _genres.length,
                    ),
                  ),
                ),

                // clearance for floating mini player + persistent tab bar
                SliverToBoxAdapter(child: SizedBox(height: 170 + MediaQuery.paddingOf(context).bottom)),
              ],
            ),
    );
  }
}
