import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/zen.dart' hide SpringCurve;
import '../../design_system/widgets/apple_glass.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/scrubber_slider.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../services/player_state.dart';
import '../../services/queue_state.dart';
import '../../services/settings_service.dart';
import '../lyrics/lyrics_sheet.dart';
import 'bleed_artwork.dart';
import 'player_kit.dart';
import 'queue_panel.dart';
import 'studio_fx_sheet.dart';
import '../details/artist_screen.dart';
import '../details/album_screen.dart';
import '../../design_system/widgets/interactive_artists_text.dart';
import '../../design_system/widgets/media_navigation_sheet.dart';
import '../../models/track.dart';
import '../../services/library_store.dart';
import '../../utils/media_normalizer.dart';

const double _kPaused = 0.86; // artwork shrink while paused
// Mini player geometry. [full] = normal pill, [compact] = narrow pill that
// sits beside the dock. Art inset is always (height - art) / 2 = 8, so the
// cover is evenly spaced from the left, top and bottom of the pill.
const double _kMiniH = 54;
const double _kMiniArt = 38;
const double _kMiniSide = 16;
const double _kMiniHCompact = 50;
const double _kMiniArtCompact = 34;
const double _kMiniSideCompact = 76;
const double _kMiniGap = 12; // between cover and text
const double _kMiniBtn = 44; // play / next hit area

/// Single source of truth for the mini pill. The pill AND the flying cover
/// read these numbers, so the cover always lands exactly in the pill's art slot.
class _MiniGeo {
  _MiniGeo(this.dp, this.bottom)
    : side = lerpDouble(_kMiniSideCompact, _kMiniSide, dp)!,
      h = lerpDouble(_kMiniHCompact, _kMiniH, dp)!,
      art = lerpDouble(_kMiniArtCompact, _kMiniArt, dp)!;
  final double dp;
  final double bottom; // distance from screen bottom to the pill bottom
  final double side; // left / right margin of the pill
  final double h;
  final double art;
  double get insetTop => (h - art) / 2;
  double get insetLeft => lerpDouble(10.0, 14.0, dp)!;
  double get inset => insetTop;
  Rect artRect(Size size) =>
      Rect.fromLTWH(side + insetLeft, size.height - bottom - h + insetTop, art, art);
}

/// Artwork corner radii (visual points, independent of the morph scale).
const double _kRadiusMini = 6;
const double _kRadiusBig = 12;
const double _kRadiusDocked = 7;

/// Auto-hide bottom controls after 3 seconds of inactivity in lyrics mode.
const Duration _kIdleHide = Duration(seconds: 3);

/// Cover docking spring (art <-> header). Critically damped: no bounce.
const SpringDescription _kDockSpring = SpringDescription(
  mass: 1,
  stiffness: 520,
  damping: 46,
);

/// Sheet close spring. Lively, liquid, swift settling with no stuckness.
const SpringDescription _kCloseSpring = SpringDescription(
  mass: 1.0,
  stiffness: 340,
  damping: 28,
);

