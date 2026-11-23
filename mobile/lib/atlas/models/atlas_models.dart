import 'dart:typed_data';

/// Pure data entities for Sound Atlas.

class AtlasCountry {
  AtlasCountry({
    required this.id,
    required this.name,
    required this.iso,
    required this.continent,
    required this.lat,
    required this.lng,
    required this.minLat,
    required this.minLng,
    required this.maxLat,
    required this.maxLng,
    required this.hasCharts,
    required this.rings,
  });

  final String id;
  final String name;
  final String iso;
  final String continent;
  final double lat;
  final double lng;
  final double minLat;
  final double minLng;
  final double maxLat;
  final double maxLng;
  final bool hasCharts;

  /// Each ring is a Float32List of [lat0, lng0, lat1, lng1, ...].
  final List<Float32List> rings;

  /// Flag emoji built from the ISO-3166 alpha-2 code.
  String get flag {
    if (iso.length != 2) return '🌐';
    return String.fromCharCodes(
      iso.toUpperCase().codeUnits.map((c) => c + 127397),
    );
  }

  /// Fast bounding-box check followed by ray-casting point-in-polygon test.
  bool contains(double pLat, double pLng) {
    if (pLat < minLat || pLat > maxLat) return false;
    // Handle longitude wrapping if bounding box crosses date line
    if (minLng <= maxLng) {
      if (pLng < minLng || pLng > maxLng) return false;
    }

    for (final ring in rings) {
      final n = ring.length ~/ 2;
      if (n < 3) continue;
      var inside = false;
      for (int i = 0, j = n - 1; i < n; j = i++) {
        final yi = ring[i * 2];
        final xi = ring[i * 2 + 1];
        final yj = ring[j * 2];
        final xj = ring[j * 2 + 1];

        final intersect =
            ((yi > pLat) != (yj > pLat)) &&
            (pLng < (xj - xi) * (pLat - yi) / (yj - yi + 1e-12) + xi);
        if (intersect) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }

  factory AtlasCountry.fromJson(Map<String, dynamic> j) {
    final rawBbox = j['bbox'] as List;
    final rawRings = j['rings'] as List;
    final rings = <Float32List>[];
    for (final r in rawRings) {
      if (r is List && r.isNotEmpty) {
        final f = Float32List(r.length);
        for (var i = 0; i < r.length; i++) {
          f[i] = (r[i] as num).toDouble();
        }
        rings.add(f);
      }
    }
    return AtlasCountry(
      id: j['id'] as String,
      name: j['name'] as String,
      iso: (j['iso'] as String).toUpperCase(),
      continent: (j['continent'] as String?) ?? 'World',
      lat: (j['lat'] as num).toDouble(),
      lng: (j['lng'] as num).toDouble(),
      minLat: (rawBbox[0] as num).toDouble(),
      minLng: (rawBbox[1] as num).toDouble(),
      maxLat: (rawBbox[2] as num).toDouble(),
      maxLng: (rawBbox[3] as num).toDouble(),
      hasCharts: (j['hasCharts'] as bool?) ?? false,
      rings: rings,
    );
  }

  @override
  bool operator ==(Object other) => other is AtlasCountry && other.iso == iso;

  @override
  int get hashCode => iso.hashCode;
}

class AtlasCity {
  const AtlasCity({
    required this.id,
    required this.name,
    required this.country,
    required this.iso,
    required this.region,
    required this.lat,
    required this.lng,
    required this.tier,
    required this.genres,
    required this.artists,
    this.playlistQuery,
    this.verifiedPlaylistId,
  });

  final String id;
  final String name;
  final String country;
  final String iso;
  final String region;
  final double lat;
  final double lng;
  final int tier;
  final List<String> genres;
  final List<String> artists;
  final String? playlistQuery;
  final String? verifiedPlaylistId;

  /// Flag emoji built from the ISO-3166 alpha-2 code. No image download needed.
  String get flag =>
      String.fromCharCodes(iso.toUpperCase().codeUnits.map((c) => c + 127397));

  factory AtlasCity.fromJson(Map<String, dynamic> j) => AtlasCity(
    id: j['id'] as String,
    name: j['name'] as String,
    country: j['country'] as String,
    iso: (j['iso'] as String).toUpperCase(),
    region: (j['region'] as String?) ?? '',
    lat: (j['lat'] as num).toDouble(),
    lng: (j['lng'] as num).toDouble(),
    tier: (j['tier'] as num?)?.toInt() ?? 2,
    genres: List<String>.from(j['genres'] as List? ?? const []),
    artists: List<String>.from(j['artists'] as List? ?? const []),
    playlistQuery: j['playlistQuery'] as String?,
    verifiedPlaylistId: j['verifiedPlaylistId'] as String?,
  );

  @override
  bool operator ==(Object other) => other is AtlasCity && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

class AtlasSong {
  const AtlasSong({
    required this.id,
    required this.title,
    required this.artist,
    this.thumbnail,
    this.album = 'Sound Atlas',
    this.durationSeconds = 210,
  });

  /// Playback id (YouTube video id).
  final String id;
  final String title;
  final String artist;
  final String? thumbnail;
  final String album;
  final int durationSeconds;
}

/// Charts data for a country (tracks and chart artists).
class AtlasCountryCharts {
  const AtlasCountryCharts({
    required this.tracks,
    required this.artists,
  });

  final List<AtlasSong> tracks;
  final List<AtlasChartArtist> artists;
}

/// Playlist data for a city.
class AtlasCityPlaylist {
  const AtlasCityPlaylist({
    required this.tracks,
    required this.playlistTitle,
    this.isVerified = false,
  });

  final List<AtlasSong> tracks;
  final String playlistTitle;
  final bool isVerified;
}

class AtlasChartArtist {
  const AtlasChartArtist({
    required this.name,
    required this.subs,
    required this.image,
  });

  final String name;
  final String subs;
  final String image;
}

/// Curated musical travel route.
class AtlasJourney {
  const AtlasJourney({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.description,
    required this.stops,
    required this.heroEmoji,
    required this.category,
  });

  final String id;
  final String title;
  final String subtitle;
  final String description;
  final List<AtlasJourneyStop> stops;
  final String heroEmoji;
  final String category;
}

class AtlasJourneyStop {
  const AtlasJourneyStop({
    required this.cityId,
    required this.cityName,
    required this.country,
    required this.iso,
    required this.lat,
    required this.lng,
    required this.description,
    required this.genre,
    this.suggestedArtist,
  });

  final String cityId;
  final String cityName;
  final String country;
  final String iso;
  final double lat;
  final double lng;
  final String description;
  final String genre;
  final String? suggestedArtist;
}

/// City vs City Community Battle entity.
class AtlasBattle {
  const AtlasBattle({
    required this.id,
    required this.cityA,
    required this.cityB,
    required this.title,
    required this.tagline,
    required this.votesA,
    required this.votesB,
  });

  final String id;
  final AtlasCity cityA;
  final AtlasCity cityB;
  final String title;
  final String tagline;
  final int votesA;
  final int votesB;

  int get totalVotes => votesA + votesB;
  double get ratioA => totalVotes == 0 ? 0.5 : votesA / totalVotes;
}

/// Unified search hit: can be a country, city, artist, genre, or musical journey.
class AtlasHit {
  const AtlasHit({
    this.city,
    this.country,
    this.artist,
    this.genre,
    this.journey,
  });

  final AtlasCity? city;
  final AtlasCountry? country;
  final String? artist;
  final String? genre;
  final AtlasJourney? journey;

  String get title {
    if (city != null) return city!.name;
    if (country != null) return country!.name;
    if (artist != null) return artist!;
    if (genre != null) return genre!;
    if (journey != null) return journey!.title;
    return '';
  }

  String get subtitle {
    if (city != null) return '${city!.flag} ${city!.country}';
    if (country != null) return '${country!.flag} ${country!.continent}';
    if (artist != null && city != null) return 'Artist · ${city!.name}';
    if (genre != null && city != null) return 'Genre · ${city!.name}';
    if (journey != null) return '${journey!.heroEmoji} ${journey!.subtitle}';
    return '';
  }
}
