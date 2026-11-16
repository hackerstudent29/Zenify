import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show FontFeature, ImageFilter;

import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/rendering.dart'
    show RenderAbstractViewport, ScrollDirection;
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../features/story_sharing/story_sharing.dart';
import '../../services/lyrics_service.dart';
import '../../services/player_state.dart';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/// Instrumental gaps shorter than this get NO dots.
const double kInterludeMinSeconds = 4.0;
const double _kInterludeMin = kInterludeMinSeconds;

/// Lines whose start times are within this many seconds of each other are
/// treated as "same timing" and get played one after another.
const double _kSameStartEps = 0.35;

/// Karaoke glyph-fill subtle scale peak (1.0 to ~1.03-1.05 max).
const double kKaraokeGlyphScalePeak = 1.04;

/// Apple Music lyric typography (SF Pro Display).
const FontWeight _kLyricWeight = FontWeight.w800;

/// Three-dot interlude tunables. (Pulse constants are kept only so existing
/// imports do not break - the dots no longer resize while waiting.)
const double kDotPopInOvershoot = 1.25;
const double kDotPulseScaleMin = 1.0;
const double kDotPulseScaleMax = 1.4;
const double kDotClosingDuration = 0.60; // seconds, pop-out before next line
const int kDotStaggerMs = 110;

/// Apple-style "waterfall": every line below the active one starts its glide a
/// little later than the one above it.
const int _kGlideStaggerMs = 38;
const int _kGlideMaxLines = 9;
const int _kGlideRange = 14;

/// Where the TOP of the active line sits in the viewport (0..1).
const double _kAnchor = 0.28;

/// Typography (Apple Music / SF Pro style).
const double _kWordGap = 0.27; // space between words, x font size
const double _kLineHeight = 1.2;

/// Universal fallback fonts for Indic, Asian, Arabic, Hebrew and Emoji scripts.
const List<String> _kFontFamilyFallback = [
  'Noto Sans Tamil',
  'Noto Sans Devanagari',
  'Noto Sans Telugu',
  'Noto Sans Malayalam',
  'Noto Sans Kannada',
  'Noto Sans Bengali',
  'Noto Sans Gurmukhi',
  'Noto Sans Gujarati',
  'Noto Sans Oriya',
  'Noto Sans Hebrew',
  'Noto Sans Arabic',
  'Noto Sans JP',
  'Noto Sans KR',
  'Nirmala UI',
  'Tamil Sangam MN',
  'Kohinoor Devanagari',
  'Kohinoor Telugu',
  'Kohinoor Bangla',
  'Apple Color Emoji',
  'Noto Color Emoji',
  'Roboto',
  'sans-serif',
];

/// Scripts / sequences where tall line-height is needed for diacritics / combining marks.
final RegExp _complexScriptRe = RegExp(
  r'[\u0300-\u036F\u0590-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u0DFF\u0E00-\u0E7F\u0E80-\u0EFF\u0F00-\u0FFF\u1000-\u109F\u1100-\u11FF\u1780-\u17FF\u200C\u200D\uFE00-\uFE0F\u{1F000}-\u{1FAFF}]',
  unicode: true,
);

bool _hasComplexScript(String s) => _complexScriptRe.hasMatch(s);

/// Regular expression to match instrumental line tags, dots, or solo markers.
final RegExp _instrumentalOrDotsRe = RegExp(
  r'^(\.{2,}|•\s*•\s*•|\[(instrumental|solo|music|guitar solo|intro|outro|bridge|interlude)\]|\((instrumental|solo|music|guitar solo|intro|outro|bridge|interlude)\)|instrumental|solo|music|bridge)$',
  caseSensitive: false,
);

bool _isInstrumentalOrDots(String text) {
  final clean = text.trim();
  if (clean.isEmpty) return true;
  return _instrumentalOrDotsRe.hasMatch(clean);
}

/// Controls auto-hide after this much time without touching the screen.
const Duration _kIdleHide = Duration(seconds: 3);

const String _kDisplayFont = 'SF Pro Display';
const String _kTextFont = 'SF Pro';

/// Singers that mean "everyone" (stay on the left side).
const _kGroupSingers = {
  'both',
  'all',
  'group',
  'together',
  'duet',
  'v1000',
  'chorus',
};

final _tagRe = RegExp(r'<[^>]+>');

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
// Same-timing lines
// ---------------------------------------------------------------------------

