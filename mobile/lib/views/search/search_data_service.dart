import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../models/track.dart';
import '../../services/api_service.dart';
import '../../services/innertube_service.dart';
import 'search_models.dart';

class SearchDataService {
  SearchDataService._();
  static final SearchDataService instance = SearchDataService._();

  static const String _recentPrefKey = 'zenify_recent_search_history';
  final ValueNotifier<List<String>> recentsNotifier = ValueNotifier<List<String>>([]);
  bool _initializedRecents = false;

  Future<void> initRecents() async {
    if (_initializedRecents) return;
    _initializedRecents = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getStringList(_recentPrefKey);
      if (saved != null && saved.isNotEmpty) {
        recentsNotifier.value = saved;
        for (final s in saved.reversed) {
          ApiService.addRecentSearch(s);
        }
      }
    } catch (_) {}
  }

  Future<void> addRecent(String query) async {
    final q = query.trim();
    if (q.isEmpty) return;
    final current = List<String>.from(recentsNotifier.value);
    current.removeWhere((item) => item.toLowerCase() == q.toLowerCase());
    current.insert(0, q);
    if (current.length > 12) current.removeRange(12, current.length);
    recentsNotifier.value = current;
    ApiService.addRecentSearch(q);

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_recentPrefKey, current);
    } catch (_) {}
  }

  Future<void> removeRecent(String query) async {
    final current = List<String>.from(recentsNotifier.value);
    current.removeWhere((item) => item.toLowerCase() == query.toLowerCase());
    recentsNotifier.value = current;
    ApiService.removeRecentSearch(query);

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList(_recentPrefKey, current);
    } catch (_) {}
  }

  Future<void> clearRecents() async {
    recentsNotifier.value = [];
    ApiService.clearRecentSearches();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_recentPrefKey);
    } catch (_) {}
  }

  Future<List<String>> getSuggestions(String query) async {
    final q = query.trim();
    if (q.isEmpty) {
      return recentsNotifier.value.take(6).toList();
    }

    final localMatches = ApiService.suggest(q, limit: 6);
    try {
      final onlineMatches = await InnerTubeService.instance.getSearchSuggestions(q);
      final set = <String>{};
      final combined = <String>[];
      for (final item in [...onlineMatches, ...localMatches]) {
        if (set.add(item.toLowerCase())) {
          combined.add(item);
        }
      }
      return combined.take(8).toList();
    } catch (_) {
      return localMatches;
    }
  }

  Future<SearchResultsGroup> search(String query) async {
    final q = query.trim();
    if (q.isEmpty) return const SearchResultsGroup();

    // 1. Direct on-device YouTube InnerTube search (user IP directly to YouTube Music):
    try {
      final generalJson = await InnerTubeService.instance
          .post('search', {'query': q})
          .timeout(const Duration(seconds: 8));

      final parsed = _parseGeneralSearch(generalJson, q);

      // If general search succeeded with songs or topResult, return immediately for instant response
      if (parsed.songs.length >= 3 || (parsed.topResult != null && parsed.songs.isNotEmpty)) {
        return parsed;
      }

      // If general search returned few or no songs, supplement with filtered song search
      List<Track> filteredSongs = [];
      try {
        filteredSongs = await InnerTubeService.instance
            .search(q)
            .timeout(const Duration(seconds: 6));
      } catch (_) {}

      final mergedSongs = <Track>[...parsed.songs];
      final seenIds = mergedSongs.map((s) => s.id).toSet();
      for (final song in filteredSongs) {
        if (seenIds.add(song.id)) {
          mergedSongs.add(song);
        }
      }

      final enrichedArtists = List<SearchArtist>.from(parsed.artists);
      if (enrichedArtists.isEmpty) {
        try {
          final artistCard = await InnerTubeService.instance
              .searchArtist(q)
              .timeout(const Duration(seconds: 4));
          if (artistCard != null) {
            enrichedArtists.add(SearchArtist(
              name: artistCard.name,
              imageUrl: artistCard.thumb,
              subscribers: artistCard.audience,
              browseId: artistCard.browseId,
            ));
          }
        } catch (_) {}
      }

      SearchTopResult? topResult = parsed.topResult;
      if (topResult == null) {
        if (enrichedArtists.isNotEmpty) {
          final a = enrichedArtists.first;
          topResult = SearchTopResult(
            title: a.name,
            subtitle: 'Artist • ${a.subscribers ?? "Official"}',
            type: TopResultType.artist,
            imageUrl: a.imageUrl,
            artist: a,
          );
        } else if (mergedSongs.isNotEmpty) {
          final s = mergedSongs.first;
          topResult = SearchTopResult(
            title: s.title,
            subtitle: 'Song • ${s.artist}',
            type: TopResultType.song,
            imageUrl: s.coverUrl,
            track: s,
          );
        }
      }

      final combined = SearchResultsGroup(
        topResult: topResult,
        songs: mergedSongs,
        artists: enrichedArtists,
        albums: parsed.albums,
        playlists: parsed.playlists,
      );

      if (!combined.isEmpty) return combined;
    } catch (e) {
      if (kDebugMode) debugPrint('[SearchDataService] General search notice: $e');
    }

    // 2. Pure On-Device YouTube Music Fallback (Direct InnerTube Songs + Artist)
    try {
      final songs = await InnerTubeService.instance.search(q);
      final artistCard = await InnerTubeService.instance.searchArtist(q);
      final artists = <SearchArtist>[];
      if (artistCard != null) {
        artists.add(SearchArtist(
          name: artistCard.name,
          imageUrl: artistCard.thumb,
          subscribers: artistCard.audience,
          browseId: artistCard.browseId,
        ));
      }

      SearchTopResult? fallbackTop;
      if (artists.isNotEmpty) {
        final a = artists.first;
        fallbackTop = SearchTopResult(
          title: a.name,
          subtitle: 'Artist • ${a.subscribers ?? "Official"}',
          type: TopResultType.artist,
          imageUrl: a.imageUrl,
          artist: a,
        );
      } else if (songs.isNotEmpty) {
        final s = songs.first;
        fallbackTop = SearchTopResult(
          title: s.title,
          subtitle: 'Song • ${s.artist}',
          type: TopResultType.song,
          imageUrl: s.coverUrl,
          track: s,
        );
      }

      return SearchResultsGroup(
        topResult: fallbackTop,
        songs: songs,
        artists: artists,
        albums: const [],
        playlists: const [],
      );
    } catch (_) {}

    return const SearchResultsGroup();
  }

  SearchResultsGroup _parseGeneralSearch(Map<String, dynamic> json, String query) {
    try {
      final sectionList = json['contents']?['tabbedSearchResultsRenderer']?['tabs']?[0]
              ?['tabRenderer']?['content']?['sectionListRenderer']?['contents'] ??
          json['contents']?['sectionListRenderer']?['contents'];
      if (sectionList is! List) return const SearchResultsGroup();

      SearchTopResult? topResult;
      final songs = <Track>[];
      final artists = <SearchArtist>[];
      final albums = <SearchAlbum>[];
      final playlists = <SearchPlaylist>[];

      void processItem(Map<String, dynamic> resItem, {String shelfTitle = ''}) {
        final flexColumns = resItem['flexColumns'] as List?;
        final subtitleRuns = flexColumns != null && flexColumns.length > 1
            ? _getColumnRuns(flexColumns[1])
            : null;
        final subText = subtitleRuns != null
            ? subtitleRuns.whereType<Map>().map((r) => (r['text'] ?? '').toString()).join(' ').toLowerCase()
            : '';

        final browseEndpoint = resItem['navigationEndpoint']?['browseEndpoint'];
        final pageType = browseEndpoint?['browseEndpointContextSupportedConfigs']
            ?['browseEndpointContextMusicConfig']?['pageType']?.toString() ?? '';

        if (shelfTitle.contains('artist') || pageType == 'MUSIC_PAGE_TYPE_ARTIST' || subText.contains('artist') || subText.contains('profile')) {
          final a = _parseArtistFromItem(resItem);
          if (a != null && !artists.any((x) => x.name.toLowerCase() == a.name.toLowerCase())) {
            artists.add(a);
          }
        } else if (shelfTitle.contains('album') || pageType == 'MUSIC_PAGE_TYPE_ALBUM' || subText.contains('album') || subText.contains('ep') || subText.contains('single')) {
          final al = _parseAlbumFromItem(resItem);
          if (al != null && !albums.any((x) => x.title.toLowerCase() == al.title.toLowerCase())) {
            albums.add(al);
          }
        } else if (shelfTitle.contains('playlist') || pageType == 'MUSIC_PAGE_TYPE_PLAYLIST' || subText.contains('playlist')) {
          final pl = _parsePlaylistFromItem(resItem);
          if (pl != null && !playlists.any((x) => x.title.toLowerCase() == pl.title.toLowerCase())) {
            playlists.add(pl);
          }
        } else {
          final t = _parseTrackFromItem(resItem);
          if (t != null && !songs.any((x) => x.id == t.id)) {
            songs.add(t);
          }
        }
      }

      for (final section in sectionList) {
        if (section is! Map) continue;
        final sMap = Map<String, dynamic>.from(section);

        // 1. Top Result Shelf
        final cardShelf = sMap['musicCardShelfRenderer'];
        if (cardShelf != null && topResult == null && cardShelf is Map) {
          topResult = _parseTopResult(Map<String, dynamic>.from(cardShelf));
        }

        // 2. Direct musicShelfRenderer
        final shelf = sMap['musicShelfRenderer'];
        if (shelf is Map) {
          final titleRuns = shelf['title']?['runs'] as List?;
          final shelfTitle = titleRuns?.isNotEmpty == true
              ? (titleRuns![0]['text'] as String).toLowerCase()
              : '';
          final contents = shelf['contents'] as List?;
          if (contents != null) {
            for (final item in contents) {
              if (item is Map && item['musicResponsiveListItemRenderer'] is Map) {
                processItem(Map<String, dynamic>.from(item['musicResponsiveListItemRenderer']), shelfTitle: shelfTitle);
              }
            }
          }
        }

        // 3. itemSectionRenderer (critical for modern YouTube Music responses)
        final isr = sMap['itemSectionRenderer'];
        if (isr is Map && isr['contents'] is List) {
          for (final it in (isr['contents'] as List)) {
            if (it is! Map) continue;
            if (it['musicResponsiveListItemRenderer'] is Map) {
              processItem(Map<String, dynamic>.from(it['musicResponsiveListItemRenderer']));
            } else if (it['musicCardShelfRenderer'] is Map && topResult == null) {
              topResult = _parseTopResult(Map<String, dynamic>.from(it['musicCardShelfRenderer']));
            } else if (it['musicShelfRenderer'] is Map) {
              final subShelf = it['musicShelfRenderer'] as Map;
              final titleRuns = subShelf['title']?['runs'] as List?;
              final shelfTitle = titleRuns?.isNotEmpty == true
                  ? (titleRuns![0]['text'] as String).toLowerCase()
                  : '';
              final subContents = subShelf['contents'] as List?;
              if (subContents != null) {
                for (final subIt in subContents) {
                  if (subIt is Map && subIt['musicResponsiveListItemRenderer'] is Map) {
                    processItem(Map<String, dynamic>.from(subIt['musicResponsiveListItemRenderer']), shelfTitle: shelfTitle);
                  }
                }
              }
            }
          }
        }
      }

      // If songs are empty but we have local catalog results, supplement them
      if (songs.isEmpty) {
        final localCatalog = CatalogDataSource.allTracks
            .where((t) =>
                t.title.toLowerCase().contains(query.toLowerCase()) ||
                t.artist.toLowerCase().contains(query.toLowerCase()))
            .toList();
        songs.addAll(localCatalog);
      }

      return SearchResultsGroup(
        topResult: topResult,
        songs: songs,
        artists: artists,
        albums: albums,
        playlists: playlists,
      );
    } catch (e) {
      if (kDebugMode) debugPrint('[SearchDataService] Parse error: $e');
      return const SearchResultsGroup();
    }
  }

  SearchTopResult? _parseTopResult(Map<String, dynamic> card) {
    try {
      final titleRuns = card['title']?['runs'] as List?;
      final title = titleRuns?.isNotEmpty == true ? titleRuns![0]['text'] as String : 'Top Result';

      final subtitleRuns = card['subtitle']?['runs'] as List?;
      final subtitle = subtitleRuns?.isNotEmpty == true
          ? subtitleRuns!.map((r) => r['text'] ?? '').join()
          : '';

      final thumbs = card['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'] as List?;
      final rawCover = thumbs?.isNotEmpty == true ? thumbs!.last['url'] as String : null;

      final subLower = subtitle.toLowerCase();
      TopResultType type = TopResultType.song;
      if (subLower.contains('artist')) {
        type = TopResultType.artist;
      } else if (subLower.contains('album') || subLower.contains('ep') || subLower.contains('single')) {
        type = TopResultType.album;
      } else if (subLower.contains('playlist')) {
        type = TopResultType.playlist;
      }

      final browseEndpoint = card['title']?['runs']?[0]?['navigationEndpoint']?['browseEndpoint'];
      final browseId = browseEndpoint?['browseId'] as String?;

      // Check for playable videoId
      String? videoId;
      final buttons = card['buttons'] as List?;
      if (buttons != null && buttons.isNotEmpty && buttons[0] is Map) {
        final b0 = buttons[0] as Map;
        final p = b0['musicPlayButtonRenderer'] as Map?;
        final nav = p?['playNavigationEndpoint'] as Map?;
        videoId = nav?['watchEndpoint']?['videoId'] as String?;
      }

      Track? track;
      if (videoId != null && videoId.isNotEmpty) {
        track = Track(
          id: 'yt-$videoId',
          title: title,
          artist: subtitle.split('•').first.trim(),
          album: 'Single',
          coverUrl: rawCover ?? 'https://i.ytimg.com/vi/$videoId/hqdefault.jpg',
          durationSeconds: 210,
          source: 'youtube',
        );
      }

      return SearchTopResult(
        title: title,
        subtitle: subtitle.isNotEmpty ? subtitle : 'Top Result',
        type: type,
        imageUrl: rawCover != null ? upgradeArtworkUrl(rawCover) : null,
        track: track,
        artist: type == TopResultType.artist ? SearchArtist(name: title, imageUrl: rawCover != null ? upgradeArtworkUrl(rawCover) : null, browseId: browseId) : null,
        album: type == TopResultType.album
            ? SearchAlbum(title: title, artist: subtitle.split('•').first.trim(), coverUrl: rawCover != null ? upgradeArtworkUrl(rawCover) : null, browseId: browseId)
            : null,
      );
    } catch (_) {
      return null;
    }
  }

  static List? _getColumnRuns(dynamic col) {
    if (col is! Map) return null;
    final r = col['musicResponsiveListItemFlexColumnRenderer'];
    if (r is! Map) return null;
    final t = r['text'];
    if (t is! Map) return null;
    return t['runs'] as List?;
  }

  Track? _parseTrackFromItem(Map<String, dynamic> item) {
    try {
      final nav = item['overlay']?['musicItemThumbnailOverlayRenderer']?['content']
          ?['musicPlayButtonRenderer']?['playNavigationEndpoint'];
      String? videoId = nav?['watchEndpoint']?['videoId'] ??
          item['navigationEndpoint']?['watchEndpoint']?['videoId'] ??
          item['playlistItemData']?['videoId'] ??
          item['doubleTapEndpoint']?['watchEndpoint']?['videoId'];

      final flexColumns = item['flexColumns'] as List?;
      if (flexColumns == null || flexColumns.isEmpty) return null;

      if (videoId == null && flexColumns.isNotEmpty) {
        final flex0 = flexColumns[0];
        final runs = flex0?['musicResponsiveListItemFlexColumnRenderer']?['text']?['runs'] as List?;
        if (runs != null && runs.isNotEmpty && runs[0] is Map) {
          videoId = runs[0]['navigationEndpoint']?['watchEndpoint']?['videoId'];
        }
      }
      if (videoId == null || videoId.isEmpty) return null;

      final titleRuns = _getColumnRuns(flexColumns[0]);
      final title = titleRuns != null && titleRuns.isNotEmpty && titleRuns[0] is Map
          ? (titleRuns[0]['text'] as String? ?? 'Unknown Track')
          : 'Unknown Track';

      String artist = 'Unknown Artist';
      String album = 'Single';
      int duration = 210;

      if (flexColumns.length > 1) {
        final subRuns = _getColumnRuns(flexColumns[1]);
        if (subRuns != null && subRuns.isNotEmpty) {
          final textList = subRuns
              .whereType<Map>()
              .map((r) => (r['text'] ?? '').toString())
              .where((s) => s != ' • ' && s.trim().isNotEmpty)
              .toList();
          if (textList.isNotEmpty) artist = textList[0];
          if (textList.length > 1 && !textList[1].contains(':')) album = textList[1];
          final last = textList.last;
          if (last.contains(':')) {
            final parts = last.split(':').map(int.tryParse).toList();
            if (parts.every((p) => p != null)) {
              duration = parts.fold(0, (acc, val) => acc * 60 + val!);
            }
          }
        }
      }

      final thumbs = item['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'] as List?;
      final rawCover = thumbs?.isNotEmpty == true
          ? thumbs!.last['url'] as String
          : 'https://i.ytimg.com/vi/$videoId/hqdefault.jpg';
      final cover = upgradeArtworkUrl(rawCover, videoId: videoId);

      return Track(
        id: 'yt-$videoId',
        title: title,
        artist: artist,
        album: album,
        coverUrl: cover,
        durationSeconds: duration,
        language: Track.detectLanguage(title, artist, album) ?? '',
        source: 'youtube',
      );
    } catch (_) {
      return null;
    }
  }

  SearchArtist? _parseArtistFromItem(Map<String, dynamic> item) {
    try {
      final flexColumns = item['flexColumns'] as List?;
      if (flexColumns == null || flexColumns.isEmpty) return null;

      final titleRuns = _getColumnRuns(flexColumns[0]);
      final name = titleRuns != null && titleRuns.isNotEmpty && titleRuns[0] is Map
          ? (titleRuns[0]['text'] as String? ?? '')
          : '';
      if (name.isEmpty) return null;

      String? subscribers;
      if (flexColumns.length > 1) {
        final subRuns = _getColumnRuns(flexColumns[1]);
        if (subRuns != null && subRuns.isNotEmpty) {
          subscribers = subRuns.whereType<Map>().map((r) => r['text'] ?? '').join().replaceAll('•', '').trim();
        }
      }

      final thumbs = item['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'] as List?;
      final imageUrl = thumbs?.isNotEmpty == true ? thumbs!.last['url'] as String : null;

      final browseEndpoint = item['navigationEndpoint']?['browseEndpoint'];
      final browseId = browseEndpoint?['browseId'] as String?;

      return SearchArtist(
        name: name,
        imageUrl: imageUrl != null ? upgradeArtworkUrl(imageUrl) : null,
        subscribers: subscribers,
        browseId: browseId,
      );
    } catch (_) {
      return null;
    }
  }

  SearchAlbum? _parseAlbumFromItem(Map<String, dynamic> item) {
    try {
      final flexColumns = item['flexColumns'] as List?;
      if (flexColumns == null || flexColumns.isEmpty) return null;

      final titleRuns = _getColumnRuns(flexColumns[0]);
      final title = titleRuns != null && titleRuns.isNotEmpty && titleRuns[0] is Map
          ? (titleRuns[0]['text'] as String? ?? '')
          : '';
      if (title.isEmpty) return null;

      String artist = 'Unknown Artist';
      String? year;
      if (flexColumns.length > 1) {
        final subRuns = _getColumnRuns(flexColumns[1]);
        if (subRuns != null && subRuns.isNotEmpty) {
          final texts = subRuns.whereType<Map>().map((r) => (r['text'] ?? '').toString()).where((s) => s != ' • ' && s.trim().isNotEmpty).toList();
          if (texts.isNotEmpty) artist = texts[0];
          if (texts.length > 1) year = texts.last;
        }
      }

      final thumbs = item['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'] as List?;
      final coverUrl = thumbs?.isNotEmpty == true ? thumbs!.last['url'] as String : null;

      final browseEndpoint = item['navigationEndpoint']?['browseEndpoint'];
      final browseId = browseEndpoint?['browseId'] as String?;

      return SearchAlbum(
        title: title,
        artist: artist,
        coverUrl: coverUrl != null ? upgradeArtworkUrl(coverUrl) : null,
        year: year,
        browseId: browseId,
      );
    } catch (_) {
      return null;
    }
  }

  SearchPlaylist? _parsePlaylistFromItem(Map<String, dynamic> item) {
    try {
      final flexColumns = item['flexColumns'] as List?;
      if (flexColumns == null || flexColumns.isEmpty) return null;

      final titleRuns = _getColumnRuns(flexColumns[0]);
      final title = titleRuns != null && titleRuns.isNotEmpty && titleRuns[0] is Map
          ? (titleRuns[0]['text'] as String? ?? '')
          : '';
      if (title.isEmpty) return null;

      String? curator;
      String? trackCount;
      if (flexColumns.length > 1) {
        final subRuns = _getColumnRuns(flexColumns[1]);
        if (subRuns != null && subRuns.isNotEmpty) {
          final texts = subRuns.whereType<Map>().map((r) => (r['text'] ?? '').toString()).where((s) => s != ' • ' && s.trim().isNotEmpty).toList();
          if (texts.isNotEmpty) curator = texts[0];
          if (texts.length > 1) trackCount = texts[1];
        }
      }

      final thumbs = item['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'] as List?;
      final coverUrl = thumbs?.isNotEmpty == true ? thumbs!.last['url'] as String : null;

      final browseEndpoint = item['navigationEndpoint']?['browseEndpoint'];
      final browseId = browseEndpoint?['browseId'] as String?;

      return SearchPlaylist(
        title: title,
        curator: curator,
        coverUrl: coverUrl != null ? upgradeArtworkUrl(coverUrl) : null,
        trackCount: trackCount,
        browseId: browseId,
      );
    } catch (_) {
      return null;
    }
  }
}
