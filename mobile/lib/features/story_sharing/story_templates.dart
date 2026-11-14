import 'dart:math' as math;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import 'story_models.dart';
import 'story_service.dart';
import 'story_widgets.dart';

// ═════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// Every template below places the Zenify logo (ZenifyStoryBrand) on the card.
// ═════════════════════════════════════════════════════════════════════════════

double _top(StoryTemplateArgs a) => a.isSquare ? 20 : 54;
double _bot(StoryTemplateArgs a) => a.isSquare ? 20 : 62;

Widget _txt(
  String s,
  TextStyle st, {
  int lines = 1,
  TextAlign align = TextAlign.start,
}) =>
    Text(s, maxLines: lines, overflow: TextOverflow.ellipsis, textAlign: align, style: st);

Widget _brand(StoryTemplateArgs a, {bool onArt = false, double size = 15}) =>
    ZenifyStoryBrand(isLight: onArt ? false : a.isLight, iconSize: size);

Widget _glass(
  StoryTemplateArgs a, {
  required Widget child,
  double radius = 26,
  EdgeInsetsGeometry padding = const EdgeInsets.all(16),
  bool animate = false,
  double? width,
  double? height,
}) =>
    LiquidGlass(
      isLight: a.isLight,
      radius: radius,
      padding: padding,
      animate: animate,
      width: width,
      height: height,
      child: child,
    );

String _meta(AlbumStoryContent c) {
  final parts = <String>[
    if (c.year != null && c.year!.isNotEmpty) c.year!,
    if (c.trackCount != null && c.trackCount! > 0) '${c.trackCount} songs',
  ];
  return parts.join(' · ');
}

List<String> _covers(PlaylistStoryContent c, int n) {
  final base = c.covers.where((e) => e.isNotEmpty).toList();
  if (base.isEmpty) {
    base.addAll(c.tracks.map((t) => t.coverUrl).where((e) => e.isNotEmpty));
  }
  if (base.isEmpty) return List.filled(n, '');
  return [for (int i = 0; i < n; i++) base[i % base.length]];
}

List<String> _artistCovers(ArtistStoryContent c, int n) {
  var base = c.albumCovers.where((e) => e.isNotEmpty).toList();
  if (base.isEmpty) {
    base = c.topTracks.map((t) => t.coverUrl).where((e) => e.isNotEmpty).toList();
  }
  if (base.isEmpty) base = [c.coverUrl];
  return [for (int i = 0; i < n; i++) base[i % base.length]];
}

double _lyricScale(LyricsStoryContent c, StoryTemplateArgs a) {
  final len = c.selectedLines.join(' ').length;
  final s = len < 50 ? 1.0 : (len < 100 ? 0.84 : (len < 160 ? 0.7 : 0.58));
  return a.isSquare ? s * 0.78 : s;
}

List<Widget> _lyricLines(
  LyricsStoryContent c,
  TextStyle st, {
  TextAlign align = TextAlign.start,
  double gap = 8,
  List<double>? opacities,
}) {
  final n = c.selectedLines.length;
  return [
    for (int i = 0; i < n; i++)
      Padding(
        padding: EdgeInsets.only(bottom: i == n - 1 ? 0 : gap),
        child: Opacity(
          opacity: opacities != null && i < opacities.length ? opacities[i] : 1,
          child: Text(c.selectedLines[i], textAlign: align, style: st),
        ),
      ),
  ];
}

Widget _fullBleed(String url, StoryTemplateArgs a, {double? height}) => StoryArtwork(
      url: url,
      width: a.w,
      height: height ?? a.h,
      radius: 0,
      shadow: false,
      hairline: false,
      palette: a.palette,
    );

/// Compact "art + two lines" row used in many footers.
Widget _miniMeta(
  StoryTemplateArgs a,
  String url,
  String title,
  String sub, {
  double art = 42,
  bool onArt = false,
}) {
  final c1 = onArt ? Colors.white : a.fg;
  final c2 = onArt ? Colors.white.withValues(alpha: 0.7) : a.fg2;
  return Row(
    children: [
      StoryArtwork(url: url, size: art, radius: 9, shadow: false, palette: a.palette),
      const SizedBox(width: 10),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            _txt(title, ZenType.text(14, c1, weight: FontWeight.w700)),
            const SizedBox(height: 2),
            _txt(sub, ZenType.text(12, c2)),
          ],
        ),
      ),
    ],
  );
}

// ── Vinyl / ring / barcode painters ──────────────────────────────────────────

class _Vinyl extends StatelessWidget {
  const _Vinyl({required this.size, required this.coverUrl, required this.palette});
  final double size;
  final String coverUrl;
  final ArtworkPalette palette;
  final bool spin = true;

  @override
  Widget build(BuildContext context) {
    final disc = SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(size: Size.square(size), painter: _VinylPainter()),
          StoryArtwork(
            url: coverUrl,
            size: size * 0.36,
            circle: true,
            shadow: false,
            palette: palette,
          ),
          Container(
            width: size * 0.045,
            height: size * 0.045,
            decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF0B0B0D)),
          ),
        ],
      ),
    );
    return DecoratedBox(
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.4),
            blurRadius: 22,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: spin ? Spin(seconds: 14, child: disc) : disc,
    );
  }
}

class _VinylPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2;
    canvas.drawCircle(c, r, Paint()..color = const Color(0xFF0E0E10));
    for (double f = 0.40; f < 0.98; f += 0.034) {
      canvas.drawCircle(
        c,
        r * f,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 0.6
          ..color = Colors.white.withValues(alpha: 0.05),
      );
    }
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..shader = SweepGradient(
          colors: [
            Colors.white.withValues(alpha: 0),
            Colors.white.withValues(alpha: 0.17),
            Colors.white.withValues(alpha: 0),
            Colors.white.withValues(alpha: 0),
            Colors.white.withValues(alpha: 0.12),
            Colors.white.withValues(alpha: 0),
          ],
          stops: const [0, 0.1, 0.25, 0.5, 0.62, 0.78],
        ).createShader(Rect.fromCircle(center: c, radius: r)),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

class _RingsPainter extends CustomPainter {
  _RingsPainter(this.color, {this.from = 0.3, this.count = 6});
  final Color color;
  final double from;
  final int count;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final maxR = size.shortestSide / 2;
    for (int i = 0; i < count; i++) {
      final f = from + (1 - from) * (i / (count - 1));
      canvas.drawCircle(
        c,
        maxR * f,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.2
          ..color = color.withValues(alpha: 0.30 * (1 - i / count)),
      );
    }
  }

  @override
  bool shouldRepaint(_RingsPainter old) => old.color != color;
}

class _BarcodePainter extends CustomPainter {
  _BarcodePainter(this.color, this.seed);
  final Color color;
  final int seed;

  @override
  void paint(Canvas canvas, Size size) {
    double x = 0;
    int i = 0;
    while (x < size.width) {
      final w = 1.0 + ((math.sin(i * 12.9898 + seed) * 43758.5453).abs() % 1) * 3.2;
      canvas.drawRect(Rect.fromLTWH(x, 0, w, size.height), Paint()..color = color);
      x += w + 2 + (i % 3);
      i++;
    }
  }

  @override
  bool shouldRepaint(_BarcodePainter old) => old.color != color;
}

class _SpotlightPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(size.width * 0.5 - 16, 0)
      ..lineTo(size.width * 0.5 + 16, 0)
      ..lineTo(size.width * 1.05, size.height * 0.82)
      ..lineTo(-size.width * 0.05, size.height * 0.82)
      ..close();
    canvas.drawPath(
      path,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.white.withValues(alpha: 0.34), Colors.white.withValues(alpha: 0)],
        ).createShader(Offset.zero & size)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14),
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}

// ═════════════════════════════════════════════════════════════════════════════
// SONG TEMPLATES (8)
// ═════════════════════════════════════════════════════════════════════════════