List<LyricLine> _spreadSimultaneous(List<LyricLine> src) {
  if (src.length < 2) return src;
  double sec(Duration d) => d.inMicroseconds / 1e6;
  Duration dur(double v) => Duration(microseconds: (v * 1e6).round());

  double? knownEnd(LyricLine l) {
    if (l.end != null) return sec(l.end!);
    final w = l.words;
    if (w != null && w.isNotEmpty) return sec(w.last.end);
    return null;
  }

  LyricLine retime(LyricLine l, double ns, double ne) {
    final w = l.words;
    List<LyricWord>? nw;
    if (w != null && w.isNotEmpty) {
      final ws = sec(w.first.start);
      final we = math.max(ws + 0.05, sec(w.last.end));
      final k = (ne - ns) / (we - ws);
      nw = [
        for (final x in w)
          LyricWord(
            text: x.text,
            start: dur(ns + (sec(x.start) - ws) * k),
            end: dur(ns + (sec(x.end) - ws) * k),
          ),
      ];
    }
    return LyricLine(
      start: dur(ns),
      end: dur(ne),
      text: l.text,
      translation: l.translation,
      words: nw,
      singer: l.singer,
    );
  }

  final out = <LyricLine>[];
  var i = 0;
  while (i < src.length) {
    var j = i + 1;
    while (j < src.length &&
        sec(src[j].start) - sec(src[i].start) < _kSameStartEps) {
      j++;
    }
    if (j - i == 1) {
      out.add(src[i]);
      i = j;
      continue;
    }

    final group = src.sublist(i, j);
    final gs = sec(group.first.start);
    final nextStart = j < src.length ? sec(src[j].start) : null;

    final durs = <double>[
      for (final l in group)
        () {
          final ke = knownEnd(l);
          final d = ke != null ? ke - sec(l.start) : 0.0;
          return d > 0.3 ? d : math.max(1.2, l.text.characters.length * 0.075);
        }(),
    ];
    final sum = durs.fold<double>(0, (a, b) => a + b);
    final avail = nextStart != null ? nextStart - gs : sum;
    final scale = (sum > avail && avail > 0) ? avail / sum : 1.0;

    var cursor = gs;
    for (var k = 0; k < group.length; k++) {
      final d = durs[k] * scale;
      out.add(retime(group[k], cursor, cursor + d));
      cursor += d;
    }
    i = j;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Connected sheet
// ---------------------------------------------------------------------------

class LyricsSheet extends StatelessWidget {
  const LyricsSheet({
    super.key,
    this.onImmersiveChanged,
    this.immersiveListenable,
    this.open = true,
    this.revealAnimation,
  });

  final ValueChanged<bool>? onImmersiveChanged;
  final ValueListenable<bool>? immersiveListenable;
  final bool open;
  final Animation<double>? revealAnimation;

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
            Text(
              'Loading lyrics...',
              style: TextStyle(
                fontFamily: _kTextFont,
                fontFamilyFallback: _kFontFamilyFallback,
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: Colors.white.withValues(alpha: 0.65),
                letterSpacing: 0,
              ),
            ),
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
              Icon(
                Icons.lyrics_outlined,
                size: 52,
                color: Colors.white.withValues(alpha: 0.28),
              ),
              const SizedBox(height: 16),
              Text(
                'Lyrics Not Available',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: _kDisplayFont,
                  fontFamilyFallback: _kFontFamilyFallback,
                  fontSize: 21,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                  letterSpacing: 0.2,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                track != null
                    ? 'Synchronized lyrics aren\'t available for "${track.title}".'
                    : 'No lyrics available for this track.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: _kTextFont,
                  fontFamilyFallback: _kFontFamilyFallback,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withValues(alpha: 0.55),
                  height: 1.35,
                ),
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
          builder: (_) => LyricsSelectionScreen(track: t, lyrics: lyricsRes),
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
      open: open,
      revealAnimation: revealAnimation,
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

const _after = [
  _Depth(0.62, 0, 0.97),
  _Depth(0.40, 1.2, 0.94),
  _Depth(0.24, 2.6, 0.92),
  _Depth(0.14, 4.0, 0.90),
];
const _before = [
  _Depth(0.80, 0.8, 0.96),
  _Depth(0.60, 2.2, 0.93),
  _Depth(0.42, 3.8, 0.90),
];

_Depth _depthFor(
  int dist,
  bool current,
  bool manual,
  bool unsynced,
  bool reduce,
) {
  if (current || unsynced) return const _Depth(1, 0, 1);
  if (manual) return const _Depth(0.86, 0, 0.97);
  final d = dist > 0
      ? _after[math.min(dist, _after.length) - 1]
      : _before[math.min(-dist, _before.length) - 1];
  return reduce ? _Depth(d.o, 0, 1) : d;
}

/// A real damped spring sampled as a Curve.
class _SpringCurve extends Curve {
  _SpringCurve({
    double stiffness = 170,
    double ratio = 0.82,
    this._settle = 0.85,
  }) : _sim = SpringSimulation(
         SpringDescription.withDampingRatio(
           mass: 1,
           stiffness: stiffness,
           ratio: ratio,
         ),
         0,
         1,
         0,
       );
  final SpringSimulation _sim;
  final double _settle;
  @override
  double transformInternal(double t) => t >= 1 ? 1 : _sim.x(t * _settle);
}

final Curve _depthSpring = _SpringCurve();
final Curve _glideSpring = _SpringCurve(
  stiffness: 120,
  ratio: 0.8,
  settle: 0.7,
);
final Curve _revealSpring = _SpringCurve(
  stiffness: 150,
  ratio: 0.74,
  settle: 0.7,
);
final Curve _popSpring = _SpringCurve(stiffness: 240, ratio: 0.58, settle: 0.5);
final Curve _thumbSpring = _SpringCurve(
  stiffness: 220,
  ratio: 0.7,
  settle: 0.6,
);
const Curve _liquidCurve = Cubic(0.16, 1.0, 0.30, 1.0);

/// One "layout moved" event. Every tile turns it into its own spring that
/// starts from where the tile used to be on screen.
///
/// Tiles with index < [pivot] start [before] px away from rest, tiles with
/// index > [pivot] start [after] px away. The pivot tile itself is skipped.
/// A plain scroll uses pivot = -1 and before == after == scroll delta.
class _Glide {
  const _Glide(this.id, this.active, this.pivot, this.before, this.after);
  final int id;
  final int active;
  final int pivot;
  final double before;
  final double after;
}

// ---------------------------------------------------------------------------
// Display items (lines + interludes)
// ---------------------------------------------------------------------------

class _Item {
  const _Item.line(
    this.start,
    this.end,
    this.line, {
    this.right = false,
    this.backing = false,
  }) : interlude = false;
  const _Item.gap(this.start, this.end)
    : interlude = true,
      line = null,
      right = false,
      backing = false;
  final bool interlude;
  final double start; // seconds
  final double end; // seconds
  final LyricLine? line;
  final bool right;
  final bool backing;

  bool get collapsible => interlude || backing;
}

// ---------------------------------------------------------------------------
// LyricsView
// ---------------------------------------------------------------------------

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
    this.open = true,
    this.revealAnimation,
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
  final bool open;
  final Animation<double>? revealAnimation;

  @override
  State<LyricsView> createState() => _LyricsViewState();
}

class _LyricsViewState extends State<LyricsView> with TickerProviderStateMixin {
  static const _step = 500;
  static const _maxOffset = 15000;

  final _scroll = ScrollController();
  final _clock = ValueNotifier<double>(0);
  late final Ticker _ticker = createTicker(_onFrame);

  late final AnimationController _revealCtl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 950),
    reverseDuration: const Duration(milliseconds: 520),
  );
  Animation<double> get _reveal => widget.revealAnimation ?? _revealCtl;

  final _glide = ValueNotifier<_Glide?>(null);
  int _glideId = 0;

  late List<_Item> _items;
  late List<GlobalKey> _keys;
  late String _sig;

  /// Signed distance of every item from the active one (computed once per
  /// active change instead of O(n) per tile per build).
  List<int> _dists = const [];

  late int _offsetMs = widget.initialOffsetMs;
  late LyricsLang _lang = widget.initialLang;

  int _active = -1;
  bool _manual = false;
  Timer? _resume;

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

    if (widget.revealAnimation == null && widget.open) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _revealCtl.forward();
      });
    }
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
      _rebuildItems(); // also resets _active to -1
      _manual = false;
      _didFirstFollow = false;
      _publish(_posSeconds());
      WidgetsBinding.instance.addPostFrameCallback((_) => _follow());
    }
    if (old.isPlaying != widget.isPlaying) _syncTicker();

    if (old.open != widget.open && widget.revealAnimation == null) {
      widget.open ? _revealCtl.forward() : _revealCtl.reverse();
    }
  }

  @override
  void dispose() {
    widget.immersiveListenable?.removeListener(_onExternalImmersive);
    widget.position.removeListener(_onPosition);
    _ticker.dispose();
    _revealCtl.dispose();
    _resume?.cancel();
    _idle?.cancel();
    _scroll.dispose();
    _clock.dispose();
    _glide.dispose();
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
    _active = -1;
    final L = widget.isSynced
        ? _spreadSimultaneous(widget.lines)
        : widget.lines;
    _keys = [];
    _items = [];
    if (!widget.isSynced) {
      for (final l in L) {
        _items.add(_Item.line(0, 0, l));
      }
      _keys = List.generate(_items.length, (_) => GlobalKey());
      _computeDists();
      return;
    }
    double s(Duration d) => d.inMicroseconds / 1e6;

    double? knownEnd(LyricLine l) {
      if (l.end != null) return s(l.end!);
      final w = l.words;
      if (w != null && w.isNotEmpty) return s(w.last.end);
      return null;
    }

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

      if (_isInstrumentalOrDots(L[i].text)) {
        _items.add(
          _Item.gap(start, hasNext ? nextStart : math.max(start + 4.0, end)),
        );
        continue;
      }

      final backing = _isBackingText(L[i].text);
      final sg = _normSinger(L[i].singer);
      bool right;
      if (backing) {
        right = true;
      } else if (!duet) {
        right = false;
      } else if (sg == null) {
        right = lastRight;
      } else if (_kGroupSingers.contains(sg)) {
        right = false;
      } else {
        right = singers.indexOf(sg) > 0;
      }
      if (duet && !backing) lastRight = right;

      _items.add(_Item.line(start, end, L[i], right: right, backing: backing));

      if (known != null && hasNext && nextStart - known >= _kInterludeMin) {
        _items.add(_Item.gap(known, nextStart));
      }
    }
    _keys = List.generate(_items.length, (_) => GlobalKey());
    _computeDists();
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

  void _publish(double raw) {
    final eff = raw + _offsetMs / 1000;
    _clock.value = eff;
    final i = _indexFor(eff);
    if (i != _active) {
      setState(() {
        _active = i;
        _computeDists();
      });
      WidgetsBinding.instance.addPostFrameCallback((_) => _follow());
    }
  }

  int _indexFor(double eff) {
    if (!widget.isSynced) return -1;
    final n = _items.length;
    // Fast path: still inside the active item (runs every frame).
    if (_active >= 0 &&
        _active < n &&
        _items[_active].start <= eff &&
        (_active + 1 >= n || _items[_active + 1].start > eff)) {
      return _active;
    }
    for (var i = n - 1; i >= 0; i--) {
      if (_items[i].start <= eff) return i;
    }
    return -1;
  }

  /// Distance (in "visible lines") of each item from the active one.
  /// Bracket lines / dots only count when they are the target itself.
  void _computeDists() {
    final n = _items.length;
    final d = List<int>.filled(n, 0);
    if (widget.isSynced) {
      var c = 0;
      for (var i = _active + 1; i < n; i++) {
        d[i] = 1 + c;
        if (!_items[i].collapsible) c++;
      }
      c = 0;
      for (var i = math.min(_active, n) - 1; i >= 0; i--) {
        d[i] = -(1 + c);
        if (!_items[i].collapsible) c++;
      }
    }
    _dists = d;
  }

  // ----- scrolling -----
  //
  // Layout changes are always DISCRETE and happen in the same frame as the
  // scroll correction, so nothing ever drifts or flickers. All smoothness
  // comes from per-tile springs (the Apple Music "liquid waterfall"):
  //
  //  * active line changes  -> jump the scroll, every tile springs from where
  //    it was (waterfall delay for tiles below the active line).
  //  * a bracket line / dots tile finishes its pop-out and leaves layout ->
  //    _onTileCollapse() compensates the scroll in the same frame and the
  //    tiles spring from their old screen position.
  //  * a bracket line / dots tile becomes active -> its height eases open
  //    inside the tile (nothing above it moves) and the lines below it are
  //    pushed down smoothly.

  void _follow({bool forceAnimated = false}) {
    if (!widget.isSynced || !mounted || _manual || !_scroll.hasClients) return;
    final pos = _scroll.position;
    double target;
    if (_active < 0) {
      target = 0;
    } else {
      final ro = _keys[_active].currentContext?.findRenderObject();
      if (ro == null) return;
      // Anchor the TOP of the active line (independent of its own height, so
      // an expanding bracket line never changes the target).
      final top = RenderAbstractViewport.of(ro).getOffsetToReveal(ro, 0.0).offset;
      target = top - pos.viewportDimension * _kAnchor;
    }
    target = target.clamp(pos.minScrollExtent, pos.maxScrollExtent).toDouble();
    final delta = target - pos.pixels;
    if (delta.abs() < 0.5) return;

    final reduce = MediaQuery.disableAnimationsOf(context);
    if ((!_didFirstFollow && !forceAnimated) || reduce) {
      _scroll.jumpTo(target);
      _didFirstFollow = true;
      return;
    }
    _didFirstFollow = true;

    // Always jump + spring the tiles (also for long jumps / seeking backwards),
    // so the waterfall never goes missing.
    final vh = math.max(1.0, pos.viewportDimension);
    final shown = delta.clamp(-vh * 1.1, vh * 1.1).toDouble();
    _scroll.jumpTo(target);
    _glide.value = _Glide(++_glideId, _active, -1, shown, shown);
  }

  /// Called synchronously by a tile right before it leaves the layout.
  void _onTileCollapse(int index, double h) {
    if (h < 0.5 || !_scroll.hasClients || !mounted) return;
    final pos = _scroll.position;

    var above = index < _active;
    if (_manual) {
      final ro = _keys[index].currentContext?.findRenderObject();
      above =
          ro != null &&
          RenderAbstractViewport.of(ro).getOffsetToReveal(ro, 0.0).offset <
              pos.pixels + pos.viewportDimension * _kAnchor;
    }

    double before = 0, after = h;
    if (above) {
      final np = math.max(pos.minScrollExtent, pos.pixels - h);
      final shift = pos.pixels - np;
      if (shift > 0) {
        if (_manual) {
          pos.correctBy(-shift); // do not kill the user's drag / fling
        } else {
          _scroll.jumpTo(np);
        }
      }
      before = -shift;
      after = h - shift;
    }
    _glide.value = _Glide(++_glideId, _active, index, before, after);
    WidgetsBinding.instance.addPostFrameCallback((_) => _follow());
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

    return Material(
      type: MaterialType.transparency,
      child: Listener(
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
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        for (var i = 0; i < _items.length; i++)
                          _LineTile(
                            key: _keys[i],
                            item: _items[i],
                            index: i,
                            lang: _lang,
                            clock: _clock,
                            reveal: _reveal,
                            glide: _glide,
                            synced: widget.isSynced,
                            current: widget.isSynced && i == _active,
                            past: widget.isSynced && i < _active,
                            dist: _dists[i],
                            manual: _manual,
                            onCollapse: _onTileCollapse,
                            onTap: () {
                              final line = _items[i].line;
                              if (!widget.isSynced || line == null) return;
                              HapticFeedback.selectionClick();
                              _resume?.cancel();
                              final seekMs = math.max(
                                0,
                                line.start.inMilliseconds - _offsetMs,
                              );
                              _anchorPos = seekMs / 1000.0;
                              _anchorAt = _lastElapsed;
                              _clock.value = line.start.inMicroseconds / 1e6;
                              setState(() {
                                _manual = false;
                                _active = i;
                                _computeDists();
                              });
                              WidgetsBinding.instance.addPostFrameCallback((_) {
                                if (mounted) _follow(forceAnimated: true);
                              });
                              widget.onSeek?.call(
                                Duration(milliseconds: seekMs),
                              );
                            },
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            if (showControls)
              AnimatedBuilder(
                animation: _reveal,
                builder: (context, child) {
                  final v = Curves.easeOut.transform(
                    _reveal.value.clamp(0.0, 1.0),
                  );
                  return Opacity(
                    opacity: v,
                    child: Transform.translate(
                      offset: Offset(0, (1 - v) * 18),
                      child: child,
                    ),
                  );
                },
                child: ClipRect(
                  child: AnimatedAlign(
                    alignment: Alignment.topCenter,
                    heightFactor: _immersive ? 0.0 : 1.0,
                    duration: const Duration(milliseconds: 460),
                    curve: _liquidCurve,
                    child: AnimatedOpacity(
                      opacity: _immersive ? 0.0 : 1.0,
                      duration: const Duration(milliseconds: 300),
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
                              (_) => _follow(forceAnimated: true),
                            );
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
              ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Line tile
//   depth (opacity/blur/scale) spring  +  waterfall glide  +  open/close
//   reveal cascade  +  pop in/out  +  height ease-open for bracket / dots
// ---------------------------------------------------------------------------

class _LineTile extends StatefulWidget {
  const _LineTile({
    super.key,
    required this.item,
    required this.index,
    required this.lang,
    required this.clock,
    required this.reveal,
    required this.glide,
    required this.synced,
    required this.current,
    required this.past,
    required this.dist,
    required this.manual,
    required this.onTap,
    required this.onCollapse,
  });

  final _Item item;
  final int index;
  final LyricsLang lang;
  final ValueListenable<double> clock;
  final Animation<double> reveal;
  final ValueListenable<_Glide?> glide;
  final bool synced, current, past, manual;
  final int dist;
  final VoidCallback onTap;
  final void Function(int index, double height) onCollapse;

  @override
  State<_LineTile> createState() => _LineTileState();
}

class _LineTileState extends State<_LineTile> with TickerProviderStateMixin {
  late final AnimationController _d; // depth
  late final AnimationController _pop; // collapsible pop in/out (visual)
  late final AnimationController _g; // waterfall glide
  late final AnimationController _sz; // collapsible height 0..1
  late final CurvedAnimation _popCurve;
  late final CurvedAnimation _szCurve;

  late _Depth _from, _to;
  bool _ready = false;
  bool _present = true; // takes layout space
  bool _pressed = false;
  double _gFrom = 0;
  Timer? _dt, _exit, _glideT;

  @override
  void initState() {
    super.initState();
    _d = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _pop = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
      reverseDuration: const Duration(milliseconds: 240),
    );
    _popCurve = CurvedAnimation(
      parent: _pop,
      curve: _popSpring,
      reverseCurve: Curves.easeInCubic,
    );
    _sz = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    );
    _szCurve = CurvedAnimation(parent: _sz, curve: _liquidCurve);
    _g = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 760),
      value: 1,
    );
    widget.glide.addListener(_onGlide);
  }

  bool get _collapsible => widget.synced && widget.item.collapsible;

  _Depth get _cur =>
      _Depth.lerp(_from, _to, _depthSpring.transform(_d.value.clamp(0.0, 1.0)));

  bool get _reduce => MediaQuery.disableAnimationsOf(context);

  _Depth _target() => _depthFor(
    widget.dist,
    widget.current,
    widget.manual,
    !widget.synced,
    _reduce,
  );

  int get _waterfall => (!widget.current && widget.dist > 0 && !widget.manual)
      ? math.min(widget.dist, 5) * 32
      : 0;

  double get _glideY =>
      _gFrom * (1 - _glideSpring.transform(_g.value.clamp(0.0, 1.0)));

  double _revealP() {
    final v = widget.reveal.value;
    if (v >= 1.0) return 1.0;
    if (v <= 0.0) return 0.0;
    if (_reduce) return v;
    final rank = widget.synced
        ? (widget.dist + 3).clamp(0, 11)
        : math.min(widget.index, 11);
    final begin = rank / 11 * 0.45;
    final local = ((v - begin) / 0.55).clamp(0.0, 1.0).toDouble();
    return widget.reveal.status == AnimationStatus.reverse
        ? Curves.easeInOutCubic.transform(local)
        : _revealSpring.transform(local);
  }

  void _onGlide() {
    final g = widget.glide.value;
    if (g == null || !mounted) return;
    if (widget.index == g.pivot) return; // the tile that just left layout
    final rel = widget.index - g.active;
    if (rel.abs() > _kGlideRange) return;
    final d = widget.index < g.pivot ? g.before : g.after;
    if (d.abs() < 0.5) return;
    // The tile must visually stay where it was: offset = old leftover + delta.
    _gFrom = _glideY + d;
    _g.value = 0;
    _glideT?.cancel();
    final delay = _reduce
        ? 0
        : (rel > 0 ? math.min(rel, _kGlideMaxLines) * _kGlideStaggerMs : 0);
    if (delay == 0) {
      _g.forward(from: 0);
    } else {
      _glideT = Timer(Duration(milliseconds: delay), () {
        if (mounted) _g.forward(from: 0);
      });
    }
  }

  void _setPressed(bool down) {
    if (_pressed != down) setState(() => _pressed = down);
  }

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
      _sz.value = show ? 1 : 0;
    }
  }

  /// Pop-out is done: leave the layout. The parent fixes the scroll offset in
  /// this very same frame and springs the other tiles, so nothing jumps.
  void _collapse() {
    if (!mounted || widget.current || !_present) return;
    final ro = context.findRenderObject();
    final h = (ro is RenderBox && ro.hasSize) ? ro.size.height : 0.0;
    widget.onCollapse(widget.index, h);
    _pop.value = 0;
    _sz.value = 0;
    setState(() => _present = false);
  }

  @override
  void didUpdateWidget(covariant _LineTile old) {
    super.didUpdateWidget(old);

    if (_collapsible) {
      if (widget.current && !old.current) {
        _exit?.cancel();
        _present = true;
        _pop.forward();
        _sz.forward();
      } else if (!widget.current && old.current) {
        _pop.reverse();
        _exit?.cancel();
        _exit = Timer(const Duration(milliseconds: 300), _collapse);
      }
    }

    final nt = _target();
    if (nt != _to) {
      _from = _cur;
      _to = nt;
      _d.value = 0;
      _dt?.cancel();
      if (widget.manual) {
        _d.animateTo(
          1,
          duration: Duration(milliseconds: _reduce ? 0 : 180),
          curve: Curves.easeOutCubic,
        );
      } else if (_waterfall == 0) {
        _d.forward(from: 0);
      } else {
        _dt = Timer(Duration(milliseconds: _reduce ? 0 : _waterfall), () {
          if (mounted) _d.forward(from: 0);
        });
      }
    }
  }

  @override
  void dispose() {
    widget.glide.removeListener(_onGlide);
    _dt?.cancel();
    _exit?.cancel();
    _glideT?.cancel();
    _d.dispose();
    _popCurve.dispose();
    _szCurve.dispose();
    _pop.dispose();
    _sz.dispose();
    _g.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_collapsible && !_present) {
      return const SizedBox(width: double.infinity, height: 0);
    }

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
    main = main.replaceAll(_tagRe, ' ').replaceAll(RegExp(r'\s+'), ' ').trim();

    final isCenter = it.interlude || _isInstrumentalOrDots(main);
    Widget content;
    if (it.interlude) {
      content = Center(
        child: _Dots(clock: widget.clock, start: it.start, end: it.end),
      );
    } else {
      content = Column(
        crossAxisAlignment: isCenter
            ? CrossAxisAlignment.center
            : (right ? CrossAxisAlignment.end : CrossAxisAlignment.start),
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
            maxLines: sub != null ? 1 : 2,
            backing: backing,
            right: right,
            center: isCenter,
          ),
          if (sub != null) ...[
            const SizedBox(height: 5),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: isCenter
                  ? Alignment.center
                  : (right ? Alignment.centerRight : Alignment.centerLeft),
              child: Text(
                sub,
                maxLines: 1,
                softWrap: false,
                style: TextStyle(
                  fontFamily: _kTextFont,
                  fontFamilyFallback: _kFontFamilyFallback,
                  fontSize: 18,
                  height: _hasComplexScript(sub) ? 1.32 : 1.2,
                  fontWeight: _hasComplexScript(sub)
                      ? FontWeight.w700
                      : FontWeight.w600,
                  letterSpacing: _hasComplexScript(sub) ? 0.0 : 0.35,
                  color: Colors.white.withValues(
                    alpha: widget.current ? 0.85 : 0.6,
                  ),
                ),
              ),
            ),
          ],
        ],
      );
    }

    final alignment = isCenter
        ? Alignment.center
        : (right ? Alignment.centerRight : Alignment.centerLeft);
    final interactive = widget.synced && widget.item.line != null;

    final inner = RepaintBoundary(
      child: AnimatedBuilder(
        animation: Listenable.merge([_d, _pop]),
        child: content,
        builder: (context, child) {
          final dp = _cur;
          // Dots own their scale; bracket lines pop as a whole tile.
          final pv = _collapsible ? _popCurve.value : 1.0;
          final popScale = (_collapsible && !it.interlude)
              ? 0.5 + 0.5 * pv
              : 1.0;
          final popOpacity = _collapsible ? pv.clamp(0.0, 1.0) : 1.0;

          Widget w = Transform.scale(
            scale: dp.s * popScale,
            alignment: alignment,
            child: child,
          );
          if (dp.b > 0.18) {
            w = ImageFiltered(
              imageFilter: ImageFilter.blur(
                sigmaX: dp.b,
                sigmaY: dp.b,
                tileMode: TileMode.decal,
              ),
              child: w,
            );
          }
          w = Opacity(opacity: (dp.o * popOpacity).clamp(0.0, 1.0), child: w);

          final tile = AnimatedScale(
            scale: _pressed ? 0.975 : 1.0,
            duration: Duration(milliseconds: _pressed ? 120 : 460),
            curve: _pressed ? Curves.easeOutCubic : _popSpring,
            alignment: alignment,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 11),
              child: w,
            ),
          );

          if (!interactive) return tile;

          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: (_) => _setPressed(true),
            onTapUp: (_) => _setPressed(false),
            onTapCancel: () => _setPressed(false),
            onTap: widget.onTap,
            child: tile,
          );
        },
      ),
    );

    final body = AnimatedBuilder(
      animation: Listenable.merge([_g, widget.reveal]),
      child: inner,
      builder: (context, child) {
        final p = _revealP();
        return Opacity(
          opacity: p.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, _glideY + (1 - p) * 56),
            child: Transform.scale(
              scale: 0.94 + 0.06 * p,
              alignment: alignment,
              child: child,
            ),
          ),
        );
      },
    );

    if (!_collapsible) return body;

    // Bracket lines / dots ease their height open when they become active.
    // Nothing above them moves, only the lines below are pushed down.
    return AnimatedBuilder(
      animation: _szCurve,
      child: body,
      builder: (context, child) {
        final f = _szCurve.value.clamp(0.0, 1.0).toDouble();
        return ClipRect(
          clipBehavior: f < 0.999 ? Clip.hardEdge : Clip.none,
          child: Align(
            alignment: Alignment.topCenter,
            heightFactor: f,
            child: child,
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Word-by-word fill line.
// ---------------------------------------------------------------------------

class _Layout {
  _Layout(this.fs, this.tokens, this.s, this.e);
  final double fs;
  final List<String> tokens;
  final List<double> s;
  final List<double> e;
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
    this.center = false,
  });

  final String text;
  final List<LyricWord>? words;
  final double start, end;
  final ValueListenable<double> clock;
  final bool current, past, plain, backing, right, center;
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

  late final AnimationController _settle;

  @override
  void initState() {
    super.initState();
    _settle = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
      value: 0,
    );
  }

  TextStyle _style(double fs, Color c) {
    final complex = _hasComplexScript(widget.text);
    return TextStyle(
      fontFamily: _kDisplayFont,
      fontFamilyFallback: _kFontFamilyFallback,
      fontSize: fs,
      height: _kLineHeight,
      leadingDistribution: TextLeadingDistribution.even,
      fontWeight: complex
          ? (widget.backing ? FontWeight.w700 : _kLyricWeight)
          : (widget.backing ? FontWeight.w500 : FontWeight.w600),
      letterSpacing: complex ? 0.0 : 0.55,
      color: c,
    );
  }

  _Layout _layout(double maxW) {
    if (_lay != null &&
        _layW == maxW &&
        _layText == widget.text &&
        _layLines == widget.maxLines) {
      return _lay!;
    }
    final tokens = widget.text.split(' ').where((t) => t.isNotEmpty).toList();

    final primary = (maxW * 0.10).clamp(28.0, 40.0).toDouble();
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

    var fs = widget.backing ? secondary : primary;
    if (!widget.backing && lines(measure(fs), fs) > widget.maxLines) {
      fs = secondary;
    }

    final n = tokens.length;
    final s = List<double>.filled(n, 0);
    final e = List<double>.filled(n, 0);
    final ws = widget.words;
    if (ws != null && ws.isNotEmpty && n > 0) {
      if (ws.length == n) {
        for (var i = 0; i < n; i++) {
          s[i] = ws[i].start.inMicroseconds / 1e6;
          e[i] = math.max(s[i] + 0.05, ws[i].end.inMicroseconds / 1e6);
        }
      } else {
        final lineStart = ws.first.start.inMicroseconds / 1e6;
        final lineEnd = math.max(
          lineStart + 0.5,
          ws.last.end.inMicroseconds / 1e6,
        );
        final totalClusters = tokens.fold<int>(
          0,
          (a, t) => a + t.characters.length,
        );
        var acc = 0;
        for (var i = 0; i < n; i++) {
          final clCount = tokens[i].characters.length;
          s[i] =
              lineStart +
              (acc / math.max(1, totalClusters)) * (lineEnd - lineStart);
          acc += clCount;
          e[i] =
              lineStart +
              (acc / math.max(1, totalClusters)) * (lineEnd - lineStart);
        }
      }
    } else {
      final dur = math.max(0.5, widget.end - widget.start);
      final totalClusters = tokens.fold<int>(
        0,
        (a, t) => a + t.characters.length,
      );
      var acc = 0;
      for (var i = 0; i < n; i++) {
        final clCount = tokens[i].characters.length;
        s[i] = widget.start + (acc / math.max(1, totalClusters)) * dur;
        acc += clCount;
        e[i] = widget.start + (acc / math.max(1, totalClusters)) * dur;
      }
    }

    _layW = maxW;
    _layText = widget.text;
    _layLines = widget.maxLines;
    return _lay = _Layout(fs, tokens, s, e);
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
    return LayoutBuilder(
      builder: (context, cons) {
        final lay = _layout(cons.maxWidth);
        Widget wrap(double? t, double settle) => Wrap(
          alignment: widget.center
              ? WrapAlignment.center
              : (widget.right ? WrapAlignment.end : WrapAlignment.start),
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
            builder: (_, t, _) => wrap(t, 1),
          );
        }
        if (widget.past && !widget.plain) {
          if (_settle.isDismissed) return wrap(null, 0);
          return AnimatedBuilder(
            animation: _settle,
            builder: (context, _) => wrap(null, _settle.value),
          );
        }
        return wrap(null, 1);
      },
    );
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
      settle: settle,
      glow: widget.plain
          ? 0.0
          : Curves.easeOut.transform(settle.clamp(0.0, 1.0)),
    );
  }
}

