import 'package:flutter/foundation.dart';

import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'innertube_service.dart';

typedef YTArtistCard = ({String name, String? browseId, String? audience, String? thumb});

class ArtistReleaseItem {
  const ArtistReleaseItem({
    required this.title,
    required this.year,
    required this.type,
    required this.coverUrl,
    this.browseId,
  });

  final String title;
  final String year;
  final String type; // 'Album', 'Single', 'EP'
  final String coverUrl;
  final String? browseId;
}

class ArtistPlaylistItem {
  const ArtistPlaylistItem({
    required this.title,
    required this.coverUrl,
    this.subtitle,
    this.browseId,
  });

  final String title;
  final String coverUrl;
  final String? subtitle;
  final String? browseId;
}

class RelatedArtistItem {
  const RelatedArtistItem({
    required this.name,
    required this.imageUrl,
    this.subs,
    this.browseId,
  });

  final String name;
  final String imageUrl;
  final String? subs;
  final String? browseId;
}

class ArtistProfile {
  const ArtistProfile({
    required this.name,
    required this.imageUrl,
    required this.coverUrl,
    required this.bio,
    required this.subscriberCount,
    required this.monthlyAudience,
    required this.isVerified,
    required this.topSongs,
    required this.albums,
    required this.singles,
    required this.featuredPlaylists,
    required this.relatedArtists,
    this.musicVideos = const [],
  });

  final String name;
  final String imageUrl;
  final String coverUrl;
  final String bio;
  final String subscriberCount;
  final String? monthlyAudience;
  final bool isVerified;
  final List<Track> topSongs;
  final List<ArtistReleaseItem> albums;
  final List<ArtistReleaseItem> singles;
  final List<ArtistPlaylistItem> featuredPlaylists;
  final List<RelatedArtistItem> relatedArtists;
  final List<Track> musicVideos;

  ArtistProfile copyWith({
    String? name,
    String? imageUrl,
    String? coverUrl,
    String? bio,
    String? subscriberCount,
    String? monthlyAudience,
    bool? isVerified,
    List<Track>? topSongs,
    List<ArtistReleaseItem>? albums,
    List<ArtistReleaseItem>? singles,
    List<ArtistPlaylistItem>? featuredPlaylists,
    List<RelatedArtistItem>? relatedArtists,
    List<Track>? musicVideos,
  }) {
    return ArtistProfile(
      name: name ?? this.name,
      imageUrl: imageUrl ?? this.imageUrl,
      coverUrl: coverUrl ?? this.coverUrl,
      bio: bio ?? this.bio,
      subscriberCount: subscriberCount ?? this.subscriberCount,
      monthlyAudience: monthlyAudience ?? this.monthlyAudience,
      isVerified: isVerified ?? this.isVerified,
      topSongs: topSongs ?? this.topSongs,
      albums: albums ?? this.albums,
      singles: singles ?? this.singles,
      featuredPlaylists: featuredPlaylists ?? this.featuredPlaylists,
      relatedArtists: relatedArtists ?? this.relatedArtists,
      musicVideos: musicVideos ?? this.musicVideos,
    );
  }
}

class ArtistService {
  ArtistService._();
  static final ArtistService instance = ArtistService._();

  static final Map<String, ({ArtistProfile profile, DateTime expires})> _cache = {};
  static final Map<String, Future<ArtistProfile?>> _inFlight = {};

  static void clearCache() {
    _cache.clear();
    _inFlight.clear();
  }

  /// Synchronous 0ms cache lookup for immediate rendering on navigation.
  ArtistProfile? getCached(String artistName, {String? browseId}) {
    if (browseId != null && browseId.isNotEmpty) {
      final c = _cache[browseId.toLowerCase()];
      if (c != null && DateTime.now().isBefore(c.expires)) return c.profile;
    }
    final clean = artistName.trim().toLowerCase();
    if (clean.isNotEmpty) {
      final c = _cache[clean];
      if (c != null && DateTime.now().isBefore(c.expires)) return c.profile;
    }
    return null;
  }

  Future<ArtistProfile?> getArtist(String artistName, {String? browseId, bool forceRefresh = false}) async {
    final cleanName = artistName.trim();
    if (cleanName.isEmpty) return null;

    final cacheKey = (browseId != null && browseId.isNotEmpty) ? browseId.toLowerCase() : cleanName.toLowerCase();
    if (!forceRefresh) {
      final cached = getCached(cleanName, browseId: browseId);
      if (cached != null) return cached;
    }

    if (_inFlight.containsKey(cacheKey)) {
      return _inFlight[cacheKey]!;
    }

    final future = _loadArtistInternal(cleanName, browseId: browseId);
    _inFlight[cacheKey] = future;
    try {
      final res = await future;
      return res;
    } finally {
      _inFlight.remove(cacheKey);
    }
  }

