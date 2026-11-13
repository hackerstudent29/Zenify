import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../features/story_sharing/models/story_share_content.dart';
import '../../features/story_sharing/screens/story_preview_screen.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/artist_service.dart';
import '../../services/innertube_service.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';
import 'album_screen.dart';

/* ------------------------------------------------------------------ */
/*  Shared sizes                                                        */
/* ------------------------------------------------------------------ */
const double _kCover = 160;
const double _kGap = 14;
const double _kExtent = _kCover + _kGap;
const double _kShelfH = 228;

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

/// Squishy press feedback (the only "always on" motion on rows and buttons).
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
    return circular ? ClipOval(child: img) : ClipPath(clipper: ShapeBorderClipper(shape: _sq(radius)), child: img);
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
              height: 16 * v,
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
            5,
            (i) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(
                children: [
                  Container(width: 48, height: 48, decoration: ShapeDecoration(color: Colors.white24, shape: _sq(8))),
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
  const _SecHeader(this.title);
  final String title;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 30, 20, 12),
        child: Text(
          title,
          style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.5),
        ),
      );
}

/// Round translucent button used in the action row (shuffle / follow / more).
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
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: active ? 0.24 : 0.14),
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 320),
            switchInCurve: _spring,
            transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
            child: Icon(icon, key: ValueKey(icon), size: 22, color: active ? AppColors.accent : Colors.white),
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
          height: 52,
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(26)),
          alignment: Alignment.center,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(isPlaying ? CupertinoIcons.pause_fill : CupertinoIcons.play_fill, color: Colors.black, size: 20),
              const SizedBox(width: 8),
              Text(
                isPlaying ? 'Pause' : 'Play',
                style: const TextStyle(color: Colors.black, fontSize: 18, fontWeight: FontWeight.w600),
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
          const SizedBox(height: 10),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: align,
            style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.3, fontWeight: FontWeight.w600, letterSpacing: -0.15),
          ),
          const SizedBox(height: 2),
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

class _SongRow extends StatelessWidget {
  const _SongRow({required this.track, required this.current, required this.playing, required this.onTap});
  final Track track;
  final bool current, playing;
  final VoidCallback onTap;

  String _formatDuration(int sec) {
    if (sec <= 0) return '';
    final m = sec ~/ 60;
    final s = sec % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) => _Press(
        scale: 0.98,
        onTap: onTap,
        child: SizedBox(
          height: 64,
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.only(left: 20, right: 12),
                child: Row(
                  children: [
                    SizedBox(
                      width: 48,
                      height: 48,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          _Img(track.coverUrl, radius: 8),
                          AnimatedOpacity(
                            duration: const Duration(milliseconds: 200),
                            opacity: current ? 1 : 0,
                            child: Container(
                              decoration: ShapeDecoration(color: Colors.black.withValues(alpha: 0.5), shape: _sq(8)),
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
                              color: current ? AppColors.accent : Colors.white,
                              fontSize: 16.5,
                              fontWeight: FontWeight.w500,
                              letterSpacing: -0.25,
                            ),
                            child: Text(
                              MediaNormalizer.cleanCompactTitle(track.title),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            track.album.isNotEmpty ? track.album : track.artist,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontFamily: 'SF Pro',
                              color: AppColors.textSecondary,
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (track.durationSeconds > 0) ...[
                      Text(
                        _formatDuration(track.durationSeconds),
                        style: const TextStyle(
                          fontFamily: 'SF Pro',
                          color: AppColors.textTertiary,
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                      const SizedBox(width: 4),
                    ],
                    _Press(
                      scale: 0.8,
                      onTap: () {
                        HapticFeedback.selectionClick();
                        ZenDropdown.showTrackMenu(context: context, track: track);
                      },
                      child: const Padding(
                        padding: EdgeInsets.all(8),
                        child: Icon(Icons.more_horiz_rounded, color: Colors.white, size: 24),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(left: 80, right: 20, bottom: 0, child: Container(height: 0.5, color: AppColors.hairline)),
            ],
          ),
        ),
      );
}

/// Apple Music style row for the newest release.
class _LatestRelease extends StatelessWidget {
  const _LatestRelease({required this.release, required this.subtitle, required this.onTap});
  final _Release release;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
        child: _Press(
          scale: 0.98,
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: ShapeDecoration(color: AppColors.surface2, shape: _sq(14)),
            child: Row(
              children: [
                SizedBox(width: 68, height: 68, child: _Img(release.cover, radius: 8)),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Latest Release',
                          style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text(
                        release.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600, letterSpacing: -0.3),
                      ),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                      ),
                    ],
                  ),
                ),
                const Icon(CupertinoIcons.chevron_right, size: 15, color: AppColors.textTertiary),
                const SizedBox(width: 6),
              ],
            ),
          ),
        ),
      );
}

