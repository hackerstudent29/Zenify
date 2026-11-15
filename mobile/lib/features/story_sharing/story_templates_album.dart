import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'story_models.dart';
import 'story_template_kit.dart';
import 'story_widgets.dart';

// ═════════════════════════════════════════════════════════════════════════════
// ALBUM LAYOUTS (10) — combined with skins/ratios into 20 designs
// ═════════════════════════════════════════════════════════════════════════════

Widget buildAlbum(AlbumStoryContent c, StoryTemplateArgs a) {
  switch (a.template.layout as AlbumLayout) {
    case AlbumLayout.sleeve:
      return _sleeve(c, a);
    case AlbumLayout.stacked:
      return _stacked(c, a);
    case AlbumLayout.disc:
      return _disc(c, a);
    case AlbumLayout.tilt:
      return _tilt(c, a);
    case AlbumLayout.tracklist:
      return _tracklist(c, a);
    case AlbumLayout.minimal:
      return _minimal(c, a);
    case AlbumLayout.editorial:
      return _editorial(c, a);
    case AlbumLayout.cd:
      return _cd(c, a);
    case AlbumLayout.crate:
      return _crate(c, a);
    case AlbumLayout.poster:
      return _poster(c, a);
  }
}

Widget _titles(AlbumStoryContent c, StoryTemplateArgs a, {TextAlign align = TextAlign.center, double size = 24}) {
  final meta = albumMeta(c);
  final cross = align == TextAlign.center ? CrossAxisAlignment.center : CrossAxisAlignment.start;
  return Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: cross,
    children: [
      txt(c.albumTitle, a.display(size), align: align, lines: 2),
      const SizedBox(height: 3),
      txt(c.artistName, a.text(size * 0.64), align: align),
      if (meta.isNotEmpty) ...[
        const SizedBox(height: 4),
        Text(meta.toUpperCase(), style: a.cap(color: a.fg3)),
      ],
    ],
  );
}

Widget _sleeve(AlbumStoryContent c, StoryTemplateArgs a) {
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
                  Positioned(left: 0, top: 0, child: artw(a, c.coverUrl, art, radius: 6)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),
          _titles(c, a, size: a.isStory ? 24 : 21),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _stacked(AlbumStoryContent c, StoryTemplateArgs a) {
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
              width: s * 1.25,
              height: s * 1.3,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned(left: s * 0.12, top: 0, child: Opacity(opacity: 0.5, child: artw(a, c.coverUrl, s * 0.86, radius: 14))),
                  Positioned(left: s * 0.06, top: s * 0.12, child: Opacity(opacity: 0.75, child: artw(a, c.coverUrl, s * 0.93, radius: 14))),
                  Positioned(left: 0, top: s * 0.24, child: artw(a, c.coverUrl, s, radius: 14)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),
          _titles(c, a, size: a.isStory ? 25 : 21),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _disc(AlbumStoryContent c, StoryTemplateArgs a) {
  final d = math.min(a.w - a.pad * 2, a.h * 0.46);
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
              width: d,
              height: d,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Spin(seconds: 22, child: artw(a, c.coverUrl, d, circle: true)),
                  IgnorePointer(
                    child: Container(
                      width: d,
                      height: d,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: SweepGradient(colors: [
                          Colors.white.withValues(alpha: 0.0),
                          const Color(0xFF7AE7FF).withValues(alpha: 0.28),
                          Colors.white.withValues(alpha: 0.0),
                          const Color(0xFFFF8AD8).withValues(alpha: 0.28),
                          Colors.white.withValues(alpha: 0.0),
                        ]),
                      ),
                    ),
                  ),
                  Container(
                    width: d * 0.16,
                    height: d * 0.16,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: a.palette.background, border: Border.all(color: Colors.white.withValues(alpha: 0.55), width: 2)),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),
          _titles(c, a, size: a.isStory ? 24 : 20),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _tilt(AlbumStoryContent c, StoryTemplateArgs a) {
  final s = math.min(a.w * 0.62, a.h * 0.32);
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
            Transform(
              alignment: Alignment.center,
              transform: Matrix4.identity()
                ..setEntry(3, 2, 0.0014)
                ..rotateY(-0.42)
                ..rotateX(0.06),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  artw(a, c.coverUrl, s, radius: 12),
                  const SizedBox(height: 6),
                  SizedBox(
                    height: s * 0.34,
                    width: s,
                    child: ShaderMask(
                      shaderCallback: (r) => LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Colors.white.withValues(alpha: 0.35), Colors.transparent]).createShader(r),
                      blendMode: BlendMode.dstIn,
                      child: ClipRect(
                        child: Align(
                          alignment: Alignment.topCenter,
                          heightFactor: 0.34,
                          child: Transform.scale(scaleY: -1, child: artw(a, c.coverUrl, s, radius: 12)),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),
          _titles(c, a, size: a.isStory ? 24 : 20),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _tracklist(AlbumStoryContent c, StoryTemplateArgs a) {
  final names = c.tracks.isNotEmpty ? c.tracks.map((t) => t.title).toList() : [c.albumTitle];
  final max = a.isStory ? 7 : 5;
  final shown = names.take(max).toList();
  final art = math.min(a.w * 0.40, a.h * 0.22);
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
              a.motion(artw(a, c.coverUrl, art, radius: 12)),
              const SizedBox(width: 14),
              Expanded(child: _titles(c, a, align: TextAlign.start, size: 20)),
            ],
          ),
          const SizedBox(height: 16),
          Expanded(
            child: surface(
              a,
              radius: 24,
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
              child: Column(
                children: [
                  for (int i = 0; i < shown.length; i++)
                    Expanded(
                      child: Row(
                        children: [
                          SizedBox(width: 26, child: Text('${i + 1}', style: a.text(13, color: a.fg3, weight: FontWeight.w700))),
                          Expanded(child: txt(shown[i], a.text(15, color: a.fg, weight: FontWeight.w600))),
                        ],
                      ),
                    ),
                  if (names.length > shown.length) Text('+ ${names.length - shown.length} more', style: a.text(12, color: a.fg3)),
                  const SizedBox(height: 8),
                  Align(alignment: Alignment.centerRight, child: brand(a, size: 15)),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

Widget _minimal(AlbumStoryContent c, StoryTemplateArgs a) {
  final art = math.min(a.w * 0.40, a.h * 0.40);
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        children: [
          const Spacer(),
          a.motion(artw(a, c.coverUrl, art, radius: 12)),
          const SizedBox(height: 20),
          _titles(c, a, size: 18),
          const Spacer(),
          brand(a, size: 15),
        ],
      ),
    ),
  );
}

Widget _editorial(AlbumStoryContent c, StoryTemplateArgs a) {
  final art = math.min(a.w * 0.58, a.h * 0.38);
  final meta = albumMeta(c);
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: safePad(a),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('ALBUM', style: a.cap(color: a.fg)), brand(a, size: 16)]),
          const SizedBox(height: 10),
          Container(height: a.skin == StorySkin.brutal ? 3 : 1.2, color: a.fg),
          const Spacer(),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              RotatedBox(quarterTurns: 3, child: Text(c.artistName.toUpperCase(), maxLines: 1, style: a.cap(color: a.fg, size: 12))),
              const SizedBox(width: 12),
              a.motion(artw(a, c.coverUrl, art, radius: 6)),
            ],
          ),
          const SizedBox(height: 16),
          Text(c.albumTitle, maxLines: 3, overflow: TextOverflow.ellipsis, style: a.display(a.isStory ? 44 : 36, height: 0.98)),
          const SizedBox(height: 8),
          txt(meta.isEmpty ? c.artistName : '${c.artistName}  ·  $meta', a.text(14, color: a.fg)),
        ],
      ),
    ),
  );
}

