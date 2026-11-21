import 'package:flutter/foundation.dart';

import '../atlas/atlas.dart';
import '../models/track.dart';
import 'artist_service.dart';
import 'innertube_service.dart';
import 'player_state.dart';

class ZenifyAtlasSource implements AtlasMusicSource {
  ZenifyAtlasSource(this.player) {
    _now.value = player.currentTrack?.id;
    player.addListener(_syncNowPlaying);
  }

  final PlayerState player;
  final ValueNotifier<String?> _now = ValueNotifier<String?>(null);

  final Map<String, ({List<AtlasSong> tracks, List<AtlasChartArtist> artists})>
  _chartsCache = {};
  final Map<String, List<AtlasSong>> _newReleasesCache = {};
  final Map<
    String,
    ({List<AtlasSong> tracks, String playlistTitle, bool isVerified})
  >
  _cityPlaylistsCache = {};

  void _syncNowPlaying() {
    _now.value = player.currentTrack?.id;
  }

  @override
  ValueListenable<String?> get nowPlayingId => _now;

  @override
  Future<List<AtlasSong>> topSongs(String artist, {int limit = 3}) async {
    try {
      final results = await InnerTubeService.instance.search(artist);
      return [
        for (final t in results.take(limit))
          AtlasSong(
            id: t.id,
            title: t.title,
            artist: t.artist,
            thumbnail: t.coverUrl.isNotEmpty ? t.coverUrl : null,
            album: t.album,
            durationSeconds: t.durationSeconds,
          ),
      ];
    } catch (_) {
      return const [];
    }
  }

  @override
  Future<String?> artistImage(String artist) async {
    try {
      final profile = await ArtistService.instance.getArtist(artist);
      final img = profile?.imageUrl;
      if (img != null && img.isNotEmpty) {
        return img;
      }
      final searchRes = await InnerTubeService.instance.searchArtists(artist);
      if (searchRes.isNotEmpty && searchRes.first.image.isNotEmpty) {
        return searchRes.first.image;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<({List<AtlasSong> tracks, List<AtlasChartArtist> artists})>
  getCountryCharts(String countryIso) async {
    final code = countryIso.toUpperCase();
    if (_chartsCache.containsKey(code)) {
      return _chartsCache[code]!;
    }
    try {
      final result = await InnerTubeService.instance.getCharts(
        countryCode: code,
      );
      final atlasTracks = [
        for (final t in result.tracks)
          AtlasSong(
            id: t.id,
            title: t.title,
            artist: t.artist,
            thumbnail: t.coverUrl.isNotEmpty ? t.coverUrl : null,
            album: t.album,
            durationSeconds: t.durationSeconds,
          ),
      ];
      final chartArtists = [
        for (final a in result.artists)
          AtlasChartArtist(name: a.name, subs: a.subs, image: a.image),
      ];
      final res = (tracks: atlasTracks, artists: chartArtists);
      if (atlasTracks.isNotEmpty || chartArtists.isNotEmpty) {
        _chartsCache[code] = res;
      }
      return res;
    } catch (_) {
      return (tracks: const <AtlasSong>[], artists: const <AtlasChartArtist>[]);
    }
  }

  @override
  Future<List<AtlasSong>> getCountryNewReleases(String countryIso) async {
    final code = countryIso.toUpperCase();
    if (_newReleasesCache.containsKey(code)) {
      return _newReleasesCache[code]!;
    }
    try {
      final result = await InnerTubeService.instance.getNewReleases(
        countryCode: code,
      );
      final atlasSongs = [
        for (final t in result)
          AtlasSong(
            id: t.id,
            title: t.title,
            artist: t.artist,
            thumbnail: t.coverUrl.isNotEmpty ? t.coverUrl : null,
            album: t.album,
            durationSeconds: t.durationSeconds,
          ),
      ];
      if (atlasSongs.isNotEmpty) {
        _newReleasesCache[code] = atlasSongs;
      }
      return atlasSongs;
    } catch (_) {
      return const [];
    }
  }

  @override
  Future<({List<AtlasSong> tracks, String playlistTitle, bool isVerified})>
  getCityPlaylist(AtlasCity city) async {
    if (_cityPlaylistsCache.containsKey(city.id)) {
      return _cityPlaylistsCache[city.id]!;
    }

    // 1. Try to search for official playlist
    final query = city.playlistQuery ?? 'Top 25: ${city.name}';
    try {
      final playlists = await InnerTubeService.instance.searchPlaylistsNative(
        query,
      );
      for (final p in playlists) {
        final title = (p['title'] as String?) ?? '';
        final id = (p['id'] as String?) ?? '';
        final isMatch =
            title.toLowerCase().contains(city.name.toLowerCase()) ||
            (title.toLowerCase().contains('top 25') &&
                title.toLowerCase().contains(city.name.toLowerCase()));
        if (isMatch && id.isNotEmpty) {
          final res = await InnerTubeService.instance.getPlaylist(id);
          if (res != null && res.tracks.isNotEmpty) {
            final verified = (
              tracks: [
                for (final t in res.tracks)
                  AtlasSong(
                    id: t.id,
                    title: t.title,
                    artist: t.artist,
                    thumbnail: t.coverUrl.isNotEmpty ? t.coverUrl : null,
                    album: t.album,
                    durationSeconds: t.durationSeconds,
                  ),
              ],
              playlistTitle: res.title.isNotEmpty ? res.title : query,
              isVerified: true,
            );
            _cityPlaylistsCache[city.id] = verified;
            return verified;
          }
        }
      }
    } catch (_) {}

    // 2. Honest Fallback: Build curated local city mix from city's verified artists
    try {
      final mix = await AtlasContent.instance.cityMix(city);
      final fallback = (
        tracks: mix,
        playlistTitle: '${city.name} Sound Mix',
        isVerified: false,
      );
      if (mix.isNotEmpty) {
        _cityPlaylistsCache[city.id] = fallback;
      }
      return fallback;
    } catch (_) {
      return (
        tracks: const <AtlasSong>[],
        playlistTitle: '${city.name} Music',
        isVerified: false,
      );
    }
  }

  @override
  Future<void> playQueue(List<AtlasSong> songs, {int startIndex = 0}) async {
    if (songs.isEmpty) return;
    final tracks = [
      for (final s in songs)
        Track(
          id: s.id,
          title: s.title,
          artist: s.artist,
          album: s.album,
          coverUrl: s.thumbnail ?? '',
          durationSeconds: s.durationSeconds,
        ),
    ];
    await player.setQueue(tracks, startIndex: startIndex);
  }

  @override
  Future<void> playAll(List<AtlasSong> songs, {bool shuffle = false}) async {
    if (songs.isEmpty) return;
    final list = List<AtlasSong>.from(songs);
    if (shuffle) list.shuffle();
    await playQueue(list, startIndex: 0);
  }
}
