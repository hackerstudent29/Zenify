import 'dart:async';
import 'dart:ui';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/apple_glass.dart';
import '../../design_system/widgets/equalizer_bars.dart';
import '../../design_system/widgets/media_card.dart';
import '../../design_system/widgets/monogram_avatar.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/section_header.dart';
import '../../design_system/widgets/song_tile.dart';
import '../../design_system/widgets/spring_kit.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../services/search_nav.dart';
import '../details/album_screen.dart';
import '../details/artist_screen.dart';
import 'search_data_service.dart';
import 'search_models.dart';

// ── Typography Helpers (Strictly SF Pro Display / SF Pro, w500–w700) ─────────

TextStyle _displayStyle({
  double fontSize = 20,
  FontWeight fontWeight = FontWeight.w700,
  Color color = AppColors.textPrimary,
  double? letterSpacing,
  double? height,
}) {
  return TextStyle(
    fontFamily: 'SF Pro Display',
    fontSize: fontSize,
    fontWeight: fontWeight,
    color: color,
    letterSpacing: letterSpacing ?? -0.3,
    height: height,
  );
}

TextStyle _bodyStyle({
  double fontSize = 14,
  FontWeight fontWeight = FontWeight.w500,
  Color color = AppColors.textSecondary,
  double? letterSpacing,
  double? height,
}) {
  return TextStyle(
    fontFamily: 'SF Pro',
    fontSize: fontSize,
    fontWeight: fontWeight,
    color: color,
    letterSpacing: letterSpacing ?? -0.1,
    height: height,
  );
}

// ── Spring Curve Wrapper for Fluid Transitions ───────────────────────────────

class _SpringCurve extends Curve {
  const _SpringCurve([this.spring = Springs.smooth]);
  final SpringDescription spring;

  @override
  double transformInternal(double t) {
    if (t <= 0.0) return 0.0;
    if (t >= 1.0) return 1.0;
    final sim = SpringSimulation(spring, 0.0, 1.0, 0.0);
    return sim.x(t * 0.55).clamp(0.0, 1.06);
  }
}

// ── Horizontal Snap Scroll Physics (Matching HomeScreen & ExploreScreen) ─────

class _SearchSnapPhysics extends ScrollPhysics {
  const _SearchSnapPhysics({
    required this.itemExtent,
    super.parent,
  });

  final double itemExtent;

  @override
  _SearchSnapPhysics applyTo(ScrollPhysics? ancestor) {
    return _SearchSnapPhysics(
      itemExtent: itemExtent,
      parent: buildParent(ancestor),
    );
  }

  double _targetPixels(
    ScrollMetrics position,
    Tolerance tolerance,
    double velocity,
  ) {
    double page = position.pixels / itemExtent;
    if (velocity < -tolerance.velocity) {
      page -= 0.45;
    } else if (velocity > tolerance.velocity) {
      page += 0.45;
    }
    final target = page.roundToDouble() * itemExtent;
    return target.clamp(
      position.minScrollExtent,
      position.maxScrollExtent,
    );
  }

  @override
  Simulation? createBallisticSimulation(
    ScrollMetrics position,
    double velocity,
  ) {
    if ((velocity <= 0.0 && position.pixels <= position.minScrollExtent) ||
        (velocity >= 0.0 && position.pixels >= position.maxScrollExtent)) {
      return super.createBallisticSimulation(position, velocity);
    }
    final tolerance = toleranceFor(position);
    final target = _targetPixels(position, tolerance, velocity);
    if ((target - position.pixels).abs() < 0.5 && velocity.abs() < 50) {
      return null;
    }
    return ScrollSpringSimulation(
      Springs.snappy,
      position.pixels,
      target,
      velocity,
      tolerance: tolerance,
    );
  }

  @override
  bool get allowImplicitScrolling => false;
}

// ── Browse Category & Trending Specs ─────────────────────────────────────────

class _SearchCategorySpec {
  const _SearchCategorySpec({
    required this.title,
    required this.query,
    required this.colors,
    required this.icon,
  });

  final String title;
  final String query;
  final List<Color> colors;
  final IconData icon;
}

const List<_SearchCategorySpec> _kSearchCategories = [
  _SearchCategorySpec(
    title: 'Pop',
    query: 'Pop hits',
    colors: [Color(0xFFFA233B), Color(0xFFA61224)],
    icon: CupertinoIcons.music_note_2,
  ),
  _SearchCategorySpec(
    title: 'Hip-Hop',
    query: 'Hip-Hop rap hits',
    colors: [Color(0xFFD97706), Color(0xFF78350F)],
    icon: CupertinoIcons.headphones,
  ),
  _SearchCategorySpec(
    title: 'Tamil Hits',
    query: 'Anirudh Tamil hits',
    colors: [Color(0xFF0D9488), Color(0xFF115E59)],
    icon: CupertinoIcons.sparkles,
  ),
  _SearchCategorySpec(
    title: 'Romantic',
    query: 'Romantic love songs',
    colors: [Color(0xFFDB2777), Color(0xFF831843)],
    icon: CupertinoIcons.heart_fill,
  ),
  _SearchCategorySpec(
    title: 'Chill',
    query: 'Chill acoustic mix',
    colors: [Color(0xFF2563EB), Color(0xFF1E3A8A)],
    icon: CupertinoIcons.moon_stars_fill,
  ),
  _SearchCategorySpec(
    title: 'Workout',
    query: 'High energy workout music',
    colors: [Color(0xFFE11D48), Color(0xFF881337)],
    icon: CupertinoIcons.flame_fill,
  ),
  _SearchCategorySpec(
    title: 'Indie',
    query: 'Indie alternative',
    colors: [Color(0xFF7C3AED), Color(0xFF4C1D95)],
    icon: CupertinoIcons.guitars,
  ),
  _SearchCategorySpec(
    title: 'Lo-Fi Beats',
    query: 'Lo-fi chillhop beats',
    colors: [Color(0xFF4F46E5), Color(0xFF312E81)],
    icon: CupertinoIcons.waveform_path,
  ),
  _SearchCategorySpec(
    title: 'Electronic',
    query: 'Electronic dance hits',
    colors: [Color(0xFF0284C7), Color(0xFF0C4A6E)],
    icon: CupertinoIcons.bolt_fill,
  ),
  _SearchCategorySpec(
    title: '90s Retro',
    query: '90s classic hits',
    colors: [Color(0xFFB45309), Color(0xFF713F12)],
    icon: CupertinoIcons.music_albums_fill,
  ),
];

const List<String> _kTrendingPills = [
  'Anirudh Ravichander',
  'A.R. Rahman',
  'The Weeknd',
  'Arijit Singh',
  'Taylor Swift',
  'Ilaiyaraaja',
  'Billie Eilish',
  'Sid Sriram',
];

const List<({SearchFilter filter, String label})> _kResultFilters = [
  (filter: SearchFilter.all, label: 'All'),
  (filter: SearchFilter.songs, label: 'Songs'),
  (filter: SearchFilter.artists, label: 'Artists'),
  (filter: SearchFilter.albums, label: 'Albums'),
  (filter: SearchFilter.featuredPlaylists, label: 'Playlists'),
  (filter: SearchFilter.videos, label: 'Videos'),
];

enum _SearchViewPhase { landing, suggestions, loading, results }

