import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart'
    show
        CupertinoActionSheet,
        CupertinoActionSheetAction,
        CupertinoActivityIndicator,
        CupertinoIcons,
        CupertinoSliverRefreshControl,
        showCupertinoModalPopup;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/interactive_artists_text.dart';
import '../../design_system/widgets/media_card.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/section_header.dart';
import '../../design_system/widgets/song_tile.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/innertube_service.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';
import '../details/album_screen.dart';
import '../details/artist_popup.dart';
import '../details/artist_screen.dart';
import 'explore_data_service.dart';

/* ------------------------------------------------------------------ */
/*  Horizontal Snap Physics for Apple Music Carousel Snapping         */
/* ------------------------------------------------------------------ */

class _SnapSpringPhysics extends ScrollPhysics {
  const _SnapSpringPhysics({super.parent, required this.itemExtent});
  final double itemExtent;

  @override
  _SnapSpringPhysics applyTo(ScrollPhysics? ancestor) =>
      _SnapSpringPhysics(parent: buildParent(ancestor), itemExtent: itemExtent);

  @override
  SpringDescription get spring =>
      SpringDescription.withDampingRatio(mass: 0.5, stiffness: 140, ratio: 1.05);

  @override
  Simulation? createBallisticSimulation(ScrollMetrics position, double velocity) {
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
    final clamped = target.clamp(position.minScrollExtent, position.maxScrollExtent).toDouble();
    if ((clamped - position.pixels).abs() < 0.5) return null;
    return ScrollSpringSimulation(spring, position.pixels, clamped, velocity,
        tolerance: toleranceFor(position));
  }
}

