import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
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

enum _Axis { none, x, y }

/// What fills the middle of the open sheet.
enum _Panel { art, lyrics, queue }

/// Drop this ONCE above your tab bar content:
///
///   Stack(children: [ pages, const Positioned.fill(child: PlayerShell()) ])
///
/// One spring controller (`_sheet`, 0 = docked mini, 1 = fully open) drives the
/// sheet, the artwork morph, the mini fade and the corner radius. A second
/// (`_dock`, 0 = big artwork, 1 = artwork docked in the header) drives the
/// lyrics / queue transitions the same way.
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

  /// Called from the track menus. Receives the track.
  final void Function(dynamic track)? onGoToArtist;
  final void Function(dynamic track)? onGoToAlbum;

  @override
  State<PlayerShell> createState() => PlayerShellState();
}

class PlayerShellState extends State<PlayerShell> with TickerProviderStateMixin {
  bool get isOpen => _open || _sheet.value > 0.05;
  bool get isPanelOpen => _panel != _Panel.art;
  void closePanel() => _setPanel(_Panel.art);
  void closeSheet() => _close();

  late final AnimationController _sheet = AnimationController.unbounded(vsync: this, value: 0);
  late final AnimationController _pause = AnimationController.unbounded(vsync: this, value: 1);
  late final AnimationController _dock = AnimationController.unbounded(vsync: this, value: 0);
  late final AnimationController _artX = AnimationController.unbounded(vsync: this, value: 0);
  late final AnimationController _miniX = AnimationController.unbounded(vsync: this, value: 0);

  final GlobalKey _regionKey = GlobalKey();
  final GlobalKey _sheetKey = GlobalKey();

  bool _open = false;
  _Panel _panel = _Panel.art;
  bool _dragging = false;
  bool _startedClosed = true;
  bool? _wasPlaying;
  int _dir = 1;
  double _travel = 700;

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

  // gesture state
  _Axis _miniAxis = _Axis.none;
  Offset _miniAcc = Offset.zero;
  _Axis _artAxis = _Axis.none;
  Offset _artAcc = Offset.zero;
  bool _artDragging = false;

  @override
  void initState() {
    super.initState();
  }

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
    // Immediately set _shownCover so the image renders on frame 1 without blank screen
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
      if (mounted && p != null && _trackKey == key) setState(() => _palette = p);
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

  /* ───────────────────────── transport (queue aware) ───────────────────────── */

