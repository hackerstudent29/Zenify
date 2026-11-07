// lib/services/artist_service.dart
import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../models/track.dart';
import 'api_service.dart';
import 'innertube_service.dart';

class ArtistReleaseItem {
  const ArtistReleaseItem({
    required this.title,
    required this.year,
    required this.type, // 'Album', 'Single', 'EP'
    required this.coverUrl,
    this.browseId,
  });

  final String title;
  final String year;
  final String type;
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
    this.browseId,
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
  final String? browseId;
}

/// Builds artist pages from YouTube Music (on device) and uses the cloud
/// backend ONLY when YouTube data is missing, so the cloud is not a second
/// request on every artist open and not a single IP everyone funnels through.
class ArtistService {
  ArtistService._();
  static final ArtistService instance = ArtistService._();

  static const _ttl = Duration(minutes: 30);
  static const _negativeTtl = Duration(minutes: 2);

  static final Map<String, ({ArtistProfile profile, DateTime expires})> _cache =
      {};
  static final Map<String, Future<ArtistProfile?>> _inflight = {};
  static final Map<String, DateTime> _negative = {};

  /// Open an artist by [artistName], or directly by [browseId] (use it when
  /// navigating from a "similar artists" tile; it skips the search request).
  Future<ArtistProfile?> getArtist(
    String artistName, {
    String? browseId,
    bool forceRefresh = false,
  }) {
    final name = artistName.trim();
    if (name.isEmpty && browseId == null) return Future.value(null);

    final key = (browseId ?? name).toLowerCase();

    if (!forceRefresh) {
      final cached = _cache[key];
      if (cached != null && DateTime.now().isBefore(cached.expires)) {
        return Future.value(cached.profile);
      }
      final neg = _negative[key];
      if (neg != null && DateTime.now().isBefore(neg)) {
        // Failed a moment ago: do not retry in a loop, serve stale if any.
        return Future.value(cached?.profile);
      }
    }

    final running = _inflight[key];
    if (running != null) return running;

    final future = _load(name, browseId, key).whenComplete(() => _inflight.remove(key));
    _inflight[key] = future;
    return future;
  }

  Future<ArtistProfile?> _load(String name, String? browseId, String key) async {
    try {
      final yt = InnerTubeService.instance;

      // 1. YouTube Music: resolve the channel, then fetch it (both cached).
      ({String name, String? browseId, String? audience, String? thumb})? card;
      String? channelId = browseId;
      if (channelId == null) {
        card = await yt.searchArtist(name);
        channelId = card?.browseId;
      }
      final channel =
          channelId != null ? await yt.getArtistChannel(channelId) : null;

      // 2. Cloud enrichment only if YouTube gave us (almost) nothing, and
      //    never while YouTube is rate-limiting us (the cloud would just
      //    forward the same problem from one shared IP).
      Map<String, dynamic>? cloud;
      final ytEmpty = channel == null ||
          (((channel['topSongs'] as List?)?.isEmpty ?? true) &&
              ((channel['albums'] as List?)?.isEmpty ?? true));
      if (ytEmpty && !yt.isCoolingDown && name.isNotEmpty) {
        cloud = await _fetchCloud(name);
      }

      final display = (card?.name ?? channel?['name'] ?? cloud?['name'] ?? name)
          .toString();

      final rawImage = card?.thumb ??
          channel?['thumb'] ??
          cloud?['imageUrl'] ??
          cloud?['coverUrl'];
      final imageUrl = (rawImage is String && rawImage.isNotEmpty)
          ? upgradeArtworkUrl(rawImage)
          : 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800';

      final followers = cloud?['follower_count'];
      final audienceFromCloud =
          followers != null ? '${_formatNumber(followers)} monthly listeners' : null;

      final topSongs = <Track>[
        ...((channel?['topSongs'] as List?)?.cast<Track>() ?? const <Track>[]),
      ];
      if (topSongs.isEmpty && cloud?['topSongs'] is List) {
        for (final item in cloud!['topSongs'] as List) {
          if (item is Map) {
            try {
              topSongs.add(Track.fromJson(Map<String, dynamic>.from(item),
                  baseUrl: ApiService.liveCloudUrl));
            } catch (_) {}
          }
        }
      }
      if (topSongs.isEmpty && !yt.isCoolingDown && display.isNotEmpty) {
        topSongs.addAll((await yt.search(display)).take(15));
      }

      final profile = ArtistProfile(
        name: display,
        imageUrl: imageUrl,
        coverUrl: imageUrl,
        bio: (channel?['bio'] as String?) ??
            (cloud?['bio'] as String?) ??
            'Official artist profile for $display on Zenify. Explore popular tracks, albums and singles.',
        subscriberCount: (channel?['subscriberCount'] as String?) ??
            audienceFromCloud ??
            'Top Artist',
        monthlyAudience: card?.audience ?? audienceFromCloud,
        isVerified: cloud?['isVerified'] ?? true,
        topSongs: topSongs,
        albums: _releases(channel?['albums'] ?? cloud?['albums'], 'Album'),
        singles: _releases(channel?['singles'] ?? cloud?['singles'], 'Single'),
        featuredPlaylists:
            _playlists(channel?['playlists'] ?? cloud?['dedicatedPlaylists']),
        relatedArtists: _related(channel?['related'] ?? cloud?['relatedArtists']),
        browseId: channelId,
      );

      final hasContent = profile.topSongs.isNotEmpty ||
          profile.albums.isNotEmpty ||
          profile.singles.isNotEmpty;
      if (!hasContent) {
        _negative[key] = DateTime.now().add(_negativeTtl);
        return _cache[key]?.profile ?? profile;
      }

      _negative.remove(key);
      _cache[key] = (profile: profile, expires: DateTime.now().add(_ttl));
      if (_cache.length > 60) _cache.remove(_cache.keys.first);
      return profile;
    } catch (e) {
      if (kDebugMode) debugPrint('[ArtistService] getArtist error: $e');
      _negative[key] = DateTime.now().add(_negativeTtl);
      return _cache[key]?.profile; // stale beats nothing
    }
  }

