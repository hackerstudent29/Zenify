import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show lerpDouble;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
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
import 'xfade_layer.dart';
import '../../services/crossfade_controller.dart';
import '../details/artist_screen.dart';
import '../../design_system/widgets/interactive_artists_text.dart';
import '../../design_system/widgets/media_navigation_sheet.dart';
import '../../models/track.dart';
import '../../services/album_resolver.dart';
import '../../services/library_store.dart';
import '../../services/media_router.dart';
import '../../utils/media_normalizer.dart';
import '../shell_screen.dart' show ShellNavigationScope;

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

  // landscape: wide thumb (capped); portrait / square: square slot, content is cropped
  double artW(double ar) => ar > 1.08 ? math.min(art * ar, art * 1.8) : art;
  Rect artRect(Size size, [double ar = 1.0]) => Rect.fromLTWH(
    side + insetLeft,
    size.height - bottom - h + insetTop,
    artW(ar),
    art,
  );
}

class _WindowClipper extends CustomClipper<RRect> {
  _WindowClipper(this.window, this.radius);
  final Size window; // in the cover's LOCAL (pre-scale) coordinates
  final double radius;
  @override
  RRect getClip(Size box) {
    final w = math.min(box.width, window.width);
    final h = math.min(box.height, window.height);
    final maxR = math.min(w, h) / 2;
    return RRect.fromRectAndRadius(
      Rect.fromCenter(center: box.center(Offset.zero), width: w, height: h),
      Radius.circular(math.min(radius, maxR)),
    );
  }

  @override
  bool shouldReclip(_WindowClipper o) =>
      o.window != window || o.radius != radius;
}

double _clampAr(double ar) => ar.clamp(9 / 22, 22 / 9).toDouble();

/// Rotation morph start: same offset from the screen centre, size unchanged.
Rect _mapRect(Rect r, Size from, Size to) {
  if (from.isEmpty || to.isEmpty) return r;
  return Rect.fromCenter(
    center: to.center(Offset.zero) + (r.center - from.center(Offset.zero)),
    width: r.width,
    height: r.height,
  );
}

enum _Slot { meta, seek, transport, volume, tools, body }

class _SlotPose {
  const _SlotPose(this.u0, this.u1, this.s0);
  final Offset u0; // old centre, relative to the OLD screen centre
  final Offset u1; // new centre, relative to the NEW screen centre
  final double s0; // old size / new size
}

/// Approximate slot rects of the audio layouts (same numbers as
/// `_sheetColumn` / `_landscapeContent`). Only the START pose uses these,
/// so a few px of error never show: the morph always ends on the real layout.
Map<_Slot, Rect> _slotRects(Size size, EdgeInsets safe, bool land) {
  if (!land) {
    final bi = _blockBottomInset(safe);
    const dh = _kSeekH + _kRowGap + _kTransportH;
    final seekTop = size.height - bi - dh;
    final seekW = math.min(size.width - 48, 420.0);
    final trW = math.min(size.width - 48, 340.0);
    final toolW = math.min(size.width - 48, 260.0);
    return {
      _Slot.meta: Rect.fromLTWH(
        24,
        seekTop - _kMetaGap - _kMetaH,
        size.width - 48,
        _kMetaH,
      ),
      _Slot.seek: Rect.fromLTWH(
        (size.width - seekW) / 2,
        seekTop,
        seekW,
        _kSeekH,
      ),
      _Slot.transport: Rect.fromLTWH(
        (size.width - trW) / 2,
        seekTop + _kSeekH + _kRowGap,
        trW,
        _kTransportH,
      ),
      _Slot.tools: Rect.fromLTWH(
        (size.width - toolW) / 2,
        size.height - safe.bottom - 16 - 44,
        toolW,
        44,
      ),
      _Slot.body: Rect.fromLTRB(0, safe.top + 97, size.width, size.height),
    };
  }
  final art = _landscapeArtRect(size, safe);
  final pad = _landscapePad(size);
  final paneLeft = art.right + 40;
  final paneRight = math.max(safe.right + pad, size.width - paneLeft - 560);
  final paneW = size.width - paneLeft - paneRight;
  final top = art.top + 4;
  final ctrlH = math.max(0.0, art.bottom - top - 54);
  const metaH = 50.0;
  const volH = 28.0;
  final trH = (ctrlH * 0.30).clamp(68.0, 92.0).toDouble();
  final gap = math.max(0.0, (ctrlH - (metaH + _kSeekH + trH + volH)) / 3);
  final seekTop = top + metaH + gap;
  final trTop = seekTop + _kSeekH + gap;
  return {
    _Slot.meta: Rect.fromLTWH(paneLeft, top, paneW, metaH),
    _Slot.seek: Rect.fromLTWH(paneLeft, seekTop, paneW, _kSeekH),
    _Slot.transport: Rect.fromLTWH(paneLeft, trTop, paneW, trH),
    _Slot.volume: Rect.fromLTWH(paneLeft, trTop + trH + gap, paneW, volH),
    _Slot.tools: Rect.fromLTWH(
      paneLeft + (paneW - 196) / 2,
      art.bottom - 46,
      196,
      46,
    ),
    _Slot.body: Rect.fromLTRB(
      paneLeft,
      top,
      size.width - paneRight,
      art.bottom,
    ),
  };
}

/// Big card for a video (portrait). Fits inside the art region, centered.
Rect _videoBigRect(Size size, EdgeInsets safe, double ar) {
  final region = Rect.fromLTRB(
    16,
    safe.top + 63, // same top as _bigOrFallback
    size.width - 16,
    _bleedRect(size, safe).bottom, // same bottom as the full-bleed slot
  );
  double w = region.width;
  double h = w / ar;
  if (h > region.height) {
    h = region.height;
    w = h * ar;
  }
  return Rect.fromCenter(center: region.center, width: w, height: h);
}

/// Landscape video: the cover flies out to fill the whole screen (contain).
Rect _videoFullRect(Size size, double ar) {
  double w = size.width;
  double h = w / ar;
  if (h > size.height) {
    h = size.height;
    w = h * ar;
  }
  return Rect.fromCenter(center: size.center(Offset.zero), width: w, height: h);
}

/// Shared side margin in landscape (art's left edge == right pane's right edge).
double _landscapePad(Size size) => math.max(28.0, size.width * 0.06);

/// Landscape: big square artwork on the left, centred vertically (Apple Music).
Rect _landscapeArtRect(Size size, EdgeInsets safe) {
  final vPad = math.max(
    math.max(safe.top, safe.bottom),
    math.max(16.0, size.height * 0.075),
  );
  final side = math
      .min(size.height - vPad * 2, size.width * 0.46)
      .clamp(120.0, 640.0)
      .toDouble();
  final left = safe.left + _landscapePad(size);
  final top = (size.height - side) / 2;
  return Rect.fromLTWH(left, top, side, side);
}

/// Artwork corner radii (visual points, independent of the morph scale).
const double _kRadiusMini = 6;
const double _kRadiusBig = 12;
const double _kRadiusDocked = 7;

/// Auto-hide bottom controls after 3 seconds of inactivity in lyrics mode.
/// The countdown only starts once the lyrics are fully visible.
const Duration _kIdleHide = Duration(seconds: 3);

/// After the lyrics / queue appear, scroll notifications are ignored for this
/// long so the initial auto-scroll can never hide the controls.
const Duration _kPanelScrollGrace = Duration(milliseconds: 900);

/// Rotation morph: slightly under-damped (ζ≈0.73) so the cover overshoots a
/// hair and settles like a real object.
const SpringDescription _kRotSpring = SpringDescription(
  mass: 1,
  stiffness: 170,
  damping: 19,
);

/// `_dock` during a rotation: critically damped, no bounce.
const SpringDescription _kRotDockSpring = SpringDescription(
  mass: 1,
  stiffness: 190,
  damping: 27.6,
);

/// Landscape video fit <-> fill zoom.
const SpringDescription _kFillSpring = SpringDescription(
  mass: 1,
  stiffness: 260,
  damping: 26,
);

/// ±10s buttons / double-tap flash: lively kick with a bouncy return.
const SpringDescription _kSkipSpring = SpringDescription(
  mass: 0.7,
  stiffness: 300,
  damping: 13,
);

/// Cover docking spring (art <-> header). Critically damped: no bounce.
const SpringDescription _kDockSpring = SpringDescription(
  mass: 1,
  stiffness: 480,
  damping: 44, // ζ≈1
);

/// Sheet close spring. CRITICALLY damped (damping = 2·√stiffness). Softer than
/// before so the glide to the mini player is clearly visible (~0.35s) even
/// from a light flick, and it never undershoots below 0.
const SpringDescription _kCloseSpring = SpringDescription(
  mass: 1.0,
  stiffness: 220,
  damping: 29.7, // ζ≈1
);

