import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../models/artist_ref.dart';
import '../../models/track.dart';
import '../../services/album_resolver.dart';
import '../../services/artist_service.dart';
import '../../services/dock_visibility.dart';
import '../../services/media_router.dart';
import '../../utils/media_normalizer.dart';
import '../../views/details/artist_screen.dart';
import '../../views/shell_screen.dart' show ShellNavigationScope;
import '../zen.dart';
import 'monogram_avatar.dart';
import 'pressable_scale.dart';
import 'zen_dropdown.dart';

/// Apple Music-style navigation sheet displaying "Go to Artist" (one row per artist)
/// and validated "Go to Album" with high-res artwork, overriding the miniplayer, bottom dock,
/// and dynamic island as Layer 1 of the app.
class MediaNavigationSheet extends StatefulWidget {
  const MediaNavigationSheet({
    super.key,
    required this.artists,
    this.albumTitle,
    this.albumArtist,
    this.albumCoverUrl,
    this.albumBrowseId,
    this.initialTracks,
    required this.onOpenArtist,
    this.onOpenAlbum,
    this.onOpenValidatedAlbum,
    this.trackForResolution,
    this.excludeAlbumBrowseId,
    this.isVideo = false,
    this.isLandscape = false,
  });

  final List<ArtistRef> artists;
  final String? albumTitle;
  final String? albumArtist;
  final String? albumCoverUrl;
  final String? albumBrowseId;
  final List<Track>? initialTracks;
  final ValueChanged<ArtistRef> onOpenArtist;
  final VoidCallback? onOpenAlbum;
  final void Function(ValidatedAlbumResult album)? onOpenValidatedAlbum;
  final Track? trackForResolution;
  final String? excludeAlbumBrowseId;
  final bool isVideo;
  final bool isLandscape;

