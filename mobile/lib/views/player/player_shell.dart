import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter, lerpDouble;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/zen.dart' hide SpringCurve;
import '../../design_system/widgets/apple_glass.dart';
import '../../design_system/widgets/artwork_mesh_background.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/scrubber_slider.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../services/player_state.dart';
import '../../services/queue_state.dart';
import '../lyrics/lyrics_sheet.dart';
import 'player_kit.dart';
import 'queue_panel.dart';
import 'studio_fx_sheet.dart';
import '../details/artist_screen.dart';
import '../details/album_screen.dart';
import '../../design_system/widgets/interactive_artists_text.dart';
import '../../design_system/widgets/media_navigation_sheet.dart';
import '../../models/track.dart';
import '../../utils/media_normalizer.dart';

const double _kPaused = 0.86; // artwork shrink while paused
const double _kMiniH = 58;
const double _kMiniArt = 40;

/// Artwork corner radii (visual points, independent of the morph scale).
const double _kRadiusMini = 6;
const double _kRadiusBig = 10;
const double _kRadiusDocked = 7;

/// Lyrics open + no touch for this long → the bottom controls glide away.
const Duration _kIdleHide = Duration(seconds: 3);

/// While the sheet closes with the cover docked in the header, the cover rides
/// the header down until the sheet is this far open, then settles into the mini
/// player. (Same path is retraced when opening.)
const double _kRideEnd = 0.4;

/// Cover docking spring (art <-> header). Critically damped: no bounce.
const SpringDescription _kDockSpring = SpringDescription(
  mass: 1,
  stiffness: 520,
  damping: 46,
);

/// Sheet close spring. Stiff + critically damped so closing feels instant.
const SpringDescription _kCloseSpring = SpringDescription(
  mass: 1,
  stiffness: 520,
  damping: 46,
);

/// Sheet open spring. Slightly softer than close, tiny settle, like iOS.
const SpringDescription _kOpenSpring = SpringDescription(
  mass: 1,
  stiffness: 430,
  damping: 38,
);

/// Button press: fast, no overshoot. Release: lively bounce back.
const SpringDescription _kPressSpring = SpringDescription(
  mass: 1,
  stiffness: 700,
  damping: 40,
);
const SpringDescription _kReleaseSpring = SpringDescription(
  mass: 1,
  stiffness: 420,
  damping: 15,
);

/// Heavy lyrics/queue body mounts almost immediately after the cover starts
/// flying to the header.
const Duration _kMountDelay = Duration(milliseconds: 70);

/// The mini player pill is fully gone once the sheet is this far open.
const double _kMiniFadeSpan = 0.22;

enum _Axis { none, x, y }

/// What fills the middle of the open sheet.
enum _Panel { art, lyrics, queue }

/// Drop this ONCE above your tab bar content:
///
///   Stack(children: [ pages, const Positioned.fill(child: PlayerShell()) ])
///
/// Motion model (all springs):
///  • `_sheet`  0 = docked mini, 1 = fully open.
///  • `_dock`   0 = big artwork, 1 = artwork docked top-left in the header.
///    The title / seek / transport block is laid out by a layout delegate that
///    follows `_dock`: right under the artwork in art mode, glued above the
///    last button row in lyrics / queue mode.
///  • `_chrome` 0 = bottom controls shown, 1 = hidden (lyrics idle). Hiding
///    NEVER changes layout (only opacity, offset and blur).
///  • ONE artwork widget lives in an overlay, laid out once at the big size and
///    moved/scaled with a matrix between mini → big → header. When docked it
///    rides the header, so closing the sheet from lyrics mode is the exact
///    mirror of opening it.
class PlayerShell extends StatefulWidget {
  static final ValueNotifier<bool> isPlayerOpenNotifier = ValueNotifier<bool>(
    false,
  );
  static final ValueNotifier<int> openRequestNotifier = ValueNotifier<int>(0);

  /// Requests any mounted [PlayerShell] to expand smoothly to the full-screen
  /// Now Playing sheet (e.g., when the user taps a YouTube video card).
  static void requestOpen() {
    openRequestNotifier.value++;
  }

  const PlayerShell({
    super.key,
    this.hideMini = false,
    this.miniBottomOffset = 76,
    this.dockProgress = 1.0,
    this.lyricsBuilder,
    this.onGoToArtist,
    this.onGoToAlbum,
  });

  final bool hideMini;
  final double dockProgress;

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
  void openSheet({double velocity = 0}) => _openSheet(velocity: velocity);

  late final AnimationController _sheet;
  late final AnimationController _pause;
  late final AnimationController _dock;
  late final AnimationController _chrome;
  late final AnimationController _artX;
  late final AnimationController _miniX;
  late final AnimationController _press;

  _Panel _bodyPanel = _Panel.art; // what is actually mounted in the middle
  Timer? _mountTimer;

  final GlobalKey _regionKey = GlobalKey();
  final GlobalKey _sheetKey = GlobalKey();

  // bumped on every skip so the prev / next icons can nudge with a spring
  final ValueNotifier<int> _prevPulse = ValueNotifier<int>(0);
  final ValueNotifier<int> _nextPulse = ValueNotifier<int>(0);

  static _Panel _preferredMode = _Panel.art;
  bool _open = false;
  _Panel _panel = _Panel.art;
  bool _dragging = false;
  bool _startedClosed = true;
  bool? _wasPlaying;
  int _dir = 1;
  double _travel = 700;

  // idle-hide of the bottom controls while lyrics are open
  Timer? _idleTimer;
  bool _chromeHidden = false;
  final ValueNotifier<bool> _lyricsImmersive = ValueNotifier<bool>(false);
  int _activePointers = 0;
  DateTime? _lastBump;

  // measured rect (in sheet coordinates) the big artwork rests in
  Rect? _bigRect;
  Object? _bigRectKey;
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

  Color get _seekTint =>
      Color.lerp(
        Colors.white,
        _palette.isNotEmpty ? _palette.first : Colors.white,
        0.35,
      ) ??
      Colors.white;

  // values picked with context.select in build() so the shell only rebuilds
  // when something it actually shows changes (not on every PlayerState tick)
  bool _playing = false;
  bool _isVideo = false;
  dynamic _duration;

  // gesture state
  _Axis _miniAxis = _Axis.none;
  Offset _miniAcc = Offset.zero;
  _Axis _artAxis = _Axis.none;
  Offset _artAcc = Offset.zero;
  bool _artDragging = false;

