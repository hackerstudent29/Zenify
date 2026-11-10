import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import '../../../design_system/tokens/app_colors.dart';
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
  List<dynamic> _sessions = [];
  bool _isLoading = true;
  String? _error;

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
      _isLoading = true;
      _error = null;
    });

    final token = await AuthService.instance.getAccessToken();
    if (token == null) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _error = 'Please sign in to view your history.';
        });
      }
      return;
    }

    try {
      final q = query ?? _searchCtrl.text.trim();
      final uri = Uri.parse(
        '${ApiService.baseUrl}/api/me/history${q.isNotEmpty ? '?search=${Uri.encodeComponent(q)}' : ''}',
      );
      final res = await http.get(
        uri,
        headers: {
          'Authorization': 'Bearer $token',
          'Accept': 'application/json',
        },
      ).timeout(const Duration(seconds: 10));

      if (!mounted) return;

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        setState(() {
          _sessions = data['sessions'] as List<dynamic>? ?? [];
          _isLoading = false;
        });
      } else {
        setState(() {
          _error = 'Failed to load history.';
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'Network error loading history.';
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _deleteEvent(String eventId) async {
    final token = await AuthService.instance.getAccessToken();
    if (token == null) return;

    try {
      await http.delete(
        Uri.parse('${ApiService.baseUrl}/api/me/history/$eventId'),
        headers: {
          'Authorization': 'Bearer $token',
          'Accept': 'application/json',
        },
      );
      _fetchHistory();
    } catch (_) {}
  }

  void _replayTrack(dynamic event) {
    final track = Track(
      id: event['trackId'] ?? 'hist_${event['eventId']}',
      title: event['trackTitle'] ?? 'Unknown',
      artist: event['artistName'] ?? 'Unknown Artist',
      album: event['trackAlbum'] ?? '',
      coverUrl: '',
      durationSeconds: ((event['trackDurationMs'] as num? ?? 210000) ~/ 1000),
    );

    if (!mounted) return;
    context.read<PlayerState>().setQueue(
      [track],
      startIndex: 0,
      context: PlaybackContext(
        type: PlaybackContextType.history,
        id: 'history',
        tracks: [track],
        startTrack: track,
      ),
    );
  }

  String _formatDuration(int ms) {
    if (ms <= 0) return '0 min';
    final totalSec = ms ~/ 1000;
    final minutes = totalSec ~/ 60;
    final seconds = totalSec % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Search & Filter Bar
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          child: CupertinoSearchTextField(
            controller: _searchCtrl,
            placeholder: 'Search history by song or album...',
            style: const TextStyle(color: Colors.white, fontSize: 13),
            placeholderStyle: const TextStyle(color: Colors.white38, fontSize: 13),
            backgroundColor: const Color(0xFF1E1E22),
            onSubmitted: (val) => _fetchHistory(query: val),
            onSuffixTap: () {
              _searchCtrl.clear();
              _fetchHistory(query: '');
            },
          ),
        ),

        // Session list
        if (_isLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(
              child: CupertinoActivityIndicator(color: AppColors.crimson, radius: 12),
            ),
          )
        else if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 40),
            child: Center(
              child: Text(_error!, style: const TextStyle(color: Colors.white54, fontSize: 13)),
            ),
          )
        else if (_sessions.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(
              child: Text('No listening sessions found.', style: TextStyle(color: Colors.white54, fontSize: 13)),
            ),
          )
        else
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
            itemCount: _sessions.length,
            itemBuilder: (context, sIdx) {
              final session = _sessions[sIdx] as Map<String, dynamic>;
              final dateStr = session['date'] ?? '';
              final durationMs = session['durationMs'] as num? ?? 0;
              final sessionMinutes = durationMs ~/ 60000;
              final events = session['events'] as List<dynamic>? ?? [];

              return Container(
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: const Color(0xFF18181B),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Session Header
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            dateStr.toUpperCase(),
                            style: GoogleFonts.oswald(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.6,
                              color: AppColors.crimson,
                            ),
                          ),
                          Text(
                            '${events.length} tracks · ${sessionMinutes}m',
                            style: const TextStyle(fontSize: 11, color: Colors.white38),
                          ),
                        ],
                      ),
                    ),
                    const Divider(color: Colors.white10, height: 1),

                    // Events in session
                    for (int eIdx = 0; eIdx < events.length; eIdx++) ...[
                      if (eIdx > 0)
                        Divider(
                          color: Colors.white.withValues(alpha: 0.05),
                          height: 1,
                          indent: 16,
                        ),
                      _buildEventRow(events[eIdx]),
                    ],
                  ],
                ),
              );
            },
          ),
      ],
    );
  }

  Widget _buildEventRow(dynamic event) {
    final title = event['trackTitle'] ?? 'Unknown';
    final artist = event['artistName'] ?? 'Unknown Artist';
    final album = event['trackAlbum'] ?? '';
    final listenedMs = (event['listenedMs'] as num? ?? 0).toInt();
    final eventId = event['eventId'] as String? ?? '';
    final isSkip = event['isSkip'] as bool? ?? false;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: () => _replayTrack(event),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13.5,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (isSkip) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                          decoration: BoxDecoration(
                            color: Colors.white12,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            'SKIPPED',
                            style: TextStyle(fontSize: 8, color: Colors.white38, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '$artist${album.isNotEmpty ? ' · $album' : ''}',
                    style: const TextStyle(color: Colors.white54, fontSize: 11),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            _formatDuration(listenedMs),
            style: const TextStyle(color: Colors.white38, fontSize: 11),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: () => _deleteEvent(eventId),
            child: const Icon(Icons.close_rounded, color: Colors.white24, size: 16),
          ),
        ],
      ),
    );
  }
}

