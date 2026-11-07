import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart'
    show
        CupertinoActionSheet,
        CupertinoActionSheetAction,
        CupertinoAlertDialog,
        CupertinoDialogAction,
        CupertinoPageRoute,
        CupertinoSliverRefreshControl,
        CupertinoTextField,
        CupertinoTheme,
        CupertinoThemeData,
        showCupertinoDialog,
        showCupertinoModalPopup;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/tokens/app_spacing.dart';
import '../../design_system/tokens/app_typography.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/song_tile.dart';
import '../../design_system/widgets/spring_kit.dart';
import '../../design_system/widgets/zen_action_buttons.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../models/track.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../details/album_screen.dart';
import '../details/artist_screen.dart';

const _fieldFill = Color(0x1FFFFFFF); // white 12%
const _dark = CupertinoThemeData(brightness: Brightness.dark);

const _palette = <List<Color>>[
  [Color(0xFFFA2D48), Color(0xFFB3122E)],
  [Color(0xFF5E5CE6), Color(0xFF3634A8)],
  [Color(0xFF30B0C7), Color(0xFF1B7C91)],
  [Color(0xFFFF9F0A), Color(0xFFC46A00)],
  [Color(0xFF34C759), Color(0xFF1E8A3A)],
  [Color(0xFFBF5AF2), Color(0xFF8A2FC0)],
];

enum _Sort {
  recent('Recently added'),
  title('Title'),
  artist('Artist');

  const _Sort(this.label);
  final String label;
}

enum _Tab {
  all('Library'),
  liked('Liked'),
  playlists('Playlists'),
  artists('Artists'),
  albums('Albums');

  const _Tab(this.label);
  final String label;
}

