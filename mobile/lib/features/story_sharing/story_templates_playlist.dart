import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'story_models.dart';
import 'story_template_kit.dart';
import 'story_widgets.dart';

// ═════════════════════════════════════════════════════════════════════════════
// PLAYLIST LAYOUTS (9) — combined with skins/ratios into 15 designs
// ═════════════════════════════════════════════════════════════════════════════

Widget buildPlaylist(PlaylistStoryContent c, StoryTemplateArgs a) {
  switch (a.template.layout as PlaylistLayout) {
    case PlaylistLayout.collage:
      return _collage(c, a);
    case PlaylistLayout.poster:
      return _poster(c, a);
    case PlaylistLayout.editorial:
      return _editorial(c, a);
    case PlaylistLayout.mosaic:
      return _mosaic(c, a);
    case PlaylistLayout.fan:
      return _fan(c, a);
    case PlaylistLayout.list:
      return _list(c, a);
    case PlaylistLayout.orbit:
      return _orbit(c, a);
    case PlaylistLayout.film:
      return _film(c, a);
    case PlaylistLayout.mixtape:
      return _mixtape(c, a);
  }
}

Widget _titles(PlaylistStoryContent c, StoryTemplateArgs a, {TextAlign align = TextAlign.center, double size = 24}) => Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: align == TextAlign.center ? CrossAxisAlignment.center : CrossAxisAlignment.start,
      children: [
        txt(c.playlistTitle, a.display(size), align: align, lines: 2),
        const SizedBox(height: 3),
        txt(c.owner, a.text(size * 0.62), align: align),
      ],
    );

Widget _grid(StoryTemplateArgs a, List<String> covers, int n, double size, {double gap = 4, double radius = 10}) {
  final cell = (size - gap * (n - 1)) / n;
  return SizedBox(
    width: size,
    height: size,
    child: Column(
      children: [
        for (int r = 0; r < n; r++) ...[
          if (r > 0) SizedBox(height: gap),
          Row(
            children: [
              for (int k = 0; k < n; k++) ...[
                if (k > 0) SizedBox(width: gap),
                StoryArtwork(url: covers[r * n + k], size: cell, radius: radius * 0.4, shadow: false, hairline: false, palette: a.palette),
              ],
            ],
          ),
        ],
      ],
    ),
  );
}

Widget _collage(PlaylistStoryContent c, StoryTemplateArgs a) {
  final covers = playlistCovers(c, 4);
  final w = math.min(a.w * 0.76, a.h * 0.6);
  final pad = w * 0.06;
  return stage(
    a,
    c.coverUrl,
    Center(
      child: a.motion(
        surface(
          a,
          radius: 26,
          width: w,
          padding: EdgeInsets.all(pad),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _grid(a, covers, 2, w - pad * 2, gap: 6),
              SizedBox(height: w * 0.05),
              txt(c.playlistTitle, a.display(w * 0.075), lines: 2),
              const SizedBox(height: 2),
              txt(c.owner, a.text(w * 0.056)),
              SizedBox(height: w * 0.04),
              brand(a, size: w * 0.055),
            ],
          ),
        ),
      ),
    ),
  );
}

Widget _poster(PlaylistStoryContent c, StoryTemplateArgs a) {
  final names = c.tracks.map((t) => t.title).take(a.isStory ? 5 : 4).toList();
  final covers = playlistCovers(c, 3);
  final s = math.min(a.w * 0.34, a.h * 0.18);
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('PLAYLIST', style: a.cap(color: a.fg)), brand(a, size: 16)]),
          const SizedBox(height: 18),
          a.motion(
            SizedBox(
              height: s,
              child: Stack(
                clipBehavior: Clip.none,
                children: [for (int i = 0; i < 3; i++) Positioned(left: i * s * 0.62, child: artw(a, covers[i], s, radius: 12))],
              ),
            ),
          ),
          const Spacer(),
          txt(c.playlistTitle, a.display(a.isStory ? 44 : 34, height: 0.98), lines: 3),
          const SizedBox(height: 6),
          txt(c.owner, a.text(15, color: a.fg)),
          if (names.isNotEmpty) ...[
            const SizedBox(height: 14),
            for (int i = 0; i < names.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(children: [SizedBox(width: 24, child: Text('${i + 1}', style: a.text(13, color: a.fg3, weight: FontWeight.w700))), Expanded(child: txt(names[i], a.text(14, color: a.fg, weight: FontWeight.w600)))]),
              ),
          ],
        ],
      ),
    ),
  );
}

Widget _editorial(PlaylistStoryContent c, StoryTemplateArgs a) {
  final covers = playlistCovers(c, 2);
  final big = math.min(a.w * 0.62, a.h * 0.40);
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('PLAYLIST', style: a.cap(color: a.fg)), brand(a, size: 16)]),
          const SizedBox(height: 10),
          Container(height: 1.2, color: a.fg),
          const SizedBox(height: 16),
          SizedBox(
            height: big * 1.1,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(left: 0, top: 0, child: a.motion(artw(a, covers[0], big, radius: 4))),
                Positioned(right: 0, bottom: 0, child: artw(a, covers[1], big * 0.46, radius: 4)),
              ],
            ),
          ),
          const Spacer(),
          Text(c.playlistTitle, maxLines: 3, overflow: TextOverflow.ellipsis, style: a.display(a.isStory ? 42 : 34, height: 0.98)),
          const SizedBox(height: 8),
          txt(c.owner, a.text(14, color: a.fg)),
        ],
      ),
    ),
  );
}

