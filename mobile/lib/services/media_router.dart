import 'package:flutter/material.dart';

import '../design_system/zen.dart';
import '../models/track.dart';
import '../utils/media_normalizer.dart';
import '../views/details/album_screen.dart';
import '../views/details/artist_screen.dart';
import '../views/shell_screen.dart' show ShellNavigationScope;
import 'album_resolver.dart';

/// Centralized navigation router enforcing Zenify's release redirection rules:
/// - **Video songs**: NEVER redirect to an album; always open the Video Singles page.
/// - **Singles**: Always open the Singles page (`isSingle: true`) rather than jumping to a parent album.
/// - **Albums**: Always open the Album page (`isSingle: false`).
/// - **Songs**: Validate parent albums strictly (no Unplugged / Lo-Fi / wrong album fallback).
class MediaRouter {
  MediaRouter._();

  static void _pushPage(
    BuildContext context,
    Widget page, {
    bool useShellTab = true,
  }) {
    if (useShellTab && ShellNavigationScope.openPage(context, page)) {
      return;
    }
    Navigator.of(context).push(ZenPageRoute(builder: (_) => page));
  }

  /// Opens a release (Album, Single, EP, Playlist, or Video Single) with consistent flags.
  static void openRelease(
    BuildContext context, {
    required String albumTitle,
    required String artistName,
    String? coverUrl,
    String? browseId,
    List<Track>? initialTracks,
    bool isSingle = false,
    bool isVideo = false,
    bool useShellTab = true,
  }) {
    final first = initialTracks != null && initialTracks.isNotEmpty
        ? initialTracks.first
        : null;
    final effectiveVideo =
        isVideo ||
        (first != null && AlbumResolver.isVideoTrack(first)) ||
        AlbumResolver.isVideoContext(
          isVideo: isVideo,
          title: first?.title ?? albumTitle,
          album: albumTitle,
          coverUrl: coverUrl ?? first?.coverUrl,
        );

    if (effectiveVideo) {
      final videoTrack =
          (first ??
                  Track(
                    id: '',
                    title: albumTitle,
                    artist: artistName,
                    album: 'Music Video',
                    coverUrl: coverUrl ?? '',
                    isVideo: true,
                  ))
              .copyWith(isVideo: true);
      _pushPage(
        context,
        AlbumScreen(
          albumTitle: MediaNormalizer.cleanTitle(
            first?.title ?? albumTitle,
          ),
          artistName: MediaNormalizer.formatArtists(
            first?.artist ?? artistName,
          ),
          coverUrl: coverUrl ?? videoTrack.coverUrl,
          browseId: null,
          initialTracks: [videoTrack],
          isVideo: true,
          isSingle: true,
        ),
        useShellTab: useShellTab,
      );
      return;
    }

    final validBrowseId = _normalizeReleaseBrowseId(
      browseId ?? first?.albumBrowseId,
      allowPlaylist: first == null,
    );
    final effectiveSingle =
        isSingle || AlbumResolver.isSingleReleaseTitle(albumTitle);
    final cleanTitle = effectiveSingle
        ? MediaNormalizer.cleanTitle(albumTitle)
        : MediaNormalizer.cleanAlbumTitle(albumTitle);
    final cleanArtist = MediaNormalizer.formatArtists(artistName);

    _pushPage(
      context,
      AlbumScreen(
        albumTitle: cleanTitle,
        artistName: cleanArtist,
        coverUrl: coverUrl ?? first?.coverUrl,
        browseId: validBrowseId,
        initialTracks: initialTracks,
        isSingle: effectiveSingle,
      ),
      useShellTab: useShellTab,
    );
  }

  /// Opens the appropriate release page for a [ReleaseSummary] card.
  static void openSummary(
    BuildContext context,
    ReleaseSummary release, {
    bool useShellTab = true,
  }) {
    openRelease(
      context,
      albumTitle: release.title,
      artistName: release.artist,
      coverUrl: release.coverUrl,
      browseId: release.browseId,
      initialTracks: release.sourceTrack != null ? [release.sourceTrack!] : null,
      isSingle: release.kind == MediaReleaseKind.single ||
          release.kind == MediaReleaseKind.ep,
      isVideo: release.kind == MediaReleaseKind.video,
      useShellTab: useShellTab,
    );
  }

  /// Navigates from a [Track] (e.g., player title, queue row, track dropdown, Top Picks).
  ///
  /// - Video tracks always go to the Video Singles page (zero album lookup).
  /// - If [forceSingle] is true (e.g., from a Singles context), stays on Singles page.
  /// - Audio songs attempt strict album resolution (`isSingle: false`).
  static void openForTrack(
    BuildContext context,
    Track track, {
    bool forceSingle = false,
    bool useShellTab = true,
  }) {
    if (AlbumResolver.isVideoTrack(track)) {
      openRelease(
        context,
        albumTitle: track.title,
        artistName: track.artist,
        coverUrl: track.coverUrl,
        initialTracks: [track.copyWith(isVideo: true)],
        isVideo: true,
        isSingle: true,
        useShellTab: useShellTab,
      );
      return;
    }

    final cleanAlb = MediaNormalizer.cleanAlbumTitle(track.album);
    final useTitle = AlbumResolver.isValidAlbumTitle(cleanAlb)
        ? cleanAlb
        : MediaNormalizer.cleanTitle(track.title);
    openRelease(
      context,
      albumTitle: useTitle,
      artistName: MediaNormalizer.formatArtists(track.artist),
      coverUrl: track.coverUrl,
      browseId: AlbumResolver.sanitizeAlbumBrowseId(track.albumBrowseId),
      initialTracks: [track],
      isSingle: forceSingle,
      useShellTab: useShellTab,
    );
  }

  static void openArtist(
    BuildContext context, {
    required String artistName,
    String? browseId,
    String? imageUrl,
    bool useShellTab = true,
  }) {
    final cleanId = (browseId != null && browseId.isNotEmpty && !browseId.contains('_'))
        ? browseId
        : null;
    _pushPage(
      context,
      ArtistScreen(
        artistName: MediaNormalizer.stripIdNoise(artistName),
        browseId: cleanId,
        imageUrl: imageUrl,
      ),
      useShellTab: useShellTab,
    );
  }

  static String? _normalizeReleaseBrowseId(
    String? browseId, {
    required bool allowPlaylist,
  }) {
    final id = browseId?.trim();
    if (id == null || id.isEmpty) return null;
    if (AlbumResolver.isValidAlbumBrowseId(id)) return id;
    if (allowPlaylist &&
        (id.startsWith('VLPL') || id.startsWith('PL') || id.startsWith('RD'))) {
      return id;
    }
    return null;
  }
}