/// Library tab. Everything here is driven by [LibraryStore] (liked songs,
/// followed artists, saved albums, playlists) and the real catalog.
class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, this.onOpenProfile, this.onRefresh});

  final VoidCallback? onOpenProfile;
  final Future<void> Function()? onRefresh;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> with TickerProviderStateMixin {
  late final AnimationController _ambient = AnimationController(vsync: this, duration: const Duration(seconds: 14));
  late final AnimationController _searchCtl = AnimationController.unbounded(vsync: this, value: 0);

  final _text = TextEditingController();
  final _focus = FocusNode();

  _Tab _tab = _Tab.all;
  UserPlaylist? _openPlaylist;
  String _query = '';
  bool _searching = false;
  bool _grid = false;
  _Sort _sort = _Sort.recent;

  @override
  void initState() {
    super.initState();
    _focus.addListener(_syncSearching);
    LibraryStore.instance.ensureLoaded();
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

  /* ───────────────────────── helpers ───────────────────────── */

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

  void _play(List<Track> list, int index) {
    if (list.isEmpty) return;
    HapticFeedback.lightImpact();
    context.read<PlayerState>().setQueue(list, startIndex: index);
  }

  void _shuffle(List<Track> list) {
    if (list.isEmpty) return;
    HapticFeedback.lightImpact();
    context.read<PlayerState>().setQueue(List.of(list)..shuffle(), startIndex: 0);
  }

  void _go(Widget page) {
    HapticFeedback.lightImpact();
    Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => page));
  }

  void _openArtist(String name) => _go(ArtistScreen(artistName: name));
  void _openAlbum(String title, String artist, String cover) =>
      _go(AlbumScreen(albumTitle: title, artistName: artist, coverUrl: cover));

  void _setTab(_Tab t) {
    HapticFeedback.selectionClick();
    setState(() {
      _tab = t;
      _openPlaylist = null;
    });
  }

  List<Track> _filter(List<Track> src) {
    final q = _query.trim().toLowerCase();
    final list = q.isEmpty
        ? List<Track>.of(src)
        : src.where((t) => t.title.toLowerCase().contains(q) || t.artist.toLowerCase().contains(q)).toList();
    switch (_sort) {
      case _Sort.recent:
        break;
      case _Sort.title:
        list.sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
      case _Sort.artist:
        list.sort((a, b) => a.artist.toLowerCase().compareTo(b.artist.toLowerCase()));
    }
    return list;
  }

  Future<void> _pickSort() async {
    ZenDropdown.showSortMenu<_Sort>(
      context: context,
      title: 'Sort by',
      selected: _sort,
      options: const [
        (value: _Sort.recent, label: 'Recently added', icon: Icons.access_time_rounded),
        (value: _Sort.title, label: 'Title', icon: Icons.sort_by_alpha_rounded),
        (value: _Sort.artist, label: 'Artist', icon: Icons.person_outline_rounded),
      ],
      onSelected: (picked) {
        if (picked != _sort) setState(() => _sort = picked);
      },
    );
  }

  Future<String?> _promptName({required String title, String initial = '', required String confirm}) {
    final c = TextEditingController(text: initial);
    return showCupertinoDialog<String>(
      context: context,
      builder: (ctx) => CupertinoTheme(
        data: _dark,
        child: CupertinoAlertDialog(
          title: Text(title),
          content: Padding(
            padding: const EdgeInsets.only(top: 12),
            child: CupertinoTextField(
              controller: c,
              autofocus: true,
              placeholder: 'Playlist title',
              maxLength: 40,
              style: const TextStyle(color: Colors.white),
              cursorColor: AppColors.accent,
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
            ),
          ),
          actions: [
            CupertinoDialogAction(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
            CupertinoDialogAction(
              isDefaultAction: true,
              onPressed: () => Navigator.of(ctx).pop(c.text.trim()),
              child: Text(confirm),
            ),
          ],
        ),
      ),
    ).whenComplete(c.dispose);
  }

  Future<void> _createPlaylist() async {
    final n = await _promptName(title: 'New Playlist', confirm: 'Create');
    if (n == null || n.isEmpty || !mounted) return;
    LibraryStore.instance.createPlaylist(n);
    setState(() {
      _tab = _Tab.playlists;
      _openPlaylist = null;
    });
  }

  Future<void> _renamePlaylist(UserPlaylist p) async {
    final n = await _promptName(title: 'Rename Playlist', initial: p.name, confirm: 'Save');
    if (n != null && n.isNotEmpty) LibraryStore.instance.renamePlaylist(p.id, n);
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(msg),
        duration: const Duration(milliseconds: 1400),
        behavior: SnackBarBehavior.floating,
      ));
  }

  /// Long-press menu on any song: like, add to playlist, go to artist.
  Future<void> _trackActions(Track t) async {
    HapticFeedback.mediumImpact();
    final store = LibraryStore.instance;
    final act = await showCupertinoModalPopup<String>(
      context: context,
      builder: (ctx) => CupertinoTheme(
        data: _dark,
        child: CupertinoActionSheet(
          title: Text(t.title),
          message: Text(t.artist),
          actions: [
            CupertinoActionSheetAction(
              onPressed: () => Navigator.pop(ctx, 'like'),
              child: Text(store.isLiked(t) ? 'Remove from Liked Songs' : 'Add to Liked Songs'),
            ),
            CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx, 'playlist'), child: const Text('Add to Playlist…')),
            CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx, 'artist'), child: const Text('Go to Artist')),
          ],
          cancelButton: CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        ),
      ),
    );
    if (!mounted || act == null) return;
    switch (act) {
      case 'like':
        store.toggleLike(t);
        _toast(store.isLiked(t) ? 'Added to Liked Songs' : 'Removed from Liked Songs');
      case 'playlist':
        await _addToPlaylist(t);
      case 'artist':
        _openArtist(t.artist);
    }
  }

  Future<void> _addToPlaylist(Track t) async {
    final store = LibraryStore.instance;
    final pick = await showCupertinoModalPopup<String>(
      context: context,
      builder: (ctx) => CupertinoTheme(
        data: _dark,
        child: CupertinoActionSheet(
          title: const Text('Add to Playlist'),
          actions: [
            CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx, '__new'), child: const Text('New Playlist…')),
            for (final p in store.playlists)
              CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx, p.id), child: Text(p.name)),
          ],
          cancelButton: CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        ),
      ),
    );
    if (!mounted || pick == null) return;
    if (pick == '__new') {
      final n = await _promptName(title: 'New Playlist', confirm: 'Create');
      if (n == null || n.isEmpty || !mounted) return;
      store.createPlaylist(n, first: t);
      _toast('Added to “$n”');
    } else {
      final ok = store.addToPlaylist(pick, t);
      _toast(ok ? 'Added to “${store.playlistById(pick)?.name ?? 'playlist'}”' : 'Already in this playlist');
    }
  }

  /* ───────────────────────── build ───────────────────────── */

  @override
  Widget build(BuildContext context) {
    final topInset = MediaQuery.paddingOf(context).top;

    return ListenableBuilder(
      listenable: Listenable.merge([LibraryStore.instance, CatalogDataSource.tracksNotifier]),
      builder: (context, _) {
        final store = LibraryStore.instance;
        final detail = _openPlaylist != null ? store.playlistById(_openPlaylist!.id) : null;

        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle.light,
          child: Scaffold(
            backgroundColor: AppColors.bg,
            body: CupertinoTheme(
              data: _dark,
              child: CustomScrollView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
                slivers: [
                  CupertinoSliverRefreshControl(
                    onRefresh: () async {
                      HapticFeedback.lightImpact();
                      await (widget.onRefresh?.call() ?? CatalogDataSource.initialize());
                    },
                  ),
                  SliverPersistentHeader(
                    pinned: true,
                    delegate: CollapsingTitleDelegate(
                      topInset: topInset,
                      title: detail != null ? detail.name : 'Library',
                      actionsBuilder: (size, t) => [
                        PressableScale(
                          onTap: detail != null ? () => setState(() => _openPlaylist = null) : _createPlaylist,
                          child: Container(
                            width: size,
                            height: size,
                            decoration: const BoxDecoration(shape: BoxShape.circle, color: _fieldFill),
                            child: Icon(
                              detail != null ? Icons.arrow_back_rounded : Icons.add_rounded,
                              size: size * 0.58,
                              color: detail != null ? Colors.white : AppColors.accent,
                            ),
                          ),
                        ),
                        ProfileAvatarButton(size: size, onTap: widget.onOpenProfile),
                      ],
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 8),
                        _buildFindField(),
                        if (detail == null) ...[const SizedBox(height: 14), _buildTabs()],
                        const SizedBox(height: 12),
                      ],
                    ),
                  ),
                  if (detail != null)
                    _playlistDetail(store, detail)
                  else
                    switch (_tab) {
                      _Tab.all => _overview(store),
                      _Tab.liked => _liked(store),
                      _Tab.playlists => _playlists(store),
                      _Tab.artists => _artists(store),
                      _Tab.albums => _albums(store),
                    },
                  const SliverToBoxAdapter(child: SizedBox(height: 120)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildTabs() {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: _Tab.values.length,
        separatorBuilder: (_, i) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final tab = _Tab.values[i];
          final on = _tab == tab;
          return PressableScale(
            onTap: () => _setTab(tab),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 420),
              curve: Curves.easeOutBack,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: on ? AppColors.accent : Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(18),
              ),
              child: AnimatedDefaultTextStyle(
                duration: const Duration(milliseconds: 250),
                style: AppTypography.headline.copyWith(
                  fontSize: 14,
                  fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                  color: on ? Colors.white : Colors.white70,
                ),
                child: Text(tab.label),
              ),
            ),
          );
        },
      ),
    );
  }

  /* ───────────────────────── Library (overview) ───────────────────────── */

  Widget _overview(LibraryStore store) {
    final all = CatalogDataSource.allTracks;
    final songs = _filter(all);
    final liked = store.likedTracks;

    final followed = store.followedArtists;
    final playlists = store.playlists;
    final saved = store.savedAlbums;
    final recent = all.take(9).toList();

    final topArtists = catalogArtists().take(6).toList();

    final langs = <String, List<Track>>{};
    for (final t in all) {
      final l = t.language.trim();
      if (l.isEmpty || l == 'null') continue;
      (langs[l] ??= []).add(t);
    }
    final langList = langs.entries.toList()..sort((a, b) => b.value.length.compareTo(a.value.length));

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SpringReveal(
                visible: !_searching,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 4),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: _LikedHero(
                        count: store.likedCount,
                        ambient: _ambient,
                        onOpen: () => _setTab(_Tab.liked),
                        onPlay: () => liked.isEmpty ? _setTab(_Tab.liked) : _play(liked, 0),
                        onShuffle: () => liked.isEmpty ? _setTab(_Tab.liked) : _shuffle(liked),
                      ),
                    ),

                    // 1. Following: circular avatars
                    _SecHeader('Following', sub: followed.isEmpty ? 'Artists you follow appear here' : null, onTap: () => _setTab(_Tab.artists)),
                    SizedBox(
                      height: 132,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        physics: const BouncingScrollPhysics(),
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        children: [
                          _FindArtistTile(onTap: () => _setTab(_Tab.artists)),
                          for (final a in followed)
                            _ArtistCircle(name: a.name, cover: a.cover, onTap: () => _openArtist(a.name)),
                        ],
                      ),
                    ),

                    // 2. Playlists: wide cards with a collage
                    _SecHeader('Playlists', onTap: () => _setTab(_Tab.playlists)),
                    SizedBox(
                      height: 88,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        physics: const BouncingScrollPhysics(),
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        children: [
                          _NewPlaylistCard(onTap: _createPlaylist),
                          for (final p in playlists)
                            _PlaylistCard(
                              playlist: p,
                              covers: store.playlistTracks(p).take(4).map((t) => t.coverUrl).toList(),
                              onTap: () => setState(() {
                                _tab = _Tab.playlists;
                                _openPlaylist = p;
                              }),
                            ),
                        ],
                      ),
                    ),

                    // 3. Saved albums: squircle covers
                    _SecHeader('Albums', sub: saved.isEmpty ? 'Albums you save appear here' : null, onTap: () => _setTab(_Tab.albums)),
                    SizedBox(
                      height: 204,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        physics: const BouncingScrollPhysics(),
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        children: [
                          if (saved.isEmpty)
                            _CtaTile(icon: Icons.album_rounded, label: 'Browse albums', onTap: () => _setTab(_Tab.albums)),
                          for (final a in saved)
                            _AlbumCard(
                              title: a.title,
                              artist: a.artist,
                              cover: a.cover,
                              onTap: () => _openAlbum(a.title, a.artist, a.cover),
                            ),
                        ],
                      ),
                    ),

                    // 4. Recently added: paged rows in a rounded group
                    if (recent.isNotEmpty) ...[
                      const _SecHeader('Recently added'),
                      _RecentPaged(
                        tracks: recent,
                        onPlay: (i) => _play(recent, i),
                        onLongPress: _trackActions,
                      ),
                    ],

                    // 5. Made from your library: gradient mixes
                    if (topArtists.isNotEmpty) ...[
                      const _SecHeader('Made from your library'),
                      SizedBox(
                        height: 196,
                        child: ListView.builder(
                          scrollDirection: Axis.horizontal,
                          physics: const BouncingScrollPhysics(),
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          itemCount: topArtists.length,
                          itemBuilder: (_, i) {
                            final a = topArtists[i];
                            return _MixTile(
                              index: i,
                              name: a.name,
                              count: a.count,
                              onTap: () => _play(all.where((t) => t.artist == a.name).toList(), 0),
                            );
                          },
                        ),
                      ),
                    ],

                    // 6. Languages: flat colour tiles
                    if (langList.isNotEmpty) ...[
                      const _SecHeader('Browse by language'),
                      SizedBox(
                        height: 84,
                        child: ListView.builder(
                          scrollDirection: Axis.horizontal,
                          physics: const BouncingScrollPhysics(),
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          itemCount: langList.length,
                          itemBuilder: (_, i) => _LanguageTile(
                            index: i,
                            name: langList[i].key,
                            count: langList[i].value.length,
                            onTap: () => _play(langList[i].value, 0),
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 28),
                  ],
                ),
              ),

              // All songs (search, sort, list / grid)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  _searching ? 'Songs' : 'All songs',
                  style: AppTypography.headline.copyWith(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.4),
                ),
              ),
              const SizedBox(height: 12),
              _songControls(songs),
            ],
          ),
        ),
        _songsSliver(songs, emptyTitle: _query.trim().isNotEmpty ? 'No results' : 'Your library is empty',
            emptyMessage: _query.trim().isNotEmpty
                ? 'Nothing in your library matches “${_query.trim()}”.'
                : 'Songs from the catalog will show up here.',
            emptyIcon: _query.trim().isNotEmpty ? Icons.search_off_rounded : Icons.library_music_rounded),
      ],
    );
  }

  Widget _songControls(List<Track> songs) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(
            children: [
              SpringIconSegmented(
                icons: const [Icons.view_list_rounded, Icons.grid_view_rounded],
                index: _grid ? 1 : 0,
                onChanged: (i) => setState(() => _grid = i == 1),
              ),
              const Spacer(),
              PressableScale(
                onTap: _pickSort,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_sort.label,
                          style: AppTypography.headline.copyWith(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.accent)),
                      const SizedBox(width: 2),
                      const Icon(Icons.unfold_more_rounded, size: 16, color: AppColors.accent),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        if (songs.isNotEmpty) ...[
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: ZenActionButtons(onPlay: () => _play(songs, 0), onShuffle: () => _shuffle(songs)),
          ),
        ],
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _songsSliver(
    List<Track> songs, {
    required String emptyTitle,
    required String emptyMessage,
    required IconData emptyIcon,
    Widget Function(Track)? wrap,
  }) {
    if (songs.isEmpty) {
      return SliverToBoxAdapter(child: _EmptyState(icon: emptyIcon, title: emptyTitle, message: emptyMessage));
    }
    if (_grid) {
      return SliverPadding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
        sliver: SliverGrid(
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 16,
            crossAxisSpacing: 14,
            childAspectRatio: 0.74,
          ),
          delegate: SliverChildBuilderDelegate(
            (context, i) {
              final track = songs[i];
              return Selector<PlayerState, ({Object? id, bool playing})>(
                selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
                builder: (context, s, child) {
                  final active = s.id == track.id;
                  return _GridTile(
                    title: track.title,
                    artist: track.artist,
                    coverUrl: track.coverUrl,
                    active: active,
                    playing: active && s.playing,
                    onTap: () => _play(songs, i),
                    onLongPress: () => _trackActions(track),
                  );
                },
              );
            },
            childCount: songs.length,
          ),
        ),
      );
    }
    return SliverList(
      delegate: SliverChildBuilderDelegate(
        (context, i) {
          final track = songs[i];
          final row = _TrackRow(track: track, onTap: () => _play(songs, i), onLongPress: () => _trackActions(track));
          return wrap != null ? wrap(track) : row;
        },
        childCount: songs.length,
      ),
    );
  }

  /* ───────────────────────── Liked ───────────────────────── */

  Widget _liked(LibraryStore store) {
    final tracks = _filter(store.likedTracks);

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: _LikedHero(
                  count: store.likedCount,
                  ambient: _ambient,
                  onOpen: () {},
                  onPlay: () => _play(tracks, 0),
                  onShuffle: () => _shuffle(tracks),
                ),
              ),
              const SizedBox(height: 16),
              if (store.likedCount > 0) _songControls(tracks),
            ],
          ),
        ),
        _songsSliver(
          tracks,
          emptyIcon: store.likedCount == 0 ? Icons.favorite_border_rounded : Icons.search_off_rounded,
          emptyTitle: store.likedCount == 0 ? 'No Liked Songs Yet' : 'No results',
          emptyMessage: store.likedCount == 0
              ? 'Press and hold any song, then choose “Add to Liked Songs”.'
              : 'Nothing in Liked Songs matches “${_query.trim()}”.',
        ),
      ],
    );
  }

  /* ───────────────────────── Playlists ───────────────────────── */

  Widget _playlists(LibraryStore store) {
    final q = _query.trim().toLowerCase();
    final list = q.isEmpty ? store.playlists : store.playlists.where((p) => p.name.toLowerCase().contains(q)).toList();

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('${list.length} ${list.length == 1 ? 'playlist' : 'playlists'}',
                    style: AppTypography.footnote.copyWith(color: Colors.white60)),
                PressableScale(
                  onTap: _createPlaylist,
                  child: Container(
                    height: 36,
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    decoration: BoxDecoration(
                      color: const Color(0xFF18181B),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.add_rounded, size: 14, color: AppColors.accent),
                        const SizedBox(width: 6),
                        Text('NEW PLAYLIST',
                            style: AppTypography.caption.copyWith(
                                fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.2, color: AppColors.accent)),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (list.isEmpty)
          SliverToBoxAdapter(
            child: _EmptyState(
              icon: Icons.queue_music_rounded,
              title: store.playlists.isEmpty ? 'No Playlists' : 'No results',
              message: store.playlists.isEmpty
                  ? 'Create a playlist, then press and hold any song to add it.'
                  : 'No playlist matches “${_query.trim()}”.',
              actionLabel: store.playlists.isEmpty ? 'New Playlist' : null,
              onAction: _createPlaylist,
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 16,
                crossAxisSpacing: 14,
                childAspectRatio: 0.78,
              ),
              delegate: SliverChildBuilderDelegate(
                (context, i) {
                  final p = list[i];
                  final covers = store.playlistTracks(p).take(4).map((t) => t.coverUrl).toList();
                  return PressableScale(
                    onTap: () {
                      HapticFeedback.lightImpact();
                      setState(() => _openPlaylist = p);
                    },
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: SizedBox.expand(child: _Collage(covers, radius: 14))),
                        const SizedBox(height: 8),
                        Text(p.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.headline.copyWith(fontSize: 14, fontWeight: FontWeight.w600)),
                        const SizedBox(height: 2),
                        Text('${p.trackIds.length} ${p.trackIds.length == 1 ? 'song' : 'songs'}',
                            style: AppTypography.footnote.copyWith(color: Colors.white60, fontSize: 12)),
                      ],
                    ),
                  );
                },
                childCount: list.length,
              ),
            ),
          ),
      ],
    );
  }

  Widget _playlistDetail(LibraryStore store, UserPlaylist playlist) {
    final tracks = store.playlistTracks(playlist);

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('${tracks.length} ${tracks.length == 1 ? 'song' : 'songs'}',
                          style: AppTypography.footnote.copyWith(color: Colors.white60)),
                    ),
                    PressableScale(
                      onTap: () => _renamePlaylist(playlist),
                      child: const Padding(
                        padding: EdgeInsets.all(8),
                        child: Icon(Icons.edit_rounded, size: 20, color: Colors.white70),
                      ),
                    ),
                    PressableScale(
                      onTap: () {
                        HapticFeedback.mediumImpact();
                        store.deletePlaylist(playlist.id);
                        setState(() => _openPlaylist = null);
                      },
                      child: const Padding(
                        padding: EdgeInsets.all(8),
                        child: Icon(Icons.delete_outline_rounded, size: 21, color: Color(0xFFE11D48)),
                      ),
                    ),
                  ],
                ),
                if (tracks.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  ZenActionButtons(onPlay: () => _play(tracks, 0), onShuffle: () => _shuffle(tracks)),
                  const SizedBox(height: 8),
                ],
              ],
            ),
          ),
        ),
        if (tracks.isEmpty)
          const SliverToBoxAdapter(
            child: _EmptyState(
              icon: Icons.music_note_rounded,
              title: 'Empty Playlist',
              message: 'Press and hold any song, then choose “Add to Playlist”.',
            ),
          )
        else
          SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, i) {
                final track = tracks[i];
                return Dismissible(
                  key: ValueKey('pl-${playlist.id}-${track.id}'),
                  direction: DismissDirection.endToStart,
                  background: Container(
                    color: const Color(0xFFE11D48),
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 24),
                    child: const Icon(Icons.remove_circle_outline_rounded, color: Colors.white),
                  ),
                  onDismissed: (_) {
                    HapticFeedback.mediumImpact();
                    store.removeFromPlaylist(playlist.id, track);
                  },
                  child: _TrackRow(track: track, onTap: () => _play(tracks, i), onLongPress: () => _trackActions(track)),
                );
              },
              childCount: tracks.length,
            ),
          ),
      ],
    );
  }

  /* ───────────────────────── Artists ───────────────────────── */

  Widget _artists(LibraryStore store) {
    final q = _query.trim().toLowerCase();
    bool match(String n) => q.isEmpty || n.toLowerCase().contains(q);

    final followed = store.followedArtists.where((a) => match(a.name)).toList();
    final followedNames = store.followedArtists.map((a) => a.name).toSet();
    final suggested = catalogArtists().where((a) => !followedNames.contains(a.name) && match(a.name)).take(30).toList();

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(child: _SecHeader('Following', sub: '${store.followedArtists.length} artists')),
        if (followed.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(
                store.followedArtists.isEmpty
                    ? 'You are not following anyone yet. Follow artists below to see them here.'
                    : 'No followed artist matches “${_query.trim()}”.',
                style: AppTypography.footnote.copyWith(color: Colors.white60),
              ),
            ),
          )
        else
          SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, i) => _ArtistRow(
                name: followed[i].name,
                cover: followed[i].cover,
                subtitle: 'Following',
                onTap: () => _openArtist(followed[i].name),
              ),
              childCount: followed.length,
            ),
          ),
        if (suggested.isNotEmpty) ...[
          const SliverToBoxAdapter(child: _SecHeader('Suggested artists')),
          SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, i) => _ArtistRow(
                name: suggested[i].name,
                cover: suggested[i].cover,
                subtitle: '${suggested[i].count} ${suggested[i].count == 1 ? 'song' : 'songs'}',
                onTap: () => _openArtist(suggested[i].name),
              ),
              childCount: suggested.length,
            ),
          ),
        ],
      ],
    );
  }

  /* ───────────────────────── Albums ───────────────────────── */

  Widget _albums(LibraryStore store) {
    final q = _query.trim().toLowerCase();
    bool match(String a, String b) => q.isEmpty || a.toLowerCase().contains(q) || b.toLowerCase().contains(q);

    final saved = store.savedAlbums.where((a) => match(a.title, a.artist)).toList();
    final savedKeys = store.savedAlbums.map((a) => '${a.title}|${a.artist}').toSet();
    final browse = catalogAlbums().where((a) => !savedKeys.contains('${a.title}|${a.artist}') && match(a.title, a.artist)).take(40).toList();

    SliverGrid grid(int count, Widget Function(int) build) => SliverGrid(
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 16,
            crossAxisSpacing: 14,
            childAspectRatio: 0.78,
          ),
          delegate: SliverChildBuilderDelegate((context, i) => build(i), childCount: count),
        );

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(child: _SecHeader('Saved albums', sub: '${store.savedAlbums.length} albums')),
        if (saved.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(
                store.savedAlbums.isEmpty
                    ? 'No saved albums yet. Tap the heart on an album below to save it.'
                    : 'No saved album matches “${_query.trim()}”.',
                style: AppTypography.footnote.copyWith(color: Colors.white60),
              ),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            sliver: grid(
              saved.length,
              (i) => _AlbumGridCard(
                title: saved[i].title,
                artist: saved[i].artist,
                cover: saved[i].cover,
                onTap: () => _openAlbum(saved[i].title, saved[i].artist, saved[i].cover),
              ),
            ),
          ),
        if (browse.isNotEmpty) ...[
          const SliverToBoxAdapter(child: _SecHeader('Browse albums')),
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            sliver: grid(
              browse.length,
              (i) => _AlbumGridCard(
                title: browse[i].title,
                artist: browse[i].artist,
                cover: browse[i].cover,
                onTap: () => _openAlbum(browse[i].title, browse[i].artist, browse[i].cover),
              ),
            ),
          ),
        ],
      ],
    );
  }

  /* ───────────────────────── find field ───────────────────────── */

  Widget _buildFindField() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: AnimatedBuilder(
        animation: _searchCtl,
        builder: (context, child) {
          final f = _searchCtl.value.clamp(0.0, 1.0).toDouble();
          return Row(
            children: [
              Expanded(
                child: Container(
                  height: 40,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: ShapeDecoration(
                    shape: ContinuousRectangleBorder(borderRadius: BorderRadius.circular(22)),
                    color: _fieldFill,
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.search_rounded, size: 20, color: Color.lerp(Colors.white54, Colors.white70, f)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _text,
                          focusNode: _focus,
                          textInputAction: TextInputAction.search,
                          cursorColor: AppColors.accent,
                          style: AppTypography.headline.copyWith(fontSize: 16, fontWeight: FontWeight.w400),
                          decoration: InputDecoration(
                            isCollapsed: true,
                            border: InputBorder.none,
                            hintText: 'Find in Library',
                            hintStyle: AppTypography.headline
                                .copyWith(fontSize: 16, fontWeight: FontWeight.w400, color: Colors.white54),
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
                            child: Icon(Icons.cancel_rounded, size: 18, color: Colors.white54),
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
                        child: Text('Cancel',
                            maxLines: 1,
                            softWrap: false,
                            style: AppTypography.headline
                                .copyWith(fontSize: 16, fontWeight: FontWeight.w400, color: AppColors.accent)),
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

/* ------------------------------------------------------------------ */
/*  Section header                                                      */
/* ------------------------------------------------------------------ */
class _SecHeader extends StatelessWidget {
  const _SecHeader(this.title, {this.sub, this.onTap});
  final String title;
  final String? sub;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 26, 20, 12),
        child: PressableScale(
          onTap: onTap,
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.headline
                                  .copyWith(fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: -0.4)),
                        ),
                        if (onTap != null) const Icon(Icons.chevron_right_rounded, color: AppColors.textTertiary, size: 24),
                      ],
                    ),
                    if (sub != null) Text(sub!, style: AppTypography.footnote.copyWith(color: Colors.white60)),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}

/* ------------------------------------------------------------------ */
/*  Section designs                                                     */
/* ------------------------------------------------------------------ */

// 1. Following: circles
class _ArtistCircle extends StatelessWidget {
  const _ArtistCircle({required this.name, required this.cover, required this.onTap});
  final String name, cover;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 14),
        child: PressableScale(
          onTap: onTap,
          child: SizedBox(
            width: 92,
            child: Column(
              children: [
                _Avatar(cover, 88),
                const SizedBox(height: 8),
                Text(name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: AppTypography.headline.copyWith(fontSize: 13, fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      );
}

class _FindArtistTile extends StatelessWidget {
  const _FindArtistTile({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 14),
        child: PressableScale(
          onTap: onTap,
          child: SizedBox(
            width: 92,
            child: Column(
              children: [
                Container(
                  width: 88,
                  height: 88,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.accent.withValues(alpha: 0.12),
                    border: Border.all(color: AppColors.accent.withValues(alpha: 0.5), width: 1.5),
                  ),
                  child: const Icon(Icons.add_rounded, color: AppColors.accent, size: 34),
                ),
                const SizedBox(height: 8),
                Text('Find artists',
                    style: AppTypography.headline.copyWith(fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.accent)),
              ],
            ),
          ),
        ),
      );
}

// 2. Playlists: wide cards
class _PlaylistCard extends StatelessWidget {
  const _PlaylistCard({required this.playlist, required this.covers, required this.onTap});
  final UserPlaylist playlist;
  final List<String> covers;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 12),
        child: PressableScale(
          onTap: onTap,
          child: Container(
            width: 250,
            padding: const EdgeInsets.all(8),
            decoration: ShapeDecoration(
              color: AppColors.surface,
              shape: ContinuousRectangleBorder(
                borderRadius: BorderRadius.circular(AppSpacing.rTile * 2),
                side: const BorderSide(color: AppColors.hairline, width: 0.5),
              ),
            ),
            child: Row(
              children: [
                SizedBox(width: 72, height: 72, child: _Collage(covers, radius: 10)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(playlist.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.headline.copyWith(fontSize: 15, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text('${playlist.trackIds.length} ${playlist.trackIds.length == 1 ? 'song' : 'songs'}',
                          style: AppTypography.footnote.copyWith(color: Colors.white60)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, color: AppColors.textTertiary, size: 20),
              ],
            ),
          ),
        ),
      );
}

class _NewPlaylistCard extends StatelessWidget {
  const _NewPlaylistCard({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 12),
        child: PressableScale(
          onTap: onTap,
          child: Container(
            width: 150,
            padding: const EdgeInsets.all(8),
            decoration: ShapeDecoration(
              color: AppColors.accent.withValues(alpha: 0.12),
              shape: ContinuousRectangleBorder(
                borderRadius: BorderRadius.circular(AppSpacing.rTile * 2),
                side: BorderSide(color: AppColors.accent.withValues(alpha: 0.45), width: 1),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(10)),
                  child: const Icon(Icons.add_rounded, color: AppColors.accent, size: 30),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text('New\nplaylist',
                      style: AppTypography.headline
                          .copyWith(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.accent, height: 1.15)),
                ),
              ],
            ),
          ),
        ),
      );
}

// 3. Albums: squircle covers
class _AlbumCard extends StatelessWidget {
  const _AlbumCard({required this.title, required this.artist, required this.cover, required this.onTap});
  final String title, artist, cover;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 14),
        child: PressableScale(
          onTap: onTap,
          child: SizedBox(
            width: 140,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 140, height: 140, child: _Cover(cover, radius: 12)),
                const SizedBox(height: 8),
                Text(title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.headline.copyWith(fontSize: 14, fontWeight: FontWeight.w600)),
                Text(artist,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.footnote.copyWith(color: Colors.white60, fontSize: 12)),
              ],
            ),
          ),
        ),
      );
}

class _CtaTile extends StatelessWidget {
  const _CtaTile({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 14),
        child: PressableScale(
          onTap: onTap,
          child: Container(
            width: 140,
            height: 140,
            decoration: ShapeDecoration(
              color: AppColors.surface,
              shape: ContinuousRectangleBorder(
                borderRadius: BorderRadius.circular(24),
                side: const BorderSide(color: AppColors.hairline, width: 0.5),
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: AppColors.accent, size: 34),
                const SizedBox(height: 8),
                Text(label, style: AppTypography.headline.copyWith(fontSize: 14, color: AppColors.accent)),
              ],
            ),
          ),
        ),
      );
}

