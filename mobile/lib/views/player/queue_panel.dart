import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/cupertino.dart' hide RepeatMode;
import 'package:flutter/material.dart' hide RepeatMode;
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/motion/zen_page_route.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/player_state.dart';
import '../../services/queue_state.dart';
import '../../utils/media_normalizer.dart';
import '../details/artist_screen.dart';
import '../details/album_screen.dart';
import 'player_kit.dart';

/// Apple-Music style queue: History (collapsible) · Now Playing · Playing Next.
/// Drag handle to reorder, swipe left to remove, long-press for the menu,
/// shuffle / repeat / autoplay pills, undo toast.
class QueuePanel extends StatefulWidget {
  const QueuePanel({
    super.key,
    required this.onJumpTo,
    required this.onPlayHistory,
    this.onGoToArtist,
  });

  final void Function(QueueEntry entry) onJumpTo;
  final void Function(QueueEntry entry) onPlayHistory;
  final void Function(dynamic track)? onGoToArtist;

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

    return Stack(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: CustomScrollView(
            physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
            slivers: [
              const SliverToBoxAdapter(child: SizedBox(height: 4)),
              if (hist.isNotEmpty)
                SliverToBoxAdapter(child: FadeSlideIn(child: _historySection(hist))),
              const SliverToBoxAdapter(
                child: FadeSlideIn(
                  delay: Duration(milliseconds: 40),
                  child: _SectionTitle('Now Playing'),
                ),
              ),
              if (current != null)
                SliverToBoxAdapter(
                  child: FadeSlideIn(
                    delay: const Duration(milliseconds: 80),
                    child: _TrackRow(
                      track: current,
                      highlight: true,
                      onTap: () {},
                      trailing: _EqBars(playing: player.isPlaying),
                    ),
                  ),
                ),
              SliverToBoxAdapter(
                child: FadeSlideIn(
                  delay: const Duration(milliseconds: 120),
                  child: _upNextHeader(q, player, up.length),
                ),
              ),
              if (up.isEmpty)
                SliverToBoxAdapter(child: _empty(q))
              else
                SliverReorderableList(
                  itemCount: up.length,
                  onReorderStart: (_) => HapticFeedback.mediumImpact(),
                  // ignore: deprecated_member_use
                  onReorder: (o, n) {
                    HapticFeedback.selectionClick();
                    q.reorder(o, n);
                  },
                  proxyDecorator: _proxy,
                  findChildIndexCallback: (key) {
                    if (key is ValueKey<int>) {
                      final i = up.indexWhere((e) => e.uid == key.value);
                      return i < 0 ? null : i;
                    }
                    return null;
                  },
                  itemBuilder: (context, i) {
                    final e = up[i];
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
                        child: const Icon(CupertinoIcons.trash_fill, color: Colors.white, size: 20),
                      ),
                      child: FadeSlideIn(
                        delay: Duration(milliseconds: i < 8 ? 28 * i : 0),
                        child: _TrackRow(
                          track: e.track,
                          onTap: () {
                            HapticFeedback.selectionClick();
                            widget.onJumpTo(e);
                          },
                          onLongPress: () => _menu(q, e),
                          trailing: ReorderableDragStartListener(
                            index: i,
                            child: Padding(
                              padding: const EdgeInsets.all(10),
                              child: Icon(
                                Icons.drag_handle_rounded,
                                color: Colors.white.withValues(alpha: 0.45),
                                size: 22,
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              if (up.isNotEmpty)
                SliverToBoxAdapter(
                  child: Center(
                    child: PressableScale(
                      onTap: () {
                        HapticFeedback.mediumImpact();
                        q.clear();
                      },
                      child: const Padding(
                        padding: EdgeInsets.symmetric(vertical: 14, horizontal: 12),
                        child: Text(
                          'Clear Queue',
                          style: TextStyle(
                            color: AppColors.accent,
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              if (q.autoplay)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Row(
                      children: [
                        Icon(Icons.all_inclusive_rounded, size: 16, color: Colors.white.withValues(alpha: 0.45)),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Autoplay keeps music going when your queue ends.',
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.45), fontSize: 13),
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
    );
  }

  /* ───────────────────────── pieces ───────────────────────── */



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
                  const Text(
                    'History',
                    style: TextStyle(
                      fontFamily: 'SF Pro Display',
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.3,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text('${hist.length}', style: TextStyle(color: Colors.white.withValues(alpha: 0.5), fontSize: 15)),
                  const Spacer(),
                  AnimatedRotation(
                    turns: _historyOpen ? 0.25 : 0,
                    duration: const Duration(milliseconds: 320),
                    curve: Curves.easeOutBack,
                    child: Icon(Icons.chevron_right_rounded, color: Colors.white.withValues(alpha: 0.6)),
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
                  : const SizedBox(key: ValueKey('h-closed'), width: double.infinity),
            ),
          ),
        ),
        const SizedBox(height: 6),
      ],
    );
  }

  Widget _upNextHeader(QueueState q, PlayerState p, int count) {
    return Padding(
      padding: const EdgeInsets.only(top: 22, bottom: 10),
      child: Row(
        children: [
          const Text(
            'Playing Next',
            style: TextStyle(
              fontFamily: 'SF Pro Display',
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(width: 8),
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            child: Text(
              '',
              key: ValueKey(count),
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.5),
                fontSize: 15,
              ),
            ),
          ),
          const Spacer(),
          _QueueToggle(
            icon: CupertinoIcons.shuffle,
            active: q.shuffle,
            onTap: () {
              HapticFeedback.selectionClick();
              q.toggleShuffle();
            },
          ),
          const SizedBox(width: 8),
          _QueueToggle(
            icon: q.repeatMode == RepeatMode.one
                ? CupertinoIcons.repeat_1
                : CupertinoIcons.repeat,
            active: q.repeatMode != RepeatMode.off,
            onTap: () {
              HapticFeedback.selectionClick();
              q.cycleRepeat();
            },
          ),
          const SizedBox(width: 8),
          _QueueToggle(
            icon: CupertinoIcons.infinite,
            active: q.autoplay,
            onTap: () {
              HapticFeedback.selectionClick();
              q.toggleAutoplay();
            },
          ),
        ],
      ),
    );
  }

  Widget _empty(QueueState q) {
    return FadeSlideIn(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 36),
        child: Column(
          children: [
            Icon(Icons.queue_music_rounded, size: 44, color: Colors.white.withValues(alpha: 0.3)),
            const SizedBox(height: 12),
            const Text('Nothing up next',
                style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(
              q.autoplay ? 'Autoplay will pick what comes next.' : 'Add songs to keep the music going.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 14),
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
          position: Tween<Offset>(begin: const Offset(0, 1.2), end: Offset.zero).animate(a),
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
                    border: Border.all(color: Colors.white.withValues(alpha: 0.12), width: 0.8),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          q.undoLabel ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 14.5, fontWeight: FontWeight.w500),
                        ),
                      ),
                      PressableScale(
                        onTap: () {
                          HapticFeedback.lightImpact();
                          _undoTimer?.cancel();
                          q.undo();
                        },
                        child: const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          child: Text('Undo',
                              style: TextStyle(color: AppColors.accent, fontSize: 15, fontWeight: FontWeight.w700)),
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
    showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: Text(MediaNormalizer.cleanTitle(e.title)),
        message: Text(MediaNormalizer.formatArtists(e.artist)),
        actions: [
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              q.moveToTop(e);
            },
            child: const Text('Play Next'),
          ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              q.moveToBottom(e);
            },
            child: const Text('Move to Bottom'),
          ),
          for (final artist in e.track.artistNames)
            CupertinoActionSheetAction(
              onPressed: () {
                Navigator.pop(ctx);
                if (widget.onGoToArtist != null) {
                  widget.onGoToArtist!(artist);
                } else {
                  Navigator.push(
                    context,
                    ZenPageRoute(builder: (_) => ArtistScreen(artistName: artist)),
                  );
                }
              },
              child: Text('Go to $artist'),
            ),
          CupertinoActionSheetAction(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.push(
                context,
                ZenPageRoute(
                  builder: (_) => AlbumScreen(
                    albumTitle: MediaNormalizer.cleanAlbumTitle(e.track.album.isNotEmpty ? e.track.album : e.title),
                    artistName: MediaNormalizer.formatArtists(e.artist),
                    coverUrl: e.track.coverUrl as String?,
                  ),
                ),
              );
            },
            child: const Text('Go to Album'),
          ),
          CupertinoActionSheetAction(
            isDestructiveAction: true,
            onPressed: () {
              Navigator.pop(ctx);
              q.remove(e);
            },
            child: const Text('Remove from Queue'),
          ),
        ],
        cancelButton: CupertinoActionSheetAction(
          isDefaultAction: true,
          onPressed: () => Navigator.pop(ctx),
          child: const Text('Cancel'),
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 6),
        child: Text(
          text,
          style: const TextStyle(
            fontFamily: 'SF Pro Display',
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
          ),
        ),
      );
}

class _QueueToggle extends StatelessWidget {
  const _QueueToggle({
    required this.icon,
    required this.active,
    required this.onTap,
  });
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onTap,
      scale: 0.88,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: active
              ? Colors.white.withValues(alpha: 0.92)
              : Colors.white.withValues(alpha: 0.14),
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
              builder: (_, c, _) => Icon(icon, size: 18, color: c),
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
              padding: EdgeInsets.symmetric(vertical: 6, horizontal: highlight ? 10 : 0),
              decoration: highlight
                  ? BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(16),
                    )
                  : null,
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(9),
                    child: SizedBox(width: 48, height: 48, child: CoverImage(track.coverUrl as String)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          MediaNormalizer.cleanCompactTitle(track.title as String),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w500),
                        ),
                        const SizedBox(height: 1),
                        Text(
                          track is Track ? track.displayArtists : MediaNormalizer.formatArtists(track.artist),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 14),
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

/// Little animated now-playing bars. Freeze when paused.
class _EqBars extends StatefulWidget {
  const _EqBars({required this.playing});
  final bool playing;

  @override
  State<_EqBars> createState() => _EqBarsState();
}

class _EqBarsState extends State<_EqBars> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

  @override
  void initState() {
    super.initState();
    if (widget.playing) _c.repeat();
  }

  @override
  void didUpdateWidget(covariant _EqBars old) {
    super.didUpdateWidget(old);
    if (widget.playing && !_c.isAnimating) _c.repeat();
    if (!widget.playing) _c.stop();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, _) => SizedBox(
          width: 20,
          height: 20,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: List.generate(3, (i) {
              final h = 5 + 13 * (0.5 + 0.5 * math.sin(2 * math.pi * (_c.value + i * 0.33)));
              return Container(
                width: 4,
                height: h,
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(2)),
              );
            }),
          ),
        ),
      ),
    );
  }
}
