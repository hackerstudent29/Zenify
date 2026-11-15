import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import 'story_models.dart';
import 'story_service.dart';
import 'story_widgets.dart';

// ═════════════════════════════════════════════════════════════════════════════
// TEMPLATE KIT — skin-aware building blocks shared by every layout.
// Rule: every layout MUST place `brand(a)` (the flat, transparent Zenify logo).
// ═════════════════════════════════════════════════════════════════════════════

Widget txt(String s, TextStyle st, {int lines = 1, TextAlign align = TextAlign.start}) =>
    Text(s, maxLines: lines, overflow: TextOverflow.ellipsis, textAlign: align, style: st);

/// The Zenify logo — flat, transparent, no glass / gloss / glow.
Widget brand(StoryTemplateArgs a, {double size = 15, Color? tint}) =>
    ZenifyStoryBrand(isLight: a.isLight, iconSize: size, color: tint);

EdgeInsets safePad(StoryTemplateArgs a) => EdgeInsets.fromLTRB(a.pad, a.safeTop, a.pad, a.safeBottom);

Widget _box(double? w, double? h, Widget child) => (w == null && h == null) ? child : SizedBox(width: w, height: h, child: child);

// ── Skin surfaces ────────────────────────────────────────────────────────────

Widget surface(
  StoryTemplateArgs a, {
  required Widget child,
  double radius = 24,
  EdgeInsetsGeometry padding = const EdgeInsets.all(16),
  double? width,
  double? height,
  Color? color,
}) {
  final ink = a.fg;
  switch (a.skin) {
    case StorySkin.glass:
      return LiquidGlass(
        isLight: a.isLight,
        radius: radius,
        padding: padding,
        width: width,
        height: height,
        tint: color,
        child: child,
      );
    case StorySkin.aurora:
      final br = BorderRadius.circular(radius);
      return _box(
        width,
        height,
        ClipRRect(
          borderRadius: br,
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: color ?? Colors.white.withValues(alpha: a.isLight ? 0.40 : 0.13),
                borderRadius: br,
                border: Border.all(color: Colors.white.withValues(alpha: 0.30), width: 1),
              ),
              child: Padding(padding: padding, child: child),
            ),
          ),
        ),
      );
    case StorySkin.minimal:
      return _box(
        width,
        height,
        DecoratedBox(
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(radius * 0.55),
            border: Border.all(color: ink.withValues(alpha: 0.18), width: 0.8),
          ),
          child: Padding(padding: padding, child: child),
        ),
      );
    case StorySkin.retro:
      return _box(
        width,
        height,
        DecoratedBox(
          decoration: BoxDecoration(
            color: color ?? const Color(0xFFF8F0DB),
            borderRadius: BorderRadius.circular(math.min(radius, 10)),
            border: Border.all(color: ink, width: 2),
            boxShadow: [BoxShadow(color: ink, offset: const Offset(4, 4))],
          ),
          child: Padding(padding: padding, child: child),
        ),
      );
    case StorySkin.modern:
      return _box(
        width,
        height,
        DecoratedBox(
          decoration: BoxDecoration(
            color: color ?? (a.isLight ? Colors.white : const Color(0xFF1C1C1F)),
            borderRadius: BorderRadius.circular(radius),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.28), blurRadius: 26, offset: const Offset(0, 14))],
          ),
          child: Padding(padding: padding, child: child),
        ),
      );
    case StorySkin.clay:
      return _box(
        width,
        height,
        DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(radius * 1.25),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: color != null
                  ? [color, color]
                  : [Colors.white.withValues(alpha: 0.96), Color.lerp(Colors.white, a.palette.primary, 0.14)!],
            ),
            boxShadow: [
              BoxShadow(color: Colors.white.withValues(alpha: 0.95), offset: const Offset(-6, -6), blurRadius: 14),
              BoxShadow(color: ink.withValues(alpha: 0.22), offset: const Offset(8, 12), blurRadius: 24),
            ],
          ),
          child: Padding(padding: padding, child: child),
        ),
      );
    case StorySkin.neon:
      return _box(
        width,
        height,
        DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.38),
            borderRadius: BorderRadius.circular(radius),
            border: Border.all(color: a.accent, width: 1.4),
            boxShadow: [
              BoxShadow(color: a.accent.withValues(alpha: 0.55), blurRadius: 18),
              BoxShadow(color: a.accent.withValues(alpha: 0.22), blurRadius: 44, spreadRadius: 2),
            ],
          ),
          child: Padding(padding: padding, child: child),
        ),
      );
    case StorySkin.editorial:
      return _box(
        width,
        height,
        DecoratedBox(
          decoration: BoxDecoration(
            color: color,
            border: Border(
              top: BorderSide(color: ink, width: 1.2),
              bottom: BorderSide(color: ink.withValues(alpha: 0.5), width: 0.6),
            ),
          ),
          child: Padding(padding: padding, child: child),
        ),
      );
    case StorySkin.polaroid:
      return _box(
        width,
        height,
        DecoratedBox(
          decoration: BoxDecoration(
            color: color ?? Colors.white,
            borderRadius: BorderRadius.circular(4),
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.30), blurRadius: 22, offset: const Offset(0, 12)),
              BoxShadow(color: Colors.black.withValues(alpha: 0.14), blurRadius: 3, offset: const Offset(0, 1)),
            ],
          ),
          child: Padding(padding: padding, child: child),
        ),
      );
    case StorySkin.brutal:
      return _box(
        width,
        height,
        DecoratedBox(
          decoration: BoxDecoration(
            color: color ?? Color.lerp(Colors.white, a.palette.primary, 0.26),
            borderRadius: BorderRadius.circular(radius * 0.55),
            border: Border.all(color: ink, width: 3),
            boxShadow: [BoxShadow(color: ink, offset: const Offset(6, 6))],
          ),
          child: Padding(padding: padding, child: child),
        ),
      );
  }
}

