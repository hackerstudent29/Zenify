import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show FontFeature, ImageFilter;

import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../features/story_sharing/screens/lyrics_selection_screen.dart';
import '../../services/lyrics_service.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/rendering.dart'
    show RenderAbstractViewport, ScrollDirection;
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../services/player_state.dart';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/// Instrumental gaps shorter than this get NO dots.
const double _kInterludeMin = 5.0;

/// Long held word => per-letter wave.
const double _kWaveMinDuration = 1.0; // seconds
const int _kWaveMinLetters = 2;
const int _kWaveMaxLetters = 9;
const double _kWaveLift = 0.10; // x font size
const double _kWaveScale = 0.08;
const double _kWaveGlow = 0.7;
const double _kWaveSpread = 0.4; // portion of word time used for the stagger

/// Typography (Apple Music / SF Pro style).
/// On iOS/macOS the system SF Pro is used automatically (".SF Pro ...").
/// On Android bundle SF Pro in pubspec.yaml under the family names
/// "SF Pro Display" and "SF Pro Text"; otherwise it falls back to Roboto.
const double _kWordGap = 0.27; // space between words, x font size
const double _kLineHeight = 1.2;
const double _kTracking = 0.008; // letter spacing, x font size (was negative = cramped)

/// Controls auto-hide after this much time without touching the screen.
const Duration _kIdleHide = Duration(seconds: 3);

final bool _isApple = defaultTargetPlatform == TargetPlatform.iOS ||
    defaultTargetPlatform == TargetPlatform.macOS;
final String _kDisplayFont = _isApple ? '.SF Pro Display' : 'SF Pro Display';
final String _kTextFont = _isApple ? '.SF Pro Text' : 'SF Pro Text';

/// Singers that mean "everyone" (stay on the left side).
const _kGroupSingers = {'both', 'all', 'group', 'together', 'duet', 'v1000', 'chorus'};

final _tagRe = RegExp(r'<[^>]+>');
final _nonLetterRe = RegExp(r'[^\p{L}\p{N}]', unicode: true);

bool _isBackingText(String t) {
  final s = t.replaceAll(_tagRe, ' ').trim();
  return s.length >= 2 && s.startsWith('(') && s.endsWith(')');
}

String? _normSinger(String? s) {
  final v = s?.trim().toLowerCase();
  return (v == null || v.isEmpty) ? null : v;
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

class LyricWord {
  const LyricWord({required this.text, required this.start, required this.end});
  final String text;
  final Duration start;
  final Duration end;
}

/// One lyric line. [end] and [words] are optional; without them timing is
/// estimated (start -> next line, split across words by character count).
///
/// [singer] is optional. When the song has 2+ distinct singers, the first
/// singer is shown on the left and every other singer on the right.
class LyricLine {
  const LyricLine({
    required this.start,
    required this.text,
    this.translation,
    this.end,
    this.words,
    this.singer,
  });
  final Duration start;
  final Duration? end;
  final String text;
  final String? translation;
  final List<LyricWord>? words;
  final String? singer;
}

enum LyricsLang {
  original('Original'),
  english('English'),
  both('Both');

  const LyricsLang(this.label);
  final String label;
}

// ---------------------------------------------------------------------------
// Connected sheet
// ---------------------------------------------------------------------------

class LyricsSheet extends StatelessWidget {
  const LyricsSheet({
    super.key,
    this.onImmersiveChanged,
    this.immersiveListenable,
  });

  /// Called with true when the screen was idle for 3s (controls hidden) and
  /// false when the user touches it again. Use it to hide/show your own
  /// player chrome (header, transport controls...) if you want.
  final ValueChanged<bool>? onImmersiveChanged;

  /// Optional external 3s idle state synchronized with the enclosing player.
  final ValueListenable<bool>? immersiveListenable;

  static Duration _ms(dynamic v) =>
      Duration(milliseconds: (v is num ? v : 0).toInt());

  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final track = player.currentTrack;

    if (player.isLoadingLyrics && !player.hasLyrics) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 32,
              height: 32,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white70),
              ),
            ),
            const SizedBox(height: 18),
            Text('Loading lyrics...',
                style: TextStyle(
                    fontFamily: _kTextFont,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withValues(alpha: 0.65),
                    letterSpacing: 0)),
          ],
        ),
      );
    }

    if (!player.hasLyrics) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.lyrics_outlined,
                  size: 52, color: Colors.white.withValues(alpha: 0.28)),
              const SizedBox(height: 16),
              Text('Lyrics Not Available',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontFamily: _kDisplayFont,
                      fontSize: 21,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: 0.2)),
              const SizedBox(height: 8),
              Text(
                track != null
                    ? 'Synchronized lyrics aren\'t available for "${track.title}".'
                    : 'No lyrics available for this track.',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontFamily: _kTextFont,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.55),
                    height: 1.35),
              ),
            ],
          ),
        ),
      );
    }

    final lines = player.lyricsLines.map((m) {
      final rawWords = m['words'];
      List<LyricWord>? words;
      if (rawWords is List && rawWords.isNotEmpty) {
        words = [];
        for (var idx = 0; idx < rawWords.length; idx++) {
          final w = rawWords[idx];
          if (w is Map) {
            final wordText = (w['word'] ?? w['text'] ?? '').toString();
            final start = _ms(w['timeMs'] ?? w['startMs']);
            Duration end;
            final rawEnd = w['endMs'];
            if (rawEnd is num &&
                rawEnd > ((w['timeMs'] ?? w['startMs'] ?? 0) as num)) {
              end = Duration(milliseconds: rawEnd.toInt());
            } else if (idx + 1 < rawWords.length && rawWords[idx + 1] is Map) {
              final nextW = rawWords[idx + 1] as Map;
              final nextStart = _ms(nextW['timeMs'] ?? nextW['startMs']);
              end = nextStart > start
                  ? nextStart
                  : start + const Duration(milliseconds: 320);
            } else {
              end = start + const Duration(milliseconds: 320);
            }
            words.add(LyricWord(text: wordText, start: start, end: end));
          }
        }
      }
      final endMs = m['endMs'];
      return LyricLine(
        start: _ms(m['timeMs'] ?? m['startMs']),
        end: endMs is num ? _ms(endMs) : null,
        text: (m['text'] ?? '').toString(),
        translation: m['translation']?.toString(),
        words: words,
        singer: (m['singer'] ?? m['agent'] ?? m['voice'] ?? m['speaker'])
            ?.toString(),
      );
    }).toList();

    void openShareLyrics() {
      final t = player.currentTrack;
      if (t == null) return;
      final lyricsRes = player.hasLyrics
          ? LyricsResult(
              lines: player.lyricsLines,
              synced: player.lyricsSynced,
              source: 'current',
            )
          : null;
      Navigator.of(context).push(
        CupertinoPageRoute(
          builder: (_) => LyricsSelectionScreen(
            track: t,
            lyrics: lyricsRes,
          ),
        ),
      );
    }

    return LyricsView(
      lines: lines,
      position: player.position,
      isPlaying: player.isPlaying,
      onSeek: player.seek,
      isSynced: player.lyricsSynced,
      onImmersiveChanged: onImmersiveChanged,
      immersiveListenable: immersiveListenable,
      onShareLyrics: openShareLyrics,
    );
  }
}

