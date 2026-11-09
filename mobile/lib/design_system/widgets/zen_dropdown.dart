import 'dart:ui';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../models/track.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../utils/media_normalizer.dart';
import '../../views/details/album_screen.dart';
import '../../views/details/artist_popup.dart';
import '../../views/details/artist_screen.dart';
import '../tokens/app_colors.dart';
import '../tokens/app_typography.dart';
import 'pressable_scale.dart';

/// Single item within a ZenDropdown menu.
class ZenDropdownItem {
  const ZenDropdownItem({
    required this.title,
    required this.icon,
    this.subtitle,
    this.isDestructive = false,
    this.isSelected = false,
    this.onTap,
  });

  final String title;
  final IconData icon;
  final String? subtitle;
  final bool isDestructive;
  final bool isSelected;
  final VoidCallback? onTap;
}

/// Compact Apple-inspired Contextual Dropdown Menu used across all Zenify screens.
class ZenDropdown {
  ZenDropdown._();

  /// Displays a compact Apple-style floating menu.
  static Future<T?> show<T>({
    required BuildContext context,
    String? title,
    String? subtitle,
    Widget? header,
    required List<ZenDropdownItem> items,
  }) {
    HapticFeedback.selectionClick();

    return showCupertinoModalPopup<T>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.55),
      builder: (ctx) {
        final safeBottom = MediaQuery.paddingOf(ctx).bottom;

        return Center(
          child: Container(
            margin: EdgeInsets.fromLTRB(20, 20, 20, safeBottom + 20),
            constraints: const BoxConstraints(maxWidth: 340),
            decoration: BoxDecoration(
              color: const Color(0xF21C1C1F), // Frosted elevated dark neutral
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.12),
                width: 0.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.4),
                  blurRadius: 36,
                  offset: const Offset(0, 16),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(18),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
                child: Material(
                  color: Colors.transparent,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Optional Header
                      if (header != null)
                        header
                      else if (title != null) ...[
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.center,
                                style: AppTypography.headline.copyWith(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textPrimary,
                                ),
                              ),
                              if (subtitle != null) ...[
                                const SizedBox(height: 3),
                                Text(
                                  subtitle,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.center,
                                  style: AppTypography.subhead.copyWith(
                                    fontSize: 12,
                                    color: AppColors.textSecondary,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                        Divider(
                          height: 0.5,
                          thickness: 0.5,
                          color: Colors.white.withValues(alpha: 0.08),
                        ),
                      ],

                      // Items list
                      Flexible(
                        child: SingleChildScrollView(
                          physics: const BouncingScrollPhysics(),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              for (int i = 0; i < items.length; i++) ...[
                                _DropdownRow(item: items[i]),
                                if (i < items.length - 1)
                                  Divider(
                                    height: 0.5,
                                    thickness: 0.5,
                                    indent: 48,
                                    color: Colors.white.withValues(alpha: 0.06),
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
            ),
          ),
        );
      },
    );
  }

  /// Preset: Track context menu (Play next, Play later, Go to artist, Go to album, Share, Like).
  static void showTrackMenu({
    required BuildContext context,
    Track? track,
    String? trackTitle,
    String? artistName,
    String? albumName,
    VoidCallback? onPlayNext,
    VoidCallback? onPlayLater,
    VoidCallback? onGoToArtist,
    VoidCallback? onGoToAlbum,
    VoidCallback? onToggleLike,
    bool? isLiked,
  }) {
    final title = track != null ? MediaNormalizer.cleanTitle(track.title) : (trackTitle ?? '');
    final artist = track != null ? MediaNormalizer.formatArtists(track.artist) : (artistName ?? '');
    final album = (track != null && track.album.isNotEmpty && track.album != 'Single')
        ? MediaNormalizer.cleanAlbumTitle(track.album)
        : (albumName ?? '');
    final liked = isLiked ?? (track != null ? LibraryStore.instance.isLiked(track) : false);

    final playNextAction = onPlayNext ??
        (track != null ? () => context.read<PlayerState>().playNext(track) : null);
    final playLaterAction = onPlayLater ??
        (track != null ? () => context.read<PlayerState>().playLast(track) : null);
    final likeAction = onToggleLike ??
        (track != null ? () => LibraryStore.instance.toggleLove(track) : null);

    final goToArtistAction = onGoToArtist ??
        (track != null
            ? () {
                final resolved = track.resolvedArtists;
                if (resolved.length > 1) {
                  showArtistPopup(context, artists: resolved);
                } else if (resolved.isNotEmpty) {
                  Navigator.push(
                    context,
                    CupertinoPageRoute(
                      builder: (_) => ArtistScreen(artistName: resolved.first.name),
                    ),
                  );
                }
              }
            : null);

    final goToAlbumAction = onGoToAlbum ??
        ((track != null && track.album.isNotEmpty && track.album != 'Single')
            ? () {
                Navigator.push(
                  context,
                  CupertinoPageRoute(
                    builder: (_) => AlbumScreen(
                      albumTitle: MediaNormalizer.cleanAlbumTitle(track.album),
                      artistName: MediaNormalizer.formatArtists(track.artist),
                      coverUrl: track.coverUrl,
                    ),
                  ),
                );
              }
            : null);

    show(
      context: context,
      title: title,
      subtitle: '$artist${album.isNotEmpty ? " • $album" : ""}',
      items: [
        if (playNextAction != null)
          ZenDropdownItem(
            title: 'Play next',
            icon: CupertinoIcons.text_insert,
            onTap: playNextAction,
          ),
        if (playLaterAction != null)
          ZenDropdownItem(
            title: 'Play later',
            icon: CupertinoIcons.text_append,
            onTap: playLaterAction,
          ),
        if (goToArtistAction != null)
          ZenDropdownItem(
            title: 'Go to artist',
            icon: CupertinoIcons.person,
            onTap: goToArtistAction,
          ),
        if (goToAlbumAction != null && album.isNotEmpty)
          ZenDropdownItem(
            title: 'Go to album',
            icon: CupertinoIcons.music_albums,
            onTap: goToAlbumAction,
          ),
        if (likeAction != null)
          ZenDropdownItem(
            title: liked ? 'Remove from Favorites' : 'Favorite',
            icon: liked ? CupertinoIcons.heart_fill : CupertinoIcons.heart,
            onTap: likeAction,
          ),
      ],
    );
  }

  /// Preset: Sort menu.
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
}

class _DropdownRow extends StatelessWidget {
  const _DropdownRow({required this.item});
  final ZenDropdownItem item;

  @override
  Widget build(BuildContext context) {
    final itemColor = item.isDestructive
        ? AppColors.danger
        : (item.isSelected ? AppColors.accent : AppColors.textPrimary);

    return PressableScale(
      onTap: () {
        HapticFeedback.selectionClick();
        Navigator.of(context, rootNavigator: true).pop();
        item.onTap?.call();
      },
      child: Container(
        color: Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        child: Row(
          children: [
            Icon(
              item.icon,
              size: 20,
              color: itemColor,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    item.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppTypography.headline.copyWith(
                      fontSize: 15,
                      fontWeight: item.isSelected ? FontWeight.w600 : FontWeight.w400,
                      color: itemColor,
                    ),
                  ),
                  if (item.subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      item.subtitle!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.subhead.copyWith(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (item.isSelected)
              const Icon(
                CupertinoIcons.checkmark,
                size: 16,
                color: AppColors.accent,
              ),
          ],
        ),
      ),
    );
  }
}