// ── Skin artwork frames ──────────────────────────────────────────────────────

Widget artw(
  StoryTemplateArgs a,
  String url,
  double size, {
  double radius = 18,
  bool circle = false,
  double? height,
}) {
  final h = height ?? size;
  Widget plain(double w, double hh, double r, {bool shadow = false, bool hairline = false}) => StoryArtwork(
        url: url,
        width: w,
        height: hh,
        radius: r,
        circle: circle,
        shadow: shadow,
        hairline: hairline,
        palette: a.palette,
      );

  Widget framed({required double bw, required Color border, required List<BoxShadow> shadows, required double r}) {
    final inner = plain(size - bw * 2, h - bw * 2, 0);
    return Container(
      width: size,
      height: h,
      decoration: BoxDecoration(
        shape: circle ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: circle ? null : BorderRadius.circular(r),
        border: Border.all(color: border, width: bw),
        boxShadow: shadows,
      ),
      child: circle ? ClipOval(child: inner) : ClipRRect(borderRadius: BorderRadius.circular(math.max(0, r - bw)), child: inner),
    );
  }

  switch (a.skin) {
    case StorySkin.glass:
    case StorySkin.modern:
    case StorySkin.aurora:
      return plain(size, h, radius, shadow: true, hairline: true);
    case StorySkin.minimal:
      return plain(size, h, radius * 0.5, hairline: true);
    case StorySkin.editorial:
      return plain(size, h, 0);
    case StorySkin.polaroid:
      return plain(size, h, 2);
    case StorySkin.clay:
      return DecoratedBox(
        decoration: BoxDecoration(
          shape: circle ? BoxShape.circle : BoxShape.rectangle,
          borderRadius: circle ? null : BorderRadius.circular(radius * 1.6),
          boxShadow: [
            BoxShadow(color: Colors.white.withValues(alpha: 0.9), offset: const Offset(-4, -4), blurRadius: 10),
            BoxShadow(color: a.fg.withValues(alpha: 0.25), offset: const Offset(6, 9), blurRadius: 18),
          ],
        ),
        child: plain(size, h, radius * 1.3),
      );
    case StorySkin.retro:
      return framed(bw: 2, border: a.fg, shadows: [BoxShadow(color: a.fg, offset: const Offset(4, 4))], r: 6);
    case StorySkin.brutal:
      return framed(bw: 3, border: a.fg, shadows: [BoxShadow(color: a.fg, offset: const Offset(6, 6))], r: radius * 0.5);
    case StorySkin.neon:
      return framed(
        bw: 1.6,
        border: a.accent,
        shadows: [
          BoxShadow(color: a.accent.withValues(alpha: 0.6), blurRadius: 20),
          BoxShadow(color: a.accent.withValues(alpha: 0.25), blurRadius: 48, spreadRadius: 2),
        ],
        r: radius,
      );
  }
}

