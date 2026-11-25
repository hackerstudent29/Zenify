import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/widgets/monogram_avatar.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../models/track.dart';
import '../../services/album_resolver.dart';
import '../../services/lyrics_service.dart';
import '../../services/media_router.dart';
import '../../services/player_state.dart';
import '../../services/song_credits_service.dart';
import '../../utils/media_normalizer.dart';
import '../lyrics/full_lyrics_screen.dart';
import '../shell_screen.dart' show ShellNavigationScope;
import 'artist_screen.dart';

/// Apple Music-style Song Credits page with [DynamicIslandHeader], View Lyrics link
/// (dimmed & disabled when unavailable), distributor, movie/cast, composers,
/// lyricists, singers, and clickable YouTube Music artist profiles.
class SongCreditsScreen extends StatefulWidget {
  const SongCreditsScreen({
    super.key,
    required this.track,
    this.initialCredits,
    this.initialLyrics,
    this.lyricsAlreadyChecked = false,
  });

  final Track track;
  final SongCredits? initialCredits;
  final LyricsResult? initialLyrics;
  final bool lyricsAlreadyChecked;

  @override
  State<SongCreditsScreen> createState() => _SongCreditsScreenState();
}

class _SongCreditsScreenState extends State<SongCreditsScreen> {
  final ScrollController _sc = ScrollController();
  late SongCredits _credits;
  LyricsResult? _lyrics;
  bool _checkingLyrics = true;
  bool _loadingCredits = true;

  @override
  void initState() {
    super.initState();
    _credits =
        widget.initialCredits ??
        SongCreditsService.instance.baselineFromTrack(widget.track);
    if (widget.lyricsAlreadyChecked) {
      _lyrics = widget.initialLyrics;
      _checkingLyrics = false;
    } else if (widget.initialLyrics != null &&
        widget.initialLyrics!.isNotEmpty) {
      _lyrics = widget.initialLyrics;
      _checkingLyrics = false;
    } else {
      _loadLyricsStatus();
    }
    _loadCredits();
  }

  @override
  void dispose() {
    _sc.dispose();
    super.dispose();
  }

  Future<void> _loadLyricsStatus() async {
    if (widget.track.isVideo || AlbumResolver.isVideoTrack(widget.track)) {
      if (mounted) {
        setState(() {
          _lyrics = null;
          _checkingLyrics = false;
        });
      }
      return;
    }

    try {
      final player = context.read<PlayerState>();
      final curId = player.currentTrack?.id.replaceFirst('yt-', '').trim();
      final targetId = widget.track.id.replaceFirst('yt-', '').trim();
      if (curId != null && curId == targetId) {
        if (player.hasLyrics) {
          if (mounted) {
            setState(() {
              _lyrics = LyricsResult(
                lines: player.lyricsLines,
                synced: player.lyricsSynced,
                source: 'player_cache',
              );
              _checkingLyrics = false;
            });
          }
          return;
        }
        if (!player.isLoadingLyrics) {
          if (mounted) {
            setState(() {
              _lyrics = null;
              _checkingLyrics = false;
            });
          }
          return;
        }
      }
    } catch (_) {}

    final mem = LyricsService.instance.getCachedSync(widget.track.id);
    if (mem != null && mem.isNotEmpty) {
      if (mounted) {
        setState(() {
          _lyrics = mem;
          _checkingLyrics = false;
        });
      }
      return;
    }

    final fetched = await LyricsService.instance
        .fetchLyrics(widget.track)
        .catchError((_) => null);
    if (!mounted) return;
    setState(() {
      _lyrics = fetched;
      _checkingLyrics = false;
    });
  }

  Future<void> _loadCredits() async {
    if (widget.initialCredits != null) {
      if (mounted) setState(() => _loadingCredits = false);
      return;
    }
    try {
      await SongCreditsService.instance.fetchCredits(
        widget.track,
        onProgress: (updated) {
          if (mounted) {
            setState(() => _credits = updated);
          }
        },
      );
    } finally {
      if (mounted) {
        setState(() => _loadingCredits = false);
      }
    }
  }

