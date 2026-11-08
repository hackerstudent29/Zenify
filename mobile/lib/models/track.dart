import 'package:flutter/foundation.dart' show immutable;
import 'artist_ref.dart';

@immutable
class Track {
  final String id;
  final String title;
  final String artist;
  final String album;
  final String coverUrl;
  final String? streamUrl;
  final int durationSeconds;
  final String language;
  final bool hasLyrics;
  final String source; // 'youtube', 'local'
  final List<ArtistRef> artists;

  const Track({
    required this.id,
    required this.title,
    required this.artist,
    required this.album,
    required this.coverUrl,
    this.streamUrl,
    this.durationSeconds = 210,
    this.language = '',
    this.hasLyrics = true,
    this.source = 'youtube',
    this.artists = const [],
  });

  /// Guaranteed non-empty artist line with Apple Music multi-artist formatting ("A & B", "A, B & C").
  String get displayArtists {
    if (artists.isNotEmpty) {
      return ArtistRef.formatList(artists, fallback: artist.isNotEmpty ? artist : 'Unknown Artist');
    }
    if (artist.trim().isNotEmpty) {
      final split = artist
          .split(RegExp(r',|\s+&\s+|\s+feat\.?\s+|\s+ft\.?\s+', caseSensitive: false))
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .map((s) => ArtistRef.fromName(s))
          .toList();
      if (split.length > 1) {
        return ArtistRef.formatList(split);
      }
      return artist;
    }
    return album.isNotEmpty ? album : 'Unknown Artist';
  }

  // ───────────────────────────── Derived values ─────────────────────────────

  String get formattedDuration {
    final mins = durationSeconds ~/ 60;
    final secs = (durationSeconds % 60).toString().padLeft(2, '0');
    return '$mins:$secs';
  }

  /// "Artist • Album" (or just the artist for singles).
  String get subtitle =>
      (album.isEmpty || album == 'Single') ? artist : '$artist • $album';

  bool get hasStream => streamUrl != null && streamUrl!.isNotEmpty;

  bool get isLocal => source == 'local';

  static String? detectLanguage(String title, String artist, [String album = '']) {
    final lower = '$title $artist $album'.toLowerCase();
    if (lower.contains('tamil')) return 'tamil';
    if (lower.contains('telugu')) return 'telugu';
    if (lower.contains('hindi')) return 'hindi';
    if (lower.contains('malayalam')) return 'malayalam';
    if (lower.contains('kannada')) return 'kannada';
    if (lower.contains('punjabi')) return 'punjabi';
    return null;
  }

  // ─────────────────────────────── Parsing ──────────────────────────────────

  static const String defaultBaseUrl = 'https://zenify-78e257420386.herokuapp.com';

  /// Parses a list of raw JSON items, skipping anything malformed.
  static List<Track> listFromJson(
    Object? raw, {
    String baseUrl = defaultBaseUrl,
  }) {
    if (raw is! List) return const [];
    final out = <Track>[];
    for (final item in raw) {
      if (item is Map) {
        try {
          out.add(Track.fromJson(Map<String, dynamic>.from(item),
              baseUrl: baseUrl));
        } catch (_) {
          // Ignore one bad item instead of failing the whole response.
        }
      }
    }
    return out;
  }

