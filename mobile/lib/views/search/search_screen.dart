import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/equalizer_bars.dart';
import '../../design_system/widgets/media_card.dart';
import '../../design_system/widgets/monogram_avatar.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/section_header.dart';
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
import '../player/player_shell.dart';
import 'search_data_service.dart';
import 'search_models.dart';

// ── Typography ───────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

SearchResult _emptyResult() => SearchResult(
      originalQuery: '',
      intent: const SearchIntent(
        originalQuery: '',
        normalizedQuery: '',
        entityText: '',
      ),
    );

/// Removes filler such as "Unknown artist", "Artist", "Song", "Single".
String _cleanSub(String? s) {
  if (s == null || s.trim().isEmpty) return '';
  const bad = {
    'unknown artist',
    'unknown',
    'artist',
    'artists',
    'song',
    'songs',
    'video',
    'videos',
    'single',
    'album',
    'playlist',
    'ep',
  };
  final parts = s
      .split(RegExp(r'\s*[·•|]\s*'))
      .map((e) => e.trim())
      .where((e) => e.isNotEmpty && !bad.contains(e.toLowerCase()))
      .toList();
  return parts.join(' · ');
}

String _albumSub(SearchAlbumItem a) {
  final parts = <String>[
    if (_cleanSub(a.subtitle).isNotEmpty) _cleanSub(a.subtitle),
    if (a.year != null) '${a.year}',
  ];
  return parts.join(' · ');
}

String _playlistSub(SearchPlaylistItem p) {
  final author = p.author;
  if (author != null && author.isNotEmpty) return author;
  final sub = _cleanSub(p.subtitle);
  if (sub.isNotEmpty) return sub;
  return p.songCountText ?? '';
}

String _videoMeta(SearchVideoItem v) {
  final channel = v.channel;
  final views = v.viewCountText;
  return [
    if (channel != null && channel.isNotEmpty) channel,
    if (views != null && views.isNotEmpty) views,
  ].join(' · ');
}

String _norm(String s) => s
    .toLowerCase()
    .replaceAll(RegExp(r'[^\p{L}\p{N}\s]', unicode: true), ' ')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

/// 0..1 confidence that [title] (+ [secondary]) is what [q] is looking for.
double _matchScore(String q, String title, String secondary) {
  final t = _norm(title);
  if (q.isEmpty || t.isEmpty) return 0;
  if (t == q) return 1.0;
  double best = 0;
  if (t.startsWith(q)) {
    best = 0.78 + 0.18 * (q.length / t.length);
  } else if (t.length >= 3 && q.startsWith(t)) {
    best = 0.74;
  } else if (t.contains(q)) {
    best = 0.58;
  }
  final qTokens = q.split(' ');
  final hay = '$t ${_norm(secondary)}'.split(' ').toSet();
  final hit = qTokens
      .where((w) =>
          hay.contains(w) ||
          (w.length >= 3 && hay.any((h) => h.startsWith(w))))
      .length;
  final cov = hit / qTokens.length;
  final tTokens = t.split(' ');
  final titleHit = tTokens.where(qTokens.contains).length / tTokens.length;
  if (cov >= 1) {
    best = math.max(best, 0.5 + 0.3 * titleHit);
  } else {
    best = math.max(best, cov * 0.45);
  }
  return best.clamp(0.0, 1.0);
}

class _TopCand {
  const _TopCand(this.item, this.score);
  final SearchItem item;
  final double score;
}

// ── Spring curve ─────────────────────────────────────────────────────────────

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

// ── Horizontal snap physics ──────────────────────────────────────────────────

