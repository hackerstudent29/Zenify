import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/playback_context.dart';
import '../../../models/track.dart';
import '../../../services/api_service.dart';
import '../../../services/auth_service.dart';
import '../../../services/player_state.dart';

class HistoryView extends StatefulWidget {
  const HistoryView({super.key});

  @override
  State<HistoryView> createState() => _HistoryViewState();
}

class _HistoryViewState extends State<HistoryView> {
  final TextEditingController _searchCtrl = TextEditingController();
  bool _loading = true;
  String? _error;
  List<dynamic> _sessions = [];

  @override
  void initState() {
    super.initState();
    _fetchHistory();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchHistory({String? query}) async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final token = await AuthService.instance.getAccessToken();
      if (token == null) {
        if (!mounted) return;
        setState(() {
          _error = 'Sign in to view your listening history.';
          _loading = false;
        });
        return;
      }

      final q = query ?? _searchCtrl.text.trim();
      final uri = Uri.parse(
        '${ApiService.baseUrl}/api/me/history${q.isNotEmpty ? '?search=${Uri.encodeComponent(q)}' : ''}',
      );

      final res = await http.get(
        uri,
        headers: {'Authorization': 'Bearer $token'},
      );

      if (!mounted) return;
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        setState(() {
          _sessions = data['sessions'] as List<dynamic>? ?? [];
          _loading = false;
        });
      } else {
        setState(() {
          _error = 'Could not load listening history.';
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

  Future<void> _deleteEvent(String eventId) async {
    try {
      final token = await AuthService.instance.getAccessToken();
      if (token == null) return;
      final res = await http.delete(
        Uri.parse('${ApiService.baseUrl}/api/me/history/$eventId'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200 && mounted) {
        appleToast(context, 'Removed from history');
        _fetchHistory();
      }
    } catch (_) {
      if (mounted) {
        appleToast(context, 'Could not remove entry');
      }
    }
  }

  void _replayTrack(Map<String, dynamic> event) {
    final track = Track(
      id: event['trackId']?.toString() ?? 'hist_${event['eventId']}',
      title: event['trackTitle']?.toString() ?? 'Unknown',
      artist: event['artistName']?.toString() ?? 'Unknown Artist',
      album: event['trackAlbum']?.toString() ?? '',
      coverUrl: '',
      durationSeconds: (event['trackDurationMs'] as num? ?? 210000) ~/ 1000,
    );

    context.read<PlayerState>().setQueue(
      [track],
      startIndex: 0,
      context: PlaybackContext(
        type: PlaybackContextType.history,
        id: 'listening_history',
        tracks: [track],
        startTrack: track,
        title: 'Listening History',
      ),
    );
  }

  String _formatDateLabel(String dateStr) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final parsed = DateTime.tryParse(dateStr);
    if (parsed == null) return dateStr;
    final d = DateTime(parsed.year, parsed.month, parsed.day);
    final diff = today.difference(d).inDays;
    if (diff == 0) return 'TODAY';
    if (diff == 1) return 'YESTERDAY';
    const months = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ];
    return '${months[parsed.month - 1]} ${parsed.day}';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
          child: CupertinoSearchTextField(
            controller: _searchCtrl,
            placeholder: 'Search songs or artists',
            backgroundColor: AT.fill,
            style: AT.body,
            placeholderStyle: AT.body.copyWith(color: AT.label3),
            prefixIcon: const Icon(CupertinoIcons.search, color: AT.label2, size: 18),
            onSubmitted: (v) => _fetchHistory(query: v.trim()),
            onChanged: (v) {
              if (v.isEmpty) _fetchHistory(query: '');
            },
          ),
        ),
        Expanded(child: _buildBody()),
      ],
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: CupertinoActivityIndicator(radius: 14, color: AT.label2),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                CupertinoIcons.exclamationmark_circle,
                size: 40,
                color: AT.label3,
              ),
              const SizedBox(height: 12),
              Text(
                _error!,
                style: AT.subhead.copyWith(color: AT.label2),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              PillButton(
                label: 'Retry',
                style: PillStyle.tinted,
                compact: true,
                onTap: () => _fetchHistory(),
              ),
            ],
          ),
        ),
      );
    }

    if (_sessions.isEmpty) {
      final hasQuery = _searchCtrl.text.trim().isNotEmpty;
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                hasQuery ? CupertinoIcons.search : CupertinoIcons.clock,
                size: 40,
                color: AT.label3,
              ),
              const SizedBox(height: 12),
              Text(
                hasQuery ? 'No matching plays' : 'No listening history yet',
                style: AT.title3,
              ),
              const SizedBox(height: 6),
              Text(
                hasQuery
                    ? 'Try another song title or artist name.'
                    : 'Tracks you listen to will appear here by session.',
                style: AT.subhead.copyWith(color: AT.label2),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    return CustomScrollView(
      physics: const BouncingScrollPhysics(
        parent: AlwaysScrollableScrollPhysics(),
      ),
      slivers: [
        CupertinoSliverRefreshControl(
          onRefresh: () => _fetchHistory(),
        ),
        SliverPadding(
          padding: const EdgeInsets.only(bottom: 40),
          sliver: SliverList.builder(
            itemCount: _sessions.length,
            itemBuilder: (context, idx) {
              final session = _sessions[idx] as Map<String, dynamic>? ?? const {};
              final dateStr = session['date']?.toString() ?? '';
              final durationMs = (session['durationMs'] as num? ?? 0).toInt();
              final mins = (durationMs / 60000).round();
              final events = session['events'] as List<dynamic>? ?? const [];

              return GroupedSection(
                title: '${_formatDateLabel(dateStr)} · ${mins}m',
                children: events.map((raw) {
                  final event = raw as Map<String, dynamic>? ?? const {};
                  final title = event['trackTitle']?.toString() ?? 'Unknown';
                  final artist =
                      event['artistName']?.toString() ?? 'Unknown Artist';
                  final listenedMs =
                      (event['listenedMs'] as num? ?? 0).toInt();
                  final eventId = event['eventId']?.toString() ?? '';
                  final isSkip = event['isSkip'] as bool? ?? false;

                  return AppleRow(
                    leading: IconTile(
                      isSkip
                          ? CupertinoIcons.forward_fill
                          : CupertinoIcons.music_note,
                      color: isSkip ? AT.label3 : AT.accent,
                      size: 32,
                    ),
                    title: title,
                    subtitle: artist,
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          isSkip ? 'Skipped' : '${(listenedMs / 1000).round()}s',
                          style: AT.footnote.copyWith(
                            color: AT.label3,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                        if (eventId.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          SpringPressable(
                            onTap: () => _deleteEvent(eventId),
                            child: const Padding(
                              padding: EdgeInsets.all(6),
                              child: Icon(
                                CupertinoIcons.trash,
                                size: 15,
                                color: AT.label3,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    onTap: () => _replayTrack(event),
                  );
                }).toList(),
              );
            },
          ),
        ),
      ],
    );
  }
}
