import 'dart:math';
import '../models/gift_models.dart';
import '../replay_aggregate.dart';

/// Service for F18: Dedicate / Gift a Song.
class GiftService {
  const GiftService();

  /// Creates a [GiftSong] card from a [SongStat] and user's note.
  static GiftSong createGiftCard({
    required SongStat song,
    required String note,
    String? senderName,
  }) {
    final rand = Random.secure();
    final randomBytes = List<int>.generate(8, (_) => rand.nextInt(256));
    final token = randomBytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();

    return GiftSong(
      token: token,
      trackId: song.trackId,
      title: song.title,
      artist: song.artistRaw,
      coverUrl: song.coverUrl,
      note: GiftSong.sanitizeNote(note),
      senderName: senderName?.trim().isNotEmpty == true ? senderName!.trim() : 'A Zenify Friend',
      createdAt: DateTime.now().toUtc(),
    );
  }

  /// Returns the shareable deep-link URL for this gifted song.
  static String generateShareUrl(GiftSong gift) {
    return 'https://zenify.app/gift/${gift.token}';
  }
}
