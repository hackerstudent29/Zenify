import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'story_models.dart';
import 'story_template_kit.dart';
import 'story_widgets.dart';

// ═════════════════════════════════════════════════════════════════════════════
// ARTIST LAYOUTS (9) — combined with skins/ratios into 15 designs
// ═════════════════════════════════════════════════════════════════════════════

Widget buildArtist(ArtistStoryContent c, StoryTemplateArgs a) {
  switch (a.template.layout as ArtistLayout) {
    case ArtistLayout.profile:
      return _profile(c, a);
    case ArtistLayout.editorial:
      return _editorial(c, a);
    case ArtistLayout.fan:
      return _fan(c, a);
    case ArtistLayout.spotlight:
      return _spotlight(c, a);
    case ArtistLayout.ripple:
      return _ripple(c, a);
    case ArtistLayout.pass:
      return _pass(c, a);
    case ArtistLayout.split:
      return _split(c, a);
    case ArtistLayout.topSongs:
      return _topSongs(c, a);
    case ArtistLayout.poster:
      return _poster(c, a);
  }
}

Widget _names(ArtistStoryContent c, StoryTemplateArgs a, {double size = 28}) => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        txt(c.artistName, a.display(size), align: TextAlign.center, lines: 2),
        const SizedBox(height: 4),
        txt(c.subtitle, a.text(size * 0.55), align: TextAlign.center),
      ],
    );

Widget _songRows(ArtistStoryContent c, StoryTemplateArgs a, {int max = 3, double art = 34}) {
  final tracks = c.topTracks.take(max).toList();
  return Column(
    mainAxisSize: MainAxisSize.min,
    children: [
      for (int i = 0; i < tracks.length; i++)
        Padding(
          padding: EdgeInsets.only(bottom: i == tracks.length - 1 ? 0 : 8),
          child: Row(
            children: [
              SizedBox(width: 20, child: Text('${i + 1}', style: a.text(13, color: a.fg3, weight: FontWeight.w700))),
              artw(a, tracks[i].coverUrl, art, radius: 7),
              const SizedBox(width: 10),
              Expanded(child: txt(tracks[i].title, a.text(14, color: a.fg, weight: FontWeight.w600))),
            ],
          ),
        ),
    ],
  );
}

Widget _profile(ArtistStoryContent c, StoryTemplateArgs a) {
  final ring = math.min(a.w - a.pad * 2, a.h * 0.40);
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
              child: Stack(alignment: Alignment.center, children: [
                CustomPaint(size: Size.square(ring), painter: RingsPainter(a.accent, from: 0.72, count: 4)),
                artw(a, c.coverUrl, ring * 0.70, circle: true),
              ]),
            ),
          ),
          const SizedBox(height: 14),
          _names(c, a, size: a.isStory ? 30 : 25),
          if (c.topTracks.isNotEmpty) ...[
            const SizedBox(height: 16),
            surface(a, radius: 22, width: a.w - a.pad * 2, padding: const EdgeInsets.all(14), child: _songRows(c, a, max: a.isStory ? 3 : 2)),
          ],
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _editorial(ArtistStoryContent c, StoryTemplateArgs a) {
  final len = c.artistName.length;
  final base = a.isStory ? 58.0 : 46.0;
  final size = len < 12 ? base : (len < 22 ? base * 0.76 : base * 0.58);
  return Stack(
    fit: StackFit.expand,
    children: [
      fullBleed(a, c.coverUrl),
      scrim(Alignment.topCenter, Alignment.bottomCenter, top: 0.12, bottom: 0.84),
      Padding(
        padding: safePad(a),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('ARTIST', style: ZenType.caption(Colors.white)), brand(a, size: 17)]),
            const Spacer(),
            a.motion(Text(c.artistName, maxLines: 3, overflow: TextOverflow.ellipsis, style: ZenType.display(size, Colors.white, weight: FontWeight.w900, height: 0.96)), amp: 4),
            const SizedBox(height: 8),
            Container(height: 1.2, color: Colors.white.withValues(alpha: 0.7)),
            const SizedBox(height: 8),
            txt(c.subtitle, ZenType.text(15, Colors.white.withValues(alpha: 0.85), weight: FontWeight.w600)),
          ],
        ),
      ),
    ],
  );
}

