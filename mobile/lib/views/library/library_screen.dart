import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart'
    show
        CupertinoActionSheet,
        CupertinoActionSheetAction,
        CupertinoActivityIndicator,
        CupertinoAlertDialog,
        CupertinoDialogAction,
        CupertinoSearchTextField,
        CupertinoSliverRefreshControl,
        CupertinoTextField,
        CupertinoTextThemeData,
        CupertinoTheme,
        CupertinoThemeData,
        showCupertinoDialog,
        showCupertinoModalPopup;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_typography.dart';
import '../../design_system/widgets/dynamic_island_header.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/spring_kit.dart';
import '../../design_system/zen.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/innertube_service.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';
import '../details/album_screen.dart';
import '../details/artist_screen.dart';

/* ═══════════════════════════════════════════════════════════════════
 *  Tokens (Apple Music look: pure black, rose accent, hairlines)
 * ═══════════════════════════════════════════════════════════════════ */
const _rose = Color(0xFFFA2D48);
const _fill = Color(0x1FFFFFFF); // white 12%
const _hair = Color(0x26FFFFFF); // separators
const _sub = Color(0x99EBEBF5); // secondary label
const _tile = Color(0xFFEFEFF1); // light tile (liked cover)

/// Slightly under-damped spring: settles fast with a tiny, natural overshoot.
const _springD = SpringDescription(mass: 1, stiffness: 380, damping: 26);

void _spring(AnimationController c, double to, {double v = 0}) {
  c.animateWith(SpringSimulation(_springD, c.value, to, v));
}

TextStyle _t(double size, {FontWeight w = FontWeight.w400, Color c = Colors.white, double? ls}) =>
    AppTypography.headline.copyWith(fontSize: size, fontWeight: w, color: c, letterSpacing: ls);

final _dark = CupertinoThemeData(
  brightness: Brightness.dark,
  primaryColor: _rose,
  scaffoldBackgroundColor: Colors.black,
  textTheme: CupertinoTextThemeData(
    primaryColor: _rose,
    navLargeTitleTextStyle: _t(34, w: FontWeight.w700, ls: 0.4),
    navTitleTextStyle: _t(17, w: FontWeight.w600),
    navActionTextStyle: _t(17, c: _rose),
  ),
);

String _n(int n, String one, String many) => '$n ${n == 1 ? one : many}';

enum _Sort {
  recent('Recently Added'),
  title('Title'),
  artist('Artist');

  const _Sort(this.label);
  final String label;
}

enum _Cat {
  playlists('Playlists', Icons.queue_music_rounded),
  artists('Artists', Icons.mic_external_on_rounded),
  albums('Albums', Icons.album_rounded),
  songs('Songs', Icons.music_note_rounded),
  liked('Liked Songs', Icons.favorite_rounded);

  const _Cat(this.label, this.icon);
  final String label;
  final IconData icon;
}

/* ═══════════════════════════════════════════════════════════════════
 *  Spring primitives
 * ═══════════════════════════════════════════════════════════════════ */

/// Pulses its child with a spring whenever [trigger] changes
/// (like heart, follow pill, add/check toggles).
class _Bump extends StatefulWidget {
  const _Bump({required this.trigger, required this.child});
  final Object? trigger;
  final Widget child;

  @override
  State<_Bump> createState() => _BumpState();
}

class _BumpState extends State<_Bump> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 1);

  @override
  void didUpdateWidget(covariant _Bump old) {
    super.didUpdateWidget(old);
    if (old.trigger != widget.trigger) {
      _c.value = 0.78;
      _spring(_c, 1, v: 5);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, ch) => Transform.scale(scale: _c.value, child: ch),
      );
}

/// One-shot staggered spring entrance (rise + fade + scale).
class _SpringAppear extends StatefulWidget {
  const _SpringAppear({required this.child, this.index = 0});
  final Widget child;
  final int index;

  @override
  State<_SpringAppear> createState() => _SpringAppearState();
}

class _SpringAppearState extends State<_SpringAppear> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 0);
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    if (widget.index >= 10) {
      _c.value = 1;
    } else {
      _timer = Timer(Duration(milliseconds: 35 * widget.index), () {
        if (mounted) _spring(_c, 1);
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return widget.child;
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (_, ch) {
        final v = _c.value;
        return Opacity(
          opacity: v.clamp(0.0, 1.0).toDouble(),
          child: Transform.translate(
            offset: Offset(0, (1 - v) * 18),
            child: Transform.scale(scale: 0.94 + 0.06 * v, child: ch),
          ),
        );
      },
    );
  }
}

/// Collapses/expands height with a spring (used by Edit mode).
class _SpringVisible extends StatefulWidget {
  const _SpringVisible({required this.visible, required this.child});
  final bool visible;
  final Widget child;

  @override
  State<_SpringVisible> createState() => _SpringVisibleState();
}

class _SpringVisibleState extends State<_SpringVisible> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: widget.visible ? 1 : 0);

  @override
  void didUpdateWidget(covariant _SpringVisible old) {
    super.didUpdateWidget(old);
    if (old.visible != widget.visible) _spring(_c, widget.visible ? 1 : 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, ch) {
          final f = _c.value.clamp(0.0, 1.0).toDouble();
          if (f <= 0.001 && !widget.visible) return const SizedBox.shrink();
          return ClipRect(
            child: Align(alignment: Alignment.topCenter, heightFactor: f, child: Opacity(opacity: f, child: ch)),
          );
        },
      );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Shared actions
 * ═══════════════════════════════════════════════════════════════════ */
void _play(BuildContext c, List<Track> l, int i) {
  if (l.isEmpty) return;
  HapticFeedback.lightImpact();
  final startIdx = i.clamp(0, l.length - 1);
  final ctx = PlaybackContext(
    type: PlaybackContextType.library,
    id: 'library',
    tracks: l,
    startTrack: l[startIdx],
  );
  c.read<PlayerState>().setQueue(l, startIndex: startIdx, collectionLocked: true, context: ctx);
}

void _shuffle(BuildContext c, List<Track> l) {
  if (l.isEmpty) return;
  HapticFeedback.lightImpact();
  final ctx = PlaybackContext(
    type: PlaybackContextType.library,
    id: 'library',
    tracks: l,
    startTrack: l.first,
  );
  c.read<PlayerState>().setQueue(l, startIndex: 0, shuffle: true, collectionLocked: true, context: ctx);
}

Future<T?> _push<T>(BuildContext c, Widget page, {bool modal = false}) {
  HapticFeedback.selectionClick();
  return Navigator.of(c).push(ZenPageRoute<T>(builder: (_) => page, fullscreenDialog: modal));
}

void _openArtist(BuildContext c, String name) =>
    _push(c, ArtistScreen(artistName: MediaNormalizer.stripIdNoise(name)));

