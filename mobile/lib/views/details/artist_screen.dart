import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:provider/provider.dart';
import 'package:sensors_plus/sensors_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/equalizer_bars.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../features/story_sharing/story_sharing.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/album_resolver.dart';
import '../../services/artist_service.dart';
import '../../services/dock_visibility.dart';
import '../../services/innertube_service.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';
import 'album_screen.dart';

/* ------------------------------------------------------------------ */
/*  Shared sizes & colours                                              */
/* ------------------------------------------------------------------ */
const double _kGap = 14;
const double _kRowH = 60;
const int _kStackSongs = 15;
const int _kSheetSongs = 50;

/// Apple Music rose.
const Color _kRose = Color(0xFFFF375F);

/// Apple-style continuous (squircle) corners.
ShapeBorder _sq(double r, {BorderSide side = BorderSide.none}) =>
    ContinuousRectangleBorder(
      borderRadius: BorderRadius.circular(r * 2),
      side: side,
    );

/* ------------------------------------------------------------------ */
/*  Motion primitives                                                   */
/* ------------------------------------------------------------------ */
const _kPress = SpringDescription(mass: 1, stiffness: 430, damping: 21);
const _kReveal = SpringDescription(mass: 1, stiffness: 170, damping: 26);

class _SpringCurve extends Curve {
  const _SpringCurve();
  static final _sim = SpringSimulation(
    const SpringDescription(mass: 1, stiffness: 200, damping: 17),
    0,
    1,
    0,
  );
  @override
  double transformInternal(double t) => _sim.x(t * 0.9);
}

const _spring = _SpringCurve();

/// Squishy press feedback.
class _Press extends StatefulWidget {
  const _Press({required this.child, this.onTap, this.scale = 0.96});
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
      _c.animateWith(SpringSimulation(_kPress, _c.value, v, 0));

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
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

/// One soft fade + small rise on page open.
class _Reveal extends StatefulWidget {
  const _Reveal({required this.child, this.delay = Duration.zero});
  final Widget child;
  final Duration delay;

  @override
  State<_Reveal> createState() => _RevealState();
}

class _RevealState extends State<_Reveal> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );
  Timer? _t;

  @override
  void initState() {
    super.initState();
    void go() => _c.animateWith(SpringSimulation(_kReveal, 0, 1, 0));
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
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    child: widget.child,
    builder: (_, child) => Opacity(
      opacity: _c.value.clamp(0.0, 1.0).toDouble(),
      child: Transform.translate(
        offset: Offset(0, (1 - _c.value) * 14),
        child: child,
      ),
    ),
  );
}

/// Horizontal shelf settles on a card with a spring.
class _SnapPhysics extends ScrollPhysics {
  const _SnapPhysics({super.parent, required this.itemExtent});
  final double itemExtent;

  @override
  _SnapPhysics applyTo(ScrollPhysics? ancestor) =>
      _SnapPhysics(parent: buildParent(ancestor), itemExtent: itemExtent);

  @override
  SpringDescription get spring => SpringDescription.withDampingRatio(
    mass: 0.5,
    stiffness: 120,
    ratio: 1.05,
  );

  @override
  Simulation? createBallisticSimulation(ScrollMetrics m, double velocity) {
    if ((velocity <= 0 && m.pixels <= m.minScrollExtent) ||
        (velocity >= 0 && m.pixels >= m.maxScrollExtent)) {
      return super.createBallisticSimulation(m, velocity);
    }
    final page = m.pixels / itemExtent;
    final tol = toleranceFor(m).velocity;
    final t = velocity < -tol
        ? page.floorToDouble()
        : velocity > tol
        ? page.ceilToDouble()
        : page.roundToDouble();
    final target = (t * itemExtent)
        .clamp(m.minScrollExtent, m.maxScrollExtent)
        .toDouble();
    if ((target - m.pixels).abs() < 0.5) return null;
    return ScrollSpringSimulation(
      spring,
      m.pixels,
      target,
      velocity,
      tolerance: toleranceFor(m),
    );
  }

  @override
  bool get allowImplicitScrolling => false;
}

/* ------------------------------------------------------------------ */
/*  Small widgets                                                       */
/* ------------------------------------------------------------------ */
class _Img extends StatelessWidget {
  const _Img(this.url, {this.radius = 6.0, this.circular = false});
  final String url;
  final double radius;
  final bool circular;

  @override
  Widget build(BuildContext context) {
    final resolved = MediaNormalizer.upgradeArtworkUrl(
      url,
      isArtistAvatar: circular,
    );
    final img = CachedNetworkImage(
      imageUrl: resolved,
      fit: BoxFit.cover,
      width: double.infinity,
      height: double.infinity,
      fadeInDuration: const Duration(milliseconds: 220),
      placeholder: (context, url) => Container(color: AppColors.surface2),
      errorWidget: (context, errUrl, error) {
        if (errUrl.contains('maxresdefault.jpg')) {
          return CachedNetworkImage(
            imageUrl: errUrl.replaceAll('maxresdefault.jpg', 'sddefault.jpg'),
            fit: BoxFit.cover,
            fadeInDuration: const Duration(milliseconds: 220),
            placeholder: (_, _) => Container(color: AppColors.surface2),
            errorWidget: (_, sdUrl, _) => CachedNetworkImage(
              imageUrl: sdUrl.replaceAll('sddefault.jpg', 'hqdefault.jpg'),
              fit: BoxFit.cover,
              errorWidget: (_, _, _) => Container(
                color: AppColors.surface2,
                child: Icon(
                  circular
                      ? CupertinoIcons.person_fill
                      : CupertinoIcons.music_note,
                  color: AppColors.textTertiary,
                ),
              ),
            ),
          );
        }
        return Container(
          color: AppColors.surface2,
          child: Icon(
            circular ? CupertinoIcons.person_fill : CupertinoIcons.music_note,
            color: AppColors.textTertiary,
          ),
        );
      },
    );
    if (circular) return ClipOval(child: img);
    return ClipPath(
      clipper: ShapeBorderClipper(shape: _sq(radius)),
      child: img,
    );
  }
}

typedef _Eq = EqualizerBars;

class _Skeleton extends StatefulWidget {
  const _Skeleton();

  @override
  State<_Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<_Skeleton>
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

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    builder: (_, child) =>
        Opacity(opacity: 0.35 + 0.35 * _c.value, child: child),
    child: Column(
      children: List.generate(
        4,
        (i) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: ShapeDecoration(
                  color: Colors.white24,
                  shape: _sq(8),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      height: 12,
                      width: 150 + (i % 3) * 30.0,
                      decoration: BoxDecoration(
                        color: Colors.white24,
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      height: 10,
                      width: 90,
                      decoration: BoxDecoration(
                        color: Colors.white24,
                        borderRadius: BorderRadius.circular(5),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class _ArtistSheetEntry {
  const _ArtistSheetEntry({
    required this.title,
    required this.subtitle,
    required this.coverUrl,
    required this.onTap,
    this.circular = false,
    this.isVideo = false,
  });
  final String title;
  final String subtitle;
  final String coverUrl;
  final VoidCallback onTap;
  final bool circular;
  final bool isVideo;
}

class _SecHeader extends StatelessWidget {
  const _SecHeader(this.title, {this.onSeeAll});
  final String title;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) {
    final row = Padding(
      padding: const EdgeInsets.fromLTRB(20, 28, 12, 10),
      child: Row(
        children: [
          Expanded(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.4,
                    ),
                  ),
                ),
                if (onSeeAll != null)
                  const Padding(
                    padding: EdgeInsets.only(left: 4),
                    child: Icon(
                      CupertinoIcons.chevron_right,
                      size: 15,
                      color: AppColors.textSecondary,
                    ),
                  ),
              ],
            ),
          ),
          if (onSeeAll != null)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              child: Text(
                'See All',
                style: TextStyle(
                  color: _kRose,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
        ],
      ),
    );

    if (onSeeAll != null) {
      return _Press(scale: 0.985, onTap: onSeeAll, child: row);
    }
    return row;
  }
}

/// Round translucent button used in the action row.
class _ActionCircle extends StatelessWidget {
  const _ActionCircle({
    required this.icon,
    required this.onTap,
    this.active = false,
  });
  final IconData icon;
  final VoidCallback onTap;
  final bool active;

  @override
  Widget build(BuildContext context) => _Press(
    scale: 0.86,
    onTap: onTap,
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 500),
      curve: _spring,
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: active ? 0.26 : 0.16),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 320),
        switchInCurve: _spring,
        transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
        child: Icon(
          icon,
          key: ValueKey(icon),
          size: 20,
          color: active ? _kRose : Colors.white,
        ),
      ),
    ),
  );
}

/// Apple Music follow control: artist + plus, turns into artist + tick.
/// Only the icon is rose; the circle matches the shuffle button.
class _FollowCircle extends StatelessWidget {
  const _FollowCircle({required this.following, required this.onTap});
  final bool following;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => _Press(
    scale: 0.86,
    onTap: onTap,
    child: AnimatedContainer(
      duration: const Duration(milliseconds: 550),
      curve: _spring,
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: following ? 0.26 : 0.16),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 380),
        switchInCurve: _spring,
        transitionBuilder: (c, a) => ScaleTransition(
          scale: a,
          child: FadeTransition(opacity: a, child: c),
        ),
        child: Icon(
          following
              ? CupertinoIcons.person_crop_circle_badge_checkmark
              : CupertinoIcons.person_crop_circle_badge_plus,
          key: ValueKey(following),
          size: 25,
          color: _kRose,
        ),
      ),
    ),
  );
}

class _PlayPill extends StatelessWidget {
  const _PlayPill({required this.isPlaying, required this.onTap});
  final bool isPlaying;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => _Press(
    scale: 0.95,
    onTap: onTap,
    child: Container(
      height: 48,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
      ),
      alignment: Alignment.center,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isPlaying ? CupertinoIcons.pause_fill : CupertinoIcons.play_fill,
            color: Colors.black,
            size: 17,
          ),
          const SizedBox(width: 7),
          Text(
            isPlaying ? 'Pause' : 'Play',
            style: const TextStyle(
              color: Colors.black,
              fontSize: 17,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    ),
  );
}

