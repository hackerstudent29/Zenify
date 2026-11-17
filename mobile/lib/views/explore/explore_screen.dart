import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart'
    show
        CupertinoIcons,
        CupertinoSliverRefreshControl;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/equalizer_bars.dart';
import '../../design_system/widgets/monogram_avatar.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/spring_kit.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/innertube_service.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../services/user_preferences_service.dart';
import '../../utils/media_normalizer.dart';
import '../details/album_screen.dart';
import '../details/artist_popup.dart';
import '../details/artist_screen.dart';
import 'explore_data_service.dart';

// ── Typography (same SF Pro scale as the Search screen) ──────────────────────

TextStyle _display({
  double size = 20,
  FontWeight weight = FontWeight.w700,
  Color color = AppColors.textPrimary,
  double spacing = -0.3,
  double? height,
}) =>
    TextStyle(
      fontFamily: 'SF Pro Display',
      fontSize: size,
      fontWeight: weight,
      color: color,
      letterSpacing: spacing,
      height: height,
    );

TextStyle _body({
  double size = 14,
  FontWeight weight = FontWeight.w500,
  Color color = AppColors.textSecondary,
  double? height,
}) =>
    TextStyle(
      fontFamily: 'SF Pro',
      fontSize: size,
      fontWeight: weight,
      color: color,
      letterSpacing: -0.1,
      height: height,
    );

const double _kEdge = 20.0;

// ── Snap physics for horizontal shelves ──────────────────────────────────────

class _SnapSpringPhysics extends ScrollPhysics {
  const _SnapSpringPhysics({super.parent, required this.itemExtent});
  final double itemExtent;

  @override
  _SnapSpringPhysics applyTo(ScrollPhysics? ancestor) =>
      _SnapSpringPhysics(parent: buildParent(ancestor), itemExtent: itemExtent);

  @override
  SpringDescription get spring => SpringDescription.withDampingRatio(
        mass: 0.5,
        stiffness: 140,
        ratio: 1.05,
      );