  @override
  void initState() {
    super.initState();
    _sheet = AnimationController.unbounded(vsync: this, value: 0);
    _pause = AnimationController.unbounded(vsync: this, value: 1);
    _dock = AnimationController.unbounded(vsync: this, value: 0);
    _chrome = AnimationController.unbounded(vsync: this, value: 0);
    _artX = AnimationController.unbounded(vsync: this, value: 0);
    _miniX = AnimationController.unbounded(vsync: this, value: 0);
    _press = AnimationController.unbounded(vsync: this, value: 1);
    PlayerShell.openRequestNotifier.addListener(_onOpenRequested);
  }

  void _onOpenRequested() {
    if (!mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !isOpen) {
        _openSheet();
      }
    });
  }

  @override
  void dispose() {
    PlayerShell.openRequestNotifier.removeListener(_onOpenRequested);
    _idleTimer?.cancel();
    _mountTimer?.cancel();
    _lyricsImmersive.dispose();
    _prevPulse.dispose();
    _nextPulse.dispose();
    for (final c in [_sheet, _pause, _dock, _chrome, _artX, _miniX, _press]) {
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
    // Follow the user's active player mode (e.g. lyrics mode) for the next song too
    if (_open && _preferredMode == _Panel.lyrics && _panel != _Panel.lyrics) {
      _panel = _Panel.lyrics;
      _bodyPanel = _Panel.lyrics;
      _dock.value = 1.0;
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
      final t = context.read<PlayerState>().currentTrack;
      final browseId =
          (t != null && t.artists.isNotEmpty && t.artists.first.id.isNotEmpty)
          ? t.artists.first.id
          : null;
      Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) =>
              ArtistScreen(artistName: artistName, browseId: browseId),
        ),
      );
    }
  }

  void _openAlbum(dynamic track) {
    _close();
    if (widget.onGoToAlbum != null) {
      widget.onGoToAlbum!(track);
    } else {
      final t = track is Track ? track : null;
      Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) => AlbumScreen(
            albumTitle: (track?.album as String?)?.isNotEmpty == true
                ? (t != null
                      ? t.album
                      : MediaNormalizer.cleanAlbumTitle(
                          track?.album?.toString(),
                        ))
                : (t != null
                      ? t.title
                      : MediaNormalizer.cleanTitle(track?.title?.toString())),
            artistName: t != null
                ? t.artist
                : MediaNormalizer.formatArtists(track?.artist?.toString()),
            coverUrl: track?.coverUrl as String?,
            browseId: t?.albumBrowseId,
            initialTracks: t != null ? [t] : null,
          ),
        ),
      );
    }
  }

  void _showMediaNavigationSheet(dynamic track) {
    final effectiveTrack = track is Track
        ? track
        : (context.read<PlayerState>().currentTrack ??
              Track(
                id: track?.id?.toString() ?? '',
                title: track?.title?.toString() ?? '',
                artist: track?.artist?.toString() ?? '',
                album: track?.album?.toString() ?? '',
                coverUrl: track?.coverUrl?.toString() ?? '',
              ));

    MediaNavigationSheet.show(context: context, track: effectiveTrack);
  }

  dynamic _artistsOf(dynamic track) => track is Track
      ? track.resolvedArtists
      : (track?.artist?.toString() ?? '');

  /* ───────────────────────── transport (queue aware) ───────────────────────── */

  void _next() {
    _dir = 1;
    _nextPulse.value++;
    context.read<PlayerState>().next(source: 'manual');
  }

  void _prev() {
    _dir = -1;
    _prevPulse.value++;
    context.read<PlayerState>().previous();
  }

  void _jumpTo(QueueEntry e) {
    _dir = 1;
    context.read<PlayerState>().jumpTo(e);
  }

  void _playHistory(QueueEntry e) {
    _dir = -1;
    context.read<PlayerState>().playFromHistory(e);
  }

  /* ───────────────────────── sheet motion ───────────────────────── */

  void _openSheet({double velocity = 0}) {
    HapticFeedback.lightImpact();
    PlayerShell.isPlayerOpenNotifier.value = true;
    final restoreLyrics = _preferredMode == _Panel.lyrics;
    if (!_open) {
      setState(() {
        _open = true;
        if (restoreLyrics) {
          // cover + header + controls start flying to their lyrics-mode spots
          // immediately; the heavy lyrics body mounts a beat later so the
          // opening spring never drops a frame.
          _panel = _Panel.lyrics;
          _bodyPanel = _Panel.art;
          _dock.value = 1.0;
        }
      });
      if (restoreLyrics) {
        _mountTimer?.cancel();
        _mountTimer = Timer(const Duration(milliseconds: 140), () {
          if (mounted && _panel == _Panel.lyrics) {
            setState(() => _bodyPanel = _Panel.lyrics);
          }
        });
        _activePointers = 0;
        _bumpIdle(force: true);
      }
    }
    _sheet.springTo(1, spring: _kOpenSpring, velocity: velocity);
  }

  void _close({double velocity = 0}) {
    PlayerShell.isPlayerOpenNotifier.value = false;
    if (!_open && _sheet.value <= 0.001) return;
    _idleTimer?.cancel();
    _mountTimer?.cancel();

    // Bring the controls back immediately so they travel down with the sheet
    // instead of popping in or staying invisible mid-close. The cover is NOT
    // touched: it stays docked and rides the header down (see overlay).
    _chromeHidden = false;
    _lyricsImmersive.value = false;
    if (_chrome.value != 0) _chrome.springTo(0, spring: kSnappySpring);

    _sheet.springTo(0, spring: _kCloseSpring, velocity: velocity).then((_) {
      PlayerShell.isPlayerOpenNotifier.value = false;
      if (!mounted) return;
      _dock.value = 0;
      _chrome.value = 0;
      _chromeHidden = false;
      _lyricsImmersive.value = false;
      _activePointers = 0;
      _artX.value = 0;
      setState(() {
        _open = false;
        _panel = _Panel.art;
        _bodyPanel = _Panel.art;
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
    if (_sheet.value > 0.08 && !PlayerShell.isPlayerOpenNotifier.value) {
      PlayerShell.isPlayerOpenNotifier.value = true;
    }
  }

  void _dragEnd(double vy) {
    _dragging = false;
    final vt = -vy / _travel; // t / second, + = opening
    final t = _sheet.value;
    final bool target;
    if (vy < -40 ||
        vt > 0.06 ||
        (_startedClosed && (t > 0.03 || _miniAcc.dy < -18))) {
      target = true;
    } else if (vy > 120 || vt < -0.15) {
      target = false;
    } else {
      target = _startedClosed ? t > 0.20 : t > 0.65;
    }
    target ? _openSheet(velocity: vt) : _close(velocity: vt);
  }

  /* ───────────────────────── panels (art / lyrics / queue) ───────────────────────── */

  void _setPanel(_Panel p) {
    if (p == _Panel.lyrics || p == _Panel.art) {
      _preferredMode = p;
    }
    if (_panel == p) return;
    HapticFeedback.selectionClick();
    _mountTimer?.cancel();

    final immediate = p == _Panel.art || _bodyPanel != _Panel.art;
    setState(() {
      _panel = p;
      if (immediate) _bodyPanel = p;
    });
    if (!immediate) {
      _mountTimer = Timer(_kMountDelay, () {
        if (mounted && _panel == p) setState(() => _bodyPanel = p);
      });
    }

    _dock
        .springTo(
          p == _Panel.art ? 0 : 1,
          spring: _kDockSpring,
          velocity: _dock.velocity, // interruptible, no dead stop
        )
        .then((_) => _queueMeasure());
    if (p == _Panel.lyrics) {
      _activePointers = 0;
      _bumpIdle(force: true);
    } else {
      _idleTimer?.cancel();
      _chromeHidden = false;
      _lyricsImmersive.value = false;
      if (_chrome.value != 0) _chrome.springTo(0, spring: kSnappySpring);
    }
  }

  void _togglePanel(_Panel p) => _setPanel(_panel == p ? _Panel.art : p);

  /* ───────────── idle hide of the bottom controls (lyrics only) ───────────── */

  void _bumpIdle({bool force = false}) {
    if (_panel != _Panel.lyrics) return;
    if (_chromeHidden || _chrome.value > 0.01) {
      _chromeHidden = false;
      _lyricsImmersive.value = false;
      if (_chrome.value != 0) _chrome.springTo(0, spring: kSnappySpring);
    } else if (!force) {
      final last = _lastBump;
      if (last != null &&
          DateTime.now().difference(last) < const Duration(milliseconds: 200)) {
        return; // pointer-move events are frequent: don't re-arm every one
      }
    }
    _lastBump = DateTime.now();
    _idleTimer?.cancel();
    _idleTimer = Timer(_kIdleHide, _hideChrome);
  }

  void _hideChrome() {
    if (!mounted || _panel != _Panel.lyrics) return;
    if (_dragging || _activePointers > 0) {
      _idleTimer = Timer(const Duration(seconds: 1), _hideChrome);
      return;
    }
    _chromeHidden = true;
    _lyricsImmersive.value = true;
    _chrome.springTo(1, spring: kSoftSpring);
  }

  void _pointerReleased() {
    _activePointers = math.max(0, _activePointers - 1);
    _bumpIdle(force: true);
  }

  /* ───────────── measuring where the big artwork rests ───────────── */

  void _queueMeasure() {
    if (_measureQueued || !mounted) return;
    _measureQueued = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => _measureArt());
  }

  /// Measures once per screen metrics; never re-measures mid-animation.
  void _measureArt() {
    _measureQueued = false;
    if (!mounted ||
        !_open ||
        _panel != _Panel.art ||
        _dock.value.abs() > 0.01) {
      return;
    }
    final mq = MediaQuery.of(context);
    final key = Object.hash(
      mq.size.width,
      mq.size.height,
      mq.padding.top,
      mq.padding.bottom,
      mq.textScaler.scale(14),
    );
    if (_bigRect != null && key == _bigRectKey) return;

    final r = _regionKey.currentContext?.findRenderObject();
    final s = _sheetKey.currentContext?.findRenderObject();
    if (r is! RenderBox || s is! RenderBox) return;
    if (!r.attached || !s.attached || !r.hasSize || !s.hasSize) return;
    final tl = r.localToGlobal(Offset.zero, ancestor: s);
    final side = math
        .min(mq.size.width - 56, r.size.height - 24)
        .clamp(100.0, 380.0)
        .toDouble();
    _bigRectKey = key;
    setState(() {
      _bigRect = Rect.fromLTWH(
        (mq.size.width - side) / 2, // always centred on screen
        tl.dy + 20, // near the top: the controls now sit right under the cover
        side,
        side,
      );
    });
  }

  Rect _bigOrFallback(Size size, EdgeInsets safe) {
    final fs = math.min(size.width - 56, 380.0);
    return _bigRect ??
        Rect.fromLTWH((size.width - fs) / 2, safe.top + 56, fs, fs);
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
      if (_miniAcc.distance < 4) return;
      _miniAxis = _miniAcc.dx.abs() > _miniAcc.dy.abs() ? _Axis.x : _Axis.y;
      if (_miniAxis == _Axis.y) {
        _dragStart();
        if (!_open) setState(() => _open = true);
        _dragUpdate(_miniAcc.dy);
        return;
      }
    }
    if (_miniAxis == _Axis.x) {
      _miniX.value += d.delta.dx * 0.8;
    } else if (_miniAxis == _Axis.y) {
      if (!_dragging) {
        _dragStart();
        if (!_open) setState(() => _open = true);
      }
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
    } else if (_dragging || _miniAxis == _Axis.y) {
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
    if (track == null) return;
    final Track t = track is Track
        ? track
        : Track(
            id: track.id?.toString() ?? '',
            title: track.title?.toString() ?? '',
            artist: track.artist?.toString() ?? '',
            album: track.album?.toString() ?? '',
            coverUrl: track.coverUrl?.toString() ?? '',
            durationSeconds: track.durationSeconds is int
                ? track.durationSeconds as int
                : 0,
          );
    ZenDropdown.showTrackMenu(
      context: context,
      track: t,
      onGoToArtist: () => _openArtist(t.artist),
      onGoToAlbum: () => _openAlbum(t),
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
    final track = context.select<PlayerState, dynamic>((p) => p.currentTrack);
    if (track == null) return const SizedBox.shrink();
    _playing = context.select<PlayerState, bool>((p) => p.isPlaying);
    _isVideo = context.select<PlayerState, bool>((p) => p.isCurrentVideo);
    _duration = context.select<PlayerState, dynamic>((p) => p.duration);
    final player = context.read<PlayerState>();

    _syncTrack(track);
    _syncPlaying(_playing);

    final mq = MediaQuery.of(context);
    final size = mq.size;
    final safe = mq.padding;
    _travel = size.height * 0.9; // sheet follows the finger almost 1:1
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
            _buildArtOverlay(player, track, size, safe),
          ],
        ),
      ),
    );
  }

  /* ───────────────────────── MINI PLAYER (Apple Music glass pill) ───────────────────────── */

  double _miniOpacity(double t) {
    final x = (t / _kMiniFadeSpan).clamp(0.0, 1.0);
    return 1 - x * x * (3 - 2 * x);
  }

  Widget _buildMini(PlayerState player, dynamic track, EdgeInsets safe) {
    final dp = widget.dockProgress.clamp(0.0, 1.0);
    final miniLeft = lerpDouble(76.0, 16.0, dp)!;
    final miniRight = lerpDouble(76.0, 16.0, dp)!;
    final miniH = lerpDouble(52.0, _kMiniH, dp)!;
    final miniArt = lerpDouble(36.0, _kMiniArt, dp)!;
    final miniRadius = lerpDouble(26.0, 29.0, dp)!;
    final padH = lerpDouble(8.0, 9.0, dp)!;

    final pill = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _openSheet(),
      onPanStart: _miniStart,
      onPanUpdate: _miniUpdate,
      onPanEnd: _miniEnd,
      onPanCancel: () => _miniEnd(DragEndDetails()),
      child: AppleGlass(
        borderRadius: BorderRadius.circular(miniRadius),
        child: Padding(
          padding: EdgeInsets.fromLTRB(padH, 0, 4, 0),
          child: Row(
            children: [
              Expanded(
                child: AnimatedBuilder(
                  animation: _miniX,
                  builder: (_, _) => Transform.translate(
                    offset: Offset(_miniX.value, 0),
                    child: Row(
                      children: [
                        DecoratedBox(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(_kRadiusMini),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.28),
                                blurRadius: 8,
                                offset: const Offset(0, 2),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(_kRadiusMini),
                            child: SizedBox(
                              width: miniArt,
                              height: miniArt,
                              child: _TrackMediaView(
                                player: player,
                                coverUrl: (track.coverUrl as String?) ?? '',
                                isVideo: _isVideo,
                                videoFit: BoxFit.cover,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: RightEdgeFade(child: _miniText(track, dp)),
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
                  width: lerpDouble(38.0, 46.0, dp)!,
                  height: lerpDouble(38.0, 46.0, dp)!,
                  child: _PlayGlyph(
                    playing: _playing,
                    size: lerpDouble(22.0, 28.0, dp)!,
                  ),
                ),
              ),
              ClipRect(
                child: Align(
                  alignment: Alignment.centerRight,
                  widthFactor: dp,
                  child: Opacity(
                    opacity: dp,
                    child: PressableScale(
                      onTap: _next,
                      scale: 0.88,
                      child: SizedBox(
                        width: 46,
                        height: 46,
                        child: Center(
                          child: SpringPop(
                            pulse: _nextPulse,
                            dx: 8,
                            scale: 0.14,
                            child: const Icon(
                              CupertinoIcons.forward_fill,
                              color: Colors.white,
                              size: 28,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    return Positioned(
      left: miniLeft,
      right: miniRight,
      bottom: widget.miniBottomOffset + safe.bottom,
      height: miniH,
      child: AnimatedSlide(
        offset: widget.hideMini ? const Offset(0, 1.8) : Offset.zero,
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
        child: AnimatedOpacity(
          opacity: widget.hideMini ? 0.0 : 1.0,
          duration: const Duration(milliseconds: 200),
          child: AnimatedBuilder(
            animation: _sheet,
            child: pill,
            builder: (_, child) {
              final t = _sheet.value.clamp(0.0, 1.0);
              final o = _miniOpacity(t);
              return IgnorePointer(
                ignoring: widget.hideMini || (!_dragging && t > 0.3),
                child: Opacity(
                  opacity: o,
                  child: Transform.scale(
                    scale: 1 - 0.04 * (1 - o),
                    child: child,
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _miniText(dynamic track, double dp) {
    final titleSize = lerpDouble(13.5, 15.0, dp)!;
    final artistSize = lerpDouble(11.5, 13.5, dp)!;

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SwapText(
          track is Track
              ? track.compactTitle
              : MediaNormalizer.cleanCompactTitle(track?.title?.toString()),
          dir: _dir,
          style: TextStyle(
            fontFamily: 'SF Pro',
            color: Colors.white,
            fontSize: titleSize,
            height: 1.2,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.2,
          ),
        ),
        InteractiveArtistsText(
          artists: _artistsOf(track),
          style: TextStyle(
            fontFamily: 'SF Pro',
            color: Colors.white.withValues(alpha: 0.65),
            fontSize: artistSize,
            height: 1.2,
            fontWeight: FontWeight.w500,
          ),
          onTapArtist: (artistName) {
            if (widget.onGoToArtist != null) {
              widget.onGoToArtist!(artistName);
            } else {
              Navigator.push(
                context,
                ZenPageRoute(
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

  Widget _buildArtOverlay(
    PlayerState player,
    dynamic track,
    Size size,
    EdgeInsets safe,
  ) {
    final url =
        ((_shownCover?.isNotEmpty == true
            ? _shownCover
            : (track?.coverUrl as String?))) ??
        '';
    final currentKey = ValueKey<String>('cover-$url-${_isVideo ? 'v' : 'a'}');

    final dp = widget.dockProgress.clamp(0.0, 1.0);
    final currentMiniH = lerpDouble(52.0, _kMiniH, dp)!;
    final currentMiniArt = lerpDouble(36.0, _kMiniArt, dp)!;
    final currentMiniLeft = lerpDouble(84.0, 25.0, dp)!;
    final mini = Rect.fromLTWH(
      currentMiniLeft,
      size.height -
          widget.miniBottomOffset -
          safe.bottom -
          currentMiniH +
          (currentMiniH - currentMiniArt) / 2,
      currentMiniArt,
      currentMiniArt,
    );
    final big = _bigOrFallback(size, safe);
    final docked = Rect.fromLTWH(24, safe.top + 29, 56, 56);
    final side = big.width; // laid out ONCE at this size

    final cover = RepaintBoundary(
      child: SizedBox(
        width: side,
        height: side,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 360),
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeIn,
          transitionBuilder: (child, anim) {
            final incoming = child.key == currentKey;
            return FadeTransition(
              opacity: anim,
              child: SlideTransition(
                position: Tween<Offset>(
                  begin: Offset((incoming ? 0.10 : -0.10) * _dir, 0),
                  end: Offset.zero,
                ).animate(anim),
                child: child,
              ),
            );
          },
          child: SizedBox.expand(
            key: currentKey,
            child: _TrackMediaView(
              player: player,
              coverUrl: url,
              isVideo: _isVideo,
              videoFit: BoxFit.contain,
            ),
          ),
        ),
      ),
    );

    return Positioned(
      left: 0.0,
      right: 0.0,
      top: 0.0,
      bottom: 0.0,
      child: AnimatedBuilder(
        animation: Listenable.merge([_sheet, _dock, _pause, _artX, _press]),
        child: cover,
        builder: (context, child) {
          final t = _sheet.value.clamp(0.0, 1.0);
          if (!_open && t <= 0.001) return const SizedBox.shrink();

          final d = _dock.value.clamp(0.0, 1.0).toDouble(); // no overshoot

          // ── Path A (big artwork): diagonal flight. Horizontal position and
          // size lead (ease-out) while the vertical position follows the sheet
          // linearly. The same path is retraced when closing.
          final px = Curves.easeOutQuad.transform(t);
          final sp = (t + px) / 2;
          final bigCx = lerpDouble(mini.center.dx, big.center.dx, px)!;
          final bigCy = lerpDouble(mini.center.dy, big.center.dy, t)!;
          final bigW = lerpDouble(mini.width, big.width, sp)!;

          // ── Path B (docked in the header): the cover is glued to the header,
          // which slides with the sheet, so closing from lyrics mode keeps the
          // cover on the header until the last part of the travel, then it
          // settles into the mini player. Opening is the exact reverse.
          final k = Curves.easeInOutCubic.transform(
            ((_kRideEnd - t) / _kRideEnd).clamp(0.0, 1.0),
          );
          final dockCx = lerpDouble(docked.center.dx, mini.center.dx, k)!;
          final dockCy = lerpDouble(
            docked.center.dy + (1 - t) * size.height,
            mini.center.dy,
            k,
          )!;
          final dockW = lerpDouble(docked.width, mini.width, k)!;

          // blend A↔B with the dock spring (also drives big↔header glide)
          final cx = lerpDouble(bigCx, dockCx, d)!;
          final cy = lerpDouble(bigCy, dockCy, d)!;
          final rw = lerpDouble(bigW, dockW, d)!;

          final radius = lerpDouble(
            _kRadiusMini,
            lerpDouble(_kRadiusBig, _kRadiusDocked, d)!,
            t,
          )!;
          final pauseScale =
              (1 - (1 - _pause.value) * (1 - d) * t) * _press.value;
          final dx = _artX.value * t * (1 - d);

          final w = rw * pauseScale;
          final scale = w / side;
          final m = Matrix4.diagonal3Values(scale, scale, 1)
            ..setTranslationRaw(cx + dx - w / 2, cy - w / 2, 0);
          final r = radius / scale; // keep visual radius constant
          final shadowA = lerpDouble(0.28, 0.45, t)! * (1 - 0.5 * d);

          return Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned(
                left: 0,
                top: 0,
                width: side,
                height: side,
                child: Transform(
                  transform: m,
                  child: IgnorePointer(
                    ignoring: t < 0.95,
                    child: Semantics(
                      button: true,
                      label: _docked ? 'Show album art' : 'Show lyrics',
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTapDown: (_) =>
                            _press.springTo(0.94, spring: _kPressSpring),
                        onTapUp: (_) =>
                            _press.springTo(1, spring: _kReleaseSpring),
                        onTapCancel: () =>
                            _press.springTo(1, spring: _kReleaseSpring),
                        onTap: () =>
                            _setPanel(_docked ? _Panel.art : _Panel.lyrics),
                        onPanStart: _docked ? null : _artStart,
                        onPanUpdate: _docked ? null : _artUpdate,
                        onPanEnd: _docked ? null : _artEnd,
                        onPanCancel: _docked
                            ? null
                            : () => _artEnd(DragEndDetails()),
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: const Color(0xFF27272A),
                            borderRadius: BorderRadius.circular(r),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: shadowA),
                                blurRadius: 36,
                                offset: const Offset(0, 16),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(r),
                            child: child,
                          ),
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
    final column = RepaintBoundary(
      child: _sheetColumn(player, track, safe, size),
    );

    return Positioned(
      left: 0.0,
      right: 0.0,
      top: 0.0,
      bottom: 0.0,
      child: AnimatedBuilder(
        animation: _sheet,
        child: column,
        builder: (context, child) {
          final t = _sheet.value.clamp(0.0, 1.0);
          if (!_open && t <= 0.001) return const SizedBox.shrink();
          final radius = math.min(1.0, (1 - t) * _travel / 140) * 32;
          final contentOpacity = Curves.easeOut.transform(
            ((t - 0.25) / 0.75).clamp(0.0, 1.0),
          );
          final bgOpacity = Curves.easeInOut.transform(t);

          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {}, // absorb taps: prevents background click-through
            child: Transform.translate(
              offset: Offset(0, (1 - t) * size.height),
              child: ClipRRect(
                borderRadius: BorderRadius.vertical(
                  top: Radius.circular(t >= 0.98 ? 0.0 : radius),
                ),
                clipBehavior: t < 0.98 && radius > 0.1
                    ? Clip.antiAlias
                    : Clip.none,
                child: Stack(
                  key: _sheetKey,
                  clipBehavior: Clip.none,
                  children: [
                    Positioned(
                      left: -40.0,
                      right: -40.0,
                      top: -60.0,
                      bottom: -80.0,
                      child: Opacity(
                        opacity: bgOpacity,
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            Container(color: const Color(0xFF121214)),
                            RepaintBoundary(
                              child: ArtworkMeshBackground(
                                key: ValueKey(
                                  'artmesh_${track?.id ?? "none"}_${_shownCover ?? ""}',
                                ),
                                coverUrl: MediaNormalizer.upgradeArtworkUrl(
                                  ((_shownCover?.isNotEmpty == true
                                          ? _shownCover
                                          : track?.coverUrl) ??
                                      ''),
                                ),
                                fallbackAsset: 'assets/images/z_logo.png',
                                imageProviderBuilder: (url) =>
                                    CachedNetworkImageProvider(
                                      MediaNormalizer.upgradeArtworkUrl(url),
                                    ),
                                palette: _palette.isNotEmpty ? _palette : null,
                                paused: !_open && t < 0.05,
                                speed: 1.0,
                                backgroundColor: const Color(0xFF121214),
                                scrimOpacity: 0.15,
                              ),
                            ),
                            IgnorePointer(
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 300),
                                curve: Curves.easeOutCubic,
                                color: Colors.black.withValues(
                                  alpha: _panel == _Panel.lyrics
                                      ? 0.0
                                      : (_docked ? 0.26 : 0),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Opacity(
                      opacity: contentOpacity,
                      child: SizedBox.expand(
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () {},
                          child: child,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _edgeFade(Widget child, {double bottomStop = 0.93}) {
    return ShaderMask(
      blendMode: BlendMode.dstIn,
      shaderCallback: (r) => LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: const [
          Colors.transparent,
          Colors.black,
          Colors.black,
          Colors.transparent,
        ],
        stops: [0, 0.05, bottomStop, 1],
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
    switch (_bodyPanel) {
      case _Panel.art:
        // empty: the artwork itself is drawn (and animated) by the overlay
        return const SizedBox.expand(key: ValueKey('art'));
      case _Panel.lyrics:
        return KeyedSubtree(
          key: ValueKey('lyrics-$_trackKey'),
          child: NotificationListener<ScrollNotification>(
            onNotification: (n) {
              if ((n is ScrollUpdateNotification &&
                      n.dragDetails != null &&
                      _activePointers > 0) ||
                  (n is ScrollStartNotification &&
                      n.dragDetails != null &&
                      _activePointers > 0)) {
                _bumpIdle();
              }
              return false;
            },
            child: _dismissOnOverscroll(
              Padding(
                padding: const EdgeInsets.fromLTRB(0, 2, 0, 0),
                // bottom fade is almost nothing: the progressive blur below
                // does the softening, lyrics run underneath it
                child: _edgeFade(
                  TickerMode(
                    enabled: _open || _sheet.value > 0.05,
                    child:
                        widget.lyricsBuilder?.call(context) ??
                        LyricsSheet(immersiveListenable: _lyricsImmersive),
                  ),
                  bottomStop: 0.985,
                ),
              ),
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
        final v = anim.value;
        if (anim.status == AnimationStatus.reverse) {
          return Opacity(
            opacity: v.clamp(0.0, 1.0),
            child: Transform.scale(
              scale: 0.98 + 0.02 * v.clamp(0.0, 1.0),
              child: child,
            ),
          );
        }
        final e = const Cubic(
          0.18,
          0.95,
          0.32,
          1.0,
        ).transform(v.clamp(0.0, 1.0));
        return Opacity(
          opacity: e.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, (1 - e) * 24),
            child: Transform.scale(scale: 0.97 + 0.03 * e, child: child),
          ),
        );
      },
    );
  }

  /// Collapses / reveals [child] following the `_dock` spring.
  Widget _dockCollapse({required bool inverse, required Widget child}) {
    return AnimatedBuilder(
      animation: _dock,
      child: child,
      builder: (_, c) {
        final d = _dock.value.clamp(0.0, 1.0);
        final f = inverse ? 1 - d : d;
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

  /// Glides the bottom controls away (and back) with the `_chrome` spring.
  /// Only opacity, a small downward offset and a blur change: layout never
  /// moves, so the lyrics stay perfectly still.
  Widget _chromeCollapse({required Widget child}) {
    return AnimatedBuilder(
      animation: _chrome,
      child: child,
      builder: (_, c) {
        final h = _chrome.value.clamp(0.0, 1.0).toDouble();
        final f = 1 - h;
        final sigma = h * 10;
        final filter = sigma < 0.05
            ? ImageFilter.matrix(Matrix4.identity().storage)
            : ImageFilter.blur(
                sigmaX: sigma,
                sigmaY: sigma,
                tileMode: TileMode.decal,
              );
        return IgnorePointer(
          ignoring: h > 0.35,
          child: Opacity(
            opacity: f,
            child: Transform.translate(
              offset: Offset(0, h * 26),
              child: ImageFiltered(imageFilter: filter, child: c),
            ),
          ),
        );
      },
    );
  }

  /// Plain fade following `_chrome` (used for the backdrop blur layer, which
  /// must not be blurred itself).
  Widget _chromeFade({required Widget child}) {
    return AnimatedBuilder(
      animation: _chrome,
      child: child,
      builder: (_, c) => Opacity(
        opacity: (1 - _chrome.value).clamp(0.0, 1.0).toDouble(),
        child: c,
      ),
    );
  }

  /// Staggered rise-in of the controls as the sheet opens (and the reverse on
  /// close). [begin] is the sheet progress at which this element starts.
  Widget _rise({required double begin, required Widget child}) {
    return AnimatedBuilder(
      animation: _sheet,
      child: child,
      builder: (_, c) {
        final t = _sheet.value.clamp(0.0, 1.0);
        final v = ((t - begin) / (1 - begin)).clamp(0.0, 1.0);
        final e = Curves.easeOutCubic.transform(v);
        return Opacity(
          opacity: e,
          child: Transform.translate(offset: Offset(0, (1 - e) * 22), child: c),
        );
      },
    );
  }

  /// Progressive blur behind the bottom controls (lyrics mode only). Blur is
  /// strongest at the bottom edge and fades to nothing towards the top, so
  /// there is no hard edge where the blur begins.
  Widget _bottomBlur(double height, bool on) {
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      height: height,
      child: IgnorePointer(
        child: AnimatedOpacity(
          opacity: on ? 1 : 0,
          duration: const Duration(milliseconds: 360),
          curve: Curves.easeOutCubic,
          child: _chromeFade(
            child: RepaintBoundary(
              child: ShaderMask(
                blendMode: BlendMode.dstIn,
                shaderCallback: (r) => const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black, Colors.black],
                  stops: [0.0, 0.55, 1.0],
                ).createShader(r),
                child: ClipRect(
                  child: BackdropFilter(
                    filter: ImageFilter.blur(
                      sigmaX: 26,
                      sigmaY: 26,
                      tileMode: TileMode.mirror,
                    ),
                    child: ColoredBox(
                      color: Colors.black.withValues(alpha: 0.16),
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

  Widget _sheetColumn(
    PlayerState player,
    dynamic track,
    EdgeInsets safe,
    Size size,
  ) {
    final isLyrics = _panel == _Panel.lyrics;
    final isQueue = _panel == _Panel.queue;

    // The last row (Studio FX · Lyrics · Queue) is never moved: it keeps the
    // exact same bottom padding as before.
    final toolsH = 44.0 + 16 + safe.bottom;
    final blurH = 300.0 + safe.bottom;
    final queueReserve = toolsH + 176;
    final big = _bigOrFallback(size, safe);

    final middleRegion = Expanded(
      child: AnimatedPadding(
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
        padding: EdgeInsets.only(bottom: isQueue ? queueReserve : 0),
        child: SizedBox.expand(
          key: _regionKey,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onVerticalDragStart: (_) => _dragStart(),
            onVerticalDragUpdate: (d) => _dragUpdate(d.delta.dy),
            onVerticalDragEnd: (d) => _dragEnd(d.velocity.pixelsPerSecond.dy),
            onVerticalDragCancel: () => _dragEnd(0),
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 280),
              reverseDuration: const Duration(milliseconds: 160),
              transitionBuilder: _panelTransition,
              layoutBuilder: (cur, prev) =>
                  Stack(fit: StackFit.expand, children: [...prev, ?cur]),
              child: _panelBody(track),
            ),
          ),
        ),
      ),
    );

    final grabber = Semantics(
      button: true,
      label: 'Close player',
      child: GestureDetector(
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
    );

    final compactHeader = _dockCollapse(
      inverse: false,
      child: _compactHeader(track),
    );

    // Title / like / more / seekbar / transport. One block, positioned by a
    // layout delegate that follows the `_dock` spring: right under the cover in
    // art mode, glued above the last row in lyrics / queue mode.
    final controls = _chromeCollapse(
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onVerticalDragStart: (_) => _dragStart(),
        onVerticalDragUpdate: (d) => _dragUpdate(d.delta.dy),
        onVerticalDragEnd: (d) => _dragEnd(d.velocity.pixelsPerSecond.dy),
        onVerticalDragCancel: () => _dragEnd(0),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _rise(
                begin: 0.34,
                child: _dockCollapse(inverse: true, child: _metaRow(track)),
              ),
              _rise(
                begin: 0.40,
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 420),
                    child: Padding(
                      padding: const EdgeInsets.only(top: 2, bottom: 2),
                      child: ScrubberSlider(
                        positionNotifier: player.positionNotifier,
                        duration: _duration,
                        onSeek: (pos) => player.seek(pos),
                        activeColor: _seekTint.withValues(alpha: 0.62),
                        trackColor: _seekTint.withValues(alpha: 0.22),
                      ),
                    ),
                  ),
                ),
              ),
              _rise(
                begin: 0.46,
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 340),
                    child: Padding(
                      padding: const EdgeInsets.only(top: 6, bottom: 16),
                      child: _transport(player),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    // Last row: unchanged position, always pinned to the bottom.
    final tools = Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: _chromeCollapse(
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onVerticalDragStart: (_) => _dragStart(),
          onVerticalDragUpdate: (d) => _dragUpdate(d.delta.dy),
          onVerticalDragEnd: (d) => _dragEnd(d.velocity.pixelsPerSecond.dy),
          onVerticalDragCancel: () => _dragEnd(0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: EdgeInsets.fromLTRB(24, 0, 24, safe.bottom + 16),
                child: _rise(
                  begin: 0.52,
                  child: _tools(
                    isLyrics,
                    hasLyrics: player.hasLyrics || player.isLoadingLyrics,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    final content = Stack(
      fit: StackFit.expand,
      children: [
        Column(children: [grabber, compactHeader, middleRegion]),
        _bottomBlur(blurH, isLyrics),
        Positioned.fill(
          child: CustomSingleChildLayout(
            delegate: _ControlsLayout(
              dock: _dock,
              artBottom: big.bottom + 16,
              bottomInset: toolsH,
            ),
            child: controls,
          ),
        ),
        tools,
      ],
    );

    // Raw pointer listener (never steals gestures): any touch while lyrics are
    // open wakes the bottom controls and re-arms the idle timer.
    return Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: (_) {
        _activePointers++;
        _bumpIdle(force: true);
      },
      onPointerMove: (_) => _bumpIdle(),
      onPointerUp: (_) => _pointerReleased(),
      onPointerCancel: (_) => _pointerReleased(),
      child: content,
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
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => _showMediaNavigationSheet(track),
                    child: MarqueeScroll(
                      resetKey: _trackKey,
                      child: SwapText(
                        track is Track
                            ? track.compactTitle
                            : MediaNormalizer.cleanCompactTitle(
                                track?.title?.toString(),
                              ),
                        dir: _dir,
                        style: const TextStyle(
                          fontFamily: 'SF Pro',
                          color: Colors.white,
                          fontSize: 17,
                          height: 22 / 17,
                          fontWeight: FontWeight.w600,
                          letterSpacing: -0.25,
                        ),
                      ),
                    ),
                  ),
                  MarqueeScroll(
                    resetKey: _trackKey,
                    child: InteractiveArtistsText(
                      artists: _artistsOf(track),
                      style: TextStyle(
                        fontFamily: 'SF Pro',
                        color: Colors.white.withValues(alpha: 0.70),
                        fontSize: 15,
                        height: 20 / 15,
                        fontWeight: FontWeight.w500,
                      ),
                      onTapArtist: (_) => _showMediaNavigationSheet(track),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            PopLikeButton(liked: _isLiked, onToggle: _toggleLike),
            const SizedBox(width: 8),
            PlayerMoreButton(
              onTap: () => _showTrackMenu(track),
              icon: CupertinoIcons.ellipsis,
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
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _showMediaNavigationSheet(track),
                  child: MarqueeScroll(
                    resetKey: _trackKey,
                    child: SwapText(
                      track is Track
                          ? track.title
                          : MediaNormalizer.cleanTitle(
                              track?.title?.toString(),
                            ),
                      dir: _dir,
                      style: const TextStyle(
                        fontFamily: 'SF Pro Display',
                        color: Colors.white,
                        fontSize: 22,
                        height: 28 / 22,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.45,
                      ),
                    ),
                  ),
                ),
                MarqueeScroll(
                  resetKey: _trackKey,
                  child: InteractiveArtistsText(
                    artists: _artistsOf(track),
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      color: Colors.white.withValues(alpha: 0.75),
                      fontSize: 17,
                      height: 22 / 17,
                      fontWeight: FontWeight.w500,
                    ),
                    onTapArtist: (_) => _showMediaNavigationSheet(track),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          PopLikeButton(liked: _isLiked, onToggle: _toggleLike),
          const SizedBox(width: 8),
          PlayerMoreButton(
            onTap: () => _showTrackMenu(track),
            icon: CupertinoIcons.ellipsis,
          ),
        ],
      ),
    );
  }

  /// Previous · Play/Pause · Next.
  Widget _transport(PlayerState player) {
    return FittedBox(
      fit: BoxFit.scaleDown,
      child: SizedBox(
        width: 320,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _SpringButton(
              size: 78,
              label: 'Previous track',
              onTap: _prev,
              child: SpringPop(
                pulse: _prevPulse,
                dx: -10,
                scale: 0.12,
                child: const Icon(
                  CupertinoIcons.backward_fill,
                  color: Colors.white,
                  size: 44,
                ),
              ),
            ),
            const SizedBox(width: 30),
            _SpringButton(
              size: 90,
              label: _playing ? 'Pause' : 'Play',
              pressedScale: 0.9,
              onTap: player.togglePlay,
              child: _PlayGlyph(playing: _playing, size: 60),
            ),
            const SizedBox(width: 30),
            _SpringButton(
              size: 78,
              label: 'Next track',
              onTap: _next,
              child: SpringPop(
                pulse: _nextPulse,
                dx: 10,
                scale: 0.12,
                child: const Icon(
                  CupertinoIcons.forward_fill,
                  color: Colors.white,
                  size: 44,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Studio FX · Lyrics · Queue (order and position unchanged).
  Widget _tools(bool lyricsOpen, {bool hasLyrics = true}) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 260),
        child: SizedBox(
          width: double.infinity,
          height: 44,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: PlateButton(
                  size: 44,
                  onTap: () => showStudioFxSheet(context),
                  child: const Icon(
                    CupertinoIcons.slider_horizontal_3,
                    size: 22,
                  ),
                ),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: PlateButton(
                  size: 44,
                  active: _panel == _Panel.queue,
                  onTap: () => _togglePanel(_Panel.queue),
                  child: SpringPop(
                    trigger: _panel == _Panel.queue,
                    scale: 0.3,
                    child: const Icon(CupertinoIcons.list_bullet, size: 24),
                  ),
                ),
              ),
              PlateButton(
                size: 44,
                active: lyricsOpen,
                onTap: hasLyrics ? () => _togglePanel(_Panel.lyrics) : null,
                child: Opacity(
                  opacity: hasLyrics ? 1.0 : 0.28,
                  child: SpringPop(
                    trigger: lyricsOpen,
                    scale: 0.3,
                    child: Icon(
                      lyricsOpen
                          ? CupertinoIcons.quote_bubble_fill
                          : CupertinoIcons.quote_bubble,
                      size: 22,
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
}

/* ------------------------------------------------------------------ */
/*  Controls layout: follows the dock spring (no rebuilds per frame)    */
/*  d = 0 → top edge sits just under the cover                          */
/*  d = 1 → bottom edge sits right above the last button row            */
/* ------------------------------------------------------------------ */
class _ControlsLayout extends SingleChildLayoutDelegate {
  _ControlsLayout({
    required this.dock,
    required this.artBottom,
    required this.bottomInset,
  }) : super(relayout: dock);

  final Animation<double> dock;
  final double artBottom;
  final double bottomInset;

  @override
  BoxConstraints getConstraintsForChild(BoxConstraints constraints) =>
      BoxConstraints(
        minWidth: constraints.maxWidth,
        maxWidth: constraints.maxWidth,
        maxHeight: constraints.maxHeight,
      );

  @override
  Offset getPositionForChild(Size size, Size childSize) {
    final d = dock.value.clamp(0.0, 1.0).toDouble();
    // Move title, artist, seekbar, and transport buttons to the bottom of the screen,
    // providing generous breathing room below the artwork image in art mode.
    final yBottom = size.height - bottomInset - childSize.height;
    final yArt = math.max(artBottom + 20, yBottom);
    return Offset(0, lerpDouble(yArt, yBottom, d)!);
  }

  @override
  bool shouldRelayout(covariant _ControlsLayout old) =>
      old.artBottom != artBottom ||
      old.bottomInset != bottomInset ||
      old.dock != dock;
}

/* ------------------------------------------------------------------ */
/*  Spring button: press-down spring, glass halo, bouncy release       */
/* ------------------------------------------------------------------ */
class _SpringButton extends StatefulWidget {
  const _SpringButton({
    required this.onTap,
    required this.child,
    required this.size,
    required this.label,
    this.pressedScale = 0.84,
  });

  final VoidCallback onTap;
  final Widget child;
  final double size;
  final String label;
  final double pressedScale;

  @override
  State<_SpringButton> createState() => _SpringButtonState();
}

class _SpringButtonState extends State<_SpringButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );

  bool get _reduceMotion => MediaQuery.disableAnimationsOf(context);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _down(TapDownDetails _) {
    if (_reduceMotion) {
      _c.value = 1;
      return;
    }
    _c.springTo(1, spring: _kPressSpring, velocity: _c.velocity);
  }

  void _release() {
    if (_reduceMotion) {
      _c.value = 0;
      return;
    }
    _c.springTo(0, spring: _kReleaseSpring, velocity: _c.velocity);
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: widget.label,
      onTap: widget.onTap,
      child: ExcludeSemantics(
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: _down,
          onTapUp: (_) => _release(),
          onTapCancel: _release,
          onTap: () {
            HapticFeedback.lightImpact();
            widget.onTap();
          },
          child: AnimatedBuilder(
            animation: _c,
            child: widget.child,
            builder: (_, child) {
              final v = _c.value;
              final s = 1 - (1 - widget.pressedScale) * v;
              final halo = v.clamp(0.0, 1.0) * 0.16;
              return SizedBox(
                width: widget.size,
                height: widget.size,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Transform.scale(
                      scale: s,
                      child: Container(
                        width: widget.size * 0.9,
                        height: widget.size * 0.9,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white.withValues(alpha: halo),
                        ),
                      ),
                    ),
                    Transform.scale(scale: s, child: child),
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Play / pause glyph: cross-morph + spring bounce on every toggle     */
/* ------------------------------------------------------------------ */
class _PlayGlyph extends StatelessWidget {
  const _PlayGlyph({required this.playing, required this.size});
  final bool playing;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SpringPop(
        trigger: playing,
        scale: 0.16,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 300),
          switchInCurve: Curves.easeOutBack,
          switchOutCurve: Curves.easeIn,
          transitionBuilder: (c, a) => ScaleTransition(
            scale: Tween<double>(begin: 0.5, end: 1).animate(a),
            child: FadeTransition(opacity: a, child: c),
          ),
          child: Icon(
            playing ? CupertinoIcons.pause_fill : CupertinoIcons.play_fill,
            key: ValueKey(playing),
            color: Colors.white,
            size: size,
          ),
        ),
      ),
    );
  }
}

/// Renders either album artwork or, when [isVideo] is true and native ExoPlayer
/// has bound a video [SurfaceTexture], streams the live video frames on top
/// with seamless poster fallback until the first decoded frame arrives.
class _TrackMediaView extends StatelessWidget {
  const _TrackMediaView({
    required this.player,
    required this.coverUrl,
    required this.isVideo,
    required this.videoFit,
  });

  final PlayerState player;
  final String coverUrl;
  final bool isVideo;
  final BoxFit videoFit;

  @override
  Widget build(BuildContext context) {
    if (!isVideo) {
      return CoverImage(coverUrl);
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        CoverImage(coverUrl),
        ValueListenableBuilder<int?>(
          valueListenable: player.videoTextureIdNotifier,
          builder: (_, textureId, _) {
            if (textureId == null) return const SizedBox.shrink();
            return ValueListenableBuilder<Size>(
              valueListenable: player.videoSizeNotifier,
              builder: (_, vSize, _) {
                if (vSize.width <= 0 || vSize.height <= 0) {
                  return const SizedBox.shrink();
                }
                return ColoredBox(
                  color: const Color(0xFF0A0A0D),
                  child: FittedBox(
                    fit: videoFit,
                    clipBehavior: Clip.hardEdge,
                    child: SizedBox(
                      width: vSize.width,
                      height: vSize.height,
                      child: Texture(
                        textureId: textureId,
                        filterQuality: FilterQuality.medium,
                      ),
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
}