class _Cover extends StatelessWidget {
  const _Cover({
    required this.url,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.circular = false,
  });
  final String url, title, subtitle;
  final VoidCallback onTap;
  final bool circular;

  @override
  Widget build(BuildContext context) {
    final shadow = [
      BoxShadow(
        color: Colors.black.withValues(alpha: 0.28),
        blurRadius: 10,
        offset: const Offset(0, 4),
      ),
    ];
    final align = circular ? TextAlign.center : TextAlign.start;
    return _Press(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: circular
            ? CrossAxisAlignment.center
            : CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: DecoratedBox(
              decoration: circular
                  ? BoxDecoration(shape: BoxShape.circle, boxShadow: shadow)
                  : ShapeDecoration(shape: _sq(6.0), shadows: shadow),
              child: _Img(url, circular: circular, radius: 6.0),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: align,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              height: 1.3,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.15,
            ),
          ),
          Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: align,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12.5,
              height: 1.3,
            ),
          ),
        ],
      ),
    );
  }
}

class _Shelf extends StatelessWidget {
  const _Shelf({required this.count, required this.builder});
  final int count;
  final Widget Function(int) builder;

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final ext = (w - 20) / 2.18;
    final cw = ext - 14;
    final shelfH = cw + 60;
    return SizedBox(
      height: shelfH,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        physics: _SnapPhysics(
          parent: const BouncingScrollPhysics(),
          itemExtent: ext,
        ),
        itemExtent: ext,
        itemCount: count,
        itemBuilder: (_, i) => Padding(
          padding: const EdgeInsets.only(right: _kGap),
          child: builder(i),
        ),
      ),
    );
  }
}

class _VideoCard extends StatelessWidget {
  const _VideoCard({
    required this.track,
    required this.onTap,
    this.fallbackYear,
  });
  final Track track;
  final VoidCallback onTap;
  final String? fallbackYear;

  static String extractYear(String text) {
    final match = RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(text);
    return match != null ? match.group(0)! : '';
  }