  /// Primary entrypoint to show the media navigation sheet across the entire application.
  static Future<void> show({
    required BuildContext context,
    Track? track,
    List<ArtistRef>? artists,
    String? artistName,
    String? albumTitle,
    String? albumArtist,
    String? albumCoverUrl,
    String? albumBrowseId,
    List<Track>? initialTracks,
    bool showAlbum = true,
    bool isVideo = false,
    String? excludeAlbumBrowseId,
    void Function(ArtistRef artist)? onOpenArtist,
    VoidCallback? onOpenAlbum,
    VoidCallback? onBeforeNavigate,
    bool landscape = false,
  }) async {
    HapticFeedback.lightImpact();
    // Dismiss any active dynamic island notification so it does not distract
    IslandNotifier.instance.dismiss();

    final callerNav = Navigator.of(context, rootNavigator: false);
    final rootNav = Navigator.of(context, rootNavigator: true);

    // Resolve artists cleanly
    List<ArtistRef> effectiveArtists = [];
    if (artists != null && artists.isNotEmpty) {
      for (final a in artists) {
        if (MediaNormalizer.splitArtistNames(a.name).length > 1) {
          effectiveArtists.addAll(ArtistRef.splitFromName(a.name, defaultImageUrl: a.imageUrl));
        } else {
          effectiveArtists.add(a);
        }
      }
    } else if (track != null && track.resolvedArtists.isNotEmpty) {
      for (final a in track.resolvedArtists) {
        if (MediaNormalizer.splitArtistNames(a.name).length > 1) {
          effectiveArtists.addAll(ArtistRef.splitFromName(a.name, defaultImageUrl: a.imageUrl));
        } else {
          effectiveArtists.add(a);
        }
      }
    } else if (artistName != null && artistName.trim().isNotEmpty) {
      effectiveArtists = ArtistRef.splitFromName(artistName);
    } else if (track != null && track.artist.trim().isNotEmpty) {
      effectiveArtists = ArtistRef.splitFromName(track.artist);
    }

    // Deduplicate by name
    final seen = <String>{};
    effectiveArtists = effectiveArtists.where((a) => seen.add(a.name.toLowerCase().trim())).toList();

    if (effectiveArtists.isEmpty) {
      effectiveArtists = [ArtistRef.fromName('Unknown Artist')];
    }

    // Video songs NEVER redirect to an album.
    final isVidTrack =
        isVideo ||
        (track != null && AlbumResolver.isVideoTrack(track));

    String? effectiveAlbum;
    if (showAlbum && !isVidTrack) {
      if (albumTitle != null &&
          albumTitle.trim().isNotEmpty &&
          AlbumResolver.isValidAlbumTitle(albumTitle)) {
        effectiveAlbum = albumTitle;
      } else if (track != null &&
          AlbumResolver.isValidAlbumTitle(track.album) &&
          !AlbumResolver.isSingleReleaseTitle(track.album)) {
        effectiveAlbum = track.album;
      }
    }

    final effectiveCover = albumCoverUrl ?? track?.coverUrl;
    final effectiveBrowseId =
        AlbumResolver.sanitizeAlbumBrowseId(albumBrowseId ?? track?.albumBrowseId);
    final effectiveAlbumArtist = albumArtist ??
        (track?.artist ?? (effectiveArtists.isNotEmpty ? effectiveArtists.first.name : ''));

    final token = DockVisibility.acquire(hideNav: true, hideMini: true);

    final isLandscape = landscape;

    Widget buildSheet(BuildContext sheetContext) => MediaNavigationSheet(
      artists: effectiveArtists,
      albumTitle: effectiveAlbum,
      albumArtist: effectiveAlbumArtist,
      albumCoverUrl: effectiveCover,
      albumBrowseId: effectiveBrowseId,
      initialTracks: initialTracks ?? (track != null ? [track] : null),
      trackForResolution: (!isVidTrack && showAlbum && effectiveAlbum == null)
          ? (track ??
                (initialTracks != null && initialTracks.isNotEmpty
                    ? initialTracks.first
                    : null))
          : null,
      excludeAlbumBrowseId: excludeAlbumBrowseId,
      isVideo: isVidTrack,
      isLandscape: isLandscape,
      onOpenArtist: (a) {
        DockVisibility.release(token);
        Navigator.of(sheetContext).pop();
        onBeforeNavigate?.call();
        if (onOpenArtist != null) {
          onOpenArtist(a);
          return;
        }
        final page = ArtistScreen(
          artistName: a.name,
          browseId: a.id.isNotEmpty && !a.id.contains('_') ? a.id : null,
          imageUrl: a.imageUrl,
        );
        if (!ShellNavigationScope.openPage(context, page)) {
          final nav = callerNav.mounted ? callerNav : rootNav;
          nav.push(
            ZenPageRoute(
              builder: (_) => page,
            ),
          );
        }
      },
      onOpenValidatedAlbum: (showAlbum && !isVidTrack)
          ? (validated) {
              DockVisibility.release(token);
              Navigator.of(sheetContext).pop();
              onBeforeNavigate?.call();
              MediaRouter.openRelease(
                context,
                albumTitle: validated.title,
                artistName: validated.artist,
                coverUrl: validated.coverUrl,
                browseId: validated.browseId,
                initialTracks: validated.tracks,
                isSingle: false,
                useShellTab: true,
              );
            }
          : null,
      onOpenAlbum: effectiveAlbum != null && !isVidTrack
          ? () {
              DockVisibility.release(token);
              Navigator.of(sheetContext).pop();
              onBeforeNavigate?.call();
              if (onOpenAlbum != null) {
                onOpenAlbum();
                return;
              }
              MediaRouter.openRelease(
                context,
                albumTitle: effectiveAlbum!,
                artistName: effectiveAlbumArtist,
                coverUrl: effectiveCover,
                browseId: effectiveBrowseId,
                initialTracks: initialTracks ?? (track != null ? [track] : null),
                isSingle: false,
                isVideo: false,
                useShellTab: true,
              );
            }
          : null,
    );

    try {
      if (isLandscape) {
        await ZenDropdown.showLandscapePanel<void>(
          context,
          builder: buildSheet,
        );
      } else {
        await showModalBottomSheet<void>(
          context: context,
          useRootNavigator: true,
          backgroundColor: Colors.transparent,
          barrierColor: Colors.black.withValues(alpha: 0.65),
          isScrollControlled: true,
          enableDrag: true,
          builder: buildSheet,
        );
      }
    } finally {
      DockVisibility.release(token);
    }
  }

  @override
  State<MediaNavigationSheet> createState() => _MediaNavigationSheetState();
}

class _MediaNavigationSheetState extends State<MediaNavigationSheet> {
  final Map<String, String> _photos = {};
  final Map<String, String> _browseIds = {};
  ValidatedAlbumResult? _resolvedParentAlbum;

  @override
  void initState() {
    super.initState();
    for (final a in widget.artists) {
      if (a.imageUrl != null && a.imageUrl!.isNotEmpty) {
        _photos[a.name.toLowerCase()] = a.imageUrl!;
      }
      if (a.id.isNotEmpty && !a.id.contains('_')) {
        _browseIds[a.name.toLowerCase()] = a.id;
      }
    }
    _resolveMissingArtistImages();
    _resolveParentAlbumIfNeeded();
  }

  void _resolveParentAlbumIfNeeded() {
    if (widget.isVideo) return;
    if (widget.albumTitle != null && widget.albumTitle!.trim().isNotEmpty) {
      return;
    }
    final tr = widget.trackForResolution;
    if (tr == null) return;
    AlbumResolver.resolveValidatedParentAlbumForTrack(
      tr,
      excludeBrowseId: widget.excludeAlbumBrowseId,
    ).then((res) {
      if (mounted && res != null) {
        setState(() => _resolvedParentAlbum = res);
      }
    }).catchError((_) {});
  }

