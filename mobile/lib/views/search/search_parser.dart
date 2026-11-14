import 'package:flutter/foundation.dart';

import '../../models/artist_ref.dart';
import '../../services/innertube_service.dart';
import '../../utils/media_normalizer.dart';
import 'search_models.dart';

/// Intermediate container for raw parsed search response elements.
class ParsedSearchPayload {
  const ParsedSearchPayload({
    this.topResult,
    this.items = const [],
    this.didYouMean,
    this.continuation,
  });

  final SearchTopResult? topResult;
  final List<SearchItem> items;
  final String? didYouMean;
  final String? continuation;
}

/// Zero-loss, resilient InnerTube search renderer parser for Zenify.
class SearchParser {
  SearchParser._();

  // Regex patterns for classifying subtitle runs
  static final RegExp _yearRegex = RegExp(r'^(19|20)\d{2}$');
  static final RegExp _durationRegex = RegExp(r'^\d{1,2}:\d{2}(:\d{2})?$');
  static final RegExp _countRegex = RegExp(
    r'(\d+(\.\d+)?[KMBkmb]?\+?\s*(songs|tracks|episodes|subscribers|views|plays|videos|listeners))|(\d{1,3}(,\d{3})*\s*(songs|tracks|episodes|subscribers|views|plays|videos))',
    caseSensitive: false,
  );
  static final RegExp _typeRegex = RegExp(
    r'^(song|track|artist|album|single|ep|playlist|video|music video|podcast|episode|profile)$',
    caseSensitive: false,
  );
  static final RegExp _separatorRegex = RegExp(r'^[•·&,\-|/\\•●¦;]$');

  /// Main entry point: parses raw InnerTube JSON payload into a typed [ParsedSearchPayload].
  static ParsedSearchPayload parse(Map<String, dynamic> json, {String query = ''}) {
    SearchTopResult? topResult;
    final items = <SearchItem>[];
    String? didYouMean;
    String? continuationToken;

    try {
      // 1. Did You Mean / Spell Correction
      didYouMean = _extractDidYouMean(json);

      // 2. Locate Tab Contents or Section List
      final tabbed = json['contents']?['tabbedSearchResultsRenderer'];
      final tabs = tabbed?['tabs'] as List?;
      List? sectionList;
      if (tabs != null && tabs.isNotEmpty && tabs.first is Map) {
        final t0 = tabs.first as Map;
        sectionList = t0['tabRenderer']?['content']?['sectionListRenderer']?['contents'] as List?;
      }
      sectionList ??= json['contents']?['sectionListRenderer']?['contents'] as List?;

      // Continuation contents check (from loadMore)
      final continuationShelf = json['continuationContents']?['musicShelfContinuation'];
      if (continuationShelf is Map) {
        final contItems = _parseMusicShelfItems(continuationShelf, rawRankOffset: 0);
        items.addAll(contItems);
        continuationToken = _extractContinuationToken(continuationShelf);
        return ParsedSearchPayload(
          items: items,
          didYouMean: didYouMean,
          continuation: continuationToken,
        );
      }

      if (sectionList is! List) {
        return ParsedSearchPayload(items: items, didYouMean: didYouMean);
      }

      int rawRankCounter = 0;

      for (final section in sectionList) {
        if (section is! Map) continue;
        final sMap = Map<String, dynamic>.from(section);

        // A. Top Result Shelf: musicCardShelfRenderer
        final cardShelf = sMap['musicCardShelfRenderer'];
        if (cardShelf is Map && topResult == null) {
          topResult = _parseMusicCardShelf(Map<String, dynamic>.from(cardShelf), rawRank: rawRankCounter++);
          if (topResult != null) {
            // Also add topResult's item to the pool for comprehensive ranking
            items.add(topResult.item);
          }
        }

        // B. Direct musicShelfRenderer (Filtered search or individual shelf)
        final shelf = sMap['musicShelfRenderer'];
        if (shelf is Map) {
          final shelfItems = _parseMusicShelfItems(shelf, rawRankOffset: rawRankCounter);
          rawRankCounter += shelfItems.length;
          items.addAll(shelfItems);
          continuationToken ??= _extractContinuationToken(shelf);
        }

        // C. itemSectionRenderer (Default wrapper in modern InnerTube)
        final itemSection = sMap['itemSectionRenderer'];
        if (itemSection is Map) {
          final isContents = itemSection['contents'] as List?;
          if (isContents != null) {
            for (final it in isContents) {
              if (it is! Map) continue;

              // Check for nested didYouMeanRenderer
              if (didYouMean == null && it['didYouMeanRenderer'] is Map) {
                didYouMean = _extractTextFromRuns(it['didYouMeanRenderer']?['correctedQuery']?['runs']);
              }
              if (didYouMean == null && it['showingResultsForRenderer'] is Map) {
                didYouMean = _extractTextFromRuns(it['showingResultsForRenderer']?['correctedQuery']?['runs']);
              }

              // Top card shelf inside itemSection
              if (it['musicCardShelfRenderer'] is Map && topResult == null) {
                topResult = _parseMusicCardShelf(
                  Map<String, dynamic>.from(it['musicCardShelfRenderer']),
                  rawRank: rawRankCounter++,
                );
                if (topResult != null) {
                  items.add(topResult.item);
                }
              }

              // Responsive list item
              if (it['musicResponsiveListItemRenderer'] is Map) {
                final parsed = _parseResponsiveListItem(
                  Map<String, dynamic>.from(it['musicResponsiveListItemRenderer']),
                  rawRank: rawRankCounter++,
                );
                if (parsed != null) items.add(parsed);
              }

              // Two row item renderer
              if (it['musicTwoRowItemRenderer'] is Map) {
                final parsed = _parseTwoRowItem(
                  Map<String, dynamic>.from(it['musicTwoRowItemRenderer']),
                  rawRank: rawRankCounter++,
                );
                if (parsed != null) items.add(parsed);
              }

              // Sub-shelf
              if (it['musicShelfRenderer'] is Map) {
                final subShelf = it['musicShelfRenderer'] as Map;
                final subItems = _parseMusicShelfItems(subShelf, rawRankOffset: rawRankCounter);
                rawRankCounter += subItems.length;
                items.addAll(subItems);
                continuationToken ??= _extractContinuationToken(subShelf);
              }
            }
          }
        }
      }
    } catch (e, stack) {
      if (kDebugMode) debugPrint('[SearchParser] Error parsing payload: $e\n$stack');
    }

    return ParsedSearchPayload(
      topResult: topResult,
      items: items,
      didYouMean: didYouMean,
      continuation: continuationToken,
    );
  }