// ---------------------------------------------------------------------------
// Depth curve
// ---------------------------------------------------------------------------

class _Depth {
  const _Depth(this.o, this.b, this.s);
  final double o, b, s;

  static _Depth lerp(_Depth a, _Depth b, double t) => _Depth(
        a.o + (b.o - a.o) * t,
        a.b + (b.b - a.b) * t,
        a.s + (b.s - a.s) * t,
      );

  @override
  bool operator ==(Object other) =>
      other is _Depth && other.o == o && other.b == b && other.s == s;
  @override
  int get hashCode => Object.hash(o, b, s);
}

// Upcoming lines.
const _after = [
  _Depth(0.62, 0, 0.97),
  _Depth(0.40, 1.2, 0.94),
  _Depth(0.24, 2.6, 0.92),
  _Depth(0.14, 4.0, 0.90),
];
// Finished lines. Their text is drawn in the dim colour (not white), so these
// opacities are higher than before to keep them about as visible as upcoming
// lines.
const _before = [
  _Depth(0.80, 0.8, 0.96),
  _Depth(0.60, 2.2, 0.93),
  _Depth(0.42, 3.8, 0.90),
];

_Depth _depthFor(int dist, bool current, bool manual, bool unsynced,
    bool reduce) {
  if (current || unsynced) return const _Depth(1, 0, 1);
  if (manual) return const _Depth(1, 0, 1);
  final d = dist > 0
      ? _after[math.min(dist, _after.length) - 1]
      : _before[math.min(-dist, _before.length) - 1];
  return reduce ? _Depth(d.o, 0, 1) : d;
}

/// Spring sampled as a Curve (slight overshoot, settles ~0.8s).
class _SpringCurve extends Curve {
  _SpringCurve()
      : _sim = SpringSimulation(
          SpringDescription.withDampingRatio(
              mass: 1, stiffness: 170, ratio: 0.82),
          0,
          1,
          0,
        );
  final SpringSimulation _sim;
  @override
  double transformInternal(double t) => t >= 1 ? 1 : _sim.x(t * 0.85);
}

// ---------------------------------------------------------------------------
// Display items (lines + interludes)
// ---------------------------------------------------------------------------

class _Item {
  const _Item.line(this.start, this.end, this.line,
      {this.right = false, this.backing = false})
      : interlude = false;
  const _Item.gap(this.start, this.end)
      : interlude = true,
        line = null,
        right = false,
        backing = false;
  final bool interlude;
  final double start; // seconds
  final double end; // seconds
  final LyricLine? line;

  /// Duet: this line sits on the right side.
  final bool right;

  /// "( ... )" line.
  final bool backing;

  /// Takes no space unless it is the current item (dots + bracket lines).
  bool get collapsible => interlude || backing;
}

// ---------------------------------------------------------------------------
// LyricsView
// ---------------------------------------------------------------------------

/// Apple Music style lyrics.
///
/// - SF Pro Bold, per-word left-to-right fill with soft edge + glow.
/// - Only TWO font sizes: primary, and a smaller secondary for long lines.
/// - Long held words get a per-letter wave (lift + scale + glow).
/// - Finished lines fade back to the dim colour (never stay white).
/// - Interlude dots (>= 5s gaps) and "( )" lines pop in only while current,
///   then pop out and take no space.
/// - Duets: first singer left, other singer right.
/// - After 3s without touching, the bottom controls slide away and the lyrics
///   take the whole area. Touch again and they come back.
class LyricsView extends StatefulWidget {
  const LyricsView({
    super.key,
    required this.lines,
    required this.position,
    this.isPlaying = true,
    this.onSeek,
    this.initialOffsetMs = 0,
    this.onOffsetChanged,
    this.initialLang = LyricsLang.original,
    this.isSynced = true,
    this.onImmersiveChanged,
    this.immersiveListenable,
    this.onShareLyrics,
  });

  final List<LyricLine> lines;
  final ValueListenable<Duration> position;
  final bool isPlaying;
  final ValueChanged<Duration>? onSeek;
  final int initialOffsetMs;
  final ValueChanged<int>? onOffsetChanged;
  final LyricsLang initialLang;
  final bool isSynced;
  final ValueChanged<bool>? onImmersiveChanged;
  final ValueListenable<bool>? immersiveListenable;
  final VoidCallback? onShareLyrics;

  @override
  State<LyricsView> createState() => _LyricsViewState();
}

