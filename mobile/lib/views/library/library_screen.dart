import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart'
    show
        CupertinoActivityIndicator,
        CupertinoIcons,
        CupertinoPageRoute,
        CupertinoSearchTextField,
        CupertinoSliverRefreshControl,
        CupertinoTextField;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_typography.dart';
import '../../design_system/widgets/apple_glass.dart';
import '../../design_system/widgets/equalizer_bars.dart';
import '../../design_system/widgets/media_navigation_sheet.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../features/story_sharing/story_sharing.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/album_resolver.dart';
import '../../services/dock_visibility.dart';
import '../../services/download_service.dart';
import '../../services/innertube_service.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../services/youtube_link_importer.dart';
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

TextStyle _t(
  double size, {
  FontWeight w = FontWeight.w400,
  Color c = Colors.white,
  double? ls,
}) => AppTypography.headline.copyWith(
  fontSize: size,
  fontWeight: w,
  color: c,
  letterSpacing: ls,
);

String _n(int n, String one, String many) => '$n ${n == 1 ? one : many}';

SliverGridDelegateWithFixedCrossAxisCount _gridDelegate(BuildContext context) {
  return const SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: 2,
    crossAxisSpacing: 16,
    mainAxisSpacing: 16,
    childAspectRatio: 0.70,
  );
}

bool _looksLikeLink(String text) {
  final q = text.toLowerCase().trim();
  return q.startsWith('http://') ||
      q.startsWith('https://') ||
      q.contains('youtube.com') ||
      q.contains('youtu.be') ||
      q.contains('spotify.com') ||
      q.contains('apple.com') ||
      q.contains('jiosaavn.com');
}

enum _Sort {
  recent('Recently Added'),
  title('Title'),
  artist('Artist');

  const _Sort(this.label);
  final String label;
}

enum _Cat {
  liked('Favourite Songs', CupertinoIcons.star_fill),
  albums('Albums', Icons.album_rounded),
  artists('Artists', Icons.mic_external_on_rounded),
  playlists('Playlists', Icons.queue_music_rounded),
  downloaded('Downloaded', CupertinoIcons.arrow_down_circle_fill);

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
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: 1,
  );

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

class _SpringAppearState extends State<_SpringAppear>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );
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
  c.read<PlayerState>().setQueue(
    l,
    startIndex: startIdx,
    collectionLocked: true,
    context: ctx,
  );
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
  c.read<PlayerState>().setQueue(
    l,
    startIndex: 0,
    shuffle: true,
    collectionLocked: true,
    context: ctx,
  );
}

Future<T?> _push<T>(BuildContext c, Widget page, {bool modal = false}) {
  HapticFeedback.selectionClick();
  return Navigator.of(
    c,
  ).push(ZenPageRoute<T>(builder: (_) => page, fullscreenDialog: modal));
}

void _openArtist(BuildContext c, String name) =>
    _push(c, ArtistScreen(artistName: MediaNormalizer.stripIdNoise(name)));

void _openAlbum(BuildContext c, String title, String artist, String cover) {
  final isSing = AlbumResolver.isSingleReleaseTitle(title);
  _push(
    c,
    AlbumScreen(
      albumTitle: MediaNormalizer.stripIdNoise(title),
      artistName: MediaNormalizer.stripIdNoise(artist),
      coverUrl: cover,
      isSingle: isSing,
    ),
  );
}

Future<String?> _promptName(
  BuildContext c, {
  required String title,
  String initial = '',
  required String confirm,
}) => ZenDropdown.showInputSheet(
  context: c,
  title: title,
  initialValue: initial,
  hintText: 'Playlist Name',
  confirmLabel: confirm,
);

Future<bool> _confirm(
  BuildContext c, {
  required String title,
  required String message,
  required String action,
}) => ZenDropdown.showConfirmSheet(
  context: c,
  title: title,
  message: message,
  confirmLabel: action,
);

Future<UserPlaylist?> _createPlaylist(BuildContext c, {Track? first}) async {
  final n = await _promptName(c, title: 'New Playlist', confirm: 'Create');
  if (n == null || n.isEmpty || !c.mounted) return null;
  final store = LibraryStore.instance;
  final p = store.createPlaylist(n, first: first);
  HapticFeedback.mediumImpact();
  _push(c, _PlaylistPage(p));
  return p;
}

Future<void> _importPlaylist(
  BuildContext c, {
  UserPlaylist? targetPlaylist,
}) async {
  HapticFeedback.lightImpact();
  final imported = await DockVisibility.runModal<UserPlaylist?>(
    () => showModalBottomSheet<UserPlaylist>(
      context: c,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.55),
      isScrollControlled: true,
      enableDrag: true,
      builder: (ctx) =>
          _ImportLinkBottomSheetContent(targetPlaylist: targetPlaylist),
    ),
  );
  if (imported != null && c.mounted) {
    _push(c, _PlaylistPage(imported));
  }
}

class _ImportLinkBottomSheetContent extends StatefulWidget {
  const _ImportLinkBottomSheetContent({this.targetPlaylist});
  final UserPlaylist? targetPlaylist;

  @override
  State<_ImportLinkBottomSheetContent> createState() =>
      _ImportLinkBottomSheetContentState();
}

