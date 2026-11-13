import 'dart:math' as math;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../design_system/apple/apple_kit.dart';
import '../../../models/track.dart';
import '../../../services/lyrics_service.dart';
import '../models/story_share_content.dart';
import 'story_preview_screen.dart';

/// Dedicated full-screen interface to select 1 to 3 consecutive lyric lines for Story export.
class LyricsSelectionScreen extends StatefulWidget {
  const LyricsSelectionScreen({
    super.key,
    required this.track,
    required this.lyrics,
  });

  final Track track;
  final LyricsResult? lyrics;

  @override
  State<LyricsSelectionScreen> createState() => _LyricsSelectionScreenState();
}

class _LyricsSelectionScreenState extends State<LyricsSelectionScreen> {
  final Set<int> _selectedIndices = {};
  late final List<String> _lyricLines;

  @override
  void initState() {
    super.initState();
    _lyricLines = _extractLines(widget.lyrics);
  }

  List<String> _extractLines(LyricsResult? result) {
    if (result == null || result.lines.isEmpty) return const [];
    final List<String> out = [];
    for (final line in result.lines) {
      final t = (line['text']?.toString() ?? '').trim();
      if (t.isNotEmpty) out.add(t);
    }
    return out;
  }

  void _onLineTapped(int index) {
    if (_lyricLines.isEmpty) return;

    if (_selectedIndices.contains(index)) {
      // Deselect logic
      HapticFeedback.selectionClick();
      setState(() {
        if (_selectedIndices.length == 1) {
          _selectedIndices.clear();
        } else {
          final sorted = _selectedIndices.toList()..sort();
          if (index == sorted.first || index == sorted.last) {
            _selectedIndices.remove(index);
          } else {
            // Tapping middle line resets selection to just that line
            _selectedIndices.clear();
            _selectedIndices.add(index);
          }
        }
      });
      return;
    }

    if (_selectedIndices.isEmpty) {
      HapticFeedback.selectionClick();
      setState(() => _selectedIndices.add(index));
      return;
    }

    final sorted = _selectedIndices.toList()..sort();
    final minIdx = sorted.first;
    final maxIdx = sorted.last;

    // Check if adjacent / consecutive
    final isConsecutive = (index == minIdx - 1) || (index == maxIdx + 1);

    if (isConsecutive) {
      if (_selectedIndices.length >= 3) {
        // Enforce maximum 3 lines with apple toast and feedback
        HapticFeedback.heavyImpact();
        appleToast(context, 'Select up to 3 lines');
        return;
      }
      HapticFeedback.selectionClick();
      setState(() => _selectedIndices.add(index));
    } else {
      // Non-consecutive line resets selection to just this line
      HapticFeedback.selectionClick();
      setState(() {
        _selectedIndices.clear();
        _selectedIndices.add(index);
      });
    }
  }

  void _proceedToPreview() {
    if (_selectedIndices.isEmpty) return;
    HapticFeedback.mediumImpact();

    final sorted = _selectedIndices.toList()..sort();
    final selectedTexts = [for (final i in sorted) _lyricLines[i]];

    final content = LyricsStoryContent(
      track: widget.track,
      selectedLines: selectedTexts,
    );

    Navigator.of(context).pushReplacement(
      CupertinoPageRoute(
        builder: (_) => StoryPreviewScreen(content: content),
      ),
    );
  }

