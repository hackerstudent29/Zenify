import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/zen.dart';
import '../../design_system/widgets/apple_glass.dart';
import '../../design_system/widgets/dynamic_island_header.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/artist_service.dart';
import '../../services/innertube_service.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';
import 'album_screen.dart';

/* ------------------------------------------------------------------ */
/*  One card size for EVERY shelf (albums, singles, featured, fans...)  */
/* ------------------------------------------------------------------ */
const double _kCover = 170;
const double _kGap = 14;
const double _kExtent = _kCover + _kGap;
const double _kShelfH = 236;

/// Apple-style continuous (squircle) corners.
ShapeBorder _sq(double r, {BorderSide side = BorderSide.none}) =>
    ContinuousRectangleBorder(borderRadius: BorderRadius.circular(r * 2), side: side);

/// Saturation boost for the blurred page background (Apple Music look).
List<double> _satMatrix(double s) {
  const lr = 0.2126, lg = 0.7152, lb = 0.0722;
  return <double>[
    lr * (1 - s) + s, lg * (1 - s), lb * (1 - s), 0, 0, //
    lr * (1 - s), lg * (1 - s) + s, lb * (1 - s), 0, 0,
    lr * (1 - s), lg * (1 - s), lb * (1 - s) + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/* ------------------------------------------------------------------ */
/*  Spring primitives                                                   */
/* ------------------------------------------------------------------ */
const _kPress = SpringDescription(mass: 1, stiffness: 430, damping: 21);
const _kReveal = SpringDescription(mass: 1, stiffness: 190, damping: 19);

class _SpringCurve extends Curve {
  const _SpringCurve();
  static final _sim = SpringSimulation(const SpringDescription(mass: 1, stiffness: 200, damping: 17), 0, 1, 0);
  @override
  double transformInternal(double t) => _sim.x(t * 0.9);
}

const _spring = _SpringCurve();

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

/// One-shot spring entrance on page open (hero elements).
class _Reveal extends StatefulWidget {
  const _Reveal({required this.child, this.delay = Duration.zero, this.rise = 30});
  final Widget child;
  final Duration delay;
  final double rise;

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
          child: Transform.translate(offset: Offset(0, (1 - _c.value) * widget.rise), child: child),
        ),
      );
}

/// Spawns its child with a spring the FIRST time it scrolls into view during
/// this visit: rises, scales up and fades in. Optional horizontal slide (dx)
/// for shelf cards. Never replays when scrolling away and back.
class _ScrollReveal extends StatefulWidget {
  const _ScrollReveal({
    required this.controller,
    required this.child,
    this.delay = Duration.zero,
    this.rise = 44,
    this.dx = 0,
    this.fromScale = 0.94,
  });
  final ScrollController controller;
  final Widget child;
  final Duration delay;
  final double rise;
  final double dx;
  final double fromScale;

  @override
  State<_ScrollReveal> createState() => _ScrollRevealState();
}

class _ScrollRevealState extends State<_ScrollReveal> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 0);
  bool _done = false;
  Timer? _t;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_check);
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  void _check() {
    if (_done || !mounted) return;
    final box = context.findRenderObject();
    if (box is! RenderBox || !box.attached || !box.hasSize) return;
    final top = box.localToGlobal(Offset.zero).dy;
    if (top < MediaQuery.sizeOf(context).height - 70) {
      _done = true;
      widget.controller.removeListener(_check);
      if (MediaQuery.disableAnimationsOf(context)) {
        _c.value = 1;
        return;
      }
      _t = Timer(widget.delay, () {
        if (mounted) _c.animateWith(SpringSimulation(_kReveal, 0, 1, 0));
      });
    }
  }

  @override
  void dispose() {
    _t?.cancel();
    widget.controller.removeListener(_check);
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, child) {
          final v = _c.value;
          final inv = 1 - v;
          return Opacity(
            opacity: (v * 1.6).clamp(0.0, 1.0).toDouble(),
            child: Transform.translate(
              offset: Offset(inv * widget.dx, inv * widget.rise),
              child: Transform.scale(
                scale: widget.fromScale + (1 - widget.fromScale) * v,
                alignment: Alignment.bottomCenter,
                child: child,
              ),
            ),
          );
        },
      );
}

