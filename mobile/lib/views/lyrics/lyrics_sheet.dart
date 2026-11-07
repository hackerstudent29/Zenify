import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show FontFeature, ImageFilter;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/rendering.dart'
    show RenderAbstractViewport, ScrollDirection;
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../services/player_state.dart';

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
class LyricLine {
  const LyricLine({
    required this.start,
    required this.text,
    this.translation,
    this.end,
    this.words,
  });
  final Duration start;
  final Duration? end;
  final String text;
  final String? translation;
  final List<LyricWord>? words;
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
  const LyricsSheet({super.key});

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
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withValues(alpha: 0.65),
                    letterSpacing: -0.2)),
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
              const Text('Lyrics Not Available',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: -0.4)),
              const SizedBox(height: 8),
              Text(
                track != null
                    ? 'Synchronized lyrics aren\'t available for "${track.title}".'
                    : 'No lyrics available for this track.',
                textAlign: TextAlign.center,
                style: TextStyle(
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
        words = [
          for (final w in rawWords)
            if (w is Map)
              LyricWord(
                text: (w['word'] ?? w['text'] ?? '').toString(),
                start: _ms(w['timeMs'] ?? w['startMs']),
                end: _ms(w['endMs']),
              ),
        ];
      }
      final endMs = m['endMs'];
      return LyricLine(
        start: _ms(m['timeMs'] ?? m['startMs']),
        end: endMs is num ? _ms(endMs) : null,
        text: (m['text'] ?? '').toString(),
        translation: m['translation']?.toString(),
        words: words,
      );
    }).toList();

    return LyricsView(
      lines: lines,
      position: player.position,
      isPlaying: player.isPlaying,
      onSeek: player.seek,
      isSynced: player.lyricsSynced,
    );
  }
}

// ---------------------------------------------------------------------------
// Depth curve (same numbers as the web version)
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
  _Depth(0.35, 0.8, 0.96),
  _Depth(0.22, 2.2, 0.93),
  _Depth(0.12, 3.8, 0.90),
];

_Depth _depthFor(int dist, bool current, bool manual, bool unsynced,
    bool reduce) {
  if (current || unsynced) return const _Depth(1, 0, 1);
  if (manual) return const _Depth(0.86, 0, 0.97);
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
  const _Item.line(this.start, this.end, this.line) : interlude = false;
  const _Item.gap(this.start, this.end)
      : interlude = true,
        line = null;
  final bool interlude;
  final double start; // seconds
  final double end; // seconds
  final LyricLine? line;
}

// ---------------------------------------------------------------------------
// LyricsView
// ---------------------------------------------------------------------------

/// Apple Music style lyrics (port of the web LiquidLyricsLine).
///
/// - Per-word left-to-right fill with soft edge + glow, driven by a smoothed
///   60fps clock (extrapolated between player position updates).
/// - Depth curve: opacity / blur / scale by distance from the active line.
/// - "Going up" motion: scroll jumps, then every line springs from its old
///   position to the new one; lines below trail with a waterfall delay.
/// - Every lyric block is strictly 2 lines max.
/// - Interlude dots with the liquid wave.
/// - Original / English / Both, sync offset (+ = lyrics later).
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
  });

  final List<LyricLine> lines;
  final ValueListenable<Duration> position;
  final bool isPlaying;
  final ValueChanged<Duration>? onSeek;
  final int initialOffsetMs;
  final ValueChanged<int>? onOffsetChanged;
  final LyricsLang initialLang;
  final bool isSynced;

  @override
  State<LyricsView> createState() => _LyricsViewState();
}