class _LyricsViewState extends State<LyricsView>
    with TickerProviderStateMixin {
  static const _step = 500;
  static const _maxOffset = 15000;
  static const Curve _liquidCurve = Cubic(0.16, 1.0, 0.30, 1.0);

  final _scroll = ScrollController();
  final _clock = ValueNotifier<double>(0); // effective seconds (offset applied)
  late final Ticker _ticker = createTicker(_onFrame);

  late List<_Item> _items;
  late List<GlobalKey> _keys;
  late String _sig;

  late int _offsetMs = widget.initialOffsetMs;
  late LyricsLang _lang = widget.initialLang;

  int _active = -1;
  bool _manual = false;
  Timer? _resume;

  // Idle / immersive (controls hidden) state.
  late bool _immersive = widget.immersiveListenable?.value ?? false;
  Timer? _idle;
  int _pointers = 0;

  double _anchorPos = 0;
  Duration _anchorAt = Duration.zero;
  Duration _lastElapsed = Duration.zero;

  bool _didFirstFollow = false;

  bool get _hasTranslation =>
      widget.lines.any((l) => (l.translation ?? '').trim().isNotEmpty);

  static String _signature(List<LyricLine> l) => l.isEmpty
      ? '0'
      : '${l.length}|${l.first.start.inMilliseconds}|${l.first.text}|${l.last.text}';

  @override
  void initState() {
    super.initState();
    _sig = _signature(widget.lines);
    _rebuildItems();
    widget.immersiveListenable?.addListener(_onExternalImmersive);
    if (widget.isSynced) {
      widget.position.addListener(_onPosition);
      _publish(_posSeconds());
      _syncTicker();
      WidgetsBinding.instance.addPostFrameCallback((_) => _follow());
    }
    if (widget.immersiveListenable == null) _armIdle();
  }

  @override
  void didUpdateWidget(covariant LyricsView old) {
    super.didUpdateWidget(old);
    if (old.immersiveListenable != widget.immersiveListenable) {
      old.immersiveListenable?.removeListener(_onExternalImmersive);
      widget.immersiveListenable?.addListener(_onExternalImmersive);
      if (widget.immersiveListenable != null) {
        _idle?.cancel();
        _onExternalImmersive();
      } else {
        _armIdle();
      }
    }
    if (old.position != widget.position) {
      old.position.removeListener(_onPosition);
      if (widget.isSynced) widget.position.addListener(_onPosition);
    }
    final sig = _signature(widget.lines);
    if (sig != _sig || old.isSynced != widget.isSynced) {
      _sig = sig;
      _rebuildItems();
      _manual = false;
      _didFirstFollow = false;
      _active = -1;
      _publish(_posSeconds());
      WidgetsBinding.instance.addPostFrameCallback((_) => _follow());
    }
    if (old.isPlaying != widget.isPlaying) _syncTicker();
  }

  @override
  void dispose() {
    widget.immersiveListenable?.removeListener(_onExternalImmersive);
    widget.position.removeListener(_onPosition);
    _ticker.dispose();
    _resume?.cancel();
    _idle?.cancel();
    _scroll.dispose();
    _clock.dispose();
    super.dispose();
  }

  void _onExternalImmersive() {
    final v = widget.immersiveListenable?.value ?? false;
    _setImmersive(v);
  }

  // ----- idle (hide controls after 3s without touch) -----

  void _setImmersive(bool v) {
    if (_immersive == v || !mounted) return;
    setState(() => _immersive = v);
    widget.onImmersiveChanged?.call(v);
    // Keep the active line smoothly centered as viewport space breathes.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _follow();
    });
  }

  void _armIdle() {
    if (widget.immersiveListenable != null) return;
    _idle?.cancel();
    _idle = Timer(_kIdleHide, () {
      if (mounted && _pointers == 0) _setImmersive(true);
    });
  }

  void _pointerDown() {
    _pointers++;
    _idle?.cancel();
    if (widget.immersiveListenable == null) _setImmersive(false);
  }

  void _pointerUp() {
    _pointers = math.max(0, _pointers - 1);
    if (_pointers == 0) _armIdle();
  }

  // ----- items -----

  void _rebuildItems() {
    final L = widget.lines;
    _keys = [];
    _items = [];
    if (!widget.isSynced) {
      for (final l in L) {
        _items.add(_Item.line(0, 0, l));
      }
      _keys = List.generate(_items.length, (_) => GlobalKey());
      return;
    }
    double s(Duration d) => d.inMicroseconds / 1e6;

    // Real end of a line (null when unknown).
    double? knownEnd(LyricLine l) {
      if (l.end != null) return s(l.end!);
      final w = l.words;
      if (w != null && w.isNotEmpty) return s(w.last.end);
      return null;
    }

    // Duet detection: first singer left, others right.
    final singers = <String>[];
    for (final l in L) {
      final sg = _normSinger(l.singer);
      if (sg != null && !_kGroupSingers.contains(sg) && !singers.contains(sg)) {
        singers.add(sg);
      }
    }
    final duet = singers.length >= 2;
    var lastRight = false;

    if (L.isNotEmpty && s(L.first.start) >= _kInterludeMin) {
      _items.add(_Item.gap(0, s(L.first.start)));
    }
    for (var i = 0; i < L.length; i++) {
      final start = s(L[i].start);
      final hasNext = i + 1 < L.length;
      final nextStart = hasNext ? s(L[i + 1].start) : start + 4;
      final known = knownEnd(L[i]);
      final end = known ?? math.min(nextStart, start + 7).toDouble();

      final backing = _isBackingText(L[i].text);
      final sg = _normSinger(L[i].singer);
      bool right;
      if (!duet) {
        right = false;
      } else if (sg == null) {
        right = lastRight; // inherit side (backing vocals follow their parent)
      } else if (_kGroupSingers.contains(sg)) {
        right = false;
      } else {
        right = singers.indexOf(sg) > 0;
      }
      if (duet && !backing) lastRight = right;

      _items.add(_Item.line(start, end, L[i], right: right, backing: backing));

      // Interlude only when the real line end is known and gap >= 5s.
      if (known != null && hasNext && nextStart - known >= _kInterludeMin) {
        _items.add(_Item.gap(known, nextStart));
      }
    }
    _keys = List.generate(_items.length, (_) => GlobalKey());
  }

  // ----- smooth clock -----

  double _posSeconds() => widget.position.value.inMicroseconds / 1e6;

  double _raw() => _ticker.isActive
      ? _anchorPos + (_lastElapsed - _anchorAt).inMicroseconds / 1e6
      : _posSeconds();

  void _syncTicker() {
    if (!widget.isSynced) return;
    if (widget.isPlaying && !_ticker.isActive) {
      _anchorPos = _posSeconds();
      _anchorAt = Duration.zero;
      _lastElapsed = Duration.zero;
      _ticker.start();
    } else if (!widget.isPlaying && _ticker.isActive) {
      _ticker.stop();
      _publish(_posSeconds());
    }
  }

  void _onPosition() {
    final pos = _posSeconds();
    if (_ticker.isActive) {
      final pred = _raw();
      final diff = pos - pred;
      _anchorPos = diff.abs() > 0.35 ? pos : pred + diff * 0.25;
      _anchorAt = _lastElapsed;
    } else {
      _publish(pos);
    }
  }

  void _onFrame(Duration elapsed) {
    _lastElapsed = elapsed;
    _publish(_raw());
  }

  /// Effective lyric time = playback time + offset.
  /// "+0.5s" makes the lyrics run 0.5s EARLIER (forward),
  /// "-0.5s" makes them run 0.5s LATER.
  void _publish(double raw) {
    final eff = raw + _offsetMs / 1000;
    _clock.value = eff;
    final i = _indexFor(eff);
    if (i != _active) {
      setState(() => _active = i);
      WidgetsBinding.instance.addPostFrameCallback((_) => _follow());
    }
  }

  int _indexFor(double eff) {
    if (!widget.isSynced) return -1;
    for (var i = _items.length - 1; i >= 0; i--) {
      if (_items[i].start <= eff) return i;
    }
    return -1;
  }

  /// Distance from the active item, counting only items that take space
  /// (collapsed dots / bracket lines don't push lines further "away").
  int _distFor(int i) {
    if (!widget.isSynced || i == _active) return 0;
    var n = 0;
    if (i > _active) {
      for (var j = _active + 1; j <= i; j++) {
        if (j == i || !_items[j].collapsible) n++;
      }
      return math.max(1, n);
    } else {
      for (var j = i; j < _active; j++) {
        if (j == i || !_items[j].collapsible) n++;
      }
      return -math.max(1, n);
    }
  }

  // ----- scrolling: silky liquid glide to the active line -----

  void _follow({bool forceAnimated = false}) {
    if (!widget.isSynced || !mounted || _manual || !_scroll.hasClients) return;
    double target;
    if (_active < 0) {
      target = 0;
    } else {
      final ro = _keys[_active].currentContext?.findRenderObject();
      if (ro == null) return;
      target = RenderAbstractViewport.of(ro).getOffsetToReveal(ro, 0.30).offset;
    }
    final pos = _scroll.position;
    target = target.clamp(pos.minScrollExtent, pos.maxScrollExtent).toDouble();
    final d = (target - pos.pixels).abs();
    if (d < 0.5) return;

    final reduce = MediaQuery.disableAnimationsOf(context);
    if ((!_didFirstFollow && !forceAnimated) || reduce) {
      _scroll.jumpTo(target);
      _didFirstFollow = true;
      return;
    }

    _didFirstFollow = true;
    final vh = math.max(1.0, pos.viewportDimension);
    final ms = (380 + (d / vh).clamp(0.0, 2.5) * 260).round().clamp(380, 680);
    _scroll.animateTo(
      target,
      duration: Duration(milliseconds: ms),
      curve: _liquidCurve,
    );
  }

  // ----- offset / language -----

  void _changeOffset(int delta) {
    HapticFeedback.selectionClick();
    setState(() {
      _offsetMs = (_offsetMs + delta).clamp(-_maxOffset, _maxOffset).toInt();
    });
    widget.onOffsetChanged?.call(_offsetMs);
    _publish(_raw());
  }

  void _resetOffset() {
    HapticFeedback.lightImpact();
    setState(() => _offsetMs = 0);
    widget.onOffsetChanged?.call(0);
    _publish(_raw());
  }

  void _onUserScrollEnd() {
    _resume?.cancel();
    _resume = Timer(const Duration(seconds: 3), () {
      if (!mounted) return;
      setState(() => _manual = false);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _follow(forceAnimated: true);
      });
    });
  }

  String get _offsetLabel {
    final s = _offsetMs / 1000;
    return '${s > 0 ? '+' : ''}${s.toStringAsFixed(1)}s';
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.sizeOf(context).height;
    final showControls = _hasTranslation || widget.isSynced;

    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) => _pointerDown(),
      onPointerUp: (_) => _pointerUp(),
      onPointerCancel: (_) => _pointerUp(),
      child: Column(
        children: [
          Expanded(
            child: ShaderMask(
              blendMode: BlendMode.dstIn,
              shaderCallback: (r) => const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0x00000000),
                  Color(0xFF000000),
                  Color(0xFF000000),
                  Color(0x00000000),
                ],
                stops: [0, 0.06, 0.92, 1],
              ).createShader(r),
              child: NotificationListener<ScrollNotification>(
                onNotification: (n) {
                  if (n is ScrollStartNotification && n.dragDetails != null) {
                    _resume?.cancel();
                    if (!_manual) setState(() => _manual = true);
                  } else if (n is UserScrollNotification &&
                      n.direction != ScrollDirection.idle) {
                    _resume?.cancel();
                    if (!_manual) setState(() => _manual = true);
                  } else if (n is ScrollEndNotification && _manual) {
                    _onUserScrollEnd();
                  }
                  return false;
                },
                child: SingleChildScrollView(
                  controller: _scroll,
                  physics: const BouncingScrollPhysics(
                    decelerationRate: ScrollDecelerationRate.fast,
                    parent: AlwaysScrollableScrollPhysics(),
                  ),
                  padding: EdgeInsets.only(top: 28, bottom: h * 0.36),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (var i = 0; i < _items.length; i++)
                        _LineTile(
                          key: _keys[i],
                          item: _items[i],
                          lang: _lang,
                          clock: _clock,
                          synced: widget.isSynced,
                          current: widget.isSynced && i == _active,
                          past: widget.isSynced && i < _active,
                          dist: _distFor(i),
                          manual: _manual,
                          onCollapsed: () => WidgetsBinding.instance
                              .addPostFrameCallback((_) => _follow()),
                          onTap: () {
                            final line = _items[i].line;
                            if (!widget.isSynced || line == null) return;
                            HapticFeedback.selectionClick();
                            _resume?.cancel();
                            final seekMs = math.max(
                                0, line.start.inMilliseconds - _offsetMs);
                            _anchorPos = seekMs / 1000.0;
                            _anchorAt = _lastElapsed;
                            _clock.value = line.start.inMicroseconds / 1e6;
                            setState(() {
                              _manual = false;
                              _active = i;
                            });
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              if (mounted) _follow(forceAnimated: true);
                            });
                            widget.onSeek?.call(Duration(milliseconds: seekMs));
                          },
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          if (showControls)
            ClipRect(
              child: AnimatedAlign(
                alignment: Alignment.topCenter,
                heightFactor: _immersive ? 0.0 : 1.0,
                duration: const Duration(milliseconds: 420),
                curve: _liquidCurve,
                child: AnimatedOpacity(
                  opacity: _immersive ? 0.0 : 1.0,
                  duration: const Duration(milliseconds: 280),
                  curve: Curves.easeOutCubic,
                  child: IgnorePointer(
                    ignoring: _immersive,
                    child: _Controls(
                      lang: _lang,
                      showLang: _hasTranslation,
                      showOffset: widget.isSynced,
                      offsetLabel: _offsetLabel,
                      offsetIsZero: _offsetMs == 0,
                      onLang: (l) {
                        HapticFeedback.selectionClick();
                        setState(() => _lang = l);
                        WidgetsBinding.instance.addPostFrameCallback(
                            (_) => _follow(forceAnimated: true));
                      },
                      onMinus: () => _changeOffset(-_step),
                      onPlus: () => _changeOffset(_step),
                      onReset: _resetOffset,
                      onShareLyrics: widget.onShareLyrics,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Line tile: depth (opacity/blur/scale) + waterfall spring + pop in/out
// ---------------------------------------------------------------------------

class _LineTile extends StatefulWidget {
  const _LineTile({
    super.key,
    required this.item,
    required this.lang,
    required this.clock,
    required this.synced,
    required this.current,
    required this.past,
    required this.dist,
    required this.manual,
    required this.onTap,
    required this.onCollapsed,
  });

  final _Item item;
  final LyricsLang lang;
  final ValueListenable<double> clock;
  final bool synced, current, past, manual;
  final int dist;
  final VoidCallback onTap;
  final VoidCallback onCollapsed;

  @override
  State<_LineTile> createState() => _LineTileState();
}

class _LineTileState extends State<_LineTile> with TickerProviderStateMixin {
  static final _curve = _SpringCurve();

  late final AnimationController _d;
  late final AnimationController _pop;
  late final CurvedAnimation _popCurve;

  late _Depth _from, _to;
  bool _ready = false;
  bool _present = true; // takes layout space
  bool _pressed = false;
  Timer? _dt, _exit;

  @override
  void initState() {
    super.initState();
    _d = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 700));
    _pop = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 380),
        reverseDuration: const Duration(milliseconds: 220));
    _popCurve = CurvedAnimation(
        parent: _pop,
        curve: Curves.easeOutBack,
        reverseCurve: Curves.easeInCubic);
  }

  bool get _collapsible => widget.synced && widget.item.collapsible;

  _Depth get _cur =>
      _Depth.lerp(_from, _to, _curve.transform(_d.value.clamp(0.0, 1.0)));

  bool get _reduce => MediaQuery.disableAnimationsOf(context);

  _Depth _target() => _depthFor(widget.dist, widget.current, widget.manual,
      !widget.synced, _reduce);

  // Subtle waterfall stagger across nearby upcoming lines during playback.
  int get _waterfall => (!widget.current && widget.dist > 0 && !widget.manual)
      ? math.min(widget.dist, 5) * 32
      : 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_ready) {
      _ready = true;
      _from = _to = _target();
      _d.value = 1;
      final show = !_collapsible || widget.current;
      _present = show;
      _pop.value = show ? 1 : 0;
    }
  }

  @override
  void didUpdateWidget(covariant _LineTile old) {
    super.didUpdateWidget(old);

    if (_collapsible) {
      if (widget.current && !old.current) {
        _exit?.cancel();
        _present = true;
        _pop.forward();
      } else if (!widget.current && old.current) {
        _pop.reverse();
        _exit?.cancel();
        _exit = Timer(const Duration(milliseconds: 240), () {
          if (!mounted) return;
          setState(() => _present = false);
          widget.onCollapsed();
        });
      }
    }

    final nt = _target();
    if (nt != _to) {
      _from = _cur;
      _to = nt;
      _d.value = 0;
      _dt?.cancel();
      if (widget.manual) {
        // Sharpen all lines rapidly on drag start to keep scrolling 120fps.
        _d.animateTo(
          1,
          duration: Duration(milliseconds: _reduce ? 0 : 180),
          curve: Curves.easeOutCubic,
        );
      } else {
        _dt = Timer(Duration(milliseconds: _reduce ? 0 : _waterfall), () {
          if (mounted) _d.forward(from: 0);
        });
      }
    }
  }

  @override
  void dispose() {
    _dt?.cancel();
    _exit?.cancel();
    _d.dispose();
    _popCurve.dispose();
    _pop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_collapsible && !_present) return const SizedBox.shrink();

    final it = widget.item;
    final line = it.line;
    final right = it.right;
    final backing = it.backing;

    String main = '';
    String? sub;
    var words = line?.words;
    if (line != null) {
      final tr = (line.translation ?? '').trim();
      switch (widget.lang) {
        case LyricsLang.original:
          main = line.text;
        case LyricsLang.english:
          main = tr.isNotEmpty ? tr : line.text;
          words = null;
        case LyricsLang.both:
          main = line.text;
          sub = tr.isNotEmpty ? tr : null;
      }
    }
    main = main
        .replaceAll(_tagRe, ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();

    Widget content;
    if (it.interlude) {
      content = const _Dots();
    } else {
      content = Column(
        crossAxisAlignment:
            right ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          _WordLine(
            text: main,
            words: words,
            start: it.start,
            end: it.end,
            clock: widget.clock,
            current: widget.current,
            past: widget.past,
            plain: !widget.synced,
            // strict 2 lines total: with a translation the original gets 1.
            maxLines: sub != null ? 1 : 2,
            backing: backing,
            right: right,
          ),
          if (sub != null) ...[
            const SizedBox(height: 5),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: right ? Alignment.centerRight : Alignment.centerLeft,
              child: Text(
                sub,
                maxLines: 1,
                softWrap: false,
                style: TextStyle(
                  fontFamily: _kTextFont,
                  fontSize: 18,
                  height: 1.2,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.1,
                  color: Colors.white
                      .withValues(alpha: widget.current ? 0.85 : 0.6),
                ),
              ),
            ),
          ],
        ],
      );
    }

    final alignment = right ? Alignment.centerRight : Alignment.centerLeft;

    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: Listenable.merge([_d, _pop]),
        child: content,
        builder: (context, child) {
          final dp = _cur;
          final pv = _collapsible ? _popCurve.value : 1.0;
          final popScale = _collapsible ? 0.5 + 0.5 * pv : 1.0;
          final popOpacity = _collapsible ? pv.clamp(0.0, 1.0) : 1.0;

          Widget w = Transform.scale(
            scale: dp.s * popScale,
            alignment: alignment,
            child: child,
          );
          if (dp.b > 0.18) {
            w = ImageFiltered(
              imageFilter: ImageFilter.blur(
                  sigmaX: dp.b, sigmaY: dp.b, tileMode: TileMode.decal),
              child: w,
            );
          }
          w = Opacity(opacity: (dp.o * popOpacity).clamp(0.0, 1.0), child: w);
          final interactive = widget.synced && widget.item.line != null;
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: interactive
                ? (_) {
                    if (!_pressed) setState(() => _pressed = true);
                  }
                : null,
            onTapUp: interactive
                ? (_) {
                    if (_pressed) setState(() => _pressed = false);
                  }
                : null,
            onTapCancel: interactive
                ? () {
                    if (_pressed) setState(() => _pressed = false);
                  }
                : null,
            onTap: widget.onTap,
            child: AnimatedScale(
              scale: _pressed ? 0.96 : 1.0,
              duration: Duration(milliseconds: _pressed ? 100 : 280),
              curve: _pressed ? Curves.easeOutCubic : Curves.easeOutBack,
              alignment: alignment,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  color: _pressed
                      ? Colors.white.withValues(alpha: 0.10)
                      : Colors.transparent,
                ),
                child: w,
              ),
            ),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Word-by-word fill line. Only two font sizes: primary and secondary.