  void _openLyrics() {
    if (_lyrics == null || _lyrics!.isEmpty) return;
    HapticFeedback.lightImpact();
    final page = FullLyricsScreen(track: widget.track, initialLyrics: _lyrics);
    if (!ShellNavigationScope.openPage(context, page)) {
      Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => page));
    }
  }

  void _openArtist(CreditPerson person) {
    if (!person.isClickable) return;
    HapticFeedback.selectionClick();
    final page = ArtistScreen(
      artistName: person.name,
      browseId: person.browseId,
      imageUrl: person.imageUrl,
    );
    if (!ShellNavigationScope.openPage(context, page)) {
      Navigator.of(context).push(ZenPageRoute<void>(builder: (_) => page));
    }
  }

  void _openAlbumOrMovie(String title) {
    HapticFeedback.selectionClick();
    MediaRouter.openRelease(
      context,
      albumTitle: title,
      artistName: _credits.displayArtists.isNotEmpty
          ? _credits.displayArtists
          : widget.track.artist,
      coverUrl: widget.track.coverUrl,
      browseId: _credits.albumBrowseId,
      initialTracks: [widget.track],
      useShellTab: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final safeTop = mq.padding.top;
    final safeBottom = mq.padding.bottom;
    final headerClearance = math.max(54.0, safeTop + 4.0) + 46.0 + 18.0;

    final cover = MediaNormalizer.upgradeArtworkUrl(
      widget.track.coverUrl,
      videoId: widget.track.id,
    );
    final hasLyrics = _lyrics != null && _lyrics!.isNotEmpty;

    bool isThisPlaying = false;
    try {
      final p = context.watch<PlayerState>();
      final curNorm = p.currentTrack?.id.replaceFirst('yt-', '').trim();
      final targetNorm = widget.track.id.replaceFirst('yt-', '').trim();
      isThisPlaying =
          curNorm != null && curNorm == targetNorm && p.isPlaying;
    } catch (_) {}

    final summary = _credits.summaryLine();

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          CustomScrollView(
            controller: _sc,
            physics: const BouncingScrollPhysics(
              parent: AlwaysScrollableScrollPhysics(),
            ),
            slivers: [
              SliverPadding(
                padding: EdgeInsets.fromLTRB(
                  20,
                  headerClearance,
                  20,
                  safeBottom + 180,
                ),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    // Hero artwork + title + subtitle + Play pill (Screenshot 2)
                    Center(
                      child: Container(
                        width: 204,
                        height: 204,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(16),
                          color: const Color(0xFF1C1C1E),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.55),
                              blurRadius: 24,
                              offset: const Offset(0, 12),
                            ),
                          ],
                          border: Border.all(
                            color: Colors.white.withValues(alpha: 0.08),
                            width: 0.5,
                          ),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: cover.startsWith('http')
                              ? CachedNetworkImage(
                                  imageUrl: cover,
                                  fit: BoxFit.cover,
                                  errorWidget: (_, _, _) => const Icon(
                                    CupertinoIcons.music_note,
                                    color: Colors.white54,
                                    size: 48,
                                  ),
                                )
                              : const Icon(
                                  CupertinoIcons.music_note,
                                  color: Colors.white54,
                                  size: 48,
                                ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      _credits.title,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontFamily: 'SF Pro Display',
                        fontSize: 21,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        letterSpacing: -0.4,
                        height: 1.2,
                      ),
                    ),
                    if (summary.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        summary,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontFamily: 'SF Pro',
                          fontSize: 13.5,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withValues(alpha: 0.58),
                          height: 1.35,
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),

                    // Centered Play pill
                    Center(
                      child: PressableScale(
                        scale: 0.96,
                        onTap: () {
                          HapticFeedback.lightImpact();
                          final player = context.read<PlayerState>();
                          final curNorm = player.currentTrack?.id
                              .replaceFirst('yt-', '')
                              .trim();
                          final targetNorm = widget.track.id
                              .replaceFirst('yt-', '')
                              .trim();
                          if (curNorm == targetNorm) {
                            player.togglePlayPause();
                          } else {
                            player.playMedia(widget.track);
                          }
                        },
                        child: Container(
                          height: 46,
                          padding: const EdgeInsets.symmetric(horizontal: 54),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1C1C1E),
                            borderRadius: BorderRadius.circular(23),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                isThisPlaying
                                    ? CupertinoIcons.pause_fill
                                    : CupertinoIcons.play_fill,
                                color: Colors.white,
                                size: 17,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                isThisPlaying ? 'Pause' : 'Play',
                                style: const TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontSize: 15.5,
                                  fontWeight: FontWeight.w600,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // "View Lyrics >" card: bright & clickable if available, dimmed & disabled otherwise
                    _ViewLyricsButton(
                      enabled: hasLyrics,
                      loading: _checkingLyrics,
                      onTap: hasLyrics ? _openLyrics : null,
                    ),
                    const SizedBox(height: 28),

                    if (_credits.performingArtists.isNotEmpty) ...[
                      _SectionTitle('Performing Artists'),
                      _CreditCard(
                        children: _buildPersonRows(_credits.performingArtists),
                      ),
                      const SizedBox(height: 26),
                    ],

                    if (_credits.compositionAndLyrics.isNotEmpty) ...[
                      _SectionTitle('Composition & Lyrics'),
                      _CreditCard(
                        children: _buildPersonRows(_credits.compositionAndLyrics),
                      ),
                      const SizedBox(height: 26),
                    ],

                    if (_hasMovieSection(_credits)) ...[
                      _SectionTitle('Movie & Cast'),
                      _CreditCard(
                        children: [
                          if (_credits.movieName != null &&
                              _credits.movieName!.isNotEmpty)
                            _InfoCreditRow(
                              label: 'Movie',
                              value: _credits.movieName!,
                              icon: CupertinoIcons.film,
                              onTap: () =>
                                  _openAlbumOrMovie(_credits.movieName!),
                            ),
                          if (_credits.director != null &&
                              _credits.director!.isNotEmpty)
                            _InfoCreditRow(
                              label: 'Directed By',
                              value: _credits.director!,
                              icon: CupertinoIcons.videocam,
                            ),
                          ..._buildPersonRows(_credits.movieCast),
                        ],
                      ),
                      const SizedBox(height: 26),
                    ],

                    if (_credits.productionAndEngineering.isNotEmpty) ...[
                      _SectionTitle('Production & Engineering'),
                      _CreditCard(
                        children: _buildPersonRows(
                          _credits.productionAndEngineering,
                        ),
                      ),
                      const SizedBox(height: 26),
                    ],

                    if (_hasReleaseSection(_credits)) ...[
                      _SectionTitle('Release & Distribution'),
                      _CreditCard(
                        children: [
                          if (_credits.distributor != null &&
                              _credits.distributor!.isNotEmpty)
                            _InfoCreditRow(
                              label: 'Distributor',
                              value: _credits.distributor!,
                              icon: CupertinoIcons.paperplane,
                            ),
                          if (_credits.label != null &&
                              _credits.label!.isNotEmpty)
                            _InfoCreditRow(
                              label: 'Record Label / Publisher',
                              value: _credits.label!,
                              icon: CupertinoIcons.building_2_fill,
                            ),
                          if (_credits.album != null &&
                              _credits.album!.isNotEmpty)
                            _InfoCreditRow(
                              label: 'Album',
                              value: _credits.album!,
                              icon: CupertinoIcons.music_albums,
                              onTap: () => _openAlbumOrMovie(_credits.album!),
                            ),
                          if (_credits.releaseDate != null &&
                              _credits.releaseDate!.isNotEmpty)
                            _InfoCreditRow(
                              label: 'Release Date',
                              value: _credits.releaseDate!,
                              icon: CupertinoIcons.calendar,
                            ),
                          if (_credits.genre != null &&
                              _credits.genre!.isNotEmpty)
                            _InfoCreditRow(
                              label: 'Genre',
                              value: _credits.genre!,
                              icon: CupertinoIcons.guitars,
                            ),
                          if (_credits.copyright != null &&
                              _credits.copyright!.isNotEmpty)
                            _InfoCreditRow(
                              label: 'Copyright',
                              value: _credits.copyright!,
                              icon: CupertinoIcons.shield,
                            ),
                        ],
                      ),
                    ],

                    if (_loadingCredits)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 20),
                        child: Center(
                          child: CupertinoActivityIndicator(radius: 10),
                        ),
                      ),
                  ]),
                ),
              ),
            ],
          ),

          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandHeader(
              title: MediaNormalizer.cleanTitle(widget.track.title),
              showBack: true,
              onBack: () => Navigator.of(context).pop(),
              scrollController: _sc,
              revealOffset: 240,
              onMore: () => ZenDropdown.showTrackMenu(
                context: context,
                track: widget.track,
              ),
            ),
          ),
        ],
      ),
    );
  }

  bool _hasMovieSection(SongCredits c) =>
      (c.movieName != null && c.movieName!.isNotEmpty) ||
      (c.director != null && c.director!.isNotEmpty) ||
      c.movieCast.isNotEmpty;

  bool _hasReleaseSection(SongCredits c) =>
      (c.distributor != null && c.distributor!.isNotEmpty) ||
      (c.label != null && c.label!.isNotEmpty) ||
      (c.album != null && c.album!.isNotEmpty) ||
      (c.releaseDate != null && c.releaseDate!.isNotEmpty) ||
      (c.genre != null && c.genre!.isNotEmpty) ||
      (c.copyright != null && c.copyright!.isNotEmpty);

  List<Widget> _buildPersonRows(List<CreditPerson> people) => [
    for (final person in people)
      _PersonCreditRow(
        person: person,
        onTap: person.isClickable ? () => _openArtist(person) : null,
      ),
  ];
}

