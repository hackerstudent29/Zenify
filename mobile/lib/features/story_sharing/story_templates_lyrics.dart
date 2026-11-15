import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';

import 'story_models.dart';
import 'story_template_kit.dart';
import 'story_widgets.dart';

// ═════════════════════════════════════════════════════════════════════════════
// LYRICS LAYOUTS (12) — combined with skins/ratios into 30 designs
// ═════════════════════════════════════════════════════════════════════════════

Widget buildLyrics(LyricsStoryContent c, StoryTemplateArgs a) {
  switch (a.template.layout as LyricsLayout) {
    case LyricsLayout.glassCard:
      return _glassCard(c, a);
    case LyricsLayout.center:
      return _center(c, a);
    case LyricsLayout.bold:
      return _bold(c, a);
    case LyricsLayout.bubbles:
      return _bubbles(c, a);
    case LyricsLayout.focus:
      return _focus(c, a);
    case LyricsLayout.coverTop:
      return _coverTop(c, a);
    case LyricsLayout.serif:
      return _serif(c, a);
    case LyricsLayout.note:
      return _note(c, a);
    case LyricsLayout.karaoke:
      return _karaoke(c, a);
    case LyricsLayout.split:
      return _split(c, a);
    case LyricsLayout.outline:
      return _outline(c, a);
    case LyricsLayout.receipt:
      return _receipt(c, a);
  }
}

/// Apple Music lyric-share card: lyrics on top, artwork + title + logo below.
Widget _glassCard(LyricsStoryContent c, StoryTemplateArgs a) {
  final sc = lyricScale(c, a);
  final cw = a.w - (a.isStory ? 40 : 36);
  const px = 22.0;
  final maxH = a.h * (a.isStory ? 0.42 : 0.50);
  return stage(
    a,
    c.coverUrl,
    Center(
      child: a.motion(
        surface(
          a,
          radius: 28,
          width: cw,
          padding: EdgeInsets.zero,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(px, 22, px, 20),
                child: fitBlock(
                  cw - px * 2,
                  maxH,
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: lyricLines(c, a.display(27 * sc, height: 1.2), gap: 8)),
                ),
              ),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(px - 4, 14, px - 4, 16),
                color: a.fg.withValues(alpha: a.skin == StorySkin.glass || a.skin == StorySkin.aurora ? 0.06 : 0.0),
                child: artTitleRow(a, c.coverUrl, c.title, c.subtitle, art: 54, withBrand: true),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

Widget _center(LyricsStoryContent c, StoryTemplateArgs a) {
  final sc = lyricScale(c, a);
  final w = a.w - a.pad * 2;
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        children: [
          brand(a, size: 16),
          const Spacer(),
          a.motion(
            fitBlock(
              w,
              a.h * 0.56,
              Column(children: lyricLines(c, a.display(32 * sc, height: 1.26, weight: FontWeight.w700), align: TextAlign.center, gap: 10)),
              alignment: Alignment.center,
            ),
            amp: 4,
          ),
          const SizedBox(height: 24),
          Container(width: 28, height: 2, color: a.accent),
          const SizedBox(height: 14),
          txt(c.title, a.text(14, color: a.fg, weight: FontWeight.w700), align: TextAlign.center),
          const SizedBox(height: 2),
          txt(c.subtitle, a.text(13), align: TextAlign.center),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _bold(LyricsStoryContent c, StoryTemplateArgs a) {
  final sc = lyricScale(c, a);
  final w = a.w - a.pad * 2;
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('LYRICS', style: a.cap(color: a.fg)), brand(a, size: 16)]),
          const Spacer(),
          a.motion(
            fitBlock(w, a.h * 0.58, Column(crossAxisAlignment: CrossAxisAlignment.start, children: lyricLines(c, a.display(44 * sc, weight: FontWeight.w900, height: 1.02), gap: 6))),
            amp: 4,
          ),
          const SizedBox(height: 20),
          artTitleRow(a, c.coverUrl, c.title, c.subtitle, art: 44, c1: a.fg, c2: a.fg2),
        ],
      ),
    ),
  );
}

