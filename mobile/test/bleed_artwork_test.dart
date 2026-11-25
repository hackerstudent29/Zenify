import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/views/player/bleed_artwork.dart';

Future<ui.Image> _makeTestImage(
  int w,
  int h,
  Color Function(int x, int y) pixelAt,
) async {
  final rec = ui.PictureRecorder();
  final canvas = Canvas(
    rec,
    Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble()),
  );
  // Draw horizontal bands efficiently if rows share color, else draw per-row
  for (var y = 0; y < h; y++) {
    canvas.drawRect(
      Rect.fromLTWH(0, y.toDouble(), w.toDouble(), 1),
      Paint()..color = pixelAt(w ~/ 2, y),
    );
  }
  final pic = rec.endRecording();
  final img = await pic.toImage(w, h);
  pic.dispose();
  return img;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('buildCandidateUrls provides ytimg, googleusercontent, and saavncdn fallbacks without duplicates', () {
    final yt = BleedArtworkService.buildCandidateUrls(
      'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
      fallback: 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
    );
    expect(yt, [
      'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
      'https://i.ytimg.com/vi/abc123/sddefault.jpg',
      'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
    ]);

    final lh3 = BleedArtworkService.buildCandidateUrls(
      'https://lh3.googleusercontent.com/xyz=w800-h800-l75-rj',
    );
    expect(lh3, [
      'https://lh3.googleusercontent.com/xyz=w800-h800-l75-rj',
      'https://lh3.googleusercontent.com/xyz=w400-h400-l75-rj',
    ]);

    final saavn = BleedArtworkService.buildCandidateUrls(
      'https://c.saavncdn.com/123/art-500x500.jpg',
    );
    expect(saavn, [
      'https://c.saavncdn.com/123/art-500x500.jpg',
      'https://c.saavncdn.com/123/art-250x250.jpg',
      'https://c.saavncdn.com/123/art-150x150.jpg',
    ]);
  });

  test('providerForUrl handles http, file://, local path, and empty urls cleanly', () {
    expect(BleedArtworkService.providerForUrl(''), isNull);
    expect(
      BleedArtworkService.providerForUrl('https://example.com/a.jpg'),
      isA<ImageProvider>(),
    );
    expect(
      BleedArtworkService.providerForUrl('file:///tmp/cover.jpg'),
      isA<FileImage>(),
    );
  });

  test('computeContentSquare trims 4:3 letterbox black bars before square crop', () async {
    // 160x120 (4:3) with 15px black bars top and bottom -> 90px bright center
    final letterboxed = await _makeTestImage(160, 120, (_, y) {
      if (y < 15 || y >= 105) return const Color(0xFF000000);
      return const Color(0xFFE11D48);
    });
    final rect = await BleedArtworkService.computeContentSquare(letterboxed);
    letterboxed.dispose();

    expect(rect.top, equals(15.0));
    expect(rect.height, equals(90.0));
    expect(rect.width, equals(90.0));
    expect(rect.left, equals(35.0));

    // Square 120x120 artwork stays uncropped even with dark top/bottom
    final squareDark = await _makeTestImage(120, 120, (_, y) {
      if (y < 15 || y >= 105) return const Color(0xFF000000);
      return const Color(0xFFE11D48);
    });
    final sqRect = await BleedArtworkService.computeContentSquare(squareDark);
    squareDark.dispose();
    expect(sqRect, equals(const Rect.fromLTWH(0, 0, 120, 120)));
  });
}
