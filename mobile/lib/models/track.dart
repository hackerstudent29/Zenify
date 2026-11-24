import 'package:flutter/foundation.dart' show immutable;
import '../utils/media_normalizer.dart';
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
  final bool isVideo;
  final String? albumBrowseId;
  final String? year;

  Track({
    required this.id,
    required String title,
    required String artist,
    required String album,
    required this.coverUrl,
    this.streamUrl,
    this.durationSeconds = 210,
    String language = '',
    this.hasLyrics = true,
    this.source = 'youtube',
    this.artists = const [],
    bool isVideo = false,
    this.albumBrowseId,
    this.year,
  })  : language = (language.trim().isNotEmpty
            ? language.toLowerCase().trim()
            : (detectLanguage(title, artist, album) ?? '')),
        isVideo = isVideo || detectIsVideo(title, album, coverUrl: coverUrl),
        title = MediaNormalizer.cleanTitle(title),
        artist = MediaNormalizer.cleanArtistName(artist),
        album = (isVideo || detectIsVideo(title, album, coverUrl: coverUrl)) &&
                (album.isEmpty || album.toLowerCase() == 'single')
            ? 'Music Video'
            : MediaNormalizer.cleanAlbumTitle(album);

  static bool detectIsVideo(
    String rawTitle,
    String rawAlbum, {
    String? coverUrl,
  }) {
    final a = rawAlbum.toLowerCase().trim();
    if (a == 'music video' ||
        a == 'video' ||
        a.contains('music video') ||
        a.contains('official video')) {
      return true;
    }
    final t = rawTitle.toLowerCase();
    if (t.contains('video song') ||
        t.contains('song video') ||
        t.contains('music video') ||
        t.contains('official video') ||
        t.contains('official music video') ||
        t.contains('full video') ||
        t.contains('4k video') ||
        t.contains('hd video') ||
        t.contains('lyric video') ||
        t.contains('lyrical video') ||
        t.contains('visualizer') ||
        t.contains('performance video') ||
        t.contains('dance video') ||
        t.contains('vertical video') ||
        t.contains('(video)') ||
        t.contains('[video]') ||
        t.contains('| video') ||
        t.contains('- video') ||
        t.contains('video |') ||
        t.contains('video -') ||
        t.contains('பாடல்') ||
        t.contains('வீடியோ') ||
        t.contains('गाने') ||
        t.contains('वीडियो')) {
      return true;
    }
    if (coverUrl != null &&
        (coverUrl.contains('/vi/') ||
            coverUrl.contains('ytimg.com/vi') ||
            coverUrl.contains('maxresdefault') ||
            coverUrl.contains('hqdefault') ||
            coverUrl.contains('mqdefault') ||
            coverUrl.contains('sddefault'))) {
      return true;
    }
    return false;
  }

  factory Track.empty() => Track(
        id: '',
        title: '',
        artist: '',
        album: '',
        coverUrl: '',
        durationSeconds: 0,
        hasLyrics: false,
      );

  /// Clean, compact title for cards and mini player (strips "From ..." movie subtitles and feature tags).
  String get compactTitle => MediaNormalizer.cleanCompactTitle(title);

  /// List of distinct ArtistRef objects, parsed from [artists] or [artist].
  List<ArtistRef> get resolvedArtists {
    final List<ArtistRef> out = [];
    if (artists.isNotEmpty) {
      for (final a in artists) {
        out.addAll(ArtistRef.splitFromName(a.name, defaultImageUrl: a.imageUrl));
      }
    }
    if (out.isNotEmpty) return out;
    return ArtistRef.splitFromName(artist);
  }

  /// List of individual artist names, clean and deduplicated.
  List<String> get artistNames {
    final list = resolvedArtists;
    if (list.isNotEmpty) {
      return list.map((a) => a.name).toList();
    }
    return MediaNormalizer.splitArtistNames(artist);
  }

  /// Guaranteed non-empty artist line with Apple Music multi-artist formatting ("A & B", "A, B & C").
  String get displayArtists {
    final list = resolvedArtists;
    if (list.isNotEmpty) {
      return ArtistRef.formatList(list);
    }
    return MediaNormalizer.formatArtists(artist);
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
    final raw = '$title $artist $album';

    // 0. Native script check (100% authoritative)
    for (final rune in raw.runes) {
      if (rune >= 0x0B80 && rune <= 0x0BFF) return 'tamil';
      if (rune >= 0x0C00 && rune <= 0x0C7F) return 'telugu';
      if (rune >= 0x0900 && rune <= 0x097F) return 'hindi';
      if (rune >= 0x0D00 && rune <= 0x0D7F) return 'malayalam';
      if (rune >= 0x0C80 && rune <= 0x0CF2) return 'kannada';
      if (rune >= 0x0980 && rune <= 0x09FF) return 'bengali';
      if (rune >= 0x0A00 && rune <= 0x0A7F) return 'punjabi';
      if ((rune >= 0x3040 && rune <= 0x30FF) || (rune >= 0x4E00 && rune <= 0x9FFF && raw.contains(RegExp(r'[\u3040-\u30FF]')))) return 'japanese';
      if ((rune >= 0xAC00 && rune <= 0xD7AF) || (rune >= 0x1100 && rune <= 0x11FF)) return 'korean';
      if (rune >= 0x0600 && rune <= 0x06FF) return 'arabic';
    }

    final lower = raw.toLowerCase();

    // 1. Explicit keyword check & bracket/parentheses tags (e.g., "(Telugu)", "[Tamil]", "From Movie - Telugu")
    if (RegExp(r'\b(tamil|tamizh|kollywood)\b|\b\[ta\]|\(ta\)').hasMatch(lower)) return 'tamil';
    if (RegExp(r'\b(telugu|tollywood)\b|\b\[te\]|\(te\)').hasMatch(lower)) return 'telugu';
    if (RegExp(r'\b(hindi|bollywood)\b|\b\[hi\]|\(hi\)').hasMatch(lower)) return 'hindi';
    if (RegExp(r'\b(malayalam|mollywood)\b|\b\[ml\]|\(ml\)').hasMatch(lower)) return 'malayalam';
    if (RegExp(r'\b(kannada|sandalwood)\b|\b\[kn\]|\(kn\)').hasMatch(lower)) return 'kannada';
    if (RegExp(r'\b(punjabi|pollywood)\b').hasMatch(lower)) return 'punjabi';
    if (RegExp(r'\b(bengali)\b').hasMatch(lower)) return 'bengali';
    if (RegExp(r'\b(korean|k-pop|kpop)\b').hasMatch(lower)) return 'korean';
    if (RegExp(r'\b(japanese|j-pop|jpop|anime)\b').hasMatch(lower)) return 'japanese';
    if (RegExp(r'\b(spanish|español|espanol)\b').hasMatch(lower)) return 'spanish';

    final aLower = artist.toLowerCase();

    // 2. English / Western artist recognition (only for clear global English acts)
    if (aLower.contains('taylor swift') ||
        aLower.contains('the weeknd') ||
        aLower.contains('drake') ||
        aLower.contains('ed sheeran') ||
        aLower.contains('billie eilish') ||
        aLower.contains('coldplay') ||
        aLower.contains('dua lipa') ||
        aLower.contains('bruno mars') ||
        aLower.contains('post malone') ||
        aLower.contains('justin bieber') ||
        aLower.contains('eminem') ||
        aLower.contains('kendrick lamar') ||
        aLower.contains('rihanna') ||
        aLower.contains('ariana grande') ||
        aLower.contains('charlie puth') ||
        aLower.contains('maroon 5') ||
        aLower.contains('anitta')) {
      return 'english';
    }

    // 3. Renowned Tamil Music Directors & Artists
    if (aLower.contains('vivek - mervin') ||
        aLower.contains('vivek-mervin') ||
        aLower.contains('vivek mervin') ||
        aLower.contains('anirudh') ||
        aLower.contains('yuvan') ||
        aLower.contains('harris jayaraj') ||
        aLower.contains('santhosh narayanan') ||
        aLower.contains('g.v. prakash') ||
        aLower.contains('gv prakash') ||
        aLower.contains('hiphop tamizha') ||
        aLower.contains('imman') ||
        aLower.contains('sean roldan') ||
        aLower.contains('sam c.s') ||
        aLower.contains('sam cs') ||
        aLower.contains('deva') ||
        aLower.contains('ilayaraaja') ||
        aLower.contains('ilayaraja') ||
        aLower.contains('vidyasagar') ||
        aLower.contains('sai abhyankkar') ||
        aLower.contains('dhibu ninan thomas') ||
        aLower.contains('vijay antony') ||
        aLower.contains('bharathwaj') ||
        aLower.contains('maragathamani')) {
      if (lower.contains('telugu') || lower.contains('[te]') || lower.contains('(te)')) return 'telugu';
      if (lower.contains('hindi') || lower.contains('[hi]') || lower.contains('(hi)')) return 'hindi';
      if (lower.contains('kannada') || lower.contains('[kn]')) return 'kannada';
      if (lower.contains('malayalam') || lower.contains('[ml]')) return 'malayalam';
      return 'tamil';
    }

    // 4. Renowned Telugu Music Directors & Artists
    if (aLower.contains('devi sri prasad') ||
        aLower.contains('dsp') ||
        aLower.contains('thaman') ||
        aLower.contains('keeravaani') ||
        aLower.contains('mickey j meyer') ||
        aLower.contains('vivek sagar') ||
        aLower.contains('radhan') ||
        aLower.contains('chaitan bharadwaj') ||
        aLower.contains('bheems cecirolio') ||
        aLower.contains('mahati swara sagar')) {
      if (lower.contains('tamil') || lower.contains('[ta]')) return 'tamil';
      if (lower.contains('hindi') || lower.contains('[hi]')) return 'hindi';
      return 'telugu';
    }

    // 5. Renowned Malayalam Music Directors & Artists
    if (aLower.contains('sushin shyam') ||
        aLower.contains('shaan rahman') ||
        aLower.contains('gopi sundar') ||
        aLower.contains('deepak dev') ||
        aLower.contains('jakes bejoy') ||
        aLower.contains('hesham abdul wahab') ||
        aLower.contains('bijibal')) {
      if (lower.contains('tamil') || lower.contains('[ta]')) return 'tamil';
      if (lower.contains('telugu') || lower.contains('[te]')) return 'telugu';
      return 'malayalam';
    }

    // 6. Renowned Kannada Music Directors & Artists
    if (aLower.contains('ajaneesh') ||
        aLower.contains('charan raj') ||
        aLower.contains('ravi basrur') ||
        aLower.contains('arjun janya')) {
      if (lower.contains('tamil') || lower.contains('[ta]')) return 'tamil';
      if (lower.contains('telugu') || lower.contains('[te]')) return 'telugu';
      return 'kannada';
    }

    // 7. Renowned Hindi Music Directors & Artists
    if (aLower.contains('pritam') ||
        aLower.contains('arijit singh') ||
        aLower.contains('vishal-shekhar') ||
        aLower.contains('sachin-jigar') ||
        aLower.contains('amit trivedi') ||
        aLower.contains('mithoon') ||
        aLower.contains('tanishk bagchi') ||
        aLower.contains('shankar-ehsaan-loy') ||
        aLower.contains('amaal mallik')) {
      return 'hindi';
    }

    // 8. General A.R. Rahman check (with multi-language album awareness)
    if (aLower.contains('rahman')) {
      if (lower.contains('telugu')) return 'telugu';
      if (lower.contains('hindi')) return 'hindi';
      return 'tamil';
    }

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
    // 0. Language from raw fields before descriptor stripping
    final rawTitle = _clean(json['title']) ?? _clean(json['name']) ?? _clean(json['trackName']) ?? '';
    final rawAlbumField = json['album'] is Map ? _clean(json['album']['name'] ?? json['album']['title']) : _clean(json['album']);
    final rawArtist = json['artist'];
    final rawExplicitLang = _clean(json['language']) ??
        detectLanguage(rawTitle, rawArtist is String ? rawArtist : '', rawAlbumField ?? '');

    // 1. Title
    final title = MediaNormalizer.cleanTitle(rawTitle.isNotEmpty ? rawTitle : 'Unknown Title');

    // 2. Artist (handles String, Map, List, ArtistRef and common alternate keys)
    String? artistName;
    if (rawArtist is String) {
      artistName = MediaNormalizer.cleanArtistName(rawArtist);
    } else if (rawArtist is Map) {
      artistName = MediaNormalizer.cleanArtistName(rawArtist['name'] ?? rawArtist['title']);
    } else if (rawArtist is ArtistRef) {
      artistName = MediaNormalizer.cleanArtistName(rawArtist.name);
    } else if (rawArtist is List) {
      artistName = _artistsFromList(rawArtist);
    }
    artistName ??= _artistsFromList(json['artists']) ??
        (_clean(json['primaryArtists']) != null ? MediaNormalizer.cleanArtistName(json['primaryArtists']) : null) ??
        (_clean(json['artistName']) != null ? MediaNormalizer.cleanArtistName(json['artistName']) : null) ??
        (_clean(json['author']) != null ? MediaNormalizer.cleanArtistName(json['author']) : null) ??
        (_clean(json['uploader']) != null ? MediaNormalizer.cleanArtistName(json['uploader']) : null) ??
        (_clean(json['channel']) != null ? MediaNormalizer.cleanArtistName(json['channel']) : null);
    artistName = (artistName ?? 'Unknown Artist').trim();
    if (artistName.isEmpty || artistName.contains("Instance of 'ArtistRef'")) artistName = 'Unknown Artist';

    // 3. Album
    String? albumName;
    final rawAlbum = json['album'];
    if (rawAlbum is String) {
      albumName = MediaNormalizer.cleanAlbumTitle(rawAlbum);
    } else if (rawAlbum is Map) {
      albumName = MediaNormalizer.cleanAlbumTitle(rawAlbum['title'] ?? rawAlbum['name']);
    }
    albumName ??= (_clean(json['albumName']) != null ? MediaNormalizer.cleanAlbumTitle(json['albumName']) : null) ??
        (_clean(json['collectionName']) != null ? MediaNormalizer.cleanAlbumTitle(json['collectionName']) : null);
    albumName = (albumName != null && albumName.isNotEmpty) ? albumName : 'Single';

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
      // Upgrades all low-resolution thumbnails into pristine 1200x1200 HD
      cover = upgradeArtworkUrl(
        cover,
        videoId: id.startsWith('yt-') ? id.substring(3) : null,
      );
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
          final n = a['name'] ?? a['title'] ?? a['text'];
          if (n is String) {
            parsedArtists.addAll(ArtistRef.splitFromName(n, defaultImageUrl: a['imageUrl']?.toString()));
          }
        } else if (a is String && a.trim().isNotEmpty) {
          parsedArtists.addAll(ArtistRef.splitFromName(a));
        } else if (a is ArtistRef) {
          parsedArtists.addAll(ArtistRef.splitFromName(a.name, defaultImageUrl: a.imageUrl));
        }
      }
    }
    if (parsedArtists.isEmpty && artistName.isNotEmpty) {
      parsedArtists.addAll(ArtistRef.splitFromName(artistName));
    }

    final albumBrowseId = _clean(json['albumBrowseId']) ??
        (json['album'] is Map ? _clean(json['album']['id'] ?? json['album']['browseId']) : null);

    return Track(
      id: id,
      title: title,
      artist: artistName,
      album: albumName,
      coverUrl: cover,
      streamUrl: resolvedStream,
      durationSeconds: _parseDuration(json),
      language: rawExplicitLang ?? detectLanguage(title, artistName, albumName) ?? '',
      hasLyrics: json['hasLyrics'] == true ||
          json['synced_lyrics'] != null ||
          json['lyrics'] != null,
      source: source,
      artists: parsedArtists,
      isVideo: json['isVideo'] == true,
      albumBrowseId: albumBrowseId,
      year: (json['year'] ?? json['releaseDate'] ?? json['date'])?.toString(),
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
      if (isVideo) 'isVideo': true,
      if (albumBrowseId != null) 'albumBrowseId': albumBrowseId,
      if (year != null && year!.isNotEmpty) 'year': year,
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
    bool? isVideo,
    String? albumBrowseId,
    String? year,
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
      isVideo: isVideo ?? this.isVideo,
      albumBrowseId: albumBrowseId ?? this.albumBrowseId,
      year: year ?? this.year,
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
      .map((a) {
        if (a is ArtistRef) return a.name;
        if (a is Map) return _clean(a['name'] ?? a['title']);
        if (a is String) return MediaNormalizer.stripIdNoise(_clean(a) ?? '');
        return null;
      })
      .whereType<String>()
      .where((n) => n.isNotEmpty && !n.contains("Instance of 'ArtistRef'") && !n.contains("Instance of"))
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

/// Upgrades low-resolution thumbnails from YouTube Music and Google CDN
/// via [MediaNormalizer.upgradeArtworkUrl] into crisp HD artwork.
String upgradeArtworkUrl(
  String rawUrl, {
  String? videoId,
  int targetSize = 1200,
  bool isBanner = false,
  bool isArtistAvatar = false,
}) =>
    MediaNormalizer.upgradeArtworkUrl(
      rawUrl,
      videoId: videoId,
      targetSize: targetSize,
      isBanner: isBanner,
      isArtistAvatar: isArtistAvatar,
    );

/// Upgrades landscape hero banners (such as artist header banners) via [MediaNormalizer].
String upgradeBannerUrl(String rawUrl, {String? videoId}) =>
    MediaNormalizer.upgradeBannerUrl(rawUrl, videoId: videoId);
