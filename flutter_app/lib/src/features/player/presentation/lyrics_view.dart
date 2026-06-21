import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:audio_service/audio_service.dart';
import '../../../core/api/api_client.dart';
import '../../../shared/providers/audio_provider.dart';
import 'dart:async';

class LyricLine {
  final double time; // in seconds
  final String text;
  final bool isInterlude;
  final bool isUnsynced;

  LyricLine({
    required this.time,
    required this.text,
    this.isInterlude = false,
    this.isUnsynced = false,
  });

  factory LyricLine.fromJson(Map<String, dynamic> json) {
    return LyricLine(
      time: double.tryParse(json['time'].toString()) ?? 0.0,
      text: json['text']?.toString() ?? '',
    );
  }
}

class LyricsView extends ConsumerStatefulWidget {
  final String trackId;
  final String title;
  final String artist;
  final String? rawLyrics;

  const LyricsView({
    super.key,
    required this.trackId,
    required this.title,
    required this.artist,
    this.rawLyrics,
  });

  @override
  ConsumerState<LyricsView> createState() => _LyricsViewState();
}

class _LyricsViewState extends ConsumerState<LyricsView> {
  List<LyricLine> _lines = [];
  bool _isLoading = true;
  int _activeIndex = -1;
  final ScrollController _scrollController = ScrollController();
  final List<GlobalKey> _keys = [];
  StreamSubscription? _positionSub;

  @override
  void initState() {
    super.initState();
    _fetchLyrics();
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _fetchLyrics() async {
    if (!mounted) return;
    setState(() {
      _isLoading = true;
    });

    try {
      final requestData = <String, dynamic>{
        'trackId': widget.trackId,
        'title': widget.title,
        'artist': widget.artist,
      };
      if (widget.rawLyrics != null) {
        requestData['rawLyrics'] = widget.rawLyrics;
      }
      final response = await apiClient.post('metadata/sync-lyrics', data: requestData);

      if (response.statusCode == 200 && response.data != null) {
        final List<dynamic> tokens = response.data['syncedTokens'] ?? [];
        _lines = tokens.map((json) => LyricLine.fromJson(json)).toList();
      }
    } catch (e) {
      print('Error fetching synced lyrics: $e');
    }

    // Fallback if no synced lyrics
    if (_lines.isEmpty && widget.rawLyrics != null && widget.rawLyrics!.trim().isNotEmpty) {
      _lines = widget.rawLyrics!
          .split('\n')
          .map((line) => line.trim())
          .where((line) => line.isNotEmpty)
          .map((line) => LyricLine(time: -9999.0, text: line, isUnsynced: true))
          .toList();
    }

    // Generate keys
    _keys.clear();
    for (int i = 0; i < _lines.length; i++) {
      _keys.add(GlobalKey());
    }

    if (!mounted) return;
    setState(() {
      _isLoading = false;
    });

    // Start position listener if synced
    if (_lines.isNotEmpty && !_lines.first.isUnsynced) {
      _positionSub = AudioService.position.listen((pos) {
        if (!mounted) return;
        final posSeconds = pos.inMilliseconds / 1000.0;
        int newIndex = -1;
        for (int i = 0; i < _lines.length; i++) {
          if (posSeconds >= _lines[i].time) {
            newIndex = i;
          } else {
            break;
          }
        }

        if (newIndex != _activeIndex) {
          setState(() {
            _activeIndex = newIndex;
          });
          _scrollToActive();
        }
      });
    }
  }

  void _scrollToActive() {
    if (_activeIndex < 0 || _activeIndex >= _keys.length) return;
    final key = _keys[_activeIndex];
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final context = key.currentContext;
      if (context != null) {
        Scrollable.ensureVisible(
          context,
          alignment: 0.35,
          duration: const Duration(milliseconds: 600),
          curve: Curves.easeOutCubic,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFFE11D48)));
    }

    if (_lines.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.symmetric(horizontal: 40.0),
          child: Text(
            'Lyrics not available for this song.',
            style: TextStyle(color: Colors.white54, fontSize: 16, fontWeight: FontWeight.w600),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    return ShaderMask(
      shaderCallback: (rect) {
        return const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.transparent,
            Colors.black,
            Colors.black,
            Colors.transparent
          ],
          stops: [0.0, 0.15, 0.85, 1.0],
        ).createShader(rect);
      },
      blendMode: BlendMode.dstIn,
      child: ListView.builder(
        controller: _scrollController,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 120),
        itemCount: _lines.length,
        itemBuilder: (context, index) {
          final line = _lines[index];
          final isActive = index == _activeIndex;
          
          return AnimatedOpacity(
            duration: const Duration(milliseconds: 300),
            opacity: isActive ? 1.0 : 0.3,
            child: Container(
              key: _keys[index],
              padding: const EdgeInsets.symmetric(vertical: 12),
              alignment: Alignment.center,
              child: Text(
                line.text,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: isActive ? 24 : 20,
                  fontWeight: FontWeight.bold,
                  height: 1.4,
                  shadows: isActive ? [
                    Shadow(
                      color: Colors.black.withOpacity(0.5),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    )
                  ] : null,
                ),
                textAlign: TextAlign.center,
              ),
            ),
          );
        },
      ),
    );
  }
}
