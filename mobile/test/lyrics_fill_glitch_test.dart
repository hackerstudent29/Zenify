import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const double kKaraokeGlyphScalePeak = 1.04;

class ClusterMetric {
  const ClusterMetric({
    required this.cluster,
    required this.stringStart,
    required this.stringEnd,
    required this.left,
    required this.right,
    required this.cx,
  });

  final String cluster;
  final int stringStart;
  final int stringEnd;
  final double left;
  final double right;
  final double cx;

  double get width => math.max(0.0, right - left);
}

List<ClusterMetric> computeClusterMetrics(String text, TextStyle style) {
  final clusters = text.characters.toList();
  if (clusters.isEmpty) return const [];

  final tp = TextPainter(
    text: TextSpan(text: text, style: style),
    textDirection: TextDirection.ltr,
  )..layout();

  final metrics = <ClusterMetric>[];
  var offset = 0;
  var currentLeft = 0.0;

  for (var i = 0; i < clusters.length; i++) {
    final cl = clusters[i];
    final start = offset;
    final end = offset + cl.length;
    offset = end;

    final boxes = tp.getBoxesForSelection(
      TextSelection(baseOffset: start, extentOffset: end),
    );

    double left, right;
    if (boxes.isNotEmpty) {
      left = boxes.first.left;
      right = boxes.last.right;
      if (right < left) {
        final tmp = left;
        left = right;
        right = tmp;
      }
    } else {
      left = currentLeft;
      right = currentLeft + (tp.width / clusters.length);
    }
    currentLeft = right;

    metrics.add(ClusterMetric(
      cluster: cl,
      stringStart: start,
      stringEnd: end,
      left: left,
      right: right,
      cx: (left + right) / 2.0,
    ));
  }

  tp.dispose();
  return metrics;
}

double computeClusterProgress(double wordProgress, ClusterMetric metric, double totalWidth) {
  if (totalWidth <= 0 || wordProgress <= 0.0) return 0.0;
  if (wordProgress >= 1.0) return 1.0;

  final fillX = (wordProgress * totalWidth);
  if (fillX <= metric.left) return 0.0;
  if (fillX >= metric.right) return 1.0;
  if (metric.width <= 0.0) return 1.0;

  return ((fillX - metric.left) / metric.width).clamp(0.0, 1.0);
}

double computeClusterScale(double clusterProgress) {
  if (clusterProgress <= 0.0 || clusterProgress >= 1.0) return 1.0;
  return 1.0 + (kKaraokeGlyphScalePeak - 1.0) * math.sin(math.pi * clusterProgress);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('Grapheme cluster splitting and shaped bounds measurement', () {
    const samples = [
      'hello',
      '(ooh)',
      '(90)',
      '[chorus]',
      'தமிழ்',
      'नमस्ते',
      'తెలుగు',
    ];

    const style = TextStyle(fontSize: 28);

    for (final text in samples) {
      final metrics = computeClusterMetrics(text, style);
      expect(metrics.isNotEmpty, isTrue, reason: 'Metrics for "$text" must not be empty');
      expect(metrics.length, equals(text.characters.length));

      for (final m in metrics) {
        expect(m.cluster.isNotEmpty, isTrue);
        expect(m.right >= m.left, isTrue);
        expect(m.cx >= m.left && m.cx <= m.right, isTrue);
      }
    }
  });

  test('Cluster progress clamping and zero overshoot / bleed verification', () {
    const testCases = ['hello', '(ooh)', '(90)', '[chorus]', 'தமிழ்', 'नमस्ते', 'తెలుగు'];
    const style = TextStyle(fontSize: 28);

    for (final text in testCases) {
      final metrics = computeClusterMetrics(text, style);
      final totalWidth = metrics.isEmpty ? 0.0 : metrics.last.right;

      // Test multiple playback positions: 0.0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.95, 1.0
      for (final p in [0.0, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.95, 0.99, 1.0]) {
        final currentFillX = p * totalWidth;

        for (var i = 0; i < metrics.length; i++) {
          final m = metrics[i];
          final cp = computeClusterProgress(p, m, totalWidth);

          // Must strictly clamp to [0, 1]
          expect(cp >= 0.0 && cp <= 1.0, isTrue);

          // No pixel filled beyond currentFillX
          if (currentFillX <= m.left) {
            expect(cp, equals(0.0), reason: 'Cluster "${m.cluster}" at p=$p should not be filled before reached');
          }
          if (currentFillX >= m.right) {
            expect(cp, equals(1.0), reason: 'Cluster "${m.cluster}" at p=$p should be fully filled when passed');
          }

          // Subtle zoom check
          final scale = computeClusterScale(cp);
          expect(scale >= 1.0, isTrue);
          expect(scale <= kKaraokeGlyphScalePeak + 0.001, isTrue);
          if (cp == 0.0 || cp == 1.0) {
            expect(scale, equals(1.0), reason: 'Idle or passed cluster should have scale 1.0');
          } else {
            expect(scale > 1.0, isTrue, reason: 'Actively filling cluster should have subtle zoom');
          }
        }
      }
    }
  });
}