/// Horizontal shelf that settles on a card with a spring.
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
    final img = CachedNetworkImage(
      imageUrl: url,
      fit: BoxFit.cover,
      fadeInDuration: const Duration(milliseconds: 260),
      placeholder: (context, url) => Container(color: AppColors.surface2),
      errorWidget: (context, url, error) => Container(
        color: AppColors.surface2,
        child: const Icon(CupertinoIcons.music_note, color: AppColors.textTertiary),
      ),
    );
    return circular
        ? ClipOval(child: img)
        : ClipPath(clipper: ShapeBorderClipper(shape: _sq(radius)), child: img);
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
                  Container(
                    width: 48,
                    height: 48,
                    decoration: ShapeDecoration(color: Colors.white24, shape: _sq(8)),
                  ),
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
        padding: const EdgeInsets.fromLTRB(20, 32, 20, 12),
        child: Text(
          title,
          style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.5),
        ),
      );
}

/// Every shelf uses this: same card, same height, staggered slide-in.
class _Shelf extends StatelessWidget {
  const _Shelf({required this.count, required this.builder, required this.controller});
  final int count;
  final Widget Function(int) builder;
  final ScrollController controller;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: _kShelfH,
        child: ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          physics: const _SnapPhysics(parent: BouncingScrollPhysics(), itemExtent: _kExtent),
          itemExtent: _kExtent,
          itemCount: count,
          itemBuilder: (_, i) => _ScrollReveal(
            controller: controller,
            delay: Duration(milliseconds: 90 * math.min(i, 4)),
            rise: 26,
            dx: 70,
            fromScale: 0.9,
            child: Padding(padding: const EdgeInsets.only(right: _kGap), child: builder(i)),
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
    this.radius = 10,
  });
  final String url, title, subtitle;
  final VoidCallback onTap;
  final bool circular;
  final double radius;

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
                  : ShapeDecoration(shape: _sq(radius), shadows: shadow),
              child: _Img(url, circular: circular, radius: radius),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: align,
            style: const TextStyle(
                color: Colors.white, fontSize: 14, height: 1.3, fontWeight: FontWeight.w600, letterSpacing: -0.15),
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: align,
            style: const TextStyle(color: Colors.white60, fontSize: 13, height: 1.3),
          ),
        ],
      ),
    );
  }
}

class _SongRow extends StatelessWidget {
  const _SongRow({required this.track, required this.current, required this.playing, required this.onTap});
  final Track track;
  final bool current, playing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => _Press(
        scale: 0.975,
        onTap: onTap,
        child: SizedBox(
          height: 64,
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.only(left: 20, right: 8),
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
                            duration: const Duration(milliseconds: 250),
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
                            duration: const Duration(milliseconds: 250),
                            style: TextStyle(
                              color: current ? AppColors.accent : Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w500,
                              letterSpacing: -0.2,
                            ),
                            child: Text(
                              MediaNormalizer.cleanCompactTitle(track.title),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(track.album.isNotEmpty ? track.album : track.artist,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white60, fontSize: 14)),
                        ],
                      ),
                    ),
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () {
                        HapticFeedback.selectionClick();
                        ZenDropdown.showTrackMenu(context: context, track: track);
                      },
                      child: const SizedBox(
                        width: 40,
                        height: 44,
                        child: Icon(CupertinoIcons.ellipsis_vertical, color: Colors.white54, size: 18),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(left: 80, right: 0, bottom: 0, child: Container(height: 0.5, color: Colors.white24)),
            ],
          ),
        ),
      );
}

