import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/apple_glass.dart';
import '../../design_system/widgets/artwork_mesh_background.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/scrubber_slider.dart';
import '../../services/player_state.dart';
import '../../services/queue_state.dart';
import '../lyrics/lyrics_sheet.dart';
import 'player_kit.dart';
import 'queue_panel.dart';
import 'studio_fx_sheet.dart';
import '../details/artist_screen.dart';
import '../details/album_screen.dart';
import '../../design_system/widgets/interactive_artists_text.dart';
import '../../models/track.dart';
import '../../utils/media_normalizer.dart';

const double _kPaused = 0.86; // artwork shrink while paused
const double _kMiniH = 58;
const double _kMiniArt = 40;

enum _Axis { none, x, y }

/// What fills the middle of the open sheet.
enum _Panel { art, lyrics, queue }

/// Drop this ONCE above your tab bar content:
///
///   Stack(children: [ pages, const Positioned.fill(child: PlayerShell()) ])
///
/// Motion model (all springs):
///  • `_sheet` 0 = docked mini, 1 = fully open. Drives the sheet slide, the
///    corner radius, the mini fade AND the artwork morph.
///  • `_dock`  0 = big artwork, 1 = artwork docked in the header. Drives the
///    lyrics / queue transitions (header grows in, title row collapses,
///    artwork flies to the header).
///  • ONE artwork widget lives in an overlay and is interpolated between the
///    mini rect → big rect → header rect, so the cover really travels.
class PlayerShell extends StatefulWidget {
  const PlayerShell({
    super.key,
    this.hideMini = false,
    this.miniBottomOffset = 76,
    this.lyricsBuilder,
    this.onGoToArtist,
    this.onGoToAlbum,
  });

  final bool hideMini;

  /// Distance from screen bottom (excluding safe area) to the mini player.
  final double miniBottomOffset;

  /// Inline lyrics body. Defaults to your existing [LyricsSheet].
  final WidgetBuilder? lyricsBuilder;

  /// Called from the track menus. Receives the track (or artist name).
  final void Function(dynamic track)? onGoToArtist;
  final void Function(dynamic track)? onGoToAlbum;

  @override
  State<PlayerShell> createState() => PlayerShellState();
}

