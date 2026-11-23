import 'package:flutter/foundation.dart';

import '../models/atlas_models.dart';

/// The seam between Atlas and Zenify's music stack.
abstract class AtlasMusicSource {
  static AtlasMusicSource instance = NullAtlasMusicSource();

  /// Top songs for an artist name.
  Future<List<AtlasSong>> topSongs(String artist, {int limit = 3});

  /// Artist image URL, or null.
  Future<String?> artistImage(String artist);

  /// Fetch country charts with country context (gl: countryIso).
  Future<AtlasCountryCharts> getCountryCharts(String countryIso);

  /// Fetch country new releases with country context.
  Future<List<AtlasSong>> getCountryNewReleases(String countryIso);

  /// Fetch or resolve city playlist with verification.
  Future<AtlasCityPlaylist> getCityPlaylist(AtlasCity city);

  /// Replace the queue and start playback.
  Future<void> playQueue(List<AtlasSong> songs, {int startIndex = 0});

  /// Play all songs with optional shuffle.
  Future<void> playAll(List<AtlasSong> songs, {bool shuffle = false});

  /// Id of the track currently playing.
  ValueListenable<String?> get nowPlayingId;
}

class NullAtlasMusicSource implements AtlasMusicSource {
  final ValueNotifier<String?> _id = ValueNotifier<String?>(null);

  @override
  Future<List<AtlasSong>> topSongs(String artist, {int limit = 3}) async =>
      const [];

  @override
  Future<String?> artistImage(String artist) async => null;

  @override
  Future<AtlasCountryCharts> getCountryCharts(String countryIso) async =>
      const AtlasCountryCharts(
        tracks: <AtlasSong>[],
        artists: <AtlasChartArtist>[],
      );

  @override
  Future<List<AtlasSong>> getCountryNewReleases(String countryIso) async =>
      const [];

  @override
  Future<AtlasCityPlaylist> getCityPlaylist(AtlasCity city) async =>
      const AtlasCityPlaylist(
        tracks: <AtlasSong>[],
        playlistTitle: 'Local Mix',
        isVerified: false,
      );

  @override
  Future<void> playQueue(List<AtlasSong> songs, {int startIndex = 0}) async {}

  @override
  Future<void> playAll(List<AtlasSong> songs, {bool shuffle = false}) async {}

  @override
  ValueListenable<String?> get nowPlayingId => _id;
}