class _ViewLyricsButton extends StatelessWidget {
  const _ViewLyricsButton({
    required this.enabled,
    required this.loading,
    required this.onTap,
  });

  final bool enabled;
  final bool loading;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final dimOpacity = enabled ? 1.0 : (loading ? 0.45 : 0.35);

    Widget content = Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Opacity(
        opacity: dimOpacity,
        child: Row(
          children: [
            const Icon(
              CupertinoIcons.quote_bubble,
              color: Colors.white,
              size: 20,
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Text(
                'View Lyrics',
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Colors.white,
                ),
              ),
            ),
            if (loading)
              const CupertinoActivityIndicator(radius: 8)
            else
              Icon(
                CupertinoIcons.chevron_right,
                color: Colors.white.withValues(alpha: enabled ? 0.55 : 0.35),
                size: 16,
              ),
          ],
        ),
      ),
    );

    if (!enabled || onTap == null) {
      return IgnorePointer(ignoring: true, child: content);
    }

    return PressableScale(
      scale: 0.98,
      onTap: onTap,
      child: content,
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 4, bottom: 10),
    child: Text(
      text,
      style: const TextStyle(
        fontFamily: 'SF Pro Display',
        fontSize: 19,
        fontWeight: FontWeight.w700,
        color: Colors.white,
        letterSpacing: -0.3,
      ),
    ),
  );
}