void _openAlbum(BuildContext c, String title, String artist, String cover) => _push(
      c,
      AlbumScreen(
        albumTitle: MediaNormalizer.stripIdNoise(title),
        artistName: MediaNormalizer.stripIdNoise(artist),
        coverUrl: cover,
      ),
    );

void _toast(BuildContext c, String msg) {
  ScaffoldMessenger.of(c)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(msg),
      duration: const Duration(milliseconds: 1400),
      behavior: SnackBarBehavior.floating,
    ));
}

class _A {
  const _A(this.key, this.icon, this.label, {this.danger = false});
  final String key, label;
  final IconData icon;
  final bool danger;
}

Future<String?> _sheet(BuildContext c, List<_A> actions, {String? title, String? message}) =>
    showCupertinoModalPopup<String>(
      context: c,
      builder: (ctx) => CupertinoTheme(
        data: _dark,
        child: CupertinoActionSheet(
          title: title == null ? null : Text(title),
          message: message == null ? null : Text(message),
          actions: [
            for (final a in actions)
              CupertinoActionSheetAction(
                isDestructiveAction: a.danger,
                onPressed: () => Navigator.pop(ctx, a.key),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [Flexible(child: Text(a.label, overflow: TextOverflow.ellipsis)), Icon(a.icon, size: 20)],
                ),
              ),
          ],
          cancelButton: CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        ),
      ),
    );

Future<String?> _promptName(BuildContext c, {required String title, String initial = '', required String confirm}) {
  final ctl = TextEditingController(text: initial);
  return showCupertinoDialog<String>(
    context: c,
    builder: (ctx) => CupertinoTheme(
      data: _dark,
      child: CupertinoAlertDialog(
        title: Text(title),
        content: Padding(
          padding: const EdgeInsets.only(top: 12),
          child: CupertinoTextField(
            controller: ctl,
            autofocus: true,
            placeholder: 'Playlist Name',
            maxLength: 40,
            style: const TextStyle(color: Colors.white),
            cursorColor: _rose,
            decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(8)),
          ),
        ),
        actions: [
          CupertinoDialogAction(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.of(ctx).pop(ctl.text.trim()),
            child: Text(confirm),
          ),
        ],
      ),
    ),
  ).whenComplete(ctl.dispose);
}

Future<bool> _confirm(BuildContext c, {required String title, required String message, required String action}) async {
  final r = await showCupertinoDialog<bool>(
    context: c,
    builder: (ctx) => CupertinoTheme(
      data: _dark,
      child: CupertinoAlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          CupertinoDialogAction(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          CupertinoDialogAction(
              isDestructiveAction: true, onPressed: () => Navigator.of(ctx).pop(true), child: Text(action)),
        ],
      ),
    ),
  );
  return r ?? false;
}

Future<UserPlaylist?> _createPlaylist(BuildContext c, {Track? first}) async {
  final n = await _promptName(c, title: 'New Playlist', confirm: 'Create');
  if (n == null || n.isEmpty || !c.mounted) return null;
  final store = LibraryStore.instance;
  final p = store.createPlaylist(n, first: first);
  HapticFeedback.mediumImpact();
  _push(c, _PlaylistPage(p));
  return p;
}