class _SearchSnapPhysics extends ScrollPhysics {
  const _SearchSnapPhysics({required this.itemExtent, super.parent});

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
    return target.clamp(position.minScrollExtent, position.maxScrollExtent);
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

// ── Category / trending specs ────────────────────────────────────────────────

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

enum _SearchViewPhase { landing, suggestions, loading, results, category }

const double _kEdge = 20.0;
const double _kGap = 14.0;

// ═════════════════════════════════════════════════════════════════════════════
// SearchScreen
// ═════════════════════════════════════════════════════════════════════════════

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, this.onBack});

  final VoidCallback? onBack;

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

  // Suggestions
  Timer? _suggestTimer;
  int _suggestId = 0;
  String _lastTyped = '';
  List<String> _liveSuggestions = [];

  // Search results (keyed by query+filter so stale/duplicate requests are safe)
  String _submittedQuery = '';
  String _wantedKey = '';
  String _resultsKey = '';
  final Map<String, Future<SearchResult>> _inflight = {};
  bool _isLoading = false;
  bool _isLoadingMore = false;
  SearchResult _searchResults = _emptyResult();
  SearchFilter _selectedFilter = SearchFilter.all;

  // Category page
  _SearchCategorySpec? _activeCategory;
  bool _catLoading = false;
  bool _catSongsExpanded = false;
  int _catRequestId = 0;
  List<SearchSongItem> _catSongs = const [];
  List<SearchAlbumItem> _catAlbums = const [];
  List<SearchArtistItem> _catArtists = const [];
  List<SearchPlaylistItem> _catPlaylists = const [];
  List<SearchVideoItem> _catVideos = const [];

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
    _suggestTimer?.cancel();
    _textCtrl.removeListener(_onTextChanged);
    _focusNode.removeListener(_onFocusChanged);
    _scrollCtrl.removeListener(_onScroll);
    SearchNav.phase.removeListener(_onPhase);
    _textCtrl.dispose();
    _focusNode.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  // ── Listeners ──────────────────────────────────────────────────────────────

  void _onFocusChanged() {
    if (!_focusNode.hasFocus && mounted) {
      if (SearchNav.phase.value == SearchPhase.typing &&
          _textCtrl.text.trim().isEmpty &&
          _submittedQuery.isEmpty) {
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
      if (_submittedQuery.isNotEmpty || _textCtrl.text.isNotEmpty) {
        _clearSearch();
      }
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
    final key = _wantedKey;
    setState(() => _isLoadingMore = true);
    try {
      final updated = await _dataService.loadMore(
        currentResult: _searchResults,
        filter: _selectedFilter,
      );
      if (mounted && key == _wantedKey) {
        setState(() {
          _searchResults = updated;
          _isLoadingMore = false;
        });
      }
    } catch (_) {
      if (mounted && key == _wantedKey) {
        setState(() => _isLoadingMore = false);
      }
    }
  }

  // ── Typing / suggestions (no deep search while typing) ─────────────────────

  void _onTextChanged() {
    final q = _textCtrl.text.trim();
    if (q == _lastTyped) return;
    _lastTyped = q;
    _suggestTimer?.cancel();
    final id = ++_suggestId;

    if (q.isEmpty) {
      setState(() {
        _liveSuggestions = [];
        if (_submittedQuery.isNotEmpty) {
          _submittedQuery = '';
          _searchResults = _emptyResult();
          _resultsKey = '';
          _wantedKey = '';
          _isLoading = false;
          _selectedFilter = SearchFilter.all;
        }
      });
      return;
    }

    setState(() => _liveSuggestions = _dataService.getInstantLocalSuggestions(q));

    _suggestTimer = Timer(const Duration(milliseconds: 120), () async {
      try {
        final s = await _dataService.getSuggestions(q);
        if (mounted && id == _suggestId) {
          setState(() => _liveSuggestions = s);
        }
      } catch (_) {}
    });
  }

  // ── Search execution ───────────────────────────────────────────────────────

  String _keyOf(String q, SearchFilter f) => '${f.name}|${q.toLowerCase()}';

  Future<void> _executeSearch(String query, SearchFilter filter) async {
    final key = _keyOf(query, filter);
    _wantedKey = key;
    final future = _inflight[key] ??= _dataService
        .search(query: query, filter: filter)
        .whenComplete(() => _inflight.remove(key));
    try {
      final results = await future;
      if (!mounted || _wantedKey != key) return;
      setState(() {
        _searchResults = results;
        _resultsKey = key;
        _isLoading = false;
      });
    } catch (_) {
      if (mounted && _wantedKey == key) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _submitSearch(String query, {SearchFilter filter = SearchFilter.all}) {
    final clean = query.trim();
    if (clean.isEmpty) return;
    _suggestTimer?.cancel();
    _suggestId++;
    _focusNode.unfocus();
    _lastTyped = clean;
    if (_textCtrl.text.trim() != clean) {
      _textCtrl.value = TextEditingValue(
        text: clean,
        selection: TextSelection.collapsed(offset: clean.length),
      );
    }
    _dataService.addRecent(clean);

    final key = _keyOf(clean, filter);
    final cached = _resultsKey == key && !_searchResults.isEmpty;
    setState(() {
      _submittedQuery = clean;
      _activeCategory = null;
      _catRequestId++;
      _liveSuggestions = [];
      _selectedFilter = filter;
      _isLoading = !cached;
      if (!cached) {
        _searchResults = _emptyResult();
        _resultsKey = '';
      }
    });
    _scrollTop();
    if (!cached) _executeSearch(clean, filter);
  }

  void _onFilterSelected(SearchFilter filter) {
    if (_selectedFilter == filter || _submittedQuery.isEmpty) return;
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
      if (!hasCachedForFilter) _isLoading = true;
    });
    _executeSearch(_submittedQuery, filter);
  }

  void _clearSearch() {
    _suggestTimer?.cancel();
    _suggestId++;
    _wantedKey = '';
    _resultsKey = '';
    _submittedQuery = '';
    _lastTyped = '';
    _textCtrl.clear();
    setState(() {
      _liveSuggestions = [];
      _searchResults = _emptyResult();
      _isLoading = false;
      _isLoadingMore = false;
      _selectedFilter = SearchFilter.all;
    });
  }

  void _cancelSearch() {
    _suggestTimer?.cancel();
    _focusNode.unfocus();
    SearchNav.phase.value = SearchPhase.bar;
    _clearSearch();
  }

  bool get _isTyping =>
      SearchNav.phase.value == SearchPhase.typing || _focusNode.hasFocus;

  void _goBack() {
    if (_isTyping) {
      _cancelSearch();
    } else if (_submittedQuery.isNotEmpty) {
      _clearSearch();
    } else if (_activeCategory != null) {
      _closeCategory();
    } else {
      widget.onBack?.call();
    }
  }

  void _scrollTop() {
    if (_scrollCtrl.hasClients && _scrollCtrl.offset > 0) {
      _scrollCtrl.animateTo(
        0,
        duration: const Duration(milliseconds: 340),
        curve: const _SpringCurve(Springs.smooth),
      );
    }
  }

  // ── Category page ──────────────────────────────────────────────────────────

  Future<void> _openCategory(_SearchCategorySpec spec) async {
    HapticFeedback.lightImpact();
    _focusNode.unfocus();
    if (SearchNav.phase.value != SearchPhase.bar) {
      SearchNav.phase.value = SearchPhase.bar;
    }
    final id = ++_catRequestId;
    if (_scrollCtrl.hasClients) _scrollCtrl.jumpTo(0);
    setState(() {
      _activeCategory = spec;
      _catLoading = true;
      _catSongsExpanded = false;
      _catSongs = const [];
      _catAlbums = const [];
      _catArtists = const [];
      _catPlaylists = const [];
      _catVideos = const [];
    });

    Future<SearchResult> safe(SearchFilter f) async {
      try {
        return await _dataService.search(query: spec.query, filter: f);
      } catch (_) {
        return _emptyResult();
      }
    }

    final res = await Future.wait([
      safe(SearchFilter.all),
      safe(SearchFilter.songs),
      safe(SearchFilter.albums),
      safe(SearchFilter.artists),
      safe(SearchFilter.featuredPlaylists),
    ]);
    if (!mounted || id != _catRequestId) return;
    setState(() {
      _catSongs = res[1].songs.isNotEmpty ? res[1].songs : res[0].songs;
      _catAlbums = res[2].albums.isNotEmpty ? res[2].albums : res[0].albums;
      _catArtists =
          res[3].artists.isNotEmpty ? res[3].artists : res[0].artists;
      _catPlaylists =
          res[4].playlists.isNotEmpty ? res[4].playlists : res[0].playlists;
      _catVideos = res[0].videos;
      _catLoading = false;
    });
  }

  void _closeCategory() {
    _catRequestId++;
    setState(() {
      _activeCategory = null;
      _catLoading = false;
    });
  }

  // ── Playback / navigation ──────────────────────────────────────────────────

  void _playSong(List<Track> list, int index, {String? title}) {
    if (list.isEmpty) return;
    final startIdx = index.clamp(0, list.length - 1);
    final label = title ??
        (_submittedQuery.isNotEmpty ? _submittedQuery : 'search');
    final ctx = PlaybackContext(
      type: PlaybackContextType.search,
      id: label,
      tracks: list,
      startTrack: list[startIdx],
      title: label,
    );
    context.read<PlayerState>().setQueue(
          list,
          startIndex: startIdx,
          context: ctx,
        );
  }

  List<Track> _tracksForAlbum(SearchAlbumItem a) => _searchResults.songs
      .map((s) => s.toTrack())
      .where((t) => t.album.toLowerCase() == a.title.toLowerCase())
      .toList();

  List<Track> _tracksForArtist(String name) => _searchResults.songs
      .map((s) => s.toTrack())
      .where((t) => t.artist.toLowerCase().contains(name.toLowerCase()))
      .toList();

  void _playCollection(SearchItem item, {bool shuffle = false}) {
    List<Track> tracks = switch (item) {
      SearchAlbumItem a => _tracksForAlbum(a),
      SearchArtistItem a => _tracksForArtist(a.title),
      _ => const <Track>[],
    };
    if (tracks.isEmpty) {
      _handleItemTap(item);
      return;
    }
    tracks = [...tracks];
    if (shuffle) tracks.shuffle();
    HapticFeedback.mediumImpact();
    _playSong(tracks, 0, title: item.title);
  }

  void _handleItemTap(SearchItem item) {
    HapticFeedback.lightImpact();
    final hiRes = _hiResUrl(item);

    if (item is SearchSongItem) {
      // Seed with the chosen song so Smart Queue builds around it.
      _playSong([item.toTrack()], 0);
      return;
    }
    if (item is SearchArtistItem) {
      Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) => ArtistScreen(
            artistName: item.title,
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
            artistName: _playlistSub(item).isNotEmpty
                ? _playlistSub(item)
                : 'Playlist',
            coverUrl: hiRes,
            browseId: item.browseId,
          ),
        ),
      );
      return;
    }
    if (item is SearchVideoItem) {
      _playSong([item.toTrack()], 0);
      PlayerShell.requestOpen();
    }
  }

  String _hiResUrl(SearchItem item) => item.thumbnailUrlHiRes.isNotEmpty
      ? item.thumbnailUrlHiRes
      : item.thumbnailUrl;

  bool _isTrackActive(Track track, String? activeTrackId) {
    if (activeTrackId == null || activeTrackId.isEmpty) return false;
    return activeTrackId == track.id ||
        activeTrackId == 'yt-${track.id}' ||
        track.id == 'yt-$activeTrackId';
  }

  void _showMore(SearchItem item) {
    HapticFeedback.mediumImpact();
    if (item is SearchSongItem) {
      ZenDropdown.showTrackMenu(context: context, track: item.toTrack());
      return;
    }
    if (item is SearchVideoItem) {
      ZenDropdown.showTrackMenu(context: context, track: item.toTrack());
      return;
    }
    final store = LibraryStore.instance;
    final img = _hiResUrl(item);
    final items = <ZenDropdownItem>[
      ZenDropdownItem(
        title: 'Play',
        icon: CupertinoIcons.play_fill,
        onTap: () => _playCollection(item),
      ),
      ZenDropdownItem(
        title: 'Shuffle',
        icon: CupertinoIcons.shuffle,
        onTap: () => _playCollection(item, shuffle: true),
      ),
      if (item is SearchArtistItem)
        ZenDropdownItem(
          title: store.isFollowing(item.title)
              ? 'Unfollow Artist'
              : 'Follow Artist',
          icon: store.isFollowing(item.title)
              ? CupertinoIcons.star_fill
              : CupertinoIcons.star,
          onTap: () => store.toggleFollow(item.title, img),
        ),
      if (item is SearchAlbumItem)
        ZenDropdownItem(
          title: store.isAlbumSaved(item.title, item.subtitle)
              ? 'Remove from Library'
              : 'Add to Library',
          icon: store.isAlbumSaved(item.title, item.subtitle)
              ? CupertinoIcons.checkmark_circle_fill
              : CupertinoIcons.plus_circle,
          onTap: () => store.toggleAlbum(item.title, item.subtitle, img),
        ),
      ZenDropdownItem(
        title: 'View Details',
        icon: CupertinoIcons.arrow_up_right_circle,
        onTap: () => _handleItemTap(item),
      ),
    ];
    final sub = _cleanSub(item.subtitle);
    final shareKind = item is SearchArtistItem ? 'artist' : 'album';
    ZenDropdown.show(
      context: context,
      title: item.title,
      subtitle: sub.isNotEmpty ? sub : null,
      coverUrl: img,
      isCircularCover: item is SearchArtistItem,
      shareText: sub.isNotEmpty ? '${item.title} – $sub' : item.title,
      shareUrl: 'https://zenify.app/$shareKind/${Uri.encodeComponent(item.title)}',
      items: items,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Build
  // ═══════════════════════════════════════════════════════════════════════════

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final bottomPad = MediaQuery.paddingOf(context).bottom;
    final topPad = MediaQuery.paddingOf(context).top;
    final typing = _isTyping;
    final text = _textCtrl.text.trim();
    final hasQuery = _submittedQuery.isNotEmpty;
    final category = _activeCategory;

    final editing = (_focusNode.hasFocus || _submittedQuery.isEmpty) &&
        text.isNotEmpty &&
        text != _submittedQuery;

    final _SearchViewPhase phase;
    if (editing) {
      phase = _SearchViewPhase.suggestions;
    } else if (hasQuery) {
      phase = (_isLoading && _searchResults.isEmpty)
          ? _SearchViewPhase.loading
          : _SearchViewPhase.results;
    } else if (category != null) {
      phase = _SearchViewPhase.category;
    } else {
      phase = _SearchViewPhase.landing;
    }

    final showBack = typing || hasQuery || category != null;

    return PopScope(
      canPop: widget.onBack == null && !showBack,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _goBack();
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
                  child: SizedBox(
                    height: phase == _SearchViewPhase.category ? 0 : topPad + 60,
                  ),
                ),
                SliverToBoxAdapter(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 340),
                    switchInCurve: const _SpringCurve(Springs.smooth),
                    switchOutCurve: Curves.easeInCubic,
                    layoutBuilder: (currentChild, previousChildren) {
                      return Stack(
                        alignment: Alignment.topCenter,
                        children: [...previousChildren, ?currentChild],
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
                      _SearchViewPhase.landing => _buildLanding(
                          key: const ValueKey('phase_landing'),
                        ),
                      _SearchViewPhase.suggestions => _buildSuggestions(
                          key: const ValueKey('phase_suggestions'),
                        ),
                      _SearchViewPhase.loading => const _SearchShimmerView(
                          key: ValueKey('phase_loading'),
                        ),
                      _SearchViewPhase.results => _buildResults(
                          key: ValueKey('phase_results_$_submittedQuery'),
                        ),
                      _SearchViewPhase.category => _buildCategoryPage(
                          category!,
                          topPad,
                          key: ValueKey('phase_category_${category.title}'),
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
                SliverToBoxAdapter(child: SizedBox(height: 180 + bottomPad)),
              ],
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: DynamicIslandHeader(
                title: category != null && !typing && !hasQuery
                    ? category.title
                    : 'Search',
                showBack: showBack,
                isDockPage: !showBack,
                showProfile: true,
                topPadding: topPad + 4,
                centerWidget: (typing || hasQuery) ? _topField() : null,
                onBack: _goBack,
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
            // Normal keyboard: no enableSuggestions:false (that flips Android
            // into a password-style keyboard).
            keyboardType: TextInputType.text,
            textInputAction: TextInputAction.search,
            textCapitalization: TextCapitalization.none,
            autocorrect: false,
            cursorColor: AppColors.accent,
            style: _bodyStyle(
              fontSize: 15,
              color: AppColors.textPrimary,
            ),
            decoration: InputDecoration(
              isDense: true,
              border: InputBorder.none,
              contentPadding: EdgeInsets.zero,
              hintText: 'Artists, Songs, Lyrics & Videos',
              hintStyle: _bodyStyle(
                fontSize: 14,
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

  List<String> _catalogCovers(List<Track> src) {
    final seen = <String>{};
    final out = <String>[];
    for (final t in src) {
      final u = t.coverUrl;
      if (u.isNotEmpty && seen.add(u)) out.add(u);
      if (out.length >= 60) break;
    }
    return out;
  }

  // ── Small shared builders ──────────────────────────────────────────────────

  Widget _sectionHeader(
    String title, {
    String? actionTitle,
    VoidCallback? onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: SectionHeader(
        title: title,
        actionTitle: actionTitle,
        onActionTap: onTap,
      ),
    );
  }

  Widget _divider(double indent) => Divider(
        height: 1,
        indent: indent,
        endIndent: _kEdge,
        color: Colors.white.withValues(alpha: 0.06),
      );

  Widget _carousel({
    required String title,
    required double height,
    required double extent,
    required int count,
    required Widget Function(int i) item,
    VoidCallback? onSeeAll,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeader(
          title,
          actionTitle: onSeeAll == null ? null : 'See All',
          onTap: onSeeAll,
        ),
        SizedBox(
          height: height,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: _SearchSnapPhysics(itemExtent: extent + _kGap),
            padding: const EdgeInsets.symmetric(horizontal: _kEdge),
            itemCount: count,
            separatorBuilder: (_, _) => const SizedBox(width: _kGap),
            itemBuilder: (context, i) => SpringIn(
              delayMs: (i % 5) * 32,
              rise: 18,
              child: item(i),
            ),
          ),
        ),
        const SizedBox(height: 14),
      ],
    );
  }

  Widget _albumsCarousel(List<SearchAlbumItem> albums, {VoidCallback? seeAll}) {
    return _carousel(
      title: 'Albums',
      height: 256,
      extent: 170,
      count: albums.length,
      onSeeAll: seeAll,
      item: (i) {
        final a = albums[i];
        return MediaCard(
          width: 170.0,
          twoLineTitle: true,
          title: a.title,
          subtitle: _albumSub(a),
          imageUrl: _hiResUrl(a),
          onTap: () => _handleItemTap(a),
        );
      },
    );
  }

  Widget _playlistsCarousel(
    List<SearchPlaylistItem> playlists, {
    VoidCallback? seeAll,
  }) {
    return _carousel(
      title: 'Playlists',
      height: 256,
      extent: 170,
      count: playlists.length,
      onSeeAll: seeAll,
      item: (i) {
        final p = playlists[i];
        return MediaCard(
          width: 170.0,
          twoLineTitle: true,
          title: p.title,
          subtitle: _playlistSub(p),
          imageUrl: _hiResUrl(p),
          onTap: () => _handleItemTap(p),
        );
      },
    );
  }

  Widget _artistsCarousel(
    List<SearchArtistItem> artists, {
    VoidCallback? seeAll,
  }) {
    return _carousel(
      title: 'Artists',
      height: 186,
      extent: 130,
      count: artists.length,
      onSeeAll: seeAll,
      item: (i) {
        final a = artists[i];
        return PressableScale(
          scale: 0.96,
          onTap: () => _handleItemTap(a),
          child: SizedBox(
            width: 130,
            child: Column(
              children: [
                _Artwork(
                  url: _hiResUrl(a),
                  title: a.title,
                  size: 130,
                  circle: true,
                ),
                const SizedBox(height: 9),
                Text(
                  a.title,
                  style: _displayStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    height: 1.2,
                  ),
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _videosCarousel(List<SearchVideoItem> videos, {VoidCallback? seeAll}) {
    return _carousel(
      title: 'Videos',
      height: 214,
      extent: 256,
      count: videos.length,
      onSeeAll: seeAll,
      item: (i) {
        final v = videos[i];
        final meta = _videoMeta(v);
        return PressableScale(
          scale: 0.96,
          onTap: () => _handleItemTap(v),
          child: SizedBox(
            width: 256,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _VideoThumb(video: v, imageUrl: _hiResUrl(v)),
                const SizedBox(height: 8),
                Text(
                  v.title,
                  style: _displayStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                    height: 1.2,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (meta.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    meta,
                    style: _bodyStyle(fontSize: 13),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  /// Song rows: artwork, title, artist, vertical three-dot menu.
  Widget _songRows(List<SearchSongItem> songs, {bool ranked = false}) {
    return Selector<PlayerState, ({String? id, bool playing})>(
      selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
      builder: (context, active, _) {
        return Column(
          children: List.generate(songs.length, (i) {
            final s = songs[i];
            final track = s.toTrack();
            final isActive = _isTrackActive(track, active.id);
            return SpringIn(
              delayMs: i < 10 ? i * 22 : 0,
              rise: 12,
              child: Column(
                children: [
                  _SongRow(
                    item: s,
                    rank: ranked ? i + 1 : null,
                    isActive: isActive,
                    isPlaying: isActive && active.playing,
                    onTap: () {
                      HapticFeedback.lightImpact();
                      _playSong([track], 0);
                    },
                    onMore: () => _showMore(s),
                  ),
                  if (i < songs.length - 1) _divider(ranked ? 117 : 87),
                ],
              ),
            );
          }),
        );
      },
    );
  }

  Widget _likeCircle(Track track) {
    final store = LibraryStore.instance;
    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        final liked = store.isLiked(track);
        return ZenActionCircle(
          size: 44,
          iconSize: 20,
          active: liked,
          icon: liked ? CupertinoIcons.heart_fill : CupertinoIcons.heart,
          onTap: () => store.toggleLike(track),
        );
      },
    );
  }

  Widget _moreButton(VoidCallback onTap) {
    return PressableScale(
      scale: 0.88,
      onTap: onTap,
      child: const Padding(
        padding: EdgeInsets.all(8),
        child: Icon(
          Icons.more_vert_rounded,
          size: 22,
          color: AppColors.textSecondary,
        ),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase: Landing  (recents · trending · categories)
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildLanding({Key? key}) {
    return Column(
      key: key,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ValueListenableBuilder<List<String>>(
          valueListenable: _dataService.recentsNotifier,
          builder: (context, recents, _) {
            if (recents.isEmpty) return const SizedBox.shrink();
            final visible = recents.take(5).toList();
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _sectionHeader(
                  'Recent Searches',
                  actionTitle: 'Clear',
                  onTap: () {
                    HapticFeedback.lightImpact();
                    _dataService.clearRecents();
                  },
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
                          horizontal: _kEdge,
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
        _sectionHeader('Trending Now'),
        SizedBox(
          height: 44,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: _kEdge),
            itemCount: _kTrendingPills.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final pill = _kTrendingPills[i];
              return SpringIn(
                delayMs: 20 * i,
                rise: 10,
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
                      color: Colors.white.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(22),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.11),
                        width: 0.6,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          CupertinoIcons.arrow_up_right,
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
            },
          ),
        ),
        const SizedBox(height: 20),
        _sectionHeader('Browse Categories'),
        Padding(
          padding: const EdgeInsets.fromLTRB(_kEdge, 2, _kEdge, 26),
          child: GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _kSearchCategories.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 1.42,
            ),
            itemBuilder: (context, i) {
              final cat = _kSearchCategories[i];
              return SpringIn(
                delayMs: (i % 6) * 26,
                rise: 16,
                child: ValueListenableBuilder<List<Track>>(
                  valueListenable: CatalogDataSource.tracksNotifier,
                  builder: (context, catalog, _) => _BrowseCategoryTile(
                    spec: cat,
                    index: i,
                    covers: _catalogCovers(
                      catalog.isNotEmpty ? catalog : CatalogDataSource.allTracks,
                    ),
                    onTap: () => _openCategory(cat),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase: Suggestions
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildSuggestions({Key? key}) {
    final typed = _textCtrl.text.trim();
    final List<String> list;
    if (typed.isEmpty) {
      list = _liveSuggestions;
    } else {
      final norm = typed.toLowerCase();
      final filtered = _liveSuggestions.where((s) => s.toLowerCase() != norm).toList();
      list = [typed, ...filtered];
    }
    return Column(
      key: key,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: List.generate(list.length, (i) {
        final s = list[i];
        final isDirectTyped = typed.isNotEmpty && s.toLowerCase() == typed.toLowerCase();
        return SpringIn(
          delayMs: i * 18,
          rise: 12,
          child: PressableScale(
            scale: 0.985,
            onTap: () => _submitSearch(s),
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: _kEdge,
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
                  Icon(
                    CupertinoIcons.search,
                    size: 17,
                    color: isDirectTyped ? AppColors.accent : AppColors.textTertiary,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: isDirectTyped
                        ? RichText(
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            text: TextSpan(
                              style: _bodyStyle(fontSize: 16, color: AppColors.textPrimary),
                              children: [
                                const TextSpan(
                                  text: 'Search for ',
                                  style: TextStyle(color: AppColors.textSecondary),
                                ),
                                TextSpan(
                                  text: '"$typed"',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                              ],
                            ),
                          )
                        : _highlighted(s, typed.toLowerCase()),
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

  Widget _highlighted(String text, String queryLower) {
    final idx = queryLower.isEmpty ? -1 : text.toLowerCase().indexOf(queryLower);
    if (idx < 0) {
      return Text(
        text,
        style: _bodyStyle(fontSize: 16, color: AppColors.textPrimary),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      );
    }
    final end = idx + queryLower.length;
    return RichText(
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      text: TextSpan(
        style: _bodyStyle(fontSize: 16),
        children: [
          if (idx > 0) TextSpan(text: text.substring(0, idx)),
          TextSpan(
            text: text.substring(idx, end),
            style: _bodyStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: AppColors.textPrimary,
            ),
          ),
          if (end < text.length) TextSpan(text: text.substring(end)),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase: Category page (own layout: hero + browse sections)
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildCategoryPage(
    _SearchCategorySpec spec,
    double topPad, {
    Key? key,
  }) {
    final songs = _catSongs;
    final visibleSongs = _catSongsExpanded || songs.length <= 10
        ? songs
        : songs.take(10).toList();
    final catIndex = _kSearchCategories.indexOf(spec);
    final loaded = <String>[
      for (final s in _catSongs)
        if (s.thumbnailUrl.isNotEmpty) s.thumbnailUrl,
      for (final a in _catAlbums)
        if (_hiResUrl(a).isNotEmpty) _hiResUrl(a),
    ];
    final covers = loaded.isNotEmpty
        ? loaded
        : _catalogCovers(CatalogDataSource.allTracks);
    final nothing = !_catLoading &&
        songs.isEmpty &&
        _catAlbums.isEmpty &&
        _catArtists.isEmpty &&
        _catPlaylists.isEmpty &&
        _catVideos.isEmpty;

    return Column(
      key: key,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _CategoryHero(
          spec: spec,
          index: catIndex < 0 ? 0 : catIndex,
          covers: covers,
          topPad: topPad,
          onPlay: () {
            if (songs.isEmpty) return;
            HapticFeedback.mediumImpact();
            _playSong(songs.map((s) => s.toTrack()).toList(), 0,
                title: spec.title);
          },
          onShuffle: () {
            if (songs.isEmpty) return;
            HapticFeedback.mediumImpact();
            final t = songs.map((s) => s.toTrack()).toList()..shuffle();
            _playSong(t, 0, title: spec.title);
          },
        ),
        if (_catLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 48),
            child: Center(child: CupertinoActivityIndicator(radius: 13)),
          ),
        if (nothing) _buildEmptyNotice('Nothing found in ${spec.title}.'),
        if (songs.isNotEmpty) ...[
          _sectionHeader(
            'Top Songs',
            actionTitle: songs.length > 10
                ? (_catSongsExpanded ? 'Show Less' : 'Show All')
                : null,
            onTap: () => setState(() => _catSongsExpanded = !_catSongsExpanded),
          ),
          _songRows(visibleSongs, ranked: true),
          const SizedBox(height: 18),
        ],
        if (_catAlbums.isNotEmpty) _albumsCarousel(_catAlbums),
        if (_catArtists.isNotEmpty) _artistsCarousel(_catArtists),
        if (_catPlaylists.isNotEmpty) _playlistsCarousel(_catPlaylists),
        if (_catVideos.isNotEmpty) _videosCarousel(_catVideos),
      ],
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase: Results
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildResults({Key? key}) {
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
          _buildDidYouMean(r.correctedQuery!),
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
          _buildEmptyResults()
        else
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            switchInCurve: const _SpringCurve(Springs.snappy),
            switchOutCurve: Curves.easeInCubic,
            layoutBuilder: (currentChild, previousChildren) {
              return Stack(
                alignment: Alignment.topCenter,
                children: [...previousChildren, ?currentChild],
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
                SearchFilter.all => _buildOverview(r),
                SearchFilter.songs => _buildFilteredSongs(r.songs),
                SearchFilter.artists => _buildFilteredArtists(r.artists),
                SearchFilter.albums => _buildFilteredAlbums(r.albums),
                SearchFilter.featuredPlaylists ||
                SearchFilter.communityPlaylists =>
                  _buildFilteredPlaylists(r.playlists),
                SearchFilter.videos => _buildFilteredVideos(r.videos),
              },
            ),
          ),
      ],
    );
  }

  Widget _buildDidYouMean(String correction) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(_kEdge, 10, _kEdge, 4),
      child: PressableScale(
        scale: 0.97,
        onTap: () => _submitSearch(correction, filter: _selectedFilter),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(26),
          ),
          child: RichText(
            text: TextSpan(
              style: _bodyStyle(fontSize: 13.5),
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
    );
  }

  Widget _buildEmptyResults() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 68, 32, 48),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'No Results for "$_submittedQuery"',
              style: _displayStyle(fontSize: 20),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Check the spelling or try a new search.',
              style: _bodyStyle(fontSize: 14),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyNotice(String text) {
    if (_isLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 48),
        child: Center(child: CupertinoActivityIndicator(radius: 12)),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
      child: Center(
        child: Text(
          text,
          style: _bodyStyle(fontSize: 15),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  // ── Overview ("All") ───────────────────────────────────────────────────────

  Widget _buildOverview(SearchResult r) {
    final queries = <String>{
      _norm(_submittedQuery),
      if (r.correctedQuery != null) _norm(r.correctedQuery!),
    }..removeWhere((e) => e.isEmpty);
    final tops = _rankTopResults(r, queries.toList());

    final topSec = tops.isEmpty ? null : _buildTopResults(tops);
    final songsSec = r.songs.isEmpty
        ? null
        : Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _sectionHeader(
                'Songs',
                actionTitle: 'See All',
                onTap: () => _onFilterSelected(SearchFilter.songs),
              ),
              _songRows(r.songs.take(5).toList()),
              const SizedBox(height: 14),
            ],
          );
    final albumsSec = r.albums.isEmpty
        ? null
        : _albumsCarousel(
            r.albums,
            seeAll: () => _onFilterSelected(SearchFilter.albums),
          );
    final artistsSec = r.artists.isEmpty
        ? null
        : _artistsCarousel(
            r.artists,
            seeAll: () => _onFilterSelected(SearchFilter.artists),
          );
    final playlistsSec = r.playlists.isEmpty
        ? null
        : _playlistsCarousel(
            r.playlists,
            seeAll: () => _onFilterSelected(SearchFilter.featuredPlaylists),
          );
    final videosSec = r.videos.isEmpty
        ? null
        : _videosCarousel(
            r.videos,
            seeAll: () => _onFilterSelected(SearchFilter.videos),
          );

    final ordered = switch (r.intent.layoutMode) {
      SearchLayoutMode.exactArtist || SearchLayoutMode.artistType => [
          songsSec, albumsSec, artistsSec, playlistsSec, videosSec,
        ],
      SearchLayoutMode.albumOrPlaylist => [
          albumsSec, playlistsSec, songsSec, artistsSec, videosSec,
        ],
      SearchLayoutMode.songTitle || SearchLayoutMode.generic => [
          songsSec, albumsSec, artistsSec, playlistsSec, videosSec,
        ],
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ?topSec,
        for (final w in ordered) ?w,
      ],
    );
  }

  // ── Top-result ranking: only genuine matches, 0..5 of them ─────────────────

  double _scoreItem(SearchItem item, List<String> queries, SearchLayoutMode m) {
    final artistMode =
        m == SearchLayoutMode.exactArtist || m == SearchLayoutMode.artistType;
    final secondary = item is SearchArtistItem ? '' : item.subtitle;
    var s = 0.0;
    for (final q in queries) {
      s = math.max(s, _matchScore(q, item.title, secondary));
    }
    final w = switch (item) {
      SearchArtistItem _ => artistMode ? 1.05 : 1.0,
      SearchSongItem _ => m == SearchLayoutMode.songTitle
          ? 1.04
          : (artistMode ? 0.9 : 1.0),
      SearchAlbumItem _ => m == SearchLayoutMode.albumOrPlaylist ? 1.04 : 0.97,
      SearchPlaylistItem _ =>
        m == SearchLayoutMode.albumOrPlaylist ? 0.98 : 0.85,
      SearchVideoItem _ => 0.9,
      _ => 0.8,
    };
    return (s * w).clamp(0.0, 1.0);
  }

  List<_TopCand> _rankTopResults(SearchResult r, List<String> queries) {
    if (queries.isEmpty) return const [];
    final mode = r.intent.layoutMode;
    final cands = <String, _TopCand>{};

    String keyOf(SearchItem i) =>
        '${i.runtimeType}|${_norm(i.title)}|${_norm(i.subtitle)}';

    final serviceTop = r.topResult?.item;
    final serviceKey = serviceTop == null ? null : keyOf(serviceTop);

    void add(SearchItem item) {
      final k = keyOf(item);
      if (cands.containsKey(k)) return;
      var score = _scoreItem(item, queries, mode);
      if (k == serviceKey && score >= 0.5) score = math.min(1.0, score + 0.04);
      cands[k] = _TopCand(item, score);
    }

    if (serviceTop != null) add(serviceTop);
    r.artists.take(10).forEach(add);
    r.songs.take(15).forEach(add);
    r.albums.take(10).forEach(add);
    r.playlists.take(8).forEach(add);
    r.videos.take(8).forEach(add);

    final sorted = cands.values.toList()
      ..sort((a, b) => b.score.compareTo(a.score));
    if (sorted.isEmpty || sorted.first.score < 0.6) return const [];

    final best = sorted.first.score;
    final out = <_TopCand>[sorted.first];
    for (final c in sorted.skip(1)) {
      if (out.length >= 5) break;
      if (c.score >= 0.7 && c.score >= best - 0.15) out.add(c);
    }
    return out;
  }

  // ── Top results UI: one distinct layout per type, no cards, no tags ────────

  Widget _buildTopResults(List<_TopCand> tops) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeader(tops.length > 1 ? 'Top Results' : 'Top Result'),
        SpringIn(
          delayMs: 20,
          rise: 20,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(_kEdge, 4, _kEdge, 8),
            child: _buildHero(tops.first.item),
          ),
        ),
        for (var i = 1; i < tops.length; i++) _compactRow(tops[i].item),
        const SizedBox(height: 18),
      ],
    );
  }

  Widget _buildHero(SearchItem item) {
    return switch (item) {
      SearchSongItem s => _songHero(s),
      SearchArtistItem a => _artistHero(a),
      SearchAlbumItem a => _albumHero(a),
      SearchPlaylistItem p => _playlistHero(p),
      SearchVideoItem v => _videoHero(v),
      _ => const SizedBox.shrink(),
    };
  }

  Widget _heroLayout({
    required Widget art,
    required String title,
    String subtitle = '',
    bool verified = false,
    required VoidCallback onTap,
    required VoidCallback onMore,
    required Widget actions,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PressableScale(
          scale: 0.985,
          onTap: onTap,
          child: Row(
            children: [
              art,
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            title,
                            style: _displayStyle(
                              fontSize: 22,
                              letterSpacing: -0.5,
                              height: 1.15,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (verified) ...[
                          const SizedBox(width: 6),
                          const Icon(
                            CupertinoIcons.checkmark_seal_fill,
                            size: 16,
                            color: AppColors.accent,
                          ),
                        ],
                      ],
                    ),
                    if (subtitle.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: _bodyStyle(fontSize: 14.5, height: 1.25),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              _moreButton(onMore),
            ],
          ),
        ),
        const SizedBox(height: 16),
        actions,
      ],
    );
  }

  Widget _songHero(SearchSongItem s) {
    final track = s.toTrack();
    return Selector<PlayerState, ({String? id, bool playing})>(
      selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
      builder: (context, active, _) {
        final isCurrent = _isTrackActive(track, active.id);
        final playing = isCurrent && active.playing;
        return _heroLayout(
          art: _Artwork(
            url: _hiResUrl(s),
            title: s.title,
            size: 108,
            radius: 12,
            active: isCurrent,
            playing: playing,
          ),
          title: s.title,
          subtitle: _cleanSub(s.subtitle),
          onTap: () => _handleItemTap(s),
          onMore: () => _showMore(s),
          actions: Row(
            children: [
              Expanded(
                child: ZenPlayButton(
                  height: 44,
                  fontSize: 15,
                  iconSize: 18,
                  isPlaying: playing,
                  label: playing ? 'Pause' : 'Play',
                  expanded: true,
                  onTap: () {
                    if (isCurrent) {
                      context.read<PlayerState>().togglePlay();
                    } else {
                      _handleItemTap(s);
                    }
                  },
                ),
              ),
              const SizedBox(width: 10),
              _likeCircle(track),
            ],
          ),
        );
      },
    );
  }

  Widget _artistHero(SearchArtistItem a) {
    final store = LibraryStore.instance;
    return _heroLayout(
      art: _Artwork(
        url: _hiResUrl(a),
        title: a.title,
        size: 108,
        circle: true,
      ),
      title: a.title,
      verified: a.isVerified,
      onTap: () => _handleItemTap(a),
      onMore: () => _showMore(a),
      actions: Row(
        children: [
          Expanded(
            child: ZenPlayButton(
              height: 44,
              fontSize: 15,
              iconSize: 18,
              isPlaying: false,
              label: 'Play',
              expanded: true,
              onTap: () => _playCollection(a),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: ZenShuffleButton(
              height: 44,
              fontSize: 15,
              iconSize: 17,
              expanded: true,
              label: 'Shuffle',
              onTap: () => _playCollection(a, shuffle: true),
            ),
          ),
          const SizedBox(width: 10),
          AnimatedBuilder(
            animation: store,
            builder: (context, _) {
              final followed = store.isFollowing(a.title);
              return ZenActionCircle(
                size: 44,
                iconSize: 20,
                active: followed,
                icon: followed ? CupertinoIcons.star_fill : CupertinoIcons.star,
                onTap: () => store.toggleFollow(a.title, _hiResUrl(a)),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _albumHero(SearchAlbumItem a) {
    final store = LibraryStore.instance;
    return _heroLayout(
      art: _Artwork(url: _hiResUrl(a), title: a.title, size: 128, radius: 12),
      title: a.title,
      subtitle: _albumSub(a),
      onTap: () => _handleItemTap(a),
      onMore: () => _showMore(a),
      actions: Row(
        children: [
          Expanded(
            child: ZenPlayButton(
              height: 44,
              fontSize: 15,
              iconSize: 18,
              isPlaying: false,
              label: 'Play',
              expanded: true,
              onTap: () => _playCollection(a),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: ZenShuffleButton(
              height: 44,
              fontSize: 15,
              iconSize: 17,
              expanded: true,
              label: 'Shuffle',
              onTap: () => _playCollection(a, shuffle: true),
            ),
          ),
          const SizedBox(width: 10),
          AnimatedBuilder(
            animation: store,
            builder: (context, _) {
              final saved = store.isAlbumSaved(a.title, a.subtitle);
              return ZenActionCircle(
                size: 44,
                iconSize: 20,
                active: saved,
                icon: saved ? CupertinoIcons.checkmark : CupertinoIcons.plus,
                onTap: () =>
                    store.toggleAlbum(a.title, a.subtitle, _hiResUrl(a)),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _playlistHero(SearchPlaylistItem p) {
    return _heroLayout(
      art: _Artwork(url: _hiResUrl(p), title: p.title, size: 128, radius: 12),
      title: p.title,
      subtitle: _playlistSub(p),
      onTap: () => _handleItemTap(p),
      onMore: () => _showMore(p),
      actions: Row(
        children: [
          Expanded(
            child: ZenPlayButton(
              height: 44,
              fontSize: 15,
              iconSize: 18,
              isPlaying: false,
              label: 'Open',
              expanded: true,
              onTap: () => _handleItemTap(p),
            ),
          ),
        ],
      ),
    );
  }

  Widget _videoHero(SearchVideoItem v) {
    final track = v.toTrack();
    final meta = _videoMeta(v);
    return Selector<PlayerState, ({String? id, bool playing})>(
      selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
      builder: (context, active, _) {
        final isCurrent = _isTrackActive(track, active.id);
        final playing = isCurrent && active.playing;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            PressableScale(
              scale: 0.985,
              onTap: () => _handleItemTap(v),
              child: _VideoThumb(
                video: v,
                imageUrl: _hiResUrl(v),
                radius: 14,
                bigPlay: true,
              ),
            ),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        v.title,
                        style: _displayStyle(
                          fontSize: 19,
                          letterSpacing: -0.4,
                          height: 1.2,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (meta.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          meta,
                          style: _bodyStyle(fontSize: 14),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                ),
                _moreButton(() => _showMore(v)),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: ZenPlayButton(
                    height: 44,
                    fontSize: 15,
                    iconSize: 18,
                    isPlaying: playing,
                    label: playing ? 'Pause' : 'Play',
                    expanded: true,
                    onTap: () {
                      if (isCurrent) {
                        context.read<PlayerState>().togglePlay();
                      } else {
                        _handleItemTap(v);
                      }
                    },
                  ),
                ),
                const SizedBox(width: 10),
                _likeCircle(track),
              ],
            ),
          ],
        );
      },
    );
  }

  /// Secondary top results (#2–#5): compact row in each type's own style.
  Widget _compactRow(SearchItem item) {
    switch (item) {
      case SearchSongItem s:
        return Column(
          children: [
            _songRows([s]),
            _divider(87),
          ],
        );
      case SearchArtistItem a:
        return Column(
          children: [
            _ListRow(
              leading: _Artwork(
                url: _hiResUrl(a),
                title: a.title,
                size: 56,
                circle: true,
              ),
              title: a.title,
              verified: a.isVerified,
              onTap: () => _handleItemTap(a),
            ),
            _divider(90),
          ],
        );
      case SearchAlbumItem a:
        return Column(
          children: [
            _ListRow(
              leading:
                  _Artwork(url: _hiResUrl(a), title: a.title, size: 56, radius: 8),
              title: a.title,
              subtitle: _albumSub(a),
              onTap: () => _handleItemTap(a),
            ),
            _divider(90),
          ],
        );
      case SearchPlaylistItem p:
        return Column(
          children: [
            _ListRow(
              leading:
                  _Artwork(url: _hiResUrl(p), title: p.title, size: 56, radius: 8),
              title: p.title,
              subtitle: _playlistSub(p),
              onTap: () => _handleItemTap(p),
            ),
            _divider(90),
          ],
        );
      case SearchVideoItem v:
        return Column(
          children: [
            _ListRow(
              leading: SizedBox(
                width: 112,
                child: _VideoThumb(
                  video: v,
                  imageUrl: _hiResUrl(v),
                  radius: 8,
                  small: true,
                ),
              ),
              title: v.title,
              subtitle: _videoMeta(v),
              onTap: () => _handleItemTap(v),
            ),
            _divider(146),
          ],
        );
      default:
        return const SizedBox.shrink();
    }
  }

  // ── Filtered full views ────────────────────────────────────────────────────

  Widget _buildFilteredSongs(List<SearchSongItem> songs) {
    if (songs.isEmpty) return _buildEmptyNotice('No songs found.');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [_sectionHeader('Songs'), _songRows(songs)],
    );
  }

  Widget _buildFilteredArtists(List<SearchArtistItem> artists) {
    if (artists.isEmpty) return _buildEmptyNotice('No artists found.');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeader('Artists'),
        ...List.generate(artists.length, (i) {
          final a = artists[i];
          return SpringIn(
            delayMs: i < 10 ? i * 24 : 0,
            rise: 14,
            child: Column(
              children: [
                _ListRow(
                  leading: _Artwork(
                    url: _hiResUrl(a),
                    title: a.title,
                    size: 58,
                    circle: true,
                  ),
                  title: a.title,
                  verified: a.isVerified,
                  onTap: () => _handleItemTap(a),
                ),
                if (i < artists.length - 1) _divider(92),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _grid({
    required String title,
    required int count,
    required Widget Function(int i, double cardWidth) item,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeader(title),
        LayoutBuilder(
          builder: (context, constraints) {
            final cardWidth = (constraints.maxWidth - 40 - 14) / 2;
            return GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(horizontal: _kEdge),
              itemCount: count,
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 14,
                mainAxisSpacing: 18,
                mainAxisExtent: cardWidth + 74,
              ),
              itemBuilder: (context, i) => SpringIn(
                delayMs: i < 8 ? i * 26 : 0,
                rise: 16,
                child: item(i, cardWidth),
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildFilteredAlbums(List<SearchAlbumItem> albums) {
    if (albums.isEmpty) return _buildEmptyNotice('No albums found.');
    return _grid(
      title: 'Albums',
      count: albums.length,
      item: (i, w) {
        final a = albums[i];
        return MediaCard(
          width: w,
          twoLineTitle: true,
          title: a.title,
          subtitle: _albumSub(a),
          imageUrl: _hiResUrl(a),
          onTap: () => _handleItemTap(a),
        );
      },
    );
  }

  Widget _buildFilteredPlaylists(List<SearchPlaylistItem> playlists) {
    if (playlists.isEmpty) return _buildEmptyNotice('No playlists found.');
    return _grid(
      title: 'Playlists',
      count: playlists.length,
      item: (i, w) {
        final p = playlists[i];
        return MediaCard(
          width: w,
          twoLineTitle: true,
          title: p.title,
          subtitle: _playlistSub(p),
          imageUrl: _hiResUrl(p),
          onTap: () => _handleItemTap(p),
        );
      },
    );
  }

  Widget _buildFilteredVideos(List<SearchVideoItem> videos) {
    if (videos.isEmpty) return _buildEmptyNotice('No videos found.');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _sectionHeader('Videos'),
        ...List.generate(videos.length, (i) {
          final v = videos[i];
          final meta = _videoMeta(v);
          return SpringIn(
            delayMs: i < 6 ? i * 28 : 0,
            rise: 14,
            child: PressableScale(
              scale: 0.985,
              onTap: () => _handleItemTap(v),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(_kEdge, 0, _kEdge, 22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _VideoThumb(video: v, imageUrl: _hiResUrl(v), radius: 14),
                    const SizedBox(height: 10),
                    Text(
                      v.title,
                      style: _displayStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        height: 1.2,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (meta.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        meta,
                        style: _bodyStyle(fontSize: 13.5),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          );
        }),
      ],
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Reusable rows / artwork
// ═════════════════════════════════════════════════════════════════════════════

class _Artwork extends StatelessWidget {
  const _Artwork({
    required this.url,
    required this.title,
    required this.size,
    this.radius = 10,
    this.circle = false,
    this.active = false,
    this.playing = false,
  });

  final String url;
  final String title;
  final double size;
  final double radius;
  final bool circle;
  final bool active;
  final bool playing;

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(circle ? size / 2 : radius);
    final fallback = MonogramAvatar(name: title, size: size, isCircle: circle);
    return SizedBox(
      width: size,
      height: size,
      child: ClipRRect(
        borderRadius: br,
        child: Stack(
          fit: StackFit.expand,
          children: [
            url.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: url,
                    fit: BoxFit.cover,
                    errorWidget: (_, _, _) => fallback,
                  )
                : fallback,
            if (active)
              ColoredBox(
                color: Colors.black.withValues(alpha: 0.46),
                child: Center(
                  child: EqualizerBars(
                    color: AppColors.accent,
                    size: size > 70 ? 22 : 16,
                    isPlaying: playing,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SongRow extends StatelessWidget {
  const _SongRow({
    required this.item,
    required this.isActive,
    required this.isPlaying,
    required this.onTap,
    required this.onMore,
    this.rank,
  });

  final SearchSongItem item;
  final bool isActive;
  final bool isPlaying;
  final VoidCallback onTap;
  final VoidCallback onMore;
  final int? rank;

  @override
  Widget build(BuildContext context) {
    final sub = _cleanSub(item.subtitle);
    return PressableScale(
      scale: 0.985,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: _kEdge, vertical: 8),
        child: Row(
          children: [
            if (rank != null)
              SizedBox(
                width: 30,
                child: Text(
                  '$rank',
                  style: _displayStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textTertiary,
                  ),
                ),
              ),
            _Artwork(
              url: item.thumbnailUrl.isNotEmpty
                  ? item.thumbnailUrl
                  : item.thumbnailUrlHiRes,
              title: item.title,
              size: 54,
              radius: 8,
              active: isActive,
              playing: isPlaying,
            ),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    style: _displayStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: isActive
                          ? AppColors.accent
                          : AppColors.textPrimary,
                      letterSpacing: -0.2,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (sub.isNotEmpty || item.isExplicit) ...[
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        if (item.isExplicit) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 4,
                              vertical: 1,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.18),
                              borderRadius: BorderRadius.circular(3),
                            ),
                            child: Text(
                              'E',
                              style: _bodyStyle(
                                fontSize: 9.5,
                                fontWeight: FontWeight.w700,
                                color: AppColors.textPrimary,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                        ],
                        if (sub.isNotEmpty)
                          Flexible(
                            child: Text(
                              sub,
                              style: _bodyStyle(fontSize: 13.5),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                      ],
                    ),
                  ],
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

class _ListRow extends StatelessWidget {
  const _ListRow({
    required this.leading,
    required this.title,
    required this.onTap,
    this.subtitle = '',
    this.verified = false,
  });

  final Widget leading;
  final String title;
  final String subtitle;
  final bool verified;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      scale: 0.985,
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: _kEdge, vertical: 8),
        child: Row(
          children: [
            leading,
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          title,
                          style: _displayStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -0.2,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (verified) ...[
                        const SizedBox(width: 5),
                        const Icon(
                          CupertinoIcons.checkmark_seal_fill,
                          size: 14,
                          color: AppColors.accent,
                        ),
                      ],
                    ],
                  ),
                  if (subtitle.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: _bodyStyle(fontSize: 13.5),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            const Icon(
              CupertinoIcons.chevron_right,
              size: 15,
              color: AppColors.textTertiary,
            ),
          ],
        ),
      ),
    );
  }
}

/// Full 16:9 video thumbnail (never cropped to 1:1).
class _VideoThumb extends StatelessWidget {
  const _VideoThumb({
    required this.video,
    required this.imageUrl,
    this.radius = 12,
    this.bigPlay = false,
    this.small = false,
  });

  final SearchVideoItem video;
  final String imageUrl;
  final double radius;
  final bool bigPlay;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final clean = (video.videoId != null && video.videoId!.isNotEmpty)
        ? video.videoId!
        : video.id.replaceFirst('yt-', '');
    final prefixed = clean.startsWith('yt-') ? clean : 'yt-$clean';

    return Selector<PlayerState, ({String? id, bool playing})>(
      selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
      builder: (context, active, _) {
        final isActive = active.id == clean || active.id == prefixed;
        return AspectRatio(
          aspectRatio: 16 / 9,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(radius),
            child: Stack(
              fit: StackFit.expand,
              children: [
                imageUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: imageUrl,
                        fit: BoxFit.cover,
                        errorWidget: (_, _, _) =>
                            const ColoredBox(color: AppColors.surface),
                      )
                    : const ColoredBox(color: AppColors.surface),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Color(0x55000000)],
                    ),
                  ),
                ),
                if (bigPlay && !isActive)
                  Center(
                    child: Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.42),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.35),
                          width: 0.8,
                        ),
                      ),
                      child: const Icon(
                        CupertinoIcons.play_fill,
                        size: 22,
                        color: Colors.white,
                      ),
                    ),
                  ),
                if (isActive)
                  ColoredBox(
                    color: Colors.black.withValues(alpha: 0.45),
                    child: Center(
                      child: EqualizerBars(
                        color: AppColors.accent,
                        size: small ? 14 : 22,
                        isPlaying: active.playing,
                      ),
                    ),
                  ),
                if (video.durationText.isNotEmpty)
                  Positioned(
                    right: small ? 4 : 8,
                    bottom: small ? 4 : 8,
                    child: Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: small ? 4 : 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.78),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        video.durationText,
                        style: _bodyStyle(
                          fontSize: small ? 9.5 : 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Category hero + tile
// ═════════════════════════════════════════════════════════════════════════════

Color _hue(Color c, double deg, {double l = 0}) {
  final hsl = HSLColor.fromColor(c);
  return hsl
      .withHue((hsl.hue + deg + 360) % 360)
      .withLightness((hsl.lightness + l).clamp(0.0, 1.0))
      .toColor();
}

/// Animated mesh gradient: drifting soft colour blobs on a dark base.
class _MeshPainter extends CustomPainter {
  _MeshPainter({required this.t, required this.pal, required this.seed});

  final double t;
  final List<Color> pal;
  final int seed;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(rect, Paint()..color = pal[0]);
    const fx = [1, 1, 2, 1];
    const fy = [1, 2, 1, 2];
    final r = math.max(size.width, size.height) * 0.8;
    for (var i = 0; i < 4; i++) {
      final ph = seed * 1.7 + i * 1.57;
      final c = Offset(
        size.width * (0.5 + 0.55 * math.sin(2 * math.pi * t * fx[i] + ph)),
        size.height * (0.5 + 0.55 * math.cos(2 * math.pi * t * fy[i] + ph * 1.3)),
      );
      canvas.drawRect(
        rect,
        Paint()
          ..shader = RadialGradient(
            colors: [
              pal[i + 1].withValues(alpha: 0.95),
              pal[i + 1].withValues(alpha: 0.0),
            ],
          ).createShader(Rect.fromCircle(center: c, radius: r * (0.7 + 0.1 * i))),
      );
    }
    // Legibility shade (bottom-left) for the title.
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.bottomLeft,
          end: Alignment.topRight,
          colors: [Colors.black.withValues(alpha: 0.40), Colors.transparent],
          stops: const [0.0, 0.62],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(covariant _MeshPainter old) =>
      old.t != t || old.seed != seed;
}

/// Small artwork card used inside category art (cover image or gradient+icon).
class _MiniCard extends StatelessWidget {
  const _MiniCard({
    required this.url,
    required this.size,
    required this.pal,
    required this.icon,
    this.circle = false,
  });

  final String url;
  final double size;
  final List<Color> pal;
  final IconData icon;
  final bool circle;

  @override
  Widget build(BuildContext context) {
    final br = BorderRadius.circular(circle ? size / 2 : size * 0.18);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: br,
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.35),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: br,
        child: Stack(
          fit: StackFit.expand,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [pal[2], pal[3]],
                ),
              ),
              child: Icon(
                icon,
                size: size * 0.4,
                color: Colors.white.withValues(alpha: 0.85),
              ),
            ),
            if (url.isNotEmpty)
              CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                fadeInDuration: const Duration(milliseconds: 220),
                errorWidget: (_, _, _) => const SizedBox.shrink(),
              ),
            if (circle)
              Center(
                child: Container(
                  width: size * 0.16,
                  height: size * 0.16,
                  decoration: BoxDecoration(
                    color: const Color(0xFF0C0C0F),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.45),
                      width: 1,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Mesh background + floating cover cards. Each category gets its own palette
/// and one of 4 layouts: fan · cascade · spinning vinyl · diagonal trio.
class _CategoryArt extends StatefulWidget {
  const _CategoryArt({
    required this.spec,
    required this.index,
    required this.covers,
    this.areaFrac = 0.82,
    this.topInset = 0,
  });

  final _SearchCategorySpec spec;
  final int index;
  final List<String> covers;
  final double areaFrac;
  final double topInset;

  @override
  State<_CategoryArt> createState() => _CategoryArtState();
}

class _CategoryArtState extends State<_CategoryArt>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final List<Color> _pal;

  @override
  void initState() {
    super.initState();
    final a = widget.spec.colors[0];
    final b = widget.spec.colors[1];
    _pal = [b, a, _hue(a, 40, l: 0.04), _hue(a, -35, l: 0.08), _hue(b, 28, l: 0.10)];
    _ctrl = AnimationController(
      vsync: this,
      duration: Duration(seconds: 10 + (widget.index % 3) * 3),
    )
      ..value = (widget.index * 0.17) % 1.0
      ..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  List<Widget> _cards(double aw, double top, double ah, double t) {
    final cs = math.min(aw * 0.34, ah * 0.58);
    double fl(double ph) => math.sin(2 * math.pi * t + ph) * 3.5;

    Widget card(
      int k,
      double cx,
      double cy,
      double size,
      double rot, {
      double ph = 0,
      bool circle = false,
      double spin = 0,
    }) {
      final c = widget.covers;
      final url = c.isEmpty ? '' : c[(widget.index * 3 + k) % c.length];
      Widget child = _MiniCard(
        url: url,
        size: size,
        pal: _pal,
        icon: widget.spec.icon,
        circle: circle,
      );
      if (spin != 0) child = Transform.rotate(angle: spin, child: child);
      return Positioned(
        left: cx - size / 2,
        top: cy - size / 2 + fl(ph),
        child: Transform.rotate(angle: rot, child: child),
      );
    }

    switch (widget.index % 4) {
      case 0: // fan
        final cx = aw * 0.70;
        final cy = top + ah * 0.52;
        return [
          card(0, cx - cs * 0.46, cy + cs * 0.04, cs * 0.86, -0.24),
          card(1, cx + cs * 0.46, cy + cs * 0.06, cs * 0.86, 0.20, ph: 1.5),
          card(2, cx, cy - cs * 0.06, cs * 1.06, -0.03, ph: 3),
        ];
      case 1: // cascade
        return [
          card(0, aw * 0.62, top + ah * 0.30, cs * 0.92, 0.14),
          card(1, aw * 0.80, top + ah * 0.68, cs * 0.92, -0.12, ph: 2),
        ];
      case 2: // vinyl
        return [
          card(1, aw * 0.54, top + ah * 0.30, cs * 0.6, -0.2, ph: 1),
          card(0, aw * 0.80, top + ah * 0.60, cs * 1.3, 0,
              circle: true, spin: 2 * math.pi * t),
        ];
      default: // trio
        return [
          card(0, aw * 0.58, top + ah * 0.26, cs * 0.62, 0.10),
          card(1, aw * 0.76, top + ah * 0.52, cs * 0.72, -0.08, ph: 1),
          card(2, aw * 0.92, top + ah * 0.78, cs * 0.82, 0.12, ph: 2),
        ];
    }
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: LayoutBuilder(
        builder: (context, c) {
          final w = c.maxWidth;
          final h = c.maxHeight;
          final top = widget.topInset;
          final ah = h * widget.areaFrac - top;
          return AnimatedBuilder(
            animation: _ctrl,
            builder: (context, _) {
              final t = _ctrl.value;
              return Stack(
                clipBehavior: Clip.hardEdge,
                children: [
                  Positioned.fill(
                    child: CustomPaint(
                      painter: _MeshPainter(
                        t: t,
                        pal: _pal,
                        seed: widget.index,
                      ),
                    ),
                  ),
                  ..._cards(w, top, ah, t),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

class _CategoryHero extends StatelessWidget {
  const _CategoryHero({
    required this.spec,
    required this.index,
    required this.covers,
    required this.topPad,
    required this.onPlay,
    required this.onShuffle,
  });

  final _SearchCategorySpec spec;
  final int index;
  final List<String> covers;
  final double topPad;
  final VoidCallback onPlay;
  final VoidCallback onShuffle;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: topPad + 330,
      child: Stack(
        children: [
          Positioned.fill(
            child: _CategoryArt(
              spec: spec,
              index: index,
              covers: covers,
              areaFrac: 0.80,
              topInset: topPad + 52,
            ),
          ),
          Positioned.fill(
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, AppColors.bg],
                    stops: const [0.55, 1.0],
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            left: _kEdge,
            right: _kEdge,
            bottom: 20,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  spec.title,
                  style: _displayStyle(
                    fontSize: 36,
                    color: Colors.white,
                    letterSpacing: -0.9,
                    height: 1.05,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: ZenPlayButton(
                        height: 44,
                        fontSize: 15,
                        iconSize: 18,
                        isPlaying: false,
                        label: 'Play',
                        expanded: true,
                        onTap: onPlay,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ZenShuffleButton(
                        height: 44,
                        fontSize: 15,
                        iconSize: 17,
                        expanded: true,
                        label: 'Shuffle',
                        onTap: onShuffle,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BrowseCategoryTile extends StatelessWidget {
  const _BrowseCategoryTile({
    required this.spec,
    required this.index,
    required this.covers,
    required this.onTap,
  });

  final _SearchCategorySpec spec;
  final int index;
  final List<String> covers;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      scale: 0.96,
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(18),
        child: Stack(
          fit: StackFit.expand,
          children: [
            _CategoryArt(spec: spec, index: index, covers: covers),
            IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.16),
                    width: 0.7,
                  ),
                ),
              ),
            ),
            Positioned(
              left: 14,
              right: 14,
              bottom: 12,
              child: Text(
                spec.title,
                style: _displayStyle(
                  fontSize: 17,
                  color: Colors.white,
                  height: 1.1,
                ).copyWith(
                  shadows: [
                    Shadow(
                      color: Colors.black.withValues(alpha: 0.45),
                      blurRadius: 8,
                    ),
                  ],
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Spring-animated filter pill bar
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
    final pillBox = _pillKeys[_selectedIndex].currentContext?.findRenderObject()
        as RenderBox?;
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
// Shimmer skeleton
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

  Widget _bone(Color c, double w, double h, {double r = 6, bool circle = false}) {
    return Container(
      width: w,
      height: h,
      decoration: BoxDecoration(
        color: c,
        shape: circle ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: circle ? null : BorderRadius.circular(r),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final bone = Colors.white.withValues(alpha: 0.05 + _ctrl.value * 0.06);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 6, 20, 18),
              child: Row(
                children: [62.0, 74.0, 74.0, 78.0, 86.0]
                    .map((w) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: _bone(bone, w, 34, r: 26),
                        ))
                    .toList(),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: _bone(bone, 112, 22),
            ),
            const SizedBox(height: 14),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  _bone(bone, 108, 108, r: 12),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _bone(bone, 170, 22),
                        const SizedBox(height: 10),
                        _bone(bone, 120, 15),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Row(
                children: [
                  Expanded(child: _bone(bone, double.infinity, 44, r: 26)),
                  const SizedBox(width: 10),
                  _bone(bone, 44, 44, circle: true),
                ],
              ),
            ),
            const SizedBox(height: 26),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: _bone(bone, 84, 22),
            ),
            const SizedBox(height: 10),
            ...List.generate(
              4,
              (_) => Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: Row(
                  children: [
                    _bone(bone, 54, 54, r: 8),
                    const SizedBox(width: 13),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _bone(bone, 185, 15, r: 5),
                          const SizedBox(height: 7),
                          _bone(bone, 120, 13, r: 5),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}