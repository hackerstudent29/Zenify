import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/features/replay/domain/track_meta.dart';
import 'package:mobile/features/replay/data/track_meta_store.dart';
import 'package:mobile/features/replay/data/track_meta_enricher.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tempDir;
  late String storagePath;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('meta_test_');
    storagePath = '${tempDir.path}/track_meta_test.json';
    await TrackMetaStore.instance.clearForTest();
  });

  tearDown(() async {
    await TrackMetaStore.instance.clearForTest();
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  group('Phase 2: TrackMeta Domain Model & Parsing Fidelity', () {
    test('JSON serialization round-trip retains all required fields', () {
      final original = TrackMeta(
        trackId: 'arabic-kuthu',
        language: 'Tamil',
        composers: ['Anirudh Ravichander'],
        singers: ['Anirudh Ravichander', 'Jonita Gandhi'],
        movie: 'Beast',
        country: 'IN',
        year: 2022,
        genres: ['Soundtrack', 'Kuthu', 'Dance Pop'],
        albumId: 'alb-beast',
        durationMs: 279000,
        fetchedAt: DateTime.utc(2026, 11, 20, 12, 0),
      );

      final json = original.toJson();
      final restored = TrackMeta.fromJson(json);

      expect(restored.trackId, equals('arabic-kuthu'));
      expect(restored.language, equals('Tamil'));
      expect(restored.composers, equals(['Anirudh Ravichander']));
      expect(restored.singers, equals(['Anirudh Ravichander', 'Jonita Gandhi']));
      expect(restored.movie, equals('Beast'));
      expect(restored.country, equals('IN'));
      expect(restored.year, equals(2022));
      expect(restored.genres, equals(['Soundtrack', 'Kuthu', 'Dance Pop']));
      expect(restored.albumId, equals('alb-beast'));
      expect(restored.durationMs, equals(279000));
      expect(restored.fetchedAt, equals(DateTime.utc(2026, 11, 20, 12, 0)));
    });

    test('tolerates comma-separated string inputs for composers/singers', () {
      final json = {
        'trackId': 't-comma',
        'language': 'Tamil',
        'composers': 'A. R. Rahman, Harris Jayaraj',
        'singers': 'Sid Sriram, Shreya Ghoshal',
        'movie': 'Epic Movie',
        'country': 'IN',
        'year': 2023,
      };

      final meta = TrackMeta.fromJson(json);
      expect(meta.composers, equals(['A. R. Rahman', 'Harris Jayaraj']));
      expect(meta.singers, equals(['Sid Sriram', 'Shreya Ghoshal']));
    });
  });

  group('Phase 2: TrackMetaStore & Curated Seed Preloading', () {
    test('preloads seed asset and achieves >= 80% hit rate on core catalog', () async {
      final store = TrackMetaStore.instance;
      await store.init(storagePath: storagePath, autoPreload: false);

      // Preload the seed file from assets
      final seedFile = File('assets/replay_track_meta_seed.json');
      expect(await seedFile.exists(), isTrue, reason: 'Seed file must exist in assets');
      final rawSeed = await seedFile.readAsString();

      final added = await store.preloadSeed(rawJson: rawSeed);
      expect(added, greaterThanOrEqualTo(200));
      expect(store.count, greaterThanOrEqualTo(200));

      // Test hit rate against representative sample of 10 popular songs across eras
      final samplePopularIds = [
        'arabic-kuthu',
        'hukum-jailer',
        'badass-leo',
        'urvasi-urvasi',
        'chaiyya-chaiyya',
        'rowdy-baby-maari2',
        'raja-rajadhi-raja',
        'vaseegara-minnale',
        'enjoy-enjaami',
        'blinding-lights-weeknd',
      ];

      var hits = 0;
      for (final id in samplePopularIds) {
        final meta = store.get(id);
        if (meta != null) {
          hits++;
        }
      }

      final hitRate = hits / samplePopularIds.length;
      expect(hitRate, greaterThanOrEqualTo(0.80),
          reason: 'Local cache hit rate must be >= 80% on seeded catalogue (Gate 2)');

      // Verify detailed fields on a specific hit
      final arabicKuthu = store.get('arabic-kuthu')!;
      expect(arabicKuthu.composers, contains('Anirudh Ravichander'));
      expect(arabicKuthu.movie, equals('Beast'));
      expect(arabicKuthu.country, equals('IN'));
      expect(arabicKuthu.year, equals(2022));
    });

    test('put() and putBatch() persist and reload from file', () async {
      final store = TrackMetaStore.instance;
      await store.init(storagePath: storagePath, autoPreload: false);

      final customMeta = TrackMeta(
        trackId: 'custom-123',
        language: 'Malayalam',
        composers: ['Sushin Shyam'],
        singers: ['Sushin Shyam'],
        movie: 'Aavesham',
        country: 'IN',
        year: 2024,
        genres: ['Electronic Folk'],
        fetchedAt: DateTime.utc(2026, 11, 20),
      );

      final initialVersion = store.version;
      await store.put(customMeta);

      expect(store.version, equals(initialVersion + 1));
      expect(store.get('custom-123')?.movie, equals('Aavesham'));

      // Verify file persistence by resetting in-memory state and re-initializing from disk file
      TrackMetaStore.instance.resetMemoryForReload();
      expect(TrackMetaStore.instance.get('custom-123'), isNull);

      await TrackMetaStore.instance.init(storagePath: storagePath, autoPreload: false);
      expect(TrackMetaStore.instance.get('custom-123')?.movie, equals('Aavesham'));
    });
  });

  group('Phase 2: TrackMetaEnricher Background Scheduler', () {
    test('enriches missing tracks via MockClient without requesting cached tracks', () async {
      final store = TrackMetaStore.instance;
      await store.init(storagePath: storagePath, autoPreload: false);

      // Pre-seed 'cached-track'
      await store.put(TrackMeta(
        trackId: 'cached-track',
        language: 'Tamil',
        composers: ['Anirudh'],
        singers: ['Anirudh'],
        country: 'IN',
        fetchedAt: DateTime.now().toUtc(),
      ));

      List<String>? requestedTrackIds;

      final mockClient = MockClient((request) async {
        expect(request.url.path, equals('/api/replay/enrich-tracks'));
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        requestedTrackIds = (body['trackIds'] as List).cast<String>();

        return http.Response(
          jsonEncode({
            'tracks': [
              {
                'trackId': 'missing-1',
                'language': 'Telugu',
                'composers': ['Devi Sri Prasad'],
                'singers': ['Sid Sriram'],
                'movie': 'Pushpa 2',
                'country': 'IN',
                'year': 2024,
                'genres': ['Soundtrack'],
                'albumId': 'alb-pushpa2',
                'durationMs': 220000,
                'fetchedAt': DateTime.now().toUtc().toIso8601String(),
              }
            ]
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final enricher = TrackMetaEnricher(store: store, httpClient: mockClient);

      // Request enrichment for both cached and missing tracks
      final count = await enricher.enrichMissing(
        ['cached-track', 'missing-1'],
        customBaseUrl: 'http://localhost:3000',
      );

      // Only 'missing-1' should have been sent to backend
      expect(requestedTrackIds, equals(['missing-1']));
      expect(count, equals(1));

      final newlyEnriched = store.get('missing-1');
      expect(newlyEnriched, isNotNull);
      expect(newlyEnriched!.movie, equals('Pushpa 2'));
      expect(newlyEnriched.composers, contains('Devi Sri Prasad'));
    });

    test('handles backend 500 error gracefully without throwing', () async {
      final store = TrackMetaStore.instance;
      await store.init(storagePath: storagePath, autoPreload: false);

      final failingClient = MockClient((request) async {
        return http.Response('Internal Server Error', 500);
      });

      final enricher = TrackMetaEnricher(store: store, httpClient: failingClient);

      final count = await enricher.enrichMissing(
        ['unknown-track-xyz'],
        customBaseUrl: 'http://localhost:3000',
      );

      expect(count, equals(0));
      expect(store.get('unknown-track-xyz'), isNull);
    });
  });
}
