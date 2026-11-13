import 'dart:math' as math;
import 'dart:ui';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../design_system/widgets/dynamic_island_header.dart';
import '../../../design_system/widgets/monogram_avatar.dart';
import '../../../design_system/widgets/pressable_scale.dart';
import '../../../models/track.dart';
import '../../../services/dock_visibility.dart';
import '../../../services/lyrics_service.dart';
import '../models/story_share_content.dart';
import 'lyrics_selection_screen.dart';
import 'story_preview_screen.dart';

/// Premium Apple Music-styled Bottom Sheet to choose a Story sharing category.
class StoryOptionsSheet {
  StoryOptionsSheet._();

  static Future<void> show({
    required BuildContext context,
    required Track track,
    LyricsResult? lyrics,
    List<Track> artistTopTracks = const [],
    List<String> artistAlbumCovers = const [],
    String? artistAudience,
    List<Track> albumTracks = const [],
    String? albumYear,
    int? albumTrackCount,
    PlaylistStoryContent? playlistContent,
  }) {
    HapticFeedback.mediumImpact();

    return DockVisibility.runModal(
      () => showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        backgroundColor: Colors.transparent,
        barrierColor: Colors.black.withValues(alpha: 0.50),
        isScrollControlled: true,
        enableDrag: true,
        builder: (ctx) {
          final safeBottom = MediaQuery.paddingOf(ctx).bottom;

          final hasLyrics = lyrics != null && lyrics.lines.isNotEmpty;
          final hasAlbum = track.album.isNotEmpty &&
              track.album != 'Single' &&
              !track.album.startsWith('UC');
          final hasArtist = track.artist.isNotEmpty &&
              track.artist != 'Unknown Artist' &&
              !track.artist.startsWith('UC');

          return BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 25, sigmaY: 25),
            child: Container(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(ctx).height * 0.85,
              ),
              decoration: BoxDecoration(
                color: const Color(0xF21C1C1E), // Frosted #1C1C1E
                borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
                border: Border(
                  top: BorderSide(
                    color: Colors.white.withValues(alpha: 0.12),
                    width: 0.6,
                  ),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.50),
                    blurRadius: 36,
                    offset: const Offset(0, -6),
                  ),
                ],
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: EdgeInsets.fromLTRB(16, 10, 16, math.max(16, safeBottom + 8)),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Grabber
                      Center(
                        child: Container(
                          width: 36,
                          height: 4.5,
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.22),
                            borderRadius: BorderRadius.circular(2.5),
                          ),
                        ),
                      ),

                      // Header: Squircle Cover + Title + Subtitle
                      Row(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              width: 48,
                              height: 48,
                              color: const Color(0xFF2C2C2E),
                              child: track.coverUrl.isNotEmpty
                                  ? CachedNetworkImage(
                                      imageUrl: track.coverUrl,
                                      fit: BoxFit.cover,
                                      errorWidget: (_, _, _) => MonogramAvatar(name: track.title, size: 48),
                                    )
                                  : MonogramAvatar(name: track.title, size: 48),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Add to Story',
                                  style: const TextStyle(
                                    fontFamily: 'SF Pro Display',
                                    fontSize: 17,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: -0.3,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${track.title} • ${track.displayArtists}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontFamily: 'SF Pro',
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                    color: Colors.white.withValues(alpha: 0.65),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 18),

                      // Option 1: Share Song Story
                      _StoryOptionTile(
                        icon: CupertinoIcons.music_note,
                        title: 'Share Song',
                        subtitle: 'Poster, liquid glass, and editorial song cards',
                        onTap: () {
                          Navigator.pop(ctx);
                          Navigator.of(context).push(
                            CupertinoPageRoute(
                              builder: (_) => StoryPreviewScreen(
                                content: SongStoryContent(track: track),
                              ),
                            ),
                          );
                        },
                      ),

                      const SizedBox(height: 8),

                      // Option 2: Share Lyrics Story (if lyrics present)
                      if (hasLyrics) ...[
                        _StoryOptionTile(
                          icon: CupertinoIcons.quote_bubble_fill,
                          title: 'Share Lyrics',
                          subtitle: 'Select up to 3 lines with dynamic artwork typography',
                          onTap: () {
                            Navigator.pop(ctx);
                            Navigator.of(context).push(
                              CupertinoPageRoute(
                                builder: (_) => LyricsSelectionScreen(
                                  track: track,
                                  lyrics: lyrics,
                                ),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 8),
                      ],

                      // Option 3: Share Artist Story (if artist is valid)
                      if (hasArtist) ...[
                        _StoryOptionTile(
                          icon: CupertinoIcons.person_crop_circle,
                          title: 'Share Artist',
                          subtitle: track.artist,
                          onTap: () {
                            Navigator.pop(ctx);
                            Navigator.of(context).push(
                              CupertinoPageRoute(
                                builder: (_) => StoryPreviewScreen(
                                  content: ArtistStoryContent(
                                    artistName: track.artist,
                                    coverUrl: track.coverUrl,
                                    audience: artistAudience,
                                    topTracks: artistTopTracks.isNotEmpty
                                        ? artistTopTracks
                                        : [track],
                                    albumCovers: artistAlbumCovers,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 8),
                      ],

                      // Option 4: Share Album Story (if album is valid)
                      if (hasAlbum) ...[
                        _StoryOptionTile(
                          icon: CupertinoIcons.music_albums,
                          title: 'Share Album',
                          subtitle: track.album,
                          onTap: () {
                            Navigator.pop(ctx);
                            Navigator.of(context).push(
                              CupertinoPageRoute(
                                builder: (_) => StoryPreviewScreen(
                                  content: AlbumStoryContent(
                                    albumTitle: track.album,
                                    artistName: track.artist,
                                    coverUrl: track.coverUrl,
                                    year: albumYear,
                                    trackCount: albumTrackCount,
                                    tracks: albumTracks.isNotEmpty ? albumTracks : [track],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 8),
                      ],

                      // Option 5: Share Playlist Story (if playlist context passed)
                      if (playlistContent != null) ...[
                        _StoryOptionTile(
                          icon: CupertinoIcons.square_grid_2x2,
                          title: 'Share Playlist',
                          subtitle: playlistContent.playlistTitle,
                          onTap: () {
                            Navigator.pop(ctx);
                            Navigator.of(context).push(
                              CupertinoPageRoute(
                                builder: (_) => StoryPreviewScreen(
                                  content: playlistContent,
                                ),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 8),
                      ],

                      // Option 6: Quick Copy Link
                      _StoryOptionTile(
                        icon: CupertinoIcons.link,
                        title: 'Copy Song Link',
                        subtitle: 'https://zenify.app/track/...',
                        onTap: () {
                          final url = 'https://zenify.app/track/${Uri.encodeComponent(track.id.isNotEmpty ? track.id : track.title)}';
                          Clipboard.setData(ClipboardData(text: url));
                          HapticFeedback.lightImpact();
                          Navigator.pop(ctx);
                          IslandNotifier.instance.show(
                            IslandNotification(
                              id: 'copy_link_${DateTime.now().millisecondsSinceEpoch}',
                              title: 'Copied Link',
                              body: track.title,
                              leading: const Icon(CupertinoIcons.link, color: Color(0xFFE11D48), size: 18),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _StoryOptionTile extends StatelessWidget {
  const _StoryOptionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.08),
            width: 0.8,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: const Color(0xFFE11D48).withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: const Color(0xFFE11D48), size: 19),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontFamily: 'SF Pro Display',
                      fontSize: 15.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.2,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 12.5,
                      fontWeight: FontWeight.w500,
                      color: Colors.white.withValues(alpha: 0.60),
                    ),
                  ),
                ],
              ),
            ),
            const Icon(CupertinoIcons.chevron_right, size: 15, color: Colors.white38),
          ],
        ),
      ),
    );
  }
}