  /// Parses Metrolist Android native summary payload into [ParsedSearchPayload].
  static ParsedSearchPayload parseNativeSummaries(
    List<dynamic> summaries, {
    required String query,
  }) {
    SearchTopResult? topResult;
    final items = <SearchItem>[];
    int rawRankCounter = 0;

    try {
      for (final rawSummary in summaries) {
        if (rawSummary is! Map) continue;
        final summaryTitle = (rawSummary['title'] as String? ?? '').trim();
        final rawItems = rawSummary['items'] as List?;
        if (rawItems == null || rawItems.isEmpty) continue;

        final isTopSection = summaryTitle.toLowerCase().contains('top result');

        for (final rawItem in rawItems) {
          if (rawItem is! Map) continue;
          final itemMap = Map<String, dynamic>.from(rawItem);
          final parsedItem = parseNativeItem(itemMap, rawRank: rawRankCounter++);
          if (parsedItem == null) continue;

          if (isTopSection && topResult == null) {
            topResult = SearchTopResult(
              item: parsedItem,
              playVideoId: parsedItem.videoId ?? (parsedItem is SearchSongItem ? parsedItem.id : null),
              radioPlaylistId: parsedItem.radioPlaylistId,
            );
          }
          items.add(parsedItem);
        }
      }
    } catch (e, stack) {
      if (kDebugMode) debugPrint('[SearchParser] Error parsing native summaries: $e\n$stack');
    }

    return ParsedSearchPayload(
      topResult: topResult,
      items: items,
    );
  }

  /// Parses a single item map returned from Android native InnerTube channel.
  static SearchItem? parseNativeItem(Map<String, dynamic> m, {required int rawRank}) {
    final type = (m['type'] as String? ?? '').toLowerCase();
    final id = (m['id'] as String? ?? '').trim();
    final title = MediaNormalizer.cleanTitle(m['title'] as String? ?? '');
    if (title.isEmpty) return null;

    final thumb = MediaNormalizer.upgradeArtworkUrl(m['thumbnail'] as String?, videoId: id);
    final rawArtists = m['artists'] as List?;
    final artistRefs = InnerTubeService.parseArtistRefs(rawArtists);
    final artistsString = artistRefs.isNotEmpty
        ? ArtistRef.formatList(artistRefs)
        : MediaNormalizer.formatArtists(rawArtists?.map((a) => a is Map ? a['name'] : a).toList());

    final isExplicit = m['explicit'] == true;

    if (type == 'song') {
      final albumMap = (m['album'] is Map) ? m['album'] as Map : null;
      final albumName = albumMap?['name'] as String?;
      final album = albumName != null ? MediaNormalizer.cleanTitle(albumName) : null;
      final albumBrowseId = albumMap?['id'] as String? ?? albumMap?['browseId'] as String?;
      final durSec = (m['duration'] as num?)?.toInt() ?? 210;
      final mins = durSec ~/ 60;
      final secs = (durSec % 60).toString().padLeft(2, '0');
      return SearchSongItem(
        id: id,
        title: title,
        subtitle: artistsString.isNotEmpty ? artistsString : 'Song',
        thumbnailUrl: thumb,
        thumbnailUrlHiRes: thumb,
        videoId: id,
        artists: artistRefs,
        albumName: album,
        albumBrowseId: albumBrowseId,
        durationSeconds: durSec,
        durationText: '$mins:$secs',
        isExplicit: isExplicit,
        rawRank: rawRank,
      );
    } else if (type == 'album') {
      final browseId = m['browseId'] as String? ?? id;
      final playlistId = m['playlistId'] as String?;
      final year = (m['year'] as num?)?.toInt();
      return SearchAlbumItem(
        id: id.isNotEmpty ? id : (browseId.isNotEmpty ? browseId : 'album-$title'),
        title: title,
        subtitle: artistsString.isNotEmpty ? (year != null ? '$artistsString • $year' : artistsString) : 'Album',
        thumbnailUrl: thumb,
        thumbnailUrlHiRes: thumb,
        browseId: browseId,
        playlistId: playlistId,
        year: year,
        artists: artistRefs,
        isExplicit: isExplicit,
        rawRank: rawRank,
      );
    } else if (type == 'artist') {
      final channelId = m['channelId'] as String? ?? id;
      return SearchArtistItem(
        id: id.isNotEmpty ? id : (channelId.isNotEmpty ? channelId : 'artist-$title'),
        title: title,
        subtitle: 'Artist',
        thumbnailUrl: thumb,
        thumbnailUrlHiRes: thumb,
        browseId: channelId,
        isVerified: true,
        rawRank: rawRank,
      );
    } else if (type == 'playlist') {
      final author = (m['author'] is Map) ? (m['author']['name'] as String?) : null;
      return SearchPlaylistItem(
        id: id,
        title: title,
        subtitle: author != null ? 'Playlist • $author' : 'Playlist',
        thumbnailUrl: thumb,
        thumbnailUrlHiRes: thumb,
        browseId: id,
        playlistId: id,
        author: author,
        rawRank: rawRank,
      );
    } else if (type == 'video') {
      final channel = artistsString.isNotEmpty ? artistsString : (m['channel'] as String?);
      return SearchVideoItem(
        id: id,
        title: title,
        subtitle: channel ?? 'Video',
        thumbnailUrl: thumb,
        thumbnailUrlHiRes: thumb,
        videoId: id,
        channel: channel,
        rawRank: rawRank,
      );
    } else {
      // Fallback: guess by presence of fields
      if (m.containsKey('duration') || id.length == 11) {
        return SearchSongItem(
          id: id,
          title: title,
          subtitle: artistsString.isNotEmpty ? artistsString : 'Song',
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumb,
          videoId: id,
          artists: artistRefs,
          rawRank: rawRank,
        );
      }
    }
    return null;
  }

