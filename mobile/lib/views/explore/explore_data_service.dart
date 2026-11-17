import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../models/track.dart';
import '../../services/api_service.dart';
import '../../services/country_service.dart';
import '../../services/innertube_service.dart';
import '../../services/user_preferences_service.dart';

class ExploreCountry {
  const ExploreCountry({
    required this.code,
    required this.name,
    required this.flag,
    required this.query,
  });

  final String code;
  final String name;
  final String flag;
  final String query;
}

/// All default countries supported in Zenify + major global music markets.
const List<ExploreCountry> kExploreCountries = [
  ExploreCountry(code: 'IN', name: 'India', flag: '🇮🇳', query: 'trending india hindi tamil'),
  ExploreCountry(code: 'US', name: 'United States', flag: '🇺🇸', query: 'top hits usa billboard'),
  ExploreCountry(code: 'GB', name: 'United Kingdom', flag: '🇬🇧', query: 'uk top charts official'),
  ExploreCountry(code: 'DE', name: 'Germany', flag: '🇩🇪', query: 'germany top hits charts'),
  ExploreCountry(code: 'CA', name: 'Canada', flag: '🇨🇦', query: 'canada top hits hot'),
  ExploreCountry(code: 'AU', name: 'Australia', flag: '🇦🇺', query: 'australia top hits aria'),
  ExploreCountry(code: 'JP', name: 'Japan', flag: '🇯🇵', query: 'japan top hits jpop'),
  ExploreCountry(code: 'FR', name: 'France', flag: '🇫🇷', query: 'france top hits charts'),
  ExploreCountry(code: 'BR', name: 'Brazil', flag: '🇧🇷', query: 'brazil top hits funk sertanejo'),
  ExploreCountry(code: 'KR', name: 'South Korea', flag: '🇰🇷', query: 'kpop top hits melon'),
  ExploreCountry(code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', query: 'uae dubai top hits trending'),
  ExploreCountry(code: 'GLOBAL', name: 'Global', flag: '🌐', query: 'global top 50 hits worldwide'),
  ExploreCountry(code: 'ES', name: 'Spain', flag: '🇪🇸', query: 'top espana hits'),
  ExploreCountry(code: 'MX', name: 'Mexico', flag: '🇲🇽', query: 'mexico top hits regional'),
  ExploreCountry(code: 'IT', name: 'Italy', flag: '🇮🇹', query: 'italia top hits fimi'),
  ExploreCountry(code: 'ID', name: 'Indonesia', flag: '🇮🇩', query: 'indonesia top hits pop'),
  ExploreCountry(code: 'NG', name: 'Nigeria', flag: '🇳🇬', query: 'afrobeats nigeria top hits'),
];

class ExploreReleaseItem {
  const ExploreReleaseItem({
    required this.title,
    required this.artist,
    required this.coverUrl,
    required this.type,
    this.year = '2026',
    this.browseId,
    required this.tracks,
  });

  final String title;
  final String artist;
  final String coverUrl;
  final String type; // 'Album', 'EP', 'Single'
  final String year;
  final String? browseId;
  final List<Track> tracks;
}

class ExploreArtistItem {
  const ExploreArtistItem({
    required this.name,
    this.browseId,
    required this.photo,
    this.subs = 'Top Artist',
  });

  final String name;
  final String? browseId;
  final String photo;
  final String subs;
}

class ExplorePlaylistItem {
  const ExplorePlaylistItem({
    required this.title,
    required this.description,
    required this.coverUrl,
    required this.trackCount,
    required this.searchQuery,
    this.playlistId,
  });

  final String title;
  final String description;
  final String coverUrl;
  final int trackCount;
  final String searchQuery;
  final String? playlistId;
}

class ExploreGenreItem {
  const ExploreGenreItem({
    required this.id,
    required this.title,
    required this.gradient,
    required this.icon,
    required this.searchQuery,
  });

  final String id;
  final String title;
  final List<Color> gradient;
  final IconData icon;
  final String searchQuery;
}

class ExploreMoodItem {
  const ExploreMoodItem({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.gradient,
    required this.searchQuery,
  });

  final String id;
  final String title;
  final String subtitle;
  final IconData icon;
  final List<Color> gradient;
  final String searchQuery;
}

/// Encapsulates full realtime Explore content for a specific country and week.
class ExplorePageData {
  const ExplorePageData({
    required this.country,
    required this.featured,
    required this.weeklyTopSongs,
    required this.topArtists,
    required this.newReleases,
    required this.playlists,
    required this.updatedAt,
    required this.weekNumber,
  });

  final ExploreCountry country;
  final List<Track> featured;
  final List<Track> weeklyTopSongs;
  final List<ExploreArtistItem> topArtists;
  final List<ExploreReleaseItem> newReleases;
  final List<ExplorePlaylistItem> playlists;
  final DateTime updatedAt;
  final int weekNumber;
}

class ExploreDataService {
  ExploreDataService._();
  static final ExploreDataService instance = ExploreDataService._();

  static const String _countryPrefKey = 'zenify_explore_country_code';
  ExploreCountry _currentCountry = kExploreCountries[0];
  ExploreCountry get currentCountry => _currentCountry;

  final Map<String, ExplorePageData> _exploreCache = {};
  bool _initialized = false;

  final List<ExploreGenreItem> genres = const [
    ExploreGenreItem(
      id: 'pop',
      title: 'Pop',
      gradient: [Color(0xFFE11D48), Color(0xFFBE123C)],
      icon: Icons.music_note_rounded,
      searchQuery: 'pop hits',
    ),
    ExploreGenreItem(
      id: 'hiphop',
      title: 'Hip-Hop',
      gradient: [Color(0xFFF59E0B), Color(0xFFD97706)],
      icon: Icons.graphic_eq_rounded,
      searchQuery: 'hip hop hits',
    ),
    ExploreGenreItem(
      id: 'rock',
      title: 'Rock',
      gradient: [Color(0xFF8B5CF6), Color(0xFF6D28D9)],
      icon: Icons.electric_bolt_rounded,
      searchQuery: 'rock anthems',
    ),
    ExploreGenreItem(
      id: 'electronic',
      title: 'Electronic',
      gradient: [Color(0xFF06B6D4), Color(0xFF0891B2)],
      icon: Icons.waves_rounded,
      searchQuery: 'electronic dance music',
    ),
    ExploreGenreItem(
      id: 'rnb',
      title: 'R&B / Soul',
      gradient: [Color(0xFFEC4899), Color(0xFFBE185D)],
      icon: Icons.favorite_rounded,
      searchQuery: 'rnb soul',
    ),
    ExploreGenreItem(
      id: 'indie',
      title: 'Indie & Alt',
      gradient: [Color(0xFF10B981), Color(0xFF047857)],
      icon: Icons.nature_rounded,
      searchQuery: 'indie acoustic',
    ),
    ExploreGenreItem(
      id: 'classical',
      title: 'Classical',
      gradient: [Color(0xFF64748B), Color(0xFF334155)],
      icon: Icons.piano_rounded,
      searchQuery: 'classical piano orchestra',
    ),
    ExploreGenreItem(
      id: 'jazz',
      title: 'Jazz',
      gradient: [Color(0xFFD97706), Color(0xFF92400E)],
      icon: Icons.nightlife_rounded,
      searchQuery: 'jazz lounge',
    ),
    ExploreGenreItem(
      id: 'tamil',
      title: 'Tamil Hits',
      gradient: [Color(0xFFDC2626), Color(0xFF991B1B)],
      icon: Icons.library_music_rounded,
      searchQuery: 'tamil top hits anirudh',
    ),
    ExploreGenreItem(
      id: 'bollywood',
      title: 'Bollywood',
      gradient: [Color(0xFFF97316), Color(0xFFC2410C)],
      icon: Icons.stars_rounded,
      searchQuery: 'bollywood top hits',
    ),
  ];

  final List<ExploreMoodItem> moods = const [
    ExploreMoodItem(
      id: 'focus',
      title: 'Focus',
      subtitle: 'Deep flow & concentration',
      icon: Icons.blur_on_rounded,
      gradient: [Color(0xFF1E293B), Color(0xFF0F172A)],
      searchQuery: 'deep focus instrumental study',
    ),
    ExploreMoodItem(
      id: 'workout',
      title: 'Workout',
      subtitle: 'High energy pump & cardio',
      icon: Icons.fitness_center_rounded,
      gradient: [Color(0xFFDC2626), Color(0xFF7F1D1D)],
      searchQuery: 'workout motivation gym',
    ),
    ExploreMoodItem(
      id: 'chill',
      title: 'Chill',
      subtitle: 'Laid-back acoustic & lo-fi',
      icon: Icons.spa_rounded,
      gradient: [Color(0xFF059669), Color(0xFF064E3B)],
      searchQuery: 'chill acoustic lo-fi relax',
    ),
    ExploreMoodItem(
      id: 'sleep',
      title: 'Sleep',
      subtitle: 'Calm ambient & piano',
      icon: Icons.nights_stay_rounded,
      gradient: [Color(0xFF312E81), Color(0xFF1E1B4B)],
      searchQuery: 'sleep ambient calm relaxation',
    ),
    ExploreMoodItem(
      id: 'party',
      title: 'Party',
      subtitle: 'Weekend club & bangers',
      icon: Icons.celebration_rounded,
      gradient: [Color(0xFF9333EA), Color(0xFF581C87)],
      searchQuery: 'party dance club hits',
    ),
    ExploreMoodItem(
      id: 'romantic',
      title: 'Romantic',
      subtitle: 'Love songs & acoustic duets',
      icon: Icons.favorite_rounded,
      gradient: [Color(0xFFBE123C), Color(0xFF881337)],
      searchQuery: 'romantic love songs melody',
    ),
    ExploreMoodItem(
      id: 'travel',
      title: 'Travel',
      subtitle: 'Road trips & adventures',
      icon: Icons.directions_car_rounded,
      gradient: [Color(0xFF0284C7), Color(0xFF0369A1)],
      searchQuery: 'road trip travel acoustic',
    ),
    ExploreMoodItem(
      id: 'sad',
      title: 'Melancholy',
      subtitle: 'Emotional piano & ballads',
      icon: Icons.cloud_outlined,
      gradient: [Color(0xFF475569), Color(0xFF1E293B)],
      searchQuery: 'sad songs emotional ballads',
    ),
    ExploreMoodItem(
      id: 'happy',
      title: 'Feel Good',
      subtitle: 'Sunny vibes & upbeat pop',
      icon: Icons.wb_sunny_rounded,
      gradient: [Color(0xFFEA580C), Color(0xFF9A3412)],
      searchQuery: 'happy feel good upbeat pop',
    ),
    ExploreMoodItem(
      id: 'study',
      title: 'Study',
      subtitle: 'Ambient beats & white noise',
      icon: Icons.menu_book_rounded,
      gradient: [Color(0xFF0D9488), Color(0xFF134E4A)],
      searchQuery: 'study beats instrumental',
    ),
  ];

  Future<void> initCountry() async {
    if (_initialized) return;
    _initialized = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      var code = prefs.getString(_countryPrefKey);
      if (code == null || code.isEmpty) {
        await CountryService.instance.init();
        code = CountryService.instance.currentCode;
      }
      if (code.isEmpty) {
        await UserPreferencesService.instance.ensureLoaded();
        code = UserPreferencesService.instance.currentPrefs.countryCode;
      }
      if (code.isNotEmpty) {
        final match = kExploreCountries.firstWhere(
          (c) => c.code.toUpperCase() == code!.toUpperCase(),
          orElse: () => kExploreCountries[0],
        );
        _currentCountry = match;
      }
    } catch (_) {}
  }

  Future<void> setCountry(ExploreCountry country) async {
    _currentCountry = country;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_countryPrefKey, country.code);
      
      // Keep CountryService in two-way sync
      final matchedInfo = CountryService.supportedCountries.firstWhere(
        (info) => info.code.toUpperCase() == country.code.toUpperCase(),
        orElse: () => CountryService.defaultCountry,
      );
      CountryService.instance.setCountry(matchedInfo);
    } catch (_) {}
  }

  /// Calculates current calendar week number for weekly updates.
  int _currentWeekNumber() {
    final now = DateTime.now();
    final firstDayOfYear = DateTime(now.year, 1, 1);
    final daysOffset = firstDayOfYear.weekday - 1;
    final firstMonday = firstDayOfYear.subtract(Duration(days: daysOffset));
    return (now.difference(firstMonday).inDays / 7).ceil();
  }

  /// Fetches live realtime explore content for [country] via InnerTube.
  /// Content refreshes on a weekly boundary or when [forceRefresh] is true.
  Future<ExplorePageData> getExploreDataForCountry(
    ExploreCountry country, {
    bool forceRefresh = false,
  }) async {
    final weekNum = _currentWeekNumber();
    final now = DateTime.now();
    final cacheKey = '${country.code}_${now.year}_w$weekNum';

    if (!forceRefresh && _exploreCache.containsKey(cacheKey)) {
      return _exploreCache[cacheKey]!;
    }

    final glCode = country.code == 'GLOBAL' ? 'US' : country.code;
    List<Track> chartTracks = [];
    List<ExploreArtistItem> topArtists = [];
    List<ExploreReleaseItem> newReleases = [];

    // 1. Fetch Live InnerTube Charts (Top Songs & Famous Artists of the Week)
    try {
      final chartsRes = await InnerTubeService.instance
          .getCharts(countryCode: glCode)
          .timeout(const Duration(seconds: 5),
              onTimeout: () => (
                    tracks: <Track>[],
                    artists: <({String image, String name, String subs})>[],
                  ));

      if (chartsRes.tracks.isNotEmpty) {
        chartTracks = chartsRes.tracks;
      }
      if (chartsRes.artists.isNotEmpty) {
        topArtists = chartsRes.artists.map((a) {
          return ExploreArtistItem(
            name: a.name,
            photo: a.image,
            subs: a.subs.isNotEmpty ? a.subs : 'Top Artist • ${country.name}',
          );
        }).toList();
      }
    } catch (_) {}

    // 2. Fetch Live InnerTube New Releases for country
    List<Track> freshReleases = [];
    try {
      freshReleases = await InnerTubeService.instance
          .getNewReleases(countryCode: glCode)
          .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[]);
    } catch (_) {}

    // 3. Fallback to regional search if charts endpoint was blocked or empty
    if (chartTracks.isEmpty) {
      try {
        final searchTracks = await InnerTubeService.instance
            .search(country.query)
            .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[]);
        if (searchTracks.isNotEmpty) {
          chartTracks = searchTracks;
        } else {
          final cloudTracks = await ApiService.search(country.query)
              .timeout(const Duration(seconds: 3), onTimeout: () => <Track>[]);
          chartTracks = cloudTracks.isNotEmpty ? cloudTracks : CatalogDataSource.allTracks;
        }
      } catch (_) {
        chartTracks = CatalogDataSource.allTracks;
      }
    }

    // 4. Group / Derive New Releases
    final releasePool = freshReleases.isNotEmpty ? freshReleases : chartTracks;
    final seenAlbums = <String>{};
    for (final t in releasePool) {
      if (t.album.isEmpty || !seenAlbums.add('${t.album}|${t.artist}')) {
        continue;
      }
      newReleases.add(
        ExploreReleaseItem(
          title: t.album,
          artist: t.artist,
          coverUrl: t.coverUrl,
          type: (t.album.toLowerCase().contains('single')) ? 'Single' : 'Album',
          year: '${now.year}',
          browseId: t.albumBrowseId,
          tracks: releasePool.where((x) => x.album == t.album).toList(),
        ),
      );
      if (newReleases.length >= 14) break;
    }

    // 5. Ensure Top Artists Shelf has rich items
    if (topArtists.isEmpty || topArtists.length < 6) {
      final seenNames = <String>{for (final a in topArtists) a.name.toLowerCase()};
      
      // Inject user favorite artists matching country or general favorites
      final prefs = UserPreferencesService.instance.currentPrefs;
      for (final fa in prefs.favoriteArtists) {
        final lower = fa.name.trim().toLowerCase();
        if (lower.isNotEmpty && seenNames.add(lower)) {
          topArtists.add(ExploreArtistItem(
            name: fa.name,
            browseId: fa.id.isNotEmpty ? fa.id : null,
            photo: fa.image,
            subs: 'Favorite Artist',
          ));
        }
      }

      // Add artists extracted from top chart tracks
      for (final t in chartTracks) {
        final resolved = t.resolvedArtists;
        final name = resolved.isNotEmpty ? resolved.first.name : t.artist;
        final lower = name.trim().toLowerCase();
        if (lower.isEmpty || lower == 'unknown artist' || !seenNames.add(lower)) {
          continue;
        }
        topArtists.add(
          ExploreArtistItem(
            name: name,
            browseId: resolved.isNotEmpty ? resolved.first.id : null,
            photo: t.coverUrl,
            subs: 'Top Artist • ${country.name}',
          ),
        );
        if (topArtists.length >= 14) break;
      }
    }

    // 6. Curated Playlists for this country
    String coverAt(int idx, String fallback) {
      if (chartTracks.isEmpty) return fallback;
      final t = chartTracks[(idx * 4) % chartTracks.length];
      return t.coverUrl.isNotEmpty ? t.coverUrl : fallback;
    }

    final playlists = <ExplorePlaylistItem>[
      ExplorePlaylistItem(
        title: '${country.name} Top 50',
        description: 'Most streamed tracks this week in ${country.name}',
        coverUrl: coverAt(0, 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600'),
        trackCount: 50,
        searchQuery: '${country.name} top 50 hits official',
      ),
      ExplorePlaylistItem(
        title: '${country.name} Viral Weekly',
        description: 'Fastest rising viral songs and chart breakers',
        coverUrl: coverAt(1, 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600'),
        trackCount: 40,
        searchQuery: '${country.name} viral hits charts',
      ),
      ExplorePlaylistItem(
        title: 'Today\'s Biggest Hits',
        description: 'Chart-toppers across pop, rap and international charts',
        coverUrl: coverAt(2, 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600'),
        trackCount: 35,
        searchQuery: 'todays top hits official playlist',
      ),
      ExplorePlaylistItem(
        title: 'Late Night Chill',
        description: 'Mellow acoustic, lo-fi and ambient sessions',
        coverUrl: coverAt(3, 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600'),
        trackCount: 40,
        searchQuery: 'chill acoustic songs relax',
      ),
      ExplorePlaylistItem(
        title: 'Workout Energy',
        description: 'High-tempo cardio and gym motivation beats',
        coverUrl: coverAt(4, 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600'),
        trackCount: 45,
        searchQuery: 'workout motivation songs gym',
      ),
      ExplorePlaylistItem(
        title: 'Deep Focus & Flow',
        description: 'Instrumentals and beats for intense concentration',
        coverUrl: coverAt(5, 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=600'),
        trackCount: 50,
        searchQuery: 'deep focus study instrumental beats',
      ),
    ];

    // 7. Select Top 6 Featured Spotlight Tracks
    final seenFeatured = <String>{};
    final featured = <Track>[];
    for (final t in chartTracks) {
      final key = t.artist.toLowerCase();
      if (key.isEmpty || !seenFeatured.add(key)) continue;
      featured.add(t);
      if (featured.length >= 6) break;
    }

    final pageData = ExplorePageData(
      country: country,
      featured: featured.isNotEmpty ? featured : chartTracks.take(6).toList(),
      weeklyTopSongs: chartTracks,
      topArtists: topArtists,
      newReleases: newReleases,
      playlists: playlists,
      updatedAt: now,
      weekNumber: weekNum,
    );

    _exploreCache[cacheKey] = pageData;
    return pageData;
  }

  /// Sorts and prioritizes genres dynamically so user-selected onboarding genres
  /// and language-specific genres appear first.
  List<ExploreGenreItem> getSortedGenres({
    List<String> preferredGenres = const [],
    List<String> preferredLanguages = const [],
  }) {
    if (preferredGenres.isEmpty && preferredLanguages.isEmpty) return genres;
    final copy = List<ExploreGenreItem>.from(genres);
    final prefSet = preferredGenres.map((g) => g.toLowerCase().trim()).toSet();
    final langSet = preferredLanguages.map((l) => l.toLowerCase().trim()).toSet();

    copy.sort((a, b) {
      final aPref = prefSet.contains(a.title.toLowerCase()) ||
          prefSet.contains(a.id.toLowerCase()) ||
          langSet.any((l) => a.title.toLowerCase().contains(l) || a.searchQuery.toLowerCase().contains(l))
          ? 0
          : 1;
      final bPref = prefSet.contains(b.title.toLowerCase()) ||
          prefSet.contains(b.id.toLowerCase()) ||
          langSet.any((l) => b.title.toLowerCase().contains(l) || b.searchQuery.toLowerCase().contains(l))
          ? 0
          : 1;
      return aPref.compareTo(bPref);
    });
    return copy;
  }

  void clearCache() {
    _exploreCache.clear();
  }
}
