import 'dart:ui' show ImageFilter;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/tokens/app_typography.dart';
import '../../design_system/widgets/monogram_avatar.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../models/artist_ref.dart';
import '../../services/artist_service.dart';
import 'artist_screen.dart';

/// Shows an Apple Music-style context popover or bottom sheet for single or multiple artists.
Future<void> showArtistPopup(
  BuildContext context, {
  required List<ArtistRef> artists,
  String? currentArtistName,
}) async {
  HapticFeedback.lightImpact();

  final effectiveList = artists.isNotEmpty
      ? artists
      : (currentArtistName != null && currentArtistName.trim().isNotEmpty)
          ? [ArtistRef.fromName(currentArtistName)]
          : [ArtistRef.fromName('Unknown Artist')];

  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (ctx) => _ArtistPopupSheet(artists: effectiveList),
  );
}

class _ArtistPopupSheet extends StatefulWidget {
  const _ArtistPopupSheet({required this.artists});

  final List<ArtistRef> artists;

  @override
  State<_ArtistPopupSheet> createState() => _ArtistPopupSheetState();
}

class _ArtistPopupSheetState extends State<_ArtistPopupSheet> {
  final Set<String> _following = {};
  final Map<String, String> _stats = {};

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    for (final a in widget.artists) {
      if (a.name.trim().isEmpty || a.name == 'Unknown Artist') continue;
      try {
        final profile = await ArtistService.instance.getArtist(a.name);
        if (mounted && profile != null) {
          setState(() {
            _stats[a.id] = profile.monthlyAudience ?? profile.subscriberCount;
          });
        }
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.65,
      ),
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      decoration: BoxDecoration(
        color: const Color(0xE61E1E22),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.12),
          width: 0.8,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.5),
            blurRadius: 32,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Grabber
              Padding(
                padding: const EdgeInsets.only(top: 10, bottom: 8),
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Title Header
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 6, 20, 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      widget.artists.length > 1 ? 'Featured Artists' : 'Artist',
                      style: AppTypography.headline.copyWith(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    PressableScale(
                      onTap: () => Navigator.pop(context),
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

              const Divider(height: 1, color: Color(0x1AFFFFFF)),

              // Artists list
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottomInset),
                  itemCount: widget.artists.length,
                  separatorBuilder: (_, index) => const SizedBox(height: 12),
                  itemBuilder: (context, i) {
                    final artist = widget.artists[i];
                    final statLine = _stats[artist.id] ?? 'Popular Artist';
                    final isFollowed = _following.contains(artist.id);

                    return Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.08),
                          width: 0.5,
                        ),
                      ),
                      child: Row(
                        children: [
                          // Avatar
                          ClipOval(
                            child: SizedBox(
                              width: 60,
                              height: 60,
                              child: artist.imageUrl != null && artist.imageUrl!.isNotEmpty
                                  ? CachedNetworkImage(
                                      imageUrl: artist.imageUrl!,
                                      fit: BoxFit.cover,
                                      errorWidget: (_, url, error) => MonogramAvatar(
                                        name: artist.name,
                                        size: 60,
                                        isCircle: true,
                                      ),
                                    )
                                  : MonogramAvatar(
                                      name: artist.name,
                                      size: 60,
                                      isCircle: true,
                                    ),
                            ),
                          ),
                          const SizedBox(width: 14),

                          // Name and Stats
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  artist.name,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppTypography.headline.copyWith(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  statLine,
                                  style: AppTypography.caption.copyWith(
                                    color: AppColors.textSecondary,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),

                          // Actions: Follow & View
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              PressableScale(
                                onTap: () {
                                  HapticFeedback.selectionClick();
                                  setState(() {
                                    if (isFollowed) {
                                      _following.remove(artist.id);
                                    } else {
                                      _following.add(artist.id);
                                    }
                                  });
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                  decoration: ShapeDecoration(
                                    shape: const StadiumBorder(),
                                    color: isFollowed
                                        ? AppColors.accent.withValues(alpha: 0.2)
                                        : Colors.white.withValues(alpha: 0.12),
                                  ),
                                  child: Text(
                                    isFollowed ? 'Following' : 'Follow',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: isFollowed ? AppColors.accent : Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 6),
                              PressableScale(
                                onTap: () {
                                  Navigator.pop(context);
                                  Navigator.push(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => ArtistScreen(
                                        artistName: artist.name,
                                        imageUrl: artist.imageUrl,
                                      ),
                                    ),
                                  );
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        'View',
                                        style: TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                          color: Colors.white70,
                                        ),
                                      ),
                                      SizedBox(width: 2),
                                      Icon(Icons.chevron_right_rounded, size: 14, color: Colors.white70),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
