import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'album_resolver.dart';
import 'artist_service.dart';
import 'innertube_service.dart';

/// A single credited contributor on a song or movie soundtrack.
class CreditPerson {
  const CreditPerson({
    required this.name,
    required this.role,
    this.browseId,
    this.imageUrl,
  });

  final String name;
  final String role;
  final String? browseId;
  final String? imageUrl;

  bool get isClickable =>
      browseId != null &&
      browseId!.isNotEmpty &&
      (browseId!.startsWith('UC') || browseId!.startsWith('FEmusic_'));

  CreditPerson copyWith({
    String? name,
    String? role,
    String? browseId,
    String? imageUrl,
  }) => CreditPerson(
    name: name ?? this.name,
    role: role ?? this.role,
    browseId: browseId ?? this.browseId,
    imageUrl: imageUrl ?? this.imageUrl,
  );
}

/// Complete structured credits metadata for a song.
class SongCredits {
  const SongCredits({
    required this.title,
    required this.displayArtists,
    this.album,
    this.albumBrowseId,
    this.movieName,
    this.director,
    this.distributor,
    this.label,
    this.copyright,
    this.releaseDate,
    this.genre,
    this.performingArtists = const [],
    this.compositionAndLyrics = const [],
    this.movieCast = const [],
    this.productionAndEngineering = const [],
  });

  final String title;
  final String displayArtists;
  final String? album;
  final String? albumBrowseId;
  final String? movieName;
  final String? director;
  final String? distributor;
  final String? label;
  final String? copyright;
  final String? releaseDate;
  final String? genre;
  final List<CreditPerson> performingArtists;
  final List<CreditPerson> compositionAndLyrics;
  final List<CreditPerson> movieCast;
  final List<CreditPerson> productionAndEngineering;

  SongCredits copyWith({
    String? title,
    String? displayArtists,
    String? album,
    String? albumBrowseId,
    bool clearAlbumBrowseId = false,
    String? movieName,
    String? director,
    String? distributor,
    String? label,
    String? copyright,
    String? releaseDate,
    String? genre,
    List<CreditPerson>? performingArtists,
    List<CreditPerson>? compositionAndLyrics,
    List<CreditPerson>? movieCast,
    List<CreditPerson>? productionAndEngineering,
  }) => SongCredits(
    title: title ?? this.title,
    displayArtists: displayArtists ?? this.displayArtists,
    album: album ?? this.album,
    albumBrowseId:
        clearAlbumBrowseId ? null : (albumBrowseId ?? this.albumBrowseId),
    movieName: movieName ?? this.movieName,
    director: director ?? this.director,
    distributor: distributor ?? this.distributor,
    label: label ?? this.label,
    copyright: copyright ?? this.copyright,
    releaseDate: releaseDate ?? this.releaseDate,
    genre: genre ?? this.genre,
    performingArtists: performingArtists ?? this.performingArtists,
    compositionAndLyrics: compositionAndLyrics ?? this.compositionAndLyrics,
    movieCast: movieCast ?? this.movieCast,
    productionAndEngineering:
        productionAndEngineering ?? this.productionAndEngineering,
  );

  String summaryLine() {
    final parts = <String>[
      if (displayArtists.trim().isNotEmpty) displayArtists.trim(),
      if (album != null && album!.trim().isNotEmpty) album!.trim(),
      if (releaseDate != null && releaseDate!.trim().isNotEmpty)
        releaseDate!.trim(),
    ];
    return parts.join(' • ');
  }
}

/// Fetches, merges, and resolves full song credits across YouTube Topic
/// descriptions, official music video descriptions, JioSaavn, and iTunes.
class SongCreditsService {
  SongCreditsService._();
  static final SongCreditsService instance = SongCreditsService._();

  final http.Client _client = http.Client();
  final Map<String, SongCredits> _cache = {};
  final Map<String, ({String? browseId, String? imageUrl})> _artistIdCache = {};