  Future<Map<String, dynamic>?> _fetchCloud(String name) async {
    try {
      final uri = Uri.parse(
          '${ApiService.liveCloudUrl}/api/artists/${Uri.encodeComponent(name)}');
      final res = await http.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final data = jsonDecode(utf8.decode(res.bodyBytes));
        return data is Map ? Map<String, dynamic>.from(data) : null;
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[ArtistService] cloud fetch error: $e');
    }
    return null;
  }

  // ── mapping helpers (one path for YouTube and cloud shapes) ────────────────

  static final _yearRe = RegExp(r'\b(19|20)\d{2}\b');
  static final _epRe = RegExp(r'\bEP\b');

  List<ArtistReleaseItem> _releases(dynamic raw, String type) {
    if (raw is! List) return const [];
    return [
      for (final item in raw)
        if (item is Map)
          () {
            final subtitle =
                (item['year'] ?? item['releaseDate'] ?? '').toString();
            return ArtistReleaseItem(
              title: (item['title'] ?? item['name'] ?? type).toString(),
              year: _yearRe.firstMatch(subtitle)?.group(0) ?? '',
              type: (type == 'Single' && _epRe.hasMatch(subtitle)) ? 'EP' : type,
              coverUrl: (item['coverUrl'] ?? item['imageUrl'] ?? '').toString(),
              browseId: item['browseId'] as String?,
            );
          }(),
    ];
  }

  List<ArtistPlaylistItem> _playlists(dynamic raw) {
    if (raw is! List) return const [];
    return [
      for (final item in raw)
        if (item is Map)
          ArtistPlaylistItem(
            title: (item['title'] ?? 'Playlist').toString(),
            coverUrl: (item['coverUrl'] ?? item['imageUrl'] ?? '').toString(),
            browseId: item['browseId'] as String?,
          ),
    ];
  }

  List<RelatedArtistItem> _related(dynamic raw) {
    if (raw is! List) return const [];
    return [
      for (final item in raw)
        if (item is Map)
          RelatedArtistItem(
            name: (item['name'] ?? 'Artist').toString(),
            imageUrl: (item['imageUrl'] ?? '').toString(),
            subs: item['subs'] as String?,
            browseId: item['browseId'] as String?,
          ),
    ];
  }

  static String _formatNumber(dynamic n) {
    if (n is! num) return n.toString();
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return n.toString();
  }
}
