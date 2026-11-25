import 'dart:collection';

import '../models/track.dart';
import '../utils/media_normalizer.dart';
import 'innertube_service.dart';

/// Release classification for cards, tracks, and destination pages.
enum MediaReleaseKind { album, single, ep, playlist, video }

/// Lightweight catalog release model used on Home, Explore, and Search shelves.
class ReleaseSummary {
  const ReleaseSummary({
    required this.title,
    required this.artist,
    required this.coverUrl,
    this.browseId,
    this.kind = MediaReleaseKind.album,
    this.year,
    this.sourceTrack,
  });

  final String title;
  final String artist;
  final String coverUrl;
  final String? browseId;
  final MediaReleaseKind kind;
  final String? year;
  final Track? sourceTrack;

  bool get isSingle => kind == MediaReleaseKind.single;
  bool get isVideo => kind == MediaReleaseKind.video;

  String get typeLabel => switch (kind) {
        MediaReleaseKind.album => 'Album',
        MediaReleaseKind.single => 'Single',
        MediaReleaseKind.ep => 'EP',
        MediaReleaseKind.playlist => 'Playlist',
        MediaReleaseKind.video => 'Music Video',
      };
}

/// Strictly validated parent album resolution result for a song or single.
class ValidatedAlbumResult {
  const ValidatedAlbumResult({
    required this.title,
    required this.artist,
    required this.coverUrl,
    required this.browseId,
    required this.tracks,
    this.albumType = 'Album',
    this.year,
  });

  final String title;
  final String artist;
  final String coverUrl;
  final String browseId;
  final List<Track> tracks;
  final String albumType;
  final int? year;
}

/// Centralized validation & resolution engine for Albums, Singles, Songs, and Video Songs.
///
/// Guarantees:
/// 1. Video songs NEVER resolve or redirect to albums.
/// 2. Songs/Singles NEVER redirect to Unplugged / Lo-Fi / Remix / Cover / Live versions
///    unless the source song itself carries that variant tag.
/// 3. Candidate albums are verified against artist overlap and track containment.
class AlbumResolver {
  AlbumResolver._();

  static final RegExp _variantRegex = RegExp(
    r'\b(unplugged|lofi|lo-fi|slowed|reverb|sped\s*up|speed\s*up|acoustic|remix|cover|karaoke|instrumental|8d|mashup|tribute|live|concert|session|ringtone|bgm)\b',
    caseSensitive: false,
  );

  static final RegExp _fromSoundtrackRegex = RegExp(
    r'[\(\[]\s*From\s+["\u201c\u201d\x27\u2018\u2019]?([^"\)\]]+)["\u201c\u201d\x27\u2018\u2019]?\s*[\)\]]',
    caseSensitive: false,
  );

  static final LinkedHashMap<String, ValidatedAlbumResult?> _parentAlbumCache =
      LinkedHashMap<String, ValidatedAlbumResult?>();
  static const int _maxCacheEntries = 64;

  static void clearCache() => _parentAlbumCache.clear();

  /// Unified check for whether a [Track] represents a music video rather than audio/album track.
  static bool isVideoTrack(Track t) => isVideoContext(
        isVideo: t.isVideo,
        title: t.title,
        album: t.album,
        coverUrl: t.coverUrl,
      );

  static bool isVideoContext({
    required bool isVideo,
    String? title,
    String? album,
    String? coverUrl,
  }) {
    if (isVideo) return true;
    final a = (album ?? '').trim().toLowerCase();
    if (a == 'music video' || a == 'video') return true;
    return Track.detectIsVideo(title ?? '', album ?? '', coverUrl: coverUrl);
  }

  /// True when [browseId] looks like an authentic YouTube Music album release ID
  /// (never a playlist `PL...`, radio `RD...`, or channel `UC...`).
  static bool isValidAlbumBrowseId(String? browseId) {
    final id = browseId?.trim() ?? '';
    if (id.isEmpty) return false;
    return id.startsWith('MPREb_') ||
        id.startsWith('OLAK5uy_') ||
        id.startsWith('FEmusic_library_privately_owned_release_detail');
  }

  static String? sanitizeAlbumBrowseId(String? browseId) {
    final id = browseId?.trim();
    if (id == null || id.isEmpty) return null;
    return isValidAlbumBrowseId(id) ? id : null;
  }

  /// True if [candidateText] introduces a remix/unplugged/lofi/acoustic/cover/live
  /// variant modifier that is NOT present in [sourceText].
  static bool isVariantConflict(String sourceText, String candidateText) {
    final src = _variantRegex
        .allMatches(sourceText)
        .map((m) => m.group(0)!.toLowerCase().replaceAll(RegExp(r'\s+'), ' '))
        .toSet();
    final cand = _variantRegex
        .allMatches(candidateText)
        .map((m) => m.group(0)!.toLowerCase().replaceAll(RegExp(r'\s+'), ' '))
        .toSet();
    return cand.any((marker) => !src.contains(marker));
  }

