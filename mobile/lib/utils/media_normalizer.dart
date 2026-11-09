/// Universal Media Normalizer for Zenify.
///
/// Ensures clean titles, accurate artist attribution, correct album metadata,
/// and high-resolution artwork across Home, Explore, Search, Library, and Player.
class MediaNormalizer {
  MediaNormalizer._();

  static final RegExp _playCountPattern = RegExp(
    r'^\s*(\d+(\.\d+)?[KMBkmb]?\+?\s*(plays|views|listeners|subscribers|streams)|\d{1,3}(,\d{3})*\s*(plays|views))\s*$',
    caseSensitive: false,
  );
  static final RegExp _durationPattern = RegExp(r'^\s*\d{1,2}:\d{2}(:\d{2})?\s*$');
  static final RegExp _yearPattern = RegExp(r'^\s*(19|20)\d{2}\s*$');
  static final RegExp _separatorPattern = RegExp(r'^\s*[•·&,\-|/\\•]\s*$');
  static final RegExp _bracketTagsPattern = RegExp(
    r'\s*(\[|\()?(official\s*(music\s*)?(video|audio|lyric\s*video)|lyric\s*video|audio\s*track|video\s*song|full\s*song|remaster(ed)?|tamil|telugu|hindi|malayalam|kannada|punjabi|english)(\]|\))?\s*$',
    caseSensitive: false,
  );
  static final RegExp _fromMoviePattern = RegExp(
    r'\s*(\(|\[)\s*From\s+["\u201c\u201d\x27\u2018\u2019]?[^"\]\)]+["\u201c\u201d\x27\u2018\u2019]?\s*(\)|\])',
    caseSensitive: false,
  );

  /// Decodes common HTML entities into UTF-8 text.
  static String decodeHtml(String text) {
    if (!text.contains('&')) return text;
    return text
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&#39;', "'")
        .replaceAll('&#x27;', "'")
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&#160;', ' ');
  }

  /// Cleans titles by decoding HTML entities, removing surrounding/stray quotes,
  /// cleaning unbalanced closing parentheses, and stripping trailing language/video tags.
  static String cleanTitle(String? raw) {
    if (raw == null) return 'Unknown Title';
    var s = decodeHtml(raw).trim();
    if (s.isEmpty) return 'Unknown Title';

    // Strip trailing [Tamil], [Hindi], (Official Video), etc.
    s = s.replaceAll(_bracketTagsPattern, '').trim();

    // Check for stray unmatched closing parenthesis at the end e.g. "Title") or Title)
    // If there is no corresponding opening '(' in the title, drop the stray ')'
    if (s.endsWith(')') && !s.contains('(')) {
      s = s.substring(0, s.length - 1).trim();
    }
    // Remove stray unbalanced closing bracket at the end
    if (s.endsWith(']') && !s.contains('[')) {
      s = s.substring(0, s.length - 1).trim();
    }

    // Remove leading/trailing quotes (including curly quotes)
    s = s.replaceAll(RegExp(r'^["\u201c\u201d\x27\u2018\u2019]+|["\u201c\u201d\x27\u2018\u2019]+$'), '').trim();

    // Handle case where quote was before stray parenthesis: e.g. "Title") -> after dropping ')' became "Title" -> quotes stripped
    if (s.endsWith(')') && !s.contains('(')) {
      s = s.substring(0, s.length - 1).trim();
    }

    return s.isNotEmpty ? s : 'Unknown Title';
  }

  /// Compact title for cards and mini player: cleans the title and strips "(From ...)" suffixes.
  static String cleanCompactTitle(String? raw) {
    final cleaned = cleanTitle(raw);
    final stripped = cleaned.replaceAll(_fromMoviePattern, '').trim();
    return stripped.isNotEmpty ? stripped : cleaned;
  }

  /// Checks if a text run is play-count, separator, duration, or metadata fluff.
  static bool isMetadataNoise(String s) {
    final trimmed = s.trim();
    if (trimmed.isEmpty) return true;
    if (_separatorPattern.hasMatch(trimmed)) return true;
    if (_playCountPattern.hasMatch(trimmed)) return true;
    if (_durationPattern.hasMatch(trimmed)) return true;
    final lower = trimmed.toLowerCase();
    if (lower == 'song' || lower == 'video' || lower == 'track') return true;
    return false;
  }