/// Long-press / ellipsis menu for any song.
Future<void> _trackActions(BuildContext c, Track t) async {
  HapticFeedback.mediumImpact();
  final store = LibraryStore.instance;
  final liked = store.isLiked(t);
  final act = await _sheet(
    c,
    [
      _A('like', liked ? Icons.favorite_border_rounded : Icons.favorite_rounded,
          liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'),
      const _A('playlist', Icons.playlist_add_rounded, 'Add to Playlist…'),
      const _A('artist', Icons.person_outline_rounded, 'Go to Artist'),
    ],
    title: t.title,
    message: t.artist,
  );
  if (!c.mounted || act == null) return;
  switch (act) {
    case 'like':
      store.toggleLike(t);
      _toast(c, store.isLiked(t) ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    case 'playlist':
      await _addToPlaylist(c, t);
    case 'artist':
      _openArtist(c, t.artist);
  }
}

Future<void> _addToPlaylist(BuildContext c, Track t) async {
  final store = LibraryStore.instance;
  final lists = store.playlists.toList();
  final pick = await _sheet(
    c,
    [
      const _A('__new', Icons.add_rounded, 'New Playlist…'),
      for (var i = 0; i < lists.length; i++) _A('$i', Icons.queue_music_rounded, lists[i].name),
    ],
    title: 'Add to Playlist',
  );
  if (!c.mounted || pick == null) return;
  if (pick == '__new') {
    final n = await _promptName(c, title: 'New Playlist', confirm: 'Create');
    if (n == null || n.isEmpty || !c.mounted) return;
    store.createPlaylist(n, first: t);
    _toast(c, 'Added to “$n”');
    return;
  }
  final idx = int.tryParse(pick);
  if (idx == null || idx >= lists.length) return;
  final p = lists[idx];
  final ok = store.addToPlaylist(p.id, t);
  _toast(c, ok ? 'Added to “${p.name}”' : 'Already in this playlist');
}

Future<void> _playlistMenu(BuildContext c, UserPlaylist p, {bool inDetail = false}) async {
  HapticFeedback.mediumImpact();
  final store = LibraryStore.instance;
  final tracks = store.playlistTracks(p);
  final act = await _sheet(
    c,
    [
      if (tracks.isNotEmpty) const _A('play', Icons.play_arrow_rounded, 'Play'),
      if (tracks.isNotEmpty) const _A('shuffle', Icons.shuffle_rounded, 'Shuffle'),
      if (inDetail) const _A('add', Icons.add_rounded, 'Add Songs…'),
      const _A('rename', Icons.edit_rounded, 'Rename'),
      const _A('delete', Icons.delete_outline_rounded, 'Delete Playlist', danger: true),
    ],
    title: p.name,
  );
  if (!c.mounted || act == null) return;
  switch (act) {
    case 'play':
      _play(c, tracks, 0);
    case 'shuffle':
      _shuffle(c, tracks);
    case 'add':
      await _push(c, _AddSongsPage(p), modal: true);
    case 'rename':
      final n = await _promptName(c, title: 'Rename Playlist', initial: p.name, confirm: 'Save');
      if (n != null && n.isNotEmpty) store.renamePlaylist(p.id, n);
    case 'delete':
      final ok = await _confirm(c,
          title: 'Delete “${p.name}”?', message: 'This playlist will be removed from your library.', action: 'Delete');
      if (!ok || !c.mounted) return;
      HapticFeedback.mediumImpact();
      if (inDetail) Navigator.of(c).pop();
      store.deletePlaylist(p.id);
  }
}

Future<void> _sortSheet(BuildContext c, _Sort cur, ValueChanged<_Sort> onPick) async {
  final r = await _sheet(
    c,
    [
      _A('recent', Icons.access_time_rounded, '${cur == _Sort.recent ? '✓  ' : ''}Recently Added'),
      _A('title', Icons.sort_by_alpha_rounded, '${cur == _Sort.title ? '✓  ' : ''}Title'),
      _A('artist', Icons.person_outline_rounded, '${cur == _Sort.artist ? '✓  ' : ''}Artist'),
    ],
    title: 'Sort By',
  );
  if (r == null) return;
  final s = _Sort.values.firstWhere((e) => e.name == r);
  if (s != cur) {
    HapticFeedback.selectionClick();
    onPick(s);
  }
}

List<Track> _filterTracks(List<Track> src, String query, _Sort sort) {
  final q = query.trim().toLowerCase();
  final list = q.isEmpty
      ? List<Track>.of(src)
      : src.where((t) => t.title.toLowerCase().contains(q) || t.artist.toLowerCase().contains(q)).toList();
  switch (sort) {
    case _Sort.recent:
      break;
    case _Sort.title:
      list.sort((a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()));
    case _Sort.artist:
      list.sort((a, b) => a.artist.toLowerCase().compareTo(b.artist.toLowerCase()));
  }
  return list;
}

/* ═══════════════════════════════════════════════════════════════════
 *  Page shell: native-feeling large title + back swipe
 * ═══════════════════════════════════════════════════════════════════ */
Widget _page({
  required String title,
  String? previous,
  Widget? trailing,
  bool root = false,
  required List<Widget> slivers,
}) =>
    AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Builder(
          builder: (context) {
            final top = MediaQuery.paddingOf(context).top;
            return Stack(
              children: [
                CustomScrollView(
                  keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
                  slivers: [
                    SliverToBoxAdapter(child: SizedBox(height: top + 56)),
                    ...slivers,
                    const SliverToBoxAdapter(child: SizedBox(height: 120)),
                  ],
                ),
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: DynamicIslandHeader(
                    title: title,
                    showBack: !root,
                    isDockPage: root,
                    onBack: () => Navigator.maybePop(context),
                    showProfile: true,
                    trailing: trailing,
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );

/* ═══════════════════════════════════════════════════════════════════
 *  LIBRARY (root)
 * ═══════════════════════════════════════════════════════════════════ */
class _Item {
  const _Item({required this.title, required this.sub, required this.cover, required this.onTap, this.onLong});
  final String title, sub;
  final Widget cover;
  final VoidCallback onTap;
  final VoidCallback? onLong;
}

class LibraryScreen extends StatefulWidget {
  const LibraryScreen({super.key, this.onOpenProfile, this.onRefresh});

  final VoidCallback? onOpenProfile;
  final Future<void> Function()? onRefresh;

  @override
  State<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends State<LibraryScreen> {
  bool _editing = false;
  final Set<_Cat> _hidden = {};

  @override
  void initState() {
    super.initState();
    LibraryStore.instance.ensureLoaded();
  }

  void _open(_Cat c) {
    switch (c) {
      case _Cat.playlists:
        _push(context, const _PlaylistsPage());
      case _Cat.artists:
        _push(context, const _ArtistsPage());
      case _Cat.albums:
        _push(context, const _AlbumsPage());
      case _Cat.songs:
        _push(context, const _SongsPage());
      case _Cat.liked:
        _push(context, const _LikedPage());
    }
  }

  Future<void> _menu() async {
    HapticFeedback.selectionClick();
    final r = await _sheet(context, const [
      _A('new', Icons.add_rounded, 'New Playlist…'),
      _A('edit', Icons.edit_rounded, 'Edit Library'),
    ]);
    if (!mounted || r == null) return;
    if (r == 'new') {
      await _createPlaylist(context);
    } else {
      setState(() => _editing = true);
    }
  }

  List<_Item> _recent(LibraryStore s) {
    final items = <_Item>[
      _Item(
        title: 'Liked Songs',
        sub: _n(s.likedCount, 'song', 'songs'),
        cover: const _LikedCover(),
        onTap: () => _push(context, const _LikedPage()),
      ),
      for (final p in s.playlists)
        _Item(
          title: p.name,
          sub: _n(p.trackIds.length, 'song', 'songs'),
          cover: _Collage(s.playlistTracks(p).take(4).map((t) => t.coverUrl).toList(), radius: 0),
          onTap: () => _push(context, _PlaylistPage(p)),
          onLong: () => _playlistMenu(context, p),
        ),
      for (final a in s.savedAlbums)
        _Item(
          title: a.title,
          sub: a.artist,
          cover: _Cover(a.cover, radius: 0),
          onTap: () => _openAlbum(context, a.title, a.artist, a.cover),
        ),
      for (final art in s.followedArtists)
        _Item(
          title: art.name,
          sub: 'Artist',
          cover: _Avatar(art.cover, 160),
          onTap: () => _openArtist(context, art.name),
        ),
    ];
    if (items.length < 8) {
      final keys = s.savedAlbums.map((a) => '${a.title}|${a.artist}').toSet();
      for (final a in catalogAlbums()) {
        if (items.length >= 8) break;
        if (keys.contains('${a.title}|${a.artist}')) continue;
        items.add(_Item(
          title: a.title,
          sub: a.artist,
          cover: _Cover(a.cover, radius: 0),
          onTap: () => _openAlbum(context, a.title, a.artist, a.cover),
        ));
      }
    }
    return items;
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([LibraryStore.instance, CatalogDataSource.tracksNotifier]),
      builder: (context, _) {
        final store = LibraryStore.instance;
        if (!store.isLoaded) {
          return const ColoredBox(
            color: Colors.black,
            child: Center(
              child: CupertinoActivityIndicator(radius: 14, color: _rose),
            ),
          );
        }
        final items = _recent(store);
        final w = (MediaQuery.sizeOf(context).width - 40 - 16) / 2;

        return _page(
          title: 'Library',
          root: true,
          trailing: _editing
              ? _TextBtn('Done', onTap: () {
                  HapticFeedback.selectionClick();
                  setState(() => _editing = false);
                })
              : Row(mainAxisSize: MainAxisSize.min, children: [
                  _CircleBtn(Icons.more_horiz_rounded, _menu),
                  const SizedBox(width: 10),
                  ProfileAvatarButton(size: 32, onTap: widget.onOpenProfile),
                ]),
          slivers: [
            CupertinoSliverRefreshControl(
              onRefresh: () async {
                HapticFeedback.lightImpact();
                await (widget.onRefresh?.call() ?? CatalogDataSource.initialize());
              },
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Column(
                  children: [
                    for (final c in _Cat.values)
                      _SpringVisible(
                        visible: _editing || !_hidden.contains(c),
                        child: _CategoryRow(
                          cat: c,
                          editing: _editing,
                          checked: !_hidden.contains(c),
                          onTap: () {
                            if (_editing) {
                              HapticFeedback.selectionClick();
                              setState(() => _hidden.contains(c) ? _hidden.remove(c) : _hidden.add(c));
                            } else {
                              _open(c);
                            }
                          },
                        ),
                      ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 30, 20, 14),
                child: Text('Recently Added', style: _t(22, w: FontWeight.w700, ls: -0.3)),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              sliver: SliverGrid(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 18,
                  crossAxisSpacing: 16,
                  mainAxisExtent: w + 56,
                ),
                delegate: SliverChildBuilderDelegate(
                  (_, i) => _Tile(item: items[i], index: i),
                  childCount: items.length,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({required this.cat, required this.editing, required this.checked, required this.onTap});
  final _Cat cat;
  final bool editing, checked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
        scale: 0.985,
        onTap: onTap,
        child: Container(
          color: Colors.transparent,
          padding: const EdgeInsets.only(left: 20),
          child: Row(
            children: [
              AnimatedSize(
                duration: const Duration(milliseconds: 280),
                curve: Curves.easeOutCubic,
                child: editing
                    ? Padding(
                        padding: const EdgeInsets.only(right: 12),
                        child: _Bump(
                          trigger: checked,
                          child: Icon(checked ? Icons.check_circle_rounded : Icons.circle_outlined,
                              color: checked ? _rose : _sub, size: 24),
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
              SizedBox(width: 36, child: Icon(cat.icon, color: _rose, size: 28)),
              const SizedBox(width: 14),
              Expanded(
                child: Container(
                  height: 48,
                  alignment: Alignment.centerLeft,
                  decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _hair, width: 0.5))),
                  child: Row(
                    children: [
                      Expanded(child: Text(cat.label, style: _t(22))),
                      if (!editing)
                        const Padding(
                          padding: EdgeInsets.only(right: 16),
                          child: Icon(Icons.chevron_right_rounded, color: Color(0x4DEBEBF5), size: 22),
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

class _Tile extends StatelessWidget {
  const _Tile({required this.item, required this.index});
  final _Item item;
  final int index;

  @override
  Widget build(BuildContext context) => _SpringAppear(
        index: index,
        child: PressableScale(
          onTap: item.onTap,
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onLongPress: item.onLong,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AspectRatio(aspectRatio: 1, child: _Frame(child: item.cover)),
                const SizedBox(height: 8),
                Text(item.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: _t(15, w: FontWeight.w500)),
                Text(item.sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: _t(14, c: _sub)),
              ],
            ),
          ),
        ),
      );
}

/* ═══════════════════════════════════════════════════════════════════
 *  PLAYLISTS
 * ═══════════════════════════════════════════════════════════════════ */
class _PlaylistsPage extends StatelessWidget {
  const _PlaylistsPage();

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: LibraryStore.instance,
        builder: (ctx, _) {
          final s = LibraryStore.instance;
          final lists = s.playlists.toList();
          return _page(
            title: 'Playlists',
            previous: 'Library',
            trailing: _CircleBtn(Icons.add_rounded, () => _createPlaylist(ctx)),
            slivers: [
              SliverToBoxAdapter(
                child: _ListRow(
                  leading: Container(
                    decoration: BoxDecoration(color: _rose.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(8)),
                    child: const Icon(Icons.add_rounded, color: _rose, size: 28),
                  ),
                  title: 'New Playlist…',
                  titleColor: _rose,
                  thumb: 44,
                  onTap: () => _createPlaylist(ctx),
                ),
              ),
              if (lists.isEmpty)
                SliverToBoxAdapter(
                  child: _Empty(
                    icon: Icons.queue_music_rounded,
                    title: 'No Playlists Yet',
                    message: 'Create playlists for workouts, road trips, or favorite vibes.',
                    action: PressableScale(
                      scale: 0.95,
                      onTap: () => _createPlaylist(ctx),
                      child: Container(
                        margin: const EdgeInsets.only(top: 6),
                        height: 42,
                        padding: const EdgeInsets.symmetric(horizontal: 22),
                        decoration: BoxDecoration(
                          color: _rose,
                          borderRadius: BorderRadius.circular(21),
                          boxShadow: [
                            BoxShadow(
                              color: _rose.withValues(alpha: 0.35),
                              blurRadius: 14,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.add_rounded, color: Colors.white, size: 20),
                            const SizedBox(width: 8),
                            Text('Create Playlist', style: _t(14, w: FontWeight.w700, c: Colors.white)),
                          ],
                        ),
                      ),
                    ),
                  ),
                )
              else
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (c, i) {
                      final p = lists[i];
                      return _ListRow(
                        leading: _Frame(
                          radius: 8,
                          child: _Collage(s.playlistTracks(p).take(4).map((t) => t.coverUrl).toList(), radius: 0),
                        ),
                        title: p.name,
                        subtitle: _n(p.trackIds.length, 'song', 'songs'),
                        trailing: const Icon(Icons.chevron_right_rounded, color: Color(0x4DEBEBF5), size: 22),
                        onTap: () => _push(c, _PlaylistPage(p)),
                        onLong: () => _playlistMenu(c, p),
                      );
                    },
                    childCount: lists.length,
                  ),
                ),
            ],
          );
        },
      );
}

class _PlaylistPage extends StatelessWidget {
  const _PlaylistPage(this.initial);
  final UserPlaylist initial;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([LibraryStore.instance, CatalogDataSource.tracksNotifier]),
        builder: (ctx, _) {
          final s = LibraryStore.instance;
          final p = s.playlistById(initial.id);
          if (p == null) return const ColoredBox(color: Colors.black);
          final tracks = s.playlistTracks(p);

          return _page(
            title: p.name,
            previous: 'Playlists',
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _CircleBtn(Icons.search_rounded, () => _push(ctx, _AddSongsPage(p), modal: true)),
                const SizedBox(width: 8),
                _CircleBtn(Icons.more_horiz_rounded, () => _playlistMenu(ctx, p, inDetail: true)),
              ],
            ),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                  child: Column(
                    children: [
                      Center(
                        child: SizedBox(
                          width: 220,
                          height: 220,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(12),
                              boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 24, offset: Offset(0, 10))],
                            ),
                            child: _Frame(
                              radius: 12,
                              child: _Collage(tracks.take(4).map((t) => t.coverUrl).toList(), radius: 0),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(_n(tracks.length, 'song', 'songs'), style: _t(14, c: _sub)),
                      const SizedBox(height: 16),
                      if (tracks.isNotEmpty) ...[
                        _PlayShuffle(onPlay: () => _play(ctx, tracks, 0), onShuffle: () => _shuffle(ctx, tracks)),
                        const SizedBox(height: 6),
                      ],
                    ],
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                  child: PressableScale(
                    scale: 0.98,
                    onTap: () => _push(ctx, _AddSongsPage(p), modal: true),
                    child: Container(
                      height: 52,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      decoration: BoxDecoration(
                        color: _fill,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _hair),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 32,
                            height: 32,
                            decoration: BoxDecoration(
                              color: _rose.withValues(alpha: 0.18),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.search_rounded, color: _rose, size: 18),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Search & Add Songs', style: _t(15, w: FontWeight.w600, c: _rose)),
                                Text('Search online songs to add to this playlist', style: _t(11, c: _sub)),
                              ],
                            ),
                          ),
                          const Icon(Icons.add_rounded, color: _rose, size: 22),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              if (tracks.isEmpty)
                SliverToBoxAdapter(
                  child: _Empty(
                    icon: Icons.music_note_rounded,
                    title: 'Empty Playlist',
                    message: 'Search songs online or pick from your library to add to this playlist.',
                    action: PressableScale(
                      scale: 0.95,
                      onTap: () => _push(ctx, _AddSongsPage(p), modal: true),
                      child: Container(
                        margin: const EdgeInsets.only(top: 8),
                        height: 42,
                        padding: const EdgeInsets.symmetric(horizontal: 22),
                        decoration: BoxDecoration(
                          color: _rose,
                          borderRadius: BorderRadius.circular(21),
                          boxShadow: [
                            BoxShadow(
                              color: _rose.withValues(alpha: 0.35),
                              blurRadius: 14,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.search_rounded, color: Colors.white, size: 18),
                            const SizedBox(width: 8),
                            Text('Search & Add Songs', style: _t(14, w: FontWeight.w700, c: Colors.white)),
                          ],
                        ),
                      ),
                    ),
                  ),
                )
              else
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (c, i) {
                      final t = tracks[i];
                      return Dismissible(
                        key: ValueKey('pl-${p.id}-${t.id}'),
                        direction: DismissDirection.endToStart,
                        background: Container(
                          color: const Color(0xFFFF3B30),
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 24),
                          child: const Icon(Icons.remove_circle_outline_rounded, color: Colors.white),
                        ),
                        onDismissed: (_) {
                          HapticFeedback.mediumImpact();
                          s.removeFromPlaylist(p.id, t);
                        },
                        child: _SongRow(
                          track: t,
                          onTap: () => _play(c, tracks, i),
                          onLong: () => _trackActions(c, t),
                          trailing: _MoreBtn(() => _trackActions(c, t)),
                        ),
                      );
                    },
                    childCount: tracks.length,
                  ),
                ),
            ],
          );
        },
      );
}

class _AddPill extends StatelessWidget {
  const _AddPill({required this.added, required this.onTap});
  final bool added;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => _Bump(
        trigger: added,
        child: PressableScale(
          scale: 0.9,
          onTap: onTap,
          child: Container(
            height: 32,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: added ? _rose : _fill,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: added ? _rose : _hair),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  added ? Icons.check_rounded : Icons.add_rounded,
                  size: 16,
                  color: Colors.white,
                ),
                const SizedBox(width: 4),
                Text(
                  added ? 'Added' : 'Add',
                  style: _t(13, w: FontWeight.w600, c: Colors.white),
                ),
              ],
            ),
          ),
        ),
      );
}

/// Multi-add picker (modal) with live YouTube Music online search.
class _AddSongsPage extends StatefulWidget {
  const _AddSongsPage(this.initial);
  final UserPlaylist initial;

  @override
  State<_AddSongsPage> createState() => _AddSongsPageState();
}

class _AddSongsPageState extends State<_AddSongsPage> {
  final _q = TextEditingController();
  Timer? _debounce;
  bool _searching = false;
  List<Track> _onlineResults = [];

  @override
  void initState() {
    super.initState();
    LibraryStore.instance.ensureLoaded();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  void _onSearchChanged(String text) {
    final query = text.trim();
    if (query.isEmpty) {
      _debounce?.cancel();
      setState(() {
        _searching = false;
        _onlineResults = [];
      });
      return;
    }

    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 320), () => _searchOnline(query));
  }

  Future<void> _searchOnline(String query) async {
    if (query.isEmpty) return;
    setState(() {
      _searching = true;
    });

    try {
      final results = await InnerTubeService.instance.search(query);
      if (!mounted || _q.text.trim() != query) return;

      final store = LibraryStore.instance;
      for (final t in results) {
        store.registerTrack(t);
      }

      setState(() {
        _onlineResults = results;
        _searching = false;
      });
    } catch (_) {
      if (mounted && _q.text.trim() == query) {
        setState(() => _searching = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([LibraryStore.instance, CatalogDataSource.tracksNotifier]),
        builder: (ctx, _) {
          final s = LibraryStore.instance;
          final p = s.playlistById(widget.initial.id);
          if (p == null) return const ColoredBox(color: Colors.black);
          final inPlaylist = s.playlistTracks(p).map((t) => t.id).toSet();
          final q = _q.text.trim();
          final isQueryEmpty = q.isEmpty;

          Widget sectionHeader(String title, [Widget? trailing]) => SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
                  child: Row(
                    children: [
                      Expanded(child: Text(title, style: _t(17, w: FontWeight.w700, ls: -0.2))),
                      ?trailing,
                    ],
                  ),
                ),
              );

          Widget songRow(Track t) {
            final on = inPlaylist.contains(t.id);
            void toggle() {
              HapticFeedback.selectionClick();
              if (on) {
                s.removeFromPlaylist(p.id, t);
              } else {
                s.addToPlaylist(p.id, t);
              }
            }

            return _SongRow(
              track: t,
              onTap: toggle,
              onLong: toggle,
              trailing: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: _AddPill(added: on, onTap: toggle),
              ),
            );
          }

          final slivers = <Widget>[
            SliverToBoxAdapter(
              child: _Search(
                controller: _q,
                hint: 'Search songs online (song, artist)…',
                onChanged: _onSearchChanged,
              ),
            ),
          ];

          if (isQueryEmpty) {
            final liked = s.likedTracks;
            final suggested = CatalogDataSource.allTracks;

            if (liked.isNotEmpty) {
              slivers.add(sectionHeader('From Liked Songs'));
              slivers.add(
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (c, i) => songRow(liked[i]),
                    childCount: liked.length,
                  ),
                ),
              );
            }

            if (suggested.isNotEmpty) {
              slivers.add(sectionHeader('Suggested Songs'));
              slivers.add(
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (c, i) => songRow(suggested[i]),
                    childCount: math.min(30, suggested.length),
                  ),
                ),
              );
            }
          } else {
            final seenIds = <String>{};
            final combined = <Track>[];
            for (final t in _onlineResults) {
              if (seenIds.add(t.id)) combined.add(t);
            }
            final localMatches = _filterTracks(s.allLibraryTracks, q, _Sort.recent);
            for (final t in localMatches) {
              if (seenIds.add(t.id)) combined.add(t);
            }

            if (_searching && combined.isEmpty) {
              slivers.add(
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 48),
                    child: Center(child: CupertinoActivityIndicator(radius: 14, color: _rose)),
                  ),
                ),
              );
            } else if (!_searching && combined.isEmpty) {
              slivers.add(
                SliverToBoxAdapter(
                  child: _Empty(
                    icon: Icons.search_off_rounded,
                    title: 'No Songs Found',
                    message: 'No songs matched “$q”. Try another search.',
                  ),
                ),
              );
            } else {
              slivers.add(
                sectionHeader(
                  'Results (${combined.length})',
                  _searching ? const CupertinoActivityIndicator(radius: 8, color: _rose) : null,
                ),
              );
              slivers.add(
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (c, i) => songRow(combined[i]),
                    childCount: combined.length,
                  ),
                ),
              );
            }
          }

          return _page(
            title: 'Add Songs',
            trailing: _TextBtn('Done', onTap: () => Navigator.of(ctx).pop()),
            slivers: slivers,
          );
        },
      );
}