// ---------------------------------------------------------------------------

class _Layout {
  _Layout(this.fs, this.tokens, this.s, this.e, this.emph);
  final double fs;
  final List<String> tokens;
  final List<double> s;
  final List<double> e;
  final List<bool> emph;
}

class _WordLine extends StatefulWidget {
  const _WordLine({
    required this.text,
    required this.words,
    required this.start,
    required this.end,
    required this.clock,
    required this.current,
    required this.past,
    required this.plain,
    required this.maxLines,
    required this.backing,
    required this.right,
  });

  final String text;
  final List<LyricWord>? words;
  final double start, end;
  final ValueListenable<double> clock;
  final bool current, past, plain, backing, right;
  final int maxLines;

  @override
  State<_WordLine> createState() => _WordLineState();
}

class _WordLineState extends State<_WordLine>
    with SingleTickerProviderStateMixin {
  _Layout? _lay;
  double _layW = -1;
  String _layText = '';
  int _layLines = 0;

  /// 1 -> 0 right after a line finishes: the white text eases back to dim.
  late final AnimationController _settle;

  @override
  void initState() {
    super.initState();
    _settle = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 520), value: 0);
  }

  TextStyle _style(double fs, Color c) => TextStyle(
        fontFamily: _kDisplayFont,
        fontSize: fs,
        height: _kLineHeight,
        leadingDistribution: TextLeadingDistribution.even,
        fontWeight: FontWeight.w700,
        letterSpacing: _kTracking * fs,
        fontStyle: widget.backing ? FontStyle.italic : FontStyle.normal,
        color: c,
      );

  _Layout _layout(double maxW) {
    if (_lay != null &&
        _layW == maxW &&
        _layText == widget.text &&
        _layLines == widget.maxLines) {
      return _lay!;
    }
    final tokens = widget.text.split(' ').where((t) => t.isNotEmpty).toList();

    // The two sizes.
    final primary = (maxW * 0.09).clamp(26.0, 36.0).toDouble();
    final secondary = (primary * 0.82).roundToDouble();

    List<double> measure(double fs) {
      final out = <double>[];
      for (final t in tokens) {
        final tp = TextPainter(
          text: TextSpan(text: t, style: _style(fs, Colors.white)),
          textDirection: TextDirection.ltr,
        )..layout();
        out.add(tp.width);
        tp.dispose();
      }
      return out;
    }

    int lines(List<double> w, double fs) {
      final sp = fs * _kWordGap;
      final limit = maxW - 2;
      var n = 1;
      var x = 0.0;
      for (final wd in w) {
        if (wd > limit) n += (wd / limit).ceil() - 1;
        if (x == 0) {
          x = wd;
        } else if (x + sp + wd <= limit) {
          x += sp + wd;
        } else {
          n++;
          x = wd;
        }
      }
      return n;
    }

    // Bracket lines always use the small size; others use primary if it fits
    // in maxLines, otherwise the secondary. Nothing in between.
    var fs = widget.backing ? secondary : primary;
    if (!widget.backing && lines(measure(fs), fs) > widget.maxLines) {
      fs = secondary;
    }

    // timing per word
    final n = tokens.length;
    final s = List<double>.filled(n, 0);
    final e = List<double>.filled(n, 0);
    final emph = List<bool>.filled(n, false);
    final ws = widget.words;
    if (ws != null && ws.isNotEmpty && n > 0) {
      if (ws.length == n) {
        for (var i = 0; i < n; i++) {
          s[i] = ws[i].start.inMicroseconds / 1e6;
          e[i] = math.max(s[i] + 0.05, ws[i].end.inMicroseconds / 1e6);
          final letters = tokens[i].replaceAll(_nonLetterRe, '').runes.length;
          emph[i] = (e[i] - s[i]) >= _kWaveMinDuration &&
              letters >= _kWaveMinLetters &&
              letters <= _kWaveMaxLetters;
        }
      } else {
        // Distribute word timings proportionally across tokens.
        final lineStart = ws.first.start.inMicroseconds / 1e6;
        final lineEnd =
            math.max(lineStart + 0.5, ws.last.end.inMicroseconds / 1e6);
        final total = tokens.fold<int>(0, (a, t) => a + t.length);
        var acc = 0;
        for (var i = 0; i < n; i++) {
          s[i] = lineStart + (acc / math.max(1, total)) * (lineEnd - lineStart);
          acc += tokens[i].length;
          e[i] = lineStart + (acc / math.max(1, total)) * (lineEnd - lineStart);
        }
      }
    } else {
      final dur = math.max(0.5, widget.end - widget.start);
      final total = tokens.fold<int>(0, (a, t) => a + t.length);
      var acc = 0;
      for (var i = 0; i < n; i++) {
        s[i] = widget.start + acc / math.max(1, total) * dur;
        acc += tokens[i].length;
        e[i] = widget.start + acc / math.max(1, total) * dur;
      }
    }

    _layW = maxW;
    _layText = widget.text;
    _layLines = widget.maxLines;
    return _lay = _Layout(fs, tokens, s, e, emph);
  }

  @override
  void didUpdateWidget(covariant _WordLine old) {
    super.didUpdateWidget(old);
    if (old.start != widget.start ||
        old.end != widget.end ||
        old.words != widget.words ||
        old.backing != widget.backing) {
      _lay = null;
    }
    // Line just finished: fade white -> dim instead of snapping.
    if (old.current && !widget.current && widget.past && !widget.plain) {
      _settle.value = 1;
      _settle.reverse();
    } else if (widget.current) {
      _settle.value = 0;
    }
  }

  @override
  void dispose() {
    _settle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.disableAnimationsOf(context);
    return LayoutBuilder(builder: (context, cons) {
      final lay = _layout(cons.maxWidth);
      Widget build(double? t, double settle) => Wrap(
            alignment: widget.right ? WrapAlignment.end : WrapAlignment.start,
            spacing: lay.fs * _kWordGap,
            runSpacing: lay.fs * 0.04,
            crossAxisAlignment: WrapCrossAlignment.end,
            children: [
              for (var i = 0; i < lay.tokens.length; i++)
                _buildWord(lay, i, t, reduce, settle),
            ],
          );

      if (widget.current && !widget.plain) {
        return ValueListenableBuilder<double>(
          valueListenable: widget.clock,
          builder: (_, t, _) => build(t, 1),
        );
      }
      if (widget.past && !widget.plain) {
        if (_settle.isDismissed) return build(null, 0);
        return AnimatedBuilder(
          animation: _settle,
          builder: (context, _) => build(null, _settle.value),
        );
      }
      return build(null, 1);
    });
  }

  Widget _buildWord(_Layout lay, int i, double? t, bool reduce, double settle) {
    final span = math.max(0.001, lay.e[i] - lay.s[i]);
    final double raw;
    if (widget.plain) {
      raw = 2;
    } else if (t == null) {
      raw = widget.past ? 2 : -1;
    } else {
      raw = (t - lay.s[i]) / span;
    }
    return _Word(
      text: lay.tokens[i],
      fs: lay.fs,
      style: _style,
      p: raw.clamp(0.0, 1.0).toDouble(),
      raw: raw,
      settle: settle,
      emph: lay.emph[i] && !reduce && !widget.plain,
    );
  }
}

