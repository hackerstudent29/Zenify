import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/apple_glass.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/zen.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../services/auth_state.dart';
import '../../services/dock_visibility.dart';
import '../../services/player_state.dart';
import '../auth/welcome_screen.dart';
import 'widgets/achievements_card.dart';
import 'widgets/breakdown_chart.dart';
import 'widgets/discoveries_card.dart';
import 'widgets/history_view.dart';
import 'widgets/listening_heatmap.dart';
import 'widgets/listening_timeline.dart';
import 'widgets/personality_card.dart';
import 'widgets/summary_cards.dart';
import 'widgets/top_lists.dart';

class InsightsScreen extends StatefulWidget {
  const InsightsScreen({super.key});

  @override
  State<InsightsScreen> createState() => _InsightsScreenState();
}

class _InsightsScreenState extends State<InsightsScreen> with HideDocksMixin {
  String _selectedView = 'insights'; // 'insights' | 'history'
  String _selectedRange = 'all'; // week, month, year, all
  bool _isLoading = true;
  String? _error;
  Map<String, dynamic>? _insightsData;
  List<dynamic> _achievements = [];

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
        });
      }
      return;
    }

    try {
      final results = await Future.wait([
        http.get(
          Uri.parse('${ApiService.baseUrl}/api/me/insights?range=$_selectedRange'),
          headers: {
            'Authorization': 'Bearer $token',
            'Accept': 'application/json',
          },
        ).timeout(const Duration(seconds: 10)),
        http.get(
          Uri.parse('${ApiService.baseUrl}/api/me/achievements'),
          headers: {
            'Authorization': 'Bearer $token',
            'Accept': 'application/json',
          },
        ).timeout(const Duration(seconds: 10)).catchError((_) => http.Response('[]', 200)),
      ]);

      if (!mounted) return;

      final resInsights = results[0];
      final resAchievements = results[1];

      if (resInsights.statusCode == 200) {
        final data = jsonDecode(resInsights.body) as Map<String, dynamic>;
        List<dynamic> achList = [];
        if (resAchievements.statusCode == 200) {
          try {
            achList = jsonDecode(resAchievements.body) as List<dynamic>? ?? [];
          } catch (_) {}
        }
        setState(() {
          _insightsData = data;
          _achievements = achList;
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

  void _onPlayTrack(Map<String, dynamic> trackData) {
    final track = Track(
      id: trackData['trackId'] ?? 'top_track',
      title: trackData['trackTitle'] ?? 'Unknown Track',
      artist: trackData['artistName'] ?? 'Unknown Artist',
      album: trackData['trackAlbum'] ?? '',
      coverUrl: '',
      durationSeconds: 210,
    );

    context.read<PlayerState>().setQueue(
      [track],
      startIndex: 0,
      context: PlaybackContext(
        type: PlaybackContextType.library,
        id: 'insights_top',
        tracks: [track],
        startTrack: track,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final topInset = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: Zen.bg,
      body: Stack(
        children: [
          CustomScrollView(
            physics: const BouncingScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(child: SizedBox(height: topInset + 56)),

              // Auth Guard Check
              if (!auth.isLoggedIn)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _buildAuthPrompt(context),
                )
              else ...[
                // View Mode Selector: Insights vs History
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 10),
                child: CupertinoSlidingSegmentedControl<String>(
                  groupValue: _selectedView,
                  backgroundColor: const Color(0xFF1E1E22),
                  thumbColor: AppColors.crimson,
                  padding: const EdgeInsets.all(4),
                  children: {
                    'insights': _buildSegmentText('Replay & Insights', _selectedView == 'insights'),
                    'history': _buildSegmentText('Listening History', _selectedView == 'history'),
                  },
                  onValueChanged: (val) {
                    if (val != null) {
                      HapticFeedback.selectionClick();
                      setState(() => _selectedView = val);
                    }
                  },
                ),
              ),
            ),

            if (_selectedView == 'history')
              const SliverToBoxAdapter(
                child: HistoryView(),
              )
            else ...[
              // Range Selector Segmented Control
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                  child: CupertinoSlidingSegmentedControl<String>(
                    groupValue: _selectedRange,
                    backgroundColor: const Color(0xFF18181B),
                    thumbColor: Colors.white12,
                    padding: const EdgeInsets.all(3),
                    children: {
                      'week': _buildRangeText('Week', _selectedRange == 'week'),
                      'month': _buildRangeText('Month', _selectedRange == 'month'),
                      'year': _buildRangeText('Year', _selectedRange == 'year'),
                      'all': _buildRangeText('All Time', _selectedRange == 'all'),
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
                        PersonalityCard(
                          musicPersonality: _insightsData?['musicPersonality'] as Map<String, dynamic>? ?? {},
                        ),
                        const SizedBox(height: 20),

                        // Key Stats Grid (Summary Cards)
                        SummaryCards(
                          totalListeningMs: _insightsData?['totalListeningMs'] as int? ?? 0,
                          totalPlays: _insightsData?['totalPlays'] as int? ?? 0,
                          streakDays: _insightsData?['streakDays'] as int? ?? 0,
                          uniqueTracks: _insightsData?['uniqueTracks'] as int? ?? 0,
                          uniqueArtists: _insightsData?['uniqueArtists'] as int? ?? 0,
                          skipRatePct: _insightsData?['skipRatePct'] as int? ?? 0,
                          timeDeltaPct: _insightsData?['comparisons']?['time']?['deltaPct'],
                          playsDeltaPct: _insightsData?['comparisons']?['plays']?['deltaPct'],
                        ),
                        const SizedBox(height: 20),

                        // Listening Heatmap
                        ListeningHeatmap(
                          heatmapNormalized: _parseHeatmap(
                            _insightsData?['heatmapNormalized'] ?? _insightsData?['timeOfDayHeatmap'],
                          ),
                          peakDay: _insightsData?['peakDay'] as String?,
                          peakHour: _insightsData?['peakHour'] as int?,
                          heatmapInsight: _insightsData?['heatmapInsight'] as String?,
                        ),
                        const SizedBox(height: 20),

                        // Listening Activity Timeline
                        ListeningTimeline(
                          timeline: _insightsData?['timeline'] as List<dynamic>? ?? [],
                        ),
                        const SizedBox(height: 20),

                        // Top Artists & Songs Lists
                        TopLists(
                          topArtists: _insightsData?['topArtists'] as List<dynamic>? ?? [],
                          topTracks: _insightsData?['topTracks'] as List<dynamic>? ?? [],
                          onTrackTapped: _onPlayTrack,
                        ),
                        const SizedBox(height: 20),

                        // New Discoveries Card
                        DiscoveriesCard(
                          discoveriesCount: _insightsData?['discoveriesCount'] as int? ?? 0,
                        ),
                        const SizedBox(height: 20),

                        // Top Genres & Languages
                        BreakdownChart(
                          genres: _insightsData?['topGenres'] as List<dynamic>? ?? [],
                          languages: _insightsData?['topLanguages'] as List<dynamic>? ?? [],
                        ),
                        const SizedBox(height: 20),

                        // Achievements Card
                        AchievementsCard(
                          achievements: _achievements,
                        ),
                        const SizedBox(height: 48),
                      ],
                    ),
                  ),
                ),
            ],
          ],
        ],
      ),

      // Floating Dynamic Island Header
      Positioned(
        top: 0,
        left: 0,
        right: 0,
        child: DynamicIslandHeader(
          title: 'Insights & Replay',
          showBack: true,
          onBack: () => Navigator.of(context).pop(),
          showProfile: false,
          topPadding: topInset + 4,
          trailing: auth.isLoggedIn
              ? PressableScale(
                  scale: 0.88,
                  onTap: _fetchInsights,
                  child: AppleGlass(
                    borderRadius: BorderRadius.circular(22),
                    tint: const Color(0x26121216),
                    child: const SizedBox(
                      width: 44,
                      height: 44,
                      child: Center(
                        child: Icon(Icons.refresh_rounded, color: Colors.white, size: 20),
                      ),
                    ),
                  ),
                )
              : null,
        ),
      ),
    ],
  ),
);
  }

  List<List<int>> _parseHeatmap(dynamic raw) {
    if (raw is! List) return [];
    final List<List<int>> out = [];
    for (final row in raw) {
      if (row is List) {
        out.add(row.map((e) => (e as num).toInt()).toList());
      }
    }
    return out;
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

  Widget _buildRangeText(String text, bool isSelected) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5, horizontal: 8),
      child: Text(
        text,
        style: TextStyle(
          color: isSelected ? Colors.white : Colors.white54,
          fontSize: 11,
          fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
        ),
      ),
    );
  }

  Widget _buildAuthPrompt(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppColors.crimson.withValues(alpha: 0.15),
                shape: BoxShape.circle,
                border: Border.all(color: AppColors.crimson.withValues(alpha: 0.35)),
              ),
              alignment: Alignment.center,
              child: const Icon(Icons.insights_rounded, color: AppColors.crimson, size: 40),
            ),
            const SizedBox(height: 24),
            Text(
              'YOUR PERSONAL REPLAY & INSIGHTS',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: 'SF Pro Display',
                fontSize: 22,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Sign in to Zenify to analyze your music habits, view your 24x7 local listening heatmap, discover your music persona, and sync your replay stats across all devices.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white70,
                fontSize: 13,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 28),
            PressableScale(
              scale: 0.95,
              onTap: () {
                HapticFeedback.lightImpact();
                Navigator.of(context).push(
                  ZenPageRoute(
                    builder: (_) => WelcomeScreen(
                      onFinished: () {
                        Navigator.of(context).pop();
                        _fetchInsights();
                      },
                    ),
                  ),
                );
              },
              child: Container(
                height: 44,
                padding: const EdgeInsets.symmetric(horizontal: 24),
                decoration: BoxDecoration(
                  color: const Color(0xFF18181B),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.login_rounded, color: AppColors.crimson, size: 18),
                    const SizedBox(width: 10),
                    Text(
                      'SIGN IN / CREATE ACCOUNT',
                      style: const TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.0,
                        color: AppColors.crimson,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
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
              style: const TextStyle(
                fontFamily: 'SF Pro Display',
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: Colors.white,
                letterSpacing: -0.3,
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