/* ═══════════════════════════════════════════════════════════════════
 *  ARTISTS (follow / unfollow)
 * ═══════════════════════════════════════════════════════════════════ */
class _ArtistsPage extends StatefulWidget {
  const _ArtistsPage();

  @override
  State<_ArtistsPage> createState() => _ArtistsPageState();
}

class _ArtistsPageState extends State<_ArtistsPage> {
  final _q = TextEditingController();

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([LibraryStore.instance, CatalogDataSource.tracksNotifier]),
        builder: (ctx, _) {
          final s = LibraryStore.instance;
          final q = _q.text.trim().toLowerCase();
          bool match(String n) => q.isEmpty || n.toLowerCase().contains(q);

          final followed = s.followedArtists.where((a) => match(a.name)).toList();
          final names = s.followedArtists.map((a) => a.name).toSet();
          final suggested = catalogArtists().where((a) => !names.contains(a.name) && match(a.name)).take(40).toList();

          Widget header(String t) => Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 6),
                child: Text(t, style: _t(20, w: FontWeight.w700, ls: -0.3)),
              );

          return _page(
            title: 'Artists',
            previous: 'Library',
            slivers: [
              SliverToBoxAdapter(
                child: _Search(controller: _q, hint: 'Find in Artists', onChanged: (_) => setState(() {})),
              ),
              SliverToBoxAdapter(child: header('Following')),
              if (followed.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
                    child: Text(
                      s.followedArtists.isEmpty
                          ? 'You aren’t following anyone yet. Follow artists below and they’ll show up here.'
                          : 'No followed artist matches “${_q.text.trim()}”.',
                      style: _t(14, c: _sub),
                    ),
                  ),
                )
              else
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (c, i) => _ArtistRow(name: followed[i].name, cover: followed[i].cover, sub: 'Following'),
                    childCount: followed.length,
                  ),
                ),
              if (suggested.isNotEmpty) ...[
                SliverToBoxAdapter(child: header('Suggested Artists')),
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (c, i) => _ArtistRow(
                      name: suggested[i].name,
                      cover: suggested[i].cover,
                      sub: _n(suggested[i].count, 'song', 'songs'),
                    ),
                    childCount: suggested.length,
                  ),
                ),
              ],
            ],
          );
        },
      );
}