// 4. Recently added: paged rows in a rounded group
class _RecentPaged extends StatefulWidget {
  const _RecentPaged({required this.tracks, required this.onPlay, required this.onLongPress});
  final List<Track> tracks;
  final void Function(int) onPlay;
  final void Function(Track) onLongPress;

  @override
  State<_RecentPaged> createState() => _RecentPagedState();
}

class _RecentPagedState extends State<_RecentPaged> {
  final _pc = PageController(viewportFraction: 0.9);

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const rows = 3;
    final pages = (widget.tracks.length / rows).ceil();
    final curId = context.select<PlayerState, Object?>((p) => p.currentTrack?.id);

    return SizedBox(
      height: rows * 60.0,
      child: PageView.builder(
        controller: _pc,
        padEnds: false,
        physics: const BouncingScrollPhysics(),
        itemCount: pages,
        itemBuilder: (_, p) => Padding(
          padding: EdgeInsets.only(left: p == 0 ? 20 : 6, right: 6),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(18)),
            child: Column(
              children: List.generate(rows, (r) {
                final i = p * rows + r;
                if (i >= widget.tracks.length) return const SizedBox(height: 60);
                final t = widget.tracks[i];
                final active = curId == t.id;
                return PressableScale(
                  scale: 0.975,
                  onTap: () => widget.onPlay(i),
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onLongPress: () => widget.onLongPress(t),
                    child: SizedBox(
                      height: 60,
                      child: Row(
                        children: [
                          SizedBox(width: 44, height: 44, child: _Cover(t.coverUrl, radius: 8)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(t.title,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: AppTypography.headline.copyWith(
                                        fontSize: 15, fontWeight: FontWeight.w500, color: active ? AppColors.accent : null)),
                                Text(t.artist,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: AppTypography.footnote.copyWith(color: Colors.white60, fontSize: 13)),
                              ],
                            ),
                          ),
                          Icon(active ? Icons.graphic_eq_rounded : Icons.play_arrow_rounded,
                              color: active ? AppColors.accent : AppColors.textTertiary, size: 22),
                        ],
                      ),
                    ),
                  ),
                );
              }),
            ),
          ),
        ),
      ),
    );
  }
}

