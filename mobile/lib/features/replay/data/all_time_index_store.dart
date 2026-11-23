import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../domain/all_time_index.dart';
import '../domain/listen_event.dart';

/// Manages persistence, incremental updates, and full reconstruction of [AllTimeIndex].
class AllTimeIndexStore extends ChangeNotifier {
  AllTimeIndexStore._();
  static final AllTimeIndexStore instance = AllTimeIndexStore._();

  AllTimeIndex? _index;
  File? _file;
  bool _initialized = false;

  AllTimeIndex get index => _index ??= AllTimeIndex();

  Future<void> init({File? storageFile}) async {
    if (_initialized) return;
    _initialized = true;
    try {
      if (storageFile != null) {
        _file = storageFile;
      } else {
        try {
          final docDir = await getApplicationDocumentsDirectory()
              .timeout(const Duration(milliseconds: 300));
          _file = File('${docDir.path}/all_time_index.json');
        } catch (_) {
          _file = File('all_time_index.json');
        }
      }
      if (await _file!.exists()) {
        final content = await _file!.readAsString();
        if (content.trim().isNotEmpty) {
          final json = jsonDecode(content) as Map<String, dynamic>;
          _index = AllTimeIndex.fromJson(json);
        }
      }
    } catch (e) {
      debugPrint('[AllTimeIndexStore] Error initializing: $e');
    }
    _index ??= AllTimeIndex();
  }

  /// Incrementally updates the index with an incoming event and persists asynchronously.
  Future<void> recordEvent(ListenEvent event) async {
    await init();
    final modified = index.apply(event);
    if (modified) {
      notifyListeners();
      await _persist();
    }
  }

  /// Full rebuild of the lifetime index from an event stream.
  Future<void> rebuildFromStream(Stream<ListenEvent> eventStream) async {
    await init();
    _index = await AllTimeIndex.rebuildFrom(eventStream);
    notifyListeners();
    await _persist();
  }

  Future<void> _persist() async {
    if (_file == null) {
      final docDir = await getApplicationDocumentsDirectory();
      _file = File('${docDir.path}/all_time_index.json');
    }
    try {
      final tempFile = File('${_file!.path}.tmp');
      await tempFile.writeAsString(jsonEncode(index.toJson()), flush: true);
      if (await _file!.exists()) {
        await _file!.delete();
      }
      await tempFile.rename(_file!.path);
    } catch (e) {
      debugPrint('[AllTimeIndexStore] Error persisting index: $e');
    }
  }
}