class _ArtistRow extends StatelessWidget {
  const _ArtistRow({required this.name, required this.cover, required this.sub});
  final String name, cover, sub;

  @override
  Widget build(BuildContext context) => _ListRow(
        leading: _Avatar(cover, 56),
        title: name,
        subtitle: sub,
        thumb: 56,
        trailing: _FollowPill(name: name, cover: cover),
        onTap: () => _openArtist(context, name),
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
          return _Bump(
            trigger: on,
            child: PressableScale(
              scale: 0.92,
              onTap: () {
                HapticFeedback.mediumImpact();
                LibraryStore.instance.toggleFollow(name, cover);
              },
              child: Container(
                height: 32,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: on ? _fill : _rose.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(on ? Icons.check_rounded : Icons.add_rounded, size: 16, color: on ? Colors.white : _rose),
                    const SizedBox(width: 4),
                    Text(on ? 'Following' : 'Follow',
                        style: _t(13, w: FontWeight.w600, c: on ? Colors.white : _rose)),
                  ],
                ),
              ),
            ),
          );
        },
      );
}

/* ═══════════════════════════════════════════════════════════════════
 *  ALBUMS (save / remove)
 * ═══════════════════════════════════════════════════════════════════ */
class _AlbumsPage extends StatefulWidget {
  const _AlbumsPage();