// ── Cover lists ──────────────────────────────────────────────────────────────

List<String> playlistCovers(PlaylistStoryContent c, int n) {
  final base = c.covers.where((e) => e.isNotEmpty).toList();
  if (base.isEmpty) base.addAll(c.tracks.map((t) => t.coverUrl).where((e) => e.isNotEmpty));
  if (base.isEmpty) return List.filled(n, '');
  return [for (int i = 0; i < n; i++) base[i % base.length]];
}

List<String> artistCovers(ArtistStoryContent c, int n) {
  var base = c.albumCovers.where((e) => e.isNotEmpty).toList();
  if (base.isEmpty) base = c.topTracks.map((t) => t.coverUrl).where((e) => e.isNotEmpty).toList();
  if (base.isEmpty) base = [c.coverUrl];
  return [for (int i = 0; i < n; i++) base[i % base.length]];
}

List<String> albumCovers(AlbumStoryContent c, int n) {
  var base = c.tracks.map((t) => t.coverUrl).where((e) => e.isNotEmpty).toSet().toList();
  if (base.isEmpty) base = [c.coverUrl];
  return [for (int i = 0; i < n; i++) base[i % base.length]];
}

String albumMeta(AlbumStoryContent c) {
  final parts = <String>[
    if (c.year != null && c.year!.isNotEmpty) c.year!,
    if (c.trackCount != null && c.trackCount! > 0) '${c.trackCount} songs',
  ];
  return parts.join(' · ');
}

// ── Lyrics helpers ───────────────────────────────────────────────────────────

double lyricScale(LyricsStoryContent c, StoryTemplateArgs a) {
  final len = c.selectedLines.join(' ').length;
  final s = len < 50 ? 1.0 : (len < 100 ? 0.84 : (len < 160 ? 0.7 : 0.58));
  final area = (a.w * a.h) / (360 * 640);
  return s * math.sqrt(area.clamp(0.2, 1.0));
}

List<Widget> lyricLines(
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

// ── Compact rows ─────────────────────────────────────────────────────────────

/// Art + two lines (+ optional logo underneath, Apple-Music-share-card style).
Widget artTitleRow(
  StoryTemplateArgs a,
  String url,
  String title,
  String sub, {
  double art = 52,
  bool withBrand = false,
  Color? c1,
  Color? c2,
}) {
  return Row(
    children: [
      artw(a, url, art, radius: 10),
      SizedBox(width: art * 0.24),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            txt(title, a.display(art * 0.30, color: c1)),
            const SizedBox(height: 2),
            txt(sub, a.text(art * 0.27, color: c2)),
            if (withBrand) ...[
              const SizedBox(height: 5),
              brand(a, size: art * 0.26),
            ],
          ],
        ),
      ),
    ],
  );
}

Widget fullBleed(StoryTemplateArgs a, String url, {double? height}) => StoryArtwork(
      url: url,
      width: a.w,
      height: height ?? a.h,
      radius: 0,
      shadow: false,
      hairline: false,
      palette: a.palette,
    );

Widget scrim(Alignment begin, Alignment end, {double top = 0.0, double bottom = 0.72}) => IgnorePointer(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: begin,
            end: end,
            colors: [Colors.black.withValues(alpha: top), Colors.black.withValues(alpha: bottom)],
          ),
        ),
      ),
    );

// ── Player pieces ────────────────────────────────────────────────────────────