/// One word: dim base, soft-edged white fill (left to right) and glow.
/// Long held words are split into letters and get a staggered wave.
/// [settle] only matters for a fully filled word: 1 = white, 0 = dim.
class _Word extends StatelessWidget {
  const _Word({
    required this.text,
    required this.fs,
    required this.style,
    required this.p,
    required this.raw,
    required this.emph,
    this.settle = 1,
  });
  final String text;
  final double fs;
  final TextStyle Function(double, Color) style;
  final double p; // 0..1 fill progress
  final double raw; // unclamped progress (for the wave)
  final bool emph;
  final double settle;

  static const _dim = Color(0x6BFFFFFF); // white 42%

  static Widget _fill(String text, double fs,
      TextStyle Function(double, Color) style, double p, double settle) {
    if (p <= 0) return Text(text, style: style(fs, _dim));
    if (p >= 1) {
      return Text(text,
          style: style(fs, Color.lerp(_dim, Colors.white, settle)!));
    }

    const soft = 0.18;
    final a = (p * (1 + soft) - soft).clamp(0.0, 1.0).toDouble();
    final b = (p * (1 + soft)).clamp(0.0, 1.0).toDouble();

    return Stack(
      clipBehavior: Clip.none,
      children: [
        // glow
        Opacity(
          opacity: 0.55,
          child: ImageFiltered(
            imageFilter: ImageFilter.blur(sigmaX: 4, sigmaY: 4),
            child: ShaderMask(
              blendMode: BlendMode.dstIn,
              shaderCallback: (r) => LinearGradient(
                colors: const [Colors.white, Colors.white, Color(0x00FFFFFF)],
                stops: [0, a, b],
              ).createShader(r),
              child: Text(text, style: style(fs, Colors.white)),
            ),
          ),
        ),
        Text(text, style: style(fs, _dim)),
        ShaderMask(
          blendMode: BlendMode.dstIn,
          shaderCallback: (r) => LinearGradient(
            colors: const [Colors.white, Colors.white, Color(0x00FFFFFF)],
            stops: [0, a, b],
          ).createShader(r),
          child: Text(text, style: style(fs, Colors.white)),
        ),
      ],
    );
  }