Widget _bubbles(LyricsStoryContent c, StoryTemplateArgs a) {
  final sc = lyricScale(c, a);
  final n = c.selectedLines.length;
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          artTitleRow(a, c.coverUrl, c.title, c.subtitle, art: 50, withBrand: true),
          const Spacer(),
          for (int i = 0; i < n; i++)
            Padding(
              padding: EdgeInsets.only(bottom: i == n - 1 ? 0 : 12),
              child: Align(
                alignment: i.isEven ? Alignment.centerLeft : Alignment.centerRight,
                child: a.motion(
                  surface(
                    a,
                    radius: 24,
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
                    child: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: a.w * 0.72),
                      child: Text(c.selectedLines[i], style: a.display(22 * sc.clamp(0.7, 1.0).toDouble(), height: 1.22, weight: FontWeight.w700)),
                    ),
                  ),
                  amp: 4,
                  phase: i * 0.2,
                ),
              ),
            ),
          const Spacer(),
        ],
      ),
    ),
  );
}

/// Apple Music "synced lyrics" look: current line bright, the rest soft + blurred.
Widget _focus(LyricsStoryContent c, StoryTemplateArgs a) {
  final sc = lyricScale(c, a);
  final w = a.w - a.pad * 2;
  final n = c.selectedLines.length;
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: artTitleRow(a, c.coverUrl, c.title, c.subtitle, art: 48)),
              brand(a, size: 16),
            ],
          ),
          const Spacer(),
          a.motion(
            fitBlock(
              w,
              a.h * 0.56,
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (int i = 0; i < n; i++)
                    Padding(
                      padding: EdgeInsets.only(bottom: i == n - 1 ? 0 : 14),
                      child: i == 0
                          ? Text(c.selectedLines[i], style: a.display(36 * sc, weight: FontWeight.w800, height: 1.14))
                          : ImageFiltered(
                              imageFilter: ImageFilter.blur(sigmaX: 1.3, sigmaY: 1.3),
                              child: Text(c.selectedLines[i], style: a.display(36 * sc, weight: FontWeight.w800, height: 1.14, color: a.fg.withValues(alpha: 0.34))),
                            ),
                    ),
                ],
              ),
            ),
            amp: 4,
          ),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _coverTop(LyricsStoryContent c, StoryTemplateArgs a) {
  final sc = lyricScale(c, a);
  final art = math.min(a.w * 0.50, a.h * 0.30);
  final w = a.w - a.pad * 2 - 40;
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        children: [
          brand(a, size: 16),
          const SizedBox(height: 14),
          a.motion(artw(a, c.coverUrl, art, radius: 16)),
          const SizedBox(height: 16),
          Expanded(
            child: surface(
              a,
              radius: 28,
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
              child: Column(
                children: [
                  Expanded(
                    child: Center(
                      child: fitBlock(w, a.h * 0.4, Column(crossAxisAlignment: CrossAxisAlignment.start, children: lyricLines(c, a.display(26 * sc, height: 1.2), gap: 8))),
                    ),
                  ),
                  Container(height: 0.8, color: a.fg.withValues(alpha: 0.2)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [txt(c.title, a.display(15)), txt(c.subtitle, a.text(13))],
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

Widget _serif(LyricsStoryContent c, StoryTemplateArgs a) {
  final sc = lyricScale(c, a);
  final w = a.w - a.pad * 2;
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          brand(a, size: 16),
          const Spacer(),
          Text('“', style: ZenType.serif(90, a.accent, weight: FontWeight.w700, height: 0.7)),
          const SizedBox(height: 6),
          a.motion(
            fitBlock(
              w,
              a.h * 0.5,
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: lyricLines(c, a.display(34 * sc, weight: FontWeight.w600, height: 1.16).copyWith(fontStyle: FontStyle.italic), gap: 8),
              ),
            ),
            amp: 4,
          ),
          const SizedBox(height: 20),
          Container(height: 1.2, color: a.fg),
          const SizedBox(height: 10),
          Row(
            children: [
              artw(a, c.coverUrl, 38, radius: 6),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [txt(c.title, a.display(15)), txt(c.subtitle, a.text(13))])),
            ],
          ),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _note(LyricsStoryContent c, StoryTemplateArgs a) {
  final sc = lyricScale(c, a);
  final w = a.w * 0.80;
  return stage(
    a,
    c.coverUrl,
    Center(
      child: a.motion(
        Transform.rotate(
          angle: -0.03,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.topCenter,
            children: [
              surface(
                a,
                radius: 6,
                width: w,
                color: const Color(0xFFFFF0A0),
                padding: const EdgeInsets.fromLTRB(20, 26, 20, 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    fitBlock(w - 40, a.h * 0.46, Column(crossAxisAlignment: CrossAxisAlignment.start, children: lyricLines(c, handStyle(27 * sc, const Color(0xFF2B2118)), gap: 6))),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        artw(a, c.coverUrl, 36, radius: 4),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              txt(c.title, handStyle(15, const Color(0xFF2B2118))),
                              txt(c.subtitle, handStyle(13, const Color(0xFF2B2118).withValues(alpha: 0.65))),
                            ],
                          ),
                        ),
                        brand(a, size: 15),
                      ],
                    ),
                  ],
                ),
              ),
              Positioned(
                top: -11,
                child: Transform.rotate(angle: 0.05, child: Container(width: w * 0.28, height: 22, color: const Color(0xFFF58529).withValues(alpha: 0.55))),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

Widget _karaoke(LyricsStoryContent c, StoryTemplateArgs a) {
  final sc = lyricScale(c, a);
  final w = a.w - a.pad * 2;
  final n = c.selectedLines.length;
  final cur = (n - 1) ~/ 2;
  final glow = a.skin == StorySkin.neon ? [Shadow(color: a.accent, blurRadius: 18), Shadow(color: a.accent.withValues(alpha: 0.6), blurRadius: 36)] : null;
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [Expanded(child: artTitleRow(a, c.coverUrl, c.title, c.subtitle, art: 46)), brand(a, size: 16)]),
          const Spacer(),
          a.motion(
            fitBlock(
              w,
              a.h * 0.56,
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (int i = 0; i < n; i++)
                    Padding(
                      padding: EdgeInsets.only(bottom: i == n - 1 ? 0 : 12),
                      child: Text(
                        c.selectedLines[i],
                        style: i == cur
                            ? a.display(38 * sc, weight: FontWeight.w800, height: 1.12, color: a.skin == StorySkin.neon ? a.accent : a.fg).copyWith(shadows: glow)
                            : a.display(30 * sc, weight: FontWeight.w700, height: 1.12, color: a.fg.withValues(alpha: 0.32)),
                      ),
                    ),
                ],
              ),
            ),
            amp: 4,
          ),
          const SizedBox(height: 18),
          SizedBox(width: 44, child: StoryWaveform(color: a.accent, bars: 6, height: 18, seed: seedOf(c.title), barWidth: 3)),
          const Spacer(),
        ],
      ),
    ),
  );
}