class _CreditCard extends StatelessWidget {
  const _CreditCard({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(20),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (int i = 0; i < children.length; i++) ...[
            children[i],
            if (i < children.length - 1)
              const Divider(
                height: 0.5,
                thickness: 0.5,
                indent: 72,
                color: Color(0xFF2C2C2E),
              ),
          ],
        ],
      ),
    );
  }
}

class _PersonCreditRow extends StatelessWidget {
  const _PersonCreditRow({required this.person, this.onTap});

  final CreditPerson person;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final row = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          SizedBox(
            width: 42,
            height: 42,
            child: ClipOval(
              child: (person.imageUrl != null &&
                      person.imageUrl!.startsWith('http'))
                  ? CachedNetworkImage(
                      imageUrl: person.imageUrl!,
                      fit: BoxFit.cover,
                      errorWidget: (_, _, _) =>
                          MonogramAvatar(name: person.name, size: 42),
                    )
                  : MonogramAvatar(name: person.name, size: 42),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  person.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  person.role,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.55),
                  ),
                ),
              ],
            ),
          ),
          if (person.isClickable) ...[
            const SizedBox(width: 8),
            Icon(
              CupertinoIcons.chevron_right,
              color: Colors.white.withValues(alpha: 0.38),
              size: 15,
            ),
          ],
        ],
      ),
    );

    if (onTap == null) return row;
    return PressableScale(scale: 0.985, onTap: onTap, child: row);
  }
}

class _InfoCreditRow extends StatelessWidget {
  const _InfoCreditRow({
    required this.label,
    required this.value,
    required this.icon,
    this.onTap,
  });

  final String label;
  final String value;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final row = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: const BoxDecoration(
              color: Color(0xFF2C2C2E),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.white70, size: 19),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 12.5,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withValues(alpha: 0.52),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'SF Pro',
                    fontSize: 15.5,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                    letterSpacing: -0.2,
                  ),
                ),
              ],
            ),
          ),
          if (onTap != null) ...[
            const SizedBox(width: 8),
            Icon(
              CupertinoIcons.chevron_right,
              color: Colors.white.withValues(alpha: 0.38),
              size: 15,
            ),
          ],
        ],
      ),
    );

    if (onTap == null) return row;
    return PressableScale(scale: 0.985, onTap: onTap, child: row);
  }
}