  /// ▶ THE ONE LINE TO MATCH TO YOUR PlayerState API:
  /// start playing this exact track right now.
  void _playTrack(dynamic track) => context.read<PlayerState>().playTrack(track);

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
    _sheet.springTo(0, velocity: velocity).then((_) {
      if (!mounted) return;
      _dock.value = 0;
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
    _dock.springTo(p == _Panel.art ? 0 : 1);
  }

  void _togglePanel(_Panel p) => _setPanel(_panel == p ? _Panel.art : p);

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
    if (_docked) {
      if (d.delta.dy > 0 || _artDragging) {
        if (!_artDragging) {
          _dragStart();
          _artDragging = true;
        }
        _dragUpdate(d.delta.dy);
      }
      return;
    }
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
    if (_docked) {
      if (_artDragging) {
        _artDragging = false;
        _dragEnd(v.dy);
      }
      return;
    }
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
          CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx), child: const Text('Add to Playlist')),
          CupertinoActionSheetAction(onPressed: () => Navigator.pop(ctx), child: const Text('Download')),
          for (final artist in (track is Track ? track.artistNames : MediaNormalizer.splitArtistNames(track.artist as String?)))
            CupertinoActionSheetAction(
              onPressed: () {
                Navigator.pop(ctx);
                _close();
                if (widget.onGoToArtist != null) {
                  widget.onGoToArtist!(artist);
                } else {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => ArtistScreen(artistName: artist),
                    ),
                  );
                }
              },
              child: Text('Go to $artist'),
            ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
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
    final player = context.watch<PlayerState>();
    final track = player.currentTrack;
    if (track == null) return const SizedBox.shrink();

    _syncTrack(track);
    _syncPlaying(player.isPlaying);

    final mq = MediaQuery.of(context);
    final size = mq.size;
    final safe = mq.padding;
    _travel = size.height * 0.78;

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
          ],
        ),
      ),
    );
  }

  /* ───────────────────────── MINI PLAYER ───────────────────────── */

  Widget _buildMini(PlayerState player, dynamic track, EdgeInsets safe) {
    return Positioned(
      left: 12,
      right: 12,
      bottom: widget.miniBottomOffset + safe.bottom,
      height: 62,
      child: AnimatedSlide(
        offset: widget.hideMini ? const Offset(0, 1.8) : Offset.zero,
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeInOutCubic,
        child: AnimatedOpacity(
          opacity: widget.hideMini ? 0.0 : 1.0,
          duration: const Duration(milliseconds: 200),
          child: IgnorePointer(
            ignoring: widget.hideMini || _open,
            child: AnimatedBuilder(
              animation: _sheet,
              builder: (_, child) {
                final t = _sheet.value.clamp(0.0, 1.0);
                final o = (1 - t * 8).clamp(0.0, 1.0);
                return Opacity(
                  opacity: o,
                  child: Transform.scale(
                    scale: 1 - 0.04 * (1 - o),
                    child: IgnorePointer(ignoring: _open, child: child),
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
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(31),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.45),
                  blurRadius: 28,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(31),
              child: BackdropFilter(
                filter: ui.ImageFilter.blur(sigmaX: 28, sigmaY: 28),
                child: Container(
                  decoration: BoxDecoration(
                    color: const Color(0x6618181C),
                    borderRadius: BorderRadius.circular(31),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.18),
                      width: 0.8,
                    ),
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.white.withValues(alpha: 0.14),
                        Colors.white.withValues(alpha: 0.02),
                      ],
                    ),
                  ),
                  child: Stack(
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(left: 14, right: 8),
                        child: Row(
                          children: [
                            Expanded(
                              child: AnimatedBuilder(
                                animation: _miniX,
                                builder: (_, _) => Transform.translate(
                                  offset: Offset(_miniX.value, 0),
                                  child: Row(
                                    key: ValueKey('mini-${track.id}'),
                                    children: [
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(8),
                                        child: SizedBox(
                                          width: 44,
                                          height: 44,
                                          child: CoverImage((track.coverUrl as String?) ?? ''),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(child: _miniText(track)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            PressableScale(
                              onTap: player.togglePlay,
                              child: SizedBox(
                                width: 40,
                                height: 40,
                                child: _PlayGlyph(playing: player.isPlaying, size: 28),
                              ),
                            ),
                            PressableScale(
                              onTap: _next,
                              child: const SizedBox(
                                width: 40,
                                height: 40,
                                child: Icon(Icons.fast_forward_rounded, color: Colors.white, size: 26),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Positioned(
                        left: 26,
                        right: 26,
                        bottom: 0,
                        child: ValueListenableBuilder<Duration>(
                          valueListenable: player.positionNotifier,
                          builder: (_, position, _) {
                            final total =
                                player.duration.inMilliseconds.toDouble().clamp(1.0, double.infinity);
                            final pos = position.inMilliseconds.toDouble().clamp(0.0, total);
                            return ClipRRect(
                              borderRadius: BorderRadius.circular(1),
                              child: SizedBox(
                                height: 2,
                                child: LinearProgressIndicator(
                                  value: (pos / total).clamp(0.0, 1.0),
                                  backgroundColor: Colors.white.withValues(alpha: 0.1),
                                  valueColor: const AlwaysStoppedAnimation(AppColors.accent),
                                ),
                              ),
                            );
                          },
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
            fontSize: 14,
            height: 18 / 14,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.15,
          ),
        ),
        InteractiveArtistsText(
          artists: track is Track ? track.resolvedArtists : (track.artist as String),
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.6),
            fontSize: 12.5,
            height: 16 / 12.5,
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



  /* ───────────────────────── FULL SHEET ───────────────────────── */

  Widget _buildSheet(PlayerState player, dynamic track, Size size, EdgeInsets safe) {
    return Positioned.fill(
      child: AnimatedBuilder(
        animation: _sheet,
        builder: (context, _) {
          final t = _sheet.value.clamp(0.0, 1.0);
          if (!_open && t <= 0.001) return const SizedBox.shrink();
          final radius = math.min(1.0, (1 - t) * _travel / 140) * 32;
          final contentOpacity = t.clamp(0.0, 1.0);

          return Transform.translate(
            offset: Offset(0, (1 - t) * size.height),
            child: ClipRRect(
              borderRadius: BorderRadius.vertical(top: Radius.circular(radius)),
              child: Stack(
                key: _sheetKey,
                children: [
                  Positioned.fill(
                    child: ArtworkMeshBackground(
                      coverUrl: track?.coverUrl,
                      fallbackAsset: 'assets/images/z_logo.png',
                      paused: !player.isPlaying,
                      backgroundColor: _palette.isNotEmpty ? _palette.first : null,
                    ),
                  ),
                  // soft scrim keeps lyrics / queue text readable
                  Positioned.fill(
                    child: IgnorePointer(
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 450),
                        curve: Curves.easeOutCubic,
                        color: Colors.black.withValues(alpha: _docked ? 0.26 : 0),
                      ),
                    ),
                  ),
                  Opacity(
                    opacity: contentOpacity,
                    child: SizedBox.expand(
                      child: _sheetColumn(player, track, safe),
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

  Widget _edgeFade(Widget child) {
    return ShaderMask(
      blendMode: BlendMode.dstIn,
      shaderCallback: (r) => const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Colors.transparent, Colors.black, Colors.black, Colors.transparent],
        stops: [0, 0.05, 0.93, 1],
      ).createShader(r),
      child: child,
    );
  }

  Widget _panelBody(dynamic track) {
    switch (_panel) {
      case _Panel.art:
        final url = (_shownCover?.isNotEmpty == true ? _shownCover : (track?.coverUrl as String?)) ?? '';
        return Center(
          key: ValueKey('art-$_trackKey'),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 12),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final side = math.min(constraints.maxWidth, constraints.maxHeight).clamp(100.0, 380.0);
                return SizedBox(
                  width: side,
                  height: side,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: const Color(0xFF27272A),
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.45),
                          blurRadius: 36,
                          offset: const Offset(0, 16),
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(20),
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => _setPanel(_Panel.lyrics),
                        onPanStart: _artStart,
                        onPanUpdate: _artUpdate,
                        onPanEnd: _artEnd,
                        onPanCancel: () => _artEnd(DragEndDetails()),
                        child: CoverImage(url),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        );
      case _Panel.lyrics:
        return KeyedSubtree(
          // new key per track → lyrics cross-fade when the song changes
          key: ValueKey('lyrics-$_trackKey'),
          child: NotificationListener<ScrollNotification>(
            onNotification: (n) {
              if (n is OverscrollNotification && n.overscroll < 0) {
                _dragStart();
                _dragUpdate(-n.overscroll);
                return true;
              }
              if (n is ScrollEndNotification && _dragging) {
                _dragEnd(0);
              }
              return false;
            },
            child: _edgeFade(widget.lyricsBuilder?.call(context) ?? const LyricsSheet()),
          ),
        );
      case _Panel.queue:
        return KeyedSubtree(
          key: const ValueKey('queue'),
          child: NotificationListener<ScrollNotification>(
            onNotification: (n) {
              if (n is OverscrollNotification && n.overscroll < 0) {
                _dragStart();
                _dragUpdate(-n.overscroll);
                return true;
              }
              if (n is ScrollEndNotification && _dragging) {
                _dragEnd(0);
              }
              return false;
            },
            child: _edgeFade(
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
      builder: (_, _) {
        final exiting = anim.status == AnimationStatus.reverse;
        final e = exiting ? anim.value : Curves.easeOutCubic.transform(anim.value);
        return Opacity(
          opacity: e.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, (1 - e) * (exiting ? 10 : 26)),
            child: Transform.scale(scale: 0.97 + 0.03 * e, child: c),
          ),
        );
      },
    );
  }

  Widget _sheetColumn(PlayerState player, dynamic track, EdgeInsets safe) {
    final isArt = _panel == _Panel.art;
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

        // Compact header (lyrics / queue): artwork docks here
        _collapse(_docked, _compactHeader(track)),

        // Middle region: artwork lives in the overlay; lyrics / queue live here
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
                layoutBuilder: (cur, prev) => Stack(
                  fit: StackFit.expand,
                  children: [...prev, ?cur],
                ),
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
                // title / artist / like / more: only while the big artwork is showing
                if (isArt) _metaRow(track),

              Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: ScrubberSlider(
                    positionNotifier: player.positionNotifier,
                    duration: player.duration,
                    onSeek: (pos) => player.seek(pos),
                  ),
                ),
              ),

              // transport hides only while lyrics are open
              if (!isLyrics)
                Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: Padding(
                      padding: const EdgeInsets.only(top: 12, bottom: 20),
                      child: _transport(player),
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

  /// Conditionally displays a block without breaking parent flex layout.
  Widget _collapse(bool show, Widget child) {
    if (!show) return const SizedBox.shrink();
    return child;
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
      key: ValueKey('compact-${track.id}'),
      behavior: HitTestBehavior.opaque,
      onPanStart: (_) => _dragStart(),
      onPanUpdate: (d) => _dragUpdate(d.delta.dy),
      onPanEnd: (d) => _dragEnd(d.velocity.pixelsPerSecond.dy),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: SizedBox(
                width: 56,
                height: 56,
                child: CoverImage((track.coverUrl as String?) ?? ''),
              ),
            ),
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
                    artists: track is Track ? track.resolvedArtists : (track.artist as String),
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.6),
                      fontSize: 15,
                      height: 20 / 15,
                    ),
                    onTapArtist: (artistName) {
                      _close();
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
              ),
            ),
            const SizedBox(width: 8),
            PopLikeButton(liked: _isLiked, onToggle: _toggleLike),
            const SizedBox(width: 8),
            GlassCircle(
              onTap: () => _showTrackMenu(track),
              child: const Icon(Icons.more_horiz_rounded, color: Colors.white, size: 20),
            ),
          ],
        ),
      ),
    );
  }

  Widget _metaRow(dynamic track) {
    return Padding(
      key: ValueKey('meta-${track.id}'),
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GestureDetector(
                  onTap: () {
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
                  },
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
                  artists: track is Track ? track.resolvedArtists : (track.artist as String),
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.75),
                    fontSize: 17,
                    height: 22 / 17,
                  ),
                  onTapArtist: (artistName) {
                    _close();
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
            ),
          ),
          const SizedBox(width: 12),
          PopLikeButton(liked: _isLiked, onToggle: _toggleLike),
          const SizedBox(width: 8),
          GlassCircle(
            onTap: () => _showTrackMenu(track),
            child: const Icon(Icons.more_horiz_rounded, color: Colors.white, size: 20),
          ),
        ],
      ),
    );
  }

  Widget _transport(PlayerState player) {
    final repeatOn = player.repeatMode != ZenifyRepeatMode.off;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        PlateButton(
          active: player.isShuffle,
          onTap: () {
            HapticFeedback.selectionClick();
            player.toggleShuffle();
          },
          child: const Icon(Icons.shuffle_rounded, size: 21),
        ),
        PressableScale(
          onTap: _prev,
          child: const SizedBox(
            width: 52,
            height: 52,
            child: Icon(Icons.fast_rewind_rounded, color: Colors.white, size: 38),
          ),
        ),
        PressableScale(
          onTap: player.togglePlay,
          scale: 0.9,
          child: SizedBox(
            width: 64,
            height: 64,
            child: _PlayGlyph(playing: player.isPlaying, size: 52),
          ),
        ),
        PressableScale(
          onTap: _next,
          child: const SizedBox(
            width: 52,
            height: 52,
            child: Icon(Icons.fast_forward_rounded, color: Colors.white, size: 38),
          ),
        ),
        PlateButton(
          active: repeatOn,
          onTap: () {
            HapticFeedback.selectionClick();
            player.toggleRepeat();
          },
          child: Icon(
            player.repeatMode == ZenifyRepeatMode.one
                ? Icons.repeat_one_rounded
                : Icons.repeat_rounded,
            size: 21,
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
              child: const Icon(Icons.equalizer_rounded, size: 24),
            ),
          ),
          PlateButton(
            size: 44,
            active: lyricsOpen,
            onTap: () => _togglePanel(_Panel.lyrics),
            child: Icon(
              lyricsOpen ? Icons.chat_bubble_rounded : Icons.chat_bubble_outline_rounded,
              size: 22,
            ),
          ),
          _fade(
            !lyricsOpen,
            PlateButton(
              size: 44,
              active: _panel == _Panel.queue,
              onTap: () => _togglePanel(_Panel.queue),
              child: const Icon(Icons.queue_music_rounded, size: 24),
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
        duration: const Duration(milliseconds: 240),
        switchInCurve: Curves.easeOutBack,
        transitionBuilder: (c, a) => ScaleTransition(
          scale: Tween<double>(begin: 0.6, end: 1).animate(a),
          child: FadeTransition(opacity: a, child: c),
        ),
        child: Icon(
          playing ? Icons.pause_rounded : Icons.play_arrow_rounded,
          key: ValueKey(playing),
          color: Colors.white,
          size: size,
        ),
      ),
    );
  }
}