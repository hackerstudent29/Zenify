import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// Add-on: First Song of the Period card.
/// Highlights the track that kicked off this Replay cycle.
class FirstSongCard extends StatelessWidget {
  final SongStat? firstSong;
  final ValueChanged<SongStat>? onPlaySong;

  const FirstSongCard({
    super.key,
    required this.firstSong,
    this.onPlaySong,
  });

  @override
  Widget build(BuildContext context) {
    if (firstSong == null) {
      return const SizedBox.shrink();
    }

    final song = firstSong!;

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Section Title
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.play_circle_filled_rounded,
                  color: AppTheme.brand,
                  size: 16,
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'HOW IT STARTED',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                  color: AppTheme.textMuted,
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          // Track showcase row
          Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: song.coverUrl != null && song.coverUrl!.isNotEmpty
                    ? Image.network(
                        song.coverUrl!,
                        width: 52,
                        height: 52,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => _buildArtPlaceholder(),
                      )
                    : _buildArtPlaceholder(),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      song.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      song.artistRaw,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'First track played this period',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.brand,
                      ),
                    ),
                  ],
                ),
              ),
              if (onPlaySong != null)
                IconButton(
                  icon: const Icon(Icons.play_arrow_rounded, color: AppTheme.brand, size: 28),
                  onPressed: () => onPlaySong!(song),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildArtPlaceholder() {
    return Container(
      width: 52,
      height: 52,
      color: Colors.white.withValues(alpha: 0.08),
      child: const Icon(Icons.music_note_rounded, color: AppTheme.textMuted, size: 24),
    );
  }
}