class _LyricsViewState extends State<LyricsView>
    with TickerProviderStateMixin {
  static const _step = 500;

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

  double _anchorPos = 0;
  Duration _anchorAt = Duration.zero;
  Duration _lastElapsed = Duration.zero;

  double _shift = 0;
  int _shiftToken = 0;
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
    if (widget.isSynced) {
      widget.position.addListener(_onPosition);
      _publish(_posSeconds());
      _syncTicker();
      WidgetsBinding.instance.addPostFrameCallback((_) => _follow());
    }
  }

  @override
  void didUpdateWidget(covariant LyricsView old) {
    super.didUpdateWidget(old);
    if (old.position != widget.position) {
      old.position.removeListener(_onPosition);
      if (widget.isSynced) widget.position.addListener(_onPosition);
    }
    final sig = _signature(widget.lines);
    if (sig != _sig || old.isSynced != widget.isSynced) {
      // Only rebuild when the lyrics really changed (parent rebuilds often).
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
    widget.position.removeListener(_onPosition);
    _ticker.dispose();
    _resume?.cancel();
    _scroll.dispose();
    _clock.dispose();
    super.dispose();
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
    if (L.isNotEmpty && s(L.first.start) >= 3) {
      _items.add(_Item.gap(0, s(L.first.start)));
    }
    for (var i = 0; i < L.length; i++) {
      final start = s(L[i].start);
      final hasNext = i + 1 < L.length;
      final nextStart = hasNext ? s(L[i + 1].start) : start + 4;
      final end = L[i].end != null
          ? s(L[i].end!)
          : math.min(nextStart, start + 7).toDouble();
      _items.add(_Item.line(start, end, L[i]));
      // Interlude only when real line ends are known.
      if (L[i].end != null && hasNext && nextStart - end >= 4) {
        _items.add(_Item.gap(end, nextStart));
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

  void _publish(double raw) {
    final eff = raw - _offsetMs / 1000;
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

  // ----- scrolling: jump, then each line springs into place -----

  void _follow() {
    if (!widget.isSynced || !mounted || _manual || !_scroll.hasClients) return;
    double target;
    if (_active < 0) {
      target = 0;
    } else {
      final ro = _keys[_active].currentContext?.findRenderObject();
      if (ro == null) return;
      target = RenderAbstractViewport.of(ro).getOffsetToReveal(ro, 0.3).offset;
    }
    final pos = _scroll.position;
    target = target.clamp(pos.minScrollExtent, pos.maxScrollExtent).toDouble();
    final d = target - pos.pixels;
    if (d.abs() < 0.5) return;

    final reduce = MediaQuery.disableAnimationsOf(context);
    final vh = pos.viewportDimension;
    _scroll.jumpTo(target);
    if (_didFirstFollow && !reduce && d.abs() < vh * 1.5) {
      setState(() {
        _shift = d;
        _shiftToken++;
      });
    }
    _didFirstFollow = true;
  }

  // ----- offset / language -----

  void _changeOffset(int delta) {
    HapticFeedback.selectionClick();
    setState(() => _offsetMs += delta);
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
      _didFirstFollow = false; // glide back without a huge cascade
      _follow();
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

    return Column(
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
              stops: [0, 0.05, 0.92, 1],
            ).createShader(r),
            child: NotificationListener<ScrollNotification>(
              onNotification: (n) {
                if (n is UserScrollNotification &&
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
                physics: const BouncingScrollPhysics(),
                padding: EdgeInsets.only(top: 48, bottom: h * 0.45),
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
                        dist: widget.isSynced ? i - _active : 0,
                        manual: _manual,
                        shift: _shift,
                        shiftToken: _shiftToken,
                        onTap: () {
                          final line = _items[i].line;
                          if (!widget.isSynced || line == null) return;
                          HapticFeedback.selectionClick();
                          _resume?.cancel();
                          setState(() => _manual = false);
                          widget.onSeek?.call(Duration(
                              milliseconds:
                                  line.start.inMilliseconds + _offsetMs));
                        },
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
        if (showControls)
          _Controls(
            lang: _lang,
            showLang: _hasTranslation,
            showOffset: widget.isSynced,
            offsetLabel: _offsetLabel,
            offsetIsZero: _offsetMs == 0,
            onLang: (l) {
              HapticFeedback.selectionClick();
              setState(() => _lang = l);
              _didFirstFollow = false;
              WidgetsBinding.instance.addPostFrameCallback((_) => _follow());
            },
            onMinus: () => _changeOffset(-_step),
            onPlus: () => _changeOffset(_step),
            onReset: _resetOffset,
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Line tile: depth (opacity/blur/scale) + waterfall "go up" spring
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
    required this.shift,
    required this.shiftToken,
    required this.onTap,
  });

  final _Item item;
  final LyricsLang lang;
  final ValueListenable<double> clock;
  final bool synced, current, past, manual;
  final int dist;
  final double shift;
  final int shiftToken;
  final VoidCallback onTap;

  @override
  State<_LineTile> createState() => _LineTileState();
}

class _LineTileState extends State<_LineTile> with TickerProviderStateMixin {
  static final _curve = _SpringCurve();
  static const _ySpring =
      SpringDescription(mass: 1, stiffness: 170, damping: 21);

  late final AnimationController _d = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 800));
  late final AnimationController _y = AnimationController.unbounded(vsync: this);

  late _Depth _from, _to;
  bool _ready = false;
  Timer? _dt, _yt;

  _Depth get _cur =>
      _Depth.lerp(_from, _to, _curve.transform(_d.value.clamp(0.0, 1.0)));

  bool get _reduce => MediaQuery.disableAnimationsOf(context);

  _Depth _target() => _depthFor(widget.dist, widget.current, widget.manual,
      !widget.synced, _reduce);

  int get _waterfall => (!widget.current && widget.dist > 0 && !widget.manual)
      ? math.min(widget.dist, 5) * 36
      : 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_ready) {
      _ready = true;
      _from = _to = _target();
      _d.value = 1;
    }
  }

  @override
  void didUpdateWidget(covariant _LineTile old) {
    super.didUpdateWidget(old);
    final nt = _target();
    if (nt != _to) {
      _from = _cur;
      _to = nt;
      _d.value = 0;
      _dt?.cancel();
      _dt = Timer(Duration(milliseconds: _reduce ? 0 : _waterfall), () {
        if (mounted) _d.forward(from: 0);
      });
    }
    if (old.shiftToken != widget.shiftToken &&
        widget.shift != 0 &&
        widget.dist >= -6 &&
        widget.dist <= 10) {
      _yt?.cancel();
      _y.value = _y.value + widget.shift; // looks unmoved...
      _yt = Timer(Duration(milliseconds: _waterfall), () {
        if (!mounted) return;
        _y.animateWith(SpringSimulation(_ySpring, _y.value, 0, 0)); // ...then rises
      });
    }
  }

  @override
  void dispose() {
    _dt?.cancel();
    _yt?.cancel();
    _d.dispose();
    _y.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final it = widget.item;
    final line = it.line;

    // Backing vocals "( ... )" are right aligned + italic (as on web).
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
    main = main.replaceAll(RegExp(r'<[^>]+>'), ' ').replaceAll(RegExp(r'\s+'), ' ').trim();
    final backing = main.startsWith('(') && main.endsWith(')');

    Widget content;
    if (it.interlude) {
      content = _Dots(
          clock: widget.clock,
          current: widget.current,
          past: widget.past,
          start: it.start);
    } else {
      content = Column(
        crossAxisAlignment:
            backing ? CrossAxisAlignment.end : CrossAxisAlignment.start,
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
          ),
          if (sub != null) ...[
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                sub,
                maxLines: 1,
                softWrap: false,
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.3,
                  color: Colors.white
                      .withValues(alpha: widget.current ? 0.85 : 0.6),
                ),
              ),
            ),
          ],
        ],
      );
    }

    return AnimatedBuilder(
      animation: Listenable.merge([_d, _y]),
      child: content,
      builder: (context, child) {
        final dp = _cur;
        Widget w = Transform.scale(
          scale: dp.s,
          alignment: backing ? Alignment.centerRight : Alignment.centerLeft,
          child: child,
        );
        if (dp.b > 0.05) {
          w = ImageFiltered(
            imageFilter: ImageFilter.blur(
                sigmaX: dp.b, sigmaY: dp.b, tileMode: TileMode.decal),
            child: w,
          );
        }
        w = Opacity(opacity: dp.o.clamp(0.0, 1.0), child: w);
        return Transform.translate(
          offset: Offset(0, _y.value),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: widget.onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 11),
              child: w,
            ),
          ),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Word-by-word fill line, auto-fit to max 2 lines
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
  });

  final String text;
  final List<LyricWord>? words;
  final double start, end;
  final ValueListenable<double> clock;
  final bool current, past, plain, backing;
  final int maxLines;

  @override
  State<_WordLine> createState() => _WordLineState();
}

