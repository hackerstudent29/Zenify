import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// F6: Composers, Singers & Movie Soundtracks Widget.
///
/// Features:
/// - Top Composers & Music Directors (e.g. "Anirudh was your #1 composer").
/// - Top Singers & Vocalists.
/// - Top Movie Soundtrack Album (requires >= 2 distinct tracks played).
class ComposersSingersSection extends StatefulWidget {
  const ComposersSingersSection({
    super.key,
    required this.topComposers,
    required this.topSingers,
    this.topMovie,
    this.onPlaySong,
  });

  final List<ComposerStat> topComposers;
  final List<SingerStat> topSingers;
  final MovieStat? topMovie;
  final void Function(SongStat song)? onPlaySong;

  @override
  State<ComposersSingersSection> createState() => _ComposersSingersSectionState();
}

class _ComposersSingersSectionState extends State<ComposersSingersSection> {
  bool _movieExpanded = false;

  @override
  Widget build(BuildContext context) {
    final hasComposers = widget.topComposers.isNotEmpty;
    final hasSingers = widget.topSingers.isNotEmpty;
    final hasMovie = widget.topMovie != null;

    if (!hasComposers && !hasSingers && !hasMovie) {
      return const SizedBox.shrink();
    }

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
          // Section Header
          const Text(
            'CREATIVE CREDITS',
            style: TextStyle(
              fontFamily: 'SF Pro',
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppTheme.textMuted,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 3),
          const Text(
            'Composers & Film Soundtracks',
            style: TextStyle(
              fontFamily: 'SF Pro Display',
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
              letterSpacing: -0.3,
            ),
          ),

          const SizedBox(height: 20),

          // Top Movie Soundtrack Showcase (F6)
          if (hasMovie) ...[
            _buildMovieCard(widget.topMovie!),
            const SizedBox(height: 20),
          ],

          // Top Composers Grid / List
          if (hasComposers) ...[
            const Row(
              children: [
                Icon(Icons.piano_rounded, size: 16, color: AppTheme.brand),
                SizedBox(width: 8),
                Text(
                  'TOP COMPOSERS & MUSIC DIRECTORS',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textMuted,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ...widget.topComposers.take(3).map((c) => _buildComposerRow(c)),
            const SizedBox(height: 16),
          ],

          // Top Singers
          if (hasSingers) ...[
            const Row(
              children: [
                Icon(Icons.mic_rounded, size: 16, color: AppTheme.brand),
                SizedBox(width: 8),
                Text(
                  'TOP SINGERS & VOCALISTS',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.textMuted,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ...widget.topSingers.take(3).map((s) => _buildSingerRow(s)),
          ],
        ],
      ),
    );
  }

  Widget _buildMovieCard(MovieStat movie) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(
                  Icons.movie_filter_rounded,
                  color: AppTheme.brand,
                  size: 22,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'TOP FILM SOUNDTRACK',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.brand,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      movie.movieName,
                      style: const TextStyle(
                        fontFamily: 'SF Pro Display',
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${movie.distinctTrackCount} tracks played · ${movie.minutes} min',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () {
                  setState(() => _movieExpanded = !_movieExpanded);
                },
                icon: Icon(
                  _movieExpanded
                      ? Icons.keyboard_arrow_up_rounded
                      : Icons.keyboard_arrow_down_rounded,
                  color: AppTheme.textMuted,
                ),
              ),
            ],
          ),

          if (_movieExpanded && movie.tracks.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Divider(color: AppTheme.border, height: 1),
            const SizedBox(height: 8),
            ...movie.tracks.map((song) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      const Icon(Icons.music_note_rounded, size: 14, color: AppTheme.textMuted),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          song.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary),
                        ),
                      ),
                      Text(
                        song.formattedDuration,
                        style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
                      ),
                      if (widget.onPlaySong != null)
                        IconButton(
                          icon: const Icon(Icons.play_circle_fill, color: AppTheme.brand, size: 22),
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

  Widget _buildComposerRow(ComposerStat composer) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: AppTheme.brand.withValues(alpha: 0.15),
            child: Text(
              composer.composerName.isNotEmpty
                  ? composer.composerName.substring(0, 1).toUpperCase()
                  : 'C',
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.brand),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              composer.composerName,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textPrimary),
            ),
          ),
          Text(
            '${composer.minutes} min · ${composer.qualifiedPlays} plays',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }

  Widget _buildSingerRow(SingerStat singer) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          CircleAvatar(
            radius: 14,
            backgroundColor: Colors.white.withValues(alpha: 0.08),
            child: Text(
              singer.singerName.isNotEmpty
                  ? singer.singerName.substring(0, 1).toUpperCase()
                  : 'S',
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textPrimary),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              singer.singerName,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.textPrimary),
            ),
          ),
          Text(
            '${singer.minutes} min · ${singer.qualifiedPlays} plays',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
        ],
      ),
    );
  }
}