Widget playerProgress(StoryTemplateArgs a, {double frac = 0.42, String left = '1:39', String right = '-1:21', Color? color}) {
  final c = color ?? a.fg;
  return Column(
    children: [
      Stack(
        children: [
          Container(height: 5, decoration: BoxDecoration(color: c.withValues(alpha: 0.22), borderRadius: BorderRadius.circular(3))),
          FractionallySizedBox(
            widthFactor: frac,
            child: Container(height: 5, decoration: BoxDecoration(color: c.withValues(alpha: 0.9), borderRadius: BorderRadius.circular(3))),
          ),
        ],
      ),
      const SizedBox(height: 6),
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(left, style: ZenType.text(10.5, c.withValues(alpha: 0.5), weight: FontWeight.w600)),
          Text(right, style: ZenType.text(10.5, c.withValues(alpha: 0.5), weight: FontWeight.w600)),
        ],
      ),
    ],
  );
}

Widget playerControls(StoryTemplateArgs a, {double size = 30, Color? color}) {
  final c = color ?? a.fg;
  return Row(
    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
    children: [
      Icon(CupertinoIcons.backward_fill, size: size, color: c),
      Icon(CupertinoIcons.pause_fill, size: size * 1.45, color: c),
      Icon(CupertinoIcons.forward_fill, size: size, color: c),
    ],
  );
}

// ── Painters ─────────────────────────────────────────────────────────────────

class RingsPainter extends CustomPainter {
  RingsPainter(this.color, {this.from = 0.3, this.count = 6, this.width = 1.2});
  final Color color;
  final double from;
  final int count;
  final double width;

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
          ..strokeWidth = width
          ..color = color.withValues(alpha: 0.34 * (1 - i / count)),
      );
    }
  }

  @override
  bool shouldRepaint(RingsPainter old) => old.color != color;
}

class BarcodePainter extends CustomPainter {
  BarcodePainter(this.color, this.seed);
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
  bool shouldRepaint(BarcodePainter old) => old.color != color;
}

class SpotlightPainter extends CustomPainter {
  SpotlightPainter(this.color);
  final Color color;

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
          colors: [color.withValues(alpha: 0.36), color.withValues(alpha: 0)],
        ).createShader(Offset.zero & size)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 14),
    );
  }

  @override
  bool shouldRepaint(SpotlightPainter old) => old.color != color;
}

class DashedLine extends StatelessWidget {
  const DashedLine({super.key, required this.color, this.dash = 6, this.gap = 5, this.thickness = 1.2});
  final Color color;
  final double dash;
  final double gap;
  final double thickness;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: thickness,
        width: double.infinity,
        child: CustomPaint(painter: _DashPainter(color, dash, gap, thickness)),
      );
}

class _DashPainter extends CustomPainter {
  _DashPainter(this.color, this.dash, this.gap, this.th);
  final Color color;
  final double dash, gap, th;

  @override
  void paint(Canvas canvas, Size size) {
    double x = 0;
    final p = Paint()..color = color..strokeWidth = th;
    while (x < size.width) {
      canvas.drawLine(Offset(x, th / 2), Offset(math.min(x + dash, size.width), th / 2), p);
      x += dash + gap;
    }
  }

  @override
  bool shouldRepaint(_DashPainter old) => old.color != color;
}

/// Torn-paper bottom edge (receipts, tickets).
class ZigZagClipper extends CustomClipper<Path> {
  const ZigZagClipper({this.tooth = 9});
  final double tooth;

  @override
  Path getClip(Size size) {
    final p = Path()..lineTo(0, size.height - tooth);
    double x = 0;
    bool down = true;
    while (x < size.width) {
      x = math.min(x + tooth, size.width);
      p.lineTo(x, size.height - (down ? 0 : tooth));
      down = !down;
    }
    p.lineTo(size.width, 0);
    p.close();
    return p;
  }

  @override
  bool shouldReclip(ZigZagClipper old) => old.tooth != tooth;
}

// ── Vinyl ────────────────────────────────────────────────────────────────────

class VinylDisc extends StatelessWidget {
  const VinylDisc({super.key, required this.size, required this.coverUrl, required this.palette, this.spin = true});
  final double size;
  final String coverUrl;
  final ArtworkPalette palette;
  final bool spin;

  @override
  Widget build(BuildContext context) {
    final disc = SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(size: Size.square(size), painter: _VinylPainter()),
          StoryArtwork(url: coverUrl, size: size * 0.36, circle: true, shadow: false, palette: palette),
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
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 22, offset: const Offset(0, 10))],
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

