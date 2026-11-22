import 'dart:math' as math;

import 'package:flutter/cupertino.dart';

import 'story_models.dart';
import 'story_template_kit.dart';
import 'story_widgets.dart';

// ═════════════════════════════════════════════════════════════════════════════
// SONG LAYOUTS (15) — combined with skins/ratios into 30 designs
// ═════════════════════════════════════════════════════════════════════════════

Widget buildSong(SongStoryContent c, StoryTemplateArgs a) {
  switch (a.template.layout as SongLayout) {
    case SongLayout.tile:
      return _tile(c, a);
    case SongLayout.nowPlaying:
      return _nowPlaying(c, a);
    case SongLayout.player:
      return _player(c, a);
    case SongLayout.poster:
      return _poster(c, a);
    case SongLayout.orb:
      return _orb(c, a);
    case SongLayout.vinyl:
      return _vinyl(c, a);
    case SongLayout.cassette:
      return _cassette(c, a);
    case SongLayout.polaroid:
      return _polaroid(c, a);
    case SongLayout.type:
      return _type(c, a);
    case SongLayout.marquee:
      return _marquee(c, a);
    case SongLayout.stack:
      return _stack(c, a);
    case SongLayout.wave:
      return _wave(c, a);
    case SongLayout.pill:
      return _pill(c, a);
    case SongLayout.lockscreen:
      return _lock(c, a);
    case SongLayout.ticket:
      return _ticket(c, a);
  }
}

/// Apple Music "share song" card: artwork tile + title + artist + logo.
Widget _tile(SongStoryContent c, StoryTemplateArgs a) {
  final cw = math.min(a.w * 0.74, a.h * 0.64);
  final pad = cw * 0.06;
  return stage(
    a,
    c.coverUrl,
    Center(
      child: a.motion(
        surface(
          a,
          radius: 24,
          width: cw,
          padding: EdgeInsets.all(pad),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              artw(a, c.coverUrl, cw - pad * 2, radius: 14),
              SizedBox(height: cw * 0.05),
              txt(c.title, a.display(cw * 0.075)),
              const SizedBox(height: 2),
              txt(c.subtitle, a.text(cw * 0.062)),
              SizedBox(height: cw * 0.045),
              brand(a, size: cw * 0.055),
            ],
          ),
        ),
      ),
    ),
  );
}

/// Apple Music now-playing widget: art, title, progress, transport controls.
Widget _playerCard(SongStoryContent c, StoryTemplateArgs a, {required double width, required bool compact}) {
  final art = compact ? 56.0 : width * 0.24;
  return surface(
    a,
    radius: compact ? 26 : 34,
    width: width,
    padding: EdgeInsets.fromLTRB(16, compact ? 12 : 18, 16, compact ? 10 : 16),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            artw(a, c.coverUrl, art, radius: 10),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  txt(c.title, a.display(compact ? 16 : 21)),
                  const SizedBox(height: 2),
                  txt(c.subtitle, a.text(compact ? 14 : 17)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            brand(a, size: compact ? 14 : 17),
          ],
        ),
        SizedBox(height: compact ? 8 : 18),
        playerProgress(a),
        SizedBox(height: compact ? 0 : 10),
        playerControls(a, size: compact ? 18 : 28),
      ],
    ),
  );
}

Widget _nowPlaying(SongStoryContent c, StoryTemplateArgs a) {
  final compact = a.h < 220;
  return stage(
    a,
    c.coverUrl,
    Center(child: a.motion(_playerCard(c, a, width: a.w - (compact ? 28 : 36), compact: compact))),
  );
}