class _WordLineState extends State<_WordLine> {
  _Layout? _lay;
  double _layW = -1;
  String _layText = '';
  int _layLines = 0;

  TextStyle _style(double fs, Color c) => TextStyle(
        fontSize: fs,
        height: 1.24,
        fontWeight: FontWeight.w800,
        letterSpacing: -0.02 * fs,
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
    final base = (maxW * 0.09).clamp(26.0, 40.0).toDouble();
    const minFs = 18.0;

    List<double> measure(double fs) => [
          for (final t in tokens)
            (TextPainter(
              text: TextSpan(text: t, style: _style(fs, Colors.white)),
              textDirection: TextDirection.ltr,
            )..layout())
                .width
        ];

    int lines(List<double> w, double fs) {
      final sp = fs * 0.28;
      var n = 1;
      var x = 0.0;
      for (final wd in w) {
        if (wd > maxW) n += (wd / maxW).ceil() - 1;
        if (x == 0) {
          x = wd;
        } else if (x + sp + wd <= maxW) {
          x += sp + wd;
        } else {
          n++;
          x = wd;
        }
      }
      return n;
    }

    var fs = base;
    var widths = measure(fs);
    while (lines(widths, fs) > widget.maxLines && fs > minFs) {
      fs -= 1;
      widths = measure(fs);
    }

    // timing per word
    final n = tokens.length;
    final s = List<double>.filled(n, 0);
    final e = List<double>.filled(n, 0);
    final ws = widget.words;
    if (ws != null && ws.length == n && n > 0) {
      for (var i = 0; i < n; i++) {
        s[i] = ws[i].start.inMicroseconds / 1e6;
        e[i] = math.max(s[i] + 0.05, ws[i].end.inMicroseconds / 1e6);
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
    return _lay = _Layout(fs, tokens, s, e);
  }

  @override
  void didUpdateWidget(covariant _WordLine old) {
    super.didUpdateWidget(old);
    if (old.start != widget.start ||
        old.end != widget.end ||
        old.words != widget.words) {
      _lay = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, cons) {
      final lay = _layout(cons.maxWidth);
      Widget build(double? t) => Wrap(
            alignment: widget.backing ? WrapAlignment.end : WrapAlignment.start,
            spacing: lay.fs * 0.28,
            runSpacing: lay.fs * 0.06,
            crossAxisAlignment: WrapCrossAlignment.end,
            children: [
              for (var i = 0; i < lay.tokens.length; i++)
                _Word(
                  text: lay.tokens[i],
                  fs: lay.fs,
                  style: _style,
                  p: widget.plain
                      ? 1
                      : t == null
                          ? (widget.past ? 1 : 0)
                          : ((t - lay.s[i]) / math.max(0.001, lay.e[i] - lay.s[i]))
                              .clamp(0.0, 1.0)
                              .toDouble(),
                ),
            ],
          );

      if (widget.current && !widget.plain) {
        return ValueListenableBuilder<double>(
          valueListenable: widget.clock,
          builder: (context, t, child) => build(t),
        );
      }
      return build(null);
    });
  }
}

/// One word: dim base, soft-edged white fill (left to right) and glow.
class _Word extends StatelessWidget {
  const _Word(
      {required this.text,
      required this.fs,
      required this.style,
      required this.p});
  final String text;
  final double fs;
  final TextStyle Function(double, Color) style;
  final double p;