  @override
  State<_AlbumsPage> createState() => _AlbumsPageState();
}

class _AlbumsPageState extends State<_AlbumsPage> {
  final _q = TextEditingController();

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([LibraryStore.instance, CatalogDataSource.tracksNotifier]),
        builder: (ctx, _) {
          final s = LibraryStore.instance;
          final q = _q.text.trim().toLowerCase();
          bool match(String a, String b) => q.isEmpty || a.toLowerCase().contains(q) || b.toLowerCase().contains(q);

          final saved = s.savedAlbums.where((a) => match(a.title, a.artist)).toList();
          final keys = s.savedAlbums.map((a) => '${a.title}|${a.artist}').toSet();
          final browse = catalogAlbums()
              .where((a) => !keys.contains('${a.title}|${a.artist}') && match(a.title, a.artist))
              .take(60)
              .toList();

          final w = (MediaQuery.sizeOf(ctx).width - 40 - 16) / 2;
          final delegate = SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2,
            mainAxisSpacing: 18,
            crossAxisSpacing: 16,
            mainAxisExtent: w + 56,
          );

          Widget header(String t) => Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
                child: Text(t, style: _t(20, w: FontWeight.w700, ls: -0.3)),
              );

          return _page(
            title: 'Albums',
            previous: 'Library',
            slivers: [
              SliverToBoxAdapter(
                child: _Search(controller: _q, hint: 'Find in Albums', onChanged: (_) => setState(() {})),
              ),
              SliverToBoxAdapter(child: header('Saved')),
              if (saved.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                    child: Text(
                      s.savedAlbums.isEmpty
                          ? 'No saved albums yet. Tap + on an album below to add it to your library.'
                          : 'No saved album matches “${_q.text.trim()}”.',
                      style: _t(14, c: _sub),
                    ),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  sliver: SliverGrid(
                    gridDelegate: delegate,
                    delegate: SliverChildBuilderDelegate(
                      (c, i) => _AlbumCard(title: saved[i].title, artist: saved[i].artist, cover: saved[i].cover, index: i),
                      childCount: saved.length,
                    ),
                  ),
                ),
              if (browse.isNotEmpty) ...[
                SliverToBoxAdapter(child: header('Browse')),
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  sliver: SliverGrid(
                    gridDelegate: delegate,
                    delegate: SliverChildBuilderDelegate(
                      (c, i) => _AlbumCard(title: browse[i].title, artist: browse[i].artist, cover: browse[i].cover, index: i),
                      childCount: browse.length,
                    ),
                  ),
                ),
              ],
            ],
          );
        },
      );
}

class _AlbumCard extends StatelessWidget {
  const _AlbumCard({required this.title, required this.artist, required this.cover, this.index = 0});
  final String title, artist, cover;
  final int index;

