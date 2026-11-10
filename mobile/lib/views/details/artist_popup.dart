import 'dart:math' as math;
import 'dart:ui' show ImageFilter;
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../design_system/widgets/monogram_avatar.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/zen.dart';
import '../../models/artist_ref.dart';
import '../../services/artist_service.dart';
import '../../services/library_store.dart';
import 'artist_screen.dart';

/// Shows an Apple Music-style context popover or bottom sheet for single or multiple artists.
Future<void> showArtistPopup(
  BuildContext context, {
  List<ArtistRef>? artists,
  String? currentArtistName,
}) async {
  HapticFeedback.lightImpact();

  List<ArtistRef> effectiveList = [];
  if (artists != null && artists.isNotEmpty) {
    for (final a in artists) {
      effectiveList.addAll(ArtistRef.splitFromName(a.name, defaultImageUrl: a.imageUrl));
    }
  } else if (currentArtistName != null && currentArtistName.trim().isNotEmpty) {
    effectiveList = ArtistRef.splitFromName(currentArtistName);
  }

  // Deduplicate
  final seen = <String>{};
  effectiveList = effectiveList.where((a) => seen.add(a.name.toLowerCase())).toList();

  if (effectiveList.isEmpty) {
    effectiveList = [ArtistRef.fromName('Unknown Artist')];
  }

  final callerNav = Navigator.of(context);

  await showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.50),
    isScrollControlled: true,
    enableDrag: true,
    builder: (ctx) => _ArtistPopupSheet(
      artists: effectiveList,
      onOpenArtist: (artist) {
        Navigator.of(ctx).pop();
        callerNav.push(
          ZenPageRoute(
            builder: (_) => ArtistScreen(
              artistName: artist.name,
              imageUrl: artist.imageUrl,
            ),
          ),
        );
      },
    ),
  );
}

class _ArtistPopupSheet extends StatefulWidget {
  const _ArtistPopupSheet({
    required this.artists,
    required this.onOpenArtist,
  });

  final List<ArtistRef> artists;
  final ValueChanged<ArtistRef> onOpenArtist;

  @override
  State<_ArtistPopupSheet> createState() => _ArtistPopupSheetState();
}

class _ArtistPopupSheetState extends State<_ArtistPopupSheet> {
  final Set<String> _following = {};
  final Map<String, String> _stats = {};
  final Map<String, String> _photos = {};

  @override
  void initState() {
    super.initState();
    for (final a in widget.artists) {
      if (LibraryStore.instance.isFollowing(a.name)) {
        _following.add(a.id);
      }
      if (a.imageUrl != null && a.imageUrl!.isNotEmpty) {
        _photos[a.id] = a.imageUrl!;
      }
    }
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
            if (profile.imageUrl.isNotEmpty && (_photos[a.id] == null || _photos[a.id]!.isEmpty)) {
              _photos[a.id] = profile.imageUrl;
            }
          });
        }
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 25, sigmaY: 25),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.75,
        ),
        decoration: BoxDecoration(
          color: const Color(0xF21C1C1E), // Liquid dark glass #1C1C1E
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

              // Title Header
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      widget.artists.length > 1 ? 'Featured Artists' : 'Artist',
                      style: GoogleFonts.inter(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        letterSpacing: -0.3,
                      ),
                    ),
                    PressableScale(
                      onTap: () => Navigator.pop(context),
                      child: Container(
                        padding: const EdgeInsets.all(5),
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

              const Divider(height: 0.5, thickness: 0.5, color: Color(0xFF38383A)),

              // Artists Open Editorial List with Dividers between items only
              Flexible(
                child: SingleChildScrollView(
                  physics: const BouncingScrollPhysics(),
                  padding: EdgeInsets.only(bottom: math.max(16, bottomInset + 8)),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (int i = 0; i < widget.artists.length; i++) ...[
                        _buildArtistRow(widget.artists[i]),
                        if (i < widget.artists.length - 1)
                          const Divider(
                            height: 0.5,
                            thickness: 0.5,
                            indent: 86,
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

  Widget _buildArtistRow(ArtistRef artist) {
    final statLine = _stats[artist.id] ?? 'Artist';
    final photoUrl = _photos[artist.id] ?? artist.imageUrl;
    final isFollowed = _following.contains(artist.id);

    return Container(
      color: Colors.transparent,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        children: [
          // Circular Profile Picture (Matching Profile Page)
          GestureDetector(
            onTap: () => widget.onOpenArtist(artist),
            child: ClipOval(
              child: SizedBox(
                width: 58,
                height: 58,
                child: photoUrl != null && photoUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: photoUrl,
                        fit: BoxFit.cover,
                        errorWidget: (_, url, error) => MonogramAvatar(
                          name: artist.name,
                          size: 58,
                          isCircle: true,
                        ),
                      )
                    : MonogramAvatar(
                        name: artist.name,
                        size: 58,
                        isCircle: true,
                      ),
              ),
            ),
          ),
          const SizedBox(width: 14),

          // Name and Listeners / Subscribers
          Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => widget.onOpenArtist(artist),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    artist.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    statLine,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w400,
                      color: const Color(0xFFA1A1A6),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),

          // Apple Music Style Actions: Follow Pill & View >
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Follow Pill
              PressableScale(
                onTap: () {
                  HapticFeedback.selectionClick();
                  LibraryStore.instance.toggleFollow(artist.name, photoUrl ?? '');
                  setState(() {
                    if (isFollowed) {
                      _following.remove(artist.id);
                    } else {
                      _following.add(artist.id);
                    }
                  });
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                  decoration: ShapeDecoration(
                    shape: const StadiumBorder(),
                    color: isFollowed
                        ? Zen.rose.withValues(alpha: 0.22)
                        : Colors.white.withValues(alpha: 0.12),
                  ),
                  child: Text(
                    isFollowed ? 'Following' : 'Follow',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: isFollowed ? Zen.rose : Colors.white,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),

              // View Button
              PressableScale(
                onTap: () => widget.onOpenArtist(artist),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        'View',
                        style: GoogleFonts.inter(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFFA1A1A6),
                        ),
                      ),
                      const SizedBox(width: 2),
                      const Icon(CupertinoIcons.chevron_right, size: 12, color: Color(0xFFA1A1A6)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