class _ImportLinkBottomSheetContentState
    extends State<_ImportLinkBottomSheetContent> {
  final TextEditingController _ctrl = TextEditingController();
  bool _loading = false;
  String? _statusText;
  String? _error;
  String? _clipboardCandidate;
  String _targetMode = 'new';
  String? _selectedExistingId;

  @override
  void initState() {
    super.initState();
    if (widget.targetPlaylist != null) {
      _targetMode = 'existing';
      _selectedExistingId = widget.targetPlaylist!.id;
    } else {
      final playlists = LibraryStore.instance.playlists;
      if (playlists.isNotEmpty) {
        _selectedExistingId = playlists.first.id;
      }
    }
    _checkClipboard();
  }

  Future<void> _checkClipboard() async {
    try {
      final data = await Clipboard.getData(Clipboard.kTextPlain);
      final text = data?.text?.trim() ?? '';
      if (text.contains('youtube.com') ||
          text.contains('youtu.be') ||
          text.contains('spotify.com') ||
          text.contains('jiosaavn.com') ||
          text.contains('apple.com') ||
          text.startsWith('PL') ||
          text.startsWith('OLAK') ||
          text.startsWith('MPREb_')) {
        if (mounted) {
          setState(() => _clipboardCandidate = text);
        }
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty) {
      setState(
        () => _error =
            'Please paste a valid YouTube, Spotify, Apple Music, or JioSaavn link.',
      );
      return;
    }

    setState(() {
      _loading = true;
      _statusText = 'Fetching playlist & tracks…';
      _error = null;
    });

    try {
      final result = await YouTubeLinkImporter.instance.resolve(text);
      if (!mounted) return;

      if (result == null || result.tracks.isEmpty) {
        setState(() {
          _loading = false;
          _statusText = null;
          _error =
              'Could not fetch tracks. Ensure the link is public or unlisted.';
        });
        return;
      }

      final store = LibraryStore.instance;
      UserPlaylist? targetP;
      if (_targetMode == 'existing' && _selectedExistingId != null) {
        store.addTracksToPlaylist(_selectedExistingId!, result.tracks);
        targetP = store.playlistById(_selectedExistingId!);
      } else {
        targetP = store.importPlaylist(result.title, result.tracks);
      }

      HapticFeedback.mediumImpact();
      IslandNotifier.instance.show(
        IslandNotification(
          id: 'imported_${DateTime.now().millisecondsSinceEpoch}',
          title: 'Imported ${result.tracks.length} Songs',
          body: result.title,
          leading: const Icon(
            CupertinoIcons.checkmark_alt_circle_fill,
            color: Color(0xFFE11D48),
            size: 18,
          ),
        ),
      );

      Navigator.of(context, rootNavigator: true).pop(targetP);
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _statusText = null;
          _error = 'Error resolving link: $e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = LibraryStore.instance;
    final playlists = store.playlists;
    final mq = MediaQuery.of(context);
    final isTargetLocked = widget.targetPlaylist != null;

    return Padding(
      padding: EdgeInsets.only(bottom: mq.viewInsets.bottom),
      child: AppleGlass(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        blur: 32,
        tint: const Color(0xF0121214),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              10,
              20,
              math.max(18, mq.padding.bottom + 10),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4.5,
                    margin: const EdgeInsets.only(bottom: 14),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.22),
                      borderRadius: BorderRadius.circular(2.5),
                    ),
                  ),
                ),
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: _rose.withValues(alpha: 0.16),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        CupertinoIcons.link,
                        color: _rose,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            isTargetLocked
                                ? 'Add Link to ${widget.targetPlaylist!.name}'
                                : 'Import Playlist from Link',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontFamily: 'SF Pro Display',
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                              letterSpacing: -0.3,
                            ),
                          ),
                          const SizedBox(height: 2),
                          const Text(
                            'YouTube Music, Spotify, Apple Music, or JioSaavn',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontFamily: 'SF Pro',
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: Color(0xFFA1A1A6),
                            ),
                          ),
                        ],
                      ),
                    ),
                    PressableScale(
                      onTap: () =>
                          Navigator.of(context, rootNavigator: true).pop(),
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: const ShapeDecoration(
                          shape: CircleBorder(),
                          color: Color(0x1FFFFFFF),
                        ),
                        child: const Icon(
                          Icons.close_rounded,
                          size: 18,
                          color: Colors.white70,
                        ),
                      ),
                    ),
                  ],
                ),
                if (_clipboardCandidate != null && _ctrl.text.isEmpty) ...[
                  const SizedBox(height: 12),
                  PressableScale(
                    scale: 0.98,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() {
                        _ctrl.text = _clipboardCandidate!;
                      });
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: _rose.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: _rose.withValues(alpha: 0.25),
                        ),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            CupertinoIcons.doc_on_clipboard,
                            color: _rose,
                            size: 15,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Paste from clipboard: ${_clipboardCandidate!}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontFamily: 'SF Pro',
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                                color: _rose,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                CupertinoTextField(
                  controller: _ctrl,
                  autofocus: true,
                  placeholder: 'https://music.youtube.com/playlist?list=…',
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 14,
                  ),
                  style: const TextStyle(
                    fontFamily: 'SF Pro',
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                  placeholderStyle: TextStyle(
                    fontFamily: 'SF Pro',
                    color: Colors.white.withValues(alpha: 0.35),
                    fontSize: 14,
                  ),
                  cursorColor: _rose,
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E1E22),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.10),
                    ),
                  ),
                  suffix: ValueListenableBuilder<TextEditingValue>(
                    valueListenable: _ctrl,
                    builder: (_, val, _) {
                      if (val.text.isEmpty) {
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: PressableScale(
                            onTap: () async {
                              final d = await Clipboard.getData(
                                Clipboard.kTextPlain,
                              );
                              if (d?.text != null &&
                                  d!.text!.trim().isNotEmpty) {
                                setState(() => _ctrl.text = d.text!.trim());
                              }
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 6,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.10),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Text(
                                'Paste',
                                style: TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        );
                      }
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: IconButton(
                          icon: const Icon(
                            Icons.clear_rounded,
                            size: 18,
                            color: Colors.white54,
                          ),
                          onPressed: () => setState(() => _ctrl.clear()),
                        ),
                      );
                    },
                  ),
                ),
                if (!isTargetLocked && playlists.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: PressableScale(
                          onTap: () => setState(() => _targetMode = 'new'),
                          child: Container(
                            height: 38,
                            decoration: BoxDecoration(
                              color: _targetMode == 'new'
                                  ? _rose.withValues(alpha: 0.22)
                                  : const Color(0xFF1E1E22),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: _targetMode == 'new'
                                    ? _rose.withValues(alpha: 0.6)
                                    : Colors.white.withValues(alpha: 0.08),
                              ),
                            ),
                            alignment: Alignment.center,
                            child: Text(
                              'New Playlist',
                              style: TextStyle(
                                fontFamily: 'SF Pro',
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: _targetMode == 'new'
                                    ? _rose
                                    : Colors.white70,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: PressableScale(
                          onTap: () => setState(() => _targetMode = 'existing'),
                          child: Container(
                            height: 38,
                            decoration: BoxDecoration(
                              color: _targetMode == 'existing'
                                  ? _rose.withValues(alpha: 0.22)
                                  : const Color(0xFF1E1E22),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(
                                color: _targetMode == 'existing'
                                    ? _rose.withValues(alpha: 0.6)
                                    : Colors.white.withValues(alpha: 0.08),
                              ),
                            ),
                            alignment: Alignment.center,
                            child: Text(
                              'Existing Playlist',
                              style: TextStyle(
                                fontFamily: 'SF Pro',
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: _targetMode == 'existing'
                                    ? _rose
                                    : Colors.white70,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                  if (_targetMode == 'existing') ...[
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E1E22),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.10),
                        ),
                      ),
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<String>(
                          value: _selectedExistingId,
                          isExpanded: true,
                          dropdownColor: const Color(0xFF1E1E22),
                          style: const TextStyle(
                            fontFamily: 'SF Pro',
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                          items: playlists
                              .map(
                                (p) => DropdownMenuItem<String>(
                                  value: p.id,
                                  child: Text(
                                    '${p.name} (${store.playlistTracks(p).length} songs)',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              )
                              .toList(),
                          onChanged: (id) {
                            if (id != null) {
                              setState(() => _selectedExistingId = id);
                            }
                          },
                        ),
                      ),
                    ),
                  ],
                ],
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: const TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: Color(0xFFFF453A),
                    ),
                  ),
                ],
                if (_statusText != null) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      const CupertinoActivityIndicator(radius: 7, color: _rose),
                      const SizedBox(width: 8),
                      Text(
                        _statusText!,
                        style: const TextStyle(
                          fontFamily: 'SF Pro',
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: _rose,
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: PressableScale(
                        onTap: () =>
                            Navigator.of(context, rootNavigator: true).pop(),
                        child: Container(
                          height: 48,
                          decoration: BoxDecoration(
                            color: const Color(0xFF1E1E22),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: Colors.white.withValues(alpha: 0.08),
                            ),
                          ),
                          alignment: Alignment.center,
                          child: const Text(
                            'Cancel',
                            style: TextStyle(
                              fontFamily: 'SF Pro',
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ValueListenableBuilder<TextEditingValue>(
                        valueListenable: _ctrl,
                        builder: (_, val, _) {
                          final canSubmit =
                              val.text.trim().isNotEmpty && !_loading;
                          return PressableScale(
                            scale: 0.96,
                            onTap: canSubmit ? _submit : null,
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 160),
                              height: 48,
                              decoration: BoxDecoration(
                                color: const Color(0xFF18181B),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: canSubmit
                                      ? _rose.withValues(alpha: 0.5)
                                      : Colors.white.withValues(alpha: 0.08),
                                ),
                              ),
                              alignment: Alignment.center,
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  if (_loading) ...[
                                    const CupertinoActivityIndicator(
                                      color: _rose,
                                      radius: 8,
                                    ),
                                    const SizedBox(width: 8),
                                  ],
                                  Text(
                                    _loading ? 'IMPORTING…' : 'FETCH & IMPORT',
                                    style: TextStyle(
                                      fontFamily: 'SF Pro',
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      letterSpacing: 1.2,
                                      color: canSubmit ? _rose : Colors.white38,
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
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Long-press / ellipsis menu for any song.
Future<void> _trackActions(BuildContext c, Track t) =>
    ZenDropdown.showTrackMenu(context: c, track: t);

Future<void> _playlistMenu(
  BuildContext c,
  UserPlaylist p, {
  bool inDetail = false,
}) async {
  HapticFeedback.mediumImpact();
  final store = LibraryStore.instance;
  final tracks = store.playlistTracks(p);
  final firstCover = tracks.isNotEmpty ? tracks.first.coverUrl : null;
  await ZenDropdown.show<void>(
    context: c,
    title: p.name,
    subtitle: _n(tracks.length, 'Song', 'Songs'),
    coverUrl: firstCover,
    shareText: '${p.name} playlist on Zenify',
    shareUrl: 'https://zenify.app/playlist/${Uri.encodeComponent(p.name)}',
    items: [
      if (tracks.isNotEmpty)
        ZenDropdownItem(
          title: 'Play',
          icon: CupertinoIcons.play_fill,
          onTap: () => _play(c, tracks, 0),
        ),
      if (tracks.isNotEmpty)
        ZenDropdownItem(
          title: 'Shuffle',
          icon: CupertinoIcons.shuffle,
          onTap: () => _shuffle(c, tracks),
        ),
      if (tracks.isNotEmpty) ...[
        () {
          final dl = DownloadService.instance;
          final allDl = tracks.every((t) => dl.isDownloaded(t.id));
          final someDownloading = tracks.any((t) => dl.isDownloading(t.id));
          if (allDl) {
            return ZenDropdownItem(
              title: 'Remove Playlist from Downloads',
              subtitle: '${tracks.length} songs stored offline',
              icon: CupertinoIcons.arrow_down_circle_fill,
              isDestructive: true,
              onTap: () async {
                for (final t in tracks) {
                  await dl.deleteDownload(t.id);
                }
                HapticFeedback.lightImpact();
                IslandNotifier.instance.show(
                  IslandNotification(
                    id: 'del_playlist_dl_${DateTime.now().millisecondsSinceEpoch}',
                    title: 'Downloads Removed',
                    body: '${p.name} removed from offline storage',
                    leading: const Icon(
                      CupertinoIcons.trash,
                      color: Colors.white70,
                      size: 18,
                    ),
                  ),
                );
              },
            );
          } else if (someDownloading) {
            return ZenDropdownItem(
              title: 'Downloading Playlist…',
              subtitle: 'Saving tracks for offline playback',
              icon: CupertinoIcons.arrow_down_circle,
              iconColor: const Color(0xFFE11D48),
              onTap: () {},
            );
          } else {
            return ZenDropdownItem(
              title: 'Download Playlist',
              subtitle:
                  '${tracks.length} songs · Under ~${(tracks.length * 3.8).toStringAsFixed(0)} MB',
              icon: CupertinoIcons.arrow_down_circle,
              iconColor: const Color(0xFFE11D48),
              onTap: () {
                HapticFeedback.mediumImpact();
                IslandNotifier.instance.show(
                  IslandNotification(
                    id: 'dl_playlist_${DateTime.now().millisecondsSinceEpoch}',
                    title: 'Downloading Playlist',
                    body:
                        'Downloading ${tracks.length} songs for offline listening',
                    leading: const Icon(
                      CupertinoIcons.arrow_down_circle,
                      color: Color(0xFFE11D48),
                      size: 18,
                    ),
                  ),
                );
                dl.downloadBulk(tracks).then((count) {
                  IslandNotifier.instance.show(
                    IslandNotification(
                      id: 'dl_playlist_done_${DateTime.now().millisecondsSinceEpoch}',
                      title: 'Playlist Downloaded',
                      body: '$count songs from ${p.name} saved offline',
                      leading: const Icon(
                        CupertinoIcons.checkmark_circle_fill,
                        color: Color(0xFFE11D48),
                        size: 18,
                      ),
                    ),
                  );
                });
              },
            );
          }
        }(),
      ],
      if (inDetail) ...[
        ZenDropdownItem(
          title: 'Add Songs…',
          icon: CupertinoIcons.plus_circle,
          onTap: () => _push(c, _AddSongsPage(p), modal: true),
        ),
        ZenDropdownItem(
          title: 'Add from Link…',
          icon: CupertinoIcons.link,
          onTap: () => _importPlaylist(c, targetPlaylist: p),
        ),
      ],
      ZenDropdownItem(
        title: 'Add to Story',
        icon: CupertinoIcons.sparkles,
        onTap: () {
          final distinctCovers = tracks
              .map((t) => t.coverUrl)
              .where((u) => u.isNotEmpty)
              .toSet()
              .toList();
          Navigator.of(c, rootNavigator: true).push(
            CupertinoPageRoute(
              builder: (_) => StoryPreviewScreen(
                content: PlaylistStoryContent(
                  playlistTitle: p.name,
                  covers: distinctCovers,
                  owner: 'Your Playlist',
                  tracks: tracks,
                ),
              ),
            ),
          );
        },
      ),
      ZenDropdownItem(
        title: 'Rename',
        icon: CupertinoIcons.pencil,
        onTap: () async {
          if (!c.mounted) return;
          final n = await _promptName(
            c,
            title: 'Rename Playlist',
            initial: p.name,
            confirm: 'Save',
          );
          if (n != null && n.isNotEmpty) store.renamePlaylist(p.id, n);
        },
      ),
      ZenDropdownItem(
        title: 'Delete Playlist',
        icon: CupertinoIcons.trash,
        isDestructive: true,
        onTap: () async {
          if (!c.mounted) return;
          final ok = await _confirm(
            c,
            title: 'Delete “${p.name}”?',
            message: 'This playlist will be removed from your library.',
            action: 'Delete',
          );
          if (!ok || !c.mounted) return;
          HapticFeedback.mediumImpact();
          if (inDetail) Navigator.of(c).pop();
          store.deletePlaylist(p.id);
        },
      ),
    ],
  );
}

Future<void> _sortSheet(
  BuildContext c,
  _Sort cur,
  ValueChanged<_Sort> onPick,
) async {
  ZenDropdown.showSortMenu<_Sort>(
    context: c,
    title: 'Sort By',
    selected: cur,
    options: const [
      (
        value: _Sort.recent,
        label: 'Recently Added',
        icon: CupertinoIcons.clock,
      ),
      (value: _Sort.title, label: 'Title', icon: CupertinoIcons.textformat_abc),
      (value: _Sort.artist, label: 'Artist', icon: CupertinoIcons.person),
    ],
    onSelected: (s) {
      if (s != cur) {
        HapticFeedback.selectionClick();
        onPick(s);
      }
    },
  );
}

List<Track> _filterTracks(List<Track> src, String query, _Sort sort) {
  final q = query.trim().toLowerCase();
  final list = q.isEmpty
      ? List<Track>.of(src)
      : src
            .where(
              (t) =>
                  t.title.toLowerCase().contains(q) ||
                  t.artist.toLowerCase().contains(q),
            )
            .toList();
  switch (sort) {
    case _Sort.recent:
      break;
    case _Sort.title:
      list.sort(
        (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
      );
    case _Sort.artist:
      list.sort(
        (a, b) => a.artist.toLowerCase().compareTo(b.artist.toLowerCase()),
      );
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
  VoidCallback? onOpenProfile,
  required List<Widget> slivers,
}) => _LibraryPageShell(
  title: title,
  previous: previous,
  trailing: trailing,
  root: root,
  onOpenProfile: onOpenProfile,
  slivers: slivers,
);

class _LibraryPageShell extends StatefulWidget {
  const _LibraryPageShell({
    required this.title,
    this.previous,
    this.trailing,
    this.root = false,
    this.onOpenProfile,
    required this.slivers,
  });

  final String title;
  final String? previous;
  final Widget? trailing;
  final bool root;
  final VoidCallback? onOpenProfile;
  final List<Widget> slivers;

  @override
  State<_LibraryPageShell> createState() => _LibraryPageShellState();
}

class _LibraryPageShellState extends State<_LibraryPageShell> {
  late final ScrollController _sc = ScrollController();

  @override
  void dispose() {
    _sc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
    value: SystemUiOverlayStyle.light,
    child: Scaffold(
      backgroundColor: Colors.black,
      body: Builder(
        builder: (context) {
          final top = MediaQuery.paddingOf(context).top;
          return Stack(
            children: [
              CustomScrollView(
                controller: _sc,
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                physics: const BouncingScrollPhysics(
                  parent: AlwaysScrollableScrollPhysics(),
                ),
                slivers: [
                  SliverToBoxAdapter(child: SizedBox(height: top + 56)),
                  ...widget.slivers,
                  SliverToBoxAdapter(
                    child: SizedBox(
                      height: 180 + MediaQuery.paddingOf(context).bottom,
                    ),
                  ),
                ],
              ),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: DynamicIslandHeader(
                  title: widget.title,
                  showBack: !widget.root,
                  isDockPage: widget.root,
                  scrollController: _sc,
                  revealOffset: 50.0,
                  onBack: () => Navigator.maybePop(context),
                  showProfile: widget.root,
                  onProfileTap: widget.onOpenProfile,
                  trailing: widget.trailing,
                ),
              ),
            ],
          );
        },
      ),
    ),
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  LIBRARY (root)
 * ═══════════════════════════════════════════════════════════════════ */
class _Item {
  const _Item({
    required this.title,
    required this.sub,
    required this.cover,
    required this.onTap,
    this.onLong,
  });
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
  @override
  void initState() {
    super.initState();
    LibraryStore.instance.ensureLoaded();
  }

  void _open(_Cat c) {
    switch (c) {
      case _Cat.liked:
        _push(context, const _LikedPage());
      case _Cat.albums:
        _push(context, const _AlbumsPage());
      case _Cat.artists:
        _push(context, const _ArtistsPage());
      case _Cat.playlists:
        _push(context, const _PlaylistsPage());
      case _Cat.downloaded:
        _push(context, const _DownloadedPage());
    }
  }

  List<_Item> _recent(LibraryStore s) {
    final items = <_Item>[
      _Item(
        title: 'Favourite Songs',
        sub: _n(s.likedCount, 'song', 'songs'),
        cover: const _LikedCover(),
        onTap: () => _push(context, const _LikedPage()),
      ),
      for (final p in s.playlists)
        _Item(
          title: p.name,
          sub: _n(p.trackIds.length, 'song', 'songs'),
          cover: _Collage(
            s.playlistTracks(p).take(4).map((t) => t.coverUrl).toList(),
            radius: 0,
          ),
          onTap: () => _push(context, _PlaylistPage(p)),
          onLong: () => _playlistMenu(context, p),
        ),
      for (final a in s.savedAlbums)
        if (!Track.detectIsVideo(a.title, a.title) &&
            a.title.toLowerCase() != 'music video' &&
            a.title.toLowerCase() != 'video' &&
            !CatalogDataSource.allTracks.any(
              (t) =>
                  (t.title.toLowerCase() == a.title.toLowerCase() ||
                      t.album.toLowerCase() == a.title.toLowerCase()) &&
                  (t.isVideo || Track.detectIsVideo(t.title, t.album)),
            ))
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
    return items;
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([
        LibraryStore.instance,
        CatalogDataSource.tracksNotifier,
      ]),
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
          onOpenProfile: widget.onOpenProfile,
          slivers: [
            CupertinoSliverRefreshControl(
              onRefresh: () async {
                HapticFeedback.lightImpact();
                await (widget.onRefresh?.call() ??
                    CatalogDataSource.initialize());
              },
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Column(
                  children: [
                    for (final c in _Cat.values)
                      _CategoryRow(cat: c, onTap: () => _open(c)),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 30, 20, 14),
                child: Text(
                  'Recently Added',
                  style: _t(22, w: FontWeight.w700, ls: -0.3),
                ),
              ),
            ),
            if (items.isNotEmpty)
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                sliver: SliverGrid(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: 18,
                    crossAxisSpacing: 16,
                    mainAxisExtent: w + 64,
                  ),
                  delegate: SliverChildBuilderDelegate(
                    (_, i) => _Tile(item: items[i], index: i),
                    childCount: items.length,
                  ),
                ),
              )
            else
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 48),
                  child: Text(
                    'Playlists, albums, and artists you add to your library will appear here.',
                    style: _t(14, c: _sub),
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
  const _CategoryRow({required this.cat, required this.onTap});
  final _Cat cat;
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
          SizedBox(width: 30, child: Icon(cat.icon, color: _rose, size: 22)),
          const SizedBox(width: 12),
          Expanded(
            child: Container(
              height: 44,
              alignment: Alignment.centerLeft,
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: _hair, width: 0.5)),
              ),
              child: Row(
                children: [
                  Expanded(child: Text(cat.label, style: _t(17))),
                  const Padding(
                    padding: EdgeInsets.only(right: 16),
                    child: Icon(
                      Icons.chevron_right_rounded,
                      color: Color(0x4DEBEBF5),
                      size: 18,
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
          mainAxisSize: MainAxisSize.min,
          children: [
            AspectRatio(aspectRatio: 1, child: _Frame(child: item.cover)),
            const SizedBox(height: 8),
            Text(
              item.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: _t(13, w: FontWeight.w500),
            ),
            Text(
              item.sub,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: _t(12, c: _sub),
            ),
          ],
        ),
      ),
    ),
  );
}

class _ActionPill extends StatelessWidget {
  const _ActionPill({
    required this.icon,
    required this.label,
    required this.onTap,
    this.accent = false,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool accent;

  @override
  Widget build(BuildContext context) => PressableScale(
    scale: 0.97,
    onTap: onTap,
    child: Container(
      height: 44,
      decoration: BoxDecoration(
        color: _fill,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _hair, width: 0.5),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 17, color: _rose),
          const SizedBox(width: 8),
          Text(
            label,
            style: _t(14, w: FontWeight.w600, c: accent ? _rose : Colors.white),
          ),
        ],
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
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 18),
              child: Row(
                children: [
                  Expanded(
                    child: _ActionPill(
                      icon: Icons.add_rounded,
                      label: 'New Playlist',
                      accent: true,
                      onTap: () => _createPlaylist(ctx),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _ActionPill(
                      icon: CupertinoIcons.link,
                      label: 'Import Link',
                      onTap: () => _importPlaylist(ctx),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (lists.isEmpty)
            SliverToBoxAdapter(
              child: _Empty(
                icon: Icons.queue_music_rounded,
                title: 'No Playlists Yet',
                message:
                    'Create playlists for workouts, road trips, or favorite vibes.',
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
                        const Icon(
                          Icons.add_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Create Playlist',
                          style: _t(14, w: FontWeight.w700, c: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              sliver: SliverGrid(
                gridDelegate: _gridDelegate(ctx),
                delegate: SliverChildBuilderDelegate((c, i) {
                  final p = lists[i];
                  return _Tile(
                    index: i,
                    item: _Item(
                      title: p.name,
                      sub: _n(p.trackIds.length, 'song', 'songs'),
                      cover: _Collage(
                        s
                            .playlistTracks(p)
                            .take(4)
                            .map((t) => t.coverUrl)
                            .toList(),
                        radius: 0,
                      ),
                      onTap: () => _push(c, _PlaylistPage(p)),
                      onLong: () => _playlistMenu(c, p),
                    ),
                  );
                }, childCount: lists.length),
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
    listenable: Listenable.merge([
      LibraryStore.instance,
      CatalogDataSource.tracksNotifier,
    ]),
    builder: (ctx, _) {
      final s = LibraryStore.instance;
      final p = s.playlistById(initial.id);
      if (p == null) return const ColoredBox(color: Colors.black);
      final tracks = s.playlistTracks(p);

      return _page(
        title: p.name,
        previous: 'Playlists',
        trailing: _CircleBtn(
          Icons.more_vert_rounded,
          () => _playlistMenu(ctx, p, inDetail: true),
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
                          boxShadow: const [
                            BoxShadow(
                              color: Color(0x66000000),
                              blurRadius: 24,
                              offset: Offset(0, 10),
                            ),
                          ],
                        ),
                        child: _Frame(
                          radius: 12,
                          child: _Collage(
                            tracks.take(4).map((t) => t.coverUrl).toList(),
                            radius: 0,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _n(tracks.length, 'song', 'songs'),
                    style: _t(14, c: _sub),
                  ),
                  const SizedBox(height: 16),
                  if (tracks.isNotEmpty) ...[
                    _PlayShuffle(
                      onPlay: () => _play(ctx, tracks, 0),
                      onShuffle: () => _shuffle(ctx, tracks),
                    ),
                    const SizedBox(height: 6),
                  ],
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
              child: Row(
                children: [
                  Expanded(
                    child: PressableScale(
                      scale: 0.98,
                      onTap: () => _push(ctx, _AddSongsPage(p), modal: true),
                      child: Container(
                        height: 50,
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        decoration: BoxDecoration(
                          color: _fill,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: _hair),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 30,
                              height: 30,
                              decoration: BoxDecoration(
                                color: _rose.withValues(alpha: 0.18),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                Icons.search_rounded,
                                color: _rose,
                                size: 16,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                'Search Songs',
                                style: _t(
                                  13,
                                  w: FontWeight.w600,
                                  c: Colors.white,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: PressableScale(
                      scale: 0.98,
                      onTap: () => _importPlaylist(ctx, targetPlaylist: p),
                      child: Container(
                        height: 50,
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        decoration: BoxDecoration(
                          color: _fill,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: _hair),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 30,
                              height: 30,
                              decoration: BoxDecoration(
                                color: _rose.withValues(alpha: 0.18),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(
                                CupertinoIcons.link,
                                color: _rose,
                                size: 16,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                'Add from Link',
                                style: _t(13, w: FontWeight.w600, c: _rose),
                                overflow: TextOverflow.ellipsis,
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
          ),
          if (tracks.isEmpty)
            SliverToBoxAdapter(
              child: _Empty(
                icon: Icons.music_note_rounded,
                title: 'Empty Playlist',
                message:
                    'Search songs online or pick from your library to add to this playlist.',
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
                        const Icon(
                          Icons.search_rounded,
                          color: Colors.white,
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Search & Add Songs',
                          style: _t(14, w: FontWeight.w700, c: Colors.white),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            )
          else
            SliverList(
              delegate: SliverChildBuilderDelegate((c, i) {
                final t = tracks[i];
                return Dismissible(
                  key: ValueKey('pl-${p.id}-${t.id}'),
                  direction: DismissDirection.horizontal,
                  background: Container(
                    alignment: Alignment.centerLeft,
                    padding: const EdgeInsets.only(left: 20),
                    color: const Color(0xFF007AFF),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          CupertinoIcons.text_badge_plus,
                          color: Colors.white,
                          size: 22,
                        ),
                        SizedBox(width: 8),
                        Text(
                          'Play Next',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
                  ),
                  secondaryBackground: Container(
                    color: const Color(0xFFFF3B30),
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 20),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          'Remove',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                        SizedBox(width: 8),
                        Icon(
                          Icons.remove_circle_outline_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                      ],
                    ),
                  ),
                  confirmDismiss: (direction) async {
                    if (direction == DismissDirection.startToEnd) {
                      final player = Provider.of<PlayerState>(c, listen: false);
                      player.enqueuePlayNextSequential(t);
                      return false;
                    }
                    return true;
                  },
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
              }, childCount: tracks.length),
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

    final isLink = _looksLikeLink(query);

    if (isLink) {
      _debounce?.cancel();
      setState(() {
        _searching = false;
        _onlineResults = [];
      });
      return;
    }

    _debounce?.cancel();
    _debounce = Timer(
      const Duration(milliseconds: 320),
      () => _searchOnline(query),
    );
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
    listenable: Listenable.merge([
      LibraryStore.instance,
      CatalogDataSource.tracksNotifier,
    ]),
    builder: (ctx, _) {
      final s = LibraryStore.instance;
      final p = s.playlistById(widget.initial.id);
      if (p == null) return const ColoredBox(color: Colors.black);
      final inPlaylist = s.playlistTracks(p).map((t) => t.id).toSet();
      final q = _q.text.trim();
      final isQueryEmpty = q.isEmpty;

      Widget sectionHeader(String title, [Widget? trailing]) =>
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: _t(17, w: FontWeight.w700, ls: -0.2),
                    ),
                  ),
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

      final isLink = _looksLikeLink(q);

      final slivers = <Widget>[
        SliverToBoxAdapter(
          child: _Search(
            controller: _q,
            hint: 'Search songs online (song, artist)…',
            onChanged: _onSearchChanged,
          ),
        ),
        if (isLink)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
              child: PressableScale(
                scale: 0.98,
                onTap: () async {
                  HapticFeedback.mediumImpact();
                  await _importPlaylist(ctx, targetPlaylist: p);
                },
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: _rose.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: _rose.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: _rose,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          CupertinoIcons.link,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Import all songs from link',
                              style: _t(
                                14,
                                w: FontWeight.w700,
                                c: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'YouTube Music, Spotify, Apple Music, or JioSaavn',
                              style: _t(11, c: _sub),
                            ),
                          ],
                        ),
                      ),
                      const Icon(
                        CupertinoIcons.chevron_right,
                        color: _rose,
                        size: 16,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ];

      if (isQueryEmpty) {
        final liked = s.likedTracks;

        if (liked.isNotEmpty) {
          slivers.add(sectionHeader('From Favourite Songs'));
          slivers.add(
            SliverList(
              delegate: SliverChildBuilderDelegate(
                (c, i) => songRow(liked[i]),
                childCount: liked.length,
              ),
            ),
          );
        } else {
          slivers.add(
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: 20, vertical: 36),
                child: Text(
                  'Search online or through your library to add songs.',
                  style: TextStyle(color: _sub, fontSize: 14),
                  textAlign: TextAlign.center,
                ),
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
                child: Center(
                  child: CupertinoActivityIndicator(radius: 14, color: _rose),
                ),
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
              _searching
                  ? const CupertinoActivityIndicator(radius: 8, color: _rose)
                  : null,
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
    listenable: Listenable.merge([
      LibraryStore.instance,
      CatalogDataSource.tracksNotifier,
    ]),
    builder: (ctx, _) {
      final s = LibraryStore.instance;
      final q = _q.text.trim().toLowerCase();
      bool match(String n) => q.isEmpty || n.toLowerCase().contains(q);

      final followed = s.followedArtists.where((a) => match(a.name)).toList();

      return _page(
        title: 'Artists',
        previous: 'Library',
        slivers: [
          SliverToBoxAdapter(
            child: _Search(
              controller: _q,
              hint: 'Find in Artists',
              onChanged: (_) => setState(() {}),
            ),
          ),
          if (followed.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Text(
                  s.followedArtists.isEmpty
                      ? 'You aren’t following anyone yet. Follow artists and they’ll show up here.'
                      : 'No followed artist matches “${_q.text.trim()}”.',
                  style: _t(14, c: _sub),
                ),
              ),
            )
          else
            SliverList(
              delegate: SliverChildBuilderDelegate(
                (c, i) => _ArtistRow(
                  name: followed[i].name,
                  cover: followed[i].cover,
                  sub: 'Following',
                ),
                childCount: followed.length,
              ),
            ),
        ],
      );
    },
  );
}

class _ArtistRow extends StatelessWidget {
  const _ArtistRow({
    required this.name,
    required this.cover,
    required this.sub,
  });
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
                Icon(
                  on ? Icons.check_rounded : Icons.add_rounded,
                  size: 16,
                  color: on ? Colors.white : _rose,
                ),
                const SizedBox(width: 4),
                Text(
                  on ? 'Following' : 'Follow',
                  style: _t(
                    13,
                    w: FontWeight.w600,
                    c: on ? Colors.white : _rose,
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
    listenable: Listenable.merge([
      LibraryStore.instance,
      CatalogDataSource.tracksNotifier,
    ]),
    builder: (ctx, _) {
      final s = LibraryStore.instance;
      final q = _q.text.trim().toLowerCase();
      bool match(String a, String b) =>
          q.isEmpty ||
          a.toLowerCase().contains(q) ||
          b.toLowerCase().contains(q);

      final saved = s.savedAlbums
          .where((a) => match(a.title, a.artist))
          .toList();

      return _page(
        title: 'Albums',
        previous: 'Library',
        slivers: [
          SliverToBoxAdapter(
            child: _Search(
              controller: _q,
              hint: 'Find in Albums',
              onChanged: (_) => setState(() {}),
            ),
          ),
          if (saved.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Text(
                  s.savedAlbums.isEmpty
                      ? 'No saved albums yet. Save albums to your library to see them here.'
                      : 'No saved album matches “${_q.text.trim()}”.',
                  style: _t(14, c: _sub),
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              sliver: SliverGrid(
                gridDelegate: _gridDelegate(ctx),
                delegate: SliverChildBuilderDelegate(
                  (c, i) => _AlbumCard(
                    title: saved[i].title,
                    artist: saved[i].artist,
                    cover: saved[i].cover,
                    index: i,
                  ),
                  childCount: saved.length,
                ),
              ),
            ),
        ],
      );
    },
  );
}

class _AlbumCard extends StatelessWidget {
  const _AlbumCard({
    required this.title,
    required this.artist,
    required this.cover,
    this.index = 0,
  });
  final String title, artist, cover;
  final int index;

  @override
  Widget build(BuildContext context) => _SpringAppear(
    index: index,
    child: PressableScale(
      onTap: () => _openAlbum(context, title, artist, cover),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: _Frame(child: _Cover(cover, radius: 0)),
          ),
          const SizedBox(height: 8),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _t(13, w: FontWeight.w500),
          ),
          Text(
            artist,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _t(12, c: _sub),
          ),
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
  void Function(Track track)? onRemoveTrack,
  String removeLabel = 'Remove',
}) {
  if (songs.isEmpty) return [SliverToBoxAdapter(child: empty)];
  return [
    SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 6),
        child: Column(
          children: [
            _PlayShuffle(
              onPlay: () => _play(c, songs, 0),
              onShuffle: () => _shuffle(c, songs),
            ),
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerLeft,
              child: PressableScale(
                onTap: onSort,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        sort.label,
                        style: _t(15, w: FontWeight.w600, c: _rose),
                      ),
                      const SizedBox(width: 2),
                      const Icon(
                        Icons.unfold_more_rounded,
                        size: 18,
                        color: _rose,
                      ),
                    ],
                  ),
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
          final canDelete = onRemoveTrack != null;
          return Dismissible(
            key: ValueKey('song_${t.id}'),
            direction: canDelete
                ? DismissDirection.horizontal
                : DismissDirection.startToEnd,
            background: Container(
              alignment: Alignment.centerLeft,
              padding: const EdgeInsets.only(left: 20),
              color: const Color(0xFF007AFF),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    CupertinoIcons.text_badge_plus,
                    color: Colors.white,
                    size: 22,
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Play Next',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            secondaryBackground: canDelete
                ? Container(
                    color: const Color(0xFFFF3B30),
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 20),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          removeLabel,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Icon(
                          CupertinoIcons.trash,
                          color: Colors.white,
                          size: 20,
                        ),
                      ],
                    ),
                  )
                : null,
            confirmDismiss: (direction) async {
              if (direction == DismissDirection.startToEnd) {
                final player = Provider.of<PlayerState>(ctx, listen: false);
                player.enqueuePlayNextSequential(t);
                return false;
              }
              return true;
            },
            onDismissed: (_) {
              if (onRemoveTrack != null) {
                HapticFeedback.mediumImpact();
                onRemoveTrack(t);
              }
            },
            child: _SongRow(
              track: t,
              onTap: () => _play(ctx, songs, i),
              onLong: () => _trackActions(ctx, t),
              trailing: _MoreBtn(() => _trackActions(ctx, t)),
            ),
          );
        },
        childCount: songs.length,
        addAutomaticKeepAlives: false,
      ),
    ),
  ];
}

class _MediaTabSwitch extends StatelessWidget {
  const _MediaTabSwitch({
    required this.selectedIndex,
    required this.onChanged,
    this.songsCount,
    this.videosCount,
  });

  final int selectedIndex;
  final ValueChanged<int> onChanged;
  final int? songsCount;
  final int? videosCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(20, 6, 20, 10),
      height: 38,
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.all(3),
      child: Row(
        children: [
          Expanded(
            child: _TabButton(
              title: songsCount != null ? 'Songs ($songsCount)' : 'Songs',
              selected: selectedIndex == 0,
              onTap: () => onChanged(0),
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: _TabButton(
              title: videosCount != null ? 'Videos ($videosCount)' : 'Videos',
              selected: selectedIndex == 1,
              onTap: () => onChanged(1),
            ),
          ),
        ],
      ),
    );
  }
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.title,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOutCubic,
        decoration: BoxDecoration(
          color: selected
              ? Colors.white.withValues(alpha: 0.16)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        alignment: Alignment.center,
        child: Text(
          title,
          style: TextStyle(
            color: selected ? Colors.white : _sub,
            fontSize: 13,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            letterSpacing: -0.1,
          ),
        ),
      ),
    );
  }
}

class _LikedPage extends StatefulWidget {
  const _LikedPage();

  @override
  State<_LikedPage> createState() => _LikedPageState();
}

class _LikedPageState extends State<_LikedPage> {
  final _q = TextEditingController();
  _Sort _sort = _Sort.recent;
  int _tabIndex = 0; // 0 = Songs (left), 1 = Videos (right)

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: Listenable.merge([
      LibraryStore.instance,
      CatalogDataSource.tracksNotifier,
    ]),
    builder: (ctx, _) {
      final s = LibraryStore.instance;
      final allLiked = s.likedTracks;
      final audioLiked = allLiked
          .where((t) => !t.isVideo && !Track.detectIsVideo(t.title, t.album))
          .toList();
      final videoLiked = allLiked
          .where((t) => t.isVideo || Track.detectIsVideo(t.title, t.album))
          .map((t) => t.copyWith(isVideo: true))
          .toList();

      final currentTracks = _tabIndex == 0 ? audioLiked : videoLiked;
      final empty = currentTracks.isEmpty;
      final songs = _filterTracks(currentTracks, _q.text, _sort);

      return _page(
        title: 'Favourite Songs',
        previous: 'Library',
        slivers: [
          SliverToBoxAdapter(
            child: _MediaTabSwitch(
              selectedIndex: _tabIndex,
              onChanged: (idx) => setState(() => _tabIndex = idx),
              songsCount: audioLiked.length,
              videosCount: videoLiked.length,
            ),
          ),
          if (!empty)
            SliverToBoxAdapter(
              child: _Search(
                controller: _q,
                hint: _tabIndex == 0
                    ? 'Find in Favourite Songs'
                    : 'Find in Favourite Videos',
                onChanged: (_) => setState(() {}),
              ),
            ),
          ..._songSlivers(
            ctx,
            songs,
            sort: _sort,
            onSort: () =>
                _sortSheet(ctx, _sort, (v) => setState(() => _sort = v)),
            onRemoveTrack: (t) {
              LibraryStore.instance.toggleLove(t);
            },
            removeLabel: 'Unlike',
            empty: _Empty(
              icon: empty
                  ? (_tabIndex == 0
                        ? CupertinoIcons.star
                        : CupertinoIcons.play_rectangle)
                  : Icons.search_off_rounded,
              title: empty
                  ? (_tabIndex == 0
                        ? 'No Favourite Songs Yet'
                        : 'No Favourite Videos Yet')
                  : 'No Results',
              message: empty
                  ? (_tabIndex == 0
                        ? 'Press and hold any song, then choose “Add to Favourite Songs”.'
                        : 'Add official music videos to your favourites to view them here.')
                  : 'Nothing in Favourite ${_tabIndex == 0 ? "Songs" : "Videos"} matches “${_q.text.trim()}”.',
            ),
          ),
        ],
      );
    },
  );
}

class _DownloadedPage extends StatefulWidget {
  const _DownloadedPage();

  @override
  State<_DownloadedPage> createState() => _DownloadedPageState();
}

class _DownloadedPageState extends State<_DownloadedPage> {
  final _q = TextEditingController();
  _Sort _sort = _Sort.recent;
  int _tabIndex = 0; // 0 = Songs (left), 1 = Videos (right)

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  void _showDownloadedOptions(BuildContext ctx) {
    HapticFeedback.selectionClick();
    final dl = DownloadService.instance;
    ZenDropdown.show<void>(
      context: ctx,
      title: 'Downloaded Music',
      subtitle: '${dl.downloadedCount} songs · ${dl.formattedTotalSize} total',
      items: [
        if (dl.downloadedCount > 0)
          ZenDropdownItem(
            title: 'Delete All Downloads',
            subtitle: 'Free up ${dl.formattedTotalSize} of storage',
            icon: CupertinoIcons.trash,
            isDestructive: true,
            onTap: () async {
              final ok = await _confirm(
                ctx,
                title: 'Delete All Downloads?',
                message:
                    'This will remove all ${dl.downloadedCount} downloaded songs from offline storage.',
                action: 'Delete All',
              );
              if (ok) {
                await dl.deleteAllDownloads();
                HapticFeedback.mediumImpact();
                IslandNotifier.instance.show(
                  IslandNotification(
                    id: 'delete_all_dl_${DateTime.now().millisecondsSinceEpoch}',
                    title: 'All Downloads Removed',
                    body: 'Storage freed up',
                    leading: const Icon(
                      CupertinoIcons.trash,
                      color: Colors.white70,
                      size: 18,
                    ),
                  ),
                );
              }
            },
          ),
      ],
    );
  }

  List<DownloadedSong> _filterAndSort(
    List<DownloadedSong> items,
    String query,
    _Sort sort,
  ) {
    var list = items;
    final q = query.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list
          .where(
            (s) =>
                s.title.toLowerCase().contains(q) ||
                s.artist.toLowerCase().contains(q) ||
                s.album.toLowerCase().contains(q),
          )
          .toList();
    }
    switch (sort) {
      case _Sort.recent:
        list.sort((a, b) => b.downloadedAt.compareTo(a.downloadedAt));
      case _Sort.title:
        list.sort(
          (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
        );
      case _Sort.artist:
        list.sort(
          (a, b) => a.artist.toLowerCase().compareTo(b.artist.toLowerCase()),
        );
    }
    return list;
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: DownloadService.instance,
    builder: (ctx, _) {
      final dl = DownloadService.instance;
      final allDl = dl.downloadedSongs;
      final audioDl = allDl
          .where(
            (s) =>
                !s.isVideo &&
                s.videoPath == null &&
                !s.toTrack().isVideo &&
                !Track.detectIsVideo(s.title, s.album),
          )
          .toList();
      final videoDl = allDl
          .where(
            (s) =>
                s.isVideo ||
                s.videoPath != null ||
                s.toTrack().isVideo ||
                Track.detectIsVideo(s.title, s.album),
          )
          .toList();

      final currentDl = _tabIndex == 0 ? audioDl : videoDl;
      final empty = currentDl.isEmpty;
      final downloadedSongs = _filterAndSort(currentDl, _q.text, _sort);
      final tracks = downloadedSongs
          .map(
            (s) => s.toTrack().copyWith(isVideo: _tabIndex == 1 ? true : null),
          )
          .toList();

      return _page(
        title: 'Downloaded',
        previous: 'Library',
        trailing: _CircleBtn(
          Icons.more_vert_rounded,
          () => _showDownloadedOptions(ctx),
        ),
        slivers: [
          SliverToBoxAdapter(
            child: _MediaTabSwitch(
              selectedIndex: _tabIndex,
              onChanged: (idx) => setState(() => _tabIndex = idx),
              songsCount: audioDl.length,
              videosCount: videoDl.length,
            ),
          ),
          if (!empty)
            SliverToBoxAdapter(
              child: _Search(
                controller: _q,
                hint: _tabIndex == 0
                    ? 'Find in Downloads'
                    : 'Find in Downloaded Videos',
                onChanged: (_) => setState(() {}),
              ),
            ),
          ..._downloadedSongSlivers(
            ctx,
            downloadedSongs,
            tracks,
            sort: _sort,
            onSort: () =>
                _sortSheet(ctx, _sort, (v) => setState(() => _sort = v)),
            empty: _Empty(
              icon: empty
                  ? (_tabIndex == 0
                        ? CupertinoIcons.arrow_down_circle
                        : CupertinoIcons.play_rectangle)
                  : Icons.search_off_rounded,
              title: empty
                  ? (_tabIndex == 0
                        ? 'No Downloaded Songs'
                        : 'No Downloaded Videos')
                  : 'No Results',
              message: empty
                  ? (_tabIndex == 0
                        ? 'Tap the three dots on any song, album, or playlist and choose “Download” for 100% offline playback.'
                        : 'Download official music videos for offline playback.')
                  : 'Nothing in Downloaded ${_tabIndex == 0 ? "Songs" : "Videos"} matches “${_q.text.trim()}”.',
            ),
          ),
        ],
      );
    },
  );
}

List<Widget> _downloadedSongSlivers(
  BuildContext c,
  List<DownloadedSong> downloadedSongs,
  List<Track> songs, {
  required _Sort sort,
  required VoidCallback onSort,
  required Widget empty,
}) {
  if (downloadedSongs.isEmpty) return [SliverToBoxAdapter(child: empty)];
  return [
    SliverToBoxAdapter(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 6),
        child: Column(
          children: [
            _PlayShuffle(
              onPlay: () => _play(c, songs, 0),
              onShuffle: () => _shuffle(c, songs),
            ),
            const SizedBox(height: 6),
            Align(
              alignment: Alignment.centerLeft,
              child: PressableScale(
                onTap: onSort,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        sort.label,
                        style: _t(15, w: FontWeight.w600, c: _rose),
                      ),
                      const SizedBox(width: 2),
                      const Icon(
                        Icons.unfold_more_rounded,
                        size: 18,
                        color: _rose,
                      ),
                    ],
                  ),
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
          final s = downloadedSongs[i];
          final t = songs[i];
          return Dismissible(
            key: ValueKey('dl_${s.id}'),
            direction: DismissDirection.horizontal,
            background: Container(
              alignment: Alignment.centerLeft,
              padding: const EdgeInsets.only(left: 20),
              color: const Color(0xFF007AFF),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    CupertinoIcons.text_badge_plus,
                    color: Colors.white,
                    size: 22,
                  ),
                  SizedBox(width: 8),
                  Text(
                    'Play Next',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            secondaryBackground: Container(
              alignment: Alignment.centerRight,
              padding: const EdgeInsets.only(right: 20),
              color: const Color(0xFFFF3B30),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Text(
                    'Delete',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                  SizedBox(width: 8),
                  Icon(CupertinoIcons.trash, color: Colors.white, size: 20),
                ],
              ),
            ),
            confirmDismiss: (direction) async {
              if (direction == DismissDirection.startToEnd) {
                final player = Provider.of<PlayerState>(ctx, listen: false);
                player.enqueuePlayNextSequential(t);
                return false; // Keep in downloaded list
              }
              return true;
            },
            onDismissed: (direction) async {
              if (direction == DismissDirection.endToStart) {
                HapticFeedback.mediumImpact();
                await DownloadService.instance.deleteDownload(s.id);
                IslandNotifier.instance.show(
                  IslandNotification(
                    id: 'dismiss_dl_${s.id}',
                    title: 'Removed from Downloads',
                    body: t.title,
                    leading: const Icon(
                      CupertinoIcons.trash,
                      color: Colors.white70,
                      size: 18,
                    ),
                  ),
                );
              }
            },
            child: _DownloadedSongRow(
              downloadedSong: s,
              track: t,
              onTap: () => _play(ctx, songs, i),
              onLong: () => _trackActions(ctx, t),
              trailing: _MoreBtn(() => _trackActions(ctx, t)),
            ),
          );
        },
        childCount: downloadedSongs.length,
        addAutomaticKeepAlives: false,
      ),
    ),
  ];
}

class _DownloadedSongRow extends StatelessWidget {
  const _DownloadedSongRow({
    required this.downloadedSong,
    required this.track,
    required this.onTap,
    required this.onLong,
    required this.trailing,
  });

  final DownloadedSong downloadedSong;
  final Track track;
  final VoidCallback onTap, onLong;
  final Widget trailing;

  @override
  Widget build(
    BuildContext context,
  ) => Selector<PlayerState, ({Object? id, bool playing})>(
    selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
    builder: (context, s, child) {
      final active = s.id == track.id;
      final isVid =
          track.isVideo || Track.detectIsVideo(track.title, track.album);
      final artW = isVid ? 74.0 : 48.0;
      return RepaintBoundary(
        child: PressableScale(
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
                    width: artW,
                    height: 48,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        _Frame(
                          radius: 6,
                          child: _Cover(track.coverUrl, radius: 0),
                        ),
                        if (active)
                          ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: Container(
                              color: Colors.black.withValues(alpha: 0.50),
                              alignment: Alignment.center,
                              child: _EqBars(
                                playing: s.playing,
                                size: 14,
                                color: Colors.white,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Container(
                      height: 62,
                      decoration: const BoxDecoration(
                        border: Border(
                          bottom: BorderSide(color: _hair, width: 0.5),
                        ),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  MediaNormalizer.cleanCompactTitle(
                                    track.title,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: _t(
                                    15,
                                    c: active ? _rose : Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Row(
                                  children: [
                                    const Icon(
                                      CupertinoIcons.arrow_down_circle_fill,
                                      color: _rose,
                                      size: 12,
                                    ),
                                    const SizedBox(width: 4),
                                    Expanded(
                                      child: Text(
                                        '${track.artist} • ${downloadedSong.formattedSize}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: _t(12.5, c: _sub),
                                      ),
                                    ),
                                  ],
                                ),
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
        ),
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
    this.thumb = 52,
    required this.onTap,
  });

  final Widget leading;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final double thumb;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
    scale: 0.985,
    onTap: onTap,
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
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: _hair, width: 0.5)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: _t(15, c: Colors.white),
                        ),
                        if (subtitle != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            subtitle!,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: _t(12.5, c: _sub),
                          ),
                        ],
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
  );
}

class _SongRow extends StatelessWidget {
  const _SongRow({
    required this.track,
    required this.onTap,
    required this.onLong,
    required this.trailing,
  });
  final Track track;
  final VoidCallback onTap, onLong;
  final Widget trailing;

  @override
  Widget build(BuildContext context) =>
      Selector<PlayerState, ({Object? id, bool playing})>(
        selector: (_, p) => (id: p.currentTrack?.id, playing: p.isPlaying),
        builder: (context, s, child) {
          final active = s.id == track.id;
          final isVid =
              track.isVideo || Track.detectIsVideo(track.title, track.album);
          final artW = isVid ? 74.0 : 48.0;
          return RepaintBoundary(
            child: PressableScale(
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
                        width: artW,
                        height: 48,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            _Frame(
                              radius: 6,
                              child: _Cover(track.coverUrl, radius: 0),
                            ),
                            if (active)
                              ClipRRect(
                                borderRadius: BorderRadius.circular(6),
                                child: Container(
                                  color: Colors.black.withValues(alpha: 0.50),
                                  alignment: Alignment.center,
                                  child: _EqBars(
                                    playing: s.playing,
                                    size: 14,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Container(
                          height: 62,
                          decoration: const BoxDecoration(
                            border: Border(
                              bottom: BorderSide(color: _hair, width: 0.5),
                            ),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      MediaNormalizer.cleanCompactTitle(
                                        track.title,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: _t(
                                        15,
                                        c: active ? _rose : Colors.white,
                                      ),
                                    ),
                                    GestureDetector(
                                      behavior: HitTestBehavior.opaque,
                                      onTap: () {
                                        MediaNavigationSheet.show(
                                          context: context,
                                          track: track,
                                        );
                                      },
                                      child: Text(
                                        track.artist,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: _t(12.5, c: _sub),
                                      ),
                                    ),
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
    child: const SizedBox(
      width: 44,
      height: 44,
      child: Icon(Icons.more_vert_rounded, color: _sub, size: 22),
    ),
  );
}

class _CircleBtn extends StatelessWidget {
  const _CircleBtn(this.icon, this.onTap);
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => PressableScale(
    scale: 0.88,
    onTap: () {
      HapticFeedback.lightImpact();
      onTap();
    },
    child: AppleGlass(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(
        width: 32,
        height: 32,
        child: Center(child: Icon(icon, size: 18, color: Colors.white)),
      ),
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
      child: Text(
        label,
        style: _t(16, w: FontWeight.w600, c: _rose),
      ),
    ),
  );
}

class _PlayShuffle extends StatelessWidget {
  const _PlayShuffle({required this.onPlay, required this.onShuffle});
  final VoidCallback onPlay, onShuffle;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: ZenPlayButton(height: 48, onTap: onPlay, label: 'Play'),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: ZenShuffleButton(height: 48, onTap: onShuffle, label: 'Shuffle'),
      ),
    ],
  );
}

class _Search extends StatelessWidget {
  const _Search({
    required this.controller,
    required this.hint,
    required this.onChanged,
  });
  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
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
  const _Empty({
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });
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
            width: 64,
            height: 64,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Color(0x0FFFFFFF),
            ),
            child: Icon(icon, size: 28, color: _rose),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: _t(17, w: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            message,
            textAlign: TextAlign.center,
            style: _t(13, c: _sub),
          ),
          if (action != null) ...[const SizedBox(height: 18), action!],
        ],
      ),
    ),
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Images
 * ═══════════════════════════════════════════════════════════════════ */
class _Frame extends StatelessWidget {
  const _Frame({required this.child, this.radius = 6.0});
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
      child: Icon(
        CupertinoIcons.star_fill,
        color: _rose,
        size: c.maxWidth * 0.46,
      ),
    ),
  );
}

class _Cover extends StatelessWidget {
  const _Cover(this.url, {this.radius = 6.0});
  final String url;
  final double radius;

  Widget get _ph => Container(
    color: Colors.white.withValues(alpha: 0.06),
    child: const Icon(Icons.music_note_rounded, color: Colors.white24),
  );

  @override
  Widget build(BuildContext context) {
    Widget content;
    final isLocal = url.startsWith('file://') || url.startsWith('/');
    if (url.isEmpty) {
      content = _ph;
    } else if (isLocal) {
      final f = File(url.replaceFirst('file://', ''));
      content = f.existsSync()
          ? Image.file(
              f,
              fit: BoxFit.cover,
              width: double.infinity,
              height: double.infinity,
              errorBuilder: (_, _, _) => _ph,
            )
          : _ph;
    } else {
      content = CachedNetworkImage(
        imageUrl: url,
        fit: BoxFit.cover,
        width: double.infinity,
        height: double.infinity,
        memCacheWidth: 400,
        fadeInDuration: const Duration(milliseconds: 180),
        errorWidget: (context, u, e) => _ph,
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: content,
    );
  }
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
              memCacheWidth: (size * 2).toInt(),
              errorWidget: (context, u, e) => Icon(
                Icons.person_rounded,
                size: size * 0.5,
                color: Colors.white38,
              ),
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
      memCacheWidth: 400,
      errorWidget: (context, url, e) =>
          Container(color: Colors.white.withValues(alpha: 0.06)),
    ),
  );

  @override
  Widget build(BuildContext context) {
    Widget child;
    if (urls.isEmpty) {
      child = const Center(
        child: Icon(Icons.queue_music_rounded, size: 34, color: _rose),
      );
    } else if (urls.length < 4) {
      child = _img(urls.first);
    } else {
      child = Column(
        children: [
          Expanded(
            child: Row(
              children: [
                Expanded(child: _img(urls[0])),
                Expanded(child: _img(urls[1])),
              ],
            ),
          ),
          Expanded(
            child: Row(
              children: [
                Expanded(child: _img(urls[2])),
                Expanded(child: _img(urls[3])),
              ],
            ),
          ),
        ],
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Container(
        color: Colors.white.withValues(alpha: 0.06),
        child: child,
      ),
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════
 *  Now-playing equalizer
 * ═══════════════════════════════════════════════════════════════════ */
typedef _EqBars = EqualizerBars;
