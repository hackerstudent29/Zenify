import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';

class RenderResult {
  const RenderResult({
    required this.file,
    required this.bytes,
    required this.width,
    required this.height,
  });

  final File file;
  final Uint8List bytes;
  final int width;
  final int height;
}

class StoryImageRenderer {
  StoryImageRenderer._();

  /// Captures a [RepaintBoundary] identified by [boundaryKey] to a PNG file.
  /// Standard story pixel ratio is 3.0 (producing 1080x1920 from 360x640, or 1080x1080 from 360x360).
  static Future<RenderResult?> captureToPng(
    GlobalKey boundaryKey, {
    String filePrefix = 'zenify_story',
    double pixelRatio = 3.0,
  }) async {
    try {
      final ctx = boundaryKey.currentContext;
      if (ctx == null) {
        debugPrint('[StoryImageRenderer] Context is null for boundaryKey');
        return null;
      }

      final boundary = ctx.findRenderObject() as RenderRepaintBoundary?;
      if (boundary == null) {
        debugPrint('[StoryImageRenderer] RenderRepaintBoundary not found');
        return null;
      }

      // If boundary needs painting, wait a short moment for rasterization
      if (boundary.debugNeedsPaint) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }

      final ui.Image image = await boundary.toImage(pixelRatio: pixelRatio);
      final ByteData? byteData = await image.toByteData(format: ui.ImageByteFormat.png);
      final width = image.width;
      final height = image.height;
      image.dispose();

      if (byteData == null) {
        debugPrint('[StoryImageRenderer] Failed to encode image to PNG ByteData');
        return null;
      }

      final Uint8List pngBytes = byteData.buffer.asUint8List();

      final tempDir = await getTemporaryDirectory();
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final file = File('${tempDir.path}/${filePrefix}_$timestamp.png');
      await file.writeAsBytes(pngBytes, flush: true);

      return RenderResult(
        file: file,
        bytes: pngBytes,
        width: width,
        height: height,
      );
    } catch (e, stack) {
      debugPrint('[StoryImageRenderer] Capture error: $e\n$stack');
      return null;
    }
  }
}

