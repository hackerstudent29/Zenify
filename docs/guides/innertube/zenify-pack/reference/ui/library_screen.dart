import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:flutter/cupertino.dart'
    show
        CupertinoActionSheet,
        CupertinoActionSheetAction,
        CupertinoSliverRefreshControl,
        CupertinoTheme,
        CupertinoThemeData,
        showCupertinoModalPopup;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/tokens/app_spacing.dart';
import '../../design_system/tokens/app_typography.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/song_tile.dart';
import '../../design_system/widgets/spring_kit.dart';
import '../../services/player_state.dart';

const _fieldFill = Color(0x1FFFFFFF); // white 12%
const _pressFill = Color(0x14FFFFFF); // white 8%

enum _Sort {
  recent('Recently added'),
  title('Title'),
  artist('Artist');

  const _Sort(this.label);
  final String label;
}

class _Cat {
  const _Cat(this.title, this.icon, this.count);
  final String title;
  final IconData icon;
  final int count;
}

// Wire these counts to real data (drift queries) when available.
const _cats = <_Cat>[
  _Cat('Playlists', Icons.queue_music_rounded, 8),
  _Cat('Artists', Icons.person_rounded, 24),
  _Cat('Albums', Icons.album_rounded, 12),
  _Cat('Downloaded', Icons.download_done_rounded, 15),
  _Cat('On Device', Icons.phone_android_rounded, 42),
  _Cat('Blends', Icons.all_inclusive_rounded, 3),
  _Cat('Recent rooms', Icons.group_rounded, 5),
];

/// Library tab.
///
/// Motion model: collapsing frosted title (scroll-driven), a heartbeat on the
/// Liked Songs card (one ambient motion), spring entrances once on first
/// build, spring search mode (blocks collapse, Cancel slides in), spring
/// segmented control, spring row highlights, count-up numbers and a
/// spring-filled storage bar.
class LibraryScreen extends StatefulWidget {
  const LibraryScreen({
    super.key,
    this.onOpenLiked,
    this.onOpenSection,
    this.onCreatePlaylist,
    this.onOpenProfile,
    this.onRefresh,
    this.storageUsedMb = 2400,
    this.storageLimitMb = 5120,
  });

  final VoidCallback? onOpenLiked;
  final ValueChanged<String>? onOpenSection;
  final VoidCallback? onCreatePlaylist;
  final VoidCallback? onOpenProfile;
  final Future<void> Function()? onRefresh;
  final double storageUsedMb;
  final double storageLimitMb;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen>
    with TickerProviderStateMixin {
  late final AnimationController _ambient =
      AnimationController(vsync: this, duration: const Duration(seconds: 14));
  late final AnimationController _searchCtl =
      AnimationController.unbounded(vsync: this, value: 0);

  final _text = TextEditingController();
  final _focus = FocusNode();

  String _query = '';
  bool _searching = false;
  bool _grid = false;
  _Sort _sort = _Sort.recent;

  @override
  void initState() {
    super.initState();
    _focus.addListener(_syncSearching);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _ambient.stop();
    } else if (!_ambient.isAnimating) {
      _ambient.repeat();
    }
  }

  @override
  void dispose() {
    _focus.removeListener(_syncSearching);
    _focus.dispose();
    _text.dispose();
    _ambient.dispose();
    _searchCtl.dispose();
    super.dispose();
  }

  void _syncSearching() {
    final s = _focus.hasFocus || _query.isNotEmpty;
    if (s == _searching) return;
    setState(() => _searching = s);
    springTo(_searchCtl, s ? 1 : 0);
  }

  void _cancelSearch() {
    HapticFeedback.selectionClick();
    _text.clear();
    _query = '';
    _focus.unfocus();
    _syncSearching();
  }

  void _play(List list, int index) =>
      context.read<PlayerState>().setQueue(list.cast(), startIndex: index);

  void _shuffle(List list) {
    HapticFeedback.lightImpact();
    final s = List.of(list)..shuffle();
    context.read<PlayerState>().setQueue(s.cast(), startIndex: 0);
  }