// 5. Mixes: gradient tiles
class _MixTile extends StatelessWidget {
  const _MixTile({required this.index, required this.name, required this.count, required this.onTap});
  final int index, count;
  final String name;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final g = _palette[index % _palette.length];
    return Padding(
      padding: const EdgeInsets.only(right: 14),
      child: PressableScale(
        onTap: onTap,
        child: SizedBox(
          width: 150,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 150,
                height: 150,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: g),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Made for you', style: AppTypography.footnote.copyWith(color: Colors.white70, fontSize: 12)),
                    const SizedBox(height: 2),
                    Text(name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.headline.copyWith(
                            fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.5, height: 1.05, color: Colors.white)),
                    const Spacer(),
                    Align(
                      alignment: Alignment.bottomRight,
                      child: Container(
                        width: 30,
                        height: 30,
                        decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white24),
                        child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 20),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Text('$name Mix',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.headline.copyWith(fontSize: 14, fontWeight: FontWeight.w600)),
              Text('$count ${count == 1 ? 'song' : 'songs'}',
                  style: AppTypography.footnote.copyWith(color: Colors.white60, fontSize: 12)),
            ],
          ),
        ),
      ),
    );
  }
}

// 6. Languages: flat colour tiles
class _LanguageTile extends StatelessWidget {
  const _LanguageTile({required this.index, required this.name, required this.count, required this.onTap});
  final int index, count;
  final String name;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 12),
        child: PressableScale(
          onTap: onTap,
          child: Container(
            width: 132,
            height: 76,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: _palette[index % _palette.length][0], borderRadius: BorderRadius.circular(14)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(name.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.headline
                        .copyWith(fontSize: 17, fontWeight: FontWeight.w800, letterSpacing: 0.3, color: Colors.white)),
                Text('$count ${count == 1 ? 'song' : 'songs'}',
                    style: AppTypography.footnote.copyWith(color: Colors.white70, fontSize: 12)),
              ],
            ),
          ),
        ),
      );
}