/// 1 ─ Glass Card: floating artwork + liquid glass caption.
Widget songClassic(SongStoryContent c, StoryTemplateArgs a) {
  final art = a.isSquare ? 188.0 : 272.0;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Bob(
              dy: 5,
              rotate: 0.012,
              child: StoryArtwork(url: c.coverUrl, size: art, radius: 20, palette: a.palette),
            ),
            SizedBox(height: a.isSquare ? 14 : 22),
            _glass(
              a,
              animate: true,
              radius: 24,
              width: art,
              padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _txt(c.title, ZenType.display(17, a.fg)),
                        const SizedBox(height: 2),
                        _txt(c.subtitle, ZenType.text(13, a.fg2)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  _brand(a, size: 13),
                ],
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

/// 2 ─ Poster: full-bleed cover, glass title plate.
Widget songFullPoster(SongStoryContent c, StoryTemplateArgs a) {
  final album = c.track.album;
  return Stack(
    fit: StackFit.expand,
    children: [
      _fullBleed(c.coverUrl, a),
      DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.black.withValues(alpha: 0.30),
              Colors.transparent,
              Colors.black.withValues(alpha: 0.55),
            ],
            stops: const [0, 0.4, 1],
          ),
        ),
      ),
      Positioned(top: _top(a), right: 20, child: _brand(a, onArt: true)),
      Positioned(
        left: 16,
        right: 16,
        bottom: _bot(a) - 14,
        child: LiquidGlass(
          radius: 28,
          animate: true,
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('SONG', style: ZenType.caption(Colors.white.withValues(alpha: 0.65))),
              const SizedBox(height: 8),
              _txt(c.title, ZenType.display(a.isSquare ? 24 : 30, Colors.white, weight: FontWeight.w800),
                  lines: 2),
              const SizedBox(height: 6),
              _txt(c.subtitle, ZenType.text(15, Colors.white.withValues(alpha: 0.85))),
              if (album.isNotEmpty && album != 'Single') ...[
                const SizedBox(height: 2),
                _txt(album, ZenType.text(12.5, Colors.white.withValues(alpha: 0.55))),
              ],
            ],
          ),
        ),
      ),
    ],
  );
}

/// 3 ─ Liquid: thick glass slab with live waveform.
Widget songLiquidGlass(SongStoryContent c, StoryTemplateArgs a) {
  final slabW = a.w - 48;
  final art = a.isSquare ? 128.0 : slabW - 36;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.blurredCover),
      Center(
        child: Bob(
          dy: 4,
          child: LiquidGlass(
            isLight: a.isLight,
            radius: 38,
            animate: true,
            width: slabW,
            padding: const EdgeInsets.all(18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('NOW SHARING', style: ZenType.caption(a.fg3, size: 9.5)),
                    _brand(a, size: 12),
                  ],
                ),
                const SizedBox(height: 12),
                Center(
                  child: StoryArtwork(url: c.coverUrl, size: art, radius: 24, palette: a.palette),
                ),
                const SizedBox(height: 16),
                _txt(c.title, ZenType.display(22, a.fg)),
                const SizedBox(height: 2),
                _txt(c.subtitle, ZenType.text(14, a.fg2)),
                const SizedBox(height: 12),
                StoryWaveform(color: a.fg.withValues(alpha: 0.85), height: 24, bars: 34, seed: c.title.length),
              ],
            ),
          ),
        ),
      ),
    ],
  );
}

/// 4 ─ Editorial: oversized type, offset artwork, hairline.
Widget songEditorial(SongStoryContent c, StoryTemplateArgs a) {
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.solidDark),
      Padding(
        padding: EdgeInsets.fromLTRB(26, _top(a), 26, _bot(a)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('SONG — ${c.track.album.isNotEmpty && c.track.album != 'Single' ? c.track.album.toUpperCase() : 'SINGLE'}',
                    style: ZenType.caption(a.fg3, size: 9.5)),
                _brand(a),
              ],
            ),
            const Spacer(),
            _txt(c.title, ZenType.display(a.isSquare ? 40 : 58, a.fg, weight: FontWeight.w900, height: 0.98),
                lines: a.isSquare ? 2 : 4),
            const SizedBox(height: 18),
            Container(height: 0.8, color: a.fg.withValues(alpha: 0.25)),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(child: _txt(c.subtitle, ZenType.text(17, a.fg2, weight: FontWeight.w600), lines: 2)),
                Bob(
                  dy: 3,
                  child: StoryArtwork(url: c.coverUrl, size: a.isSquare ? 72 : 92, radius: 14, palette: a.palette),
                ),
              ],
            ),
          ],
        ),
      ),
    ],
  );
}

/// 5 ─ Vinyl: record sliding out from the sleeve.
Widget songVinyl(SongStoryContent c, StoryTemplateArgs a) {
  final art = a.isSquare ? 150.0 : 200.0;
  final disc = art * 0.96;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Padding(
        padding: EdgeInsets.fromLTRB(24, _top(a), 24, _bot(a)),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Align(alignment: Alignment.centerRight, child: _brand(a)),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              height: art,
              child: Stack(
                children: [
                  Positioned(
                    right: 0,
                    top: (art - disc) / 2,
                    child: _Vinyl(size: disc, coverUrl: c.coverUrl, palette: a.palette),
                  ),
                  Positioned(
                    left: 0,
                    child: Bob(
                      dy: 3,
                      child: StoryArtwork(url: c.coverUrl, size: art, radius: 10, palette: a.palette),
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(height: a.isSquare ? 16 : 28),
            _txt(c.title, ZenType.display(a.isSquare ? 24 : 30, a.fg, weight: FontWeight.w800), lines: 2),
            const SizedBox(height: 4),
            _txt(c.subtitle, ZenType.text(16, a.fg2)),
            const Spacer(),
          ],
        ),
      ),
    ],
  );
}

/// 6 ─ Now Playing: Apple Music player look.
Widget songPlayer(SongStoryContent c, StoryTemplateArgs a) {
  Widget progress() => Column(
        children: [
          Stack(
            children: [
              Container(
                height: 5,
                decoration: BoxDecoration(
                  color: a.fg.withValues(alpha: 0.22),
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
              FractionallySizedBox(
                widthFactor: 0.38,
                child: Container(
                  height: 5,
                  decoration: BoxDecoration(
                    color: a.fg.withValues(alpha: 0.9),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('1:24', style: ZenType.text(11, a.fg3, weight: FontWeight.w600)),
              Text('-2:11', style: ZenType.text(11, a.fg3, weight: FontWeight.w600)),
            ],
          ),
        ],
      );

  Widget controls() => Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          Icon(CupertinoIcons.backward_fill, size: 30, color: a.fg),
          Icon(CupertinoIcons.pause_fill, size: 44, color: a.fg),
          Icon(CupertinoIcons.forward_fill, size: 30, color: a.fg),
        ],
      );

  Widget titles() => Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _txt(c.title, ZenType.display(20, a.fg)),
                const SizedBox(height: 2),
                _txt(c.subtitle, ZenType.text(17, a.fg2)),
              ],
            ),
          ),
          LiquidGlass(
            isLight: a.isLight,
            radius: 100,
            shadow: false,
            width: 30,
            height: 30,
            child: Icon(CupertinoIcons.ellipsis, size: 15, color: a.fg),
          ),
        ],
      );

  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.blurredCover),
      if (a.isSquare)
        Padding(
          padding: const EdgeInsets.all(22),
          child: Row(
            children: [
              Bob(dy: 3, child: StoryArtwork(url: c.coverUrl, size: 150, radius: 14, palette: a.palette)),
              const SizedBox(width: 18),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Align(alignment: Alignment.centerRight, child: _brand(a, size: 12)),
                    const Spacer(),
                    titles(),
                    const SizedBox(height: 12),
                    progress(),
                    const SizedBox(height: 8),
                    controls(),
                    const Spacer(),
                  ],
                ),
              ),
            ],
          ),
        )
      else
        Padding(
          padding: EdgeInsets.fromLTRB(28, _top(a), 28, _bot(a)),
          child: Column(
            children: [
              _brand(a),
              const Spacer(),
              Bob(
                dy: 4,
                child: StoryArtwork(url: c.coverUrl, size: a.w - 56, radius: 14, palette: a.palette),
              ),
              const SizedBox(height: 26),
              titles(),
              const SizedBox(height: 18),
              progress(),
              const SizedBox(height: 14),
              controls(),
              const Spacer(),
            ],
          ),
        ),
    ],
  );
}

/// 7 ─ Orb: circular artwork in glowing glass halo rings.
Widget songOrb(SongStoryContent c, StoryTemplateArgs a) {
  final art = a.isSquare ? 130.0 : 190.0;
  final halo = art + 28;
  final field = halo * 2.0;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(height: a.isSquare ? 0 : 30),
          SizedBox(
            width: field,
            height: field,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CustomPaint(size: Size.square(field), painter: _RingsPainter(a.fg, from: halo / field)),
                Bob(
                  dy: 5,
                  child: LiquidGlass(
                    isLight: a.isLight,
                    radius: halo,
                    animate: true,
                    width: halo,
                    height: halo,
                    padding: const EdgeInsets.all(14),
                    child: StoryArtwork(url: c.coverUrl, size: art, circle: true, palette: a.palette),
                  ),
                ),
              ],
            ),
          ),
          SizedBox(height: a.isSquare ? 0 : 6),
          _txt(c.title, ZenType.display(a.isSquare ? 20 : 26, a.fg, weight: FontWeight.w800), align: TextAlign.center),
          const SizedBox(height: 3),
          _txt(c.subtitle, ZenType.text(14, a.fg2), align: TextAlign.center),
          SizedBox(height: a.isSquare ? 8 : 18),
          _brand(a),
        ],
      ),
    ],
  );
}

