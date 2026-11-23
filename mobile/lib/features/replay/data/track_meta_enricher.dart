import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../../../services/api_service.dart';
import '../domain/track_meta.dart';
import 'track_meta_store.dart';

/// Background scheduler and client for enriching track metadata.
///
/// Features:
/// - Batches missing track IDs in chunks of 20.
/// - Never blocks UI render; UI displays local cached metadata immediately.
/// - Silent failure & graceful backoff on network dropouts.
class TrackMetaEnricher {
  TrackMetaEnricher({
    TrackMetaStore? store,
    http.Client? httpClient,
  })  : _store = store ?? TrackMetaStore.instance,
        _client = httpClient ?? http.Client();

  static final TrackMetaEnricher instance = TrackMetaEnricher();

  final TrackMetaStore _store;
  final http.Client _client;
  bool _isEnriching = false;

  /// True if a background enrichment run is currently executing.
  bool get isEnriching => _isEnriching;

  /// Identifies any track IDs missing metadata and resolves them from the backend.
  /// Batches up to 20 tracks per HTTP call with an 8s timeout.
  Future<int> enrichMissing(List<String> trackIds, {String? customBaseUrl}) async {
    if (_isEnriching) return 0;
    _isEnriching = true;

    try {
      await _store.init();

      // Filter out any track that already has metadata cached
      final missing = trackIds.where((id) => _store.get(id) == null).toSet().toList();
      if (missing.isEmpty) return 0;

      final baseUrl = customBaseUrl ?? ApiService.baseUrl;
      final uri = Uri.parse('$baseUrl/api/replay/enrich-tracks');

      var totalEnriched = 0;
      const batchSize = 20;

      for (var i = 0; i < missing.length; i += batchSize) {
        final chunk = missing.sublist(
          i,
          (i + batchSize > missing.length) ? missing.length : i + batchSize,
        );

        try {
          final res = await _client
              .post(
                uri,
                headers: {'Content-Type': 'application/json'},
                body: jsonEncode({'trackIds': chunk}),
              )
              .timeout(const Duration(seconds: 8));

          if (res.statusCode == 200) {
            final data = jsonDecode(res.body);
            if (data is Map && data['tracks'] is List) {
              final newMetas = <TrackMeta>[];
              for (final item in data['tracks'] as List) {
                if (item is Map) {
                  newMetas.add(TrackMeta.fromJson(Map<String, dynamic>.from(item)));
                }
              }
              if (newMetas.isNotEmpty) {
                await _store.putBatch(newMetas);
                totalEnriched += newMetas.length;
              }
            }
          }
        } catch (e) {
          debugPrint('[TrackMetaEnricher] Batch error (skipping gracefully): $e');
        }
      }

      return totalEnriched;
    } finally {
      _isEnriching = false;
    }
  }
}