Widget _player(SongStoryContent c, StoryTemplateArgs a) {
  final art = math.min(a.w - a.pad * 2, a.h * 0.40);
  final gap = a.isStory ? 22.0 : 10.0;
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        children: [
          brand(a, size: 17),
          const Spacer(),
          a.motion(artw(a, c.coverUrl, art, radius: 14)),
          SizedBox(height: gap + 4),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    txt(c.title, a.display(20)),
                    const SizedBox(height: 2),
                    txt(c.subtitle, a.text(16)),
                  ],
                ),
              ),
              Icon(CupertinoIcons.ellipsis_vertical, size: 22, color: a.fg2),
            ],
          ),
          SizedBox(height: gap),
          playerProgress(a),
          SizedBox(height: gap * 0.6),
          playerControls(a, size: 28),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _poster(SongStoryContent c, StoryTemplateArgs a) {
  return Stack(
    fit: StackFit.expand,
    children: [
      fullBleed(a, c.coverUrl),
      scrim(Alignment.topCenter, Alignment.bottomCenter, top: 0.12, bottom: 0.80),
      Padding(
        padding: safePad(a),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Align(alignment: Alignment.centerLeft, child: brand(a, size: 17, tint: null)),
            const Spacer(),
            a.motion(
              surface(
                a,
                radius: 26,
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('NOW PLAYING', style: a.cap()),
                    const SizedBox(height: 6),
                    txt(c.title, a.display(a.isStory ? 30 : 24), lines: 2),
                    const SizedBox(height: 3),
                    txt(c.subtitle, a.text(16)),
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

Widget _orb(SongStoryContent c, StoryTemplateArgs a) {
  final ring = math.min(a.w - a.pad * 2, a.h * 0.52);
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
            SizedBox(
              width: ring,
              height: ring,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  CustomPaint(size: Size.square(ring), painter: RingsPainter(a.accent, from: 0.55, count: 6)),
                  artw(a, c.coverUrl, ring * 0.54, circle: true),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          txt(c.title, a.display(a.isStory ? 26 : 22), align: TextAlign.center, lines: 2),
          const SizedBox(height: 3),
          txt(c.subtitle, a.text(15), align: TextAlign.center),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _vinyl(SongStoryContent c, StoryTemplateArgs a) {
  final art = math.min((a.w - a.pad * 2) / 1.42, a.h * 0.40);
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
            SizedBox(
              width: art * 1.42,
              height: art,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned(right: 0, top: art * 0.04, child: VinylDisc(size: art * 0.92, coverUrl: c.coverUrl, palette: a.palette)),
                  Positioned(left: 0, top: 0, child: artw(a, c.coverUrl, art, radius: 8)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          txt(c.title, a.display(a.isStory ? 24 : 21), align: TextAlign.center, lines: 2),
          const SizedBox(height: 3),
          txt(c.subtitle, a.text(15), align: TextAlign.center),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _cassette(SongStoryContent c, StoryTemplateArgs a) {
  final w = math.min(a.w - a.pad * 2, (a.h - 70) / 0.64);
  return stage(
    a,
    c.coverUrl,
    Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          a.motion(cassette(a, width: w, title: c.title, subtitle: c.subtitle)),
          const SizedBox(height: 16),
          Text('SIDE A  ·  ${c.kindLabel.toUpperCase()}', style: a.cap()),
        ],
      ),
    ),
  );
}

Widget _polaroid(SongStoryContent c, StoryTemplateArgs a) {
  final w = math.min(a.w * 0.74, a.h * 0.62 / 1.2);
  final p = w * 0.06;
  return stage(
    a,
    c.coverUrl,
    Center(
      child: a.motion(
        Transform.rotate(
          angle: -0.045,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.topCenter,
            children: [
              surface(
                a,
                width: w,
                padding: EdgeInsets.fromLTRB(p, p, p, p * 1.1),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    artw(a, c.coverUrl, w - p * 2),
                    SizedBox(height: w * 0.05),
                    txt(c.title, handStyle(w * 0.085, a.fg)),
                    txt(c.subtitle, handStyle(w * 0.06, a.fg2)),
                    SizedBox(height: w * 0.03),
                    Align(alignment: Alignment.centerRight, child: brand(a, size: w * 0.05)),
                  ],
                ),
              ),
              Positioned(
                top: -12,
                child: Transform.rotate(
                  angle: 0.06,
                  child: Container(width: w * 0.30, height: 22, color: const Color(0xFFF3E3A0).withValues(alpha: 0.88)),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

Widget _type(SongStoryContent c, StoryTemplateArgs a) {
  final len = c.title.length;
  final base = a.isStory ? 60.0 : 46.0;
  final size = len < 14 ? base : (len < 28 ? base * 0.78 : base * 0.6);
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('NOW PLAYING', style: a.cap(color: a.fg)), brand(a, size: 16)]),
          const SizedBox(height: 10),
          Container(height: a.skin == StorySkin.brutal ? 3 : 1.2, color: a.fg),
          const Spacer(),
          Align(alignment: Alignment.centerRight, child: a.motion(artw(a, c.coverUrl, math.min(a.w * 0.42, a.h * 0.30), radius: 6))),
          const SizedBox(height: 14),
          Text(c.title, maxLines: a.isStory ? 4 : 3, overflow: TextOverflow.ellipsis, style: a.display(size, height: 0.96)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: txt(c.subtitle, a.text(17, color: a.fg))),
              Icon(CupertinoIcons.arrow_up_right, size: 18, color: a.fg),
            ],
          ),
        ],
      ),
    ),
  );
}

Widget _marquee(SongStoryContent c, StoryTemplateArgs a) {
  final rows = a.h > 400 ? 9 : 6;
  final word = '${c.title.toUpperCase()}   ${c.title.toUpperCase()}   ${c.title.toUpperCase()}';
  final size = a.isStory ? 56.0 : 44.0;
  final art = math.min(a.w * 0.50, a.h * 0.32);
  return stage(
    a,
    c.coverUrl,
    Stack(
      fit: StackFit.expand,
      children: [
        Transform.rotate(
          angle: -0.16,
          child: OverflowBox(
            maxWidth: a.w * 2.2,
            maxHeight: a.h * 1.6,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (int i = 0; i < rows; i++)
                  Text(
                    word,
                    softWrap: false,
                    maxLines: 1,
                    overflow: TextOverflow.clip,
                    style: i.isEven ? outlineStyle(a.display(size, weight: FontWeight.w900), a.fg.withValues(alpha: 0.55)) : a.display(size, weight: FontWeight.w900, color: a.fg.withValues(alpha: 0.10)),
                  ),
              ],
            ),
          ),
        ),
        Padding(
          padding: safePad(a),
          child: Column(
            children: [
              brand(a, size: 16),
              const Spacer(),
              a.motion(artw(a, c.coverUrl, art, radius: 16)),
              const SizedBox(height: 18),
              txt(c.title, a.display(22), align: TextAlign.center, lines: 2),
              const SizedBox(height: 3),
              txt(c.subtitle, a.text(15), align: TextAlign.center),
              const Spacer(),
            ],
          ),
        ),
      ],
    ),
  );
}

Widget _stack(SongStoryContent c, StoryTemplateArgs a) {
  final s = math.min(a.w * 0.56, a.h * 0.34);
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
            SizedBox(
              width: s * 1.4,
              height: s * 1.22,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned(left: 0, top: s * 0.2, child: Transform.rotate(angle: -0.14, child: Opacity(opacity: 0.7, child: artw(a, c.coverUrl, s * 0.84, radius: 14)))),
                  Positioned(right: 0, top: s * 0.12, child: Transform.rotate(angle: 0.13, child: Opacity(opacity: 0.85, child: artw(a, c.coverUrl, s * 0.88, radius: 14)))),
                  Positioned(left: s * 0.2, top: 0, child: artw(a, c.coverUrl, s, radius: 14)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          txt(c.title, a.display(a.isStory ? 25 : 21), align: TextAlign.center, lines: 2),
          const SizedBox(height: 3),
          txt(c.subtitle, a.text(15), align: TextAlign.center),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _wave(SongStoryContent c, StoryTemplateArgs a) {
  final art = math.min(a.w * 0.50, a.h * 0.30);
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        children: [
          brand(a, size: 16),
          const Spacer(),
          a.motion(artw(a, c.coverUrl, art, radius: 16)),
          const SizedBox(height: 22),
          surface(
            a,
            radius: 24,
            padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
            width: a.w - a.pad * 2,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                txt(c.title, a.display(20)),
                const SizedBox(height: 2),
                txt(c.subtitle, a.text(15)),
                const SizedBox(height: 12),
                StoryWaveform(color: a.accent, bars: 36, height: 52, seed: seedOf(c.title), barWidth: 3),
              ],
            ),
          ),
          const Spacer(),
        ],
      ),
    ),
  );
}

/// Dynamic-Island style pill for wide (16:9) shares.
Widget _pill(SongStoryContent c, StoryTemplateArgs a) {
  return stage(
    a,
    c.coverUrl,
    Stack(
      children: [
        Center(
          child: a.motion(
            surface(
              a,
              radius: 42,
              width: a.w * 0.86,
              height: 84,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                children: [
                  artw(a, c.coverUrl, 56, radius: 14),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [txt(c.title, a.display(16)), const SizedBox(height: 2), txt(c.subtitle, a.text(13))],
                    ),
                  ),
                  SizedBox(width: 70, child: StoryWaveform(color: a.fg, bars: 10, height: 26, seed: seedOf(c.title), barWidth: 3)),
                ],
              ),
            ),
          ),
        ),
        Positioned(left: 0, right: 0, bottom: 14, child: Center(child: brand(a, size: 14))),
        Positioned(left: 0, right: 0, top: 14, child: Center(child: Text('NOW PLAYING', style: a.cap()))),
      ],
    ),
  );
}