/// 8 ─ Marquee: giant outlined title rows behind floating artwork.
Widget songMarquee(SongStoryContent c, StoryTemplateArgs a) {
  final word = c.title.toUpperCase();
  final rows = a.isSquare ? 5 : 9;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      ClipRect(
        child: OverflowBox(
          maxWidth: double.infinity,
          maxHeight: double.infinity,
          child: Transform.rotate(
            angle: -0.21,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (int i = 0; i < rows; i++)
                  Padding(
                    padding: EdgeInsets.only(left: i.isEven ? 0 : 120),
                    child: Text(
                      List.filled(6, word).join('  ·  '),
                      softWrap: false,
                      maxLines: 1,
                      overflow: TextOverflow.visible,
                      style: TextStyle(
                        fontFamily: 'SF Pro Display',
                        fontSize: 62,
                        height: 1.04,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -1.5,
                        foreground: Paint()
                          ..style = i % 3 == 0 ? PaintingStyle.fill : PaintingStyle.stroke
                          ..strokeWidth = 1.2
                          ..color = a.fg.withValues(alpha: i % 3 == 0 ? 0.09 : 0.26),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      Positioned(top: _top(a), left: 0, right: 0, child: Center(child: _brand(a))),
      Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Bob(
              dy: 6,
              dx: 3,
              rotate: 0.02,
              child: StoryArtwork(url: c.coverUrl, size: a.isSquare ? 170 : 232, radius: 22, palette: a.palette),
            ),
            SizedBox(height: a.isSquare ? 12 : 22),
            _glass(
              a,
              radius: 100,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: a.w - 110),
                    child: _txt(c.title, ZenType.display(16, a.fg), align: TextAlign.center),
                  ),
                  ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: a.w - 110),
                    child: _txt(c.subtitle, ZenType.text(12.5, a.fg2), align: TextAlign.center),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LYRICS TEMPLATES (8)
// ═════════════════════════════════════════════════════════════════════════════

/// 1 ─ Glass: frosted card with stacked lyrics.
Widget lyricsClassic(LyricsStoryContent c, StoryTemplateArgs a) {
  final s = _lyricScale(c, a);
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.blurredCover),
      Center(
        child: Bob(
          dy: 3,
          child: _glass(
            a,
            radius: 32,
            animate: true,
            width: a.w - 40,
            padding: const EdgeInsets.fromLTRB(22, 20, 22, 18),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _miniMeta(a, c.coverUrl, c.title, c.subtitle, art: 44),
                SizedBox(height: a.isSquare ? 14 : 24),
                ..._lyricLines(c, ZenType.display(27 * s, a.fg, weight: FontWeight.w800, height: 1.16), gap: 10),
                SizedBox(height: a.isSquare ? 14 : 24),
                Align(alignment: Alignment.centerRight, child: _brand(a, size: 13)),
              ],
            ),
          ),
        ),
      ),
    ],
  );
}

/// 2 ─ Serif: expressive editorial serif on warm liquid gradient.
Widget lyricsTypography(LyricsStoryContent c, StoryTemplateArgs a) {
  final s = _lyricScale(c, a);
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.vivid),
      Padding(
        padding: EdgeInsets.fromLTRB(28, _top(a), 28, _bot(a)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Align(alignment: Alignment.centerRight, child: _brand(a)),
            const Spacer(),
            Text('“', style: ZenType.serif(a.isSquare ? 54 : 90, a.fg.withValues(alpha: 0.5), weight: FontWeight.w800, height: 0.8)),
            ..._lyricLines(
              c,
              ZenType.serif(36 * s, a.fg, weight: FontWeight.w700, height: 1.1).copyWith(fontStyle: FontStyle.italic),
              gap: 4,
            ),
            const Spacer(),
            Container(height: 0.8, color: a.fg.withValues(alpha: 0.3)),
            const SizedBox(height: 12),
            _txt('${c.title} — ${c.subtitle}', ZenType.text(13, a.fg2, weight: FontWeight.w600)),
          ],
        ),
      ),
    ],
  );
}

/// 3 ─ Minimal: centered lines in negative space.
Widget lyricsMinimal(LyricsStoryContent c, StoryTemplateArgs a) {
  final s = _lyricScale(c, a);
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.solidDark),
      Padding(
        padding: EdgeInsets.fromLTRB(36, _top(a), 36, _bot(a)),
        child: Column(
          children: [
            _brand(a, size: 13),
            const Spacer(),
            ..._lyricLines(
              c,
              ZenType.display(21 * s, a.fg, weight: FontWeight.w500, height: 1.5, ls: -0.2),
              align: TextAlign.center,
              gap: 4,
            ),
            const Spacer(),
            Container(width: 24, height: 1, color: a.fg.withValues(alpha: 0.35)),
            const SizedBox(height: 12),
            _txt(c.title, ZenType.text(13, a.fg, weight: FontWeight.w700), align: TextAlign.center),
            const SizedBox(height: 2),
            _txt(c.subtitle, ZenType.text(12, a.fg3), align: TextAlign.center),
          ],
        ),
      ),
    ],
  );
}

