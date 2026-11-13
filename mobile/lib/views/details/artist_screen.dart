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
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../features/story_sharing/story_sharing.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/api_service.dart';
import '../../services/artist_service.dart';
import '../../services/innertube_service.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';
import 'album_screen.dart';

/* ------------------------------------------------------------------ */
/*  Shared sizes & colours                                              */
/* ------------------------------------------------------------------ */
const double _kCover = 150;
const double _kGap = 14;
const double _kExtent = _kCover + _kGap;
const double _kShelfH = 214;
const double _kRowH = 60;
const int _kStackSongs = 15;
const int _kSheetSongs = 50;

/// Apple Music rose.
const Color _kRose = Color(0xFFFF375F);

/// Apple-style continuous (squircle) corners.
ShapeBorder _sq(double r, {BorderSide side = BorderSide.none}) =>
    ContinuousRectangleBorder(borderRadius: BorderRadius.circular(r * 2), side: side);

/* ------------------------------------------------------------------ */
/*  Motion primitives                                                   */
/* ------------------------------------------------------------------ */
const _kPress = SpringDescription(mass: 1, stiffness: 430, damping: 21);
const _kReveal = SpringDescription(mass: 1, stiffness: 170, damping: 26);

class _SpringCurve extends Curve {
  const _SpringCurve();
  static final _sim = SpringSimulation(const SpringDescription(mass: 1, stiffness: 200, damping: 17), 0, 1, 0);
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
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 1);
  void _to(double v) => _c.animateWith(SpringSimulation(_kPress, _c.value, v, 0));

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
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 0);
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
          child: Transform.translate(offset: Offset(0, (1 - _c.value) * 14), child: child),
        ),
      );
}

/// Horizontal shelf settles on a card with a spring.
class _SnapPhysics extends ScrollPhysics {
  const _SnapPhysics({super.parent, required this.itemExtent});
  final double itemExtent;

  @override
  _SnapPhysics applyTo(ScrollPhysics? ancestor) => _SnapPhysics(parent: buildParent(ancestor), itemExtent: itemExtent);

  @override
  SpringDescription get spring => SpringDescription.withDampingRatio(mass: 0.5, stiffness: 120, ratio: 1.05);

  @override
  Simulation? createBallisticSimulation(ScrollMetrics m, double velocity) {
    if ((velocity <= 0 && m.pixels <= m.minScrollExtent) || (velocity >= 0 && m.pixels >= m.maxScrollExtent)) {
      return super.createBallisticSimulation(m, velocity);
    }
    final page = m.pixels / itemExtent;
    final tol = toleranceFor(m).velocity;
    final t = velocity < -tol ? page.floorToDouble() : velocity > tol ? page.ceilToDouble() : page.roundToDouble();
    final target = (t * itemExtent).clamp(m.minScrollExtent, m.maxScrollExtent).toDouble();
    if ((target - m.pixels).abs() < 0.5) return null;
    return ScrollSpringSimulation(spring, m.pixels, target, velocity, tolerance: toleranceFor(m));
  }

  @override
  bool get allowImplicitScrolling => false;
}

/* ------------------------------------------------------------------ */
/*  Small widgets                                                       */
/* ------------------------------------------------------------------ */
class _Img extends StatelessWidget {
  const _Img(this.url, {this.radius = 10, this.circular = false});
  final String url;
  final double radius;
  final bool circular;

  @override
  Widget build(BuildContext context) {
    final resolved = MediaNormalizer.upgradeArtworkUrl(url, isArtistAvatar: circular);
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
                child: Icon(circular ? CupertinoIcons.person_fill : CupertinoIcons.music_note, color: AppColors.textTertiary),
              ),
            ),
          );
        }
        return Container(
          color: AppColors.surface2,
          child: Icon(circular ? CupertinoIcons.person_fill : CupertinoIcons.music_note, color: AppColors.textTertiary),
        );
      },
    );
    if (circular) return ClipOval(child: img);
    return ClipPath(clipper: ShapeBorderClipper(shape: _sq(radius)), child: img);
  }
}

class _Eq extends StatefulWidget {
  const _Eq({required this.playing});
  final bool playing;

  @override
  State<_Eq> createState() => _EqState();
}

class _EqState extends State<_Eq> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

  @override
  void initState() {
    super.initState();
    if (widget.playing) _c.repeat();
  }

  @override
  void didUpdateWidget(covariant _Eq old) {
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
  Widget build(BuildContext context) => AnimatedBuilder(
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
              height: 14 * v,
              margin: const EdgeInsets.only(right: 2),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(1.5)),
            );
          }),
        ),
      );
}