  Widget _wave() {
    final letters = text.runes.map(String.fromCharCode).toList();
    final n = letters.length;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < n; i++)
          _letter(letters[i], i, n),
      ],
    );
  }

  Widget _letter(String ch, int i, int n) {
    // Each letter owns 1/n of the wipe.
    final pl = (p * n - i).clamp(0.0, 1.0).toDouble();
    // Staggered bump: starts later for later letters, all done by raw == 1.
    final delay = (i / n) * _kWaveSpread;
    final u = ((raw - delay) / (1 - _kWaveSpread)).clamp(0.0, 1.0).toDouble();
    final bump = (u <= 0 || u >= 1)
        ? 0.0
        : math.sin(math.pi * math.pow(u, 0.756).toDouble()); // peak ~40%

    return Transform.translate(
      offset: Offset(0, -fs * _kWaveLift * bump),
      child: Transform.scale(
        scale: 1 + _kWaveScale * bump,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            if (bump > 0.08)
              Opacity(
                opacity: (_kWaveGlow * bump).clamp(0.0, 1.0),
                child: ImageFiltered(
                  imageFilter: ImageFilter.blur(
                      sigmaX: 2 + 6 * bump, sigmaY: 2 + 6 * bump),
                  child: Text(ch, style: style(fs, Colors.white)),
                ),
              ),
            _fill(ch, fs, style, pl, settle),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (emph && raw > 0 && raw < 1) return _wave();
    return _fill(text, fs, style, p, settle);
  }
}

// ---------------------------------------------------------------------------
// Interlude dots: static, the tile pops them in / out.
// ---------------------------------------------------------------------------

class _Dots extends StatelessWidget {
  const _Dots();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 10, 0, 10),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < 3; i++)
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Container(
                width: 13,
                height: 13,
                decoration: BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                        color: Colors.white.withValues(alpha: 0.5),
                        blurRadius: 10)
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Controls: language + sync offset
// ---------------------------------------------------------------------------