  void _shareSongInstead() {
    Navigator.of(context).pushReplacement(
      CupertinoPageRoute(
        builder: (_) => StoryPreviewScreen(
          content: SongStoryContent(track: widget.track),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final safeTop = MediaQuery.paddingOf(context).top;
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    final hasSelection = _selectedIndices.isNotEmpty;

    return Scaffold(
      backgroundColor: const Color(0xFF121214), // Universal dark neutral
      body: SafeArea(
        top: false,
        bottom: false,
        child: Column(
          children: [
            // ── Top Bar ──
            Padding(
              padding: EdgeInsets.fromLTRB(16, safeTop + 10, 16, 12),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: const ShapeDecoration(
                        shape: CircleBorder(),
                        color: Color(0x1FFFFFFF),
                      ),
                      child: const Icon(CupertinoIcons.xmark, size: 18, color: Colors.white),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Share Lyrics',
                          style: TextStyle(
                            fontFamily: 'SF Pro Display',
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.3,
                            color: Colors.white,
                          ),
                        ),
                        Text(
                          'Select up to 3 lines • ${widget.track.title}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: 'SF Pro',
                            fontSize: 12.5,
                            fontWeight: FontWeight.w500,
                            color: Colors.white.withValues(alpha: 0.60),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (_lyricLines.isNotEmpty)
                    Text(
                      '${_selectedIndices.length}/3',
                      style: TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: _selectedIndices.length == 3
                            ? const Color(0xFFE11D48)
                            : Colors.white60,
                      ),
                    ),
                ],
              ),
            ),

            const Divider(height: 1, thickness: 0.6, color: Color(0x24FFFFFF)),

            // ── Lyrics List or Empty State ──
            Expanded(
              child: _lyricLines.isEmpty
                  ? _buildEmptyState()
                  : ListView.builder(
                      physics: const BouncingScrollPhysics(),
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                      itemCount: _lyricLines.length,
                      itemBuilder: (context, index) {
                        final text = _lyricLines[index];
                        final isSelected = _selectedIndices.contains(index);

                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: GestureDetector(
                            onTap: () => _onLineTapped(index),
                            behavior: HitTestBehavior.opaque,
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? Colors.white.withValues(alpha: 0.16)
                                    : const Color(0x0AFFFFFF),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: isSelected
                                      ? const Color(0xFFE11D48)
                                      : Colors.white.withValues(alpha: 0.08),
                                  width: isSelected ? 1.4 : 0.8,
                                ),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  AnimatedContainer(
                                    duration: const Duration(milliseconds: 180),
                                    width: 20,
                                    height: 20,
                                    margin: const EdgeInsets.only(top: 2, right: 12),
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: isSelected
                                          ? const Color(0xFFE11D48)
                                          : Colors.transparent,
                                      border: Border.all(
                                        color: isSelected
                                            ? const Color(0xFFE11D48)
                                            : Colors.white38,
                                        width: 1.5,
                                      ),
                                    ),
                                    child: isSelected
                                        ? const Icon(
                                            CupertinoIcons.checkmark,
                                            size: 12,
                                            color: Colors.white,
                                          )
                                        : null,
                                  ),
                                  Expanded(
                                    child: Text(
                                      text,
                                      style: TextStyle(
                                        fontFamily: 'SF Pro Display',
                                        fontSize: 17,
                                        height: 1.35,
                                        fontWeight: isSelected
                                            ? FontWeight.w700
                                            : FontWeight.w500,
                                        color: isSelected
                                            ? Colors.white
                                            : Colors.white.withValues(alpha: 0.70),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),

            // ── Bottom Action Button (Next) ──
            if (_lyricLines.isNotEmpty)
              Container(
                padding: EdgeInsets.fromLTRB(20, 12, 20, math.max(16, safeBottom + 8)),
                decoration: const BoxDecoration(
                  color: Color(0xFF18181B),
                  border: Border(top: BorderSide(color: Color(0x1FFFFFFF), width: 0.6)),
                ),
                child: SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    onPressed: hasSelection ? _proceedToPreview : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFE11D48),
                      disabledBackgroundColor: const Color(0x33E11D48),
                      elevation: 0,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),
                    ),
                    child: Text(
                      hasSelection
                          ? 'Next (${_selectedIndices.length} line${_selectedIndices.length == 1 ? '' : 's'})'
                          : 'Select up to 3 lines',
                      style: TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: hasSelection
                            ? Colors.white
                            : Colors.white.withValues(alpha: 0.40),
                      ),
                    ),
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
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.08),
              ),
              child: const Icon(
                CupertinoIcons.quote_bubble,
                size: 28,
                color: Colors.white60,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'No Lyrics Available',
              style: TextStyle(
                fontFamily: 'SF Pro Display',
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Lyrics are not yet available for "${widget.track.title}". You can still share the song card to stories.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: 'SF Pro',
                fontSize: 14,
                color: Colors.white.withValues(alpha: 0.60),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _shareSongInstead,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFE11D48),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
              child: const Text(
                'Share Song Instead',
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 14.5,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