/// Sheet open spring. Tiny settle, like iOS.
const SpringDescription _kOpenSpring = SpringDescription(
  mass: 1.0,
  stiffness: 380,
  damping: 37,
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

/// LANDSCAPE: controls <-> lyrics / queue swap. Critically damped (ζ≈1,
/// damping = 2·√stiffness): a soft, fast ease with zero overshoot.
const SpringDescription _kPanelSpring = SpringDescription(
  mass: 1,
  stiffness: 300,
  damping: 34.6,
);

/// LANDSCAPE video: controls show / hide. A hair under critical = a tiny
/// natural settle on the scale, none on the opacity (it is clamped).
const SpringDescription _kVideoUiSpring = SpringDescription(
  mass: 1,
  stiffness: 360,
  damping: 30,
);

/// The mini player pill is fully gone once the sheet is this far open.
const double _kMiniFadeSpan = 0.14;

/// Page dim behind the sheet (0..1 black) when fully open.
const double _kScrimMax = 0.6;

/// Where the sheet starts (fraction of screen height from top).
/// 0.70 means the sheet starts from 30% height of the screen from bottom.
const double _kSheetStartY = 0.70;

/// Sheet opacity: exactly 0% until the sheet has travelled _kSheetFadeStart,
/// then an ease-in (quadratic) ramp, reaching 100% only at _kSheetFadeEnd.
const double _kSheetFadeStart = 0.20;
const double _kSheetFadeEnd = 0.95;

/// Tap vs scroll threshold for the controls show / hide logic.
const double _kTapSlop = 18.0;

/// The parent (tab bar / dock) rebuilds on [PlayerShell.sheetProgress]. Every
/// publish = one parent rebuild in the middle of the animation, so only
/// publish in coarse steps (+ the end points).
const double _kPublishStep = 0.2;

/// Sheet progress below which the dock / tab bar is allowed to come back
/// DURING a close. 0.0 = only after the cover has fully landed in the mini
/// player (the dock's blurred glass then can't steal frames from the glide).
/// Raise it (e.g. 0.08) if you want the dock to return slightly earlier.
const double _kDockReturnAt = 0.0;

/// Lyrics / queue body: fades in only AFTER the cover has docked, and fades
/// out quickly. While the cover glides the body is not painted at all, so the
/// glide is just one image moving = buttery smooth.
const Duration _kBodyFadeIn = Duration(milliseconds: 240);
const Duration _kBodyFadeOut = Duration(milliseconds: 110);

double _smooth(double x) {
  final v = x.clamp(0.0, 1.0).toDouble();
  return v * v * (3 - 2 * v);
}

double _sheetAlpha(double t) {
  final x = ((t - _kSheetFadeStart) / (_kSheetFadeEnd - _kSheetFadeStart))
      .clamp(0.0, 1.0)
      .toDouble();
  return x * x;
}

/// The heavy body (lyrics / queue) is gone by the time the sheet is 70% open,
/// so a closing swipe never has to paint it while the cover flies down.
double _bodyAlpha(double t) => _smooth((t - 0.7) / 0.3);

/// Tap open/close have no finger momentum, so they use softer springs and
/// the cover flight stays visible. Drag releases keep the stiff ones.
const SpringDescription _kOpenTapSpring = SpringDescription(
  mass: 1.0,
  stiffness: 340,
  damping: 35,
);

/// Vertical gap used TWICE in the open sheet, so the rhythm is even.
const double _kRowGap = 56.0;

// Fixed heights of the open-sheet blocks.
const double _kSeekH = 52.0;
const double _kTransportH = 90.0; // height of the play / pause button box
const double _kMetaH = 50.0; // title + artist row (incl. its bottom padding)
const double _kMetaGap = 3.0; // gap between the title row and the seekbar

/// Distance from the screen bottom to the bottom of the seekbar / transport
/// block (= top of the last row + _kRowGap).
double _blockBottomInset(EdgeInsets safe) => 44.0 + 16 + safe.bottom + _kRowGap;

/// Where the full-bleed cover sits.
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
///  • `_sheet`  0 = docked mini, 1 = fully open. Drives the cover flight.
///  • `_dock`   0 = big artwork, 1 = artwork docked top-left in the header.
///    (PORTRAIT only: in landscape the cover never docks, it stays on the left.)
///  • `_bodyIn` 0 = lyrics / queue hidden, 1 = visible. Portrait: rises only
///    AFTER the cover has docked. Landscape: a spring cross-fade with the
///    controls on the right pane.
///  • `_chrome` 0 = bottom controls shown, 1 = hidden (lyrics idle / scroll).
///  • `_videoUiC` landscape video: 1 = controls shown, 0 = hidden.
///
/// PERFORMANCE RULES used everywhere below:
///  1. The widget tree NEVER changes shape while something animates.
///  2. Heavy bodies are mounted BEFORE the glide starts, invisible and
///     NOT PAINTED (Opacity 0 skips painting entirely).
///  3. While the cover glides / the sheet moves, lyrics tickers are muted and
///     nothing heavy is painted: the GPU only moves one cached image.
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
  late final AnimationController _bodyIn;
  late final AnimationController _chrome;
  late final AnimationController _artX;
  late final AnimationController _miniX;
  late final AnimationController _press;
  late final AnimationController _videoUiC; // landscape video controls
  late final AnimationController _rot; // rotation morph 0 -> 1
  late final AnimationController _fillC; // landscape video: 0 fit, 1 fill
  Rect? _rotFrom;
  Rect _curRect = Rect.zero; // where the cover REALLY is (after dock / morph)
  bool _rotPending =
      false; // rotation just happened: frame 1 keeps the old rect
  Size _lastSize = Size.zero;
  EdgeInsets _lastSafe = EdgeInsets.zero;
  bool _rotToLand = false; // direction of the running morph
  double _rotA0 = 0; // start angle of the morph (±90°)
  Map<_Slot, _SlotPose> _slotPose = {};
  Set<_Slot> _rotAppear = {}; // hidden before the turn: fade in while rotating
  bool _rotFromVideoLand = false; // leaving the black landscape video page

  /// Unclamped: lets the cover overshoot for a natural settle.
  double get _rotRaw => _rotPending ? 0.0 : _rot.value;

  /// Clamped + snapped to exactly 1.0 when settled (no permanent saveLayer).
  double get _rotV {
    if (_rotPending) return 0.0;
    final v = _rot.value;
    return v >= 0.998 ? 1.0 : v.clamp(0.0, 1.0).toDouble();
  }

  bool _rotInit = false, _landSeen = false;

  _Panel _bodyPanel = _Panel.art; // what is actually mounted in the middle
  Timer? _mountTimer;
  Timer? _closeSafetyTimer;

  // bumped on every skip so the prev / next icons can nudge with a spring
  final ValueNotifier<int> _prevPulse = ValueNotifier<int>(0);
  final ValueNotifier<int> _nextPulse = ValueNotifier<int>(0);

  // landscape video: ±10s buttons, double-tap skip, fit/fill, swipe-down exit
  final ValueNotifier<int> _skipBackPulse = ValueNotifier<int>(0);
  final ValueNotifier<int> _skipFwdPulse = ValueNotifier<int>(0);
  final ValueNotifier<_SkipFlash?> _skipFlash = ValueNotifier<_SkipFlash?>(
    null,
  );
  DateTime _flashAt = DateTime.fromMillisecondsSinceEpoch(0);
  DateTime _vidLastTap = DateTime.fromMillisecondsSinceEpoch(0);
  DateTime _vidChainUntil = DateTime.fromMillisecondsSinceEpoch(0);
  Timer? _vidTapTimer;
  bool _videoFill = false;
  double _vidScale = 1.0;
  double _vidDrag = 0.0;

  /// true while ANYTHING is moving (sheet, dock glide, body fade, drag,
  /// close). Used to mute the lyrics / queue tickers so the whole frame
  /// budget belongs to the motion.
  final ValueNotifier<bool> _dockGliding = ValueNotifier<bool>(false);

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

  bool _landscape = false;
  bool _videoUiShown = true;
  Timer? _videoUiTimer;

  bool _chromeHidden = false;
  bool _reordering = false;
  double _scrollAcc = 0;
  final ValueNotifier<bool> _lyricsImmersive = ValueNotifier<bool>(false);

  Timer? _idleTimer;
  int _activePointers = 0;
  bool _userScrolling = false; // finger is dragging (or flinging) a list
  Offset? _downPos;
  bool _pointerMoved = false;
  int _closeToken = 0;
  int _panelToken = 0;
  int _bodyToken = 0;
  bool _closing = false;
  bool _bodyShowing = false; // lyrics / queue body is (becoming) visible
  double _lastPublished = 0;
  bool _scrollGraceActive = false;
  Timer? _scrollGraceTimer;

  /// true when the body swap must be instant (art <-> panel). lyrics <-> queue
  /// keeps a short cross-fade.
  bool _instantSwap = true;

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
  int _bakeAttempts = 0;
  DateTime? _nextBakeRetryAt;
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
    _bodyIn = AnimationController.unbounded(vsync: this, value: 0);
    _chrome = AnimationController.unbounded(vsync: this, value: 0);
    _artX = AnimationController.unbounded(vsync: this, value: 0);
    _miniX = AnimationController.unbounded(vsync: this, value: 0);
    _press = AnimationController.unbounded(vsync: this, value: 1);
    _videoUiC = AnimationController.unbounded(vsync: this, value: 1);
    _rot = AnimationController.unbounded(vsync: this, value: 1);
    _fillC = AnimationController.unbounded(vsync: this, value: 0);
    _rot.addStatusListener(_onAnyStatus); // mutes lyrics tickers while morphing
    PlayerShell.openRequestNotifier.addListener(_onOpenRequested);
    _sheet.addListener(_publishProgress);
    _sheet.addListener(_syncDockVisibility);
    _sheet.addListener(_syncGlide);
    _sheet.addStatusListener(_onAnyStatus);
    _dock.addListener(_onDockTick);
    _dock.addStatusListener(_onAnyStatus);
    _bodyIn.addStatusListener(_onAnyStatus);
  }

  void _onAnyStatus(AnimationStatus _) => _syncGlide();

  /// Mutes lyrics / queue tickers while anything moves. NOTE: it must also
  /// listen to the STATUS of the controllers: the last tick of a spring
  /// still reports isAnimating == true, so without the status listener this
  /// would get stuck on "gliding".
  void _syncGlide() {
    final g =
        _dock.isAnimating ||
        _bodyIn.isAnimating ||
        _sheet.isAnimating ||
        _rot.isAnimating ||
        _closing ||
        _dragging;
    if (_dockGliding.value != g) _dockGliding.value = g;
  }

  /// The cover has (almost) docked: only NOW the lyrics / queue fade in.
  /// (Portrait only: in landscape the cover never docks.)
  void _onDockTick() {
    _syncGlide();
    if (_panel != _Panel.art && !_bodyShowing && _open && _dock.value > 0.9) {
      _showBody();
    }
  }

  /// Fades the lyrics / queue body in and starts the idle countdown only when
  /// it is fully visible (a laggy glide can no longer eat the 3 seconds).
  /// Landscape uses a critically damped SPRING (interruptible, carries
  /// velocity); portrait keeps the short timed fade.
  void _startScrollGrace() {
    _scrollGraceTimer?.cancel();
    _scrollGraceActive = true;
    _scrollGraceTimer = Timer(_kPanelScrollGrace, () {
      _scrollGraceActive = false;
    });
  }

  void _showBody() {
    if (_bodyShowing) return;
    _bodyShowing = true;
    _startScrollGrace();
    final token = ++_bodyToken;
    final Future<void> fut = _landscape
        ? _bodyIn.springTo(
            1.0,
            spring: _kPanelSpring,
            velocity: _bodyIn.velocity,
          )
        : _bodyIn.animateTo(1.0, duration: _kBodyFadeIn, curve: Curves.easeOut);
    fut.whenComplete(() {
      if (!mounted || token != _bodyToken || _panel == _Panel.art) return;
      if (_panel == _Panel.lyrics) _scheduleIdle();
    });
  }

  /// Landscape: let the heavy body build + lay out for two frames while it is
  /// invisible / unpainted, THEN spring it in. No jank on the first frame.
  Future<void> _warmThenShowBody(int token) async {
    for (var i = 0; i < 2; i++) {
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted || token != _panelToken) return;
    }
    if (_panel != _Panel.art) _showBody();
  }

  /// The dock / tab bar (blurred glass) must NOT animate back in while the
  /// sheet is still travelling down. See [_kDockReturnAt].
  void _syncDockVisibility() {
    if (_closing &&
        _sheet.value < _kDockReturnAt &&
        PlayerShell.isPlayerOpenNotifier.value) {
      PlayerShell.isPlayerOpenNotifier.value = false;
    }
  }

  /// Parent rebuilds on this: only publish coarse steps + the end points.
  void _publishProgress() {
    final v = _sheet.value.clamp(0.0, 1.0).toDouble();
    if ((v - _lastPublished).abs() < _kPublishStep && v != 0.0 && v != 1.0) {
      return;
    }
    _lastPublished = v;
    PlayerShell.sheetProgress.value = v;
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
    _sheet.removeListener(_syncDockVisibility);
    _sheet.removeListener(_syncGlide);
    _sheet.removeStatusListener(_onAnyStatus);
    _dock.removeListener(_onDockTick);
    _dock.removeStatusListener(_onAnyStatus);
    _bodyIn.removeStatusListener(_onAnyStatus);
    _rot.removeStatusListener(_onAnyStatus);
    _vidTapTimer?.cancel();
    _skipFlash.dispose();
    _skipBackPulse.dispose();
    _skipFwdPulse.dispose();
    _warmTimer?.cancel();
    _mountTimer?.cancel();
    _idleTimer?.cancel();
    _scrollGraceTimer?.cancel();
    _closeSafetyTimer?.cancel();
    _videoUiTimer?.cancel();
    _lyricsImmersive.dispose();
    _dockGliding.dispose();
    _prevPulse.dispose();
    _nextPulse.dispose();
    for (final c in [
      _sheet,
      _pause,
      _dock,
      _bodyIn,
      _chrome,
      _artX,
      _miniX,
      _press,
      _videoUiC,
      _rot,
      _fillC,
    ]) {
      c.dispose();
    }
    _preferredMode = _Panel.art;
    SystemChrome.setPreferredOrientations(const [DeviceOrientation.portraitUp]);
    super.dispose();
  }

  bool get _reduceMotion =>
      SettingsState.instance.reduceMotion ||
      (MediaQuery.maybeDisableAnimationsOf(context) ?? false);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final s = MediaQuery.sizeOf(context);
    final pad = MediaQuery.paddingOf(context);
    final l = s.width > s.height;
    if (_rotInit && l != _landSeen && _open && _curRect != Rect.zero) {
      _planRotation(_lastSize, _lastSafe, _landSeen, s, pad, l);
      _rotFrom = _mapRect(_curRect, _lastSize, s);
      _rotToLand = l;
      _rotFromVideoLand = _isVideo && !l;
      _rotPending = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _rotPending = false;
        _resetVideoForRotation(l);
        if (_reduceMotion) {
          _rotFrom = null;
          _rot.value = 1;
          return;
        }
        _rot.value = 0;
        _rot.springTo(1, spring: _kRotSpring).whenComplete(() {
          if (!mounted || _rot.isAnimating) return;
          _rotFrom = null;
          _rot.value = 1;
        });
      });
    }
    _landSeen = l;
    _lastSize = s;
    _lastSafe = pad;
    _rotInit = true;
  }

  /// Works out where every component sat in the OLD layout once the whole
  /// screen is turned 90° into the new window.
  void _planRotation(
    Size oldS,
    EdgeInsets oldSafe,
    bool oldLand,
    Size newS,
    EdgeInsets newSafe,
    bool newLand,
  ) {
    final oldC = oldS.center(Offset.zero);
    final newC = newS.center(Offset.zero);
    // Which way the phone was turned: the notch / cutout side is the hint.
    // If the spin looks backwards on your device, flip `leftTurn`.
    final leftTurn = newLand
        ? newSafe.left >= newSafe.right
        : oldSafe.left >= oldSafe.right;
    _rotA0 = (newLand ? 1.0 : -1.0) * (leftTurn ? 1.0 : -1.0) * math.pi / 2;

    _slotPose = {};
    if (!_isVideo) {
      final o = _slotRects(oldS, oldSafe, oldLand);
      final n = _slotRects(newS, newSafe, newLand);
      n.forEach((k, b) {
        final a = o[k];
        if (a == null || a.isEmpty || b.isEmpty) return;
        _slotPose[k] = _SlotPose(
          a.center - oldC,
          b.center - newC,
          math
              .sqrt((a.width * a.height) / (b.width * b.height))
              .clamp(0.6, 1.6)
              .toDouble(),
        );
      });
    }
    final inPanel = _panel != _Panel.art;
    _rotAppear = {
      if (!newLand && inPanel) ...[_Slot.seek, _Slot.transport],
      if (newLand && inPanel) _Slot.meta,
    };
  }

  _Slot? _slotOf(double b) {
    if (b == 0.58) return _Slot.meta;
    if (b == 0.64) return _Slot.seek;
    if (b == 0.70) return _Slot.transport;
    if (b == 0.74) return _Slot.volume;
    if (b == 0.76) return _Slot.tools;
    return null;
  }

  /// Turns [child] from its place in the OLD layout (screen rotated 90°)
  /// into its real place. The path is an arc around the screen centre, the
  /// angle follows the (slightly under-damped) spring. Constant tree shape.
  Widget _applyMorph(_Slot? slot, Widget child) {
    final pose = slot == null ? null : _slotPose[slot];
    final t = _rotFrom == null
        ? 0.0
        : 1.0 - _rotRaw; // 1 -> 0 (< 0 = overshoot)
    var m = Matrix4.identity();
    var op = 1.0;
    if (t != 0.0) {
      if (pose != null) {
        final ang = _rotA0 * t;
        final v = pose.u1 + (pose.u0 - pose.u1) * t;
        final cs = math.cos(ang), sn = math.sin(ang);
        final rv = Offset(v.dx * cs - v.dy * sn, v.dx * sn + v.dy * cs);
        final d = rv - pose.u1;
        final sc = 1 + (pose.s0 - 1) * t;
        m =
            Matrix4.translationValues(d.dx, d.dy, 0) *
            Matrix4.rotationZ(ang) *
            Matrix4.diagonal3Values(sc, sc, 1);
      }
      if (pose == null || (slot != null && _rotAppear.contains(slot))) {
        op = _smooth((_rotV - 0.15) / 0.6);
      }
    }
    return Opacity(
      opacity: op,
      child: Transform(
        alignment: Alignment.center,
        transform: m,
        child: RepaintBoundary(child: child),
      ),
    );
  }

  void _resetVideoForRotation(bool toLand) {
    _videoFill = false;
    _fillC.value = 0;
    _vidTapTimer?.cancel();
    _videoUiTimer?.cancel();
    if (toLand && _isVideo) {
      _videoUiShown = false; // controls spring in once the video has landed
      _videoUiC.value = 0;
      _pokeVideoUi();
    }
  }

  /// 0..1 progress of the rotation morph for a block that starts at [begin].
  double _rotStage(double begin) {
    final r = _rotV;
    if (r >= 1.0) return 1.0;
    return Curves.easeOutCubic.transform(
      ((r - begin) / (1 - begin)).clamp(0.0, 1.0).toDouble(),
    );
  }

  /// Controls arrive from the right going to landscape, from below going
  /// to portrait.
  Offset _rotSlide(double stage) =>
      _rotToLand ? Offset(40 * (1 - stage), 0) : Offset(0, 32 * (1 - stage));

  /// Constant tree shape: always Opacity + Transform (state is never lost).
  Widget _rotReveal({
    required double begin,
    bool slide = true,
    required Widget child,
  }) {
    return AnimatedBuilder(
      animation: _rot,
      child: child,
      builder: (_, c) {
        final s = _rotStage(begin);
        return Opacity(
          opacity: s,
          child: Transform.translate(
            offset: slide ? _rotSlide(s) : Offset.zero,
            child: c,
          ),
        );
      },
    );
  }

  /* ───────────────────────── sync with player ───────────────────────── */

  void _applyBleed(BleedArtwork art) {
    _bleedArt = art;
    _bakeFailed = false;
    _bakeAttempts = 0;
    _nextBakeRetryAt = null;
  }

  /// Makes sure the current cover is baked in both modes.
  /// Safe to call from build(): it never calls setState synchronously.
  void _ensureBleed() {
    if (_bleedUrl.isEmpty) return;
    if (_bleedArt?.key == _bleedUrl || _bakingUrl == _bleedUrl) return;
    if (_bakeFailed) {
      final retryAt = _nextBakeRetryAt;
      if (_bakeAttempts >= 3 ||
          retryAt == null ||
          DateTime.now().isBefore(retryAt)) {
        return;
      }
    }

    final cached =
        BleedArtworkService.instance.peek(_bleedUrl) ??
        BleedArtworkService.instance.peek(_shownCover ?? '');
    if (cached != null) {
      _applyBleed(
        cached.key == _bleedUrl
            ? cached
            : BleedArtwork(
                key: _bleedUrl,
                image: cached.image,
                backdrop: cached.backdrop,
                average: cached.average,
                scrim: cached.scrim,
              ),
      );
      return;
    }

    final url = _bleedUrl;
    final fallbackUrl = _shownCover;
    final provider =
        BleedArtworkService.providerForUrl(url) ??
        CachedNetworkImageProvider(url);
    _bakingUrl = url;
    _bakeAttempts++;
    BleedArtworkService.instance
        .load(url, provider, fallbackUrl: fallbackUrl)
        .then((art) {
          if (_bakingUrl == url) _bakingUrl = null;
          if (!mounted || _bleedUrl != url) return;
          setState(() {
            if (art != null) {
              _applyBleed(art);
            } else {
              _bakeFailed = true;
              _nextBakeRetryAt = _bakeAttempts < 3
                  ? DateTime.now().add(Duration(seconds: 3 * _bakeAttempts))
                  : null;
            }
          });
        });
  }

  void _syncTrack(dynamic track) {
    final key = '${track.title}|${track.artist}|${track.coverUrl}';
    if (key == _trackKey) return;
    _trackKey = key;
    final url = (track.coverUrl as String?) ?? '';
    final trackId = track.id?.toString();
    _bleedUrl = MediaNormalizer.upgradeArtworkUrl(url, videoId: trackId);
    _shownCover = url.isNotEmpty ? url : _bleedUrl;
    _bakeFailed = false;
    _bakeAttempts = 0;
    _nextBakeRetryAt = null;
    final peeked =
        BleedArtworkService.instance.peek(_bleedUrl) ??
        BleedArtworkService.instance.peek(url);
    _bleedArt = (peeked != null && peeked.key != _bleedUrl)
        ? BleedArtwork(
            key: _bleedUrl,
            image: peeked.image,
            backdrop: peeked.backdrop,
            average: peeked.average,
            scrim: peeked.scrim,
          )
        : peeked;
    _bakingUrl = null;

    // Synchronously check if palette is already cached for immediate color switch (<16ms)
    final cachedPalette = peekPalette(url) ?? peekPalette(_bleedUrl);
    if (cachedPalette != null && cachedPalette.isNotEmpty) {
      _palette = cachedPalette;
      _paletteReady = true;
    } else {
      _paletteReady = false;
    }

    // Immediately trigger fast background palette extraction & bleed baking in parallel
    final paletteUrl = url.isNotEmpty ? url : _bleedUrl;
    if (paletteUrl.isNotEmpty) {
      extractPalette(paletteUrl).then((p) {
        if (mounted && p != null && _trackKey == key) {
          setState(() {
            _palette = p;
            _paletteReady = true;
          });
        }
      });
    }
    if (_bleedUrl.isNotEmpty) {
      _ensureBleed();
    }

    // Follow the user's active player mode (e.g. lyrics mode) for the next song too
    if (_open && _preferredMode == _Panel.lyrics && _panel != _Panel.lyrics) {
      _panel = _Panel.lyrics;
      _bodyPanel = _Panel.lyrics;
      _bodyShowing = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _dock.value = _landscape ? 0.0 : 1.0; // landscape never docks
        _bodyIn.value = 1.0;
      });
    }

    if (_panel == _Panel.lyrics) _scheduleIdle();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      final queue = context.read<QueueState>();
      queue.syncCurrent(track);

      // Pre-warm next track's artwork and palette in queue for zero-latency 0ms transitions:
      if (queue.hasNext) {
        final nextTrack = queue.upNext.first.track;
        final nextCover = nextTrack.coverUrl;
        final nextBleed = MediaNormalizer.upgradeArtworkUrl(
          nextCover,
          videoId: nextTrack.id,
        );
        if (nextBleed.isNotEmpty) {
          unawaited(extractPalette(nextCover.isNotEmpty ? nextCover : nextBleed));
          final nextProv =
              BleedArtworkService.providerForUrl(nextBleed) ??
              CachedNetworkImageProvider(nextBleed);
          unawaited(
            BleedArtworkService.instance.load(
              nextBleed,
              nextProv,
              fallbackUrl: nextCover,
            ),
          );
        }
      }

      if (url.isNotEmpty) {
        unawaited(precacheImage(CachedNetworkImageProvider(url), context));
      }
      if (!mounted || _trackKey != key) return;
      if (_shownCover != url) {
        setState(() => _shownCover = url);
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
      final page = ArtistScreen(artistName: artistName, browseId: browseId);
      if (!ShellNavigationScope.openPage(context, page)) {
        Navigator.push(context, ZenPageRoute(builder: (_) => page));
      }
    }
  }

  void _openAlbum(dynamic track) {
    _close();
    if (widget.onGoToAlbum != null) {
      widget.onGoToAlbum!(track);
    } else if (track is Track) {
      MediaRouter.openForTrack(context, track, useShellTab: true);
    } else if (track != null) {
      final isVid = AlbumResolver.isVideoContext(
        isVideo: false,
        title: track?.title?.toString(),
        album: track?.album?.toString(),
        coverUrl: track?.coverUrl?.toString(),
      );
      MediaRouter.openRelease(
        context,
        albumTitle: isVid
            ? (track?.title?.toString() ?? 'Music Video')
            : ((track?.album as String?)?.isNotEmpty == true
                  ? track!.album!.toString()
                  : (track?.title?.toString() ?? 'Single')),
        artistName: track?.artist?.toString() ?? 'Artist',
        coverUrl: track?.coverUrl?.toString(),
        isVideo: isVid,
        isSingle: isVid,
        useShellTab: true,
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
    final isVid = AlbumResolver.isVideoTrack(effectiveTrack);

    MediaNavigationSheet.show(
      context: context,
      track: effectiveTrack,
      showAlbum: !isVid,
      isVideo: isVid,
      landscape: _landscape,
    );
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

  /// Landscape video: seek ±[seconds] (clamped to the track).
  void _skip(int seconds, {bool gesture = false}) {
    final p = context.read<PlayerState>();
    final Duration cur = p.positionNotifier.value;
    final Duration total = (p.duration as Duration?) ?? Duration.zero;
    var t = cur + Duration(seconds: seconds);
    if (t < Duration.zero) t = Duration.zero;
    if (total > Duration.zero && t > total) t = total;
    (seconds < 0 ? _skipBackPulse : _skipFwdPulse).value++;
    HapticFeedback.selectionClick();
    p.seek(t);
    if (gesture) {
      _flashSkip(seconds);
    } else {
      _pokeVideoUi();
    }
  }

  /// "10 seconds" burst on the tapped half; chained taps accumulate.
  void _flashSkip(int seconds) {
    final side = seconds < 0 ? -1 : 1;
    final now = DateTime.now();
    final prev = _skipFlash.value;
    final chain =
        prev != null &&
        prev.side == side &&
        now.difference(_flashAt) < const Duration(milliseconds: 900);
    _flashAt = now;
    _skipFlash.value = _SkipFlash(
      side,
      chain ? prev.secs + seconds.abs() : seconds.abs(),
      (prev?.tick ?? 0) + 1,
    );
  }

  /// Tap = show / hide controls. Double-tap (or keep tapping) on the left /
  /// right third = ∓10s. The hide is delayed ~290ms so a double-tap never
  /// flickers the controls.
  void _onVideoTapUp(Offset pos, Size size) {
    final now = DateTime.now();
    final third = size.width / 3;
    final side = pos.dx < third ? -1 : (pos.dx > size.width - third ? 1 : 0);
    final dbl = now.difference(_vidLastTap) < const Duration(milliseconds: 280);
    final chain = now.isBefore(_vidChainUntil);
    _vidLastTap = now;
    if (side != 0 && (dbl || chain)) {
      _vidTapTimer?.cancel();
      _vidChainUntil = now.add(const Duration(milliseconds: 650));
      _skip(side * 10, gesture: true);
      return;
    }
    if (_videoUiShown) {
      _vidTapTimer?.cancel();
      _vidTapTimer = Timer(const Duration(milliseconds: 290), () {
        if (mounted) _setVideoUi(false);
      });
    } else {
      _pokeVideoUi();
    }
  }

  void _toggleFill() {
    _videoFill = !_videoFill;
    HapticFeedback.selectionClick();
    _fillC.springTo(
      _videoFill ? 1.0 : 0.0,
      spring: _kFillSpring,
      velocity: _fillC.velocity,
    );
    if (_videoUiShown) _pokeVideoUi();
  }

  /* ───────────── landscape video controls (spring show / hide) ───────────── */

  void _setVideoUi(bool show) {
    _videoUiShown = show;
    _videoUiTimer?.cancel();
    _videoUiC.springTo(
      show ? 1.0 : 0.0,
      spring: _kVideoUiSpring,
      velocity: _videoUiC.velocity,
    );
  }

  /// Shows the controls and (re)starts the 3s auto-hide. [toggle] = a tap on
  /// the video: hides them when they are already visible.
  void _pokeVideoUi({bool toggle = false}) {
    if (toggle && _videoUiShown) {
      _setVideoUi(false);
      return;
    }
    if (!_videoUiShown) _setVideoUi(true);
    _videoUiTimer?.cancel();
    _videoUiTimer = Timer(const Duration(seconds: 3), () {
      if (!mounted) return;
      final isScrubbing = context.read<PlayerState>().scrubbingNotifier.value;
      if (isScrubbing) {
        _pokeVideoUi();
        return;
      }
      if (_playing) _setVideoUi(false);
    });
  }

  void _expandVideoToLandscape() {
    HapticFeedback.lightImpact();
    SystemChrome.setPreferredOrientations(const [
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
  }

  void _exitLandscapeToPortrait() {
    HapticFeedback.lightImpact();
    SystemChrome.setPreferredOrientations(const [DeviceOrientation.portraitUp]);
    Future.delayed(const Duration(milliseconds: 600), () {
      if (mounted && _open && !_landscape) {
        SystemChrome.setPreferredOrientations(const [
          DeviceOrientation.portraitUp,
          DeviceOrientation.landscapeLeft,
          DeviceOrientation.landscapeRight,
        ]);
      }
    });
  }

  /* ───────────────────────── sheet motion ───────────────────────── */

  void _openSheet({double velocity = 0}) {
    HapticFeedback.lightImpact();
    try {
      context.read<PlayerState>().syncPositionNow();
    } catch (_) {}
    SystemChrome.setPreferredOrientations(const [
      DeviceOrientation.portraitUp,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    _closeToken++; // cancels any pending close finalizer
    _closeSafetyTimer?.cancel();
    _closing = false;
    if (_bleedArt == null && _bakingUrl == null && _bleedUrl.isNotEmpty) {
      _bakeFailed = false;
      _bakeAttempts = 0;
      _nextBakeRetryAt = null;
      _ensureBleed();
    }
    PlayerShell.isPlayerOpenNotifier.value = true;
    final restoreLyrics = _preferredMode == _Panel.lyrics;
    if (!_open) {
      setState(() {
        _open = true;
        if (restoreLyrics) {
          _panel = _Panel.lyrics;
          _bodyPanel = _Panel.art;
          _dock.value = _landscape ? 0.0 : 1.0; // landscape never docks
        }
      });
    }
    if (_isVideo && _landscape) {
      _videoUiShown = false; // force a fresh reveal
      _videoUiC.value = 0;
      _pokeVideoUi();
    }
    if (_reduceMotion) {
      _sheet.value = 1;
      if (mounted && _panel == _Panel.lyrics) {
        if (_bodyPanel != _Panel.lyrics) {
          setState(() {
            _instantSwap = true;
            _bodyPanel = _Panel.lyrics;
          });
        }
        _showBody();
      }
      return;
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
          if (!mounted || _panel != _Panel.lyrics) return;
          if (_bodyPanel != _Panel.lyrics) {
            setState(() {
              _instantSwap = true;
              _bodyPanel = _Panel.lyrics;
            });
          }
          // sheet has landed: now the lyrics fade in (idle timer starts after)
          _showBody();
        });
  }

  void _close({double velocity = 0}) {
    if (!_open && _sheet.value <= 0.001) {
      PlayerShell.isPlayerOpenNotifier.value = false;
      SystemChrome.setPreferredOrientations(const [
        DeviceOrientation.portraitUp,
      ]);
      return;
    }
    _closing = true;
    _mountTimer?.cancel();
    _idleTimer?.cancel();
    _scrollGraceTimer?.cancel();
    _closeSafetyTimer?.cancel();
    _videoUiTimer?.cancel();
    _panelToken++; // cancels a pending panel warm-up
    _activePointers = 0;
    _userScrolling = false;
    _scrollAcc = 0;

    _chromeHidden = false;
    _lyricsImmersive.value = false;
    if (_chrome.value != 0) _chrome.springTo(0, spring: kSnappySpring);
    if (_dock.value != 0) _dock.springTo(0, spring: _kCloseSpring);
    _syncGlide();

    final token = ++_closeToken;
    if (_reduceMotion) {
      _sheet.value = 0;
      _finishClose(token);
      return;
    }
    final rawV = velocity != 0 ? velocity : _sheet.velocity;
    // Always carry some downward momentum (so a light flick never creeps),
    // but clamp it so the critically damped spring can't overshoot past 0.
    final v = math.min(rawV, -0.9).clamp(-14.0, -0.9).toDouble();

    late void Function() settleListener;
    settleListener = () {
      if (!_closing || token != _closeToken) {
        _sheet.removeListener(settleListener);
        return;
      }
      // Instant cutoff near bottom: prevents creeping/stalling at the asymptote
      if (_sheet.value <= 0.02) {
        _sheet.removeListener(settleListener);
        _sheet.stop();
        _sheet.value = 0;
        _finishClose(token);
      }
    };
    _sheet.addListener(settleListener);

    _sheet
        .springTo(
          0,
          spring: const SpringDescription(
            mass: 0.9,
            stiffness: 340,
            damping: 32,
          ),
          velocity: v,
        )
        .then((_) {
          _sheet.removeListener(settleListener);
          _finishClose(token);
        });

    // Safety net: force close after 650ms max so it can NEVER get stuck
    Timer(const Duration(milliseconds: 650), () {
      if (!mounted || token != _closeToken) return;
      if (_open || _sheet.value.abs() > 0.0005) {
        _sheet.removeListener(settleListener);
        _sheet.stop();
        _sheet.value = 0;
        _finishClose(token);
      }
    });
  }

  void _finishClose(int token) {
    if (!mounted || token != _closeToken || !_closing) return;
    _closeSafetyTimer?.cancel();
    _closing = false;
    _bodyToken++;
    _bodyShowing = false;
    _bodyIn.value = 0;
    _dock.value = 0;
    _chrome.value = 0;
    _chromeHidden = false;
    _lyricsImmersive.value = false;
    _artX.value = 0;
    setState(() {
      _open = false;
      _panel = _Panel.art;
      _bodyPanel = _Panel.art;
      _instantSwap = true;
    });
    _syncGlide();
    SystemChrome.setPreferredOrientations(const [DeviceOrientation.portraitUp]);
    // Give the dock / tab bar back one frame AFTER the cover has landed, so
    // its glass animation never competes with the close glide.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || token != _closeToken) return;
      PlayerShell.isPlayerOpenNotifier.value = false;
    });
  }

  void _dragStart() {
    _sheet.stop();
    _closeToken++; // a drag takes over from any running close
    _closeSafetyTimer?.cancel();
    _closing = false;
    _dragging = true;
    _startedClosed = !_open;
    if (_startedClosed) {
      SystemChrome.setPreferredOrientations(const [
        DeviceOrientation.portraitUp,
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
    }
    _syncGlide();
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
    if (_startedClosed) {
      target = vy < -40 || vt > 0.06 || t > 0.15 || _miniAcc.dy < -18;
    } else {
      // close only on a real downward pull (>28% travelled) or a fast downward flick
      target = vy < -120 || vt > 0.12 || (t > 0.72 && vy < 900);
    }
    target ? _openSheet(velocity: vt) : _close(velocity: vt);
  }

  /* ───────────────────────── panels (art / lyrics / queue) ───────────────────────── */

  void _setPanel(_Panel p) {
    if (_isVideo && p == _Panel.lyrics)
      return; // Completely blocked for video songs
    if (p == _Panel.lyrics || p == _Panel.art) {
      _preferredMode = p;
    }
    if (_panel == p) return;
    HapticFeedback.selectionClick();
    _mountTimer?.cancel();
    final token = ++_panelToken;
    final wasDocked = _docked;
    _scrollGraceTimer?.cancel();
    _scrollGraceActive = p != _Panel.art;

    // Mount the new body NOW. It is invisible AND not painted (_bodyIn == 0),
    // so the expensive build / layout happens BEFORE any motion starts.
    setState(() {
      _panel = p;
      _instantSwap = p == _Panel.art || !wasDocked;
      if (p != _Panel.art) _bodyPanel = p;
    });

    _scrollAcc = 0;
    _userScrolling = false;
    _activePointers = 0;
    _idleTimer?.cancel();
    _showChrome(); // every panel switch starts with the controls visible

    // ── LANDSCAPE: the cover stays on the left, only the right pane swaps.
    // One spring on `_bodyIn` drives the whole cross-fade (controls scale /
    // fade out, body lifts / fades in). Interruptible, velocity-carrying.
    if (_landscape) {
      if (p == _Panel.art) {
        _bodyShowing = false;
        _bodyToken++;
        _bodyIn.springTo(
          0.0,
          spring: _kPanelSpring,
          velocity: _bodyIn.velocity,
        );
        // unmount the old body only after it has fully faded out
        _mountTimer = Timer(const Duration(milliseconds: 600), () {
          if (mounted && _panel == _Panel.art && _bodyPanel != _Panel.art) {
            setState(() => _bodyPanel = _Panel.art);
          }
        });
      } else if (_bodyShowing) {
        // lyrics <-> queue: short cross-fade handled by the AnimatedSwitcher
        _startScrollGrace();
        if (p == _Panel.lyrics) _scheduleIdle();
      } else {
        _warmThenShowBody(token);
      }
      return;
    }

    if (p == _Panel.art) {
      // body fades out FAST (it is the only heavy thing), cover glides back.
      _bodyShowing = false;
      _bodyToken++;
      _bodyIn.animateTo(0.0, duration: _kBodyFadeOut, curve: Curves.easeIn);
      // unmount the old body only after it has fully faded out
      _mountTimer = Timer(const Duration(milliseconds: 500), () {
        if (mounted && _panel == _Panel.art && _bodyPanel != _Panel.art) {
          setState(() => _bodyPanel = _Panel.art);
        }
      });
      _dock.springTo(0, spring: _kDockSpring, velocity: _dock.velocity);
      return;
    }

    if (wasDocked) {
      // lyrics <-> queue: the cover is already docked, just cross-fade.
      if (!_bodyShowing) {
        _showBody();
      } else {
        _startScrollGrace();
      }
      _dock.springTo(1, spring: _kDockSpring, velocity: _dock.velocity);
      if (p == _Panel.lyrics) _scheduleIdle();
      return;
    }

    // art -> lyrics / queue: let the heavy body build + layout first, then
    // glide. The body itself fades in only after the cover has docked.
    _warmThenGlide(token);
  }

  Future<void> _warmThenGlide(int token) async {
    for (var i = 0; i < 2; i++) {
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted || token != _panelToken) return;
    }
    _dock.springTo(1, spring: _kDockSpring, velocity: _dock.velocity);
  }

  void _togglePanel(_Panel p) {
    if (_isVideo && p == _Panel.lyrics)
      return; // Completely blocked for video songs
    _setPanel(_panel == p ? _Panel.art : p);
  }

  /* ───────────── controls show / hide: ONE intent model ─────────────
   *
   * 1. A finger touching / moving NEVER shows the controls. Only a real tap
   *    (no movement) while they are hidden reveals them.
   * 2. Scroll direction decides (lyrics AND queue), but ONLY for scrolls
   *    that were started by a finger. Auto-scroll is ignored entirely.
   * 3. The 3s idle timer is lyrics-only. It starts only once the lyrics are
   *    fully visible, and only runs while no finger is down and no user
   *    scroll / fling is in progress.
   */

  bool get _chromeCapable => _panel == _Panel.lyrics || _panel == _Panel.queue;

  void _showChrome() {
    if (!_chromeHidden && _chrome.value <= 0.01) return;
    _chromeHidden = false;
    _lyricsImmersive.value = false;
    _chrome.springTo(0, spring: kSnappySpring, velocity: _chrome.velocity);
  }

  void _setChromeHidden(bool hide) {
    if (!_chromeCapable) return;
    if (!hide) {
      _showChrome();
      return;
    }
    if (_chromeHidden) return;
    _chromeHidden = true;
    _idleTimer?.cancel();
    _lyricsImmersive.value = _panel == _Panel.lyrics;
    _chrome.springTo(1, spring: kSoftSpring, velocity: _chrome.velocity);
  }

  /// (Re)starts the 3s idle countdown. Lyrics only, only while shown, and
  /// only once the lyrics body is actually visible.
  void _scheduleIdle() {
    _idleTimer?.cancel();
    if (_panel != _Panel.lyrics || _chromeHidden || !_bodyShowing) return;
    _idleTimer = Timer(_kIdleHide, _hideChrome);
  }

  void _hideChrome() {
    if (!mounted || _panel != _Panel.lyrics || _chromeHidden) return;
    if (_dragging ||
        _activePointers > 0 ||
        _userScrolling ||
        _dock.isAnimating ||
        _bodyIn.isAnimating ||
        _sheet.isAnimating) {
      _idleTimer = Timer(const Duration(seconds: 1), _hideChrome);
      return;
    }
    _setChromeHidden(true);
  }

  void _onPointerDown(PointerDownEvent e) {
    _activePointers++;
    if (_activePointers == 1) {
      _downPos = e.position;
      _pointerMoved = false;
    } else {
      _pointerMoved = true; // multi-touch is never a tap
    }
    _idleTimer?.cancel(); // touching = intent to interact, never hide now
  }

  void _onPointerMove(PointerMoveEvent e) {
    final p = _downPos;
    if (!_pointerMoved && p != null && (e.position - p).distance > _kTapSlop) {
      _pointerMoved = true;
    }
  }

  void _onPointerEnd(PointerEvent e, {required bool up}) {
    final wasTap =
        up && !_pointerMoved && _activePointers == 1 && !_userScrolling;
    _activePointers = math.max(0, _activePointers - 1);
    if (wasTap && _chromeHidden) _showChrome(); // tap reveals
    if (_activePointers == 0) {
      _downPos = null;
      _scheduleIdle(); // finger gone: start counting (no-op if hidden / queue)
    }
  }

  /// Shared by lyrics and queue. Only FINGER scrolls count: the lyrics'
  /// automatic follow-scroll (and the initial jump to the current line) has
  /// no dragDetails and can therefore never hide the controls.
  bool _onPanelScroll(ScrollNotification n) {
    if (n.metrics.axis != Axis.vertical || _reordering || _dragging) {
      return false;
    }
    // while the body is not fully there (glide / fade) or right after it
    // appeared, the list positions itself: ignore all of it
    if (!_bodyShowing ||
        _bodyIn.isAnimating ||
        _dock.isAnimating ||
        _scrollGraceActive) {
      return false;
    }

    if (n is ScrollStartNotification) {
      if (n.dragDetails != null) {
        _userScrolling = true;
        _scrollAcc = 0;
        _idleTimer?.cancel();
      }
    } else if (n is ScrollUpdateNotification) {
      // Only real user finger dragging should hide/show bottom controls;
      // ignore programmatic auto-scrolls (e.g. lyrics jump on load).
      if (n.dragDetails == null) return false;
      if (!_userScrolling) return false; // programmatic scroll
      final dy = n.scrollDelta ?? 0;
      if (dy != 0) {
        if (_scrollAcc.sign != dy.sign) _scrollAcc = 0;
        _scrollAcc += dy;
        // content moving up (user scrolls down): hide bottom controls
        if (_scrollAcc > 12 && n.metrics.pixels > 5) {
          _setChromeHidden(true);
        } else if (_scrollAcc < -10) {
          // content moving down: reveal bottom controls
          _setChromeHidden(false);
        }
      }
    } else if (n is ScrollEndNotification) {
      if (_userScrolling) {
        _userScrolling = false;
        _scrollAcc = 0;
        _scheduleIdle();
      }
    } else if (n is OverscrollNotification &&
        n.overscroll < 0 &&
        _userScrolling) {
      _setChromeHidden(false);
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
      landscape: _landscape,
      onGoToArtist: t.resolvedArtists.length > 1
          ? null
          : () => _openArtist(t.artist),
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

    final mq = MediaQuery.of(context);
    final size = mq.size;
    final safe = mq.padding;

    // Orientation: set BEFORE _syncTrack / the builders read it. On rotation
    // with a panel open, re-sync dock / body state (portrait docks the cover,
    // landscape never does).
    final land = size.width > size.height;
    if (land != _landscape) {
      _landscape = land;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final inPanel = _panel != _Panel.art;
        final dockTarget = (!land && inPanel) ? 1.0 : 0.0;
        // spring the dock instead of jumping: pause-scale, radius and halo
        // all follow it, so nothing pops during the rotation
        if (_open && !_reduceMotion && _dock.value != dockTarget) {
          _dock.springTo(dockTarget, spring: _kRotDockSpring, velocity: 0);
        } else {
          _dock.value = dockTarget;
        }
        if (_open && !_reduceMotion && land && inPanel) {
          _bodyIn.value = 0;
          _bodyIn.springTo(1.0, spring: _kRotDockSpring, velocity: 0);
        } else {
          _bodyIn.value = inPanel ? 1.0 : 0.0;
        }
        _bodyShowing = inPanel && _open;
        if (inPanel) setState(() => _bodyPanel = _panel);
      });
    }

    _syncTrack(track);
    _ensureBleed();
    _syncPlaying(_playing);

    // pre-mount the sheet once, so opening never builds it mid-animation
    _warmTimer ??= Timer(const Duration(milliseconds: 700), () {
      if (mounted) setState(() => _warm = true);
    });

    _travel = size.height * _kSheetStartY; // sheet follows the finger 1:1

    final isExpanded = _open || _sheet.value > 0.05 || _docked;

    return PopScope(
      canPop: !isExpanded,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (_landscape && _isVideo) {
          _exitLandscapeToPortrait();
          return;
        }
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
            _buildNotifOverlay(size, safe),
          ],
        ),
      ),
    );
  }

  Widget _buildNotifOverlay(Size size, EdgeInsets safe) => Positioned.fill(
    child: AnimatedBuilder(
      animation: _sheet,
      builder: (_, child) =>
          (_open || _sheet.value > 0.15) ? child! : const SizedBox.shrink(),
      child: IslandNotificationOverlay(
        topOffset: size.width > size.height
            ? math.max(12.0, safe.top + 8.0)
            : math.max(54.0, safe.top + 4.0) + 46.0 + 8.0,
      ),
    ),
  );

  Widget _buildScrim() => Positioned.fill(
    child: IgnorePointer(
      child: AnimatedBuilder(
        animation: _sheet,
        builder: (_, _) {
          final t = _sheet.value.clamp(0.0, 1.0);
          if (t <= 0.001) return const SizedBox.shrink();
          return ColoredBox(
            // ease-in: no early dark ramp
            color: Colors.black.withValues(
              alpha: _kScrimMax * Curves.easeIn.transform(t),
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
                                  child: ValueListenableBuilder<double?>(
                                    valueListenable: player.videoAspectNotifier,
                                    builder: (_, aspect, _) {
                                      final ar = _isVideo
                                          ? _clampAr(aspect ?? (16 / 9))
                                          : 1.0;
                                      final w = g.artW(ar);
                                      return SizedBox(
                                        width: w,
                                        height: g.art,
                                        child: XfadeLayer(
                                          incoming:
                                              (_open || _sheet.value > 0.001)
                                              ? CoverImage(
                                                  (track.coverUrl as String?) ??
                                                      '',
                                                )
                                              : _TrackMediaView(
                                                  player: player,
                                                  coverUrl:
                                                      (track.coverUrl
                                                          as String?) ??
                                                      '',
                                                  isVideo: _isVideo,
                                                  videoFit: BoxFit.cover,
                                                  isMini: true,
                                                ),
                                          outgoing: (s) =>
                                              CoverImage(s.from.coverUrl),
                                        ),
                                      );
                                    },
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: _kMiniGap),
                            Expanded(
                              child: RightEdgeFade(
                                child: XfadeLayer(
                                  crossDissolve: true,
                                  incoming: _miniText(track, dp, fg),
                                  outgoing: (s) => _miniText(s.from, dp, fg),
                                ),
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
    return ValueListenableBuilder<double?>(
      valueListenable: player.videoAspectNotifier,
      builder: (context, aspect, _) {
        final targetAr = _isVideo ? _clampAr(aspect ?? (16 / 9)) : 1.0;
        return TweenAnimationBuilder<double>(
          tween: Tween<double>(end: targetAr),
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
          builder: (context, ar, _) {
            final url =
                ((_shownCover?.isNotEmpty == true
                    ? _shownCover
                    : (track?.coverUrl as String?))) ??
                '';
            final currentKey = ValueKey<String>(
              'cover-$url-${_isVideo ? 'v' : 'a'}',
            );

            final land = size.width > size.height;
            final landVideo = land && _isVideo;
            final bleed = isFullBleed && !_isVideo;
            final mini = _miniGeo(safe).artRect(size, ar);
            // Landscape: video flies out to FULL SCREEN, normal songs to the
            // square slot on the left. Portrait is unchanged.
            final targetBig = _isVideo
                ? (land
                      ? _videoFullRect(size, ar)
                      : _videoBigRect(size, safe, ar))
                : land
                ? _landscapeArtRect(size, safe)
                : (bleed ? _bleedRect(size, safe) : _bigOrFallback(size, safe));
            final dockH = 50.0;
            final dockW = _isVideo
                ? (dockH * targetAr).clamp(50.0, 105.0)
                : 56.0;
            final dockTop = safe.top + 29 + (56.0 - dockH) / 2;
            final docked = Rect.fromLTWH(24, dockTop, dockW, dockH);
            final big = targetBig.size;

            final media = _TrackMediaView(
              player: player,
              coverUrl: url,
              isVideo: _isVideo,
              videoFit: _docked ? BoxFit.cover : BoxFit.contain,
            );

            final cover = RepaintBoundary(
              child: SizedBox(
                width: big.width,
                height: big.height,
                child: XfadeLayer(
                  motion: true,
                  incoming: AnimatedSwitcher(
                    duration: CrossfadeController.instance.session.value != null
                        ? Duration.zero
                        : const Duration(milliseconds: 220),
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
                      child: bleed
                          ? BleedArtworkImage(
                              art: _isVideo ? null : _bleedArt,
                              plain: media,
                              dock: _dock,
                              sheet: _sheet,
                            )
                          : media,
                    ),
                  ),
                  outgoing: (s) {
                    final a = bleed
                        ? BleedArtworkService.instance.peek(
                            MediaNormalizer.upgradeArtworkUrl(s.from.coverUrl),
                          )
                        : null;
                    return a != null
                        ? RawImage(
                            image: a.image,
                            fit: BoxFit.fill,
                            filterQuality: FilterQuality.medium,
                          )
                        : CoverImage(s.from.coverUrl);
                  },
                ),
              ),
            );

            final bool fluidMesh = SettingsState.instance.fluidMeshBg;
            final glowColor = fluidMesh
                ? (_bleedArt?.average ??
                      (_palette.isNotEmpty
                          ? _palette.first
                          : const Color(0xFFB4123A)))
                : Colors.transparent;
            final glow = RepaintBoundary(
              child: Center(
                child: Container(
                  width: big.width * 0.88,
                  height: big.height * 0.88,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(big.width * 0.44),
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
                  borderRadius: BorderRadius.circular(big.width * 0.032),
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
                animation: Listenable.merge([
                  _sheet,
                  _dock,
                  _pause,
                  _artX,
                  _press,
                  _rot,
                ]),
                child: cover,
                builder: (context, child) {
                  final t = _sheet.value.clamp(0.0, 1.0);
                  final d = _dock.value.clamp(0.0, 1.0).toDouble();

                  final dest = Rect.lerp(targetBig, docked, d)!;
                  final tgt = Rect.lerp(_rotFrom ?? dest, dest, _rotRaw)!;
                  _curRect = tgt;
                  final px = Curves.easeOutQuad.transform(t);
                  final sp = (t + px) / 2;
                  var cx = lerpDouble(mini.center.dx, tgt.center.dx, px)!;
                  var cy = lerpDouble(mini.center.dy, tgt.center.dy, t)!;
                  final rotT = _rotFrom == null ? 0.0 : 1.0 - _rotRaw;
                  final rotAng = _rotA0 * rotT;
                  if (rotT != 0.0) {
                    final nc = size.center(Offset.zero);
                    final vx = cx - nc.dx, vy = cy - nc.dy;
                    final cs = math.cos(rotAng), sn = math.sin(rotAng);
                    cx = nc.dx + vx * cs - vy * sn;
                    cy = nc.dy + vx * sn + vy * cs;
                  }

                  // landscape video lands edge to edge: radius melts to 0
                  final radius = lerpDouble(
                    _kRadiusMini,
                    landVideo
                        ? 0.0
                        : lerpDouble(
                            _kRadiusBig,
                            _isVideo ? 10.0 : _kRadiusDocked,
                            d,
                          )!,
                    t,
                  )!;

                  final pauseValue = bleed ? 1.0 : _pause.value;
                  final pressValue = bleed ? 1.0 : _press.value;
                  final pauseScale = (landVideo || bleed)
                      ? 1.0
                      : ((1 - (1 - pauseValue) * (1 - d) * t) * pressValue);
                  final dx = _artX.value * t * (1 - d);

                  final ww = lerpDouble(mini.width, tgt.width, sp)!;
                  final hh = lerpDouble(mini.height, tgt.height, sp)!;
                  final geomScale = math.max(ww / big.width, hh / big.height);
                  final s = geomScale * pauseScale;
                  final m =
                      Matrix4.translationValues(cx + dx, cy, 0) *
                      Matrix4.rotationZ(rotAng) *
                      Matrix4.diagonal3Values(s, s, 1) *
                      Matrix4.translationValues(
                        -big.width / 2,
                        -big.height / 2,
                        0,
                      );

                  final pauseHalo = bleed
                      ? 1.0
                      : _smooth((pauseValue - _kPaused) / (1 - _kPaused));
                  final haloO = landVideo
                      ? 0.0
                      : (_smooth((t - 0.9) / 0.1) *
                                (1 - _smooth(d / 0.12)) *
                                pauseHalo *
                                _smooth((_rotV - 0.55) / 0.45))
                            .clamp(0.0, 1.0)
                            .toDouble();

                  final skipClip = bleed && d < 0.05 && t > 0.9;
                  // Landscape video: the cover flies to the full-screen rect
                  // (opening OR rotating) and dissolves into the sheet's own
                  // video at the very end.
                  final coverFade = landVideo
                      ? math.max(
                          1.0 - _smooth((t - 0.75) / 0.23),
                          1.0 - _smooth((_rotV - 0.8) / 0.18),
                        )
                      : 1.0;
                  final hidden =
                      (!_open && t <= 0.001) ||
                      (landVideo && coverFade <= 0.002);

                  return Offstage(
                    offstage: hidden,
                    child: Opacity(
                      opacity: coverFade,
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Positioned(
                            key: const ValueKey('halo'),
                            left: targetBig.left,
                            top: targetBig.top,
                            width: big.width,
                            height: big.height,
                            child: Transform.translate(
                              offset: Offset(
                                cx + dx - targetBig.center.dx,
                                cy - targetBig.center.dy,
                              ),
                              child: IgnorePointer(
                                child: Opacity(
                                  opacity: haloO,
                                  child: bleed ? glow : shadow,
                                ),
                              ),
                            ),
                          ),
                          Positioned(
                            key: const ValueKey('cover'),
                            left: 0,
                            top: 0,
                            width: big.width,
                            height: big.height,
                            child: Transform(
                              transform: m,
                              child: IgnorePointer(
                                ignoring: t < 0.95 || landVideo,
                                child: Semantics(
                                  button: true,
                                  label: _docked
                                      ? 'Show album art'
                                      : 'Show lyrics',
                                  child: GestureDetector(
                                    behavior: HitTestBehavior.opaque,
                                    onTapDown: (_) {
                                      if (!bleed && !_isVideo) {
                                        _press.springTo(
                                          0.94,
                                          spring: _kPressSpring,
                                        );
                                      }
                                    },
                                    onTapUp: (_) => _press.springTo(
                                      1,
                                      spring: _kReleaseSpring,
                                    ),
                                    onTapCancel: () => _press.springTo(
                                      1,
                                      spring: _kReleaseSpring,
                                    ),
                                    onTap: () {
                                      if (_docked) {
                                        _setPanel(_Panel.art);
                                        return;
                                      }
                                      if (_isVideo)
                                        return; // In art mode, video doesn't flip on tap
                                      _setPanel(_Panel.lyrics);
                                    },
                                    // landscape: the cover never docks, so swipe-to-skip stays on
                                    onPanStart: (_docked && !land)
                                        ? null
                                        : _artStart,
                                    onPanUpdate: (_docked && !land)
                                        ? null
                                        : _artUpdate,
                                    onPanEnd: (_docked && !land)
                                        ? null
                                        : _artEnd,
                                    onPanCancel: (_docked && !land)
                                        ? null
                                        : () => _artEnd(DragEndDetails()),
                                    child: ClipRRect(
                                      clipper: _WindowClipper(
                                        Size(ww / geomScale, hh / geomScale),
                                        radius / s,
                                      ),
                                      clipBehavior: skipClip
                                          ? Clip.none
                                          : Clip.antiAlias,
                                      child: Stack(
                                        fit: StackFit.expand,
                                        children: [
                                          child!,
                                          if (_isVideo && !land && t > 0.85)
                                            Positioned(
                                              left: 12,
                                              top: 12,
                                              child: Opacity(
                                                opacity:
                                                    ((((t - 0.85) / 0.15) *
                                                                (1 - d * 2.5)) *
                                                            _smooth(
                                                              (_rotV - 0.7) /
                                                                  0.3,
                                                            ))
                                                        .clamp(0.0, 1.0),
                                                child: _SpringButton(
                                                  size: 42,
                                                  label:
                                                      'Expand video to landscape',
                                                  onTap:
                                                      _expandVideoToLandscape,
                                                  child: _vidDisc(
                                                    38,
                                                    const _BracketIcon(
                                                      size: 18,
                                                      color: Colors.white,
                                                      collapse: false,
                                                    ),
                                                  ),
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
                        ],
                      ),
                    ),
                  );
                },
              ),
            );
          },
        );
      },
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
    final bool fluidMesh = SettingsState.instance.fluidMeshBg;
    // Built ONCE per setState; the builders below reuse these instances.
    final backdrop = IgnorePointer(
      child: RepaintBoundary(
        child: Stack(
          fit: StackFit.expand,
          children: [
            const ColoredBox(color: Colors.black),
            // The flow painter draws oversized, rotated layers WITHOUT a clip.
            // ClipRect keeps everything inside this ONE sheet.
            if (fluidMesh)
              ClipRect(
                child: BleedBackdrop(
                  coverUrl: _shownCover ?? '',
                  trackId: track.id,
                  art: _bakeFailed ? null : _bleedArt,
                  pending:
                      !_bakeFailed && _bleedArt == null && _bleedUrl.isNotEmpty,
                  fallback: _fallbackColors(),
                  flow: !_reduceMotion,
                  isPlaying: _playing,
                  positionNotifier: player.positionNotifier,
                  duration: player.duration,
                  // drift freezes while anything moves: all GPU goes to the motion
                  paused: () =>
                      _reduceMotion ||
                      _dragging ||
                      _closing ||
                      _sheet.isAnimating ||
                      _dock.isAnimating ||
                      _bodyIn.isAnimating ||
                      _chrome.isAnimating ||
                      _rot.isAnimating ||
                      _videoUiC.isAnimating,
                ),
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

    // Leaving the black landscape video: fade the black out instead of
    // snapping to the portrait backdrop.
    final veil = IgnorePointer(
      child: AnimatedBuilder(
        animation: _rot,
        builder: (_, _) {
          final a = _rotFromVideoLand ? 1.0 - _smooth(_rotV / 0.55) : 0.0;
          return Opacity(
            opacity: a,
            child: const ColoredBox(color: Colors.black),
          );
        },
      ),
    );

    // CONSTANT tree shape: the Opacity is ALWAYS present.
    final backdropLayer = AnimatedBuilder(
      animation: _sheet,
      child: backdrop,
      builder: (_, c) => Opacity(
        opacity: _sheetAlpha(_sheet.value.clamp(0.0, 1.0).toDouble()),
        child: c,
      ),
    );

    // ClipRect: the sheet is exactly ONE rectangle, nothing can peek out of
    // its edges while it moves.
    final sheetBody = ClipRect(
      child: Stack(
        fit: StackFit.expand,
        children: [backdropLayer, veil, column],
      ),
    );

    return Positioned.fill(
      child: AnimatedBuilder(
        animation: _sheet,
        builder: (context, _) {
          final t = _sheet.value.clamp(0.0, 1.0).toDouble();
          final visible = _open || t > 0.001;
          if (!visible && !_warm) return const SizedBox.shrink();

          final y =
              (1 - t) * _travel; // starts 30% from bottom, 1:1 with the finger

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
                    child: sheetBody,
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  /// Top stop is tiny so the first row is never faded out. The child sits in
  /// its own RepaintBoundary so the mask never forces the list to re-raster.
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
      child: RepaintBoundary(child: child),
    );
  }

  /// Scroll-to-dismiss for LYRICS only: pulling down past the top with a
  /// FINGER drags the sheet. (The queue does not dismiss any more.)
  Widget _dismissOnOverscroll(Widget child) {
    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (_reordering || _landscape) return false;
        if (n is OverscrollNotification &&
            n.overscroll < 0 &&
            n.dragDetails != null) {
          if (!_dragging) _dragStart();
          _dragUpdate(-n.overscroll);
          return true;
        }
        if (n is ScrollEndNotification && _dragging) {
          _dragEnd(n.dragDetails?.velocity.pixelsPerSecond.dy ?? 0);
        }
        return false;
      },
      child: child,
    );
  }

  /// Lyrics fade completely out right above the seekbar. When the controls
  /// hide, the fade opens up to the bottom edge again. The lyrics sit in a
  /// RepaintBoundary, so animating the mask never re-rasters the lyrics.
  Widget _lyricsFade(Widget child) {
    return AnimatedBuilder(
      animation: _chrome,
      child: RepaintBoundary(child: child),
      builder: (_, c) {
        final h = _chrome.value.clamp(0.0, 1.0).toDouble();
        final end = lerpDouble(_lyricsFadeEnd, 1.0, h)!;
        final start = lerpDouble(_lyricsFadeEnd - 0.12, 0.93, h)!;
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
              onNotification: _onPanelScroll,
              child: _dismissOnOverscroll(
                Padding(
                  padding: const EdgeInsets.fromLTRB(0, 2, 0, 0),
                  child: _lyricsFade(
                    // tickers run ONLY while nothing moves: the glide / drag /
                    // close own the whole frame budget
                    ValueListenableBuilder<bool>(
                      valueListenable: _dockGliding,
                      child:
                          widget.lyricsBuilder?.call(context) ??
                          LyricsSheet(immersiveListenable: _lyricsImmersive),
                      builder: (_, gliding, lyrics) => TickerMode(
                        enabled: !gliding && _bodyShowing && _open,
                        child: lyrics!,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      case _Panel.queue:
        // NO _dismissOnOverscroll here: pulling the queue down must never
        // close the player.
        return RepaintBoundary(
          key: const ValueKey('queue-body'),
          child: KeyedSubtree(
            key: const ValueKey('queue'),
            child: NotificationListener<ScrollNotification>(
              onNotification: _onPanelScroll,
              child: _edgeFade(
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
  /// during the glide. CONSTANT TREE SHAPE: the child is ALWAYS mounted
  /// (Opacity 0.0 skips painting but keeps the subtree alive).
  Widget _dockFade({
    bool inverse = false,
    double from = 0.0,
    bool withSheet = false, // also multiply by the sheet's own fade-in
    required Widget child,
  }) {
    return AnimatedBuilder(
      animation: withSheet ? Listenable.merge([_dock, _sheet]) : _dock,
      child: child,
      builder: (_, c) {
        final d = _dock.value.clamp(0.0, 1.0).toDouble();
        var f = inverse ? 1 - d : ((d - from) / (1 - from)).clamp(0.0, 1.0);
        if (withSheet) {
          f *= _sheetAlpha(_sheet.value.clamp(0.0, 1.0).toDouble());
        }
        f = f.clamp(0.0, 1.0).toDouble();
        return IgnorePointer(
          ignoring: f < 0.6,
          child: Opacity(opacity: f, child: c),
        );
      },
    );
  }

  /// Fades the heavy lyrics / queue body with `_bodyIn` (rises only after the
  /// cover has docked) and with its own steep sheet curve (gone by 70% open,
  /// so a closing swipe never paints it). Opacity 0 = NOT painted at all.
  Widget _bodyFade({required Widget child}) {
    return AnimatedBuilder(
      animation: Listenable.merge([_bodyIn, _sheet, _rot]),
      child: child,
      builder: (_, c) {
        // the heavy body rotates too, but only fades in once it is mostly there
        final rs = _smooth((_rotV - 0.25) / 0.5);
        final f =
            _bodyIn.value.clamp(0.0, 1.0).toDouble() *
            _bodyAlpha(_sheet.value.clamp(0.0, 1.0).toDouble()) *
            rs;
        return _applyMorph(
          _Slot.body,
          IgnorePointer(
            ignoring: f < 0.6,
            child: Opacity(opacity: f, child: c),
          ),
        );
      },
    );
  }

  /// Glides the bottom controls away (and back) with the `_chrome` spring.
  /// Constant tree shape: controls stay mounted.
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
              opacity: (1 - h).clamp(0.0, 1.0),
              child: Transform.translate(offset: Offset(0, h * 240), child: c),
            ),
          ),
        );
      },
    );
  }

  /// Fades a (small) widget with the sheet's own fade-in. Constant tree shape.
  Widget _sheetFade({required Widget child}) {
    return AnimatedBuilder(
      animation: _sheet,
      child: child,
      builder: (_, c) => Opacity(
        opacity: _sheetAlpha(_sheet.value.clamp(0.0, 1.0).toDouble()),
        child: c,
      ),
    );
  }

  /// Plain fade following `_chrome`.
  Widget _chromeFade({required Widget child}) {
    return AnimatedBuilder(
      animation: Listenable.merge([_chrome, _rot]),
      child: child,
      builder: (_, c) => Opacity(
        opacity: ((1 - _chrome.value) * _rotStage(0.25))
            .clamp(0.0, 1.0)
            .toDouble(),
        child: c,
      ),
    );
  }

  /// Staggered rise-in of the controls as the sheet opens (and the reverse on
  /// close). [begin] is the sheet progress at which this element starts.
  Widget _rise({required double begin, required Widget child}) {
    final slot = _slotOf(begin);
    return AnimatedBuilder(
      animation: Listenable.merge([_sheet, _rot]),
      child: child,
      builder: (_, c) {
        final t = _sheet.value.clamp(0.0, 1.0);
        final v = ((t - begin) / (1 - begin)).clamp(0.0, 1.0);
        final e = Curves.easeOutCubic.transform(v);
        return _applyMorph(
          slot,
          Opacity(
            opacity: e,
            child: Transform.translate(
              offset: Offset(0, (1 - e) * 22),
              child: c,
            ),
          ),
        );
      },
    );
  }

  /// Blocks taps on empty gaps around visible bottom controls from falling
  /// through to underlying lyrics lines.
  Widget _bottomControlsHitShield({
    required Listenable animation,
    required bool Function() isActive,
  }) {
    return AnimatedBuilder(
      animation: animation,
      builder: (_, child) => IgnorePointer(ignoring: !isActive(), child: child),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () {},
        onDoubleTap: () {},
        onLongPress: () {},
      ),
    );
  }

  /// Soft shade behind the bottom controls (lyrics mode only).
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
    // ── LANDSCAPE: left artwork (drawn by the overlay) + right pane, or a
    // full-screen video. Same pointer Listener so the controls logic is shared.
    if (_landscape) {
      return Listener(
        behavior: HitTestBehavior.translucent,
        onPointerDown: _onPointerDown,
        onPointerMove: _onPointerMove,
        onPointerUp: (e) => _onPointerEnd(e, up: true),
        onPointerCancel: (e) => _onPointerEnd(e, up: false),
        child: _landscapeContent(player, track, safe, size),
      );
    }

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
      child: AnimatedBuilder(
        animation: _chrome,
        builder: (_, child) {
          final h = _chrome.value.clamp(0.0, 1.0).toDouble();
          return Padding(
            padding: EdgeInsets.only(
              top: isQueueBody ? 4 : 0,
              // controls shown: the list stops above them. Controls hidden:
              // the list grows to the bottom edge. Never content under them.
              bottom: isQueueBody ? lerpDouble(queueReserve, 0, h)! : 0,
            ),
            child: child,
          );
        },
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
              // Body appears only AFTER the cover has docked (see _showBody),
              // so the glide itself never paints lyrics / queue.
              child: _bodyFade(
                child: AnimatedSwitcher(
                  // art <-> panel swaps are instant; only lyrics <-> queue
                  // cross-fades.
                  duration: Duration(milliseconds: _instantSwap ? 0 : 200),
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

    final grabber = _sheetFade(
      child: Center(
        child: SizedBox(
          width: 140,
          child: Semantics(
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
          ),
        ),
      ),
    );

    // Fixed height ALWAYS (it is never unmounted), so the lyrics region below
    // never gets resized while the cover glides.
    final compactHeader = _dockFade(
      withSheet: true,
      child: _compactHeader(player, track),
    );

    // Title row: fixed spot above the seekbar, fades out when the cover docks
    final meta = Positioned(
      left: 0,
      right: 0,
      bottom: blockBottomInset + dockedBlockH + gMeta,
      child: _chromeCollapse(
        child: _dockFade(
          inverse: true,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 0),
            child: _rise(begin: 0.58, child: _metaRow(track)),
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
                      child: XfadeLayer(
                        crossDissolve: true,
                        incoming: ScrubberSlider(
                          positionNotifier: player.positionNotifier,
                          duration: _duration,
                          onSeek: (pos) => player.seek(pos),
                          activeColor: _seekTint.withValues(alpha: 0.62),
                          trackColor: _seekTint.withValues(alpha: 0.22),
                          timeColor: Colors.white.withValues(alpha: 0.55),
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
                        outgoing: (s) => ScrubberSlider(
                          positionNotifier:
                              CrossfadeController.instance.outPosition,
                          duration: s.fromDuration,
                          onSeek: (_) {},
                          activeColor: _seekTint.withValues(alpha: 0.62),
                          trackColor: _seekTint.withValues(alpha: 0.22),
                          timeColor: Colors.white.withValues(alpha: 0.55),
                        ),
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
    );

    // Last row: unchanged position, always pinned to the bottom.
    final tools = Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: _chromeCollapse(
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
    );

    final content = Stack(
      fit: StackFit.expand,
      children: [
        Column(
          children: [
            _rotReveal(begin: 0.04, slide: false, child: grabber),
            _rotReveal(begin: 0.08, child: compactHeader),
            middleRegion,
          ],
        ),
        _bottomBlur(blurH, isLyrics),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          height: queueReserve,
          child: _bottomControlsHitShield(
            animation: _chrome,
            isActive: () =>
                (isLyrics || _bodyPanel == _Panel.lyrics) &&
                _chrome.value.clamp(0.0, 1.0) <= 0.35,
          ),
        ),
        meta,
        controls,
        tools,
      ],
    );

    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: _onPointerDown,
      onPointerMove: _onPointerMove,
      onPointerUp: (e) => _onPointerEnd(e, up: true),
      onPointerCancel: (e) => _onPointerEnd(e, up: false),
      child: content,
    );
  }

  /* ───────────────────────── LANDSCAPE ───────────────────────── */

  Widget _landscapeContent(
    PlayerState player,
    dynamic track,
    EdgeInsets safe,
    Size size,
  ) {
    if (_isVideo) return _landscapeVideo(player, track, safe, size);

    final art = _landscapeArtRect(size, safe);
    final hasLyrics = player.hasLyrics || player.isLoadingLyrics;
    _lyricsFadeEnd = 0.99;

    final pad = _landscapePad(size);
    final paneLeft = art.right + 40;
    final paneRight = math.max(safe.right + pad, size.width - paneLeft - 560);
    final fullRight = math.max(12.0, safe.right + 12.0);

    Widget buildControlsColumn(double w, double h, bool spaceBetween) {
      final transportH = (h * 0.30).clamp(68.0, 92.0).toDouble();
      return SizedBox(
        width: w,
        height: spaceBetween ? h : null,
        child: Column(
          mainAxisSize: spaceBetween ? MainAxisSize.max : MainAxisSize.min,
          mainAxisAlignment: spaceBetween
              ? MainAxisAlignment.spaceBetween
              : MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _rise(begin: 0.58, child: _metaRow(track, compact: true)),
            _rise(
              begin: 0.64,
              child: XfadeLayer(
                crossDissolve: true,
                incoming: ScrubberSlider(
                  positionNotifier: player.positionNotifier,
                  duration: _duration,
                  onSeek: (pos) => player.seek(pos),
                  activeColor: _seekTint.withValues(alpha: 0.65),
                  trackColor: _seekTint.withValues(alpha: 0.22),
                  timeColor: Colors.white.withValues(alpha: 0.55),
                  middleWidget: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        CupertinoIcons.waveform,
                        size: 11,
                        color: Colors.white.withValues(alpha: 0.58),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Lossless',
                        style: TextStyle(
                          fontFamily: 'SF Pro',
                          fontSize: 10.5,
                          fontWeight: FontWeight.w600,
                          color: Colors.white.withValues(alpha: 0.58),
                          letterSpacing: -0.2,
                        ),
                      ),
                    ],
                  ),
                ),
                outgoing: (s) => ScrubberSlider(
                  positionNotifier: CrossfadeController.instance.outPosition,
                  duration: s.fromDuration,
                  onSeek: (_) {},
                  activeColor: _seekTint.withValues(alpha: 0.65),
                  trackColor: _seekTint.withValues(alpha: 0.22),
                  timeColor: Colors.white.withValues(alpha: 0.55),
                ),
              ),
            ),
            _rise(
              begin: 0.70,
              child: SizedBox(
                height: transportH,
                child: _transportLandscape(player, w, transportH),
              ),
            ),
            _rise(
              begin: 0.74,
              child: _LandscapeVolumeSlider(
                player: player,
                activeColor: _seekTint.withValues(alpha: 0.68),
                trackColor: _seekTint.withValues(alpha: 0.22),
              ),
            ),
          ],
        ),
      );
    }

    final controls = AnimatedBuilder(
      animation: _bodyIn,
      builder: (_, c) {
        final b = _smooth(_bodyIn.value);
        return IgnorePointer(
          ignoring: b > 0.1,
          child: Opacity(
            opacity: (1 - b).clamp(0.0, 1.0),
            child: Transform.translate(
              offset: Offset(0, 12 * b),
              child: Transform.scale(scale: 1 - 0.05 * b, child: c),
            ),
          ),
        );
      },
      child: RepaintBoundary(
        child: LayoutBuilder(
          builder: (_, box) {
            final w = box.maxWidth; // == header width == tools width
            final h = box.maxHeight;
            final spaceBetween = h >= 210;
            if (spaceBetween) {
              return buildControlsColumn(w, h, true);
            }
            return Center(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: buildControlsColumn(w, h, false),
              ),
            );
          },
        ),
      ),
    );

    final body = AnimatedBuilder(
      animation: _bodyIn,
      builder: (_, c) {
        final b = _smooth(_bodyIn.value);
        return IgnorePointer(
          ignoring: b < 0.5,
          child: Opacity(
            opacity: b,
            child: Transform.translate(
              offset: Offset(0, 22 * (1 - b)),
              child: c,
            ),
          ),
        );
      },
      child: RepaintBoundary(
        child: _bodyFade(
          child: AnimatedSwitcher(
            duration: Duration(milliseconds: _instantSwap ? 0 : 200),
            transitionBuilder: (c, a) => FadeTransition(opacity: a, child: c),
            layoutBuilder: (cur, prev) =>
                Stack(fit: StackFit.expand, children: [...prev, ?cur]),
            child: _panelBody(track),
          ),
        ),
      ),
    );

    // Default: Lyrics + Queue centered at bottom. When one is open, the other
    // collapses and the active button glides to the full right side so content
    // uses the entire bottom area cleanly for both Lyrics and Queue.
    final tools = Positioned(
      left: paneLeft,
      right: 0,
      bottom: size.height - art.bottom,
      child: AnimatedBuilder(
        animation: Listenable.merge([_bodyIn, _rot]),
        builder: (_, _) {
          final b = _smooth(_bodyIn.value);
          final hf = (1 - b).clamp(0.0, 1.0);
          final inLyrics = _panel == _Panel.lyrics;
          final inQueue = _panel == _Panel.queue;
          final hideLyrics = _bodyPanel == _Panel.queue;
          final hideQueue = _bodyPanel == _Panel.lyrics;
          final anyPanel = _bodyPanel != _Panel.art;
          final rightEdge = lerpDouble(paneRight, fullRight, b)!;

          Widget slot(bool hide, Widget child) => ClipRect(
            child: Align(
              widthFactor: hide ? hf : 1.0,
              child: Opacity(
                opacity: hide ? hf : 1.0,
                child: IgnorePointer(ignoring: hide && b > 0.3, child: child),
              ),
            ),
          );

          final inner = Padding(
            padding: EdgeInsets.only(right: rightEdge),
            child: Align(
              alignment: Alignment(lerpDouble(0.0, 1.0, b)!, 0.0),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  slot(
                    hideLyrics,
                    PlateButton(
                      size: 46,
                      active: inLyrics,
                      onTap: hasLyrics
                          ? () => _togglePanel(_Panel.lyrics)
                          : null,
                      child: Opacity(
                        opacity: hasLyrics ? 1.0 : 0.28,
                        child: SpringPop(
                          trigger: inLyrics,
                          scale: 0.3,
                          child: Icon(
                            inLyrics
                                ? CupertinoIcons.quote_bubble_fill
                                : CupertinoIcons.quote_bubble,
                            size: 22,
                          ),
                        ),
                      ),
                    ),
                  ),
                  SizedBox(width: anyPanel ? 104.0 * hf : 104.0),
                  slot(
                    hideQueue,
                    PlateButton(
                      size: 46,
                      active: inQueue,
                      onTap: () => _togglePanel(_Panel.queue),
                      child: SpringPop(
                        trigger: inQueue,
                        scale: 0.3,
                        child: const Icon(CupertinoIcons.list_bullet, size: 24),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
          return _applyMorph(_Slot.tools, inner);
        },
      ),
    );

    return Stack(
      fit: StackFit.expand,
      children: [
        Positioned(
          left: paneLeft,
          right: paneRight,
          top: art.top + 4,
          bottom: size.height - art.bottom,
          child: Stack(
            fit: StackFit.expand,
            clipBehavior: Clip.none,
            children: [
              body,
              Positioned.fill(top: 0, bottom: 54, child: controls),
            ],
          ),
        ),
        Positioned(
          left: paneLeft,
          right: 0,
          bottom: size.height - art.bottom,
          height: 54,
          child: _bottomControlsHitShield(
            animation: Listenable.merge([_chrome, _bodyIn]),
            isActive: () =>
                (_panel == _Panel.lyrics || _bodyPanel == _Panel.lyrics) &&
                _bodyIn.value > 0.1 &&
                _chrome.value.clamp(0.0, 1.0) <= 0.35,
          ),
        ),
        tools,
      ],
    );
  }

  /// Round dark disc behind the video buttons.
  Widget _vidDisc(double size, Widget icon) => Container(
    width: size,
    height: size,
    alignment: Alignment.center,
    decoration: const BoxDecoration(
      shape: BoxShape.circle,
      color: Color(0x66000000),
    ),
    child: icon,
  );

  /// Full-screen landscape video.
  ///  • video layer fades in at the END of the rotation morph (the flying
  ///    cover dissolves into it), controls spring in after that
  ///  • tap = controls, double-tap L/R = ∓10s, pinch = fit/fill,
  ///    swipe down = exit, prev / next track in the transport row
  Widget _landscapeVideo(
    PlayerState player,
    dynamic track,
    EdgeInsets safe,
    Size size,
  ) {
    final title = track is Track
        ? track.title
        : MediaNormalizer.cleanTitle(track?.title?.toString());
    final artist = track is Track
        ? track.artist
        : MediaNormalizer.formatArtists(track?.artist?.toString());

    double fillOf(double? aspect) {
      final fit = _videoFullRect(size, _clampAr(aspect ?? (16 / 9)));
      return math.max(size.width / fit.width, size.height / fit.height);
    }

    final black = AnimatedBuilder(
      animation: _rot,
      builder: (_, _) => Opacity(
        opacity: _smooth(_rotV / 0.5),
        child: const ColoredBox(color: Colors.black),
      ),
    );

    final videoLayer = RepaintBoundary(
      child: ValueListenableBuilder<double?>(
        valueListenable: player.videoAspectNotifier,
        builder: (_, aspect, _) {
          final fs = fillOf(aspect);
          return AnimatedBuilder(
            animation: Listenable.merge([_fillC, _rot]),
            child: _TrackMediaView(
              player: player,
              coverUrl: _shownCover ?? '',
              isVideo: true,
              videoFit: BoxFit.contain,
            ),
            builder: (_, c) => Opacity(
              opacity: _smooth((_rotV - 0.6) / 0.3),
              child: Transform.scale(
                scale: lerpDouble(1.0, fs, _fillC.value)!,
                child: c,
              ),
            ),
          );
        },
      ),
    );

    final ui = RepaintBoundary(
      child: ValueListenableBuilder<double?>(
        valueListenable: player.videoAspectNotifier,
        builder: (_, aspect, _) {
          final canFill = fillOf(aspect) > 1.02;
          return AnimatedBuilder(
            animation: Listenable.merge([_videoUiC, _rot, _fillC]),
            builder: (_, _) {
              final v = _videoUiC.value;
              final o =
                  v.clamp(0.0, 1.0).toDouble() * _smooth((_rotV - 0.7) / 0.3);
              final pop = 0.92 + 0.08 * v.clamp(0.0, 1.06);
              return IgnorePointer(
                ignoring: o < 0.5,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Opacity(
                      opacity: o,
                      child: const ColoredBox(color: Color(0x66000000)),
                    ),
                    // exit (top left)
                    Positioned(
                      top: safe.top + 16,
                      left: safe.left + 24,
                      child: Opacity(
                        opacity: o,
                        child: Transform.translate(
                          offset: Offset(0, -14 * (1 - o)),
                          child: Transform.scale(
                            scale: pop,
                            child: _SpringButton(
                              size: 52,
                              label: 'Exit full screen',
                              onTap: _exitLandscapeToPortrait,
                              child: _vidDisc(
                                46,
                                const Icon(
                                  CupertinoIcons.xmark,
                                  color: Colors.white,
                                  size: 22,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    // fit / fill (top right), only when it changes anything
                    if (canFill)
                      Positioned(
                        top: safe.top + 16,
                        right: safe.right + 24,
                        child: Opacity(
                          opacity: o,
                          child: Transform.translate(
                            offset: Offset(0, -14 * (1 - o)),
                            child: Transform.scale(
                              scale: pop,
                              child: _SpringButton(
                                size: 52,
                                label: _videoFill
                                    ? 'Fit to screen'
                                    : 'Fill screen',
                                onTap: _toggleFill,
                                child: _vidDisc(
                                  46,
                                  Icon(
                                    _videoFill
                                        ? CupertinoIcons
                                              .arrow_down_right_arrow_up_left
                                        : CupertinoIcons
                                              .arrow_up_left_arrow_down_right,
                                    color: Colors.white,
                                    size: 20,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    // prev · -10 · play / pause · +10 · next
                    Center(
                      child: Opacity(
                        opacity: o,
                        child: Transform.scale(
                          scale: pop,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _SpringButton(
                                size: 56,
                                label: 'Previous track',
                                onTap: _prev,
                                child: SpringPop(
                                  pulse: _prevPulse,
                                  dx: -8,
                                  scale: 0.1,
                                  child: _vidDisc(
                                    50,
                                    const Icon(
                                      CupertinoIcons.backward_fill,
                                      color: Colors.white,
                                      size: 24,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: 22),
                              _SkipSpinButton(
                                size: 72,
                                forward: false,
                                pulse: _skipBackPulse,
                                label: 'Back 10 seconds',
                                onTap: () => _skip(-10),
                                child: _vidDisc(
                                  66,
                                  const Icon(
                                    CupertinoIcons.gobackward_10,
                                    color: Colors.white,
                                    size: 32,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 30),
                              _SpringButton(
                                size: 96,
                                label: _playing ? 'Pause' : 'Play',
                                pressedScale: 0.9,
                                onTap: () {
                                  player.togglePlay();
                                  _pokeVideoUi();
                                },
                                child: _vidDisc(
                                  90,
                                  _PlayGlyph(playing: _playing, size: 44),
                                ),
                              ),
                              const SizedBox(width: 30),
                              _SkipSpinButton(
                                size: 72,
                                forward: true,
                                pulse: _skipFwdPulse,
                                label: 'Forward 10 seconds',
                                onTap: () => _skip(10),
                                child: _vidDisc(
                                  66,
                                  const Icon(
                                    CupertinoIcons.goforward_10,
                                    color: Colors.white,
                                    size: 32,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 22),
                              _SpringButton(
                                size: 56,
                                label: 'Next track',
                                onTap: _next,
                                child: SpringPop(
                                  pulse: _nextPulse,
                                  dx: 8,
                                  scale: 0.1,
                                  child: _vidDisc(
                                    50,
                                    const Icon(
                                      CupertinoIcons.forward_fill,
                                      color: Colors.white,
                                      size: 24,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    // artist · title · seekbar (bottom)
                    Positioned(
                      left: safe.left + 24,
                      right: safe.right + 24,
                      bottom: safe.bottom + 14,
                      child: Opacity(
                        opacity: o,
                        child: Transform.translate(
                          offset: Offset(0, 22 * (1 - o)),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              MarqueeScroll(
                                resetKey: _trackKey,
                                animate: _playing,
                                child: Text(
                                  artist,
                                  style: const TextStyle(
                                    fontFamily: 'SF Pro',
                                    color: Colors.white,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              MarqueeScroll(
                                resetKey: _trackKey,
                                animate: _playing,
                                child: Text(
                                  title,
                                  style: const TextStyle(
                                    fontFamily: 'SF Pro Display',
                                    color: Colors.white,
                                    fontSize: 26,
                                    height: 1.2,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: -0.4,
                                  ),
                                ),
                              ),
                              const SizedBox(height: 6),
                              XfadeLayer(
                                crossDissolve: true,
                                incoming: ScrubberSlider(
                                  positionNotifier: player.positionNotifier,
                                  duration: _duration,
                                  onSeek: (pos) {
                                    player.seek(pos);
                                    _pokeVideoUi();
                                  },
                                  activeColor: Colors.white,
                                  trackColor: Colors.white.withValues(
                                    alpha: 0.3,
                                  ),
                                  timeColor: Colors.white.withValues(
                                    alpha: 0.75,
                                  ),
                                ),
                                outgoing: (s) => ScrubberSlider(
                                  positionNotifier:
                                      CrossfadeController.instance.outPosition,
                                  duration: s.fromDuration,
                                  onSeek: (_) {},
                                  activeColor: Colors.white,
                                  trackColor: Colors.white.withValues(
                                    alpha: 0.3,
                                  ),
                                  timeColor: Colors.white.withValues(
                                    alpha: 0.75,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          );
        },
      ),
    );

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapUp: (d) => _onVideoTapUp(d.localPosition, size),
      onScaleStart: (_) {
        _vidScale = 1.0;
        _vidDrag = 0.0;
      },
      onScaleUpdate: (d) {
        if (d.pointerCount >= 2) {
          _vidScale = d.scale;
        } else {
          _vidDrag += d.focalPointDelta.dy;
        }
      },
      onScaleEnd: (d) {
        if (_vidScale > 1.12 && !_videoFill) {
          _toggleFill();
        } else if (_vidScale < 0.88 && _videoFill) {
          _toggleFill();
        } else if (_vidScale == 1.0 &&
            (_vidDrag > 90 ||
                (_vidDrag > 30 && d.velocity.pixelsPerSecond.dy > 900))) {
          _exitLandscapeToPortrait(); // swipe down
        }
        _vidScale = 1.0;
        _vidDrag = 0.0;
      },
      child: Stack(
        fit: StackFit.expand,
        children: [
          black,
          videoLayer,
          Positioned.fill(
            child: IgnorePointer(child: _SkipFlashLayer(flash: _skipFlash)),
          ),
          ui,
        ],
      ),
    );
  }

  Widget _metaText(dynamic t, {bool compact = false, bool header = false}) {
    final titleText = header
        ? (t is Track
              ? t.compactTitle
              : MediaNormalizer.cleanCompactTitle(t?.title?.toString()))
        : (t is Track
              ? t.title
              : MediaNormalizer.cleanTitle(t?.title?.toString()));
    final titleStyle = header
        ? const TextStyle(
            fontFamily: 'SF Pro',
            color: Colors.white,
            fontSize: 17,
            height: 22 / 17,
            fontWeight: FontWeight.w600,
            letterSpacing: -0.25,
          )
        : TextStyle(
            fontFamily: 'SF Pro Display',
            color: Colors.white,
            fontSize: compact ? 21 : 22,
            height: compact ? 26 / 21 : 28 / 22,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.45,
          );
    final artistStyle = header
        ? TextStyle(
            fontFamily: 'SF Pro',
            color: Colors.white.withValues(alpha: 0.70),
            fontSize: 15,
            height: 20 / 15,
            fontWeight: FontWeight.w500,
          )
        : TextStyle(
            fontFamily: 'SF Pro',
            color: Colors.white.withValues(alpha: 0.75),
            fontSize: compact ? 17.5 : 17,
            height: compact ? 22 / 17.5 : 22 / 17,
            fontWeight: FontWeight.w500,
          );

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => _showMediaNavigationSheet(t),
          child: MarqueeScroll(
            resetKey: _trackKey,
            animate: _playing,
            child: SwapText(titleText, dir: _dir, style: titleStyle),
          ),
        ),
        MarqueeScroll(
          resetKey: _trackKey,
          animate: _playing,
          child: InteractiveArtistsText(
            artists: _artistsOf(t),
            style: artistStyle,
            onTapArtist: (_) => _showMediaNavigationSheet(t),
          ),
        ),
      ],
    );
  }

  Widget _compactHeader(PlayerState player, dynamic track) {
    return ValueListenableBuilder<double?>(
      valueListenable: player.videoAspectNotifier,
      builder: (_, aspect, _) {
        final targetAr = _isVideo ? _clampAr(aspect ?? (16 / 9)) : 1.0;
        final dockH = 50.0;
        final dockW = _isVideo ? (dockH * targetAr).clamp(50.0, 105.0) : 56.0;
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
                SizedBox(width: dockW, height: 56),
                const SizedBox(width: 12),
                Expanded(
                  child: XfadeLayer(
                    crossDissolve: true,
                    incoming: KeyedSubtree(
                      key: CrossfadeController.instance.session.value != null
                          ? ValueKey(_trackKey)
                          : null,
                      child: _metaText(track, header: true),
                    ),
                    outgoing: (s) => _metaText(s.from, header: true),
                  ),
                ),
                const SizedBox(width: 8),
                ListenableBuilder(
                  listenable: LibraryStore.instance,
                  builder: (context, _) => PopLikeButton(
                    liked: LibraryStore.instance.isLikedId(
                      track?.id?.toString() ?? _trackKey,
                    ),
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
      },
    );
  }

  Widget _metaRow(dynamic track, {bool compact = false}) {
    final text = XfadeLayer(
      crossDissolve: true,
      incoming: KeyedSubtree(
        key: CrossfadeController.instance.session.value != null
            ? ValueKey(_trackKey)
            : null,
        child: _metaText(track, compact: compact),
      ),
      outgoing: (s) => _metaText(s.from, compact: compact),
    );

    final actions = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListenableBuilder(
          listenable: LibraryStore.instance,
          builder: (context, _) => PopLikeButton(
            liked: LibraryStore.instance.isLikedId(
              track?.id?.toString() ?? _trackKey,
            ),
            onToggle: () => _toggleLike(track),
          ),
        ),
        const SizedBox(width: 8),
        PlayerMoreButton(
          onTap: () => _showTrackMenu(track),
          icon: CupertinoIcons.ellipsis_vertical,
        ),
      ],
    );

    return Padding(
      padding: const EdgeInsets.only(bottom: 1),
      child: Row(
        children: [
          Expanded(
            child: compact
                ? text
                : GestureDetector(
                    behavior: HitTestBehavior.translucent,
                    onVerticalDragStart: (_) => _dragStart(),
                    onVerticalDragUpdate: (d) => _dragUpdate(d.delta.dy),
                    onVerticalDragEnd: (d) =>
                        _dragEnd(d.velocity.pixelsPerSecond.dy),
                    onVerticalDragCancel: () => _dragEnd(0),
                    child: text,
                  ),
          ),
          const SizedBox(width: 12),
          // landscape: refined buttons matching title scale, right edge stays on seekbar end
          compact
              ? Transform.scale(
                  scale: 0.92,
                  alignment: Alignment.centerRight,
                  child: actions,
                )
              : actions,
        ],
      ),
    );
  }

  /// Landscape transport: bold Apple Music landscape controls.
  Widget _transportLandscape(PlayerState player, double w, double h) {
    final play = math.min(h, w * 0.32).clamp(68.0, 92.0).toDouble();
    final skip = play * 0.88;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _SpringButton(
          size: skip,
          label: 'Previous track',
          onTap: _prev,
          child: SpringPop(
            pulse: _prevPulse,
            dx: -10,
            scale: 0.12,
            child: Icon(
              CupertinoIcons.backward_fill,
              color: Colors.white,
              size: skip * 0.58,
            ),
          ),
        ),
        _SpringButton(
          size: play,
          label: _playing ? 'Pause' : 'Play',
          pressedScale: 0.9,
          onTap: player.togglePlay,
          child: _PlayGlyph(playing: _playing, size: play * 0.68),
        ),
        _SpringButton(
          size: skip,
          label: 'Next track',
          onTap: _next,
          child: SpringPop(
            pulse: _nextPulse,
            dx: 10,
            scale: 0.12,
            child: Icon(
              CupertinoIcons.forward_fill,
              color: Colors.white,
              size: skip * 0.58,
            ),
          ),
        ),
      ],
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
              if (!_isVideo)
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

  bool get _reduceMotion =>
      SettingsState.instance.reduceMotion ||
      (MediaQuery.maybeDisableAnimationsOf(context) ?? false);

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
    this.videoFit = BoxFit.contain,
    this.isMini = false,
  });

  final PlayerState player;
  final String coverUrl;
  final bool isVideo;
  final BoxFit videoFit;
  final bool isMini;

  @override
  Widget build(BuildContext context) {
    if (!isVideo) {
      return CoverImage(coverUrl);
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        ColoredBox(
          color: const Color(0xFF000000),
          child: CoverImage(
            coverUrl,
            fit: isMini ? BoxFit.cover : BoxFit.contain,
          ),
        ),
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
                if (isMini) {
                  return FittedBox(
                    fit: BoxFit.cover,
                    clipBehavior: Clip.hardEdge,
                    child: SizedBox(
                      width: vSize.width,
                      height: vSize.height,
                      child: Texture(
                        key: ValueKey('mini_tex_$textureId'),
                        textureId: textureId,
                        filterQuality: FilterQuality.medium,
                      ),
                    ),
                  );
                }
                return ColoredBox(
                  color: const Color(0xFF000000),
                  child: FittedBox(
                    fit: videoFit,
                    clipBehavior: Clip.hardEdge,
                    child: SizedBox(
                      width: vSize.width,
                      height: vSize.height,
                      child: Texture(
                        key: ValueKey('full_tex_$textureId'),
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

/* ------------------------------------------------------------------ */
/*  Landscape volume bar: Apple Music style + seekbar-matched motion  */
/* ------------------------------------------------------------------ */
class _LandscapeVolumeSlider extends StatefulWidget {
  const _LandscapeVolumeSlider({
    required this.player,
    required this.activeColor,
    required this.trackColor,
  });

  final PlayerState player;
  final Color activeColor;
  final Color trackColor;

  @override
  State<_LandscapeVolumeSlider> createState() => _LandscapeVolumeSliderState();
}

class _LandscapeVolumeSliderState extends State<_LandscapeVolumeSlider>
    with SingleTickerProviderStateMixin {
  late final AnimationController _expandC = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 160),
    reverseDuration: const Duration(milliseconds: 220),
  );
  bool _isDragging = false;
  double _dragVol = 0.6;

  void _setDrag(bool active, {double? initialVol}) {
    if (active) {
      if (initialVol != null) _dragVol = initialVol;
      if (!_isDragging) {
        setState(() => _isDragging = true);
        _expandC.forward();
        try {
          HapticFeedback.selectionClick();
        } catch (_) {}
      }
    } else if (_isDragging) {
      setState(() => _isDragging = false);
      _expandC.reverse();
    }
  }

  void _stepBy(double delta) {
    final next = (widget.player.systemVolumeNotifier.value + delta).clamp(
      0.0,
      1.0,
    );
    try {
      HapticFeedback.selectionClick();
    } catch (_) {}
    widget.player.setSystemVolume(next);
  }

  @override
  void dispose() {
    _expandC.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<double>(
      valueListenable: widget.player.systemVolumeNotifier,
      builder: (_, sysVol, _) {
        final targetVol = (_isDragging ? _dragVol : sysVol).clamp(0.0, 1.0);
        return TweenAnimationBuilder<double>(
          tween: Tween<double>(end: targetVol),
          duration: _isDragging
              ? Duration.zero
              : const Duration(milliseconds: 140),
          curve: Curves.easeOutCubic,
          builder: (_, animVol, _) {
            return AnimatedBuilder(
              animation: _expandC,
              builder: (_, _) {
                final e = Curves.easeOutCubic.transform(_expandC.value);
                final trackH = lerpDouble(7.5, 11.5, e)!;
                final iconScale = 1.0 + 0.14 * e;
                final iconAlpha = lerpDouble(0.62, 0.95, e)!;
                final active =
                    Color.lerp(
                      widget.activeColor,
                      Colors.white.withValues(alpha: 0.94),
                      e,
                    ) ??
                    widget.activeColor;
                final track =
                    Color.lerp(
                      widget.trackColor,
                      Colors.white.withValues(alpha: 0.28),
                      e * 0.6,
                    ) ??
                    widget.trackColor;

                return SizedBox(
                  height: 28,
                  child: Row(
                    children: [
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => _stepBy(-0.10),
                        child: Padding(
                          padding: const EdgeInsets.only(right: 10),
                          child: Transform.scale(
                            scale: iconScale,
                            child: Icon(
                              animVol <= 0.01
                                  ? CupertinoIcons.speaker_slash_fill
                                  : CupertinoIcons.speaker_1_fill,
                              size: 16,
                              color: Colors.white.withValues(alpha: iconAlpha),
                            ),
                          ),
                        ),
                      ),
                      Expanded(
                        child: LayoutBuilder(
                          builder: (_, constraints) {
                            final trackW = math.max(1.0, constraints.maxWidth);
                            return GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTapDown: (d) {
                                final v = (d.localPosition.dx / trackW).clamp(
                                  0.0,
                                  1.0,
                                );
                                _dragVol = v;
                                _expandC.forward().then((_) {
                                  if (mounted && !_isDragging) {
                                    _expandC.reverse();
                                  }
                                });
                                try {
                                  HapticFeedback.selectionClick();
                                } catch (_) {}
                                widget.player.setSystemVolume(v);
                              },
                              onHorizontalDragStart: (d) {
                                final v = (d.localPosition.dx / trackW).clamp(
                                  0.0,
                                  1.0,
                                );
                                _setDrag(true, initialVol: v);
                                widget.player.setSystemVolume(v);
                              },
                              onHorizontalDragUpdate: (d) {
                                final v = (d.localPosition.dx / trackW).clamp(
                                  0.0,
                                  1.0,
                                );
                                setState(() => _dragVol = v);
                                widget.player.setSystemVolume(v);
                              },
                              onHorizontalDragEnd: (_) {
                                widget.player.setSystemVolume(_dragVol);
                                _setDrag(false);
                              },
                              onHorizontalDragCancel: () => _setDrag(false),
                              child: Container(
                                height: 28,
                                alignment: Alignment.center,
                                child: Stack(
                                  alignment: Alignment.centerLeft,
                                  clipBehavior: Clip.none,
                                  children: [
                                    CustomPaint(
                                      size: Size(trackW, trackH),
                                      painter: _VolumeTrackPainter(
                                        progress: animVol,
                                        trackColor: track,
                                        activeColor: active,
                                      ),
                                    ),
                                    if (e > 0.05)
                                      Positioned(
                                        left: ((trackW - 14) * animVol).clamp(
                                          0.0,
                                          math.max(0.0, trackW - 14),
                                        ),
                                        child: Opacity(
                                          opacity: e,
                                          child: Container(
                                            width: 14,
                                            height: 14,
                                            decoration: BoxDecoration(
                                              color: Colors.white.withValues(
                                                alpha: 0.96,
                                              ),
                                              shape: BoxShape.circle,
                                              boxShadow: [
                                                BoxShadow(
                                                  color: Colors.black
                                                      .withValues(alpha: 0.35),
                                                  blurRadius: 6,
                                                  offset: const Offset(0, 2),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => _stepBy(0.10),
                        child: Padding(
                          padding: const EdgeInsets.only(left: 10),
                          child: Transform.scale(
                            scale: iconScale,
                            child: Icon(
                              CupertinoIcons.speaker_3_fill,
                              size: 18,
                              color: Colors.white.withValues(alpha: iconAlpha),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
  }
}

class _VolumeTrackPainter extends CustomPainter {
  const _VolumeTrackPainter({
    required this.progress,
    required this.trackColor,
    required this.activeColor,
  });

  final double progress;
  final Color trackColor;
  final Color activeColor;

  @override
  void paint(Canvas canvas, Size size) {
    if (size.width <= 0 || size.height <= 0) return;

    final radius = Radius.circular(size.height / 2);
    final trackRRect = RRect.fromRectAndRadius(Offset.zero & size, radius);
    canvas.drawRRect(
      trackRRect,
      Paint()
        ..color = trackColor
        ..style = PaintingStyle.fill
        ..isAntiAlias = true,
    );

    if (progress > 0) {
      final activeW = (size.width * progress).clamp(0.0, size.width);
      if (activeW > 0) {
        final effectiveW = math.max(activeW, size.height);
        final activeRRect = RRect.fromRectAndRadius(
          Rect.fromLTWH(0, 0, effectiveW, size.height),
          radius,
        );
        canvas.save();
        canvas.clipRRect(trackRRect);
        canvas.drawRRect(
          activeRRect,
          Paint()
            ..color = activeColor
            ..style = PaintingStyle.fill
            ..isAntiAlias = true,
        );
        canvas.restore();
      }
    }
  }

  @override
  bool shouldRepaint(_VolumeTrackPainter old) =>
      old.progress != progress ||
      old.trackColor != trackColor ||
      old.activeColor != activeColor;
}

/* ------------------------------------------------------------------ */
/*  [ ] fullscreen brackets (expand) / inward brackets (collapse)       */
/* ------------------------------------------------------------------ */
class _BracketIcon extends StatelessWidget {
  const _BracketIcon({
    this.size = 18,
    this.color = Colors.white,
    this.collapse = false,
  });
  final double size;
  final Color color;
  final bool collapse;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: size,
    height: size,
    child: CustomPaint(painter: _BracketPainter(color, collapse)),
  );
}

class _BracketPainter extends CustomPainter {
  const _BracketPainter(this.color, this.collapse);
  final Color color;
  final bool collapse;

  @override
  void paint(Canvas canvas, Size s) {
    final w = s.width;
    final sw = w * 0.11;
    final p = sw / 2;
    final len = w * 0.34;
    final q = w * 0.30;
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = sw
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..isAntiAlias = true;
    final path = Path();
    for (final sx in const [1.0, -1.0]) {
      for (final sy in const [1.0, -1.0]) {
        final ox = sx > 0 ? 0.0 : w;
        final oy = sy > 0 ? 0.0 : s.height;
        double x(double v) => ox + sx * v;
        double y(double v) => oy + sy * v;
        if (!collapse) {
          path
            ..moveTo(x(p), y(p + len))
            ..lineTo(x(p), y(p))
            ..lineTo(x(p + len), y(p));
        } else {
          path
            ..moveTo(x(p), y(q))
            ..lineTo(x(q), y(q))
            ..lineTo(x(q), y(p));
        }
      }
    }
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_BracketPainter o) =>
      o.color != color || o.collapse != collapse;
}

/* ------------------------------------------------------------------ */
/*  ±10s button: the arrow kicks round with a spring + a ripple ring    */
/* ------------------------------------------------------------------ */
class _SkipSpinButton extends StatefulWidget {
  const _SkipSpinButton({
    required this.forward,
    required this.pulse,
    required this.onTap,
    required this.label,
    required this.child,
    this.size = 72,
  });
  final bool forward;
  final Listenable pulse;
  final VoidCallback onTap;
  final String label;
  final Widget child; // the dark disc + glyph
  final double size;

  @override
  State<_SkipSpinButton> createState() => _SkipSpinButtonState();
}

class _SkipSpinButtonState extends State<_SkipSpinButton>
    with TickerProviderStateMixin {
  late final AnimationController _spin = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );
  late final AnimationController _ring = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 460),
  );

  @override
  void initState() {
    super.initState();
    widget.pulse.addListener(_kick);
  }

  @override
  void didUpdateWidget(covariant _SkipSpinButton old) {
    super.didUpdateWidget(old);
    if (old.pulse != widget.pulse) {
      old.pulse.removeListener(_kick);
      widget.pulse.addListener(_kick);
    }
  }

  @override
  void dispose() {
    widget.pulse.removeListener(_kick);
    _spin.dispose();
    _ring.dispose();
    super.dispose();
  }

  void _kick() {
    if (!mounted) return;
    _spin.value = 0;
    _spin.animateWith(SpringSimulation(_kSkipSpring, 0, 0, 22));
    _ring.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return _SpringButton(
      size: s,
      label: widget.label,
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: Listenable.merge([_spin, _ring]),
        child: widget.child,
        builder: (_, c) {
          final v = _spin.value;
          final ring = Curves.easeOutCubic.transform(_ring.value);
          final ringA = _ring.isAnimating ? (1 - ring) * 0.4 : 0.0;
          final d = s * (0.9 + 0.45 * ring);
          return Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: [
              if (ringA > 0.01)
                Container(
                  width: d,
                  height: d,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.white.withValues(alpha: ringA),
                      width: 2,
                    ),
                  ),
                ),
              Transform.rotate(
                angle: (widget.forward ? 1 : -1) * 0.9 * v,
                child: Transform.scale(
                  scale: 1 + 0.1 * v.clamp(-0.3, 1.0),
                  child: c,
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
/*  Double-tap skip flash ("20 seconds" accumulates while tapping)      */
/* ------------------------------------------------------------------ */
class _SkipFlash {
  const _SkipFlash(this.side, this.secs, this.tick);
  final int side; // -1 left, 1 right
  final int secs;
  final int tick;
}

class _SkipFlashLayer extends StatefulWidget {
  const _SkipFlashLayer({required this.flash});
  final ValueListenable<_SkipFlash?> flash;

  @override
  State<_SkipFlashLayer> createState() => _SkipFlashLayerState();
}

class _SkipFlashLayerState extends State<_SkipFlashLayer>
    with TickerProviderStateMixin {
  late final AnimationController _pop = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );
  late final AnimationController _fade = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 260),
    value: 1,
  );
  Timer? _hold;
  _SkipFlash? _cur;

  @override
  void initState() {
    super.initState();
    widget.flash.addListener(_on);
  }

  @override
  void dispose() {
    widget.flash.removeListener(_on);
    _hold?.cancel();
    _pop.dispose();
    _fade.dispose();
    super.dispose();
  }

  void _on() {
    final f = widget.flash.value;
    if (f == null || !mounted) return;
    _hold?.cancel();
    setState(() => _cur = f);
    _fade.value = 0; // visible
    _pop.value = 0;
    _pop.animateWith(SpringSimulation(_kSkipSpring, 0, 0, 14));
    _hold = Timer(const Duration(milliseconds: 650), () {
      if (mounted) _fade.forward();
    });
  }

  @override
  Widget build(BuildContext context) {
    final f = _cur;
    if (f == null) return const SizedBox.shrink();
    return AnimatedBuilder(
      animation: Listenable.merge([_pop, _fade]),
      builder: (_, _) {
        final a = (1 - _fade.value).clamp(0.0, 1.0).toDouble();
        if (a < 0.01) return const SizedBox.shrink();
        final k = _pop.value.clamp(-0.3, 1.0).toDouble();
        final disc = Transform.scale(
          scale: 0.9 + 0.22 * k,
          child: Opacity(
            opacity: a,
            child: Container(
              width: 150,
              height: 150,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.16),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    f.side < 0
                        ? CupertinoIcons.backward_fill
                        : CupertinoIcons.forward_fill,
                    color: Colors.white,
                    size: 30,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${f.secs} seconds',
                    style: const TextStyle(
                      fontFamily: 'SF Pro',
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
        return Row(
          children: [
            Expanded(
              child: Center(child: f.side < 0 ? disc : const SizedBox.shrink()),
            ),
            Expanded(
              child: Center(child: f.side > 0 ? disc : const SizedBox.shrink()),
            ),
          ],
        );
      },
    );
  }
}
