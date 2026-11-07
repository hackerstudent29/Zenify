import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/zen.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';

class InsightsScreen extends StatefulWidget {
  const InsightsScreen({super.key});

  @override
  State<InsightsScreen> createState() => _InsightsScreenState();
}

class _InsightsScreenState extends State<InsightsScreen> {
  String _selectedRange = 'all'; // week, month, year, all
  bool _isLoading = true;
  String? _error;
  Map<String, dynamic>? _insightsData;

  @override
  void initState() {
    super.initState();
    _fetchInsights();
  }

  Future<void> _fetchInsights() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    final token = await AuthService.instance.getAccessToken();
    if (token == null) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _error = 'Please sign in to view your listening insights.';
        });
      }
      return;
    }

    try {
      final res = await http.get(
        Uri.parse('${ApiService.baseUrl}/api/me/insights?range=$_selectedRange'),
        headers: {
          'Authorization': 'Bearer $token',
          'Accept': 'application/json',
        },
      ).timeout(const Duration(seconds: 10));

      if (!mounted) return;

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        setState(() {
          _insightsData = data;
          _isLoading = false;
        });
      } else {
        setState(() {
          _error = 'Failed to load insights. Please try again.';
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Network error. Please check your connection.';
          _isLoading = false;
        });
      }
    }
  }

  void _onRangeChanged(String newRange) {
    if (_selectedRange == newRange) return;
    HapticFeedback.selectionClick();
    setState(() => _selectedRange = newRange);
    _fetchInsights();
  }

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
    return Scaffold(
      backgroundColor: Zen.bg,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // Apple Music Replay style App Bar
          SliverAppBar(
            pinned: true,
            backgroundColor: Zen.bg.withValues(alpha: 0.88),
            elevation: 0,
            leading: IconButton(
              icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
              onPressed: () => Navigator.of(context).pop(),
            ),
            title: Text(
              'INSIGHTS & REPLAY',
              style: GoogleFonts.oswald(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.2,
                color: Colors.white,
              ),
            ),
            centerTitle: true,
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh_rounded, color: Colors.white70, size: 20),
                onPressed: _fetchInsights,
              ),
            ],
          ),

          // Range Selector Segmented Control
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
              child: CupertinoSlidingSegmentedControl<String>(
                groupValue: _selectedRange,
                backgroundColor: const Color(0xFF1E1E22),
                thumbColor: AppColors.crimson,
                padding: const EdgeInsets.all(4),
                children: {
                  'week': _buildSegmentText('Week', _selectedRange == 'week'),
                  'month': _buildSegmentText('Month', _selectedRange == 'month'),
                  'year': _buildSegmentText('Year', _selectedRange == 'year'),
                  'all': _buildSegmentText('All Time', _selectedRange == 'all'),
                },
                onValueChanged: (val) {
                  if (val != null) _onRangeChanged(val);
                },
              ),
            ),
          ),

          // Body Content
          if (_isLoading)
            const SliverFillRemaining(
              child: Center(
                child: CupertinoActivityIndicator(color: AppColors.crimson, radius: 14),
              ),
            )
          else if (_error != null)
            SliverFillRemaining(
              child: _buildErrorState(),
            )
          else if ((_insightsData?['totalPlays'] as int? ?? 0) == 0)
            SliverFillRemaining(
              child: _buildEmptyState(),
            )
          else
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Persona & Music Personality Card
                    _buildPersonalityCard(),
                    const SizedBox(height: 20),

                    // Key Stats Grid
                    _buildStatsGrid(),
                    const SizedBox(height: 24),

                    // 24x7 Heatmap Section
                    _buildHeatmapSection(),
                    const SizedBox(height: 24),

                    // Top Artists Section
                    _buildTopArtistsSection(),
                    const SizedBox(height: 24),

                    // Top Tracks Section
                    _buildTopTracksSection(),
                    const SizedBox(height: 24),

                    // Top Genres & Languages Section
                    _buildGenresAndLanguagesSection(),
                    const SizedBox(height: 48),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSegmentText(String text, bool isSelected) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 8),
      child: Text(
        text,
        style: TextStyle(
          color: isSelected ? Colors.white : Colors.white60,
          fontSize: 12,
          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
        ),
      ),
    );
  }

  Widget _buildPersonalityCard() {
    final personality = _insightsData?['musicPersonality'] as Map<String, dynamic>? ?? {};
    final title = personality['title'] ?? 'Eclectic Harmonizer';
    final subtitle = personality['subtitle'] ?? 'Traversing diverse musical vibrations.';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.crimson.withValues(alpha: 0.25),
            const Color(0xFF18181B),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.crimson.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.crimson.withValues(alpha: 0.20),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.crimson.withValues(alpha: 0.40)),
                ),
                child: Text(
                  'YOUR MUSIC PERSONA',
                  style: GoogleFonts.oswald(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.0,
                    color: AppColors.crimson,
                  ),
                ),
              ),
              const Icon(Icons.auto_awesome_rounded, color: AppColors.crimson, size: 18),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            title,
            style: GoogleFonts.oswald(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: const TextStyle(
              fontSize: 13,
              color: Colors.white70,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsGrid() {
    final totalListeningMs = _insightsData?['totalListeningMs'] as int? ?? 0;
    final totalPlays = _insightsData?['totalPlays'] as int? ?? 0;
    final streakDays = _insightsData?['streakDays'] as int? ?? 0;

    return Row(
      children: [
        Expanded(
          child: _buildStatTile(
            label: 'TIME PLAYED',
            value: _formatDuration(totalListeningMs),
            icon: Icons.timer_outlined,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatTile(
            label: 'TOTAL PLAYS',
            value: '$totalPlays',
            icon: Icons.play_circle_outline_rounded,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _buildStatTile(
            label: 'STREAK',
            value: streakDays > 0 ? '$streakDays Days' : '1 Day',
            icon: Icons.local_fire_department_rounded,
            iconColor: Colors.amberAccent,
          ),
        ),
      ],
    );
  }

  Widget _buildStatTile({
    required String label,
    required String value,
    required IconData icon,
    Color? iconColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: iconColor ?? AppColors.crimson, size: 20),
          const SizedBox(height: 10),
          Text(
            value,
            style: GoogleFonts.oswald(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              color: Colors.white38,
              letterSpacing: 0.8,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeatmapSection() {
    final rawHeatmap = _insightsData?['timeOfDayHeatmap'] as List<dynamic>? ?? [];
    final List<List<int>> heatmap = [];
    for (final row in rawHeatmap) {
      if (row is List) {
        heatmap.add(row.map((e) => (e as num).toInt()).toList());
      }
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'LISTENING HEATMAP (24 × 7)',
                style: GoogleFonts.oswald(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8,
                  color: Colors.white,
                ),
              ),
              const Text(
                'Local Time',
                style: TextStyle(fontSize: 10, color: Colors.white38),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 120,
            child: CustomPaint(
              size: const Size(double.infinity, 120),
              painter: _HeatmapPainter(heatmap: heatmap),
            ),
          ),
          const SizedBox(height: 10),
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('12 AM', style: TextStyle(fontSize: 9, color: Colors.white38)),
              Text('6 AM', style: TextStyle(fontSize: 9, color: Colors.white38)),
              Text('12 PM', style: TextStyle(fontSize: 9, color: Colors.white38)),
              Text('6 PM', style: TextStyle(fontSize: 9, color: Colors.white38)),
              Text('11 PM', style: TextStyle(fontSize: 9, color: Colors.white38)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTopArtistsSection() {
    final artists = _insightsData?['topArtists'] as List<dynamic>? ?? [];
    if (artists.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'TOP ARTISTS',
          style: GoogleFonts.oswald(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF18181B),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: artists.length.clamp(0, 5),
            separatorBuilder: (_, __) => Divider(
              color: Colors.white.withValues(alpha: 0.06),
              height: 1,
              indent: 64,
            ),
            itemBuilder: (context, index) {
              final art = artists[index] as Map<String, dynamic>;
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
        ),
      ],
    );
  }

  Widget _buildTopTracksSection() {
    final tracks = _insightsData?['topTracks'] as List<dynamic>? ?? [];
    if (tracks.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'TOP SONGS',
          style: GoogleFonts.oswald(
            fontSize: 15,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
            color: Colors.white,
          ),
        ),
        const SizedBox(height: 12),
        Container(
          decoration: BoxDecoration(
            color: const Color(0xFF18181B),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
          ),
          child: ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: tracks.length.clamp(0, 5),
            separatorBuilder: (_, __) => Divider(
              color: Colors.white.withValues(alpha: 0.06),
              height: 1,
              indent: 48,
            ),
            itemBuilder: (context, index) {
              final track = tracks[index] as Map<String, dynamic>;
              final title = track['trackTitle'] ?? 'Unknown Track';
              final album = track['trackAlbum'] ?? '';
              final plays = track['plays'] ?? 0;

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
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildGenresAndLanguagesSection() {
    final genres = _insightsData?['topGenres'] as List<dynamic>? ?? [];
    final languages = _insightsData?['topLanguages'] as List<dynamic>? ?? [];
    if (genres.isEmpty && languages.isEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'GENRES & TASTES',
            style: GoogleFonts.oswald(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final g in genres)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF27272A),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                  ),
                  child: Text(
                    '${g['genre']} (${g['count']})',
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              for (final l in languages)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.crimson.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.crimson.withValues(alpha: 0.25)),
                  ),
                  child: Text(
                    '${l['language'].toString().toUpperCase()} (${l['count']})',
                    style: const TextStyle(
                      color: AppColors.crimson,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: AppColors.crimson.withValues(alpha: 0.15),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: const Icon(Icons.music_note_rounded, color: AppColors.crimson, size: 36),
            ),
            const SizedBox(height: 20),
            Text(
              'No Listening History Yet',
              style: GoogleFonts.oswald(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Start playing your favorite tracks and check back here to see your personal Replay and habits.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white54,
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline_rounded, color: Colors.white38, size: 48),
            const SizedBox(height: 16),
            Text(
              _error ?? 'Unable to load insights',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70, fontSize: 14),
            ),
            const SizedBox(height: 20),
            PressableScale(
              onTap: _fetchInsights,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.crimson,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Text(
                  'Retry',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeatmapPainter extends CustomPainter {
  _HeatmapPainter({required this.heatmap});

  final List<List<int>> heatmap;

  @override
  void paint(Canvas canvas, Size size) {
    if (heatmap.isEmpty) return;

    final days = heatmap.length; // 7
    final hours = heatmap[0].length; // 24

    final cellWidth = (size.width - (hours - 1) * 3) / hours;
    final cellHeight = (size.height - (days - 1) * 3) / days;

    int maxVal = 1;
    for (int d = 0; d < days; d++) {
      for (int h = 0; h < hours; h++) {
        if (heatmap[d][h] > maxVal) maxVal = heatmap[d][h];
      }
    }

    final basePaint = Paint()..style = PaintingStyle.fill;

    for (int d = 0; d < days; d++) {
      for (int h = 0; h < hours; h++) {
        final val = heatmap[d][h];
        final intensity = (val / maxVal).clamp(0.0, 1.0);

        final x = h * (cellWidth + 3);
        final y = d * (cellHeight + 3);
        final rect = RRect.fromRectAndRadius(
          Rect.fromLTWH(x, y, cellWidth, cellHeight),
          const Radius.circular(3),
        );

        if (intensity == 0) {
          basePaint.color = const Color(0xFF242428);
        } else {
          basePaint.color = AppColors.crimson.withValues(
            alpha: (0.25 + 0.75 * intensity).clamp(0.0, 1.0),
          );
        }

        canvas.drawRRect(rect, basePaint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _HeatmapPainter oldDelegate) {
    return oldDelegate.heatmap != heatmap;
  }
}