  // ─────────────────────────── Top Result Parser ─────────────────────────────

  static SearchTopResult? _parseMusicCardShelf(Map<String, dynamic> card, {required int rawRank}) {
    try {
      final title = _extractTitleWithFallback(
        primaryRuns: card['title']?['runs'] as List?,
        accessibility: card['title']?['accessibility']?['accessibilityData']?['label'] as String?,
      );
      if (title.isEmpty) return null;

      final subtitleRuns = card['subtitle']?['runs'] as List?;
      final subtitle = _extractTextFromRuns(subtitleRuns);

      final thumbs = card['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'] as List?;
      final (thumb, thumbHiRes) = _extractThumbnails(thumbs);

      // Endpoints & Identifiers
      final titleEndpoint = card['title']?['runs']?[0]?['navigationEndpoint'];
      final browseId = titleEndpoint?['browseEndpoint']?['browseId'] as String?;
      final pageType = titleEndpoint?['browseEndpoint']
              ?['browseEndpointContextSupportedConfigs']
              ?['browseEndpointContextMusicConfig']?['pageType']
          ?.toString();

      // Check buttons for playback, radio, shuffle
      String? playVideoId;
      String? radioPlaylistId;
      String? shufflePlaylistId;

      final buttons = card['buttons'] as List?;
      if (buttons != null) {
        for (final btn in buttons) {
          if (btn is! Map) continue;
          final playRenderer = btn['musicPlayButtonRenderer'];
          if (playRenderer is Map) {
            final nav = playRenderer['playNavigationEndpoint'];
            playVideoId ??= nav?['watchEndpoint']?['videoId'] as String?;
            radioPlaylistId ??= nav?['watchPlaylistEndpoint']?['playlistId'] as String?;
          }
          final navRenderer = btn['menuRenderer']?['items'] as List?;
          if (navRenderer != null) {
            for (final mItem in navRenderer) {
              final navItem = mItem['menuNavigationItemRenderer'];
              final icon = navItem?['icon']?['iconType'];
              if (icon == 'MUSIC_SHUFFLE') {
                shufflePlaylistId ??= navItem?['navigationEndpoint']?['watchPlaylistEndpoint']?['playlistId'] as String?;
              } else if (icon == 'MIX') {
                radioPlaylistId ??= navItem?['navigationEndpoint']?['watchPlaylistEndpoint']?['playlistId'] as String?;
              }
            }
          }
        }
      }

      // Fallback videoId from tap endpoint
      final onTap = card['onTap'];
      if (playVideoId == null && onTap is Map) {
        playVideoId = onTap['watchEndpoint']?['videoId'] as String?;
      }

      final subLower = subtitle.toLowerCase();
      final isArtist = pageType == 'MUSIC_PAGE_TYPE_ARTIST' ||
          pageType == 'MUSIC_PAGE_TYPE_USER_CHANNEL' ||
          subLower.startsWith('artist');
      final isAlbum = pageType == 'MUSIC_PAGE_TYPE_ALBUM' ||
          subLower.startsWith('album') ||
          subLower.startsWith('ep') ||
          subLower.startsWith('single');
      final isPlaylist = pageType == 'MUSIC_PAGE_TYPE_PLAYLIST' || subLower.startsWith('playlist');

      SearchItem item;
      if (isArtist) {
        final subscribers = _extractCountValue(subtitle);
        item = SearchArtistItem(
          id: browseId ?? 'artist-$title',
          title: title,
          subtitle: subtitle.isNotEmpty ? subtitle : 'Artist',
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          browseId: browseId,
          radioPlaylistId: radioPlaylistId,
          subscriberText: subtitle,
          subscriberCount: subscribers,
          isVerified: true,
          rawRank: rawRank,
        );
      } else if (isAlbum) {
        item = SearchAlbumItem(
          id: browseId ?? 'album-$title',
          title: title,
          subtitle: subtitle.isNotEmpty ? subtitle : 'Album',
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          browseId: browseId,
          playlistId: radioPlaylistId,
          albumType: subLower.contains('single') ? 'Single' : (subLower.contains('ep') ? 'EP' : 'Album'),
          year: _extractYear(subtitle),
          rawRank: rawRank,
        );
      } else if (isPlaylist) {
        item = SearchPlaylistItem(
          id: browseId ?? 'playlist-$title',
          title: title,
          subtitle: subtitle.isNotEmpty ? subtitle : 'Playlist',
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          browseId: browseId,
          playlistId: browseId,
          rawRank: rawRank,
          author: subtitle,
        );
      } else {
        // Song
        item = SearchSongItem(
          id: playVideoId ?? (browseId ?? 'song-$title'),
          title: title,
          subtitle: subtitle.isNotEmpty ? subtitle : 'Song',
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          videoId: playVideoId,
          browseId: browseId,
          radioPlaylistId: radioPlaylistId,
          rawRank: rawRank,
        );
      }

      return SearchTopResult(
        item: item,
        playVideoId: playVideoId,
        radioPlaylistId: radioPlaylistId,
        shufflePlaylistId: shufflePlaylistId,
      );
    } catch (e) {
      if (kDebugMode) debugPrint('[SearchParser] Top result parse error: $e');
      return null;
    }
  }