class PlayerShellState extends State<PlayerShell>
    with TickerProviderStateMixin {
  bool get isOpen => _open || _sheet.value > 0.05;
  bool get isPanelOpen => _panel != _Panel.art;
  void closePanel() => _setPanel(_Panel.art);
  void closeSheet() => _close();

  late final AnimationController _sheet = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );
  late final AnimationController _pause = AnimationController.unbounded(
    vsync: this,
    value: 1,
  );
  late final AnimationController _dock = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );
  late final AnimationController _artX = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );
  late final AnimationController _miniX = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );

  final GlobalKey _regionKey = GlobalKey();
  final GlobalKey _sheetKey = GlobalKey();

  bool _open = false;
  _Panel _panel = _Panel.art;
  bool _dragging = false;
  bool _startedClosed = true;
  bool? _wasPlaying;
  int _dir = 1;
  double _travel = 700;

  // measured rect (in sheet coordinates) the big artwork rests in
  Rect? _bigRect;
  bool _measureQueued = false;

  final Set<String> _liked = {};
  bool get _isLiked => _liked.contains(_trackKey);
  bool get _docked => _panel != _Panel.art;

  String? _trackKey;
  String? _shownCover;
  List<Color> _palette = [
    AppColors.accent,
    AppColors.brandMaroon,
    const Color(0xFF2C2C34),
    const Color(0xFF1C1C24),
  ];

  // values picked with context.select in build() so the shell only rebuilds
  // when something it actually shows changes (not on every PlayerState tick)
  bool _playing = false;
  bool _shuffle = false;
  ZenifyRepeatMode _repeat = ZenifyRepeatMode.off;
  dynamic _duration;

  // gesture state
  _Axis _miniAxis = _Axis.none;
  Offset _miniAcc = Offset.zero;
  _Axis _artAxis = _Axis.none;
  Offset _artAcc = Offset.zero;
  bool _artDragging = false;

  @override
  void dispose() {
    for (final c in [_sheet, _pause, _dock, _artX, _miniX]) {
      c.dispose();
    }
    super.dispose();
  }

  /* ───────────────────────── sync with player ───────────────────────── */

  void _syncTrack(dynamic track) {
    final key = '${track.title}|${track.artist}|${track.coverUrl}';
    if (key == _trackKey) return;
    _trackKey = key;
    final url = (track.coverUrl as String?) ?? '';
    // render the new cover on frame 1 without a blank flash
    if (url.isNotEmpty && _shownCover != url) {
      _shownCover = url;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      context.read<QueueState>().syncCurrent(track);
      if (url.isNotEmpty) {
        try {
          await precacheImage(CachedNetworkImageProvider(url), context);
        } catch (_) {}
      }
      if (!mounted || _trackKey != key) return;
      if (_shownCover != url) {
        setState(() => _shownCover = url);
      }
      final p = await extractPalette(url);
      if (mounted && p != null && _trackKey == key) {
        setState(() => _palette = p);
      }
    });
  }

  void _syncPlaying(bool playing) {
    if (_wasPlaying == playing) return;
    final first = _wasPlaying == null;
    _wasPlaying = playing;
    final target = playing ? 1.0 : _kPaused;
    if (first) {
      _pause.value = target;
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _pause.springTo(target, spring: kPauseSpring);
      });
    }
  }

  /* ───────────────────────── navigation helpers ───────────────────────── */

  void _openArtist(String artistName) {
    _close();
    if (widget.onGoToArtist != null) {
      widget.onGoToArtist!(artistName);
    } else {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => ArtistScreen(artistName: artistName)),
      );
    }
  }

  void _openAlbum(dynamic track) {
    _close();
    if (widget.onGoToAlbum != null) {
      widget.onGoToAlbum!(track);
    } else {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => AlbumScreen(
            albumTitle: (track.album as String?)?.isNotEmpty == true
                ? (track.album as String)
                : (track.title as String),
            artistName: track.artist as String,
            coverUrl: track.coverUrl as String?,
          ),
        ),
      );
    }
  }

  dynamic _artistsOf(dynamic track) =>
      track is Track ? track.resolvedArtists : (track.artist as String);

  /* ───────────────────────── transport (queue aware) ───────────────────────── */

  /// ▶ THE ONE LINE TO MATCH TO YOUR PlayerState API:
  /// start playing this exact track right now.
  void _playTrack(dynamic track) =>
      context.read<PlayerState>().playTrack(track);

  void _next() {
    _dir = 1;
    final e = context.read<QueueState>().takeNext();
    if (e != null) {
      _playTrack(e.track);
    } else {
      context.read<PlayerState>().next();
    }
  }

  void _prev() {
    _dir = -1;
    final p = context.read<PlayerState>();
    // Apple behaviour: past 3s, "previous" restarts the song.
    if (p.positionNotifier.value > const Duration(seconds: 3)) {
      p.seek(Duration.zero);
      return;
    }
    final e = context.read<QueueState>().takePrevious();
    if (e != null) {
      _playTrack(e.track);
    } else {
      p.previous();
    }
  }

  void _jumpTo(QueueEntry e) {
    _dir = 1;
    context.read<QueueState>().jumpTo(e);
    _playTrack(e.track);
  }

  void _playHistory(QueueEntry e) {
    _dir = -1;
    context.read<QueueState>().playFromHistory(e);
    _playTrack(e.track);
  }

  /* ───────────────────────── sheet motion ───────────────────────── */

  void _openSheet({double velocity = 0}) {
    HapticFeedback.lightImpact();
    if (!_open) setState(() => _open = true);
    _sheet.springTo(1, velocity: velocity);
  }

  void _close({double velocity = 0}) {
    if (!_open && _sheet.value <= 0.001) return;
    _sheet.springTo(0, velocity: velocity).then((_) {
      if (!mounted) return;
      _dock.value = 0;
      _artX.value = 0;
      setState(() {
        _open = false;
        _panel = _Panel.art;
      });
    });
  }

  void _dragStart() {
    _sheet.stop();
    _dragging = true;
    _startedClosed = !_open;
  }

  void _dragUpdate(double dy) {
    _sheet.value = (_sheet.value - dy / _travel).clamp(0.0, 1.0);
  }

  void _dragEnd(double vy) {
    _dragging = false;
    final vt = -vy / _travel; // t / second, + = opening
    final t = _sheet.value;
    final bool target;
    if (vt.abs() > 0.35) {
      target = vt > 0;
    } else {
      target = _startedClosed ? t > 0.2 : t > 1 - 90 / _travel;
    }
    target ? _openSheet(velocity: vt) : _close(velocity: vt);
  }

  /* ───────────────────────── panels (art / lyrics / queue) ───────────────────────── */

  void _setPanel(_Panel p) {
    if (_panel == p) return;
    HapticFeedback.selectionClick();
    setState(() => _panel = p);
    _dock.springTo(p == _Panel.art ? 0 : 1).then((_) => _queueMeasure());
  }

  void _togglePanel(_Panel p) => _setPanel(_panel == p ? _Panel.art : p);

  /* ───────────── measuring where the big artwork rests ───────────── */

  void _queueMeasure() {
    if (_measureQueued || !mounted) return;
    _measureQueued = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => _measureArt());
  }

  void _measureArt() {
    _measureQueued = false;
    if (!mounted || !_open || _panel != _Panel.art || _dock.value.abs() > 0.001) {
      return;
    }
    final r = _regionKey.currentContext?.findRenderObject();
    final s = _sheetKey.currentContext?.findRenderObject();
    if (r is! RenderBox || s is! RenderBox) return;
    if (!r.attached || !s.attached || !r.hasSize || !s.hasSize) return;
    final tl = r.localToGlobal(Offset.zero, ancestor: s);
    final side = math
        .min(r.size.width - 56, r.size.height - 24)
        .clamp(100.0, 380.0)
        .toDouble();
    final rect = Rect.fromLTWH(
      tl.dx + (r.size.width - side) / 2,
      tl.dy + (r.size.height - side) / 2,
      side,
      side,
    );
    final old = _bigRect;
    if (old == null ||
        (old.topLeft - rect.topLeft).distance > 0.5 ||
        (old.width - side).abs() > 0.5) {
      setState(() => _bigRect = rect);
    }
  }

  /* ───────────────────────── mini gestures ───────────────────────── */

  void _miniStart(DragStartDetails _) {
    _miniAxis = _Axis.none;
    _miniAcc = Offset.zero;
    _miniX.stop();
  }

  void _miniUpdate(DragUpdateDetails d) {
    _miniAcc += d.delta;
    if (_miniAxis == _Axis.none) {
      if (_miniAcc.distance < 6) return;
      _miniAxis = _miniAcc.dx.abs() > _miniAcc.dy.abs() ? _Axis.x : _Axis.y;
      if (_miniAxis == _Axis.y && _miniAcc.dy < 0 && !_open) {
        _dragStart();
        setState(() => _open = true);
        _dragUpdate(_miniAcc.dy);
        return;
      }
    }
    if (_miniAxis == _Axis.x) {
      _miniX.value += d.delta.dx * 0.8;
    } else if (_miniAxis == _Axis.y && _dragging) {
      _dragUpdate(d.delta.dy);
    }
  }

  void _miniEnd(DragEndDetails d) {
    final v = d.velocity.pixelsPerSecond;
    if (_miniAxis == _Axis.x) {
      if (_miniAcc.dx < -56 || v.dx < -500) {
        _next();
      } else if (_miniAcc.dx > 56 || v.dx > 500) {
        _prev();
      }
      _miniX.springTo(0, spring: kSoftSpring, velocity: v.dx * 0.8);
    } else if (_dragging) {
      _dragEnd(v.dy);
    }
    _miniAxis = _Axis.none;
  }

  /* ───────────────────────── artwork gestures (open sheet) ───────────────────────── */

  void _artStart(DragStartDetails _) {
    _artAxis = _Axis.none;
    _artAcc = Offset.zero;
    _artDragging = false;
    _artX.stop();
  }

  void _artUpdate(DragUpdateDetails d) {
    _artAcc += d.delta;
    if (_artAxis == _Axis.none) {
      if (_artAcc.distance < 6) return;
      _artAxis = _artAcc.dx.abs() > _artAcc.dy.abs() ? _Axis.x : _Axis.y;
      if (_artAxis == _Axis.y && _artAcc.dy > 0) {
        _dragStart();
        _artDragging = true;
        _dragUpdate(_artAcc.dy);
      }
      return;
    }
    if (_artAxis == _Axis.x) {
      _artX.value += d.delta.dx * 0.7;
    } else if (_artDragging) {
      _dragUpdate(d.delta.dy);
    }
  }

  void _artEnd(DragEndDetails d) {
    final v = d.velocity.pixelsPerSecond;
    if (_artAxis == _Axis.x) {
      if (_artAcc.dx < -60 || v.dx < -400) {
        _next();
      } else if (_artAcc.dx > 60 || v.dx > 400) {
        _prev();
      }
      _artX.springTo(0, spring: kSoftSpring, velocity: v.dx * 0.7);
    } else if (_artAxis == _Axis.y) {
      if (_artDragging) {
        _artDragging = false;
        _dragEnd(v.dy);
      } else if (_artAcc.dy < -35 || v.dy < -250) {
        _setPanel(_Panel.lyrics);
      }
    }
    _artAxis = _Axis.none;
  }

  /* ───────────────────────── actions ───────────────────────── */

  void _showTrackMenu(dynamic track) {
    final q = context.read<QueueState>();
    showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: Text(track.title as String),
        message: Text(track.artist as String),
        actions: [
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              q.playNext(track);
            },
            child: const Text('Play Next'),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              q.addToQueue(track);
            },
            child: const Text('Add to Queue'),
          ),
          CupertinoActionSheetAction(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Add to Playlist'),
          ),
          CupertinoActionSheetAction(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Download'),
          ),
          for (final artist
              in (track is Track
                  ? track.artistNames
                  : MediaNormalizer.splitArtistNames(track.artist as String?)))
            CupertinoActionSheetAction(
              onPressed: () {
                Navigator.pop(ctx);
                _openArtist(artist);
              },
              child: Text('Go to $artist'),
            ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              _openAlbum(track);
            },
            child: const Text('Go to Album'),
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Cancel'),
        ),
      ),
    );
  }

  void _toggleLike() {
    final k = _trackKey;
    if (k == null) return;
    setState(() => _liked.contains(k) ? _liked.remove(k) : _liked.add(k));
  }

  /* ───────────────────────── build ───────────────────────── */

  @override
  Widget build(BuildContext context) {
    // Rebuild only for the fields this UI shows. Position updates come through
    // positionNotifier and never rebuild the shell.
    final track = context.select<PlayerState, dynamic>((p) => p.currentTrack);
    if (track == null) return const SizedBox.shrink();
    _playing = context.select<PlayerState, bool>((p) => p.isPlaying);
    _shuffle = context.select<PlayerState, bool>((p) => p.isShuffle);
    _repeat = context.select<PlayerState, ZenifyRepeatMode>(
      (p) => p.repeatMode,
    );
    _duration = context.select<PlayerState, dynamic>((p) => p.duration);
    final player = context.read<PlayerState>();

    _syncTrack(track);
    _syncPlaying(_playing);

    final mq = MediaQuery.of(context);
    final size = mq.size;
    final safe = mq.padding;
    _travel = size.height * 0.78;
    if (_open) _queueMeasure();

    final isExpanded = _open || _sheet.value > 0.05 || _docked;

    return PopScope(
      canPop: !isExpanded,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (_docked) {
          _setPanel(_Panel.art);
        } else if (_open || _sheet.value > 0.05) {
          _close();
        }
      },
      child: SizedBox.expand(
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            _buildMini(player, track, safe),
            _buildSheet(player, track, size, safe),
            _buildArtOverlay(track, size, safe),
          ],
        ),
      ),
    );
  }

  /* ───────────────────────── MINI PLAYER (Apple Music glass pill) ───────────────────────── */

  Widget _buildMini(PlayerState player, dynamic track, EdgeInsets safe) {
    return Positioned(
      left: 16, // same width as the dock (pill + search circle)
      right: 16,
      bottom: widget.miniBottomOffset + safe.bottom,
      height: _kMiniH,
      child: AnimatedSlide(
        offset: widget.hideMini ? const Offset(0, 1.8) : Offset.zero,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
        child: AnimatedOpacity(
          opacity: widget.hideMini ? 0.0 : 1.0,
          duration: const Duration(milliseconds: 200),
          child: AnimatedBuilder(
            animation: _sheet,
            builder: (_, child) {
              final t = _sheet.value.clamp(0.0, 1.0);
              final o = (1 - t * 8).clamp(0.0, 1.0);
              if (o <= 0.001) return const SizedBox.shrink();
              return IgnorePointer(
                ignoring: widget.hideMini || _open,
                child: Opacity(
                  opacity: o,
                  child: Transform.scale(
                    scale: 1 - 0.04 * (1 - o),
                    child: child,
                  ),
                ),
              );
            },
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => _openSheet(),
              onPanStart: _miniStart,
              onPanUpdate: _miniUpdate,
              onPanEnd: _miniEnd,
              onPanCancel: () => _miniEnd(DragEndDetails()),
              child: AppleGlass(
                borderRadius: BorderRadius.circular(29),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(9, 0, 6, 0),
                  child: Row(
                    children: [
                      // artwork slot (the real cover is drawn by the overlay so it
                      // can fly into the sheet) + title/artist, swipe to skip
                      Expanded(
                        child: AnimatedBuilder(
                          animation: _miniX,
                          builder: (_, _) => Transform.translate(
                            offset: Offset(_miniX.value, 0),
                            child: Row(
                              children: [
                                DecoratedBox(
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(8),
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(
                                          alpha: 0.28,
                                        ),
                                        blurRadius: 8,
                                        offset: const Offset(0, 2),
                                      ),
                                    ],
                                  ),
                                  child: ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: SizedBox(
                                      width: _kMiniArt,
                                      height: _kMiniArt,
                                      child: CoverImage(
                                        (track.coverUrl as String?) ?? '',
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 11),
                                Expanded(
                                  child: RightEdgeFade(child: _miniText(track)),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      PressableScale(
                        onTap: player.togglePlay,
                        scale: 0.88,
                        child: SizedBox(
                          width: 46,
                          height: 46,
                          child: _PlayGlyph(playing: _playing, size: 28),
                        ),
                      ),
                      PressableScale(
                        onTap: _next,
                        scale: 0.88,
                        child: const SizedBox(
                          width: 46,
                          height: 46,
                          child: Icon(
                            CupertinoIcons.forward_fill,
                            color: Colors.white,
                            size: 28,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _miniText(dynamic track) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SwapText(
          track.title as String,
          dir: _dir,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            height: 19 / 15,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.2,
          ),
        ),
        InteractiveArtistsText(
          artists: _artistsOf(track),
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.58),
            fontSize: 13.5,
            height: 17 / 13.5,
          ),
          onTapArtist: (artistName) {
            if (widget.onGoToArtist != null) {
              widget.onGoToArtist!(artistName);
            } else {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ArtistScreen(artistName: artistName),
                ),
              );
            }
          },
        ),
      ],
    );
  }

  /* ───────────────────────── ARTWORK OVERLAY (the morphing cover) ───────────────────────── */

  Widget _buildArtOverlay(dynamic track, Size size, EdgeInsets safe) {
    final url =
        (_shownCover?.isNotEmpty == true
            ? _shownCover
            : (track?.coverUrl as String?)) ??
        '';
    // built once per state change, NOT once per animation frame
    final cover = AnimatedSwitcher(
      duration: const Duration(milliseconds: 320),
      switchInCurve: Curves.easeOut,
      child: SizedBox.expand(
        key: ValueKey('cover-$url'),
        child: CoverImage(url),
      ),
    );

    return Positioned.fill(
      child: AnimatedBuilder(
        animation: Listenable.merge([_sheet, _dock, _pause, _artX]),
        child: cover,
        builder: (context, child) {
          final t = _sheet.value.clamp(0.0, 1.0);
          if (!_open && t <= 0.001) return const SizedBox.shrink();
          final d = _dock.value.clamp(0.0, 1.0);

          final mini = Rect.fromLTWH(
            25,
            size.height -
                widget.miniBottomOffset -
                safe.bottom -
                _kMiniH +
                (_kMiniH - _kMiniArt) / 2,
            _kMiniArt,
            _kMiniArt,
          );
          final fallbackSide = math.min(size.width - 56, 380.0);
          final big =
              _bigRect ??
              Rect.fromLTWH(
                (size.width - fallbackSide) / 2,
                safe.top + 70,
                fallbackSide,
                fallbackSide,
              );
          final docked = Rect.fromLTWH(24, safe.top + 29, 56, 56);

          final open = Rect.lerp(big, docked, d)!;
          final rect = Rect.lerp(mini, open, t)!;
          final radius = lerpDouble(8, lerpDouble(20, 10, d)!, t)!;
          final pauseScale = 1 - (1 - _pause.value) * (1 - d) * t;
          final dx = _artX.value * t * (1 - d);

          // Positioned must be a direct child of a Stack, so wrap it in one.
          return Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fromRect(
                rect: rect.shift(Offset(dx, 0)),
                child: IgnorePointer(
                  ignoring: t < 0.95 || d > 0.4,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => _setPanel(_Panel.lyrics),
                    onPanStart: _artStart,
                    onPanUpdate: _artUpdate,
                    onPanEnd: _artEnd,
                    onPanCancel: () => _artEnd(DragEndDetails()),
                    child: Transform.scale(
                      scale: pauseScale,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: const Color(0xFF27272A),
                          borderRadius: BorderRadius.circular(radius),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(
                                alpha:
                                    lerpDouble(0.28, 0.45, t)! * (1 - 0.5 * d),
                              ),
                              blurRadius: lerpDouble(8, 36, t)! * (1 - 0.6 * d),
                              offset: Offset(
                                0,
                                lerpDouble(2, 16, t)! * (1 - 0.6 * d),
                              ),
                            ),
                          ],
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(radius),
                          child: child,
                        ),
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

  /* ───────────────────────── FULL SHEET ───────────────────────── */

  Widget _buildSheet(
    PlayerState player,
    dynamic track,
    Size size,
    EdgeInsets safe,
  ) {
    // The heavy column is built once per state change and handed to the
    // AnimatedBuilder as `child`, so it is NOT rebuilt on every animation frame.
    final column = RepaintBoundary(child: _sheetColumn(player, track, safe));

    return Positioned.fill(
      child: AnimatedBuilder(
        animation: _sheet,
        child: column,
        builder: (context, child) {
          final t = _sheet.value.clamp(0.0, 1.0);
          if (!_open && t <= 0.001) return const SizedBox.shrink();
          final radius = math.min(1.0, (1 - t) * _travel / 140) * 32;
          // content fades in late so the artwork morph reads first
          final contentOpacity = Curves.easeOut.transform(
            ((t - 0.3) / 0.7).clamp(0.0, 1.0),
          );

          return Transform.translate(
            offset: Offset(0, (1 - t) * size.height),
            child: ClipRRect(
              borderRadius: BorderRadius.vertical(top: Radius.circular(radius)),
              clipBehavior: radius > 0.1 ? Clip.antiAlias : Clip.none,
              child: Stack(
                key: _sheetKey,
                children: [
                  Positioned.fill(
                    child: RepaintBoundary(
                      child: ArtworkMeshBackground(
                        coverUrl: track?.coverUrl,
                        fallbackAsset: 'assets/images/z_logo.png',
                        paused: !_playing,
                        backgroundColor: _palette.isNotEmpty
                            ? _palette.first
                            : null,
                      ),
                    ),
                  ),
                  // soft scrim keeps lyrics / queue text readable
                  Positioned.fill(
                    child: IgnorePointer(
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 450),
                        curve: Curves.easeOutCubic,
                        color: Colors.black.withValues(
                          alpha: _docked ? 0.26 : 0,
                        ),
                      ),
                    ),
                  ),
                  Opacity(
                    opacity: contentOpacity,
                    child: SizedBox.expand(child: child),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _edgeFade(Widget child) {
    return ShaderMask(
      blendMode: BlendMode.dstIn,
      shaderCallback: (r) => const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Colors.transparent,
          Colors.black,
          Colors.black,
          Colors.transparent,
        ],
        stops: [0, 0.05, 0.93, 1],
      ).createShader(r),
      child: child,
    );
  }

  /// Scroll-to-dismiss: pulling a scrollable down past its top drags the sheet.
  Widget _dismissOnOverscroll(Widget child) {
    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n is OverscrollNotification && n.overscroll < 0) {
          if (!_dragging) _dragStart();
          _dragUpdate(-n.overscroll);
          return true;
        }
        if (n is ScrollEndNotification && _dragging) {
          _dragEnd(0);
        }
        return false;
      },
      child: child,
    );
  }

  Widget _panelBody(dynamic track) {
    switch (_panel) {
      case _Panel.art:
        // empty: the artwork itself is drawn (and animated) by the overlay
        return const SizedBox.expand(key: ValueKey('art'));
      case _Panel.lyrics:
        return KeyedSubtree(
          // new key per track → lyrics cross-fade when the song changes
          key: ValueKey('lyrics-$_trackKey'),
          child: _dismissOnOverscroll(
            _edgeFade(
              widget.lyricsBuilder?.call(context) ?? const LyricsSheet(),
            ),
          ),
        );
      case _Panel.queue:
        return KeyedSubtree(
          key: const ValueKey('queue'),
          child: _dismissOnOverscroll(
            _edgeFade(
              QueuePanel(
                onJumpTo: _jumpTo,
                onPlayHistory: _playHistory,
                onGoToArtist: widget.onGoToArtist,
              ),
            ),
          ),
        );
    }
  }

  Widget _panelTransition(Widget c, Animation<double> anim) {
    return AnimatedBuilder(
      animation: anim,
      child: c,
      builder: (_, child) {
        final exiting = anim.status == AnimationStatus.reverse;
        final e = exiting
            ? anim.value
            : Curves.easeOutCubic.transform(anim.value);
        return Opacity(
          opacity: e.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, (1 - e) * (exiting ? 10 : 26)),
            child: Transform.scale(scale: 0.97 + 0.03 * e, child: child),
          ),
        );
      },
    );
  }

  /// Collapses / reveals [child] following the `_dock` spring (no pop-in).
  /// [inverse]: visible while the big artwork is shown.
  Widget _dockCollapse({required bool inverse, required Widget child}) {
    return AnimatedBuilder(
      animation: _dock,
      child: child,
      builder: (_, c) {
        final d = _dock.value.clamp(0.0, 1.0);
        final f = inverse ? 1 - d : d;
        if (f <= 0.001) return const SizedBox(width: double.infinity);
        return IgnorePointer(
          ignoring: f < 0.85,
          child: ClipRect(
            child: Align(
              alignment: Alignment.topCenter,
              heightFactor: f,
              child: Opacity(opacity: f, child: c),
            ),
          ),
        );
      },
    );
  }

  Widget _sheetColumn(PlayerState player, dynamic track, EdgeInsets safe) {
    final isLyrics = _panel == _Panel.lyrics;

    return Column(
      children: [
        // Grabber (drag down or tap to close)
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _close,
          onPanStart: (_) => _dragStart(),
          onPanUpdate: (d) => _dragUpdate(d.delta.dy),
          onPanEnd: (d) => _dragEnd(d.velocity.pixelsPerSecond.dy),
          child: Padding(
            padding: EdgeInsets.only(top: safe.top + 12, bottom: 12),
            child: Center(
              child: Container(
                width: 36,
                height: 5,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
            ),
          ),
        ),

        // Compact header (lyrics / queue): the artwork overlay docks onto it
        _dockCollapse(inverse: false, child: _compactHeader(track)),

        // Middle region: lyrics / queue live here (artwork lives in the overlay)
        Expanded(
          child: SizedBox.expand(
            key: _regionKey,
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onVerticalDragStart: (_) => _dragStart(),
              onVerticalDragUpdate: (d) => _dragUpdate(d.delta.dy),
              onVerticalDragEnd: (d) => _dragEnd(d.velocity.pixelsPerSecond.dy),
              onVerticalDragCancel: () => _dragEnd(0),
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 380),
                reverseDuration: const Duration(milliseconds: 260),
                transitionBuilder: _panelTransition,
                layoutBuilder: (cur, prev) =>
                    Stack(fit: StackFit.expand, children: [...prev, ?cur]),
                child: _panelBody(track),
              ),
            ),
          ),
        ),

        // Bottom block
        GestureDetector(
          behavior: HitTestBehavior.translucent,
          onVerticalDragStart: (_) => _dragStart(),
          onVerticalDragUpdate: (d) => _dragUpdate(d.delta.dy),
          onVerticalDragEnd: (d) => _dragEnd(d.velocity.pixelsPerSecond.dy),
          onVerticalDragCancel: () => _dragEnd(0),
          child: Padding(
            padding: EdgeInsets.fromLTRB(24, 8, 24, safe.bottom + 18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // title / artist / like / more: collapses smoothly when lyrics / queue open
                _dockCollapse(inverse: true, child: _metaRow(track)),

                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: ScrubberSlider(
                      positionNotifier: player.positionNotifier,
                      duration: _duration,
                      onSeek: (pos) => player.seek(pos),
                    ),
                  ),
                ),

                // transport glides away while lyrics are open
                AnimatedSize(
                  duration: const Duration(milliseconds: 380),
                  curve: Curves.easeOutCubic,
                  alignment: Alignment.topCenter,
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 240),
                    opacity: isLyrics ? 0 : 1,
                    child: isLyrics
                        ? const SizedBox(width: double.infinity)
                        : Center(
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 420),
                              child: Padding(
                                padding: const EdgeInsets.only(
                                  top: 12,
                                  bottom: 20,
                                ),
                                child: _transport(player),
                              ),
                            ),
                          ),
                  ),
                ),

                AnimatedPadding(
                  duration: const Duration(milliseconds: 380),
                  curve: Curves.easeOutCubic,
                  padding: EdgeInsets.only(top: isLyrics ? 14 : 0),
                  child: _tools(isLyrics),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _fade(bool show, Widget child) {
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 240),
      opacity: show ? 1 : 0,
      child: AnimatedScale(
        duration: const Duration(milliseconds: 360),
        curve: Curves.easeOutBack,
        scale: show ? 1 : 0.7,
        child: IgnorePointer(ignoring: !show, child: child),
      ),
    );
  }

  Widget _compactHeader(dynamic track) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onPanStart: (_) => _dragStart(),
      onPanUpdate: (d) => _dragUpdate(d.delta.dy),
      onPanEnd: (d) => _dragEnd(d.velocity.pixelsPerSecond.dy),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
        child: Row(
          children: [
            // placeholder: the overlay artwork docks exactly here
            const SizedBox(width: 56, height: 56),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SwapText(
                    track.title as String,
                    dir: _dir,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      height: 22 / 17,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.25,
                    ),
                  ),
                  InteractiveArtistsText(
                    artists: _artistsOf(track),
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.6),
                      fontSize: 15,
                      height: 20 / 15,
                    ),
                    onTapArtist: _openArtist,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            PopLikeButton(liked: _isLiked, onToggle: _toggleLike),
            const SizedBox(width: 8),
            GlassCircle(
              onTap: () => _showTrackMenu(track),
              child: const Icon(
                CupertinoIcons.ellipsis,
                color: Colors.white,
                size: 18,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _metaRow(dynamic track) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  onTap: () => _openAlbum(track),
                  child: SwapText(
                    track.title as String,
                    dir: _dir,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      height: 28 / 22,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.45,
                    ),
                  ),
                ),
                InteractiveArtistsText(
                  artists: _artistsOf(track),
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.75),
                    fontSize: 17,
                    height: 22 / 17,
                  ),
                  onTapArtist: _openArtist,
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          PopLikeButton(liked: _isLiked, onToggle: _toggleLike),
          const SizedBox(width: 8),
          GlassCircle(
            onTap: () => _showTrackMenu(track),
            child: const Icon(
              CupertinoIcons.ellipsis,
              color: Colors.white,
              size: 18,
            ),
          ),
        ],
      ),
    );
  }

  Widget _transport(PlayerState player) {
    final repeatOn = _repeat != ZenifyRepeatMode.off;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        PlateButton(
          active: _shuffle,
          onTap: () {
            HapticFeedback.selectionClick();
            player.toggleShuffle();
          },
          child: const Icon(CupertinoIcons.shuffle, size: 20),
        ),
        PressableScale(
          onTap: _prev,
          child: const SizedBox(
            width: 56,
            height: 56,
            child: Icon(
              CupertinoIcons.backward_fill,
              color: Colors.white,
              size: 34,
            ),
          ),
        ),
        PressableScale(
          onTap: player.togglePlay,
          scale: 0.9,
          child: SizedBox(
            width: 68,
            height: 68,
            child: _PlayGlyph(playing: _playing, size: 46),
          ),
        ),
        PressableScale(
          onTap: _next,
          child: const SizedBox(
            width: 56,
            height: 56,
            child: Icon(
              CupertinoIcons.forward_fill,
              color: Colors.white,
              size: 34,
            ),
          ),
        ),
        PlateButton(
          active: repeatOn,
          onTap: () {
            HapticFeedback.selectionClick();
            player.toggleRepeat();
          },
          child: Icon(
            _repeat == ZenifyRepeatMode.one
                ? CupertinoIcons.repeat_1
                : CupertinoIcons.repeat,
            size: 20,
          ),
        ),
      ],
    );
  }

  /// Studio FX · Lyrics · Queue.
  /// While lyrics are open the side buttons fade away and only the (active)
  /// lyrics toggle stays, so there's always a way back.
  Widget _tools(bool lyricsOpen) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 300),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _fade(
            !lyricsOpen,
            PlateButton(
              size: 44,
              onTap: () => showStudioFxSheet(context),
              child: const Icon(CupertinoIcons.slider_horizontal_3, size: 22),
            ),
          ),
          PlateButton(
            size: 44,
            active: lyricsOpen,
            onTap: () => _togglePanel(_Panel.lyrics),
            child: Icon(
              lyricsOpen
                  ? CupertinoIcons.quote_bubble_fill
                  : CupertinoIcons.quote_bubble,
              size: 22,
            ),
          ),
          _fade(
            !lyricsOpen,
            PlateButton(
              size: 44,
              active: _panel == _Panel.queue,
              onTap: () => _togglePanel(_Panel.queue),
              child: const Icon(CupertinoIcons.list_bullet, size: 24),
            ),
          ),
        ],
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Play / pause glyph with a soft cross-morph                          */
/* ------------------------------------------------------------------ */
class _PlayGlyph extends StatelessWidget {
  const _PlayGlyph({required this.playing, required this.size});
  final bool playing;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: AnimatedSwitcher(
        duration: const Duration(milliseconds: 260),
        switchInCurve: Curves.easeOutBack,
        switchOutCurve: Curves.easeIn,
        transitionBuilder: (c, a) => ScaleTransition(
          scale: Tween<double>(begin: 0.55, end: 1).animate(a),
          child: FadeTransition(opacity: a, child: c),
        ),
        child: Icon(
          playing ? CupertinoIcons.pause_fill : CupertinoIcons.play_fill,
          key: ValueKey(playing),
          color: Colors.white,
          size: size,
        ),
      ),
    );
  }
}