  @override
  Widget build(BuildContext context) {
    final shadow = [
      BoxShadow(
        color: Colors.black.withValues(alpha: 0.35),
        blurRadius: 12,
        offset: const Offset(0, 5),
      ),
    ];
    var displayYear = (track.year != null && track.year!.isNotEmpty)
        ? track.year!
        : extractYear(track.title);
    if (displayYear.isEmpty && fallbackYear != null && fallbackYear!.isNotEmpty) {
      displayYear = fallbackYear!;
    }
    final yearMatch = RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(displayYear);
    if (yearMatch != null) {
      displayYear = yearMatch.group(0)!;
    } else {
      displayYear = '';
    }

    final cleanTitle = MediaNormalizer.cleanVideoTitle(
      track.title,
      knownArtists: track.artist,
    );

    return _Press(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 16 / 9,
            child: DecoratedBox(
              decoration: ShapeDecoration(
                shape: _sq(14.0),
                shadows: shadow,
              ),
              child: _Img(track.coverUrl, radius: 14.0),
            ),
          ),
          const SizedBox(height: 7),
          Text(
            cleanTitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14.0,
              height: 1.25,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.15,
            ),
          ),
          if (displayYear.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              displayYear,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 12.5,
                height: 1.25,
                fontWeight: FontWeight.w400,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _VideoShelf extends StatelessWidget {
  const _VideoShelf({required this.count, required this.builder});
  final int count;
  final Widget Function(int) builder;

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final ext = (w * 0.72).clamp(250.0, 350.0);
    final cw = ext - 14;
    final shelfH = (cw * 9 / 16) + 52;
    return SizedBox(
      height: shelfH,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        physics: _SnapPhysics(
          parent: const BouncingScrollPhysics(),
          itemExtent: ext,
        ),
        itemExtent: ext,
        itemCount: count,
        itemBuilder: (_, i) => Padding(
          padding: const EdgeInsets.only(right: _kGap),
          child: builder(i),
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Songs: row, paged "stack", and the See All sheet                    */
/* ------------------------------------------------------------------ */
String _fmtDuration(int sec) {
  if (sec <= 0) return '';
  final m = sec ~/ 60;
  final s = sec % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}

class _SongRow extends StatelessWidget {
  const _SongRow({
    required this.track,
    required this.current,
    required this.playing,
    required this.onTap,
    this.leftPad = 20,
    this.rightPad = 8,
  });
  final Track track;
  final bool current, playing;
  final VoidCallback onTap;
  final double leftPad, rightPad;

  @override
  Widget build(BuildContext context) {
    // Real duration from the song itself; nothing is shown when unknown.
    final dur = _fmtDuration(track.durationSeconds);
    return _Press(
      scale: 0.98,
      onTap: onTap,
      child: SizedBox(
        height: _kRowH,
        child: Stack(
          children: [
            Padding(
              padding: EdgeInsets.only(left: leftPad, right: rightPad),
              child: Row(
                children: [
                  SizedBox(
                    width: 44,
                    height: 44,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        _Img(track.coverUrl, radius: 7),
                        AnimatedOpacity(
                          duration: const Duration(milliseconds: 200),
                          opacity: current ? 1 : 0,
                          child: Container(
                            decoration: ShapeDecoration(
                              color: Colors.black.withValues(alpha: 0.5),
                              shape: _sq(7),
                            ),
                            alignment: Alignment.center,
                            child: _Eq(playing: playing),
                          ),
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
                        AnimatedDefaultTextStyle(
                          duration: const Duration(milliseconds: 200),
                          style: TextStyle(
                            fontFamily: 'SF Pro',
                            color: current ? _kRose : Colors.white,
                            fontSize: 15.5,
                            fontWeight: FontWeight.w500,
                            letterSpacing: -0.2,
                          ),
                          child: Text(
                            MediaNormalizer.cleanCompactTitle(track.title),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(height: 1),
                        Text(
                          track.album.isNotEmpty ? track.album : track.artist,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: 'SF Pro',
                            color: AppColors.textSecondary,
                            fontSize: 13,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (dur.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    Text(
                      dur,
                      style: const TextStyle(
                        fontFamily: 'SF Pro',
                        color: AppColors.textTertiary,
                        fontSize: 13,
                        fontWeight: FontWeight.w400,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                  _Press(
                    scale: 0.8,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      ZenDropdown.showTrackMenu(context: context, track: track);
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: Icon(
                        CupertinoIcons.ellipsis_vertical,
                        color: Colors.white.withValues(alpha: 0.6),
                        size: 18,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Positioned(
              left: leftPad + 56,
              right: rightPad,
              bottom: 0,
              child: Container(height: 0.5, color: AppColors.hairline),
            ),
          ],
        ),
      ),
    );
  }
}

/// Apple Music "Top Songs": columns of 4 rows you swipe sideways, with the
/// next column peeking in.
class _TopSongsStack extends StatefulWidget {
  const _TopSongsStack({
    required this.songs,
    required this.curId,
    required this.isPlaying,
    required this.onPlay,
  });
  final List<Track> songs;
  final String? curId;
  final bool isPlaying;
  final void Function(int) onPlay;

  @override
  State<_TopSongsStack> createState() => _TopSongsStackState();
}

class _TopSongsStackState extends State<_TopSongsStack> {
  static const _perPage = 4;
  final _pc = PageController(viewportFraction: 0.9);

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.songs.length;
    final pages = (n / _perPage).ceil();
    return SizedBox(
      height: _kRowH * math.min(n, _perPage),
      child: PageView.builder(
        controller: _pc,
        padEnds: false,
        physics: const PageScrollPhysics(parent: BouncingScrollPhysics()),
        itemCount: pages,
        itemBuilder: (_, p) => Column(
          children: [
            for (var i = p * _perPage; i < math.min(n, (p + 1) * _perPage); i++)
              _SongRow(
                track: widget.songs[i],
                current: widget.curId == widget.songs[i].id,
                playing: widget.curId == widget.songs[i].id && widget.isPlaying,
                leftPad: 20,
                rightPad: 6,
                onTap: () => widget.onPlay(i),
              ),
          ],
        ),
      ),
    );
  }
}

/// Apple Music style row for the newest release (no card, just a row).
class _LatestRelease extends StatelessWidget {
  const _LatestRelease({
    required this.release,
    required this.subtitle,
    required this.onTap,
  });
  final _Release release;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => _Press(
    scale: 0.98,
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
      child: Row(
        children: [
          SizedBox(
            width: 72,
            height: 72,
            child: _Img(release.cover, radius: 6.0),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  release.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w500,
                    letterSpacing: -0.25,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          ),
          const Icon(
            CupertinoIcons.chevron_right,
            size: 14,
            color: AppColors.textTertiary,
          ),
        ],
      ),
    ),
  );
}

/* ------------------------------------------------------------------ */
/*  About                                                               */
/* ------------------------------------------------------------------ */
class _Link {
  const _Link(this.label, this.url);
  final String label, url;
}

class _ParsedBio {
  const _ParsedBio(this.text, this.links);
  final String text;
  final List<_Link> links;
}

/// Splits raw bio text into clean prose + real, tappable source links
/// (so "From Wikipedia (https://…)" never shows up as dead text).
_ParsedBio _parseBio(String raw, String name) {
  if (raw.trim().isEmpty) return const _ParsedBio('', []);
  final urlRe = RegExp(r'https?://[^\s\)\]>"]+');
  final urls = urlRe
      .allMatches(raw)
      .map((m) => m.group(0)!.replaceAll(RegExp(r'[.,;]+$'), ''))
      .toList();
  final mentionsWiki = RegExp('wikipedia', caseSensitive: false).hasMatch(raw);

  var text = raw.replaceAll(
    RegExp(r'\s*From Wikipedia[\s\S]*$', caseSensitive: false),
    '',
  );
  text = text
      .replaceAll(urlRe, '')
      .replaceAll(RegExp(r'\(\s*\)'), '')
      .replaceAll(RegExp(r'[ \t]{2,}'), ' ')
      .trim();

  String? wiki, cc;
  for (final u in urls) {
    if (wiki == null && u.contains('wikipedia.org')) wiki = u;
    if (cc == null && u.contains('creativecommons.org')) cc = u;
  }
  if (wiki == null && mentionsWiki) {
    wiki =
        'https://en.wikipedia.org/w/index.php?search=${Uri.encodeQueryComponent(name)}';
  }
  return _ParsedBio(text, [
    if (wiki != null) _Link('Wikipedia', wiki),
    if (cc != null) _Link('CC BY-SA 3.0', cc),
  ]);
}

Future<void> _openUrl(String url) async {
  HapticFeedback.selectionClick();
  try {
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  } catch (_) {}
}

class _LinkChip extends StatelessWidget {
  const _LinkChip({required this.link});
  final _Link link;

  @override
  Widget build(BuildContext context) => _Press(
    scale: 0.94,
    onTap: () => _openUrl(link.url),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: ShapeDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        shape: const StadiumBorder(),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(CupertinoIcons.link, size: 14, color: _kRose),
          const SizedBox(width: 6),
          Text(
            link.label,
            style: const TextStyle(
              color: _kRose,
              fontSize: 13,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    ),
  );
}

/// Clean, vertical About card: photo → one audience figure → bio → sources.
/// Every block is its own row, so nothing can overlap, whatever the length
/// of the number ("12.4M", "1.2 Cr", "3,48,00,000"…).
class _AboutCard extends StatefulWidget {
  const _AboutCard({
    required this.imageUrl,
    required this.statValue,
    required this.statLabel,
    required this.bio,
  });
  final String imageUrl, statValue, statLabel;
  final _ParsedBio bio;

  @override
  State<_AboutCard> createState() => _AboutCardState();
}

class _AboutCardState extends State<_AboutCard> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final text = widget.bio.text;
    final canExpand = text.length > 170;
    final hasStat = widget.statValue.isNotEmpty;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: ClipPath(
        clipper: ShapeBorderClipper(shape: _sq(18)),
        child: ColoredBox(
          color: AppColors.surface2,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AspectRatio(
                aspectRatio: 1.55,
                child: widget.imageUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: widget.imageUrl,
                        fit: BoxFit.cover,
                        width: double.infinity,
                        height: double.infinity,
                        placeholder: (_, _) =>
                            Container(color: AppColors.surface2),
                        errorWidget: (_, _, _) => Container(
                          color: AppColors.surface2,
                          child: const Icon(
                            CupertinoIcons.person_fill,
                            color: AppColors.textTertiary,
                            size: 36,
                          ),
                        ),
                      )
                    : Container(
                        color: AppColors.surface2,
                        child: const Icon(
                          CupertinoIcons.person_fill,
                          color: AppColors.textTertiary,
                          size: 36,
                        ),
                      ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (hasStat) ...[
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(
                          widget.statValue,
                          maxLines: 1,
                          softWrap: false,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 30,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.8,
                          ),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        widget.statLabel,
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                    if (text.isNotEmpty) ...[
                      if (hasStat) ...[
                        const SizedBox(height: 14),
                        Container(height: 0.5, color: AppColors.hairline),
                        const SizedBox(height: 14),
                      ],
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: canExpand
                            ? () {
                                HapticFeedback.selectionClick();
                                setState(() => _open = !_open);
                              }
                            : null,
                        child: AnimatedSize(
                          duration: const Duration(milliseconds: 350),
                          curve: Curves.easeOutCubic,
                          alignment: Alignment.topCenter,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                text,
                                maxLines: _open ? null : 4,
                                overflow: _open
                                    ? TextOverflow.visible
                                    : TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.86),
                                  fontSize: 15,
                                  height: 1.4,
                                ),
                              ),
                              if (canExpand) ...[
                                const SizedBox(height: 8),
                                Text(
                                  _open ? 'Less' : 'More',
                                  style: const TextStyle(
                                    color: _kRose,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ],
                    if (widget.bio.links.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      Container(height: 0.5, color: AppColors.hairline),
                      const SizedBox(height: 12),
                      const Text(
                        'Source',
                        style: TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final l in widget.bio.links) _LinkChip(link: l),
                        ],
                      ),
                    ],
                  ],
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
class _Release {
  _Release(
    this.title,
    this.cover, {
    this.browseId,
    this.year = '',
    this.type = 'Album',
  });
  final String title, cover;
  final String? browseId;
  final String year;
  final String type;
  final List<Track> tracks = [];
}

class ArtistScreen extends StatefulWidget {
  const ArtistScreen({
    super.key,
    required this.artistName,
    this.imageUrl,
    this.bio,
    this.browseId,
  });

  final String artistName;
  final String? imageUrl;
  final String? bio;
  final String? browseId;

  @override
  State<ArtistScreen> createState() => _ArtistScreenState();
}

class _ArtistScreenState extends State<ArtistScreen>
    with TickerProviderStateMixin, WidgetsBindingObserver {
  final _sc = ScrollController();
  List<Track> _tracks = [];
  ArtistProfile? _artistProfile;
  bool _loading = true;
  String? _resolvedImage;
  String? _resolvedBanner;
  String? _resolvedBio;
  final Map<String, String> _resolvedVideoTitles = {};
  final Map<String, String> _resolvedVideoYears = {};
  final Map<String, String> _resolvedVideoArtists = {};
  final Set<String> _resolvingVideoIds = {};
  final Set<String> _attemptedVideoIds = {};

  void _resolveVideosMetadata(List<Track> videos) {
    if (videos.isEmpty) return;
    final candidates = <Track>[];
    for (final vt in videos) {
      final cleanId = vt.id.replaceFirst(RegExp(r'^(yt-|yt:)'), '');
      if (cleanId.isEmpty) continue;

      if (vt.year != null && RegExp(r'\b(19\d{2}|20\d{2})\b').hasMatch(vt.year!)) {
        _resolvedVideoYears[cleanId] ??= RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(vt.year!)!.group(0)!;
      }
      if (vt.artist.isNotEmpty &&
          vt.artist.toLowerCase() != 'unknown artist' &&
          !MediaNormalizer.isDistributorOrLabel(vt.artist) &&
          !MediaNormalizer.isNonArtistCreditSegment(vt.artist)) {
        _resolvedVideoArtists[cleanId] ??= vt.artist;
      }

      // Immediately hydrate from shared InnerTube cache if already resolved elsewhere
      final cached = InnerTubeService.instance.getCachedVideoDetails(cleanId);
      if (cached != null) {
        if (cached.cleanTitle.isNotEmpty) {
          _resolvedVideoTitles[cleanId] = cached.cleanTitle;
        }
        if (cached.year != null && cached.year!.isNotEmpty) {
          _resolvedVideoYears[cleanId] ??= cached.year!;
        }
        if (cached.artists.isNotEmpty) {
          _resolvedVideoArtists[cleanId] = cached.artists;
        }
        _attemptedVideoIds.add(cleanId);
        continue;
      }

      if (_resolvingVideoIds.contains(cleanId) || _attemptedVideoIds.contains(cleanId)) {
        continue;
      }
      final needsYear = !_resolvedVideoYears.containsKey(cleanId);
      final needsTitleOrArtist =
          !_resolvedVideoTitles.containsKey(cleanId) ||
          InnerTubeService.needsVideoEnrichment(vt, requireYear: needsYear);
      if (!needsYear && !needsTitleOrArtist) continue;

      _resolvingVideoIds.add(cleanId);
      _attemptedVideoIds.add(cleanId);
      candidates.add(vt);
    }
    if (candidates.isEmpty) return;

    final artistFallback = _artistProfile?.name ?? widget.artistName;
    InnerTubeService.instance
        .enrichVideoTracks(
          candidates,
          knownArtist: artistFallback,
          requireYear: true,
          maxConcurrent: 3,
          onBatchProgress: (updatedBatch) {
            if (!mounted || updatedBatch.isEmpty) return;
            var changed = false;
            for (final u in updatedBatch) {
              final cid = u.id.replaceFirst(RegExp(r'^(yt-|yt:)'), '');
              if (cid.isEmpty) continue;
              if (u.title.isNotEmpty && _resolvedVideoTitles[cid] != u.title) {
                _resolvedVideoTitles[cid] = u.title;
                changed = true;
              }
              if (u.year != null && u.year!.isNotEmpty && _resolvedVideoYears[cid] != u.year) {
                _resolvedVideoYears[cid] = u.year!;
                changed = true;
              }
              if (u.artist.isNotEmpty &&
                  !MediaNormalizer.isDistributorOrLabel(u.artist) &&
                  _resolvedVideoArtists[cid] != u.artist) {
                _resolvedVideoArtists[cid] = u.artist;
                changed = true;
              }
            }
            if (changed) setState(() {});
          },
        )
        .whenComplete(() {
          for (final c in candidates) {
            _resolvingVideoIds.remove(c.id.replaceFirst(RegExp(r'^(yt-|yt:)'), ''));
          }
        });
  }

  // ---- Living cover (same behaviour as the album page) ----
  /// Flip to -1 if the tilt parallax feels inverted on your device.
  static const double _kTiltSign = 1;
  late final AnimationController _live = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 24),
  );
  late final AnimationController _glow = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 5200),
  );
  final ValueNotifier<Offset> _tilt = ValueNotifier(Offset.zero);
  StreamSubscription<AccelerometerEvent>? _accel;
  Offset? _neutral;
  Color _tint = const Color(0xFF3A3A3C);
  String? _coverKey;
  bool _animatedCover = false;
  bool _reduceMotion = false;
  bool _routeActive = true;
  bool _appResumed = true;
  bool _scrolling = false;
  bool _heroVisible = true;
  double _heroH = 460;
  double _imageAspectRatio = 0.75;
  String? _resolvedImageRatioUrl;

  /// Resolves a sharp yet fast-loading artist hero picture without forced cropping.
  static String resolveFullArtistHeroUrl(String? url) {
    if (url == null || url.trim().isEmpty) return '';
    var u = url.trim();
    if (u.contains('googleusercontent.com') || u.contains('ggpht.com')) {
      final base = u.replaceAll(
        RegExp(
          r'=(?:w\d+-h\d+|s\d+|w\d+)(?:-[a-z0-9_-]+)*$',
          caseSensitive: false,
        ),
        '',
      );
      return '$base=w720-l85-rj';
    }
    return MediaNormalizer.upgradeBannerUrl(u);
  }

  void _resolveImageDimensions(String url) {
    if (url.isEmpty || _resolvedImageRatioUrl == url) return;
    _resolvedImageRatioUrl = url;

    // 1. Check if dimensions are in the URL
    final dimMatch = RegExp(
      r'[=_-]w(\d+)-h(\d+)',
      caseSensitive: false,
    ).firstMatch(url);
    if (dimMatch != null) {
      final w = double.tryParse(dimMatch.group(1) ?? '') ?? 0;
      final h = double.tryParse(dimMatch.group(2) ?? '') ?? 0;
      if (w > 0 && h > 0) {
        final ratio = w / h;
        if ((_imageAspectRatio - ratio).abs() > 0.01) {
          _imageAspectRatio = ratio;
        }
      }
    }

    // 2. Resolve image stream safely and schedule setState for the next frame
    try {
      final provider = CachedNetworkImageProvider(url);
      final stream = provider.resolve(ImageConfiguration.empty);
      late ImageStreamListener listener;
      listener = ImageStreamListener(
        (ImageInfo info, bool synchronousCall) {
          final w = info.image.width;
          final h = info.image.height;
          if (w > 0 && h > 0) {
            final ratio = w / h;
            if ((_imageAspectRatio - ratio).abs() > 0.01) {
              void update() {
                if (mounted) {
                  setState(() {
                    _imageAspectRatio = ratio;
                  });
                }
              }

              if (synchronousCall) {
                WidgetsBinding.instance.addPostFrameCallback((_) => update());
              } else {
                update();
              }
            }
          }
          stream.removeListener(listener);
        },
        onError: (_, _) {
          stream.removeListener(listener);
        },
      );
      stream.addListener(listener);
    } catch (_) {}
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final cachedProfile = ArtistService.instance.getCached(
      widget.artistName,
      browseId: widget.browseId,
    );
    if (cachedProfile != null &&
        (cachedProfile.topSongs.isNotEmpty || cachedProfile.albums.isNotEmpty)) {
      _artistProfile = cachedProfile;
      _tracks = List.of(cachedProfile.topSongs);
      if (cachedProfile.imageUrl.isNotEmpty) {
        _resolvedImage = cachedProfile.imageUrl;
      }
      if (cachedProfile.coverUrl.isNotEmpty) {
        _resolvedBanner = cachedProfile.coverUrl;
      }
      if (cachedProfile.bio.isNotEmpty) {
        _resolvedBio = cachedProfile.bio;
      }
      _loading = false;
    } else {
      final cachedAvatar = ArtistService.getCachedAvatar(widget.artistName);
      if (cachedAvatar != null && cachedAvatar.isNotEmpty) {
        _resolvedImage = cachedAvatar;
      }
    }

    final seedUrl =
        _resolvedBanner ?? _resolvedImage ?? widget.imageUrl ?? '';
    if (seedUrl.isNotEmpty) {
      _resolveImageDimensions(resolveFullArtistHeroUrl(seedUrl));
    } else {
      // Resolve the artist's hero avatar fast (~200-400ms) in parallel without waiting for full discography
      ArtistService.resolveArtistAvatar(widget.artistName).then((url) {
        if (mounted &&
            url.isNotEmpty &&
            (_resolvedImage == null || _resolvedImage!.isEmpty)) {
          setState(() {
            _resolvedImage = url;
          });
        }
      });
    }

    _load();
    LibraryStore.instance.ensureLoaded();
    LibraryStore.instance.addListener(_onLibrary);
    _sc.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncMotion());
  }

  void _onLibrary() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    LibraryStore.instance.removeListener(_onLibrary);
    _sc.removeListener(_onScroll);
    _accel?.cancel();
    _live.dispose();
    _glow.dispose();
    _tilt.dispose();
    _sc.dispose();
    super.dispose();
  }

  /* ------------------------- living cover ------------------------ */
  double get _offset => _sc.hasClients ? _sc.offset : 0.0;

  void _onScroll() {
    final vis = _offset < _heroH * 0.8;
    if (vis != _heroVisible) {
      _heroVisible = vis;
      _syncMotion();
    }
  }

  bool _onScrollNote(ScrollNotification n) {
    if (n.depth != 0 || n.metrics.axis != Axis.vertical) return false;
    if (n is ScrollStartNotification && !_scrolling) {
      _scrolling = true;
      _syncMotion();
    } else if (n is ScrollEndNotification && _scrolling) {
      _scrolling = false;
      _syncMotion();
    }
    return false;
  }

  /// Nothing moves when reduce-motion is on, the screen is covered or the
  /// hero is off-screen; drift/breathing also rest while scrolling or app is backgrounded.
  void _syncMotion() {
    if (!mounted) return;
    final canRun = !_reduceMotion && _routeActive && _heroVisible && _appResumed;
    if (canRun && !_scrolling) {
      if (!_live.isAnimating) _live.repeat(reverse: true);
      if (!_glow.isAnimating) _glow.repeat(reverse: true);
    } else {
      _live.stop();
      _glow.stop();
    }
    if (canRun) {
      _startTilt();
    } else {
      _stopTilt();
    }
    if (_reduceMotion) _tilt.value = Offset.zero;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final isResumed = state == AppLifecycleState.resumed;
    if (_appResumed != isResumed) {
      _appResumed = isResumed;
      _syncMotion();
    }
  }

  void _startTilt() {
    if (_accel != null) return;
    try {
      _accel =
          accelerometerEventStream(
            samplingPeriod: SensorInterval.gameInterval,
          ).listen((e) {
            final n = _neutral ??= Offset(e.x, e.y);
            _neutral = Offset(
              n.dx + (e.x - n.dx) * 0.004,
              n.dy + (e.y - n.dy) * 0.004,
            );
            final tx = ((e.x - n.dx) / 4.5 * _kTiltSign)
                .clamp(-1.0, 1.0)
                .toDouble();
            final ty = ((e.y - n.dy) / 4.5 * _kTiltSign)
                .clamp(-1.0, 1.0)
                .toDouble();
            final c = _tilt.value;
            _tilt.value = Offset(
              c.dx + (tx - c.dx) * 0.12,
              c.dy + (ty - c.dy) * 0.12,
            );
          }, onError: (_) {});
    } catch (_) {}
  }

  void _stopTilt() {
    _accel?.cancel();
    _accel = null;
  }

  Color _breathe(Color base) =>
      Color.lerp(base, _tint, 0.2 * Curves.easeInOut.transform(_glow.value))!;

  Future<ui.Image?> _loadImage(ImageProvider provider) async {
    try {
      final stream = provider.resolve(ImageConfiguration.empty);
      final done = Completer<ui.Image>();
      late ImageStreamListener l;
      l = ImageStreamListener(
        (info, _) {
          if (!done.isCompleted) done.complete(info.image.clone());
          stream.removeListener(l);
        },
        onError: (e, _) {
          if (!done.isCompleted) done.completeError(e);
          stream.removeListener(l);
        },
      );
      stream.addListener(l);
      return await done.future.timeout(const Duration(seconds: 10));
    } catch (_) {
      return null;
    }
  }

  /// Averages the image into one colour for the hero tint.
  Future<void> _extractTint(String url) async {
    try {
      final img = await _loadImage(
        ResizeImage(CachedNetworkImageProvider(url), width: 16, height: 16),
      );
      if (img == null) return;
      final bd = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
      img.dispose();
      if (bd == null) return;
      double r = 0, g = 0, b = 0, w = 0;
      for (var i = 0; i + 3 < bd.lengthInBytes; i += 4) {
        final pr = bd.getUint8(i).toDouble(),
            pg = bd.getUint8(i + 1).toDouble(),
            pb = bd.getUint8(i + 2).toDouble();
        final mx = math.max(pr, math.max(pg, pb)),
            mn = math.min(pr, math.min(pg, pb));
        final sat = mx == 0 ? 0.0 : (mx - mn) / mx;
        final weight = 0.2 + sat * 2.0;
        r += pr * weight;
        g += pg * weight;
        b += pb * weight;
        w += weight;
      }
      if (w == 0) return;
      final hsl = HSLColor.fromColor(
        Color.fromARGB(255, (r / w).round(), (g / w).round(), (b / w).round()),
      );
      final tuned = hsl
          .withSaturation(hsl.saturation.clamp(0.25, 0.7).toDouble())
          .withLightness(hsl.lightness.clamp(0.30, 0.46).toDouble())
          .toColor();
      if (mounted && _coverKey == url) setState(() => _tint = tuned);
    } catch (_) {}
  }

  /// If the image is already an animated GIF / WebP, skip the fake drift.
  Future<void> _detectAnimated(String url) async {
    final lower = url.toLowerCase();
    // Google CDN `-rj` URLs always return static JPEGs; skip duplicate file download
    if (lower.contains('-rj') ||
        (!lower.contains('.gif') && !lower.contains('.webp'))) {
      return;
    }
    var animated = false;
    try {
      final file = await DefaultCacheManager().getSingleFile(url);
      final codec = await ui.instantiateImageCodec(await file.readAsBytes());
      animated = codec.frameCount > 1;
      codec.dispose();
    } catch (_) {}
    if (!mounted || _coverKey != url) return;
    if (animated != _animatedCover) setState(() => _animatedCover = animated);
  }

  /* ---------------------------- data ---------------------------- */
  Future<void> _load() async {
    try {
      final info = await ArtistService.instance.getArtist(
        widget.artistName,
        browseId: widget.browseId,
      );
      if (info != null &&
          (info.topSongs.isNotEmpty ||
              info.albums.isNotEmpty ||
              info.singles.isNotEmpty)) {
        if (mounted) {
          setState(() {
            _artistProfile = info;
            _tracks = List.of(info.topSongs);
            if (info.imageUrl.isNotEmpty) _resolvedImage = info.imageUrl;
            if (info.coverUrl.isNotEmpty) _resolvedBanner = info.coverUrl;
            if (info.bio.isNotEmpty) _resolvedBio = info.bio;
            _loading = false;
          });
        }
        _resolveVideosMetadata(info.musicVideos);
        _fillSongs();
        return;
      }

      final r = await InnerTubeService.instance.search(widget.artistName);
      if (mounted) {
        setState(() {
          _tracks = r;
          _loading = false;
        });
      }
      _fillSongs();
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// Tops the list up (in the background) so the See All sheet can reach 50.
  Future<void> _fillSongs() async {
    if (_tracks.length >= _kSheetSongs) return;
    final lower = widget.artistName.toLowerCase();
    final songs = List<Track>.of(_tracks);
    final seen = songs.map((s) => s.id).toSet();
    for (final q in [widget.artistName, '${widget.artistName} songs']) {
      if (songs.length >= _kSheetSongs) break;
      try {
        final r = await InnerTubeService.instance
            .search(q)
            .timeout(const Duration(seconds: 5));
        for (final s in r) {
          if (songs.length >= _kSheetSongs) break;
          if (s.artist.toLowerCase().contains(lower) && seen.add(s.id))
            songs.add(s);
        }
      } catch (_) {}
    }
    if (mounted && songs.length > _tracks.length)
      setState(() => _tracks = songs);
  }

  /* --------------------------- actions -------------------------- */
  void _play(List<Track> list, int i, {bool shuffle = false}) {
    if (list.isEmpty) return;
    HapticFeedback.mediumImpact();
    final startIdx = i.clamp(0, list.length - 1);
    final ctx = PlaybackContext(
      type: PlaybackContextType.artist,
      id: widget.artistName,
      tracks: list,
      startTrack: list[startIdx],
      title: widget.artistName,
    );
    context.read<PlayerState>().setQueue(
      list,
      startIndex: startIdx,
      shuffle: shuffle,
      collectionLocked: true,
      context: ctx,
    );
  }

  void _openAlbum(_Release r) {
    final lowerType = r.type.toLowerCase();
    final isSingleRelease =
        lowerType == 'single' ||
        AlbumResolver.isSingleReleaseTitle(r.title);
    Navigator.push(
      context,
      ZenPageRoute(
        builder: (_) => AlbumScreen(
          albumTitle: isSingleRelease
              ? MediaNormalizer.cleanTitle(r.title)
              : MediaNormalizer.cleanAlbumTitle(r.title),
          artistName: MediaNormalizer.stripIdNoise(widget.artistName),
          coverUrl: r.cover,
          browseId: AlbumResolver.sanitizeAlbumBrowseId(r.browseId),
          isSingle: isSingleRelease,
        ),
      ),
    );
  }

  void _share(String name) {
    HapticFeedback.selectionClick();
    Clipboard.setData(ClipboardData(text: name));
    IslandNotifier.instance.show(
      IslandNotification(
        id: 'copy_artist_${DateTime.now().millisecondsSinceEpoch}',
        title: 'Copied',
        body: name,
        leading: const Icon(
          CupertinoIcons.link,
          color: Color(0xFFE11D48),
          size: 18,
        ),
      ),
    );
  }

  /// Bottom sheet with up to 50 songs (the stack's songs come first).
  void _showAllSongs(List<Track> list, String name) {
    HapticFeedback.selectionClick();
    final player = context.read<PlayerState>();
    DockVisibility.runModal(
      () => showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        barrierColor: Colors.black.withValues(alpha: 0.50),
        builder: (sheetCtx) => DraggableScrollableSheet(
          initialChildSize: 0.9,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          expand: false,
          builder: (_, sc) => BackdropFilter(
            filter: ui.ImageFilter.blur(sigmaX: 25, sigmaY: 25),
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xF21C1C1E),
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(30)),
                border: Border(
                  top: BorderSide(
                    color: Colors.white.withValues(alpha: 0.12),
                    width: 0.6,
                  ),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.5),
                    blurRadius: 36,
                    offset: const Offset(0, -6),
                  ),
                ],
              ),
              child: ListenableBuilder(
                listenable: player,
                builder: (context, child) {
                  final cur = player.currentTrack?.id;
                  return CustomScrollView(
                    controller: sc,
                    physics: const BouncingScrollPhysics(
                      parent: AlwaysScrollableScrollPhysics(),
                    ),
                    slivers: [
                      SliverToBoxAdapter(
                        child: Column(
                          children: [
                            const SizedBox(height: 10),
                            Container(
                              width: 36,
                              height: 4.5,
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.22),
                                borderRadius: BorderRadius.circular(2.5),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.fromLTRB(20, 14, 14, 8),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        const Text(
                                          'Top Songs',
                                          style: TextStyle(
                                            color: Colors.white,
                                            fontSize: 22,
                                            fontWeight: FontWeight.w700,
                                            letterSpacing: -0.5,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          '$name · ${list.length} ${list.length == 1 ? 'song' : 'songs'}',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            color: AppColors.textSecondary,
                                            fontSize: 13,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  _Press(
                                    scale: 0.88,
                                    onTap: () => Navigator.of(sheetCtx).pop(),
                                    child: Container(
                                      width: 32,
                                      height: 32,
                                      decoration: BoxDecoration(
                                        color:
                                            Colors.white.withValues(alpha: 0.14),
                                        shape: BoxShape.circle,
                                      ),
                                      child: const Icon(
                                        CupertinoIcons.xmark,
                                        size: 14,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              margin:
                                  const EdgeInsets.symmetric(horizontal: 20),
                              height: 0.5,
                              color: AppColors.hairline,
                            ),
                          ],
                        ),
                      ),
                      SliverList.builder(
                        itemCount: list.length,
                        itemBuilder: (_, i) => _SongRow(
                          track: list[i],
                          current: cur == list[i].id,
                          playing: cur == list[i].id && player.isPlaying,
                          rightPad: 12,
                          onTap: () => _play(list, i),
                        ),
                      ),
                      SliverToBoxAdapter(
                        child: SizedBox(
                          height: MediaQuery.paddingOf(sheetCtx).bottom + 24,
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _showAllSection({
    required String title,
    required String subtitle,
    required List<_ArtistSheetEntry> entries,
  }) {
    if (entries.isEmpty) return;
    HapticFeedback.selectionClick();
    DockVisibility.runModal(
      () => showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        barrierColor: Colors.black.withValues(alpha: 0.50),
        builder: (sheetCtx) => DraggableScrollableSheet(
          initialChildSize: 0.9,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          expand: false,
          builder: (_, sc) => BackdropFilter(
            filter: ui.ImageFilter.blur(sigmaX: 25, sigmaY: 25),
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xF21C1C1E),
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(30)),
                border: Border(
                  top: BorderSide(
                    color: Colors.white.withValues(alpha: 0.12),
                    width: 0.6,
                  ),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.5),
                    blurRadius: 36,
                    offset: const Offset(0, -6),
                  ),
                ],
              ),
          child: CustomScrollView(
            controller: sc,
            physics: const BouncingScrollPhysics(
              parent: AlwaysScrollableScrollPhysics(),
            ),
            slivers: [
              SliverToBoxAdapter(
                child: Column(
                  children: [
                    const SizedBox(height: 8),
                    Container(
                      width: 36,
                      height: 5,
                      decoration: BoxDecoration(
                        color: Colors.white24,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 14, 14, 8),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  title,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 22,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: -0.5,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  subtitle,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: AppColors.textSecondary,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          _Press(
                            scale: 0.88,
                            onTap: () => Navigator.of(sheetCtx).pop(),
                            child: Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.14),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                CupertinoIcons.xmark,
                                size: 14,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      margin: const EdgeInsets.symmetric(horizontal: 20),
                      height: 0.5,
                      color: AppColors.hairline,
                    ),
                  ],
                ),
              ),
              SliverList.builder(
                itemCount: entries.length,
                itemBuilder: (_, i) {
                  final e = entries[i];
                  return _Press(
                    scale: 0.985,
                    onTap: () {
                      Navigator.of(sheetCtx).pop();
                      e.onTap();
                    },
                    child: Container(
                      height: 64,
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Row(
                        children: [
                          SizedBox(
                            width: e.isVideo ? 72 : 48,
                            height: 48,
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                _Img(
                                  e.coverUrl,
                                  radius: e.circular ? 24 : 6,
                                  circular: e.circular,
                                ),
                                if (e.isVideo)
                                  Center(
                                    child: Container(
                                      width: 24,
                                      height: 24,
                                      decoration: BoxDecoration(
                                        color: Colors.black.withValues(
                                          alpha: 0.55,
                                        ),
                                        shape: BoxShape.circle,
                                      ),
                                      child: const Icon(
                                        CupertinoIcons.play_fill,
                                        size: 11,
                                        color: Colors.white,
                                      ),
                                    ),
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
                                  e.title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 15.5,
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: -0.2,
                                  ),
                                ),
                                if (e.subtitle.isNotEmpty) ...[
                                  const SizedBox(height: 2),
                                  Text(
                                    e.subtitle,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: AppColors.textSecondary,
                                      fontSize: 13,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const Icon(
                            CupertinoIcons.chevron_right,
                            size: 14,
                            color: AppColors.textSecondary,
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
              SliverToBoxAdapter(
                child: SizedBox(
                  height: MediaQuery.paddingOf(sheetCtx).bottom + 24,
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

  void _menu(String name, List<Track> songs, String img) {
    HapticFeedback.selectionClick();
    final following = LibraryStore.instance.isFollowing(name);
    final audience = _audienceLine;
    ZenDropdown.show<void>(
      context: context,
      title: name,
      subtitle: audience.isNotEmpty ? audience : 'Artist',
      coverUrl: img,
      isCircularCover: true,
      shareText: '$name on Zenify',
      shareUrl: 'https://zenify.app/artist/${Uri.encodeComponent(name)}',
      items: [
        if (songs.isNotEmpty)
          ZenDropdownItem(
            title: 'Play Top Songs',
            icon: CupertinoIcons.play_fill,
            onTap: () => _play(songs, 0),
          ),
        if (songs.isNotEmpty)
          ZenDropdownItem(
            title: 'Shuffle Artist',
            icon: CupertinoIcons.shuffle,
            onTap: () => _play(songs, 0, shuffle: true),
          ),
        ZenDropdownItem(
          title: following ? 'Unfollow Artist' : 'Follow Artist',
          icon: following
              ? CupertinoIcons.person_crop_circle_badge_checkmark
              : CupertinoIcons.person_crop_circle_badge_plus,
          onTap: () => LibraryStore.instance.toggleFollow(name, img),
        ),
        ZenDropdownItem(
          title: 'Add to Story',
          icon: CupertinoIcons.paperplane_fill,
          onTap: () {
            Navigator.of(context, rootNavigator: true).push(
              CupertinoPageRoute(
                builder: (_) => StoryPreviewScreen(
                  content: ArtistStoryContent(
                    artistName: name,
                    coverUrl: img,
                    audience: audience.isNotEmpty ? audience : null,
                    topTracks: songs,
                    albumCovers:
                        _artistProfile?.albums
                            .map((a) => a.coverUrl)
                            .where((u) => u.isNotEmpty)
                            .toList() ??
                        const [],
                  ),
                ),
              ),
            );
          },
        ),
        ZenDropdownItem(
          title: 'Copy Artist Link',
          icon: CupertinoIcons.link,
          onTap: () => _share(name),
        ),
      ],
    );
  }

  /* -------------------------- derived data ----------------------- */
  static String _stripUnit(String s) => s
      .replaceAll(
        RegExp(r'\s*monthly\s*(listeners|audience)?', caseSensitive: false),
        '',
      )
      .replaceAll(RegExp(r'\s*(listeners|audience)', caseSensitive: false), '')
      .replaceAll(RegExp(r'\s*subscribers?', caseSensitive: false), '')
      .trim();

  String get _monthly => _artistProfile?.monthlyAudience ?? '';
  String get _subs {
    final s = _artistProfile?.subscriberCount ?? '';
    return s == 'Top Artist' ? '' : s;
  }

  /// Listeners when available; subscribers only if there are no listeners.
  /// Strictly prevents duplicate words like "monthly audience monthly listeners".
  String get _audienceLine {
    if (_monthly.isNotEmpty) {
      final clean = _stripUnit(_monthly);
      return clean.isNotEmpty ? '$clean monthly listeners' : '';
    }
    if (_subs.isNotEmpty) {
      final clean = _stripUnit(_subs);
      return clean.isNotEmpty ? '$clean subscribers' : '';
    }
    return '';
  }

  String get _statValue => _stripUnit(_monthly.isNotEmpty ? _monthly : _subs);
  String get _statLabel =>
      _monthly.isNotEmpty ? 'Monthly Listeners' : 'Subscribers';

  double _nameSize(String n) {
    final len = n.length;
    if (len <= 12) return 40;
    if (len <= 20) return 34;
    if (len <= 32) return 28;
    return 24;
  }

  /* ----------------------------- build ---------------------------- */
  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final width = MediaQuery.sizeOf(context).width;
    final screenH = MediaQuery.sizeOf(context).height;
    // Calculate natural height for hero image so 100% of the image is shown without cutting top, bottom or sides
    final naturalH = width / _imageAspectRatio;
    final heroImgH = naturalH.clamp(280.0, screenH * 0.78);
    final heroH = heroImgH;
    _heroH = heroH;

    final reduce = MediaQuery.disableAnimationsOf(context);
    final active = TickerMode.valuesOf(context).enabled;
    if (reduce != _reduceMotion || active != _routeActive) {
      _reduceMotion = reduce;
      _routeActive = active;
      WidgetsBinding.instance.addPostFrameCallback((_) => _syncMotion());
    }

    final rawCleaned = MediaNormalizer.stripIdNoise(
      MediaNormalizer.formatArtists(widget.artistName),
    );
    final name = (rawCleaned.isNotEmpty && !rawCleaned.startsWith('UC'))
        ? rawCleaned
        : (_artistProfile?.name.isNotEmpty == true
              ? _artistProfile!.name
              : (_tracks.isNotEmpty ? _tracks.first.artist : 'Artist'));
    final following = LibraryStore.instance.isFollowing(name);
    final curTrack = player.currentTrack;
    final curIsArtist =
        curTrack != null &&
        (curTrack.artist.toLowerCase().contains(name.toLowerCase()) ||
            curTrack.resolvedArtists.any(
              (a) => a.name.toLowerCase() == name.toLowerCase(),
            ));
    final isArtistPlaying = player.isPlaying && curIsArtist;

    final lower = name.toLowerCase();
    final own = _tracks
        .where((t) => t.artist.toLowerCase().contains(lower))
        .toList();
    final allSongs = own.isEmpty ? _tracks : own;
    final audioSongs = allSongs
        .where((t) =>
            !t.isVideo &&
            !Track.detectIsVideo(t.title, t.album) &&
            t.album.toLowerCase() != 'music video')
        .toList();
    final songs = audioSongs.take(_kSheetSongs).toList(); // sheet + queue
    final stackSongs = songs.take(_kStackSongs).toList(); // first section

    final map = <String, _Release>{};
    for (final t in allSongs) {
      final a = MediaNormalizer.cleanTitle(t.album);
      final key =
          (a.isEmpty ||
              a.toLowerCase() == 'single' ||
              MediaNormalizer.isMetadataNoise(a))
          ? MediaNormalizer.cleanCompactTitle(t.title)
          : a;
      map
          .putIfAbsent(
            key,
            () => _Release(key, MediaNormalizer.upgradeArtworkUrl(t.coverUrl)),
          )
          .tracks
          .add(t);
    }
    final rawAlbums = _artistProfile?.albums ?? const <ArtistReleaseItem>[];
    final rawSingles = _artistProfile?.singles ?? const <ArtistReleaseItem>[];
    final albums = rawAlbums
        .where(
          (a) =>
              a.type.toLowerCase() == 'album' &&
              !AlbumResolver.isSingleReleaseTitle(a.title),
        )
        .map(
          (a) => _Release(
            a.title,
            a.coverUrl,
            browseId: a.browseId,
            year: a.year,
            type: 'Album',
          ),
        )
        .toList();
    final seenSingleKeys = <String>{};
    final singles = <_Release>[];
    for (final s in [
      ...rawSingles.where((s) => s.type.toLowerCase() != 'album'),
      ...rawAlbums.where(
        (a) =>
            a.type.toLowerCase() != 'album' ||
            AlbumResolver.isSingleReleaseTitle(a.title),
      ),
    ]) {
      final key = (s.browseId != null && s.browseId!.isNotEmpty)
          ? s.browseId!
          : MediaNormalizer.cleanCompactTitle(s.title).toLowerCase();
      if (key.isEmpty || !seenSingleKeys.add(key)) continue;
      singles.add(
        _Release(
          s.title,
          s.coverUrl,
          browseId: s.browseId,
          year: s.year,
          type: s.type.toLowerCase() == 'ep' ? 'EP' : 'Single',
        ),
      );
    }
    final _Release? latest = albums.isNotEmpty
        ? albums.first
        : (singles.isNotEmpty ? singles.first : null);
    final profileVideos = _artistProfile?.musicVideos ?? const <Track>[];
    final extraVideos = _tracks
        .where((t) =>
            t.isVideo ||
            Track.detectIsVideo(t.title, t.album) ||
            t.album.toLowerCase() == 'music video')
        .toList();
    final seenVidIds = <String>{};
    final musicVideos = <Track>[];
    for (final v in [...profileVideos, ...extraVideos]) {
      if (seenVidIds.add(v.id)) musicVideos.add(v);
    }
    final videoTracks = musicVideos.map((v) {
      final cleanId = v.id.replaceFirst(RegExp(r'^(yt-|yt:)'), '');
      var art = _resolvedVideoArtists[cleanId] ?? v.artist;
      if (art.isEmpty ||
          art.toLowerCase() == 'unknown artist' ||
          MediaNormalizer.isDistributorOrLabel(art) ||
          MediaNormalizer.isNonArtistCreditSegment(art)) {
        art = MediaNormalizer.extractArtistsFromVideoTitle(
          v.title,
          defaultArtist: name,
        );
      }
      if (art.isEmpty) art = name;
      final resolvedTitle = _resolvedVideoTitles[cleanId];
      final cleanTitle = (resolvedTitle != null && resolvedTitle.isNotEmpty)
          ? resolvedTitle
          : MediaNormalizer.cleanVideoTitle(v.title, knownArtists: art);
      final resolvedYr = _resolvedVideoYears[cleanId] ?? v.year;
      return v.copyWith(
        isVideo: true,
        title: cleanTitle,
        artist: art,
        year: resolvedYr,
      );
    }).toList();
    final featuredPlaylists = _artistProfile?.featuredPlaylists ?? const [];

    String resolveVideoYear(Track vt) {
      final cleanId = vt.id.replaceFirst(RegExp(r'^(yt-|yt:)'), '');
      if (_resolvedVideoYears.containsKey(cleanId) && _resolvedVideoYears[cleanId]!.isNotEmpty) {
        return _resolvedVideoYears[cleanId]!;
      }
      if (vt.year != null && RegExp(r'\b(19\d{2}|20\d{2})\b').hasMatch(vt.year!)) {
        return RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(vt.year!)!.group(0)!;
      }
      final cleanVid = MediaNormalizer.cleanCompactTitle(vt.title).toLowerCase();
      for (final rel in [...singles, ...albums]) {
        final relTitle = MediaNormalizer.cleanCompactTitle(rel.title).toLowerCase();
        if (rel.year.isNotEmpty && (cleanVid.contains(relTitle) || relTitle.contains(cleanVid))) {
          final m = RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(rel.year);
          if (m != null) return m.group(0)!;
        }
      }
      for (final tr in _tracks) {
        if (tr.year != null && tr.year!.isNotEmpty) {
          final trTitle = MediaNormalizer.cleanCompactTitle(tr.title).toLowerCase();
          if (cleanVid.contains(trTitle) || trTitle.contains(cleanVid)) {
            final m = RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(tr.year!);
            if (m != null) return m.group(0)!;
          }
        }
      }
      final inTitle = RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(vt.title);
      if (inTitle != null) return inTitle.group(0)!;
      final inAlbum = RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(vt.album);
      if (inAlbum != null) return inAlbum.group(0)!;

      // Schedule background resolution once if not already attempted for this videoId
      if (cleanId.isNotEmpty &&
          !_attemptedVideoIds.contains(cleanId) &&
          !_resolvingVideoIds.contains(cleanId)) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _resolveVideosMetadata([vt]);
        });
      }
      return '';
    }

    final related =
        _artistProfile != null && _artistProfile!.relatedArtists.isNotEmpty
        ? _artistProfile!.relatedArtists
        : const <RelatedArtistItem>[];

    final rawImg =
        _resolvedImage ??
        widget.imageUrl ??
        (_tracks.isNotEmpty ? _tracks.first.coverUrl : '');
    final img = rawImg.isNotEmpty
        ? MediaNormalizer.upgradeArtworkUrl(rawImg, isArtistAvatar: true)
        : '';
    final rawBanner =
        _resolvedBanner ??
        _resolvedImage ??
        widget.imageUrl ??
        (img.isNotEmpty ? img : '');
    final bannerImg = rawBanner.isNotEmpty
        ? resolveFullArtistHeroUrl(rawBanner)
        : '';

    if (_coverKey != bannerImg && bannerImg.isNotEmpty) {
      _coverKey = bannerImg;
      _resolveImageDimensions(bannerImg);
      _extractTint(bannerImg);
      _detectAnimated(bannerImg);
    }

    final bio = _parseBio((_resolvedBio ?? widget.bio ?? '').trim(), name);
    final audience = _audienceLine;
    // Keep seamless zero-gap spacing: content begins directly at the bottom edge of the image
    final heroSpace = heroImgH;

    return Scaffold(
      backgroundColor: Colors.black,
      body: TweenAnimationBuilder<Color?>(
        tween: ColorTween(end: _tint),
        duration: const Duration(milliseconds: 900),
        curve: Curves.easeOutCubic,
        builder: (context, c, _) {
          // very dark take on the image colour: tint without losing the black look
          final base = Color.lerp(c ?? _tint, Colors.black, 0.78)!;
          return Stack(
            children: [
              _backdrop(base, heroH),
              _heroArt(base, heroH, heroImgH, bannerImg, img),
              NotificationListener<ScrollNotification>(
                onNotification: _onScrollNote,
                child: CustomScrollView(
                  controller: _sc,
                  physics: const BouncingScrollPhysics(
                    parent: AlwaysScrollableScrollPhysics(),
                  ),
                  slivers: [
                    // ───────── Hero text + actions ─────────
                    SliverToBoxAdapter(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(height: heroSpace),
                          _Reveal(
                            delay: const Duration(milliseconds: 120),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 20,
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    name,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: _nameSize(name),
                                      height: 1.06,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: -1.0,
                                    ),
                                  ),
                                  if (audience.isNotEmpty) ...[
                                    const SizedBox(height: 5),
                                    AnimatedSwitcher(
                                      duration: const Duration(
                                        milliseconds: 300,
                                      ),
                                      child: Text(
                                        audience,
                                        key: ValueKey(audience),
                                        style: TextStyle(
                                          color: Colors.white.withValues(
                                            alpha: 0.7,
                                          ),
                                          fontSize: 14,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          // Shuffle · Play · Follow
                          _Reveal(
                            delay: const Duration(milliseconds: 220),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 20,
                              ),
                              child: Row(
                                children: [
                                  _ActionCircle(
                                    icon: CupertinoIcons.shuffle,
                                    active: player.isShuffle,
                                    onTap: () {
                                      HapticFeedback.selectionClick();
                                      if (isArtistPlaying) {
                                        player.toggleShuffle();
                                      } else {
                                        _play(songs, 0, shuffle: true);
                                      }
                                    },
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: _PlayPill(
                                      isPlaying: isArtistPlaying,
                                      onTap: () {
                                        HapticFeedback.selectionClick();
                                        if (isArtistPlaying) {
                                          player.pause();
                                        } else if (curIsArtist) {
                                          player.resume();
                                        } else {
                                          _play(songs, 0);
                                        }
                                      },
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  _FollowCircle(
                                    following: following,
                                    onTap: () {
                                      HapticFeedback.mediumImpact();
                                      LibraryStore.instance.toggleFollow(
                                        name,
                                        img,
                                      );
                                    },
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    // ───────── Body ─────────
                    SliverToBoxAdapter(
                      child: ColoredBox(
                        color: Colors.black,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (_loading)
                              const Padding(
                                padding: EdgeInsets.only(top: 28),
                                child: _Skeleton(),
                              )
                            else if (songs.isEmpty)
                              const Padding(
                                padding: EdgeInsets.all(40),
                                child: Center(
                                  child: Text(
                                    'No tracks found for this artist.',
                                    style: TextStyle(
                                      color: AppColors.textSecondary,
                                    ),
                                  ),
                                ),
                              )
                            else ...[
                              if (latest != null) ...[
                                const _SecHeader('Latest Release'),
                                _LatestRelease(
                                  release: latest,
                                  subtitle: latest.year.isNotEmpty
                                      ? '${latest.type} · ${latest.year}'
                                      : (latest.tracks.length < 3
                                            ? 'Single'
                                            : 'Album · ${latest.tracks.length} songs'),
                                  onTap: () => _openAlbum(latest),
                                ),
                              ],

                              // Top Songs: swipeable stack of 15
                              _SecHeader(
                                'Top Songs',
                                onSeeAll: () => _showAllSongs(songs, name),
                              ),
                              _TopSongsStack(
                                songs: stackSongs,
                                curId: curTrack?.id,
                                isPlaying: player.isPlaying,
                                onPlay: (i) => _play(songs, i),
                              ),

                              if (albums.isNotEmpty) ...[
                                _SecHeader(
                                  'Albums',
                                  onSeeAll: () => _showAllSection(
                                    title: 'Albums',
                                    subtitle:
                                        '$name · ${albums.length} ${albums.length == 1 ? 'album' : 'albums'}',
                                    entries: [
                                      for (final a in albums)
                                        _ArtistSheetEntry(
                                          title:
                                              MediaNormalizer.cleanAlbumTitle(
                                                a.title,
                                              ),
                                          subtitle: a.year.isNotEmpty
                                              ? a.year
                                              : 'Album',
                                          coverUrl: a.cover,
                                          onTap: () => _openAlbum(a),
                                        ),
                                    ],
                                  ),
                                ),
                                _Shelf(
                                  count: albums.length,
                                  builder: (i) => _Cover(
                                    url: albums[i].cover,
                                    title: MediaNormalizer.cleanAlbumTitle(
                                      albums[i].title,
                                    ),
                                    subtitle: albums[i].year.isNotEmpty
                                        ? albums[i].year
                                        : 'Album',
                                    onTap: () => _openAlbum(albums[i]),
                                  ),
                                ),
                              ],

                              if (singles.isNotEmpty) ...[
                                _SecHeader(
                                  'Singles & EPs',
                                  onSeeAll: () => _showAllSection(
                                    title: 'Singles & EPs',
                                    subtitle:
                                        '$name · ${singles.length} ${singles.length == 1 ? 'release' : 'releases'}',
                                    entries: [
                                      for (final s in singles)
                                        _ArtistSheetEntry(
                                          title:
                                              MediaNormalizer.cleanCompactTitle(
                                                s.title,
                                              ),
                                          subtitle: s.year.isNotEmpty
                                              ? '${s.type} · ${s.year}'
                                              : (s.tracks.length == 1
                                                    ? 'Single'
                                                    : 'EP'),
                                          coverUrl: s.cover,
                                          onTap: () => _openAlbum(s),
                                        ),
                                    ],
                                  ),
                                ),
                                _Shelf(
                                  count: singles.length,
                                  builder: (i) => _Cover(
                                    url: singles[i].cover,
                                    title: MediaNormalizer.cleanCompactTitle(
                                      singles[i].title,
                                    ),
                                    subtitle: singles[i].year.isNotEmpty
                                        ? '${singles[i].type} · ${singles[i].year}'
                                        : (singles[i].tracks.length == 1
                                              ? 'Single'
                                              : 'EP'),
                                    onTap: () => _openAlbum(singles[i]),
                                  ),
                                ),
                              ],

                              if (musicVideos.isNotEmpty) ...[
                                _SecHeader(
                                  'Music Videos',
                                  onSeeAll: musicVideos.length > 2
                                      ? () => _showAllSection(
                                          title: 'Music Videos',
                                          subtitle:
                                              '$name · ${musicVideos.length} ${musicVideos.length == 1 ? 'video' : 'videos'}',
                                          entries: [
                                            for (
                                              var idx = 0;
                                              idx < videoTracks.length;
                                              idx++
                                            )
                                              _ArtistSheetEntry(
                                                title:
                                                    MediaNormalizer.cleanVideoTitle(
                                                      videoTracks[idx].title,
                                                      knownArtists:
                                                          videoTracks[idx].artist,
                                                    ),
                                                subtitle: resolveVideoYear(
                                                  videoTracks[idx],
                                                ),
                                                coverUrl:
                                                    videoTracks[idx].coverUrl,
                                                isVideo: true,
                                                onTap: () =>
                                                    _play(videoTracks, idx),
                                              ),
                                          ],
                                        )
                                      : null,
                                ),
                                _VideoShelf(
                                  count: videoTracks.length,
                                  builder: (i) => _VideoCard(track: videoTracks[i], fallbackYear: resolveVideoYear(videoTracks[i]), onTap: () => _play(videoTracks, i)),
                                ),
                              ],

                              if (featuredPlaylists.isNotEmpty) ...[
                                _SecHeader(
                                  'Featured On',
                                  onSeeAll: () => _showAllSection(
                                    title: 'Featured On',
                                    subtitle: 'Playlists featuring $name',
                                    entries: [
                                      for (final p in featuredPlaylists)
                                        _ArtistSheetEntry(
                                          title: p.title,
                                          subtitle: p.subtitle ?? 'Playlist',
                                          coverUrl: p.coverUrl,
                                          onTap: () => Navigator.push(
                                            context,
                                            ZenPageRoute(
                                              builder: (_) => AlbumScreen(
                                                albumTitle: p.title,
                                                artistName: name,
                                                coverUrl: p.coverUrl,
                                                browseId: p.browseId,
                                              ),
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                _Shelf(
                                  count: featuredPlaylists.length,
                                  builder: (i) => _Cover(
                                    url: featuredPlaylists[i].coverUrl,
                                    title: featuredPlaylists[i].title,
                                    subtitle:
                                        featuredPlaylists[i].subtitle ??
                                        'Playlist',
                                    onTap: () => Navigator.push(
                                      context,
                                      ZenPageRoute(
                                        builder: (_) => AlbumScreen(
                                          albumTitle:
                                              featuredPlaylists[i].title,
                                          artistName: name,
                                          coverUrl:
                                              featuredPlaylists[i].coverUrl,
                                          browseId:
                                              featuredPlaylists[i].browseId,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ],

                              if (related.isNotEmpty) ...[
                                _SecHeader(
                                  'Fans Might Also Like',
                                  onSeeAll: () => _showAllSection(
                                    title: 'Fans Might Also Like',
                                    subtitle: 'Similar to $name',
                                    entries: [
                                      for (final r in related)
                                        _ArtistSheetEntry(
                                          title: r.name,
                                          subtitle: 'Artist',
                                          coverUrl: r.imageUrl,
                                          circular: true,
                                          onTap: () => Navigator.push(
                                            context,
                                            ZenPageRoute(
                                              builder: (_) => ArtistScreen(
                                                artistName: r.name,
                                                browseId:
                                                    (r.browseId != null &&
                                                        r.browseId!.isNotEmpty)
                                                    ? r.browseId
                                                    : null,
                                                imageUrl: r.imageUrl.isNotEmpty
                                                    ? r.imageUrl
                                                    : null,
                                              ),
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                _Shelf(
                                  count: related.length,
                                  builder: (i) => _Cover(
                                    url: related[i].imageUrl,
                                    title: related[i].name,
                                    subtitle: 'Artist',
                                    circular: true,
                                    onTap: () => Navigator.push(
                                      context,
                                      ZenPageRoute(
                                        builder: (_) => ArtistScreen(
                                          artistName: related[i].name,
                                          browseId:
                                              (related[i].browseId != null &&
                                                  related[i]
                                                      .browseId!
                                                      .isNotEmpty)
                                              ? related[i].browseId
                                              : null,
                                          imageUrl:
                                              related[i].imageUrl.isNotEmpty
                                              ? related[i].imageUrl
                                              : null,
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ],

                              if (bio.text.isNotEmpty ||
                                  _statValue.isNotEmpty) ...[
                                const _SecHeader('About'),
                                _AboutCard(
                                  imageUrl: bannerImg.isNotEmpty
                                      ? bannerImg
                                      : (img.isNotEmpty ? img : ''),
                                  statValue: _statValue,
                                  statLabel: _statLabel,
                                  bio: bio,
                                ),
                              ],
                            ],
                            SizedBox(
                              height: 180 + MediaQuery.paddingOf(context).bottom,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: DynamicIslandHeader(
                  title: name,
                  showBack: true,
                  scrollController: _sc,
                  revealOffset: heroSpace - 40,
                  onBack: () => Navigator.pop(context),
                  onMore: () => _menu(name, songs, img),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  /* ------------------------- hero layers ------------------------- */

  /// Tinted page background: moves 1:1 with the content, melts into black
  /// below the hero and slowly breathes.
  Widget _backdrop(Color base, double heroH) {
    const extra = 1200.0;
    final h = extra + heroH + 600;
    final stops = [
      0.0,
      (extra + heroH * 0.4) / h,
      (extra + heroH * 0.75) / h,
      1.0,
    ];
    return Positioned(
      top: -extra,
      left: 0,
      right: 0,
      height: h,
      child: AnimatedBuilder(
        animation: Listenable.merge([_sc, _glow]),
        builder: (context, child) {
          final b = _breathe(base);
          return Transform.translate(
            offset: Offset(0, -_offset),
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    b,
                    b.withValues(alpha: 0.6),
                    Colors.black,
                    Colors.black,
                  ],
                  stops: stops,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  /// Full-bleed image: slow drift + tilt parallax, liquid edge into the tint.
  Widget _fullArt(
    Color base,
    double heroH,
    double heroImgH,
    String banner,
    String avatar,
  ) {
    final quickPreviewUrl = (widget.imageUrl != null &&
            widget.imageUrl!.isNotEmpty &&
            widget.imageUrl != banner)
        ? widget.imageUrl!
        : ((avatar.isNotEmpty && avatar != banner) ? avatar : '');

    final Widget imageWidget;
    if (banner.isEmpty) {
      imageWidget = quickPreviewUrl.isNotEmpty
          ? CachedNetworkImage(
              imageUrl: quickPreviewUrl,
              fit: BoxFit.cover,
              width: double.infinity,
              height: heroImgH,
              alignment: Alignment.topCenter,
              fadeInDuration: Duration.zero,
              placeholder: (c, u) => const ColoredBox(color: Colors.black),
              errorWidget: (c, u, e) => const ColoredBox(color: Colors.black),
            )
          : const ColoredBox(color: Colors.black);
    } else {
      imageWidget = Stack(
        fit: StackFit.expand,
        children: [
          if (quickPreviewUrl.isNotEmpty)
            CachedNetworkImage(
              imageUrl: quickPreviewUrl,
              fit: BoxFit.cover,
              width: double.infinity,
              height: heroImgH,
              alignment: Alignment.topCenter,
              fadeInDuration: Duration.zero,
              placeholder: (c, u) => const ColoredBox(color: Colors.black),
              errorWidget: (c, u, e) => const ColoredBox(color: Colors.black),
            ),
          CachedNetworkImage(
            imageUrl: banner,
            fit: BoxFit.cover,
            width: double.infinity,
            height: heroImgH,
            alignment: Alignment.topCenter,
            useOldImageOnUrlChange: true,
            fadeInDuration: const Duration(milliseconds: 180),
            placeholder: (c, u) => quickPreviewUrl.isNotEmpty
                ? const SizedBox.shrink()
                : const ColoredBox(color: Colors.black),
            errorWidget: (c, u, e) => banner != avatar && avatar.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: avatar,
                    fit: BoxFit.cover,
                    width: double.infinity,
                    height: heroImgH,
                    alignment: Alignment.topCenter,
                    errorWidget: (_, _, _) => const ColoredBox(color: Colors.black),
                  )
                : (quickPreviewUrl.isNotEmpty
                    ? const SizedBox.shrink()
                    : const ColoredBox(color: Colors.black)),
          ),
        ],
      );
    }

    final media = RepaintBoundary(
      child: Transform.scale(
        scaleX: 1.0, // strictly 1.0: zero horizontal zoom or side-crop
        scaleY: 1.0, // strictly 1.0: zero top/bottom cut
        alignment: Alignment.center,
        child: imageWidget,
      ),
    );

    return SizedBox(
      height: heroH,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: heroImgH,
            child: AnimatedBuilder(
              animation: Listenable.merge([_live, _tilt]),
              child: media,
              builder: (_, child) {
                final a = _live.value * math.pi;
                final t = _tilt.value;
                final d = !_animatedCover;
                final dx = (d ? math.cos(a) * 4 : 0.0) - t.dx * 6;
                final dy = (d ? math.cos(2 * a) * 2 : 0.0) + t.dy * 3;
                return Transform.translate(
                  offset: Offset(dx, dy),
                  child: child,
                );
              },
            ),
          ),
          // status-bar scrim
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: 80,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.35),
                    Colors.transparent,
                  ],
                  stops: const [0.0, 1.0],
                ),
              ),
            ),
          ),
          // Subtle soft feather at the bottom of the image into page background
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            height: 16.0,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.45),
                    Colors.black,
                  ],
                  stops: const [0.0, 0.5, 1.0],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Scrolling gradually blurs the image, pushes it back (parallax + soft
  /// zoom) and dissolves it into the backdrop. Pulling down stretches it.
  Widget _heroArt(
    Color base,
    double heroH,
    double heroImgH,
    String banner,
    String avatar,
  ) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      height: heroH,
      child: ClipRect(
        child: ColoredBox(
          color: Colors.black,
          child: AnimatedBuilder(
            animation: _sc,
            child: RepaintBoundary(
              child: _fullArt(base, heroH, heroImgH, banner, avatar),
            ),
            builder: (_, child) {
              final o = _offset;
              final p = (o / (heroImgH * 0.7)).clamp(0.0, 1.0).toDouble();
              final e = Curves.easeInOut.transform(p);
              final sigma = e * 28;
              final over = o < 0 ? -o : 0.0;
              final scale = 1.0 + (over > 0 ? over / (heroImgH * 1.5) : 0.0);

              Widget w = child!;
              if (sigma > 0.4) {
                w = ImageFiltered(
                  imageFilter: ui.ImageFilter.blur(
                    sigmaX: sigma,
                    sigmaY: sigma,
                    tileMode: TileMode.clamp,
                  ),
                  child: w,
                );
              }
              w = Transform.scale(
                scale: scale,
                alignment: Alignment.topCenter,
                child: w,
              );
              w = Transform.translate(
                offset: Offset(0, o > 0 ? -o * 0.45 : 0),
                child: w,
              );

              // Smoothly cover with solid black only when scrolling past the hero into content, so image stays 100% crisp at rest
              final blackCover = ((o - (heroImgH * 0.4)) / (heroImgH * 0.5))
                  .clamp(0.0, 1.0)
                  .toDouble();
              if (blackCover > 0.0) {
                w = Stack(
                  fit: StackFit.expand,
                  children: [
                    w,
                    ColoredBox(
                      color: Colors.black.withValues(alpha: blackCover),
                    ),
                  ],
                );
              }
              return w;
            },
          ),
        ),
      ),
    );
  }
}
