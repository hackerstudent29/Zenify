import '../models/atlas_models.dart';
import 'atlas_music_source.dart';

/// Memoised content lookups on top of AtlasMusicSource.
class AtlasContent {
  AtlasContent._();
  static final AtlasContent instance = AtlasContent._();

  final Map<String, Future<String?>> _images = {};
  final Map<String, Future<List<AtlasSong>>> _songs = {};

  Future<String?> artistImage(String name) => _images.putIfAbsent(
    name,
    () => AtlasMusicSource.instance
        .artistImage(name)
        .catchError((_) => null as String?),
  );

  /// Round-robin mix: one song per artist per pass, so no artist repeats back-to-back.
  Future<List<AtlasSong>> cityMix(
    AtlasCity city, {
    int maxArtists = 6,
    int perArtist = 3,
    int total = 24,
  }) => _songs.putIfAbsent(
    '${city.id}:$maxArtists:$perArtist:$total',
    () => _buildMix(city, maxArtists, perArtist, total),
  );

  Future<List<AtlasSong>> _buildMix(
    AtlasCity city,
    int maxArtists,
    int perArtist,
    int total,
  ) async {
    final src = AtlasMusicSource.instance;
    final lists = await Future.wait([
      for (final a in city.artists.take(maxArtists))
        src.topSongs(a, limit: perArtist).catchError((_) => <AtlasSong>[]),
    ]);
    final seen = <String>{};
    final out = <AtlasSong>[];
    for (var pass = 0; pass < perArtist && out.length < total; pass++) {
      for (final l in lists) {
        if (pass < l.length && seen.add(l[pass].id)) {
          out.add(l[pass]);
          if (out.length >= total) break;
        }
      }
    }
    return out;
  }

  /// Drop cached failures (e.g. after going back online).
  void clear() {
    _images.clear();
    _songs.clear();
  }
}
