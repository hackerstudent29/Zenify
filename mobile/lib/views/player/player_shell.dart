import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/scheduler.dart';
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

const double _kPaused = 0.86; // artwork shrink while paused
const double _kBigR = 14;
const double _kMiniR = 8;
const double _kMiniH = 62;
const double _kMiniSide = 12;
const double _kPillR = 31;

// Springs (critically damped on close so the pill never bounces below itself).
const _kOpenSpring = SpringDescription(mass: 1, stiffness: 190, damping: 24);
const _kCloseSpring = SpringDescription(mass: 1, stiffness: 240, damping: 31);
const _kHideSpring = SpringDescription(mass: 1, stiffness: 260, damping: 30);

enum _Axis { none, x, y }

/// What fills the middle of the open sheet.
enum _Panel { art, lyrics, queue }

/// smoothstep of [x] between [a] and [b].
double _ss(double x, double a, double b) {
  final t = ((x - a) / (b - a)).clamp(0.0, 1.0).toDouble();
  return t * t * (3 - 2 * t);
}

/// Drop this ONCE above your tab bar content:
///
///   Stack(children: [ pages, const Positioned.fill(child: PlayerShell()) ])
///
/// ONE surface morphs between the mini pill and the full-screen player:
///  - Its frame is Rect.lerp(miniPill, screen, t), so the top edge follows the
///    finger 1:1 (travel = distance from pill top to screen top).
///  - Material cross-fades glass -> solid -> artwork mesh, so the glass pill
///    can never show through or "pop" while closing.
///  - Content is laid out at full-screen size and clipped by the surface, so it
///    rides inside the card. The artwork lives in card coordinates, so it can
///    never leave the card.
///  - Text/controls rise from below with a staggered fade, reversed on close.
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

  /// 0 = docked mini pill, 1 = fully open.
  late final AnimationController _sheet = AnimationController.unbounded(vsync: this, value: 0);
  late final AnimationController _pause = AnimationController.unbounded(vsync: this, value: 1);

  /// 0 = big artwork, 1 = artwork docked in the header (lyrics / queue).
  late final AnimationController _dock = AnimationController.unbounded(vsync: this, value: 0);
  late final AnimationController _artX = AnimationController.unbounded(vsync: this, value: 0);
  late final AnimationController _miniX = AnimationController.unbounded(vsync: this, value: 0);

  /// 0 = visible, 1 = slid fully below the screen (docks hidden).
  late final AnimationController _hide =
      AnimationController.unbounded(vsync: this, value: widget.hideMini ? 1 : 0);
  late final Ticker _probe = createTicker((_) => _measure());

  final ValueNotifier<Rect?> _bigRect = ValueNotifier(null);
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
  void didUpdateWidget(covariant PlayerShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.hideMini != widget.hideMini) {
      _drive(_hide, widget.hideMini ? 1 : 0, spring: _kHideSpring);
    }
  }

  @override
  void dispose() {
    _probe.dispose();
    for (final c in [_sheet, _pause, _dock, _artX, _miniX, _hide]) {
      c.dispose();
    }
    _bigRect.dispose();
    super.dispose();
  }

  /// Spring an (unbounded) controller to [to]. Velocity is in value-units / s.
  TickerFuture _drive(
    AnimationController c,
    double to, {
    double velocity = 0,
    required SpringDescription spring,
  }) =>
      c.animateWith(SpringSimulation(spring, c.value, to, velocity));

  /* ───────────────────────── sync with player ───────────────────────── */

  void _syncTrack(dynamic track) {
    final key = '${track.title}|${track.artist}|${track.coverUrl}';
    if (key == _trackKey) return;
    _trackKey = key;
    final url = track.coverUrl as String;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      context.read<QueueState>().syncCurrent(track);
      // swap cover only once decoded → no flash
      try {
        await precacheImage(CachedNetworkImageProvider(url), context);
      } catch (_) {}
      if (!mounted || _trackKey != key) return;
      setState(() => _shownCover = url);
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
    if (!_probe.isActive) _probe.start();
    _drive(_sheet, 1, velocity: velocity, spring: _kOpenSpring);
  }

  void _close({double velocity = 0}) {
    _drive(_sheet, 0, velocity: velocity, spring: _kCloseSpring).then((_) {
      if (!mounted) return;
      _probe.stop();
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
    if (!_dragging) return;
    _sheet.value = (_sheet.value - dy / _travel).clamp(0.0, 1.0);
  }

  void _dragEnd(double vy) {
    // Cancel callbacks can fire without a matching start; ignore those.
    if (!_dragging) return;
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

  /* ───────────────────────── geometry (card coordinates) ───────────────────────── */

  // Mini artwork slot inside the pill, in card coordinates (card x == screen x).
  static const Rect _miniArt = Rect.fromLTWH(_kMiniSide + 14, 9, 44, 44);

  Rect _headerRect(EdgeInsets safe) => Rect.fromLTWH(24, safe.top + 29, 56, 56);

  Rect _fallbackBig(Size s, EdgeInsets safe) {
    final side = math.min(s.width - 48, 360.0);
    return Rect.fromCenter(
      center: Offset(s.width / 2, safe.top + 60 + (s.height * 0.36)),
      width: side,
      height: side,
    );
  }

  void _measure() {
    final region = _regionKey.currentContext?.findRenderObject() as RenderBox?;
    final sheet = _sheetKey.currentContext?.findRenderObject() as RenderBox?;
    if (region == null || sheet == null || !region.hasSize || !sheet.attached) return;
    final off = region.localToGlobal(Offset.zero, ancestor: sheet);
    final side = math
        .min(math.min(region.size.width - 48, region.size.height - 8), 420.0)
        .clamp(160.0, 420.0)
        .toDouble();
    final r = Rect.fromCenter(
      center: off + Offset(region.size.width / 2, region.size.height / 2),
      width: side,
      height: side,
    );
    final cur = _bigRect.value;
    if (cur == null ||
        (cur.center - r.center).distance > 0.5 ||
        (cur.width - r.width).abs() > 0.5) {
      _bigRect.value = r;
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
        if (!_probe.isActive) _probe.start();
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

  /// A cancelled gesture must never skip a track; just settle back.
  void _miniCancel() {
    if (_miniAxis == _Axis.x) {
      _miniX.springTo(0, spring: kSoftSpring);
    } else if (_dragging) {
      _dragEnd(0);
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

  void _artCancel() {
    if (_artAxis == _Axis.x) {
      _artX.springTo(0, spring: kSoftSpring);
    } else if (_artDragging) {
      _artDragging = false;
      _dragEnd(0);
    }
    _artAxis = _Axis.none;
  }

  /* ───────────────────────── actions ───────────────────────── */

  void _goArtist(dynamic track) {
    if (widget.onGoToArtist != null) {
      widget.onGoToArtist!(track);
    } else {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => ArtistScreen(artistName: track.artist as String)),
      );
    }
  }

  void _goAlbum(dynamic track) {
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
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              _close();
              _goArtist(track);
            },
            child: const Text('Go to Artist'),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              _close();
              _goAlbum(track);
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

    final miniTop = size.height - widget.miniBottomOffset - safe.bottom - _kMiniH;
    // Distance the top edge travels, so the card follows the finger 1:1.
    _travel = math.max(260.0, miniTop);

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
          children: [_buildSurface(player, track, size, safe, miniTop)],
        ),
      ),
    );
  }

  /* ───────────────────────── THE MORPHING SURFACE ───────────────────────── */

  Widget _buildSurface(
    PlayerState player,
    dynamic track,
    Size size,
    EdgeInsets safe,
    double miniTop,
  ) {
    // Built once per state change; the per-frame builder below only moves it.
    final content = _content(player, track, size, safe);
    final mini = Rect.fromLTWH(_kMiniSide, miniTop, size.width - 2 * _kMiniSide, _kMiniH);
    final full = Offset.zero & size;

    return AnimatedBuilder(
      animation: Listenable.merge([_sheet, _hide]),
      child: content,
      builder: (context, child) {
        final t = _sheet.value.clamp(0.0, 1.0).toDouble();
        final hide = _hide.value.clamp(0.0, 1.0).toDouble() * (1 - t);

        var rect = Rect.lerp(mini, full, t)!;
        if (hide > 0) {
          rect = rect.shift(Offset(0, hide * (size.height - miniTop + 24)));
        }

        // Pill radius holds while it is a card, then flattens at the top.
        final br = BorderRadius.circular(_kPillR * (1 - _ss(t, 0.55, 1.0)));

        // Material crossfade: glass -> solid -> artwork mesh.
        final glassA = 1 - _ss(t, 0.0, 0.30);
        final baseA = 0.40 + 0.60 * _ss(t, 0.0, 0.35); // 0.40 == the old 0x66 tint
        final shadowA = 0.45 * (1 - _ss(t, 0.0, 0.5));

        return Positioned.fromRect(
          rect: rect,
          child: IgnorePointer(
            ignoring: hide > 0.5,
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: br,
                boxShadow: shadowA > 0.002
                    ? [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: shadowA),
                          blurRadius: 28,
                          offset: const Offset(0, 8),
                        ),
                      ]
                    : null,
              ),
              child: ClipRRect(
                borderRadius: br,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    // Blur only while the base is still translucent. Once the
                    // base is opaque it is invisible anyway, so drop the cost.
                    if (t < 0.37)
                      BackdropFilter(
                        filter: ui.ImageFilter.blur(sigmaX: 28, sigmaY: 28),
                        child: const SizedBox.expand(),
                      ),
                    ColoredBox(color: const Color(0xFF18181C).withValues(alpha: baseA)),
                    IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.white.withValues(alpha: 0.14 * glassA),
                              Colors.white.withValues(alpha: 0.02 * glassA),
                            ],
                          ),
                        ),
                      ),
                    ),
                    // Content is laid out at full-screen size and clipped by the
                    // card, so it rides with the top edge instead of squashing.
                    OverflowBox(
                      alignment: Alignment.topCenter,
                      minWidth: size.width,
                      maxWidth: size.width,
                      minHeight: size.height,
                      maxHeight: size.height,
                      child: child,
                    ),
                    IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: br,
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.18 * glassA),
                            width: 0.8,
                          ),
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

  /// Everything that lives inside the card, in card (== screen at t=1) coords.
  Widget _content(PlayerState player, dynamic track, Size size, EdgeInsets safe) {
    return Stack(
      key: _sheetKey,
      clipBehavior: Clip.none,
      children: [
        if (_open) ...[
          Positioned.fill(
            key: const ValueKey('mesh'),
            child: _SheetFade(
              t: _sheet,
              a: 0.06,
              b: 0.5,
              child: RepaintBoundary(
                child: ArtworkMeshBackground(
                  coverUrl: track?.coverUrl,
                  fallbackAsset: 'assets/images/z_logo.png',
                  paused: !player.isPlaying,
                  backgroundColor: _palette.isNotEmpty ? _palette.first : null,
                ),
              ),
            ),
          ),
          // soft scrim keeps lyrics / queue text readable
          Positioned.fill(
            key: const ValueKey('scrim'),
            child: IgnorePointer(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 450),
                curve: Curves.easeOutCubic,
                color: Colors.black.withValues(alpha: _docked ? 0.26 : 0),
              ),
            ),
          ),
        ],
        Positioned(
          key: const ValueKey('mini'),
          left: _kMiniSide,
          top: 0,
          width: size.width - 2 * _kMiniSide,
          height: _kMiniH,
          child: _miniLayer(player, track),
        ),
        if (_open)
          Positioned.fill(
            key: const ValueKey('column'),
            child: _sheetColumn(player, track, safe),
          ),
        _artLayer(size, safe),
      ],
    );
  }

  /* ───────────────────────── MINI CONTENT (fades out first) ───────────────────────── */

  Widget _miniLayer(PlayerState player, dynamic track) {
    return IgnorePointer(
      ignoring: _open,
      child: AnimatedBuilder(
        animation: _sheet,
        child: _miniBody(player, track),
        builder: (_, c) {
          final p = 1 - _ss(_sheet.value.clamp(0.0, 1.0).toDouble(), 0.0, 0.16);
          return Opacity(
            opacity: p,
            child: Transform.translate(offset: Offset(0, -8 * (1 - p)), child: c),
          );
        },
      ),
    );
  }

  Widget _miniBody(PlayerState player, dynamic track) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _openSheet(),
      onPanStart: _miniStart,
      onPanUpdate: _miniUpdate,
      onPanEnd: _miniEnd,
      onPanCancel: _miniCancel,
      child: Stack(
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 14, right: 8),
            child: Row(
              children: [
                Expanded(
                  child: AnimatedBuilder(
                    animation: _miniX,
                    builder: (_, child) => Transform.translate(offset: Offset(_miniX.value, 0), child: child),
                    child: Row(
                      children: [
                        const SizedBox(width: 44, height: 44), // artwork lives in the art layer
                        const SizedBox(width: 12),
                        Expanded(child: _miniText(track)),
                      ],
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
                final total = player.duration.inMilliseconds.toDouble().clamp(1.0, double.infinity);
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
        SwapText(
          track.artist as String,
          dir: _dir,
          delay: 0.2,
          style: TextStyle(
            color: Colors.white.withValues(alpha: 0.6),
            fontSize: 12.5,
            height: 16 / 12.5,
          ),
        ),
      ],
    );
  }

  /* ───────────────────────── MORPHING ARTWORK (inside the card) ───────────────────────── */

  Widget _artLayer(Size size, EdgeInsets safe) {
    return AnimatedBuilder(
      key: const ValueKey('art'),
      animation: Listenable.merge([_sheet, _pause, _dock, _artX, _bigRect]),
      builder: (context, _) {
        final t = _sheet.value.clamp(0.0, 1.0).toDouble();
        final l = _dock.value.clamp(0.0, 1.0).toDouble();

        // Positions are in CARD coordinates and the card top moves with the
        // finger, so no easing can ever push the artwork outside the card.
        // The ease only makes it grow a touch later than the card, so it
        // never feels like it outruns the sheet.
        final ta = Curves.easeInOutCubic.transform(t);

        final big = _bigRect.value ?? _fallbackBig(size, safe);
        final openRect = Rect.lerp(big, _headerRect(safe), l)!;

        // paused shrink fades smoothly as the artwork docks
        final k0 = ui.lerpDouble(_pause.value, 1, l)!;
        final kEff = 1 - (1 - k0) * t;

        var r = Rect.lerp(_miniArt, openRect, ta)!;
        r = Rect.fromCenter(center: r.center, width: r.width * kEff, height: r.height * kEff);
        r = r.shift(Offset(_artX.value * t, 0));

        final radius = ui.lerpDouble(_kMiniR, ui.lerpDouble(_kBigR, 10, l)!, ta)!;
        final shadow = ta * ta * (1 - l * 0.6);
        final url = _shownCover ?? '';

        Widget art = DecoratedBox(
          decoration: BoxDecoration(
            color: const Color(0xFF27272A),
            borderRadius: BorderRadius.circular(radius),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.5 * shadow),
                blurRadius: 48 * ta,
                offset: Offset(0, 24 * ta),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(radius),
            child: _artSwitcher(url),
          ),
        );

        if (_open) {
          art = GestureDetector(
            behavior: HitTestBehavior.opaque,
            // tap big art → lyrics; tap docked art → back to the big artwork
            onTap: () => _setPanel(_docked ? _Panel.art : _Panel.lyrics),
            onPanStart: _artStart,
            onPanUpdate: _artUpdate,
            onPanEnd: _artEnd,
            onPanCancel: _artCancel,
            child: art,
          );
        }
        return Positioned.fromRect(
          rect: r,
          child: IgnorePointer(ignoring: !_open, child: art),
        );
      },
    );
  }

  Widget _artSwitcher(String url) {
    final child = KeyedSubtree(key: ValueKey('art-$url'), child: CoverImage(url));
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 420),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeOutCubic,
      layoutBuilder: (cur, prev) => Stack(
        fit: StackFit.expand,
        children: [...prev, ?cur],
      ),
      transitionBuilder: (c, anim) {
        final entering = c.key == child.key;
        return FadeTransition(
          opacity: anim,
          child: SlideTransition(
            position: Tween<Offset>(
              begin: Offset((entering ? _dir : -_dir) * 0.18, 0),
              end: Offset.zero,
            ).animate(anim),
            child: ScaleTransition(
              scale: Tween<double>(begin: entering ? 1.04 : 0.98, end: 1).animate(anim),
              child: c,
            ),
          ),
        );
      },
      child: child,
    );
  }

  /* ───────────────────────── FULL PLAYER CONTENT ───────────────────────── */

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

  Widget _panelBody() {
    switch (_panel) {
      case _Panel.art:
        return const SizedBox.shrink(key: ValueKey('art'));
      case _Panel.lyrics:
        return KeyedSubtree(
          // new key per track → lyrics cross-fade when the song changes
          key: ValueKey('lyrics-$_trackKey'),
          child: NotificationListener<ScrollNotification>(
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
            child: _edgeFade(widget.lyricsBuilder?.call(context) ?? const LyricsSheet()),
          ),
        );
      case _Panel.queue:
        return KeyedSubtree(
          key: const ValueKey('queue'),
          child: NotificationListener<ScrollNotification>(
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

  /// Each block rises from below with a fade, staggered top to bottom on open
  /// and in reverse on close (they are all driven by the same sheet value).
  Widget _sheetColumn(PlayerState player, dynamic track, EdgeInsets safe) {
    final isArt = _panel == _Panel.art;
    final isLyrics = _panel == _Panel.lyrics;

    return IgnorePointer(
      ignoring: !_open,
      child: Column(
        children: [
          // Grabber (drag down or tap to close)
          _Rise(
            t: _sheet,
            a: 0.15,
            b: 0.5,
            dy: 16,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _close,
              onPanStart: (_) => _dragStart(),
              onPanUpdate: (d) => _dragUpdate(d.delta.dy),
              onPanEnd: (d) => _dragEnd(d.velocity.pixelsPerSecond.dy),
              onPanCancel: () => _dragEnd(0),
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
          ),

          // Compact header (lyrics / queue): artwork docks here
          _Rise(
            t: _sheet,
            a: 0.3,
            b: 0.7,
            dy: 24,
            child: _collapse(_docked, _compactHeader(track)),
          ),

          // Middle region. The measured box sits OUTSIDE the rise transform so
          // the artwork's target rect never wobbles while the sheet opens.
          Expanded(
            child: SizedBox.expand(
              key: _regionKey,
              child: _Rise(
                t: _sheet,
                a: 0.3,
                b: 0.8,
                dy: 36,
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
                    child: _panelBody(),
                  ),
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
                  _Rise(
                    t: _sheet,
                    a: 0.38,
                    b: 0.78,
                    dy: 44,
                    child: _collapse(isArt, _metaRow(track)),
                  ),
                  _Rise(
                    t: _sheet,
                    a: 0.46,
                    b: 0.86,
                    dy: 52,
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 420),
                        child: ScrubberSlider(
                          positionNotifier: player.positionNotifier,
                          duration: player.duration,
                          onSeek: (pos) => player.seek(pos),
                        ),
                      ),
                    ),
                  ),
                  // transport hides only while lyrics are open
                  _Rise(
                    t: _sheet,
                    a: 0.54,
                    b: 0.94,
                    dy: 60,
                    child: _collapse(
                      !isLyrics,
                      Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 420),
                          child: Padding(
                            padding: const EdgeInsets.only(top: 12, bottom: 20),
                            child: _transport(player),
                          ),
                        ),
                      ),
                    ),
                  ),
                  _Rise(
                    t: _sheet,
                    a: 0.62,
                    b: 1.0,
                    dy: 68,
                    child: AnimatedPadding(
                      duration: const Duration(milliseconds: 380),
                      curve: Curves.easeOutCubic,
                      padding: EdgeInsets.only(top: isLyrics ? 14 : 0),
                      child: _tools(isLyrics),
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

  /// Smoothly collapses / expands a block (height + fade + tiny rise).
  Widget _collapse(bool show, Widget child) {
    return AnimatedSize(
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
      alignment: Alignment.topCenter,
      child: ClipRect(
        child: Align(
          alignment: Alignment.topCenter,
          heightFactor: show ? 1 : 0,
          child: AnimatedOpacity(
            duration: const Duration(milliseconds: 280),
            opacity: show ? 1 : 0,
            child: AnimatedSlide(
              duration: const Duration(milliseconds: 380),
              curve: Curves.easeOutCubic,
              offset: show ? Offset.zero : const Offset(0, 0.12),
              child: IgnorePointer(ignoring: !show, child: child),
            ),
          ),
        ),
      ),
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
      onPanCancel: () => _dragEnd(0),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
        child: Row(
          children: [
            const SizedBox(width: 56, height: 56), // artwork flies in here
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
                  SwapText(
                    track.artist as String,
                    dir: _dir,
                    delay: 0.2,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.6),
                      fontSize: 15,
                      height: 20 / 15,
                    ),
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
                    _goAlbum(track);
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
                GestureDetector(
                  onTap: () {
                    _close();
                    _goArtist(track);
                  },
                  child: SwapText(
                    track.artist as String,
                    dir: _dir,
                    delay: 0.22,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.75),
                      fontSize: 17,
                      height: 22 / 17,
                    ),
                  ),
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
/*  Scroll-linked helpers                                               */
/* ------------------------------------------------------------------ */

/// Fades [child] in between sheet progress [a]..[b].
class _SheetFade extends StatelessWidget {
  const _SheetFade({required this.t, required this.a, required this.b, required this.child});
  final Animation<double> t;
  final double a, b;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: t,
      child: child,
      builder: (_, c) {
        final p = _ss(t.value.clamp(0.0, 1.0).toDouble(), a, b);
        return p >= 1 ? c! : Opacity(opacity: p, child: c);
      },
    );
  }
}

/// Rises from [dy] px below while fading in between sheet progress [a]..[b].
/// Driven by the same value as the sheet, so closing plays it in reverse and
/// dragging scrubs it 1:1.
class _Rise extends StatelessWidget {
  const _Rise({
    required this.t,
    required this.a,
    required this.b,
    required this.dy,
    required this.child,
  });
  final Animation<double> t;
  final double a, b, dy;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: t,
      child: child,
      builder: (_, c) {
        final p = _ss(t.value.clamp(0.0, 1.0).toDouble(), a, b);
        if (p >= 1) return c!;
        return Opacity(
          opacity: p,
          child: Transform.translate(offset: Offset(0, (1 - p) * dy), child: c),
        );
      },
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