/// Sheet open spring. Slightly softer than close, tiny settle, like iOS.
const SpringDescription _kOpenSpring = SpringDescription(
  mass: 1.0,
  stiffness: 320,
  damping: 28,
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

/// The mini player pill is fully gone once the sheet is this far open.
const double _kMiniFadeSpan = 0.14;

/// Page dim behind the sheet (0..1 black) when fully open.
const double _kScrimMax = 0.6;

/// Where the sheet starts (fraction of screen height from top).
/// 0.70 means the sheet starts from 30% height of the screen from bottom.
const double _kSheetStartY = 0.70;

/// Sheet backdrop and contents reach full opacity (1.0) when reaching 80-85% of travel.
const double _kSheetFadeSpan = 0.82;

/// Top corner radius while the sheet travels (eases to 0 at the very top).
const double _kSheetRadius = 28;

double _smooth(double x) {
  final v = x.clamp(0.0, 1.0).toDouble();
  return v * v * (3 - 2 * v);
}

/// Tap open/close have no finger momentum, so they use softer springs and
/// the cover flight stays visible. Drag releases keep the stiff ones.
const SpringDescription _kOpenTapSpring =
    SpringDescription(mass: 1.0, stiffness: 300, damping: 27);
const SpringDescription _kCloseTapSpring =
    SpringDescription(mass: 1.0, stiffness: 320, damping: 28);

/// Vertical gap used TWICE in the open sheet, so the rhythm is even:
///  • between the seekbar and the play / pause row
///  • between the play / pause row and the last row (Studio FX · Lyrics · Queue)
const double _kRowGap = 56.0;

// Fixed heights of the open-sheet blocks (shared by the layout AND by the
// full-bleed artwork placement, so the cover always sits cleanly above the title).
const double _kSeekH = 52.0;
const double _kTransportH = 90.0; // height of the play / pause button box
const double _kMetaH = 50.0; // title + artist row (incl. its bottom padding)
const double _kMetaGap = 3.0; // gap between the title row and the seekbar

/// Distance from the screen bottom to the bottom of the seekbar / transport
/// block (= top of the last row + _kRowGap).
double _blockBottomInset(EdgeInsets safe) => 44.0 + 16 + safe.bottom + _kRowGap;

/// Where the full-bleed cover sits: positioned in the upper portion between
/// the top safe area / grabber and the title row, fitting the screen's left
/// and right sides exactly with guaranteed clearance above the song title.
Rect _bleedRect(Size size, EdgeInsets safe) {
  final dockedBlockH = _kSeekH + _kRowGap + _kTransportH;
  final titleTop =
      size.height -
      _blockBottomInset(safe) -
      dockedBlockH -
      _kMetaGap -
      _kMetaH;
  final bottom = titleTop - 16.0;
  final topLimit = math.max(safe.top, 24.0) + 8.0;
  final maxH = math.max(180.0, bottom - topLimit);
  final side = math.min(size.width, maxH).clamp(180.0, size.width).toDouble();
  final top = bottom - side;
  return Rect.fromLTWH((size.width - side) / 2, top, side, side);
}

enum _Axis { none, x, y }

/// What fills the middle of the open sheet.
enum _Panel { art, lyrics, queue }

/// Drop this ONCE above your tab bar content:
///
///   Stack(children: [ pages, const Positioned.fill(child: PlayerShell()) ])
///
/// Motion model (all springs):
///  • `_sheet`  0 = docked mini, 1 = fully open. It drives the cover flight
///    (ONE card: mini -> big / bleed / header) and fades the backdrop
///    0% -> 100%. The sheet itself does NOT slide.
///  • `_dock`   0 = big artwork, 1 = artwork docked top-left in the header.
///  • `_chrome` 0 = bottom controls shown, 1 = hidden (lyrics idle). Hiding
///    NEVER changes layout (only opacity and offset).
///  • ONE artwork widget lives in an overlay, laid out once at the big size and
///    moved/scaled with a matrix. The mini player hides its own cover while
///    the sheet is open, so there is never a second card.
class PlayerShell extends StatefulWidget {
  static final ValueNotifier<bool> isPlayerOpenNotifier = ValueNotifier<bool>(
    false,
  );
  static final ValueNotifier<int> openRequestNotifier = ValueNotifier<int>(0);

  /// 0 = mini, 1 = fully open. Drive the dock with it.
  static final ValueNotifier<double> sheetProgress = ValueNotifier<double>(0);

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
  bool _warm = false;
  Timer? _warmTimer;

  bool _chromeHidden = false;
  bool _reordering = false;
  double _scrollAcc = 0;
  final ValueNotifier<bool> _lyricsImmersive = ValueNotifier<bool>(false);

  Timer? _idleTimer;
  int _activePointers = 0;
  DateTime? _lastBump;

  // where (as a fraction of the lyrics region) the lyrics finish fading out
  // above the seekbar / transport block
  double _lyricsFadeEnd = 0.78;

  bool get _docked => _panel != _Panel.art;

  String? _trackKey;
  String? _shownCover;

  // ── full bleed state ──
  BleedArtwork? _bleedArt;
  String _bleedUrl = '';
  String? _bakingUrl;
  bool _bakeFailed = false;
  bool _paletteReady = false;

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
    _sheet.addListener(_publishProgress);
  }

  void _publishProgress() {
    PlayerShell.sheetProgress.value = _sheet.value.clamp(0.0, 1.0).toDouble();
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
    _sheet.removeListener(_publishProgress);
    _warmTimer?.cancel();
    _mountTimer?.cancel();
    _idleTimer?.cancel();
    _lyricsImmersive.dispose();
    _prevPulse.dispose();
    _nextPulse.dispose();
    for (final c in [_sheet, _pause, _dock, _chrome, _artX, _miniX, _press]) {
      c.dispose();
    }
    super.dispose();
  }

  /* ───────────────────────── sync with player ───────────────────────── */

  void _applyBleed(BleedArtwork art) {
    _bleedArt = art;
    _bakeFailed = false;
  }

  /// Makes sure the current cover is baked in both modes.
  /// Safe to call from build(): it never calls setState synchronously.
  void _ensureBleed() {
    if (_bleedUrl.isEmpty || _bakeFailed) return;
    if (_bleedArt?.key == _bleedUrl || _bakingUrl == _bleedUrl) return;

    final cached = BleedArtworkService.instance.peek(_bleedUrl);
    if (cached != null) {
      _applyBleed(cached);
      return;
    }

    final url = _bleedUrl;
    _bakingUrl = url;
    BleedArtworkService.instance
        .load(url, CachedNetworkImageProvider(url))
        .then((art) {
          if (_bakingUrl == url) _bakingUrl = null;
          if (!mounted || _bleedUrl != url) return;
          setState(() {
            if (art != null) {
              _applyBleed(art);
            } else {
              _bakeFailed = true;
            }
          });
        });
  }

  void _syncTrack(dynamic track) {
    final key = '${track.title}|${track.artist}|${track.coverUrl}';
    if (key == _trackKey) return;
    _trackKey = key;
    final url = (track.coverUrl as String?) ?? '';
    _shownCover = url;
    _bleedUrl = MediaNormalizer.upgradeArtworkUrl(url);
    _bakeFailed = false;
    _bleedArt = BleedArtworkService.instance.peek(_bleedUrl);
    _bakingUrl = null;

    // Follow the user's active player mode (e.g. lyrics mode) for the next song too
    if (_open && _preferredMode == _Panel.lyrics && _panel != _Panel.lyrics) {
      _panel = _Panel.lyrics;
      _bodyPanel = _Panel.lyrics;
      _dock.value = 1.0;
    }

    if (_panel == _Panel.lyrics) {
      if (_chromeHidden) {
        _idleTimer?.cancel();
      } else {
        _idleTimer?.cancel();
        _idleTimer = Timer(_kIdleHide, _hideChrome);
      }
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
        setState(() {
          _palette = p;
          _paletteReady = true;
        });
      }
    });
  }

  /// Used only while no baked backdrop exists (very first frame / failed bake).
  List<Color> _fallbackColors() {
    if (!_paletteReady || _palette.isEmpty) {
      return const [Color(0xFF2A2A30), Color(0xFF1C1C22), Color(0xFF121216)];
    }
    final c = [
      for (final p in _palette.take(3)) Color.lerp(p, Colors.black, 0.45)!,
    ];
    if (c.length < 2) c.add(const Color(0xFF121216));
    return c;
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
          _panel = _Panel.lyrics;
          _bodyPanel = _Panel.art;
          _dock.value = 1.0;
        }
      });
      if (restoreLyrics) {
        _bumpIdle(force: true);
      }
    }
    // interruptible: tapping mid-flight carries the current velocity
    final v = velocity != 0 ? velocity : _sheet.velocity;
    _sheet
        .springTo(
          1,
          spring: v.abs() > 0.08 ? _kOpenSpring : _kOpenTapSpring,
          velocity: v,
        )
        .then((_) {
      if (mounted && _panel == _Panel.lyrics && _bodyPanel != _Panel.lyrics) {
        setState(() => _bodyPanel = _Panel.lyrics);
      }
    });
  }

  void _close({double velocity = 0}) {
    PlayerShell.isPlayerOpenNotifier.value = false;
    if (!_open && _sheet.value <= 0.001) return;
    _mountTimer?.cancel();
    _idleTimer?.cancel();
    _activePointers = 0;

    _chromeHidden = false;
    _lyricsImmersive.value = false;
    if (_chrome.value != 0) _chrome.springTo(0, spring: kSnappySpring);
    if (_dock.value != 0) _dock.springTo(0, spring: _kCloseSpring);

    final v = velocity != 0 ? velocity : _sheet.velocity;
    _sheet
        .springTo(
          0,
          spring: v.abs() > 0.08 ? _kCloseSpring : _kCloseTapSpring,
          velocity: v,
        )
        .then((_) {
      PlayerShell.isPlayerOpenNotifier.value = false;
      if (!mounted) return;
      _dock.value = 0;
      _chrome.value = 0;
      _chromeHidden = false;
      _lyricsImmersive.value = false;
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
    // dock hides the instant a drag-open begins
    if (_startedClosed) PlayerShell.isPlayerOpenNotifier.value = true;
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

    final wasDocked = _docked;
    setState(() {
      _panel = p;
      // lyrics <-> queue: swap right away (cross-fade). Going back to art
      // keeps the old body mounted until it has faded out with the dock.
      if (p != _Panel.art && wasDocked) _bodyPanel = p;
    });

    if (p != _Panel.art && !wasDocked) {
      // mount a beat AFTER the glide starts so frame 1 is never blocked
      _mountTimer = Timer(const Duration(milliseconds: 90), () {
        if (mounted && _panel == p && _bodyPanel != p) {
          setState(() => _bodyPanel = p);
        }
      });
    } else if (p == _Panel.art) {
      // unmount the old body only after it has fully faded out
      _mountTimer = Timer(const Duration(milliseconds: 500), () {
        if (mounted && _panel == _Panel.art && _bodyPanel != _Panel.art) {
          setState(() => _bodyPanel = _Panel.art);
        }
      });
    }

    _dock.springTo(
      p == _Panel.art ? 0 : 1,
      spring: _kDockSpring,
      velocity: _dock.velocity, // interruptible, no dead stop
    );

    if (p == _Panel.lyrics) {
      _activePointers = 0;
      _bumpIdle(force: true);
    } else {
      _idleTimer?.cancel();
      _activePointers = 0;
      _chromeHidden = false;
      _lyricsImmersive.value = false;
      if (_chrome.value != 0) _chrome.springTo(0, spring: kSnappySpring);
    }
  }

  void _togglePanel(_Panel p) => _setPanel(_panel == p ? _Panel.art : p);

  /* ───────────── lyrics scroll hides or shows the controls ───────────── */

  void _setChromeHidden(bool hide) {
    if (_panel != _Panel.lyrics || _chromeHidden == hide) {
      return;
    }
    _chromeHidden = hide;
    _lyricsImmersive.value = hide;
    _chrome.springTo(
      hide ? 1 : 0,
      spring: hide ? kSoftSpring : kSnappySpring,
      velocity: _chrome.velocity,
    );
  }

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
        return;
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
    _setChromeHidden(true);
  }

  void _pointerReleased() {
    _activePointers = math.max(0, _activePointers - 1);
    if (_activePointers == 0) {
      _bumpIdle(force: true);
    }
  }

  bool _onLyricsScroll(ScrollNotification n) {
    if (n.metrics.axis != Axis.vertical) return false;
    if (n is ScrollStartNotification &&
        n.dragDetails != null &&
        _activePointers > 0) {
      _bumpIdle();
    }
    if (n is ScrollUpdateNotification && n.dragDetails != null) {
      final dy = n.scrollDelta ?? 0;
      if (dy == 0) return false;
      if (_scrollAcc.sign != dy.sign) _scrollAcc = 0;
      _scrollAcc += dy;
      if (_scrollAcc > 18) {
        _setChromeHidden(true);
      } else if (_scrollAcc < -18) {
        _setChromeHidden(false);
        _bumpIdle();
      }
    }
    return false;
  }

  /// Where the big artwork rests in normal mode (classic Apple Music centered card).
  Rect _bigOrFallback(Size size, EdgeInsets safe) {
    final side = math.min(size.width - 56, 380.0);
    return Rect.fromLTWH(
      (size.width - side) / 2,
      safe.top + 29 + 34,
      side,
      side,
    );
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
    if (track == null && _trackKey == null) return;
    final Track t = _toTrack(track);
    ZenDropdown.showTrackMenu(
      context: context,
      track: t,
      onGoToArtist: () => _openArtist(t.artist),
      onGoToAlbum: () => _openAlbum(t),
    );
  }

  Track _toTrack(dynamic track) {
    if (track is Track) return track;
    final id = track?.id?.toString() ?? _trackKey ?? '';
    final fromStore = LibraryStore.instance.getTrackById(id);
    if (fromStore != null) return fromStore;
    return Track(
      id: id,
      title: track?.title?.toString() ?? '',
      artist: track?.artist?.toString() ?? '',
      album: track?.album?.toString() ?? '',
      coverUrl: (track?.coverUrl as String?) ?? _shownCover ?? '',
      durationSeconds: (track?.durationSeconds as num?)?.toInt() ?? 0,
    );
  }

  void _toggleLike(dynamic track) {
    final t = _toTrack(track);
    if (t.id.isEmpty) return;
    HapticFeedback.lightImpact();
    LibraryStore.instance.toggleLike(t);
  }

  /* ───────────────────────── build ───────────────────────── */

  @override
  Widget build(BuildContext context) {
    final track = context.select<PlayerState, dynamic>((p) => p.currentTrack);
    if (track == null) return const SizedBox.shrink();
    _playing = context.select<PlayerState, bool>((p) => p.isPlaying);
    _isVideo = context.select<PlayerState, bool>((p) => p.isCurrentVideo);
    _duration = context.select<PlayerState, dynamic>((p) => p.duration);
    bool isFullBleed = false;
    try {
      isFullBleed = context.select<SettingsState, bool>(
        (s) => s.fullBleedArtworkPlayer,
      );
    } catch (_) {
      isFullBleed = SettingsState.instance.fullBleedArtworkPlayer;
    }
    final player = context.read<PlayerState>();

    _syncTrack(track);
    _ensureBleed();
    _syncPlaying(_playing);

    // pre-mount the sheet once, so opening never builds it mid-animation
    _warmTimer ??= Timer(const Duration(milliseconds: 700), () {
      if (mounted) setState(() => _warm = true);
    });

    final mq = MediaQuery.of(context);
    final size = mq.size;
    final safe = mq.padding;
    _travel = size.height * _kSheetStartY; // sheet follows the finger 1:1

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
            _buildScrim(),
            _buildMini(player, track, safe),
            _buildSheet(player, track, size, safe, isFullBleed),
            _buildArtOverlay(player, track, size, safe, isFullBleed),
          ],
        ),
      ),
    );
  }

  Widget _buildScrim() => Positioned.fill(
    child: IgnorePointer(
      child: AnimatedBuilder(
        animation: _sheet,
        builder: (_, _) {
          final t = _sheet.value.clamp(0.0, 1.0);
          if (t <= 0.001) return const SizedBox.shrink();
          return ColoredBox(
            color: Colors.black.withValues(
              alpha: _kScrimMax * Curves.easeOut.transform(t),
            ),
          );
        },
      ),
    ),
  );

  /* ───────────────────────── MINI PLAYER (Apple Music glass pill) ───────────────────────── */

  double _miniOpacity(double t) {
    final x = (t / _kMiniFadeSpan).clamp(0.0, 1.0);
    return 1 - x * x * (3 - 2 * x);
  }

  _MiniGeo _miniGeo(EdgeInsets safe) => _MiniGeo(
    widget.dockProgress.clamp(0.0, 1.0),
    widget.miniBottomOffset + safe.bottom,
  );

  Widget _buildMini(PlayerState player, dynamic track, EdgeInsets safe) {
    final g = _miniGeo(safe);
    final dp = g.dp;
    final glyph = lerpDouble(22.0, 24.0, dp)!;

    final pill = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _openSheet(),
      onPanStart: _miniStart,
      onPanUpdate: _miniUpdate,
      onPanEnd: _miniEnd,
      onPanCancel: () => _miniEnd(DragEndDetails()),
      child: AppleGlass(
        borderRadius: BorderRadius.circular(g.h / 2),
        child: ListenableBuilder(
          listenable: LiquidGlassController.instance,
          builder: (context, _) {
            final fg = LiquidGlassController.instance.c.foreground;
            return Padding(
              // Balanced left inset for the capsule curve, perfectly aligned with artRect
              padding: EdgeInsets.only(left: g.insetLeft, right: 6),
              child: Row(
                children: [
                  Expanded(
                    child: AnimatedBuilder(
                      animation: _miniX,
                      builder: (_, _) => Transform.translate(
                        offset: Offset(_miniX.value, 0),
                        child: Row(
                          children: [
                            // The overlay draws the (single) cover while the
                            // sheet is open / opening, so this one hides then.
                            // It keeps its size, so the text never shifts.
                            AnimatedBuilder(
                              animation: _sheet,
                              builder: (_, child) => Opacity(
                                opacity: (_open || _sheet.value > 0.001)
                                    ? 0.0
                                    : 1.0,
                                child: child,
                              ),
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(
                                    _kRadiusMini,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: Colors.black.withValues(
                                        alpha: 0.24,
                                      ),
                                      blurRadius: 6,
                                      offset: const Offset(0, 1.5),
                                    ),
                                  ],
                                ),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(
                                    _kRadiusMini,
                                  ),
                                  child: SizedBox(
                                    width: g.art,
                                    height: g.art,
                                    child: _TrackMediaView(
                                      player: player,
                                      coverUrl:
                                          (track.coverUrl as String?) ?? '',
                                      isVideo: _isVideo,
                                      videoFit: BoxFit.cover,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: _kMiniGap),
                            Expanded(
                              child: RightEdgeFade(
                                child: _miniText(track, dp, fg),
                              ),
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
                      width: _kMiniBtn,
                      height: _kMiniBtn,
                      child: _PlayGlyph(
                        playing: _playing,
                        size: glyph,
                        color: fg,
                      ),
                    ),
                  ),
                  // next button: collapses to zero width in compact mode
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
                            width: _kMiniBtn,
                            height: _kMiniBtn,
                            child: Center(
                              child: SpringPop(
                                pulse: _nextPulse,
                                dx: 8,
                                scale: 0.14,
                                child: Icon(
                                  CupertinoIcons.forward_fill,
                                  color: fg,
                                  size: glyph,
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
            );
          },
        ),
      ),
    );

    return Positioned(
      left: g.side,
      right: g.side,
      bottom: g.bottom,
      height: g.h,
      child: AnimatedSlide(
        offset: widget.hideMini ? const Offset(0, 3.5) : Offset.zero,
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
                  opacity: widget.hideMini ? 0.0 : o,
                  child: Transform.translate(
                    offset: Offset(0, 14 * (1 - o)),
                    child: Transform.scale(
                      scale: 1 - 0.04 * (1 - o),
                      child: child,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _miniText(dynamic track, double dp, [Color color = Colors.white]) {
    final titleSize = lerpDouble(13.0, 14.5, dp)!;
    final artistSize = lerpDouble(11.5, 12.5, dp)!;

    final artistString = track is Track
        ? track.artist
        : MediaNormalizer.formatArtists(track?.artist?.toString());

    return Column(
      mainAxisSize: MainAxisSize.min,
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
            color: color,
            fontSize: titleSize,
            height: 1.2,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.2,
          ),
        ),
        SwapText(
          artistString,
          dir: _dir,
          style: TextStyle(
            fontFamily: 'SF Pro',
            color: color.withValues(alpha: 0.65),
            fontSize: artistSize,
            height: 1.2,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  /* ───────────────────────── ARTWORK OVERLAY (the ONE morphing cover) ───────────────────────── */

  Widget _buildArtOverlay(
    PlayerState player,
    dynamic track,
    Size size,
    EdgeInsets safe,
    bool isFullBleed,
  ) {
    final url =
        ((_shownCover?.isNotEmpty == true
            ? _shownCover
            : (track?.coverUrl as String?))) ??
        '';
    final currentKey = ValueKey<String>('cover-$url-${_isVideo ? 'v' : 'a'}');

    // exactly the pill's art slot (shared geometry)
    final mini = _miniGeo(safe).artRect(size);
    final targetBig = isFullBleed
        ? _bleedRect(size, safe)
        : _bigOrFallback(size, safe);
    final docked = Rect.fromLTWH(24, safe.top + 29, 56, 56);
    final side = targetBig.width; // laid out ONCE at this size

    final media = _TrackMediaView(
      player: player,
      coverUrl: url,
      isVideo: _isVideo,
      videoFit: BoxFit.contain,
    );

    final cover = RepaintBoundary(
      child: SizedBox(
        width: side,
        height: side,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          switchInCurve: Curves.easeOutCubic,
          switchOutCurve: Curves.easeIn,
          transitionBuilder: (child, anim) {
            final incoming = child.key == currentKey;
            return FadeTransition(
              opacity: anim,
              child: SlideTransition(
                position: Tween<Offset>(
                  begin: Offset((incoming ? 0.08 : -0.08) * _dir, 0),
                  end: Offset.zero,
                ).animate(anim),
                child: child,
              ),
            );
          },
          child: SizedBox.expand(
            key: currentKey,
            child: isFullBleed
                ? BleedArtworkImage(
                    art: _isVideo ? null : _bleedArt,
                    plain: media,
                    dock: _dock,
                    sheet: _sheet,
                  )
                : media,
          ),
        ),
      ),
    );

    // Static halo layers: only their OPACITY changes per frame, never their
    // geometry, so the blur is rasterised once instead of every frame.
    final glowColor =
        _bleedArt?.average ??
        (_palette.isNotEmpty ? _palette.first : const Color(0xFFB4123A));
    final glow = RepaintBoundary(
      child: Center(
        child: Container(
          width: side * 0.88,
          height: side * 0.88,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(side * 0.44),
            boxShadow: [
              BoxShadow(
                color: glowColor.withValues(alpha: 0.5),
                blurRadius: 60,
                spreadRadius: 8,
              ),
            ],
          ),
        ),
      ),
    );
    final shadow = RepaintBoundary(
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(side * 0.032),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.45),
              blurRadius: 36,
              offset: const Offset(0, 16),
            ),
          ],
        ),
      ),
    );

    return Positioned.fill(
      child: AnimatedBuilder(
        animation: Listenable.merge([_sheet, _dock, _pause, _artX, _press]),
        child: cover,
        builder: (context, child) {
          final t = _sheet.value.clamp(0.0, 1.0);
          if (!_open && t <= 0.001) return const SizedBox.shrink();

          final d = _dock.value.clamp(0.0, 1.0).toDouble();

          // ONE card, ONE path: mini -> (big | bleed | header).
          // Horizontal position + size lead (ease-out), vertical follows the
          // sheet linearly, so it tracks the finger and retraces on close.
          final tgt = Rect.lerp(targetBig, docked, d)!;
          final px = Curves.easeOutQuad.transform(t);
          final sp = (t + px) / 2;
          final cx = lerpDouble(mini.center.dx, tgt.center.dx, px)!;
          final cy = lerpDouble(mini.center.dy, tgt.center.dy, t)!;
          final rw = lerpDouble(mini.width, tgt.width, sp)!;

          final radius = lerpDouble(
            _kRadiusMini,
            lerpDouble(_kRadiusBig, _kRadiusDocked, d)!,
            t,
          )!;

          final pauseValue = isFullBleed ? 1.0 : _pause.value;
          final pressValue = isFullBleed ? 1.0 : _press.value;
          final pauseScale = (1 - (1 - pauseValue) * (1 - d) * t) * pressValue;
          final dx = _artX.value * t * (1 - d);

          final w = rw * pauseScale;
          final scale = w / side;
          final m = Matrix4.diagonal3Values(scale, scale, 1)
            ..setTranslationRaw(cx + dx - w / 2, cy - w / 2, 0);
          final r = radius / scale; // keep visual radius constant

          final haloO = isFullBleed
              ? ((1.0 - d) * t).clamp(0.0, 1.0)
              : ((lerpDouble(0.28, 0.45, t)! * (1 - 0.5 * d)) / 0.45).clamp(
                  0.0,
                  1.0,
                );

          final skipClip = isFullBleed && d < 0.05 && t > 0.9;

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
                        onTapDown: (_) {
                          if (!isFullBleed) {
                            _press.springTo(0.94, spring: _kPressSpring);
                          }
                        },
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
                        child: Stack(
                          clipBehavior: Clip.none,
                          children: [
                            if (haloO > 0.01)
                              Positioned.fill(
                                child: IgnorePointer(
                                  child: Opacity(
                                    opacity: haloO,
                                    child: isFullBleed ? glow : shadow,
                                  ),
                                ),
                              ),
                            skipClip
                                ? child!
                                : ClipRRect(
                                    borderRadius: BorderRadius.circular(r),
                                    child: child,
                                  ),
                          ],
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
    bool isFullBleed,
  ) {
    // Built ONCE per setState; the builder below reuses these instances.
    final backdrop = IgnorePointer(
      child: RepaintBoundary(
        child: Stack(
          fit: StackFit.expand,
          children: [
            const ColoredBox(color: Color(0xFF121214)),
            BleedBackdrop(
              art: _bakeFailed ? null : _bleedArt,
              pending:
                  !_bakeFailed && _bleedArt == null && _bleedUrl.isNotEmpty,
              fallback: _fallbackColors(),
              flow: true,
              isPlaying: _playing,
              positionNotifier: player.positionNotifier,
              duration: player.duration,
              // drift freezes while the sheet moves: all GPU goes to the motion
              paused: () => _dragging || _sheet.isAnimating,
            ),
            AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutCubic,
              color: Colors.black.withValues(
                alpha: _panel == _Panel.lyrics ? 0.0 : (_docked ? 0.26 : 0),
              ),
            ),
          ],
        ),
      ),
    );
    final column = RepaintBoundary(
      child: _sheetColumn(player, track, safe, size, isFullBleed),
    );

    return Positioned.fill(
      child: AnimatedBuilder(
        animation: _sheet,
        builder: (context, _) {
          final t = _sheet.value.clamp(0.0, 1.0).toDouble();
          final visible = _open || t > 0.001;
          if (!visible && !_warm) return const SizedBox.shrink();

          final y = (1 - t) * _travel; // starts 30% from bottom, 1:1 with the finger

          // Sheet opacity starts at 0 at the bottom (t = 0) and gradually increases,
          // reaching 1.0 (full opacity) when it reaches 80-85% (0.82) of screen height.
          final sheetOpacity = Curves.easeOutCubic.transform(
            (t / _kSheetFadeSpan).clamp(0.0, 1.0),
          );

          // corners stay round throughout travel, then straighten at the very top
          final corner = _kSheetRadius * (1 - _smooth((t - 0.88) / 0.12));

          final bool needsClip = corner > 0.5;
          final sheetBody = Stack(
            fit: StackFit.expand,
            children: [
              backdrop,
              column,
            ],
          );

          Widget content;
          if (needsClip) {
            content = ClipRRect(
              borderRadius: BorderRadius.vertical(
                top: Radius.circular(corner),
              ),
              clipBehavior: Clip.antiAlias,
              child: sheetBody,
            );
          } else {
            content = sheetBody;
          }

          if (sheetOpacity <= 0.001) {
            content = const SizedBox.shrink();
          } else if (sheetOpacity < 0.999) {
            content = Opacity(opacity: sheetOpacity, child: content);
          }

          return TickerMode(
            enabled: visible,
            child: Offstage(
              offstage: !visible,
              child: IgnorePointer(
                ignoring: t < 0.02,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () {}, // absorb taps: no click-through
                  child: Transform.translate(
                    offset: Offset(0, y),
                    child: content,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  /// Top stop is tiny so the first row (sync / shuffle / loop / automix)
  /// is never faded out.
  Widget _edgeFade(
    Widget child, {
    double topStop = 0.012,
    double bottomStop = 0.93,
  }) {
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
        stops: [0, topStop, bottomStop, 1],
      ).createShader(r),
      child: child,
    );
  }

  /// Scroll-to-dismiss: pulling a scrollable down past its top drags the sheet.
  Widget _dismissOnOverscroll(Widget child) {
    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (_reordering) return false;
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

  /// Lyrics fade completely out right above the seekbar, so nothing shows
  /// through behind the controls. When the controls idle-hide, the fade opens
  /// up to the bottom edge again (lyrics themselves never move).
  Widget _lyricsFade(Widget child) {
    return AnimatedBuilder(
      animation: _chrome,
      child: child,
      builder: (_, c) {
        final h = _chrome.value.clamp(0.0, 1.0).toDouble();
        final end = lerpDouble(_lyricsFadeEnd, 1.0, h)!;
        final start = lerpDouble(_lyricsFadeEnd - 0.08, 0.93, h)!;
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
            stops: [0, 0.02, start, end],
          ).createShader(r),
          child: c,
        );
      },
    );
  }

  Widget _panelBody(dynamic track) {
    switch (_bodyPanel) {
      case _Panel.art:
        // empty: the artwork itself is drawn (and animated) by the overlay
        return const SizedBox.expand(key: ValueKey('art'));
      case _Panel.lyrics:
        return RepaintBoundary(
          key: const ValueKey('lyrics-body'),
          child: KeyedSubtree(
            key: ValueKey('lyrics-$_trackKey'),
            child: NotificationListener<ScrollNotification>(
              onNotification: _onLyricsScroll,
              child: _dismissOnOverscroll(
                Padding(
                  padding: const EdgeInsets.fromLTRB(0, 2, 0, 0),
                  child: _lyricsFade(
                    TickerMode(
                      enabled:
                          (_open || _sheet.value > 0.05) &&
                          _panel == _Panel.lyrics,
                      child:
                          widget.lyricsBuilder?.call(context) ??
                          LyricsSheet(immersiveListenable: _lyricsImmersive),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      case _Panel.queue:
        return RepaintBoundary(
          key: const ValueKey('queue-body'),
          child: KeyedSubtree(
            key: const ValueKey('queue'),
            child: _dismissOnOverscroll(
              _edgeFade(
                QueuePanel(
                  onJumpTo: _jumpTo,
                  onPlayHistory: _playHistory,
                  onGoToArtist: widget.onGoToArtist,
                  onReorderingChanged: (v) => _reordering = v,
                ),
              ),
            ),
          ),
        );
    }
  }

  /// Fades [child] with the `_dock` spring. Opacity only: no layout happens
  /// during the glide, so the lyrics / queue never get resized mid-motion.
  Widget _dockFade({bool inverse = false, required Widget child}) {
    return AnimatedBuilder(
      animation: _dock,
      child: child,
      builder: (_, c) {
        final d = _dock.value.clamp(0.0, 1.0).toDouble();
        final f = inverse ? 1 - d : d;
        return IgnorePointer(
          ignoring: f < 0.6,
          child: Opacity(opacity: f, child: c),
        );
      },
    );
  }

  /// Glides the bottom controls away (and back) with the `_chrome` spring.
  /// Only opacity and a small downward offset change: layout never moves.
  Widget _chromeCollapse({required Widget child}) {
    return AnimatedBuilder(
      animation: _chrome,
      child: child,
      builder: (_, c) {
        final h = _chrome.value.clamp(0.0, 1.0).toDouble();
        return IgnorePointer(
          ignoring: h > 0.35,
          child: RepaintBoundary(
            child: Opacity(
              opacity: (1 - h * 1.15).clamp(0.0, 1.0),
              child: Transform.translate(offset: Offset(0, h * 26), child: c),
            ),
          ),
        );
      },
    );
  }

  /// Plain fade following `_chrome`.
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

  /// Soft shade behind the bottom controls (lyrics mode only). The backdrop
  /// is already blurred, so a plain gradient is enough and costs nothing
  /// (no BackdropFilter over scrolling lyrics).
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
            child: const RepaintBoundary(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0x00000000),
                      Color(0x40000000),
                      Color(0x80000000),
                    ],
                    stops: [0.0, 0.6, 1.0],
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
    bool isFullBleed,
  ) {
    final isLyrics = _panel == _Panel.lyrics;
    final isQueue = _panel == _Panel.queue;
    // layout follows the MOUNTED body, so a fading-out queue never jumps
    // over the controls while it disappears
    final isQueueBody = _bodyPanel == _Panel.queue;

    final blurH = 300.0 + safe.bottom;

    // Vertical rhythm (bottom → top), anchored above the last row:
    //
    //   [ last row: Studio FX · Lyrics · Queue ]
    //        ↕ _kRowGap
    //   [ Previous · Play/Pause · Next ]
    //        ↕ _kRowGap
    //   [ seekbar + times ]
    //        ↕ gMeta
    //   [ title / artist row ]   (art mode only)
    const gMeta = _kMetaGap;
    const transportH = _kTransportH;
    final blockBottomInset = _blockBottomInset(safe);
    const dockedBlockH = _kSeekH + _kRowGap + _kTransportH;
    final queueReserve = blockBottomInset + dockedBlockH + 8;

    // lyrics finish fading just above the seekbar
    final regionTop = safe.top + 97;
    final regionH = math.max(1.0, size.height - regionTop);
    final dockedControlsTop = size.height - blockBottomInset - dockedBlockH;
    _lyricsFadeEnd = ((dockedControlsTop - 4 - regionTop) / regionH)
        .clamp(0.5, 0.98)
        .toDouble();

    final middleRegion = Expanded(
      child: Padding(
        padding: EdgeInsets.only(
          top: isQueueBody ? 4 : 0,
          bottom: isQueueBody ? queueReserve : 0,
        ),
        child: SizedBox.expand(
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onVerticalDragStart: isQueueBody ? null : (_) => _dragStart(),
            onVerticalDragUpdate: isQueueBody
                ? null
                : (d) => _dragUpdate(d.delta.dy),
            onVerticalDragEnd: isQueueBody
                ? null
                : (d) => _dragEnd(d.velocity.pixelsPerSecond.dy),
            onVerticalDragCancel: isQueueBody ? null : () => _dragEnd(0),
            child: RepaintBoundary(
              child: _dockFade(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 200),
                  transitionBuilder: (c, a) =>
                      FadeTransition(opacity: a, child: c),
                  layoutBuilder: (cur, prev) =>
                      Stack(fit: StackFit.expand, children: [...prev, ?cur]),
                  child: _panelBody(track),
                ),
              ),
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

    // Fixed height, fades with the dock: the lyrics region below never moves.
    final compactHeader = _dockFade(child: _compactHeader(track));

    // Title row: fixed spot above the seekbar, fades out when the cover docks
    final meta = Positioned(
      left: 0,
      right: 0,
      bottom: blockBottomInset + dockedBlockH + gMeta,
      child: _chromeCollapse(
        child: _dockFade(
          inverse: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onVerticalDragStart: (_) => _dragStart(),
            onVerticalDragUpdate: (d) => _dragUpdate(d.delta.dy),
            onVerticalDragEnd: (d) => _dragEnd(d.velocity.pixelsPerSecond.dy),
            onVerticalDragCancel: () => _dragEnd(0),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 0),
              child: _rise(begin: 0.58, child: _metaRow(track)),
            ),
          ),
        ),
      ),
    );

    // Seekbar + transport: one fixed spot, identical in every mode.
    final controls = Positioned(
      left: 0,
      right: 0,
      bottom: blockBottomInset,
      child: _chromeCollapse(
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
                  begin: 0.64,
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
                          middleWidget: (!isLyrics && !isQueue)
                              ? Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 2.5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.16),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        CupertinoIcons.waveform,
                                        size: 11,
                                        color: Colors.white.withValues(
                                          alpha: 0.85,
                                        ),
                                      ),
                                      const SizedBox(width: 4),
                                      const Text(
                                        'Hi-Res Lossless',
                                        style: TextStyle(
                                          fontFamily: 'SF Pro',
                                          fontSize: 10,
                                          fontWeight: FontWeight.w600,
                                          color: Colors.white,
                                          letterSpacing: -0.2,
                                        ),
                                      ),
                                    ],
                                  ),
                                )
                              : null,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: _kRowGap),
                _rise(
                  begin: 0.70,
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 340),
                      child: SizedBox(
                        height: transportH,
                        child: _transport(player),
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
                  begin: 0.76,
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
        meta,
        controls,
        tools,
      ],
    );

    return Listener(
      behavior: HitTestBehavior.translucent,
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
            ListenableBuilder(
              listenable: LibraryStore.instance,
              builder: (context, _) => PopLikeButton(
                liked: LibraryStore.instance.isLikedId(track?.id?.toString() ?? _trackKey),
                onToggle: () => _toggleLike(track),
              ),
            ),
            const SizedBox(width: 8),
            PlayerMoreButton(
              onTap: () => _showTrackMenu(track),
              icon: CupertinoIcons.ellipsis_vertical,
            ),
          ],
        ),
      ),
    );
  }

  Widget _metaRow(dynamic track) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 1),
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
          ListenableBuilder(
            listenable: LibraryStore.instance,
            builder: (context, _) => PopLikeButton(
              liked: LibraryStore.instance.isLikedId(track?.id?.toString() ?? _trackKey),
              onToggle: () => _toggleLike(track),
            ),
          ),
          const SizedBox(width: 8),
          PlayerMoreButton(
            onTap: () => _showTrackMenu(track),
            icon: CupertinoIcons.ellipsis_vertical,
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
  const _PlayGlyph({
    required this.playing,
    required this.size,
    this.color = Colors.white,
  });
  final bool playing;
  final double size;
  final Color color;

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
            color: color,
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
