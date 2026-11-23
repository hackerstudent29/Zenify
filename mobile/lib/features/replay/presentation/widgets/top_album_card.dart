import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// F8: Most Listened Album Widget.
///
/// Features:
/// - Highlights user's top album (requires >= 2 distinct tracks played).
/// - Displays album cover, title, artist, listened time, and distinct track count.
/// - Expandable tracklist showing all songs played from this album.
class TopAlbumCard extends StatefulWidget {
  const TopAlbumCard({
    super.key,
    required this.album,
    this.onPlaySong,
  });

  final AlbumStat album;
  final void Function(SongStat song)? onPlaySong;

  @override
  State<TopAlbumCard> createState() => _TopAlbumCardState();
}

class _TopAlbumCardState extends State<TopAlbumCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section Tag
          const Text(
            'MOST LISTENED ALBUM',
            style: TextStyle(
              fontFamily: 'SF Pro',
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppTheme.textMuted,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 14),

          // Album Cover & Main Details
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  width: 72,
                  height: 72,
                  color: Colors.white.withValues(alpha: 0.08),
                  child: widget.album.coverUrl != null && widget.album.coverUrl!.isNotEmpty
                      ? Image.network(
                          widget.album.coverUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const Icon(
                            Icons.album_rounded,
                            color: AppTheme.brand,
                            size: 32,
                          ),
                        )
                      : const Icon(
                          Icons.album_rounded,
                          color: AppTheme.brand,
                          size: 32,
                        ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.album.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: 'SF Pro Display',
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      widget.album.artistRaw,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${widget.album.distinctTrackCount} tracks · ${widget.album.minutes} min · ${widget.album.qualifiedPlays} plays',
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: AppTheme.brand,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () {
                  setState(() => _expanded = !_expanded);
                },
                icon: Icon(
                  _expanded
                      ? Icons.keyboard_arrow_up_rounded
                      : Icons.keyboard_arrow_down_rounded,
                  color: AppTheme.textMuted,
                ),
              ),
            ],
          ),

          // Expandable Tracklist
          if (_expanded && widget.album.tracks.isNotEmpty) ...[
            const SizedBox(height: 16),
            const Divider(color: AppTheme.border, height: 1),
            const SizedBox(height: 10),
            Text(
              'TRACKS PLAYED FROM THIS ALBUM',
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppTheme.textMuted,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 8),
            ...widget.album.tracks.map((song) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    children: [
                      const Icon(Icons.music_note_rounded, size: 14, color: AppTheme.textMuted),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          song.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                      ),
                      Text(
                        song.formattedDuration,
                        style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                      ),
                      if (widget.onPlaySong != null)
                        IconButton(
                          icon: const Icon(Icons.play_circle_fill_rounded, color: AppTheme.brand, size: 22),
                          padding: const EdgeInsets.only(left: 8),
                          constraints: const BoxConstraints(),
                          onPressed: () => widget.onPlaySong!(song),
                        ),
                    ],
                  ),
                )),
          ],
        ],
      ),
    );
  }
}