  Future<ArtistProfile?> _loadArtistInternal(String cleanName, {String? browseId}) async {
    void storeCache(ArtistProfile profile, Duration ttl) {
      final expires = DateTime.now().add(ttl);
      _cache[cleanName.toLowerCase()] = (profile: profile, expires: expires);
      if (browseId != null && browseId.isNotEmpty) {
        _cache[browseId.toLowerCase()] = (profile: profile, expires: expires);
      }
      if (profile.name.isNotEmpty) {
        _cache[profile.name.toLowerCase()] = (profile: profile, expires: expires);
      }
    }

    try {
      final isValidYtBrowseId = browseId != null &&
          (browseId.startsWith('UC') || browseId.startsWith('FEmusic_') || browseId.startsWith('MPREb_'));
      final targetBrowseId = isValidYtBrowseId ? browseId : '';

      // 1. Resolve artist channel via native InnerTube (YouTube Music)
      final ytChannel = await InnerTubeService.instance.getArtistChannel(
        targetBrowseId,
        artistName: cleanName,
      );

      final topSongs = <Track>[];
      final albums = <ArtistReleaseItem>[];
      final singles = <ArtistReleaseItem>[];
      final playlists = <ArtistPlaylistItem>[];
      final related = <RelatedArtistItem>[];
      final musicVideos = <Track>[];

      String name = cleanName;
      String imageUrl = '';
      String coverUrl = '';
      String bio = '';
      String subscriberCount = 'Verified Artist';
      String? monthlyAudience;

      if (ytChannel != null) {
        name = (ytChannel['name'] as String?)?.isNotEmpty == true ? ytChannel['name'] : cleanName;
        final rawThumb = (ytChannel['thumb'] ?? ytChannel['imageUrl']) as String?;
        final rawBanner = (ytChannel['banner'] ?? ytChannel['coverUrl'] ?? rawThumb) as String?;

        imageUrl = rawThumb != null && rawThumb.isNotEmpty
            ? MediaNormalizer.upgradeArtworkUrl(rawThumb, isArtistAvatar: true)
            : '';
        coverUrl = rawBanner != null && rawBanner.isNotEmpty
            ? MediaNormalizer.upgradeBannerUrl(rawBanner)
            : imageUrl;

        bio = (ytChannel['bio'] as String?)?.trim() ?? '';
        final subs = (ytChannel['subscriberCount'] as String?)?.trim();
        final monthly = (ytChannel['monthlyListenerCount'] as String?)?.trim();

        if (monthly != null && monthly.isNotEmpty) {
          monthlyAudience = monthly;
          subscriberCount = monthly;
        } else if (subs != null && subs.isNotEmpty) {
          subscriberCount = subs;
        }

        if (ytChannel['topSongs'] is List) {
          topSongs.addAll((ytChannel['topSongs'] as List).whereType<Track>());
        }

        if (ytChannel['albums'] is List) {
          for (final item in (ytChannel['albums'] as List)) {
            if (item is Map) {
              albums.add(ArtistReleaseItem(
                title: item['title'] ?? 'Album',
                year: (item['year'] ?? '').toString(),
                type: 'Album',
                coverUrl: item['coverUrl'] ?? '',
                browseId: item['browseId']?.toString(),
              ));
            }
          }
        }

        if (ytChannel['singles'] is List) {
          for (final item in (ytChannel['singles'] as List)) {
            if (item is Map) {
              singles.add(ArtistReleaseItem(
                title: item['title'] ?? 'Single',
                year: (item['year'] ?? '').toString(),
                type: 'Single',
                coverUrl: item['coverUrl'] ?? '',
                browseId: item['browseId']?.toString(),
              ));
            }
          }
        }

        if (ytChannel['playlists'] is List) {
          for (final item in (ytChannel['playlists'] as List)) {
            if (item is Map) {
              playlists.add(ArtistPlaylistItem(
                title: item['title'] ?? 'Playlist',
                coverUrl: item['coverUrl'] ?? '',
                browseId: item['browseId']?.toString(),
              ));
            }
          }
        }

        if (ytChannel['related'] is List) {
          for (final item in (ytChannel['related'] as List)) {
            if (item is Map) {
              related.add(RelatedArtistItem(
                name: item['name'] ?? 'Artist',
                imageUrl: item['imageUrl'] ?? '',
                subs: item['subs']?.toString(),
                browseId: item['browseId']?.toString(),
              ));
            }
          }
        }

        if (ytChannel['videos'] is List) {
          musicVideos.addAll((ytChannel['videos'] as List).whereType<Track>());
        }
      }

      // If topSongs is empty, fetch via InnerTube search directly
      if (topSongs.isEmpty) {
        try {
          final searchedSongs = await InnerTubeService.instance.search('$cleanName songs');
          final lower = cleanName.toLowerCase();
          for (final s in searchedSongs) {
            if (s.artist.toLowerCase().contains(lower) || topSongs.length < 5) {
              topSongs.add(s);
            }
            if (topSongs.length >= 25) break;
          }
        } catch (_) {}
      }

      // If albums are empty, search albums via InnerTube
      if (albums.isEmpty && singles.isEmpty) {
        try {
          final searchedAlbums = await InnerTubeService.instance.searchAlbumsNative(cleanName);
          for (final alb in searchedAlbums) {
            albums.add(ArtistReleaseItem(
              title: alb['title']?.toString() ?? 'Album',
              year: alb['year']?.toString() ?? '',
              type: 'Album',
              coverUrl: (alb['coverUrl'] ?? alb['thumbnail'])?.toString() ?? '',
              browseId: (alb['browseId'] ?? alb['id'])?.toString(),
            ));
          }
        } catch (_) {}
      }

      if (bio.isEmpty) {
        bio = 'Official verified artist profile for $name on Zenify. Explore top popular tracks, complete discography, albums, singles, and video songs.';
      }

      if (topSongs.isNotEmpty || albums.isNotEmpty) {
        final profile = ArtistProfile(
          name: name,
          imageUrl: imageUrl.isNotEmpty ? imageUrl : (topSongs.isNotEmpty ? topSongs.first.coverUrl : ''),
          coverUrl: coverUrl.isNotEmpty ? coverUrl : (topSongs.isNotEmpty ? topSongs.first.coverUrl : ''),
          bio: bio,
          subscriberCount: subscriberCount,
          monthlyAudience: monthlyAudience,
          isVerified: true,
          topSongs: topSongs,
          albums: albums,
          singles: singles,
          featuredPlaylists: playlists,
          relatedArtists: related,
          musicVideos: musicVideos,
        );

        storeCache(profile, const Duration(hours: 12));
        return profile;
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[ArtistService] Error loading artist: $e');
    }
    return null;
  }


}
