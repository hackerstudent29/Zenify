import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/models/track.dart';
import 'package:mobile/services/queue_state.dart';
import 'package:mobile/services/smart_queue_engine.dart';

Track makeTestTrack({
  required String id,
  required String title,
  required String artist,
  String album = 'Test Album',
  String coverUrl = 'https://example.com/cover.jpg',
  int durationSeconds = 210,
  String language = '',
}) {
  return Track(
    id: id,
    title: title,
    artist: artist,
    album: album,
    coverUrl: coverUrl,
    durationSeconds: durationSeconds,
    language: language,
  );
}

void main() {
  group('SmartQueueEngine & Unified Queue Advance Tests', () {
    final trackA = makeTestTrack(
      id: 'song-a',
      title: 'Kadhalae Kadhalae',
      artist: 'Govind Vasantha',
      album: '96',
      durationSeconds: 240,
      language: 'tamil',
    );

    final trackB = makeTestTrack(
      id: 'song-b',
      title: 'Ennodu Nee Irundhaal',
      artist: 'A.R. Rahman',
      album: 'I',
      durationSeconds: 260,
      language: 'tamil',
    );

    final trackC = makeTestTrack(
      id: 'song-c',
      title: 'Malare Ninne',
      artist: 'Vijay Yesudas',
      album: 'Premam',
      durationSeconds: 210,
      language: 'malayalam',
    );

    final trackD = makeTestTrack(
      id: 'song-d',
      title: 'Maruvaarthai',
      artist: 'Sid Sriram',
      album: 'Enai Noki Paayum Thota',
      durationSeconds: 280,
      language: 'tamil',
    );

    test('Test Case 1: Queue is A (current), B, C, D. A ends -> B plays, A to History, upNext has C, D', () {
      final queue = QueueState();
      queue.seed([trackA, trackB, trackC, trackD], startIndex: 0);

      expect(queue.current?.id, 'song-a');
      expect(queue.upNext.map((e) => e.track.id).toList(), ['song-b', 'song-c', 'song-d']);
      expect(queue.history, isEmpty);

      // A finishes naturally -> advance via takeNext()
      final popped = queue.takeNext();
      expect(popped?.track.id, 'song-b');
      expect(queue.current?.id, 'song-b');
      expect(queue.history.map((e) => e.track.id).toList(), ['song-a']);
      expect(queue.upNext.map((e) => e.track.id).toList(), ['song-c', 'song-d']);
    });

    test('Test Case 2: B and C end naturally -> D plays next with NO random song in between', () {
      final queue = QueueState();
      queue.seed([trackA, trackB, trackC, trackD], startIndex: 0);

      // Advance A -> B
      queue.takeNext();
      // Advance B -> C
      final poppedC = queue.takeNext();
      expect(poppedC?.track.id, 'song-c');
      expect(queue.current?.id, 'song-c');
      expect(queue.upNext.map((e) => e.track.id).toList(), ['song-d']);

      // Advance C -> D
      final poppedD = queue.takeNext();
      expect(poppedD?.track.id, 'song-d');
      expect(queue.current?.id, 'song-d');
      expect(queue.history.map((e) => e.track.id).toList(), ['song-a', 'song-b', 'song-c']);
      expect(queue.manualCount, 0);
    });

    test('Test Case 3: A Tamil song is playing -> auto-added songs are Tamil, no duplicates, no history overlap', () {
      final seed = trackA; // Tamil song

      final existingIds = {'song-a', 'hist-old-1'};
      final existingSignatures = {SmartQueueEngine.normalizeSignature(seed.title, seed.artist)};

      final List<Track> candidates = [
        // Duplicate by signature (remix)
        makeTestTrack(
          id: 'remix-1',
          title: 'Kadhalae Kadhalae (Lofi Remix)',
          artist: 'Govind Vasantha',
          durationSeconds: 200,
          language: 'tamil',
        ),
        // Hindi song (wrong language)
        makeTestTrack(
          id: 'hindi-1',
          title: 'Tum Hi Ho',
          artist: 'Arijit Singh',
          durationSeconds: 260,
          language: 'hindi',
        ),
        // Telugu song (wrong language)
        makeTestTrack(
          id: 'telugu-1',
          title: 'Inkem Inkem',
          artist: 'Sid Sriram',
          durationSeconds: 240,
          language: 'telugu',
        ),
        // Tamil valid 1
        makeTestTrack(
          id: 'tamil-1',
          title: 'Po Ve Po',
          artist: 'Anirudh Ravichander',
          album: '3',
          durationSeconds: 230,
          language: 'tamil',
        ),
        // Tamil valid 2
        makeTestTrack(
          id: 'tamil-2',
          title: 'Nenjame',
          artist: 'Anirudh Ravichander',
          album: 'Doctor',
          durationSeconds: 250,
          language: 'tamil',
        ),
        // Tamil valid 3 (same artist as 1 & 2 -> triggers variety capping test)
        makeTestTrack(
          id: 'tamil-3',
          title: 'Kanave Kanave',
          artist: 'Anirudh Ravichander',
          album: 'David',
          durationSeconds: 245,
          language: 'tamil',
        ),
        // Tamil valid 4 (different artist)
        makeTestTrack(
          id: 'tamil-4',
          title: 'Anbe Anbe',
          artist: 'G.V. Prakash Kumar',
          album: 'Darling',
          durationSeconds: 270,
          language: 'tamil',
        ),
      ];

      final filtered = SmartQueueEngine.filterAndRank(
        candidates: candidates,
        seed: seed,
        existingIds: existingIds,
        existingSignatures: existingSignatures,
        count: 5,
      );

      // Verify hard filter 1: No duplicates by ID or normalized signature
      expect(filtered.any((t) => t.id == 'remix-1' || t.title.contains('Kadhalae Kadhalae')), isFalse);
      expect(filtered.any((t) => existingIds.contains(t.id)), isFalse);

      // Verify hard filter 2: Only Tamil songs included
      for (final t in filtered) {
        expect(SmartQueueEngine.detectLanguage(t), 'tamil');
      }

      // Verify artist capping: no 3 consecutive songs by Anirudh Ravichander
      for (int i = 0; i < filtered.length - 2; i++) {
        final a1 = filtered[i].artist.toLowerCase();
        final a2 = filtered[i + 1].artist.toLowerCase();
        final a3 = filtered[i + 2].artist.toLowerCase();
        expect(a1 == a2 && a2 == a3, isFalse);
      }
    });

    test('Test Case 4: Slow romantic song is playing -> refilled queue prioritizes slow/romantic, avoids high energy party', () {
      final romanticSeed = makeTestTrack(
        id: 'seed-romance',
        title: 'Maruvaarthai Pesathey (Acoustic Melody)',
        artist: 'Sid Sriram',
        durationSeconds: 300,
        language: 'tamil',
      );

      final List<Track> candidates = [
        // High energy dance/mass banger
        makeTestTrack(
          id: 'party-1',
          title: 'Arabic Kuthu - Halamithi Habibo Dance Party Blast',
          artist: 'Anirudh Ravichander',
          durationSeconds: 240,
          language: 'tamil',
        ),
        // High energy mass song
        makeTestTrack(
          id: 'party-2',
          title: 'Badass Hukum - Marana Mass Remix Club',
          artist: 'Anirudh Ravichander',
          durationSeconds: 220,
          language: 'tamil',
        ),
        // Melodic romantic song
        makeTestTrack(
          id: 'romance-1',
          title: 'Unakkul Naane (Melody Love Song)',
          artist: 'Pradeep Kumar',
          durationSeconds: 270,
          language: 'tamil',
        ),
        // Melodic acoustic song
        makeTestTrack(
          id: 'romance-2',
          title: 'Venmegam acoustic romantic piano chill',
          artist: 'Yuvan Shankar Raja',
          durationSeconds: 280,
          language: 'tamil',
        ),
      ];

      final ranked = SmartQueueEngine.filterAndRank(
        candidates: candidates,
        seed: romanticSeed,
        existingIds: {'seed-romance'},
        existingSignatures: {SmartQueueEngine.normalizeSignature(romanticSeed.title, romanticSeed.artist)},
        count: 4,
      );

      expect(ranked.isNotEmpty, isTrue);
      // Top songs must be the calm/romantic ones matching seed energy, not the party blast
      expect(ranked.first.id.startsWith('romance'), isTrue);
      final firstEnergy = SmartQueueEngine.estimateEnergy(ranked.first);
      final seedEnergy = SmartQueueEngine.estimateEnergy(romanticSeed);
      expect((firstEnergy - seedEnergy).abs(), lessThan(0.35));
    });

    test('Test Case 5: Queue empty + autoplay off -> stops. Queue empty + autoplay on -> refilled', () async {
      final queue = QueueState();
      queue.seed([trackA], startIndex: 0);

      // Autoplay is turned OFF
      queue.toggleAutoplay();
      expect(queue.autoplay, isFalse);

      // Pop the only song in queue
      final nextWhenOff = queue.takeNext();
      expect(nextWhenOff, isNull);
      expect(queue.hasNext, isFalse);

      // Turn autoplay ON
      queue.toggleAutoplay();
      expect(queue.autoplay, isTrue);

      // Mock autoplay provider supplying Tamil recommendations
      queue.autoplayProvider = (seed, excludeIds, excludeSignatures) async {
        return [
          trackB,
          trackD,
        ];
      };

      await queue.ensureAutoplay();
      expect(queue.hasNext, isTrue);
      expect(queue.upNext.length, 2);

      final nextWhenOn = queue.takeNext();
      expect(nextWhenOn?.track.id, 'song-b');
      expect(nextWhenOn?.isAutoplay, isTrue);
    });

    test('NormalizeSignature handles remixes, brackets, and parentheticals cleanly', () {
      final sig1 = SmartQueueEngine.normalizeSignature('Leo - Naa Ready (From "Leo")', 'Anirudh Ravichander feat. Vijay');
      final sig2 = SmartQueueEngine.normalizeSignature('Naa Ready [Official Music Video]', 'Anirudh Ravichander & Vijay');
      expect(sig1, sig2);
    });

    test('Unicode script range detects Indian regional languages accurately', () {
      final tamilTrack = makeTestTrack(id: 't1', title: 'காதலே காதலே', artist: 'கோவிந்த் வசந்தா', durationSeconds: 200);
      expect(SmartQueueEngine.detectLanguage(tamilTrack), 'tamil');

      final teluguTrack = makeTestTrack(id: 't2', title: 'ఇంకేం ఇంకేం కావాలే', artist: 'సిద్ శ్రీరామ్', durationSeconds: 200);
      expect(SmartQueueEngine.detectLanguage(teluguTrack), 'telugu');

      final hindiTrack = makeTestTrack(id: 't3', title: 'तुम ही हो', artist: 'अरिजीत सिंह', durationSeconds: 200);
      expect(SmartQueueEngine.detectLanguage(hindiTrack), 'hindi');
    });
  });
}