/* ------------------------------------------------------------------ */
/*  Tab rows / cards                                                    */
/* ------------------------------------------------------------------ */
class _ArtistRow extends StatelessWidget {
  const _ArtistRow({required this.name, required this.cover, required this.subtitle, required this.onTap});
  final String name, cover, subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
        onTap: onTap,
        scale: 0.98,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          child: Row(
            children: [
              _Avatar(cover, 52),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.headline.copyWith(fontSize: 16, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(subtitle, style: AppTypography.footnote.copyWith(color: Colors.white60, fontSize: 13)),
                  ],
                ),
              ),
              _FollowPill(name: name, cover: cover),
            ],
          ),
        ),
      );
}

class _FollowPill extends StatelessWidget {
  const _FollowPill({required this.name, required this.cover});
  final String name, cover;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: LibraryStore.instance,
        builder: (context, _) {
          final on = LibraryStore.instance.isFollowing(name);
          return PressableScale(
            scale: 0.92,
            onTap: () {
              HapticFeedback.selectionClick();
              LibraryStore.instance.toggleFollow(name, cover);
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 420),
              curve: Curves.easeOutBack,
              height: 32,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: on ? Colors.white.withValues(alpha: 0.12) : AppColors.accent,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(on ? 'Following' : 'Follow',
                  style: AppTypography.headline.copyWith(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
            ),
          );
        },
      );
}