/// 4 ─ Bold: Apple Music-style giant lyrics on vivid colour.
Widget lyricsBold(LyricsStoryContent c, StoryTemplateArgs a) {
  final s = _lyricScale(c, a);
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.vivid),
      Padding(
        padding: EdgeInsets.fromLTRB(26, _top(a), 26, _bot(a)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Spacer(),
            ..._lyricLines(
              c,
              ZenType.display(42 * s, a.fg, weight: FontWeight.w900, height: 1.04, ls: -1.4),
              gap: 6,
            ),
            const Spacer(),
            _glass(
              a,
              radius: 26,
              padding: const EdgeInsets.fromLTRB(10, 10, 14, 10),
              child: Row(
                children: [
                  Expanded(child: _miniMeta(a, c.coverUrl, c.title, c.subtitle, art: 40)),
                  const SizedBox(width: 8),
                  _brand(a, size: 12),
                ],
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

/// 5 ─ Bubbles: each line in a floating glass bubble.
Widget lyricsBubbles(LyricsStoryContent c, StoryTemplateArgs a) {
  final s = _lyricScale(c, a);
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Padding(
        padding: EdgeInsets.fromLTRB(20, _top(a), 20, _bot(a)),
        child: Column(
          children: [
            Align(alignment: Alignment.centerRight, child: _brand(a)),
            const Spacer(),
            for (int i = 0; i < c.selectedLines.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Align(
                  alignment: i.isEven ? Alignment.centerLeft : Alignment.centerRight,
                  child: Bob(
                    dy: 3,
                    phase: i * 0.27,
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: a.w * 0.82),
                      child: _glass(
                        a,
                        radius: 26,
                        animate: i == 0,
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                        child: Text(
                          c.selectedLines[i],
                          style: ZenType.display(21 * s, a.fg, weight: FontWeight.w700, height: 1.18),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 10),
            _miniMeta(a, c.coverUrl, c.title, c.subtitle, art: 38),
          ],
        ),
      ),
    ],
  );
}

/// 6 ─ Focus: lines fade with depth like synced lyrics.
Widget lyricsFocus(LyricsStoryContent c, StoryTemplateArgs a) {
  final s = _lyricScale(c, a);
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.blurredCover),
      Padding(
        padding: EdgeInsets.fromLTRB(28, _top(a), 28, _bot(a)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Align(alignment: Alignment.centerRight, child: _brand(a)),
            const Spacer(),
            ..._lyricLines(
              c,
              ZenType.display(34 * s, a.fg, weight: FontWeight.w800, height: 1.12),
              gap: 12,
              opacities: const [1.0, 0.5, 0.28],
            ),
            const Spacer(),
            _glass(
              a,
              radius: 24,
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  StoryWaveform(color: a.fg.withValues(alpha: 0.8), height: 18, bars: 40, seed: 3, barWidth: 2.4),
                  const SizedBox(height: 10),
                  _miniMeta(a, c.coverUrl, c.title, c.subtitle, art: 36),
                ],
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

/// 7 ─ Cover: artwork banner on top, lyrics on a glass sheet below.
Widget lyricsCover(LyricsStoryContent c, StoryTemplateArgs a) {
  final s = _lyricScale(c, a);
  final bannerH = a.isSquare ? 110.0 : 250.0;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Padding(
        padding: EdgeInsets.fromLTRB(18, _top(a) - (a.isSquare ? 0 : 8), 18, _bot(a) - 8),
        child: Column(
          children: [
            Stack(
              children: [
                StoryArtwork(url: c.coverUrl, width: a.w - 36, height: bannerH, radius: 26, palette: a.palette),
                Positioned(top: 10, right: 10, child: _brand(a, onArt: true, size: 13)),
              ],
            ),
            const SizedBox(height: 14),
            Expanded(
              child: _glass(
                a,
                radius: 30,
                animate: true,
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(22, 18, 22, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: _lyricLines(c, ZenType.display(24 * s, a.fg, weight: FontWeight.w800, height: 1.16), gap: 8),
                        ),
                      ),
                    ),
                    _txt(c.title, ZenType.text(13.5, a.fg, weight: FontWeight.w700)),
                    _txt(c.subtitle, ZenType.text(12, a.fg2)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

/// 8 ─ Neon: glowing accent lyrics on deep midnight.
Widget lyricsNeon(LyricsStoryContent c, StoryTemplateArgs a) {
  final s = _lyricScale(c, a);
  final glow = a.palette.accent;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.solidDark),
      Padding(
        padding: EdgeInsets.fromLTRB(28, _top(a), 28, _bot(a)),
        child: Column(
          children: [
            _brand(a),
            const Spacer(),
            ..._lyricLines(
              c,
              ZenType.display(32 * s, a.isLight ? a.fg : Colors.white, weight: FontWeight.w800, height: 1.18).copyWith(
                shadows: [
                  Shadow(color: glow, blurRadius: 14),
                  Shadow(color: a.palette.primary.withValues(alpha: 0.7), blurRadius: 36),
                ],
              ),
              align: TextAlign.center,
              gap: 10,
            ),
            const SizedBox(height: 22),
            Container(
              width: 70,
              height: 2.4,
              decoration: BoxDecoration(
                color: glow,
                borderRadius: BorderRadius.circular(2),
                boxShadow: [BoxShadow(color: glow, blurRadius: 12)],
              ),
            ),
            const Spacer(),
            _txt(c.title, ZenType.text(13, a.fg, weight: FontWeight.w700), align: TextAlign.center),
            _txt(c.subtitle, ZenType.text(12, a.fg3), align: TextAlign.center),
          ],
        ),
      ),
    ],
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ARTIST TEMPLATES (8)
// ═════════════════════════════════════════════════════════════════════════════

/// 1 ─ Profile: portrait in glass ring + top songs.
Widget artistProfile(ArtistStoryContent c, StoryTemplateArgs a) {
  final art = a.isSquare ? 104.0 : 168.0;
  final tracks = c.topTracks.take(a.isSquare ? 0 : 3).toList();
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Padding(
        padding: EdgeInsets.fromLTRB(22, _top(a), 22, _bot(a)),
        child: Column(
          children: [
            _brand(a),
            const Spacer(),
            Bob(
              dy: 4,
              child: LiquidGlass(
                isLight: a.isLight,
                radius: 200,
                animate: true,
                padding: const EdgeInsets.all(10),
                child: StoryArtwork(url: c.coverUrl, size: art, circle: true, palette: a.palette),
              ),
            ),
            const SizedBox(height: 16),
            _txt(c.title, ZenType.display(a.isSquare ? 24 : 32, a.fg, weight: FontWeight.w800), align: TextAlign.center),
            const SizedBox(height: 4),
            Text(c.subtitle.toUpperCase(), style: ZenType.caption(a.fg3, size: 10)),
            if (tracks.isNotEmpty) ...[
              const SizedBox(height: 20),
              _glass(
                a,
                radius: 26,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Column(
                  children: [
                    for (int i = 0; i < tracks.length; i++)
                      Padding(
                        padding: EdgeInsets.symmetric(vertical: 5),
                        child: Row(
                          children: [
                            SizedBox(width: 20, child: Text('${i + 1}', style: ZenType.text(13, a.fg3, weight: FontWeight.w700))),
                            StoryArtwork(url: tracks[i].coverUrl, size: 34, radius: 8, shadow: false, palette: a.palette),
                            const SizedBox(width: 10),
                            Expanded(child: _txt(tracks[i].title, ZenType.text(14, a.fg, weight: FontWeight.w600))),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
            const Spacer(),
          ],
        ),
      ),
    ],
  );
}

/// 2 ─ Editorial: full-bleed portrait, oversized name.
Widget artistEditorial(ArtistStoryContent c, StoryTemplateArgs a) {
  return Stack(
    fit: StackFit.expand,
    children: [
      _fullBleed(c.coverUrl, a),
      DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.black.withValues(alpha: 0.28), Colors.transparent, Colors.black.withValues(alpha: 0.78)],
            stops: const [0, 0.45, 1],
          ),
        ),
      ),
      Positioned(top: _top(a), left: 22, child: _brand(a, onArt: true)),
      Positioned(
        left: 24,
        right: 24,
        bottom: _bot(a),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            LiquidGlass(
              radius: 100,
              shadow: false,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: Text(c.subtitle.toUpperCase(), style: ZenType.caption(Colors.white, size: 9.5)),
            ),
            const SizedBox(height: 12),
            _txt(c.title, ZenType.display(a.isSquare ? 40 : 60, Colors.white, weight: FontWeight.w900, height: 0.96),
                lines: 3),
          ],
        ),
      ),
    ],
  );
}

/// 3 ─ Discography: portrait + fan of album covers.
Widget artistDiscography(ArtistStoryContent c, StoryTemplateArgs a) {
  final covers = _artistCovers(c, 4);
  final size = a.isSquare ? 96.0 : 150.0;
  const angles = [-0.24, -0.08, 0.08, 0.24];
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Padding(
        padding: EdgeInsets.fromLTRB(24, _top(a), 24, _bot(a)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                StoryArtwork(url: c.coverUrl, size: a.isSquare ? 54 : 72, circle: true, palette: a.palette),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _txt(c.title, ZenType.display(a.isSquare ? 20 : 26, a.fg, weight: FontWeight.w800)),
                      const SizedBox(height: 2),
                      Text('DISCOGRAPHY', style: ZenType.caption(a.fg3, size: 9.5)),
                    ],
                  ),
                ),
                _brand(a, size: 13),
              ],
            ),
            const Spacer(),
            SizedBox(
              height: size * 1.3,
              width: double.infinity,
              child: Stack(
                alignment: Alignment.center,
                clipBehavior: Clip.none,
                children: [
                  for (int i = 0; i < 4; i++)
                    Transform.translate(
                      offset: Offset((i - 1.5) * (a.w * 0.17), (i == 1 || i == 2) ? -6 : 8),
                      child: Transform.rotate(
                        angle: angles[i],
                        child: StoryArtwork(url: covers[i], size: size, radius: 14, palette: a.palette),
                      ),
                    ),
                ],
              ),
            ),
            const Spacer(),
          ],
        ),
      ),
    ],
  );
}

/// 4 ─ Spotlight: stage light cone over floating portrait.
Widget artistSpotlight(ArtistStoryContent c, StoryTemplateArgs a) {
  final art = a.isSquare ? 130.0 : 196.0;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.solidDark),
      CustomPaint(painter: _SpotlightPainter()),
      Positioned(top: _top(a), left: 0, right: 0, child: Center(child: _brand(a))),
      Align(
        alignment: const Alignment(0, 0.25),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Bob(dy: 5, child: StoryArtwork(url: c.coverUrl, size: art, circle: true, palette: a.palette)),
            SizedBox(height: a.isSquare ? 12 : 22),
            _txt(c.title, ZenType.display(a.isSquare ? 24 : 32, a.fg, weight: FontWeight.w800), align: TextAlign.center),
            const SizedBox(height: 4),
            Text(c.subtitle.toUpperCase(), style: ZenType.caption(a.fg3, size: 10)),
          ],
        ),
      ),
    ],
  );
}

/// 5 ─ Ripple: concentric glass rings radiating.
Widget artistRipple(ArtistStoryContent c, StoryTemplateArgs a) {
  final art = a.isSquare ? 110.0 : 150.0;
  final field = a.isSquare ? 300.0 : 400.0;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.vivid),
      Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(height: a.isSquare ? 0 : 20),
          SizedBox(
            width: field,
            height: field,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CustomPaint(size: Size.square(field), painter: _RingsPainter(a.fg, from: 0.34, count: 7)),
                Bob(
                  dy: 4,
                  child: LiquidGlass(
                    isLight: a.isLight,
                    radius: 200,
                    animate: true,
                    padding: const EdgeInsets.all(10),
                    child: StoryArtwork(url: c.coverUrl, size: art, circle: true, palette: a.palette),
                  ),
                ),
              ],
            ),
          ),
          _txt(c.title, ZenType.display(a.isSquare ? 22 : 30, a.fg, weight: FontWeight.w800), align: TextAlign.center),
          const SizedBox(height: 10),
          _brand(a),
        ],
      ),
    ],
  );
}

