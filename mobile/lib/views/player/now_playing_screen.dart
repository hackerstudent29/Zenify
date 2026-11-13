// lib/views/player/now_playing_screen.dart
//
// Full-screen Apple Music style player:
//   • living artwork-mesh background (ArtworkMeshBackground)
//   • artwork that shrinks on pause and springs up on play
//   • thick-on-drag scrubber, volume, spring transport controls
//   • drag down to dismiss, with spring rubber-banding
//
// Preview without wiring:  NowPlayingScreen(bridge: DemoPlaybackBridge())

import 'dart:math' as math;

import 'package:flutter/cupertino.dart' hide RepeatMode;
import 'package:flutter/material.dart' hide RepeatMode;
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';

import '../../design_system/widgets/artwork_mesh_background.dart';
import '../../design_system/zen.dart';
import '../../models/track.dart';
import '../../services/playback_bridge.dart';
import '../details/album_screen.dart';
import '../../design_system/widgets/interactive_artists_text.dart';
import 'now_playing_widgets.dart';

class NowPlayingScreen extends StatefulWidget {
  const NowPlayingScreen({
    super.key,
    required this.bridge,
    this.onClose,
    this.onLyrics,
    this.onQueue,
    this.onMore,
  });

  final PlaybackBridge bridge;
  final VoidCallback? onClose;
  final VoidCallback? onLyrics;
  final VoidCallback? onQueue;
  final VoidCallback? onMore;

  @override
  State<NowPlayingScreen> createState() => _NowPlayingScreenState();
}

