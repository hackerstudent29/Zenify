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
import '../../models/track.dart';
import '../../services/artist_service.dart';
import '../../services/innertube_service.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import 'album_screen.dart';

/* ------------------------------------------------------------------ */
/*  Spring primitives                                                   */
/* ------------------------------------------------------------------ */
const _kPress = SpringDescription(mass: 1, stiffness: 430, damping: 21);
const _kReveal = SpringDescription(mass: 1, stiffness: 170, damping: 22);

/// A Curve driven by a real spring simulation, so implicit animations
/// (AnimatedSize, AnimatedContainer, TweenAnimationBuilder) overshoot and settle.
class _SpringCurve extends Curve {
  const _SpringCurve();
  static final _sim =
      SpringSimulation(const SpringDescription(mass: 1, stiffness: 200, damping: 17), 0, 1, 0);
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

/// Fade + rise with a spring; `from` lets a widget enter sideways or deeper.
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

/// Horizontal shelf that settles on a card with a spring.
class _SnapPhysics extends ScrollPhysics {
  const _SnapPhysics({super.parent, required this.itemExtent});
  final double itemExtent;

  @override
  _SnapPhysics applyTo(ScrollPhysics? ancestor) =>
      _SnapPhysics(parent: buildParent(ancestor), itemExtent: itemExtent);

  @override
  SpringDescription get spring =>
      SpringDescription.withDampingRatio(mass: 0.5, stiffness: 120, ratio: 1.05);

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
        child: const Icon(Icons.music_note_rounded, color: AppColors.textTertiary),
      ),
    );
    return circular ? ClipOval(child: img) : ClipRRect(borderRadius: BorderRadius.circular(radius), child: img);
  }
}

class _Eq extends StatefulWidget {
  const _Eq({required this.playing});
  final bool playing;

  @override
  State<_Eq> createState() => _EqState();
}

class _EqState extends State<_Eq> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

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

/// Pulsing placeholder while the artist loads.
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
        builder: (_, child) => Opacity(opacity: 0.45 + 0.4 * _c.value, child: child),
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
                    decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(8)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          height: 12,
                          width: 150 + (i % 3) * 30.0,
                          decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(6)),
                        ),
                        const SizedBox(height: 8),
                        Container(
                          height: 10,
                          width: 90,
                          decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(5)),
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
  const _SecHeader(this.title, {this.sub});
  final String title;
  final String? sub;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 32, 20, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (sub != null) Text(sub!, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
            Text(
              title,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.5,
              ),
            ),
          ],
        ),
      );
}

class _Shelf extends StatelessWidget {
  const _Shelf({required this.height, required this.itemExtent, required this.count, required this.builder});
  final double height, itemExtent;
  final int count;
  final Widget Function(int) builder;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        child: ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          physics: _SnapPhysics(parent: const BouncingScrollPhysics(), itemExtent: itemExtent),
          itemExtent: itemExtent,
          itemCount: count,
          itemBuilder: (_, i) => Padding(padding: const EdgeInsets.only(right: 14), child: builder(i)),
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
  Widget build(BuildContext context) => _Press(
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
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.28), blurRadius: 10, offset: const Offset(0, 4))],
                ),
                child: _Img(url, circular: circular, radius: radius),
              ),
            ),
            const SizedBox(height: 10),
            Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: circular ? TextAlign.center : TextAlign.start,
              style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600, letterSpacing: -0.15),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: circular ? TextAlign.center : TextAlign.start,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
            ),
          ],
        ),
      );
}

class _SongRow extends StatelessWidget {
  const _SongRow({required this.track, required this.index, required this.current, required this.playing, required this.onTap});
  final Track track;
  final int index;
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
                padding: const EdgeInsets.symmetric(horizontal: 20),
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
                              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(8)),
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
                            child: Text(track.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                          ),
                          const SizedBox(height: 2),
                          Text(track.album.isNotEmpty ? track.album : track.artist,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 14)),
                        ],
                      ),
                    ),
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: () {
                        HapticFeedback.selectionClick();
                        ZenDropdown.showTrackMenu(context: context, track: track);
                      },
                      child: const Padding(
                        padding: EdgeInsets.all(8),
                        child: Icon(Icons.more_horiz_rounded, color: AppColors.textTertiary, size: 22),
                      ),
                    ),
                  ],
                ),
              ),
              Positioned(left: 80, right: 0, bottom: 0, child: Container(height: 0.5, color: AppColors.hairline)),
            ],
          ),
        ),
      );
}

