import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'innertube_service.dart';
import 'user_preferences_service.dart';

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

  static const String _avatarCachePrefKey = 'zenify_persisted_artist_avatars_v1';
  static bool _avatarsLoaded = false;
  static Timer? _avatarSaveTimer;

  static final Map<String, ({ArtistProfile profile, DateTime expires})> _cache = {};
  static final Map<String, Future<ArtistProfile?>> _inFlight = {};
  static final Map<String, String> _avatarCache = {};
  static final Map<String, Future<String>> _inFlightAvatars = {};

  Future<void> init() async {
    await ensureAvatarsLoaded();
  }

  static Future<void> ensureAvatarsLoaded() async {
    if (_avatarsLoaded) return;
    _avatarsLoaded = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_avatarCachePrefKey);
      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw) as Map?;
        if (decoded != null) {
          decoded.forEach((k, v) {
            if (v is String && v.isNotEmpty) {
              _avatarCache[k.toString().toLowerCase()] = v;
            }
          });
        }
      }
    } catch (_) {}
  }

  static void _persistAvatarsDebounced() {
    _avatarSaveTimer?.cancel();
    _avatarSaveTimer = Timer(const Duration(milliseconds: 500), () async {
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_avatarCachePrefKey, jsonEncode(_avatarCache));
      } catch (_) {}
    });
  }

  static void clearCache({bool keepAvatars = true}) {
    _cache.clear();
    _inFlight.clear();
    if (!keepAvatars) {
      _avatarCache.clear();
      SharedPreferences.getInstance().then((p) => p.remove(_avatarCachePrefKey)).catchError((_) => false);
    }
    _inFlightAvatars.clear();
  }

  static String? getCachedAvatar(String artistName) {
    final key = artistName.trim().toLowerCase();
    return _avatarCache[key];
  }

  static void cacheAvatar(String artistName, String avatarUrl) {
    final key = artistName.trim().toLowerCase();
    if (key.isEmpty || avatarUrl.isEmpty) return;
    _avatarCache[key] = avatarUrl;
    _persistAvatarsDebounced();
  }

  static Future<String> resolveArtistAvatar(String artistName) async {
    final clean = MediaNormalizer.cleanTitle(artistName).trim();
    final key = clean.toLowerCase();
    if (key.isEmpty || key == 'unknown artist') return '';
    await ensureAvatarsLoaded();

    if (_avatarCache.containsKey(key) && _avatarCache[key]!.isNotEmpty) {
      return _avatarCache[key]!;
    }

    if (_inFlightAvatars.containsKey(key)) {
      return _inFlightAvatars[key]!;
    }

    // 1. Check user favorite artists from preferences
    for (final fa in UserPreferencesService.instance.currentPrefs.favoriteArtists) {
      if (fa.name.trim().toLowerCase() == key && fa.image.isNotEmpty) {
        cacheAvatar(clean, fa.image);
        return fa.image;
      }
    }

    // 2. Fetch authentic artist profile / avatar from InnerTube with multi-strategy fallbacks
    final future = () async {
      try {
        // Strategy A: Native InnerTube searchArtists (returns official artist circular avatar directly)
        final artists = await InnerTubeService.instance.searchArtists(clean, limit: 3);
        if (artists.isNotEmpty) {
          for (final a in artists) {
            if (a.name.toLowerCase() == key ||
                a.name.toLowerCase().contains(key) ||
                key.contains(a.name.toLowerCase())) {
              if (a.image.isNotEmpty) {
                cacheAvatar(clean, a.image);
                return a.image;
              }
            }
          }
          final first = artists.first;
          if (first.image.isNotEmpty) {
            cacheAvatar(clean, first.image);
            return first.image;
          }
        }

        // Strategy B: searchArtist (musicCardShelf / artistChannel hit)
        final hit = await InnerTubeService.instance.searchArtist(clean);
        if (hit != null && hit.thumb != null && hit.thumb!.isNotEmpty) {
          final upgraded = MediaNormalizer.upgradeArtworkUrl(hit.thumb!, isArtistAvatar: true);
          cacheAvatar(clean, upgraded);
          return upgraded;
        }

        // Strategy C: Search artist songs and extract artist avatar from credits
        final songHits = await InnerTubeService.instance.search('$clean songs');
        if (songHits.isNotEmpty) {
          for (final song in songHits) {
            for (final ar in song.resolvedArtists) {
              if (ar.name.toLowerCase() == key && ar.imageUrl != null && ar.imageUrl!.isNotEmpty) {
                final upgraded = MediaNormalizer.upgradeArtworkUrl(ar.imageUrl!, isArtistAvatar: true);
                cacheAvatar(clean, upgraded);
                return upgraded;
              }
            }
          }
          final first = songHits.first;
          if (first.coverUrl.isNotEmpty) {
            final upgraded = MediaNormalizer.upgradeArtworkUrl(first.coverUrl, isArtistAvatar: true);
            cacheAvatar(clean, upgraded);
            return upgraded;
          }
        }
      } catch (_) {}
      return '';
    }();

    _inFlightAvatars[key] = future;
    try {
      return await future;
    } finally {
      _inFlightAvatars.remove(key);
    }
  }

  static String resolveHeroCoverUrl(String? url) {
    if (url == null || url.trim().isEmpty) return '';
    var u = url.trim();
    if (u.contains('googleusercontent.com') || u.contains('ggpht.com')) {
      final base = u.replaceAll(
        RegExp(r'=(?:w\d+-h\d+|s\d+|w\d+)(?:-[a-z0-9_-]+)*$', caseSensitive: false),
        '',
      );
      return '$base=w1600-l90-rj';
    }
    return MediaNormalizer.upgradeBannerUrl(u);
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
            ? resolveHeroCoverUrl(rawBanner)
            : imageUrl;
        if (imageUrl.isNotEmpty) {
          cacheAvatar(name, imageUrl);
        }

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