class _AlbumGridCard extends StatelessWidget {
  const _AlbumGridCard({required this.title, required this.artist, required this.cover, required this.onTap});
  final String title, artist, cover;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _Cover(cover, radius: 12),
                  Positioned(
                    right: 8,
                    bottom: 8,
                    child: ListenableBuilder(
                      listenable: LibraryStore.instance,
                      builder: (context, _) {
                        final on = LibraryStore.instance.isAlbumSaved(title, artist);
                        return PressableScale(
                          scale: 0.85,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            LibraryStore.instance.toggleAlbum(title, artist, cover);
                          },
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 380),
                            curve: Curves.easeOutBack,
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: on ? Colors.white : Colors.black.withValues(alpha: 0.55),
                            ),
                            child: Icon(on ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                                size: 18, color: on ? AppColors.accent : Colors.white),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.headline.copyWith(fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text(artist,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.footnote.copyWith(color: Colors.white60, fontSize: 12)),
          ],
        ),
      );
}

class _TrackRow extends StatelessWidget {
  const _TrackRow({required this.track, required this.onTap, required this.onLongPress});
  final Track track;
  final VoidCallback onTap, onLongPress;

  @override
  Widget build(BuildContext context) => Selector<PlayerState, ({Object? id, bool playing})>(
        selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
        builder: (context, s, child) {
          final active = s.id == track.id;
          return GestureDetector(
            behavior: HitTestBehavior.translucent,
            onLongPress: onLongPress,
            child: SongTile(track: track, isActive: active, isPlaying: active && s.playing, onTap: onTap),
          );
        },
      );
}