  static bool isValidAlbumTitle(String? title) {
    final t = (title ?? '').trim();
    if (t.isEmpty) return false;
    final lower = t.toLowerCase();
    if (lower == 'single' ||
        lower == 'music video' ||
        lower == 'video' ||
        lower == 'album' ||
        lower == 'unknown title' ||
        lower == 'unknown album') {
      return false;
    }
    if (t.startsWith('UC')) return false;
    if (MediaNormalizer.isMetadataNoise(t)) return false;
    return true;
  }

  static bool isSingleReleaseTitle(String? title) {
    final t = (title ?? '').trim().toLowerCase();
    if (t.isEmpty || t == 'single') return true;
    return RegExp(r'(?:-\s*single|\(\s*single\s*\)|\[\s*single\s*\])$')
        .hasMatch(t);
  }

  static String? extractSoundtrackName(String? rawTitle) {
    if (rawTitle == null || rawTitle.isEmpty) return null;
    final m = _fromSoundtrackRegex.firstMatch(rawTitle);
    var extracted = m?.group(1)?.trim();
    if (extracted == null || extracted.isEmpty) return null;
    extracted = extracted
        .replaceAll(RegExp(r'^["\u201c\u201d\x27\u2018\u2019]+'), '')
        .replaceAll(RegExp(r'["\u201c\u201d\x27\u2018\u2019]+$'), '')
        .trim();
    return extracted.isEmpty ? null : extracted;
  }

  static String normalizeForMatch(String raw) {
    var s = raw.toLowerCase();
    s = s.replaceAll(_fromSoundtrackRegex, ' ');
    s = s.replaceAll(RegExp(r'\[[^\]]*\]'), ' ');
    s = s.replaceAll(
      RegExp(
        r'\([^)]*(feat|ft|official|lyric|audio|video|hd|4k)[^)]*\)',
        caseSensitive: false,
      ),
      ' ',
    );
    s = s.replaceAll(RegExp(r'-\s*single\b', caseSensitive: false), ' ');
    s = s.replaceAll(RegExp(r'[^\p{L}\p{N}\s]', unicode: true), ' ');
    s = s.replaceAll(RegExp(r'\s+'), ' ').trim();
    return s;
  }

  static bool titlesMatch(String expectedTitle, String candidateTitle) {
    final a = normalizeForMatch(expectedTitle);
    final b = normalizeForMatch(candidateTitle);
    if (a.isEmpty || b.isEmpty) return false;
    if (a == b) return true;
    if (a.length >= 4 && b.contains(a)) return true;
    if (b.length >= 4 && a.contains(b)) return true;
    return false;
  }

  static List<String> _meaningfulArtists(String rawArtist) {
    return MediaNormalizer.splitArtistNames(rawArtist)
        .map((a) => a.trim().toLowerCase())
        .where((a) {
          if (a.isEmpty) return false;
          if (a == 'unknown artist' ||
              a == 'various artists' ||
              a == 'artist') {
            return false;
          }
          return !MediaNormalizer.isDistributorOrLabel(a);
        })
        .toList();
  }

  static bool artistsOverlap(String expectedArtist, String candidateArtist) {
    final expected = _meaningfulArtists(expectedArtist);
    if (expected.isEmpty) return true;
    final cand = _meaningfulArtists(candidateArtist);
    if (cand.isEmpty) return false;
    for (final e in expected) {
      for (final c in cand) {
        if (e == c) return true;
        if (e.length >= 3 && c.contains(e)) return true;
        if (c.length >= 3 && e.contains(c)) return true;
      }
    }
    return false;
  }

  /// Validates that [candidateAlbumTitle] / [albumTracks] genuinely belong to [song]
  /// (no Unplugged/Remix/Lofi hijack, artist alignment, and track containment).
  static bool isValidAlbumForTrack({
    required Track song,
    required String candidateAlbumTitle,
    required String candidateArtist,
    List<Track>? albumTracks,
    String? candidateBrowseId,
  }) {
    if (isVideoTrack(song)) return false;
    if (!isValidAlbumTitle(candidateAlbumTitle)) return false;
    if (candidateBrowseId != null &&
        candidateBrowseId.isNotEmpty &&
        !isValidAlbumBrowseId(candidateBrowseId)) {
      return false;
    }

    final sourceContext = '${song.title} ${song.album}'.trim();
    if (isVariantConflict(sourceContext, candidateAlbumTitle)) {
      return false;
    }

    if (albumTracks != null && albumTracks.isNotEmpty) {
      final containsSong = albumTracks.any((t) {
        if (isVariantConflict(song.title, t.title)) return false;
        if (!titlesMatch(song.title, t.title)) return false;
        return artistsOverlap(song.artist, t.artist) ||
            artistsOverlap(song.artist, candidateArtist);
      });
      if (!containsSong) return false;
    } else if (!artistsOverlap(song.artist, candidateArtist)) {
      return false;
    }

    return true;
  }

