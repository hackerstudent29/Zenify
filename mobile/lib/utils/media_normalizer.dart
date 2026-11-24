import '../services/settings_service.dart';

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
  static final RegExp _durationPattern = RegExp(
    r'^\s*\d{1,2}:\d{2}(:\d{2})?\s*$',
  );
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

  /// Exact and substring pattern for known record labels, distributors, channels, and production banners
  static final RegExp _distributorLabelExactPattern = RegExp(
    r'^(?:'
    r'Think\s*Music(?:\s*(?:India|South|Official))?'
    r'|Sony\s*Music(?:\s*(?:South|India|Entertainment|Official))?'
    r'|SonyMusicSouthVEVO|SonyMusicIndiaVEVO'
    r'|T-Series(?:\s*(?:Tamil|Telugu|Bhakti|Apna|Music|Company|Malayalam|Kannada|Bhakti\s*Sagar|Old))?'
    r'|Zee\s*Music(?:\s*(?:South|Company|Tamil|Telugu))?'
    r'|Zee\s*Studios?'
    r'|Saregama(?:\s*(?:Tamil|Telugu|Malayalam|Music|Kannada|Bhojpuri))?'
    r'|Aditya\s*Music(?:\s*(?:Tamil|Telugu|India|Devotional))?'
    r'|Lahari\s*Music(?:\s*(?:T-Series|South))?'
    r'|Speed\s*Audio(?:\s*Video)?|Speed\s*Records'
    r'|YRF(?:\s*Music)?|Yash\s*Raj\s*Films?'
    r'|Tips(?:\s*(?:Official|Music|Industries|Bhojpuri|Gujarati))?'
    r'|Muzik247|Divo(?:\s*(?:Music|Movies|South))?|Anand\s*Audio'
    r'|Times\s*Music(?:\s*South)?|Junglee\s*Music(?:\s*(?:Tamil|Telugu|South))?'
    r'|Eros\s*Now(?:\s*(?:Music|South))?|SVF|Rajshri(?:\s*(?:Tamil|Telugu|Music))?|Geetha\s*Arts|Trend\s*Music|MRT\s*Music|Silly\s*Monks'
    r'|Universal\s*Music(?:\s*(?:India|Group))?|Warner\s*Music(?:\s*(?:India|South\s*Asia))?|Def\s*Jam(?:\s*India)?|Atlantic\s*Records|Columbia\s*Records'
    r'|Sun\s*TV|Sun\s*Pictures|Sun\s*NXT'
    r'|Sony\s*Pictures(?:\s*(?:India|Releasing))?'
    r'|Red\s*Giant\s*Movies|Lyca\s*Productions'
    r'|Studio\s*Green|Seven\s*Screen\s*Studio'
    r')$',
    caseSensitive: false,
  );

  /// Trailing suffixes indicating distributor channels rather than individual musical artists
  static final RegExp _distributorSuffixPattern = RegExp(
    r'\b(?:'
    r'music(?:\s*(?:south|india|company|entertainment|official|tamil|telugu))?'
    r'|records|recordings|entertainment|audio\s*video|production[s]?|vevo|studios?|pictures?|films?|media|channel|tv'
    r')\b',
    caseSensitive: false,
  );

  /// Checks whether a name corresponds to a music distributor, record label,
  /// video publisher, or production house rather than an actual recording artist.
  static bool isDistributorOrLabel(String? raw) {
    if (raw == null) return false;
    final s = decodeHtml(raw).trim();
    if (s.isEmpty) return false;
    if (_distributorLabelExactPattern.hasMatch(s)) return true;

    // Check lowercase token match
    final lower = s.toLowerCase();
    if (lower == 'sun tv' ||
        lower == 'sun pictures' ||
        lower == 'sun nxt' ||
        lower == 'muzik247' ||
        lower == 'divo' ||
        lower == 'divo music' ||
        lower == 'divo movies' ||
        lower == 'tips official' ||
        lower == 'tips music' ||
        lower == 'yrf' ||
        lower == 'svf' ||
        lower == 'saregama' ||
        lower == 't-series' ||
        lower == 'tseries' ||
        lower == 'vevo') {
      return true;
    }

    if (lower.contains('sony music') ||
        lower.contains('think music') ||
        lower.contains('t-series') ||
        lower.contains('zee music') ||
        lower.contains('aditya music') ||
        lower.contains('lahari music') ||
        lower.contains('speed audio') ||
        lower.contains('junglee music') ||
        lower.contains('times music') ||
        lower.contains('speed records')) {
      return true;
    }

    // Check if name ends with common channel / distributor markers e.g. "Foo Records", "Bar Music"
    if (_distributorSuffixPattern.hasMatch(s) &&
        (lower.contains('music') ||
            lower.contains('records') ||
            lower.contains('pictures') ||
            lower.contains('studios') ||
            lower.contains('entertainment') ||
            lower.contains('audio video'))) {
      return true;
    }

    return false;
  }

  /// Extracts true recording artists and vocalists from a video song's description text.
  /// Handles distributor credit blocks ("Singers: ...", "Vocals: ...", "Music: ...")
  /// as well as YouTube Music automated release delivery blocks.
  static String extractArtistsFromDescription(String? description) {
    if (description == null || description.trim().isEmpty) return '';
    final text = decodeHtml(description);

    // 1. Singer(s) / Vocal(s) / Artist(s) line
    final vocalMatch = RegExp(
      r'(?:Singers?|Vocals?|Artists?|Singers?\s*(?:&|and)\s*Vocals?)\s*[:\-–—|]\s*([^\r\n•\t|]+)',
      caseSensitive: false,
    ).firstMatch(text);
    if (vocalMatch != null) {
      final raw = vocalMatch.group(1)?.trim();
      if (raw != null && raw.isNotEmpty && !isDistributorOrLabel(raw)) {
        final formatted = formatArtists(raw);
        if (formatted.isNotEmpty && formatted.toLowerCase() != 'unknown artist') {
          return formatted;
        }
      }
    }

    // 2. Music Director / Composer line (prominent primary creator in Indian and global releases)
    final musicMatch = RegExp(
      r'(?:Music(?:\s*Director|\s*Composed\s*by|\s*by)?|Composed\s*by|Composer)\s*[:\-–—|]\s*([^\r\n•\t|]+)',
      caseSensitive: false,
    ).firstMatch(text);
    if (musicMatch != null) {
      final raw = musicMatch.group(1)?.trim();
      if (raw != null && raw.isNotEmpty && !isDistributorOrLabel(raw)) {
        final formatted = formatArtists(raw);
        if (formatted.isNotEmpty && formatted.toLowerCase() != 'unknown artist') {
          return formatted;
        }
      }
    }

    // 3. YouTube Music automated delivery description:
    // "Provided to YouTube by ..."
    // "Track Title · Artist 1 · Artist 2"
    final autoMatch = RegExp(
      r'Provided to YouTube by[^\r\n]*\r?\n+([^\r\n]+)',
      caseSensitive: false,
    ).firstMatch(text);
    if (autoMatch != null) {
      final line = autoMatch.group(1)?.trim() ?? '';
      if (line.contains('·')) {
        final parts = line.split('·').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
        if (parts.length > 1) {
          final artistParts = parts.sublist(1).where((a) => !isDistributorOrLabel(a)).toList();
          if (artistParts.isNotEmpty) {
            final formatted = formatArtists(artistParts);
            if (formatted.isNotEmpty && formatted.toLowerCase() != 'unknown artist') {
              return formatted;
            }
          }
        }
      }
    }

    return '';
  }

  /// Extracts the original release or upload year from description text.
  static String? extractYearFromDescription(String? description) {
    if (description == null || description.trim().isEmpty) return null;
    final text = decodeHtml(description);

    final relMatch = RegExp(
      r'Released on\s*[:\-–—]?\s*[^\r\n]*?\b(19\d{2}|20\d{2})\b',
      caseSensitive: false,
    ).firstMatch(text);
    if (relMatch != null) return relMatch.group(1);

    final pMatch = RegExp(r'℗\s*(19\d{2}|20\d{2})').firstMatch(text);
    if (pMatch != null) return pMatch.group(1);

    final dateMatch = RegExp(
      r'Release Date\s*[:\-–—]?\s*[^\r\n]*?\b(19\d{2}|20\d{2})\b',
      caseSensitive: false,
    ).firstMatch(text);
    if (dateMatch != null) return dateMatch.group(1);

    final yearMatch = RegExp(
      r'\b(?:Year|Premiered|Uploaded?|Published)\s*[:\-–—]?\s*[^\r\n]*?\b(19\d{2}|20\d{2})\b',
      caseSensitive: false,
    ).firstMatch(text);
    if (yearMatch != null) return yearMatch.group(1);

    return null;
  }

  /// Extracts authentic musical artists from a video song's title when the uploader
  /// is a distributor / channel or when metadata attribution is missing.
  static String extractArtistsFromVideoTitle(
    String? rawTitle, {
    String? defaultArtist,
  }) {
    if (rawTitle == null || rawTitle.trim().isEmpty) {
      return defaultArtist ?? '';
    }
    final raw = decodeHtml(rawTitle).trim();

    // 1. Pipe-separated Indian cinema music video format:
    // "LEO - Naa Ready Lyric Video | Thalapathy Vijay | Lokesh Kanagaraj | Anirudh Ravichander"
    // "Monica - Video Song | COOLIE | Superstar Rajinikanth | Sun Pictures | Lokesh | Anirudh | Pooja Hegde"
    // "Remo - Sirikkadhey Music Video | Anirudh Ravichander"
    if (raw.contains('|')) {
      final parts = raw.split('|').map((p) => p.trim()).where((p) => p.isNotEmpty).toList();
      final artistCandidates = <String>[];

      for (var i = 1; i < parts.length; i++) {
        var segment = parts[i];
        segment = segment.replaceAll(
          RegExp(
            r'^(?:superstar|starring|cast|director|directed by|produced by|music(?:\s*by)?|singer[s]?|vocal[s]?)\s*[:\-–—]?\s*',
            caseSensitive: false,
          ),
          '',
        ).trim();

        if (segment.isEmpty ||
            isDistributorOrLabel(segment) ||
            isMetadataNoise(segment) ||
            _bracketTagsPattern.hasMatch(segment) ||
            _descriptorTailPattern.hasMatch(segment)) {
          continue;
        }

        final lower = segment.toLowerCase();
        if (lower.contains('promo') ||
            lower.contains('teaser') ||
            lower.contains('trailer') ||
            lower.contains('exclusive') ||
            lower.contains('lyric video') ||
            lower.contains('video song') ||
            lower.contains('full video') ||
            lower.contains('song video') ||
            lower.contains('lyrical video')) {
          continue;
        }

        artistCandidates.add(segment);
      }

      if (artistCandidates.isNotEmpty) {
        if (defaultArtist != null && defaultArtist.isNotEmpty) {
          final defLower = defaultArtist.toLowerCase();
          final matches = artistCandidates
              .where((a) =>
                  a.toLowerCase().contains(defLower) ||
                  defLower.contains(a.toLowerCase()))
              .toList();
          if (matches.isNotEmpty) {
            return formatArtists(matches.first);
          }
        }
        return formatArtists(artistCandidates.take(3).toList());
      }
    }

    // 2. "Artist - Title" or "Title - Artist" format
    // e.g. "Cartoon, Jéja - On & On (feat. Daniel Levi)"
    // e.g. "Alan Walker - Faded"
    // e.g. "Ed Sheeran - Shape of You"
    final dashMatch = RegExp(r'^([^\-–—|]+)\s*[\-–—]\s*([^\-–—|]+)').firstMatch(raw);
    if (dashMatch != null) {
      final left = dashMatch.group(1)!.trim();
      final right = dashMatch.group(2)!.trim();

      final leftClean = cleanArtistName(left);
      if (leftClean.isNotEmpty &&
          !isDistributorOrLabel(leftClean) &&
          !isMetadataNoise(leftClean) &&
          !_bracketTagsPattern.hasMatch(left) &&
          leftClean.length > 2) {
        final featMatch = RegExp(
          r'[\(\[]\s*(?:feat\.?|ft\.?|featuring)\s+([^\]\)]+)[\)\]]',
          caseSensitive: false,
        ).firstMatch(right);
        if (featMatch != null) {
          return formatArtists('$leftClean, ${featMatch.group(1)}');
        }
        return formatArtists(leftClean);
      }

      final rightClean = cleanArtistName(right);
      if (rightClean.isNotEmpty &&
          !isDistributorOrLabel(rightClean) &&
          !isMetadataNoise(rightClean) &&
          !_bracketTagsPattern.hasMatch(right) &&
          rightClean.length > 2) {
        return formatArtists(rightClean);
      }
    }

    if (defaultArtist != null && defaultArtist.trim().isNotEmpty) {
      return cleanArtistName(defaultArtist);
    }

    return '';
  }

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
    final nameFirstRegex = RegExp(
      r'(?:\{?\s*name:\s*([^,}]+),\s*id:\s*[^}]+\}?)',
      caseSensitive: false,
    );
    if (nameFirstRegex.hasMatch(s)) {
      s = s
          .replaceAllMapped(nameFirstRegex, (m) => m.group(1)?.trim() ?? '')
          .trim();
    }

    // Handles "{id: Bar, name: Foo}" or "id: Bar, name: Foo"
    final idFirstRegex = RegExp(
      r'(?:\{?\s*id:\s*[^,]+,\s*name:\s*([^,}]+)\}?)',
      caseSensitive: false,
    );
    if (idFirstRegex.hasMatch(s)) {
      s = s
          .replaceAllMapped(idFirstRegex, (m) => m.group(1)?.trim() ?? '')
          .trim();
    }

    // If entire string is just a YouTube Channel ID (e.g. UCbRSywya_rI8YS15Lo9ttsA)
    if (RegExp(r'^UC[A-Za-z0-9_-]{20,24}$').hasMatch(s)) {
      return '';
    }

    // Clean raw prefixes like "id: ...", "name: ..."
    s = s
        .replaceAll(
          RegExp(r'^\s*\{?\s*id:\s*[^,]+,?\s*', caseSensitive: false),
          '',
        )
        .trim();
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
      s = s
          .replaceAllMapped(
            RegExp(r'["\u201c\u201d\x27\u2018\u2019]+(\]|\))'),
            (m) => m.group(1)!,
          )
          .trim();
      s = s
          .replaceAllMapped(
            RegExp(r'(\[|\()+\s*["\u201c\u201d\x27\u2018\u2019]+'),
            (m) => m.group(1)!,
          )
          .trim();
    }

    // 8. Strip surrounding quotes (curly and straight)
    s = s
        .replaceAll(
          RegExp(
            r'^["\u201c\u201d\x27\u2018\u2019]+|["\u201c\u201d\x27\u2018\u2019]+$',
          ),
          '',
        )
        .trim();

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
    s = s
        .replaceAll(
          RegExp(
            r'\s*(\(|\[)?\s*(?:Official\s*Playlist|Full\s*Album\s*Jukebox|Jukebox|Non\s*Stop)\s*(\]|\))?\s*$',
            caseSensitive: false,
          ),
          '',
        )
        .trim();

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
    s = s
        .replaceAll(
          RegExp(
            r'\s*(\(|\[)?\s*(?:Full\s*Episode|Video\s*Podcast|Audio\s*Podcast)\s*(\]|\))?\s*$',
            caseSensitive: false,
          ),
          '',
        )
        .trim();
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
    if (s.contains("Instance of 'ArtistRef'") ||
        s.contains('Instance of') ||
        s == 'ArtistRef') {
      return '';
    }

    // Reject standalone music distributors and record labels
    if (isDistributorOrLabel(s)) {
      return '';
    }

    // Remove YouTube channel topic suffix ("Anirudh - Topic" -> "Anirudh")
    s = s.replaceAll(RegExp(r'\s*-\s*Topic$', caseSensitive: false), '').trim();

    // Remove record label bracket or tail in artist name
    s = s.replaceAll(_bracketLabelPattern, ' ').trim();
    s = s.replaceAll(_labelTailPattern, '').trim();

    // Remove channel branding suffixes
    s = s
        .replaceAll(
          RegExp(
            r'\s+(?:official(?:\s+(?:channel|music))?|records|vevo)$',
            caseSensitive: false,
          ),
          '',
        )
        .trim();

    // Remove surrounding quotes, curly quotes, parentheses, brackets
    s = s
        .replaceAll(
          RegExp(
            r'^["\u201c\u201d\x27\u2018\u2019\(\[\{]+|["\u201c\u201d\x27\u2018\u2019\)\]\}]+$',
          ),
          '',
        )
        .trim();

    // Strip leading/trailing punctuation
    s = s.replaceAll(RegExp(r'^[,\-–—•·|;:/\\]+|[,\-–—•·|;:/\\]+$'), '').trim();
    s = s.replaceAll(RegExp(r'\s{2,}'), ' ').trim();

    if (isDistributorOrLabel(s)) return '';

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
      if (clean.isEmpty || isMetadataNoise(clean) || isDistributorOrLabel(clean)) return;
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
      var s = decodeHtml(raw).trim();
      s = s.replaceAll('\u00A0', ' ');
      s = s.replaceAll(RegExp(r'&amp;', caseSensitive: false), '&');
      // Pre-process parenthesized/bracketed features: "(feat. X)" or "[with Y]" -> ", X"
      s = s.replaceAllMapped(
        RegExp(
          r'[\(\[]\s*(?:feat\.?|ft\.?|featuring|with)\s+([^\]\)]+)[\)\]]',
          caseSensitive: false,
        ),
        (m) => ', ${m.group(1)}',
      );

      final parts = s.split(
        RegExp(
          r'[,;•·●/\\|¦]|(?:\s*//\s*)|(?:\s*--\s*)'
          r'|(?:\s*&\s*)'
          r'|(?:\s+(?:and|feat\.?|ft\.?|featuring|with|x|X|\+)\s+)',
          caseSensitive: false,
        ),
      );

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
            if (n is String &&
                n.isNotEmpty &&
                !n.contains("Instance of 'ArtistRef'")) {
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
        if (n is String &&
            n.isNotEmpty &&
            !n.contains("Instance of 'ArtistRef'")) {
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

  static final RegExp _googleDimRe = RegExp(
    r'=(?:w(\d+)-h(\d+)|s(\d+))([^?#]*)$',
    caseSensitive: false,
  );
  static final RegExp _ytimgIdRe = RegExp(
    r'(?:ytimg\.com|img\.youtube\.com)/vi(?:_webp)?/([A-Za-z0-9_-]{6,20})/',
    caseSensitive: false,
  );

  /// Resolves high-definition InnerTube artwork (retina 720x720 square covers/avatars,
  /// 1920x1080 wide banners, or 1280x720 maxresdefault video thumbnails) optimized
  /// for minimum data consumption with pristine visual fidelity.
  static String upgradeArtworkUrl(
    String? url, {
    String? videoId,
    int? targetSize,
    bool isBanner = false,
    bool isArtistAvatar = false,
    String? qualityOverride,
  }) {
    final imgQuality = qualityOverride ?? SettingsState.instance.imageQuality;
    final int maxQualitySize = switch (imgQuality) {
      'low' => 180,
      'medium' => 400,
      'high' => 800,
      _ => 400,
    };
    final int effectiveTargetSize = targetSize != null
        ? targetSize.clamp(60, maxQualitySize)
        : maxQualitySize;

    if (url == null ||
        url.trim().isEmpty ||
        url.contains('lh3.googleusercontent.com/s/v4/g')) {
      if (videoId != null && videoId.trim().isNotEmpty) {
        final cleanId = videoId.replaceFirst('yt-', '').trim();
        final thumb = switch (imgQuality) {
          'low' => 'mqdefault.jpg',
          'medium' => 'hqdefault.jpg',
          'high' => 'maxresdefault.jpg',
          _ => 'hqdefault.jpg',
        };
        return 'https://i.ytimg.com/vi/$cleanId/$thumb';
      }
      return '';
    }

    var u = url.trim();
    if (u.startsWith('//')) {
      u = 'https:$u';
    }

    // 1. Google / YouTube Music CDN (lh3.googleusercontent.com / yt3.ggpht.com / ggpht.com)
    if (u.contains('googleusercontent.com') || u.contains('ggpht.com')) {
      if (RegExp(r'=s0(?:$|[?#])', caseSensitive: false).hasMatch(u)) {
        u = u.replaceFirst(RegExp(r'=s0(?:$|[?#])', caseSensitive: false), '');
      }

      final dimMatch = _googleDimRe.firstMatch(u);
      final w = dimMatch != null
          ? int.tryParse(dimMatch.group(1) ?? dimMatch.group(3) ?? '0') ?? 0
          : 0;
      final h = dimMatch != null
          ? int.tryParse(dimMatch.group(2) ?? dimMatch.group(3) ?? '0') ?? 0
          : 0;
      final preserveLandscape = isBanner || (w > h && w >= 600);

      if (preserveLandscape && !isArtistAvatar) {
        if (w >= 1920) return u;
        final bannerSuffix = switch (imgQuality) {
          'low' => '=w640-h360-p-l70-rj',
          'medium' => '=w960-h540-p-l80-rj',
          'high' => '=w1920-h1080-p-l85-rj',
          _ => '=w960-h540-p-l80-rj',
        };
        return dimMatch != null
            ? u.replaceFirst(_googleDimRe, bannerSuffix)
            : '$u$bannerSuffix';
      }

      final keepPortrait =
          isArtistAvatar || u.contains('-p') || u.contains('-c');
      final squareSuffix = keepPortrait
          ? '=w$effectiveTargetSize-h$effectiveTargetSize-p-l75-rj'
          : '=w$effectiveTargetSize-h$effectiveTargetSize-l75-rj';

      if (dimMatch != null) {
        return u.replaceFirst(_googleDimRe, squareSuffix);
      }
      return '$u$squareSuffix';
    }

    // 2. YouTube Video Thumbnails (i.ytimg.com): upgrade or downgrade to match selected quality
    if (u.contains('ytimg.com') || u.contains('img.youtube.com')) {
      final idMatch = _ytimgIdRe.firstMatch(u);
      final resolvedVid =
          idMatch?.group(1) ?? videoId?.replaceFirst('yt-', '').trim();
      if (resolvedVid != null && resolvedVid.isNotEmpty) {
        final thumb = switch (imgQuality) {
          'low' => 'mqdefault.jpg',
          'medium' => 'hqdefault.jpg',
          'high' => 'maxresdefault.jpg',
          _ => 'hqdefault.jpg',
        };
        return 'https://i.ytimg.com/vi/$resolvedVid/$thumb';
      }
      return u.split('?').first;
    }

    // 3. JioSaavn CDN (c.saavncdn.com)
    if (u.contains('saavncdn.com')) {
      final saavnSize = switch (imgQuality) {
        'low' => '150x150',
        'medium' => '250x250',
        'high' => '500x500',
        _ => '250x250',
      };
      return u.replaceAll(
        RegExp(r'\b(50x50|150x150|250x250|350x350|500x500)\b'),
        saavnSize,
      );
    }

    return u;
  }

  /// Resolves wide hero banners (e.g. artist immersive headers) at 1920px+ landscape.
  static String upgradeBannerUrl(String? url, {String? videoId, String? qualityOverride}) =>
      upgradeArtworkUrl(url, videoId: videoId, isBanner: true, qualityOverride: qualityOverride);

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
    String? defaultArtist,
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
    // Pre-check raw title runs for video keywords before cleanTitle strips descriptor tags
    final rawAllTitle = [
      if (titleRuns != null)
        ...titleRuns.map((r) => r is Map ? r['text'] ?? '' : ''),
      ?rawTitle,
    ].join(' ');
    final rawLower = rawAllTitle.toLowerCase();
    bool isVideoCandidate = defaultType == 'video' ||
        defaultType == 'music video' ||
        rawLower.contains('video song') ||
        rawLower.contains('song video') ||
        rawLower.contains('music video') ||
        rawLower.contains('official video') ||
        rawLower.contains('official music video') ||
        rawLower.contains('lyric video') ||
        rawLower.contains('lyrical video') ||
        rawLower.contains('visualizer') ||
        rawLower.contains('பாடல்') ||
        rawLower.contains('வீடியோ') ||
        rawLower.contains('गाने') ||
        rawLower.contains('वीडियो');

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
        if (lower == 'video' ||
            lower == 'music video' ||
            lower == 'official music video') {
          resolvedType = 'video';
          isVideoCandidate = true;
          continue;
        }
        if (lower == 'album' || lower == 'single' || lower == 'ep') {
          resolvedType = lower;
          continue;
        }

        // Must be an artist or creator name (skip distributor and record label channels)
        if (!isDistributorOrLabel(t)) {
          artistCandidates.add(t);
        }
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
          .where((s) => !isMetadataNoise(s) && !_yearPattern.hasMatch(s) && !isDistributorOrLabel(s))
          .toList();
      resolvedSubtitle = formatArtists(cleanedSub);
    }

    // If subtitle is empty, "Unknown Artist", or a distributor, extract true artist from video title
    if (resolvedSubtitle.isEmpty ||
        resolvedSubtitle.toLowerCase() == 'unknown artist' ||
        isDistributorOrLabel(resolvedSubtitle)) {
      final extracted = extractArtistsFromVideoTitle(rawAllTitle, defaultArtist: defaultArtist);
      if (extracted.isNotEmpty) {
        resolvedSubtitle = extracted;
      } else {
        resolvedSubtitle = (defaultArtist != null && defaultArtist.isNotEmpty) ? defaultArtist : 'Unknown Artist';
      }
    }

    // Extract year from raw title if year is not yet resolved
    if (resolvedYear == null || resolvedYear.isEmpty) {
      final m = RegExp(r'\b(19\d{2}|20\d{2})\b').firstMatch(rawAllTitle);
      if (m != null) resolvedYear = m.group(0);
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
      isVideo: isVideoCandidate || resolvedType == 'video',
    );
  }

  /// Convenience normalizer for plain Maps.
  static NormalizedMediaItem normalizeMap(Map<String, dynamic> map) {
    dynamic rawArtists =
        map['artists'] ?? map['artist'] ?? map['subtitle'] ?? map['author'];
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
      rawImageUrl: (map['imageUrl'] ?? map['thumbnail'] ?? map['coverUrl'])
          ?.toString(),
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
    this.isVideo = false,
  });

  final String id;
  final String title;
  final String subtitle;
  final String imageUrl;
  final String type; // 'song', 'album', 'artist', 'playlist', 'video'
  final String? year;
  final String? duration;
  final String? browseId;
  final String? videoId;
  final bool isVideo;

  /// Cleaned title (alias for title).
  String get cleanTitle => title;

  /// Clean, compact title for cards and mini player (strips "From ..." movie subtitles).
  String get compactTitle => MediaNormalizer.cleanCompactTitle(title);

  /// Full title for detailed album and now playing views.
  String get fullTitle => MediaNormalizer.cleanTitle(title);
}