  factory Track.fromJson(
    Map<String, dynamic> json, {
    String baseUrl = defaultBaseUrl,
  }) {
    // 1. Title
    final title = _clean(json['title']) ??
        _clean(json['name']) ??
        _clean(json['trackName']) ??
        'Unknown Title';

    // 2. Artist (handles String, Map, List and common alternate keys)
    String? artistName;
    final rawArtist = json['artist'];
    if (rawArtist is String) {
      artistName = _clean(rawArtist);
    } else if (rawArtist is Map) {
      artistName = _clean(rawArtist['name']);
    }
    artistName ??= _artistsFromList(json['artists']) ??
        _clean(json['primaryArtists']) ??
        _clean(json['artistName']) ??
        _clean(json['author']) ??
        _clean(json['uploader']) ??
        _clean(json['channel']);
    // YouTube auto-generated channels look like "Artist - Topic".
    artistName = (artistName ?? 'Unknown Artist')
        .replaceAll(RegExp(r'\s*-\s*Topic$'), '')
        .trim();
    if (artistName.isEmpty) artistName = 'Unknown Artist';

    // 3. Album
    String? albumName;
    final rawAlbum = json['album'];
    if (rawAlbum is String) {
      albumName = _clean(rawAlbum);
    } else if (rawAlbum is Map) {
      albumName = _clean(rawAlbum['title']) ?? _clean(rawAlbum['name']);
    }
    albumName ??= _clean(json['albumName']) ?? _clean(json['collectionName']);
    albumName ??= 'Single';

    // 4. Id (never empty, so equality and "now playing" checks stay reliable)
    final id = _clean(json['id']) ??
        _clean(json['videoId']) ??
        _clean(json['trackId']) ??
        'gen-${Object.hash(title, artistName)}';

    // 5. Artwork
    String cover = _firstUrl(json['coverUrl']) ??
        _firstUrl(json['imageUrl']) ??
        _firstUrl(json['image']) ??
        _firstUrl(json['artwork']) ??
        _firstUrl(json['artworkUrl100']) ??
        _firstUrl(json['thumbnail']) ??
        _firstUrl(json['thumbnails']) ??
        '';
    if (cover.isNotEmpty) {
      if (cover.startsWith('//')) {
        cover = 'https:$cover';
      } else if (cover.startsWith('/')) {
        cover = '$baseUrl$cover';
      }
      // Upgrades all low-resolution thumbnails into pristine 800x800 HD
      cover = upgradeArtworkUrl(cover);
    }

    // 6. Audio stream
    final rawStream = _clean(json['streamUrl']) ?? _clean(json['audioUrl']);
    String? resolvedStream;
    if (rawStream != null && rawStream.startsWith('http')) {
      resolvedStream = rawStream;
    } else {
      resolvedStream = null;
    }

    // 7. Source (YouTube-first architecture)
    final source = id.startsWith('local-') ? 'local' : 'youtube';

    // 8. Artists parsing
    final rawArtists = json['artists'];
    final List<ArtistRef> parsedArtists = [];
    if (rawArtists is List) {
      for (final a in rawArtists) {
        if (a is Map) {
          parsedArtists.add(ArtistRef.fromJson(Map<String, dynamic>.from(a)));
        } else if (a is String && a.trim().isNotEmpty) {
          parsedArtists.add(ArtistRef.fromName(a));
        }
      }
    }
    if (parsedArtists.isEmpty && artistName.isNotEmpty) {
      parsedArtists.add(ArtistRef.fromName(artistName));
    }

    return Track(
      id: id,
      title: title,
      artist: artistName,
      album: albumName,
      coverUrl: cover,
      streamUrl: resolvedStream,
      durationSeconds: _parseDuration(json),
      language: _clean(json['language']) ?? detectLanguage(title, artistName, albumName) ?? '',
      hasLyrics: json['hasLyrics'] == true ||
          json['synced_lyrics'] != null ||
          json['lyrics'] != null,
      source: source,
      artists: parsedArtists,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'artist': artist,
      'album': album,
      'coverUrl': coverUrl,
      'streamUrl': streamUrl,
      'duration': durationSeconds,
      'language': language,
      'hasLyrics': hasLyrics,
      'source': source,
      'artists': artists.map((a) => a.toJson()).toList(),
    };
  }