/// 6 ─ Pass: glass access pass with portrait.
Widget artistPass(ArtistStoryContent c, StoryTemplateArgs a) {
  final cardW = a.isSquare ? a.w - 90 : a.w - 64;
  final portraitH = a.isSquare ? 120.0 : 250.0;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.blurredCover),
      Center(
        child: Bob(
          dy: 5,
          rotate: 0.02,
          child: _glass(
            a,
            radius: 34,
            animate: true,
            width: cardW,
            padding: const EdgeInsets.all(14),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('ARTIST PASS', style: ZenType.caption(a.fg3, size: 9.5)),
                    _brand(a, size: 12),
                  ],
                ),
                const SizedBox(height: 12),
                StoryArtwork(url: c.coverUrl, width: cardW - 28, height: portraitH, radius: 22, palette: a.palette),
                const SizedBox(height: 14),
                _txt(c.title, ZenType.display(a.isSquare ? 20 : 26, a.fg, weight: FontWeight.w800)),
                const SizedBox(height: 2),
                _txt(c.subtitle, ZenType.text(13, a.fg2)),
                const SizedBox(height: 12),
                SizedBox(
                  height: 22,
                  width: double.infinity,
                  child: CustomPaint(painter: _BarcodePainter(a.fg.withValues(alpha: 0.6), c.title.length)),
                ),
              ],
            ),
          ),
        ),
      ),
    ],
  );
}

/// 7 ─ Split: portrait bleeding into colour, big name over seam.
Widget artistSplit(ArtistStoryContent c, StoryTemplateArgs a) {
  final topH = a.h * (a.isSquare ? 0.62 : 0.6);
  final fade = a.isLight ? const Color(0xFFF2F2F7) : a.palette.background;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.solidDark),
      Positioned(top: 0, left: 0, right: 0, height: topH, child: _fullBleed(c.coverUrl, a, height: topH)),
      Positioned(
        top: topH * 0.45,
        left: 0,
        right: 0,
        height: topH * 0.55 + 1,
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [fade.withValues(alpha: 0), fade],
            ),
          ),
        ),
      ),
      Positioned(top: _top(a), right: 20, child: _brand(a, onArt: true)),
      Positioned(
        left: 24,
        right: 24,
        top: topH - (a.isSquare ? 54 : 84),
        child: _txt(
          c.title,
          ZenType.display(a.isSquare ? 40 : 62, a.fg, weight: FontWeight.w900, height: 0.95),
          lines: 2,
        ),
      ),
      Positioned(
        left: 24,
        right: 24,
        bottom: _bot(a),
        child: Row(
          children: [
            _glass(
              a,
              radius: 100,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              child: Text(c.subtitle.toUpperCase(), style: ZenType.caption(a.fg, size: 9.5)),
            ),
          ],
        ),
      ),
    ],
  );
}

/// 8 ─ Top Songs: numbered glass rows.
Widget artistTopSongs(ArtistStoryContent c, StoryTemplateArgs a) {
  final tracks = c.topTracks.take(a.isSquare ? 3 : 5).toList();
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Padding(
        padding: EdgeInsets.fromLTRB(20, _top(a), 20, _bot(a)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                StoryArtwork(url: c.coverUrl, size: 54, circle: true, palette: a.palette),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _txt(c.title, ZenType.display(22, a.fg, weight: FontWeight.w800)),
                      Text('TOP SONGS', style: ZenType.caption(a.fg3, size: 9.5)),
                    ],
                  ),
                ),
                _brand(a, size: 13),
              ],
            ),
            const Spacer(),
            if (tracks.isEmpty)
              _glass(
                a,
                radius: 28,
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                child: _txt('Listen on Zenify', ZenType.display(20, a.fg), align: TextAlign.center),
              )
            else
              for (int i = 0; i < tracks.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Bob(
                    dy: 2,
                    phase: i * 0.2,
                    child: _glass(
                      a,
                      radius: 24,
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                      child: Row(
                        children: [
                          SizedBox(width: 24, child: Text('${i + 1}', style: ZenType.display(17, a.fg3, weight: FontWeight.w800))),
                          StoryArtwork(url: tracks[i].coverUrl, size: 42, radius: 10, shadow: false, palette: a.palette),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _txt(tracks[i].title, ZenType.text(15, a.fg, weight: FontWeight.w700)),
                                _txt(tracks[i].displayArtists, ZenType.text(12, a.fg2)),
                              ],
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
    ],
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ALBUM TEMPLATES (8)
// ═════════════════════════════════════════════════════════════════════════════

/// 1 ─ Stacked: layered artwork with 3D depth.
Widget albumStacked(AlbumStoryContent c, StoryTemplateArgs a) {
  final art = a.isSquare ? 170.0 : 236.0;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(height: a.isSquare ? 0 : 20),
          SizedBox(
            width: art + 40,
            height: art + 40,
            child: Stack(
              alignment: Alignment.center,
              children: [
                for (int i = 2; i >= 1; i--)
                  Transform.translate(
                    offset: Offset(0, -i * 16.0),
                    child: Opacity(
                      opacity: 1 - i * 0.28,
                      child: StoryArtwork(url: c.coverUrl, size: art - i * 28, radius: 18, palette: a.palette),
                    ),
                  ),
                Transform.translate(
                  offset: const Offset(0, 12),
                  child: Bob(dy: 4, child: StoryArtwork(url: c.coverUrl, size: art, radius: 20, palette: a.palette)),
                ),
              ],
            ),
          ),
          SizedBox(height: a.isSquare ? 4 : 14),
          _txt(c.title, ZenType.display(a.isSquare ? 20 : 26, a.fg, weight: FontWeight.w800), align: TextAlign.center),
          const SizedBox(height: 3),
          _txt(c.subtitle, ZenType.text(14, a.fg2), align: TextAlign.center),
          if (_meta(c).isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(_meta(c).toUpperCase(), style: ZenType.caption(a.fg3, size: 9.5)),
          ],
          SizedBox(height: a.isSquare ? 6 : 16),
          _brand(a),
        ],
      ),
    ],
  );
}

/// 2 ─ Editorial: edge-to-edge artwork with typographic frame.
Widget albumEditorial(AlbumStoryContent c, StoryTemplateArgs a) {
  if (a.isSquare) {
    return Stack(
      fit: StackFit.expand,
      children: [
        _fullBleed(c.coverUrl, a),
        Positioned(top: 18, right: 18, child: _brand(a, onArt: true)),
        Positioned(
          left: 14,
          right: 14,
          bottom: 14,
          child: LiquidGlass(
            radius: 24,
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _txt(c.title, ZenType.display(22, Colors.white, weight: FontWeight.w800)),
                _txt('${c.subtitle}${_meta(c).isEmpty ? '' : ' · ${_meta(c)}'}',
                    ZenType.text(12.5, Colors.white.withValues(alpha: 0.75))),
              ],
            ),
          ),
        ),
      ],
    );
  }
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.solidDark),
      Positioned(top: 0, left: 0, right: 0, child: _fullBleed(c.coverUrl, a, height: a.w)),
      Positioned(top: _top(a), right: 20, child: _brand(a, onArt: true)),
      Positioned(
        left: 26,
        right: 26,
        top: a.w + 28,
        bottom: _bot(a),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('ALBUM', style: ZenType.caption(a.fg3, size: 9.5)),
            const SizedBox(height: 8),
            _txt(c.title, ZenType.display(36, a.fg, weight: FontWeight.w900, height: 1.0), lines: 3),
            const SizedBox(height: 8),
            _txt(c.subtitle, ZenType.text(17, a.fg2, weight: FontWeight.w600)),
            const Spacer(),
            Container(height: 0.8, color: a.fg.withValues(alpha: 0.25)),
            const SizedBox(height: 10),
            Text(_meta(c).isEmpty ? 'ON ZENIFY' : _meta(c).toUpperCase(), style: ZenType.caption(a.fg3, size: 9.5)),
          ],
        ),
      ),
    ],
  );
}

