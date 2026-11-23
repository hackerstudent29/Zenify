/// Metadata enrichment entity for Zenify Replay.
///
/// Powers:
/// - F6: Composers, Singers & Film Soundtrack
/// - F8: Top Album
/// - F12: Music Geography (ISO 3166-1 alpha-2)
/// - F13: Era / Decade Breakdown
/// - Add-On: Languages Bar
class TrackMeta {
  const TrackMeta({
    required this.trackId,
    required this.language,
    required this.composers,
    required this.singers,
    this.movie,
    this.country = 'IN',
    this.year,
    this.genres = const [],
    this.albumId,
    this.durationMs,
    required this.fetchedAt,
  });

  /// Stable track ID (YouTube videoId or internal ID).
  final String trackId;

  /// Primary language name or code, e.g. "Tamil", "Hindi", "Telugu", "English".
  final String language;

  /// Canonical list of individual composers/music directors.
  final List<String> composers;

  /// Canonical list of individual vocalists/singers.
  final List<String> singers;

  /// Movie / Film soundtrack title (e.g. "Leo", "Jailer", "Vikram").
  final String? movie;

  /// ISO 3166-1 alpha-2 country code of origin (e.g. "IN", "US", "GB", "KR").
  final String country;

  /// Release year (e.g. 2023, 1992).
  final int? year;

  /// List of musical genres or tags.
  final List<String> genres;

  /// Associated album ID.
  final String? albumId;

  /// Total duration in milliseconds.
  final int? durationMs;

  /// Timestamp when this metadata record was cached or fetched.
  final DateTime fetchedAt;

  Map<String, dynamic> toJson() => {
        'trackId': trackId,
        'language': language,
        'composers': composers,
        'singers': singers,
        'movie': movie,
        'country': country,
        'year': year,
        'genres': genres,
        'albumId': albumId,
        'durationMs': durationMs,
        'fetchedAt': fetchedAt.toIso8601String(),
      };

  factory TrackMeta.fromJson(Map<String, dynamic> json) {
    return TrackMeta(
      trackId: json['trackId']?.toString() ?? '',
      language: json['language']?.toString() ?? 'Unknown',
      composers: _toStringList(json['composers']),
      singers: _toStringList(json['singers']),
      movie: json['movie']?.toString(),
      country: json['country']?.toString() ?? 'IN',
      year: (json['year'] as num?)?.toInt(),
      genres: _toStringList(json['genres']),
      albumId: json['albumId']?.toString(),
      durationMs: (json['durationMs'] as num?)?.toInt(),
      fetchedAt: DateTime.tryParse(json['fetchedAt']?.toString() ?? '')?.toUtc() ??
          DateTime.now().toUtc(),
    );
  }

  static List<String> _toStringList(dynamic val) {
    if (val is List) {
      return val.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList();
    }
    if (val is String && val.trim().isNotEmpty) {
      return val.split(',').map((e) => e.trim()).where((s) => s.isNotEmpty).toList();
    }
    return const [];
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TrackMeta &&
          runtimeType == other.runtimeType &&
          trackId == other.trackId &&
          language == other.language &&
          movie == other.movie &&
          country == other.country &&
          year == other.year;

  @override
  int get hashCode => Object.hash(trackId, language, movie, country, year);
}
