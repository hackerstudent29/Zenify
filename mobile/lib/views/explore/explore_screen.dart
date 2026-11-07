import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart'
    show
        CupertinoActionSheet,
        CupertinoActionSheetAction,
        CupertinoActivityIndicator,
        CupertinoPageRoute,
        CupertinoSliverRefreshControl,
        showCupertinoModalPopup;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/tokens/app_typography.dart';
import '../../design_system/widgets/media_card.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/section_header.dart';
import '../../design_system/widgets/song_tile.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../models/track.dart';
import '../../services/innertube_service.dart';
import '../../services/player_state.dart';
import '../details/album_screen.dart';
import '../details/artist_screen.dart';
import 'explore_data_service.dart';

/* ------------------------------------------------------------------ */
/*  Spring Physics & Reusable Library-style Action Buttons            */
/* ------------------------------------------------------------------ */

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

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
              borderRadius: BorderRadius.circular(24),
            ),
            color: const Color(0x1FFFFFFF), // white 12%
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 22, color: AppColors.accent),
              const SizedBox(width: 8),
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

/// Horizontal snap physics for smooth Apple Music carousel snapping
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
/*  Main Explore Screen                                                */
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
  int _selectedChartTab = 0; // 0: Top Songs, 1: Top Albums, 2: Top Artists, 3: Global
  final Set<String> _followedArtists = {};

  final PageController _featuredPageCtrl = PageController(viewportFraction: 0.92);

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
    context.read<PlayerState>().setQueue(list, startIndex: index);
  }

  void _shuffle(List<Track> list) {
    if (list.isEmpty) return;
    HapticFeedback.lightImpact();
    final shuffled = List<Track>.of(list)..shuffle();
    context.read<PlayerState>().setQueue(shuffled, startIndex: 0);
  }

  void _toggleFollow(String artistName) {
    HapticFeedback.mediumImpact();
    setState(() {
      if (!_followedArtists.remove(artistName)) {
        _followedArtists.add(artistName);
      }
    });
  }

  Future<void> _onMoodOrGenreTap(String query, String title) async {
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Opening $title mix...', style: const TextStyle(color: Colors.white)),
        backgroundColor: AppColors.surface2,
        duration: const Duration(seconds: 1),
      ),
    );
    try {
      final results = await InnerTubeService.instance.search(query);
      if (results.isNotEmpty && mounted) {
        context.read<PlayerState>().setQueue(results, startIndex: 0);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final topInset = MediaQuery.paddingOf(context).top;
    final allTracks = _trendingTracks.isNotEmpty ? _trendingTracks : CatalogDataSource.allTracks;

    // Derived content pools
    final featuredItems = _buildFeaturedItems(allTracks);
    final newReleases = _buildNewReleases(allTracks);
    final artists = _buildRecommendedArtists(allTracks);
    final playlists = _buildPlaylists(allTracks);

    return Scaffold(
      backgroundColor: Zen.bg,
      body: CustomScrollView(
        key: const PageStorageKey<String>('explore_scroll_view'),
        physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
        slivers: [
          // 1. Pinned Apple Music Header
          SliverPersistentHeader(
            pinned: true,
            delegate: _ExploreHeaderDelegate(
              top: topInset,
              country: _country,
              onCountryTap: _pickCountry,
              onProfileTap: widget.onOpenProfile,
              onTogetherTap: widget.onOpenTogether,
            ),
          ),

          // 2. iOS Pull-to-refresh
          CupertinoSliverRefreshControl(
            onRefresh: () => _loadData(force: true),
          ),

          // 3. Main Explore Content
          SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 8),

                // Section A: Featured Discovery Carousel
                _buildFeaturedSection(featuredItems),

                const SizedBox(height: 28),

                // Section B: Trending Music (with exact Library Play & Shuffle buttons)
                _buildTrendingSection(allTracks),

                const SizedBox(height: 32),

                // Section C: Top Charts
                _buildTopChartsSection(allTracks),

                const SizedBox(height: 32),

                // Section D: New Releases
                _buildNewReleasesSection(newReleases),

                const SizedBox(height: 32),

                // Section E: Browse by Genre
                _buildGenresSection(),

                const SizedBox(height: 32),

                // Section F: Browse by Mood & Activity
                _buildMoodsSection(),

                const SizedBox(height: 32),

                // Section G: Recommended Artists
                _buildArtistsSection(artists),

                const SizedBox(height: 32),

                // Section H: Curated & Discovery Playlists
                _buildPlaylistsSection(playlists),

                // Clearance for mini player & floating bottom dock
                const SizedBox(height: 140),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Section A: Featured Discovery
  // ---------------------------------------------------------------------------
  Widget _buildFeaturedSection(List<ExploreFeaturedItem> items) {
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 210,
          child: PageView.builder(
            controller: _featuredPageCtrl,
            itemCount: items.length,
            onPageChanged: (i) => setState(() => _activeFeaturedIndex = i),
            itemBuilder: (context, i) {
              final item = items[i];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: PressableScale(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    if (item.albumTitle != null && item.artistName != null) {
                      Navigator.push(
                        context,
                        CupertinoPageRoute(
                          builder: (_) => AlbumScreen(
                            albumTitle: item.albumTitle!,
                            artistName: item.artistName!,
                            coverUrl: item.coverUrl,
                          ),
                        ),
                      );
                    } else if (item.tracks.isNotEmpty) {
                      _play(item.tracks, 0);
                    }
                  },
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(20),
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
                                Color(0xE60A0A0C),
                              ],
                              stops: [0.3, 0.65, 1.0],
                            ),
                          ),
                        ),
                        // Editorial text layout
                        Positioned(
                          left: 18,
                          right: 18,
                          bottom: 18,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                                decoration: BoxDecoration(
                                  color: AppColors.accent,
                                  borderRadius: BorderRadius.circular(6),
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
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
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
  // Section B: Trending Music
  // ---------------------------------------------------------------------------
  Widget _buildTrendingSection(List<Track> tracks) {
    final topTrending = tracks.take(12).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: SectionHeader(
            title: 'Trending in ${_country.name}',
            actionTitle: 'Play All',
            onActionTap: () => _play(tracks, 0),
          ),
        ),
        const SizedBox(height: 12),

        // Exact Library-style Play and Shuffle buttons
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Expanded(
                child: _ActionButton(
                  icon: Icons.play_arrow_rounded,
                  label: 'Play',
                  onTap: () => _play(topTrending, 0),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _ActionButton(
                  icon: Icons.shuffle_rounded,
                  label: 'Shuffle',
                  onTap: () => _shuffle(topTrending),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 16),

        // Horizontal pages of trending songs (4 rows each)
        if (_isLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 36),
            child: Center(child: CupertinoActivityIndicator(radius: 12)),
          )
        else
          SizedBox(
            height: 270,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              physics: const _SnapSpringPhysics(itemExtent: 310),
              padding: const EdgeInsets.symmetric(horizontal: 12),
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
  // Section C: Top Charts
  // ---------------------------------------------------------------------------
  Widget _buildTopChartsSection(List<Track> tracks) {
    const tabs = ['Top Songs', 'Top Albums', 'Top Artists', 'Global 50'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: SectionHeader(title: 'Top Charts'),
        ),
        const SizedBox(height: 12),

        // Filter pills
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
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
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: _selectedChartTab == i
                            ? AppColors.accent
                            : const Color(0x1FFFFFFF),
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
          padding: const EdgeInsets.symmetric(horizontal: 16),
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
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: const Color(0x0CFFFFFF),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 32,
              child: Text(
                rank.toString().padLeft(2, '0'),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.accent,
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
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
                    track.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    track.artist,
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
            IconButton(
              icon: const Icon(Icons.more_horiz_rounded, color: AppColors.textTertiary),
              onPressed: () {
                final player = context.read<PlayerState>();
                ZenDropdown.showTrackMenu(
                  context: context,
                  trackTitle: track.title,
                  artistName: track.artist,
                  albumName: track.album,
                  onPlayNext: () => player.playNext(track),
                  onPlayLater: () => player.playLast(track),
                  onGoToArtist: () => Navigator.push(
                    context,
                    CupertinoPageRoute(builder: (_) => ArtistScreen(artistName: track.artist)),
                  ),
                  onGoToAlbum: track.album.isNotEmpty && track.album != 'Single'
                      ? () => Navigator.push(
                            context,
                            CupertinoPageRoute(
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
  // Section D: New Releases
  // ---------------------------------------------------------------------------
  Widget _buildNewReleasesSection(List<ExploreReleaseItem> releases) {
    if (releases.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: SectionHeader(title: 'New Releases'),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 200,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const _SnapSpringPhysics(itemExtent: 160),
            padding: const EdgeInsets.symmetric(horizontal: 16),
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
                      CupertinoPageRoute(
                        builder: (_) => AlbumScreen(
                          albumTitle: rel.title,
                          artistName: rel.artist,
                          coverUrl: rel.coverUrl,
                        ),
                      ),
                    );
                  },
                  child: SizedBox(
                    width: 145,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: Stack(
                            children: [
                              CachedNetworkImage(
                                imageUrl: rel.coverUrl,
                                width: 145,
                                height: 145,
                                fit: BoxFit.cover,
                                placeholder: (_, url) => Container(color: AppColors.surface2),
                              ),
                              Positioned(
                                top: 8,
                                right: 8,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.7),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    rel.type.toUpperCase(),
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 9,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          rel.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          rel.artist,
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
  // Section E: Browse by Genre
  // ---------------------------------------------------------------------------
  Widget _buildGenresSection() {
    final genres = _dataService.genres;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: SectionHeader(title: 'Browse by Genre'),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 175,
          child: GridView.builder(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 0.52,
            ),
            itemCount: genres.length,
            itemBuilder: (context, i) {
              final g = genres[i];
              return PressableScale(
                onTap: () => _onMoodOrGenreTap(g.searchQuery, g.title),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: g.gradient,
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          g.title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      Icon(g.icon, color: Colors.white.withValues(alpha: 0.8), size: 22),
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
  // Section F: Browse by Mood & Activity
  // ---------------------------------------------------------------------------
  Widget _buildMoodsSection() {
    final moods = _dataService.moods;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: SectionHeader(title: 'Moods & Activities'),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 175,
          child: GridView.builder(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16),
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
                    borderRadius: BorderRadius.circular(14),
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
  // Section G: Recommended Artists
  // ---------------------------------------------------------------------------
  Widget _buildArtistsSection(List<Map<String, String>> artists) {
    if (artists.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: SectionHeader(title: 'Recommended Artists'),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 180,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: artists.length,
            itemBuilder: (context, i) {
              final a = artists[i];
              final name = a['name']!;
              final photo = a['photo']!;
              final isFollowed = _followedArtists.contains(name);

              return Padding(
                padding: const EdgeInsets.only(right: 16),
                child: SizedBox(
                  width: 105,
                  child: Column(
                    children: [
                      MediaCard(
                        title: '',
                        imageUrl: photo,
                        isCircular: true,
                        width: 90,
                        onTap: () {
                          HapticFeedback.lightImpact();
                          Navigator.push(
                            context,
                            CupertinoPageRoute(
                              builder: (_) => ArtistScreen(
                                artistName: name,
                                imageUrl: photo,
                              ),
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 6),
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      PressableScale(
                        onTap: () => _toggleFollow(name),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                          decoration: BoxDecoration(
                            color: isFollowed ? AppColors.accent : const Color(0x1FFFFFFF),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            isFollowed ? 'Following' : 'Follow',
                            style: TextStyle(
                              color: isFollowed ? Colors.white : AppColors.textSecondary,
                              fontSize: 10,
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
  // Section H: Curated Playlists
  // ---------------------------------------------------------------------------
  Widget _buildPlaylistsSection(List<ExplorePlaylistItem> playlists) {
    if (playlists.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: SectionHeader(title: 'Curated Playlists'),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 195,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const _SnapSpringPhysics(itemExtent: 155),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: playlists.length,
            itemBuilder: (context, i) {
              final p = playlists[i];
              return Padding(
                padding: const EdgeInsets.only(right: 14),
                child: PressableScale(
                  onTap: () => _onMoodOrGenreTap(p.searchQuery, p.title),
                  child: SizedBox(
                    width: 140,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: CachedNetworkImage(
                            imageUrl: p.coverUrl,
                            width: 140,
                            height: 140,
                            fit: BoxFit.cover,
                            placeholder: (_, url) => Container(color: AppColors.surface2),
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          p.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          p.description,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textTertiary,
                            fontSize: 11,
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
  // Content builders & generators
  // ---------------------------------------------------------------------------
  List<ExploreFeaturedItem> _buildFeaturedItems(List<Track> tracks) {
    if (tracks.isEmpty) return const [];
    final out = <ExploreFeaturedItem>[];

    final t0 = tracks[0];
    out.add(ExploreFeaturedItem(
      badge: 'Editorial Spotlight',
      title: t0.title,
      subtitle: '${t0.artist} • Trending ${_country.name}',
      coverUrl: t0.coverUrl,
      tracks: tracks,
      albumTitle: t0.album,
      artistName: t0.artist,
    ));

    if (tracks.length > 3) {
      final t3 = tracks[3];
      out.add(ExploreFeaturedItem(
        badge: 'New & Noteworthy',
        title: t3.album.isNotEmpty && t3.album != 'Single' ? t3.album : t3.title,
        subtitle: t3.artist,
        coverUrl: t3.coverUrl,
        tracks: tracks.sublist(3),
        albumTitle: t3.album,
        artistName: t3.artist,
      ));
    }

    if (tracks.length > 7) {
      final t7 = tracks[7];
      out.add(ExploreFeaturedItem(
        badge: 'Chart Topper',
        title: t7.title,
        subtitle: '${t7.artist} • Top Hit',
        coverUrl: t7.coverUrl,
        tracks: tracks.sublist(7),
        albumTitle: t7.album,
        artistName: t7.artist,
      ));
    }

    return out;
  }

  List<ExploreReleaseItem> _buildNewReleases(List<Track> tracks) {
    final releases = <ExploreReleaseItem>[];
    final seen = <String>{};

    for (final t in tracks) {
      if (t.album.isNotEmpty && seen.add(t.album)) {
        releases.add(ExploreReleaseItem(
          title: t.album,
          artist: t.artist,
          coverUrl: t.coverUrl,
          type: t.album == 'Single' ? 'Single' : 'Album',
          year: '2026',
          tracks: [t],
        ));
      }
      if (releases.length >= 10) break;
    }
    return releases;
  }

  List<Map<String, String>> _buildRecommendedArtists(List<Track> tracks) {
    final seen = <String>{};
    final artists = <Map<String, String>>[];

    for (final t in tracks) {
      final leadArtist = t.artist.split(',').first.trim();
      if (seen.add(leadArtist.toLowerCase())) {
        artists.add({
          'name': leadArtist,
          'photo': t.coverUrl,
        });
      }
      if (artists.length >= 10) break;
    }
    return artists;
  }

  List<ExplorePlaylistItem> _buildPlaylists(List<Track> tracks) {
    if (tracks.isEmpty) return const [];
    return [
      ExplorePlaylistItem(
        title: '${_country.name} Top 50',
        description: 'The most played songs right now',
        coverUrl: tracks.first.coverUrl,
        trackCount: tracks.length,
        searchQuery: '${_country.query} top songs',
      ),
      if (tracks.length > 2)
        ExplorePlaylistItem(
          title: 'Acoustic & Chill',
          description: 'Mellow vocal tracks and calm rhythms',
          coverUrl: tracks[2].coverUrl,
          trackCount: 30,
          searchQuery: 'acoustic chill relax',
        ),
      if (tracks.length > 5)
        ExplorePlaylistItem(
          title: 'Night Drive',
          description: 'Atmospheric late night cruising',
          coverUrl: tracks[5].coverUrl,
          trackCount: 25,
          searchQuery: 'night drive synthwave pop',
        ),
    ];
  }
}

/* ------------------------------------------------------------------ */
/*  Collapsing Apple Music Header                                      */
/* ------------------------------------------------------------------ */

class _ExploreHeaderDelegate extends SliverPersistentHeaderDelegate {
  _ExploreHeaderDelegate({
    required this.top,
    required this.country,
    required this.onCountryTap,
    this.onProfileTap,
    this.onTogetherTap,
  });

  final double top;
  final ExploreCountry country;
  final VoidCallback onCountryTap;
  final VoidCallback? onProfileTap;
  final VoidCallback? onTogetherTap;

  @override
  double get minExtent => top + 48;
  @override
  double get maxExtent => top + 56;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: Zen.bg.withValues(alpha: 0.95),
      padding: EdgeInsets.fromLTRB(16, top + 4, 16, 6),
      child: Row(
        children: [
          // Large Title
          const Text(
            'Explore',
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.6,
              color: AppColors.textPrimary,
            ),
          ),
          const Spacer(),

          // Country Selector Pill
          PressableScale(
            onTap: onCountryTap,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: const Color(0x1FFFFFFF),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1), width: 0.5),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(country.flag, style: const TextStyle(fontSize: 14)),
                  const SizedBox(width: 5),
                  Text(
                    country.code,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(width: 3),
                  const Icon(Icons.keyboard_arrow_down_rounded, size: 14, color: AppColors.textSecondary),
                ],
              ),
            ),
          ),

          const SizedBox(width: 8),

          // Together Room Button
          if (onTogetherTap != null)
            IconButton(
              icon: const Icon(Icons.all_inclusive_rounded, color: AppColors.textSecondary, size: 22),
              onPressed: onTogetherTap,
              tooltip: 'Listen Together',
            ),

          // Profile Button
          if (onProfileTap != null)
            IconButton(
              icon: const Icon(Icons.person_rounded, color: AppColors.textSecondary, size: 22),
              onPressed: onProfileTap,
              tooltip: 'Profile',
            ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _ExploreHeaderDelegate oldDelegate) =>
      oldDelegate.country.code != country.code || oldDelegate.top != top;
}