// ═════════════════════════════════════════════════════════════════════════════
// SearchScreen
// ═════════════════════════════════════════════════════════════════════════════

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final TextEditingController _textCtrl = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  final ScrollController _scrollCtrl = ScrollController();
  final SearchDataService _dataService = SearchDataService.instance;

  Timer? _debounceTimer;
  int _searchRequestId = 0;

  bool _isLoading = false;
  bool _isLoadingMore = false;
  String _activeQuery = '';

  List<String> _liveSuggestions = [];
  SearchResult _searchResults = SearchResult(
    originalQuery: '',
    intent: const SearchIntent(
      originalQuery: '',
      normalizedQuery: '',
      entityText: '',
    ),
  );
  SearchFilter _selectedFilter = SearchFilter.all;

  static const double _kCarouselEdge = 20.0;
  static const double _kCarouselGap = 14.0;

  @override
  void initState() {
    super.initState();
    _dataService.initRecents();
    if (CatalogDataSource.allTracks.isEmpty) {
      CatalogDataSource.initialize();
    }
    _textCtrl.addListener(_onTextChanged);
    _focusNode.addListener(_onFocusChanged);
    _scrollCtrl.addListener(_onScroll);
    SearchNav.phase.addListener(_onPhase);
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _textCtrl.removeListener(_onTextChanged);
    _focusNode.removeListener(_onFocusChanged);
    _scrollCtrl.removeListener(_onScroll);
    SearchNav.phase.removeListener(_onPhase);
    _textCtrl.dispose();
    _focusNode.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _onFocusChanged() {
    if (!_focusNode.hasFocus && mounted) {
      if (SearchNav.phase.value == SearchPhase.typing && _activeQuery.isEmpty) {
        SearchNav.phase.value = SearchPhase.bar;
      }
    }
    if (mounted) setState(() {});
  }

  void _onPhase() {
    if (!mounted) return;
    final p = SearchNav.phase.value;
    if (p == SearchPhase.typing) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _focusNode.requestFocus();
      });
    } else {
      _focusNode.unfocus();
      if (_activeQuery.isNotEmpty) _clearSearch();
    }
    setState(() {});
  }

  void _onScroll() {
    if (_selectedFilter == SearchFilter.all) return;
    if (_isLoading || _isLoadingMore) return;
    final token = _searchResults.continuation;
    if (token == null || token.isEmpty) return;

    if (_scrollCtrl.hasClients &&
        _scrollCtrl.position.pixels >=
            _scrollCtrl.position.maxScrollExtent - 380) {
      _loadMore();
    }
  }

  Future<void> _loadMore() async {
    if (_isLoadingMore) return;
    final id = _searchRequestId;
    setState(() => _isLoadingMore = true);
    try {
      final updated = await _dataService.loadMore(
        currentResult: _searchResults,
        filter: _selectedFilter,
      );
      if (mounted && id == _searchRequestId) {
        setState(() {
          _searchResults = updated;
          _isLoadingMore = false;
        });
      }
    } catch (_) {
      if (mounted && id == _searchRequestId) {
        setState(() => _isLoadingMore = false);
      }
    }
  }

  // ── Preserved Search & First-Try Submit Logic ──────────────────────────────

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
          intent: const SearchIntent(
            originalQuery: '',
            normalizedQuery: '',
            entityText: '',
          ),
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

    // 3. Debounced deep search
    _debounceTimer = Timer(const Duration(milliseconds: 250), () {
      _executeSearch(query, id, filter: _selectedFilter);
    });
  }

  Future<void> _executeSearch(
    String query,
    int id, {
    SearchFilter filter = SearchFilter.all,
  }) async {
    try {
      final results = await _dataService.search(query: query, filter: filter);
      if (mounted && id == _searchRequestId) {
        setState(() {
          _searchResults = results;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted && id == _searchRequestId) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _submitSearch(String query, {SearchFilter filter = SearchFilter.all}) {
    final clean = query.trim();
    if (clean.isEmpty) return;
    _debounceTimer?.cancel();
    _focusNode.unfocus();
    _activeQuery = clean;
    if (_textCtrl.text.trim() != clean) {
      _textCtrl.value = TextEditingValue(
        text: clean,
        selection: TextSelection.collapsed(offset: clean.length),
      );
    }
    _dataService.addRecent(clean);
    final id = ++_searchRequestId;
    setState(() {
      _isLoading = true;
      _liveSuggestions = [];
      _selectedFilter = filter;
    });
    if (_scrollCtrl.hasClients && _scrollCtrl.offset > 0) {
      _scrollCtrl.animateTo(
        0,
        duration: const Duration(milliseconds: 340),
        curve: const _SpringCurve(Springs.smooth),
      );
    }
    _executeSearch(clean, id, filter: filter);
  }

  void _onFilterSelected(SearchFilter filter) {
    if (_selectedFilter == filter) return;
    HapticFeedback.selectionClick();
    final hasCachedForFilter = switch (filter) {
      SearchFilter.all => !_searchResults.isEmpty,
      SearchFilter.songs => _searchResults.songs.length >= 6,
      SearchFilter.artists => _searchResults.artists.length >= 6,
      SearchFilter.albums => _searchResults.albums.length >= 6,
      SearchFilter.featuredPlaylists ||
      SearchFilter.communityPlaylists =>
        _searchResults.playlists.length >= 6,
      SearchFilter.videos => _searchResults.videos.length >= 6,
    };

    setState(() {
      _selectedFilter = filter;
      if (!hasCachedForFilter) {
        _isLoading = true;
      }
    });

    if (_activeQuery.isNotEmpty) {
      final id = ++_searchRequestId;
      _executeSearch(_activeQuery, id, filter: filter);
    }
  }

  void _clearSearch() {
    _debounceTimer?.cancel();
    _searchRequestId++;
    _activeQuery = '';
    _textCtrl.clear();
    setState(() {
      _liveSuggestions = [];
      _searchResults = SearchResult(
        originalQuery: '',
        intent: const SearchIntent(
          originalQuery: '',
          normalizedQuery: '',
          entityText: '',
        ),
      );
      _isLoading = false;
      _isLoadingMore = false;
      _selectedFilter = SearchFilter.all;
    });
  }

  void _cancelSearch() {
    _debounceTimer?.cancel();
    _focusNode.unfocus();
    SearchNav.phase.value = SearchPhase.bar;
    _clearSearch();
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
    context.read<PlayerState>().setQueue(
          list,
          startIndex: startIdx,
          context: ctx,
        );
  }

  void _startRadio(SearchTopResult top) {
    HapticFeedback.mediumImpact();
    if (_searchResults.songs.isNotEmpty) {
      _playSong(_searchResults.songs.map((s) => s.toTrack()).toList(), 0);
      return;
    }
    if (top.item is SearchSongItem) {
      _playSong([(top.item as SearchSongItem).toTrack()], 0);
      return;
    }
    _submitSearch('${top.title} songs', filter: SearchFilter.songs);
  }

  void _handleItemTap(SearchItem item) {
    HapticFeedback.lightImpact();
    final hiRes = _hiResUrl(item);

    if (item is SearchSongItem) {
      final list = _searchResults.songs.map((s) => s.toTrack()).toList();
      final track = item.toTrack();
      final idx = list.indexWhere((t) => t.id == track.id);
      if (idx >= 0) {
        _playSong(list, idx);
      } else {
        _playSong([track, ...list], 0);
      }
      return;
    }

    if (item is SearchArtistItem) {
      Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) => ArtistScreen(
            artistName: item.name,
            imageUrl: hiRes,
            browseId: item.browseId,
          ),
        ),
      );
      return;
    }

    if (item is SearchAlbumItem) {
      Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) => AlbumScreen(
            albumTitle: item.title,
            artistName: item.subtitle,
            coverUrl: hiRes,
            browseId: item.browseId,
          ),
        ),
      );
      return;
    }

    if (item is SearchPlaylistItem) {
      Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) => AlbumScreen(
            albumTitle: item.title,
            artistName: (item.author?.isNotEmpty ?? false)
                ? item.author!
                : (item.subtitle.isNotEmpty ? item.subtitle : 'Playlist'),
            coverUrl: hiRes,
            browseId: item.browseId,
          ),
        ),
      );
      return;
    }

    if (item is SearchVideoItem) {
      final t = Track(
        id: item.videoId != null ? 'yt-${item.videoId}' : item.id,
        title: item.title,
        artist: (item.channel?.isNotEmpty ?? false) ? item.channel! : 'YouTube',
        album: 'Video',
        coverUrl: hiRes,
        durationSeconds: _parseDurationSeconds(item.durationText),
        source: 'youtube',
      );
      _playSong([t], 0);
    }
  }

  String _hiResUrl(SearchItem item) {
    return item.thumbnailUrlHiRes.isNotEmpty
        ? item.thumbnailUrlHiRes
        : item.thumbnailUrl;
  }

  int _parseDurationSeconds(String raw) {
    final parts = raw.trim().split(':');
    if (parts.length == 2) {
      final m = int.tryParse(parts[0]) ?? 0;
      final s = int.tryParse(parts[1]) ?? 0;
      return m * 60 + s;
    }
    if (parts.length == 3) {
      final h = int.tryParse(parts[0]) ?? 0;
      final m = int.tryParse(parts[1]) ?? 0;
      final s = int.tryParse(parts[2]) ?? 0;
      return h * 3600 + m * 60 + s;
    }
    return 210;
  }

  bool _isTrackActive(Track track, String? activeTrackId) {
    if (activeTrackId == null || activeTrackId.isEmpty) return false;
    return activeTrackId == track.id ||
        activeTrackId == 'yt-${track.id}' ||
        track.id == 'yt-$activeTrackId';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Build
  // ═══════════════════════════════════════════════════════════════════════════

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final bottomPad = MediaQuery.paddingOf(context).bottom;
    final topPad = MediaQuery.paddingOf(context).top;
    final typing =
        SearchNav.phase.value == SearchPhase.typing || _focusNode.hasFocus;
    final hasQuery = _activeQuery.isNotEmpty;
    final showSuggestions =
        typing && _liveSuggestions.isNotEmpty && _searchResults.isEmpty;

    final _SearchViewPhase phase;
    if (_isLoading && _searchResults.isEmpty) {
      phase = _SearchViewPhase.loading;
    } else if (showSuggestions) {
      phase = _SearchViewPhase.suggestions;
    } else if (hasQuery) {
      phase = _SearchViewPhase.results;
    } else {
      phase = _SearchViewPhase.landing;
    }

    return PopScope(
      canPop: !typing && !hasQuery,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (typing) {
          _cancelSearch();
        } else if (hasQuery) {
          _clearSearch();
        }
      },
      child: Scaffold(
        backgroundColor: AppColors.bg,
        body: Stack(
          children: [
            CustomScrollView(
              controller: _scrollCtrl,
              key: const PageStorageKey<String>('search_scroll_view'),
              physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              slivers: [
                SliverToBoxAdapter(
                  child: SizedBox(height: topPad + 60),
                ),
                SliverToBoxAdapter(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 340),
                    switchInCurve: const _SpringCurve(Springs.smooth),
                    switchOutCurve: Curves.easeInCubic,
                    layoutBuilder: (currentChild, previousChildren) {
                      return Stack(
                        alignment: Alignment.topCenter,
                        children: [
                          ...previousChildren,
                          ?currentChild,
                        ],
                      );
                    },
                    transitionBuilder: (child, anim) {
                      final slide = Tween<Offset>(
                        begin: const Offset(0, 0.025),
                        end: Offset.zero,
                      ).animate(anim);
                      return FadeTransition(
                        opacity: anim,
                        child: SlideTransition(position: slide, child: child),
                      );
                    },
                    child: switch (phase) {
                      _SearchViewPhase.landing => _buildLandingSection(
                          key: const ValueKey('phase_landing'),
                        ),
                      _SearchViewPhase.suggestions => _buildSuggestionsSection(
                          key: const ValueKey('phase_suggestions'),
                        ),
                      _SearchViewPhase.loading => const _SearchShimmerView(
                          key: ValueKey('phase_loading'),
                        ),
                      _SearchViewPhase.results => _buildResultsSection(
                          key: ValueKey('phase_results_$_activeQuery'),
                        ),
                    },
                  ),
                ),
                if (_isLoadingMore)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 20),
                      child: Center(
                        child: CupertinoActivityIndicator(radius: 12),
                      ),
                    ),
                  ),
                SliverToBoxAdapter(
                  child: SizedBox(height: 180 + bottomPad),
                ),
              ],
            ),

            // Sticky Dynamic Island Header
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: DynamicIslandHeader(
                title: 'Search',
                showBack: typing || hasQuery,
                isDockPage: !(typing || hasQuery),
                showProfile: true,
                topPadding: topPad + 4,
                centerWidget: (typing || hasQuery) ? _topField() : null,
                onBack: () {
                  if (typing) {
                    _cancelSearch();
                  } else {
                    _clearSearch();
                  }
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _topField() {
    return Row(
      children: [
        PressableScale(
          scale: 0.90,
          onTap: () => _submitSearch(_textCtrl.text, filter: _selectedFilter),
          child: const Padding(
            padding: EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            child: Icon(
              CupertinoIcons.search,
              color: AppColors.textSecondary,
              size: 17,
            ),
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: TextField(
            controller: _textCtrl,
            focusNode: _focusNode,
            textInputAction: TextInputAction.search,
            autocorrect: false,
            enableSuggestions: false,
            cursorColor: AppColors.accent,
            style: _bodyStyle(
              fontSize: 15,
              fontWeight: FontWeight.w500,
              color: AppColors.textPrimary,
            ),
            decoration: InputDecoration(
              isDense: true,
              border: InputBorder.none,
              contentPadding: EdgeInsets.zero,
              hintText: 'Artists, Songs, Lyrics, and More',
              hintStyle: _bodyStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: AppColors.textTertiary,
              ),
            ),
            onSubmitted: (val) => _submitSearch(val),
          ),
        ),
        ValueListenableBuilder<TextEditingValue>(
          valueListenable: _textCtrl,
          builder: (context, val, _) {
            return SpringPop(
              visible: val.text.isNotEmpty,
              child: PressableScale(
                onTap: () {
                  HapticFeedback.lightImpact();
                  _clearSearch();
                  _focusNode.requestFocus();
                },
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.20),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    CupertinoIcons.xmark,
                    size: 11,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 1: Landing / Browse Categories View
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildLandingSection({Key? key}) {
    return Column(
      key: key,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Inline Apple Music Search Entry Pill
        Padding(
          padding: const EdgeInsets.fromLTRB(
            _kCarouselEdge,
            4,
            _kCarouselEdge,
            18,
          ),
          child: SpringIn(
            delayMs: 0,
            rise: 12,
            child: PressableScale(
              scale: 0.985,
              onTap: () {
                HapticFeedback.lightImpact();
                SearchNav.phase.value = SearchPhase.typing;
                _focusNode.requestFocus();
              },
              child: AppleGlass(
                borderRadius: BorderRadius.circular(14),
                blur: 10,
                tint: const Color(0x181C1C20),
                shadow: false,
                child: Container(
                  height: 44,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.10),
                      width: 0.6,
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        CupertinoIcons.search,
                        size: 18,
                        color: AppColors.textSecondary,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Artists, Songs, Lyrics, and More',
                          style: _bodyStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textTertiary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),

        // A. Recent Searches
        ValueListenableBuilder<List<String>>(
          valueListenable: _dataService.recentsNotifier,
          builder: (context, recents, _) {
            if (recents.isEmpty) return const SizedBox.shrink();
            final visible = recents.take(5).toList();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: SectionHeader(
                    title: 'Recent Searches',
                    actionTitle: 'Clear',
                    onActionTap: () {
                      HapticFeedback.lightImpact();
                      _dataService.clearRecents();
                    },
                  ),
                ),
                const SizedBox(height: 2),
                ...List.generate(visible.length, (i) {
                  final q = visible[i];
                  return SpringIn(
                    delayMs: 25 * i,
                    rise: 14,
                    child: PressableScale(
                      scale: 0.985,
                      onTap: () => _submitSearch(q),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: _kCarouselEdge,
                          vertical: 11,
                        ),
                        decoration: BoxDecoration(
                          border: Border(
                            bottom: BorderSide(
                              color: Colors.white.withValues(alpha: 0.06),
                              width: 0.5,
                            ),
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.07),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                CupertinoIcons.clock,
                                size: 15,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                q,
                                style: _bodyStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.textPrimary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            PressableScale(
                              scale: 0.90,
                              onTap: () {
                                HapticFeedback.selectionClick();
                                _dataService.removeRecent(q);
                              },
                              child: const Padding(
                                padding: EdgeInsets.all(6),
                                child: Icon(
                                  CupertinoIcons.xmark,
                                  size: 15,
                                  color: AppColors.textTertiary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 22),
              ],
            );
          },
        ),

        // B. Trending Searches (Stadium Pills)
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(title: 'Trending Searches'),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            _kCarouselEdge,
            2,
            _kCarouselEdge,
            24,
          ),
          child: Wrap(
            spacing: 8,
            runSpacing: 9,
            children: List.generate(_kTrendingPills.length, (i) {
              final pill = _kTrendingPills[i];
              return SpringIn(
                delayMs: 22 * i,
                rise: 12,
                child: PressableScale(
                  scale: 0.95,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    _submitSearch(pill);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.07),
                      borderRadius: BorderRadius.circular(26),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.10),
                        width: 0.6,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          CupertinoIcons.flame_fill,
                          size: 13,
                          color: AppColors.accent,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          pill,
                          style: _bodyStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),

        // C. Browse Categories (2-Column Apple Music Genre Grid)
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(title: 'Browse Categories'),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            _kCarouselEdge,
            2,
            _kCarouselEdge,
            26,
          ),
          child: GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _kSearchCategories.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 2.15,
            ),
            itemBuilder: (context, i) {
              final cat = _kSearchCategories[i];
              return SpringIn(
                delayMs: (i % 6) * 28,
                rise: 18,
                child: _BrowseCategoryTile(
                  spec: cat,
                  onTap: () {
                    HapticFeedback.lightImpact();
                    _submitSearch(cat.query);
                  },
                ),
              );
            },
          ),
        ),

        // D & E. Popular Artists & Trending Albums from CatalogDataSource
        ValueListenableBuilder<List<Track>>(
          valueListenable: CatalogDataSource.tracksNotifier,
          builder: (context, catalog, _) {
            final source =
                catalog.isNotEmpty ? catalog : CatalogDataSource.allTracks;
            final popularArtists = _extractPopularArtists(source);
            final popularAlbums = _extractPopularAlbums(source);

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (popularArtists.isNotEmpty) ...[
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 4),
                    child: SectionHeader(title: 'Popular Artists'),
                  ),
                  SizedBox(
                    height: 236,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      physics: const _SearchSnapPhysics(
                        itemExtent: 150 + _kCarouselGap,
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: _kCarouselEdge,
                      ),
                      itemCount: popularArtists.length,
                      separatorBuilder: (_, _) =>
                          const SizedBox(width: _kCarouselGap),
                      itemBuilder: (context, i) {
                        final a = popularArtists[i];
                        final name = a['name'] ?? '';
                        final photo = a['photo'] ?? '';
                        return SpringIn(
                          delayMs: (i % 5) * 35,
                          rise: 18,
                          child: MediaCard(
                            width: 150.0,
                            isCircular: true,
                            twoLineTitle: true,
                            title: name,
                            subtitle: 'Artist',
                            imageUrl: photo,
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
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 18),
                ],
                if (popularAlbums.isNotEmpty) ...[
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 4),
                    child: SectionHeader(title: 'Trending Albums'),
                  ),
                  SizedBox(
                    height: 256,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      physics: const _SearchSnapPhysics(
                        itemExtent: 170 + _kCarouselGap,
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: _kCarouselEdge,
                      ),
                      itemCount: popularAlbums.length,
                      separatorBuilder: (_, _) =>
                          const SizedBox(width: _kCarouselGap),
                      itemBuilder: (context, i) {
                        final al = popularAlbums[i];
                        final title = al['title'] ?? '';
                        final artist = al['artist'] ?? '';
                        final cover = al['cover'] ?? '';
                        return SpringIn(
                          delayMs: (i % 5) * 35,
                          rise: 18,
                          child: MediaCard(
                            width: 170.0,
                            twoLineTitle: true,
                            title: title,
                            subtitle: artist,
                            imageUrl: cover,
                            onTap: () {
                              HapticFeedback.lightImpact();
                              Navigator.push(
                                context,
                                ZenPageRoute(
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
                ],
              ],
            );
          },
        ),
      ],
    );
  }

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
    return map.values.take(10).toList();
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
    return map.values.take(10).toList();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 2: Live Suggestions View
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildSuggestionsSection({Key? key}) {
    final typed = _textCtrl.text.trim().toLowerCase();
    return Column(
      key: key,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: List.generate(_liveSuggestions.length, (i) {
        final s = _liveSuggestions[i];
        return SpringIn(
          delayMs: i * 18,
          rise: 12,
          child: PressableScale(
            scale: 0.985,
            onTap: () => _submitSearch(s, filter: _selectedFilter),
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: _kCarouselEdge,
                vertical: 13,
              ),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(
                    color: Colors.white.withValues(alpha: 0.06),
                    width: 0.5,
                  ),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    CupertinoIcons.search,
                    size: 17,
                    color: AppColors.textTertiary,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: _buildHighlightedSuggestion(s, typed),
                  ),
                  PressableScale(
                    scale: 0.90,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      _textCtrl.value = TextEditingValue(
                        text: s,
                        selection: TextSelection.collapsed(offset: s.length),
                      );
                    },
                    child: const Padding(
                      padding: EdgeInsets.all(6),
                      child: Icon(
                        CupertinoIcons.arrow_up_left,
                        size: 16,
                        color: AppColors.textTertiary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }

  Widget _buildHighlightedSuggestion(String text, String queryLower) {
    if (queryLower.isEmpty) {
      return Text(
        text,
        style: _bodyStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: AppColors.textPrimary,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      );
    }
    final idx = text.toLowerCase().indexOf(queryLower);
    if (idx < 0) {
      return Text(
        text,
        style: _bodyStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: AppColors.textPrimary,
        ),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      );
    }
    return RichText(
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      text: TextSpan(
        style: _bodyStyle(
          fontSize: 16,
          fontWeight: FontWeight.w500,
          color: AppColors.textSecondary,
        ),
        children: [
          if (idx > 0) TextSpan(text: text.substring(0, idx)),
          TextSpan(
            text: text.substring(idx, idx + queryLower.length),
            style: _bodyStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          if (idx + queryLower.length < text.length)
            TextSpan(text: text.substring(idx + queryLower.length)),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 4: Search Results View
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildResultsSection({Key? key}) {
    final r = _searchResults;
    final hasAny = !r.isEmpty;

    return Column(
      key: key,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SearchFilterBar(
          selectedFilter: _selectedFilter,
          onSelected: _onFilterSelected,
        ),
        if (r.correctedQuery != null && r.correctedQuery!.isNotEmpty)
          _buildDidYouMeanPill(r.correctedQuery!),
        if (_isLoading && hasAny)
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: LinearProgressIndicator(
              minHeight: 2,
              backgroundColor: Colors.transparent,
              color: AppColors.accent,
            ),
          ),
        if (!hasAny)
          _buildEmptyResultsState()
        else
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            switchInCurve: const _SpringCurve(Springs.snappy),
            switchOutCurve: Curves.easeInCubic,
            layoutBuilder: (currentChild, previousChildren) {
              return Stack(
                alignment: Alignment.topCenter,
                children: [
                  ...previousChildren,
                  ?currentChild,
                ],
              );
            },
            transitionBuilder: (child, anim) {
              final slide = Tween<Offset>(
                begin: const Offset(0, 0.025),
                end: Offset.zero,
              ).animate(anim);
              return FadeTransition(
                opacity: anim,
                child: SlideTransition(position: slide, child: child),
              );
            },
            child: KeyedSubtree(
              key: ValueKey('filter_${_selectedFilter.name}'),
              child: switch (_selectedFilter) {
                SearchFilter.all => _buildDynamicOverviewSections(r),
                SearchFilter.songs => _buildFilteredSongsList(r.songs),
                SearchFilter.artists => _buildFilteredArtistsList(r.artists),
                SearchFilter.albums => _buildFilteredAlbumsGrid(r.albums),
                SearchFilter.featuredPlaylists ||
                SearchFilter.communityPlaylists =>
                  _buildFilteredPlaylistsGrid(r.playlists),
                SearchFilter.videos => _buildFilteredVideosList(r.videos),
              },
            ),
          ),
      ],
    );
  }

  Widget _buildDidYouMeanPill(String correction) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        _kCarouselEdge,
        10,
        _kCarouselEdge,
        4,
      ),
      child: SpringIn(
        delayMs: 20,
        rise: 10,
        child: PressableScale(
          scale: 0.97,
          onTap: () => _submitSearch(correction, filter: _selectedFilter),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(26),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.09),
                width: 0.6,
              ),
            ),
            child: RichText(
              text: TextSpan(
                style: _bodyStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w500,
                  color: AppColors.textSecondary,
                ),
                children: [
                  const TextSpan(text: 'Did you mean '),
                  TextSpan(
                    text: correction,
                    style: _bodyStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: AppColors.accent,
                    ),
                  ),
                  const TextSpan(text: '?'),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildEmptyResultsState() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 68, 32, 48),
      child: Center(
        child: SpringIn(
          delayMs: 40,
          rise: 18,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.06),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  CupertinoIcons.search,
                  size: 30,
                  color: AppColors.textTertiary,
                ),
              ),
              const SizedBox(height: 18),
              Text(
                'No Results for "$_activeQuery"',
                style: _displayStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'Check the spelling or try a new search.',
                style: _bodyStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: AppColors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 22),
              PressableScale(
                onTap: () {
                  _clearSearch();
                  _focusNode.requestFocus();
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 22,
                    vertical: 11,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.accent,
                    borderRadius: BorderRadius.circular(26),
                  ),
                  child: Text(
                    'Clear Search',
                    style: _bodyStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Overview Sections Ordered by Intent ────────────────────────────────────

  Widget _buildDynamicOverviewSections(SearchResult r) {
    final sections = <Widget>[];

    if (r.topResult != null) {
      sections.add(_buildTopResultSection(r.topResult!));
    }

    final Widget? songsSec =
        r.songs.isNotEmpty ? _buildSongsOverviewSection(r.songs) : null;
    final Widget? artistsSec =
        r.artists.isNotEmpty ? _buildArtistsCarouselSection(r.artists) : null;
    final Widget? albumsSec =
        r.albums.isNotEmpty ? _buildAlbumsCarouselSection(r.albums) : null;
    final Widget? playlistsSec = r.playlists.isNotEmpty
        ? _buildPlaylistsCarouselSection(r.playlists)
        : null;
    final Widget? videosSec =
        r.videos.isNotEmpty ? _buildVideosCarouselSection(r.videos) : null;

    final ordered = switch (r.intent.layoutMode) {
      SearchLayoutMode.exactArtist || SearchLayoutMode.artistType => [
          songsSec,
          albumsSec,
          artistsSec,
          playlistsSec,
          videosSec,
        ],
      SearchLayoutMode.albumOrPlaylist => [
          albumsSec,
          playlistsSec,
          songsSec,
          artistsSec,
          videosSec,
        ],
      SearchLayoutMode.songTitle || SearchLayoutMode.generic => [
          songsSec,
          albumsSec,
          artistsSec,
          playlistsSec,
          videosSec,
        ],
    };

    for (final w in ordered) {
      if (w != null) sections.add(w);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: sections,
    );
  }

  // ── 1. Editorial Top Result Hero Card (AppleGlass + Stadium & Circle Controls)

  Widget _buildTopResultSection(SearchTopResult top) {
    final isArtist = top.type == SearchItemType.artist;
    final isSong = top.item is SearchSongItem;
    final songTrack = isSong ? (top.item as SearchSongItem).toTrack() : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(title: 'Top Result'),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            _kCarouselEdge,
            0,
            _kCarouselEdge,
            18,
          ),
          child: SpringIn(
            delayMs: 20,
            rise: 22,
            child: PressableScale(
              scale: 0.985,
              onTap: () => _handleItemTap(top.item),
              child: Stack(
                children: [
                  if (top.imageUrl.isNotEmpty)
                    Positioned.fill(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(22),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Opacity(
                              opacity: 0.24,
                              child: ImageFiltered(
                                imageFilter: ImageFilter.blur(
                                  sigmaX: 28,
                                  sigmaY: 28,
                                ),
                                child: CachedNetworkImage(
                                  imageUrl: top.imageUrl,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, _, _) =>
                                      const SizedBox.shrink(),
                                ),
                              ),
                            ),
                            DecoratedBox(
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [
                                    const Color(0xFF141418)
                                        .withValues(alpha: 0.72),
                                    const Color(0xFF0C0C0F)
                                        .withValues(alpha: 0.90),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  AppleGlass(
                    borderRadius: BorderRadius.circular(22),
                    blur: 14,
                    tint: const Color(0x1C141418),
                    shadow: true,
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.12),
                          width: 0.7,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              Selector<PlayerState,
                                  ({String? id, bool playing})>(
                                selector: (_, p) => (
                                  id: p.currentTrack?.id,
                                  playing: p.isPlaying,
                                ),
                                builder: (context, active, _) {
                                  final isCurrent = songTrack != null &&
                                      _isTrackActive(songTrack, active.id);
                                  return _TopResultArtwork(
                                    imageUrl: top.imageUrl,
                                    title: top.title,
                                    isArtist: isArtist,
                                    isActive: isCurrent,
                                    isPlaying: isCurrent && active.playing,
                                  );
                                },
                              ),
                              const SizedBox(width: 15),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    _buildTopResultBadges(top),
                                    const SizedBox(height: 6),
                                    Text(
                                      top.title,
                                      style: _displayStyle(
                                        fontSize: 21,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.textPrimary,
                                        letterSpacing: -0.4,
                                        height: 1.15,
                                      ),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    if (top.subtitle.isNotEmpty) ...[
                                      const SizedBox(height: 4),
                                      Text(
                                        top.subtitle,
                                        style: _bodyStyle(
                                          fontSize: 13.5,
                                          fontWeight: FontWeight.w500,
                                          color: AppColors.textSecondary,
                                          height: 1.25,
                                        ),
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              const SizedBox(width: 6),
                              Align(
                                alignment: Alignment.topRight,
                                child: ZenActionCircle(
                                  icon: CupertinoIcons.ellipsis,
                                  size: 36,
                                  iconSize: 17,
                                  backgroundColor:
                                      Colors.white.withValues(alpha: 0.11),
                                  idleColor: AppColors.textPrimary,
                                  onTap: () => _showTopResultDropdown(top),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          _buildTopResultActions(top, songTrack),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTopResultBadges(SearchTopResult top) {
    final typeLabel = switch (top.type) {
      SearchItemType.artist => 'ARTIST',
      SearchItemType.song => 'SONG',
      SearchItemType.album => 'ALBUM',
      SearchItemType.playlist => 'PLAYLIST',
      SearchItemType.video => 'VIDEO',
      SearchItemType.podcast || SearchItemType.episode => 'PODCAST',
      SearchItemType.topResult => 'TOP RESULT',
    };

    final bool isExplicit = switch (top.item) {
      SearchSongItem s => s.isExplicit,
      SearchAlbumItem a => a.isExplicit,
      _ => false,
    };

    final bool isVerified = switch (top.item) {
      SearchArtistItem a => a.isVerified,
      _ => false,
    };

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: AppColors.accent.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(26),
            border: Border.all(
              color: AppColors.accent.withValues(alpha: 0.35),
              width: 0.5,
            ),
          ),
          child: Text(
            typeLabel,
            style: _bodyStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              color: AppColors.accent,
              letterSpacing: 0.7,
            ),
          ),
        ),
        if (isVerified) ...[
          const SizedBox(width: 6),
          const Icon(
            CupertinoIcons.checkmark_seal_fill,
            size: 14,
            color: AppColors.accent,
          ),
        ],
        if (isExplicit) ...[
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(3),
            ),
            child: Text(
              'E',
              style: _bodyStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.textPrimary,
              ),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildTopResultActions(SearchTopResult top, Track? songTrack) {
    final store = LibraryStore.instance;
    return Selector<PlayerState, ({String? id, bool playing})>(
      selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
      builder: (context, active, _) {
        final isPlayingThisSong = songTrack != null &&
            _isTrackActive(songTrack, active.id) &&
            active.playing;

        return Row(
          children: [
            Expanded(
              child: ZenPlayButton(
                height: 44,
                fontSize: 15,
                iconSize: 18,
                isPlaying: isPlayingThisSong,
                label: isPlayingThisSong ? 'Pause' : 'Play',
                expanded: true,
                onTap: () {
                  if (songTrack != null &&
                      _isTrackActive(songTrack, active.id)) {
                    context.read<PlayerState>().togglePlay();
                  } else if (top.item is SearchSongItem) {
                    _handleItemTap(top.item);
                  } else if (_searchResults.songs.isNotEmpty) {
                    _playSong(
                      _searchResults.songs.map((s) => s.toTrack()).toList(),
                      0,
                    );
                  } else {
                    _handleItemTap(top.item);
                  }
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: top.type == SearchItemType.album ||
                      top.type == SearchItemType.playlist
                  ? ZenShuffleButton(
                      height: 44,
                      fontSize: 15,
                      iconSize: 17,
                      expanded: true,
                      label: 'Shuffle',
                      onTap: () {
                        if (_searchResults.songs.isNotEmpty) {
                          final tracks = _searchResults.songs
                              .map((s) => s.toTrack())
                              .toList()
                            ..shuffle();
                          _playSong(tracks, 0);
                        } else {
                          _handleItemTap(top.item);
                        }
                      },
                    )
                  : ZenPlayButton(
                      height: 44,
                      fontSize: 15,
                      iconSize: 17,
                      isSecondary: true,
                      expanded: true,
                      label: 'Radio',
                      onTap: () => _startRadio(top),
                    ),
            ),
            const SizedBox(width: 10),
            AnimatedBuilder(
              animation: store,
              builder: (context, _) {
                if (songTrack != null) {
                  final liked = store.isLiked(songTrack);
                  return ZenActionCircle(
                    size: 44,
                    iconSize: 20,
                    active: liked,
                    icon: liked
                        ? CupertinoIcons.heart_fill
                        : CupertinoIcons.heart,
                    onTap: () => store.toggleLike(songTrack),
                  );
                }
                if (top.item is SearchArtistItem) {
                  final followed = store.isFollowing(top.title);
                  return ZenActionCircle(
                    size: 44,
                    iconSize: 20,
                    active: followed,
                    icon: followed
                        ? CupertinoIcons.star_fill
                        : CupertinoIcons.star,
                    onTap: () => store.toggleFollow(top.title, top.imageUrl),
                  );
                }
                if (top.item is SearchAlbumItem) {
                  final saved = store.isAlbumSaved(top.title, top.subtitle);
                  return ZenActionCircle(
                    size: 44,
                    iconSize: 20,
                    active: saved,
                    icon: saved
                        ? CupertinoIcons.checkmark
                        : CupertinoIcons.plus,
                    onTap: () =>
                        store.toggleAlbum(top.title, top.subtitle, top.imageUrl),
                  );
                }
                return ZenActionCircle(
                  size: 44,
                  iconSize: 20,
                  icon: CupertinoIcons.arrow_up_right,
                  onTap: () => _handleItemTap(top.item),
                );
              },
            ),
          ],
        );
      },
    );
  }

  void _showTopResultDropdown(SearchTopResult top) {
    HapticFeedback.mediumImpact();
    if (top.item is SearchSongItem) {
      ZenDropdown.showTrackMenu(
        context: context,
        track: (top.item as SearchSongItem).toTrack(),
      );
      return;
    }

    final store = LibraryStore.instance;
    final items = <ZenDropdownItem>[
      ZenDropdownItem(
        title: 'Play',
        icon: CupertinoIcons.play_fill,
        onTap: () {
          if (_searchResults.songs.isNotEmpty) {
            _playSong(_searchResults.songs.map((s) => s.toTrack()).toList(), 0);
          } else {
            _handleItemTap(top.item);
          }
        },
      ),
      ZenDropdownItem(
        title: 'Create Station',
        icon: CupertinoIcons.antenna_radiowaves_left_right,
        onTap: () => _startRadio(top),
      ),
      if (top.item is SearchArtistItem)
        ZenDropdownItem(
          title: store.isFollowing(top.title)
              ? 'Unfollow Artist'
              : 'Follow Artist',
          icon: store.isFollowing(top.title)
              ? CupertinoIcons.star_fill
              : CupertinoIcons.star,
          onTap: () => store.toggleFollow(top.title, top.imageUrl),
        ),
      if (top.item is SearchAlbumItem)
        ZenDropdownItem(
          title: store.isAlbumSaved(top.title, top.subtitle)
              ? 'Remove from Library'
              : 'Add to Library',
          icon: store.isAlbumSaved(top.title, top.subtitle)
              ? CupertinoIcons.checkmark_circle_fill
              : CupertinoIcons.plus_circle,
          onTap: () => store.toggleAlbum(top.title, top.subtitle, top.imageUrl),
        ),
      ZenDropdownItem(
        title: 'View Details',
        icon: CupertinoIcons.arrow_up_right_circle,
        onTap: () => _handleItemTap(top.item),
      ),
    ];

    ZenDropdown.show(
      context: context,
      title: top.title,
      subtitle: top.subtitle.isNotEmpty ? top.subtitle : null,
      items: items,
    );
  }

  // ── 2. Songs Section (Canonical SongTile + EqualizerBars + ZenDropdown) ────

  Widget _buildSongsOverviewSection(List<SearchSongItem> songs) {
    final visibleCount = songs.length > 5 ? 5 : songs.length;
    final allTracks = songs.map((s) => s.toTrack()).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(
            title: 'Songs',
            actionTitle: 'See All',
            onActionTap: () => _onFilterSelected(SearchFilter.songs),
          ),
        ),
        Selector<PlayerState, ({String? id, bool playing})>(
          selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
          builder: (context, active, _) {
            return Column(
              children: List.generate(visibleCount, (i) {
                final track = allTracks[i];
                final isActive = _isTrackActive(track, active.id);
                return SpringIn(
                  delayMs: 55 + i * 28,
                  rise: 16,
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: SongTile(
                          track: track,
                          isActive: isActive,
                          isPlaying: isActive && active.playing,
                          onTap: () {
                            HapticFeedback.lightImpact();
                            _playSong(allTracks, i);
                          },
                          onTrailingTap: () {
                            HapticFeedback.lightImpact();
                            ZenDropdown.showTrackMenu(
                              context: context,
                              track: track,
                            );
                          },
                        ),
                      ),
                      if (i < visibleCount - 1)
                        Divider(
                          height: 1,
                          indent: 84,
                          endIndent: _kCarouselEdge,
                          color: Colors.white.withValues(alpha: 0.06),
                        ),
                    ],
                  ),
                );
              }),
            );
          },
        ),
        const SizedBox(height: 14),
      ],
    );
  }

  // ── 3. Albums Snap Carousel (MediaCard width: 170.0) ───────────────────────

  Widget _buildAlbumsCarouselSection(List<SearchAlbumItem> albums) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(
            title: 'Albums',
            actionTitle: 'See All',
            onActionTap: () => _onFilterSelected(SearchFilter.albums),
          ),
        ),
        SizedBox(
          height: 256,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const _SearchSnapPhysics(itemExtent: 170 + _kCarouselGap),
            padding: const EdgeInsets.symmetric(horizontal: _kCarouselEdge),
            itemCount: albums.length,
            separatorBuilder: (_, _) => const SizedBox(width: _kCarouselGap),
            itemBuilder: (context, i) {
              final album = albums[i];
              final subtitleParts = <String>[
                if (album.subtitle.isNotEmpty) album.subtitle,
                if (album.year != null) '${album.year}',
              ];
              return SpringIn(
                delayMs: (i % 5) * 32,
                rise: 18,
                child: MediaCard(
                  width: 170.0,
                  twoLineTitle: true,
                  title: album.title,
                  subtitle: subtitleParts.isNotEmpty
                      ? subtitleParts.join(' · ')
                      : album.albumType,
                  imageUrl: _hiResUrl(album),
                  onTap: () => _handleItemTap(album),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 14),
      ],
    );
  }

  // ── 4. Artists Snap Carousel (MediaCard width: 150.0, isCircular: true) ────

  Widget _buildArtistsCarouselSection(List<SearchArtistItem> artists) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(
            title: 'Artists',
            actionTitle: 'See All',
            onActionTap: () => _onFilterSelected(SearchFilter.artists),
          ),
        ),
        SizedBox(
          height: 236,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const _SearchSnapPhysics(itemExtent: 150 + _kCarouselGap),
            padding: const EdgeInsets.symmetric(horizontal: _kCarouselEdge),
            itemCount: artists.length,
            separatorBuilder: (_, _) => const SizedBox(width: _kCarouselGap),
            itemBuilder: (context, i) {
              final artist = artists[i];
              final sub = artist.subscriberText;
              return SpringIn(
                delayMs: (i % 5) * 32,
                rise: 18,
                child: MediaCard(
                  width: 150.0,
                  isCircular: true,
                  twoLineTitle: true,
                  title: artist.title,
                  subtitle: (sub != null && sub.isNotEmpty) ? sub : 'Artist',
                  imageUrl: _hiResUrl(artist),
                  onTap: () => _handleItemTap(artist),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 14),
      ],
    );
  }

  // ── 5. Playlists / Mixes Snap Carousel (MediaCard width: 170.0) ────────────

  Widget _buildPlaylistsCarouselSection(List<SearchPlaylistItem> playlists) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(
            title: 'Playlists',
            actionTitle: 'See All',
            onActionTap: () =>
                _onFilterSelected(SearchFilter.featuredPlaylists),
          ),
        ),
        SizedBox(
          height: 256,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const _SearchSnapPhysics(itemExtent: 170 + _kCarouselGap),
            padding: const EdgeInsets.symmetric(horizontal: _kCarouselEdge),
            itemCount: playlists.length,
            separatorBuilder: (_, _) => const SizedBox(width: _kCarouselGap),
            itemBuilder: (context, i) {
              final pl = playlists[i];
              final author = pl.author;
              final count = pl.songCountText;
              final sub = (author != null && author.isNotEmpty)
                  ? author
                  : (pl.subtitle.isNotEmpty
                      ? pl.subtitle
                      : (count ?? 'Playlist'));
              return SpringIn(
                delayMs: (i % 5) * 32,
                rise: 18,
                child: MediaCard(
                  width: 170.0,
                  twoLineTitle: true,
                  title: pl.title,
                  subtitle: sub.isNotEmpty ? sub : 'Playlist',
                  imageUrl: _hiResUrl(pl),
                  onTap: () => _handleItemTap(pl),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 14),
      ],
    );
  }

  // ── 6. Videos Snap Carousel ────────────────────────────────────────────────

  Widget _buildVideosCarouselSection(List<SearchVideoItem> videos) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(
            title: 'Videos',
            actionTitle: 'See All',
            onActionTap: () => _onFilterSelected(SearchFilter.videos),
          ),
        ),
        SizedBox(
          height: 214,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const _SearchSnapPhysics(itemExtent: 256 + _kCarouselGap),
            padding: const EdgeInsets.symmetric(horizontal: _kCarouselEdge),
            itemCount: videos.length,
            separatorBuilder: (_, _) => const SizedBox(width: _kCarouselGap),
            itemBuilder: (context, i) {
              final video = videos[i];
              return SpringIn(
                delayMs: (i % 4) * 32,
                rise: 18,
                child: _VideoCarouselCard(
                  video: video,
                  imageUrl: _hiResUrl(video),
                  onTap: () => _handleItemTap(video),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 14),
      ],
    );
  }

  // ── Full Filtered Views (Songs / Artists / Albums / Playlists / Videos) ────

  Widget _buildFilteredSongsList(List<SearchSongItem> songs) {
    if (songs.isEmpty) return _buildEmptyFilterNotice('songs');
    final tracks = songs.map((s) => s.toTrack()).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(title: 'Songs'),
        ),
        Selector<PlayerState, ({String? id, bool playing})>(
          selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
          builder: (context, active, _) {
            return ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: EdgeInsets.zero,
              itemCount: songs.length,
              separatorBuilder: (_, _) => Divider(
                height: 1,
                indent: 84,
                endIndent: _kCarouselEdge,
                color: Colors.white.withValues(alpha: 0.06),
              ),
              itemBuilder: (context, i) {
                final track = tracks[i];
                final isActive = _isTrackActive(track, active.id);
                return SpringIn(
                  delayMs: i < 10 ? i * 22 : 0,
                  rise: 12,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: SongTile(
                      track: track,
                      index: i + 1,
                      isActive: isActive,
                      isPlaying: isActive && active.playing,
                      onTap: () {
                        HapticFeedback.lightImpact();
                        _playSong(tracks, i);
                      },
                      onTrailingTap: () {
                        HapticFeedback.lightImpact();
                        ZenDropdown.showTrackMenu(
                          context: context,
                          track: track,
                        );
                      },
                    ),
                  ),
                );
              },
            );
          },
        ),
      ],
    );
  }

  Widget _buildFilteredArtistsList(List<SearchArtistItem> artists) {
    if (artists.isEmpty) return _buildEmptyFilterNotice('artists');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(title: 'Artists'),
        ),
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: _kCarouselEdge),
          itemCount: artists.length,
          separatorBuilder: (_, _) => Divider(
            height: 1,
            indent: 72,
            color: Colors.white.withValues(alpha: 0.06),
          ),
          itemBuilder: (context, i) {
            final artist = artists[i];
            final img = _hiResUrl(artist);
            final sub = artist.subscriberText;
            return SpringIn(
              delayMs: i < 10 ? i * 24 : 0,
              rise: 14,
              child: PressableScale(
                scale: 0.985,
                onTap: () => _handleItemTap(artist),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    children: [
                      ClipOval(
                        child: SizedBox(
                          width: 58,
                          height: 58,
                          child: img.isNotEmpty
                              ? CachedNetworkImage(
                                  imageUrl: img,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, _, _) => MonogramAvatar(
                                    name: artist.title,
                                    size: 58,
                                  ),
                                )
                              : MonogramAvatar(
                                  name: artist.title,
                                  size: 58,
                                ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Flexible(
                                  child: Text(
                                    artist.title,
                                    style: _displayStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.textPrimary,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                                if (artist.isVerified) ...[
                                  const SizedBox(width: 5),
                                  const Icon(
                                    CupertinoIcons.checkmark_seal_fill,
                                    size: 14,
                                    color: AppColors.accent,
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 3),
                            Text(
                              (sub != null && sub.isNotEmpty)
                                  ? 'Artist · $sub'
                                  : 'Artist',
                              style: _bodyStyle(
                                fontSize: 13.5,
                                fontWeight: FontWeight.w500,
                                color: AppColors.textSecondary,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        ),
                      ),
                      const Icon(
                        CupertinoIcons.chevron_right,
                        size: 16,
                        color: AppColors.textTertiary,
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildFilteredAlbumsGrid(List<SearchAlbumItem> albums) {
    if (albums.isEmpty) return _buildEmptyFilterNotice('albums');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(title: 'Albums'),
        ),
        LayoutBuilder(
          builder: (context, constraints) {
            final cardWidth = (constraints.maxWidth - 40 - 14) / 2;
            return GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: _kCarouselEdge),
              itemCount: albums.length,
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 14,
                mainAxisSpacing: 18,
                mainAxisExtent: cardWidth + 74,
              ),
              itemBuilder: (context, i) {
                final album = albums[i];
                final sub = <String>[
                  if (album.subtitle.isNotEmpty) album.subtitle,
                  if (album.year != null) '${album.year}',
                ].join(' · ');
                return SpringIn(
                  delayMs: i < 8 ? i * 26 : 0,
                  rise: 16,
                  child: MediaCard(
                    width: cardWidth,
                    twoLineTitle: true,
                    title: album.title,
                    subtitle: sub.isNotEmpty ? sub : album.albumType,
                    imageUrl: _hiResUrl(album),
                    onTap: () => _handleItemTap(album),
                  ),
                );
              },
            );
          },
        ),
      ],
    );
  }

  Widget _buildFilteredPlaylistsGrid(List<SearchPlaylistItem> playlists) {
    if (playlists.isEmpty) return _buildEmptyFilterNotice('playlists');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(title: 'Playlists'),
        ),
        LayoutBuilder(
          builder: (context, constraints) {
            final cardWidth = (constraints.maxWidth - 40 - 14) / 2;
            return GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: _kCarouselEdge),
              itemCount: playlists.length,
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 14,
                mainAxisSpacing: 18,
                mainAxisExtent: cardWidth + 74,
              ),
              itemBuilder: (context, i) {
                final pl = playlists[i];
                final author = pl.author;
                final count = pl.songCountText;
                final sub = (author != null && author.isNotEmpty)
                    ? author
                    : (pl.subtitle.isNotEmpty
                        ? pl.subtitle
                        : (count ?? 'Playlist'));
                return SpringIn(
                  delayMs: i < 8 ? i * 26 : 0,
                  rise: 16,
                  child: MediaCard(
                    width: cardWidth,
                    twoLineTitle: true,
                    title: pl.title,
                    subtitle: sub.isNotEmpty ? sub : 'Playlist',
                    imageUrl: _hiResUrl(pl),
                    onTap: () => _handleItemTap(pl),
                  ),
                );
              },
            );
          },
        ),
      ],
    );
  }

  Widget _buildFilteredVideosList(List<SearchVideoItem> videos) {
    if (videos.isEmpty) return _buildEmptyFilterNotice('videos');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4),
          child: SectionHeader(title: 'Music Videos'),
        ),
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: _kCarouselEdge),
          itemCount: videos.length,
          separatorBuilder: (_, _) => Divider(
            height: 1,
            color: Colors.white.withValues(alpha: 0.06),
          ),
          itemBuilder: (context, i) {
            final video = videos[i];
            final img = _hiResUrl(video);
            final channel = video.channel;
            final views = video.viewCountText;
            final meta = [
              if (channel != null && channel.isNotEmpty) channel,
              if (views != null && views.isNotEmpty) views,
            ].join(' · ');
            return SpringIn(
              delayMs: i < 8 ? i * 24 : 0,
              rise: 14,
              child: PressableScale(
                scale: 0.985,
                onTap: () => _handleItemTap(video),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Row(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Stack(
                          children: [
                            SizedBox(
                              width: 132,
                              height: 74,
                              child: img.isNotEmpty
                                  ? CachedNetworkImage(
                                      imageUrl: img,
                                      fit: BoxFit.cover,
                                      errorWidget: (_, _, _) =>
                                          Container(color: AppColors.surface),
                                    )
                                  : Container(color: AppColors.surface),
                            ),
                            if (video.durationText.isNotEmpty)
                              Positioned(
                                right: 6,
                                bottom: 6,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                    vertical: 2,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.78),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Text(
                                    video.durationText,
                                    style: _bodyStyle(
                                      fontSize: 10.5,
                                      fontWeight: FontWeight.w600,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 13),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              video.title,
                              style: _displayStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                color: AppColors.textPrimary,
                                height: 1.2,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (meta.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                meta,
                                style: _bodyStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w500,
                                  color: AppColors.textSecondary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
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
      ],
    );
  }

  Widget _buildEmptyFilterNotice(String kind) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
      child: Center(
        child: Text(
          'No $kind found for "$_activeQuery".',
          style: _bodyStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: AppColors.textSecondary,
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Spring-Animated Stadium Filter Pill Bar
// ═════════════════════════════════════════════════════════════════════════════

class _SearchFilterBar extends StatefulWidget {
  const _SearchFilterBar({
    required this.selectedFilter,
    required this.onSelected,
  });

  final SearchFilter selectedFilter;
  final ValueChanged<SearchFilter> onSelected;

  @override
  State<_SearchFilterBar> createState() => _SearchFilterBarState();
}

class _SearchFilterBarState extends State<_SearchFilterBar>
    with SingleTickerProviderStateMixin {
  final GlobalKey _rowKey = GlobalKey();
  late final List<GlobalKey> _pillKeys;
  late final AnimationController _slideCtrl;

  Rect? _fromRect;
  Rect? _toRect;
  Rect? _currentRect;

  @override
  void initState() {
    super.initState();
    _pillKeys = List.generate(_kResultFilters.length, (_) => GlobalKey());
    _slideCtrl = AnimationController.unbounded(vsync: this)
      ..addListener(() {
        if (!mounted || _fromRect == null || _toRect == null) return;
        setState(() {
          _currentRect = Rect.lerp(_fromRect, _toRect, _slideCtrl.value);
        });
      });
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _measureAndAnimate(snap: true),
    );
  }

  @override
  void didUpdateWidget(covariant _SearchFilterBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedFilter != widget.selectedFilter) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _scrollSelectedIntoView();
        _measureAndAnimate(snap: false);
      });
    }
  }

  @override
  void dispose() {
    _slideCtrl.dispose();
    super.dispose();
  }

  int get _selectedIndex {
    final idx =
        _kResultFilters.indexWhere((f) => f.filter == widget.selectedFilter);
    return idx < 0 ? 0 : idx;
  }

  void _scrollSelectedIntoView() {
    final ctx = _pillKeys[_selectedIndex].currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(
      ctx,
      alignment: 0.35,
      duration: const Duration(milliseconds: 300),
      curve: const _SpringCurve(Springs.smooth),
    );
  }

  void _measureAndAnimate({required bool snap}) {
    final rowBox = _rowKey.currentContext?.findRenderObject() as RenderBox?;
    final pillBox =
        _pillKeys[_selectedIndex].currentContext?.findRenderObject() as RenderBox?;
    if (rowBox == null ||
        pillBox == null ||
        !rowBox.hasSize ||
        !pillBox.hasSize) {
      return;
    }

    final origin = pillBox.localToGlobal(Offset.zero, ancestor: rowBox);
    final nextRect = origin & pillBox.size;

    if (snap || _currentRect == null) {
      setState(() {
        _fromRect = nextRect;
        _toRect = nextRect;
        _currentRect = nextRect;
      });
      return;
    }

    _fromRect = _currentRect;
    _toRect = nextRect;
    _slideCtrl.value = 0.0;
    _slideCtrl.animateWith(SpringSimulation(Springs.snappy, 0.0, 1.0, 0.0));
  }

  @override
  Widget build(BuildContext context) {
    final indicator = _currentRect;

    return Padding(
      padding: const EdgeInsets.only(top: 6, bottom: 10),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Stack(
          key: _rowKey,
          children: [
            if (indicator != null)
              Positioned(
                left: indicator.left,
                top: indicator.top,
                width: indicator.width,
                height: indicator.height,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(26),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.28),
                        blurRadius: 10,
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                ),
              ),
            Row(
              children: List.generate(_kResultFilters.length, (i) {
                final entry = _kResultFilters[i];
                final selected = entry.filter == widget.selectedFilter;
                final showFallbackBg = selected && indicator == null;

                return Padding(
                  padding: EdgeInsets.only(
                    right: i == _kResultFilters.length - 1 ? 0 : 8,
                  ),
                  child: PressableScale(
                    scale: 0.94,
                    onTap: () => widget.onSelected(entry.filter),
                    child: Container(
                      key: _pillKeys[i],
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: showFallbackBg
                            ? Colors.white
                            : selected
                                ? Colors.transparent
                                : Colors.white.withValues(alpha: 0.07),
                        borderRadius: BorderRadius.circular(26),
                        border: selected
                            ? null
                            : Border.all(
                                color: Colors.white.withValues(alpha: 0.08),
                                width: 0.6,
                              ),
                      ),
                      child: AnimatedDefaultTextStyle(
                        duration: const Duration(milliseconds: 180),
                        style: _bodyStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color:
                              selected ? Colors.black : AppColors.textSecondary,
                        ),
                        child: Text(entry.label),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ],
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Editorial Top Result Artwork (Square-Rounded or Circular Artist + Live EQ)
// ═════════════════════════════════════════════════════════════════════════════

class _TopResultArtwork extends StatelessWidget {
  const _TopResultArtwork({
    required this.imageUrl,
    required this.title,
    required this.isArtist,
    required this.isActive,
    required this.isPlaying,
  });

  final String imageUrl;
  final String title;
  final bool isArtist;
  final bool isActive;
  final bool isPlaying;

  @override
  Widget build(BuildContext context) {
    const double size = 104.0;
    final BorderRadius radius = BorderRadius.circular(isArtist ? size / 2 : 16);

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: isArtist ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: isArtist ? null : radius,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.45),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: radius,
            child: imageUrl.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: imageUrl,
                    fit: BoxFit.cover,
                    errorWidget: (_, _, _) => MonogramAvatar(
                      name: title,
                      size: size,
                      isCircle: isArtist,
                    ),
                  )
                : MonogramAvatar(
                    name: title,
                    size: size,
                    isCircle: isArtist,
                  ),
          ),
          if (isActive)
            ClipRRect(
              borderRadius: radius,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.46),
                ),
                child: Center(
                  child: EqualizerBars(
                    color: AppColors.accent,
                    size: 20,
                    isPlaying: isPlaying,
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
// Browse Category Tile (Apple Music Gradient Genre Card)
// ═════════════════════════════════════════════════════════════════════════════

class _BrowseCategoryTile extends StatelessWidget {
  const _BrowseCategoryTile({
    required this.spec,
    required this.onTap,
  });

  final _SearchCategorySpec spec;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      scale: 0.96,
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: spec.colors,
            ),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.14),
              width: 0.6,
            ),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Stack(
            children: [
              Positioned(
                right: -10,
                bottom: -10,
                child: Transform.rotate(
                  angle: -0.28,
                  child: Icon(
                    spec.icon,
                    size: 62,
                    color: Colors.white.withValues(alpha: 0.18),
                  ),
                ),
              ),
              Positioned(
                left: 13,
                right: 26,
                bottom: 11,
                child: Text(
                  spec.title,
                  style: _displayStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    height: 1.1,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
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
// Video Carousel Card
// ═════════════════════════════════════════════════════════════════════════════

class _VideoCarouselCard extends StatelessWidget {
  const _VideoCarouselCard({
    required this.video,
    required this.imageUrl,
    required this.onTap,
  });

  final SearchVideoItem video;
  final String imageUrl;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final channel = video.channel;
    final views = video.viewCountText;
    final meta = [
      if (channel != null && channel.isNotEmpty) channel,
      if (views != null && views.isNotEmpty) views,
    ].join(' · ');

    return PressableScale(
      scale: 0.96,
      onTap: onTap,
      child: SizedBox(
        width: 256,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Stack(
                children: [
                  SizedBox(
                    width: 256,
                    height: 144,
                    child: imageUrl.isNotEmpty
                        ? CachedNetworkImage(
                            imageUrl: imageUrl,
                            fit: BoxFit.cover,
                            errorWidget: (_, _, _) =>
                                Container(color: AppColors.surface),
                          )
                        : Container(color: AppColors.surface),
                  ),
                  if (video.durationText.isNotEmpty)
                    Positioned(
                      right: 8,
                      bottom: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.78),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          video.durationText,
                          style: _bodyStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              video.title,
              style: _displayStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
                height: 1.2,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            if (meta.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(
                meta,
                style: _bodyStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: AppColors.textSecondary,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Shimmer Loading Skeleton
// ═════════════════════════════════════════════════════════════════════════════

class _SearchShimmerView extends StatefulWidget {
  const _SearchShimmerView({super.key});

  @override
  State<_SearchShimmerView> createState() => _SearchShimmerViewState();
}

class _SearchShimmerViewState extends State<_SearchShimmerView>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 950),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final alpha = 0.05 + (_ctrl.value * 0.06);
        final bone = Colors.white.withValues(alpha: alpha);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 6, 20, 18),
              child: Row(
                children: [62.0, 74.0, 74.0, 78.0, 86.0]
                    .map(
                      (w) => Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Container(
                          width: w,
                          height: 34,
                          decoration: BoxDecoration(
                            color: bone,
                            borderRadius: BorderRadius.circular(26),
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Container(
                width: 112,
                height: 22,
                decoration: BoxDecoration(
                  color: bone,
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.07),
                    width: 0.6,
                  ),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 104,
                          height: 104,
                          decoration: BoxDecoration(
                            color: bone,
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        const SizedBox(width: 15),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 58,
                                height: 18,
                                decoration: BoxDecoration(
                                  color: bone,
                                  borderRadius: BorderRadius.circular(26),
                                ),
                              ),
                              const SizedBox(height: 10),
                              Container(
                                width: 170,
                                height: 22,
                                decoration: BoxDecoration(
                                  color: bone,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                              ),
                              const SizedBox(height: 8),
                              Container(
                                width: 120,
                                height: 15,
                                decoration: BoxDecoration(
                                  color: bone,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            height: 44,
                            decoration: BoxDecoration(
                              color: bone,
                              borderRadius: BorderRadius.circular(26),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Container(
                            height: 44,
                            decoration: BoxDecoration(
                              color: bone,
                              borderRadius: BorderRadius.circular(26),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: bone,
                            shape: BoxShape.circle,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Container(
                width: 84,
                height: 22,
                decoration: BoxDecoration(
                  color: bone,
                  borderRadius: BorderRadius.circular(6),
                ),
              ),
            ),
            const SizedBox(height: 10),
            ...List.generate(
              4,
              (_) => Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 8,
                ),
                child: Row(
                  children: [
                    Container(
                      width: 50,
                      height: 50,
                      decoration: BoxDecoration(
                        color: bone,
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 185,
                            height: 15,
                            decoration: BoxDecoration(
                              color: bone,
                              borderRadius: BorderRadius.circular(5),
                            ),
                          ),
                          const SizedBox(height: 7),
                          Container(
                            width: 120,
                            height: 13,
                            decoration: BoxDecoration(
                              color: bone,
                              borderRadius: BorderRadius.circular(5),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 22),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: List.generate(
                  2,
                  (i) => Padding(
                    padding: EdgeInsets.only(right: i == 0 ? 14 : 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 150,
                          height: 150,
                          decoration: BoxDecoration(
                            color: bone,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Container(
                          width: 105,
                          height: 14,
                          decoration: BoxDecoration(
                            color: bone,
                            borderRadius: BorderRadius.circular(5),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