  Future<void> _pickSort() async {
    HapticFeedback.selectionClick();
    final picked = await showCupertinoModalPopup<_Sort>(
      context: context,
      builder: (ctx) => CupertinoTheme(
        data: const CupertinoThemeData(brightness: Brightness.dark),
        child: CupertinoActionSheet(
          title: const Text('Sort by'),
          actions: [
            for (final s in _Sort.values)
              CupertinoActionSheetAction(
                isDefaultAction: s == _sort,
                onPressed: () => Navigator.pop(ctx, s),
                child: Text(s.label),
              ),
          ],
          cancelButton: CupertinoActionSheetAction(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
        ),
      ),
    );
    if (picked != null && picked != _sort) setState(() => _sort = picked);
  }

  @override
  Widget build(BuildContext context) {
    final tracks = CatalogDataSource.allTracks;
    final topInset = MediaQuery.paddingOf(context).top;

    // Filter + sort.
    final q = _query.trim().toLowerCase();
    final list = List.of(tracks);
    if (q.isNotEmpty) {
      list.retainWhere((t) =>
          t.title.toLowerCase().contains(q) ||
          t.artist.toLowerCase().contains(q));
    }
    switch (_sort) {
      case _Sort.recent:
        break;
      case _Sort.title:
        list.sort((a, b) =>
            a.title.toLowerCase().compareTo(b.title.toLowerCase()));
      case _Sort.artist:
        list.sort((a, b) =>
            a.artist.toLowerCase().compareTo(b.artist.toLowerCase()));
    }

    final sectionTitle =
        (_sort == _Sort.recent && !_searching) ? 'Recently added' : 'Songs';

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.bg,
        body: CupertinoTheme(
          data: const CupertinoThemeData(brightness: Brightness.dark),
          child: CustomScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics()),
            slivers: [
              CupertinoSliverRefreshControl(
                onRefresh: () async {
                  HapticFeedback.lightImpact();
                  await (widget.onRefresh?.call() ??
                      Future<void>.delayed(const Duration(milliseconds: 700)));
                },
              ),
              SliverPersistentHeader(
                pinned: true,
                delegate: CollapsingTitleDelegate(
                  topInset: topInset,
                  title: 'Library',
                  actionsBuilder: (size, t) => [
                    PressableScale(
                      onTap: widget.onCreatePlaylist ?? () {},
                      child: Container(
                        width: size,
                        height: size,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: _fieldFill,
                        ),
                        child: Icon(Icons.add_rounded,
                            size: size * 0.62, color: AppColors.accent),
                      ),
                    ),
                    ProfileAvatarButton(
                        size: size, onTap: widget.onOpenProfile),
                  ],
                ),
              ),
              SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 8),
                    _buildFindField(),
                    SpringReveal(
                      visible: !_searching,
                      child: Column(
                        children: [
                          const SizedBox(height: 16),
                          SpringIn(
                            delayMs: 40,
                            child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 20),
                              child: _LikedHero(
                                count: tracks.length,
                                ambient: _ambient,
                                onOpen: widget.onOpenLiked ?? () {},
                                onPlay: () {
                                  HapticFeedback.lightImpact();
                                  _play(tracks, 0);
                                },
                                onShuffle: () => _shuffle(tracks),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          SpringIn(
                            delayMs: 100,
                            child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 20),
                              child: _GroupedList(
                                cats: _cats,
                                onTap: (c) =>
                                    widget.onOpenSection?.call(c.title),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          SpringIn(
                            delayMs: 160,
                            child: Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 20),
                              child: _StorageCard(
                                usedMb: widget.storageUsedMb,
                                limitMb: widget.storageLimitMb,
                                onTap: () =>
                                    widget.onOpenSection?.call('Downloaded'),
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Section header + controls
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Text(
                        sectionTitle,
                        style: AppTypography.headline.copyWith(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.4,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Row(
                        children: [
                          SpringIconSegmented(
                            icons: const [
                              Icons.view_list_rounded,
                              Icons.grid_view_rounded,
                            ],
                            index: _grid ? 1 : 0,
                            onChanged: (i) => setState(() => _grid = i == 1),
                          ),
                          const Spacer(),
                          PressableScale(
                            onTap: _pickSort,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  vertical: 6, horizontal: 2),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    _sort.label,
                                    style: AppTypography.headline.copyWith(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.accent,
                                    ),
                                  ),
                                  const SizedBox(width: 2),
                                  const Icon(Icons.unfold_more_rounded,
                                      size: 18, color: AppColors.accent),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (list.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: Row(
                          children: [
                            Expanded(
                              child: _ActionButton(
                                icon: Icons.play_arrow_rounded,
                                label: 'Play',
                                onTap: () {
                                  HapticFeedback.lightImpact();
                                  _play(list, 0);
                                },
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: _ActionButton(
                                icon: Icons.shuffle_rounded,
                                label: 'Shuffle',
                                onTap: () => _shuffle(list),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 8),
                  ],
                ),
              ),

              if (list.isEmpty)
                SliverToBoxAdapter(
                  child: _searching && q.isNotEmpty
                      ? _EmptyState(
                          icon: Icons.search_off_rounded,
                          title: 'No results',
                          message:
                              'Nothing in your library matches “${_query.trim()}”.',
                        )
                      : const _EmptyState(
                          icon: Icons.library_music_rounded,
                          title: 'Your library is empty',
                          message:
                              'Songs you like or download will show up here.',
                        ),
                )
              else if (_grid)
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  sliver: SliverGrid(
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 18,
                      crossAxisSpacing: 16,
                      childAspectRatio: 0.78,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, i) {
                        final track = list[i];
                        final key = ValueKey('g-${_sort.name}-${track.id}');
                        final tile = Selector<PlayerState,
                            ({Object? id, bool playing})>(
                          selector: (_, p) =>
                              (id: p.currentTrack?.id, playing: p.isPlaying),
                          builder: (_, s, __) {
                            final active = s.id == track.id;
                            return _GridTile(
                              title: track.title,
                              artist: track.artist,
                              coverUrl: track.coverUrl,
                              active: active,
                              playing: active && s.playing,
                              onTap: () => _play(list, i),
                            );
                          },
                        );
                        return i < 6
                            ? SpringIn(key: key, delayMs: 40 * i, child: tile)
                            : KeyedSubtree(key: key, child: tile);
                      },
                      childCount: list.length,
                    ),
                  ),
                )
              else
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, i) {
                      final track = list[i];
                      final key = ValueKey('l-${_sort.name}-${track.id}');
                      final row = Selector<PlayerState,
                          ({Object? id, bool playing})>(
                        selector: (_, p) =>
                            (id: p.currentTrack?.id, playing: p.isPlaying),
                        builder: (_, s, __) {
                          final active = s.id == track.id;
                          return SongTile(
                            track: track,
                            isActive: active,
                            isPlaying: active && s.playing,
                            onTap: () => _play(list, i),
                          );
                        },
                      );
                      return i < 8
                          ? SpringIn(
                              key: key,
                              delayMs: 35 * i,
                              rise: 16,
                              child: row,
                            )
                          : KeyedSubtree(key: key, child: row);
                    },
                    childCount: list.length,
                  ),
                ),

              const SliverToBoxAdapter(child: SizedBox(height: 120)),
            ],
          ),
        ),
      ),
    );
  }