/// Art on the left, lyrics on the right — for card (4:3) and wide (16:9).
Widget _split(LyricsStoryContent c, StoryTemplateArgs a) {
  final sc = lyricScale(c, a);
  final art = math.min(a.h * 0.72, a.w * 0.38);
  final rw = a.w - 14 - art - 14 - 16;
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 16, 14),
      child: Row(
        children: [
          Center(child: a.motion(artw(a, c.coverUrl, art, radius: 14))),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Align(alignment: Alignment.centerRight, child: brand(a, size: 14)),
                const Spacer(),
                fitBlock(rw, a.h * 0.52, Column(crossAxisAlignment: CrossAxisAlignment.start, children: lyricLines(c, a.display(24 * math.max(sc, 0.8), height: 1.18), gap: 6))),
                const SizedBox(height: 10),
                txt(c.title, a.display(13)),
                txt(c.subtitle, a.text(12)),
                const Spacer(),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

Widget _outline(LyricsStoryContent c, StoryTemplateArgs a) {
  final sc = lyricScale(c, a);
  final w = a.w - a.pad * 2;
  final n = c.selectedLines.length;
  final base = a.display(46 * sc, weight: FontWeight.w900, height: 1.0);
  final glow = a.skin == StorySkin.neon ? [Shadow(color: a.accent, blurRadius: 18), Shadow(color: a.accent.withValues(alpha: 0.5), blurRadius: 40)] : null;
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          brand(a, size: 16),
          const Spacer(),
          a.motion(
            fitBlock(
              w,
              a.h * 0.58,
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (int i = 0; i < n; i++)
                    Padding(
                      padding: EdgeInsets.only(bottom: i == n - 1 ? 0 : 6),
                      child: i == n - 1
                          ? Text(c.selectedLines[i], style: base.copyWith(color: a.skin == StorySkin.neon ? a.accent : a.fg, shadows: glow))
                          : Text(c.selectedLines[i], style: outlineStyle(base, a.skin == StorySkin.neon ? a.accent : a.fg, width: 1.6)),
                    ),
                ],
              ),
            ),
            amp: 4,
          ),
          const SizedBox(height: 22),
          artTitleRow(a, c.coverUrl, c.title, c.subtitle, art: 42),
        ],
      ),
    ),
  );
}

