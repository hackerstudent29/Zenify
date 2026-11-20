import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart' show CupertinoIcons;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/artwork_mesh_background.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/innertube_service.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';
import 'album_screen.dart';
import 'artist_popup.dart';
import 'artist_screen.dart';

// ═════════════════════════════════════════════════════════════════════════════
// Primitives
// ═════════════════════════════════════════════════════════════════════════════

const _kPressSpring = SpringDescription(mass: 1, stiffness: 430, damping: 21);

TextStyle _display({
  double size = 20,
  FontWeight weight = FontWeight.w700,
  Color color = Colors.white,
  double spacing = -0.3,
}) => TextStyle(
  fontFamily: 'SF Pro Display',
  fontSize: size,
  fontWeight: weight,
  color: color,
  letterSpacing: spacing,
);

TextStyle _body({
  double size = 14,
  FontWeight weight = FontWeight.w500,
  Color color = AppColors.textSecondary,
}) => TextStyle(
  fontFamily: 'SF Pro',
  fontSize: size,
  fontWeight: weight,
  color: color,
  letterSpacing: -0.1,
);

double _interval(
  double t,
  double begin,
  double end, [
  Curve c = Curves.easeOutCubic,
]) {
  if (end <= begin) return t >= end ? 1 : 0;
  return c.transform(((t - begin) / (end - begin)).clamp(0.0, 1.0));
}

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

  void _to(double v) {
    if (!mounted) return;
    _c.animateWith(SpringSimulation(_kPressSpring, _c.value, v, 0));
  }

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
        builder: (_, child) => Transform.scale(
          // Clamp: spring can overshoot, never let it invert/flicker.
          scale: _c.value.clamp(0.5, 1.15),
          child: child,
        ),
      ),
    );
  }
}

class _Img extends StatelessWidget {
  const _Img(
    this.url, {
    this.radius = 6,
    this.circular = false,
    this.cacheWidth = 240,
  });
  final String url;
  final double radius;
  final bool circular;
  final int cacheWidth;

  @override
  Widget build(BuildContext context) {
    final placeholder = Container(
      color: AppColors.surface2,
      child: Icon(
        circular ? CupertinoIcons.person_fill : Icons.music_note_rounded,
        color: AppColors.textTertiary,
      ),
    );
    final img = url.isEmpty
        ? placeholder
        : CachedNetworkImage(
            imageUrl: MediaNormalizer.upgradeArtworkUrl(
              url,
              isArtistAvatar: circular,
            ),
            fit: BoxFit.cover,
            memCacheWidth: cacheWidth,
            fadeInDuration: const Duration(milliseconds: 220),
            fadeOutDuration: const Duration(milliseconds: 120),
            placeholder: (context, u) => Container(color: AppColors.surface2),
            errorWidget: (context, u, e) => placeholder,
          );
    if (circular) return ClipOval(child: img);
    return ClipRRect(borderRadius: BorderRadius.circular(radius), child: img);
  }
}

