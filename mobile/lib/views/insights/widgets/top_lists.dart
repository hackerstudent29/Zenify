import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../design_system/tokens/app_colors.dart';

class TopLists extends StatefulWidget {
  const TopLists({
    super.key,
    required this.topArtists,
    required this.topTracks,
    this.onTrackTapped,
  });

  final List<dynamic> topArtists;
  final List<dynamic> topTracks;
  final ValueChanged<Map<String, dynamic>>? onTrackTapped;

  @override
  State<TopLists> createState() => _TopListsState();
}

class _TopListsState extends State<TopLists> {
  bool _expandedArtists = false;
  bool _expandedTracks = false;

  String _formatDuration(int ms) {
    if (ms <= 0) return '0 min';
    final totalSec = ms ~/ 1000;
    final hours = totalSec ~/ 3600;
    final minutes = (totalSec % 3600) ~/ 60;
    if (hours > 0) {
      return '$hours hr ${minutes > 0 ? '$minutes min' : ''}';
    }
    return '$minutes min';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Top Artists Section
        if (widget.topArtists.isNotEmpty) ...[
          _buildHeader(
            title: 'TOP ARTISTS',
            canExpand: widget.topArtists.length > 5,
            isExpanded: _expandedArtists,
            onToggleExpand: () => setState(() => _expandedArtists = !_expandedArtists),
          ),
          const SizedBox(height: 12),
          _buildArtistsCard(),
          const SizedBox(height: 24),
        ],

        // Top Tracks Section
        if (widget.topTracks.isNotEmpty) ...[
          _buildHeader(
            title: 'TOP SONGS',
            canExpand: widget.topTracks.length > 5,
            isExpanded: _expandedTracks,
            onToggleExpand: () => setState(() => _expandedTracks = !_expandedTracks),
          ),
          const SizedBox(height: 12),
          _buildTracksCard(),
        ],
      ],
    );
  }

  Widget _buildHeader({
    required String title,
    required bool canExpand,
    required bool isExpanded,
    required VoidCallback onToggleExpand,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: GoogleFonts.oswald(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: Colors.white,
          ),
        ),
        if (canExpand)
          GestureDetector(
            onTap: onToggleExpand,
            child: Text(
              isExpanded ? 'Show Less' : 'See All (10)',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppColors.crimson,
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildArtistsCard() {
    final count = _expandedArtists
        ? widget.topArtists.length.clamp(0, 10)
        : widget.topArtists.length.clamp(0, 5);

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: count,
        separatorBuilder: (_, _) => Divider(
          color: Colors.white.withValues(alpha: 0.06),
          height: 1,
          indent: 64,
        ),
        itemBuilder: (context, index) {
          final art = widget.topArtists[index] as Map<String, dynamic>;
          final name = art['artistName'] ?? 'Unknown Artist';
          final plays = art['plays'] ?? 0;
          final ms = art['listenedMs'] ?? 0;
          final percentage = art['percentage'] ?? 0;

          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                SizedBox(
                  width: 24,
                  child: Text(
                    '#${index + 1}',
                    style: GoogleFonts.oswald(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: index == 0 ? AppColors.crimson : Colors.white38,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: const Color(0xFF27272A),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    name.isNotEmpty ? name[0].toUpperCase() : 'A',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$plays plays · ${_formatDuration(ms)}',
                        style: const TextStyle(
                          color: Colors.white54,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
                if (percentage > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppColors.crimson.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '$percentage%',
                      style: const TextStyle(
                        color: AppColors.crimson,
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildTracksCard() {
    final count = _expandedTracks
        ? widget.topTracks.length.clamp(0, 10)
        : widget.topTracks.length.clamp(0, 5);

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: count,
        separatorBuilder: (_, _) => Divider(
          color: Colors.white.withValues(alpha: 0.06),
          height: 1,
          indent: 48,
        ),
        itemBuilder: (context, index) {
          final track = widget.topTracks[index] as Map<String, dynamic>;
          final title = track['trackTitle'] ?? 'Unknown Track';
          final album = track['trackAlbum'] ?? '';
          final plays = track['plays'] ?? 0;

          return InkWell(
            onTap: widget.onTrackTapped != null ? () => widget.onTrackTapped!(track) : null,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                children: [
                  SizedBox(
                    width: 24,
                    child: Text(
                      '#${index + 1}',
                      style: GoogleFonts.oswald(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: index == 0 ? AppColors.crimson : Colors.white38,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (album.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            album,
                            style: const TextStyle(
                              color: Colors.white54,
                              fontSize: 11,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                    ),
                  ),
                  Text(
                    '$plays plays',
                    style: const TextStyle(
                      color: Colors.white54,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