  @override
  Simulation? createBallisticSimulation(
    ScrollMetrics position,
    double velocity,
  ) {
    if ((velocity <= 0 && position.pixels <= position.minScrollExtent) ||
        (velocity >= 0 && position.pixels >= position.maxScrollExtent)) {
      return super.createBallisticSimulation(position, velocity);
    }
    final page = position.pixels / itemExtent;
    final target = velocity < -100
        ? page.floorToDouble() * itemExtent
        : (velocity > 100
            ? page.ceilToDouble() * itemExtent
            : page.roundToDouble() * itemExtent);
    final clamped = target
        .clamp(position.minScrollExtent, position.maxScrollExtent)
        .toDouble();
    if ((clamped - position.pixels).abs() < 0.5) return null;
    return ScrollSpringSimulation(
      spring,
      position.pixels,
      clamped,
      velocity,
      tolerance: toleranceFor(position),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ExploreScreen
// ═════════════════════════════════════════════════════════════════════════════

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({
    super.key,
    this.onOpenTogether,
    this.onOpenBlend,
    this.onOpenProfile,
    this.onOpenCategory,
  });

  final VoidCallback? onOpenTogether;
  final VoidCallback? onOpenBlend;
  final VoidCallback? onOpenProfile;
  final ValueChanged<String>? onOpenCategory;

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final ExploreDataService _dataService = ExploreDataService.instance;
  late ExploreCountry _country;

  ExplorePageData? _pageData;
  bool _isLoading = true;

  final PageController _featuredCtrl = PageController(viewportFraction: 0.80);

  @override
  void initState() {
    super.initState();
    _country = _dataService.currentCountry;
    _dataService.initCountry().then((_) {
      if (mounted) {
        setState(() => _country = _dataService.currentCountry);
        _loadData();
      }
    });
    _loadData();
    CatalogDataSource.tracksNotifier.addListener(_onCatalogUpdated);
  }

  void _onCatalogUpdated() {
    if (mounted && (_pageData == null || _pageData!.weeklyTopSongs.isEmpty) && !_isLoading) {
      _loadData();
    }
  }

  @override
  void dispose() {
    CatalogDataSource.tracksNotifier.removeListener(_onCatalogUpdated);
    _featuredCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadData({bool force = false}) async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final data = await _dataService.getExploreDataForCountry(
        _country,
        forceRefresh: force,
      );
      if (mounted) {
        setState(() {
          _pageData = data;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _pickCountry() async {
    HapticFeedback.selectionClick();
    await ZenDropdown.show<void>(
      context: context,
      title: 'Explore Music Region',
      subtitle:
          'Select a country to discover live weekly charts, top artists, and fresh releases.',
      items: [
        for (final c in kExploreCountries)
          ZenDropdownItem(
            title: '${c.flag}  ${c.name} (${c.code})',
            icon: CupertinoIcons.globe,
            isSelected: c.code == _country.code,
            onTap: () {
              if (c.code != _country.code) {
                setState(() => _country = c);
                _dataService.setCountry(c);
                _loadData(force: false);
              }
            },
          ),
      ],
    );
  }

  // ── Playback / navigation ──────────────────────────────────────────────────

  void _play(List<Track> list, int index, {String title = 'Weekly Top'}) {
    if (list.isEmpty) return;
    final startIdx = index.clamp(0, list.length - 1);
    final ctx = PlaybackContext(
      type: PlaybackContextType.homeSection,
      id: 'explore_trending_${_country.code}',
      tracks: list,
      startTrack: list[startIdx],
      title: title,
    );
    context
        .read<PlayerState>()
        .setQueue(list, startIndex: startIdx, context: ctx);
  }

  void _shuffle(List<Track> list) {
    if (list.isEmpty) return;
    final ctx = PlaybackContext(
      type: PlaybackContextType.homeSection,
      id: 'explore_trending_${_country.code}',
      tracks: list,
      startTrack: list.first,
      title: 'Weekly Top • ${_country.name}',
    );
    context
        .read<PlayerState>()
        .setQueue(list, startIndex: 0, shuffle: true, context: ctx);
  }

  void _openCategory(String query, String title) {
    HapticFeedback.lightImpact();
    if (widget.onOpenCategory != null) {
      widget.onOpenCategory!(query);
      return;
    }
    InnerTubeService.instance.search(query).then((tracks) {
      if (!mounted || tracks.isEmpty) return;
      Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) => AlbumScreen(
            albumTitle: title,
            artistName: 'Curated by Zenify',
            coverUrl: tracks.first.coverUrl,
            initialTracks: tracks,
          ),
        ),
      );
    });
  }

  void _openAlbum(String title, String artist, String cover, {String? browseId, List<Track>? initialTracks}) {
    HapticFeedback.lightImpact();
    Navigator.push(
      context,
      ZenPageRoute(
        builder: (_) => AlbumScreen(
          albumTitle: title,
          artistName: artist,
          coverUrl: cover,
          browseId: browseId,
          initialTracks: initialTracks,
        ),
      ),
    );
  }

  void _openArtist(ExploreArtistItem a) {
    HapticFeedback.lightImpact();
    Navigator.push(
      context,
      ZenPageRoute(
        builder: (_) => ArtistScreen(
          artistName: a.name,
          imageUrl: a.photo,
          browseId: a.browseId,
        ),
      ),
    );
  }

  void _showTrackMenu(Track track) {
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
      onGoToAlbum: track.album.isNotEmpty
          ? () => _openAlbum(track.album, track.artist, track.coverUrl, browseId: track.albumBrowseId)
          : null,
    );
  }

  bool _isActive(Track t, String? activeId) {
    if (activeId == null || activeId.isEmpty) return false;
    return activeId == t.id ||
        activeId == 'yt-${t.id}' ||
        t.id == 'yt-$activeId';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Build
  // ═══════════════════════════════════════════════════════════════════════════

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final topInset = MediaQuery.paddingOf(context).top;
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    final data = _pageData;
    Widget body;

    if (data == null && _isLoading) {
      body = const _ExploreSkeleton();
    } else if (data == null || data.weeklyTopSongs.isEmpty) {
      body = _buildEmpty();
    } else {
      var n = 0;
      Widget stage(Widget w) =>
          SpringIn(delayMs: 35 * n++, rise: 12, child: w);

      body = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 0. Live weekly update capsule indicator
          stage(_buildLiveWeekBanner(data)),
          const SizedBox(height: 14),

          // 1. Featured Spotlight Carousel (Exact design preserved)
          if (data.featured.isNotEmpty) ...[
            stage(_buildFeatured(data.featured)),
            const SizedBox(height: 32),
          ],

          // 2. Weekly Top 20 Charts (Apple Music 4-row paged shelf)
          if (data.weeklyTopSongs.isNotEmpty) ...[
            stage(_buildWeeklyTopCharts(data.weeklyTopSongs)),
            const SizedBox(height: 32),
          ],

          // 3. Famous Artists of the Week
          if (data.topArtists.isNotEmpty) ...[
            stage(_buildTopArtists(data.topArtists)),
            const SizedBox(height: 32),
          ],

          // 4. New Releases & Fresh Drops
          if (data.newReleases.isNotEmpty) ...[
            stage(_buildNewReleases(data.newReleases)),
            const SizedBox(height: 32),
          ],

          // 5. Essential Weekly Playlists
          if (data.playlists.isNotEmpty) ...[
            stage(_buildPlaylists(data.playlists)),
            const SizedBox(height: 32),
          ],

          // 6. Browse by Mood & Genre
          stage(_buildBrowse()),
        ],
      );
    }

    return Scaffold(
      backgroundColor: Zen.bg,
      body: Stack(
        children: [
          CustomScrollView(
            key: const PageStorageKey<String>('explore_scroll_view'),
            physics: const BouncingScrollPhysics(
              parent: AlwaysScrollableScrollPhysics(),
            ),
            slivers: [
              SliverToBoxAdapter(child: SizedBox(height: topInset + 56)),
              CupertinoSliverRefreshControl(
                onRefresh: () => _loadData(force: true),
              ),
              SliverToBoxAdapter(child: body),
              SliverToBoxAdapter(child: SizedBox(height: 180 + bottomInset)),
            ],
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandHeader(
              title: 'Explore',
              subtitle: '${_country.flag} ${_country.name} • Weekly Top',
              showBack: false,
              isDockPage: true,
              onCenterTap: _pickCountry,
              showProfile: true,
              onProfileTap: widget.onOpenProfile,
            ),
          ),
        ],
      ),
    );
  }