class _Skeleton extends StatefulWidget {
  const _Skeleton();

  @override
  State<_Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<_Skeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, child) => Opacity(opacity: 0.35 + 0.35 * _c.value, child: child),
        child: Column(
          children: List.generate(
            4,
            (i) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(
                children: [
                  Container(width: 44, height: 44, decoration: ShapeDecoration(color: Colors.white24, shape: _sq(8))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          height: 12,
                          width: 150 + (i % 3) * 30.0,
                          decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(6)),
                        ),
                        const SizedBox(height: 8),
                        Container(
                          height: 10,
                          width: 90,
                          decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(5)),
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

class _SecHeader extends StatelessWidget {
  const _SecHeader(this.title, {this.onSeeAll});
  final String title;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 28, 12, 10),
        child: Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.4),
              ),
            ),
            if (onSeeAll != null)
              _Press(
                scale: 0.92,
                onTap: onSeeAll,
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  child: Text('See All', style: TextStyle(color: _kRose, fontSize: 15, fontWeight: FontWeight.w500)),
                ),
              ),
          ],
        ),
      );
}

/// Frosted-glass container (back / more buttons).
class _Glass extends StatelessWidget {
  const _Glass({required this.child, this.width, this.height = 40});
  final Widget child;
  final double? width;
  final double height;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(height / 2),
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
          child: Container(
            width: width,
            height: height,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(height / 2),
              border: Border.all(color: Colors.white.withValues(alpha: 0.14), width: 0.5),
            ),
            child: child,
          ),
        ),
      );
}

