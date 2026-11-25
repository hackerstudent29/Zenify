import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show FontVariation;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/zen.dart';
import '../../features/story_sharing/story_sharing.dart';
import '../../models/track.dart';
import '../../services/lyrics_service.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';

/// Apple Music-style static "View Full Lyrics" page using [DynamicIslandHeader].
class FullLyricsScreen extends StatefulWidget {
  const FullLyricsScreen({super.key, required this.track, this.initialLyrics});

  final Track track;
  final LyricsResult? initialLyrics;

  @override
  State<FullLyricsScreen> createState() => _FullLyricsScreenState();
}

class _FullLyricsScreenState extends State<FullLyricsScreen> {
  final ScrollController _sc = ScrollController();
  LyricsResult? _lyrics;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _initLyrics();
  }

  @override
  void dispose() {
    _sc.dispose();
    super.dispose();
  }

  Future<void> _initLyrics() async {
    if (widget.initialLyrics != null && widget.initialLyrics!.isNotEmpty) {
      setState(() {
        _lyrics = widget.initialLyrics;
        _loading = false;
      });
      return;
    }

    // Check active PlayerState first
    try {
      final player = context.read<PlayerState>();
      final curId = player.currentTrack?.id.replaceFirst('yt-', '').trim();
      final targetId = widget.track.id.replaceFirst('yt-', '').trim();
      if (curId != null && curId == targetId && player.hasLyrics) {
        setState(() {
          _lyrics = LyricsResult(
            lines: player.lyricsLines,
            synced: player.lyricsSynced,
            source: 'player_cache',
          );
          _loading = false;
        });
        return;
      }
    } catch (_) {}

    final mem = LyricsService.instance.getCachedSync(widget.track.id);
    if (mem != null && mem.isNotEmpty) {
      if (mounted) {
        setState(() {
          _lyrics = mem;
          _loading = false;
        });
      }
      return;
    }

    final fetched = await LyricsService.instance.fetchLyrics(widget.track);
    if (!mounted) return;
    setState(() {
      _lyrics = fetched;
      _loading = false;
    });
  }

  void _openShareLyrics() {
    if (_lyrics == null || _lyrics!.isEmpty) return;
    HapticFeedback.lightImpact();
    Navigator.of(context).push(
      CupertinoPageRoute<void>(
        builder: (_) =>
            LyricsSelectionScreen(track: widget.track, lyrics: _lyrics),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final safeTop = mq.padding.top;
    final safeBottom = mq.padding.bottom;
    final headerTopClearance = math.max(54.0, safeTop + 4.0) + 46.0 + 18.0;

    final displayTitle = widget.track.title.trim().isNotEmpty
        ? widget.track.title.trim()
        : 'Lyrics';
    final displayArtist = MediaNormalizer.formatArtists(widget.track.artist);
    final cover = MediaNormalizer.upgradeArtworkUrl(
      widget.track.coverUrl,
      videoId: widget.track.id,
    );
    final hasLyrics = _lyrics != null && _lyrics!.isNotEmpty;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          NotificationListener<ScrollNotification>(
            // Keep the bottom dock and miniplayer stationary while scrolling View Lyrics.
            onNotification: (_) => true,
            child: CustomScrollView(
              controller: _sc,
              physics: const ClampingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              slivers: [
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(
                    24,
                    headerTopClearance,
                    24,
                    safeBottom + 180,
                  ),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      // Compact track identity header matching Apple Music screenshot
                      Row(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              width: 56,
                              height: 56,
                              color: const Color(0xFF1C1C1E),
                              child: cover.startsWith('http')
                                  ? CachedNetworkImage(
                                      imageUrl: cover,
                                      fit: BoxFit.cover,
                                      errorWidget: (_, _, _) => const Icon(
                                        CupertinoIcons.music_note,
                                        color: Colors.white54,
                                      ),
                                    )
                                  : const Icon(
                                      CupertinoIcons.music_note,
                                      color: Colors.white54,
                                    ),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  displayTitle,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontFamily: 'SF Pro Display',
                                    fontSize: 16.5,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                    letterSpacing: -0.3,
                                    height: 1.2,
                                  ),
                                ),
                                if (displayArtist.isNotEmpty) ...[
                                  const SizedBox(height: 3),
                                  Text(
                                    displayArtist,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontFamily: 'SF Pro',
                                      fontSize: 14.5,
                                      fontWeight: FontWeight.w500,
                                      color: Color(0xFFA1A1A6),
                                      letterSpacing: -0.1,
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 28),

                      if (_loading)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 80),
                          child: Center(
                            child: CupertinoActivityIndicator(radius: 13),
                          ),
                        )
                      else if (!hasLyrics)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 72),
                          child: Column(
                            children: [
                              Icon(
                                CupertinoIcons.quote_bubble,
                                size: 40,
                                color: Colors.white.withValues(alpha: 0.25),
                              ),
                              const SizedBox(height: 14),
                              Text(
                                'Lyrics Not Available',
                                style: TextStyle(
                                  fontFamily: 'SF Pro Display',
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white.withValues(alpha: 0.72),
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Full lyrics could not be found for this song.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontSize: 14,
                                  color: Colors.white.withValues(alpha: 0.45),
                                ),
                              ),
                            ],
                          ),
                        )
                      else
                        ..._buildLyricLines(_lyrics!.lines),
                    ]),
                  ),
                ),
              ],
            ),
          ),

          // Stationary top scrim so scrolled plain lyrics fade cleanly beneath the fixed header.
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: headerTopClearance + 12,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black,
                      Colors.black.withValues(alpha: 0.85),
                      Colors.transparent,
                    ],
                    stops: const [0.0, 0.55, 1.0],
                  ),
                ),
              ),
            ),
          ),

          // Stationary DynamicIslandHeader overlay (fixed title + back + share lyrics button)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandHeader(
              title: MediaNormalizer.cleanTitle(displayTitle),
              showBack: true,
              alwaysShowTitle: true,
              onBack: () => Navigator.of(context).pop(),
              trailing: Opacity(
                opacity: hasLyrics ? 1.0 : 0.35,
                child: DynamicIslandActionButton(
                  icon: CupertinoIcons.quote_bubble,
                  onTap: hasLyrics ? _openShareLyrics : () {},
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static final RegExp _lrcTagRe = RegExp(r'\[[^\]]*\]|<[^>]*>');

  static bool _isRtlLine(String s) {
    bool? firstStrong;
    var rtlCount = 0;
    var ltrCount = 0;
    for (final r in s.runes) {
      if ((r >= 0x0590 && r <= 0x08FF) || (r >= 0xFB1D && r <= 0xFEFC)) {
        firstStrong ??= true;
        rtlCount++;
      } else if ((r >= 0x41 && r <= 0x5A) ||
          (r >= 0x61 && r <= 0x7A) ||
          (r >= 0x00C0 && r <= 0x02AF) ||
          (r >= 0x0900 && r <= 0x1FFF) ||
          (r >= 0x3040 && r <= 0xD7FF)) {
        firstStrong ??= false;
        ltrCount++;
      }
    }
    if (rtlCount == 0) return false;
    if (firstStrong == true) return rtlCount * 2 >= ltrCount;
    return rtlCount > ltrCount * 2;
  }

  List<Widget> _buildLyricLines(List<Map<String, dynamic>> lines) {
    final widgets = <Widget>[];
    for (final line in lines) {
      final raw = (line['text'] ?? '').toString();
      final text = raw
          .replaceAll(_lrcTagRe, ' ')
          .replaceAll(RegExp(r'\s+'), ' ')
          .trim();
      if (text.isEmpty || text == '• • •') {
        if (widgets.isNotEmpty) {
          widgets.add(const SizedBox(height: 18));
        }
        continue;
      }
      final rtl = _isRtlLine(text);
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 28),
          child: SizedBox(
            width: double.infinity,
            child: Text(
              text,
              textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
              textAlign: rtl ? TextAlign.right : TextAlign.left,
              style: TextStyle(
                fontFamily: 'SF Pro Display',
                fontSize: 22.5,
                fontWeight: FontWeight.w800,
                fontVariations: const [FontVariation('wght', 780)],
                color: Colors.white,
                height: 1.38,
                letterSpacing: rtl ? 0.0 : 0.55,
              ),
            ),
          ),
        ),
      );
    }
    return widgets;
  }
}