class _EqBars extends StatefulWidget {
  const _EqBars({required this.playing});
  final bool playing;

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
    if (!widget.playing && _c.isAnimating) _c.stop();
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
      builder: (context, _) => Row(
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
            height: 16 * v,
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

// ═════════════════════════════════════════════════════════════════════════════
// CategoryScreen
// ═════════════════════════════════════════════════════════════════════════════

class CategoryScreen extends StatefulWidget {
  const CategoryScreen({
    super.key,
    required this.title,
    this.query,
    this.initialTracks,
    this.heroLabel,
    this.subtitle = 'Curated by Zenify',
    this.description,
    this.colors,
  });

  final String title;
  final String? heroLabel;
  final String? query;
  final List<Track>? initialTracks;
  final String subtitle;
  final String? description;
  final List<Color>? colors;

  @override
  State<CategoryScreen> createState() => _CategoryScreenState();
}

class _CategoryScreenState extends State<CategoryScreen>
    with TickerProviderStateMixin {
  final _scroll = ScrollController();
  final _offset = ValueNotifier<double>(0);
  final _heroVisible = ValueNotifier<bool>(true);
  double _heroBgHeight = 400.0;

  List<Track> _tracks = const [];
  bool _loading = true;
  bool _expanded = false;
  int _loadToken = 0;
  Timer? _revealTimer;

  late final Color _seedColor = _computeSeed();

  late final AnimationController _entrance = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );
  late final AnimationController _breathing = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3800),
  )..repeat(reverse: true);
  late final AnimationController _listIn = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1000),
  );

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    _entrance.forward();

    final init = widget.initialTracks;
    if (init != null && init.isNotEmpty) {
      _tracks = init;
      _loading = false;
      _revealList(delay: const Duration(milliseconds: 380));
    } else {
      _load();
    }
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    final off = _scroll.offset;
    _offset.value = off;
    final visible = off <= _heroBgHeight;
    if (_heroVisible.value != visible) {
      _heroVisible.value = visible;
    }
  }

  void _revealList({Duration delay = Duration.zero}) {
    _revealTimer?.cancel();
    if (delay == Duration.zero) {
      if (mounted) _listIn.forward(from: 0);
    } else {
      _revealTimer = Timer(delay, () {
        if (mounted) _listIn.forward(from: 0);
      });
    }
  }

  Future<void> _load() async {
    final token = ++_loadToken;
    final effectiveQuery = (widget.query?.trim().isNotEmpty == true)
        ? widget.query!.trim()
        : '${widget.title} songs';

    try {
      final r = await InnerTubeService.instance.search(effectiveQuery);
      if (!mounted || token != _loadToken) return;
      setState(() {
        _tracks = r;
        _loading = false;
      });
      _revealList();
    } catch (_) {
      if (mounted && token == _loadToken) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _revealTimer?.cancel();
    _scroll.removeListener(_onScroll);
    _entrance.dispose();
    _breathing.dispose();
    _listIn.dispose();
    _offset.dispose();
    _heroVisible.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Color _computeSeed() {
    if (widget.colors != null && widget.colors!.isNotEmpty) {
      return widget.colors!.first;
    }
    final t = widget.title.toLowerCase();
    if (t.contains('chill') || t.contains('relax') || t.contains('peace')) {
      return const Color(0xFF0EA5E9);
    }
    if (t.contains('romantic') || t.contains('romance') || t.contains('love')) {
      return const Color(0xFFF43F5E);
    }
    if (t.contains('party') || t.contains('dance') || t.contains('club')) {
      return const Color(0xFFA855F7);
    }
    if (t.contains('focus') || t.contains('study') || t.contains('calm')) {
      return const Color(0xFF3B82F6);
    }
    if (t.contains('workout') || t.contains('gym') || t.contains('energy')) {
      return const Color(0xFFEA580C);
    }
    if (t.contains('feel good') || t.contains('happy')) {
      return const Color(0xFFF59E0B);
    }
    if (t.contains('sad') || t.contains('heartbreak')) {
      return const Color(0xFF64748B);
    }
    if (t.contains('rock') || t.contains('metal')) {
      return const Color(0xFFE11D48);
    }
    if (t.contains('devotional') || t.contains('spiritual')) {
      return const Color(0xFFFB923C);
    }
    return HSLColor.fromAHSL(
      1,
      (widget.title.hashCode.abs() % 360).toDouble(),
      0.45,
      0.50,
    ).toColor();
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  void _play(int index, {bool shuffle = false}) {
    if (_tracks.isEmpty) return;
    HapticFeedback.mediumImpact();
    final i = index.clamp(0, _tracks.length - 1);
    final ctx = PlaybackContext(
      type: PlaybackContextType.homeSection,
      id: 'category_${widget.title}',
      tracks: _tracks,
      startTrack: _tracks[i],
      title: widget.title,
    );
    context.read<PlayerState>().setQueue(
      _tracks,
      startIndex: shuffle ? 0 : i,
      shuffle: shuffle,
      context: ctx,
    );
  }

  void _queueAll() {
    if (_tracks.isEmpty) return;
    HapticFeedback.selectionClick();
    final p = context.read<PlayerState>();
    for (final t in _tracks) {
      p.playLast(t);
    }
  }

  void _menu() {
    HapticFeedback.selectionClick();
    ZenDropdown.show<void>(
      context: context,
      title: widget.title,
      subtitle: widget.subtitle,
      items: [
        ZenDropdownItem(
          title: 'Play',
          icon: CupertinoIcons.play_fill,
          isSelected: false,
          onTap: () => _play(0),
        ),
        ZenDropdownItem(
          title: 'Shuffle',
          icon: CupertinoIcons.shuffle,
          isSelected: false,
          onTap: () => _play(0, shuffle: true),
        ),
        ZenDropdownItem(
          title: 'Add to Queue',
          icon: CupertinoIcons.text_badge_plus,
          isSelected: false,
          onTap: _queueAll,
        ),
      ],
    );
  }

  void _openAlbum(Track t) {
    Navigator.push(
      context,
      ZenPageRoute(
        builder: (_) => AlbumScreen(
          albumTitle: t.album,
          artistName: t.artist,
          coverUrl: t.coverUrl,
          browseId: t.albumBrowseId,
        ),
      ),
    );
  }

  void _trackMenu(Track track) {
    HapticFeedback.mediumImpact();
    final player = context.read<PlayerState>();
    final artists = track.resolvedArtists;
    ZenDropdown.showTrackMenu(
      context: context,
      track: track,
      trackTitle: track.title,
      artistName: track.artist,
      albumName: track.album,
      coverUrl: track.coverUrl,
      onPlayNext: () => player.playNext(track),
      onPlayLater: () => player.playLast(track),
      onGoToArtist: () {
        if (artists.length > 1) {
          showArtistPopup(context, artists: artists);
        } else if (artists.isNotEmpty) {
          Navigator.push(
            context,
            ZenPageRoute(
              builder: (_) => ArtistScreen(
                artistName: artists.first.name,
                browseId: artists.first.id,
              ),
            ),
          );
        }
      },
      onGoToAlbum: track.album.isNotEmpty ? () => _openAlbum(track) : null,
    );
  }

  bool _isActive(Track t, String? id) {
    if (id == null || id.isEmpty) return false;
    return id == t.id || id == 'yt-${t.id}' || t.id == 'yt-$id';
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final w = mq.size.width;
    final top = mq.padding.top;
    final heroHeight = w * 0.78 + top;
    _heroBgHeight = heroHeight + 50.0;

    final activeId = context.select<PlayerState, String?>(
      (p) => p.currentTrack?.id,
    );
    final playing = context.select<PlayerState, bool>((p) => p.isPlaying);

    final seed = _seedColor;
    final light = Color.lerp(seed, Colors.white, 0.45)!;
    final deep = Color.lerp(seed, Colors.black, 0.65)!;
    final palette = widget.colors ?? [light, seed, deep, Zen.bg];

    final firstCover = _tracks.isNotEmpty ? _tracks.first.coverUrl : null;
    final covers = _tracks
        .take(6)
        .map((t) => t.coverUrl)
        .where((u) => u.isNotEmpty)
        .toList();

    return Scaffold(
      backgroundColor: Zen.bg,
      body: Stack(
        children: [
          // 1. Apple Music Living Artwork Mesh (Isolated Top Layer with Zero-Seam Gradient Dissolve)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: _heroBgHeight,
            child: ValueListenableBuilder<bool>(
              valueListenable: _heroVisible,
              builder: (context, isVisible, _) {
                return RepaintBoundary(
                  child: TickerMode(
                    enabled: isVisible,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        ArtworkMeshBackground(
                          coverUrl: firstCover,
                          covers: covers.isNotEmpty ? covers : null,
                          palette: palette,
                          backgroundColor: Zen.bg,
                          speed: 0.9,
                          interactive: false,
                          paused: !isVisible,
                          scrimOpacity: 0.20,
                        ),
                        // Multi-stop liquid gradient dissolve directly into Zen.bg
                        DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              stops: const [0.0, 0.35, 0.68, 1.0],
                              colors: [
                                Colors.black.withValues(alpha: 0.16),
                                Colors.transparent,
                                Zen.bg.withValues(alpha: 0.75),
                                Zen.bg,
                              ],
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

          // 2. Main Scroll Content
          CustomScrollView(
            controller: _scroll,
            physics: const BouncingScrollPhysics(
              parent: AlwaysScrollableScrollPhysics(),
            ),
            slivers: [
              SliverToBoxAdapter(child: _buildHead(w, top, heroHeight)),
              if (_loading)
                const SliverToBoxAdapter(child: _ListSkeleton())
              else if (_tracks.isEmpty)
                SliverToBoxAdapter(child: _buildEmpty())
              else ...[
                SliverFixedExtentList(
                  itemExtent: 64,
                  delegate: SliverChildBuilderDelegate((context, i) {
                    final t = _tracks[i];
                    final cur = _isActive(t, activeId);
                    final row = _Row(
                      track: t,
                      current: cur,
                      playing: cur && playing,
                      divider: i < _tracks.length - 1,
                      onTap: () => _play(i),
                      onMore: () => _trackMenu(t),
                    );
                    return _Stagger(controller: _listIn, index: i, child: row);
                  }, childCount: _tracks.length),
                ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                    child: Text(
                      '${_tracks.length} ${_tracks.length == 1 ? 'song' : 'songs'}',
                      style: _body(size: 14, color: AppColors.textTertiary),
                    ),
                  ),
                ),
                ..._buildFeatured(w),
              ],
              SliverToBoxAdapter(
                child: SizedBox(height: 180 + mq.padding.bottom),
              ),
            ],
          ),

          // 3. Dynamic Island Navigation Header
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandHeader(
              title: widget.title,
              subtitle: widget.subtitle,
              showBack: true,
              showProfile: false,
              scrollController: _scroll,
              revealOffset: top + 150.0,
              onBack: () => Navigator.maybePop(context),
              onMore: _menu,
            ),
          ),
        ],
      ),
    );
  }

  /// Apple Music liquid hero content (letters + subtitle + actions).
  Widget _buildHead(double w, double top, double heroHeight) {
    final seed = _seedColor;
    final desc = widget.description;
    final label = widget.heroLabel ?? widget.title;
    final chars = label.characters.toList();

    return ConstrainedBox(
      constraints: BoxConstraints(minHeight: heroHeight),
      child: ValueListenableBuilder<double>(
        valueListenable: _offset,
        builder: (context, offset, _) {
          final collapse = (offset / (w * 0.60)).clamp(0.0, 1.0);
          final textOpacity = (1.0 - collapse * 1.35).clamp(0.0, 1.0);
          final textDy = -offset.clamp(0.0, 9999.0) * 0.35;

          return Transform.translate(
            offset: Offset(0, textDy),
            child: Opacity(
              opacity: textOpacity,
              child: Padding(
                padding: EdgeInsets.fromLTRB(20, top + 56, 20, 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Single Category Title (Animated Per-Letter Entrance + Living Subtle Breathing)
                    _Reveal(
                      controller: _entrance,
                      begin: 0.05,
                      end: 0.65,
                      dy: 16,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: _HeroLetters(
                            chars: chars,
                            entrance: _entrance,
                            breathing: _breathing,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),

                    // Subtitle
                    _Reveal(
                      controller: _entrance,
                      begin: 0.20,
                      end: 0.70,
                      dy: 12,
                      child: Text(
                        widget.subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: _body(
                          size: 15,
                          weight: FontWeight.w600,
                          color: Colors.white.withValues(alpha: 0.75),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Action Buttons: Play · Shuffle · Add
                    _Reveal(
                      controller: _entrance,
                      begin: 0.32,
                      end: 0.82,
                      dy: 18,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: Row(
                          children: [
                            _RoundBtn(
                              icon: CupertinoIcons.shuffle,
                              onTap: () => _play(0, shuffle: true),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _Press(
                                scale: 0.96,
                                onTap: () => _play(0),
                                child: Container(
                                  height: 48,
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(
                                      alpha: 0.96,
                                    ),
                                    borderRadius: BorderRadius.circular(24),
                                    boxShadow: [
                                      BoxShadow(
                                        color: seed.withValues(alpha: 0.35),
                                        blurRadius: 22,
                                        offset: const Offset(0, 8),
                                      ),
                                    ],
                                  ),
                                  child: Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.center,
                                    children: [
                                      const Icon(
                                        CupertinoIcons.play_fill,
                                        size: 16,
                                        color: Colors.black,
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        'Play',
                                        style: _body(
                                          size: 17,
                                          weight: FontWeight.w700,
                                          color: Colors.black,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            _RoundBtn(
                              icon: CupertinoIcons.add,
                              onTap: _queueAll,
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Optional Description
                    if (desc != null && desc.trim().isNotEmpty) ...[
                      const SizedBox(height: 18),
                      _Reveal(
                        controller: _entrance,
                        begin: 0.45,
                        end: 0.95,
                        dy: 14,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 16,
                          ),
                          child: AnimatedSize(
                            duration: const Duration(milliseconds: 280),
                            curve: Curves.easeOutCubic,
                            alignment: Alignment.topCenter,
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: () =>
                                  setState(() => _expanded = !_expanded),
                              child: Align(
                                alignment: Alignment.centerLeft,
                                child: Text.rich(
                                  TextSpan(
                                    children: [
                                      TextSpan(
                                        text: desc,
                                        style: _body(
                                          size: 14.5,
                                          color: Colors.white.withValues(
                                            alpha: 0.68,
                                          ),
                                        ),
                                      ),
                                      TextSpan(
                                        text: _expanded
                                            ? '  LESS'
                                            : '  MORE',
                                        style: _body(
                                          size: 13,
                                          weight: FontWeight.w700,
                                          color: Colors.white,
                                        ),
                                      ),
                                    ],
                                  ),
                                  maxLines: _expanded ? null : 2,
                                  overflow: _expanded
                                      ? TextOverflow.visible
                                      : TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  List<Widget> _buildFeatured(double w) {
    final seen = <String>{};
    final artists = <({String name, String? id, String cover})>[];
    for (final t in _tracks) {
      for (final a in t.resolvedArtists) {
        if (a.name.trim().isEmpty || !seen.add(a.name.toLowerCase())) continue;
        artists.add((name: a.name, id: a.id, cover: t.coverUrl));
        if (artists.length >= 12) break;
      }
      if (artists.length >= 12) break;
    }
    if (artists.length < 2) return const [];

    final size = (w * 0.46).clamp(168.0, 204.0);
    final itemExtent = size + 20.0;

    return [
      const SliverToBoxAdapter(child: SizedBox(height: 36)),
      const SliverToBoxAdapter(
        child: Padding(
          padding: EdgeInsets.fromLTRB(20, 0, 20, 16),
          child: _FeaturedTitle(),
        ),
      ),
      SliverToBoxAdapter(
        child: SizedBox(
          height: size + 68,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: artists.length,
            itemExtent: itemExtent,
            addAutomaticKeepAlives: false,
            itemBuilder: (context, i) {
              final a = artists[i];
              return Padding(
                padding: const EdgeInsets.only(right: 18),
                child: _Press(
                  scale: 0.95,
                  onTap: () {
                    HapticFeedback.lightImpact();
                    Navigator.push(
                      context,
                      ZenPageRoute(
                        builder: (_) => ArtistScreen(
                          artistName: a.name,
                          imageUrl: a.cover,
                          browseId: a.id,
                        ),
                      ),
                    );
                  },
                  child: Column(
                    children: [
                      Container(
                        width: size,
                        height: size,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.35),
                              blurRadius: 16,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: DecoratedBox(
                          position: DecorationPosition.foreground,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.12),
                              width: 1.0,
                            ),
                          ),
                          child: _Img(a.cover, circular: true, cacheWidth: 512),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        a.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: _display(
                          size: 16,
                          weight: FontWeight.w600,
                          spacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        'Artist',
                        style: _body(size: 13, color: AppColors.textTertiary),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ),
    ];
  }

  Widget _buildEmpty() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 60, 32, 0),
      child: Column(
        children: [
          Text(
            'No songs found in ${widget.title}',
            style: _display(size: 19),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'Check your connection and try again.',
            style: _body(size: 14),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          _Press(
            onTap: () {
              setState(() => _loading = true);
              _load();
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 11),
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
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═════════════════════════════════════════════════════════════════════════════

/// Per-letter hero title: each glyph rises, scales and fades in on a stagger,
/// with a continuous subtle breathing floating loop.
class _HeroLetters extends StatelessWidget {
  const _HeroLetters({
    required this.chars,
    required this.entrance,
    required this.breathing,
  });
  final List<String> chars;
  final Animation<double> entrance;
  final Animation<double> breathing;

  @override
  Widget build(BuildContext context) {
    const baseStyle = TextStyle(
      fontFamily: 'SF Pro Display',
      fontSize: 52,
      fontWeight: FontWeight.w800,
      color: Colors.white,
      letterSpacing: 0.2,
      height: 1.05,
    );
    final n = chars.length.clamp(1, 64);

    return AnimatedBuilder(
      animation: Listenable.merge([entrance, breathing]),
      builder: (context, _) {
        final t = entrance.value;
        final b = Curves.easeInOutSine.transform(breathing.value);
        final floatDy = math.sin(b * math.pi) * 2.0;
        final shadowAlpha = 0.35 + 0.20 * b;
        final shadowBlur = 22.0 + 8.0 * b;

        final style = baseStyle.copyWith(
          shadows: [
            Shadow(
              color: Colors.black.withValues(alpha: shadowAlpha),
              blurRadius: shadowBlur,
              offset: const Offset(0, 5),
            ),
          ],
        );

        return Transform.translate(
          offset: Offset(0, floatDy),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              for (var i = 0; i < chars.length; i++)
                Builder(
                  builder: (_) {
                    final start = 0.04 + 0.42 * (i / n);
                    final v = _interval(
                      t,
                      start,
                      start + 0.40,
                      Curves.easeOutCubic,
                    );
                    final s =
                        0.75 +
                        0.25 *
                            _interval(t, start, start + 0.46, Curves.easeOutBack);
                    return Opacity(
                      opacity: v.clamp(0.0, 1.0),
                      child: Transform.translate(
                        offset: Offset(0, (1 - v) * 24),
                        child: Transform.scale(
                          scale: s,
                          child: Text(chars[i], maxLines: 1, style: style),
                        ),
                      ),
                    );
                  },
                ),
            ],
          ),
        );
      },
    );
  }
}

/// Fade + rise driven by a window of a shared controller.
class _Reveal extends StatelessWidget {
  const _Reveal({
    required this.controller,
    required this.begin,
    required this.end,
    required this.child,
    this.dy = 18,
  });
  final Animation<double> controller;
  final double begin, end, dy;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      child: child,
      builder: (_, c) {
        final v = _interval(controller.value, begin, end);
        return Opacity(
          opacity: v,
          child: Transform.translate(offset: Offset(0, (1 - v) * dy), child: c),
        );
      },
    );
  }
}

/// Row entrance. Once the controller completes, rows are static, so recycled
/// rows never replay the animation while scrolling.
class _Stagger extends StatelessWidget {
  const _Stagger({
    required this.controller,
    required this.index,
    required this.child,
  });
  final AnimationController controller;
  final int index;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (controller.isCompleted) return child;
    return AnimatedBuilder(
      animation: controller,
      child: child,
      builder: (_, c) {
        final s = (index.clamp(0, 10)) * 0.045;
        final v = _interval(controller.value, s, s + 0.45);
        return Opacity(
          opacity: v,
          child: Transform.translate(offset: Offset(0, (1 - v) * 16), child: c),
        );
      },
    );
  }
}

class _FeaturedTitle extends StatelessWidget {
  const _FeaturedTitle();
  @override
  Widget build(BuildContext context) => Text(
    'Featured Artists',
    style: _display(size: 22, weight: FontWeight.w700, spacing: -0.6),
  );
}

class _RoundBtn extends StatelessWidget {
  const _RoundBtn({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _Press(
      scale: 0.92,
      onTap: onTap,
      child: Container(
        width: 46,
        height: 46,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.white.withValues(alpha: 0.16),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.14),
            width: 0.8,
          ),
        ),
        child: Icon(icon, size: 18, color: Colors.white),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.track,
    required this.current,
    required this.playing,
    required this.divider,
    required this.onTap,
    required this.onMore,
  });
  final Track track;
  final bool current, playing, divider;
  final VoidCallback onTap, onMore;

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
                  width: 48,
                  height: 48,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _Img(track.coverUrl, radius: 5),
                      if (current)
                        Container(
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.5),
                            borderRadius: BorderRadius.circular(5),
                          ),
                          alignment: Alignment.center,
                          child: _EqBars(playing: playing),
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
                          size: 16.5,
                          weight: FontWeight.w400,
                          spacing: -0.3,
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
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Icon(
                      Icons.more_vert_rounded,
                      color: AppColors.textSecondary,
                      size: 22,
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (divider)
            Positioned(
              left: 80,
              right: 0,
              bottom: 0,
              child: Container(height: 0.5, color: AppColors.hairline),
            ),
        ],
      ),
    );
  }
}

class _ListSkeleton extends StatefulWidget {
  const _ListSkeleton();

  @override
  State<_ListSkeleton> createState() => _ListSkeletonState();
}

class _ListSkeletonState extends State<_ListSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  late final Animation<double> _opacity = Tween(
    begin: 0.45,
    end: 1.0,
  ).animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut));

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Widget _bone(double w, double h, {double r = 5}) => Container(
    width: w,
    height: h,
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(r),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
        child: Column(
          children: [
            for (var i = 0; i < 8; i++)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    _bone(48, 48),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _bone(170, 15),
                        const SizedBox(height: 7),
                        _bone(100, 12),
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