  /// Splits composite artist strings like "Artist A, Artist B & Artist C feat. Artist D"
  /// into individual distinct artist names.
  static List<String> splitArtistNames(dynamic rawArtists) {
    if (rawArtists == null) return const [];
    final names = <String>[];
    void addName(String candidate) {
      final decoded = decodeHtml(candidate).trim();
      if (decoded.isEmpty || isMetadataNoise(decoded)) return;
      final lower = decoded.toLowerCase();
      if (lower == 'album' || lower == 'single' || lower == 'ep' || lower.contains('plays') || lower.contains('views')) {
        return;
      }
      var clean = decoded.replaceAll(RegExp(r'^[\(\[\{]+|[\)\]\}]+$'), '').trim();
      if (clean.isNotEmpty && !names.any((n) => n.toLowerCase() == clean.toLowerCase())) {
        names.add(clean);
      }
    }

    if (rawArtists is String) {
      final parts = rawArtists.split(RegExp(r'[,/•·|]|(\s+(&|and|feat\.?|ft\.?|featuring)\s+)', caseSensitive: false));
      for (final p in parts) {
        addName(p);
      }
    } else if (rawArtists is Iterable) {
      for (final a in rawArtists) {
        if (a is String) {
          final parts = a.split(RegExp(r'[,/•·|]|(\s+(&|and|feat\.?|ft\.?|featuring)\s+)', caseSensitive: false));
          for (final p in parts) {
            addName(p);
          }
        } else if (a is Map) {
          final t = a['text'] ?? a['name'];
          if (t is String) {
            final parts = t.split(RegExp(r'[,/•·|]|(\s+(&|and|feat\.?|ft\.?|featuring)\s+)', caseSensitive: false));
            for (final p in parts) {
              addName(p);
            }
          }
        }
      }
    }
    return names;
  }

  /// Cleans artist names, splits separators (&, feat., etc.), removes duplicates,
  /// and formats as "Artist 1, Artist 2".
  static String formatArtists(dynamic rawArtists) {
    if (rawArtists == null) return 'Unknown Artist';

    final names = splitArtistNames(rawArtists);
    return names.isNotEmpty ? names.join(', ') : 'Unknown Artist';
  }

  /// Resolves the highest quality artwork URL (prefers 500x500 or maxresdefault).
  static String upgradeArtworkUrl(String? url, {String? videoId, int targetSize = 500}) {
    if (url == null || url.isEmpty || url.contains('lh3.googleusercontent.com/s/v4/g')) {
      if (videoId != null && videoId.isNotEmpty) {
        final cleanId = videoId.replaceFirst('yt-', '').trim();
        return 'https://i.ytimg.com/vi/$cleanId/maxresdefault.jpg';
      }
      return 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=$targetSize';
    }

    var u = url;

    // Upgrades Google / YouTube Music thumbnail resolutions
    if (u.contains('googleusercontent.com') || u.contains('ggpht.com')) {
      final hasPortraitParam = u.contains('-p') || u.contains('-c');
      final param = hasPortraitParam
          ? '=w$targetSize-h$targetSize-p-l90-rj'
          : '=w$targetSize-h$targetSize-l90-rj';
      u = u.replaceAll(RegExp(r'=(w\d+-h\d+|s\d+)[^=]*$'), param);
      if (!u.contains('=w')) {
        u = '$u$param';
      }
      return u;
    }

    // Upgrade ytimg: use hqdefault.jpg (always available, 480x360 crisp, no 404 delays)
    if (u.contains('ytimg.com/vi/')) {
      return u.replaceAll(RegExp(r'/(?:maxresdefault|mqdefault|sddefault|default)\.jpg'), '/hqdefault.jpg');
    }

    return u;
  }