/* ------------------------------------------------------------------ */
/*  About card                                                          */
/* ------------------------------------------------------------------ */
class _StatData {
  const _StatData(this.value, this.label);
  final String value, label;
}

class _AboutCard extends StatefulWidget {
  const _AboutCard({required this.name, required this.imageUrl, required this.stats, this.bio});
  final String name, imageUrl;
  final List<_StatData> stats;
  final String? bio;

  @override
  State<_AboutCard> createState() => _AboutCardState();
}

class _AboutCardState extends State<_AboutCard> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final bio = widget.bio?.trim() ?? '';
    final canExpand = bio.length > 170;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: ShapeDecoration(color: AppColors.surface2, shape: _sq(20)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Identity row
            Row(
              children: [
                SizedBox(width: 56, height: 56, child: _Img(widget.imageUrl, circular: true)),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text.rich(
                        TextSpan(
                          text: widget.name,
                          children: const [
                            WidgetSpan(
                              alignment: PlaceholderAlignment.middle,
                              child: Padding(
                                padding: EdgeInsets.only(left: 6),
                                child: Icon(
                                  CupertinoIcons.checkmark_seal_fill,
                                  color: AppColors.crimson,
                                  size: 18,
                                ),
                              ),
                            ),
                          ],
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.4,
                        ),
                      ),
                      const SizedBox(height: 2),
                      const Text('Verified Artist · Zenify Artist Direct', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                    ],
                  ),
                ),
              ],
            ),

            // Stats
            if (widget.stats.isNotEmpty) ...[
              const SizedBox(height: 16),
              Container(height: 0.5, color: AppColors.hairline),
              const SizedBox(height: 14),
              IntrinsicHeight(
                child: Row(
                  children: [
                    for (var i = 0; i < widget.stats.length; i++) ...[
                      if (i > 0) Container(width: 0.5, color: AppColors.hairline),
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Text(
                                widget.stats[i].value,
                                maxLines: 1,
                                style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.5),
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              widget.stats[i].label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],

            // Bio
            if (bio.isNotEmpty) ...[
              const SizedBox(height: 14),
              Container(height: 0.5, color: AppColors.hairline),
              const SizedBox(height: 14),
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
                        bio,
                        maxLines: _open ? null : 4,
                        overflow: _open ? TextOverflow.visible : TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.88), fontSize: 15, height: 1.4),
                      ),
                      if (canExpand) ...[
                        const SizedBox(height: 8),
                        Text(
                          _open ? 'Less' : 'More',
                          style: const TextStyle(color: AppColors.accent, fontSize: 15, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],

            // Pure Audio specifications
            const SizedBox(height: 16),
            Container(height: 0.5, color: AppColors.hairline),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(CupertinoIcons.waveform_circle_fill, color: AppColors.crimson, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Pristine 320kbps Lossless Stream via Akamai Clean CDN Delivery',
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 11.5,
                      fontWeight: FontWeight.w500,
                      color: Colors.white.withValues(alpha: 0.65),
                    ),
                  ),
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

class _ArtistScreenState extends State<ArtistScreen> {
  final _sc = ScrollController();
  List<Track> _tracks = [];
  ArtistProfile? _artistProfile;
  bool _loading = true;
  bool _showAll = false;
  String? _resolvedImage;
  String? _resolvedBanner;
  String? _resolvedBio;

  @override
  void initState() {
    super.initState();
    _load();
    LibraryStore.instance.ensureLoaded();
    LibraryStore.instance.addListener(_onLibrary);
  }

  void _onLibrary() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    LibraryStore.instance.removeListener(_onLibrary);
    _sc.dispose();
    super.dispose();
  }

  /* ---------------------------- data ---------------------------- */
  Future<void> _load() async {
    try {
      final info = await ArtistService.instance.getArtist(widget.artistName, browseId: widget.browseId);
      if (info != null && (info.topSongs.isNotEmpty || info.albums.isNotEmpty)) {
        List<Track> songs = List.of(info.topSongs);
        if (songs.length < 5) {
          try {
            final fallbackSongs =
                await InnerTubeService.instance.search(widget.artistName).timeout(const Duration(seconds: 4));
            final seen = songs.map((s) => s.id).toSet();
            for (final s in fallbackSongs) {
              if (seen.add(s.id)) songs.add(s);
            }
          } catch (_) {}
        }
        if (mounted) {
          setState(() {
            _artistProfile = info;
            _tracks = songs;
            if (info.imageUrl.isNotEmpty) _resolvedImage = info.imageUrl;
            if (info.coverUrl.isNotEmpty) _resolvedBanner = info.coverUrl;
            if (info.bio.isNotEmpty) _resolvedBio = info.bio;
            _loading = false;
          });
        }
        return;
      }

      final r = await InnerTubeService.instance.search(widget.artistName);
      if (mounted) {
        setState(() {
          _tracks = r;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
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

  void _menu(String name, List<Track> songs, String img) {
    HapticFeedback.selectionClick();
    final following = LibraryStore.instance.isFollowing(name);
    ZenDropdown.show<void>(
      context: context,
      title: name,
      subtitle: _audienceLine.isNotEmpty ? _audienceLine : 'Artist',
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
          icon: following ? CupertinoIcons.star_fill : CupertinoIcons.star,
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
                    audience: _audienceLine.isNotEmpty ? _audienceLine : null,
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
  String _plural(int n, String one, [String? many]) => '$n ${n == 1 ? one : (many ?? '${one}s')}';

  /// "12.4M monthly listeners" when available, otherwise subscribers.
  String get _audienceLine {
    final p = _artistProfile;
    final m = p?.monthlyAudience;
    if (m != null && m.isNotEmpty) return m;
    if (p != null && p.subscriberCount.isNotEmpty && p.subscriberCount != 'Top Artist') return p.subscriberCount;
    return '';
  }

  static String _stripUnit(String s) => s
      .replaceAll(RegExp(r'\s*(monthly\s+)?(listeners|audience)', caseSensitive: false), '')
      .replaceAll(RegExp(r'\s*subscribers?', caseSensitive: false), '')
      .trim();

  /* ----------------------------- build ---------------------------- */
  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final top = MediaQuery.paddingOf(context).top;
    final width = MediaQuery.sizeOf(context).width;
    final heroH = math.min(width * 1.12, 470.0);

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
    final songs = own.isEmpty ? _tracks : own;
    final others = _tracks.where((t) => !t.artist.toLowerCase().contains(lower)).toList();

    final map = <String, _Release>{};
    for (final t in songs) {
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

    // Newest release: pick by year when the profile has years, else first found.
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
    final bio = (_resolvedBio ?? widget.bio ?? '').trim();

    // Hero detail lines
    final audience = _audienceLine;
    final counts = <String>[
      if (albums.isNotEmpty) _plural(albums.length, 'album'),
      if (singles.isNotEmpty) _plural(singles.length, 'single'),
      if (albums.isEmpty && singles.isEmpty && songs.isNotEmpty) _plural(songs.length, 'song'),
    ];

    // About stats (max 4)
    final monthly = _artistProfile?.monthlyAudience ?? '';
    final subs = _artistProfile?.subscriberCount ?? '';
    final stats = <_StatData>[
      if (monthly.isNotEmpty) _StatData(_stripUnit(monthly), 'Monthly listeners'),
      if (subs.isNotEmpty && subs != 'Top Artist') _StatData(_stripUnit(subs), 'Subscribers'),
      if (albums.isNotEmpty) _StatData('${albums.length}', albums.length == 1 ? 'Album' : 'Albums'),
      if (singles.isNotEmpty) _StatData('${singles.length}', 'Singles & EPs'),
      if (songs.isNotEmpty) _StatData('${songs.length}', songs.length == 1 ? 'Top song' : 'Top songs'),
    ].take(4).toList();

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          CustomScrollView(
            controller: _sc,
            physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
            slivers: [
              /* ───────── Hero: Scrolling image layer with gradient scrim ───────── */
              SliverToBoxAdapter(
                child: SizedBox(
                  height: heroH,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      AnimatedBuilder(
                        animation: _sc,
                        builder: (context, _) {
                          final o = _sc.hasClients ? _sc.offset : 0.0;
                          final pull = o < 0 ? -o : 0.0;
                          return Positioned(
                            left: 0,
                            right: 0,
                            top: -pull,
                            height: heroH + pull,
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                CachedNetworkImage(
                                  imageUrl: bannerImg,
                                  fit: BoxFit.cover,
                                  alignment: const Alignment(0, -0.35),
                                  fadeInDuration: const Duration(milliseconds: 350),
                                  placeholder: (c, u) => const ColoredBox(color: Colors.black),
                                  errorWidget: (c, u, e) => bannerImg != img
                                      ? CachedNetworkImage(
                                          imageUrl: img,
                                          fit: BoxFit.cover,
                                          alignment: const Alignment(0, -0.35),
                                          errorWidget: (_, _, _) =>
                                              const ColoredBox(color: AppColors.surface2),
                                        )
                                      : const ColoredBox(color: AppColors.surface2),
                                ),
                                // Gradient scrim for dynamic island clearance + bottom fade
                                DecoratedBox(
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      begin: Alignment.topCenter,
                                      end: Alignment.bottomCenter,
                                      stops: const [0.0, 0.22, 0.55, 0.82, 1.0],
                                      colors: [
                                        Colors.black.withValues(alpha: 0.65),
                                        Colors.transparent,
                                        Colors.transparent,
                                        Colors.black.withValues(alpha: 0.75),
                                        Colors.black,
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),

                      // Name + verified badge + audience stats
                      Positioned(
                        left: 20,
                        right: 20,
                        bottom: 14,
                        child: AnimatedBuilder(
                          animation: _sc,
                          builder: (_, child) {
                            final o = _sc.hasClients ? _sc.offset : 0.0;
                            final fade = (1 - (o - (heroH - 230)) / 90).clamp(0.0, 1.0).toDouble();
                            return Opacity(opacity: fade, child: child);
                          },
                          child: _Reveal(
                            delay: const Duration(milliseconds: 120),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text.rich(
                                  TextSpan(
                                    text: name,
                                    children: const [
                                      WidgetSpan(
                                        alignment: PlaceholderAlignment.middle,
                                        child: Padding(
                                          padding: EdgeInsets.only(left: 8),
                                          child: Icon(
                                            CupertinoIcons.checkmark_seal_fill,
                                            color: AppColors.crimson,
                                            size: 24,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 38,
                                    height: 1.05,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -1.2,
                                  ),
                                ),
                                const SizedBox(height: 6),
                                AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 300),
                                  child: Column(
                                    key: ValueKey('$audience|${counts.join()}|$_loading'),
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        audience.isNotEmpty ? audience : 'Verified Artist',
                                        style: TextStyle(
                                          color: Colors.white.withValues(alpha: 0.9),
                                          fontSize: 15,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      if (!_loading && counts.isNotEmpty)
                                        Padding(
                                          padding: const EdgeInsets.only(top: 3),
                                          child: Text(
                                            counts.join(' · '),
                                            style: TextStyle(
                                              color: Colors.white.withValues(alpha: 0.65),
                                              fontSize: 13,
                                              fontWeight: FontWeight.w500,
                                            ),
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
                    ],
                  ),
                ),
              ),

              /* ───────── Body (solid black) ───────── */
              SliverToBoxAdapter(
                child: ColoredBox(
                  color: Colors.black,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Shuffle · Play · Follow · More (4 Actions)
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
                              _ActionCircle(
                                icon: following
                                    ? CupertinoIcons.person_crop_circle_badge_checkmark
                                    : CupertinoIcons.person_badge_plus,
                                active: following,
                                onTap: () {
                                  HapticFeedback.mediumImpact();
                                  LibraryStore.instance.toggleFollow(name, img);
                                },
                              ),
                              const SizedBox(width: 10),
                              _ActionCircle(
                                icon: Icons.more_horiz_rounded,
                                onTap: () => _menu(name, songs, img),
                              ),
                            ],
                          ),
                        ),
                      ),

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
                        if (latest != null)
                          _LatestRelease(
                            release: latest,
                            subtitle: latest.year.isNotEmpty
                                ? '${latest.type} · ${latest.year}'
                                : (latest.tracks.length < 3 ? 'Single' : 'Album · ${latest.tracks.length} songs'),
                            onTap: () => _openAlbum(latest!),
                          ),

                        // Top songs
                        const _SecHeader('Top Songs'),
                        for (var i = 0; i < math.min(5, songs.length); i++)
                          _SongRow(
                            track: songs[i],
                            current: curTrack?.id == songs[i].id,
                            playing: curTrack?.id == songs[i].id && player.isPlaying,
                            onTap: () => _play(songs, i),
                          ),
                        if (songs.length > 5) ...[
                          AnimatedSize(
                            duration: const Duration(milliseconds: 350),
                            curve: Curves.easeOutCubic,
                            alignment: Alignment.topCenter,
                            child: _showAll
                                ? Column(
                                    children: [
                                      for (var i = 5; i < songs.length; i++)
                                        _SongRow(
                                          track: songs[i],
                                          current: curTrack?.id == songs[i].id,
                                          playing: curTrack?.id == songs[i].id && player.isPlaying,
                                          onTap: () => _play(songs, i),
                                        ),
                                    ],
                                  )
                                : const SizedBox(width: double.infinity),
                          ),
                          _Press(
                            onTap: () {
                              HapticFeedback.selectionClick();
                              setState(() => _showAll = !_showAll);
                            },
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                              child: Row(
                                children: [
                                  Text(
                                    _showAll ? 'Show Less' : 'Show All ${songs.length} Songs',
                                    style: const TextStyle(color: AppColors.accent, fontSize: 16, fontWeight: FontWeight.w600),
                                  ),
                                  const SizedBox(width: 6),
                                  AnimatedRotation(
                                    turns: _showAll ? 0.5 : 0,
                                    duration: const Duration(milliseconds: 300),
                                    curve: Curves.easeOutCubic,
                                    child: const Icon(CupertinoIcons.chevron_down, size: 13, color: AppColors.accent),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],

                        // Albums
                        if (albums.isNotEmpty) ...[
                          const _SecHeader('Albums'),
                          _Shelf(
                            count: albums.length,
                            builder: (i) => _Cover(
                              url: albums[i].cover,
                              title: MediaNormalizer.cleanAlbumTitle(albums[i].title),
                              subtitle: albums[i].year.isNotEmpty
                                  ? 'Album · ${albums[i].year}'
                                  : (albums[i].tracks.isNotEmpty ? 'Album · ${albums[i].tracks.length} songs' : 'Album'),
                              onTap: () => _openAlbum(albums[i]),
                            ),
                          ),
                        ],

                        // Singles & EPs
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

                        // Featured on
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

                        // Fans might also like
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

                        // About
                        const _SecHeader('About'),
                        _AboutCard(name: name, imageUrl: img, stats: stats, bio: bio.isEmpty ? null : bio),
                      ],
                      const SizedBox(height: 140),
                    ],
                  ),
                ),
              ),
            ],
          ),

          // ---------------- Floating Dynamic Island Header (Three Docks) ----------------
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandHeader(
              title: name,
              subtitle: audience.isNotEmpty ? audience : 'Artist',
              showBack: true,
              onBack: () => Navigator.pop(context),
              showProfile: true,
              scrollController: _sc,
              revealOffset: heroH - top - 60,
            ),
          ),
        ],
      ),
    );
  }
}