/// Pill used for Play / Shuffle.
class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.icon, required this.onTap, this.filled = false});
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool filled;

  @override
  Widget build(BuildContext context) => _Press(
        onTap: onTap,
        scale: 0.94,
        child: Container(
          height: 46,
          decoration: BoxDecoration(
            color: filled ? AppColors.accent : AppColors.surface2,
            borderRadius: BorderRadius.circular(14),
          ),
          alignment: Alignment.center,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18, color: filled ? Colors.white : AppColors.accent),
              const SizedBox(width: 8),
              Text(label,
                  style: TextStyle(
                    color: filled ? Colors.white : AppColors.accent,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  )),
            ],
          ),
        ),
      );
}

/* ------------------------------------------------------------------ */
/*  Screen                                                              */
/* ------------------------------------------------------------------ */
class _Release {
  _Release(this.title, this.cover, {this.browseId});
  final String title, cover;
  final String? browseId;
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
            final fallbackSongs = await InnerTubeService.instance.search(widget.artistName).timeout(const Duration(seconds: 4));
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
      if (mounted) setState(() { _tracks = r; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _play(List<Track> list, int i, {bool shuffle = false}) {
    if (list.isEmpty) return;
    HapticFeedback.mediumImpact();
    final q = List<Track>.of(list);
    if (shuffle) q.shuffle();
    context.read<PlayerState>().setQueue(q, startIndex: shuffle ? 0 : i);
  }

  void _openAlbum(_Release r) => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => AlbumScreen(
            albumTitle: r.title,
            artistName: widget.artistName,
            coverUrl: r.cover,
            browseId: r.browseId,
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final top = MediaQuery.paddingOf(context).top;
    final name = widget.artistName;
    final following = LibraryStore.instance.isFollowing(name);

    // Split results into the artist's own tracks and other artists.
    final lower = name.toLowerCase();
    final own = _tracks.where((t) => t.artist.toLowerCase().contains(lower)).toList();
    final songs = own.isEmpty ? _tracks : own;
    final others = _tracks.where((t) => !t.artist.toLowerCase().contains(lower)).toList();

    // Group songs into releases.
    final map = <String, _Release>{};
    for (final t in songs) {
      final a = t.album;
      final key = a.isEmpty ? t.title : a;
      map.putIfAbsent(key, () => _Release(key, t.coverUrl)).tracks.add(t);
    }
    final releases = map.values.toList();
    final albums = _artistProfile != null && _artistProfile!.albums.isNotEmpty
        ? _artistProfile!.albums.map((a) => _Release(a.title, a.coverUrl, browseId: a.browseId)).toList()
        : releases.where((r) => r.tracks.length >= 3).toList();
    final singles = _artistProfile != null && _artistProfile!.singles.isNotEmpty
        ? _artistProfile!.singles.map((s) => _Release(s.title, s.coverUrl, browseId: s.browseId)).toList()
        : releases.where((r) => r.tracks.length < 3).toList();

    // Related artists (from other artists in the results or profile).
    final relMap = <String, Track>{};
    for (final t in others) {
      relMap.putIfAbsent(t.artist, () => t);
    }
    final related = _artistProfile != null && _artistProfile!.relatedArtists.isNotEmpty
        ? _artistProfile!.relatedArtists
            .map((r) => MapEntry(r.name, Track(id: r.browseId ?? '', title: '', artist: r.name, album: '', coverUrl: r.imageUrl)))
            .toList()
        : relMap.entries.toList();

    final img = _resolvedImage ?? widget.imageUrl ??
        (_tracks.isNotEmpty ? _tracks.first.coverUrl : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800');
    final bio = _resolvedBio ?? widget.bio ??
        '$name has ${songs.length} ${songs.length == 1 ? 'song' : 'songs'} across ${releases.length} '
            '${releases.length == 1 ? 'release' : 'releases'} in the catalog. '
            'Press play to start with their top tracks, or shuffle to mix them up.';

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Stack(
        children: [
          // Parallax hero image: slides slower than content, stretches on overscroll.
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _sc,
              builder: (_, child) {
                final o = _sc.hasClients ? _sc.offset : 0.0;
                final stretch = o < 0 ? -o : 0.0;
                return Align(
                  alignment: Alignment.topCenter,
                  child: Transform.translate(
                    offset: Offset(0, o > 0 ? -o * 0.45 : 0),
                    child: Transform.scale(
                      scale: 1 + stretch / _heroH,
                      alignment: Alignment.topCenter,
                      child: child,
                    ),
                  ),
                );
              },
              child: SizedBox(
                height: _heroH,
                width: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    TweenAnimationBuilder<double>(
                      key: ValueKey(img),
                      tween: Tween(begin: 1.14, end: 1),
                      duration: const Duration(milliseconds: 1100),
                      curve: _spring,
                      builder: (_, s, child) => Transform.scale(scale: s, child: child),
                      child: CachedNetworkImage(
                        imageUrl: img,
                        fit: BoxFit.cover,
                        errorWidget: (context, url, error) => Container(color: AppColors.surface2),
                      ),
                    ),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          stops: const [0, 0.25, 0.6, 1],
                          colors: [
                            Colors.black.withValues(alpha: 0.35),
                            Colors.transparent,
                            AppColors.bg.withValues(alpha: 0.55),
                            AppColors.bg,
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          CustomScrollView(
            controller: _sc,
            physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
            slivers: [
              // Name + stats sit at the bottom of the hero and scroll with the page.
              SliverToBoxAdapter(
                child: SizedBox(
                  height: _heroH,
                  child: Align(
                    alignment: Alignment.bottomLeft,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
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
                                _loading
                                    ? 'Artist'
                                    : 'Artist · ${songs.length} songs · ${releases.length} releases',
                                key: ValueKey(_loading),
                                style: const TextStyle(color: AppColors.textSecondary, fontSize: 15),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              SliverFillRemaining(
                hasScrollBody: false,
                fillOverscroll: true,
                child: ColoredBox(
                  color: AppColors.bg,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Actions: Play, Shuffle, Follow
                      _Reveal(
                        delay: const Duration(milliseconds: 260),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          child: Row(
                            children: [
                              Expanded(
                                child: _Pill(
                                  label: 'Play',
                                  icon: CupertinoIcons.play_fill,
                                  filled: true,
                                  onTap: () => _play(songs, 0),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: _Pill(
                                  label: 'Shuffle',
                                  icon: CupertinoIcons.shuffle,
                                  onTap: () => _play(songs, 0, shuffle: true),
                                ),
                              ),
                              const SizedBox(width: 10),
                              _Press(
                                scale: 0.88,
                                onTap: () {
                                  HapticFeedback.selectionClick();
                                  LibraryStore.instance.toggleFollow(name, img);
                                },
                                child: AnimatedContainer(
                                  duration: const Duration(milliseconds: 600),
                                  curve: _spring,
                                  width: 46,
                                  height: 46,
                                  decoration: BoxDecoration(
                                    color: following ? Colors.white : AppColors.surface2,
                                    borderRadius: BorderRadius.circular(following ? 23 : 14),
                                  ),
                                  child: AnimatedSwitcher(
                                    duration: const Duration(milliseconds: 450),
                                    switchInCurve: _spring,
                                    transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                                    child: Icon(
                                      following ? CupertinoIcons.checkmark_alt : CupertinoIcons.person_add,
                                      key: ValueKey(following),
                                      size: 20,
                                      color: following ? Colors.black : Colors.white,
                                    ),
                                  ),
                                ),
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
                        // Latest release: a single wide row card
                        if (releases.isNotEmpty)
                          _Reveal(
                            delay: const Duration(milliseconds: 80),
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
                              child: _Press(
                                scale: 0.98,
                                onTap: () => _openAlbum(releases.first),
                                child: Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(16)),
                                  child: Row(
                                    children: [
                                      SizedBox(width: 72, height: 72, child: _Img(releases.first.cover, radius: 10)),
                                      const SizedBox(width: 14),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            const Text('Latest release',
                                                style: TextStyle(color: AppColors.accent, fontSize: 12, fontWeight: FontWeight.w700)),
                                            const SizedBox(height: 2),
                                            Text(releases.first.title,
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600)),
                                            Text(
                                              releases.first.tracks.length < 3
                                                  ? 'Single · $name'
                                                  : 'Album · ${releases.first.tracks.length} songs',
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                                            ),
                                          ],
                                        ),
                                      ),
                                      const Icon(Icons.chevron_right_rounded, color: AppColors.textTertiary),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),

                        // Songs (staggered rows, spring expand)
                        const _Reveal(child: _SecHeader('Songs')),
                        for (var i = 0; i < math.min(5, songs.length); i++)
                          _Reveal(
                            delay: Duration(milliseconds: 60 * i),
                            rise: 22,
                            child: _SongRow(
                              track: songs[i],
                              index: i,
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
                                          index: i,
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
                                    style: const TextStyle(color: AppColors.accent, fontSize: 16, fontWeight: FontWeight.w500),
                                  ),
                                  const SizedBox(width: 4),
                                  AnimatedRotation(
                                    turns: _showAll ? 0.5 : 0,
                                    duration: const Duration(milliseconds: 600),
                                    curve: _spring,
                                    child: const Icon(CupertinoIcons.chevron_down, size: 14, color: AppColors.accent),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],

                        // Albums: big covers
                        if (albums.isNotEmpty) ...[
                          const _Reveal(child: _SecHeader('Albums')),
                          _Reveal(
                            child: _Shelf(
                              height: 232,
                              itemExtent: 184,
                              count: albums.length,
                              builder: (i) => _Cover(
                                url: albums[i].cover,
                                title: albums[i].title,
                                subtitle: 'Album · ${albums[i].tracks.length} songs',
                                radius: 8,
                                onTap: () => _openAlbum(albums[i]),
                              ),
                            ),
                          ),
                        ],

                        // Singles & EPs: compact covers
                        if (singles.isNotEmpty) ...[
                          _Reveal(child: _SecHeader(albums.isEmpty ? 'Releases' : 'Singles & EPs')),
                          _Reveal(
                            child: _Shelf(
                              height: 190,
                              itemExtent: 144,
                              count: singles.length,
                              builder: (i) => _Cover(
                                url: singles[i].cover,
                                title: singles[i].title,
                                subtitle: singles[i].tracks.length == 1 ? 'Single' : 'EP',
                                onTap: () => _openAlbum(singles[i]),
                              ),
                            ),
                          ),
                        ],

                        // Videos: 16:9
                        _Reveal(child: _SecHeader('Videos', sub: 'Watch and listen')),
                        _Reveal(
                          child: _Shelf(
                            height: 196,
                            itemExtent: 274,
                            count: math.min(8, songs.length),
                            builder: (i) {
                              final t = songs[i];
                              return _Press(
                                onTap: () => _play(songs, i),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    AspectRatio(
                                      aspectRatio: 16 / 9,
                                      child: Stack(
                                        fit: StackFit.expand,
                                        children: [
                                          _Img(t.coverUrl, radius: 12),
                                          Center(
                                            child: Container(
                                              width: 44,
                                              height: 44,
                                              decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.black.withValues(alpha: 0.45)),
                                              child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 28),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    Text(t.title,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
                                    const SizedBox(height: 2),
                                    Text(t.artist,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                                  ],
                                ),
                              );
                            },
                          ),
                        ),

                        // Fans might also like: circles
                        if (related.isNotEmpty) ...[
                          const _Reveal(child: _SecHeader('Fans might also like')),
                          _Reveal(
                            child: _Shelf(
                              height: 160,
                              itemExtent: 124,
                              count: related.length,
                              builder: (i) => _Cover(
                                url: related[i].value.coverUrl,
                                title: related[i].key,
                                subtitle: 'Artist',
                                circular: true,
                                onTap: () => Navigator.push(
                                  context,
                                  MaterialPageRoute(builder: (_) => ArtistScreen(artistName: related[i].key)),
                                ),
                              ),
                            ),
                          ),
                        ],

                        // About: portrait, stats and biography
                        const _Reveal(child: _SecHeader('About')),
                        _Reveal(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            child: Container(
                              decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(20)),
                              clipBehavior: Clip.antiAlias,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  AspectRatio(
                                    aspectRatio: 4 / 3,
                                    child: Stack(
                                      fit: StackFit.expand,
                                      children: [
                                        CachedNetworkImage(imageUrl: img, fit: BoxFit.cover),
                                        DecoratedBox(
                                          decoration: BoxDecoration(
                                            gradient: LinearGradient(
                                              begin: Alignment.topCenter,
                                              end: Alignment.bottomCenter,
                                              stops: const [0.45, 1],
                                              colors: [Colors.transparent, Colors.black.withValues(alpha: 0.7)],
                                            ),
                                          ),
                                        ),
                                        Positioned(
                                          left: 16,
                                          bottom: 14,
                                          right: 16,
                                          child: Text(
                                            name,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                                color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.7),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
                                    child: Row(
                                      children: [
                                        _Stat('${songs.length}', 'Songs'),
                                        _Stat('${releases.length}', 'Releases'),
                                        _Stat('${related.length}', 'Related'),
                                      ],
                                    ),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                                    child: GestureDetector(
                                      onTap: () {
                                        HapticFeedback.selectionClick();
                                        setState(() => _bioOpen = !_bioOpen);
                                      },
                                      child: AnimatedSize(
                                        duration: const Duration(milliseconds: 650),
                                        curve: _spring,
                                        alignment: Alignment.topCenter,
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              bio,
                                              maxLines: _bioOpen ? null : 3,
                                              overflow: _bioOpen ? TextOverflow.visible : TextOverflow.ellipsis,
                                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 15, height: 1.4),
                                            ),
                                            const SizedBox(height: 6),
                                            Text(
                                              _bioOpen ? 'Less' : 'More',
                                              style: const TextStyle(color: AppColors.accent, fontSize: 15, fontWeight: FontWeight.w600),
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
                      ],
                      const SizedBox(height: 140),
                    ],
                  ),
                ),
              ),
            ],
          ),

          // Top bar: back button always, title + solid background once the hero scrolls away.
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: AnimatedBuilder(
              animation: _sc,
              builder: (_, child) {
                final o = _sc.hasClients ? _sc.offset : 0.0;
                final t = ((o - (_heroH - 150)) / 60).clamp(0.0, 1.0).toDouble();
                return Container(
                  height: top + 52,
                  padding: EdgeInsets.only(top: top),
                  decoration: BoxDecoration(
                    color: AppColors.bg.withValues(alpha: t),
                    border: Border(bottom: BorderSide(color: AppColors.hairline.withValues(alpha: t), width: 0.5)),
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Opacity(
                        opacity: t,
                        child: Transform.translate(
                          offset: Offset(0, (1 - t) * 8),
                          child: Text(name,
                              style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600)),
                        ),
                      ),
                      child!,
                    ],
                  ),
                );
              },
              child: Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(left: 14),
                  child: _Press(
                    scale: 0.88,
                    onTap: () => Navigator.pop(context),
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.black.withValues(alpha: 0.45)),
                      child: const Icon(CupertinoIcons.chevron_back, color: Colors.white, size: 20),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.value, this.label);
  final String value, label;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: double.tryParse(value) ?? 0),
              duration: const Duration(milliseconds: 900),
              curve: _spring,
              builder: (_, v, child) => Text(
                v.round().toString(),
                style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.5),
              ),
            ),
            Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          ],
        ),
      );
}