  /// Normalizes raw InnerTube title and subtitle runs into a typed, verified [NormalizedMediaItem].
  static NormalizedMediaItem normalize({
    required String id,
    List? titleRuns,
    List? subtitleRuns,
    String? rawTitle,
    String? rawSubtitle,
    String? rawImageUrl,
    String defaultType = 'song',
    String? year,
    String? browseId,
    String? videoId,
  }) {
    // 1. Resolve Title
    String resolvedTitle = '';
    if (titleRuns != null && titleRuns.isNotEmpty) {
      for (final r in titleRuns) {
        if (r is Map && r['text'] is String) {
          final t = (r['text'] as String).trim();
          if (t.isNotEmpty && !isMetadataNoise(t)) {
            resolvedTitle = t;
            break;
          }
        }
      }
    }
    if (resolvedTitle.isEmpty && rawTitle != null) {
      resolvedTitle = rawTitle;
    }
    resolvedTitle = cleanTitle(resolvedTitle);

    // 2. Resolve Subtitle / Artists / Year / Type
    final artistCandidates = <String>[];
    String? resolvedYear = year;
    String resolvedType = defaultType;

    if (subtitleRuns != null && subtitleRuns.isNotEmpty) {
      for (final r in subtitleRuns) {
        if (r is! Map || r['text'] is! String) continue;
        final t = (r['text'] as String).trim();
        if (t.isEmpty || isMetadataNoise(t)) continue;

        // Check if run is year
        if (_yearPattern.hasMatch(t)) {
          resolvedYear ??= t;
          continue;
        }

        // Check if run indicates release type
        final lower = t.toLowerCase();
        if (lower == 'album' || lower == 'single' || lower == 'ep') {
          resolvedType = lower;
          continue;
        }

        // Must be an artist or creator name
        artistCandidates.add(t);
      }
    }

    String resolvedSubtitle = '';
    if (artistCandidates.isNotEmpty) {
      resolvedSubtitle = formatArtists(artistCandidates);
    } else if (rawSubtitle != null && rawSubtitle.isNotEmpty) {
      // Clean raw subtitle
      final cleanedSub = decodeHtml(rawSubtitle)
          .split('•')
          .map((s) => s.trim())
          .where((s) => !isMetadataNoise(s) && !_yearPattern.hasMatch(s))
          .toList();
      resolvedSubtitle = formatArtists(cleanedSub);
    } else {
      resolvedSubtitle = 'Unknown Artist';
    }

    // 3. Resolve Image URL
    final resolvedImage = upgradeArtworkUrl(rawImageUrl, videoId: videoId);

    return NormalizedMediaItem(
      id: id,
      title: resolvedTitle,
      subtitle: resolvedSubtitle,
      imageUrl: resolvedImage,
      type: resolvedType,
      year: resolvedYear,
      browseId: browseId,
      videoId: videoId,
    );
  }

  /// Convenience normalizer for plain Maps.
  static NormalizedMediaItem normalizeMap(Map<String, dynamic> map) {
    return normalize(
      id: (map['id'] ?? map['videoId'] ?? '').toString(),
      rawTitle: (map['title'] ?? map['name'])?.toString(),
      rawSubtitle: (map['subtitle'] ?? map['artist'] ?? map['artists'])?.toString(),
      rawImageUrl: (map['imageUrl'] ?? map['thumbnail'] ?? map['coverUrl'])?.toString(),
      defaultType: (map['type'] ?? 'song').toString(),
      year: map['year']?.toString(),
      browseId: map['browseId']?.toString(),
      videoId: (map['videoId'] ?? map['id'])?.toString(),
    );
  }
}

/// Standardized UI Model used uniformly across all Zenify screens.
class NormalizedMediaItem {
  const NormalizedMediaItem({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.imageUrl,
    this.type = 'song',
    this.year,
    this.duration,
    this.browseId,
    this.videoId,
  });

  final String id;
  final String title;
  final String subtitle;
  final String imageUrl;
  final String type; // 'song', 'album', 'artist', 'playlist'
  final String? year;
  final String? duration;
  final String? browseId;
  final String? videoId;

  /// Cleaned title (alias for title).
  String get cleanTitle => title;

  /// Clean, compact title for cards and mini player (strips "From ..." movie subtitles).
  String get compactTitle => MediaNormalizer.cleanCompactTitle(title);

  /// Full title for detailed album and now playing views.
  String get fullTitle => MediaNormalizer.cleanTitle(title);
}
