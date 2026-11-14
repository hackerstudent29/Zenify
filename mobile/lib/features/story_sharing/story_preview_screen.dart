import 'dart:io';
import 'dart:math' as math;
import 'dart:ui';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../design_system/apple/apple_kit.dart' hide ArtworkPalette;
import '../../design_system/widgets/dynamic_island_header.dart';
import '../../design_system/widgets/monogram_avatar.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../models/track.dart';
import '../../services/dock_visibility.dart';
import '../../services/lyrics_service.dart';
import 'story_models.dart';
import 'story_service.dart';
import 'story_templates.dart';
import 'story_widgets.dart';


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
                  const ZenifyStoryBrand(iconSize: 13),
                  const SizedBox(width: 12),
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
                                borderRadius: BorderRadius.circular(22),
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
                  height: 54,
                  child: ElevatedButton(
                    onPressed: hasSelection ? _proceedToPreview : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFE11D48),
                      disabledBackgroundColor: const Color(0x33E11D48),
                      elevation: 0,
                      shape: const StadiumBorder(),
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


/// Premium Apple Music-styled Bottom Sheet to choose a Story sharing category.
class StoryOptionsSheet {
  StoryOptionsSheet._();

  static Future<void> show({
    required BuildContext context,
    required Track track,
    LyricsResult? lyrics,
    List<Track> artistTopTracks = const [],
    List<String> artistAlbumCovers = const [],
    String? artistAudience,
    List<Track> albumTracks = const [],
    String? albumYear,
    int? albumTrackCount,
    PlaylistStoryContent? playlistContent,
  }) {
    HapticFeedback.mediumImpact();

    return DockVisibility.runModal(
      () => showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        backgroundColor: Colors.transparent,
        barrierColor: Colors.black.withValues(alpha: 0.50),
        isScrollControlled: true,
        enableDrag: true,
        builder: (ctx) {
          final safeBottom = MediaQuery.paddingOf(ctx).bottom;

          final hasLyrics = lyrics != null && lyrics.lines.isNotEmpty;
          final hasAlbum = track.album.isNotEmpty &&
              track.album != 'Single' &&
              !track.album.startsWith('UC');
          final hasArtist = track.artist.isNotEmpty &&
              track.artist != 'Unknown Artist' &&
              !track.artist.startsWith('UC');

          return BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 32, sigmaY: 32),
            child: Container(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(ctx).height * 0.85,
              ),
              decoration: BoxDecoration(
                color: const Color(0xC71C1C1E), // Frosted liquid charcoal
                borderRadius: const BorderRadius.vertical(top: Radius.circular(34)),
                border: Border(
                  top: BorderSide(
                    color: Colors.white.withValues(alpha: 0.12),
                    width: 0.6,
                  ),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.50),
                    blurRadius: 36,
                    offset: const Offset(0, -6),
                  ),
                ],
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: EdgeInsets.fromLTRB(16, 10, 16, math.max(16, safeBottom + 8)),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Grabber
                      Center(
                        child: Container(
                          width: 36,
                          height: 4.5,
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.22),
                            borderRadius: BorderRadius.circular(2.5),
                          ),
                        ),
                      ),

                      // Header: Squircle Cover + Title + Subtitle
                      Row(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              width: 48,
                              height: 48,
                              color: const Color(0xFF2C2C2E),
                              child: track.coverUrl.isNotEmpty
                                  ? CachedNetworkImage(
                                      imageUrl: track.coverUrl,
                                      fit: BoxFit.cover,
                                      errorWidget: (_, _, _) => MonogramAvatar(name: track.title, size: 48),
                                    )
                                  : MonogramAvatar(name: track.title, size: 48),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Add to Story',
                                  style: const TextStyle(
                                    fontFamily: 'SF Pro Display',
                                    fontSize: 17,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: -0.3,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${track.title} • ${track.displayArtists}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontFamily: 'SF Pro',
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                    color: Colors.white.withValues(alpha: 0.65),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          const ZenifyStoryBrand(iconSize: 14),
                        ],
                      ),

                      const SizedBox(height: 16),

                      // ── Quick Social Destinations ──
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        physics: const BouncingScrollPhysics(),
                        child: Row(
                          children: [
                            _QuickSocialDestination(
                              label: 'Instagram',
                              gradient: const LinearGradient(
                                begin: Alignment.bottomLeft,
                                end: Alignment.topRight,
                                colors: [Color(0xFFF58529), Color(0xFFDD2A7B), Color(0xFF8134AF)],
                              ),
                              child: Center(
                                child: Container(
                                  width: 18,
                                  height: 18,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(5),
                                    border: Border.all(color: Colors.white, width: 1.8),
                                  ),
                                  child: Center(
                                    child: Container(
                                      width: 5,
                                      height: 5,
                                      decoration: const BoxDecoration(
                                        shape: BoxShape.circle,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              onTap: () {
                                Navigator.pop(ctx);
                                Navigator.of(context).push(
                                  CupertinoPageRoute(
                                    builder: (_) => StoryPreviewScreen(
                                      content: SongStoryContent(track: track),
                                    ),
                                  ),
                                );
                              },
                            ),
                            const SizedBox(width: 10),
                            _QuickSocialDestination(
                              label: 'WhatsApp',
                              color: const Color(0xFF25D366),
                              child: const Icon(CupertinoIcons.chat_bubble_fill, color: Colors.white, size: 20),
                              onTap: () {
                                Navigator.pop(ctx);
                                Navigator.of(context).push(
                                  CupertinoPageRoute(
                                    builder: (_) => StoryPreviewScreen(
                                      content: SongStoryContent(track: track),
                                    ),
                                  ),
                                );
                              },
                            ),
                            const SizedBox(width: 10),
                            _QuickSocialDestination(
                              label: 'Facebook',
                              color: const Color(0xFF1877F2),
                              child: const Icon(CupertinoIcons.share, color: Colors.white, size: 20),
                              onTap: () {
                                Navigator.pop(ctx);
                                Navigator.of(context).push(
                                  CupertinoPageRoute(
                                    builder: (_) => StoryPreviewScreen(
                                      content: SongStoryContent(track: track),
                                    ),
                                  ),
                                );
                              },
                            ),
                            const SizedBox(width: 10),
                            _QuickSocialDestination(
                              label: 'Snapchat',
                              color: const Color(0xFFFFFC00),
                              child: const Icon(CupertinoIcons.paperplane_fill, color: Colors.black, size: 18),
                              onTap: () {
                                Navigator.pop(ctx);
                                Navigator.of(context).push(
                                  CupertinoPageRoute(
                                    builder: (_) => StoryPreviewScreen(
                                      content: SongStoryContent(track: track),
                                    ),
                                  ),
                                );
                              },
                            ),
                            const SizedBox(width: 10),
                            _QuickSocialDestination(
                              label: 'Copy Link',
                              color: const Color(0xFF2C2C2E),
                              border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                              child: const Icon(CupertinoIcons.link, color: Colors.white, size: 18),
                              onTap: () {
                                final url = 'https://zenify.app/track/${Uri.encodeComponent(track.id.isNotEmpty ? track.id : track.title)}';
                                Clipboard.setData(ClipboardData(text: url));
                                HapticFeedback.lightImpact();
                                Navigator.pop(ctx);
                                IslandNotifier.instance.show(
                                  IslandNotification(
                                    id: 'copy_link_${DateTime.now().millisecondsSinceEpoch}',
                                    title: 'Copied Link',
                                    body: track.title,
                                    leading: const Icon(CupertinoIcons.link, color: Color(0xFFE11D48), size: 18),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 16),

                      // Option 1: Share Song Story
                      _StoryOptionTile(
                        icon: CupertinoIcons.music_note,
                        title: 'Share Song',
                        subtitle: 'Poster, liquid glass, and editorial song cards',
                        onTap: () {
                          Navigator.pop(ctx);
                          Navigator.of(context).push(
                            CupertinoPageRoute(
                              builder: (_) => StoryPreviewScreen(
                                content: SongStoryContent(track: track),
                              ),
                            ),
                          );
                        },
                      ),

                      const SizedBox(height: 8),

                      // Option 2: Share Lyrics Story (if lyrics present)
                      if (hasLyrics) ...[
                        _StoryOptionTile(
                          icon: CupertinoIcons.quote_bubble_fill,
                          title: 'Share Lyrics',
                          subtitle: 'Select up to 3 lines with dynamic artwork typography',
                          onTap: () {
                            Navigator.pop(ctx);
                            Navigator.of(context).push(
                              CupertinoPageRoute(
                                builder: (_) => LyricsSelectionScreen(
                                  track: track,
                                  lyrics: lyrics,
                                ),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 8),
                      ],

                      // Option 3: Share Artist Story (if artist is valid)
                      if (hasArtist) ...[
                        _StoryOptionTile(
                          icon: CupertinoIcons.person_crop_circle,
                          title: 'Share Artist',
                          subtitle: track.artist,
                          onTap: () {
                            Navigator.pop(ctx);
                            Navigator.of(context).push(
                              CupertinoPageRoute(
                                builder: (_) => StoryPreviewScreen(
                                  content: ArtistStoryContent(
                                    artistName: track.artist,
                                    coverUrl: track.coverUrl,
                                    audience: artistAudience,
                                    topTracks: artistTopTracks.isNotEmpty
                                        ? artistTopTracks
                                        : [track],
                                    albumCovers: artistAlbumCovers,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 8),
                      ],

                      // Option 4: Share Album Story (if album is valid)
                      if (hasAlbum) ...[
                        _StoryOptionTile(
                          icon: CupertinoIcons.music_albums,
                          title: 'Share Album',
                          subtitle: track.album,
                          onTap: () {
                            Navigator.pop(ctx);
                            Navigator.of(context).push(
                              CupertinoPageRoute(
                                builder: (_) => StoryPreviewScreen(
                                  content: AlbumStoryContent(
                                    albumTitle: track.album,
                                    artistName: track.artist,
                                    coverUrl: track.coverUrl,
                                    year: albumYear,
                                    trackCount: albumTrackCount,
                                    tracks: albumTracks.isNotEmpty ? albumTracks : [track],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 8),
                      ],

                      // Option 5: Share Playlist Story (if playlist context passed)
                      if (playlistContent != null) ...[
                        _StoryOptionTile(
                          icon: CupertinoIcons.square_grid_2x2,
                          title: 'Share Playlist',
                          subtitle: playlistContent.playlistTitle,
                          onTap: () {
                            Navigator.pop(ctx);
                            Navigator.of(context).push(
                              CupertinoPageRoute(
                                builder: (_) => StoryPreviewScreen(
                                  content: playlistContent,
                                ),
                              ),
                            );
                          },
                        ),
                        const SizedBox(height: 8),
                      ],

                      // Option 6: Quick Copy Link
                      _StoryOptionTile(
                        icon: CupertinoIcons.link,
                        title: 'Copy Song Link',
                        subtitle: 'https://zenify.app/track/...',
                        onTap: () {
                          final url = 'https://zenify.app/track/${Uri.encodeComponent(track.id.isNotEmpty ? track.id : track.title)}';
                          Clipboard.setData(ClipboardData(text: url));
                          HapticFeedback.lightImpact();
                          Navigator.pop(ctx);
                          IslandNotifier.instance.show(
                            IslandNotification(
                              id: 'copy_link_${DateTime.now().millisecondsSinceEpoch}',
                              title: 'Copied Link',
                              body: track.title,
                              leading: const Icon(CupertinoIcons.link, color: Color(0xFFE11D48), size: 18),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _StoryOptionTile extends StatelessWidget {
  const _StoryOptionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.08),
            width: 0.8,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: const Color(0xFFE11D48).withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: const Color(0xFFE11D48), size: 19),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontFamily: 'SF Pro Display',
                      fontSize: 15.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.2,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
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
            const Icon(CupertinoIcons.chevron_right, size: 15, color: Colors.white38),
          ],
        ),
      ),
    );
  }
}

class _QuickSocialDestination extends StatelessWidget {
  const _QuickSocialDestination({
    required this.label,
    required this.child,
    required this.onTap,
    this.color,
    this.gradient,
    this.border,
  });

  final String label;
  final Widget child;
  final VoidCallback onTap;
  final Color? color;
  final Gradient? gradient;
  final BoxBorder? border;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: color,
              gradient: gradient,
              borderRadius: BorderRadius.circular(14),
              border: border,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.25),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Center(child: child),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: TextStyle(
              fontFamily: 'SF Pro',
              fontSize: 11,
              fontWeight: FontWeight.w500,
              color: Colors.white.withValues(alpha: 0.70),
            ),
          ),
        ],
      ),
    );
  }
}


/// Full-screen Story Preview & Template Selection Screen.
class StoryPreviewScreen extends StatefulWidget {
  const StoryPreviewScreen({
    super.key,
    required this.content,
    this.initialTemplateId,
    this.initialShareTarget,
  });

  final StoryShareContent content;
  final String? initialTemplateId;
  final StoryShareTarget? initialShareTarget;

  @override
  State<StoryPreviewScreen> createState() => _StoryPreviewScreenState();
}

class _StoryPreviewScreenState extends State<StoryPreviewScreen> {
  final Map<String, GlobalKey> _boundaryKeys = {};
  GlobalKey _keyForTemplate(String id) => _boundaryKeys.putIfAbsent(id, () => GlobalKey());
  late final PageController _pageController;

  late final List<StoryTemplate> _availableTemplates;
  late StoryTemplate _currentTemplate;

  StoryAspectRatio _aspectRatio = StoryAspectRatio.story;
  StoryBackgroundStyle _backgroundStyle = StoryBackgroundStyle.artMesh;
  StoryTextPolarity _textPolarity = StoryTextPolarity.light;

  ArtworkPalette _palette = ArtworkPalette.defaultPalette;
  bool _isExporting = false;

  @override
  void initState() {
    super.initState();
    _availableTemplates = _resolveTemplatesForContent(widget.content);

    // Initial template matching requested or fallback to first
    final initId = widget.initialTemplateId;
    _currentTemplate = _availableTemplates.firstWhere(
      (t) => t.id == initId,
      orElse: () => _availableTemplates.first,
    );

    final initialIndex = _availableTemplates.indexOf(_currentTemplate);
    _pageController = PageController(initialPage: initialIndex >= 0 ? initialIndex : 0);

    _loadPreferences();
    _extractArtworkPalette();

    if (widget.initialShareTarget != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _triggerInitialShare(widget.initialShareTarget!);
      });
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  List<StoryTemplate> _resolveTemplatesForContent(StoryShareContent c) {
    if (c is SongStoryContent) return StoryTemplate.songTemplates;
    if (c is LyricsStoryContent) return StoryTemplate.lyricsTemplates;
    if (c is ArtistStoryContent) return StoryTemplate.artistTemplates;
    if (c is AlbumStoryContent) return StoryTemplate.albumTemplates;
    if (c is PlaylistStoryContent) return StoryTemplate.playlistTemplates;
    return StoryTemplate.songTemplates;
  }

  Future<void> _loadPreferences() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedTemplateId = prefs.getString('zenify_story_last_template_${widget.content.contentType}');
      if (savedTemplateId != null && mounted) {
        final match = _availableTemplates.firstWhere(
          (t) => t.id == savedTemplateId,
          orElse: () => _currentTemplate,
        );
        if (match.id != _currentTemplate.id) {
          final idx = _availableTemplates.indexOf(match);
          if (idx >= 0 && _pageController.hasClients) {
            _pageController.jumpToPage(idx);
          }
          setState(() => _currentTemplate = match);
        }
      }
    } catch (_) {}
  }

  Future<void> _savePreference(String templateId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        'zenify_story_last_template_${widget.content.contentType}',
        templateId,
      );
    } catch (_) {}
  }

  Future<void> _extractArtworkPalette() async {
    final pal = await ArtworkPaletteService.instance.extractPalette(
      widget.content.coverUrl,
      cacheKey: '${widget.content.contentType}_${widget.content.title}',
    );
    if (mounted) {
      setState(() => _palette = pal);
    }
  }

  void _onTemplateSelected(StoryTemplate template) {
    final index = _availableTemplates.indexOf(template);
    if (index >= 0 && _pageController.hasClients) {
      _pageController.animateToPage(
        index,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      );
    }
    setState(() => _currentTemplate = template);
    _savePreference(template.id);
  }

  void _onPageChanged(int index) {
    if (index >= 0 && index < _availableTemplates.length) {
      setState(() => _currentTemplate = _availableTemplates[index]);
      _savePreference(_availableTemplates[index].id);
    }
  }

  void _toggleAspectRatio() {
    setState(() {
      _aspectRatio = _aspectRatio == StoryAspectRatio.story
          ? StoryAspectRatio.square
          : StoryAspectRatio.story;
    });
  }

  void _toggleBackgroundStyle() {
    setState(() {
      const styles = StoryBackgroundStyle.values;
      final nextIdx = (styles.indexOf(_backgroundStyle) + 1) % styles.length;
      _backgroundStyle = styles[nextIdx];
    });
  }

  void _toggleTextPolarity() {
    setState(() {
      _textPolarity = _textPolarity == StoryTextPolarity.light
          ? StoryTextPolarity.dark
          : StoryTextPolarity.light;
    });
  }

  Future<File?> _captureCurrentCard() async {
    setState(() => _isExporting = true);
    try {
      final key = _keyForTemplate(_currentTemplate.id);
      final result = await StoryImageRenderer.captureToPng(
        key,
        filePrefix: 'zenify_${widget.content.contentType}',
        targetWidth: _aspectRatio.exportWidth,
      );
      if (result == null && mounted) {
        appleToast(context, 'Preparing story image...');
      }
      return result?.file;
    } finally {
      if (mounted) setState(() => _isExporting = false);
    }
  }

  Future<void> _shareInstagram() async {
    final file = await _captureCurrentCard();
    if (file == null) return;
    await StorySharingService.shareToInstagram(
      file,
      topColor: _palette.primary,
      bottomColor: _palette.background,
      fallbackText: widget.content.shareText,
    );
  }

  Future<void> _shareFacebook() async {
    final file = await _captureCurrentCard();
    if (file == null) return;
    await StorySharingService.shareToFacebook(
      file,
      fallbackText: widget.content.shareText,
    );
  }

  Future<void> _shareWhatsApp() async {
    final file = await _captureCurrentCard();
    if (file == null) return;
    await StorySharingService.shareToWhatsApp(
      file,
      text: widget.content.shareText,
    );
  }

  Future<void> _shareSnapchat() async {
    final file = await _captureCurrentCard();
    if (file == null) return;
    await StorySharingService.shareToSnapchat(
      file,
      fallbackText: widget.content.shareText,
    );
  }

  Future<void> _shareTelegram() async {
    final file = await _captureCurrentCard();
    if (file == null) return;
    await StorySharingService.shareToTelegram(
      file,
      text: widget.content.shareText,
    );
  }

  Future<void> _triggerInitialShare(StoryShareTarget target) async {
    await Future<void>.delayed(const Duration(milliseconds: 350));
    if (!mounted) return;
    switch (target) {
      case StoryShareTarget.instagram:
        await _shareInstagram();
        break;
      case StoryShareTarget.facebook:
        await _shareFacebook();
        break;
      case StoryShareTarget.whatsapp:
        await _shareWhatsApp();
        break;
      case StoryShareTarget.snapchat:
        await _shareSnapchat();
        break;
      case StoryShareTarget.telegram:
        await _shareTelegram();
        break;
      case StoryShareTarget.system:
        await _shareMore();
        break;
    }
  }

  Future<void> _shareMore() async {
    final file = await _captureCurrentCard();
    if (file == null) return;
    await StorySharingService.shareToSystem(
      file,
      text: widget.content.shareText,
    );
  }

  Future<void> _saveToGallery() async {
    final file = await _captureCurrentCard();
    if (file == null) return;

    final success = await GallerySaveService.saveImageToGallery(
      file,
      title: 'Zenify_${widget.content.contentType}',
    );

    if (mounted) {
      if (success) {
        IslandNotifier.instance.show(
          IslandNotification(
            id: 'save_story_${DateTime.now().millisecondsSinceEpoch}',
            title: 'Saved to Gallery',
            body: 'Pictures/Zenify album',
            leading: const Icon(CupertinoIcons.checkmark_circle_fill, color: Color(0xFFE11D48), size: 18),
          ),
        );
      } else {
        appleToast(context, 'Could not save to gallery');
      }
    }
  }

  void _copyLink() {
    Clipboard.setData(ClipboardData(text: widget.content.shareUrl));
    HapticFeedback.lightImpact();
    IslandNotifier.instance.show(
      IslandNotification(
        id: 'copy_link_${DateTime.now().millisecondsSinceEpoch}',
        title: 'Copied Link',
        body: widget.content.title,
        leading: const Icon(CupertinoIcons.link, color: Color(0xFFE11D48), size: 18),
      ),
    );
  }

  double _pageValue() {
    if (_pageController.hasClients && _pageController.position.haveDimensions) {
      return _pageController.page ?? _pageController.initialPage.toDouble();
    }
    return _pageController.initialPage.toDouble();
  }

  Widget _topBar(double safeTop) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, safeTop + 8, 16, 6),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            behavior: HitTestBehavior.opaque,
            child: const LiquidGlass(
              radius: 19,
              width: 38,
              height: 38,
              shadow: false,
              child: Center(child: Icon(CupertinoIcons.xmark, size: 16, color: Colors.white)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Add to Story',
                  style: TextStyle(
                    fontFamily: 'SF Pro Display',
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                    color: Colors.white,
                  ),
                ),
                Text(
                  widget.content.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'SF Pro Text',
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.62),
                  ),
                ),
              ],
            ),
          ),
          if (_isExporting) ...[
            const CupertinoActivityIndicator(color: Colors.white, radius: 9),
            const SizedBox(width: 10),
          ],
          const ZenifyStoryBrand(iconSize: 15),
        ],
      ),
    );
  }

  Widget _dots() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (final t in _availableTemplates)
          AnimatedContainer(
            duration: const Duration(milliseconds: 260),
            curve: Curves.easeOutCubic,
            margin: const EdgeInsets.symmetric(horizontal: 2.5),
            width: t.id == _currentTemplate.id ? 16 : 5,
            height: 5,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(3),
              color: Colors.white.withValues(alpha: t.id == _currentTemplate.id ? 0.95 : 0.30),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final safeTop = MediaQuery.paddingOf(context).top;
    final safeBottom = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      backgroundColor: const Color(0xFF0B0B0D),
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Living liquid backdrop tinted by the artwork — gives the glass
          // controls real colour to refract.
          ArtMeshBackground(
            coverUrl: widget.content.coverUrl,
            palette: _palette,
            style: StoryBackgroundStyle.artMesh,
            animate: true,
          ),
          ColoredBox(color: Colors.black.withValues(alpha: 0.38)),

          Column(
            children: [
              _topBar(safeTop),

              // ── Story preview pager with depth ──
              Expanded(
                child: PageView.builder(
                  controller: _pageController,
                  physics: const BouncingScrollPhysics(),
                  itemCount: _availableTemplates.length,
                  onPageChanged: _onPageChanged,
                  itemBuilder: (context, index) {
                    final template = _availableTemplates[index];
                    return AnimatedBuilder(
                      animation: _pageController,
                      builder: (context, child) {
                        final d = (index - _pageValue()).clamp(-1.0, 1.0);
                        return Opacity(
                          opacity: 1 - 0.45 * d.abs(),
                          child: Transform(
                            alignment: Alignment.center,
                            transform: Matrix4.identity()
                              ..setEntry(3, 2, 0.0012)
                              ..rotateY(-d * 0.38),
                            child: Transform.scale(
                              scale: 1 - d.abs() * 0.1,
                              child: child,
                            ),
                          ),
                        );
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 8),
                        child: Center(
                          child: Bob(
                            dy: 3,
                            seconds: 8,
                            child: StoryCardPreview(
                              boundaryKey: _keyForTemplate(template.id),
                              content: widget.content,
                              template: template,
                              palette: _palette,
                              backgroundStyle: _backgroundStyle,
                              textPolarity: _textPolarity,
                              aspectRatio: _aspectRatio,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),

              _dots(),
              const SizedBox(height: 12),

              StoryTemplateSelector(
                templates: _availableTemplates,
                selectedTemplate: _currentTemplate,
                onSelectTemplate: _onTemplateSelected,
              ),

              const SizedBox(height: 14),

              Padding(
                padding: EdgeInsets.only(bottom: math.max(14, safeBottom + 8)),
                child: StoryShareControls(
                  aspectRatio: _aspectRatio,
                  backgroundStyle: _backgroundStyle,
                  textPolarity: _textPolarity,
                  onToggleAspectRatio: _toggleAspectRatio,
                  onToggleBackgroundStyle: _toggleBackgroundStyle,
                  onToggleTextPolarity: _toggleTextPolarity,
                  onShareInstagram: _shareInstagram,
                  onShareFacebook: _shareFacebook,
                  onShareWhatsApp: _shareWhatsApp,
                  onShareSnapchat: _shareSnapchat,
                  onShareMore: _shareMore,
                  onSaveGallery: _saveToGallery,
                  onCopyLink: _copyLink,
                  isExporting: _isExporting,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