/// One word: dim base, soft-edged white fill (left to right) and white glow.
class _Word extends StatelessWidget {
  const _Word({
    required this.text,
    required this.fs,
    required this.style,
    required this.p,
    this.settle = 1,
    this.glow = 0,
  });

  final String text;
  final double fs;
  final TextStyle Function(double, Color) style;
  final double p;
  final double settle;
  final double glow;

  static const _dim = Color(0x6BFFFFFF); // white 42%

  @override
  Widget build(BuildContext context) {
    if (p <= 0.0) return Text(text, style: style(fs, _dim));
    if (p >= 1.0) return Text(text, style: style(fs, Colors.white));

    const soft = 0.18;
    final a = (p * (1 + soft) - soft).clamp(0.0, 1.0).toDouble();
    final b = (p * (1 + soft)).clamp(0.0, 1.0).toDouble();

    return Stack(
      clipBehavior: Clip.none,
      children: [
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
}

// ---------------------------------------------------------------------------
// Interlude dots (Apple Music style)
//   * each dot springs in one after another (small overshoot),
//   * dots keep a FIXED size while waiting - only their brightness fills
//     left to right with the gap's progress,
//   * just before the next line the dots swell slightly and pop out one
//     after another.
// ---------------------------------------------------------------------------

class _Dots extends StatelessWidget {
  const _Dots({required this.clock, required this.start, required this.end});

  final ValueListenable<double> clock;
  final double start, end;

  static const double _size = 13;
  static const double _gap = 10;

  @override
  Widget build(BuildContext context) {
    final span = math.max(0.6, end - start);
    final closeStart = end - kDotClosingDuration;
    const stagger = kDotStaggerMs / 1000.0;
    const closeStagger = 0.07;
    final closeSpan = kDotClosingDuration - closeStagger * 2;

    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 10, 0, 10),
      child: ValueListenableBuilder<double>(
        valueListenable: clock,
        builder: (_, t, _) {
          final progress = ((t - start) / span).clamp(0.0, 1.0);
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < 3; i++)
                Padding(
                  padding: EdgeInsets.only(right: i < 2 ? _gap : 0),
                  child: _dot(t, i, progress, stagger, closeStart, closeStagger,
                      closeSpan),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _dot(
    double t,
    int i,
    double progress,
    double stagger,
    double closeStart,
    double closeStagger,
    double closeSpan,
  ) {
    // Pop in.
    final inT = t - start - i * stagger;
    final inP = (inT / 0.5).clamp(0.0, 1.0).toDouble();
    var scale = inT <= 0 ? 0.0 : _popSpring.transform(inP);
    var opacity = (inP * 3).clamp(0.0, 1.0).toDouble();

    // Pop out: small swell, then shrink away.
    final cu = ((t - closeStart - i * closeStagger) / closeSpan)
        .clamp(0.0, 1.0)
        .toDouble();
    if (cu > 0) {
      const swell = 0.28;
      if (cu < swell) {
        scale *= 1 + 0.2 * Curves.easeOut.transform(cu / swell);
      } else {
        final k = Curves.easeInCubic.transform((cu - swell) / (1 - swell));
        scale *= 1.2 * (1 - k);
        opacity *= 1 - k;
      }
    }

    if (scale <= 0.001 || opacity <= 0.001) {
      return const SizedBox(width: _size, height: _size);
    }

    // Brightness fill only (no size change).
    final fill = ((progress * 3.0) - i).clamp(0.0, 1.0).toDouble();

    return Transform.scale(
      scale: scale,
      child: Opacity(
        opacity: opacity,
        child: Container(
          width: _size,
          height: _size,
          decoration: BoxDecoration(
            color: Color.lerp(const Color(0x66FFFFFF), Colors.white, fill),
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Colors.white.withValues(alpha: 0.12 + 0.42 * fill),
                blurRadius: 4 + 8 * fill,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Controls: language + sync offset
// ---------------------------------------------------------------------------

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
        const Duration(milliseconds: 140),
        (_) => widget.onStep(),
      );
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
        duration: Duration(milliseconds: _down ? 120 : 380),
        curve: _down ? Curves.easeOut : _popSpring,
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
    final values = LyricsLang.values;
    final n = values.length;
    final idx = values.indexOf(lang);

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
                  child: Stack(
                    children: [
                      AnimatedAlign(
                        alignment: Alignment(-1 + 2 * idx / (n - 1), 0),
                        duration: const Duration(milliseconds: 520),
                        curve: _thumbSpring,
                        child: FractionallySizedBox(
                          widthFactor: 1 / n,
                          heightFactor: 1,
                          child: DecoratedBox(
                            decoration: ShapeDecoration(
                              shape: const StadiumBorder(),
                              color: Colors.white.withValues(alpha: 0.22),
                            ),
                          ),
                        ),
                      ),
                      Row(
                        children: [
                          for (final l in values)
                            Expanded(
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () => onLang(l),
                                child: Center(
                                  child: AnimatedDefaultTextStyle(
                                    duration: const Duration(milliseconds: 250),
                                    curve: Curves.easeOutCubic,
                                    style: TextStyle(
                                      fontFamily: _kTextFont,
                                      fontFamilyFallback: _kFontFamilyFallback,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                      color: l == lang
                                          ? Colors.white
                                          : Colors.white60,
                                    ),
                                    child: Text(l.label),
                                  ),
                                ),
                              ),
                            ),
                        ],
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
                                FontFeature.tabularFigures(),
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
          ],
        ),
      ),
    );
  }
}