Widget _lock(SongStoryContent c, StoryTemplateArgs a) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  final now = DateTime.now();
  final hh = now.hour % 12 == 0 ? 12 : now.hour % 12;
  final mm = now.minute.toString().padLeft(2, '0');
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: EdgeInsets.fromLTRB(a.pad, a.safeTop + 6, a.pad, a.safeBottom),
      child: Column(
        children: [
          Text('${days[now.weekday - 1]} ${now.day} ${months[now.month - 1]}', style: a.text(18, color: a.fg2, weight: FontWeight.w600)),
          Text('$hh:$mm', style: a.display(96, weight: FontWeight.w300, height: 1.0)),
          const Spacer(),
          a.motion(_playerCard(c, a, width: a.w - a.pad * 2, compact: false)),
          const SizedBox(height: 22),
          brand(a, size: 18),
        ],
      ),
    ),
  );
}

Widget _ticket(SongStoryContent c, StoryTemplateArgs a) {
  final w = a.w * 0.80;
  return stage(
    a,
    c.coverUrl,
    Center(
      child: a.motion(
        surface(
          a,
          radius: 10,
          width: w,
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [txt('ADMIT ONE', a.display(16)), brand(a, size: 14)]),
              const SizedBox(height: 10),
              DashedLine(color: a.fg),
              const SizedBox(height: 12),
              Center(child: artw(a, c.coverUrl, math.min(150, a.h * 0.30))),
              const SizedBox(height: 12),
              txt(c.title, a.display(22), lines: 2),
              txt(c.subtitle, a.text(15)),
              const SizedBox(height: 10),
              DashedLine(color: a.fg),
              const SizedBox(height: 10),
              SizedBox(height: 34, width: double.infinity, child: CustomPaint(painter: BarcodePainter(a.fg, seedOf(c.title)))),
              const SizedBox(height: 4),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [Text('NO. ${(seedOf(c.title) * 7919 % 99999).toString().padLeft(5, '0')}', style: a.cap(color: a.fg)), Text('ZENIFY.APP', style: a.cap(color: a.fg))],
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