/// Apple Music style: sleek dark neutral capsule "Play" / "Pause".
class _PlayPill extends StatelessWidget {
  const _PlayPill({required this.isPlaying, required this.onTap});
  final bool isPlaying;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => _Press(
        onTap: onTap,
        scale: 0.96,
        child: Container(
          height: 50,
          decoration: ShapeDecoration(
            color: const Color(0xFF1E1E22),
            shape: const StadiumBorder(
              side: BorderSide(color: Color(0x26FFFFFF), width: 1),
            ),
            shadows: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 14,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          alignment: Alignment.center,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                isPlaying ? CupertinoIcons.pause_fill : CupertinoIcons.play_fill,
                size: 19,
                color: AppColors.accent,
              ),
              const SizedBox(width: 8),
              Text(
                isPlaying ? 'Pause' : 'Play',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                ),
              ),
            ],
          ),
        ),
      );
}

/// Apple Music style: frosted translucent circle button (shuffle / follow).
class _CircleBtn extends StatelessWidget {
  const _CircleBtn({
    required this.icon,
    required this.onTap,
    this.active = false,
    this.activeColor,
  });
  final IconData icon;
  final VoidCallback onTap;
  final bool active;
  final Color? activeColor;

  @override
  Widget build(BuildContext context) {
    final tint = activeColor ?? AppColors.accent;
    return _Press(
      scale: 0.88,
      onTap: onTap,
      child: ClipOval(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            curve: _spring,
            width: 50,
            height: 50,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: active
                  ? tint.withValues(alpha: 0.22)
                  : const Color(0xFF1E1E22).withValues(alpha: 0.75),
              border: Border.all(
                color: active
                    ? tint.withValues(alpha: 0.5)
                    : Colors.white.withValues(alpha: 0.12),
                width: 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.25),
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Center(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 300),
                switchInCurve: _spring,
                transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                child: Icon(
                  icon,
                  key: ValueKey(icon),
                  size: 21,
                  color: active ? tint : Colors.white,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _GlassBtn extends StatelessWidget {
  const _GlassBtn(this.icon, this.onTap);
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => _Press(
        scale: 0.88,
        onTap: () {
          HapticFeedback.lightImpact();
          onTap();
        },
        child: AppleGlass(
          borderRadius: BorderRadius.circular(22),
          tint: const Color(0x26121216),
          child: SizedBox(width: 44, height: 44, child: Icon(icon, size: 19, color: Colors.white)),
        ),
      );
}

class _Stat extends StatelessWidget {
  const _Stat(this.value, this.label);
  final String value, label;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.4)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
        ],
      );
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
  static const double _heroH = 420;
  static const double _islandAt = _heroH - 175;

  final _sc = ScrollController();
  List<Track> _tracks = [];
  ArtistProfile? _artistProfile;
  bool _loading = true;
  bool _showAll = false;
  bool _bioOpen = false;
  String? _resolvedImage;
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



  Future<void> _menu(String name, List<Track> songs, String img) async {
    final following = LibraryStore.instance.isFollowing(name);
    final act = await showCupertinoModalPopup<String>(
      context: context,
      builder: (ctx) => CupertinoTheme(
        data: const CupertinoThemeData(brightness: Brightness.dark),
        child: CupertinoActionSheet(
          title: Text(name),
          actions: [
            CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx, 'play'), child: const Text('Play')),
            CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx, 'shuffle'), child: const Text('Shuffle')),
            CupertinoActionSheetAction(
              onPressed: () => Navigator.pop(ctx, 'follow'),
              child: Text(following ? 'Unfollow' : 'Follow'),
            ),
          ],
          cancelButton: CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        ),
      ),
    );
    if (!mounted || act == null) return;
    switch (act) {
      case 'play':
        _play(songs, 0);
      case 'shuffle':
        _play(songs, 0, shuffle: true);
      case 'follow':
        HapticFeedback.selectionClick();
        LibraryStore.instance.toggleFollow(name, img);
    }
  }

  String get _subline {
    final p = _artistProfile;
    if (_loading) return 'Artist';
    final m = p?.monthlyAudience;
    if (m != null && m.isNotEmpty) return m;
    if (p != null && p.subscriberCount.isNotEmpty && p.subscriberCount != 'Top Artist') return p.subscriberCount;
    return 'Artist';
  }

  /// Full-page blurred artwork background (Apple Music style).
  Widget _blurredBackground(String img) => Positioned.fill(
        child: RepaintBoundary(
          child: Stack(
            fit: StackFit.expand,
            children: [
              const ColoredBox(color: Colors.black),
              ImageFiltered(
                imageFilter: ImageFilter.blur(sigmaX: 48, sigmaY: 48, tileMode: TileMode.mirror),
                child: Transform.scale(
                  scale: 1.35,
                  child: ColorFiltered(
                    colorFilter: ColorFilter.matrix(_satMatrix(1.5)),
                    child: CachedNetworkImage(
                      imageUrl: img,
                      fit: BoxFit.cover,
                      width: double.infinity,
                      height: double.infinity,
                      errorWidget: (context, url, error) => Container(color: AppColors.surface2),
                    ),
                  ),
                ),
              ),
              ColoredBox(color: Colors.black.withValues(alpha: 0.38)),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Colors.black.withValues(alpha: 0.35)],
                  ),
                ),
              ),
            ],
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final rawCleaned = MediaNormalizer.stripIdNoise(MediaNormalizer.formatArtists(widget.artistName));
    final name = (rawCleaned.isNotEmpty && !rawCleaned.startsWith('UC'))
        ? rawCleaned
        : (_artistProfile?.name.isNotEmpty == true
            ? _artistProfile!.name
            : (_tracks.isNotEmpty ? _tracks.first.artist : 'Artist'));
    final following = LibraryStore.instance.isFollowing(name);
    final curTrack = player.currentTrack;
    final isArtistPlaying = player.isPlaying &&
        curTrack != null &&
        (curTrack.artist.toLowerCase().contains(name.toLowerCase()) ||
            curTrack.resolvedArtists.any((a) => a.name.toLowerCase() == name.toLowerCase()));

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

    final relMap = <String, Track>{};
    for (final t in others) {
      relMap.putIfAbsent(t.artist, () => t);
    }
    final related = _artistProfile != null && _artistProfile!.relatedArtists.isNotEmpty
        ? _artistProfile!.relatedArtists
            .map((r) => MapEntry(r.name, Track(id: r.browseId ?? '', title: '', artist: r.name, album: '', coverUrl: r.imageUrl)))
            .toList()
        : relMap.entries.toList();

    final img = _resolvedImage ??
        widget.imageUrl ??
        (_tracks.isNotEmpty
            ? _tracks.first.coverUrl
            : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800');
    final bio = _resolvedBio ??
        widget.bio ??
        '$name has ${songs.length} ${songs.length == 1 ? 'song' : 'songs'} across ${releases.length} '
            '${releases.length == 1 ? 'release' : 'releases'} in the catalog. '
            'Press play to start with their top tracks, or shuffle to mix them up.';

    final minBody = math.max(0.0, MediaQuery.sizeOf(context).height - _heroH);

    final monthly = _artistProfile?.monthlyAudience;
    final subs = _artistProfile?.subscriberCount ?? '';

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          /* ───────── Blurred artwork fills the whole page ───────── */
          _blurredBackground(img),

          /* ───────── Sharp hero: parallax, melts into the blur ───────── */
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _sc,
              child: TweenAnimationBuilder<double>(
                key: ValueKey(img),
                tween: Tween(begin: 1.14, end: 1),
                duration: const Duration(milliseconds: 1100),
                curve: _spring,
                builder: (_, s, child) => Transform.scale(scale: s, child: child),
                child: CachedNetworkImage(
                  imageUrl: img,
                  fit: BoxFit.cover,
                  width: double.infinity,
                  height: double.infinity,
                  errorWidget: (context, url, error) => Container(color: Colors.transparent),
                ),
              ),
              builder: (_, image) {
                final o = _sc.hasClients ? _sc.offset : 0.0;
                final stretch = o < 0 ? -o : 0.0;
                final p = (o / (_heroH * 0.55)).clamp(0.0, 1.0).toDouble();
                final sigma = p * 20;
                return Align(
                  alignment: Alignment.topCenter,
                  child: Transform.translate(
                    offset: Offset(0, o > 0 ? -o * 0.45 : 0),
                    child: Transform.scale(
                      scale: 1 + stretch / _heroH,
                      alignment: Alignment.topCenter,
                      child: Opacity(
                        opacity: (1 - p * 0.55).clamp(0.0, 1.0).toDouble(),
                        child: ShaderMask(
                          blendMode: BlendMode.dstIn,
                          shaderCallback: (r) => const LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            stops: [0, 0.45, 0.82, 1],
                            colors: [Colors.black, Colors.black, Colors.black45, Colors.transparent],
                          ).createShader(r),
                          child: SizedBox(
                            height: _heroH,
                            width: double.infinity,
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                ImageFiltered(
                                  enabled: p > 0.01,
                                  imageFilter:
                                      ImageFilter.blur(sigmaX: sigma, sigmaY: sigma, tileMode: TileMode.clamp),
                                  child: image!,
                                ),
                                DecoratedBox(
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      begin: Alignment.topCenter,
                                      end: Alignment.bottomCenter,
                                      stops: const [0, 0.25, 0.75, 1],
                                      colors: [
                                        Colors.black.withValues(alpha: 0.35),
                                        Colors.transparent,
                                        Colors.black.withValues(alpha: 0.55),
                                        Colors.black.withValues(alpha: 0.95),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          CustomScrollView(
            controller: _sc,
            physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
            slivers: [
              // Name + monthly listeners
              SliverToBoxAdapter(
                child: SizedBox(
                  height: _heroH,
                  child: Align(
                    alignment: Alignment.bottomLeft,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                      child: IslandTitleFade(
                        controller: _sc,
                        revealOffset: _islandAt,
                        child: _Reveal(
                          delay: const Duration(milliseconds: 150),
                          rise: 40,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 42,
                                  height: 1.04,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -1.4,
                                ),
                              ),
                              const SizedBox(height: 6),
                              AnimatedSwitcher(
                                duration: const Duration(milliseconds: 400),
                                child: Text(
                                  _subline,
                                  key: ValueKey(_subline),
                                  style: const TextStyle(color: Colors.white70, fontSize: 15),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              // Body: soft dark gradient blend ensures ZERO gap or color break
              SliverToBoxAdapter(
                child: Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      stops: const [0.0, 0.12, 0.32],
                      colors: [
                        Colors.transparent,
                        Colors.black.withValues(alpha: 0.85),
                        Colors.black,
                      ],
                    ),
                  ),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: minBody),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Actions: [shuffle] [ Play / Pause ] [follow]  (Apple Music style)
                        _Reveal(
                          delay: const Duration(milliseconds: 260),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            child: Row(
                              children: [
                                _CircleBtn(
                                  icon: CupertinoIcons.shuffle,
                                  active: player.isShuffle,
                                  activeColor: AppColors.accent,
                                  onTap: () {
                                    HapticFeedback.selectionClick();
                                    if (isArtistPlaying) {
                                      player.toggleShuffle();
                                    } else {
                                      _play(songs, 0, shuffle: true);
                                    }
                                  },
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: _PlayPill(
                                    isPlaying: isArtistPlaying,
                                    onTap: () {
                                      HapticFeedback.selectionClick();
                                      if (isArtistPlaying) {
                                        player.pause();
                                      } else if (curTrack != null &&
                                          (curTrack.artist.toLowerCase().contains(name.toLowerCase()) ||
                                              curTrack.resolvedArtists
                                                  .any((a) => a.name.toLowerCase() == name.toLowerCase()))) {
                                        player.resume();
                                      } else {
                                        _play(songs, 0);
                                      }
                                    },
                                  ),
                                ),
                                const SizedBox(width: 12),
                                _CircleBtn(
                                  icon: following
                                      ? CupertinoIcons.person_crop_circle_badge_checkmark
                                      : CupertinoIcons.person_badge_plus,
                                  active: following,
                                  activeColor: AppColors.accent,
                                  onTap: () {
                                    HapticFeedback.selectionClick();
                                    LibraryStore.instance.toggleFollow(name, img);
                                  },
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
                            child: Text('No tracks found for this artist.', style: TextStyle(color: Colors.white70)),
                          ),
                        )
                      else ...[
                        // Latest release (glass card)
                        if (releases.isNotEmpty)
                          _ScrollReveal(
                            controller: _sc,
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
                              child: _Press(
                                scale: 0.98,
                                onTap: () => _openAlbum(releases.first),
                                child: ClipPath(
                                  clipper: ShapeBorderClipper(shape: _sq(16)),
                                  child: BackdropFilter(
                                    filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                                    child: Container(
                                      padding: const EdgeInsets.all(10),
                                      decoration: ShapeDecoration(
                                        color: const Color(0x26FFFFFF),
                                        shape: _sq(16, side: const BorderSide(color: Color(0x33FFFFFF), width: 0.5)),
                                      ),
                                      child: Row(
                                        children: [
                                          SizedBox(width: 72, height: 72, child: _Img(releases.first.cover, radius: 10)),
                                          const SizedBox(width: 14),
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                const Text('Latest release',
                                                    style: TextStyle(
                                                        color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w700)),
                                                const SizedBox(height: 2),
                                                Text(releases.first.title,
                                                    maxLines: 1,
                                                    overflow: TextOverflow.ellipsis,
                                                    style: const TextStyle(
                                                        color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600)),
                                                Text(
                                                  releases.first.year.isNotEmpty
                                                      ? '${releases.first.type} · ${releases.first.year}'
                                                      : (releases.first.tracks.length < 3
                                                          ? 'Single · $name'
                                                          : 'Album · ${releases.first.tracks.length} songs'),
                                                  maxLines: 1,
                                                  overflow: TextOverflow.ellipsis,
                                                  style: const TextStyle(color: Colors.white70, fontSize: 14),
                                                ),
                                              ],
                                            ),
                                          ),
                                          const Icon(CupertinoIcons.chevron_right, size: 16, color: Colors.white54),
                                          const SizedBox(width: 6),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),

                        // Songs
                        _ScrollReveal(controller: _sc, rise: 30, child: const _SecHeader('Songs')),
                        for (var i = 0; i < math.min(5, songs.length); i++)
                          _ScrollReveal(
                            controller: _sc,
                            delay: Duration(milliseconds: 70 * i),
                            rise: 34,
                            dx: 26,
                            fromScale: 0.97,
                            child: _SongRow(
                              track: songs[i],
                              current: player.currentTrack?.id == songs[i].id,
                              playing: player.currentTrack?.id == songs[i].id && player.isPlaying,
                              onTap: () => _play(songs, i),
                            ),
                          ),
                        if (songs.length > 5) ...[
                          AnimatedSize(
                            duration: const Duration(milliseconds: 700),
                            curve: _spring,
                            alignment: Alignment.topCenter,
                            child: _showAll
                                ? Column(
                                    children: [
                                      for (var i = 5; i < songs.length; i++)
                                        _SongRow(
                                          track: songs[i],
                                          current: player.currentTrack?.id == songs[i].id,
                                          playing: player.currentTrack?.id == songs[i].id && player.isPlaying,
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
                                    _showAll ? 'Show less' : 'Show all ${songs.length} songs',
                                    style: const TextStyle(
                                        color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
                                  ),
                                  const SizedBox(width: 6),
                                  AnimatedRotation(
                                    turns: _showAll ? 0.5 : 0,
                                    duration: const Duration(milliseconds: 600),
                                    curve: _spring,
                                    child: const Icon(CupertinoIcons.chevron_down, size: 14, color: Colors.white),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],

                        // Albums
                        if (albums.isNotEmpty) ...[
                          _ScrollReveal(controller: _sc, rise: 30, child: const _SecHeader('Albums')),
                          _Shelf(
                            controller: _sc,
                            count: albums.length,
                            builder: (i) => _Cover(
                              url: albums[i].cover,
                              title: MediaNormalizer.cleanAlbumTitle(albums[i].title),
                              subtitle: albums[i].year.isNotEmpty
                                  ? 'Album · ${albums[i].year}'
                                  : (albums[i].tracks.isNotEmpty ? 'Album · ${albums[i].tracks.length} songs' : 'Album'),
                              radius: 8,
                              onTap: () => _openAlbum(albums[i]),
                            ),
                          ),
                        ],

                        // Singles & EPs
                        if (singles.isNotEmpty) ...[
                          _ScrollReveal(
                              controller: _sc,
                              rise: 30,
                              child: _SecHeader(albums.isEmpty ? 'Releases' : 'Singles & EPs')),
                          _Shelf(
                            controller: _sc,
                            count: singles.length,
                            builder: (i) => _Cover(
                              url: singles[i].cover,
                              title: MediaNormalizer.cleanCompactTitle(singles[i].title),
                              subtitle: singles[i].year.isNotEmpty
                                  ? '${singles[i].type} · ${singles[i].year}'
                                  : (singles[i].tracks.length == 1 ? 'Single' : 'EP'),
                              radius: 8,
                              onTap: () => _openAlbum(singles[i]),
                            ),
                          ),
                        ],

                        // Featured on
                        if (featuredPlaylists.isNotEmpty) ...[
                          _ScrollReveal(controller: _sc, rise: 30, child: const _SecHeader('Featured on')),
                          _Shelf(
                            controller: _sc,
                            count: featuredPlaylists.length,
                            builder: (i) => _Cover(
                              url: featuredPlaylists[i].coverUrl,
                              title: featuredPlaylists[i].title,
                              subtitle: featuredPlaylists[i].subtitle ?? 'Playlist',
                              radius: 8,
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
                          _ScrollReveal(controller: _sc, rise: 30, child: const _SecHeader('Fans might also like')),
                          _Shelf(
                            controller: _sc,
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

                        // ───────── About: Apple Music style portrait card ─────────
                        _ScrollReveal(controller: _sc, rise: 30, child: const _SecHeader('About')),
                        _ScrollReveal(
                          controller: _sc,
                          rise: 70,
                          fromScale: 0.92,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            child: DecoratedBox(
                              decoration: ShapeDecoration(
                                shape: _sq(24),
                                shadows: [
                                  BoxShadow(
                                      color: Colors.black.withValues(alpha: 0.35),
                                      blurRadius: 24,
                                      offset: const Offset(0, 10)),
                                ],
                              ),
                              child: ClipPath(
                                clipper: ShapeBorderClipper(shape: _sq(24)),
                                child: Stack(
                                  children: [
                                    Positioned.fill(
                                      child: CachedNetworkImage(
                                        imageUrl: img,
                                        fit: BoxFit.cover,
                                        alignment: Alignment.topCenter,
                                        errorWidget: (c, u, e) => Container(color: AppColors.surface2),
                                      ),
                                    ),
                                    Positioned.fill(
                                      child: DecoratedBox(
                                        decoration: BoxDecoration(
                                          gradient: LinearGradient(
                                            begin: Alignment.topCenter,
                                            end: Alignment.bottomCenter,
                                            stops: const [0, 0.3, 0.7, 1],
                                            colors: [
                                              Colors.transparent,
                                              Colors.black.withValues(alpha: 0.15),
                                              Colors.black.withValues(alpha: 0.72),
                                              Colors.black.withValues(alpha: 0.92),
                                            ],
                                          ),
                                        ),
                                      ),
                                    ),
                                    ConstrainedBox(
                                      constraints: const BoxConstraints(minHeight: 440),
                                      child: Align(
                                        alignment: Alignment.bottomLeft,
                                        child: Padding(
                                          padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                                          child: Column(
                                            mainAxisSize: MainAxisSize.min,
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                name,
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                    color: Colors.white,
                                                    fontSize: 30,
                                                    height: 1.05,
                                                    fontWeight: FontWeight.w800,
                                                    letterSpacing: -0.9),
                                              ),
                                              const SizedBox(height: 14),
                                              IntrinsicHeight(
                                                child: Row(
                                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                                  children: [
                                                    if (monthly != null && monthly.isNotEmpty) ...[
                                                      Flexible(
                                                        child: _Stat(
                                                            monthly
                                                                .replaceAll(' monthly listeners', '')
                                                                .replaceAll(' listeners', ''),
                                                            'Monthly listeners'),
                                                      ),
                                                      const _StatDivider(),
                                                    ],
                                                    if (subs.isNotEmpty && subs != 'Top Artist') ...[
                                                      Flexible(
                                                        child: _Stat(subs.replaceAll(' subscribers', ''), 'Subscribers'),
                                                      ),
                                                      const _StatDivider(),
                                                    ],
                                                    Flexible(child: _Stat('${songs.length}', 'Top songs')),
                                                  ],
                                                ),
                                              ),
                                              const SizedBox(height: 16),
                                              GestureDetector(
                                                behavior: HitTestBehavior.opaque,
                                                onTap: () {
                                                  HapticFeedback.selectionClick();
                                                  setState(() => _bioOpen = !_bioOpen);
                                                },
                                                child: ClipRRect(
                                                  borderRadius: BorderRadius.circular(16),
                                                  child: BackdropFilter(
                                                    filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                                                    child: Container(
                                                      padding: const EdgeInsets.all(16),
                                                      decoration: BoxDecoration(
                                                        color: const Color(0xE618181B),
                                                        borderRadius: BorderRadius.circular(16),
                                                        border: Border.all(
                                                          color: Colors.white.withValues(alpha: 0.1),
                                                        ),
                                                      ),
                                                      child: AnimatedSize(
                                                        duration: const Duration(milliseconds: 400),
                                                        curve: _spring,
                                                        alignment: Alignment.topCenter,
                                                        child: Column(
                                                          crossAxisAlignment: CrossAxisAlignment.start,
                                                          children: [
                                                            Text(
                                                              bio,
                                                              maxLines: _bioOpen ? null : 4,
                                                              overflow: _bioOpen ? TextOverflow.visible : TextOverflow.ellipsis,
                                                              style: const TextStyle(
                                                                color: Colors.white,
                                                                fontSize: 15,
                                                                height: 1.45,
                                                              ),
                                                            ),
                                                            const SizedBox(height: 10),
                                                            Text(
                                                              _bioOpen ? 'Show Less' : 'Read More',
                                                              style: const TextStyle(
                                                                color: AppColors.accent,
                                                                fontSize: 14,
                                                                fontWeight: FontWeight.w700,
                                                              ),
                                                            ),
                                                          ],
                                                        ),
                                                      ),
                                                    ),
                                                  ),
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
                          ),
                        ),
                      ],
                      const SizedBox(height: 140),
                    ],
                  ),
                ),
              ),
            ),
          ],
          ),

          // Dynamic Island
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandHeader(
              title: name,
              showBack: true,
              onBack: () => Navigator.pop(context),
              scrollController: _sc,
              revealOffset: _islandAt,
              trailing: _GlassBtn(CupertinoIcons.ellipsis_vertical, () => _menu(name, songs, img)),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatDivider extends StatelessWidget {
  const _StatDivider();

  @override
  Widget build(BuildContext context) => Container(
        width: 0.5,
        margin: const EdgeInsets.symmetric(horizontal: 16),
        color: Colors.white38,
      );
}