class _NowPlayingScreenState extends State<NowPlayingScreen>
    with SingleTickerProviderStateMixin {
  static const _snapBack =
      SpringDescription(mass: 1, stiffness: 320, damping: 26);

  /// value = vertical drag offset in px (unbounded so the spring can overshoot)
  late final AnimationController _drag =
      AnimationController.unbounded(vsync: this, value: 0);

  @override
  void dispose() {
    _drag.dispose();
    super.dispose();
  }

  void _onDragUpdate(DragUpdateDetails d) {
    _drag.stop();
    // 1:1 when pulling down, heavy resistance when pulling up past rest.
    final next = _drag.value + d.delta.dy;
    _drag.value = next < 0 ? next * 0.35 : next;
  }

  void _onDragEnd(DragEndDetails d) {
    final v = d.velocity.pixelsPerSecond.dy;
    final close = _drag.value > 140 || v > 900;
    if (close) {
      ZenHaptics.light();
      widget.onClose?.call();
    }
    if (mounted) {
      _drag.animateWith(SpringSimulation(_snapBack, _drag.value, 0, v));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _drag,
      builder: (context, child) {
        final dy = math.max(0.0, _drag.value);
        final scale = (1.0 - math.min(dy / 1400.0, 0.09)).toDouble();
        return Transform.translate(
          offset: Offset(0, _drag.value),
          child: Transform.scale(
            scale: scale,
            alignment: Alignment.topCenter,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(math.min(dy / 5.0, 40.0).toDouble()),
              child: child,
            ),
          ),
        );
      },
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onVerticalDragUpdate: _onDragUpdate,
        onVerticalDragEnd: _onDragEnd,
        child: Material(
          color: Zen.bg,
          child: AnimatedBuilder(
            animation: widget.bridge,
            builder: (context, _) => _content(context),
          ),
        ),
      ),
    );
  }

  Widget _content(BuildContext context) {
    final b = widget.bridge;
    final track = b.currentTrack;
    final playing = b.isPlaying;

    return Stack(
      fit: StackFit.expand,
      children: [
        ArtworkMeshBackground(
          coverUrl: track?.coverUrl,
          paused: !playing,
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: track == null
                ? const Center(
                    child: Text('Nothing playing', style: Zen.subhead))
                : Column(
                    children: [
                      const SizedBox(height: 10),
                      // grabber
                      Container(
                        width: 38,
                        height: 5,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.35),
                          borderRadius: BorderRadius.circular(3),
                        ),
                      ),
                      const SizedBox(height: 16),

                      // artwork
                      Expanded(
                        child: LayoutBuilder(
                          builder: (context, c) {
                            final side =
                                math.min(c.maxWidth, c.maxHeight);
                            return Center(
                              child: SizedBox.square(
                                dimension: side,
                                child: AppleArtwork(
                                    track: track, isPlaying: playing),
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 22),

                      _meta(track, b),
                      const SizedBox(height: 14),

                      AppleScrubber(
                        position: b.position,
                        duration: b.duration,
                        onSeek: b.seek,
                      ),
                      const SizedBox(height: 6),

                      AppleTransportControls(
                        isPlaying: playing,
                        onPlayPause: b.togglePlayPause,
                        onNext: b.next,
                        onPrevious: () {
                          // Apple behaviour: restart if past 3 s, else go back.
                          if (b.position.value > const Duration(seconds: 3) ||
                              !b.hasPrevious) {
                            b.seek(Duration.zero);
                          } else {
                            b.previous();
                          }
                        },
                        onScan: (delta) {
                          final target = b.position.value + delta;
                          b.seek(Duration(
                            milliseconds: target.inMilliseconds
                                .clamp(0, b.duration.inMilliseconds),
                          ));
                        },
                      ),
                      const SizedBox(height: 4),

                      AppleVolumeSlider(
                          value: b.volume, onChanged: b.setVolume),
                      const SizedBox(height: 14),

                      _bottomRow(track, b),
                      const SizedBox(height: 10),
                    ],
                  ),
          ),
        ),
      ],
    );
  }

  Widget _meta(Track track, PlaybackBridge b) {
    final fav = b.isFavorite(track);
    return Row(
      children: [
        Expanded(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 420),
            transitionBuilder: (child, anim) => FadeTransition(
              opacity: anim,
              child: SlideTransition(
                position: Tween<Offset>(
                        begin: const Offset(0, 0.25), end: Offset.zero)
                    .chain(CurveTween(curve: Zen.springSmooth))
                    .animate(anim),
                child: child,
              ),
            ),
            child: Column(
              key: ValueKey(track.id),
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(track.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Zen.title3.copyWith(
                        fontSize: 23, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                InteractiveArtistsText(
                  artists: track.resolvedArtists,
                  style: const TextStyle(
                    fontSize: 20,
                    letterSpacing: -0.3,
                    color: Color(0xCCFFFFFF),
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                ),
                if (track.album.isNotEmpty && track.album != 'Single') ...[
                  const SizedBox(height: 2),
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () {
                      HapticFeedback.lightImpact();
                      Navigator.of(context).push(
                        CupertinoPageRoute(
                          builder: (_) => AlbumScreen(
                            albumTitle: track.album,
                            artistName: track.artist,
                            coverUrl: track.coverUrl,
                          ),
                        ),
                      );
                    },
                    child: Text(
                      track.album,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14,
                        letterSpacing: -0.2,
                        color: Colors.white.withValues(alpha: 0.6),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(width: 12),
        SpringPress(
          onTap: () => b.toggleFavorite(track),
          child: SizedBox(
            width: 40,
            height: 40,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 500),
              transitionBuilder: (c, a) => ScaleTransition(
                scale: a.drive(CurveTween(curve: Zen.springBouncy)),
                child: c,
              ),
              child: Icon(
                fav ? CupertinoIcons.heart_fill : CupertinoIcons.heart,
                key: ValueKey(fav),
                size: 26,
                color: fav ? Zen.rose : Colors.white,
              ),
            ),
          ),
        ),
        SpringPress(
          onTap: widget.onMore,
          child: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.18),
            ),
            child: const Icon(CupertinoIcons.ellipsis,
                size: 18, color: Colors.white),
          ),
        ),
      ],
    );
  }

  Widget _bottomRow(Track track, PlaybackBridge b) {
    final repeatIcon = b.repeat == RepeatMode.one
        ? CupertinoIcons.repeat_1
        : CupertinoIcons.repeat;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        AppleModeButton(
          icon: CupertinoIcons.quote_bubble,
          active: false,
          enabled: track.hasLyrics && widget.onLyrics != null,
          onTap: widget.onLyrics ?? () {},
        ),
        AppleModeButton(
          icon: CupertinoIcons.shuffle,
          active: b.shuffle,
          onTap: b.toggleShuffle,
        ),
        AppleModeButton(
          icon: repeatIcon,
          active: b.repeat != RepeatMode.off,
          onTap: b.cycleRepeat,
        ),
        AppleModeButton(
          icon: CupertinoIcons.list_bullet,
          active: false,
          enabled: widget.onQueue != null,
          onTap: widget.onQueue ?? () {},
        ),
      ],
    );
  }
}
