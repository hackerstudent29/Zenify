import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart'
    show
        CupertinoActivityIndicator,
        CupertinoIcons,
        CupertinoPageRoute;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/dynamic_island_header.dart';
import '../../design_system/widgets/media_card.dart';
import '../../design_system/widgets/monogram_avatar.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/song_tile.dart';
import '../../design_system/zen.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/player_state.dart';
import '../../services/search_nav.dart';
import '../../utils/media_normalizer.dart';
import '../details/album_screen.dart';
import '../details/artist_screen.dart';
import 'search_data_service.dart';
import 'search_models.dart';

/* ------------------------------------------------------------------ */
/*  Search Screen Categories Configuration                            */
/* ------------------------------------------------------------------ */

class _BrowseTile {
  const _BrowseTile({
    required this.title,
    required this.query,
    required this.gradient,
    required this.icon,
  });

  final String title;
  final String query;
  final List<Color> gradient;
  final IconData icon;
}

const List<_BrowseTile> _kSearchCategories = [
  _BrowseTile(
    title: 'Top Hits',
    query: 'top hits songs',
    gradient: [Color(0xFFE11D48), Color(0xFF9E1238)],
    icon: Icons.trending_up_rounded,
  ),
  _BrowseTile(
    title: 'New Music',
    query: 'new release songs',
    gradient: [Color(0xFF8B5CF6), Color(0xFF5B21B6)],
    icon: Icons.fiber_new_rounded,
  ),
  _BrowseTile(
    title: 'Chill & Relax',
    query: 'chill acoustic songs',
    gradient: [Color(0xFF059669), Color(0xFF065F46)],
    icon: Icons.spa_rounded,
  ),
  _BrowseTile(
    title: 'Workout',
    query: 'workout gym motivation',
    gradient: [Color(0xFFDC2626), Color(0xFF991B1B)],
    icon: Icons.fitness_center_rounded,
  ),
  _BrowseTile(
    title: 'Desi & Regional',
    query: 'tamil hindi top hits',
    gradient: [Color(0xFFD97706), Color(0xFF92400E)],
    icon: Icons.music_note_rounded,
  ),
  _BrowseTile(
    title: 'Party & EDM',
    query: 'party dance club hits',
    gradient: [Color(0xFF9333EA), Color(0xFF6B21A8)],
    icon: Icons.celebration_rounded,
  ),
];

const List<String> _kTrendingPills = [
  'Anirudh',
  'A. R. Rahman',
  'Taylor Swift',
  'The Weeknd',
  'Sid Sriram',
  'Coldplay',
  'Billie Eilish',
  'Tamil Hits',
];

