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
import '../../services/innertube_service.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';
import 'artist_popup.dart';
import 'artist_screen.dart';

/* ------------------------------------------------------------------ */
/*  Spring primitives                                                   */
/* ------------------------------------------------------------------ */
const _kPress = SpringDescription(mass: 1, stiffness: 430, damping: 21);
const _kReveal = SpringDescription(mass: 1, stiffness: 170, damping: 22);

/// Curve driven by a real spring so implicit animations overshoot and settle.
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
  const _Img(this.url, {this.radius = 10});
  final String url;
  final double radius;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: CachedNetworkImage(
          imageUrl: url,
          fit: BoxFit.cover,
          fadeInDuration: const Duration(milliseconds: 260),
          placeholder: (context, url) => Container(color: AppColors.surface2),
          errorWidget: (context, url, error) => Container(
            color: AppColors.surface2,
            child: const Icon(Icons.music_note_rounded, color: AppColors.textTertiary),
          ),
        ),
      );
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
              height: 14 * v,
              margin: const EdgeInsets.only(right: 2),
              decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(1.5)),
            );
          }),
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

/// A release grouped from search results.
class _Release {
  _Release(this.title, this.artist, this.cover);
  final String title, artist, cover;
  int count = 0;
}

List<_Release> _group(Iterable<Track> tracks, {String? skip}) {
  final map = <String, _Release>{};
  for (final t in tracks) {
    final a = t.album;
    final key = a.isEmpty ? t.title : a;
    if (skip != null && key.toLowerCase() == skip.toLowerCase()) continue;
    final r = map.putIfAbsent(key, () => _Release(key, t.artist, t.coverUrl));
    r.count++;
  }
  return map.values.toList();
}

/* ------------------------------------------------------------------ */
/*  Screen                                                              */
/* ------------------------------------------------------------------ */
class AlbumScreen extends StatefulWidget {
  const AlbumScreen({
    super.key,
    required this.albumTitle,
    required this.artistName,
    this.coverUrl,
    this.initialTracks,
    this.browseId,
  });

  final String albumTitle;
  final String artistName;
  final String? coverUrl;
  final List<Track>? initialTracks;
  final String? browseId;

  @override
  State<AlbumScreen> createState() => _AlbumScreenState();
}

class _AlbumScreenState extends State<AlbumScreen> {
  static const double _coverTop = 64;

  final _sc = ScrollController();
  List<Track> _tracks = [];
  List<Track> _artistPool = [];
  bool _loading = true;
  String? _resolvedCover;