  Widget _header(String title, {String? subtitle, Widget? trailing}) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(_kEdge, 0, _kEdge, 14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: _display(size: 22, spacing: -0.5),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (subtitle != null && subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: _body(size: 13, color: AppColors.textTertiary),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }

  Widget _buildLiveWeekBanner(ExplorePageData data) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: _kEdge),
      child: PressableScale(
        scale: 0.98,
        onTap: _pickCountry,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.05),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.08),
              width: 0.6,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: const BoxDecoration(
                  color: AppColors.accent,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'LIVE CHARTS • WEEK ${data.weekNumber} IN ${data.country.name.toUpperCase()}',
                style: _body(
                  size: 11,
                  weight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ).copyWith(letterSpacing: 0.7),
              ),
              const SizedBox(width: 6),
              const Icon(
                CupertinoIcons.chevron_down,
                size: 11,
                color: AppColors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 120, 32, 0),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Couldn\'t load music for ${_country.name}',
              style: _display(size: 19),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Check your connection and try again.',
              style: _body(size: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 22),
            PressableScale(
              onTap: () => _loadData(force: true),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 24, vertical: 11),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(26),
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
      ),
    );
  }

  // ── 1. Featured: big cover cards, text below the art (User's Loved Design) ───

  Widget _buildFeatured(List<Track> featured) {
    final width = MediaQuery.sizeOf(context).width;
    final cardW = width * 0.80 - 16;
    final height = cardW + 92;

    return SizedBox(
      height: height,
      child: PageView.builder(
        controller: _featuredCtrl,
        itemCount: featured.length,
        padEnds: false,
        clipBehavior: Clip.none,
        itemBuilder: (context, i) {
          final t = featured[i];
          final isPreferred = UserPreferencesService.instance.currentPrefs.favoriteArtists
              .any((a) => t.artist.toLowerCase().contains(a.name.toLowerCase()));
          final eyebrow = isPreferred
              ? 'Recommended For You'
              : 'No. ${i + 1} in ${_country.name}';

          return AnimatedBuilder(
            animation: _featuredCtrl,
            builder: (context, child) {
              double page = _featuredCtrl.initialPage.toDouble();
              if (_featuredCtrl.hasClients &&
                  _featuredCtrl.position.haveDimensions) {
                page = _featuredCtrl.page ?? page;
              }
              final d = (page - i).abs().clamp(0.0, 1.0);
              return Opacity(
                opacity: 1 - 0.35 * d,
                child: Transform.scale(
                  scale: 1 - 0.05 * d,
                  alignment: Alignment.centerLeft,
                  child: child,
                ),
              );
            },
            child: Padding(
              padding: EdgeInsets.only(
                left: i == 0 ? _kEdge : 8,
                right: 8,
              ),
              child: PressableScale(
                scale: 0.98,
                onTap: () {
                  HapticFeedback.lightImpact();
                  _play(featured, i, title: 'Featured');
                },
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      eyebrow.toUpperCase(),
                      style: _body(
                        size: 11.5,
                        weight: FontWeight.w700,
                        color: AppColors.accent,
                      ).copyWith(letterSpacing: 0.8),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: cardW,
                      height: cardW,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          DecoratedBox(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(16),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.4),
                                  blurRadius: 24,
                                  offset: const Offset(0, 12),
                                ),
                              ],
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(16),
                              child: CachedNetworkImage(
                                imageUrl: t.coverUrl,
                                fit: BoxFit.cover,
                                fadeInDuration:
                                    const Duration(milliseconds: 220),
                                placeholder: (_, _) =>
                                    const ColoredBox(color: AppColors.surface2),
                                errorWidget: (_, _, _) =>
                                    const ColoredBox(color: AppColors.surface2),
                              ),
                            ),
                          ),
                          Positioned(
                            right: 12,
                            bottom: 12,
                            child: ZenActionCircle(
                              size: 44,
                              icon: CupertinoIcons.play_fill,
                              backgroundColor: Colors.white,
                              idleColor: Colors.black,
                              activeColor: Colors.black,
                              iconSize: 19,
                              onTap: () {
                                HapticFeedback.mediumImpact();
                                _play(featured, i, title: 'Featured');
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: cardW,
                      child: Text(
                        MediaNormalizer.cleanCompactTitle(t.title),
                        style: _display(size: 17, spacing: -0.3),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(height: 2),
                    SizedBox(
                      width: cardW,
                      child: Text(
                        MediaNormalizer.formatArtists(t.artist),
                        style: _body(size: 14),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ── 2. Weekly Top Charts (Apple Music 4-row paged shelf) ─────────────────────

  Widget _buildWeeklyTopCharts(List<Track> tracks) {
    final top = tracks.take(20).toList();
    final colW = (MediaQuery.sizeOf(context).width - 56).clamp(280.0, 340.0);
    const rowH = 66.0;
    final cols = (top.length / 4).ceil();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _header(
          'Weekly Top Charts',
          subtitle: 'Top ${top.length} songs in ${_country.name}',
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              ZenActionCircle(
                size: 34,
                icon: CupertinoIcons.play_fill,
                iconSize: 15,
                backgroundColor: Colors.white,
                idleColor: Colors.black,
                activeColor: Colors.black,
                onTap: () => _play(top, 0, title: 'Weekly Top • ${_country.name}'),
              ),
              const SizedBox(width: 8),
              ZenActionCircle(
                size: 34,
                icon: CupertinoIcons.shuffle,
                iconSize: 15,
                backgroundColor: Colors.white.withValues(alpha: 0.11),
                idleColor: Colors.white,
                onTap: () => _shuffle(top),
              ),
            ],
          ),
        ),
        SizedBox(
          height: rowH * 4,
          child: Selector<PlayerState, ({String? id, bool playing})>(
            selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
            builder: (context, active, _) {
              return ListView.builder(
                scrollDirection: Axis.horizontal,
                physics: _SnapSpringPhysics(itemExtent: colW + 12),
                padding: const EdgeInsets.symmetric(horizontal: _kEdge),
                itemCount: cols,
                itemBuilder: (context, c) {
                  final start = c * 4;
                  final end = (start + 4).clamp(0, top.length);
                  return Padding(
                    padding: const EdgeInsets.only(right: 12),
                    child: SizedBox(
                      width: colW,
                      child: Column(
                        children: [
                          for (var r = start; r < end; r++)
                            _TrackRow(
                              track: top[r],
                              rank: r + 1,
                              height: rowH,
                              showDivider: r < end - 1,
                              isActive: _isActive(top[r], active.id),
                              isPlaying: _isActive(top[r], active.id) &&
                                  active.playing,
                              onTap: () {
                                HapticFeedback.lightImpact();
                                _play(top, r, title: 'Weekly Top • ${_country.name}');
                              },
                              onMore: () => _showTrackMenu(top[r]),
                            ),
                        ],
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  // ── 3. Famous Artists of the Week ──────────────────────────────────────────

  Widget _buildTopArtists(List<ExploreArtistItem> artists) {
    const w = 128.0;
    final store = LibraryStore.instance;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _header(
          'Famous Artists of the Week',
          subtitle: 'Trending & most streamed in ${_country.name}',
        ),
        SizedBox(
          height: w + 84,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const _SnapSpringPhysics(itemExtent: w + 16),
            padding: const EdgeInsets.symmetric(horizontal: _kEdge),
            itemCount: artists.length,
            separatorBuilder: (_, _) => const SizedBox(width: 16),
            itemBuilder: (context, i) {
              final a = artists[i];
              return SizedBox(
                width: w,
                child: Column(
                  children: [
                    PressableScale(
                      scale: 0.96,
                      onTap: () => _openArtist(a),
                      child: ClipOval(
                        child: SizedBox(
                          width: w,
                          height: w,
                          child: a.photo.isNotEmpty
                              ? CachedNetworkImage(
                                  imageUrl: a.photo,
                                  fit: BoxFit.cover,
                                  fadeInDuration:
                                      const Duration(milliseconds: 220),
                                  errorWidget: (_, _, _) => MonogramAvatar(
                                    name: a.name,
                                    size: w,
                                  ),
                                )
                              : MonogramAvatar(name: a.name, size: w),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      a.name,
                      style: _display(
                        size: 14.5,
                        weight: FontWeight.w600,
                        spacing: -0.2,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      a.subs,
                      style: _body(size: 12, color: AppColors.textTertiary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    AnimatedBuilder(
                      animation: store,
                      builder: (context, _) {
                        final followed = store.isFollowing(a.name);
                        return PressableScale(
                          scale: 0.94,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            store.toggleFollow(a.name, a.photo);
                          },
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            curve: Curves.easeOutCubic,
                            height: 28,
                            padding:
                                const EdgeInsets.symmetric(horizontal: 16),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: followed
                                  ? Colors.white.withValues(alpha: 0.12)
                                  : Colors.white,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                if (followed) ...[
                                  const Icon(
                                    CupertinoIcons.checkmark_alt,
                                    size: 12,
                                    color: Colors.white,
                                  ),
                                  const SizedBox(width: 4),
                                ],
                                Text(
                                  followed ? 'Following' : 'Follow',
                                  style: _body(
                                    size: 12,
                                    weight: FontWeight.w700,
                                    color:
                                        followed ? Colors.white : Colors.black,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  // ── 4. New Releases & Fresh Drops ──────────────────────────────────────────

  Widget _buildNewReleases(List<ExploreReleaseItem> releases) {
    const w = 158.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _header(
          'New Releases',
          subtitle: 'Fresh albums & singles in ${_country.name}',
        ),
        SizedBox(
          height: _CoverCard.heightFor(w),
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const _SnapSpringPhysics(itemExtent: w + 14),
            padding: const EdgeInsets.symmetric(horizontal: _kEdge),
            itemCount: releases.length,
            separatorBuilder: (_, _) => const SizedBox(width: 14),
            itemBuilder: (context, i) {
              final r = releases[i];
              return _CoverCard(
                width: w,
                url: r.coverUrl,
                title: MediaNormalizer.cleanCompactTitle(r.title),
                subtitle: '${r.artist} • ${r.type}',
                onTap: () => _openAlbum(
                  r.title,
                  r.artist,
                  r.coverUrl,
                  browseId: r.browseId,
                  initialTracks: r.tracks,
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  // ── 5. Essential Weekly Playlists ──────────────────────────────────────────

  Widget _buildPlaylists(List<ExplorePlaylistItem> playlists) {
    const w = 158.0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _header(
          'Essential Playlists',
          subtitle: 'Curated charts for ${_country.name}',
        ),
        SizedBox(
          height: _CoverCard.heightFor(w),
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const _SnapSpringPhysics(itemExtent: w + 14),
            padding: const EdgeInsets.symmetric(horizontal: _kEdge),
            itemCount: playlists.length,
            separatorBuilder: (_, _) => const SizedBox(width: 14),
            itemBuilder: (context, i) {
              final p = playlists[i];
              return _CoverCard(
                width: w,
                url: p.coverUrl,
                title: p.title,
                subtitle: p.description,
                onTap: () => _openCategory(p.searchQuery, p.title),
              );
            },
          ),
        ),
      ],
    );
  }

  // ── 6. Browse by Mood & Genre ──────────────────────────────────────────────

  Widget _buildBrowse() {
    final prefs = UserPreferencesService.instance.currentPrefs;
    final genres = _dataService.getSortedGenres(
      preferredGenres: prefs.genres,
      preferredLanguages: prefs.languages,
    );
    final moods = _dataService.moods;
    final tiles = <({String title, String query, IconData icon, List<Color> colors})>[];
    for (var i = 0; i < 4; i++) {
      if (i < genres.length) {
        final g = genres[i];
        tiles.add((
          title: g.title,
          query: g.searchQuery,
          icon: g.icon,
          colors: g.gradient,
        ));
      }
      if (i < moods.length) {
        final m = moods[i];
        tiles.add((
          title: m.title,
          query: m.searchQuery,
          icon: m.icon,
          colors: m.gradient,
        ));
      }
    }
    if (tiles.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _header(
          'Browse by Mood & Genre',
          subtitle: 'Explore sounds that fit your day',
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: _kEdge),
          child: GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: tiles.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 2.1,
            ),
            itemBuilder: (context, i) {
              final t = tiles[i];
              return _BrowseTile(
                title: t.title,
                icon: t.icon,
                colors: t.colors,
                onTap: () => _openCategory(t.query, t.title),
              );
            },
          ),
        ),
      ],
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Row / cards
// ═════════════════════════════════════════════════════════════════════════════

class _TrackRow extends StatelessWidget {
  const _TrackRow({
    required this.track,
    required this.rank,
    required this.height,
    required this.showDivider,
    required this.isActive,
    required this.isPlaying,
    required this.onTap,
    required this.onMore,
  });

  final Track track;
  final int rank;
  final double height;
  final bool showDivider;
  final bool isActive;
  final bool isPlaying;
  final VoidCallback onTap;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      scale: 0.985,
      onTap: onTap,
      child: Container(
        height: height,
        decoration: BoxDecoration(
          border: showDivider
              ? Border(
                  bottom: BorderSide(
                    color: Colors.white.withValues(alpha: 0.07),
                    width: 0.5,
                  ),
                )
              : null,
        ),
        child: Row(
          children: [
            SizedBox(
              width: 26,
              child: Text(
                '$rank',
                style: _display(
                  size: 15,
                  weight: FontWeight.w700,
                  color: rank <= 3 ? AppColors.accent : AppColors.textTertiary,
                ),
              ),
            ),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: 50,
                height: 50,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    CachedNetworkImage(
                      imageUrl: track.coverUrl,
                      fit: BoxFit.cover,
                      placeholder: (_, _) =>
                          const ColoredBox(color: AppColors.surface2),
                      errorWidget: (_, _, _) =>
                          const ColoredBox(color: AppColors.surface2),
                    ),
                    if (isActive)
                      ColoredBox(
                        color: Colors.black.withValues(alpha: 0.46),
                        child: Center(
                          child: EqualizerBars(
                            color: AppColors.accent,
                            size: 16,
                            isPlaying: isPlaying,
                          ),
                        ),
                      ),
                  ],
                ),
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
                    style: _display(
                      size: 15.5,
                      weight: FontWeight.w600,
                      color:
                          isActive ? AppColors.accent : AppColors.textPrimary,
                      spacing: -0.2,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    MediaNormalizer.formatArtists(track.artist),
                    style: _body(size: 13),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            PressableScale(
              scale: 0.88,
              onTap: onMore,
              child: const Padding(
                padding: EdgeInsets.all(8),
                child: Icon(
                  Icons.more_vert_rounded,
                  size: 22,
                  color: AppColors.textSecondary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Square cover + 1-line title + 1-line subtitle. Height is deterministic
/// ([heightFor]) so shelves never overflow or clip.
class _CoverCard extends StatelessWidget {
  const _CoverCard({
    required this.width,
    required this.url,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final double width;
  final String url;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  static double heightFor(double w) => w + 62;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      scale: 0.96,
      onTap: onTap,
      child: SizedBox(
        width: width,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: width,
              height: width,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.07),
                  width: 0.6,
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: CachedNetworkImage(
                  imageUrl: url,
                  fit: BoxFit.cover,
                  fadeInDuration: const Duration(milliseconds: 220),
                  placeholder: (_, _) =>
                      const ColoredBox(color: AppColors.surface2),
                  errorWidget: (_, _, _) =>
                      const ColoredBox(color: AppColors.surface2),
                ),
              ),
            ),
            const SizedBox(height: 9),
            Text(
              title,
              style: _display(
                size: 14.5,
                weight: FontWeight.w600,
                spacing: -0.2,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: _body(size: 13),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

class _BrowseTile extends StatelessWidget {
  const _BrowseTile({
    required this.title,
    required this.icon,
    required this.colors,
    required this.onTap,
  });

  final String title;
  final IconData icon;
  final List<Color> colors;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      scale: 0.96,
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: colors,
            ),
          ),
          child: Stack(
            children: [
              Positioned(
                right: -6,
                bottom: -10,
                child: Transform.rotate(
                  angle: -0.25,
                  child: Icon(
                    icon,
                    size: 62,
                    color: Colors.white.withValues(alpha: 0.22),
                  ),
                ),
              ),
              Positioned(
                left: 14,
                right: 14,
                top: 0,
                bottom: 0,
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    title,
                    style: _display(
                      size: 16,
                      color: Colors.white,
                      spacing: -0.3,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
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

// ═════════════════════════════════════════════════════════════════════════════
// Loading skeleton
// ═════════════════════════════════════════════════════════════════════════════

class _ExploreSkeleton extends StatefulWidget {
  const _ExploreSkeleton();

  @override
  State<_ExploreSkeleton> createState() => _ExploreSkeletonState();
}

class _ExploreSkeletonState extends State<_ExploreSkeleton>
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

  Widget _bone(double w, double h, {double r = 8}) => Container(
        width: w,
        height: h,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(r),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final side = MediaQuery.sizeOf(context).width * 0.80 - 16;
    return FadeTransition(
      opacity: Tween(begin: 0.45, end: 1.0).animate(
        CurvedAnimation(parent: _c, curve: Curves.easeInOut),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: _kEdge),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _bone(110, 12, r: 6),
            const SizedBox(height: 10),
            _bone(side, side, r: 16),
            const SizedBox(height: 12),
            _bone(170, 16, r: 6),
            const SizedBox(height: 6),
            _bone(110, 13, r: 6),
            const SizedBox(height: 34),
            _bone(190, 22, r: 6),
            const SizedBox(height: 14),
            for (var i = 0; i < 4; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  children: [
                    _bone(50, 50),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _bone(180, 15, r: 5),
                        const SizedBox(height: 7),
                        _bone(110, 13, r: 5),
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