/// Round translucent button used in the action row.
class _ActionCircle extends StatelessWidget {
  const _ActionCircle({required this.icon, required this.onTap, this.active = false});
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
            child: Icon(icon, key: ValueKey(icon), size: 20, color: active ? _kRose : Colors.white),
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
            transitionBuilder: (c, a) => ScaleTransition(scale: a, child: FadeTransition(opacity: a, child: c)),
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
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
          alignment: Alignment.center,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(isPlaying ? CupertinoIcons.pause_fill : CupertinoIcons.play_fill, color: Colors.black, size: 17),
              const SizedBox(width: 7),
              Text(
                isPlaying ? 'Pause' : 'Play',
                style: const TextStyle(color: Colors.black, fontSize: 17, fontWeight: FontWeight.w600),
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
    final shadow = [BoxShadow(color: Colors.black.withValues(alpha: 0.28), blurRadius: 10, offset: const Offset(0, 4))];
    final align = circular ? TextAlign.center : TextAlign.start;
    return _Press(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: circular ? CrossAxisAlignment.center : CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: DecoratedBox(
              decoration: circular
                  ? BoxDecoration(shape: BoxShape.circle, boxShadow: shadow)
                  : ShapeDecoration(shape: _sq(8), shadows: shadow),
              child: _Img(url, circular: circular, radius: 8),
            ),
          ),
          const SizedBox(height: 9),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: align,
            style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.3, fontWeight: FontWeight.w500, letterSpacing: -0.15),
          ),
          Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: align,
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, height: 1.3),
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
  Widget build(BuildContext context) => SizedBox(
        height: _kShelfH,
        child: ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          physics: const _SnapPhysics(parent: BouncingScrollPhysics(), itemExtent: _kExtent),
          itemExtent: _kExtent,
          itemCount: count,
          itemBuilder: (_, i) => Padding(padding: const EdgeInsets.only(right: _kGap), child: builder(i)),
        ),
      );
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
                            decoration: ShapeDecoration(color: Colors.black.withValues(alpha: 0.5), shape: _sq(7)),
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
                      child: Icon(CupertinoIcons.ellipsis_vertical, color: Colors.white.withValues(alpha: 0.6), size: 18),
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
  const _TopSongsStack({required this.songs, required this.curId, required this.isPlaying, required this.onPlay});
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
  const _LatestRelease({required this.release, required this.subtitle, required this.onTap});
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
              SizedBox(width: 72, height: 72, child: _Img(release.cover, radius: 8)),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      release.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w500, letterSpacing: -0.25),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                    ),
                  ],
                ),
              ),
              const Icon(CupertinoIcons.chevron_right, size: 14, color: AppColors.textTertiary),
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
  final urls = urlRe.allMatches(raw).map((m) => m.group(0)!.replaceAll(RegExp(r'[.,;]+$'), '')).toList();
  final mentionsWiki = RegExp('wikipedia', caseSensitive: false).hasMatch(raw);

  var text = raw.replaceAll(RegExp(r'\s*From Wikipedia[\s\S]*$', caseSensitive: false), '');
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
    wiki = 'https://en.wikipedia.org/w/index.php?search=${Uri.encodeQueryComponent(name)}';
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
          decoration: ShapeDecoration(color: Colors.white.withValues(alpha: 0.08), shape: const StadiumBorder()),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(CupertinoIcons.link, size: 14, color: _kRose),
              const SizedBox(width: 6),
              Text(link.label, style: const TextStyle(color: _kRose, fontSize: 13, fontWeight: FontWeight.w600)),
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
              AspectRatio(aspectRatio: 1.45, child: _Img(widget.imageUrl, radius: 0)),
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
                          style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w700, letterSpacing: -0.8),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        widget.statLabel,
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w500),
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
                                overflow: _open ? TextOverflow.visible : TextOverflow.ellipsis,
                                style: TextStyle(color: Colors.white.withValues(alpha: 0.86), fontSize: 15, height: 1.4),
                              ),
                              if (canExpand) ...[
                                const SizedBox(height: 8),
                                Text(
                                  _open ? 'Less' : 'More',
                                  style: const TextStyle(color: _kRose, fontSize: 15, fontWeight: FontWeight.w600),
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
                      const Text('Source', style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [for (final l in widget.bio.links) _LinkChip(link: l)],
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
  _Release(this.title, this.cover, {this.browseId, this.year = '', this.type = 'Album'});
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

class _ArtistScreenState extends State<ArtistScreen> with TickerProviderStateMixin {
  final _sc = ScrollController();
  List<Track> _tracks = [];
  ArtistProfile? _artistProfile;
  bool _loading = true;
  String? _resolvedImage;
  String? _resolvedBanner;
  String? _resolvedBio;

  // ---- Living cover (same behaviour as the album page) ----
  /// Flip to -1 if the tilt parallax feels inverted on your device.
  static const double _kTiltSign = 1;
  late final AnimationController _live =
      AnimationController(vsync: this, duration: const Duration(seconds: 24));
  late final AnimationController _glow =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 5200));
  final ValueNotifier<Offset> _tilt = ValueNotifier(Offset.zero);
  StreamSubscription<AccelerometerEvent>? _accel;
  Offset? _neutral;
  Color _tint = const Color(0xFF3A3A3C);
  String? _coverKey;
  bool _animatedCover = false;
  bool _reduceMotion = false;
  bool _routeActive = true;
  bool _scrolling = false;
  bool _heroVisible = true;
  double _heroH = 460;

  @override
  void initState() {
    super.initState();
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
  /// hero is off-screen; drift/breathing also rest while scrolling.
  void _syncMotion() {
    if (!mounted) return;
    final canRun = !_reduceMotion && _routeActive && _heroVisible;
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

  void _startTilt() {
    if (_accel != null) return;
    try {
      _accel = accelerometerEventStream(samplingPeriod: SensorInterval.gameInterval).listen(
        (e) {
          final n = _neutral ??= Offset(e.x, e.y);
          _neutral = Offset(n.dx + (e.x - n.dx) * 0.004, n.dy + (e.y - n.dy) * 0.004);
          final tx = ((e.x - n.dx) / 4.5 * _kTiltSign).clamp(-1.0, 1.0).toDouble();
          final ty = ((e.y - n.dy) / 4.5 * _kTiltSign).clamp(-1.0, 1.0).toDouble();
          final c = _tilt.value;
          _tilt.value = Offset(c.dx + (tx - c.dx) * 0.12, c.dy + (ty - c.dy) * 0.12);
        },
        onError: (_) {},
      );
    } catch (_) {}
  }

  void _stopTilt() {
    _accel?.cancel();
    _accel = null;
  }

  Color _breathe(Color base) => Color.lerp(base, _tint, 0.2 * Curves.easeInOut.transform(_glow.value))!;

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
      final img = await _loadImage(ResizeImage(CachedNetworkImageProvider(url), width: 16, height: 16));
      if (img == null) return;
      final bd = await img.toByteData(format: ui.ImageByteFormat.rawRgba);
      img.dispose();
      if (bd == null) return;
      double r = 0, g = 0, b = 0, w = 0;
      for (var i = 0; i + 3 < bd.lengthInBytes; i += 4) {
        final pr = bd.getUint8(i).toDouble(), pg = bd.getUint8(i + 1).toDouble(), pb = bd.getUint8(i + 2).toDouble();
        final mx = math.max(pr, math.max(pg, pb)), mn = math.min(pr, math.min(pg, pb));
        final sat = mx == 0 ? 0.0 : (mx - mn) / mx;
        final weight = 0.2 + sat * 2.0;
        r += pr * weight;
        g += pg * weight;
        b += pb * weight;
        w += weight;
      }
      if (w == 0) return;
      final hsl = HSLColor.fromColor(Color.fromARGB(255, (r / w).round(), (g / w).round(), (b / w).round()));
      final tuned = hsl
          .withSaturation(hsl.saturation.clamp(0.25, 0.7).toDouble())
          .withLightness(hsl.lightness.clamp(0.30, 0.46).toDouble())
          .toColor();
      if (mounted && _coverKey == url) setState(() => _tint = tuned);
    } catch (_) {}
  }

  /// If the image is already an animated GIF / WebP, skip the fake drift.
  Future<void> _detectAnimated(String url) async {
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
      final info = await ArtistService.instance
          .getArtist(widget.artistName, browseId: widget.browseId)
          .timeout(const Duration(seconds: 5), onTimeout: () => null);
      if (info != null && (info.topSongs.isNotEmpty || info.albums.isNotEmpty)) {
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
        _fillSongs();
        return;
      }

      final r = await InnerTubeService.instance
          .search(widget.artistName)
          .timeout(const Duration(seconds: 4), onTimeout: () => const []);
      if (r.isNotEmpty && mounted) {
        setState(() {
          _tracks = r;
          _loading = false;
        });
        _fillSongs();
        return;
      }

      // Resilient cloud fallback
      final cloud = await ApiService.search(widget.artistName).timeout(const Duration(seconds: 4), onTimeout: () => const []);
      if (mounted) {
        setState(() {
          _tracks = cloud;
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
        final r = await InnerTubeService.instance.search(q).timeout(const Duration(seconds: 3), onTimeout: () => const []);
        for (final s in r) {
          if (songs.length >= _kSheetSongs) break;
          if (s.artist.toLowerCase().contains(lower) && seen.add(s.id)) songs.add(s);
        }
      } catch (_) {}
    }
    if (mounted && songs.length > _tracks.length) setState(() => _tracks = songs);
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

  void _openAlbum(_Release r) => Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) => AlbumScreen(
            albumTitle: MediaNormalizer.stripIdNoise(r.title),
            artistName: MediaNormalizer.stripIdNoise(widget.artistName),
            coverUrl: r.cover,
            browseId: r.browseId,
          ),
        ),
      );

  void _share(String name) {
    HapticFeedback.selectionClick();
    Clipboard.setData(ClipboardData(text: name));
    IslandNotifier.instance.show(
      IslandNotification(
        id: 'copy_artist_${DateTime.now().millisecondsSinceEpoch}',
        title: 'Copied',
        body: name,
        leading: const Icon(CupertinoIcons.link, color: Color(0xFFE11D48), size: 18),
      ),
    );
  }

  /// Bottom sheet with up to 50 songs (the stack's songs come first).
  void _showAllSongs(List<Track> list, String name) {
    HapticFeedback.selectionClick();
    final player = context.read<PlayerState>();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => DraggableScrollableSheet(
        initialChildSize: 0.9,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (_, sc) => Container(
          decoration: const BoxDecoration(
            color: Color(0xFF1C1C1E),
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: ListenableBuilder(
            listenable: player,
            builder: (_, __) {
              final cur = player.currentTrack?.id;
              return CustomScrollView(
                controller: sc,
                physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
                slivers: [
                  SliverToBoxAdapter(
                    child: Column(
                      children: [
                        const SizedBox(height: 8),
                        Container(
                          width: 36,
                          height: 5,
                          decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(3)),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(20, 14, 14, 8),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text('Top Songs',
                                        style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.5)),
                                    const SizedBox(height: 2),
                                    Text(
                                      '$name · ${list.length} ${list.length == 1 ? 'song' : 'songs'}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
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
                                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.14), shape: BoxShape.circle),
                                  child: const Icon(CupertinoIcons.xmark, size: 14, color: Colors.white),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(margin: const EdgeInsets.symmetric(horizontal: 20), height: 0.5, color: AppColors.hairline),
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
                  SliverToBoxAdapter(child: SizedBox(height: MediaQuery.paddingOf(sheetCtx).bottom + 24)),
                ],
              );
            },
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
          icon: CupertinoIcons.camera,
          onTap: () {
            Navigator.of(context).push(
              CupertinoPageRoute(
                builder: (_) => StoryPreviewScreen(
                  content: ArtistStoryContent(
                    artistName: name,
                    coverUrl: img,
                    audience: audience.isNotEmpty ? audience : null,
                    topTracks: songs,
                    albumCovers: _artistProfile?.albums.map((a) => a.coverUrl).where((u) => u.isNotEmpty).toList() ?? const [],
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
      .replaceAll(RegExp(r'\s*(monthly\s+)?(listeners|audience)', caseSensitive: false), '')
      .replaceAll(RegExp(r'\s*subscribers?', caseSensitive: false), '')
      .trim();

  String get _monthly => _artistProfile?.monthlyAudience ?? '';
  String get _subs {
    final s = _artistProfile?.subscriberCount ?? '';
    return s == 'Top Artist' ? '' : s;
  }

  /// Listeners when available; subscribers only if there are no listeners.
  String get _audienceLine {
    if (_monthly.isNotEmpty) {
      return _monthly.toLowerCase().contains('listener') ? _monthly : '$_monthly monthly listeners';
    }
    if (_subs.isNotEmpty) {
      return _subs.toLowerCase().contains('subscriber') ? _subs : '$_subs subscribers';
    }
    return '';
  }

  String get _statValue => _stripUnit(_monthly.isNotEmpty ? _monthly : _subs);
  String get _statLabel => _monthly.isNotEmpty ? 'Monthly Listeners' : 'Subscribers';

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
    final top = MediaQuery.paddingOf(context).top;
    final width = MediaQuery.sizeOf(context).width;
    final heroH = math.min(width * 1.12, 470.0);
    _heroH = heroH;

    final reduce = MediaQuery.disableAnimationsOf(context);
    final active = TickerMode.of(context);
    if (reduce != _reduceMotion || active != _routeActive) {
      _reduceMotion = reduce;
      _routeActive = active;
      WidgetsBinding.instance.addPostFrameCallback((_) => _syncMotion());
    }

    final rawCleaned = MediaNormalizer.stripIdNoise(MediaNormalizer.formatArtists(widget.artistName));
    final name = (rawCleaned.isNotEmpty && !rawCleaned.startsWith('UC'))
        ? rawCleaned
        : (_artistProfile?.name.isNotEmpty == true
            ? _artistProfile!.name
            : (_tracks.isNotEmpty ? _tracks.first.artist : 'Artist'));
    final following = LibraryStore.instance.isFollowing(name);
    final curTrack = player.currentTrack;
    final curIsArtist = curTrack != null &&
        (curTrack.artist.toLowerCase().contains(name.toLowerCase()) ||
            curTrack.resolvedArtists.any((a) => a.name.toLowerCase() == name.toLowerCase()));
    final isArtistPlaying = player.isPlaying && curIsArtist;

    final lower = name.toLowerCase();
    final own = _tracks.where((t) => t.artist.toLowerCase().contains(lower)).toList();
    final allSongs = own.isEmpty ? _tracks : own;
    final songs = allSongs.take(_kSheetSongs).toList(); // sheet + queue
    final stackSongs = songs.take(_kStackSongs).toList(); // first section
    final others = _tracks.where((t) => !t.artist.toLowerCase().contains(lower)).toList();

    final map = <String, _Release>{};
    for (final t in allSongs) {
      final a = MediaNormalizer.cleanTitle(t.album);
      final key = (a.isEmpty || a.toLowerCase() == 'single' || MediaNormalizer.isMetadataNoise(a))
          ? MediaNormalizer.cleanCompactTitle(t.title)
          : a;
      map.putIfAbsent(key, () => _Release(key, MediaNormalizer.upgradeArtworkUrl(t.coverUrl))).tracks.add(t);
    }
    final releases = map.values.toList();
    final albums = _artistProfile != null && _artistProfile!.albums.isNotEmpty
        ? _artistProfile!.albums
            .map((a) => _Release(a.title, a.coverUrl, browseId: a.browseId, year: a.year, type: 'Album'))
            .toList()
        : releases.where((r) => r.tracks.length >= 3).toList();
    final singles = _artistProfile != null && _artistProfile!.singles.isNotEmpty
        ? _artistProfile!.singles
            .map((s) => _Release(s.title, s.coverUrl, browseId: s.browseId, year: s.year, type: s.type))
            .toList()
        : releases.where((r) => r.tracks.length < 3).toList();
    final featuredPlaylists = _artistProfile?.featuredPlaylists ?? const [];

    _Release? latest;
    final dated = [...albums, ...singles].where((r) => (int.tryParse(r.year) ?? 0) > 0).toList()
      ..sort((a, b) => (int.tryParse(b.year) ?? 0).compareTo(int.tryParse(a.year) ?? 0));
    if (dated.isNotEmpty) {
      latest = dated.first;
    } else if (releases.isNotEmpty) {
      latest = releases.first;
    }

    final relMap = <String, Track>{};
    for (final t in others) {
      relMap.putIfAbsent(t.artist, () => t);
    }
    final related = _artistProfile != null && _artistProfile!.relatedArtists.isNotEmpty
        ? _artistProfile!.relatedArtists
            .map((r) => MapEntry(r.name, Track(id: r.browseId ?? '', title: '', artist: r.name, album: '', coverUrl: r.imageUrl)))
            .toList()
        : relMap.entries.toList();

    final img = MediaNormalizer.upgradeArtworkUrl(
      _resolvedImage ??
          widget.imageUrl ??
          (_tracks.isNotEmpty
              ? _tracks.first.coverUrl
              : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200'),
      isArtistAvatar: true,
    );
    final bannerImg = MediaNormalizer.upgradeBannerUrl(
      _resolvedBanner ?? _resolvedImage ?? widget.imageUrl ?? img,
    );

    if (_coverKey != bannerImg) {
      _coverKey = bannerImg;
      _extractTint(bannerImg);
      _detectAnimated(bannerImg);
    }

    final bio = _parseBio((_resolvedBio ?? widget.bio ?? '').trim(), name);
    final audience = _audienceLine;
    final heroSpace = heroH - 118;

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
              _heroArt(base, heroH, bannerImg, img),
              NotificationListener<ScrollNotification>(
                onNotification: _onScrollNote,
                child: CustomScrollView(
                  controller: _sc,
                  physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
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
                              padding: const EdgeInsets.symmetric(horizontal: 20),
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
                                      duration: const Duration(milliseconds: 300),
                                      child: Text(
                                        audience,
                                        key: ValueKey(audience),
                                        style: TextStyle(
                                          color: Colors.white.withValues(alpha: 0.7),
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
                              padding: const EdgeInsets.symmetric(horizontal: 20),
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
                                      LibraryStore.instance.toggleFollow(name, img);
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
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (_loading)
                            const Padding(padding: EdgeInsets.only(top: 28), child: _Skeleton())
                          else if (songs.isEmpty)
                            const Padding(
                              padding: EdgeInsets.all(40),
                              child: Center(
                                child: Text('No tracks found for this artist.', style: TextStyle(color: AppColors.textSecondary)),
                              ),
                            )
                          else ...[
                            if (latest != null) ...[
                              const _SecHeader('Latest Release'),
                              _LatestRelease(
                                release: latest,
                                subtitle: latest.year.isNotEmpty
                                    ? '${latest.type} · ${latest.year}'
                                    : (latest.tracks.length < 3 ? 'Single' : 'Album · ${latest.tracks.length} songs'),
                                onTap: () => _openAlbum(latest!),
                              ),
                            ],

                            // Top Songs: swipeable stack of 15
                            _SecHeader('Top Songs', onSeeAll: () => _showAllSongs(songs, name)),
                            _TopSongsStack(
                              songs: stackSongs,
                              curId: curTrack?.id,
                              isPlaying: player.isPlaying,
                              onPlay: (i) => _play(songs, i),
                            ),

                            if (albums.isNotEmpty) ...[
                              const _SecHeader('Albums'),
                              _Shelf(
                                count: albums.length,
                                builder: (i) => _Cover(
                                  url: albums[i].cover,
                                  title: MediaNormalizer.cleanAlbumTitle(albums[i].title),
                                  subtitle: albums[i].year.isNotEmpty ? albums[i].year : 'Album',
                                  onTap: () => _openAlbum(albums[i]),
                                ),
                              ),
                            ],

                            if (singles.isNotEmpty) ...[
                              _SecHeader(albums.isEmpty ? 'Releases' : 'Singles & EPs'),
                              _Shelf(
                                count: singles.length,
                                builder: (i) => _Cover(
                                  url: singles[i].cover,
                                  title: MediaNormalizer.cleanCompactTitle(singles[i].title),
                                  subtitle: singles[i].year.isNotEmpty
                                      ? '${singles[i].type} · ${singles[i].year}'
                                      : (singles[i].tracks.length == 1 ? 'Single' : 'EP'),
                                  onTap: () => _openAlbum(singles[i]),
                                ),
                              ),
                            ],

                            if (featuredPlaylists.isNotEmpty) ...[
                              const _SecHeader('Featured On'),
                              _Shelf(
                                count: featuredPlaylists.length,
                                builder: (i) => _Cover(
                                  url: featuredPlaylists[i].coverUrl,
                                  title: featuredPlaylists[i].title,
                                  subtitle: featuredPlaylists[i].subtitle ?? 'Playlist',
                                  onTap: () => Navigator.push(
                                    context,
                                    ZenPageRoute(
                                      builder: (_) => AlbumScreen(
                                        albumTitle: featuredPlaylists[i].title,
                                        artistName: name,
                                        coverUrl: featuredPlaylists[i].coverUrl,
                                        browseId: featuredPlaylists[i].browseId,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],

                            if (related.isNotEmpty) ...[
                              const _SecHeader('Fans Might Also Like'),
                              _Shelf(
                                count: related.length,
                                builder: (i) => _Cover(
                                  url: related[i].value.coverUrl,
                                  title: related[i].key,
                                  subtitle: 'Artist',
                                  circular: true,
                                  onTap: () => Navigator.push(
                                    context,
                                    ZenPageRoute(
                                      builder: (_) => ArtistScreen(
                                        artistName: related[i].key,
                                        browseId: related[i].value.id.isNotEmpty ? related[i].value.id : null,
                                        imageUrl: related[i].value.coverUrl.isNotEmpty ? related[i].value.coverUrl : null,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],

                            const _SecHeader('About'),
                            _AboutCard(
                              imageUrl: bannerImg,
                              statValue: _statValue,
                              statLabel: _statLabel,
                              bio: bio,
                            ),
                          ],
                          const SizedBox(height: 140),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              _topBar(base, top, heroH, name, songs, img),
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
    final stops = [0.0, (extra + heroH * 0.9) / h, (extra + heroH + 320) / h, 1.0];
    return Positioned(
      top: -extra,
      left: 0,
      right: 0,
      height: h,
      child: AnimatedBuilder(
        animation: Listenable.merge([_sc, _glow]),
        builder: (_, __) {
          final b = _breathe(base);
          return Transform.translate(
            offset: Offset(0, -_offset),
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [b, b, Color.lerp(b, Colors.black, 0.6)!, Colors.black],
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
  Widget _fullArt(Color base, double heroH, String banner, String avatar) {
    final media = RepaintBoundary(
      child: CachedNetworkImage(
        imageUrl: banner,
        fit: BoxFit.cover,
        width: double.infinity,
        height: double.infinity,
        alignment: const Alignment(0, -0.35),
        fadeInDuration: const Duration(milliseconds: 350),
        placeholder: (c, u) => const ColoredBox(color: Colors.black),
        errorWidget: (c, u, e) => banner != avatar
            ? CachedNetworkImage(
                imageUrl: avatar,
                fit: BoxFit.cover,
                width: double.infinity,
                height: double.infinity,
                alignment: const Alignment(0, -0.35),
                errorWidget: (_, _, _) => const ColoredBox(color: AppColors.surface2),
              )
            : const ColoredBox(color: AppColors.surface2),
      ),
    );

    return SizedBox(
      height: heroH,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          AnimatedBuilder(
            animation: Listenable.merge([_live, _tilt]),
            child: media,
            builder: (_, child) {
              final a = _live.value * math.pi;
              final t = _tilt.value;
              final d = !_animatedCover;
              final dx = (d ? math.cos(a) * 9 : 0.0) - t.dx * 12;
              final dy = (d ? math.cos(2 * a) * 6 : 0.0) + t.dy * 8;
              final s = 1.12 + (d ? 0.025 * (0.5 - 0.5 * math.cos(a)) : 0.0);
              return Transform.translate(
                offset: Offset(dx, dy),
                child: Transform.scale(scale: s, child: child),
              );
            },
          ),
          // status-bar scrim
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Colors.black.withValues(alpha: 0.35), Colors.transparent],
                stops: const [0.0, 0.2],
              ),
            ),
          ),
          // liquid edge
          AnimatedBuilder(
            animation: Listenable.merge([_live, _glow]),
            builder: (_, __) {
              final a = _live.value * math.pi;
              final c = math.cos(a), c2 = math.cos(2 * a);
              final b = _breathe(base);
              return Stack(
                fit: StackFit.expand,
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(
                        center: Alignment(0.8 * c, 0.95 + 0.06 * c2),
                        radius: 0.8,
                        colors: [b.withValues(alpha: 0.55), b.withValues(alpha: 0)],
                      ),
                    ),
                  ),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment(-0.15 * c, -1),
                        end: Alignment(0.15 * c, 1),
                        colors: [Colors.transparent, b.withValues(alpha: 0.6), b],
                        stops: [0.46 + 0.04 * c, 0.76 + 0.03 * c2, 1.0],
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  /// Scrolling gradually blurs the image, pushes it back (parallax + soft
  /// zoom) and dissolves it into the backdrop. Pulling down stretches it.
  Widget _heroArt(Color base, double heroH, String banner, String avatar) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      height: heroH,
      child: AnimatedBuilder(
        animation: _sc,
        child: RepaintBoundary(child: _fullArt(base, heroH, banner, avatar)),
        builder: (_, child) {
          final o = _offset;
          final p = (o / (heroH * 0.7)).clamp(0.0, 1.0).toDouble();
          final e = Curves.easeInOut.transform(p);
          final sigma = e * 28;
          final over = o < 0 ? -o : 0.0;
          final scale = 1 + over / (heroH * 1.3) + e * 0.06;
          final fade = 1 - Curves.easeIn.transform(((p - 0.5) / 0.5).clamp(0.0, 1.0).toDouble());

          Widget w = child!;
          if (sigma > 0.4) {
            w = ImageFiltered(
              imageFilter: ui.ImageFilter.blur(sigmaX: sigma, sigmaY: sigma, tileMode: TileMode.clamp),
              child: w,
            );
          }
          w = Transform.scale(scale: scale, alignment: Alignment.topCenter, child: w);
          w = Transform.translate(offset: Offset(0, o > 0 ? -o * 0.45 : 0), child: w);
          return fade < 1 ? Opacity(opacity: fade, child: w) : w;
        },
      ),
    );
  }

  /// Floating bar: glass back + glass more (vertical dots); the title and a
  /// blurred bar fade in once the hero has scrolled away.
  Widget _topBar(Color base, double top, double heroH, String name, List<Track> songs, String img) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: AnimatedBuilder(
        animation: _sc,
        builder: (_, __) {
          final t = ((_offset - heroH * 0.5) / (heroH * 0.14)).clamp(0.0, 1.0).toDouble();
          return SizedBox(
            height: top + 56,
            child: Stack(
              children: [
                if (t > 0)
                  Positioned.fill(
                    child: ClipRect(
                      child: BackdropFilter(
                        filter: ui.ImageFilter.blur(sigmaX: 28, sigmaY: 28),
                        child: Container(color: Colors.black.withValues(alpha: 0.7 * t)),
                      ),
                    ),
                  ),
                if (t > 0)
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: Container(height: 0.5, color: Colors.white.withValues(alpha: 0.08 * t)),
                  ),
                Padding(
                  padding: EdgeInsets.fromLTRB(16, top + 8, 16, 8),
                  child: Row(
                    children: [
                      _Press(
                        scale: 0.88,
                        onTap: () => Navigator.pop(context),
                        child: const _Glass(
                          width: 40,
                          child: Icon(CupertinoIcons.chevron_back, color: Colors.white, size: 20),
                        ),
                      ),
                      Expanded(
                        child: Opacity(
                          opacity: t,
                          child: Transform.translate(
                            offset: Offset(0, (1 - t) * 8),
                            child: Text(
                              name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600, letterSpacing: -0.2),
                            ),
                          ),
                        ),
                      ),
                      _Press(
                        scale: 0.88,
                        onTap: () => _menu(name, songs, img),
                        child: const _Glass(
                          width: 40,
                          child: Icon(CupertinoIcons.ellipsis_vertical, color: Colors.white, size: 18),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