Widget _fan(ArtistStoryContent c, StoryTemplateArgs a) {
  final covers = artistCovers(c, 5);
  final s = math.min(a.w * 0.34, a.h * 0.2);
  final angles = [-0.34, -0.17, 0.0, 0.17, 0.34];
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        children: [
          brand(a, size: 16),
          const SizedBox(height: 10),
          artw(a, c.coverUrl, math.min(a.w * 0.36, a.h * 0.2), circle: true),
          const SizedBox(height: 12),
          _names(c, a, size: a.isStory ? 28 : 23),
          const Spacer(),
          a.motion(
            SizedBox(
              height: s * 1.5,
              width: a.w - a.pad * 2,
              child: Stack(
                alignment: Alignment.bottomCenter,
                clipBehavior: Clip.none,
                children: [
                  for (int i = 0; i < 5; i++)
                    Transform.translate(
                      offset: Offset((i - 2) * s * 0.52, 0),
                      child: Transform.rotate(angle: angles[i], alignment: Alignment.bottomCenter, child: artw(a, covers[i], s, radius: 8)),
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

Widget _spotlight(ArtistStoryContent c, StoryTemplateArgs a) {
  final art = math.min(a.w * 0.62, a.h * 0.36);
  return stage(
    a,
    c.coverUrl,
    Stack(
      fit: StackFit.expand,
      children: [
        Positioned.fill(child: CustomPaint(painter: SpotlightPainter(a.skin == StorySkin.neon ? a.accent : Colors.white))),
        Padding(
          padding: safePad(a),
          child: Column(
            children: [
              brand(a, size: 16),
              const Spacer(),
              a.motion(artw(a, c.coverUrl, art, radius: 22)),
              const SizedBox(height: 20),
              _names(c, a, size: a.isStory ? 30 : 25),
              const Spacer(),
            ],
          ),
        ),
      ],
    ),
  );
}

Widget _ripple(ArtistStoryContent c, StoryTemplateArgs a) {
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
              child: Stack(alignment: Alignment.center, children: [
                CustomPaint(size: Size.square(ring), painter: RingsPainter(a.accent, from: 0.38, count: 7, width: 1.4)),
                artw(a, c.coverUrl, ring * 0.40, circle: true),
              ]),
            ),
            kind: MotionKind.pulse,
          ),
          const SizedBox(height: 14),
          _names(c, a, size: a.isStory ? 30 : 24),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _pass(ArtistStoryContent c, StoryTemplateArgs a) {
  final w = a.w * 0.76;
  return stage(
    a,
    c.coverUrl,
    Center(
      child: a.motion(
        surface(
          a,
          radius: 26,
          width: w,
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 54, height: 8, decoration: BoxDecoration(color: a.fg.withValues(alpha: 0.28), borderRadius: BorderRadius.circular(4))),
              const SizedBox(height: 12),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('ACCESS PASS', style: a.cap(color: a.fg)), brand(a, size: 14)]),
              const SizedBox(height: 12),
              artw(a, c.coverUrl, math.min(w - 36, a.h * 0.30), radius: 18),
              const SizedBox(height: 12),
              txt(c.artistName, a.display(24), align: TextAlign.center, lines: 2),
              txt(c.subtitle, a.text(14), align: TextAlign.center),
              const SizedBox(height: 12),
              SizedBox(height: 30, width: double.infinity, child: CustomPaint(painter: BarcodePainter(a.fg, seedOf(c.artistName)))),
            ],
          ),
        ),
      ),
    ),
  );
}

Widget _split(ArtistStoryContent c, StoryTemplateArgs a) {
  final len = c.artistName.length;
  final size = len < 12 ? 54.0 : (len < 22 ? 40.0 : 30.0);
  final top = a.h * 0.64;
  final parts = c.artistName.split(' ');
  final first = parts.first;
  final rest = parts.length > 1 ? parts.sublist(1).join(' ') : '';
  return stage(
    a,
    c.coverUrl,
    Stack(
      fit: StackFit.expand,
      children: [
        Positioned(
          left: 0,
          right: 0,
          top: 0,
          height: top,
          child: ShaderMask(
            shaderCallback: (r) => const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.white, Colors.transparent], stops: [0.6, 1.0]).createShader(r),
            blendMode: BlendMode.dstIn,
            child: fullBleed(a, c.coverUrl, height: top),
          ),
        ),
        Padding(
          padding: safePad(a),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Align(alignment: Alignment.centerRight, child: brand(a, size: 17)),
              const Spacer(),
              a.motion(
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(first, maxLines: 1, overflow: TextOverflow.ellipsis, style: outlineStyle(a.display(size, weight: FontWeight.w900, height: 0.98), a.fg, width: 1.6)),
                    if (rest.isNotEmpty) Text(rest, maxLines: 1, overflow: TextOverflow.ellipsis, style: a.display(size, weight: FontWeight.w900, height: 0.98)),
                  ],
                ),
                amp: 4,
              ),
              const SizedBox(height: 10),
              txt(c.subtitle, a.text(15, color: a.fg)),
            ],
          ),
        ),
      ],
    ),
  );
}

Widget _topSongs(ArtistStoryContent c, StoryTemplateArgs a) {
  final rows = a.isStory ? 6 : 4;
  final tracks = c.topTracks.take(rows).toList();
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
              a.motion(artw(a, c.coverUrl, 58, circle: true)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [txt(c.artistName, a.display(22), lines: 2), txt('Top songs', a.text(14))])),
              brand(a, size: 16),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: surface(
              a,
              radius: 24,
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
              child: tracks.isEmpty
                  ? Center(child: txt(c.artistName, a.display(20)))
                  : Column(
                      children: [
                        for (int i = 0; i < tracks.length; i++)
                          Expanded(
                            child: Row(
                              children: [
                                SizedBox(width: 22, child: Text('${i + 1}', style: a.text(14, color: a.fg3, weight: FontWeight.w700))),
                                artw(a, tracks[i].coverUrl, 38, radius: 8),
                                const SizedBox(width: 12),
                                Expanded(child: txt(tracks[i].title, a.text(15, color: a.fg, weight: FontWeight.w600))),
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

Widget _poster(ArtistStoryContent c, StoryTemplateArgs a) {
  return Stack(
    fit: StackFit.expand,
    children: [
      fullBleed(a, c.coverUrl),
      scrim(Alignment.topCenter, Alignment.bottomCenter, top: 0.10, bottom: 0.78),
      Padding(
        padding: safePad(a),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Align(alignment: Alignment.centerLeft, child: brand(a, size: 16)),
            const Spacer(),
            a.motion(
              surface(
                a,
                radius: 24,
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [Text('ARTIST', style: a.cap()), const SizedBox(height: 4), txt(c.artistName, a.display(26), lines: 2), txt(c.subtitle, a.text(14))],
                ),
              ),
            ),
          ],
        ),
      ),
    ],
  );
}