  @override
  void initState() {
    super.initState();
    final init = widget.initialTracks;
    if (init != null && init.isNotEmpty) {
      _tracks = init;
      _loading = false;
    } else {
      _loadAlbum();
    }
    _loadMore();
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

  Future<void> _loadAlbum() async {
    try {
      final bId = widget.browseId ?? '';
      if (bId.isNotEmpty) {
        if (bId.startsWith('VLPL') || bId.startsWith('PL') || bId.startsWith('RD')) {
          final pRes = await InnerTubeService.instance.getPlaylist(bId);
          if (pRes != null && pRes.tracks.isNotEmpty) {
            if (mounted) {
              setState(() {
                _tracks = pRes.tracks;
                if (pRes.coverUrl.isNotEmpty) _resolvedCover = pRes.coverUrl;
                _loading = false;
              });
            }
            return;
          }
        }
      }

      final res = await InnerTubeService.instance.getAlbum(
        bId,
        albumTitle: widget.albumTitle,
        artistName: widget.artistName,
      );
      if (res != null && res.tracks.isNotEmpty) {
        if (mounted) {
          setState(() {
            _tracks = res.tracks;
            if (res.coverUrl.isNotEmpty) _resolvedCover = res.coverUrl;
            _loading = false;
          });
        }
        return;
      }

      final r = await InnerTubeService.instance.search('${widget.albumTitle} ${widget.artistName}');
      // Prefer exact album matches; fall back to everything returned.
      final exact = r.where((t) {
        final a = t.album;
        return a.toLowerCase() == widget.albumTitle.toLowerCase();
      }).toList();
      if (mounted) setState(() { _tracks = exact.isNotEmpty ? exact : r; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadMore() async {
    try {
      final r = await InnerTubeService.instance.search(widget.artistName);
      if (mounted) setState(() => _artistPool = r);
    } catch (_) {/* optional sections just stay hidden */}
  }

  void _play(int i, {bool shuffle = false}) {
    if (_tracks.isEmpty) return;
    HapticFeedback.mediumImpact();
    final q = List<Track>.of(_tracks);
    if (shuffle) q.shuffle();
    context.read<PlayerState>().setQueue(q, startIndex: shuffle ? 0 : i);
  }

  void _openAlbum(_Release r) => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => AlbumScreen(
            albumTitle: r.title,
            artistName: r.artist,
            coverUrl: r.cover,
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final top = MediaQuery.paddingOf(context).top;
    final width = MediaQuery.sizeOf(context).width;
    final coverSize = math.min(width - 80, 300.0);
    final saved = LibraryStore.instance.isAlbumSaved(widget.albumTitle, widget.artistName);
    final cover = _resolvedCover ?? widget.coverUrl ??
        (_tracks.isNotEmpty ? _tracks.first.coverUrl : 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600');

    // Extra sections derived from the artist search.
    final lower = widget.artistName.toLowerCase();
    final mine = _artistPool.where((t) => t.artist.toLowerCase().contains(lower));
    final theirs = _artistPool.where((t) => !t.artist.toLowerCase().contains(lower));
    final moreBy = _group(mine, skip: widget.albumTitle);
    final similar = _group(theirs);

    final headerH = top + _coverTop + coverSize + 150;

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: Stack(
        children: [
          CustomScrollView(
            controller: _sc,
            physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
            slivers: [
              // Cover, title, artist, meta
              SliverToBoxAdapter(
                child: SizedBox(
                  height: headerH,
                  child: Column(
                    children: [
                      SizedBox(height: top + _coverTop),
                      AnimatedBuilder(
                        animation: _sc,
                        builder: (_, child) {
                          final o = _sc.hasClients ? _sc.offset : 0.0;
                          final s = o < 0 ? 1 + (-o) / 700 : (1 - o / 900).clamp(0.82, 1.0).toDouble();
                          final fade = (1 - (o - 120) / 260).clamp(0.0, 1.0).toDouble();
                          return Opacity(
                            opacity: fade,
                            child: Transform.scale(scale: s, alignment: Alignment.topCenter, child: child),
                          );
                        },
                        child: TweenAnimationBuilder<double>(
                          tween: Tween(begin: 0.84, end: 1),
                          duration: const Duration(milliseconds: 1000),
                          curve: _spring,
                          builder: (_, s, child) => Transform.scale(
                            scale: s,
                            child: Opacity(opacity: ((s - 0.84) / 0.16).clamp(0.0, 1.0).toDouble(), child: child),
                          ),
                          child: Container(
                            width: coverSize,
                            height: coverSize,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.45), blurRadius: 28, offset: const Offset(0, 14))],
                            ),
                            child: _Img(cover, radius: 14),
                          ),
                        ),
                      ),
                      const SizedBox(height: 22),
                      _Reveal(
                        delay: const Duration(milliseconds: 160),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 24),
                          child: Column(
                            children: [
                              Text(
                                MediaNormalizer.cleanTitle(widget.albumTitle),
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700, letterSpacing: -0.6),
                              ),
                              const SizedBox(height: 4),
                              _Press(
                                scale: 0.94,
                                onTap: () {
                                  final artists = MediaNormalizer.splitArtistNames(widget.artistName);
                                  if (artists.length > 1) {
                                    showArtistPopup(context, currentArtistName: widget.artistName);
                                  } else if (artists.isNotEmpty) {
                                    Navigator.push(
                                      context,
                                      MaterialPageRoute(builder: (_) => ArtistScreen(artistName: artists.first)),
                                    );
                                  }
                                },
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Flexible(
                                      child: Text(
                                        MediaNormalizer.formatArtists(widget.artistName),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(color: AppColors.accent, fontSize: 20, fontWeight: FontWeight.w500),
                                      ),
                                    ),
                                    const Icon(Icons.chevron_right_rounded, color: AppColors.accent, size: 22),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 2),
                              AnimatedSwitcher(
                                duration: const Duration(milliseconds: 400),
                                child: Text(
                                  _loading ? 'Album' : 'Album · ${_tracks.length} ${_tracks.length == 1 ? 'song' : 'songs'}',
                                  key: ValueKey(_loading),
                                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Actions
                    _Reveal(
                      delay: const Duration(milliseconds: 260),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Row(
                          children: [
                            Expanded(child: _Pill(label: 'Play', icon: CupertinoIcons.play_fill, filled: true, onTap: () => _play(0))),
                            const SizedBox(width: 10),
                            Expanded(child: _Pill(label: 'Shuffle', icon: CupertinoIcons.shuffle, onTap: () => _play(0, shuffle: true))),
                            const SizedBox(width: 10),
                            _Press(
                              scale: 0.88,
                              onTap: () {
                                HapticFeedback.selectionClick();
                                LibraryStore.instance.toggleAlbum(widget.albumTitle, widget.artistName, cover);
                              },
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 600),
                                curve: _spring,
                                width: 46,
                                height: 46,
                                decoration: BoxDecoration(
                                  color: AppColors.surface2,
                                  borderRadius: BorderRadius.circular(saved ? 23 : 14),
                                ),
                                child: AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 450),
                                  switchInCurve: _spring,
                                  transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                                  child: Icon(
                                    saved ? CupertinoIcons.heart_fill : CupertinoIcons.heart,
                                    key: ValueKey(saved),
                                    size: 21,
                                    color: saved ? AppColors.accent : Colors.white,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    const SizedBox(height: 14),

                    // Tracklist
                    if (_loading)
                      const Padding(
                        padding: EdgeInsets.all(40),
                        child: Center(child: CupertinoActivityIndicator(color: Colors.white70, radius: 12)),
                      )
                    else if (_tracks.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(40),
                        child: Center(child: Text('No tracks found for this album.', style: TextStyle(color: AppColors.textSecondary))),
                      )
                    else ...[
                      for (var i = 0; i < _tracks.length; i++)
                        _Reveal(
                          delay: Duration(milliseconds: 50 * math.min(i, 9)),
                          rise: 22,
                          child: _TrackRow(
                            index: i,
                            track: _tracks[i],
                            showArtist: !_tracks[i].artist.toLowerCase().contains(lower),
                            current: player.currentTrack?.id == _tracks[i].id,
                            playing: player.currentTrack?.id == _tracks[i].id && player.isPlaying,
                            onTap: () => _play(i),
                          ),
                        ),
                      _Reveal(
                        delay: Duration(milliseconds: (50 * math.min(_tracks.length, 9) + 80).toInt()),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                          child: Text(
                            '${_tracks.length} ${_tracks.length == 1 ? 'song' : 'songs'}',
                            style: const TextStyle(color: AppColors.textTertiary, fontSize: 13),
                          ),
                        ),
                      ),
                    ],

                    // More by the artist
                    if (moreBy.isNotEmpty) ...[
                      _Reveal(child: _SecHeader('More by ${widget.artistName}')),
                      _Reveal(child: _ReleaseShelf(items: moreBy, onTap: _openAlbum, label: 'Album')),
                    ],

                    // You might also like
                    if (similar.isNotEmpty) ...[
                      const _Reveal(child: _SecHeader('You might also like')),
                      _Reveal(child: _ReleaseShelf(items: similar, onTap: _openAlbum, showArtist: true)),
                    ],

                    const SizedBox(height: 140),
                  ],
                ),
              ),
            ],
          ),

          // Top bar: back button, title fades in once the cover scrolls away
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: AnimatedBuilder(
              animation: _sc,
              builder: (_, child) {
                final o = _sc.hasClients ? _sc.offset : 0.0;
                final t = ((o - (top + _coverTop + coverSize - 40)) / 50).clamp(0.0, 1.0).toDouble();
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
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 64),
                            child: Text(MediaNormalizer.cleanTitle(widget.albumTitle),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600)),
                          ),
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
                      decoration: const BoxDecoration(shape: BoxShape.circle, color: AppColors.surface2),
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

class _TrackRow extends StatelessWidget {
  const _TrackRow({
    required this.index,
    required this.track,
    required this.current,
    required this.playing,
    required this.showArtist,
    required this.onTap,
  });
  final int index;
  final Track track;
  final bool current, playing, showArtist;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => _Press(
        scale: 0.975,
        onTap: onTap,
        child: SizedBox(
          height: 56,
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: [
                    SizedBox(
                      width: 32,
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 350),
                        switchInCurve: _spring,
                        transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                        child: current
                            ? Align(key: const ValueKey('eq'), alignment: Alignment.centerLeft, child: _Eq(playing: playing))
                            : Align(
                                key: const ValueKey('n'),
                                alignment: Alignment.centerLeft,
                                child: Text('${index + 1}',
                                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 16)),
                              ),
                      ),
                    ),
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
                          if (showArtist)
                            Text(track.artist,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
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
              Positioned(left: 52, right: 0, bottom: 0, child: Container(height: 0.5, color: AppColors.hairline)),
            ],
          ),
        ),
      );
}

class _ReleaseShelf extends StatelessWidget {
  const _ReleaseShelf({required this.items, required this.onTap, this.showArtist = false, this.label});
  final List<_Release> items;
  final void Function(_Release) onTap;
  final bool showArtist;
  final String? label;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 214,
        child: ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          physics: const _SnapPhysics(parent: BouncingScrollPhysics(), itemExtent: 164),
          itemExtent: 164,
          itemCount: items.length,
          itemBuilder: (_, i) {
            final r = items[i];
            return Padding(
              padding: const EdgeInsets.only(right: 14),
              child: _Press(
                onTap: () => onTap(r),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AspectRatio(
                      aspectRatio: 1,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.28), blurRadius: 10, offset: const Offset(0, 4))],
                        ),
                        child: _Img(r.cover),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(r.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600, letterSpacing: -0.15)),
                    const SizedBox(height: 2),
                    Text(showArtist ? r.artist : (r.count < 3 ? 'Single' : (label ?? 'Album')),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                  ],
                ),
              ),
            );
          },
        ),
      );
}