// ── Cassette (songs + playlists) ─────────────────────────────────────────────

class _ReelPainter extends CustomPainter {
  _ReelPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final r = size.width / 2;
    canvas.drawCircle(c, r, Paint()..color = color.withValues(alpha: 0.16));
    canvas.drawCircle(c, r * 0.62, Paint()..color = color);
    for (int i = 0; i < 6; i++) {
      final ang = i * math.pi / 3;
      canvas.drawLine(
        c + Offset(math.cos(ang), math.sin(ang)) * (r * 0.2),
        c + Offset(math.cos(ang), math.sin(ang)) * (r * 0.52),
        Paint()
          ..color = const Color(0xFF1A1512)
          ..strokeWidth = r * 0.14
          ..strokeCap = StrokeCap.round,
      );
    }
    canvas.drawCircle(c, r * 0.14, Paint()..color = const Color(0xFF1A1512));
  }

  @override
  bool shouldRepaint(_ReelPainter old) => old.color != color;
}

Widget cassette(
  StoryTemplateArgs a, {
  required double width,
  required String title,
  required String subtitle,
}) {
  final h = width * 0.64;
  const ink = Color(0xFF2B2118);
  final stripe = a.skin == StorySkin.retro ? const Color(0xFFD9541E) : a.palette.primary;
  Widget reel(double s) => SizedBox(
        width: s,
        height: s,
        child: Spin(seconds: 6, child: CustomPaint(painter: _ReelPainter(const Color(0xFFEDE3CB)))),
      );

  return surface(
    a,
    radius: 16,
    width: width,
    height: h,
    padding: EdgeInsets.all(width * 0.04),
    child: Column(
      children: [
        Expanded(
          flex: 11,
          child: Container(
            width: double.infinity,
            padding: EdgeInsets.symmetric(horizontal: width * 0.04, vertical: width * 0.025),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF7E0),
              borderRadius: BorderRadius.circular(6),
              border: Border(top: BorderSide(color: stripe, width: width * 0.028)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      txt(title, ZenType.mono(width * 0.056, ink)),
                      const SizedBox(height: 2),
                      txt(subtitle, ZenType.mono(width * 0.038, ink.withValues(alpha: 0.65), weight: FontWeight.w600)),
                    ],
                  ),
                ),
                brand(a, size: width * 0.052),
              ],
            ),
          ),
        ),
        SizedBox(height: width * 0.03),
        Expanded(
          flex: 10,
          child: Container(
            decoration: BoxDecoration(color: const Color(0xFF1A1512), borderRadius: BorderRadius.circular(width * 0.06)),
            padding: EdgeInsets.symmetric(horizontal: width * 0.07),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [reel(width * 0.17), Container(width: width * 0.18, height: 3, color: const Color(0xFF6B4F2A)), reel(width * 0.17)],
            ),
          ),
        ),
      ],
    ),
  );
}

TextStyle handStyle(double size, Color color) => TextStyle(
      fontFamily: 'Bradley Hand',
      fontFamilyFallback: const ['Noteworthy', 'Segoe Print', 'Comic Sans MS', 'cursive'],
      fontSize: size,
      fontWeight: FontWeight.w700,
      height: 1.2,
      color: color,
    );

TextStyle outlineStyle(TextStyle base, Color stroke, {double width = 1.4}) =>
    base.copyWith(foreground: Paint()..style = PaintingStyle.stroke..strokeWidth = width..color = stroke);

Widget stage(StoryTemplateArgs a, String coverUrl, Widget child) =>
    Stack(fit: StackFit.expand, children: [a.bg(coverUrl), child]);

int seedOf(String s) => s.codeUnits.fold<int>(7, (p, e) => (p * 31 + e) & 0x7fffffff) % 97;

/// Scales a block DOWN (never up) so it always fits [maxH] — lyrics of any
/// length can never overflow a card.
Widget fitBlock(double w, double maxH, Widget child, {Alignment alignment = Alignment.centerLeft}) => SizedBox(
      width: w,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxH),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          alignment: alignment,
          child: SizedBox(width: w, child: child),
        ),
      ),
    );
