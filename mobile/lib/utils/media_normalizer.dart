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

  /// Exact and substring pattern for known record labels, distributors, channels, and movie production banners
  static final RegExp _distributorLabelExactPattern = RegExp(
    r'^(?:'
    r'Think\s*Music(?:\s*(?:India|South|Official))?'
    r'|Sony\s*Music(?:\s*(?:South|India|Entertainment|Official|Regional))?'
    r'|SonyMusicSouthVEVO|SonyMusicIndiaVEVO'
    r'|T-Series(?:\s*(?:Tamil|Telugu|Bhakti|Apna|Music|Company|Malayalam|Kannada|Bhakti\s*Sagar|Old|Films|Haryanvi|Punjabi|Marathi|Bhojpuri|Gujarati))?'
    r'|Zee\s*Music(?:\s*(?:South|Company|Tamil|Telugu|India))?'
    r'|Zee\s*Studios?'
    r'|Saregama(?:\s*(?:Tamil|Telugu|Malayalam|Music|Kannada|Bhojpuri|Gujarati|Bengali|Punjabi))?'
    r'|Aditya\s*Music(?:\s*(?:Tamil|Telugu|India|Devotional|NXT))?'
    r'|Lahari\s*Music(?:\s*(?:T-Series|South))?'
    r'|Speed\s*Audio(?:\s*Video)?|Speed\s*Records'
    r'|YRF(?:\s*Music)?|Yash\s*Raj\s*Films?'
    r'|Tips(?:\s*(?:Official|Music|Industries|Bhojpuri|Gujarati|Punjabi))?'
    r'|Muzik\s*247|Muzik247|Divo(?:\s*(?:Music|Movies|South|Media))?|Anand\s*Audio'
    r'|Times\s*Music(?:\s*South|Spiritual)?|Junglee\s*Music(?:\s*(?:Tamil|Telugu|South|Hindi))?'
    r'|Eros\s*Now(?:\s*(?:Music|South))?|SVF|Rajshri(?:\s*(?:Tamil|Telugu|Music))?|Geetha\s*Arts|Trend\s*Music|MRT\s*Music|Silly\s*Monks'
    r'|Mango\s*Music|Volga\s*Video|Madhura\s*Audio|Millennium\s*Audios|Star\s*Music|Five\s*Star\s*Audio|Ayngaran'
    r'|White\s*Hill\s*Music|Desi\s*Music\s*Factory|DMF\s*Play|VYRL\s*Originals|DM\s*Desi\s*Melodies'
    r'|Universal\s*Music(?:\s*(?:India|Group))?|Warner\s*Music(?:\s*(?:India|South\s*Asia))?|Def\s*Jam(?:\s*India)?|Atlantic\s*Records|Columbia\s*Records|Republic\s*Records|Interscope|RCA\s*Records|Island\s*Records'
    r'|Sun\s*TV|Sun\s*Pictures|Sun\s*NXT'
    r'|Sony\s*Pictures(?:\s*(?:India|Releasing))?'
    r'|Red\s*Giant\s*Movies|Lyca\s*Productions|Hombale\s*Films|Mythri\s*Movie\s*Makers|DVV\s*Entertainment'
    r'|Studio\s*Green|Seven\s*Screen\s*Studio|7\s*Screen\s*Studio|Sathya\s*Jyothi\s*Films|Wunderbar\s*Films'
    r'|Raaj\s*Kamal\s*Films(?:\s*International)?|Raajkamal\s*Films(?:\s*International)?|AGS\s*Entertainment|2D\s*Entertainment|Madras\s*Talkies'
    r'|Sri\s*Venkateswara\s*Creations|Sithara\s*Entertainment|Haarika\s*(?:&|and)\s*Hassine\s*Creations|Vyjayanthi\s*Movies'
    r'|KVN\s*Productions|Dharma\s*Productions|Red\s*Chillies\s*Entertainment|Viacom\s*18(?:\s*Studios)?|Jio\s*Studios|T-Series\s*Films'
    r'|Aashirvad\s*Cinemas|Prithviraj\s*Productions|Wayfarer\s*Films|Gokulam\s*Movies|Thenandal\s*Studios?'
    r'|YouTube\s*Music|Unknown\s*Artist|Various\s*Artists'
    r')$',
    caseSensitive: false,
  );

  /// Trailing suffixes indicating distributor/film-production channels rather than recording artists
  static final RegExp _distributorSuffixPattern = RegExp(
    r'\b(?:'
    r'music(?:\s*(?:south|india|company|entertainment|official|tamil|telugu|malayalam|kannada|punjabi|hindi|factory))?'
    r'|records|recordings|entertainment[s]?|audio\s*video|audios|production[s]?|creations|cinematics|cinemas|vevo|studios?|pictures?|films?|movies|media|channel|tv|network'
    r')\b',
    caseSensitive: false,
  );

  /// Non-musical movie/production credit roles or actor honorifics that must never be treated as singer/composer artists.
  static final RegExp _nonArtistRoleLinePattern = RegExp(
    r'^(?:starring|featuring\s*actor|star\s*cast|cast|actor[s]?|actress(?:es)?|hero|heroine|director|directed\s*by|written\s*by|story|screenplay|dialogue[s]?|producer|produced\s*by|co-?producer|executive\s*producer|banner|presents|presented\s*by|movie|film|dop|cinematograph(?:y|er)|editor|editing|choreograph(?:y|er)|vfx|stunt[s]?|action|costume[s]?|art\s*director|publicity|label|audio\s*label|music\s*label|video\s*label|lyrics|lyricist|words|subscribe|follow|copyright|rights)\b',
    caseSensitive: false,
  );

  static final RegExp _actorHonorificPattern = RegExp(
    r'^(?:superstar|thalapathy|thalaivar|ulaganayagan|makkal\s*selvan|rebel\s*star|icon\s*star|power\s*star|stylish\s*star|mega\s*star|natural\s*star|rocking\s*star|man\s*of\s*masses|global\s*star|real\s*star|young\s*tiger|chiyaan|naga|prince)\b',
    caseSensitive: false,
  );

  /// Checks whether a name corresponds to a music distributor, record label,
  /// video publisher, or movie production house rather than an actual recording artist.
  static bool isDistributorOrLabel(String? raw) {
    if (raw == null) return false;
    final s = decodeHtml(raw).trim();
    if (s.isEmpty) return false;
    if (_distributorLabelExactPattern.hasMatch(s)) return true;

    final lower = s.toLowerCase();
    if (lower == 'sun tv' ||
        lower == 'sun pictures' ||
        lower == 'sun nxt' ||
        lower == 'muzik247' ||
        lower == 'muzik 247' ||
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
        lower == 'vevo' ||
        lower == 'lyca' ||
        lower == 'hombale' ||
        lower == 'geetha arts') {
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
        lower.contains('speed records') ||
        lower.contains('mango music') ||
        lower.contains('lyca productions') ||
        lower.contains('hombale films') ||
        lower.contains('mythri movie') ||
        lower.contains('red giant movies') ||
        lower.contains('sathya jyothi') ||
        lower.contains('studio green') ||
        lower.contains('seven screen studio') ||
        lower.contains('7 screen studio') ||
        lower.contains('yash raj') ||
        lower.contains('dharma productions') ||
        lower.contains('red chillies') ||
        lower.contains('dvv entertainment') ||
        lower.contains('sithara entertainment') ||
        lower.contains('vyjayanthi movies') ||
        lower.contains('white hill music') ||
        lower.contains('vevo')) {
      return true;
    }

    if (_distributorSuffixPattern.hasMatch(s) &&
        (lower.contains('music') ||
            lower.contains('records') ||
            lower.contains('pictures') ||
            lower.contains('studios') ||
            lower.contains('films') ||
            lower.contains('movies') ||
            lower.contains('creations') ||
            lower.contains('productions') ||
            lower.contains('cinematics') ||
            lower.contains('entertainment') ||
            lower.contains('audio video'))) {
      return true;
    }

    return false;
  }

  /// True when a video credit token explicitly designates a non-music role (actor/director/producer/label/lyricist).
  static bool isNonArtistCreditSegment(String? raw) {
    if (raw == null) return false;
    final s = decodeHtml(raw).trim();
    if (s.isEmpty) return true;
    if (isDistributorOrLabel(s)) return true;
    if (_nonArtistRoleLinePattern.hasMatch(s)) return true;
    if (_actorHonorificPattern.hasMatch(s)) return true;
    if (s.startsWith('#') || s.startsWith('@') || s.contains('http://') || s.contains('https://')) {
      return true;
    }
    return false;
  }

  static String _sanitizeCreditNames(String raw) {
    var s = decodeHtml(raw).trim();
    // Drop social handles, URLs, parenthetical instrument/vocal-part notes & emoji/brackets
    s = s.replaceAll(RegExp(r'https?://\S+'), '');
    s = s.replaceAll(RegExp(r'@[\w.\-]+'), '');
    s = s.replaceAll(
      RegExp(
        r'\((?:male|female|rap|chorus|backing|vocals?|voice|flute|guitar|violin|piano|keys|drums?|bass|additional|ft\.?|feat\.?)[^)]*\)',
        caseSensitive: false,
      ),
      '',
    );
    s = s.replaceAll(_bracketLabelPattern, '');
    s = s.replaceAll(RegExp(r'[#@•|]+'), ', ');
    s = s.replaceAll(RegExp(r'\s{2,}'), ' ').trim();
    return s;
  }

  /// Extracts explicit song title from YouTube video description blocks (e.g. "Song: Naa Ready", "Track Name - Monica").
  static String? extractTitleFromDescription(String? description) {
    if (description == null || description.trim().isEmpty) return null;
    final text = decodeHtml(description);

    // 1. Auto-generated YouTube release line: "Provided to YouTube by ..." followed by "Title · Artist"
    final autoMatch = RegExp(
      r'Provided to YouTube by[^\r\n]*\r?\n+([^\r\n]+)',
      caseSensitive: false,
    ).firstMatch(text);
    if (autoMatch != null) {
      final line = autoMatch.group(1)?.trim() ?? '';
      if (line.contains('·')) {
        final songPart = line.split('·').first.trim();
        final cleaned = cleanCompactTitle(songPart);
        if (cleaned.isNotEmpty && cleaned != 'Unknown Title' && !isDistributorOrLabel(cleaned)) {
          return cleaned;
        }
      }
    }

    // 2. Explicit Song/Track metadata line
    final songMatch = RegExp(
      r'^(?:\s*(?:Song(?:\s*(?:Name|Title))?|Track(?:\s*(?:Name|Title))?))\s*[:\-–—|]\s*([^\r\n•|]+)',
      caseSensitive: false,
      multiLine: true,
    ).firstMatch(text);
    if (songMatch != null) {
      final raw = songMatch.group(1)?.trim() ?? '';
      if (raw.isNotEmpty &&
          !raw.contains('http') &&
          !_nonArtistRoleLinePattern.hasMatch(raw) &&
          !isDistributorOrLabel(raw)) {
        final cleaned = cleanCompactTitle(raw);
        if (cleaned.length >= 2 && cleaned != 'Unknown Title') {
          return cleaned;
        }
      }
    }
    return null;
  }

  /// Extracts movie/album name from description credits (e.g. "Movie: Coolie", "Album: Vikram").
  static String? extractMovieOrAlbumFromDescription(String? description) {
    if (description == null || description.trim().isEmpty) return null;
    final text = decodeHtml(description);
    final m = RegExp(
      r'^(?:\s*(?:Movie|Film|Album|Soundtrack))\s*[:\-–—|]\s*([^\r\n•|]+)',
      caseSensitive: false,
      multiLine: true,
    ).firstMatch(text);
    if (m == null) return null;
    final raw = m.group(1)?.trim() ?? '';
    if (raw.isEmpty || isDistributorOrLabel(raw)) return null;
    final cleaned = cleanAlbumTitle(raw);
    return (cleaned.isNotEmpty && cleaned != 'Single') ? cleaned : null;
  }

  /// Extracts true recording artists (vocalists and music directors/composers)
  /// from a video song's description text while strictly excluding actors, directors,
  /// film producers, lyricists, and distributor labels.
  static String extractArtistsFromDescription(String? description) {
    if (description == null || description.trim().isEmpty) return '';
    final text = decodeHtml(description);
    final collectedNames = <String>[];

    void addExtracted(String? rawValue) {
      if (rawValue == null || rawValue.trim().isEmpty) return;
      final cleaned = _sanitizeCreditNames(rawValue);
      if (cleaned.isEmpty) return;
      for (final name in splitArtistNames(cleaned)) {
        if (name.isEmpty ||
            name.toLowerCase() == 'unknown artist' ||
            isDistributorOrLabel(name) ||
            _nonArtistRoleLinePattern.hasMatch(name) ||
            _actorHonorificPattern.hasMatch(name)) {
          continue;
        }
        if (!collectedNames.any((n) => n.toLowerCase() == name.toLowerCase())) {
          collectedNames.add(name);
        }
      }
    }

    // 1. YouTube Music automated release delivery block:
    // "Provided to YouTube by ..." -> "Track Title · Artist 1 · Artist 2"
    final autoMatch = RegExp(
      r'Provided to YouTube by[^\r\n]*\r?\n+([^\r\n]+)',
      caseSensitive: false,
    ).firstMatch(text);
    if (autoMatch != null) {
      final line = autoMatch.group(1)?.trim() ?? '';
      if (line.contains('·')) {
        final parts = line.split('·').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
        if (parts.length > 1) {
          for (final p in parts.sublist(1)) {
            addExtracted(p);
          }
          if (collectedNames.isNotEmpty) {
            return formatArtists(collectedNames);
          }
        }
      }
    }

    // 2. Scan credit lines: Vocalists/Singers + Music Director/Composer (combining unique artists)
    final lines = text.split(RegExp(r'\r?\n'));
    final vocalKey = RegExp(
      r'^\s*(?:Singers?|Vocals?|Lead\s*Vocals?|Sung\s*by|Rendered\s*by|Voice[s]?|Artists?|Singers?\s*(?:&|and)\s*Vocals?|Featured\s*Artists?|Ft\.?)\s*[:\-–—|]\s*(.+)$',
      caseSensitive: false,
    );
    final musicKey = RegExp(
      r'^\s*(?:Music(?:\s*(?:Director|Composed\s*(?:&|and)?\s*(?:Arranged\s*)?by|Composed\s*(?:&|and)\s*Produced\s*by|by|Production))?|Composed\s*(?:&|and\s*Produced\s*)?by|Composer|Music\s*Producer)\s*[:\-–—|]\s*(.+)$',
      caseSensitive: false,
    );

    final vocalCredits = <String>[];
    final musicCredits = <String>[];

    for (var i = 0; i < lines.length; i++) {
      final line = lines[i].trim();
      if (line.isEmpty) continue;
      if (_nonArtistRoleLinePattern.hasMatch(line)) continue;

      final vm = vocalKey.firstMatch(line);
      if (vm != null) {
        vocalCredits.add(vm.group(1)!);
        continue;
      }
      final mm = musicKey.firstMatch(line);
      if (mm != null) {
        musicCredits.add(mm.group(1)!);
        continue;
      }

      // Natural prose credits e.g. "Sung by Anirudh Ravichander & Jonita Gandhi"
      final proseVocal = RegExp(
        r'\b(?:Sung|Performed|Voiced)\s+by\s+([^\r\n•.|(]+)',
        caseSensitive: false,
      ).firstMatch(line);
      if (proseVocal != null) vocalCredits.add(proseVocal.group(1)!);

      final proseMusic = RegExp(
        r'\b(?:Music\s+composed\s+by|Composed\s+by|Music\s+by)\s+([^\r\n•.|(]+)',
        caseSensitive: false,
      ).firstMatch(line);
      if (proseMusic != null) musicCredits.add(proseMusic.group(1)!);
    }

    // Add vocalists first, then composer(s) (deduped) so e.g. Singers: A, B + Music: A -> "A & B", or Singer: B + Music: A -> "B & A"
    for (final v in vocalCredits) {
      addExtracted(v);
    }
    for (final m in musicCredits) {
      addExtracted(m);
    }

    if (collectedNames.isNotEmpty) {
      return formatArtists(collectedNames);
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
      r'\b(?:Year|Premiered|Uploaded?|Published|Audio\s*Release)\s*[:\-–—]?\s*[^\r\n]*?\b(19\d{2}|20\d{2})\b',
      caseSensitive: false,
    ).firstMatch(text);
    if (yearMatch != null) return yearMatch.group(1);

    return null;
  }

  /// Extracts authentic musical artists from a video song's title when the uploader
  /// is a distributor / channel or when metadata attribution is missing.
  /// Strictly rejects film actors, directors, producers, lyricists, and production banners.
  static String extractArtistsFromVideoTitle(
    String? rawTitle, {
    String? defaultArtist,
  }) {
    if (rawTitle == null || rawTitle.trim().isEmpty) {
      return (defaultArtist != null && !isDistributorOrLabel(defaultArtist))
          ? cleanArtistName(defaultArtist)
          : '';
    }
    final raw = decodeHtml(rawTitle).trim();

    // 1. Extract explicit (feat. X) / (ft. Y) artist attributions from title
    final featMatches = RegExp(
      r'[\(\[]\s*(?:feat\.?|ft\.?|featuring)\s+([^\]\)]+)[\)\]]',
      caseSensitive: false,
    ).allMatches(raw);
    final featArtists = <String>[
      for (final m in featMatches)
        if (m.group(1) != null) ...splitArtistNames(m.group(1)!),
    ];

    // 2. Pipe-separated cinema/music video format:
    // "Monica - Video Song | COOLIE | Superstar Rajinikanth | Sun Pictures | Lokesh | Anirudh | Pooja Hegde"
    if (raw.contains('|')) {
      final parts = raw.split('|').map((p) => p.trim()).where((p) => p.isNotEmpty).toList();
      final explicitMusicCandidates = <String>[];
      final fallbackCandidates = <String>[];

      for (var i = 1; i < parts.length; i++) {
        var segment = parts[i].replaceAll(RegExp(r'#\S+'), '').trim();
        if (segment.isEmpty) continue;

        // Discard explicit non-music roles first ("Movie:", "Music Label:", "Starring:", "Directed by:", "Produced by:")
        if (_nonArtistRoleLinePattern.hasMatch(segment) ||
            _actorHonorificPattern.hasMatch(segment)) {
          continue;
        }

        // Extract explicit music credits ("Music: X", "Singers: Y, Z") BEFORE label-keyword check
        final explicitMusicMatch = RegExp(
          r'^(?:music(?:\s*(?:by|director))?|composed\s*by|composer|singer[s]?|vocal[s]?|artist[s]?)\s*[:\-–—]\s*(.+)$',
          caseSensitive: false,
        ).firstMatch(segment);
        if (explicitMusicMatch != null) {
          for (final n in splitArtistNames(explicitMusicMatch.group(1))) {
            if (!isNonArtistCreditSegment(n)) {
              explicitMusicCandidates.add(n);
            }
          }
          continue;
        }

        if (isNonArtistCreditSegment(segment) ||
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
            lower.contains('lyrical video') ||
            RegExp(r'^(?:4k|8k|hd|uhd|tamil|telugu|hindi|malayalam|kannada|punjabi)$').hasMatch(lower)) {
          continue;
        }

        // Skip plain ALL-CAPS single movie banners e.g. COOLIE, LEO, JAILER
        if (parts[i].trim().length >= 3 &&
            parts[i].trim() == parts[i].trim().toUpperCase() &&
            !parts[i].trim().contains(' ')) {
          continue;
        }

        fallbackCandidates.add(segment);
      }

      if (explicitMusicCandidates.isNotEmpty) {
        return formatArtists([...explicitMusicCandidates, ...featArtists]);
      }

      if (defaultArtist != null && defaultArtist.isNotEmpty && !isDistributorOrLabel(defaultArtist)) {
        final defLower = defaultArtist.toLowerCase();
        final all = [...fallbackCandidates, ...featArtists];
        final matches = all
            .where(
              (a) =>
                  a.toLowerCase().contains(defLower) ||
                  defLower.contains(a.toLowerCase()),
            )
            .toList();
        if (matches.isNotEmpty) {
          return formatArtists(matches.first);
        }
      }

      if (featArtists.isNotEmpty) {
        return formatArtists(featArtists);
      }
      // Without explicit music labels, Indian cinema pipe titles mix movie/actor/director tokens (which require description/panel credits);
      // only return a clean non-distributor fallback if defaultArtist isn't present and we didn't find anything noisy.
      if (fallbackCandidates.isNotEmpty && parts.length <= 3) {
        return formatArtists(fallbackCandidates.take(2).toList());
      }
    }

    // 3. "Artist - Title" format e.g. "Cartoon, Jéja - On & On (feat. Daniel Levi)", "The Weeknd - Blinding Lights"
    final dashMatch = RegExp(r'^([^\-–—|]+?)\s+[\-–—]\s+([^\-–—|]+)').firstMatch(raw);
    if (dashMatch != null) {
      final left = dashMatch.group(1)!.trim();
      final right = dashMatch.group(2)!.trim();
      final leftUpperMovie = left.length >= 2 &&
          left.length <= 12 &&
          left == left.toUpperCase() &&
          !left.contains(' ') &&
          RegExp(r'^[A-Z0-9]+$').hasMatch(left);

      if (!leftUpperMovie && !isNonArtistCreditSegment(left)) {
        final leftClean = cleanArtistName(left);
        if (leftClean.isNotEmpty &&
            !isDistributorOrLabel(leftClean) &&
            !isMetadataNoise(leftClean) &&
            !_bracketTagsPattern.hasMatch(left) &&
            leftClean.length > 2) {
          if (featArtists.isNotEmpty) {
            return formatArtists([leftClean, ...featArtists]);
          }
          return formatArtists(leftClean);
        }
      }

      if (!isNonArtistCreditSegment(right)) {
        final rightClean = cleanArtistName(right);
        if (rightClean.isNotEmpty &&
            !isDistributorOrLabel(rightClean) &&
            !isMetadataNoise(rightClean) &&
            !_bracketTagsPattern.hasMatch(right) &&
            !rightClean.toLowerCase().contains('video song') &&
            !rightClean.toLowerCase().contains('lyric video') &&
            rightClean.length > 2) {
          return formatArtists(rightClean);
        }
      }
    }

    if (featArtists.isNotEmpty) {
      return formatArtists(featArtists);
    }

    if (defaultArtist != null &&
        defaultArtist.trim().isNotEmpty &&
        !isDistributorOrLabel(defaultArtist)) {
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

  static final RegExp _genericVideoSegmentPattern = RegExp(
    r'^(?:#\S+\s*)+$|^(?:official\s*(?:music\s*)?video|music\s*video|video\s*song|full\s*video(?:\s*song)?|lyric(?:al)?\s*video|song\s*promo|teaser|trailer|promo|4k(?:\s*(?:uhd|ultra\s*hd|video|hd|song))?|8k(?:\s*video)?|(?:full\s*)?hd(?:\s*video)?|audio\s*song)$',
    caseSensitive: false,
  );

  static final RegExp _trailingUnwrappedVideoNoisePattern = RegExp(
    r'\s+(?:official\s*(?:music\s*)?(?:video|audio|lyric(?:al)?\s*video)|full\s*video\s*song|video\s*song|lyric(?:al)?\s*video|song\s*promo|full\s*song|audio\s*song|4k(?:\s*(?:uhd|ultra\s*hd|video))?|8k|full\s*hd|1080p|2160p|dolby\s*atmos)\s*$',
    caseSensitive: false,
  );

  /// Cleans titles by decoding HTML entities, removing surrounding/stray quotes,
  /// cleaning unbalanced closing parentheses, removing video descriptor tags,
  /// and stripping credit/label spam after pipes or hyphens.
  static String cleanTitle(String? raw) {
    if (raw == null) return 'Unknown Title';
    var s = decodeHtml(raw).trim();
    s = stripIdNoise(s);
    if (s.isEmpty) return 'Unknown Title';

    // Strip inline hashtags like #Coolie #Trending before pipe/descriptor cleanup
    s = s.replaceAll(RegExp(r'\s*#[A-Za-z0-9_\u0B80-\u0DFF]+'), ' ').trim();

    // 1. If title contains '|' (YouTube video credits spam: Song | Movie | Cast | Label),
    // pick the primary song segment (skipping leading promo/resolution/distributor tokens).
    if (s.contains('|')) {
      final parts = s.split('|').map((p) => p.trim()).where((p) => p.isNotEmpty).toList();
      final chosen = parts.firstWhere(
        (p) =>
            p.length >= 2 &&
            !_genericVideoSegmentPattern.hasMatch(p) &&
            !isDistributorOrLabel(p) &&
            !isNonArtistCreditSegment(p),
        orElse: () => parts.isNotEmpty ? parts.first : s,
      );
      if (chosen.length >= 2) {
        s = chosen;
      }
    }

    // Strip leading promo prefixes like "Video Song: " or "Full Video - "
    s = s
        .replaceAll(
          RegExp(
            r'^(?:official\s*(?:music\s*)?video|video\s*song|full\s*video(?:\s*song)?|lyric(?:al)?\s*video|song\s*promo)\s*[:\-–—]+\s*',
            caseSensitive: false,
          ),
          '',
        )
        .trim();

    // 2. Strip record label brackets, unclosed labels & channel tails repeatedly
    s = s.replaceAll(_bracketLabelPattern, ' ').trim();
    s = s.replaceAll(_unclosedLabelPattern, ' ').trim();
    s = s.replaceAll(_labelTailPattern, '').trim();

    // 3. Strip descriptor tails after hyphen, dash, or pipe AND unwrapped video noise tails repeatedly
    for (var pass = 0; pass < 3; pass++) {
      final prev = s;
      s = s.replaceAll(_descriptorTailPattern, '').trim();
      s = s.replaceAll(_trailingUnwrappedVideoNoisePattern, '').trim();
      while (_bracketTagsPattern.hasMatch(s)) {
        s = s.replaceAll(_bracketTagsPattern, ' ').trim();
      }
      s = s.replaceAll(_unclosedDescriptorPattern, ' ').trim();
      if (s == prev) break;
    }

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

  /// Deep-cleans a YouTube music video title down to the exact canonical song name,
  /// removing channel names, "Artist - " / "Movie - " prefixes, movie credits, hashtags,
  /// 4K/HD resolution tags, and distributor banners.
  static String cleanVideoTitle(
    String? raw, {
    String? knownArtists,
    String? knownMovieOrAlbum,
    String? descriptionTitle,
  }) {
    final cleanedDescTitle = descriptionTitle != null && descriptionTitle.trim().isNotEmpty
        ? cleanCompactTitle(descriptionTitle)
        : '';
    if (cleanedDescTitle.length >= 2 &&
        cleanedDescTitle != 'Unknown Title' &&
        !isDistributorOrLabel(cleanedDescTitle) &&
        !_genericVideoSegmentPattern.hasMatch(cleanedDescTitle)) {
      if (knownMovieOrAlbum == null ||
          cleanedDescTitle.toLowerCase() != knownMovieOrAlbum.trim().toLowerCase()) {
        return cleanedDescTitle;
      }
    }

    if (raw == null || raw.trim().isEmpty) return 'Unknown Title';
    final decoded = decodeHtml(raw).trim();
    final pipeParts = decoded.contains('|')
        ? decoded.split('|').map((p) => p.trim()).where((p) => p.isNotEmpty).toList()
        : const <String>[];

    var base = cleanCompactTitle(decoded);
    // Strip trailing year stamp e.g. "(2024)" or "[2024]"
    base = base.replaceAll(RegExp(r'\s*[\(\[]?\s*(?:19|20)\d{2}\s*[\)\]]?$'), '').trim();
    base = base.replaceAll(_trailingUnwrappedVideoNoisePattern, '').trim();

    if (base.isEmpty || base == 'Unknown Title') return 'Unknown Title';

    bool matchesAnyToken(String side, String? listText) {
      if (listText == null || listText.trim().isEmpty) return false;
      final sLower = side.toLowerCase().trim();
      if (sLower.length < 2) return false;
      final tokens = splitArtistNames(listText);
      for (final t in tokens) {
        final tl = t.toLowerCase().trim();
        if (tl.length < 2) continue;
        if (sLower == tl || sLower.contains(tl) || tl.contains(sLower)) {
          return true;
        }
      }
      final rawLower = listText.toLowerCase().trim();
      return sLower == rawLower || rawLower.contains(sLower);
    }

    // Handle "Prefix - Song" or "Song - Movie/Artist" cleanly without splitting genuine hyphenated song names
    final sepMatch = RegExp(r'^(.+?)\s+[\-–—:]\s+(.+)$').firstMatch(base);
    if (sepMatch != null) {
      final left = sepMatch.group(1)!.trim();
      final right = sepMatch.group(2)!.trim();
      final leftLower = left.toLowerCase();
      final rightLower = right.toLowerCase();

      final movieLower = knownMovieOrAlbum?.trim().toLowerCase() ?? '';
      final leftMatchesMovie = (movieLower.length >= 2 &&
              (leftLower == movieLower || leftLower.contains(movieLower))) ||
          pipeParts.skip(1).any((p) => p.toLowerCase() == leftLower);
      final rightMatchesMovie = (movieLower.length >= 2 &&
              (rightLower == movieLower || rightLower.contains(movieLower))) ||
          pipeParts.skip(1).any((p) => p.toLowerCase() == rightLower);

      final leftIsUpperBanner = left.length >= 2 &&
          left.length <= 16 &&
          left == left.toUpperCase() &&
          RegExp(r'^[A-Z0-9\s]+$').hasMatch(left) &&
          right != right.toUpperCase();

      if ((matchesAnyToken(left, knownArtists) && !matchesAnyToken(right, knownArtists)) ||
          leftMatchesMovie ||
          leftIsUpperBanner ||
          isDistributorOrLabel(left)) {
        if (right.length >= 2 && !isDistributorOrLabel(right)) {
          base = right;
        }
      } else if ((matchesAnyToken(right, knownArtists) && !matchesAnyToken(left, knownArtists)) ||
          rightMatchesMovie ||
          isDistributorOrLabel(right)) {
        if (left.length >= 2 && !isDistributorOrLabel(left)) {
          base = left;
        }
      }
    }

    base = base.replaceAll(_trailingUnwrappedVideoNoisePattern, '').trim();
    base = base.replaceAll(RegExp(r'[\s\-–—:|•/]+$'), '').trim();
    base = base.replaceAll(RegExp(r'\s{2,}'), ' ').trim();
    return base.isNotEmpty ? base : 'Unknown Title';
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

  /// Extracts soundtrack/movie name from `(From "Movie")` or `[From "Movie"]`.
  static String? extractFromMovie(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    final m = RegExp(
      r'[\(\[]\s*From\s+["\u201c\u201d\x27\u2018\u2019]?([^"\]\)\u201c\u201d]+)["\u201c\u201d\x27\u2018\u2019]?\s*[\)\]]',
      caseSensitive: false,
    ).firstMatch(decodeHtml(raw));
    final movie = m
        ?.group(1)
        ?.replaceAll(RegExp(r'^["\u201c\u201d\x27\u2018\u2019]+'), '')
        .replaceAll(RegExp(r'["\u201c\u201d\x27\u2018\u2019]+$'), '')
        .trim();
    if (movie == null || movie.isEmpty || isDistributorOrLabel(movie)) {
      return null;
    }
    final cleaned = cleanAlbumTitle(movie);
    if (cleaned.isNotEmpty && cleaned != 'Single') return cleaned;
    return movie.toLowerCase() == 'single' ? null : movie;
  }

  /// True when [a] and [b] normalize to the exact same song/release core title.
  static bool sameReleaseTitle(String? a, String? b) {
    if (a == null || b == null) return false;
    String norm(String v) => decodeHtml(v)
        .toLowerCase()
        .replaceAll(_fromMoviePattern, ' ')
        .replaceAll(
          RegExp(r'(?:-\s*single|\(\s*single\s*\)|\[\s*single\s*\])$'),
          '',
        )
        .replaceAll(RegExp(r'[^\p{L}\p{N}\s]', unicode: true), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    final na = norm(a);
    final nb = norm(b);
    return na.isNotEmpty && na == nb;
  }

  /// Resolves the canonical track album name without collapsing singles like
  /// `"Hangova (From \"DC\")"` into the song's own name when a movie/soundtrack
  /// attribution (`"DC"`) is present.
  static String resolveTrackAlbum(
    String? rawAlbum, {
    String? rawTitle,
    bool isVideo = false,
  }) {
    final decodedAlbum = decodeHtml(rawAlbum ?? '').trim();
    final albumCore = cleanAlbumTitle(decodedAlbum);
    if (isVideo &&
        (decodedAlbum.isEmpty ||
            albumCore == 'Single' ||
            decodedAlbum.toLowerCase() == 'music video')) {
      return 'Music Video';
    }

    final movie = extractFromMovie(decodedAlbum) ?? extractFromMovie(rawTitle);
    final titleCore = (rawTitle != null && rawTitle.trim().isNotEmpty)
        ? cleanTitle(rawTitle)
        : '';
    final isExplicitSingle = RegExp(
      r'(?:-\s*single|\(\s*single\s*\)|\[\s*single\s*\])$',
      caseSensitive: false,
    ).hasMatch(decodedAlbum);

    if (movie != null &&
        movie.isNotEmpty &&
        (albumCore == 'Single' ||
            isExplicitSingle ||
            (titleCore.isNotEmpty && sameReleaseTitle(albumCore, titleCore)))) {
      return movie;
    }

    return albumCore;
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

    // 2. Resolve Subtitle / Artists / Year / Type FIRST so video titles can strip known artist prefixes
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

    if (defaultType == 'album') {
      resolvedTitle = cleanAlbumTitle(resolvedTitle);
    } else if (defaultType == 'playlist') {
      resolvedTitle = cleanPlaylistTitle(resolvedTitle);
    } else if (defaultType == 'podcast') {
      resolvedTitle = cleanPodcastTitle(resolvedTitle);
    } else if (isVideoCandidate || resolvedType == 'video') {
      resolvedTitle = cleanVideoTitle(
        resolvedTitle,
        knownArtists: resolvedSubtitle,
      );
    } else {
      resolvedTitle = cleanTitle(resolvedTitle);
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
