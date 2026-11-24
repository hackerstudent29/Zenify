import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/cupertino.dart' hide RepeatMode;
import 'package:flutter/material.dart' hide RepeatMode;
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/widgets/equalizer_bars.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/motion/zen_page_route.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/player_state.dart';
import '../../services/queue_state.dart';
import '../../utils/media_normalizer.dart';
import '../details/album_screen.dart';
import 'player_kit.dart';

/// Apple-Music style queue.
///
///  [ shuffle ] [ repeat ] [ automix ]      <- fixed pills (never scroll)
///  History (collapsible)
///  Playing
///  In Queue   (songs the user added: drag to reorder, swipe to remove)
///  Up Next    (rest of the context + automix: drag to reorder, swipe to remove)
///
/// Needs `QueueEntry.addedByUser` (bool). See the QueueState notes.
class QueuePanel extends StatefulWidget {
  const QueuePanel({
    super.key,
    required this.onJumpTo,
    required this.onPlayHistory,
    this.onGoToArtist,
    this.onReorderingChanged,
  });

  final void Function(QueueEntry entry) onJumpTo;
  final void Function(QueueEntry entry) onPlayHistory;
  final void Function(dynamic track)? onGoToArtist;

  /// true while a row is being dragged, so the sheet can ignore the
  /// overscroll / auto-scroll that a drag near the edge produces.
  final ValueChanged<bool>? onReorderingChanged;

  @override
  State<QueuePanel> createState() => _QueuePanelState();
}

class _QueuePanelState extends State<QueuePanel> {
  bool _historyOpen = false;
  Timer? _undoTimer;
  int _seenToken = 0;

  @override
  void dispose() {
    _undoTimer?.cancel();
    widget.onReorderingChanged?.call(false);
    super.dispose();
  }

