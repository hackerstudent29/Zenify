import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import '../../design_system/apple/apple_kit.dart';
import '../../design_system/apple/apple_tokens.dart';
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
  @override
  bool get hideMiniPlayerWhileActive => true;

  static const _ranges = ['week', 'month', 'year', 'all'];
  static const _rangeLabels = ['Week', 'Month', 'Year', 'All Time'];

  int _viewIndex = 0; // 0 = Replay, 1 = History
  int _rangeIndex = 0;
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _insightsData;
  List<dynamic> _achievements = [];

  String get _selectedRange => _ranges[_rangeIndex];

  @override
  void initState() {
    super.initState();
    _fetchInsights();
  }

  Future<void> _fetchInsights() async {
    final auth = context.read<AuthState>();
    if (!auth.isLoggedIn) {
      if (mounted) {
        setState(() {
          _loading = false;
          _insightsData = null;
          _error = null;
        });
      }
      return;
    }

    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final token = await AuthService.instance.getAccessToken();
      if (token == null) {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error = 'Authentication required';
        });
        return;
      }

      final responses = await Future.wait([
        http.get(
          Uri.parse('${ApiService.baseUrl}/api/me/insights?range=$_selectedRange'),
          headers: {'Authorization': 'Bearer $token'},
        ),
        http.get(
          Uri.parse('${ApiService.baseUrl}/api/me/achievements'),
          headers: {'Authorization': 'Bearer $token'},
        ),
      ]);

      final insightsRes = responses[0];
      final achRes = responses[1];

      if (!mounted) return;
      if (insightsRes.statusCode == 200) {
        final data = jsonDecode(insightsRes.body) as Map<String, dynamic>;
        var ach = _achievements;
        if (achRes.statusCode == 200) {
          final achData = jsonDecode(achRes.body) as Map<String, dynamic>;
          ach = achData['achievements'] as List<dynamic>? ?? [];
        }
        setState(() {
          _insightsData = data;
          _achievements = ach;
          _loading = false;
        });
      } else {
        setState(() {
          _error = 'Unable to load your Replay stats right now.';
          _loading = false;
        });
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Check your connection and try again.';
        _loading = false;
      });
    }
  }

  List<List<double>> _parseHeatmap(dynamic raw) {
    if (raw is! List) {
      return List.generate(7, (_) => List.filled(24, 0.0));
    }
    return raw.map<List<double>>((row) {
      if (row is List) {
        return row.map<double>((v) => (v as num? ?? 0).toDouble()).toList();
      }
      return List.filled(24, 0.0);
    }).toList();
  }

  void _onPlayTrack(Map<String, dynamic> trackData) {
    final track = Track(
      id: trackData['trackId']?.toString() ?? 'top_track',
      title: trackData['trackTitle']?.toString() ?? 'Unknown Track',
      artist: trackData['artistName']?.toString() ?? 'Unknown Artist',
      album: trackData['trackAlbum']?.toString() ?? '',
      coverUrl: '',
      durationSeconds: 210,
    );

    context.read<PlayerState>().setQueue(
      [track],
      startIndex: 0,
      context: PlaybackContext(
        type: PlaybackContextType.library,
        id: 'replay_top_songs',
        tracks: [track],
        startTrack: track,
        title: 'Replay Top Songs',
      ),
    );
  }

  String _subtitleForState(bool isSignedIn) {
    if (!isSignedIn) return 'Your personal listening story in Zenify.';
    switch (_selectedRange) {
      case 'week':
        return 'Your highlights from the past 7 days.';
      case 'month':
        return 'Your highlights from the past 30 days.';
      case 'year':
        return 'Your listening story this year.';
      default:
        return 'Your all-time music footprint.';
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();

    return Scaffold(
      backgroundColor: AT.bg,
      body: SafeArea(
        bottom: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: Row(
                children: [
                  CircleIconButton(
                    icon: CupertinoIcons.chevron_left,
                    tooltip: 'Back',
                    onTap: () => Navigator.of(context).maybePop(),
                  ),
                  const Spacer(),
                  if (auth.isLoggedIn && _viewIndex == 0)
                    CircleIconButton(
                      icon: CupertinoIcons.refresh,
                      tooltip: 'Refresh Replay',
                      onTap: () {
                        HapticFeedback.selectionClick();
                        _fetchInsights();
                      },
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 6, 20, 2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Replay', style: AT.largeTitle),
                  const SizedBox(height: 4),
                  Text(
                    _subtitleForState(auth.isLoggedIn),
                    style: AT.subhead.copyWith(color: AT.label2),
                  ),
                ],
              ),
            ),
            if (auth.isLoggedIn) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: PillTabs(
                  labels: const ['Replay', 'History'],
                  index: _viewIndex,
                  onChanged: (i) {
                    HapticFeedback.selectionClick();
                    setState(() => _viewIndex = i);
                  },
                ),
              ),
              if (_viewIndex == 0)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                  child: PillTabs(
                    labels: _rangeLabels,
                    index: _rangeIndex,
                    onChanged: (i) {
                      if (i == _rangeIndex) return;
                      HapticFeedback.selectionClick();
                      setState(() => _rangeIndex = i);
                      _fetchInsights();
                    },
                  ),
                ),
            ],
            Expanded(
              child: !auth.isLoggedIn
                  ? _buildAuthPrompt()
                  : _viewIndex == 1
                      ? const HistoryView()
                      : _buildInsightsBody(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInsightsBody() {
    if (_loading) {
      return const Center(
        child: CupertinoActivityIndicator(radius: 14, color: AT.label2),
      );
    }
    if (_error != null) return _buildErrorState();
    if ((_insightsData?['totalPlays'] as int? ?? 0) == 0) {
      return _buildEmptyState();
    }

    final data = _insightsData!;
    final personality = data['musicPersonality'] as Map<String, dynamic>?;
    final totalMs = (data['totalListeningMs'] as num? ?? 0).toInt();
    final totalPlays = (data['totalPlays'] as num? ?? 0).toInt();
    final streakDays = (data['streakDays'] as num? ?? 0).toInt();
    final uniqueTracks = (data['uniqueTracks'] as num? ?? 0).toInt();
    final uniqueArtists = (data['uniqueArtists'] as num? ?? 0).toInt();
    final skipRatePct = (data['skipRatePct'] as num? ?? 0).toInt();
    final timeDeltaPct = (data['comparisons']?['time']?['deltaPct'] as num?)?.toInt();
    final playsDeltaPct = (data['comparisons']?['plays']?['deltaPct'] as num?)?.toInt();

    final heatmap = _parseHeatmap(
      data['heatmapNormalized'] ?? data['heatmapMatrix'],
    );
    final peakDay = data['peakDay'] as String?;
    final peakHour = (data['peakHour'] as num?)?.toInt();
    final heatmapInsight = data['heatmapInsight'] as String?;

    final timeline = data['timeline'] as List<dynamic>? ?? const [];
    final topArtists = data['topArtists'] as List<dynamic>? ?? const [];
    final topTracks = data['topTracks'] as List<dynamic>? ?? const [];
    final discoveriesCount = (data['discoveriesCount'] as num? ?? 0).toInt();
    final topGenres = data['topGenres'] as List<dynamic>? ?? const [];
    final topLanguages = data['topLanguages'] as List<dynamic>? ?? const [];

    return CustomScrollView(
      physics: const BouncingScrollPhysics(
        parent: AlwaysScrollableScrollPhysics(),
      ),
      slivers: [
        CupertinoSliverRefreshControl(onRefresh: _fetchInsights),
        SliverPadding(
          padding: const EdgeInsets.only(top: 6, bottom: 48),
          sliver: SliverList.list(
            children: [
              if (personality != null)
                PersonalityCard(musicPersonality: personality),
              SummaryCards(
                totalListeningMs: totalMs,
                totalPlays: totalPlays,
                streakDays: streakDays,
                uniqueTracks: uniqueTracks,
                uniqueArtists: uniqueArtists,
                skipRatePct: skipRatePct,
                timeDeltaPct: timeDeltaPct,
                playsDeltaPct: playsDeltaPct,
              ),
              ListeningHeatmap(
                heatmapNormalized: heatmap,
                peakDay: peakDay,
                peakHour: peakHour,
                heatmapInsight: heatmapInsight,
              ),
              ListeningTimeline(timeline: timeline),
              TopLists(
                topArtists: topArtists,
                topTracks: topTracks,
                onTrackTapped: _onPlayTrack,
              ),
              DiscoveriesCard(discoveriesCount: discoveriesCount),
              BreakdownChart(
                genres: topGenres,
                languages: topLanguages,
              ),
              AchievementsCard(achievements: _achievements),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildAuthPrompt() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const IconTile(
              CupertinoIcons.sparkles,
              color: AT.accent,
              size: 56,
            ),
            const SizedBox(height: 16),
            const Text('Sign In for Replay', style: AT.title2),
            const SizedBox(height: 8),
            Text(
              'Track your top artists, songs, listening rhythm, and unlocked milestones across devices.',
              style: AT.subhead.copyWith(color: AT.label2),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 22),
            PillButton(
              label: 'Sign In',
              icon: CupertinoIcons.person_crop_circle,
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => WelcomeScreen(
                      onFinished: () {
                        Navigator.of(context).pop();
                        _fetchInsights();
                      },
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const IconTile(
              CupertinoIcons.headphones,
              color: AT.accent,
              size: 56,
            ),
            const SizedBox(height: 16),
            const Text('Nothing Recorded Yet', style: AT.title2),
            const SizedBox(height: 8),
            Text(
              'Play a few songs to start building your Replay profile and daily activity.',
              style: AT.subhead.copyWith(color: AT.label2),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              CupertinoIcons.exclamationmark_circle,
              color: AT.label3,
              size: 44,
            ),
            const SizedBox(height: 12),
            Text(
              _error ?? 'Something went wrong.',
              style: AT.subhead.copyWith(color: AT.label2),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            PillButton(
              label: 'Try Again',
              style: PillStyle.tinted,
              compact: true,
              onTap: _fetchInsights,
            ),
          ],
        ),
      ),
    );
  }
}
