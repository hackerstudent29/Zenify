import 'package:flutter/foundation.dart';

import '../models/track.dart';
import 'api_service.dart';
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
}

class ArtistService {
  ArtistService._();
  static final ArtistService instance = ArtistService._();

  static final Map<String, ({ArtistProfile profile, DateTime expires})> _cache = {};

  static void clearCache() => _cache.clear();

  Future<Map<String, dynamic>?> _fetchCloud(String cleanName) async {
    // Pure YouTube Music pipeline: no external cloud fallback
    return null;
  }

  Future<ArtistProfile?> getArtist(String artistName, {String? browseId, bool forceRefresh = false}) async {
    final cleanName = artistName.trim();
    if (cleanName.isEmpty) return null;

    final cacheKey = (browseId != null && browseId.isNotEmpty) ? browseId.toLowerCase() : cleanName.toLowerCase();
    if (!forceRefresh) {
      final cached = _cache[cacheKey];
      if (cached != null && DateTime.now().isBefore(cached.expires)) {
        return cached.profile;
      }
    }

    try {
      String? targetBrowseId = browseId;
      YTArtistCard? ytCard;

      // 1. Resolve artist via YouTube Music InnerTube directly
      if (targetBrowseId == null || targetBrowseId.isEmpty) {
        ytCard = await InnerTubeService.instance.searchArtist(cleanName);
        targetBrowseId = ytCard?.browseId;
      }

      Map<String, dynamic>? ytChannel;
      if (targetBrowseId != null && targetBrowseId.isNotEmpty) {
        ytChannel = await InnerTubeService.instance.getArtistChannel(targetBrowseId);
      }

      // If YouTube Music channel found, build 100% from pristine YouTube Music
      if (ytChannel != null) {
        final name = (ytChannel['name'] as String?)?.isNotEmpty == true
            ? ytChannel['name'] as String
            : (ytCard?.name ?? cleanName);

        final channelThumb = ytChannel['thumb'] as String?;
        final rawImage = (channelThumb != null && channelThumb.isNotEmpty)
            ? channelThumb
            : ytCard?.thumb;

        final imageUrl = (rawImage != null && rawImage.isNotEmpty)
            ? upgradeArtworkUrl(rawImage)
            : '';

        final bio = (ytChannel['bio'] as String?) ??
            'Official artist profile for $name on Zenify. Explore top popular tracks, complete discography, albums, and singles.';

        final subscriberCount = (ytChannel['subscriberCount'] as String?) ??
            ytCard?.audience ??
            'Top Artist';

        final monthlyAudience = ytCard?.audience ?? subscriberCount;

        // Top Songs (YouTube Music tracks)
        final topSongs = <Track>[];
        final ytSongs = (ytChannel['topSongs'] as List<Track>?) ?? [];
        if (ytSongs.isNotEmpty) {
          topSongs.addAll(ytSongs);
        } else {
          final searchTracks = await InnerTubeService.instance.search(cleanName);
          topSongs.addAll(searchTracks.take(15));
        }

        // Albums (YouTube Music releases)
        final albums = <ArtistReleaseItem>[];
        if (ytChannel['albums'] is List) {
          for (final item in (ytChannel['albums'] as List)) {
            albums.add(ArtistReleaseItem(
              title: item['title'] ?? 'Album',
              year: item['year'] ?? '',
              type: 'Album',
              coverUrl: item['coverUrl'] ?? '',
              browseId: item['browseId'],
            ));
          }
        }

        // Singles
        final singles = <ArtistReleaseItem>[];
        if (ytChannel['singles'] is List) {
          for (final item in (ytChannel['singles'] as List)) {
            singles.add(ArtistReleaseItem(
              title: item['title'] ?? 'Single',
              year: item['year'] ?? '',
              type: 'Single',
              coverUrl: item['coverUrl'] ?? '',
              browseId: item['browseId'],
            ));
          }
        }

        // Featured Playlists
        final playlists = <ArtistPlaylistItem>[];
        if (ytChannel['playlists'] is List) {
          for (final item in (ytChannel['playlists'] as List)) {
            playlists.add(ArtistPlaylistItem(
              title: item['title'] ?? 'Playlist',
              coverUrl: item['coverUrl'] ?? '',
              browseId: item['browseId'],
            ));
          }
        }

        // Related Artists
        final related = <RelatedArtistItem>[];
        if (ytChannel['related'] is List) {
          for (final item in (ytChannel['related'] as List)) {
            related.add(RelatedArtistItem(
              name: item['name'] ?? 'Artist',
              subs: item['subs'],
              imageUrl: item['imageUrl'] ?? '',
              browseId: item['browseId'],
            ));
          }
        }

        final profile = ArtistProfile(
          name: name,
          imageUrl: imageUrl,
          coverUrl: imageUrl,
          bio: bio,
          subscriberCount: subscriberCount,
          monthlyAudience: monthlyAudience,
          isVerified: true,
          topSongs: topSongs,
          albums: albums,
          singles: singles,
          featuredPlaylists: playlists,
          relatedArtists: related,
        );

        _cache[cacheKey] = (profile: profile, expires: DateTime.now().add(const Duration(hours: 12)));
        return profile;
      }

      // If channel not found but card was returned, build artist profile from card + YouTube search
      if (ytCard != null) {
        final ytSongs = await InnerTubeService.instance.search(cleanName);
        final img = ytCard.thumb != null ? upgradeArtworkUrl(ytCard.thumb!) : '';
        final profile = ArtistProfile(
          name: ytCard.name,
          imageUrl: img,
          coverUrl: img,
          bio: 'Official artist profile for ${ytCard.name} on Zenify.',
          subscriberCount: ytCard.audience ?? 'Top Artist',
          monthlyAudience: ytCard.audience,
          isVerified: true,
          topSongs: ytSongs,
          albums: const [],
          singles: const [],
          featuredPlaylists: const [],
          relatedArtists: const [],
        );
        _cache[cacheKey] = (profile: profile, expires: DateTime.now().add(const Duration(hours: 6)));
        return profile;
      }

      // 2. Absolute last-resort fallback to cloud ONLY if YouTube Music returned nothing at all
      final cloudData = await _fetchCloud(cleanName);
      if (cloudData != null) {
        final name = cloudData['name'] ?? cleanName;
        final rawImage = cloudData['imageUrl'] ?? cloudData['coverUrl'];
        final imageUrl = (rawImage != null && rawImage.isNotEmpty)
            ? upgradeArtworkUrl(rawImage)
            : '';
        final bio = (cloudData['bio'] as String?) ??
            'Official artist profile for $name on Zenify. Explore top popular tracks, complete discography, albums, and singles.';
        final followerCount = cloudData['follower_count'];
        final subscriberCount = followerCount != null
            ? '${_formatNumber(followerCount)} monthly listeners'
            : 'Top Artist';

        final topSongs = <Track>[];
        if (cloudData['topSongs'] is List) {
          for (final item in (cloudData['topSongs'] as List)) {
            if (item is Map) {
              try {
                topSongs.add(Track.fromJson(Map<String, dynamic>.from(item), baseUrl: ApiService.liveCloudUrl));
              } catch (_) {}
            }
          }
        }

        final albums = <ArtistReleaseItem>[];
        if (cloudData['albums'] is List) {
          for (final item in (cloudData['albums'] as List)) {
            final title = item['title'] ?? item['name'] ?? 'Album';
            final year = (item['year'] ?? item['releaseDate'] ?? '').toString().split('-').first;
            final cover = item['coverUrl'] ?? item['imageUrl'] ?? '';
            albums.add(ArtistReleaseItem(
              title: title,
              year: year,
              type: 'Album',
              coverUrl: cover,
            ));
          }
        }

        final singles = <ArtistReleaseItem>[];
        if (cloudData['singles'] is List) {
          for (final item in (cloudData['singles'] as List)) {
            final title = item['title'] ?? item['name'] ?? 'Single';
            final year = (item['year'] ?? item['releaseDate'] ?? '').toString().split('-').first;
            final cover = item['coverUrl'] ?? item['imageUrl'] ?? '';
            singles.add(ArtistReleaseItem(
              title: title,
              year: year,
              type: 'Single',
              coverUrl: cover,
            ));
          }
        }

        final playlists = <ArtistPlaylistItem>[];
        if (cloudData['dedicatedPlaylists'] is List) {
          for (final item in (cloudData['dedicatedPlaylists'] as List)) {
            playlists.add(ArtistPlaylistItem(
              title: item['title'] ?? 'Playlist',
              coverUrl: item['coverUrl'] ?? item['imageUrl'] ?? '',
            ));
          }
        }

        final related = <RelatedArtistItem>[];
        if (cloudData['relatedArtists'] is List) {
          for (final item in (cloudData['relatedArtists'] as List)) {
            related.add(RelatedArtistItem(
              name: item['name'] ?? 'Artist',
              imageUrl: item['imageUrl'] ?? '',
            ));
          }
        }

        final profile = ArtistProfile(
          name: name,
          imageUrl: imageUrl,
          coverUrl: imageUrl,
          bio: bio,
          subscriberCount: subscriberCount,
          monthlyAudience: subscriberCount,
          isVerified: cloudData['isVerified'] ?? true,
          topSongs: topSongs,
          albums: albums,
          singles: singles,
          featuredPlaylists: playlists,
          relatedArtists: related,
        );

        _cache[cacheKey] = (profile: profile, expires: DateTime.now().add(const Duration(minutes: 30)));
        return profile;
      }

      return null;
    } catch (e) {
      if (kDebugMode) debugPrint('[ArtistService] getArtist error: $e');
      return null;
    }
  }

  static String _formatNumber(dynamic n) {
    if (n is! num) return n.toString();
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
    return n.toString();
  }
}