/* ------------------------------------------------------------------ */
/*  Main Explore Screen (Editorial Apple Music Design)                */
/* ------------------------------------------------------------------ */

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
    with SingleTickerProviderStateMixin, AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  late final AnimationController _ambient =
      AnimationController(vsync: this, duration: const Duration(seconds: 14));

  final ExploreDataService _dataService = ExploreDataService.instance;
  late ExploreCountry _country;

  List<Track> _trendingTracks = [];
  bool _isLoading = true;
  int _activeFeaturedIndex = 0;
  int _selectedMoodChip = 0;
  int _selectedChartTab = 0; // 0: Top Songs, 1: Top Albums, 2: Top Artists, 3: Global
  final Set<String> _followedArtists = {};

  final PageController _featuredPageCtrl = PageController(viewportFraction: 0.92);

  static const List<String> _exploreChips = [
    'Top Hits',
    'Trending',
    'New Releases',
    'Chill',
    'Workout',
    'Desi',
    'Party',
    'Focus',
    'Romance',
  ];

  @override
  void initState() {
    super.initState();
    _country = _dataService.currentCountry;
    _dataService.initCountry().then((_) {
      if (mounted) {
        setState(() => _country = _dataService.currentCountry);
      }
    });
    _loadData();
    CatalogDataSource.tracksNotifier.addListener(_onCatalogUpdated);
  }

  void _onCatalogUpdated() {
    if (mounted && _trendingTracks.isEmpty) {
      _loadData();
    }
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
    CatalogDataSource.tracksNotifier.removeListener(_onCatalogUpdated);
    _ambient.dispose();
    _featuredPageCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadData({bool force = false}) async {
    setState(() => _isLoading = true);
    final tracks = await _dataService.getTrendingForCountry(_country, forceRefresh: force);
    if (mounted) {
      setState(() {
        _trendingTracks = tracks;
        _isLoading = false;
      });
    }
  }

  Future<void> _pickCountry() async {
    HapticFeedback.selectionClick();
    await showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: const Text('Explore Music Region', style: TextStyle(fontWeight: FontWeight.w700)),
        message: const Text('Select a country to discover localized charts, new releases, and trending songs.'),
        actions: [
          for (final c in kExploreCountries)
            CupertinoActionSheetAction(
              isDefaultAction: c.code == _country.code,
              onPressed: () {
                Navigator.pop(ctx);
                if (c.code != _country.code) {
                  setState(() => _country = c);
                  _dataService.setCountry(c);
                  _loadData(force: true);
                }
              },
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(c.flag, style: const TextStyle(fontSize: 20)),
                  const SizedBox(width: 8),
                  Text('${c.name} (${c.code})', style: const TextStyle(fontWeight: FontWeight.w600)),
                ],
              ),
            ),
        ],
        cancelButton: CupertinoActionSheetAction(
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Cancel'),
        ),
      ),
    );
  }

  void _play(List<Track> list, int index) {
    if (list.isEmpty) return;
    final startIdx = index.clamp(0, list.length - 1);
    final ctx = PlaybackContext(
      type: PlaybackContextType.homeSection,
      id: 'explore_trending',
      tracks: list,
      startTrack: list[startIdx],
      title: 'Trending',
    );
    context.read<PlayerState>().setQueue(list, startIndex: startIdx, context: ctx);
  }

  void _shuffle(List<Track> list) {
    if (list.isEmpty) return;
    final ctx = PlaybackContext(
      type: PlaybackContextType.homeSection,
      id: 'explore_trending',
      tracks: list,
      startTrack: list.first,
      title: 'Trending',
    );
    context.read<PlayerState>().setQueue(list, startIndex: 0, shuffle: true, context: ctx);
  }

  void _toggleFollow(String artistName) {
    HapticFeedback.selectionClick();
    setState(() {
      if (_followedArtists.contains(artistName)) {
        _followedArtists.remove(artistName);
      } else {
        _followedArtists.add(artistName);
      }
    });
  }

  void _onMoodOrGenreTap(String query, String title) {
    HapticFeedback.lightImpact();
    if (widget.onOpenCategory != null) {
      widget.onOpenCategory!(query);
    } else {
      InnerTubeService.instance.search(query).then((tracks) {
        if (!mounted || tracks.isEmpty) return;
        Navigator.push(
          context,
          ZenPageRoute(
            builder: (_) => AlbumScreen(
              albumTitle: title,
              artistName: 'Curated by Zenify',
              coverUrl: tracks.first.coverUrl,
            ),
          ),
        );
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Build Main Explore Body
  // ---------------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    super.build(context);
    final topInset = MediaQuery.paddingOf(context).top;

    final allTracks = _trendingTracks.isNotEmpty
        ? _trendingTracks
        : CatalogDataSource.allTracks;

    final featuredItems = _buildFeaturedItems(allTracks);
    final newReleases = _buildNewReleases(allTracks);
    final artists = _buildRecommendedArtists(allTracks);
    final playlists = _buildPlaylists(allTracks);

    return Scaffold(
      backgroundColor: Zen.bg,
      body: Stack(
        children: [
          CustomScrollView(
            key: const PageStorageKey<String>('explore_scroll_view'),
            physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
            slivers: [
              SliverToBoxAdapter(child: SizedBox(height: topInset + 56)),

              // 1. iOS Pull-to-refresh
              CupertinoSliverRefreshControl(
                onRefresh: () => _loadData(force: true),
              ),

              // 2. Mood & Vibe Chips Row (Apple Music Home Parity)
              SliverToBoxAdapter(
                child: _buildChipsRow(),
              ),

              // 3. Main Explore Content
              SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 12),

                    // Section A: Featured Discovery Carousel (With Round White Play Button)
                    _buildFeaturedSection(featuredItems),

                    const SizedBox(height: 32),

                    // Section B: Trending Music (Unified ZenPlayShuffleRow + 4-Row Column Shelf)
                    _buildTrendingSection(allTracks),

                    const SizedBox(height: 34),

                    // Section C: Top Charts (Ranked Rows with Unified Buttons)
                    _buildTopChartsSection(allTracks),

                    const SizedBox(height: 34),

                    // Section D: New Releases & Hot Drops (Cover Cards Shelf)
                    _buildNewReleasesSection(newReleases),

                    const SizedBox(height: 34),

                    // Section E: Spotlight Artists (Circular Avatars + Stadium Follow Pills)
                    _buildArtistsSection(artists),

                    const SizedBox(height: 34),

                    // Section F: Curated & Discovery Playlists
                    _buildPlaylistsSection(playlists),

                    const SizedBox(height: 34),

                    // Section G: Browse by Mood & Activity
                    _buildMoodsSection(),

                    const SizedBox(height: 34),

                    // Section H: Browse by Genre (Editorial 2-Column Grid)
                    _buildGenresSection(),

                    // Clearance for floating bottom dock and mini player
                    SizedBox(height: 180 + MediaQuery.paddingOf(context).bottom),
                  ],
                ),
              ),
            ],
          ),

          // Dynamic Island Header
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandHeader(
              title: 'Explore',
              subtitle: '${_country.flag} ${_country.name}',
              showBack: false,
              isDockPage: true,
              onCenterTap: _pickCountry,
              showProfile: true,
              onProfileTap: widget.onOpenProfile,
              topPadding: topInset + 4,
            ),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Mood / Genre Chips Row (Parity with Home Screen _Chips)
  // ---------------------------------------------------------------------------
  Widget _buildChipsRow() {
    return SizedBox(
      height: 52,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
        itemCount: _exploreChips.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (ctx, i) {
          final isSelected = i == _selectedMoodChip;
          final title = _exploreChips[i];

          return PressableScale(
            scale: 0.94,
            onTap: () {
              HapticFeedback.selectionClick();
              setState(() => _selectedMoodChip = i);
              if (i > 0) {
                _onMoodOrGenreTap(title.toLowerCase(), title);
              }
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: isSelected ? Colors.white : Colors.white.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(20),
              ),
              alignment: Alignment.center,
              child: Text(
                title,
                style: TextStyle(
                  color: isSelected ? Colors.black : Colors.white.withValues(alpha: 0.9),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.2,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Section A: Featured Discovery (With Round White Play Button)
  // ---------------------------------------------------------------------------
  Widget _buildFeaturedSection(List<ExploreFeaturedItem> items) {
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 220,
          child: PageView.builder(
            controller: _featuredPageCtrl,
            itemCount: items.length,
            onPageChanged: (i) => setState(() => _activeFeaturedIndex = i),
            itemBuilder: (context, i) {
              final item = items[i];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 5),
                child: PressableScale(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    if (item.albumTitle != null) {
                      Navigator.push(
                        context,
                        ZenPageRoute(
                          builder: (_) => AlbumScreen(
                            albumTitle: item.albumTitle!,
                            artistName: item.artistName ?? 'Artist',
                            coverUrl: item.coverUrl,
                          ),
                        ),
                      );
                    } else if (item.tracks.isNotEmpty) {
                      _play(item.tracks, 0);
                    }
                  },
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        // Cover art
                        CachedNetworkImage(
                          imageUrl: item.coverUrl,
                          fit: BoxFit.cover,
                          placeholder: (_, url) => Container(color: AppColors.surface2),
                          errorWidget: (_, url, error) => Container(color: AppColors.surface2),
                        ),
                        // Dark glass gradient overlay
                        Container(
                          decoration: const BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.transparent,
                                Color(0x60000000),
                                Color(0xF00A0A0C),
                              ],
                              stops: [0.25, 0.6, 1.0],
                            ),
                          ),
                        ),
                        // Editorial text layout
                        Positioned(
                          left: 18,
                          right: 74,
                          bottom: 18,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: AppColors.accent,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  item.badge.toUpperCase(),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.8,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                item.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 21,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.4,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                item.subtitle,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.8),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        // Circular White Play Button (Apple Music Hero Parity)
                        Positioned(
                          right: 18,
                          bottom: 18,
                          child: ZenActionCircle(
                            size: 46,
                            icon: CupertinoIcons.play_fill,
                            backgroundColor: Colors.white,
                            idleColor: Colors.black,
                            activeColor: Colors.black,
                            iconSize: 20,
                            onTap: () {
                              if (item.tracks.isNotEmpty) {
                                _play(item.tracks, 0);
                              }
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 10),
        // Dots indicator
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (int i = 0; i < items.length; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 260),
                curve: Curves.easeOutCubic,
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: _activeFeaturedIndex == i ? 18 : 6,
                height: 5,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(3),
                  color: _activeFeaturedIndex == i
                      ? AppColors.accent
                      : Colors.white.withValues(alpha: 0.2),
                ),
              ),
          ],
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Section B: Trending Music (Unified ZenPlayShuffleRow + 4-Row Column Shelf)
  // ---------------------------------------------------------------------------
  Widget _buildTrendingSection(List<Track> tracks) {
    final topTrending = tracks.take(16).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: SectionHeader(
            title: 'Trending in ${_country.name}',
            actionTitle: 'See All',
            onActionTap: () => _play(tracks, 0),
          ),
        ),
        const SizedBox(height: 12),

        // Unified Play & Shuffle Row (Round Shape Parity with Album & Artist Pages)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: ZenPlayShuffleRow(
            onPlay: () => _play(topTrending, 0),
            onShuffle: () => _shuffle(topTrending),
            playLabel: 'Play All',
          ),
        ),

        const SizedBox(height: 16),

        // Horizontal pages of trending songs (4 rows each, matching Home quick picks)
        if (_isLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 36),
            child: Center(child: CupertinoActivityIndicator(radius: 12)),
          )
        else
          SizedBox(
            height: 272,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              physics: const _SnapSpringPhysics(itemExtent: 310),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: (topTrending.length / 4).ceil(),
              itemBuilder: (context, colIndex) {
                final start = colIndex * 4;
                final colTracks = topTrending.sublist(
                  start,
                  math.min(start + 4, topTrending.length),
                );
                return SizedBox(
                  width: 300,
                  child: Column(
                    children: [
                      for (int r = 0; r < colTracks.length; r++)
                        SongTile(
                          track: colTracks[r],
                          index: start + r + 1,
                          onTap: () => _play(topTrending, start + r),
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

  // ---------------------------------------------------------------------------
  // Section C: Top Charts (Ranked Rows with Unified Buttons)
  // ---------------------------------------------------------------------------
  Widget _buildTopChartsSection(List<Track> tracks) {
    const tabs = ['Top Songs', 'Top Albums', 'Top Artists', 'Global 50'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 20),
          child: SectionHeader(title: 'Top Charts'),
        ),
        const SizedBox(height: 12),

        // Filter pills
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            children: [
              for (int i = 0; i < tabs.length; i++)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: PressableScale(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() => _selectedChartTab = i);
                    },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: _selectedChartTab == i
                            ? AppColors.accent
                            : Colors.white.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: Text(
                        tabs[i],
                        style: TextStyle(
                          color: _selectedChartTab == i ? Colors.white : AppColors.textSecondary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),

        const SizedBox(height: 14),

        // Ranked items
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Column(
            children: [
              for (int i = 0; i < math.min(5, tracks.length); i++)
                _buildRankRow(tracks[i], i + 1, tracks),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildRankRow(Track track, int rank, List<Track> all) {
    return PressableScale(
      onTap: () => _play(all, rank - 1),
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 5),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 30,
              child: Text(
                rank.toString().padLeft(2, '0'),
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: rank <= 3 ? AppColors.accent : Colors.white54,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: CachedNetworkImage(
                imageUrl: track.coverUrl,
                width: 48,
                height: 48,
                fit: BoxFit.cover,
                placeholder: (_, url) => Container(color: AppColors.surface2),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    MediaNormalizer.cleanCompactTitle(track.title),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  InteractiveArtistsText(
                    artists: track.resolvedArtists,
                    maxLines: 1,
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            ZenActionCircle(
              size: 36,
              icon: CupertinoIcons.ellipsis,
              iconSize: 18,
              onTap: () {
                final player = context.read<PlayerState>();
                final resolvedArtists = track.resolvedArtists;
                ZenDropdown.showTrackMenu(
                  context: context,
                  trackTitle: track.title,
                  artistName: track.artist,
                  albumName: track.album,
                  onPlayNext: () => player.playNext(track),
                  onPlayLater: () => player.playLast(track),
                  onGoToArtist: () {
                    if (resolvedArtists.length > 1) {
                      showArtistPopup(context, artists: resolvedArtists);
                    } else if (resolvedArtists.isNotEmpty) {
                      Navigator.push(
                        context,
                        ZenPageRoute(
                          builder: (_) => ArtistScreen(
                            artistName: resolvedArtists.first.name,
                            browseId: resolvedArtists.first.id,
                          ),
                        ),
                      );
                    }
                  },
                  onGoToAlbum: track.album.isNotEmpty
                      ? () => Navigator.push(
                            context,
                            ZenPageRoute(
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
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Section D: New Releases & Hot Drops (Cover Cards Shelf)
  // ---------------------------------------------------------------------------
  Widget _buildNewReleasesSection(List<ExploreReleaseItem> releases) {
    if (releases.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 20),
          child: SectionHeader(title: 'New Releases'),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 215,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const _SnapSpringPhysics(itemExtent: 160),
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: releases.length,
            itemBuilder: (context, i) {
              final rel = releases[i];
              return Padding(
                padding: const EdgeInsets.only(right: 14),
                child: PressableScale(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    Navigator.push(
                      context,
                      ZenPageRoute(
                        builder: (_) => AlbumScreen(
                          albumTitle: rel.title,
                          artistName: rel.artist,
                          coverUrl: rel.coverUrl,
                        ),
                      ),
                    );
                  },
                  child: SizedBox(
                    width: 150,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: Stack(
                            children: [
                              CachedNetworkImage(
                                imageUrl: rel.coverUrl,
                                width: 150,
                                height: 150,
                                fit: BoxFit.cover,
                                placeholder: (_, url) => Container(color: AppColors.surface2),
                              ),
                              Positioned(
                                top: 8,
                                right: 8,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.75),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    rel.type.toUpperCase(),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 0.5,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          MediaNormalizer.cleanCompactTitle(rel.title),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          MediaNormalizer.formatArtists(rel.artist),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textSecondary,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Section E: Spotlight Artists (Circular Avatars + Stadium Follow Pills)
  // ---------------------------------------------------------------------------
  Widget _buildArtistsSection(List<Map<String, String>> artists) {
    if (artists.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 20),
          child: SectionHeader(title: 'Recommended Artists'),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 236,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: artists.length,
            itemBuilder: (context, i) {
              final a = artists[i];
              final name = a['name']!;
              final photo = a['photo']!;
              final isFollowed = _followedArtists.contains(name);

              return Padding(
                padding: const EdgeInsets.only(right: 14),
                child: SizedBox(
                  width: 160,
                  child: Column(
                    children: [
                      MediaCard(
                        title: '',
                        imageUrl: photo,
                        isCircular: true,
                        width: 160,
                        onTap: () {
                          HapticFeedback.lightImpact();
                          Navigator.push(
                            context,
                            ZenPageRoute(
                              builder: (_) => ArtistScreen(
                                artistName: name,
                                imageUrl: photo,
                              ),
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 8),
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 6),
                      PressableScale(
                        onTap: () => _toggleFollow(name),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                          decoration: BoxDecoration(
                            color: isFollowed ? AppColors.accent : Colors.white.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(16),
                          ),
                          child: Text(
                            isFollowed ? 'Following' : 'Follow',
                            style: TextStyle(
                              color: isFollowed ? Colors.white : AppColors.textSecondary,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
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
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Section F: Curated & Discovery Playlists
  // ---------------------------------------------------------------------------
  Widget _buildPlaylistsSection(List<ExplorePlaylistItem> playlists) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 20),
          child: SectionHeader(title: 'Curated Playlists'),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 220,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const _SnapSpringPhysics(itemExtent: 160),
            padding: const EdgeInsets.symmetric(horizontal: 20),
            itemCount: playlists.length,
            itemBuilder: (context, i) {
              final pl = playlists[i];
              return Padding(
                padding: const EdgeInsets.only(right: 14),
                child: PressableScale(
                  onTap: () => _onMoodOrGenreTap(pl.searchQuery, pl.title),
                  child: SizedBox(
                    width: 155,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: CachedNetworkImage(
                            imageUrl: pl.coverUrl,
                            width: 155,
                            height: 155,
                            fit: BoxFit.cover,
                            placeholder: (_, url) => Container(color: AppColors.surface2),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          pl.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          pl.description,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textSecondary,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Section G: Browse by Mood & Activity
  // ---------------------------------------------------------------------------
  Widget _buildMoodsSection() {
    final moods = _dataService.moods;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 20),
          child: SectionHeader(title: 'Moods & Activities'),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 180,
          child: GridView.builder(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 20),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 0.52,
            ),
            itemCount: moods.length,
            itemBuilder: (context, i) {
              final m = moods[i];
              return PressableScale(
                onTap: () => _onMoodOrGenreTap(m.searchQuery, m.title),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: m.gradient,
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              m.title,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              m.subtitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.7),
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Icon(m.icon, color: Colors.white.withValues(alpha: 0.75), size: 22),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Section H: Browse by Genre (2-Column Grid Matching Home Screen)
  // ---------------------------------------------------------------------------
  Widget _buildGenresSection() {
    final genres = _dataService.genres;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 20),
          child: SectionHeader(title: 'Browse by Genre'),
        ),
        const SizedBox(height: 12),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 2.2,
            ),
            itemCount: genres.length,
            itemBuilder: (context, i) {
              final g = genres[i];
              return PressableScale(
                onTap: () => _onMoodOrGenreTap(g.searchQuery, g.title),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: g.gradient,
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          g.title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      Icon(g.icon, color: Colors.white.withValues(alpha: 0.85), size: 22),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Synthetic Data Helpers
  // ---------------------------------------------------------------------------
  List<ExploreFeaturedItem> _buildFeaturedItems(List<Track> tracks) {
    if (tracks.isEmpty) return [];

    final result = <ExploreFeaturedItem>[];
    final artistsSeen = <String>{};

    for (final t in tracks) {
      if (artistsSeen.contains(t.artist)) continue;
      artistsSeen.add(t.artist);

      final related = tracks.where((x) => x.artist == t.artist).toList();
      result.add(
        ExploreFeaturedItem(
          badge: 'Artist Spotlight',
          title: t.artist,
          subtitle: 'Featuring "${MediaNormalizer.cleanCompactTitle(t.title)}" and top hits',
          coverUrl: t.coverUrl,
          tracks: related,
          albumTitle: t.album,
          artistName: t.artist,
        ),
      );
      if (result.length >= 5) break;
    }
    return result;
  }

  List<ExploreReleaseItem> _buildNewReleases(List<Track> tracks) {
    final list = <ExploreReleaseItem>[];
    final seen = <String>{};

    for (final t in tracks) {
      final key = '${t.album}_${t.artist}';
      if (seen.contains(key)) continue;
      seen.add(key);

      final albumTracks = tracks.where((x) => x.album == t.album).toList();
      list.add(
        ExploreReleaseItem(
          title: t.album.isNotEmpty ? t.album : t.title,
          artist: t.artist,
          coverUrl: t.coverUrl,
          type: albumTracks.length > 3 ? 'Album' : 'Single',
          tracks: albumTracks,
        ),
      );
      if (list.length >= 10) break;
    }
    return list;
  }

  List<Map<String, String>> _buildRecommendedArtists(List<Track> tracks) {
    final result = <Map<String, String>>[];
    final seen = <String>{};

    for (final t in tracks) {
      if (seen.contains(t.artist)) continue;
      seen.add(t.artist);
      result.add({
        'name': t.artist,
        'photo': t.coverUrl,
      });
      if (result.length >= 8) break;
    }
    return result;
  }

  List<ExplorePlaylistItem> _buildPlaylists(List<Track> tracks) {
    return [
      ExplorePlaylistItem(
        title: '${_country.name} Top 50',
        description: 'The most streamed tracks right now in ${_country.name}',
        coverUrl: tracks.isNotEmpty
            ? tracks.first.coverUrl
            : 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600',
        trackCount: 50,
        searchQuery: '${_country.query} playlist',
      ),
      ExplorePlaylistItem(
        title: 'Today\'s Hits',
        description: 'The biggest songs across pop, rap and international charts',
        coverUrl: tracks.length > 1
            ? tracks[1].coverUrl
            : 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600',
        trackCount: 35,
        searchQuery: 'todays top hits',
      ),
      ExplorePlaylistItem(
        title: 'Late Night Chill',
        description: 'Acoustic melodies and ambient vibes for unwinding',
        coverUrl: tracks.length > 2
            ? tracks[2].coverUrl
            : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600',
        trackCount: 40,
        searchQuery: 'chill acoustic songs',
      ),
      ExplorePlaylistItem(
        title: 'Workout Energy',
        description: 'High-tempo motivation tracks to keep your momentum high',
        coverUrl: tracks.length > 3
            ? tracks[3].coverUrl
            : 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600',
        trackCount: 45,
        searchQuery: 'workout motivation songs',
      ),
    ];
  }
}