  void _resolveMissingArtistImages() {
    for (final a in widget.artists) {
      final key = a.name.toLowerCase();
      if (_photos[key] == null || _photos[key]!.isEmpty) {
        final browseId = a.id.isNotEmpty && !a.id.contains('_') ? a.id : null;
        ArtistService.instance.getArtist(a.name, browseId: browseId).then((profile) {
          if (mounted && profile != null) {
            setState(() {
              if (profile.imageUrl.isNotEmpty) {
                _photos[key] = profile.imageUrl;
              }
            });
          }
        }).catchError((_) {});
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).padding.bottom;
    final hasExplicitAlbum =
        !widget.isVideo &&
        widget.albumTitle != null &&
        widget.albumTitle!.trim().isNotEmpty &&
        widget.onOpenAlbum != null;
    final validatedAlbum = !widget.isVideo ? _resolvedParentAlbum : null;

    final content = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Artists rows (one row per artist, list style)
        for (final artist in widget.artists) ...[
          _buildArtistRow(artist),
          const SizedBox(height: 10),
        ],

        // Validated Album row (if available and not a video song)
        if (hasExplicitAlbum) ...[
          _buildAlbumRow(
            title: widget.albumTitle!,
            coverUrl: widget.albumCoverUrl ?? '',
            onTap: widget.onOpenAlbum!,
          ),
        ] else if (validatedAlbum != null &&
            widget.onOpenValidatedAlbum != null) ...[
          _buildAlbumRow(
            title: validatedAlbum.title,
            coverUrl: validatedAlbum.coverUrl,
            onTap: () => widget.onOpenValidatedAlbum!(validatedAlbum),
          ),
        ],
      ],
    );

    if (widget.isLandscape) {
      return SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: content,
        ),
      );
    }

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        border: Border(
          top: BorderSide(
            color: Colors.white.withValues(alpha: 0.12),
            width: 0.5,
          ),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.65),
            blurRadius: 40,
            offset: const Offset(0, -8),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(18, 6, 18, 14 + bottomPad),
          child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Grabber Handle
                Center(
                  child: Container(
                    width: 36,
                    height: 5,
                    margin: const EdgeInsets.only(top: 8, bottom: 14),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.25),
                      borderRadius: BorderRadius.circular(2.5),
                    ),
                  ),
                ),
                content,
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildArtistRow(ArtistRef artist) {
    final key = artist.name.toLowerCase();
    final photo = _photos[key] ?? artist.imageUrl ?? '';
    final browseId = _browseIds[key] ?? artist.id;
    final resolvedRef = ArtistRef(
      id: browseId,
      name: artist.name,
      imageUrl: photo,
    );

    return PressableScale(
      scale: 0.98,
      onTap: () {
        HapticFeedback.lightImpact();
        widget.onOpenArtist(resolvedRef);
      },
      child: Container(
        color: Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
        child: Row(
          children: [
            // Circular Avatar (48x48)
            SizedBox(
              width: 48,
              height: 48,
              child: ClipOval(
                child: photo.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: photo,
                        fit: BoxFit.cover,
                        fadeInDuration: const Duration(milliseconds: 200),
                        placeholder: (_, _) => MonogramAvatar(
                          name: artist.name,
                          size: 48,
                          isCircle: true,
                        ),
                        errorWidget: (_, _, _) => MonogramAvatar(
                          name: artist.name,
                          size: 48,
                          isCircle: true,
                        ),
                      )
                    : MonogramAvatar(
                        name: artist.name,
                        size: 48,
                        isCircle: true,
                      ),
              ),
            ),
            const SizedBox(width: 14),

            // Text column
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Go to Artist',
                    style: TextStyle(
                      fontFamily: 'SF Pro Display',
                      fontSize: 16.5,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.2,
                      color: Colors.white,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    artist.name,
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 13.5,
                      fontWeight: FontWeight.w400,
                      color: Colors.white.withValues(alpha: 0.60),
                      letterSpacing: -0.1,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAlbumRow({
    required String title,
    required String coverUrl,
    required VoidCallback onTap,
  }) {
    return PressableScale(
      scale: 0.98,
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        color: Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
        child: Row(
          children: [
            // Rounded Square Cover (48x48)
            SizedBox(
              width: 48,
              height: 48,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: coverUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: coverUrl,
                        fit: BoxFit.cover,
                        fadeInDuration: const Duration(milliseconds: 200),
                        placeholder: (_, _) => Container(
                          color: const Color(0xFF2C2C2E),
                          child: const Icon(
                            Icons.album_rounded,
                            color: Colors.white30,
                            size: 24,
                          ),
                        ),
                        errorWidget: (_, _, _) => Container(
                          color: const Color(0xFF2C2C2E),
                          child: const Icon(
                            Icons.album_rounded,
                            color: Colors.white30,
                            size: 24,
                          ),
                        ),
                      )
                    : Container(
                        color: const Color(0xFF2C2C2E),
                        child: const Icon(
                          Icons.album_rounded,
                          color: Colors.white30,
                          size: 24,
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 14),

            // Text column
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Go to Album',
                    style: TextStyle(
                      fontFamily: 'SF Pro Display',
                      fontSize: 16.5,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.2,
                      color: Colors.white,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    title,
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 13.5,
                      fontWeight: FontWeight.w400,
                      color: Colors.white.withValues(alpha: 0.60),
                      letterSpacing: -0.1,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