  // Find-in-library field with an Apple-style Cancel that slides in on a spring.
  Widget _buildFindField() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: AnimatedBuilder(
        animation: _searchCtl,
        builder: (_, __) {
          final f = _searchCtl.value.clamp(0.0, 1.0).toDouble();
          return Row(
            children: [
              Expanded(
                child: Container(
                  height: 40,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: ShapeDecoration(
                    shape: ContinuousRectangleBorder(
                        borderRadius: BorderRadius.circular(22)),
                    color: _fieldFill,
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.search_rounded,
                          size: 20,
                          color: Color.lerp(Colors.white54, Colors.white70, f)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _text,
                          focusNode: _focus,
                          textInputAction: TextInputAction.search,
                          cursorColor: AppColors.accent,
                          style: AppTypography.headline.copyWith(
                              fontSize: 16, fontWeight: FontWeight.w400),
                          decoration: InputDecoration(
                            isCollapsed: true,
                            border: InputBorder.none,
                            hintText: 'Find in Library',
                            hintStyle: AppTypography.headline.copyWith(
                                fontSize: 16,
                                fontWeight: FontWeight.w400,
                                color: Colors.white54),
                          ),
                          onChanged: (v) {
                            setState(() => _query = v);
                            _syncSearching();
                          },
                        ),
                      ),
                      SpringPop(
                        visible: _query.isNotEmpty,
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            _text.clear();
                            setState(() => _query = '');
                            _syncSearching();
                          },
                          child: const Padding(
                            padding: EdgeInsets.only(left: 6),
                            child: Icon(Icons.cancel_rounded,
                                size: 18, color: Colors.white54),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              ClipRect(
                child: Align(
                  alignment: Alignment.centerRight,
                  widthFactor: f,
                  child: Opacity(
                    opacity: f,
                    child: Padding(
                      padding: const EdgeInsets.only(left: 14),
                      child: PressableScale(
                        onTap: _cancelSearch,
                        child: Text(
                          'Cancel',
                          maxLines: 1,
                          softWrap: false,
                          style: AppTypography.headline.copyWith(
                              fontSize: 16,
                              fontWeight: FontWeight.w400,
                              color: AppColors.accent),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Liked Songs hero (heartbeat is the single ambient motion)
// ---------------------------------------------------------------------------

class _LikedHero extends StatelessWidget {
  const _LikedHero({
    required this.count,
    required this.ambient,
    required this.onOpen,
    required this.onPlay,
    required this.onShuffle,
  });

  final int count;
  final Animation<double> ambient;
  final VoidCallback onOpen;
  final VoidCallback onPlay;
  final VoidCallback onShuffle;

  // 5 beats per 14 s loop, so the loop point is seamless: a main beat then a
  // softer echo, like a real pulse.
  static double _beat(double v) {
    final p = (v * 14 / 2.8) % 1;
    double bump(double c) {
      final d = (p - c) / 0.06;
      return math.exp(-d * d);
    }

    return 1 + 0.12 * bump(0.08) + 0.08 * bump(0.26);
  }

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onOpen,
      child: RepaintBoundary(
        child: Container(
          height: 128,
          clipBehavior: Clip.antiAlias,
          decoration: ShapeDecoration(
            shape: ContinuousRectangleBorder(
                borderRadius: BorderRadius.circular(AppSpacing.rCard * 2)),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFE11D48), Color(0xFF9E2339)],
            ),
            shadows: [
              BoxShadow(
                color: AppColors.accent.withValues(alpha: 0.30),
                blurRadius: 24,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Stack(
            children: [
              Positioned(
                right: -26,
                bottom: -34,
                child: Transform.rotate(
                  angle: -0.25,
                  child: Icon(Icons.favorite_rounded,
                      size: 150, color: Colors.white.withValues(alpha: 0.08)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    AnimatedBuilder(
                      animation: ambient,
                      builder: (_, child) => Transform.scale(
                          scale: _beat(ambient.value), child: child),
                      child: Container(
                        width: 60,
                        height: 60,
                        decoration: ShapeDecoration(
                          shape: ContinuousRectangleBorder(
                              borderRadius: BorderRadius.circular(28)),
                          color: Colors.white.withValues(alpha: 0.22),
                        ),
                        child: const Icon(Icons.favorite_rounded,
                            color: Colors.white, size: 30),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Liked Songs',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.headline.copyWith(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.3,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            count == 1 ? '1 song' : '$count songs',
                            style: AppTypography.footnote
                                .copyWith(color: Colors.white70),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    _RoundButton(
                        icon: Icons.shuffle_rounded,
                        filled: false,
                        onTap: onShuffle),
                    const SizedBox(width: 10),
                    _RoundButton(
                        icon: Icons.play_arrow_rounded,
                        filled: true,
                        onTap: onPlay),
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

class _RoundButton extends StatelessWidget {
  const _RoundButton(
      {required this.icon, required this.filled, required this.onTap});
  final IconData icon;
  final bool filled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
        onTap: onTap,
        child: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: filled ? Colors.white : Colors.white.withValues(alpha: 0.22),
          ),
          child: Icon(icon,
              size: filled ? 28 : 22,
              color: filled ? const Color(0xFFE11D48) : Colors.white),
        ),
      );
}

// ---------------------------------------------------------------------------
// Grouped inset list (iOS-style rows: spring highlight, chevron nudge)
// ---------------------------------------------------------------------------

class _GroupedList extends StatelessWidget {
  const _GroupedList({required this.cats, required this.onTap});
  final List<_Cat> cats;
  final ValueChanged<_Cat> onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: ShapeDecoration(
        color: AppColors.surface,
        shape: ContinuousRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.rTile * 2),
          side: const BorderSide(color: AppColors.hairline, width: 0.5),
        ),
      ),
      child: Column(
        children: [
          for (var i = 0; i < cats.length; i++)
            _GroupRow(
              cat: cats[i],
              delayMs: 160 + 45 * i,
              isLast: i == cats.length - 1,
              onTap: () => onTap(cats[i]),
            ),
        ],
      ),
    );
  }
}

class _GroupRow extends StatefulWidget {
  const _GroupRow({
    required this.cat,
    required this.delayMs,
    required this.isLast,
    required this.onTap,
  });
  final _Cat cat;
  final int delayMs;
  final bool isLast;
  final VoidCallback onTap;

  @override
  State<_GroupRow> createState() => _GroupRowState();
}

class _GroupRowState extends State<_GroupRow>
    with SingleTickerProviderStateMixin {
  late final AnimationController _press =
      AnimationController.unbounded(vsync: this, value: 0);

  @override
  void dispose() {
    _press.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => springTo(_press, 1, Springs.snappy),
      onTapUp: (_) {
        springTo(_press, 0, Springs.snappy);
        HapticFeedback.selectionClick();
        widget.onTap();
      },
      onTapCancel: () => springTo(_press, 0, Springs.snappy),
      child: AnimatedBuilder(
        animation: _press,
        builder: (_, __) {
          final p = _press.value.clamp(0.0, 1.0).toDouble();
          return Column(
            children: [
              Container(
                color: Color.lerp(const Color(0x00FFFFFF), _pressFill, p),
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                child: Row(
                  children: [
                    Icon(widget.cat.icon, color: AppColors.accent, size: 22),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Text(
                        widget.cat.title,
                        style: AppTypography.headline.copyWith(fontSize: 16),
                      ),
                    ),
                    _CountUp(to: widget.cat.count, delayMs: widget.delayMs),
                    const SizedBox(width: 6),
                    Transform.translate(
                      offset: Offset(3 * p, 0),
                      child: const Icon(Icons.chevron_right_rounded,
                          color: AppColors.textTertiary, size: 20),
                    ),
                  ],
                ),
              ),
              if (!widget.isLast)
                const Padding(
                  padding: EdgeInsets.only(left: 52),
                  child: SizedBox(
                    height: 0.5,
                    width: double.infinity,
                    child: ColoredBox(color: AppColors.hairline),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

/// Number that counts up on a spring when first shown.
class _CountUp extends StatefulWidget {
  const _CountUp({required this.to, required this.delayMs});
  final int to;
  final int delayMs;

  @override
  State<_CountUp> createState() => _CountUpState();
}

class _CountUpState extends State<_CountUp>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController.unbounded(vsync: this, value: 0);
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.value = 1;
      return;
    }
    Future<void>.delayed(Duration(milliseconds: widget.delayMs), () {
      if (mounted) _c.animateWith(SpringSimulation(Springs.smooth, 0, 1, 0));
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, __) => Text(
          '${(widget.to * _c.value.clamp(0.0, 1.0)).round()}',
          style: AppTypography.subhead.copyWith(
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      );
}

// ---------------------------------------------------------------------------
// Storage card: bar fills on a spring
// ---------------------------------------------------------------------------

class _StorageCard extends StatefulWidget {
  const _StorageCard(
      {required this.usedMb, required this.limitMb, required this.onTap});
  final double usedMb;
  final double limitMb;
  final VoidCallback onTap;

  @override
  State<_StorageCard> createState() => _StorageCardState();
}

class _StorageCardState extends State<_StorageCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController.unbounded(vsync: this, value: 0);
  bool _started = false;

  double get _target => widget.limitMb <= 0
      ? 0
      : (widget.usedMb / widget.limitMb).clamp(0.0, 1.0).toDouble();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.value = _target;
      return;
    }
    Future<void>.delayed(const Duration(milliseconds: 520), () {
      if (mounted) {
        _c.animateWith(SpringSimulation(Springs.smooth, 0, _target, 0));
      }
    });
  }

  @override
  void didUpdateWidget(covariant _StorageCard old) {
    super.didUpdateWidget(old);
    if (old.usedMb != widget.usedMb || old.limitMb != widget.limitMb) {
      springTo(_c, _target);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  String _gb(double mb) => '${(mb / 1024).toStringAsFixed(1)} GB';

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: widget.onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: ShapeDecoration(
          color: AppColors.surface,
          shape: ContinuousRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.rTile * 2),
            side: const BorderSide(color: AppColors.hairline, width: 0.5),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.sd_storage_rounded,
                    size: 20, color: AppColors.accent),
                const SizedBox(width: 10),
                Expanded(
                  child: Text('Offline storage',
                      style: AppTypography.headline.copyWith(fontSize: 16)),
                ),
                Text(
                  '${_gb(widget.usedMb)} of ${_gb(widget.limitMb)}',
                  style: AppTypography.subhead,
                ),
              ],
            ),
            const SizedBox(height: 12),
            LayoutBuilder(
              builder: (_, cons) => AnimatedBuilder(
                animation: _c,
                builder: (_, __) => Stack(
                  children: [
                    Container(
                      height: 6,
                      decoration: const ShapeDecoration(
                        shape: StadiumBorder(),
                        color: Color(0xFF2C2C2E),
                      ),
                    ),
                    Container(
                      height: 6,
                      width: cons.maxWidth * _c.value.clamp(0.0, 1.0),
                      decoration: const ShapeDecoration(
                        shape: StadiumBorder(),
                        gradient: LinearGradient(
                          colors: [Color(0xFFE11D48), Color(0xFFFB7185)],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Smaller pieces
// ---------------------------------------------------------------------------

class _ActionButton extends StatelessWidget {
  const _ActionButton(
      {required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
        onTap: onTap,
        child: Container(
          height: 46,
          decoration: ShapeDecoration(
            shape: ContinuousRectangleBorder(
                borderRadius: BorderRadius.circular(24)),
            color: _fieldFill,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 22, color: AppColors.accent),
              const SizedBox(width: 6),
              Text(
                label,
                style: AppTypography.headline.copyWith(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: AppColors.accent,
                ),
              ),
            ],
          ),
        ),
      );
}

class _GridTile extends StatelessWidget {
  const _GridTile({
    required this.title,
    required this.artist,
    required this.coverUrl,
    required this.active,
    required this.playing,
    required this.onTap,
  });
  final String title;
  final String artist;
  final String? coverUrl;
  final bool active;
  final bool playing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onTap,
      child: LayoutBuilder(
        builder: (_, cons) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SquircleArtwork(
              url: coverUrl,
              size: cons.maxWidth,
              radius: 12,
              overlay: active
                  ? Positioned(
                      left: 8, bottom: 8, child: _EqBadge(playing: playing))
                  : null,
            ),
            const SizedBox(height: 8),
            Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.headline.copyWith(
                fontSize: 15,
                color: active ? AppColors.accent : null,
              ),
            ),
            const SizedBox(height: 1),
            Text(
              artist,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppTypography.footnote.copyWith(color: Colors.white60),
            ),
          ],
        ),
      ),
    );
  }
}

/// Tiny 3-bar equalizer, only animating while audio is actually playing.
class _EqBadge extends StatefulWidget {
  const _EqBadge({required this.playing});
  final bool playing;

  @override
  State<_EqBadge> createState() => _EqBadgeState();
}

class _EqBadgeState extends State<_EqBadge>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

  @override
  void initState() {
    super.initState();
    if (widget.playing) _c.repeat();
  }

  @override
  void didUpdateWidget(covariant _EqBadge old) {
    super.didUpdateWidget(old);
    if (widget.playing && !_c.isAnimating) {
      _c.repeat();
    } else if (!widget.playing) {
      _c.stop();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Container(
        width: 26,
        height: 26,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.black.withValues(alpha: 0.45),
        ),
        child: CustomPaint(painter: _EqPainter(_c, widget.playing)),
      );
}

class _EqPainter extends CustomPainter {
  _EqPainter(this.anim, this.playing) : super(repaint: anim);
  final Animation<double> anim;
  final bool playing;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white;
    const barW = 3.0, gap = 3.0;
    final total = 3 * barW + 2 * gap;
    final left = (size.width - total) / 2;
    for (var i = 0; i < 3; i++) {
      final h = playing
          ? lerpDouble(4, 12,
              0.5 + 0.5 * math.sin((anim.value + i * 0.33) * math.pi * 2))!
          : 4.0;
      final x = left + i * (barW + gap);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(x, (size.height - h) / 2, barW, h),
          const Radius.circular(1.5),
        ),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _EqPainter old) => old.playing != playing;
}

class _EmptyState extends StatelessWidget {
  const _EmptyState(
      {required this.icon, required this.title, required this.message});
  final IconData icon;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) => SpringIn(
        rise: 20,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(40, 56, 40, 24),
          child: Column(
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: Color(0x0FFFFFFF),
                ),
                child: Icon(icon, size: 32, color: Colors.white38),
              ),
              const SizedBox(height: 16),
              Text(title,
                  textAlign: TextAlign.center,
                  style: AppTypography.headline.copyWith(fontSize: 18)),
              const SizedBox(height: 4),
              Text(message,
                  textAlign: TextAlign.center,
                  style:
                      AppTypography.footnote.copyWith(color: Colors.white60)),
            ],
          ),
        ),
      );
}
