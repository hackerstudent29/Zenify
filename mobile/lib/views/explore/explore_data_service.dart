import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../models/track.dart';
import '../../services/innertube_service.dart';

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

const List<ExploreCountry> kExploreCountries = [
  ExploreCountry(code: 'IN', name: 'India', flag: '🇮🇳', query: 'trending india'),
  ExploreCountry(code: 'US', name: 'United States', flag: '🇺🇸', query: 'top hits usa'),
  ExploreCountry(code: 'GB', name: 'United Kingdom', flag: '🇬🇧', query: 'uk top charts'),
  ExploreCountry(code: 'GLOBAL', name: 'Global', flag: '🌐', query: 'global top 50'),
];

class ExploreFeaturedItem {
  const ExploreFeaturedItem({
    required this.badge,
    required this.title,
    required this.subtitle,
    required this.coverUrl,
    required this.tracks,
    this.albumTitle,
    this.artistName,
  });

  final String badge;
  final String title;
  final String subtitle;
  final String coverUrl;
  final List<Track> tracks;
  final String? albumTitle;
  final String? artistName;
}

class ExploreReleaseItem {
  const ExploreReleaseItem({
    required this.title,
    required this.artist,
    required this.coverUrl,
    required this.type,
    this.year = '2026',
    required this.tracks,
  });

  final String title;
  final String artist;
  final String coverUrl;
  final String type; // 'Album', 'EP', 'Single'
  final String year;
  final List<Track> tracks;
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

class ExplorePlaylistItem {
  const ExplorePlaylistItem({
    required this.title,
    required this.description,
    required this.coverUrl,
    required this.trackCount,
    required this.searchQuery,
  });

  final String title;
  final String description;
  final String coverUrl;
  final int trackCount;
  final String searchQuery;
}

class ExploreDataService {
  ExploreDataService._();
  static final ExploreDataService instance = ExploreDataService._();

  static const String _countryPrefKey = 'zenify_explore_country_code';
  ExploreCountry _currentCountry = kExploreCountries[0];
  ExploreCountry get currentCountry => _currentCountry;

  final Map<String, List<Track>> _countryTrackCache = {};
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
      final code = prefs.getString(_countryPrefKey);
      if (code != null) {
        final match = kExploreCountries.firstWhere(
          (c) => c.code == code,
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
    } catch (_) {}
  }

  Future<List<Track>> getTrendingForCountry(ExploreCountry country, {bool forceRefresh = false}) async {
    final key = country.code;
    if (!forceRefresh && _countryTrackCache.containsKey(key) && _countryTrackCache[key]!.isNotEmpty) {
      return _countryTrackCache[key]!;
    }

    try {
      // 1. If India, prefer on-device direct home feed
      if (country.code == 'IN') {
        final homeFeed = await InnerTubeService.instance.getHomeFeed();
        if (homeFeed.isNotEmpty) {
          _countryTrackCache[key] = homeFeed;
          return homeFeed;
        }
      }

      // 2. Query regional trending via search
      final regionalTracks = await InnerTubeService.instance.search(country.query);
      if (regionalTracks.isNotEmpty) {
        _countryTrackCache[key] = regionalTracks;
        return regionalTracks;
      }
    } catch (_) {}

    // 3. Fallback to catalog
    final catalog = CatalogDataSource.allTracks;
    _countryTrackCache[key] = catalog;
    return catalog;
  }

  void clearCache() {
    _countryTrackCache.clear();
  }
}
