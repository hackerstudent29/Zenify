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
  static final RegExp _separatorPattern = RegExp(r'^\s*[•·&,\-|/\\•●¦;]\s*$');

  // Video and audio descriptors to clean from titles
  static final RegExp _bracketTagsPattern = RegExp(
    r'\s*(\[|\()\s*'
    r'(?:'
    r'official\s*(?:music\s*)?(?:video|audio|lyric\s*video|lyrical\s*video|visualizer|track|song|version)?'
    r'|lyric\s*video|lyrics\s*video|lyrics|lyrical\s*video|lyrical'
    r'|music\s*video|video\s*song|full\s*song|full\s*video(?:\s*song)?|audio\s*track|audio\s*song|full\s*audio|video'
    r'|visualizer|audio\s*visualizer'
    r'|teaser|trailer|promo|motion\s*poster|vertical\s*video|exclusive(?:\s*video)?'
    r'|remaster(?:ed)?(?:\s*\d{4})?|\d{4}\s*remaster'
    r'|4k(?:\s*ultra\s*hd|\s*uhd|\s*video)?|8k|hd(?:\s*video)?|1080p|720p'
    r'|slowed\s*(?:\+|\&)\s*reverb|speed\s*up|sped\s*up|lofi(?:\s*remix)?|8d\s*audio|bass\s*boosted'
    r'|tamil(?:\s*(?:video|audio|lyrical|song))?|telugu(?:\s*(?:video|audio|lyrical|song))?|hindi(?:\s*(?:video|audio|lyrical|song))?|malayalam(?:\s*(?:video|audio|lyrical|song))?|kannada(?:\s*(?:video|audio|lyrical|song))?|punjabi(?:\s*(?:video|audio|lyrical|song))?|english'
    r'|full\s*album(?:\s*jukebox)?|jukebox(?:\s*song)?|theme(?:\s*music)?|score|bgm'
    r')'
    r'\s*(\]|\))\s*',
    caseSensitive: false,
  );

  // Unclosed / truncated descriptor at end of title e.g. (Official Video, [Lyric, (Audio
  static final RegExp _unclosedDescriptorPattern = RegExp(
    r'\s*(\[|\()\s*'
    r'(?:'
    r'official|video|audio|lyric|visualizer|teaser|trailer|promo|motion|remaster|4k|8k|hd|slowed|sped|lofi|8d|bass|tamil|telugu|hindi|malayalam|kannada|punjabi'
    r')[^\]\)]*$',
    caseSensitive: false,
  );

  // Descriptor tail after hyphen, pipe, or dash e.g. - Video Song, | Lyric Video, - Official Video
  static final RegExp _descriptorTailPattern = RegExp(
    r'\s*[-–—|•]\s*'
    r'(?:'
    r'official\s*(?:music\s*)?(?:video|audio|lyric\s*video|track|song)?'
    r'|lyric\s*video|lyrics\s*video|lyrical\s*video|lyrical|lyrics'
    r'|video\s*song|full\s*song|full\s*video(?:\s*song)?|audio\s*song|audio\s*track|full\s*audio'
    r'|visualizer|audio\s*visualizer|teaser|trailer|promo|motion\s*poster|vertical\s*video'
    r')\s*$',
    caseSensitive: false,
  );

  // Record labels in brackets or parentheses, even with stray quotes or sub-labels
  // e.g. [Think Music], (Think Music), [think music"], [Think Music India], [Sony Music South], [T-Series]
  static final RegExp _bracketLabelPattern = RegExp(
    r'\s*(\[|\()\s*["\u201c\u201d\x27\u2018\u2019]?\s*'
    r'(?:'
    r'Think\s*Music(?:\s*(?:India|South))?'
    r'|Sony\s*Music(?:\s*(?:South|India|Entertainment))?'
    r'|T-Series(?:\s*(?:Tamil|Telugu|Bhakti|Apna|Music|Company))?'
    r'|Zee\s*Music(?:\s*(?:South|Company|Tamil|Telugu))?'
    r'|Saregama(?:\s*(?:Tamil|Telugu|Malayalam|Music))?'
    r'|Aditya\s*Music(?:\s*(?:Tamil|Telugu))?'
    r'|Lahari\s*Music(?:\s*T-Series)?'
    r'|Speed\s*Audio(?:\s*Video)?'
    r'|YRF(?:\s*Music)?|Tips(?:\s*(?:Official|Music))?'
    r'|Muzik247|Divo(?:\s*Music)?|Anand\s*Audio'
    r'|Times\s*Music|Junglee\s*Music|Eros\s*Now|SVF|Rajshri|Geetha\s*Arts|Trend\s*Music|MRT\s*Music'
    r'|Universal\s*Music|Warner\s*Music|Def\s*Jam|Atlantic\s*Records|Columbia\s*Records'
    r')[^\]\)]*(\]|\))\s*',
    caseSensitive: false,
  );

  // Unclosed record label at end of string e.g. [Think Music, [think music", (Sony Music
  static final RegExp _unclosedLabelPattern = RegExp(
    r'\s*(\[|\()\s*["\u201c\u201d\x27\u2018\u2019]?\s*'
    r'(?:'
    r'Think\s*Music|Sony\s*Music|T-Series|Zee\s*Music|Saregama|Aditya\s*Music|Lahari\s*Music'
    r'|Speed\s*Audio|YRF|Tips|Muzik247|Divo|Anand\s*Audio|Times\s*Music|Junglee\s*Music|Eros\s*Now|SVF|Rajshri|Geetha\s*Arts'
    r'|Universal\s*Music|Warner\s*Music'
    r')[^\]\)]*$',
    caseSensitive: false,
  );

  // Featuring tags in titles: (feat. ...), [feat. ...], (ft. ...), [ft. ...], (featuring ...)
  static final RegExp _featuringPattern = RegExp(
    r'\s*(\[|\()\s*(?:feat\.?|ft\.?|featuring)\b[^\]\)]*(\]|\))\s*',
    caseSensitive: false,
  );

  // Unclosed / truncated featuring at end of title: (feat., (ft., [feat., (featuring
  static final RegExp _unclosedFeaturingPattern = RegExp(
    r'\s*(\[|\()\s*(?:feat\.?|ft\.?|featuring)\b.*$',
    caseSensitive: false,
  );

  // Free-standing featuring at end of title or after hyphen: - feat. ... or feat. ...
  static final RegExp _trailingFeaturingPattern = RegExp(
    r'\s*(?:[-–—|•/]\s*)?(?:feat\.?|ft\.?|featuring)\b.*$',
    caseSensitive: false,
  );

  // Movie attribution: (From "Movie") or [From "Movie"]
  static final RegExp _fromMoviePattern = RegExp(
    r'\s*(\(|\[)\s*From\s+["\u201c\u201d\x27\u2018\u2019]?[^"\]\)]+["\u201c\u201d\x27\u2018\u2019]?\s*(\)|\])',
    caseSensitive: false,
  );

  // Unclosed movie attribution at end of title: (From "Movie...
  static final RegExp _unclosedFromMoviePattern = RegExp(
    r'\s*(\(|\[)\s*From\s+.*$',
    caseSensitive: false,
  );

  // Trailing channel / record label suffixes after pipe or hyphen
  static final RegExp _labelTailPattern = RegExp(
    r'\s*(?:[-–|•/]\s*)?'
    r'(?:'
    r'Sony\s*Music(?:\s*South)?'
    r'|T-Series(?:\s*(?:Tamil|Telugu|Bhakti|Apna|Music))?'
    r'|Zee\s*Music(?:\s*(?:South|Company))?'
    r'|Saregama(?:\s*(?:Tamil|Telugu|Malayalam|Music))?'
    r'|Aditya\s*Music(?:\s*(?:Tamil|Telugu))?'
    r'|Lahari\s*Music(?:\s*T-Series)?'
    r'|Think\s*Music(?:\s*India)?'
    r'|Speed\s*Audio\s*Video'
    r'|YRF|Tips(?:\s*Official)?'
    r')\s*$',
    caseSensitive: false,
  );

  // Album verbose suffix: (Original Motion Picture Soundtrack), OST, Deluxe, etc.
  static final RegExp _albumFluffPattern = RegExp(
    r'\s*(\[|\()\s*'
    r'(?:'
    r'Original\s*Motion\s*Picture\s*Soundtrack'
    r'|Original\s*Soundtrack'
    r'|OST'
    r'|Deluxe(?:\s*Edition)?'
    r'|Special\s*Edition'
    r'|Bonus\s*Track\s*Version'
    r'|Expanded\s*Edition'
    r'|Collector(?:\x27s)?\s*Edition'
    r'|Single'
    r'|EP'
    r')\s*(\]|\))\s*',
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

  /// Strips raw ID noise like "id: UCbRSywya_rl8YS15Lo9ttsA, name: Anirudh Ravichander"
  /// or "{id: ..., name: ...}" into pristine titles/names.
  static String stripIdNoise(String text) {
    var s = text.trim();
    if (s.isEmpty) return s;
    if (s.contains("Instance of 'ArtistRef'")) {
      s = s.replaceAll("Instance of 'ArtistRef'", '').trim();
    }
    if (s.contains("Instance of")) {
      s = s.replaceAll(RegExp(r"Instance of '[^']+'"), '').trim();
    }

    // Handles "{name: Foo, id: Bar}" or "name: Foo, id: Bar"
    final nameFirstRegex = RegExp(r'(?:\{?\s*name:\s*([^,}]+),\s*id:\s*[^}]+\}?)', caseSensitive: false);
    if (nameFirstRegex.hasMatch(s)) {
      s = s.replaceAllMapped(nameFirstRegex, (m) => m.group(1)?.trim() ?? '').trim();
    }

    // Handles "{id: Bar, name: Foo}" or "id: Bar, name: Foo"
    final idFirstRegex = RegExp(r'(?:\{?\s*id:\s*[^,]+,\s*name:\s*([^,}]+)\}?)', caseSensitive: false);
    if (idFirstRegex.hasMatch(s)) {
      s = s.replaceAllMapped(idFirstRegex, (m) => m.group(1)?.trim() ?? '').trim();
    }

    // If entire string is just a YouTube Channel ID (e.g. UCbRSywya_rI8YS15Lo9ttsA)
    if (RegExp(r'^UC[A-Za-z0-9_-]{20,24}$').hasMatch(s)) {
      return '';
    }

    // Clean raw prefixes like "id: ...", "name: ..."
    s = s.replaceAll(RegExp(r'^\s*\{?\s*id:\s*[^,]+,?\s*', caseSensitive: false), '').trim();
    s = s.replaceAll(RegExp(r'^\s*name:\s*', caseSensitive: false), '').trim();
    s = s.replaceAll(RegExp(r'^[\{\}\[\]]+|[\{\}\[\]]+$'), '').trim();
    return s;
  }

  /// Cleans titles by decoding HTML entities, removing surrounding/stray quotes,
  /// cleaning unbalanced closing parentheses, removing video descriptor tags,
  /// and stripping credit/label spam after pipes or hyphens.
  static String cleanTitle(String? raw) {
    if (raw == null) return 'Unknown Title';
    var s = decodeHtml(raw).trim();
    s = stripIdNoise(s);
    if (s.isEmpty) return 'Unknown Title';

    // 1. If title contains '|' (YouTube video credits spam: Song | Movie | Cast | Label),
    // only keep the primary song title before the first '|'.
    if (s.contains('|')) {
      final parts = s.split('|');
      final firstPart = parts.first.trim();
      if (firstPart.length >= 2) {
        s = firstPart;
      }
    }

    // 2. Strip record label brackets, unclosed labels & channel tails repeatedly
    s = s.replaceAll(_bracketLabelPattern, ' ').trim();
    s = s.replaceAll(_unclosedLabelPattern, ' ').trim();
    s = s.replaceAll(_labelTailPattern, '').trim();

    // 3. Strip descriptor tails after hyphen, dash, or pipe (e.g. - Video Song, | Lyric Video)
    s = s.replaceAll(_descriptorTailPattern, '').trim();

    // 4. Strip bracket / parenthesis tags repeatedly until none remain
    while (_bracketTagsPattern.hasMatch(s)) {
      s = s.replaceAll(_bracketTagsPattern, ' ').trim();
    }
    s = s.replaceAll(_unclosedDescriptorPattern, ' ').trim();

    // 5. Strip featuring tags (complete, unclosed, or trailing free-standing)
    s = s.replaceAll(_featuringPattern, ' ').trim();
    s = s.replaceAll(_unclosedFeaturingPattern, ' ').trim();
    s = s.replaceAll(_trailingFeaturingPattern, ' ').trim();

    // 6. Strip unclosed / stray brackets and parentheses if unmatched
    if (s.contains('(') && !s.contains(')')) {
      s = s.replaceAll(RegExp(r'\s*\([^\)]*$'), '').trim();
    }
    if (s.contains('[') && !s.contains(']')) {
      s = s.replaceAll(RegExp(r'\s*\[[^\]]*$'), '').trim();
    }
    if (s.contains(')') && !s.contains('(')) {
      s = s.replaceAll(')', '').trim();
    }
    if (s.contains(']') && !s.contains('[')) {
      s = s.replaceAll(']', '').trim();
    }

    // 7. Strip stray quotes inside or adjacent to leftover brackets/words if unmatched
    final straightQuotes = '"'.allMatches(s).length;
    if (straightQuotes.isOdd) {
      s = s.replaceAllMapped(RegExp(r'["\u201c\u201d\x27\u2018\u2019]+(\]|\))'), (m) => m.group(1)!).trim();
      s = s.replaceAllMapped(RegExp(r'(\[|\()+\s*["\u201c\u201d\x27\u2018\u2019]+'), (m) => m.group(1)!).trim();
    }

    // 8. Strip surrounding quotes (curly and straight)
    s = s.replaceAll(RegExp(r'^["\u201c\u201d\x27\u2018\u2019]+|["\u201c\u201d\x27\u2018\u2019]+$'), '').trim();

    // 9. Strip trailing hyphens, dashes, colons, or slashes e.g. "Song Name - "
    s = s.replaceAll(RegExp(r'[\s\-–—:|•/]+$'), '').trim();

    // 10. Collapse multiple spaces
    s = s.replaceAll(RegExp(r'\s{2,}'), ' ').trim();

    // 11. Capitalize first letter if all lower-case latin
    if (s.isNotEmpty) {
      final code = s.codeUnitAt(0);
      if (code >= 97 && code <= 122) {
        s = s[0].toUpperCase() + s.substring(1);
      }
    }

    return s.isNotEmpty ? s : 'Unknown Title';
  }

  /// Compact title for cards and mini player: cleans the title and strips "(From ...)" suffixes.
  static String cleanCompactTitle(String? raw) {
    var cleaned = cleanTitle(raw);
    cleaned = cleaned.replaceAll(_fromMoviePattern, '').trim();
    cleaned = cleaned.replaceAll(_unclosedFromMoviePattern, '').trim();
    cleaned = cleaned.replaceAll(_featuringPattern, '').trim();
    cleaned = cleaned.replaceAll(_unclosedFeaturingPattern, '').trim();
    cleaned = cleaned.replaceAll(_trailingFeaturingPattern, '').trim();
    cleaned = cleaned.replaceAll(RegExp(r'[\s\-–—:|•/]+$'), '').trim();
    cleaned = cleaned.replaceAll(RegExp(r'\s{2,}'), ' ').trim();
    return cleaned.isNotEmpty ? cleaned : (raw ?? 'Unknown Title');
  }

  /// Pristine clean album title: strips soundtrack fluff like "(Original Motion Picture Soundtrack)",
  /// OST, Deluxe, and movie references.
  static String cleanAlbumTitle(String? raw) {
    if (raw == null) return 'Single';
    var s = cleanTitle(raw);
    if (s.isEmpty || s.toLowerCase() == 'single') return 'Single';

    // Strip album-specific fluff: (Original Motion Picture Soundtrack), OST, etc.
    while (_albumFluffPattern.hasMatch(s)) {
      s = s.replaceAll(_albumFluffPattern, ' ').trim();
    }

    // Strip (From "Movie")
    s = s.replaceAll(_fromMoviePattern, '').trim();
    s = s.replaceAll(_unclosedFromMoviePattern, '').trim();

    // Clean stray trailing dashes/brackets
    s = s.replaceAll(RegExp(r'[\s\-–—:|•/]+$'), '').trim();
    s = s.replaceAll(RegExp(r'\s{2,}'), ' ').trim();

    return s.isNotEmpty ? s : 'Single';
  }

  /// Pristine clean playlist title: strips hashtags (#trending), year stamps ([2024]),
  /// Jukebox, and non-stop tags.
  static String cleanPlaylistTitle(String? raw) {
    if (raw == null) return 'Playlist';
    var s = cleanTitle(raw);
    if (s.isEmpty) return 'Playlist';

    // Strip hashtags: #trending, #viral, etc.
    s = s.replaceAll(RegExp(r'#[A-Za-z0-9_]+'), '').trim();

    // Strip year stamps at the end: [2024], [2025], 2024, 2025
    s = s.replaceAll(RegExp(r'[\(\[]?\s*(?:19|20)\d{2}\s*[\)\]]?$'), '').trim();

    // Strip playlist fluff
    s = s.replaceAll(RegExp(r'\s*(\(|\[)?\s*(?:Official\s*Playlist|Full\s*Album\s*Jukebox|Jukebox|Non\s*Stop)\s*(\]|\))?\s*$', caseSensitive: false), '').trim();

    s = s.replaceAll(RegExp(r'[\s\-–—:|]+$'), '').trim();
    s = s.replaceAll(RegExp(r'\s{2,}'), ' ').trim();
    return s.isNotEmpty ? s : 'Playlist';
  }

  /// Pristine clean podcast title: strips Full Episode, Video Podcast, Audio Podcast.
  static String cleanPodcastTitle(String? raw) {
    if (raw == null) return 'Podcast';
    var s = cleanTitle(raw);
    if (s.isEmpty) return 'Podcast';

    // Strip podcast fluff
    s = s.replaceAll(RegExp(r'\s*(\(|\[)?\s*(?:Full\s*Episode|Video\s*Podcast|Audio\s*Podcast)\s*(\]|\))?\s*$', caseSensitive: false), '').trim();
    s = s.replaceAll(RegExp(r'[\s\-–—:|]+$'), '').trim();
    s = s.replaceAll(RegExp(r'\s{2,}'), ' ').trim();
    return s.isNotEmpty ? s : 'Podcast';
  }

  /// Pristine single artist name cleaner.
  static String cleanArtistName(String? raw) {
    if (raw == null) return '';
    var s = decodeHtml(raw).trim();
    s = stripIdNoise(s);
    if (s.isEmpty || isMetadataNoise(s)) return '';
    if (s.contains("Instance of 'ArtistRef'") || s.contains('Instance of') || s == 'ArtistRef') {
      return '';
    }

    // Remove YouTube channel topic suffix ("Anirudh - Topic" -> "Anirudh")
    s = s.replaceAll(RegExp(r'\s*-\s*Topic$', caseSensitive: false), '').trim();

    // Remove record label bracket or tail in artist name
    s = s.replaceAll(_bracketLabelPattern, ' ').trim();
    s = s.replaceAll(_labelTailPattern, '').trim();

    // Remove channel branding suffixes
    s = s.replaceAll(RegExp(r'\s+(?:official(?:\s+(?:channel|music))?|records|vevo)$', caseSensitive: false), '').trim();

    // Remove surrounding quotes, curly quotes, parentheses, brackets
    s = s.replaceAll(RegExp(r'^["\u201c\u201d\x27\u2018\u2019\(\[\{]+|["\u201c\u201d\x27\u2018\u2019\)\]\}]+$'), '').trim();

    // Strip leading/trailing punctuation
    s = s.replaceAll(RegExp(r'^[,\-–—•·|;:/\\]+|[,\-–—•·|;:/\\]+$'), '').trim();
    s = s.replaceAll(RegExp(r'\s{2,}'), ' ').trim();

    return s;
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

  /// Splits ANY composite artist string (or List, Map, ArtistRef) into
  /// strictly individual, cleaned, deduplicated artist names.
  static List<String> splitArtistNames(dynamic rawArtists) {
    if (rawArtists == null) return const [];
    final names = <String>[];

    void addCandidate(String candidate) {
      final clean = cleanArtistName(candidate);
      if (clean.isEmpty || isMetadataNoise(clean)) return;
      final lower = clean.toLowerCase();
      if (lower == 'album' ||
          lower == 'single' ||
          lower == 'ep' ||
          lower == 'various artists' ||
          lower == 'unknown artist') {
        return;
      }
      if (!names.any((n) => n.toLowerCase() == lower)) {
        names.add(clean);
      }
    }

    void processString(String raw) {
      if (raw.trim().isEmpty) return;
      // Pre-process parenthesized/bracketed features: "(feat. X)" or "[with Y]" -> ", X"
      var s = raw.replaceAllMapped(
        RegExp(r'[\(\[]\s*(?:feat\.?|ft\.?|featuring|with)\s+([^\]\)]+)[\)\]]', caseSensitive: false),
        (m) => ', ${m.group(1)}',
      );

      final parts = s.split(RegExp(
        r'[,;•·●/\\|¦]|(?:\s*//\s*)|(?:\s*--\s*)'
        r'|(?:\s+(?:&|and|feat\.?|ft\.?|featuring|with|x|X|\+)\s+)',
        caseSensitive: false,
      ));

      for (final p in parts) {
        addCandidate(p);
      }
    }

    if (rawArtists is String) {
      processString(rawArtists);
    } else if (rawArtists is Iterable) {
      for (final item in rawArtists) {
        if (item == null) continue;
        if (item is String) {
          processString(item);
        } else if (item is Map) {
          final t = item['name'] ?? item['title'] ?? item['text'];
          if (t != null) processString(t.toString());
        } else {
          try {
            final dynamic d = item;
            final n = d.name;
            if (n is String && n.isNotEmpty && !n.contains("Instance of 'ArtistRef'")) {
              processString(n);
              continue;
            }
          } catch (_) {}
          final str = item.toString();
          if (!str.contains("Instance of 'ArtistRef'")) {
            processString(str);
          }
        }
      }
    } else {
      try {
        final dynamic d = rawArtists;
        final n = d.name;
        if (n is String && n.isNotEmpty && !n.contains("Instance of 'ArtistRef'")) {
          processString(n);
          return names;
        }
      } catch (_) {}
      final str = rawArtists.toString();
      if (!str.contains("Instance of 'ArtistRef'")) {
        processString(str);
      }
    }

    return names;
  }

  /// Cleans artist names, splits separators (&, feat., etc.), removes duplicates,
  /// and formats with Apple Music elegance: "Artist 1 & Artist 2" or "Artist 1, Artist 2 & Artist 3".
  static String formatArtists(dynamic rawArtists) {
    if (rawArtists == null) return 'Unknown Artist';

    final names = splitArtistNames(rawArtists);
    if (names.isEmpty) return 'Unknown Artist';
    if (names.length == 1) return names.first;
    if (names.length == 2) return '${names[0]} & ${names[1]}';
    return '${names.sublist(0, names.length - 1).join(', ')} & ${names.last}';
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
    if (defaultType == 'album') {
      resolvedTitle = cleanAlbumTitle(resolvedTitle);
    } else if (defaultType == 'playlist') {
      resolvedTitle = cleanPlaylistTitle(resolvedTitle);
    } else if (defaultType == 'podcast') {
      resolvedTitle = cleanPodcastTitle(resolvedTitle);
    } else {
      resolvedTitle = cleanTitle(resolvedTitle);
    }

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
    dynamic rawArtists = map['artists'] ?? map['artist'] ?? map['subtitle'] ?? map['author'];
    String? subtitleStr;
    if (rawArtists is List) {
      subtitleStr = formatArtists(rawArtists);
    } else if (rawArtists is Map) {
      subtitleStr = (rawArtists['name'] ?? rawArtists['title'])?.toString();
    } else if (rawArtists is String) {
      subtitleStr = rawArtists;
    }

    return normalize(
      id: (map['id'] ?? map['videoId'] ?? '').toString(),
      rawTitle: (map['title'] ?? map['name'])?.toString(),
      rawSubtitle: subtitleStr,
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