/* ------------------------------------------------------------------ */
/*  Images                                                              */
/* ------------------------------------------------------------------ */
class _Cover extends StatelessWidget {
  const _Cover(this.url, {this.radius = 10});
  final String url;
  final double radius;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: url.isEmpty
            ? Container(color: Colors.white.withValues(alpha: 0.06), child: const Icon(Icons.music_note_rounded, color: Colors.white24))
            : CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                width: double.infinity,
                height: double.infinity,
                errorWidget: (context, u, e) => Container(
                  color: Colors.white.withValues(alpha: 0.06),
                  child: const Icon(Icons.music_note_rounded, color: Colors.white24),
                ),
              ),
      );
}

class _Avatar extends StatelessWidget {
  const _Avatar(this.url, this.size);
  final String url;
  final double size;

  @override
  Widget build(BuildContext context) => ClipOval(
        child: Container(
          width: size,
          height: size,
          color: Colors.white.withValues(alpha: 0.08),
          child: url.isEmpty
              ? Icon(Icons.person_rounded, size: size * 0.5, color: Colors.white38)
              : CachedNetworkImage(
                  imageUrl: url,
                  fit: BoxFit.cover,
                  errorWidget: (context, u, e) => Icon(Icons.person_rounded, size: size * 0.5, color: Colors.white38),
                ),
        ),
      );
}