/// 3 ─ Liquid: floating glass panes over artwork light.
Widget albumLiquid(AlbumStoryContent c, StoryTemplateArgs a) {
  final art = a.isSquare ? 150.0 : 230.0;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.blurredCover),
      Center(
        child: Stack(
          alignment: Alignment.center,
          clipBehavior: Clip.none,
          children: [
            Transform.rotate(
              angle: 0.08,
              child: _glass(
                a,
                radius: 40,
                animate: true,
                width: art + 70,
                height: art + (a.isSquare ? 70 : 130),
                child: const SizedBox.shrink(),
              ),
            ),
            Bob(
              dy: 5,
              rotate: 0.015,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  StoryArtwork(url: c.coverUrl, size: art, radius: 22, palette: a.palette),
                  SizedBox(height: a.isSquare ? 10 : 18),
                  _glass(
                    a,
                    radius: 100,
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: art),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _txt(c.title, ZenType.display(15, a.fg), align: TextAlign.center),
                          _txt(c.subtitle, ZenType.text(12, a.fg2), align: TextAlign.center),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      Positioned(top: _top(a), left: 0, right: 0, child: Center(child: _brand(a))),
    ],
  );
}

/// 4 ─ Sleeve: record peeking out of the artwork sleeve.
Widget albumSleeve(AlbumStoryContent c, StoryTemplateArgs a) {
  final art = a.isSquare ? 150.0 : 232.0;
  final disc = art * 0.94;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(height: a.isSquare ? 0 : 16),
          SizedBox(
            width: art,
            height: art + disc * 0.38,
            child: Stack(
              children: [
                Positioned(
                  top: 0,
                  left: (art - disc) / 2,
                  child: _Vinyl(size: disc, coverUrl: c.coverUrl, palette: a.palette),
                ),
                Positioned(
                  bottom: 0,
                  child: Bob(dy: 3, child: StoryArtwork(url: c.coverUrl, size: art, radius: 8, palette: a.palette)),
                ),
              ],
            ),
          ),
          SizedBox(height: a.isSquare ? 10 : 22),
          _txt(c.title, ZenType.display(a.isSquare ? 20 : 26, a.fg, weight: FontWeight.w800), align: TextAlign.center),
          const SizedBox(height: 3),
          _txt(c.subtitle, ZenType.text(14, a.fg2), align: TextAlign.center),
          SizedBox(height: a.isSquare ? 6 : 16),
          _brand(a),
        ],
      ),
    ],
  );
}

/// 5 ─ Disc: reflective CD with iridescent sheen.
Widget albumDisc(AlbumStoryContent c, StoryTemplateArgs a) {
  final d = a.isSquare ? 170.0 : 250.0;
  final holeColor = a.isLight ? const Color(0xFFF2F2F7) : const Color(0xFF0B0B0D);
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.vivid),
      Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(height: a.isSquare ? 0 : 20),
          DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 30, offset: const Offset(0, 14))],
            ),
            child: Spin(
              seconds: 22,
              child: SizedBox(
                width: d,
                height: d,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    StoryArtwork(url: c.coverUrl, size: d, circle: true, shadow: false, palette: a.palette),
                    Container(
                      width: d,
                      height: d,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: SweepGradient(
                          colors: [
                            Colors.white.withValues(alpha: 0.0),
                            const Color(0xFF7DF9FF).withValues(alpha: 0.30),
                            Colors.white.withValues(alpha: 0.0),
                            const Color(0xFFFF9BE8).withValues(alpha: 0.28),
                            Colors.white.withValues(alpha: 0.0),
                          ],
                        ),
                      ),
                    ),
                    LiquidGlass(
                      radius: 100,
                      shadow: false,
                      width: d * 0.3,
                      height: d * 0.3,
                      child: Center(
                        child: Container(
                          width: d * 0.1,
                          height: d * 0.1,
                          decoration: BoxDecoration(shape: BoxShape.circle, color: holeColor),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          SizedBox(height: a.isSquare ? 10 : 26),
          _txt(c.title, ZenType.display(a.isSquare ? 20 : 26, a.fg, weight: FontWeight.w800), align: TextAlign.center),
          const SizedBox(height: 3),
          _txt(c.subtitle, ZenType.text(14, a.fg2), align: TextAlign.center),
          SizedBox(height: a.isSquare ? 6 : 16),
          _brand(a),
        ],
      ),
    ],
  );
}

/// 6 ─ Tilt: perspective artwork with mirror reflection.
Widget albumTilt(AlbumStoryContent c, StoryTemplateArgs a) {
  final art = a.isSquare ? 140.0 : 220.0;
  final art0 = StoryArtwork(url: c.coverUrl, size: art, radius: 18, palette: a.palette);
  final reflection = SizedBox(
    height: art * 0.42,
    width: art,
    child: ClipRect(
      child: Align(
        alignment: Alignment.topCenter,
        heightFactor: 0.42,
        child: Transform.scale(
          scaleY: -1,
          child: ShaderMask(
            blendMode: BlendMode.dstIn,
            shaderCallback: (r) => LinearGradient(
              begin: Alignment.bottomCenter,
              end: Alignment.topCenter,
              colors: [Colors.white.withValues(alpha: 0.42), Colors.transparent],
            ).createShader(r),
            child: StoryArtwork(url: c.coverUrl, size: art, radius: 18, shadow: false, palette: a.palette),
          ),
        ),
      ),
    ),
  );
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(height: a.isSquare ? 0 : 10),
          Bob(
            dy: 4,
            child: Transform(
              alignment: Alignment.center,
              transform: Matrix4.identity()
                ..setEntry(3, 2, 0.0013)
                ..rotateY(-0.42)
                ..rotateX(0.1),
              child: Column(mainAxisSize: MainAxisSize.min, children: [art0, const SizedBox(height: 4), reflection]),
            ),
          ),
          SizedBox(height: a.isSquare ? 8 : 20),
          _txt(c.title, ZenType.display(a.isSquare ? 20 : 26, a.fg, weight: FontWeight.w800), align: TextAlign.center),
          const SizedBox(height: 3),
          _txt(c.subtitle, ZenType.text(14, a.fg2), align: TextAlign.center),
          SizedBox(height: a.isSquare ? 6 : 16),
          _brand(a),
        ],
      ),
    ],
  );
}

/// 7 ─ Tracklist: artwork with a glass tracklist.
Widget albumTracklist(AlbumStoryContent c, StoryTemplateArgs a) {
  final tracks = c.tracks.take(a.isSquare ? 3 : 6).toList();
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.blurredCover),
      Padding(
        padding: EdgeInsets.fromLTRB(20, _top(a), 20, _bot(a)),
        child: Column(
          children: [
            Row(
              children: [
                StoryArtwork(url: c.coverUrl, size: a.isSquare ? 84 : 112, radius: 16, palette: a.palette),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _txt(c.title, ZenType.display(a.isSquare ? 19 : 22, a.fg, weight: FontWeight.w800), lines: 2),
                      const SizedBox(height: 3),
                      _txt(c.subtitle, ZenType.text(13.5, a.fg2)),
                      if (_meta(c).isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(_meta(c).toUpperCase(), style: ZenType.caption(a.fg3, size: 9)),
                      ],
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Expanded(
              child: _glass(
                a,
                radius: 30,
                animate: true,
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
                child: tracks.isEmpty
                    ? Center(child: _txt('Listen on Zenify', ZenType.display(18, a.fg)))
                    : Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          for (int i = 0; i < tracks.length; i++) ...[
                            Row(
                              children: [
                                SizedBox(width: 24, child: Text('${i + 1}', style: ZenType.text(13, a.fg3, weight: FontWeight.w700))),
                                Expanded(child: _txt(tracks[i].title, ZenType.text(15, a.fg, weight: FontWeight.w600))),
                              ],
                            ),
                            if (i < tracks.length - 1)
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 9),
                                child: Container(height: 0.6, color: a.fg.withValues(alpha: 0.14)),
                              ),
                          ],
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 14),
            _brand(a),
          ],
        ),
      ),
    ],
  );
}

/// 8 ─ Minimal: tiny artwork in calm negative space.
Widget albumMinimal(AlbumStoryContent c, StoryTemplateArgs a) {
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.solidDark),
      Padding(
        padding: EdgeInsets.fromLTRB(30, _top(a), 30, _bot(a)),
        child: Column(
          children: [
            const Spacer(),
            StoryArtwork(url: c.coverUrl, size: a.isSquare ? 84 : 112, radius: 14, palette: a.palette),
            const SizedBox(height: 22),
            _txt(c.title, ZenType.display(a.isSquare ? 17 : 21, a.fg, weight: FontWeight.w700), align: TextAlign.center, lines: 2),
            const SizedBox(height: 4),
            _txt(c.subtitle, ZenType.text(13, a.fg2), align: TextAlign.center),
            if (_meta(c).isNotEmpty) ...[
              const SizedBox(height: 4),
              _txt(_meta(c), ZenType.text(11.5, a.fg3), align: TextAlign.center),
            ],
            const Spacer(),
            _brand(a, size: 14),
          ],
        ),
      ),
    ],
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PLAYLIST TEMPLATES (8)
// ═════════════════════════════════════════════════════════════════════════════

String _count(PlaylistStoryContent c) =>
    c.tracks.isEmpty ? 'PLAYLIST' : '${c.tracks.length} SONGS';