  @override
  Widget build(BuildContext context) => _SpringAppear(
        index: index,
        child: PressableScale(
          onTap: () => _openAlbum(context, title, artist, cover),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _Frame(child: _Cover(cover, radius: 0)),
                    Positioned(
                      right: 8,
                      bottom: 8,
                      child: ListenableBuilder(
                        listenable: LibraryStore.instance,
                        builder: (context, _) {
                          final on = LibraryStore.instance.isAlbumSaved(title, artist);
                          return _Bump(
                            trigger: on,
                            child: PressableScale(
                              scale: 0.85,
                              onTap: () {
                                HapticFeedback.mediumImpact();
                                LibraryStore.instance.toggleAlbum(title, artist, cover);
                              },
                              child: Container(
                                width: 32,
                                height: 32,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: on ? _rose : Colors.black.withValues(alpha: 0.55),
                                ),
                                child: Icon(on ? Icons.check_rounded : Icons.add_rounded,
                                    size: 20, color: Colors.white),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: _t(15, w: FontWeight.w500)),
              Text(artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: _t(14, c: _sub)),
            ],
          ),
        ),
      );
}

/* ═══════════════════════════════════════════════════════════════════
 *  SONGS + LIKED
 * ═══════════════════════════════════════════════════════════════════ */
List<Widget> _songSlivers(
  BuildContext c,
  List<Track> songs, {
  required _Sort sort,
  required VoidCallback onSort,
  required Widget empty,
}) {
  if (songs.isEmpty) return [SliverToBoxAdapter(child: empty)];
  return [
    SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 6),
        child: Column(
          children: [
            _PlayShuffle(onPlay: () => _play(c, songs, 0), onShuffle: () => _shuffle(c, songs)),
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerLeft,
              child: PressableScale(
                onTap: onSort,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(sort.label, style: _t(15, w: FontWeight.w600, c: _rose)),
                    const SizedBox(width: 2),
                    const Icon(Icons.unfold_more_rounded, size: 18, color: _rose),
                  ]),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
    SliverList(
      delegate: SliverChildBuilderDelegate(
        (ctx, i) {
          final t = songs[i];
          return _SongRow(
            track: t,
            onTap: () => _play(ctx, songs, i),
            onLong: () => _trackActions(ctx, t),
            trailing: _MoreBtn(() => _trackActions(ctx, t)),
          );
        },
        childCount: songs.length,
      ),
    ),
  ];
}

class _SongsPage extends StatefulWidget {
  const _SongsPage();

  @override
  State<_SongsPage> createState() => _SongsPageState();
}

class _SongsPageState extends State<_SongsPage> {
  final _q = TextEditingController();
  _Sort _sort = _Sort.recent;

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([CatalogDataSource.tracksNotifier, LibraryStore.instance]),
        builder: (ctx, _) {
          final store = LibraryStore.instance;
          final allSongs = store.allLibraryTracks.isNotEmpty ? store.allLibraryTracks : CatalogDataSource.allTracks;
          final searching = _q.text.trim().isNotEmpty;
          final songs = _filterTracks(allSongs, _q.text, _sort);
          return _page(
            title: 'Songs',
            previous: 'Library',
            slivers: [
              SliverToBoxAdapter(
                child: _Search(controller: _q, hint: 'Find in Songs', onChanged: (_) => setState(() {})),
              ),
              ..._songSlivers(
                ctx,
                songs,
                sort: _sort,
                onSort: () => _sortSheet(ctx, _sort, (s) => setState(() => _sort = s)),
                empty: _Empty(
                  icon: searching ? Icons.search_off_rounded : Icons.library_music_rounded,
                  title: searching ? 'No Results' : 'No Songs',
                  message: searching
                      ? 'Nothing matches “${_q.text.trim()}”.'
                      : 'Songs in your library will show up here. Like songs or add them to playlists to see them here.',
                ),
              ),
            ],
          );
        },
      );
}

class _LikedPage extends StatefulWidget {
  const _LikedPage();

  @override
  State<_LikedPage> createState() => _LikedPageState();
}

class _LikedPageState extends State<_LikedPage> {
  final _q = TextEditingController();
  _Sort _sort = _Sort.recent;

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([LibraryStore.instance, CatalogDataSource.tracksNotifier]),
        builder: (ctx, _) {
          final s = LibraryStore.instance;
          final empty = s.likedCount == 0;
          final songs = _filterTracks(s.likedTracks, _q.text, _sort);
          return _page(
            title: 'Liked Songs',
            previous: 'Library',
            slivers: [
              if (!empty)
                SliverToBoxAdapter(
                  child: _Search(controller: _q, hint: 'Find in Liked Songs', onChanged: (_) => setState(() {})),
                ),
              ..._songSlivers(
                ctx,
                songs,
                sort: _sort,
                onSort: () => _sortSheet(ctx, _sort, (v) => setState(() => _sort = v)),
                empty: _Empty(
                  icon: empty ? Icons.favorite_border_rounded : Icons.search_off_rounded,
                  title: empty ? 'No Liked Songs Yet' : 'No Results',
                  message: empty
                      ? 'Press and hold any song, then choose “Add to Liked Songs”.'
                      : 'Nothing in Liked Songs matches “${_q.text.trim()}”.',
                ),
              ),
            ],
          );
        },
      );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Rows & small widgets
 * ═══════════════════════════════════════════════════════════════════ */
class _ListRow extends StatelessWidget {
  const _ListRow({
    required this.leading,
    required this.title,
    this.subtitle,
    this.trailing,
    this.titleColor = Colors.white,
    this.thumb = 56,
    required this.onTap,
    this.onLong,
  });

  final Widget leading;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Color titleColor;
  final double thumb;
  final VoidCallback onTap;
  final VoidCallback? onLong;

  @override
  Widget build(BuildContext context) => PressableScale(
        scale: 0.985,
        onTap: onTap,
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onLongPress: onLong,
          child: Padding(
            padding: const EdgeInsets.only(left: 20, right: 14),
            child: Row(
              children: [
                SizedBox(width: thumb, height: thumb, child: leading),
                const SizedBox(width: 14),
                Expanded(
                  child: Container(
                    constraints: BoxConstraints(minHeight: thumb + 16),
                    alignment: Alignment.centerLeft,
                    decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _hair, width: 0.5))),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: _t(17, c: titleColor)),
                              if (subtitle != null)
                                Text(subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: _t(14, c: _sub)),
                            ],
                          ),
                        ),
                        ?trailing,
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

class _SongRow extends StatelessWidget {
  const _SongRow({required this.track, required this.onTap, required this.onLong, required this.trailing});
  final Track track;
  final VoidCallback onTap, onLong;
  final Widget trailing;