  // ─────────────────────────── Shelf Item Parser ─────────────────────────────

  static List<SearchItem> _parseMusicShelfItems(Map shelf, {required int rawRankOffset}) {
    final results = <SearchItem>[];
    final contents = shelf['contents'] as List?;
    if (contents == null) return results;

    final titleRuns = shelf['title']?['runs'] as List?;
    final shelfTitle = titleRuns?.isNotEmpty == true
        ? (titleRuns![0]['text'] as String? ?? '').toLowerCase()
        : '';

    int rank = rawRankOffset;
    for (final item in contents) {
      if (item is! Map) continue;
      SearchItem? parsed;
      if (item['musicResponsiveListItemRenderer'] is Map) {
        parsed = _parseResponsiveListItem(
          Map<String, dynamic>.from(item['musicResponsiveListItemRenderer']),
          rawRank: rank++,
          shelfCategory: shelfTitle,
        );
      } else if (item['musicTwoRowItemRenderer'] is Map) {
        parsed = _parseTwoRowItem(
          Map<String, dynamic>.from(item['musicTwoRowItemRenderer']),
          rawRank: rank++,
          shelfCategory: shelfTitle,
        );
      }
      if (parsed != null) results.add(parsed);
    }
    return results;
  }

  // ─────────────────────────── Responsive List Item ──────────────────────────

