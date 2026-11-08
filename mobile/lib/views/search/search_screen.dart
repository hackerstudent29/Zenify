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
import '../../design_system/widgets/media_card.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/song_tile.dart';
import '../../design_system/zen.dart';
import '../../models/track.dart';
import '../../services/player_state.dart';
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

const List<Map<String, String>> _kDefaultPopularArtists = [
  {
    'name': 'Anirudh Ravichander',
    'photo': 'https://lh3.googleusercontent.com/s/v4/g',
  },
  {
    'name': 'A. R. Rahman',
    'photo': 'https://lh3.googleusercontent.com/s/v4/g',
  },
  {
    'name': 'Taylor Swift',
    'photo': 'https://lh3.googleusercontent.com/s/v4/g',
  },
  {
    'name': 'The Weeknd',
    'photo': 'https://lh3.googleusercontent.com/s/v4/g',
  },
  {
    'name': 'Sid Sriram',
    'photo': 'https://lh3.googleusercontent.com/s/v4/g',
  },
  {
    'name': 'Coldplay',
    'photo': 'https://lh3.googleusercontent.com/s/v4/g',
  },
  {
    'name': 'Billie Eilish',
    'photo': 'https://lh3.googleusercontent.com/s/v4/g',
  },
  {
    'name': 'Harris Jayaraj',
    'photo': 'https://lh3.googleusercontent.com/s/v4/g',
  },
];

const List<Map<String, String>> _kDefaultPopularAlbums = [
  {
    'title': 'Leo',
    'artist': 'Anirudh Ravichander',
    'cover': 'https://lh3.googleusercontent.com/s/v4/g',
  },
  {
    'title': 'Jailer',
    'artist': 'Anirudh Ravichander',
    'cover': 'https://lh3.googleusercontent.com/s/v4/g',
  },
  {
    'title': 'Starboy',
    'artist': 'The Weeknd',
    'cover': 'https://lh3.googleusercontent.com/s/v4/g',
  },
  {
    'title': '1989 (Taylor\'s Version)',
    'artist': 'Taylor Swift',
    'cover': 'https://lh3.googleusercontent.com/s/v4/g',
  },
  {
    'title': 'After Hours',
    'artist': 'The Weeknd',
    'cover': 'https://lh3.googleusercontent.com/s/v4/g',
  },
  {
    'title': 'Ponniyin Selvan Part-1',
    'artist': 'A. R. Rahman',
    'cover': 'https://lh3.googleusercontent.com/s/v4/g',
  },
];