/* ------------------------------------------------------------------ */
/*  Main Search Screen                                                 */
/* ------------------------------------------------------------------ */

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, this.onBack});

  final VoidCallback? onBack;

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen>
    with SingleTickerProviderStateMixin, AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final TextEditingController _textCtrl = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  final ScrollController _scrollController = ScrollController();
  final SearchDataService _dataService = SearchDataService.instance;

  Timer? _debounceTimer;
  int _searchRequestId = 0;

  bool _isLoading = false;
  bool _isLoadingMore = false;
  String _activeQuery = '';

  List<String> _liveSuggestions = [];
  SearchResult _searchResults = SearchResult(
    originalQuery: '',
    intent: const SearchIntent(originalQuery: '', normalizedQuery: '', entityText: ''),
  );
  SearchFilter _selectedFilter = SearchFilter.all;

  @override
  void initState() {
    super.initState();
    _dataService.initRecents();
    _textCtrl.addListener(_onTextChanged);
    _focusNode.addListener(_onFocusChanged);
    _scrollController.addListener(_onScroll);
    SearchNav.phase.addListener(_onPhase);
  }

  void _onFocusChanged() {
    if (!_focusNode.hasFocus && mounted) {
      if (SearchNav.phase.value == SearchPhase.typing && _activeQuery.isEmpty) {
        SearchNav.phase.value = SearchPhase.bar;
      }
    }
  }

  void _onPhase() {
    final p = SearchNav.phase.value;
    if (p == SearchPhase.typing) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focusNode.requestFocus();
      });
    } else {
      _focusNode.unfocus();
      if (_activeQuery.isNotEmpty) _clearSearch();
    }
    if (mounted) setState(() {});
  }

  void _onScroll() {
    if (_selectedFilter == SearchFilter.all) return;
    if (_isLoading || _isLoadingMore) return;
    if (_searchResults.continuation == null || _searchResults.continuation!.isEmpty) return;

    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 400) {
      _loadMore();
    }
  }

  Future<void> _loadMore() async {
    if (_isLoadingMore) return;
    setState(() => _isLoadingMore = true);
    final updated = await _dataService.loadMore(
      currentResult: _searchResults,
      filter: _selectedFilter,
    );
    if (mounted) {
      setState(() {
        _searchResults = updated;
        _isLoadingMore = false;
      });
    }
  }

  void _onTextChanged() {
    final query = _textCtrl.text.trim();
    if (query == _activeQuery) return;
    _activeQuery = query;

    _debounceTimer?.cancel();
    if (query.isEmpty) {
      setState(() {
        _liveSuggestions = [];
        _searchResults = SearchResult(
          originalQuery: '',
          intent: const SearchIntent(originalQuery: '', normalizedQuery: '', entityText: ''),
        );
        _isLoading = false;
      });
      return;
    }

    final id = ++_searchRequestId;

    // 1. Instant local Trie suggestions (0ms)
    final localSuggestions = _dataService.getInstantLocalSuggestions(query);
    setState(() {
      _liveSuggestions = localSuggestions;
      _isLoading = true;
    });

    // 2. Fetch merged online suggestions
    _dataService.getSuggestions(query).then((suggestions) {
      if (mounted && id == _searchRequestId) {
        setState(() => _liveSuggestions = suggestions);
      }
    });

    // 3. Debounced deep search (250ms target)
    _debounceTimer = Timer(const Duration(milliseconds: 250), () {
      _executeSearch(query, id, filter: _selectedFilter);
    });
  }

  Future<void> _executeSearch(String query, int id, {SearchFilter filter = SearchFilter.all}) async {
    final results = await _dataService.search(query: query, filter: filter);
    if (mounted && id == _searchRequestId) {
      setState(() {
        _searchResults = results;
        _isLoading = false;
      });
    }
  }

  void _submitSearch(String query, {SearchFilter filter = SearchFilter.all}) {
    if (query.trim().isEmpty) return;
    _focusNode.unfocus();
    _textCtrl.text = query;
    _activeQuery = query;
    _dataService.addRecent(query);
    final id = ++_searchRequestId;
    setState(() {
      _isLoading = true;
      _liveSuggestions = [];
      _selectedFilter = filter;
    });
    _executeSearch(query, id, filter: filter);
  }

  void _onFilterSelected(SearchFilter filter) {
    if (_selectedFilter == filter) return;
    HapticFeedback.selectionClick();
    setState(() {
      _selectedFilter = filter;
      _isLoading = true;
    });
    final id = ++_searchRequestId;
    _executeSearch(_activeQuery, id, filter: filter);
  }

  void _clearSearch() {
    _textCtrl.clear();
    _activeQuery = '';
    setState(() {
      _liveSuggestions = [];
      _searchResults = SearchResult(
        originalQuery: '',
        intent: const SearchIntent(originalQuery: '', normalizedQuery: '', entityText: ''),
      );
      _isLoading = false;
      _selectedFilter = SearchFilter.all;
    });
  }

  void _cancelSearch() {
    _focusNode.unfocus();
    _clearSearch();
    SearchNav.phase.value = SearchPhase.bar;
  }

  void _playSong(List<Track> list, int index) {
    if (list.isEmpty) return;
    final startIdx = index.clamp(0, list.length - 1);
    final ctx = PlaybackContext(
      type: PlaybackContextType.search,
      id: _textCtrl.text.trim().isNotEmpty ? _textCtrl.text.trim() : 'search',
      tracks: list,
      startTrack: list[startIdx],
      title: _textCtrl.text.trim(),
    );
    context.read<PlayerState>().setQueue(list, startIndex: startIdx, context: ctx);
  }

  @override
  void dispose() {
    SearchNav.phase.removeListener(_onPhase);
    _focusNode.removeListener(_onFocusChanged);
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    _debounceTimer?.cancel();
    _textCtrl.removeListener(_onTextChanged);
    _textCtrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final topInset = MediaQuery.paddingOf(context).top;
    final hasQuery = _activeQuery.isNotEmpty;
    final typing = SearchNav.phase.value == SearchPhase.typing;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (_focusNode.hasFocus) {
          _focusNode.unfocus();
        } else if (_activeQuery.isNotEmpty) {
          _clearSearch();
        } else if (SearchNav.phase.value == SearchPhase.typing) {
          SearchNav.phase.value = SearchPhase.bar;
        } else {
          widget.onBack?.call();
        }
      },
      child: Scaffold(
        backgroundColor: Zen.bg,
        body: Stack(
          children: [
            CustomScrollView(
              controller: _scrollController,
              key: const PageStorageKey<String>('search_scroll_view'),
              physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
              slivers: [
                SliverToBoxAdapter(child: SizedBox(height: topInset + 56)),

                // Body based on state: Suggestions, Results, or Landing
                if (hasQuery && _liveSuggestions.isNotEmpty && _searchResults.isEmpty && _isLoading)
                  _buildSuggestionsSliver()
                else if (hasQuery)
                  _buildResultsSliver()
                else
                  _buildLandingSliver(),

                // Clearance for mini player & floating bottom dock
                SliverToBoxAdapter(
                  child: SizedBox(height: 180 + MediaQuery.paddingOf(context).bottom),
                ),
              ],
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: DynamicIslandHeader(
                title: 'Search',
                showBack: typing,
                isDockPage: !typing,
                onBack: () {
                  _cancelSearch();
                  SearchNav.phase.value = SearchPhase.bar;
                },
                showProfile: true,
                topPadding: topInset + 4,
                centerWidget: typing ? _topField() : null,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _topField() {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 380),
      curve: Curves.easeOutCubic,
      builder: (_, v, child) => Opacity(
        opacity: v,
        child: Transform.translate(offset: Offset(0, (1 - v) * 40), child: child),
      ),
      child: Row(
        children: [
          const Icon(CupertinoIcons.search, size: 16, color: Colors.white70),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: _textCtrl,
              focusNode: _focusNode,
              textInputAction: TextInputAction.search,
              onSubmitted: (q) => _submitSearch(q, filter: _selectedFilter),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
              cursorColor: AppColors.crimson,
              decoration: const InputDecoration(
                hintText: 'Search songs, artists, albums...',
                hintStyle: TextStyle(color: Colors.white38, fontSize: 13),
                border: InputBorder.none,
                isDense: true,
              ),
            ),
          ),
          if (_textCtrl.text.isNotEmpty)
            GestureDetector(
              onTap: _clearSearch,
              child: const Padding(
                padding: EdgeInsets.only(left: 4),
                child: Icon(
                  CupertinoIcons.clear_circled_solid,
                  size: 16,
                  color: Colors.white38,
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // State 1: Search Landing (Query is Empty)
  // ---------------------------------------------------------------------------
  Widget _buildLandingSliver() {
    final catalog = CatalogDataSource.allTracks;
    final popularArtists = _extractPopularArtists(catalog);
    final popularAlbums = _extractPopularAlbums(catalog);

    return SliverToBoxAdapter(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 12),

          // A. Recent Searches
          ValueListenableBuilder<List<String>>(
            valueListenable: _dataService.recentsNotifier,
            builder: (context, recents, _) {
              if (recents.isEmpty) return const SizedBox.shrink();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Recent Searches',
                          style: TextStyle(
                            color: AppColors.textPrimary,
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        PressableScale(
                          onTap: () {
                            HapticFeedback.lightImpact();
                            _dataService.clearRecents();
                          },
                          child: const Text(
                            'Clear',
                            style: TextStyle(
                              color: AppColors.accent,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  for (final item in recents.take(5)) ...[
                    Builder(
                      builder: (context) {
                        final matchedArtist = popularArtists.firstWhere(
                          (a) => a['name']?.toLowerCase() == item.toLowerCase(),
                          orElse: () => const {},
                        );
                        final hasArtistPhoto = matchedArtist.isNotEmpty &&
                            matchedArtist['photo'] != null &&
                            matchedArtist['photo']!.isNotEmpty;

                        return InkWell(
                          onTap: () {
                            HapticFeedback.selectionClick();
                            _submitSearch(item);
                          },
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            child: Row(
                              children: [
                                if (hasArtistPhoto) ...[
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(16),
                                    child: CachedNetworkImage(
                                      imageUrl: matchedArtist['photo']!,
                                      width: 32,
                                      height: 32,
                                      fit: BoxFit.cover,
                                      placeholder: (_, url) => Container(color: AppColors.surface2),
                                      errorWidget: (_, url, error) => const Icon(
                                        Icons.history_rounded,
                                        size: 20,
                                        color: AppColors.textTertiary,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                ] else ...[
                                  const Icon(
                                    Icons.history_rounded,
                                    size: 20,
                                    color: AppColors.textTertiary,
                                  ),
                                  const SizedBox(width: 12),
                                ],
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item,
                                        style: const TextStyle(
                                          color: AppColors.textPrimary,
                                          fontSize: 15,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                      if (hasArtistPhoto) ...[
                                        const SizedBox(height: 1),
                                        const Text(
                                          'Artist',
                                          style: TextStyle(
                                            color: AppColors.textTertiary,
                                            fontSize: 12,
                                            fontWeight: FontWeight.w400,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                                IconButton(
                                  icon: const Icon(
                                    Icons.close_rounded,
                                    size: 18,
                                    color: AppColors.textTertiary,
                                  ),
                                  onPressed: () => _dataService.removeRecent(item),
                                  splashRadius: 18,
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                  const SizedBox(height: 20),
                ],
              );
            },
          ),

          // B. Trending Searches Pills
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Trending Searches',
              style: TextStyle(
                color: AppColors.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                for (final pill in _kTrendingPills)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: PressableScale(
                      onTap: () {
                        HapticFeedback.lightImpact();
                        _submitSearch(pill);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: const Color(0x18FFFFFF),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.08),
                            width: 0.5,
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.trending_up_rounded, size: 14, color: AppColors.accent),
                            const SizedBox(width: 6),
                            Text(
                              pill,
                              style: const TextStyle(
                                color: AppColors.textPrimary,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
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

          const SizedBox(height: 28),

          // C. Browse Categories Grid
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Browse Categories',
              style: TextStyle(
                color: AppColors.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 2.1,
              ),
              itemCount: _kSearchCategories.length,
              itemBuilder: (context, i) {
                final cat = _kSearchCategories[i];
                return PressableScale(
                  onTap: () {
                    HapticFeedback.lightImpact();
                    _submitSearch(cat.query);
                  },
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: cat.gradient,
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(14),
                      boxShadow: [
                        BoxShadow(
                          color: cat.gradient.first.withValues(alpha: 0.3),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            cat.title,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        Icon(cat.icon, color: Colors.white70, size: 24),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 28),

          // D. Popular Artists Shelf (170x170 circle)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Popular Artists',
              style: TextStyle(
                color: AppColors.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 260,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: popularArtists.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, i) {
                final a = popularArtists[i];
                final name = a['name'] ?? 'Artist';
                final photo = a['photo'];
                return MediaCard(
                  title: name,
                  subtitle: 'Artist',
                  imageUrl: (photo != null && photo.isNotEmpty)
                      ? MediaNormalizer.upgradeArtworkUrl(photo)
                      : null,
                  isCircular: true,
                  width: 170,
                  twoLineTitle: true,
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
                );
              },
            ),
          ),

          const SizedBox(height: 24),

          // E. Popular Albums Shelf (170x170 rounded 8)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Trending Albums',
              style: TextStyle(
                color: AppColors.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 260,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: popularAlbums.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, i) {
                final alb = popularAlbums[i];
                final title = alb['title'] ?? 'Album';
                final artist = alb['artist'] ?? 'Artist';
                final cover = alb['cover'];
                return MediaCard(
                  title: title,
                  subtitle: artist,
                  imageUrl: (cover != null && cover.isNotEmpty) ? cover : null,
                  width: 170,
                  twoLineTitle: true,
                  onTap: () {
                    HapticFeedback.lightImpact();
                    Navigator.push(
                      context,
                      CupertinoPageRoute(
                        builder: (_) => AlbumScreen(
                          albumTitle: title,
                          artistName: artist,
                          coverUrl: cover,
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // State 2: Live Search Suggestions (While Typing)
  // ---------------------------------------------------------------------------
  Widget _buildSuggestionsSliver() {
    return SliverList(
      delegate: SliverChildBuilderDelegate(
        (context, index) {
          final item = _liveSuggestions[index];
          return InkWell(
            onTap: () => _submitSearch(item, filter: _selectedFilter),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
              child: Row(
                children: [
                  const Icon(CupertinoIcons.search, size: 17, color: AppColors.textTertiary),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      item,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  const Icon(Icons.north_west_rounded, size: 16, color: AppColors.textTertiary),
                ],
              ),
            ),
          );
        },
        childCount: _liveSuggestions.length,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // State 3: Search Results Page
  // ---------------------------------------------------------------------------
  Widget _buildResultsSliver() {
    if (_isLoading && _searchResults.isEmpty) {
      return SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
          child: Column(
            children: [
              _buildShimmerHeroCard(),
              const SizedBox(height: 20),
              _buildShimmerList(),
            ],
          ),
        ),
      );
    }

    if (!_isLoading && _searchResults.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(CupertinoIcons.search, size: 48, color: Colors.white.withValues(alpha: 0.2)),
              const SizedBox(height: 14),
              Text(
                'No results for "$_activeQuery"',
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Check the spelling or try a different keyword.',
                style: TextStyle(
                  color: AppColors.textSecondary,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return SliverToBoxAdapter(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 8),

          // 1. Horizontal Category Filter Chips Bar
          _buildFilterTabs(),

          // 2. "Did You Mean" pill
          if (_searchResults.correctedQuery != null) ...[
            const SizedBox(height: 10),
            _buildDidYouMeanPill(_searchResults.correctedQuery!),
          ],

          const SizedBox(height: 14),

          // 3. Render Results based on active filter & layout mode
          if (_selectedFilter == SearchFilter.all) ...[
            ..._buildDynamicOverviewSections(),
          ] else if (_selectedFilter == SearchFilter.songs) ...[
            _buildFullSongsList(_searchResults.songs),
          ] else if (_selectedFilter == SearchFilter.artists) ...[
            _buildFullArtistsList(_searchResults.artists),
          ] else if (_selectedFilter == SearchFilter.albums) ...[
            _buildFullAlbumsList(_searchResults.albums),
          ] else if (_selectedFilter == SearchFilter.featuredPlaylists ||
              _selectedFilter == SearchFilter.communityPlaylists) ...[
            _buildFullPlaylistsList(_searchResults.playlists),
          ] else if (_selectedFilter == SearchFilter.videos) ...[
            _buildFullVideosList(_searchResults.videos),
          ],

          if (_isLoadingMore)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CupertinoActivityIndicator(radius: 12)),
            ),

          SizedBox(height: 180 + MediaQuery.paddingOf(context).bottom),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Category Filter Bar Chips
  // ---------------------------------------------------------------------------
  Widget _buildFilterTabs() {
    final filters = [
      SearchFilter.all,
      SearchFilter.songs,
      SearchFilter.artists,
      SearchFilter.albums,
      SearchFilter.featuredPlaylists,
      SearchFilter.videos,
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          for (final f in filters)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: PressableScale(
                onTap: () => _onFilterSelected(f),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    color: _selectedFilter == f
                        ? AppColors.accent
                        : const Color(0x1FFFFFFF),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Text(
                    f.label,
                    style: TextStyle(
                      color: _selectedFilter == f ? Colors.white : AppColors.textSecondary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // "Did You Mean" Correction Pill
  // ---------------------------------------------------------------------------
  Widget _buildDidYouMeanPill(String corrected) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0x18FFFFFF),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: Row(
          children: [
            const Icon(Icons.spellcheck_rounded, color: AppColors.accent, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: RichText(
                text: TextSpan(
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                  children: [
                    const TextSpan(text: 'Showing results for '),
                    TextSpan(
                      text: corrected,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const TextSpan(text: '. Search instead for '),
                    WidgetSpan(
                      child: GestureDetector(
                        onTap: () => _submitSearch(_activeQuery, filter: _selectedFilter),
                        child: Text(
                          _activeQuery,
                          style: const TextStyle(
                            color: AppColors.accent,
                            fontWeight: FontWeight.bold,
                            decoration: TextDecoration.underline,
                          ),
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

  // ---------------------------------------------------------------------------
  // Dynamic Overview Sections Driven by Search Intent Layout Mode
  // ---------------------------------------------------------------------------
  List<Widget> _buildDynamicOverviewSections() {
    final widgets = <Widget>[];
    final mode = _searchResults.intent.layoutMode;

    // A. Top Result Hero Card
    if (_searchResults.topResult != null) {
      widgets.add(_buildTopResultSection(_searchResults.topResult!));
      widgets.add(const SizedBox(height: 20));
    }

    // Helper map of section builders
    Widget songsShelf() => _searchResults.songs.isNotEmpty
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildSectionHeader('Songs', onSeeAll: () => _onFilterSelected(SearchFilter.songs)),
              const SizedBox(height: 8),
              for (int i = 0; i < math.min(5, _searchResults.songs.length); i++)
                SongTile(
                  track: _searchResults.songs[i].toTrack(),
                  onTap: () => _playSong(_searchResults.songs.map((s) => s.toTrack()).toList(), i),
                ),
              const SizedBox(height: 24),
            ],
          )
        : const SizedBox.shrink();

    Widget artistsShelf() => _searchResults.artists.isNotEmpty
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildSectionHeader('Artists', onSeeAll: () => _onFilterSelected(SearchFilter.artists)),
              const SizedBox(height: 10),
              _buildArtistsHorizontalShelf(_searchResults.artists),
              const SizedBox(height: 24),
            ],
          )
        : const SizedBox.shrink();

    Widget albumsShelf() => _searchResults.albums.isNotEmpty
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildSectionHeader('Albums', onSeeAll: () => _onFilterSelected(SearchFilter.albums)),
              const SizedBox(height: 10),
              _buildAlbumsHorizontalShelf(_searchResults.albums),
              const SizedBox(height: 24),
            ],
          )
        : const SizedBox.shrink();

    Widget playlistsShelf() => _searchResults.playlists.isNotEmpty
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildSectionHeader('Playlists', onSeeAll: () => _onFilterSelected(SearchFilter.featuredPlaylists)),
              const SizedBox(height: 10),
              _buildPlaylistsHorizontalShelf(_searchResults.playlists),
              const SizedBox(height: 24),
            ],
          )
        : const SizedBox.shrink();

    Widget videosShelf() => _searchResults.videos.isNotEmpty
        ? Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildSectionHeader('Videos', onSeeAll: () => _onFilterSelected(SearchFilter.videos)),
              const SizedBox(height: 10),
              _buildVideosHorizontalShelf(_searchResults.videos),
              const SizedBox(height: 24),
            ],
          )
        : const SizedBox.shrink();

    // Section ordering based on acceptance rules & layout mode:
    switch (mode) {
      case SearchLayoutMode.exactArtist:
        // Artist Hero leads -> Top songs by artist -> Albums -> Playlists -> Videos -> Other artists
        widgets.addAll([songsShelf(), albumsShelf(), playlistsShelf(), videosShelf(), artistsShelf()]);
        break;

      case SearchLayoutMode.artistType:
        if (_searchResults.intent.intentType == SearchItemType.song) {
          widgets.addAll([songsShelf(), albumsShelf(), playlistsShelf(), videosShelf(), artistsShelf()]);
        } else if (_searchResults.intent.intentType == SearchItemType.album) {
          widgets.addAll([albumsShelf(), songsShelf(), playlistsShelf(), videosShelf(), artistsShelf()]);
        } else if (_searchResults.intent.intentType == SearchItemType.playlist) {
          widgets.addAll([playlistsShelf(), songsShelf(), albumsShelf(), videosShelf(), artistsShelf()]);
        } else {
          widgets.addAll([songsShelf(), albumsShelf(), playlistsShelf(), videosShelf(), artistsShelf()]);
        }
        break;

      case SearchLayoutMode.songTitle:
        widgets.addAll([songsShelf(), artistsShelf(), albumsShelf(), playlistsShelf(), videosShelf()]);
        break;

      case SearchLayoutMode.albumOrPlaylist:
        widgets.addAll([albumsShelf(), playlistsShelf(), songsShelf(), artistsShelf(), videosShelf()]);
        break;

      case SearchLayoutMode.generic:
        widgets.addAll([songsShelf(), artistsShelf(), albumsShelf(), playlistsShelf(), videosShelf()]);
        break;
    }

    return widgets;
  }

  Widget _buildSectionHeader(String title, {required VoidCallback onSeeAll}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 19,
              fontWeight: FontWeight.w800,
            ),
          ),
          PressableScale(
            onTap: onSeeAll,
            child: const Text(
              'See All',
              style: TextStyle(
                color: AppColors.accent,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Top Result Card (120x120 artwork, 20sp bold title, 14sp subtitle, Play/Radio)
  // ---------------------------------------------------------------------------
  Widget _buildTopResultSection(SearchTopResult top) {
    final item = top.item;
    final isArtist = item.type == SearchItemType.artist;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Top Result',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 19,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),
          PressableScale(
            onTap: () => _handleItemTap(item),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0x18FFFFFF),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08), width: 0.5),
              ),
              child: Row(
                children: [
                  // 120x120 Hi-Res Artwork (Circle for Artist, rounded 12 for others)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(isArtist ? 60 : 12),
                    child: SizedBox(
                      width: 120,
                      height: 120,
                      child: top.imageUrl.isNotEmpty && top.imageUrl.startsWith('http')
                          ? CachedNetworkImage(
                              imageUrl: top.imageUrl,
                              fit: BoxFit.cover,
                              memCacheWidth: 240,
                              placeholder: (_, url) => Container(color: AppColors.surface2),
                              errorWidget: (_, url, error) => MonogramAvatar(
                                name: top.title,
                                size: 120,
                                isCircle: isArtist,
                              ),
                            )
                          : MonogramAvatar(
                              name: top.title,
                              size: 120,
                              isCircle: isArtist,
                            ),
                    ),
                  ),
                  const SizedBox(width: 16),

                  // Metadata text: Title (20sp bold) & Subtitle (14sp 2 lines)
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          top.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.3,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          top.subtitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.75),
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            height: 1.25,
                          ),
                        ),
                        const SizedBox(height: 12),

                        // Action Buttons: Play + Radio
                        Row(
                          children: [
                            GestureDetector(
                              onTap: () {
                                HapticFeedback.lightImpact();
                                _handleItemTap(item);
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                                decoration: BoxDecoration(
                                  color: AppColors.accent,
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.play_arrow_rounded, color: Colors.white, size: 18),
                                    SizedBox(width: 4),
                                    Text(
                                      'PLAY',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold,
                                        letterSpacing: 0.5,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            if (top.radioPlaylistId != null) ...[
                              const SizedBox(width: 8),
                              GestureDetector(
                                onTap: () {
                                  HapticFeedback.lightImpact();
                                  _startRadio(top.radioPlaylistId!);
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.12),
                                    borderRadius: BorderRadius.circular(16),
                                  ),
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.radio_rounded, color: Colors.white, size: 16),
                                      SizedBox(width: 4),
                                      Text(
                                        'RADIO',
                                        style: TextStyle(
                                          color: Colors.white,
                                          fontSize: 11,
                                          fontWeight: FontWeight.bold,
                                          letterSpacing: 0.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Horizontal Shelf Builders (Albums, Artists, Playlists, Videos)
  // ---------------------------------------------------------------------------
  Widget _buildArtistsHorizontalShelf(List<SearchArtistItem> artists) {
    return SizedBox(
      height: 260,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: artists.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, i) {
          final a = artists[i];
          return MediaCard(
            title: a.name,
            subtitle: a.subscriberText ?? 'Artist',
            imageUrl: a.thumbnailUrlHiRes.isNotEmpty ? a.thumbnailUrlHiRes : a.thumbnailUrl,
            isCircular: true,
            width: 170,
            twoLineTitle: true,
            onTap: () {
              HapticFeedback.lightImpact();
              Navigator.push(
                context,
                CupertinoPageRoute(
                  builder: (_) => ArtistScreen(
                    artistName: a.name,
                    imageUrl: a.thumbnailUrlHiRes,
                    browseId: a.browseId,
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildAlbumsHorizontalShelf(List<SearchAlbumItem> albums) {
    return SizedBox(
      height: 260,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: albums.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, i) {
          final alb = albums[i];
          return MediaCard(
            title: alb.title,
            subtitle: alb.subtitle,
            imageUrl: alb.thumbnailUrlHiRes.isNotEmpty ? alb.thumbnailUrlHiRes : alb.thumbnailUrl,
            width: 170,
            twoLineTitle: true,
            onTap: () {
              HapticFeedback.lightImpact();
              Navigator.push(
                context,
                CupertinoPageRoute(
                  builder: (_) => AlbumScreen(
                    albumTitle: alb.title,
                    artistName: alb.subtitle,
                    coverUrl: alb.thumbnailUrlHiRes,
                    browseId: alb.browseId,
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildPlaylistsHorizontalShelf(List<SearchPlaylistItem> playlists) {
    return SizedBox(
      height: 260,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: playlists.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, i) {
          final pl = playlists[i];
          return MediaCard(
            title: pl.title,
            subtitle: pl.subtitle,
            imageUrl: pl.thumbnailUrlHiRes.isNotEmpty ? pl.thumbnailUrlHiRes : pl.thumbnailUrl,
            width: 170,
            twoLineTitle: true,
            onTap: () {
              HapticFeedback.lightImpact();
              Navigator.push(
                context,
                CupertinoPageRoute(
                  builder: (_) => AlbumScreen(
                    albumTitle: pl.title,
                    artistName: pl.author ?? 'Playlist',
                    coverUrl: pl.thumbnailUrlHiRes,
                    browseId: pl.browseId,
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildVideosHorizontalShelf(List<SearchVideoItem> videos) {
    return SizedBox(
      height: 195,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: videos.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, i) {
          final v = videos[i];
          return PressableScale(
            onTap: () => _handleItemTap(v),
            child: SizedBox(
              width: 180,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: AspectRatio(
                      aspectRatio: 16 / 9,
                      child: CachedNetworkImage(
                        imageUrl: v.thumbnailUrlHiRes.isNotEmpty ? v.thumbnailUrlHiRes : v.thumbnailUrl,
                        fit: BoxFit.cover,
                        memCacheWidth: 360,
                        placeholder: (_, url) => Container(color: AppColors.surface2),
                        errorWidget: (_, url, error) => Container(color: AppColors.surface2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    v.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    v.subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Full-width Filtered Views (Infinite Scrollable)
  // ---------------------------------------------------------------------------
  Widget _buildFullSongsList(List<SearchSongItem> songs) {
    final trackList = songs.map((s) => s.toTrack()).toList();
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: songs.length,
      itemBuilder: (context, i) {
        return SongTile(
          track: trackList[i],
          index: i + 1,
          onTap: () => _playSong(trackList, i),
        );
      },
    );
  }

  Widget _buildFullArtistsList(List<SearchArtistItem> artists) {
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: artists.length,
      itemBuilder: (context, i) {
        final a = artists[i];
        return PressableScale(
          onTap: () => _handleItemTap(a),
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 6),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0x0CFFFFFF),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(25),
                  child: a.thumbnailUrl.isNotEmpty
                      ? CachedNetworkImage(
                          imageUrl: a.thumbnailUrl,
                          width: 50,
                          height: 50,
                          fit: BoxFit.cover,
                          placeholder: (_, url) => Container(color: AppColors.surface2),
                          errorWidget: (_, url, error) => MonogramAvatar(name: a.name, size: 50, isCircle: true),
                        )
                      : MonogramAvatar(name: a.name, size: 50, isCircle: true),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        a.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        a.subscriberText ?? 'Artist',
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
                const Icon(CupertinoIcons.chevron_forward, color: AppColors.textTertiary, size: 16),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildFullAlbumsList(List<SearchAlbumItem> albums) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 14,
          crossAxisSpacing: 14,
          childAspectRatio: 0.68,
        ),
        itemCount: albums.length,
        itemBuilder: (context, i) {
          final alb = albums[i];
          return MediaCard(
            title: alb.title,
            subtitle: alb.subtitle,
            imageUrl: alb.thumbnailUrlHiRes.isNotEmpty ? alb.thumbnailUrlHiRes : alb.thumbnailUrl,
            width: 170,
            twoLineTitle: true,
            onTap: () => _handleItemTap(alb),
          );
        },
      ),
    );
  }

  Widget _buildFullPlaylistsList(List<SearchPlaylistItem> playlists) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 14,
          crossAxisSpacing: 14,
          childAspectRatio: 0.68,
        ),
        itemCount: playlists.length,
        itemBuilder: (context, i) {
          final pl = playlists[i];
          return MediaCard(
            title: pl.title,
            subtitle: pl.subtitle,
            imageUrl: pl.thumbnailUrlHiRes.isNotEmpty ? pl.thumbnailUrlHiRes : pl.thumbnailUrl,
            width: 170,
            twoLineTitle: true,
            onTap: () => _handleItemTap(pl),
          );
        },
      ),
    );
  }

  Widget _buildFullVideosList(List<SearchVideoItem> videos) {
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: videos.length,
      itemBuilder: (context, i) {
        final v = videos[i];
        return Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: PressableScale(
            onTap: () => _handleItemTap(v),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: SizedBox(
                    width: 140,
                    height: 80,
                    child: CachedNetworkImage(
                      imageUrl: v.thumbnailUrlHiRes.isNotEmpty ? v.thumbnailUrlHiRes : v.thumbnailUrl,
                      fit: BoxFit.cover,
                      placeholder: (_, url) => Container(color: AppColors.surface2),
                      errorWidget: (_, url, error) => Container(color: AppColors.surface2),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        v.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.textPrimary,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        v.subtitle,
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
              ],
            ),
          ),
        );
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Navigation & Playback Handlers
  // ---------------------------------------------------------------------------
  void _handleItemTap(SearchItem item) {
    HapticFeedback.lightImpact();
    if (item is SearchArtistItem) {
      Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) => ArtistScreen(
            artistName: item.name,
            imageUrl: item.thumbnailUrlHiRes,
            browseId: item.browseId,
          ),
        ),
      );
    } else if (item is SearchAlbumItem) {
      Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) => AlbumScreen(
            albumTitle: item.title,
            artistName: item.subtitle,
            coverUrl: item.thumbnailUrlHiRes,
            browseId: item.browseId,
          ),
        ),
      );
    } else if (item is SearchPlaylistItem) {
      Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) => AlbumScreen(
            albumTitle: item.title,
            artistName: item.author ?? 'Playlist',
            coverUrl: item.thumbnailUrlHiRes,
            browseId: item.browseId,
          ),
        ),
      );
    } else if (item is SearchSongItem) {
      final t = item.toTrack();
      _playSong([t], 0);
    } else if (item is SearchVideoItem) {
      final t = Track(
        id: item.videoId != null ? 'yt-${item.videoId}' : item.id,
        title: item.title,
        artist: item.channel ?? 'YouTube',
        album: 'Video',
        coverUrl: item.thumbnailUrlHiRes,
        durationSeconds: 210,
        source: 'youtube',
      );
      _playSong([t], 0);
    }
  }

  void _startRadio(String playlistId) {
    if (_searchResults.songs.isNotEmpty) {
      _playSong(_searchResults.songs.map((s) => s.toTrack()).toList(), 0);
    }
  }

  // ---------------------------------------------------------------------------
  // Shimmer Skeletons with Text Placeholders
  // ---------------------------------------------------------------------------
  Widget _buildShimmerHeroCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0x10FFFFFF),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: double.infinity,
                  height: 20,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  width: 140,
                  height: 14,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  width: 80,
                  height: 28,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildShimmerList() {
    return Column(
      children: List.generate(
        4,
        (i) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: double.infinity,
                      height: 15,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      width: 160,
                      height: 12,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(4),
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
  }

  // ---------------------------------------------------------------------------
  // Catalog extraction helpers for Landing State
  // ---------------------------------------------------------------------------
  List<Map<String, String>> _extractPopularArtists(List<Track> catalog) {
    final map = <String, Map<String, String>>{};
    for (final t in catalog) {
      if (t.artist.isNotEmpty && !map.containsKey(t.artist.toLowerCase())) {
        map[t.artist.toLowerCase()] = {
          'name': t.artist,
          'photo': t.coverUrl,
        };
      }
    }
    return map.values.take(8).toList();
  }

  List<Map<String, String>> _extractPopularAlbums(List<Track> catalog) {
    final map = <String, Map<String, String>>{};
    for (final t in catalog) {
      if (t.album.isNotEmpty &&
          t.album != 'Single' &&
          !map.containsKey(t.album.toLowerCase())) {
        map[t.album.toLowerCase()] = {
          'title': t.album,
          'artist': t.artist,
          'cover': t.coverUrl,
        };
      }
    }
    return map.values.take(8).toList();
  }
}