/// 1 ─ Collage: 2x2 artwork on a glass tile.
Widget playlistCollage(PlaylistStoryContent c, StoryTemplateArgs a) {
  final cell = a.isSquare ? 78.0 : 126.0;
  final covers = _covers(c, 4);
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(height: a.isSquare ? 0 : 14),
          Bob(
            dy: 4,
            child: _glass(
              a,
              radius: 36,
              animate: true,
              padding: const EdgeInsets.all(12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (int r = 0; r < 2; r++)
                    Padding(
                      padding: EdgeInsets.only(bottom: r == 0 ? 8 : 0),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          for (int k = 0; k < 2; k++)
                            Padding(
                              padding: EdgeInsets.only(right: k == 0 ? 8 : 0),
                              child: StoryArtwork(url: covers[r * 2 + k], size: cell, radius: 16, shadow: false, palette: a.palette),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
          SizedBox(height: a.isSquare ? 10 : 24),
          _txt(c.title, ZenType.display(a.isSquare ? 20 : 26, a.fg, weight: FontWeight.w800), align: TextAlign.center),
          const SizedBox(height: 4),
          Text('${c.owner.toUpperCase()}  ·  ${_count(c)}', style: ZenType.caption(a.fg3, size: 9.5)),
          SizedBox(height: a.isSquare ? 8 : 18),
          _brand(a),
        ],
      ),
    ],
  );
}

/// 2 ─ Poster: giant title + featured songs on vivid colour.
Widget playlistPoster(PlaylistStoryContent c, StoryTemplateArgs a) {
  final feat = c.tracks.take(a.isSquare ? 2 : 4).toList();
  final covers = _covers(c, 4);
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.vivid),
      Padding(
        padding: EdgeInsets.fromLTRB(26, _top(a), 26, _bot(a)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(_count(c), style: ZenType.caption(a.fg2, size: 9.5)),
                _brand(a),
              ],
            ),
            const Spacer(),
            _txt(c.title, ZenType.display(a.isSquare ? 38 : 56, a.fg, weight: FontWeight.w900, height: 0.98), lines: 3),
            const SizedBox(height: 18),
            Row(
              children: [
                for (int i = 0; i < covers.length; i++)
                  Align(
                    widthFactor: 0.62,
                    child: StoryArtwork(url: covers[i], size: a.isSquare ? 38 : 48, circle: true, palette: a.palette),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            if (feat.isNotEmpty)
              _glass(
                a,
                radius: 24,
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final t in feat)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: _txt('${t.title} — ${t.displayArtists}', ZenType.text(13.5, a.fg, weight: FontWeight.w600)),
                      ),
                  ],
                ),
              )
            else
              _txt(c.owner, ZenType.text(15, a.fg2, weight: FontWeight.w600)),
          ],
        ),
      ),
    ],
  );
}

/// 3 ─ Editorial grid: asymmetric cover layout.
Widget playlistEditorialGrid(PlaylistStoryContent c, StoryTemplateArgs a) {
  final covers = _covers(c, 3);
  final big = a.isSquare ? 170.0 : 218.0;
  final small = a.isSquare ? 100.0 : 124.0;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Padding(
        padding: EdgeInsets.fromLTRB(22, _top(a), 22, _bot(a)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Align(alignment: Alignment.centerRight, child: _brand(a)),
            SizedBox(height: a.isSquare ? 6 : 18),
            SizedBox(
              height: a.isSquare ? 190 : 330,
              width: double.infinity,
              child: Stack(
                children: [
                  Positioned(left: 0, top: 0, child: Bob(dy: 3, child: StoryArtwork(url: covers[0], size: big, radius: 22, palette: a.palette))),
                  Positioned(
                    right: 0,
                    top: a.isSquare ? 46 : 78,
                    child: Bob(dy: 4, phase: 0.3, child: StoryArtwork(url: covers[1], size: small, radius: 18, palette: a.palette)),
                  ),
                  Positioned(
                    right: a.isSquare ? 40 : 30,
                    bottom: 0,
                    child: Bob(dy: 3, phase: 0.6, child: StoryArtwork(url: covers[2], size: small * 0.9, radius: 16, palette: a.palette)),
                  ),
                ],
              ),
            ),
            const Spacer(),
            Text(_count(c), style: ZenType.caption(a.fg3, size: 9.5)),
            const SizedBox(height: 6),
            _txt(c.title, ZenType.display(a.isSquare ? 24 : 36, a.fg, weight: FontWeight.w900, height: 1.0), lines: 2),
            const SizedBox(height: 4),
            _txt(c.owner, ZenType.text(14, a.fg2)),
          ],
        ),
      ),
    ],
  );
}

/// 4 ─ Mosaic: edge-to-edge cover mosaic under a glass title plate.
Widget playlistMosaic(PlaylistStoryContent c, StoryTemplateArgs a) {
  final cols = 3;
  final cell = a.w / cols;
  final rows = (a.h / cell).ceil();
  final covers = _covers(c, cols * rows);
  return Stack(
    fit: StackFit.expand,
    children: [
      Column(
        children: [
          for (int r = 0; r < rows; r++)
            Row(
              children: [
                for (int k = 0; k < cols; k++)
                  StoryArtwork(url: covers[r * cols + k], size: cell, radius: 0, shadow: false, hairline: false, palette: a.palette),
              ],
            ),
        ],
      ),
      ColoredBox(color: Colors.black.withValues(alpha: 0.18)),
      Positioned(top: _top(a), right: 20, child: _brand(a, onArt: true)),
      Center(
        child: Bob(
          dy: 4,
          child: LiquidGlass(
            radius: 34,
            animate: true,
            width: a.w - 64,
            padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_count(c), style: ZenType.caption(Colors.white.withValues(alpha: 0.7), size: 9.5)),
                const SizedBox(height: 8),
                _txt(c.title, ZenType.display(a.isSquare ? 24 : 32, Colors.white, weight: FontWeight.w900), lines: 2, align: TextAlign.center),
                const SizedBox(height: 4),
                _txt(c.owner, ZenType.text(13, Colors.white.withValues(alpha: 0.75)), align: TextAlign.center),
              ],
            ),
          ),
        ),
      ),
    ],
  );
}

/// 5 ─ Fan: covers fanned like a hand of cards.
Widget playlistFan(PlaylistStoryContent c, StoryTemplateArgs a) {
  final covers = _covers(c, 5);
  final size = a.isSquare ? 104.0 : 156.0;
  const angles = [-0.42, -0.21, 0.0, 0.21, 0.42];
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Positioned(top: _top(a), left: 0, right: 0, child: Center(child: _brand(a))),
      Align(
        alignment: Alignment(0, a.isSquare ? -0.1 : -0.18),
        child: SizedBox(
          width: a.w,
          height: size * 1.5,
          child: Stack(
            alignment: Alignment.bottomCenter,
            children: [
              for (int i = 0; i < 5; i++)
                Transform.rotate(
                  angle: angles[i],
                  alignment: Alignment.bottomCenter,
                  child: Padding(
                    padding: EdgeInsets.only(bottom: size * 0.18),
                    child: StoryArtwork(url: covers[i], size: size, radius: 16, palette: a.palette),
                  ),
                ),
            ],
          ),
        ),
      ),
      Positioned(
        left: 20,
        right: 20,
        bottom: _bot(a) - 6,
        child: Column(
          children: [
            _txt(c.title, ZenType.display(a.isSquare ? 20 : 28, a.fg, weight: FontWeight.w800), align: TextAlign.center, lines: 2),
            const SizedBox(height: 4),
            Text('${c.owner.toUpperCase()}  ·  ${_count(c)}', style: ZenType.caption(a.fg3, size: 9.5)),
          ],
        ),
      ),
    ],
  );
}