  static const _dim = Color(0x6BFFFFFF); // white 42%

  @override
  Widget build(BuildContext context) {
    if (p <= 0) return Text(text, style: style(fs, _dim));
    if (p >= 1) return Text(text, style: style(fs, Colors.white));

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
}

// ---------------------------------------------------------------------------
// Interlude dots (liquid wave while current)
// ---------------------------------------------------------------------------

class _Dots extends StatelessWidget {
  const _Dots({
    required this.clock,
    required this.current,
    required this.past,
    required this.start,
  });
  final ValueListenable<double> clock;
  final bool current, past;
  final double start;

  Widget _row(double? t) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 10, 0, 10),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var i = 0; i < 3; i++) _dot(i, t),
        ],
      ),
    );
  }

  Widget _dot(int i, double? t) {
    double o, sx, sy, dy, glow, ga;
    if (t != null) {
      final wave = math.sin((t - start) * 4.0 - i * 0.95);
      final k = math.max(0.0, wave);
      dy = -wave * 5;
      sy = 1 + k * 0.6;
      sx = 1 - k * 0.15;
      o = math.max(0.45, 0.5 + 0.5 * k);
      glow = 8 + k * 18;
      ga = 0.55 + k * 0.45;
    } else {
      o = past ? 0.28 : 0.22;
      sx = sy = 0.82;
      dy = 0;
      glow = 0;
      ga = 0;
    }
    return Padding(
      padding: const EdgeInsets.only(right: 10),
      child: Transform.translate(
        offset: Offset(0, dy),
        child: Transform.scale(
          scaleX: sx,
          scaleY: sy,
          child: Opacity(
            opacity: o.clamp(0.0, 1.0),
            child: Container(
              width: 13,
              height: 13,
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                boxShadow: glow > 0
                    ? [
                        BoxShadow(
                            color: Colors.white.withValues(alpha: ga),
                            blurRadius: glow)
                      ]
                    : null,
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!current) return _row(null);
    return ValueListenableBuilder<double>(
      valueListenable: clock,
      builder: (context, t, child) => _row(t),
    );
  }
}

// ---------------------------------------------------------------------------
// Controls: language + sync offset
// ---------------------------------------------------------------------------

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
                    PressableScale(
                      onTap: onMinus,
                      child: const SizedBox(
                        width: 40,
                        height: 38,
                        child: Icon(Icons.remove_rounded,
                            size: 20, color: Colors.white),
                      ),
                    ),
                    GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onTap: onReset,
                      child: SizedBox(
                        width: 52,
                        child: Text(
                          offsetLabel,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            fontFeatures: const [FontFeature.tabularFigures()],
                            color: offsetIsZero
                                ? Colors.white60
                                : AppColors.accent,
                          ),
                        ),
                      ),
                    ),
                    PressableScale(
                      onTap: onPlus,
                      child: const SizedBox(
                        width: 40,
                        height: 38,
                        child: Icon(Icons.add_rounded,
                            size: 20, color: Colors.white),
                      ),
                    ),
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