  void _armUndo(QueueState q) {
    if (q.undoToken == _seenToken) return;
    _seenToken = q.undoToken;
    _undoTimer?.cancel();
    if (q.canUndo) {
      _undoTimer = Timer(const Duration(seconds: 4), q.dismissUndo);
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = context.watch<QueueState>();
    final player = context.watch<PlayerState>();
    _armUndo(q);

    final current = player.currentTrack;
    final up = q.upNext;
    final hist = q.history;
    final queued = up.where((e) => e.isManualPin).toList();
    final upcoming = up.where((e) => !e.isManualPin).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 4, 24, 6),
          child: _pills(q),
        ),
        Expanded(
          child: Stack(
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: CustomScrollView(
                  // clamping so pull-down-to-dismiss (overscroll) still works
                  physics: const ClampingScrollPhysics(
                    parent: AlwaysScrollableScrollPhysics(),
                  ),
                  slivers: [
                    if (hist.isNotEmpty)
                      SliverToBoxAdapter(child: _historySection(hist)),
                    const SliverToBoxAdapter(child: _SectionTitle('Playing')),
                    if (current != null)
                      SliverToBoxAdapter(
                        child: _TrackRow(
                          track: current,
                          highlight: true,
                          onTap: () {},
                          trailing: EqualizerBars(
                            isPlaying: player.isPlaying,
                            size: 16,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    if (queued.isNotEmpty) ...[
                      SliverToBoxAdapter(
                        child: _SectionTitle(
                          'In Queue',
                          count: queued.length,
                          action: 'Clear',
                          onAction: () {
                            HapticFeedback.mediumImpact();
                            for (final e in List.of(queued)) {
                              q.remove(e);
                            }
                          },
                        ),
                      ),
                      _reorderSection(q, up, queued),
                    ],
                    SliverToBoxAdapter(
                      child: _SectionTitle('Up Next', count: upcoming.length),
                    ),
                    if (upcoming.isEmpty)
                      SliverToBoxAdapter(child: _empty(q))
                    else
                      _reorderSection(q, up, upcoming),
                    if (q.autoplay)
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.only(top: 16),
                          child: Row(
                            children: [
                              Icon(
                                CupertinoIcons.infinite,
                                size: 16,
                                color: Colors.white.withValues(alpha: 0.45),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'Automix adds similar songs (genre, language) when the queue runs low.',
                                  style: TextStyle(
                                    color: Colors.white.withValues(alpha: 0.45),
                                    fontSize: 13,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    const SliverToBoxAdapter(child: SizedBox(height: 48)),
                  ],
                ),
              ),
              Positioned(left: 24, right: 24, bottom: 10, child: _undoToast(q)),
            ],
          ),
        ),
      ],
    );
  }

  /* ───────────────────────── pieces ───────────────────────── */

  Widget _pills(QueueState q) {
    final repeatOn = q.repeatMode != RepeatMode.off;
    return Row(
      children: [
        Expanded(
          child: _Pill(
            icon: CupertinoIcons.shuffle,
            active: q.shuffle,
            onTap: () {
              HapticFeedback.selectionClick();
              q.toggleShuffle();
            },
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _Pill(
            icon: q.repeatMode == RepeatMode.one
                ? CupertinoIcons.repeat_1
                : CupertinoIcons.repeat,
            active: repeatOn,
            onTap: () {
              HapticFeedback.selectionClick();
              q.cycleRepeat(); // off -> loop queue -> loop song once -> off
            },
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _Pill(
            icon: CupertinoIcons.infinite,
            active: q.autoplay,
            onTap: () {
              HapticFeedback.selectionClick();
              q.toggleAutoplay(refreshIfOn: true); // automix (tap again to refresh batch)
            },
          ),
        ),
      ],
    );
  }

  Widget _reorderSection(
    QueueState q,
    List<QueueEntry> all,
    List<QueueEntry> sec,
  ) {
    return SliverReorderableList(
      itemCount: sec.length,
      onReorderStart: (_) {
        HapticFeedback.mediumImpact();
        widget.onReorderingChanged?.call(true);
      },
      onReorderEnd: (_) => widget.onReorderingChanged?.call(false),
      onReorderItem: (o, n) {
        if (o < 0 || o >= sec.length) return;
        HapticFeedback.selectionClick();
        q.reorderInSection(sec[o], o, n, sec);
      },
      proxyDecorator: _proxy,
      findChildIndexCallback: (key) {
        if (key is ValueKey<int>) {
          final i = sec.indexWhere((e) => e.uid == key.value);
          return i < 0 ? null : i;
        }
        return null;
      },
      itemBuilder: (context, i) {
        final e = sec[i];
        return Dismissible(
          key: ValueKey<int>(e.uid),
          direction: DismissDirection.endToStart,
          onDismissed: (_) {
            HapticFeedback.lightImpact();
            q.remove(e);
          },
          background: Container(
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.only(right: 22),
            margin: const EdgeInsets.symmetric(vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFFF453A),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(
              CupertinoIcons.trash_fill,
              color: Colors.white,
              size: 20,
            ),
          ),
          child: _TrackRow(
            track: e.track,
            onTap: () {
              HapticFeedback.selectionClick();
              widget.onJumpTo(e);
            },
            onLongPress: () => _menu(q, e),
            // The handle claims the vertical drag immediately (no long press),
            // so reordering never fights the list scroll or the sheet.
            trailing: ReorderableDragStartListener(
              index: i,
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Icon(
                  CupertinoIcons.line_horizontal_3,
                  color: Colors.white.withValues(alpha: 0.45),
                  size: 22,
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _historySection(List<QueueEntry> hist) {
    final shown = hist.length > 30 ? hist.sublist(hist.length - 30) : hist;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PressableScale(
          onTap: () {
            HapticFeedback.selectionClick();
            setState(() => _historyOpen = !_historyOpen);
          },
          child: ColoredBox(
            color: Colors.transparent,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  const Text('History', style: _kTitle),
                  const SizedBox(width: 8),
                  Text(
                    '${hist.length}',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.5),
                      fontSize: 15,
                    ),
                  ),
                  const Spacer(),
                  AnimatedRotation(
                    turns: _historyOpen ? 0.25 : 0,
                    duration: const Duration(milliseconds: 320),
                    curve: Curves.easeOutBack,
                    child: Icon(
                      Icons.chevron_right_rounded,
                      color: Colors.white.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 520),
          curve: const SpringCurve(kSoftSpring, 0.5),
          alignment: Alignment.topCenter,
          child: ClipRect(
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 260),
              child: _historyOpen
                  ? Column(
                      key: const ValueKey('h-open'),
                      children: [
                        for (var i = 0; i < shown.length; i++)
                          FadeSlideIn(
                            delay: Duration(milliseconds: 20 * math.min(i, 8)),
                            dy: 10,
                            child: _TrackRow(
                              track: shown[i].track,
                              dim: true,
                              onTap: () {
                                HapticFeedback.selectionClick();
                                widget.onPlayHistory(shown[i]);
                              },
                            ),
                          ),
                        const SizedBox(height: 8),
                      ],
                    )
                  : const SizedBox(
                      key: ValueKey('h-closed'),
                      width: double.infinity,
                    ),
            ),
          ),
        ),
        const SizedBox(height: 6),
      ],
    );
  }

  Widget _empty(QueueState q) {
    return FadeSlideIn(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 36),
        child: Column(
          children: [
            Icon(
              Icons.queue_music_rounded,
              size: 44,
              color: Colors.white.withValues(alpha: 0.3),
            ),
            const SizedBox(height: 12),
            const Text(
              'Nothing up next',
              style: TextStyle(
                color: Colors.white,
                fontSize: 17,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              q.autoplay
                  ? 'Automix will pick what comes next.'
                  : 'Add songs to keep the music going.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.55),
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _proxy(Widget child, int index, Animation<double> animation) {
    return AnimatedBuilder(
      animation: animation,
      builder: (_, _) {
        final t = Curves.easeOut.transform(animation.value);
        return Transform.scale(
          scale: 1 + 0.04 * t,
          child: Material(
            type: MaterialType.transparency,
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.14 * t),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.4 * t),
                    blurRadius: 26 * t,
                    offset: Offset(0, 10 * t),
                  ),
                ],
              ),
              child: child,
            ),
          ),
        );
      },
    );
  }

  Widget _undoToast(QueueState q) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 380),
      switchInCurve: Curves.easeOutBack,
      switchOutCurve: Curves.easeInCubic,
      transitionBuilder: (c, a) => FadeTransition(
        opacity: a,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 1.2),
            end: Offset.zero,
          ).animate(a),
          child: c,
        ),
      ),
      child: q.canUndo
          ? ClipRRect(
              key: ValueKey(q.undoToken),
              borderRadius: BorderRadius.circular(22),
              child: BackdropFilter(
                filter: ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(18, 12, 12, 12),
                  decoration: BoxDecoration(
                    color: const Color(0xCC1C1C1E),
                    borderRadius: BorderRadius.circular(22),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.12),
                      width: 0.8,
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          q.undoLabel ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14.5,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      PressableScale(
                        onTap: () {
                          HapticFeedback.lightImpact();
                          _undoTimer?.cancel();
                          q.undo();
                        },
                        child: const Padding(
                          padding: EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          child: Text(
                            'Undo',
                            style: TextStyle(
                              color: AppColors.accent,
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            )
          : const SizedBox.shrink(key: ValueKey('no-undo')),
    );
  }

  void _menu(QueueState q, QueueEntry e) {
    HapticFeedback.mediumImpact();
    ZenDropdown.showTrackMenu(
      context: context,
      track: e.track,
      trackTitle: e.title,
      artistName: e.artist,
      albumName: e.track.album,
      coverUrl: e.track.coverUrl,
      onPlayNext: () => q.moveToTop(e),
      onPlayLater: () => q.moveToBottom(e),
      onGoToArtist: widget.onGoToArtist != null
          ? () {
              final names = e.track.artistNames;
              widget.onGoToArtist!(names.isNotEmpty ? names.first : e.artist);
            }
          : null,
      onGoToAlbum: () {
        final isVid = e.track.isVideo ||
            Track.detectIsVideo(e.track.title, e.track.album) ||
            e.track.album.toLowerCase() == 'music video';
        Navigator.push(
          context,
          ZenPageRoute(
            builder: (_) => AlbumScreen(
              albumTitle: isVid
                  ? MediaNormalizer.cleanTitle(e.track.title)
                  : MediaNormalizer.cleanAlbumTitle(
                      e.track.album.isNotEmpty ? e.track.album : e.title,
                    ),
              artistName: MediaNormalizer.formatArtists(e.artist),
              coverUrl: e.track.coverUrl,
              browseId: isVid ? null : e.track.albumBrowseId,
              initialTracks: [
                e.track.copyWith(isVideo: isVid ? true : e.track.isVideo),
              ],
              isVideo: isVid,
            ),
          ),
        );
      },
      extraItems: [
        ZenDropdownItem(
          title: 'Remove from Queue',
          icon: CupertinoIcons.trash,
          isDestructive: true,
          onTap: () => q.remove(e),
        ),
      ],
    );
  }
}

/* ------------------------------------------------------------------ */

const TextStyle _kTitle = TextStyle(
  fontFamily: 'SF Pro Display',
  color: Colors.white,
  fontSize: 20,
  fontWeight: FontWeight.w700,
  letterSpacing: -0.3,
);

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text, {this.count, this.action, this.onAction});
  final String text;
  final int? count;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 18, bottom: 6),
    child: Row(
      children: [
        Text(text, style: _kTitle),
        if (count != null && count! > 0) ...[
          const SizedBox(width: 8),
          Text(
            '$count',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.5),
              fontSize: 15,
            ),
          ),
        ],
        const Spacer(),
        if (action != null)
          PressableScale(
            onTap: onAction,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              child: Text(
                action!,
                style: const TextStyle(
                  color: AppColors.accent,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
      ],
    ),
  );
}

/// Wide translucent pill (shuffle / repeat / automix), like the mock.
class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.active, required this.onTap});
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onTap,
      scale: 0.94,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
        height: 44,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          color: active
              ? Colors.white.withValues(alpha: 0.92)
              : Colors.white.withValues(alpha: 0.16),
        ),
        child: Center(
          child: SpringPop(
            trigger: active,
            scale: 0.25,
            child: TweenAnimationBuilder<Color?>(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutCubic,
              tween: ColorTween(
                end: active
                    ? Colors.black.withValues(alpha: 0.85)
                    : Colors.white,
              ),
              builder: (_, c, _) => Icon(icon, size: 20, color: c),
            ),
          ),
        ),
      ),
    );
  }
}