  static SearchItem? _parseResponsiveListItem(
    Map<String, dynamic> item, {
    required int rawRank,
    String shelfCategory = '',
  }) {
    try {
      final flexColumns = item['flexColumns'] as List?;
      if (flexColumns == null || flexColumns.isEmpty) return null;

      // 1. Mandatory Title with Fallback Chain
      final col0 = flexColumns[0] is Map ? flexColumns[0] as Map : null;
      final flexCol0 = col0?['musicResponsiveListItemFlexColumnRenderer'];
      final titleRuns = flexCol0?['text']?['runs'] as List?;
      final simpleTitle = flexCol0?['text']?['simpleText'] as String?;
      final accessibilityLabel = item['accessibility']?['accessibilityData']?['label'] as String? ??
          flexCol0?['text']?['accessibility']?['accessibilityData']?['label'] as String?;

      // Subtitle runs for fallback
      final col1 = flexColumns.length > 1 && flexColumns[1] is Map ? flexColumns[1] as Map : null;
      final flexCol1 = col1?['musicResponsiveListItemFlexColumnRenderer'];
      final subtitleRuns = flexCol1?['text']?['runs'] as List?;
      final simpleSubtitle = flexCol1?['text']?['simpleText'] as String?;

      final title = _extractTitleWithFallback(
        primaryRuns: titleRuns,
        simpleText: simpleTitle,
        accessibility: accessibilityLabel,
        secondaryRuns: subtitleRuns,
      );

      // Rule: Never produce an item with an empty title
      if (title.isEmpty) {
        if (kDebugMode) debugPrint('[SearchParser] Dropping item: empty title after full fallback chain');
        return null;
      }

      // 2. Thumbnails
      final thumbs = item['thumbnail']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'] as List?;
      final (thumb, thumbHiRes) = _extractThumbnails(thumbs);

      // 3. Navigation Endpoints & Identifiers
      final navEndpoint = item['navigationEndpoint'];
      final browseId = navEndpoint?['browseEndpoint']?['browseId'] as String?;
      final pageType = navEndpoint?['browseEndpoint']
              ?['browseEndpointContextSupportedConfigs']
              ?['browseEndpointContextMusicConfig']?['pageType']
          ?.toString();

      final overlayNav = item['overlay']?['musicItemThumbnailOverlayRenderer']
          ?['content']?['musicPlayButtonRenderer']?['playNavigationEndpoint'];
      String? videoId = overlayNav?['watchEndpoint']?['videoId'] as String? ??
          navEndpoint?['watchEndpoint']?['videoId'] as String? ??
          item['playlistItemData']?['videoId'] as String?;

      if (videoId == null && titleRuns != null && titleRuns.isNotEmpty && titleRuns[0] is Map) {
        videoId = titleRuns[0]['navigationEndpoint']?['watchEndpoint']?['videoId'] as String?;
      }

      // Check badges for explicit flag
      final badges = item['badges'] as List?;
      final isExplicit = badges?.any((b) =>
              b is Map &&
              b['musicInlineBadgeRenderer']?['icon']?['iconType'] == 'MUSIC_EXPLICIT_BADGE') ??
          false;

      // 4. Subtitle runs classification
      final segments = _classifySubtitleSegments(subtitleRuns, simpleText: simpleSubtitle);

      // Determine Item Type
      final isArtist = shelfCategory.contains('artist') ||
          pageType == 'MUSIC_PAGE_TYPE_ARTIST' ||
          pageType == 'MUSIC_PAGE_TYPE_USER_CHANNEL' ||
          segments.typeKeyword == 'artist' ||
          segments.typeKeyword == 'profile';

      final isAlbum = shelfCategory.contains('album') ||
          pageType == 'MUSIC_PAGE_TYPE_ALBUM' ||
          segments.typeKeyword == 'album' ||
          segments.typeKeyword == 'single' ||
          segments.typeKeyword == 'ep';

      final isPlaylist = shelfCategory.contains('playlist') ||
          pageType == 'MUSIC_PAGE_TYPE_PLAYLIST' ||
          segments.typeKeyword == 'playlist';

      final isPodcast = shelfCategory.contains('podcast') ||
          pageType == 'MUSIC_PAGE_TYPE_PODCAST_SHOW_DETAIL_PAGE' ||
          segments.typeKeyword == 'podcast';

      final isEpisode = segments.typeKeyword == 'episode' ||
          pageType == 'MUSIC_PAGE_TYPE_PODCAST_EPISODE_DETAIL_PAGE';

      if (isArtist) {
        return SearchArtistItem(
          id: browseId ?? 'artist-$title',
          title: title,
          subtitle: segments.formattedSubtitle.isNotEmpty ? segments.formattedSubtitle : 'Artist',
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          browseId: browseId,
          subscriberText: segments.countText,
          subscriberCount: segments.countValue,
          isProfile: pageType == 'MUSIC_PAGE_TYPE_USER_CHANNEL',
          rawRank: rawRank,
        );
      } else if (isAlbum) {
        final albumPlaylistId = overlayNav?['watchPlaylistEndpoint']?['playlistId'] as String?;
        return SearchAlbumItem(
          id: browseId ?? 'album-$title',
          title: title,
          subtitle: segments.formattedSubtitle.isNotEmpty ? segments.formattedSubtitle : (segments.artists.isNotEmpty ? segments.artists.first.name : 'Album'),
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          browseId: browseId,
          playlistId: albumPlaylistId,
          albumType: segments.typeKeyword == 'single' ? 'Single' : (segments.typeKeyword == 'ep' ? 'EP' : 'Album'),
          year: segments.year,
          artists: segments.artists,
          isExplicit: isExplicit,
          rawRank: rawRank,
        );
      } else if (isPlaylist) {
        final playlistId = browseId?.removePrefix('VL') ?? '';
        return SearchPlaylistItem(
          id: playlistId.isNotEmpty ? playlistId : 'playlist-$title',
          title: title,
          subtitle: segments.formattedSubtitle.isNotEmpty ? segments.formattedSubtitle : 'Playlist',
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          browseId: browseId,
          playlistId: playlistId,
          author: segments.authorOrCurator ?? (segments.artists.isNotEmpty ? segments.artists.first.name : null),
          songCountText: segments.countText,
          isOfficial: shelfCategory.contains('featured') || (segments.authorOrCurator?.toLowerCase() == 'youtube music'),
          isCommunity: shelfCategory.contains('community'),
          rawRank: rawRank,
        );
      } else if (isPodcast || isEpisode) {
        return SearchPodcastItem(
          id: videoId ?? (browseId ?? 'podcast-$title'),
          title: title,
          subtitle: segments.formattedSubtitle.isNotEmpty ? segments.formattedSubtitle : 'Podcast',
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          browseId: browseId,
          host: segments.authorOrCurator,
          episodeCountText: segments.countText,
          isEpisode: isEpisode,
          durationText: segments.durationText,
          rawRank: rawRank,
        );
      } else {
        // Song / Video Default
        final isVideo = shelfCategory.contains('video') || segments.typeKeyword == 'video';
        if (isVideo) {
          return SearchVideoItem(
            id: videoId ?? 'vid-$title',
            title: title,
            subtitle: segments.formattedSubtitle.isNotEmpty ? segments.formattedSubtitle : 'Video',
            thumbnailUrl: thumb,
            thumbnailUrlHiRes: thumbHiRes,
            videoId: videoId,
            browseId: browseId,
            channel: segments.artists.isNotEmpty ? segments.artists.first.name : null,
            viewCountText: segments.countText,
            durationText: segments.durationText ?? '3:30',
            views: segments.countValue ?? 0,
            rawRank: rawRank,
          );
        }

        final durationSecs = _parseDurationSeconds(segments.durationText);
        return SearchSongItem(
          id: videoId ?? 'yt-$title',
          title: title,
          subtitle: segments.formattedSubtitle.isNotEmpty ? segments.formattedSubtitle : (segments.artists.isNotEmpty ? ArtistRef.formatList(segments.artists) : 'Song'),
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          videoId: videoId,
          browseId: browseId,
          artists: segments.artists,
          albumName: segments.albumName,
          albumBrowseId: segments.albumBrowseId,
          durationSeconds: durationSecs,
          durationText: segments.durationText ?? '3:30',
          isExplicit: isExplicit,
          musicVideoType: item['musicVideoType']?.toString() ?? 'ATV',
          rawRank: rawRank,
        );
      }
    } catch (e, stack) {
      if (kDebugMode) debugPrint('[SearchParser] Error parsing responsive list item: $e\n$stack');
      return null;
    }
  }