  static const _monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  /// Formats ISO dates like `2022-06-24` or `2022-06-24T12:00:00Z` into `24 June 2022`.
  static String? formatReleaseDate(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    final clean = raw.trim();
    final iso = RegExp(r'^(\d{4})-(\d{1,2})-(\d{1,2})').firstMatch(clean);
    if (iso != null) {
      final y = iso.group(1)!;
      final m = int.tryParse(iso.group(2)!) ?? 0;
      final d = int.tryParse(iso.group(3)!) ?? 0;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return '$d ${_monthNames[m - 1]} $y';
      }
      return y;
    }
    return clean;
  }

  /// Extracts `(From "MovieName")` / `[From "MovieName"]` from a song title or album.
  static String? extractMovieFromTitle(String title) =>
      MediaNormalizer.extractFromMovie(title);

  static bool _isWeakOrSelfTitledAlbum(
    String? candidateAlbum,
    String cleanSongTitle,
  ) {
    final raw = (candidateAlbum ?? '').trim();
    if (raw.isEmpty) return true;
    final clean = MediaNormalizer.cleanAlbumTitle(raw);
    final lower = clean.toLowerCase();
    if (lower == 'single' ||
        lower == 'music video' ||
        lower == 'video' ||
        lower == 'album' ||
        lower == 'unknown album') {
      return true;
    }
    if (AlbumResolver.isSingleReleaseTitle(raw)) return true;
    if (cleanSongTitle.isNotEmpty &&
        MediaNormalizer.sameReleaseTitle(clean, cleanSongTitle)) {
      return true;
    }
    return false;
  }

  /// Returns instant 0ms credits built solely from [track] metadata.
  SongCredits baselineFromTrack(Track track) {
    final cleanSongTitle = MediaNormalizer.cleanTitle(track.title);
    final movie =
        extractMovieFromTitle(track.title) ?? extractMovieFromTitle(track.album);
    final performing = <CreditPerson>[];
    for (final a in track.resolvedArtists) {
      if (a.name.trim().isEmpty ||
          MediaNormalizer.isDistributorOrLabel(a.name)) {
        continue;
      }
      final cachedAvatar = ArtistService.getCachedAvatar(a.name);
      final validBrowse =
          a.id.startsWith('UC') || a.id.startsWith('FEmusic_') ? a.id : null;
      performing.add(
        CreditPerson(
          name: a.name.trim(),
          role: 'Performer',
          browseId: validBrowse,
          imageUrl: (a.imageUrl != null && a.imageUrl!.isNotEmpty)
              ? a.imageUrl
              : cachedAvatar,
        ),
      );
    }

    final resolvedAlbum = MediaNormalizer.resolveTrackAlbum(
      track.album,
      rawTitle: track.title,
      isVideo: track.isVideo,
    );
    final validAlb =
        !_isWeakOrSelfTitledAlbum(resolvedAlbum, cleanSongTitle) &&
                resolvedAlbum != 'Single' &&
                resolvedAlbum != 'Music Video'
            ? resolvedAlbum
            : null;
    final keepBrowseId = validAlb != null || movie == null;

    return SongCredits(
      title: track.title.trim().isNotEmpty ? track.title.trim() : 'Song',
      displayArtists: MediaNormalizer.formatArtists(track.artist),
      album: validAlb ?? movie,
      albumBrowseId: keepBrowseId ? track.albumBrowseId : null,
      movieName: movie,
      releaseDate: formatReleaseDate(track.year),
      performingArtists: performing,
    );
  }

  /// Parses raw YouTube descriptions (Topic audio + optional official video),
  /// JioSaavn track fields, and iTunes lookup metadata into [SongCredits].
  @visibleForTesting
  static SongCredits parseCredits({
    required Track track,
    required SongCredits base,
    String? primaryDescription,
    String? videoDescription,
    String? publishDate,
    String? uploadDate,
    Map<String, dynamic>? jioSaavnData,
    Map<String, dynamic>? itunesData,
  }) {
    final performingMap = <String, _MutablePerson>{};
    final compLyricsMap = <String, _MutablePerson>{};
    final castMap = <String, _MutablePerson>{};
    final prodMap = <String, _MutablePerson>{};

    // Seed baseline artists with existing image/browseId lookup map
    final knownProfiles = <String, ({String? browseId, String? imageUrl})>{};
    for (final p in base.performingArtists) {
      knownProfiles[_normPersonKey(p.name)] = (
        browseId: p.browseId,
        imageUrl: p.imageUrl,
      );
    }

    void addPerson(
      Map<String, _MutablePerson> bucket,
      String rawName,
      String roleLabel,
    ) {
      final cleanName = _cleanCreditPersonName(rawName);
      if (cleanName.isEmpty) return;
      final key = _normPersonKey(cleanName);
      if (key.isEmpty) return;

      // Also match honorific-stripped version if name already exists (e.g. "Poetu Dhanush" -> "Dhanush")
      var targetKey = key;
      if (!bucket.containsKey(targetKey)) {
        final noHonorific = _stripHonorific(cleanName);
        final noHonKey = _normPersonKey(noHonorific);
        if (noHonKey.isNotEmpty &&
            (knownProfiles.containsKey(noHonKey) ||
                bucket.containsKey(noHonKey) ||
                performingMap.containsKey(noHonKey))) {
          targetKey = noHonKey;
        }
      }

      final display = (targetKey != key && _stripHonorific(cleanName).isNotEmpty)
          ? _stripHonorific(cleanName)
          : cleanName;

      final known = knownProfiles[targetKey];
      final existing = bucket[targetKey];
      if (existing == null) {
        bucket[targetKey] = _MutablePerson(
          name: display,
          roles: {roleLabel},
          browseId: known?.browseId,
          imageUrl: known?.imageUrl,
        );
      } else {
        existing.addRole(roleLabel);
      }
    }

    // Preserve baseline performing artists as fallback order
    for (final p in base.performingArtists) {
      addPerson(performingMap, p.name, p.role);
    }

    String? distributor;
    String? label;
    String? copyright;
    String? releaseDate = formatReleaseDate(publishDate) ??
        formatReleaseDate(uploadDate) ??
        base.releaseDate;
    String? movieName = base.movieName;
    String? director;
    String? album = base.album;
    String? genre;
    final cleanSongTitle = MediaNormalizer.cleanTitle(track.title);

    void considerAlbumCandidate(String? rawCandidate) {
      final decoded = MediaNormalizer.decodeHtml(rawCandidate ?? '').trim();
      if (decoded.isEmpty) return;
      final fromMovie = MediaNormalizer.extractFromMovie(decoded);
      if (fromMovie != null && fromMovie.isNotEmpty) {
        movieName ??= fromMovie;
      }
      if (_isWeakOrSelfTitledAlbum(decoded, cleanSongTitle)) return;

      final cleaned = MediaNormalizer.cleanAlbumTitle(decoded);
      final preferred = decoded.toLowerCase().contains('soundtrack')
          ? decoded
          : cleaned;
      if (_isWeakOrSelfTitledAlbum(preferred, cleanSongTitle)) return;

      if (_isWeakOrSelfTitledAlbum(album, cleanSongTitle) ||
          (movieName != null &&
              MediaNormalizer.sameReleaseTitle(album, movieName) &&
              decoded.toLowerCase().contains('soundtrack'))) {
        album = preferred;
      }
    }

    void parseOneDescription(String? desc) {
      if (desc == null || desc.trim().isEmpty) return;
      final text = MediaNormalizer.decodeHtml(desc);
      var sawTopicTitleArtistLine = false;

      // Distributor: "Provided to YouTube by The Orchard Enterprises"
      final distMatch = RegExp(
        r'^\s*Provided to YouTube by\s+([^\r\n]+)',
        caseSensitive: false,
        multiLine: true,
      ).firstMatch(text);
      if (distMatch != null && (distributor == null || distributor!.isEmpty)) {
        final d = distMatch.group(1)!.trim();
        if (d.isNotEmpty) distributor = d;
      }

      // Copyright line: "℗ 2021 Sun Pictures"
      final cpMatch = RegExp(
        r'^\s*(℗[^\r\n]+)',
        multiLine: true,
      ).firstMatch(text);
      if (cpMatch != null && (copyright == null || copyright!.isEmpty)) {
        copyright = cpMatch.group(1)!.trim();
        if (label == null || label!.isEmpty) {
          final stripped = copyright!
              .replaceFirst(RegExp(r'^℗\s*(?:\d{4}\s*)?'), '')
              .split(',')
              .first
              .trim();
          if (stripped.isNotEmpty) label = stripped;
        }
      }

      // Release date line: "Released on: 2022-06-24"
      final relMatch = RegExp(
        r'^\s*Released\s+on\s*[:\-–—]\s*([^\r\n]+)',
        caseSensitive: false,
        multiLine: true,
      ).firstMatch(text);
      if (relMatch != null) {
        final formatted = formatReleaseDate(relMatch.group(1)!.trim());
        if (formatted != null && formatted.isNotEmpty) {
          releaseDate = formatted;
        }
      }

      for (final rawLine in text.split(RegExp(r'\r?\n'))) {
        final line = rawLine.trim();
        if (line.isEmpty ||
            line.contains('http://') ||
            line.contains('https://') ||
            line.startsWith('#') ||
            line.startsWith('Provided to YouTube') ||
            line.startsWith('Auto-generated') ||
            line.startsWith('℗') ||
            line.toLowerCase().startsWith('released on:')) {
          continue;
        }

        // Auto-generated YT Topic header places the album/release line right
        // after "Song · Artist" and before structured "Key: Value" rows.
        if (line.contains('·')) {
          sawTopicTitleArtistLine = true;
        } else if (sawTopicTitleArtistLine && !line.contains(':')) {
          considerAlbumCandidate(line);
          sawTopicTitleArtistLine = false;
        }

        // Prose sentences like "... Lyrics and Vocal - Poetu Dhanush, Directed by Mithran Jawahar & Music by Anirudh Ravichander."
        _extractInlineProseCredits(
          line,
          onMovie: (m) => movieName ??= m,
          onDirector: (d) {
            director ??= d;
            addPerson(prodMap, d, 'Director');
          },
          onComposer: (c) {
            for (final n in _splitPeople(c)) {
              addPerson(compLyricsMap, n, 'Composer');
            }
          },
          onLyricist: (l) {
            for (final n in _splitPeople(l)) {
              addPerson(compLyricsMap, n, 'Lyricist');
            }
          },
          onVocal: (v) {
            for (final n in _splitPeople(v)) {
              addPerson(performingMap, n, 'Lead Vocals');
            }
          },
        );

        // Structured Key : Value or Key - Value lines (Topic lines can list many comma-separated roles)
        final kv = RegExp(
          r'^([A-Za-z][A-Za-z0-9\s,&/+]{1,160}?)\s*(?:[:–—|]|(?<=\s)-(?=\s))\s*(.+)$',
        ).firstMatch(line);
        if (kv == null) continue;

        final rawRoles = kv.group(1)!.trim();
        final rawValue = kv.group(2)!.trim();
        if (rawValue.isEmpty || rawValue.contains('http')) continue;

        final rolesLower = rawRoles.toLowerCase();

        if (_matchesAnyKey(rolesLower, const ['movie', 'film', 'soundtrack'])) {
          final mv = MediaNormalizer.cleanAlbumTitle(rawValue);
          if (mv.isNotEmpty && mv != 'Single') movieName ??= mv;
          continue;
        }
        if (_matchesAnyKey(rolesLower, const ['album'])) {
          considerAlbumCandidate(rawValue);
          continue;
        }
        if (_matchesAnyKey(rolesLower, const ['label', 'record label', 'music label'])) {
          label = rawValue;
          continue;
        }
        if (_matchesAnyKey(rolesLower, const ['distributor', 'distributed by'])) {
          distributor ??= rawValue;
          continue;
        }
        if (_matchesAnyKey(rolesLower, const ['music publisher', 'publisher'])) {
          label ??= rawValue;
          continue;
        }
        if (_matchesAnyKey(rolesLower, const ['director', 'directed by'])) {
          for (final n in _splitPeople(rawValue)) {
            director ??= n;
            addPerson(prodMap, n, 'Director');
          }
          continue;
        }
        if (_matchesAnyKey(rolesLower, const ['star cast', 'cast', 'starring', 'actors', 'featuring cast', 'movie artists'])) {
          for (final n in _splitPeople(rawValue)) {
            addPerson(castMap, n, 'Actor');
            final nk = _normPersonKey(_stripHonorific(n));
            if (performingMap.containsKey(nk)) {
              performingMap[nk]!.addRole('Actor');
            }
          }
          continue;
        }

        // Parse potentially comma-separated multi-roles from YouTube Topic credit lines:
        // e.g. "Drumprogrammer, Mastering Engineer, Producer, Mixing Engineer, Composer Lyricist, Vocal Engineer: MIKE DEAN"
        final roleTokens = rawRoles
            .split(',')
            .map((r) => r.trim())
            .where((r) => r.isNotEmpty)
            .toList();
        final people = _splitPeople(rawValue);
        if (people.isEmpty) continue;

        for (final rTok in roleTokens) {
          final rl = rTok.toLowerCase();
          if (rl == 'title' || rl == 'song' || rl == 'track') continue;

          if (_isPerformingRole(rl)) {
            final niceRole = _normalizeRoleLabel(rTok, fallback: 'Lead Vocals');
            for (final n in people) {
              addPerson(performingMap, n, niceRole);
            }
          }
          if (_isComposerRole(rl)) {
            for (final n in people) {
              addPerson(compLyricsMap, n, 'Composer');
            }
          }
          if (_isLyricistRole(rl)) {
            for (final n in people) {
              addPerson(compLyricsMap, n, 'Lyricist');
            }
          }
          if (_isProductionRole(rl)) {
            final niceRole = _normalizeRoleLabel(rTok, fallback: 'Producer');
            for (final n in people) {
              if (!MediaNormalizer.isDistributorOrLabel(n)) {
                addPerson(prodMap, n, niceRole);
              } else {
                label ??= n;
              }
            }
          }
        }
      }
    }

    // Parse Topic/primary first, then official video to enrich Movie/Cast/Composer/Lyricist
    parseOneDescription(primaryDescription);
    parseOneDescription(videoDescription);

    // Enrich with JioSaavn structured credits if present
    if (jioSaavnData != null && jioSaavnData.isNotEmpty) {
      final jsAlbum = (jioSaavnData['album'] ?? '').toString().trim();
      if (jsAlbum.isNotEmpty) {
        considerAlbumCandidate(jsAlbum);
        final cleaned = MediaNormalizer.cleanAlbumTitle(jsAlbum);
        if (!_isWeakOrSelfTitledAlbum(cleaned, cleanSongTitle)) {
          // If JioSaavn lists starring cast on this album, it's a soundtrack/movie
          if ((jioSaavnData['starring'] ?? '').toString().trim().isNotEmpty) {
            movieName ??= cleaned;
          }
        }
      }
      final jsStarring = (jioSaavnData['starring'] ?? '').toString().trim();
      if (jsStarring.isNotEmpty) {
        for (final n in _splitPeople(jsStarring)) {
          addPerson(castMap, n, 'Actor');
          final nk = _normPersonKey(_stripHonorific(n));
          if (performingMap.containsKey(nk)) {
            performingMap[nk]!.addRole('Actor');
          }
        }
      }
      final jsSingers = (jioSaavnData['singers'] ?? '').toString().trim();
      if (jsSingers.isNotEmpty) {
        for (final n in _splitPeople(jsSingers)) {
          addPerson(performingMap, n, 'Singer');
        }
      }
      final jsMusic = (jioSaavnData['music'] ?? '').toString().trim();
      if (jsMusic.isNotEmpty) {
        for (final n in _splitPeople(jsMusic)) {
          // Don't override pure singers into composer if JioSaavn copied primary_artists into music
          final nk = _normPersonKey(_stripHonorific(n));
          if (!compLyricsMap.containsKey(nk) &&
              !(performingMap.length > 1 && performingMap.containsKey(nk))) {
            addPerson(compLyricsMap, n, 'Music Director');
          }
        }
      }
      final jsLabel = (jioSaavnData['label'] ?? '').toString().trim();
      if (jsLabel.isNotEmpty) label ??= jsLabel;
      final jsCp = (jioSaavnData['copyright_text'] ?? '').toString().trim();
      if (jsCp.isNotEmpty) {
        copyright ??= jsCp.replaceFirst(RegExp(r'^\(P\)', caseSensitive: false), '℗');
      }
      final jsRel = (jioSaavnData['release_date'] ?? '').toString().trim();
      if (jsRel.isNotEmpty && (releaseDate == null || releaseDate!.length <= 4)) {
        releaseDate = formatReleaseDate(jsRel) ?? releaseDate;
      }
    }

    // Enrich with iTunes metadata (accurate releaseDate, album title, genre)
    if (itunesData != null && itunesData.isNotEmpty) {
      final itColl = (itunesData['collectionName'] ?? '').toString().trim();
      if (itColl.isNotEmpty) {
        considerAlbumCandidate(itColl);
      }
      final itRel = formatReleaseDate(itunesData['releaseDate']?.toString());
      if (itRel != null && itRel.isNotEmpty) {
        releaseDate = itRel;
      }
      final itGenre = (itunesData['primaryGenreName'] ?? '').toString().trim();
      if (itGenre.isNotEmpty) genre = itGenre;
    }

    // Never leave album equal to the song title (from a single release) when
    // the movie/soundtrack name is already known.
    if (movieName != null &&
        movieName!.isNotEmpty &&
        _isWeakOrSelfTitledAlbum(album, cleanSongTitle)) {
      album = movieName;
    }

    // Replace generic "Performer" role with specific roles if richer role was discovered
    for (final p in performingMap.values) {
      if (p.roles.length > 1 && p.roles.contains('Performer')) {
        p.roles.remove('Performer');
      }
    }

    final albumChangedFromWeak =
        album != base.album &&
        _isWeakOrSelfTitledAlbum(track.album, cleanSongTitle);

    return base.copyWith(
      album: album,
      clearAlbumBrowseId: albumChangedFromWeak,
      movieName: movieName,
      director: director,
      distributor: distributor,
      label: label,
      copyright: copyright,
      releaseDate: releaseDate,
      genre: genre,
      performingArtists: performingMap.values.map((m) => m.freeze()).toList(),
      compositionAndLyrics: compLyricsMap.values.map((m) => m.freeze()).toList(),
      movieCast: castMap.values.map((m) => m.freeze()).toList(),
      productionAndEngineering: prodMap.values.map((m) => m.freeze()).toList(),
    );
  }

  /// Fetches enriched credits and progressively resolves artist YT Music links & photos.
  Future<SongCredits> fetchCredits(
    Track track, {
    void Function(SongCredits updated)? onProgress,
  }) async {
    final cacheKey = track.id.isNotEmpty ? track.id : '${track.title}_${track.artist}';
    final cached = _cache[cacheKey];
    if (cached != null) {
      onProgress?.call(cached);
      return cached;
    }

    var current = baselineFromTrack(track);
    onProgress?.call(current);

    final cleanTitle = MediaNormalizer.cleanTitle(track.title);
    final primaryArtist = MediaNormalizer.cleanArtistName(track.artist);
    var videoId = track.id.replaceFirst(RegExp(r'^(yt-|yt:)'), '').trim();
    if (videoId.isEmpty || videoId.startsWith('trk_')) {
      try {
        final songs = await InnerTubeService.instance
            .search('$cleanTitle $primaryArtist'.trim())
            .timeout(const Duration(seconds: 4));
        if (songs.isNotEmpty) {
          videoId = songs.first.id.replaceFirst('yt-', '').trim();
        }
      } catch (_) {}
    }

    // Parallel external fetches:
    // 1) Topic/track player details
    // 2) Official video description (for Film/Cast/Director/Composer/Lyricist)
    // 3) JioSaavn metadata
    // 4) iTunes lookup metadata
    final vidDetFut = (videoId.isNotEmpty && !videoId.startsWith('trk_'))
        ? InnerTubeService.instance
              .getVideoDetails(videoId)
              .timeout(const Duration(seconds: 6))
              .catchError((_) => null)
        : Future<VideoDetailsResult?>.value(null);

    final officialVideoDescFut = _fetchOfficialVideoDescription(
      cleanTitle: cleanTitle,
      primaryArtist: primaryArtist,
      excludeVideoId: videoId,
    );
    final saavnFut = _fetchJioSaavnCredits(
      cleanTitle,
      primaryArtist,
      movieName: current.movieName,
    );
    final itunesFut = _fetchItunesCredits(
      cleanTitle,
      primaryArtist,
      movieName: current.movieName,
    );

    final results = await Future.wait([
      vidDetFut,
      officialVideoDescFut,
      saavnFut,
      itunesFut,
    ]);

    final vidDet = results[0] as VideoDetailsResult?;
    final vidDesc = results[1] as String?;
    final saavn = results[2] as Map<String, dynamic>?;
    final itunes = results[3] as Map<String, dynamic>?;

    current = parseCredits(
      track: track,
      base: current,
      primaryDescription: vidDet?.description,
      videoDescription: vidDesc,
      publishDate: vidDet?.publishDate,
      uploadDate: vidDet?.uploadDate,
      jioSaavnData: saavn,
      itunesData: itunes,
    );
    _cache[cacheKey] = current;
    onProgress?.call(current);

    // Resolve YT Music profile photos + clickable channel browseIds for credited people
    final resolved = await _resolvePeopleProfiles(current);
    _cache[cacheKey] = resolved;
    onProgress?.call(resolved);
    return resolved;
  }

  Future<String?> _fetchOfficialVideoDescription({
    required String cleanTitle,
    required String primaryArtist,
    required String excludeVideoId,
  }) async {
    try {
      final q = '$cleanTitle ${primaryArtist.split(',').first.trim()} official'.trim();
      final hits = await InnerTubeService.instance
          .searchVideos(q)
          .timeout(const Duration(seconds: 4));
      for (final v in hits.take(3)) {
        final cid = v.id.replaceFirst(RegExp(r'^(yt-|yt:)'), '').trim();
        if (cid.isEmpty || cid == excludeVideoId) continue;
        final vClean = MediaNormalizer.cleanTitle(v.title).toLowerCase();
        final tLower = cleanTitle.toLowerCase();
        if (tLower.isNotEmpty &&
            !vClean.contains(tLower) &&
            !tLower.contains(vClean)) {
          continue;
        }
        final det = await InnerTubeService.instance
            .getVideoDetails(cid)
            .timeout(const Duration(seconds: 4));
        if (det != null && det.description.isNotEmpty) {
          return det.description;
        }
      }
    } catch (_) {}
    return null;
  }

  Future<Map<String, dynamic>?> _fetchJioSaavnCredits(
    String title,
    String artist, {
    String? movieName,
  }) async {
    try {
      final firstArtist = artist.split(',').first.trim();
      final hint = (movieName != null && movieName.trim().isNotEmpty)
          ? movieName.trim()
          : firstArtist;
      final q = '$title $hint'.trim();
      final uri = Uri.https('www.jiosaavn.com', '/api.php', {
        '__call': 'search.getResults',
        '_format': 'json',
        '_marker': '0',
        'ctx': 'web6dot0',
        'q': q,
      });
      final res = await _client
          .get(uri, headers: {'User-Agent': 'Mozilla/5.0'})
          .timeout(const Duration(seconds: 4));
      if (res.statusCode != 200) return null;
      final decoded = jsonDecode(utf8.decode(res.bodyBytes));
      final results = (decoded is Map ? decoded['results'] : null) as List?;
      if (results == null || results.isEmpty) return null;

      final tNorm = title.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
      Map<String, dynamic>? match;
      for (final r in results.take(8)) {
        if (r is! Map) continue;
        final m = Map<String, dynamic>.from(r);
        final sTitle = MediaNormalizer.cleanTitle(
          (m['song'] ?? m['title'] ?? '').toString(),
        );
        final sNorm = sTitle.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
        if (tNorm.isNotEmpty &&
            sNorm != tNorm &&
            !sNorm.contains(tNorm) &&
            !tNorm.contains(sNorm)) {
          continue;
        }
        final candAlbum = MediaNormalizer.decodeHtml(
          (m['album'] ?? '').toString(),
        ).trim();
        final isWeak = _isWeakOrSelfTitledAlbum(candAlbum, title);
        match ??= m;
        if (!isWeak) {
          match = m;
          break;
        }
      }
      if (match == null) return null;

      final sid = match['id']?.toString();
      if (sid != null && sid.isNotEmpty) {
        try {
          final detUri = Uri.https('www.jiosaavn.com', '/api.php', {
            '__call': 'song.getDetails',
            '_format': 'json',
            '_marker': '0',
            'ctx': 'web6dot0',
            'pids': sid,
          });
          final detRes = await _client
              .get(detUri, headers: {'User-Agent': 'Mozilla/5.0'})
              .timeout(const Duration(seconds: 3));
          if (detRes.statusCode == 200) {
            final detJson = jsonDecode(utf8.decode(detRes.bodyBytes));
            if (detJson is Map && detJson[sid] is Map) {
              return Map<String, dynamic>.from(detJson[sid] as Map);
            }
          }
        } catch (_) {}
      }
      return match;
    } catch (_) {
      return null;
    }
  }

  Future<Map<String, dynamic>?> _fetchItunesCredits(
    String title,
    String artist, {
    String? movieName,
  }) async {
    final firstArtist = artist.split(RegExp(r'[,&]')).first.trim();
    final queries = <String>[
      if (movieName != null && movieName.trim().isNotEmpty)
        '$title ${movieName.trim()}',
      '$title $firstArtist'.trim(),
    ];
    final tNorm = title.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
    Map<String, dynamic>? fallbackMatch;

    for (final term in queries.where((q) => q.isNotEmpty)) {
      try {
        final uri = Uri.https('itunes.apple.com', '/search', {
          'term': term,
          'entity': 'song',
          'limit': '8',
        });
        final res = await _client
            .get(uri, headers: {'User-Agent': 'ZenifyApp/1.0'})
            .timeout(const Duration(seconds: 4));
        if (res.statusCode != 200) continue;
        final json = jsonDecode(utf8.decode(res.bodyBytes));
        final list = (json is Map ? json['results'] : null) as List?;
        if (list == null || list.isEmpty) continue;

        for (final item in list) {
          if (item is! Map) continue;
          final m = Map<String, dynamic>.from(item);
          final tn = MediaNormalizer.cleanTitle((m['trackName'] ?? '').toString())
              .toLowerCase()
              .replaceAll(RegExp(r'[^a-z0-9]'), '');
          if (tn.isEmpty || (!tn.contains(tNorm) && !tNorm.contains(tn))) {
            continue;
          }
          fallbackMatch ??= m;
          final coll = (m['collectionName'] ?? '').toString().trim();
          if (!_isWeakOrSelfTitledAlbum(coll, title)) {
            return m;
          }
        }
      } catch (_) {}
    }
    return fallbackMatch;
  }

  Future<SongCredits> _resolvePeopleProfiles(SongCredits credits) async {
    final allNames = <String>{};
    for (final list in [
      credits.performingArtists,
      credits.compositionAndLyrics,
      credits.movieCast,
      credits.productionAndEngineering,
    ]) {
      for (final p in list) {
        if (!p.isClickable || p.imageUrl == null || p.imageUrl!.isEmpty) {
          allNames.add(p.name);
        }
      }
    }
    if (allNames.isEmpty) return credits;

    // Resolve in small batches of 4 so all artists populate quickly without flooding network
    final namesList = allNames.toList();
    for (var i = 0; i < namesList.length; i += 4) {
      final batch = namesList.skip(i).take(4);
      await Future.wait(batch.map(_resolveSinglePerson));
    }

    CreditPerson applyResolved(CreditPerson p) {
      final cached = _artistIdCache[_normPersonKey(p.name)];
      if (cached == null) return p;
      return p.copyWith(
        browseId: (cached.browseId != null && cached.browseId!.isNotEmpty)
            ? cached.browseId
            : p.browseId,
        imageUrl: (cached.imageUrl != null && cached.imageUrl!.isNotEmpty)
            ? cached.imageUrl
            : p.imageUrl,
      );
    }

    return credits.copyWith(
      performingArtists: credits.performingArtists.map(applyResolved).toList(),
      compositionAndLyrics:
          credits.compositionAndLyrics.map(applyResolved).toList(),
      movieCast: credits.movieCast.map(applyResolved).toList(),
      productionAndEngineering:
          credits.productionAndEngineering.map(applyResolved).toList(),
    );
  }

  Future<void> _resolveSinglePerson(String name) async {
    final key = _normPersonKey(name);
    if (key.isEmpty || _artistIdCache.containsKey(key)) return;
    try {
      final hits = await InnerTubeService.instance
          .searchArtists(name, limit: 4)
          .timeout(const Duration(seconds: 4));
      final targetClean = _normPersonKey(_stripHonorific(name));
      for (final h in hits) {
        final candClean = _normPersonKey(h.name);
        final isExact =
            candClean == key ||
            candClean == targetClean ||
            key == candClean;
        final validId =
            h.id.startsWith('UC') || h.id.startsWith('FEmusic_');
        if (isExact && validId) {
          if (h.image.isNotEmpty) {
            ArtistService.cacheAvatar(name, h.image);
          }
          _artistIdCache[key] = (
            browseId: h.id,
            imageUrl: h.image.isNotEmpty ? h.image : null,
          );
          return;
        }
      }
      _artistIdCache[key] = (
        browseId: null,
        imageUrl: ArtistService.getCachedAvatar(name),
      );
    } catch (_) {}
  }

  // ────────────────────────── Parsing Helpers ──────────────────────────────

  static String _normPersonKey(String s) => s
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9\p{L}]', unicode: true), '');

  static String _stripHonorific(String name) => name
      .replaceFirst(
        RegExp(
          r'^(?:poetu|poet|kavignar|isai\s*puyal|ulaganayagan|thalapathy|superstar|thala|ilayathalapathy|makkal\s*selvan|dr\.?|mr\.?|mrs\.?|ms\.?)\s+',
          caseSensitive: false,
        ),
        '',
      )
      .trim();

  static String _cleanCreditPersonName(String raw) {
    var s = raw
        .replaceAll(RegExp(r'["\u201c\u201d]'), '')
        .replaceAll(RegExp(r'\([^)]*\)'), '')
        .replaceAll(RegExp(r'^\s*[-–—:|•]+\s*|\s*[-–—:|•.]+\s*$'), '')
        .trim();
    if (s.length < 2 || MediaNormalizer.isDistributorOrLabel(s)) {
      if (s.toLowerCase().contains('pictures') ||
          s.toLowerCase().contains('records') ||
          s.toLowerCase().contains('music')) {
        return s; // Allow label name for producer field; filtered explicitly when needed
      }
      return '';
    }
    return s;
  }

  static List<String> _splitPeople(String raw) => raw
      .replaceAll(RegExp(r'\s+\band\b\s+', caseSensitive: false), ', ')
      .split(RegExp(r'[,&/•]'))
      .map((s) => s.trim())
      .where((s) => s.length >= 2)
      .toList();

  static bool _matchesAnyKey(String keyLower, List<String> candidates) {
    for (final c in candidates) {
      if (keyLower == c) return true;
    }
    return false;
  }

  static bool _isPerformingRole(String r) => RegExp(
    r'\b(?:singer|singers|vocal|vocals|vocalist|lead\s*vocals|sung\s*by|rendered\s*by|performer|artist|artists|featured\s*artist|ft|rap|rapper|choir|backing\s*vocals)\b',
  ).hasMatch(r);

  static bool _isComposerRole(String r) => RegExp(
    r'\b(?:composer|composed\s*by|music(?:\s*director|\s*by|\s*composed)?|music\s*producer)\b',
  ).hasMatch(r);

  static bool _isLyricistRole(String r) => RegExp(
    r'\b(?:lyricist|lyrics?|songwriter|written\s*by|words|penned\s*by)\b',
  ).hasMatch(r);

  static bool _isProductionRole(String r) => RegExp(
    r'\b(?:producer|co\s*producer|executive\s*producer|programmer|drum\s*programmer|drumprogrammer|mixing|mastering|engineer|arranger|arranged\s*by|choreographer|orchestration)\b',
  ).hasMatch(r);

  static String _normalizeRoleLabel(String raw, {required String fallback}) {
    final l = raw.trim().toLowerCase();
    if (l.contains('lead vocal') || l.contains('sung')) return 'Lead Vocals';
    if (l == 'vocalist' || l == 'vocals' || l == 'vocal' || l.contains('singer')) {
      return 'Lead Vocals';
    }
    if (l.contains('drumprogrammer') || l.contains('drum programmer')) {
      return 'Drum Programmer';
    }
    if (l.contains('co producer')) return 'Co-Producer';
    if (l.contains('mastering')) return 'Mastering Engineer';
    if (l.contains('mixing')) return 'Mixing Engineer';
    if (l.contains('vocal engineer')) return 'Vocal Engineer';
    if (l.contains('music director')) return 'Music Director';
    if (l.contains('composer')) return 'Composer';
    if (l.contains('lyric')) return 'Lyricist';
    if (l.contains('producer')) return 'Producer';
    if (l.contains('programmer')) return 'Programmer';
    return raw.trim().isNotEmpty
        ? raw.trim()[0].toUpperCase() + raw.trim().substring(1)
        : fallback;
  }

  static void _extractInlineProseCredits(
    String line, {
    required void Function(String) onMovie,
    required void Function(String) onDirector,
    required void Function(String) onComposer,
    required void Function(String) onLyricist,
    required void Function(String) onVocal,
  }) {
    final movieRe = RegExp(
      r'\bfrom\s+the\s+movie\s+["\u201c]?([A-Za-z0-9\s\x27&-]{2,45})["\u201d]?',
      caseSensitive: false,
    ).firstMatch(line);
    if (movieRe != null) {
      final mv = movieRe.group(1)!.trim();
      if (mv.isNotEmpty) onMovie(mv);
    }

    final dirRe = RegExp(
      r'\bDirected\s+by\s+([^,.\r\n&]+)',
      caseSensitive: false,
    ).firstMatch(line);
    if (dirRe != null) onDirector(dirRe.group(1)!.trim());

    final compRe = RegExp(
      r'\b(?:Music\s+composed\s+by|Music\s+by|Composed\s+by)\s+([^,.\r\n&|]+)',
      caseSensitive: false,
    ).firstMatch(line);
    if (compRe != null) onComposer(compRe.group(1)!.trim());

    final lyrByRe = RegExp(
      r'\b(?:Lyrics\s+by|Penned\s+by|Written\s+by)\s+([^,.\r\n&|]+)',
      caseSensitive: false,
    ).firstMatch(line);
    if (lyrByRe != null) onLyricist(lyrByRe.group(1)!.trim());

    final vocByRe = RegExp(
      r'\b(?:Sung\s+by|Vocals?\s+by|Rendered\s+by)\s+([^,.\r\n&|]+)',
      caseSensitive: false,
    ).firstMatch(line);
    if (vocByRe != null) onVocal(vocByRe.group(1)!.trim());

    final lyrVocRe = RegExp(
      r'\bLyrics\s+and\s+Vocals?\s*[-–—:]\s*([^,.\r\n|]+)',
      caseSensitive: false,
    ).firstMatch(line);
    if (lyrVocRe != null) {
      final who = lyrVocRe.group(1)!.trim();
      onLyricist(who);
      onVocal(who);
    }
  }
}

class _MutablePerson {
  _MutablePerson({
    required this.name,
    required this.roles,
    this.browseId,
    this.imageUrl,
  });

  final String name;
  final Set<String> roles;
  final String? browseId;
  final String? imageUrl;

  void addRole(String r) {
    if (r.trim().isEmpty) return;
    roles.add(r.trim());
  }

  CreditPerson freeze() {
    final ordered = roles.toList()..sort();
    return CreditPerson(
      name: name,
      role: ordered.join(', '),
      browseId: browseId,
      imageUrl: imageUrl,
    );
  }
}