enum _SearchCategoryFilter { all, songs, artists, albums, playlists }

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
  final SearchDataService _dataService = SearchDataService.instance;

  Timer? _debounceTimer;
  int _searchRequestId = 0;

  bool _isFocused = false;
  bool _isLoading = false;
  String _activeQuery = '';

  List<String> _liveSuggestions = [];
  SearchResultsGroup _searchResults = const SearchResultsGroup();
  _SearchCategoryFilter _selectedFilter = _SearchCategoryFilter.all;

  @override
  void initState() {
    super.initState();
    _dataService.initRecents();
    _focusNode.addListener(_onFocusChanged);
    _textCtrl.addListener(_onTextChanged);
  }

  void _onFocusChanged() {
    if (mounted) {
      setState(() => _isFocused = _focusNode.hasFocus);
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
        _searchResults = const SearchResultsGroup();
        _isLoading = false;
      });
      return;
    }

    final id = ++_searchRequestId;
    setState(() => _isLoading = true);

    // 1. Instant suggestions
    _dataService.getSuggestions(query).then((suggestions) {
      if (mounted && id == _searchRequestId) {
        setState(() => _liveSuggestions = suggestions);
      }
    });

    // 2. Debounced deep search (320ms)
    _debounceTimer = Timer(const Duration(milliseconds: 320), () {
      _executeSearch(query, id);
    });
  }

  Future<void> _executeSearch(String query, int id) async {
    final results = await _dataService.search(query);
    if (mounted && id == _searchRequestId) {
      setState(() {
        _searchResults = results;
        _isLoading = false;
      });
    }
  }

  void _submitSearch(String query) {
    if (query.trim().isEmpty) return;
    _focusNode.unfocus();
    _textCtrl.text = query;
    _activeQuery = query;
    _dataService.addRecent(query);
    final id = ++_searchRequestId;
    setState(() {
      _isLoading = true;
      _liveSuggestions = [];
    });
    _executeSearch(query, id);
  }

  void _clearSearch() {
    _textCtrl.clear();
    _activeQuery = '';
    setState(() {
      _liveSuggestions = [];
      _searchResults = const SearchResultsGroup();
      _isLoading = false;
    });
  }

  void _cancelSearch() {
    _focusNode.unfocus();
    _clearSearch();
  }

  void _playSong(List<Track> list, int index) {
    if (list.isEmpty) return;
    context.read<PlayerState>().setQueue(list, startIndex: index);
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _focusNode.removeListener(_onFocusChanged);
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

    return PopScope(
      canPop: _activeQuery.isEmpty && !_isFocused,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (_focusNode.hasFocus) {
          _focusNode.unfocus();
        } else if (_activeQuery.isNotEmpty) {
          _clearSearch();
        }
      },
      child: Scaffold(
        backgroundColor: Zen.bg,
        body: CustomScrollView(
          key: const PageStorageKey<String>('search_scroll_view'),
          physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
          slivers: [
            // 1. Pinned Apple Search Header
            SliverPersistentHeader(
              pinned: true,
              delegate: _SearchHeaderDelegate(
                top: topInset,
                controller: _textCtrl,
                focusNode: _focusNode,
                isFocused: _isFocused,
                onClear: _clearSearch,
                onCancel: _cancelSearch,
                onSubmit: _submitSearch,
              ),
            ),

            // 2. Body based on state: Suggestions, Results, or Landing
            if (hasQuery && _liveSuggestions.isNotEmpty && _searchResults.isEmpty && _isLoading)
              _buildSuggestionsSliver()
            else if (hasQuery)
              _buildResultsSliver()
            else
              _buildLandingSliver(),
          ],
        ),
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
                  for (final item in recents.take(5))
                    InkWell(
                      onTap: () => _submitSearch(item),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        child: Row(
                          children: [
                            const Icon(Icons.history_rounded, size: 18, color: AppColors.textTertiary),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                item,
                                style: const TextStyle(
                                  color: AppColors.textPrimary,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.close_rounded, size: 16, color: AppColors.textTertiary),
                              onPressed: () => _dataService.removeRecent(item),
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                            ),
                          ],
                        ),
                      ),
                    ),
                  const SizedBox(height: 16),
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
                      onTap: () => _submitSearch(pill),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: const Color(0x1FFFFFFF),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.08), width: 0.5),
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

          // C. Popular Artists
          if (popularArtists.isNotEmpty) ...[
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
            const SizedBox(height: 12),
            SizedBox(
              height: 145,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: popularArtists.length,
                itemBuilder: (context, i) {
                  final a = popularArtists[i];
                  final name = a['name'] ?? 'Artist';
                  final photo = a['photo'];
                  return Padding(
                    padding: const EdgeInsets.only(right: 14),
                    child: MediaCard(
                      title: name,
                      subtitle: 'Artist',
                      imageUrl: (photo != null && photo.isNotEmpty) ? photo : null,
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
                  );
                },
              ),
            ),
            const SizedBox(height: 28),
          ],

          // D. Popular Albums
          if (popularAlbums.isNotEmpty) ...[
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                'Popular Albums',
                style: TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 195,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: popularAlbums.length,
                itemBuilder: (context, i) {
                  final alb = popularAlbums[i];
                  final title = alb['title'] ?? 'Album';
                  final artist = alb['artist'] ?? 'Artist';
                  final cover = alb['cover'];
                  return Padding(
                    padding: const EdgeInsets.only(right: 14),
                    child: MediaCard(
                      title: title,
                      subtitle: artist,
                      imageUrl: (cover != null && cover.isNotEmpty) ? cover : null,
                      width: 130,
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
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 28),
          ],

          // E. Browse Categories Grid
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
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.5,
              ),
              itemCount: _kSearchCategories.length,
              itemBuilder: (context, i) {
                final cat = _kSearchCategories[i];
                return PressableScale(
                  onTap: () => _submitSearch(cat.query),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: cat.gradient,
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Stack(
                      children: [
                        Text(
                          cat.title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Icon(
                            cat.icon,
                            color: Colors.white.withValues(alpha: 0.7),
                            size: 28,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          // Bottom clearance
          const SizedBox(height: 140),
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
            onTap: () => _submitSearch(item),
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
      return const SliverFillRemaining(
        child: Center(
          child: CupertinoActivityIndicator(radius: 14),
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

          // 1. Horizontal Category Filter Bar
          _buildFilterTabs(),

          const SizedBox(height: 14),

          // 2. Render Results based on active filter
          if (_selectedFilter == _SearchCategoryFilter.all) ...[
            if (_searchResults.topResult != null) ...[
              _buildTopResultSection(_searchResults.topResult!),
              const SizedBox(height: 20),
            ],
            if (_searchResults.songs.isNotEmpty) ...[
              _buildSongsSection(_searchResults.songs.take(5).toList()),
              const SizedBox(height: 24),
            ],
            if (_searchResults.artists.isNotEmpty) ...[
              _buildArtistsSection(_searchResults.artists),
              const SizedBox(height: 24),
            ],
            if (_searchResults.albums.isNotEmpty) ...[
              _buildAlbumsSection(_searchResults.albums),
              const SizedBox(height: 24),
            ],
            if (_searchResults.playlists.isNotEmpty) ...[
              _buildPlaylistsSection(_searchResults.playlists),
              const SizedBox(height: 24),
            ],
          ] else if (_selectedFilter == _SearchCategoryFilter.songs) ...[
            _buildFullSongsList(_searchResults.songs),
          ] else if (_selectedFilter == _SearchCategoryFilter.artists) ...[
            _buildFullArtistsList(_searchResults.artists),
          ] else if (_selectedFilter == _SearchCategoryFilter.albums) ...[
            _buildFullAlbumsList(_searchResults.albums),
          ] else if (_selectedFilter == _SearchCategoryFilter.playlists) ...[
            _buildFullPlaylistsList(_searchResults.playlists),
          ],

          const SizedBox(height: 140),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Category Filter Bar
  // ---------------------------------------------------------------------------
  Widget _buildFilterTabs() {
    final filters = [
      {'id': _SearchCategoryFilter.all, 'label': 'All'},
      {'id': _SearchCategoryFilter.songs, 'label': 'Songs (${_searchResults.songs.length})'},
      {'id': _SearchCategoryFilter.artists, 'label': 'Artists (${_searchResults.artists.length})'},
      {'id': _SearchCategoryFilter.albums, 'label': 'Albums (${_searchResults.albums.length})'},
      {'id': _SearchCategoryFilter.playlists, 'label': 'Playlists (${_searchResults.playlists.length})'},
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
                onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _selectedFilter = f['id'] as _SearchCategoryFilter);
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: BoxDecoration(
                    color: _selectedFilter == f['id']
                        ? AppColors.accent
                        : const Color(0x1FFFFFFF),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: Text(
                    f['label'] as String,
                    style: TextStyle(
                      color: _selectedFilter == f['id'] ? Colors.white : AppColors.textSecondary,
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
  // Top Result Card
  // ---------------------------------------------------------------------------
  Widget _buildTopResultSection(SearchTopResult top) {
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
            onTap: () {
              HapticFeedback.lightImpact();
              if (top.type == TopResultType.artist && top.artist != null) {
                Navigator.push(
                  context,
                  CupertinoPageRoute(
                    builder: (_) => ArtistScreen(
                      artistName: top.artist!.name,
                      imageUrl: top.artist!.imageUrl,
                      browseId: top.artist!.browseId,
                    ),
                  ),
                );
              } else if (top.type == TopResultType.album && top.album != null) {
                Navigator.push(
                  context,
                  CupertinoPageRoute(
                    builder: (_) => AlbumScreen(
                      albumTitle: top.album!.title,
                      artistName: top.album!.artist,
                      coverUrl: top.album!.coverUrl,
                      browseId: top.album!.browseId,
                    ),
                  ),
                );
              } else if (top.track != null) {
                _playSong([top.track!], 0);
              } else if (_searchResults.songs.isNotEmpty) {
                _playSong(_searchResults.songs, 0);
              }
            },
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0x18FFFFFF),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08), width: 0.5),
              ),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(top.type == TopResultType.artist ? 35 : 12),
                    child: top.imageUrl != null
                        ? CachedNetworkImage(
                            imageUrl: top.imageUrl!,
                            width: 70,
                            height: 70,
                            fit: BoxFit.cover,
                            placeholder: (_, url) => Container(color: AppColors.surface2),
                            errorWidget: (_, url, error) => Container(color: AppColors.surface2),
                          )
                        : Container(
                            width: 70,
                            height: 70,
                            color: AppColors.surface2,
                            child: const Icon(Icons.music_note, color: Colors.white54),
                          ),
                  ),
                  const SizedBox(width: 16),
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
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          top.subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.7),
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    width: 44,
                    height: 44,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.accent,
                    ),
                    child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 28),
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
  // Songs Section & List
  // ---------------------------------------------------------------------------
  Widget _buildSongsSection(List<Track> songs) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Songs',
                style: TextStyle(color: AppColors.textPrimary, fontSize: 19, fontWeight: FontWeight.w800),
              ),
              if (_searchResults.songs.length > 5)
                PressableScale(
                  onTap: () => setState(() => _selectedFilter = _SearchCategoryFilter.songs),
                  child: const Text('See All', style: TextStyle(color: AppColors.accent, fontSize: 14, fontWeight: FontWeight.w600)),
                ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        for (int i = 0; i < songs.length; i++)
          SongTile(
            track: songs[i],
            onTap: () => _playSong(_searchResults.songs, i),
          ),
      ],
    );
  }

  Widget _buildFullSongsList(List<Track> songs) {
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: songs.length,
      itemBuilder: (context, i) {
        return SongTile(
          track: songs[i],
          index: i + 1,
          onTap: () => _playSong(songs, i),
        );
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Artists Section & List
  // ---------------------------------------------------------------------------
  Widget _buildArtistsSection(List<SearchArtist> artists) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            'Artists',
            style: TextStyle(color: AppColors.textPrimary, fontSize: 19, fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 135,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: artists.length,
            itemBuilder: (context, i) {
              final a = artists[i];
              return Padding(
                padding: const EdgeInsets.only(right: 14),
                child: MediaCard(
                  title: a.name,
                  subtitle: a.subscribers ?? 'Artist',
                  imageUrl: a.imageUrl,
                  isCircular: true,
                  width: 90,
                  onTap: () {
                    HapticFeedback.lightImpact();
                    Navigator.push(
                      context,
                      CupertinoPageRoute(
                        builder: (_) => ArtistScreen(
                          artistName: a.name,
                          imageUrl: a.imageUrl,
                          browseId: a.browseId,
                        ),
                      ),
                    );
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildFullArtistsList(List<SearchArtist> artists) {
    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      itemCount: artists.length,
      itemBuilder: (context, i) {
        final a = artists[i];
        return PressableScale(
          onTap: () {
            HapticFeedback.lightImpact();
            Navigator.push(
              context,
              CupertinoPageRoute(
                builder: (_) => ArtistScreen(
                  artistName: a.name,
                  imageUrl: a.imageUrl,
                  browseId: a.browseId,
                ),
              ),
            );
          },
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
                  child: a.imageUrl != null
                      ? CachedNetworkImage(
                          imageUrl: a.imageUrl!,
                          width: 50,
                          height: 50,
                          fit: BoxFit.cover,
                          placeholder: (_, url) => Container(color: AppColors.surface2),
                        )
                      : Container(width: 50, height: 50, color: AppColors.surface2),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        a.name,
                        style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700),
                      ),
                      if (a.subscribers != null)
                        Text(a.subscribers!, style: const TextStyle(color: AppColors.textTertiary, fontSize: 13)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: AppColors.textTertiary),
              ],
            ),
          ),
        );
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Albums Section & List
  // ---------------------------------------------------------------------------
  Widget _buildAlbumsSection(List<SearchAlbum> albums) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            'Albums',
            style: TextStyle(color: AppColors.textPrimary, fontSize: 19, fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 185,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: albums.length,
            itemBuilder: (context, i) {
              final alb = albums[i];
              return Padding(
                padding: const EdgeInsets.only(right: 14),
                child: MediaCard(
                  title: alb.title,
                  subtitle: alb.artist,
                  imageUrl: alb.coverUrl,
                  width: 130,
                  onTap: () {
                    HapticFeedback.lightImpact();
                    Navigator.push(
                      context,
                      CupertinoPageRoute(
                        builder: (_) => AlbumScreen(
                          albumTitle: alb.title,
                          artistName: alb.artist,
                          coverUrl: alb.coverUrl,
                          browseId: alb.browseId,
                        ),
                      ),
                    );
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildFullAlbumsList(List<SearchAlbum> albums) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 14,
          crossAxisSpacing: 14,
          childAspectRatio: 0.76,
        ),
        itemCount: albums.length,
        itemBuilder: (context, i) {
          final alb = albums[i];
          return MediaCard(
            title: alb.title,
            subtitle: alb.artist,
            imageUrl: alb.coverUrl,
            width: 160,
            onTap: () {
              HapticFeedback.lightImpact();
              Navigator.push(
                context,
                CupertinoPageRoute(
                  builder: (_) => AlbumScreen(
                    albumTitle: alb.title,
                    artistName: alb.artist,
                    coverUrl: alb.coverUrl,
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

  // ---------------------------------------------------------------------------
  // Playlists Section & List
  // ---------------------------------------------------------------------------
  Widget _buildPlaylistsSection(List<SearchPlaylist> playlists) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            'Playlists',
            style: TextStyle(color: AppColors.textPrimary, fontSize: 19, fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 185,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: playlists.length,
            itemBuilder: (context, i) {
              final pl = playlists[i];
              return Padding(
                padding: const EdgeInsets.only(right: 14),
                child: MediaCard(
                  title: pl.title,
                  subtitle: pl.curator ?? 'Playlist',
                  imageUrl: pl.coverUrl,
                  width: 130,
                  onTap: () {
                    HapticFeedback.lightImpact();
                    _submitSearch(pl.title);
                  },
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildFullPlaylistsList(List<SearchPlaylist> playlists) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 14,
          crossAxisSpacing: 14,
          childAspectRatio: 0.76,
        ),
        itemCount: playlists.length,
        itemBuilder: (context, i) {
          final pl = playlists[i];
          return MediaCard(
            title: pl.title,
            subtitle: pl.curator ?? 'Playlist',
            imageUrl: pl.coverUrl,
            width: 160,
            onTap: () => _submitSearch(pl.title),
          );
        },
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Data extraction helpers
  // ---------------------------------------------------------------------------
  List<Map<String, String>> _extractPopularArtists(List<Track> tracks) {
    final seen = <String>{};
    final out = <Map<String, String>>[];
    for (final t in tracks) {
      final name = t.artist.split(',').first.trim();
      if (name.isNotEmpty && seen.add(name.toLowerCase())) {
        out.add({'name': name, 'photo': t.coverUrl});
      }
      if (out.length >= 8) break;
    }
    if (out.length < 4) {
      for (final a in _kDefaultPopularArtists) {
        if (seen.add(a['name']!.toLowerCase())) {
          out.add(a);
        }
        if (out.length >= 8) break;
      }
    }
    return out;
  }

  List<Map<String, String>> _extractPopularAlbums(List<Track> tracks) {
    final seen = <String>{};
    final out = <Map<String, String>>[];
    for (final t in tracks) {
      if (t.album.isNotEmpty && t.album != 'Single' && seen.add(t.album.toLowerCase())) {
        out.add({'title': t.album, 'artist': t.artist, 'cover': t.coverUrl});
      }
      if (out.length >= 8) break;
    }
    if (out.length < 4) {
      for (final alb in _kDefaultPopularAlbums) {
        if (seen.add(alb['title']!.toLowerCase())) {
          out.add(alb);
        }
        if (out.length >= 8) break;
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------------ */
/*  Pinned Apple Music Search Bar Delegate                            */
/* ------------------------------------------------------------------ */

class _SearchHeaderDelegate extends SliverPersistentHeaderDelegate {
  _SearchHeaderDelegate({
    required this.top,
    required this.controller,
    required this.focusNode,
    required this.isFocused,
    required this.onClear,
    required this.onCancel,
    required this.onSubmit,
  });

  final double top;
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool isFocused;
  final VoidCallback onClear;
  final VoidCallback onCancel;
  final ValueChanged<String> onSubmit;

  @override
  double get minExtent => math.max(56.0, top + 56.0);
  @override
  double get maxExtent => math.max(56.0, top + 56.0);

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final hasText = controller.text.isNotEmpty;

    return Container(
      color: Zen.bg.withValues(alpha: 0.96),
      padding: EdgeInsets.fromLTRB(16, top + 6, 16, 8),
      child: Row(
        children: [
          // Cupertino-styled rounded search text box
          Expanded(
            child: Container(
              height: 42,
              decoration: BoxDecoration(
                color: const Color(0x1FFFFFFF),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isFocused
                      ? AppColors.accent.withValues(alpha: 0.6)
                      : Colors.white.withValues(alpha: 0.08),
                  width: 0.8,
                ),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Row(
                children: [
                  const Icon(CupertinoIcons.search, size: 18, color: AppColors.textTertiary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: controller,
                      focusNode: focusNode,
                      textInputAction: TextInputAction.search,
                      onSubmitted: onSubmit,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                      ),
                      cursorColor: AppColors.accent,
                      decoration: const InputDecoration(
                        hintText: 'Artists, Songs, Lyrics, and More',
                        hintStyle: TextStyle(
                          color: AppColors.textTertiary,
                          fontSize: 14,
                        ),
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.symmetric(vertical: 10),
                      ),
                    ),
                  ),
                  if (hasText)
                    GestureDetector(
                      onTap: onClear,
                      child: const Icon(
                        CupertinoIcons.clear_thick_circled,
                        size: 17,
                        color: AppColors.textTertiary,
                      ),
                    ),
                ],
              ),
            ),
          ),

          // Cancel button (slides in when focused)
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            width: isFocused ? 64 : 0,
            padding: const EdgeInsets.only(left: 10),
            child: isFocused
                ? GestureDetector(
                    onTap: onCancel,
                    child: const Text(
                      'Cancel',
                      maxLines: 1,
                      style: TextStyle(
                        color: AppColors.accent,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _SearchHeaderDelegate oldDelegate) =>
      oldDelegate.isFocused != isFocused ||
      oldDelegate.controller.text != controller.text ||
      oldDelegate.top != top;
}