Widget _mosaic(PlaylistStoryContent c, StoryTemplateArgs a) {
  final covers = playlistCovers(c, 9);
  final side = math.max(a.w, a.h);
  return Stack(
    fit: StackFit.expand,
    children: [
      a.bg(c.coverUrl),
      ClipRect(
        child: OverflowBox(
          maxWidth: side,
          maxHeight: side,
          child: Opacity(opacity: 0.92, child: _grid(a, covers, 3, side, gap: 3)),
        ),
      ),
      Positioned.fill(child: ColoredBox(color: Colors.black.withValues(alpha: 0.18))),
      Center(
        child: a.motion(
          surface(
            a,
            radius: 26,
            width: a.w * 0.76,
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _titles(c, a, size: 24),
                const SizedBox(height: 12),
                brand(a, size: 16),
              ],
            ),
          ),
        ),
      ),
    ],
  );
}

Widget _fan(PlaylistStoryContent c, StoryTemplateArgs a) {
  final covers = playlistCovers(c, 5);
  final s = math.min(a.w * 0.44, a.h * 0.26);
  final angles = [-0.36, -0.18, 0.0, 0.18, 0.36];
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
              height: s * 1.35,
              width: a.w - a.pad * 2,
              child: Stack(
                alignment: Alignment.bottomCenter,
                clipBehavior: Clip.none,
                children: [
                  for (int i = 0; i < 5; i++)
                    Transform.translate(
                      offset: Offset((i - 2) * s * 0.50, 0),
                      child: Transform.rotate(angle: angles[i], alignment: Alignment.bottomCenter, child: artw(a, covers[i], s, radius: 10)),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 26),
          _titles(c, a, size: a.isStory ? 26 : 22),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _list(PlaylistStoryContent c, StoryTemplateArgs a) {
  final rows = a.isStory ? 6 : 4;
  final tracks = c.tracks.take(rows).toList();
  final covers = playlistCovers(c, rows);
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              a.motion(artw(a, c.coverUrl, 62, radius: 12)),
              const SizedBox(width: 12),
              Expanded(child: _titles(c, a, align: TextAlign.start, size: 20)),
              brand(a, size: 16),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: surface(
              a,
              radius: 24,
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
              child: Column(
                children: [
                  for (int i = 0; i < math.max(tracks.length, 1); i++)
                    Expanded(
                      child: Row(
                        children: [
                          artw(a, tracks.isNotEmpty ? tracks[i].coverUrl : covers[i], 38, radius: 8),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                txt(tracks.isNotEmpty ? tracks[i].title : c.playlistTitle, a.text(14.5, color: a.fg, weight: FontWeight.w700)),
                                if (tracks.isNotEmpty) txt(tracks[i].displayArtists, a.text(12.5)),
                              ],
                            ),
                          ),
                        ],
                      ),
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

Widget _orbit(PlaylistStoryContent c, StoryTemplateArgs a) {
  final covers = playlistCovers(c, 5);
  final d = math.min(a.w - a.pad * 2, a.h * 0.55);
  final big = d * 0.46;
  final sm = d * 0.24;
  final spots = [const Offset(0.02, 0.06), const Offset(0.74, 0.02), const Offset(0.78, 0.70), const Offset(0.04, 0.72)];
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        children: [
          brand(a, size: 16),
          const Spacer(),
          SizedBox(
            width: d,
            height: d,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CustomPaint(size: Size.square(d), painter: RingsPainter(a.accent, from: 0.62, count: 3)),
                a.motion(artw(a, covers[0], big, circle: true)),
                for (int i = 0; i < 4; i++)
                  Positioned(
                    left: spots[i].dx * d,
                    top: spots[i].dy * d,
                    child: a.motion(artw(a, covers[i + 1], sm, circle: true), kind: MotionKind.float, phase: i * 0.25, amp: 6),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          _titles(c, a, size: a.isStory ? 26 : 22),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _film(PlaylistStoryContent c, StoryTemplateArgs a) {
  final covers = playlistCovers(c, 12);
  final cell = a.h * (a.isWide ? 0.30 : 0.15);
  final rows = a.isWide ? 3 : 4;
  Widget strip(int r) => Transform.translate(
        offset: Offset(r.isEven ? -cell * 0.3 : cell * 0.2, 0),
        child: OverflowBox(
          maxWidth: a.w * 2,
          alignment: Alignment.centerLeft,
          child: Row(children: [for (int i = 0; i < 6; i++) Padding(padding: const EdgeInsets.only(right: 6), child: artw(a, covers[(r * 3 + i) % 12], cell, radius: 4))]),
        ),
      );
  return stage(
    a,
    c.coverUrl,
    Stack(
      fit: StackFit.expand,
      children: [
        Center(child: Column(mainAxisSize: MainAxisSize.min, children: [for (int r = 0; r < rows; r++) Padding(padding: const EdgeInsets.only(bottom: 8), child: SizedBox(height: cell, child: strip(r)))])),
        Center(
          child: a.motion(
            surface(
              a,
              radius: 24,
              width: a.w * 0.70,
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
              child: Column(mainAxisSize: MainAxisSize.min, children: [_titles(c, a, size: 21), const SizedBox(height: 10), brand(a, size: 15)]),
            ),
          ),
        ),
      ],
    ),
  );
}

Widget _mixtape(PlaylistStoryContent c, StoryTemplateArgs a) {
  final w = math.min(a.w - a.pad * 2, (a.h - 70) / 0.64);
  return stage(
    a,
    c.coverUrl,
    Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          a.motion(cassette(a, width: w, title: c.playlistTitle, subtitle: c.owner)),
          const SizedBox(height: 16),
          Text('MIXTAPE  ·  ${c.tracks.isEmpty ? 'PLAYLIST' : '${c.tracks.length} TRACKS'}', style: a.cap()),
        ],
      ),
    ),
  );
}
