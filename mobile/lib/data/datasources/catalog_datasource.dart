import 'package:flutter/foundation.dart';
import '../../models/track.dart';
import '../../services/innertube_service.dart';

class CatalogDataSource {
  static final List<Track> _mockTracks = [];

  static const List<String> _categories = [
    'Top Hits', 'Trending', 'Pop', 'Hip-Hop', 'Indie', 'Rock', 'Bollywood', 'Tamil Hits', 'Lo-Fi', 'EDM'
  ];
  static const List<String> _moods = [
    'Chill', 'Workout', 'Focus', 'Commute', 'Party', 'Sleep'
  ];

  static bool _isLoading = false;
  static bool _isLoaded = false;
  static final ValueNotifier<List<Track>> tracksNotifier = ValueNotifier<List<Track>>([]);

  static Future<void> initialize() async {
    if (_isLoaded || _isLoading) return;
    _isLoading = true;

    try {
      // Direct on-device catalog load from YouTube Music
      var trending = await InnerTubeService.instance.getHomeFeed();
      if (trending.isEmpty) {
        final charts = await InnerTubeService.instance.getCharts();
        trending = charts.tracks;
      }
      if (trending.isEmpty) {
        trending = await InnerTubeService.instance.search('Top Hits');
      }

      if (trending.isNotEmpty) {
        _mockTracks.clear();
        _mockTracks.addAll(trending);
        tracksNotifier.value = List.unmodifiable(_mockTracks);
        _isLoaded = true;
      }
    } catch (e) {
      if (kDebugMode) print('[CatalogDataSource] YouTube Music catalog load notice: $e');
    } finally {
      _isLoading = false;
    }
  }

  static void clear() {
    _mockTracks.clear();
    _isLoaded = false;
    _isLoading = false;
    tracksNotifier.value = [];
  }

  static List<Track> get allTracks => _mockTracks;
  static List<String> get categories => _categories;
  static List<String> get moods => _moods;
}