class _TrackRow extends StatelessWidget {
  const _TrackRow({
    required this.track,
    required this.onTap,
    this.onLongPress,
    this.trailing,
    this.highlight = false,
    this.dim = false,
  });

  final dynamic track;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;
  final Widget? trailing;
  final bool highlight;
  final bool dim;

  @override
  Widget build(BuildContext context) {
    final bool isVideo = (track is Track && track.isVideo) ||
        (track.id is String &&
            ((track.id as String).startsWith('vid-') ||
                (track.id as String).startsWith('video-'))) ||
        (track is Track &&
            Track.detectIsVideo(track.title, track.album,
                coverUrl: track.coverUrl)) ||
        (track.coverUrl is String &&
            ((track.coverUrl as String).contains('/vi/') ||
                (track.coverUrl as String).contains('ytimg.com/vi') ||
                (track.coverUrl as String).contains('maxresdefault') ||
                (track.coverUrl as String).contains('hqdefault')));

    return GestureDetector(
      onLongPress: onLongPress,
      child: PressableScale(
        onTap: onTap,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: dim ? 0.62 : 1,
          child: ColoredBox(
            color: Colors.transparent,
            child: Container(
              margin: const EdgeInsets.symmetric(vertical: 4),
              padding: EdgeInsets.symmetric(
                vertical: 6,
                horizontal: highlight ? 10 : 0,
              ),
              decoration: highlight
                  ? BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(16),
                    )
                  : null,
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(isVideo ? 6 : 9),
                    child: SizedBox(
                      width: isVideo ? 76 : 48,
                      height: 48,
                      child: CoverImage(track.coverUrl as String),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          MediaNormalizer.cleanCompactTitle(
                            track.title as String,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        const SizedBox(height: 1),
                        Text(
                          track is Track
                              ? track.displayArtists
                              : MediaNormalizer.formatArtists(track.artist),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.6),
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                  ?trailing,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