  @override
  Widget build(BuildContext context) => Selector<PlayerState, ({Object? id, bool playing})>(
        selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
        builder: (context, s, child) {
          final active = s.id == track.id;
          return PressableScale(
            scale: 0.985,
            onTap: onTap,
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onLongPress: onLong,
              child: Padding(
                padding: const EdgeInsets.only(left: 20, right: 8),
                child: Row(
                  children: [
                    SizedBox(
                      width: 48,
                      height: 48,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          _Frame(radius: 6, child: _Cover(track.coverUrl, radius: 0)),
                          if (active)
                            ClipRRect(
                              borderRadius: BorderRadius.circular(6),
                              child: Container(
                                color: Colors.black.withValues(alpha: 0.45),
                                child: _EqBars(playing: s.playing),
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Container(
                        height: 62,
                        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _hair, width: 0.5))),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(MediaNormalizer.cleanCompactTitle(track.title),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: _t(16, c: active ? _rose : Colors.white)),
                                  Text(track.artist,
                                      maxLines: 1, overflow: TextOverflow.ellipsis, style: _t(14, c: _sub)),
                                ],
                              ),
                            ),
                            trailing,
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      );
}

class _MoreBtn extends StatelessWidget {
  const _MoreBtn(this.onTap);
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
        scale: 0.85,
        onTap: onTap,
        child: const SizedBox(width: 44, height: 44, child: Icon(Icons.more_horiz_rounded, color: _sub, size: 22)),
      );
}

class _CircleBtn extends StatelessWidget {
  const _CircleBtn(this.icon, this.onTap);
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
        scale: 0.88,
        onTap: onTap,
        child: Container(
          width: 32,
          height: 32,
          decoration: const BoxDecoration(shape: BoxShape.circle, color: _fill),
          child: Icon(icon, size: 20, color: _rose),
        ),
      );
}

class _TextBtn extends StatelessWidget {
  const _TextBtn(this.label, {required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
        scale: 0.92,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          child: Text(label, style: _t(17, w: FontWeight.w600, c: _rose)),
        ),
      );
}

class _PlayShuffle extends StatelessWidget {
  const _PlayShuffle({required this.onPlay, required this.onShuffle});
  final VoidCallback onPlay, onShuffle;

  Widget _pill(IconData icon, String label, VoidCallback onTap) => Expanded(
        child: PressableScale(
          scale: 0.96,
          onTap: onTap,
          child: Container(
            height: 48,
            decoration: BoxDecoration(color: _fill, borderRadius: BorderRadius.circular(12)),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: _rose, size: 24),
                const SizedBox(width: 6),
                Text(label, style: _t(17, w: FontWeight.w600, c: _rose)),
              ],
            ),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) => Row(children: [
        _pill(Icons.play_arrow_rounded, 'Play', onPlay),
        const SizedBox(width: 12),
        _pill(Icons.shuffle_rounded, 'Shuffle', onShuffle),
      ]);
}

class _Search extends StatelessWidget {
  const _Search({required this.controller, required this.hint, required this.onChanged});
  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
        child: CupertinoSearchTextField(
          controller: controller,
          placeholder: hint,
          onChanged: onChanged,
          style: _t(17),
          placeholderStyle: _t(17, c: _sub),
          backgroundColor: _fill,
          itemColor: _sub,
        ),
      );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.title, required this.message, this.action});
  final IconData icon;
  final String title, message;
  final Widget? action;

  @override
  Widget build(BuildContext context) => _SpringAppear(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(40, 48, 40, 24),
          child: Column(
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0x0FFFFFFF)),
                child: Icon(icon, size: 32, color: _rose),
              ),
              const SizedBox(height: 16),
              Text(title, textAlign: TextAlign.center, style: _t(20, w: FontWeight.w700)),
              const SizedBox(height: 6),
              Text(message, textAlign: TextAlign.center, style: _t(15, c: _sub)),
              if (action != null) ...[
                const SizedBox(height: 18),
                action!,
              ],
            ],
          ),
        ),
      );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Images
 * ═══════════════════════════════════════════════════════════════════ */
class _Frame extends StatelessWidget {
  const _Frame({required this.child, this.radius = 10});
  final Widget child;
  final double radius;

  @override
  Widget build(BuildContext context) => Container(
        foregroundDecoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          border: Border.all(color: _hair, width: 0.5),
        ),
        child: ClipRRect(borderRadius: BorderRadius.circular(radius), child: child),
      );
}

class _LikedCover extends StatelessWidget {
  const _LikedCover();

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (_, c) => Container(
          color: _tile,
          alignment: Alignment.center,
          child: Icon(Icons.favorite_rounded, color: _rose, size: c.maxWidth * 0.46),
        ),
      );
}

class _Cover extends StatelessWidget {
  const _Cover(this.url, {this.radius = 10});
  final String url;
  final double radius;

  Widget get _ph => Container(
      color: Colors.white.withValues(alpha: 0.06), child: const Icon(Icons.music_note_rounded, color: Colors.white24));

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: url.isEmpty
            ? _ph
            : CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.cover,
                width: double.infinity,
                height: double.infinity,
                fadeInDuration: const Duration(milliseconds: 180),
                errorWidget: (context, u, e) => _ph,
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

  Widget _img(String u) => SizedBox.expand(
        child: CachedNetworkImage(
          imageUrl: u,
          fit: BoxFit.cover,
          errorWidget: (context, url, e) => Container(color: Colors.white.withValues(alpha: 0.06)),
        ),
      );

  @override
  Widget build(BuildContext context) {
    Widget child;
    if (urls.isEmpty) {
      child = const Center(child: Icon(Icons.queue_music_rounded, size: 34, color: _rose));
    } else if (urls.length < 4) {
      child = _img(urls.first);
    } else {
      child = Column(children: [
        Expanded(child: Row(children: [Expanded(child: _img(urls[0])), Expanded(child: _img(urls[1]))])),
        Expanded(child: Row(children: [Expanded(child: _img(urls[2])), Expanded(child: _img(urls[3]))])),
      ]);
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Container(color: Colors.white.withValues(alpha: 0.06), child: child),
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════
 *  Now-playing equalizer
 * ═══════════════════════════════════════════════════════════════════ */
class _EqBars extends StatefulWidget {
  const _EqBars({required this.playing});
  final bool playing;

  @override
  State<_EqBars> createState() => _EqBarsState();
}

class _EqBarsState extends State<_EqBars> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

  @override
  void initState() {
    super.initState();
    if (widget.playing) _c.repeat();
  }

  @override
  void didUpdateWidget(covariant _EqBars old) {
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
  Widget build(BuildContext context) => CustomPaint(painter: _EqPainter(_c, widget.playing));
}

class _EqPainter extends CustomPainter {
  _EqPainter(this.anim, this.playing) : super(repaint: anim);
  final Animation<double> anim;
  final bool playing;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = Colors.white;
    const barW = 3.0, gap = 3.0;
    const total = 4 * barW + 3 * gap;
    final left = (size.width - total) / 2;
    for (var i = 0; i < 4; i++) {
      final h = playing ? lerpDouble(5, 18, 0.5 + 0.5 * math.sin((anim.value + i * 0.25) * math.pi * 2))! : 5.0;
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