/// 6 ─ Glass List: glass track rows with tiny artwork.
Widget playlistGlassList(PlaylistStoryContent c, StoryTemplateArgs a) {
  final tracks = c.tracks.take(a.isSquare ? 3 : 6).toList();
  final covers = _covers(c, 6);
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.blurredCover),
      Padding(
        padding: EdgeInsets.fromLTRB(20, _top(a), 20, _bot(a)),
        child: Column(
          children: [
            Row(
              children: [
                StoryArtwork(url: covers[0], size: a.isSquare ? 56 : 72, radius: 14, palette: a.palette),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _txt(c.title, ZenType.display(a.isSquare ? 19 : 23, a.fg, weight: FontWeight.w800), lines: 2),
                      const SizedBox(height: 2),
                      Text(_count(c), style: ZenType.caption(a.fg3, size: 9.5)),
                    ],
                  ),
                ),
                _brand(a, size: 13),
              ],
            ),
            const Spacer(),
            for (int i = 0; i < (tracks.isEmpty ? math.min(a.isSquare ? 3 : 5, covers.length) : tracks.length); i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 9),
                child: Bob(
                  dy: 2,
                  phase: i * 0.17,
                  child: _glass(
                    a,
                    radius: 22,
                    width: double.infinity,
                    padding: const EdgeInsets.fromLTRB(10, 8, 14, 8),
                    child: Row(
                      children: [
                        StoryArtwork(
                          url: tracks.isEmpty ? covers[i] : tracks[i].coverUrl,
                          size: 38,
                          radius: 9,
                          shadow: false,
                          palette: a.palette,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _txt(tracks.isEmpty ? c.title : tracks[i].title, ZenType.text(14.5, a.fg, weight: FontWeight.w700)),
                              _txt(tracks.isEmpty ? c.owner : tracks[i].displayArtists, ZenType.text(11.5, a.fg2)),
                            ],
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
    ],
  );
}

/// 7 ─ Orbit: overlapping circular covers around a centre cover.
Widget playlistOrbit(PlaylistStoryContent c, StoryTemplateArgs a) {
  final covers = _covers(c, 7);
  final field = a.isSquare ? 280.0 : 340.0;
  final centerSize = a.isSquare ? 110.0 : 150.0;
  final orbitR = field * 0.36;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(height: a.isSquare ? 0 : 20),
          SizedBox(
            width: field,
            height: field,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CustomPaint(size: Size.square(field), painter: _RingsPainter(a.fg, from: 0.5, count: 3)),
                for (int i = 0; i < 6; i++)
                  Transform.translate(
                    offset: Offset(
                      math.cos(i * math.pi / 3 - math.pi / 2) * orbitR,
                      math.sin(i * math.pi / 3 - math.pi / 2) * orbitR,
                    ),
                    child: Bob(
                      dy: 4,
                      dx: 2,
                      phase: i * 0.16,
                      child: StoryArtwork(
                        url: covers[i + 1],
                        size: (a.isSquare ? 48 : 64) + (i.isEven ? 8 : 0),
                        circle: true,
                        palette: a.palette,
                      ),
                    ),
                  ),
                LiquidGlass(
                  isLight: a.isLight,
                  radius: 200,
                  animate: true,
                  padding: const EdgeInsets.all(8),
                  child: StoryArtwork(url: covers[0], size: centerSize, circle: true, palette: a.palette),
                ),
              ],
            ),
          ),
          _txt(c.title, ZenType.display(a.isSquare ? 20 : 26, a.fg, weight: FontWeight.w800), align: TextAlign.center),
          const SizedBox(height: 4),
          Text('${c.owner.toUpperCase()}  ·  ${_count(c)}', style: ZenType.caption(a.fg3, size: 9.5)),
          SizedBox(height: a.isSquare ? 6 : 14),
          _brand(a),
        ],
      ),
    ],
  );
}

/// 8 ─ Film: offset horizontal cover strips.
Widget playlistFilm(PlaylistStoryContent c, StoryTemplateArgs a) {
  final covers = _covers(c, 18);
  final cell = a.isSquare ? 82.0 : 112.0;
  final strips = a.isSquare ? 3 : 4;
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl, style: StoryBackgroundStyle.solidDark),
      Align(
        alignment: Alignment(0, a.isSquare ? -0.5 : -0.35),
        child: ClipRect(
          child: SizedBox(
            width: a.w,
            height: strips * (cell + 10),
            child: OverflowBox(
              maxWidth: double.infinity,
              maxHeight: double.infinity,
              child: Transform.rotate(
                angle: -0.14,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (int s = 0; s < strips; s++)
                      Padding(
                        padding: EdgeInsets.only(bottom: 10, left: s.isEven ? 0 : cell * 0.55),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            for (int k = 0; k < 6; k++)
                              Padding(
                                padding: const EdgeInsets.only(right: 10),
                                child: StoryArtwork(
                                  url: covers[(s * 6 + k) % covers.length],
                                  size: cell,
                                  radius: 14,
                                  shadow: false,
                                  palette: a.palette,
                                ),
                              ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
      Positioned(top: _top(a), right: 20, child: _brand(a)),
      Positioned(
        left: 24,
        right: 24,
        bottom: _bot(a),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_count(c), style: ZenType.caption(a.fg3, size: 9.5)),
            const SizedBox(height: 6),
            _txt(c.title, ZenType.display(a.isSquare ? 26 : 38, a.fg, weight: FontWeight.w900, height: 1.0), lines: 2),
            const SizedBox(height: 4),
            _txt(c.owner, ZenType.text(14, a.fg2)),
          ],
        ),
      ),
    ],
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// REGISTRY + PREVIEW WIDGET
// ═════════════════════════════════════════════════════════════════════════════

class StoryTemplateRegistry {
  StoryTemplateRegistry._();

  static Widget build(StoryShareContent content, StoryTemplate t, StoryTemplateArgs a) {
    if (content is SongStoryContent) {
      switch (t.id) {
        case 'song_full_poster':
          return songFullPoster(content, a);
        case 'song_liquid_glass':
          return songLiquidGlass(content, a);
        case 'song_editorial':
          return songEditorial(content, a);
        case 'song_vinyl':
          return songVinyl(content, a);
        case 'song_player':
          return songPlayer(content, a);
        case 'song_orb':
          return songOrb(content, a);
        case 'song_marquee':
          return songMarquee(content, a);
        default:
          return songClassic(content, a);
      }
    }
    if (content is LyricsStoryContent) {
      switch (t.id) {
        case 'lyrics_typography':
          return lyricsTypography(content, a);
        case 'lyrics_minimal':
          return lyricsMinimal(content, a);
        case 'lyrics_bold':
          return lyricsBold(content, a);
        case 'lyrics_bubbles':
          return lyricsBubbles(content, a);
        case 'lyrics_focus':
          return lyricsFocus(content, a);
        case 'lyrics_cover':
          return lyricsCover(content, a);
        case 'lyrics_neon':
          return lyricsNeon(content, a);
        default:
          return lyricsClassic(content, a);
      }
    }
    if (content is ArtistStoryContent) {
      switch (t.id) {
        case 'artist_editorial':
          return artistEditorial(content, a);
        case 'artist_discography':
          return artistDiscography(content, a);
        case 'artist_spotlight':
          return artistSpotlight(content, a);
        case 'artist_ripple':
          return artistRipple(content, a);
        case 'artist_pass':
          return artistPass(content, a);
        case 'artist_split':
          return artistSplit(content, a);
        case 'artist_top_songs':
          return artistTopSongs(content, a);
        default:
          return artistProfile(content, a);
      }
    }
    if (content is AlbumStoryContent) {
      switch (t.id) {
        case 'album_editorial':
          return albumEditorial(content, a);
        case 'album_liquid':
          return albumLiquid(content, a);
        case 'album_sleeve':
          return albumSleeve(content, a);
        case 'album_disc':
          return albumDisc(content, a);
        case 'album_tilt':
          return albumTilt(content, a);
        case 'album_tracklist':
          return albumTracklist(content, a);
        case 'album_minimal':
          return albumMinimal(content, a);
        default:
          return albumStacked(content, a);
      }
    }
    if (content is PlaylistStoryContent) {
      switch (t.id) {
        case 'playlist_poster':
          return playlistPoster(content, a);
        case 'playlist_editorial':
          return playlistEditorialGrid(content, a);
        case 'playlist_mosaic':
          return playlistMosaic(content, a);
        case 'playlist_fan':
          return playlistFan(content, a);
        case 'playlist_glass_list':
          return playlistGlassList(content, a);
        case 'playlist_orbit':
          return playlistOrbit(content, a);
        case 'playlist_film':
          return playlistFilm(content, a);
        default:
          return playlistCollage(content, a);
      }
    }
    return const SizedBox.shrink();
  }
}

/// Renders the active template inside the clean export viewport.
class StoryCardPreview extends StatelessWidget {
  const StoryCardPreview({
    super.key,
    required this.content,
    required this.template,
    required this.palette,
    required this.backgroundStyle,
    required this.textPolarity,
    required this.aspectRatio,
    this.boundaryKey,
  });

  final StoryShareContent content;
  final StoryTemplate template;
  final ArtworkPalette palette;
  final StoryBackgroundStyle backgroundStyle;
  final StoryTextPolarity textPolarity;
  final StoryAspectRatio aspectRatio;
  final GlobalKey? boundaryKey;

  @override
  Widget build(BuildContext context) {
    final args = StoryTemplateArgs(
      palette: palette,
      backgroundStyle: backgroundStyle,
      textPolarity: textPolarity,
      aspectRatio: aspectRatio,
    );
    return StoryCardViewport(
      aspectRatio: aspectRatio,
      boundaryKey: boundaryKey,
      child: DefaultTextStyle.merge(
        style: const TextStyle(decoration: TextDecoration.none),
        child: StoryTemplateRegistry.build(content, template, args),
      ),
    );
  }
}