Widget _receipt(LyricsStoryContent c, StoryTemplateArgs a) {
  final sc = lyricScale(c, a);
  final w = a.w * 0.78;
  final paper = a.skin == StorySkin.retro ? const Color(0xFFFBF5E4) : Colors.white;
  const ink = Color(0xFF2B2118);
  TextStyle m(double s, {FontWeight wt = FontWeight.w600, Color col = ink}) => ZenType.mono(s, col, weight: wt);
  return stage(
    a,
    c.coverUrl,
    Center(
      child: a.motion(
        PhysicalShape(
          clipper: const ZigZagClipper(),
          color: paper,
          elevation: 10,
          shadowColor: Colors.black,
          child: Container(
            width: w,
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 30),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                brand(a, size: 18, tint: null),
                const SizedBox(height: 6),
                Text('LYRICS RECEIPT', style: m(12, wt: FontWeight.w800)),
                const SizedBox(height: 8),
                const DashedLine(color: ink),
                const SizedBox(height: 10),
                fitBlock(w - 36, a.h * 0.30, Column(children: lyricLines(c, m(17 * sc.clamp(0.7, 1.0).toDouble(), wt: FontWeight.w700), align: TextAlign.center, gap: 6)), alignment: Alignment.center),
                const SizedBox(height: 10),
                const DashedLine(color: ink),
                const SizedBox(height: 8),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('TRACK', style: m(11)), Flexible(child: txt(c.title.toUpperCase(), m(11, wt: FontWeight.w800), align: TextAlign.right))]),
                const SizedBox(height: 3),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('ARTIST', style: m(11)), Flexible(child: txt(c.subtitle.toUpperCase(), m(11, wt: FontWeight.w800), align: TextAlign.right))]),
                const SizedBox(height: 10),
                SizedBox(height: 30, width: double.infinity, child: CustomPaint(painter: BarcodePainter(ink, seedOf(c.title)))),
                const SizedBox(height: 6),
                Text('THANK YOU FOR LISTENING', style: m(9.5, wt: FontWeight.w700)),
                Text('zenify.app', style: m(9.5)),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