/// 2×2 collage for playlists with 4+ songs, a single cover for fewer.
class _Collage extends StatelessWidget {
  const _Collage(this.urls, {this.radius = 12});
  final List<String> urls;
  final double radius;

  Widget _img(String u) => CachedNetworkImage(
        imageUrl: u,
        fit: BoxFit.cover,
        errorWidget: (context, url, e) => Container(color: Colors.white.withValues(alpha: 0.06)),
      );

  @override
  Widget build(BuildContext context) {
    Widget child;
    if (urls.isEmpty) {
      child = const Center(child: Icon(Icons.queue_music_rounded, size: 34, color: Colors.white24));
    } else if (urls.length < 4) {
      child = SizedBox.expand(child: _img(urls.first));
    } else {
      child = Column(
        children: [
          Expanded(child: Row(children: [Expanded(child: SizedBox.expand(child: _img(urls[0]))), Expanded(child: SizedBox.expand(child: _img(urls[1])))])),
          Expanded(child: Row(children: [Expanded(child: SizedBox.expand(child: _img(urls[2]))), Expanded(child: SizedBox.expand(child: _img(urls[3])))])),
        ],
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Container(color: Colors.white.withValues(alpha: 0.06), child: child),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Liked Songs hero (heartbeat is the single ambient motion)           */
/* ------------------------------------------------------------------ */
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
  final VoidCallback onOpen, onPlay, onShuffle;

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
            shape: ContinuousRectangleBorder(borderRadius: BorderRadius.circular(AppSpacing.rCard * 2)),
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFFE11D48), Color(0xFF9E2339)],
            ),
            shadows: [BoxShadow(color: AppColors.accent.withValues(alpha: 0.30), blurRadius: 24, offset: const Offset(0, 10))],
          ),
          child: Stack(
            children: [
              Positioned(
                right: -26,
                bottom: -34,
                child: Transform.rotate(
                  angle: -0.25,
                  child: Icon(Icons.favorite_rounded, size: 150, color: Colors.white.withValues(alpha: 0.08)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    AnimatedBuilder(
                      animation: ambient,
                      builder: (_, child) => Transform.scale(scale: _beat(ambient.value), child: child),
                      child: Container(
                        width: 60,
                        height: 60,
                        decoration: ShapeDecoration(
                          shape: ContinuousRectangleBorder(borderRadius: BorderRadius.circular(28)),
                          color: Colors.white.withValues(alpha: 0.22),
                        ),
                        child: const Icon(Icons.favorite_rounded, color: Colors.white, size: 30),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Liked Songs',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppTypography.headline
                                  .copyWith(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.3, color: Colors.white)),
                          const SizedBox(height: 2),
                          Text(count == 1 ? '1 song' : '$count songs',
                              style: AppTypography.footnote.copyWith(color: Colors.white70)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    _RoundButton(icon: Icons.shuffle_rounded, filled: false, onTap: onShuffle),
                    const SizedBox(width: 10),
                    _RoundButton(icon: Icons.play_arrow_rounded, filled: true, onTap: onPlay),
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
  const _RoundButton({required this.icon, required this.filled, required this.onTap});
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
          child: Icon(icon, size: filled ? 28 : 22, color: filled ? const Color(0xFFE11D48) : Colors.white),
        ),
      );
}

/* ------------------------------------------------------------------ */
/*  Grid tile + equalizer                                               */
/* ------------------------------------------------------------------ */
class _GridTile extends StatelessWidget {
  const _GridTile({
    required this.title,
    required this.artist,
    required this.coverUrl,
    required this.active,
    required this.playing,
    required this.onTap,
    required this.onLongPress,
  });

  final String title, artist, coverUrl;
  final bool active, playing;
  final VoidCallback onTap, onLongPress;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onTap,
      child: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onLongPress: onLongPress,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _Cover(coverUrl, radius: 12),
                  if (active) Positioned(left: 8, bottom: 8, child: _EqBadge(playing: playing)),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.headline.copyWith(fontSize: 14, color: active ? AppColors.accent : null)),
            const SizedBox(height: 1),
            Text(artist,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.footnote.copyWith(color: Colors.white60)),
          ],
        ),
      ),
    );
  }
}

class _EqBadge extends StatefulWidget {
  const _EqBadge({required this.playing});
  final bool playing;

  @override
  State<_EqBadge> createState() => _EqBadgeState();
}

class _EqBadgeState extends State<_EqBadge> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

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
        decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.black.withValues(alpha: 0.45)),
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
      final h = playing ? lerpDouble(4, 12, 0.5 + 0.5 * math.sin((anim.value + i * 0.33) * math.pi * 2))! : 4.0;
      final x = left + i * (barW + gap);
      canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(x, (size.height - h) / 2, barW, h), const Radius.circular(1.5)),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _EqPainter old) => old.playing != playing;
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.icon, required this.title, required this.message, this.actionLabel, this.onAction});
  final IconData icon;
  final String title, message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => SpringIn(
        rise: 20,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(40, 48, 40, 24),
          child: Column(
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0x0FFFFFFF)),
                child: Icon(icon, size: 32, color: Colors.white38),
              ),
              const SizedBox(height: 16),
              Text(title, textAlign: TextAlign.center, style: AppTypography.headline.copyWith(fontSize: 18)),
              const SizedBox(height: 6),
              Text(message, textAlign: TextAlign.center, style: AppTypography.footnote.copyWith(color: Colors.white60)),
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: 18),
                PressableScale(
                  onTap: onAction,
                  child: Container(
                    height: 42,
                    padding: const EdgeInsets.symmetric(horizontal: 22),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(21)),
                    child: Text(actionLabel!,
                        style: AppTypography.headline.copyWith(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                  ),
                ),
              ],
            ],
          ),
        ),
      );
}