  Track copyWith({
    String? id,
    String? title,
    String? artist,
    String? album,
    String? coverUrl,
    String? streamUrl,
    int? durationSeconds,
    String? language,
    bool? hasLyrics,
    String? source,
    List<ArtistRef>? artists,
  }) {
    return Track(
      id: id ?? this.id,
      title: title ?? this.title,
      artist: artist ?? this.artist,
      album: album ?? this.album,
      coverUrl: coverUrl ?? this.coverUrl,
      streamUrl: streamUrl ?? this.streamUrl,
      durationSeconds: durationSeconds ?? this.durationSeconds,
      language: language ?? this.language,
      hasLyrics: hasLyrics ?? this.hasLyrics,
      source: source ?? this.source,
      artists: artists ?? this.artists,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Track && other.id == id && other.source == source;

  @override
  int get hashCode => Object.hash(id, source);

  @override
  String toString() => 'Track($id, $title — $artist)';
}

// ───────────────────────────── Parsing helpers ──────────────────────────────

/// Trims, decodes common HTML entities and returns null for blank values.
String? _clean(Object? value) {
  if (value == null) return null;
  var s = value.toString().trim();
  if (s.isEmpty || s == 'null') return null;
  s = s
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&#039;', "'")
      .replaceAll('&apos;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>');
  return s;
}

String? _artistsFromList(Object? value) {
  if (value is! List || value.isEmpty) return null;
  final names = value
      .map((a) => a is Map ? _clean(a['name']) : _clean(a))
      .whereType<String>()
      .toList();
  return names.isEmpty ? null : names.join(', ');
}

/// Accepts a URL string, `{url: ...}`, or a list of either (last = largest).
String? _firstUrl(Object? value) {
  if (value is String) return _clean(value);
  if (value is Map) return _firstUrl(value['url'] ?? value['link']);
  if (value is List && value.isNotEmpty) return _firstUrl(value.last);
  return null;
}

/// Understands seconds, milliseconds keys, numeric strings and "m:ss"/"h:mm:ss".
int _parseDuration(Map<String, dynamic> json) {
  const fallback = 210;

  final ms = json['durationMs'] ?? json['trackTimeMillis'];
  if (ms is num && ms > 0) return (ms / 1000).round();

  final d = json['duration'];
  if (d is num && d > 0) return d.round();

  if (d is String) {
    final s = d.trim();
    if (s.contains(':')) {
      final parts = s.split(':').map(int.tryParse).toList();
      if (parts.every((p) => p != null)) {
        var total = 0;
        for (final p in parts) {
          total = total * 60 + p!;
        }
        if (total > 0) return total;
      }
    }
    final n = num.tryParse(s);
    if (n != null && n > 0) return n.round();
  }
  return fallback;
}

/// Upgrades low-resolution thumbnails (e.g. 60x60, 120x120) from
/// YouTube Music and Google CDN into pristine crystal-clear
/// 800x800 HD artwork.
String upgradeArtworkUrl(String rawUrl, {String? videoId}) {
  var url = rawUrl.trim();
  if (url.isEmpty) {
    return (videoId != null && videoId.isNotEmpty)
        ? 'https://i.ytimg.com/vi/$videoId/maxresdefault.jpg'
        : '';
  }
  if (url.startsWith('//')) {
    url = 'https:$url';
  }

  // 1. YouTube Music / Google CDN (lh3.googleusercontent.com / ggpht.com):
  // InnerTube sends small sizes like =w60-h60-l90-rj or =w120-h120-l90-rj.
  // Google's dynamic image service delivers native 800x800 sharp cover art.
  if (url.contains('googleusercontent.com') || url.contains('ggpht.com')) {
    url = url.replaceAll(RegExp(r'=w\d+-h\d+[^?#]*'), '=w800-h800-l90-rj');
    url = url.replaceAll(RegExp(r'=s\d+[^?#]*'), '=w800-h800-l90-rj');
  }

  // 2. YouTube Video Thumbnails (i.ytimg.com):
  // Replace letterboxed 144p/360p defaults with 1080p HD maxresdefault.
  if (url.contains('ytimg.com')) {
    url = url.replaceAll(RegExp(r'/(?:default|mqdefault|hqdefault)\.jpg'), '/maxresdefault.jpg');
    url = url.replaceAll(RegExp(r'=w\d+-h\d+[^?#]*'), '=w800-h800-l90-rj');
  }

  return url;
}