/// Small round-ish button that reacts on touch-down, scales while pressed and
/// repeats while held. Replaces PressableScale so taps always register.
class _StepButton extends StatefulWidget {
  const _StepButton({required this.icon, required this.onStep});
  final IconData icon;
  final VoidCallback onStep;

  @override
  State<_StepButton> createState() => _StepButtonState();
}

class _StepButtonState extends State<_StepButton> {
  bool _down = false;
  Timer? _rep;

  void _start() {
    setState(() => _down = true);
    widget.onStep();
    _rep?.cancel();
    _rep = Timer(const Duration(milliseconds: 450), () {
      _rep = Timer.periodic(
          const Duration(milliseconds: 140), (_) => widget.onStep());
    });
  }

  void _stop() {
    _rep?.cancel();
    _rep = null;
    if (mounted && _down) setState(() => _down = false);
  }

  @override
  void dispose() {
    _rep?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _start(),
      onTapUp: (_) => _stop(),
      onTapCancel: _stop,
      child: AnimatedScale(
        scale: _down ? 0.84 : 1,
        duration: const Duration(milliseconds: 120),
        curve: Curves.easeOut,
        child: SizedBox(
          width: 44,
          height: 38,
          child: Icon(widget.icon, size: 20, color: Colors.white),
        ),
      ),
    );
  }
}