  // ─────────────────────────── Two Row Item ──────────────────────────────────

  static SearchItem? _parseTwoRowItem(
    Map<String, dynamic> item, {
    required int rawRank,
    String shelfCategory = '',
  }) {
    try {
      final titleRuns = item['title']?['runs'] as List?;
      final simpleTitle = item['title']?['simpleText'] as String?;
      final accessibilityLabel = item['title']?['accessibility']?['accessibilityData']?['label'] as String?;

      final subtitleRuns = item['subtitle']?['runs'] as List?;
      final simpleSubtitle = item['subtitle']?['simpleText'] as String?;

      final title = _extractTitleWithFallback(
        primaryRuns: titleRuns,
        simpleText: simpleTitle,
        accessibility: accessibilityLabel,
        secondaryRuns: subtitleRuns,
      );

      if (title.isEmpty) return null;

      final thumbs = item['thumbnailRenderer']?['musicThumbnailRenderer']?['thumbnail']?['thumbnails'] as List?;
      final (thumb, thumbHiRes) = _extractThumbnails(thumbs);

      final navEndpoint = item['navigationEndpoint'];
      final browseId = navEndpoint?['browseEndpoint']?['browseId'] as String?;
      final pageType = navEndpoint?['browseEndpoint']
              ?['browseEndpointContextSupportedConfigs']
              ?['browseEndpointContextMusicConfig']?['pageType']
          ?.toString();

      final segments = _classifySubtitleSegments(subtitleRuns, simpleText: simpleSubtitle);

      final isArtist = shelfCategory.contains('artist') ||
          pageType == 'MUSIC_PAGE_TYPE_ARTIST' ||
          pageType == 'MUSIC_PAGE_TYPE_USER_CHANNEL' ||
          segments.typeKeyword == 'artist';

      final isAlbum = shelfCategory.contains('album') ||
          pageType == 'MUSIC_PAGE_TYPE_ALBUM' ||
          segments.typeKeyword == 'album' ||
          segments.typeKeyword == 'single' ||
          segments.typeKeyword == 'ep';

      final isPlaylist = shelfCategory.contains('playlist') ||
          pageType == 'MUSIC_PAGE_TYPE_PLAYLIST' ||
          segments.typeKeyword == 'playlist';

      if (isArtist) {
        return SearchArtistItem(
          id: browseId ?? 'artist-$title',
          title: title,
          subtitle: segments.formattedSubtitle.isNotEmpty ? segments.formattedSubtitle : 'Artist',
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          browseId: browseId,
          subscriberText: segments.countText,
          subscriberCount: segments.countValue,
          rawRank: rawRank,
        );
      } else if (isAlbum) {
        return SearchAlbumItem(
          id: browseId ?? 'album-$title',
          title: title,
          subtitle: segments.formattedSubtitle.isNotEmpty ? segments.formattedSubtitle : 'Album',
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          browseId: browseId,
          albumType: segments.typeKeyword == 'single' ? 'Single' : 'Album',
          year: segments.year,
          artists: segments.artists,
          rawRank: rawRank,
        );
      } else if (isPlaylist) {
        return SearchPlaylistItem(
          id: browseId ?? 'playlist-$title',
          title: title,
          subtitle: segments.formattedSubtitle.isNotEmpty ? segments.formattedSubtitle : 'Playlist',
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          browseId: browseId,
          playlistId: browseId,
          author: segments.authorOrCurator,
          songCountText: segments.countText,
          rawRank: rawRank,
        );
      } else {
        // Fallback video / song
        final videoId = navEndpoint?['watchEndpoint']?['videoId'] as String?;
        return SearchSongItem(
          id: videoId ?? (browseId ?? 'song-$title'),
          title: title,
          subtitle: segments.formattedSubtitle.isNotEmpty ? segments.formattedSubtitle : 'Song',
          thumbnailUrl: thumb,
          thumbnailUrlHiRes: thumbHiRes,
          videoId: videoId,
          browseId: browseId,
          artists: segments.artists,
          durationSeconds: _parseDurationSeconds(segments.durationText),
          durationText: segments.durationText ?? '3:30',
          rawRank: rawRank,
        );
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[SearchParser] Error parsing two-row item: $e');
      return null;
    }
  }

  // ─────────────────────────── Helper Utilities ──────────────────────────────

  /// Robust title extraction fallback chain.
  /// 1. Primary runs[0]['text']
  /// 2. Concatenated runs text
  /// 3. SimpleText
  /// 4. Accessibility label
  /// 5. First non-noise segment of secondary runs
  static String _extractTitleWithFallback({
    List? primaryRuns,
    String? simpleText,
    String? accessibility,
    List? secondaryRuns,
  }) {
    // 1. Primary runs concatenated (handles bold runs & multi-token titles)
    if (primaryRuns != null && primaryRuns.isNotEmpty) {
      final buffer = StringBuffer();
      for (final r in primaryRuns) {
        if (r is Map && r['text'] is String) {
          buffer.write(r['text']);
        }
      }
      final s = _cleanString(buffer.toString());
      if (s.isNotEmpty && !MediaNormalizer.isMetadataNoise(s)) return s;
    }

    // 2. Simple text
    if (simpleText != null) {
      final s = _cleanString(simpleText);
      if (s.isNotEmpty && !MediaNormalizer.isMetadataNoise(s)) return s;
    }

    // 3. Accessibility label
    if (accessibility != null) {
      final s = _cleanString(accessibility);
      if (s.isNotEmpty && !MediaNormalizer.isMetadataNoise(s)) return s;
    }

    // 4. Secondary runs first non-noise segment
    if (secondaryRuns != null && secondaryRuns.isNotEmpty) {
      for (final r in secondaryRuns) {
        if (r is Map && r['text'] is String) {
          final s = _cleanString(r['text'] as String);
          if (s.isNotEmpty &&
              !MediaNormalizer.isMetadataNoise(s) &&
              !_typeRegex.hasMatch(s) &&
              !_yearRegex.hasMatch(s) &&
              !_countRegex.hasMatch(s) &&
              !_durationRegex.hasMatch(s)) {
            return s;
          }
        }
      }
    }

    return '';
  }

  /// Extracts text from runs array.
  static String _extractTextFromRuns(List? runs) {
    if (runs == null || runs.isEmpty) return '';
    final buffer = StringBuffer();
    for (final r in runs) {
      if (r is Map && r['text'] is String) {
        buffer.write(r['text']);
      }
    }
    return _cleanString(buffer.toString());
  }

  /// Cleans whitespace, trims, and decodes HTML entities.
  static String _cleanString(String raw) {
    if (raw.trim().isEmpty) return '';
    var s = MediaNormalizer.decodeHtml(raw).trim();
    s = s.replaceAll(RegExp(r'\s{2,}'), ' ').trim();
    return s;
  }

  /// Extracts standard and high-resolution thumbnail URLs.
  static (String standard, String hiRes) _extractThumbnails(List? thumbs) {
    if (thumbs == null || thumbs.isEmpty) {
      return ('', '');
    }

    // Pick highest resolution available in array
    String highestUrl = '';
    int maxDimension = 0;
    for (final t in thumbs) {
      if (t is Map && t['url'] is String) {
        final w = (t['width'] as num?)?.toInt() ?? 0;
        if (w >= maxDimension || highestUrl.isEmpty) {
          maxDimension = w;
          highestUrl = t['url'] as String;
        }
      }
    }

    if (highestUrl.isEmpty) {
      highestUrl = thumbs.last['url']?.toString() ?? '';
    }

    final std = MediaNormalizer.upgradeArtworkUrl(highestUrl, targetSize: 600);
    final hiRes = MediaNormalizer.upgradeArtworkUrl(highestUrl, targetSize: 1200);
    return (std, hiRes);
  }

  /// Classifies subtitle runs into structured semantic components.
  static _SubtitleMetadata _classifySubtitleSegments(List? runs, {String? simpleText}) {
    final artists = <ArtistRef>[];
    String? typeKeyword;
    int? year;
    String? countText;
    int? countValue;
    String? durationText;
    String? albumName;
    String? albumBrowseId;
    String? authorOrCurator;

    if (runs != null && runs.isNotEmpty) {
      // Split runs by separator bullet " • "
      final runSegments = <List<Map>>[];
      var currentSegment = <Map>[];

      for (final r in runs) {
        if (r is! Map) continue;
        final t = (r['text'] ?? '').toString().trim();
        if (_separatorRegex.hasMatch(t)) {
          if (currentSegment.isNotEmpty) {
            runSegments.add(currentSegment);
            currentSegment = [];
          }
        } else if (t.isNotEmpty) {
          currentSegment.add(r);
        }
      }
      if (currentSegment.isNotEmpty) runSegments.add(currentSegment);

      for (int i = 0; i < runSegments.length; i++) {
        final segRuns = runSegments[i];
        final segText = segRuns.map((r) => r['text'] ?? '').join().trim();
        if (segText.isEmpty) continue;

        // Check Type Keyword (e.g. Song, Album, Artist, Single, EP)
        if (typeKeyword == null && _typeRegex.hasMatch(segText)) {
          typeKeyword = segText.toLowerCase();
          continue;
        }

        // Check Year
        if (year == null && _yearRegex.hasMatch(segText)) {
          year = int.tryParse(segText);
          continue;
        }

        // Check Duration
        if (durationText == null && _durationRegex.hasMatch(segText)) {
          durationText = segText;
          continue;
        }

        // Check Count (Plays, Views, Subscribers, Songs)
        if (countText == null && _countRegex.hasMatch(segText)) {
          countText = segText;
          countValue = _extractCountValue(segText);
          continue;
        }

        // Check Album Run
        final hasAlbumNav = segRuns.any((r) =>
            r['navigationEndpoint']?['browseEndpoint']
                ?['browseEndpointContextSupportedConfigs']
                ?['browseEndpointContextMusicConfig']?['pageType'] ==
            'MUSIC_PAGE_TYPE_ALBUM');
        if (hasAlbumNav && albumName == null) {
          albumName = segText;
          albumBrowseId = segRuns.first['navigationEndpoint']?['browseEndpoint']?['browseId'] as String?;
          continue;
        }

        // Check Artists
        final parsedRefs = InnerTubeService.parseArtistRefs(segRuns);
        if (parsedRefs.isNotEmpty) {
          for (final a in parsedRefs) {
            if (!artists.any((x) => x.name.toLowerCase() == a.name.toLowerCase())) {
              artists.add(a);
            }
          }
          authorOrCurator ??= segText;
          continue;
        }

        // Fallback: artist / creator candidate
        if (!MediaNormalizer.isMetadataNoise(segText) && !_yearRegex.hasMatch(segText)) {
          authorOrCurator ??= segText;
          if (artists.isEmpty) {
            final split = MediaNormalizer.splitArtistNames(segText);
            for (final name in split) {
              artists.add(ArtistRef.fromName(name));
            }
          }
        }
      }
    } else if (simpleText != null && simpleText.isNotEmpty) {
      final parts = simpleText.split('•').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
      for (final p in parts) {
        if (_typeRegex.hasMatch(p)) {
          typeKeyword = p.toLowerCase();
        } else if (_yearRegex.hasMatch(p)) {
          year = int.tryParse(p);
        } else if (_durationRegex.hasMatch(p)) {
          durationText = p;
        } else if (_countRegex.hasMatch(p)) {
          countText = p;
          countValue = _extractCountValue(p);
        } else if (!MediaNormalizer.isMetadataNoise(p)) {
          authorOrCurator ??= p;
          final split = MediaNormalizer.splitArtistNames(p);
          for (final n in split) {
            artists.add(ArtistRef.fromName(n));
          }
        }
      }
    }

    // Build clean display subtitle
    final subParts = <String>[];
    if (typeKeyword != null && typeKeyword != 'song') {
      subParts.add(_capitalize(typeKeyword));
    }
    if (artists.isNotEmpty) {
      subParts.add(ArtistRef.formatList(artists));
    } else if (authorOrCurator != null) {
      subParts.add(authorOrCurator);
    }
    if (albumName != null && albumName != 'Single') {
      subParts.add(albumName);
    }
    if (year != null) {
      subParts.add('$year');
    }
    if (countText != null) {
      subParts.add(countText);
    }

    return _SubtitleMetadata(
      typeKeyword: typeKeyword,
      artists: artists,
      year: year,
      durationText: durationText,
      countText: countText,
      countValue: countValue,
      albumName: albumName,
      albumBrowseId: albumBrowseId,
      authorOrCurator: authorOrCurator,
      formattedSubtitle: subParts.join(' • '),
    );
  }

  static String _capitalize(String s) =>
      s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';

  /// Parses "14.2M", "500K", "1.2B" strings into exact integers.
  static int? _extractCountValue(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    final match = RegExp(r'([\d,]+(?:\.\d+)?)\s*([KMBkmb])?').firstMatch(raw);
    if (match == null) return null;
    final numStr = match.group(1)?.replaceAll(',', '');
    final numVal = double.tryParse(numStr ?? '');
    if (numVal == null) return null;
    final multiplier = match.group(2)?.toUpperCase();
    if (multiplier == 'K') return (numVal * 1000).toInt();
    if (multiplier == 'M') return (numVal * 1000000).toInt();
    if (multiplier == 'B') return (numVal * 1000000000).toInt();
    return numVal.toInt();
  }

  static int? _extractYear(String text) {
    final match = _yearRegex.firstMatch(text);
    return match != null ? int.tryParse(match.group(0)!) : null;
  }

  static int _parseDurationSeconds(String? text) {
    if (text == null || !text.contains(':')) return 210;
    try {
      final parts = text.split(':').map(int.tryParse).toList();
      if (parts.every((p) => p != null)) {
        return parts.fold<int>(0, (acc, val) => acc * 60 + val!);
      }
    } catch (_) {}
    return 210;
  }

  static String? _extractDidYouMean(Map<String, dynamic> json) {
    try {
      // 1. Direct tabbed or section didYouMean
      final tabbed = json['contents']?['tabbedSearchResultsRenderer'];
      final tabs = tabbed?['tabs'] as List?;
      List? sectionList;
      if (tabs != null && tabs.isNotEmpty && tabs.first is Map) {
        final t0 = tabs.first as Map;
        sectionList = t0['tabRenderer']?['content']?['sectionListRenderer']?['contents'] as List?;
      }
      sectionList ??= json['contents']?['sectionListRenderer']?['contents'] as List?;

      if (sectionList is List) {
        for (final sec in sectionList) {
          if (sec is! Map) continue;
          final dym = sec['itemSectionRenderer']?['contents'];
          if (dym is List) {
            for (final it in dym) {
              if (it is! Map) continue;
              final dymObj = it['didYouMeanRenderer'] ?? it['showingResultsForRenderer'];
              if (dymObj is Map) {
                final runs = dymObj['correctedQuery']?['runs'] as List?;
                final q = _extractTextFromRuns(runs);
                if (q.isNotEmpty) return q;
              }
            }
          }
        }
      }
    } catch (_) {}
    return null;
  }

  static String? _extractContinuationToken(Map shelf) {
    try {
      final continuations = shelf['continuations'] as List?;
      if (continuations != null && continuations.isNotEmpty) {
        final cItem = continuations[0];
        if (cItem is Map) {
          return cItem['nextContinuationData']?['continuation'] as String?;
        }
      }
    } catch (_) {}
    return null;
  }
}

class _SubtitleMetadata {
  const _SubtitleMetadata({
    this.typeKeyword,
    this.artists = const [],
    this.year,
    this.durationText,
    this.countText,
    this.countValue,
    this.albumName,
    this.albumBrowseId,
    this.authorOrCurator,
    required this.formattedSubtitle,
  });

  final String? typeKeyword;
  final List<ArtistRef> artists;
  final int? year;
  final String? durationText;
  final String? countText;
  final int? countValue;
  final String? albumName;
  final String? albumBrowseId;
  final String? authorOrCurator;
  final String formattedSubtitle;
}

extension on String {
  String removePrefix(String prefix) {
    if (startsWith(prefix)) return substring(prefix.length);
    return this;
  }
}