  /// Resolves and strictly validates the parent multi-track Album for a song or single.
  ///
  /// Returns `null` for:
  /// - Any video song (video songs never redirect to an album)
  /// - Standalone singles with no multi-track parent album
  /// - Unvalidated/mismatched/variant (e.g. Unplugged, Lofi, Remix, Cover) results
  static Future<ValidatedAlbumResult?> resolveValidatedParentAlbumForTrack(
    Track song, {
    String? excludeBrowseId,
  }) async {
    if (isVideoTrack(song)) return null;

    final cacheKey =
        '${song.id}|${song.albumBrowseId ?? ''}|${song.album}|${excludeBrowseId ?? ''}';
    if (_parentAlbumCache.containsKey(cacheKey)) {
      return _parentAlbumCache[cacheKey];
    }

    ValidatedAlbumResult? store(ValidatedAlbumResult? res) {
      if (_parentAlbumCache.length >= _maxCacheEntries) {
        _parentAlbumCache.remove(_parentAlbumCache.keys.first);
      }
      _parentAlbumCache[cacheKey] = res;
      return res;
    }

    final it = InnerTubeService.instance;
    final triedIds = <String>{
      if (excludeBrowseId != null && excludeBrowseId.isNotEmpty) excludeBrowseId,
    };

    Future<ValidatedAlbumResult?> inspectCandidate(String? browseId) async {
      final validId = sanitizeAlbumBrowseId(browseId);
      if (validId == null || !triedIds.add(validId)) return null;

      final res = await it.getAlbum(
        validId,
        albumTitle: song.album,
        artistName: song.artist,
        videoId: song.id,
        songTitle: song.title,
        isSingle: false,
        isVideo: false,
      );
      if (res == null || res.tracks.length <= 1) return null;
      final resType = (res.albumType ?? '').toLowerCase();
      if (resType == 'single') return null;

      final title = MediaNormalizer.cleanAlbumTitle(res.title ?? song.album);
      final artist = MediaNormalizer.formatArtists(res.artist ?? song.artist);
      if (isSingleReleaseTitle(title)) return null;
      if (!isValidAlbumForTrack(
        song: song,
        candidateAlbumTitle: title,
        candidateArtist: artist,
        albumTracks: res.tracks,
        candidateBrowseId: validId,
      )) {
        return null;
      }

      return ValidatedAlbumResult(
        title: title,
        artist: artist,
        coverUrl: res.coverUrl.isNotEmpty ? res.coverUrl : song.coverUrl,
        browseId: validId,
        tracks: res.tracks,
        albumType: res.tracks.length <= 6 ? 'EP' : 'Album',
        year: res.year,
      );
    }

    try {
      // 1. Check track's own albumBrowseId (when it points to a multi-track album)
      final directHit = await inspectCandidate(song.albumBrowseId);
      if (directHit != null) return store(directHit);

      // 2. Check authoritative WatchNext metadata for this exact videoId
      final nextDetails = await it.resolveSongAlbumDetails(song.id);
      if (nextDetails != null) {
        final nextHit = await inspectCandidate(nextDetails.albumBrowseId);
        if (nextHit != null) return store(nextHit);
      }

      // 3. Check explicit soundtrack attribution: (From "Movie")
      final movie =
          extractSoundtrackName(song.title) ?? extractSoundtrackName(song.album);
      if (movie != null && movie.isNotEmpty) {
        final q = song.artist.isNotEmpty ? '$movie ${song.artist}' : movie;
        final candidates = await it.searchAlbumsNative(q);
        for (final c in candidates.take(4)) {
          final candTitle = (c['title'] ?? '').toString();
          final candType = (c['albumType'] ?? '').toString().toLowerCase();
          if (candType == 'single' || isSingleReleaseTitle(candTitle)) continue;
          if (isVariantConflict('${song.title} $movie', candTitle)) continue;
          if (!titlesMatch(movie, candTitle)) continue;
          final hit = await inspectCandidate((c['browseId'] ?? c['id'])?.toString());
          if (hit != null) return store(hit);
        }
      }

      // 4. If the track already names a non-single album distinct from its own title, validate album search
      final cleanAlb = MediaNormalizer.cleanAlbumTitle(song.album);
      if (isValidAlbumTitle(cleanAlb) &&
          !isSingleReleaseTitle(cleanAlb) &&
          normalizeForMatch(cleanAlb) != normalizeForMatch(song.title)) {
        final q =
            song.artist.isNotEmpty ? '$cleanAlb ${song.artist}' : cleanAlb;
        final candidates = await it.searchAlbumsNative(q);
        for (final c in candidates.take(3)) {
          final candTitle = (c['title'] ?? '').toString();
          final candType = (c['albumType'] ?? '').toString().toLowerCase();
          if (candType == 'single' || isSingleReleaseTitle(candTitle)) continue;
          if (isVariantConflict('${song.title} $cleanAlb', candTitle)) continue;
          if (!titlesMatch(cleanAlb, candTitle)) continue;
          final hit = await inspectCandidate((c['browseId'] ?? c['id'])?.toString());
          if (hit != null) return store(hit);
        }
      }
    } catch (_) {}

    return store(null);
  }
}