class _Controls extends StatelessWidget {
  const _Controls({
    required this.lang,
    required this.showLang,
    required this.showOffset,
    required this.offsetLabel,
    required this.offsetIsZero,
    required this.onLang,
    required this.onMinus,
    required this.onPlus,
    required this.onReset,
    this.onShareLyrics,
  });

  final LyricsLang lang;
  final bool showLang;
  final bool showOffset;
  final String offsetLabel;
  final bool offsetIsZero;
  final ValueChanged<LyricsLang> onLang;
  final VoidCallback onMinus;
  final VoidCallback onPlus;
  final VoidCallback onReset;
  final VoidCallback? onShareLyrics;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 12),
        child: Row(
          children: [
            if (showLang)
              Expanded(
                child: Container(
                  height: 38,
                  padding: const EdgeInsets.all(3),
                  decoration: const ShapeDecoration(
                    shape: StadiumBorder(),
                    color: Color(0x1FFFFFFF),
                  ),
                  child: Row(
                    children: [
                      for (final l in LyricsLang.values)
                        Expanded(
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () => onLang(l),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 250),
                              curve: Curves.easeOutCubic,
                              alignment: Alignment.center,
                              decoration: ShapeDecoration(
                                shape: const StadiumBorder(),
                                color: l == lang
                                    ? Colors.white.withValues(alpha: 0.22)
                                    : Colors.transparent,
                              ),
                              child: Text(
                                l.label,
                                style: TextStyle(
                                  fontFamily: _kTextFont,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: l == lang
                                      ? Colors.white
                                      : Colors.white60,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              )
            else
              const Spacer(),
            if (showOffset) ...[
              const SizedBox(width: 12),
              Container(
                height: 38,
                decoration: const ShapeDecoration(
                  shape: StadiumBorder(),
                  color: Color(0x1FFFFFFF),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _StepButton(icon: Icons.remove_rounded, onStep: onMinus),
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: onReset,
                      child: SizedBox(
                        width: 52,
                        height: 38,
                        child: Center(
                          child: Text(
                            offsetLabel,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontFamily: _kTextFont,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              fontFeatures: const [
                                FontFeature.tabularFigures()
                              ],
                              color: offsetIsZero
                                  ? Colors.white60
                                  : AppColors.accent,
                            ),
                          ),
                        ),
                      ),
                    ),
                    _StepButton(icon: Icons.add_rounded, onStep: onPlus),
                  ],
                ),
              ),
            ],
            if (onShareLyrics != null) ...[
              const SizedBox(width: 10),
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: onShareLyrics,
                child: Container(
                  width: 38,
                  height: 38,
                  decoration: const ShapeDecoration(
                    shape: CircleBorder(),
                    color: Color(0x1FFFFFFF),
                  ),
                  child: const Icon(CupertinoIcons.camera, size: 17, color: Colors.white),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}