Widget _cd(AlbumStoryContent c, StoryTemplateArgs a) {
  final s = math.min(a.w * 0.66, a.h * 0.44);
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
              width: s,
              height: s,
              child: Stack(
                children: [
                  Positioned.fill(left: s * 0.07, child: ClipRRect(borderRadius: BorderRadius.circular(3), child: artw(a, c.coverUrl, s * 0.93))),
                  Positioned(
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: s * 0.09,
                    child: Container(
                      decoration: BoxDecoration(color: a.fg.withValues(alpha: 0.88), borderRadius: const BorderRadius.horizontal(left: Radius.circular(4))),
                      child: RotatedBox(quarterTurns: 3, child: Center(child: Text(c.albumTitle.toUpperCase(), maxLines: 1, overflow: TextOverflow.clip, style: ZenType.caption(a.isLight || a.skin == StorySkin.retro ? Colors.white : Colors.black, size: 8)))),
                    ),
                  ),
                  Positioned.fill(
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(3),
                          gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Colors.white.withValues(alpha: 0.30), Colors.transparent, Colors.white.withValues(alpha: 0.06)], stops: const [0, 0.5, 1]),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),
          _titles(c, a, size: a.isStory ? 23 : 20),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _crate(AlbumStoryContent c, StoryTemplateArgs a) {
  final covers = albumCovers(c, 5);
  final s = math.min(a.h * 0.46, a.w * 0.34);
  final step = s * 0.46;
  final total = s + step * 4;
  return stage(
    a,
    c.coverUrl,
    Padding(
      padding: EdgeInsets.fromLTRB(a.pad, a.safeTop, a.pad, a.safeBottom),
      child: Column(
        children: [
          Align(alignment: Alignment.centerRight, child: brand(a, size: 15)),
          const Spacer(),
          SizedBox(
            width: math.min(total, a.w - a.pad * 2),
            height: s * 1.18,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                for (int i = 0; i < 5; i++)
                  Positioned(
                    left: i * step * (math.min(total, a.w - a.pad * 2) / total),
                    bottom: i == 4 ? 0 : 0,
                    child: i == 4
                        ? a.motion(artw(a, c.coverUrl, s, radius: 8))
                        : Transform.translate(offset: Offset(0, -s * 0.10), child: artw(a, covers[i], s, radius: 8)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _titles(c, a, size: 18),
          const Spacer(),
        ],
      ),
    ),
  );
}

Widget _poster(AlbumStoryContent c, StoryTemplateArgs a) {
  final meta = albumMeta(c);
  return Stack(
    fit: StackFit.expand,
    children: [
      fullBleed(a, c.coverUrl),
      scrim(Alignment.topCenter, Alignment.bottomCenter, top: 0.10, bottom: 0.82),
      Padding(
        padding: safePad(a),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Align(alignment: Alignment.centerRight, child: brand(a, size: 17)),
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
                    Text('ALBUM${meta.isEmpty ? '' : '  ·  ${meta.toUpperCase()}'}', style: a.cap()),
                    const SizedBox(height: 6),
                    txt(c.albumTitle, a.display(a.isStory ? 32 : 26), lines: 2),
                    const SizedBox(height: 3),
                    txt(c.artistName, a.text(16)),
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
