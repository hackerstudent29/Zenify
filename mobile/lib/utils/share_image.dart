import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Renders ONLY the widget under [boundaryKey] (a RepaintBoundary) to PNG and opens the Android
/// share sheet. Not a screenshot of the app UI. Returns false if rendering/sharing fails.
/// share_plus API changed across majors: if your version removed `Share.shareXFiles`,
/// use `SharePlus.instance.share(ShareParams(files: [XFile(path)], text: text))`.
Future<bool> shareBoundaryAsImage(GlobalKey boundaryKey, {required String fileName, String? text, double pixelRatio = 3}) async {
  try {
    final ctx = boundaryKey.currentContext;
    if (ctx == null) return false;
    final boundary = ctx.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) return false;
    if (boundary.debugNeedsPaint) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    final image = await boundary.toImage(pixelRatio: pixelRatio);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    if (data == null) return false;
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/$fileName.png');
    await file.writeAsBytes(data.buffer.asUint8List(), flush: true);
    await SharePlus.instance.share(
      ShareParams(files: [XFile(file.path, mimeType: 'image/png')], text: text),
    );
    return true;
  } catch (_) {
    return false;
  }
}
