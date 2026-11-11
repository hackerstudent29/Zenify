import 'dart:async';
import 'dart:math' as math;
import 'dart:ui';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../models/track.dart';
import '../../services/innertube_service.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';
import '../../views/details/album_screen.dart';
import '../../views/details/artist_popup.dart';
import '../../views/details/artist_screen.dart';
import '../tokens/app_colors.dart';
import '../zen.dart';
import 'monogram_avatar.dart';
import 'pressable_scale.dart';

/// Single item within a ZenDropdown action menu.
class ZenDropdownItem {
  const ZenDropdownItem({
    required this.title,
    required this.icon,
    this.subtitle,
    this.isDestructive = false,
    this.isSelected = false,
    this.iconColor,
    this.onTap,
  });

  final String title;
  final IconData icon;
  final String? subtitle;
  final bool isDestructive;
  final bool isSelected;
  final Color? iconColor;
  final VoidCallback? onTap;
}

/// Apple-style Liquid Glass Modal Bottom Sheet used for all three dots and contextual options in Zenify.
class ZenDropdown {
  ZenDropdown._();

  /// Displays a liquid-glass Apple Music modal bottom sheet.
  static Future<T?> show<T>({
    required BuildContext context,
    String? title,
    String? subtitle,
    Widget? header,
    required List<ZenDropdownItem> items,
  }) {
    HapticFeedback.mediumImpact();

    return showModalBottomSheet<T>(
      context: context,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.50),
      isScrollControlled: true,
      enableDrag: true,
      builder: (ctx) {
        return _GenericActionSheetContent<T>(
          title: title,
          subtitle: subtitle,
          header: header,
          items: items,
        );
      },
    );
  }

  /// Flagship: Apple Music Contextual Song Action Sheet.
  /// Features:
  /// - Liquid glass sheet background (#1C1C1E with 25px blur and top 30px corner radius)
  /// - Song information header with artwork, title, artist, duration and animated heart
  /// - Quick sharing actions row (Copy Link, Message, Instagram Stories, Facebook Stories)
  /// - Action menu rows with Zenify rose icons and dividers between adjacent items
  static Future<void> showTrackMenu({
    required BuildContext context,
    Track? track,
    String? trackTitle,
    String? artistName,
    String? albumName,
    String? coverUrl,
    int? durationSeconds,
    VoidCallback? onPlayNext,
    VoidCallback? onPlayLater,
    VoidCallback? onAddToPlaylist,
    VoidCallback? onGoToArtist,
    VoidCallback? onGoToAlbum,
    VoidCallback? onStartMix,
    VoidCallback? onReport,
    VoidCallback? onToggleLike,
    bool? isLiked,
    List<ZenDropdownItem>? extraItems,
  }) {
    HapticFeedback.mediumImpact();

    final resolvedTitle = track != null
        ? MediaNormalizer.cleanTitle(track.title)
        : (trackTitle?.isNotEmpty == true ? MediaNormalizer.cleanTitle(trackTitle!) : 'Song');
    final resolvedArtist = track != null
        ? MediaNormalizer.formatArtists(track.artist)
        : (artistName?.isNotEmpty == true ? MediaNormalizer.formatArtists(artistName!) : 'Unknown Artist');
    final resolvedAlbum = (track != null && track.album.isNotEmpty && track.album != 'Single')
        ? MediaNormalizer.cleanAlbumTitle(track.album)
        : (albumName ?? '');
    final resolvedCover = (track != null && track.coverUrl.isNotEmpty) ? track.coverUrl : (coverUrl ?? '');
    final resolvedDur = track != null ? track.durationSeconds : (durationSeconds ?? 0);

    return showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.50),
      isScrollControlled: true,
      enableDrag: true,
      builder: (ctx) {
        return _TrackActionSheetContent(
          track: track,
          title: resolvedTitle,
          artist: resolvedArtist,
          album: resolvedAlbum,
          coverUrl: resolvedCover,
          durationSeconds: resolvedDur,
          onPlayNext: onPlayNext,
          onPlayLater: onPlayLater,
          onAddToPlaylist: onAddToPlaylist,
          onGoToArtist: onGoToArtist,
          onGoToAlbum: onGoToAlbum,
          onStartMix: onStartMix,
          onReport: onReport,
          onToggleLike: onToggleLike,
          initialLiked: isLiked,
          extraItems: extraItems,
        );
      },
    );
  }

  /// Preset: Sort menu bottom sheet.
  static void showSortMenu<T>({
    required BuildContext context,
    required String title,
    required List<({T value, String label, IconData icon})> options,
    required T selected,
    required ValueChanged<T> onSelected,
  }) {
    show(
      context: context,
      title: title,
      items: [
        for (final opt in options)
          ZenDropdownItem(
            title: opt.label,
            icon: opt.icon,
            isSelected: opt.value == selected,
            onTap: () => onSelected(opt.value),
          ),
      ],
    );
  }

  /// Shows the Apple Music-styled playlist picker sheet.
  static Future<void> showPlaylistPicker(BuildContext context, Track track) async {
    HapticFeedback.lightImpact();
    final store = LibraryStore.instance;

    await showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.50),
      isScrollControlled: true,
      builder: (ctx) {
        final playlists = store.playlists;
        final safeBottom = MediaQuery.paddingOf(ctx).bottom;

        return BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 25, sigmaY: 25),
          child: Container(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.70),
            decoration: BoxDecoration(
              color: const Color(0xF21C1C1E),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
              border: Border(
                top: BorderSide(
                  color: Colors.white.withValues(alpha: 0.12),
                  width: 0.6,
                ),
              ),
            ),
            child: SafeArea(
              top: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Grabber
                  Center(
                    child: Container(
                      width: 36,
                      height: 4.5,
                      margin: const EdgeInsets.only(top: 10, bottom: 14),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.22),
                        borderRadius: BorderRadius.circular(2.5),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Add to Playlist',
                          style: const TextStyle(
                            fontFamily: 'SF Pro',
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.3,
                            color: Colors.white,
                          ),
                        ),
                        PressableScale(
                          onTap: () => Navigator.pop(ctx),
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: const ShapeDecoration(
                              shape: CircleBorder(),
                              color: Color(0x1FFFFFFF),
                            ),
                            child: const Icon(Icons.close_rounded, size: 18, color: Colors.white70),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Divider(height: 0.5, thickness: 0.5, color: const Color(0xFF38383A)),
                  Flexible(
                    child: ListView(
                      shrinkWrap: true,
                      physics: const BouncingScrollPhysics(),
                      padding: EdgeInsets.fromLTRB(16, 8, 16, math.max(16, safeBottom + 8)),
                      children: [
                        // New Playlist row
                        ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          leading: Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: Zen.rose.withValues(alpha: 0.15),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(CupertinoIcons.add, color: Zen.rose, size: 22),
                          ),
                          title: const Text(
                            'New Playlist…',
                            style: TextStyle(
                              fontFamily: 'SF Pro',
                              fontSize: 15.5,
                              fontWeight: FontWeight.w600,
                              color: Zen.rose,
                            ),
                          ),
                          onTap: () async {
                            Navigator.pop(ctx);
                            final controller = TextEditingController();
                            final name = await showDialog<String>(
                              context: context,
                              builder: (dCtx) => AlertDialog(
                                backgroundColor: const Color(0xFF1C1C1E),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                                title: const Text(
                                  'New Playlist',
                                  style: TextStyle(
                                    fontFamily: 'SF Pro',
                                    color: Colors.white,
                                    fontSize: 18,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                content: TextField(
                                  controller: controller,
                                  autofocus: true,
                                  style: const TextStyle(
                                    fontFamily: 'SF Pro',
                                    color: Colors.white,
                                    fontSize: 16,
                                    fontWeight: FontWeight.w500,
                                  ),
                                  decoration: InputDecoration(
                                    hintText: 'Playlist name',
                                    hintStyle: TextStyle(
                                      fontFamily: 'SF Pro',
                                      color: Colors.white.withValues(alpha: 0.35),
                                      fontSize: 16,
                                    ),
                                    enabledBorder: UnderlineInputBorder(
                                      borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.2)),
                                    ),
                                    focusedBorder: const UnderlineInputBorder(
                                      borderSide: BorderSide(color: Zen.rose),
                                    ),
                                  ),
                                ),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(dCtx),
                                    child: Text(
                                      'Cancel',
                                      style: TextStyle(
                                        fontFamily: 'SF Pro',
                                        color: Colors.white.withValues(alpha: 0.65),
                                        fontSize: 15,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: () => Navigator.pop(dCtx, controller.text.trim()),
                                    child: const Text(
                                      'Create',
                                      style: TextStyle(
                                        fontFamily: 'SF Pro',
                                        color: Zen.rose,
                                        fontSize: 15,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            );
                            if (name != null && name.isNotEmpty && context.mounted) {
                              store.createPlaylist(name, first: track);
                              HapticFeedback.lightImpact();
                            }
                          },
                        ),
                        Divider(height: 0.5, thickness: 0.5, indent: 64, color: const Color(0xFF38383A)),
                        for (int i = 0; i < playlists.length; i++) ...[
                          ListTile(
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            leading: Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: const Color(0xFF2C2C2E),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: const Icon(CupertinoIcons.music_albums, color: Colors.white70, size: 22),
                            ),
                            title: Text(
                              playlists[i].name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontFamily: 'SF Pro',
                                fontSize: 15.5,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                            subtitle: Text(
                              '${playlists[i].trackIds.length} songs',
                              style: const TextStyle(
                                fontFamily: 'SF Pro',
                                fontSize: 12.5,
                                fontWeight: FontWeight.w500,
                                color: Color(0xFFA1A1A6),
                              ),
                            ),
                            onTap: () {
                              store.addToPlaylist(playlists[i].id, track);
                              HapticFeedback.lightImpact();
                              Navigator.pop(ctx);
                            },
                          ),
                          if (i < playlists.length - 1)
                            Divider(height: 0.5, thickness: 0.5, indent: 64, color: const Color(0xFF38383A)),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// The rich Apple Music Song Information & Action Sheet.
class _TrackActionSheetContent extends StatefulWidget {
  const _TrackActionSheetContent({
    required this.track,
    required this.title,
    required this.artist,
    required this.album,
    required this.coverUrl,
    required this.durationSeconds,
    this.onPlayNext,
    this.onPlayLater,
    this.onAddToPlaylist,
    this.onGoToArtist,
    this.onGoToAlbum,
    this.onStartMix,
    this.onReport,
    this.onToggleLike,
    this.initialLiked,
    this.extraItems,
  });

  final Track? track;
  final String title;
  final String artist;
  final String album;
  final String coverUrl;
  final int durationSeconds;
  final VoidCallback? onPlayNext;
  final VoidCallback? onPlayLater;
  final VoidCallback? onAddToPlaylist;
  final VoidCallback? onGoToArtist;
  final VoidCallback? onGoToAlbum;
  final VoidCallback? onStartMix;
  final VoidCallback? onReport;
  final VoidCallback? onToggleLike;
  final bool? initialLiked;
  final List<ZenDropdownItem>? extraItems;

  @override
  State<_TrackActionSheetContent> createState() => _TrackActionSheetContentState();
}

class _TrackActionSheetContentState extends State<_TrackActionSheetContent> {
  late bool _liked;

  @override
  void initState() {
    super.initState();
    if (widget.initialLiked != null) {
      _liked = widget.initialLiked!;
    } else if (widget.track != null) {
      _liked = LibraryStore.instance.isLiked(widget.track!);
    } else {
      _liked = false;
    }
  }

  String _formatDuration(int seconds) {
    if (seconds <= 0) return '';
    final m = seconds ~/ 60;
    final s = seconds % 60;
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  String _buildSubtitle() {
    final dur = _formatDuration(widget.durationSeconds);
    if (dur.isNotEmpty) {
      return '${widget.artist} • $dur';
    }
    if (widget.album.isNotEmpty) {
      return '${widget.artist} • ${widget.album}';
    }
    return widget.artist;
  }

  String get _shareUrl {
    final id = widget.track?.id ?? '';
    return id.isNotEmpty ? 'https://listenzenify.com/track/$id' : 'https://listenzenify.com';
  }

  void _handleLikeToggle() {
    HapticFeedback.lightImpact();
    setState(() => _liked = !_liked);
    if (widget.onToggleLike != null) {
      widget.onToggleLike!();
    } else if (widget.track != null) {
      LibraryStore.instance.toggleLove(widget.track!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    final player = context.read<PlayerState>();

    // Build Action Menu Rows
    final List<ZenDropdownItem> rows = [
      // 1. Play next
      ZenDropdownItem(
        title: 'Play next',
        icon: CupertinoIcons.arrow_turn_right_up,
        onTap: widget.onPlayNext ??
            (widget.track != null ? () => player.playNext(widget.track!) : null),
      ),
      // 2. Add to playlist
      ZenDropdownItem(
        title: 'Add to playlist',
        icon: CupertinoIcons.text_badge_plus,
        onTap: widget.onAddToPlaylist ??
            (widget.track != null ? () => ZenDropdown.showPlaylistPicker(context, widget.track!) : null),
      ),
      // 3. Go to artist
      ZenDropdownItem(
        title: 'Go to artist',
        icon: CupertinoIcons.person,
        onTap: widget.onGoToArtist ??
            () {
              if (widget.track != null) {
                final resolved = widget.track!.resolvedArtists;
                if (resolved.length > 1) {
                  showArtistPopup(context, artists: resolved);
                } else if (resolved.isNotEmpty) {
                  Navigator.push(
                    context,
                    ZenPageRoute(builder: (_) => ArtistScreen(artistName: resolved.first.name)),
                  );
                } else {
                  Navigator.push(
                    context,
                    ZenPageRoute(builder: (_) => ArtistScreen(artistName: widget.artist)),
                  );
                }
              } else {
                Navigator.push(
                  context,
                  ZenPageRoute(builder: (_) => ArtistScreen(artistName: widget.artist)),
                );
              }
            },
      ),
      // 4. Go to album
      if (widget.album.isNotEmpty)
        ZenDropdownItem(
          title: 'Go to album',
          icon: CupertinoIcons.music_albums,
          onTap: widget.onGoToAlbum ??
              () {
                Navigator.push(
                  context,
                  ZenPageRoute(
                    builder: (_) => AlbumScreen(
                      albumTitle: widget.album,
                      artistName: widget.artist,
                      coverUrl: widget.coverUrl,
                    ),
                  ),
                );
              },
        ),
      // 5. Start mix
      ZenDropdownItem(
        title: 'Start mix',
        icon: CupertinoIcons.antenna_radiowaves_left_right,
        onTap: widget.onStartMix ??
            () {
              if (widget.track != null) {
                player.playMedia(widget.track!);
                InnerTubeService.instance.getNextQueue(widget.track!.id).then((nextTracks) {
                  for (final next in nextTracks) {
                    player.playLast(next);
                  }
                });
                IslandNotifier.instance.show(
                  IslandNotification(
                    id: 'mix_${widget.track!.id}',
                    title: 'Mix started',
                    body: widget.title,
                    leading: const Icon(CupertinoIcons.antenna_radiowaves_left_right, color: Color(0xFFE11D48), size: 18),
                  ),
                );
              }
            },
      ),
      // 6. Report
      ZenDropdownItem(
        title: 'Report',
        icon: CupertinoIcons.flag,
        onTap: widget.onReport ??
            () {
              IslandNotifier.instance.show(
                IslandNotification(
                  id: 'report_${widget.title.hashCode}',
                  title: 'Feedback received',
                  body: 'Thank you for reporting this track',
                  leading: const Icon(CupertinoIcons.checkmark_shield_fill, color: Color(0xFFE11D48), size: 18),
                ),
              );
            },
      ),
      // Extra items if supplied
      if (widget.extraItems != null) ...widget.extraItems!,
    ];

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 25, sigmaY: 25),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.85,
        ),
        decoration: BoxDecoration(
          color: const Color(0xF21C1C1E), // Liquid glass #1C1C1E
          borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
          border: Border(
            top: BorderSide(
              color: Colors.white.withValues(alpha: 0.12),
              width: 0.6,
            ),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.5),
              blurRadius: 36,
              offset: const Offset(0, -6),
            ),
          ],
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── A. Grabber Handle ──
              Center(
                child: Container(
                  width: 36,
                  height: 4.5,
                  margin: const EdgeInsets.only(top: 10, bottom: 10),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.22),
                    borderRadius: BorderRadius.circular(2.5),
                  ),
                ),
              ),

              // ── B. Song Information Header ──
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: Row(
                  children: [
                    // Squircle Artwork
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        width: 50,
                        height: 50,
                        color: const Color(0xFF2C2C2E),
                        child: widget.coverUrl.isNotEmpty
                            ? CachedNetworkImage(
                                imageUrl: widget.coverUrl,
                                fit: BoxFit.cover,
                                errorWidget: (_, _, _) => MonogramAvatar(
                                  name: widget.title,
                                  size: 50,
                                ),
                              )
                            : MonogramAvatar(
                                name: widget.title,
                                size: 50,
                              ),
                      ),
                    ),
                    const SizedBox(width: 14),

                    // Title & Artist + Duration
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            widget.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontFamily: 'SF Pro Display',
                              fontSize: 16.5,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                              letterSpacing: -0.3,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            _buildSubtitle(),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontFamily: 'SF Pro',
                              fontSize: 13.5,
                              fontWeight: FontWeight.w500,
                              color: Color(0xFFA1A1A6),
                              letterSpacing: -0.1,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),

                    // Favorite / Heart Button
                    PressableScale(
                      onTap: _handleLikeToggle,
                      child: Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        child: Icon(
                          _liked ? CupertinoIcons.heart_fill : CupertinoIcons.heart,
                          color: _liked ? Zen.rose : Colors.white,
                          size: 24,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 6),

              // ── C. Quick Sharing Actions ──
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    // Copy Link
                    _QuickShareBtn(
                      icon: CupertinoIcons.link,
                      label: 'Copy Link',
                      onTap: () {
                        Clipboard.setData(ClipboardData(text: _shareUrl));
                        HapticFeedback.lightImpact();
                        Navigator.of(context).pop();
                        IslandNotifier.instance.show(
                          IslandNotification(
                            id: 'copy_link_${DateTime.now().millisecondsSinceEpoch}',
                            title: 'Link copied',
                            body: 'Copied to clipboard',
                            leading: const Icon(CupertinoIcons.link, color: Color(0xFFE11D48), size: 18),
                          ),
                        );
                      },
                    ),
                    // Message
                    _QuickShareBtn(
                      icon: CupertinoIcons.paperplane,
                      label: 'Message',
                      onTap: () {
                        Navigator.of(context).pop();
                        SharePlus.instance.share(ShareParams(
                          text: 'Listening to "${widget.title}" by ${widget.artist} on Zenify: $_shareUrl',
                        ));
                      },
                    ),
                    // Instagram Stories
                    _QuickShareBtn(
                      icon: CupertinoIcons.camera,
                      label: 'Stories',
                      gradient: const LinearGradient(
                        begin: Alignment.bottomLeft,
                        end: Alignment.topRight,
                        colors: [Color(0xFFF58529), Color(0xFFDD2A7B), Color(0xFF8134AF)],
                      ),
                      onTap: () {
                        Navigator.of(context).pop();
                        SharePlus.instance.share(ShareParams(
                          text: 'Listening to "${widget.title}" by ${widget.artist} on Zenify: $_shareUrl',
                        ));
                      },
                    ),
                    // Facebook Stories
                    _QuickShareBtn(
                      icon: CupertinoIcons.share,
                      label: 'Stories',
                      color: const Color(0xFF1877F2),
                      onTap: () {
                        Navigator.of(context).pop();
                        SharePlus.instance.share(ShareParams(
                          text: 'Listening to "${widget.title}" by ${widget.artist} on Zenify: $_shareUrl',
                        ));
                      },
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 8),

              // ── D. Song Action Menu Rows (Dividers Between Items Only) ──
              Flexible(
                child: SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  padding: EdgeInsets.only(bottom: math.max(16, safeBottom + 8)),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (int i = 0; i < rows.length; i++) ...[
                        _ActionMenuRow(item: rows[i]),
                        // Rule: Line under each item except the last item; line above each item except the first item.
                        if (i < rows.length - 1)
                          const Divider(
                            height: 0.5,
                            thickness: 0.5,
                            indent: 56,
                            color: Color(0xFF38383A),
                          ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Circular Quick Sharing Action Button
class _QuickShareBtn extends StatelessWidget {
  const _QuickShareBtn({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
    this.gradient,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  final Gradient? gradient;

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
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: gradient == null ? (color ?? const Color(0xFF2C2C2E)) : null,
              gradient: gradient,
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.08),
                width: 0.8,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.25),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Icon(icon, color: Colors.white, size: 22),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            style: const TextStyle(
              fontFamily: 'SF Pro',
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: Color(0xFFA1A1A6),
              letterSpacing: -0.1,
            ),
          ),
        ],
      ),
    );
  }
}

/// Action Menu Row for Song Options and Dropdowns
class _ActionMenuRow extends StatelessWidget {
  const _ActionMenuRow({required this.item});
  final ZenDropdownItem item;

  @override
  Widget build(BuildContext context) {
    final iconColor = item.iconColor ?? (item.isDestructive ? AppColors.danger : Zen.rose);

    return PressableScale(
      onTap: () {
        HapticFeedback.selectionClick();
        Navigator.of(context, rootNavigator: true).pop();
        item.onTap?.call();
      },
      child: Container(
        color: Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
        child: Row(
          children: [
            SizedBox(
              width: 24,
              child: Icon(
                item.icon,
                size: 22,
                color: iconColor,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    item.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 15.5,
                      fontWeight: item.isSelected ? FontWeight.w600 : FontWeight.w500,
                      color: item.isDestructive ? AppColors.danger : Colors.white,
                      letterSpacing: -0.2,
                    ),
                  ),
                  if (item.subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      item.subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 12.5,
                        fontWeight: FontWeight.w500,
                        color: Color(0xFFA1A1A6),
                        letterSpacing: -0.1,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (item.isSelected)
              const Icon(
                CupertinoIcons.checkmark,
                size: 18,
                color: Zen.rose,
              ),
          ],
        ),
      ),
    );
  }
}

/// Generic liquid glass bottom sheet content used by `ZenDropdown.show`.
class _GenericActionSheetContent<T> extends StatelessWidget {
  const _GenericActionSheetContent({
    this.title,
    this.subtitle,
    this.header,
    required this.items,
  });

  final String? title;
  final String? subtitle;
  final Widget? header;
  final List<ZenDropdownItem> items;

  @override
  Widget build(BuildContext context) {
    final safeBottom = MediaQuery.paddingOf(context).bottom;

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 25, sigmaY: 25),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.75,
        ),
        decoration: BoxDecoration(
          color: const Color(0xF21C1C1E),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(30)),
          border: Border(
            top: BorderSide(
              color: Colors.white.withValues(alpha: 0.12),
              width: 0.6,
            ),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.5),
              blurRadius: 36,
              offset: const Offset(0, -6),
            ),
          ],
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Grabber Handle
              Center(
                child: Container(
                  width: 36,
                  height: 4.5,
                  margin: const EdgeInsets.only(top: 10, bottom: 12),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.22),
                    borderRadius: BorderRadius.circular(2.5),
                  ),
                ),
              ),

              // Optional Header
              if (header != null)
                header!
              else if (title != null) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontFamily: 'SF Pro Display',
                          fontSize: 16.5,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: -0.3,
                        ),
                      ),
                      if (subtitle != null) ...[
                        const SizedBox(height: 3),
                        Text(
                          subtitle!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontFamily: 'SF Pro',
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: Color(0xFFA1A1A6),
                            letterSpacing: -0.1,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const Divider(height: 0.5, thickness: 0.5, color: Color(0xFF38383A)),
              ],

              // Items List with Dividers between items only
              Flexible(
                child: SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  padding: EdgeInsets.only(bottom: math.max(16, safeBottom + 8)),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (int i = 0; i < items.length; i++) ...[
                        _ActionMenuRow(item: items[i]),
                        if (i < items.length - 1)
                          const Divider(
                            height: 0.5,
                            thickness: 0.5,
                            indent: 56,
                            color: Color(0xFF38383A),
                          ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
