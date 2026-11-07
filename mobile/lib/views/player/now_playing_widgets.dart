// lib/views/player/now_playing_widgets.dart
//
// Apple Music style building blocks, all spring-driven:
//   SpringPress, SpringTrack, AppleScrubber, AppleArtwork,
//   AppleTransportControls, AppleVolumeSlider, AppleModeButton,
//   AppleMiniPlayer, NowPlayingBannerHost (in-app playback notification).

import 'dart:async';

import 'package:flutter/cupertino.dart' hide RepeatMode;
import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/material.dart' hide RepeatMode;

import '../../design_system/zen.dart';
import '../../models/track.dart';
import '../../services/playback_bridge.dart';

String formatDuration(Duration d) {
  final total = d.inSeconds.clamp(0, 359999);
  final h = total ~/ 3600, m = (total % 3600) ~/ 60, s = total % 60;
  final ss = s.toString().padLeft(2, '0');
  return h > 0 ? '$h:${m.toString().padLeft(2, '0')}:$ss' : '$m:$ss';
}

// ─────────────────────────────────────────────────────────────────────────────
// SpringPress — shrinks on touch, springs back with overshoot
// ─────────────────────────────────────────────────────────────────────────────

class SpringPress extends StatefulWidget {
  const SpringPress({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPressStart,
    this.onLongPressEnd,
    this.downScale = 0.88,
    this.haptic = true,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPressStart;
  final VoidCallback? onLongPressEnd;
  final double downScale;
  final bool haptic;

  @override
  State<SpringPress> createState() => _SpringPressState();
}

class _SpringPressState extends State<SpringPress> {
  bool _down = false;

  void _set(bool v) {
    if (_down != v) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _set(true),
      onTapUp: (_) => _set(false),
      onTapCancel: () => _set(false),
      onTap: () {
        if (widget.haptic) ZenHaptics.light();
        widget.onTap?.call();
      },
      onLongPressStart: (_) {
        _set(true);
        widget.onLongPressStart?.call();
      },
      onLongPressEnd: (_) {
        _set(false);
        widget.onLongPressEnd?.call();
      },
      child: AnimatedScale(
        scale: _down ? widget.downScale : 1,
        duration: Duration(milliseconds: _down ? 100 : 550),
        curve: _down ? Curves.easeOut : Zen.springBouncy,
        child: widget.child,
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SpringTrack — Apple-style slider: thin at rest, springs thick while dragging
// ─────────────────────────────────────────────────────────────────────────────

class SpringTrack extends StatefulWidget {
  const SpringTrack({
    super.key,
    required this.value,
    required this.onChanged,
    this.onChangeStart,
    this.onChangeEnd,
    this.height = 5,
    this.activeHeight = 12,
    this.activeColor = Colors.white,
    this.inactiveColor = const Color(0x40FFFFFF),
  });

  final double value; // 0..1
  final ValueChanged<double> onChanged;
  final ValueChanged<double>? onChangeStart;
  final ValueChanged<double>? onChangeEnd;
  final double height;
  final double activeHeight;
  final Color activeColor;
  final Color inactiveColor;

  @override
  State<SpringTrack> createState() => _SpringTrackState();
}

class _SpringTrackState extends State<SpringTrack> {
  bool _active = false;
  double _lastFraction = 0;
  int _lastTick = -1;

  double _fraction(double dx, double width) =>
      width <= 0 ? 0 : (dx / width).clamp(0.0, 1.0);

  void _set(bool v) {
    if (_active != v) setState(() => _active = v);
  }

  void _emit(double f) {
    _lastFraction = f;
    widget.onChanged(f);
    // soft detent haptic every 10%
    final tick = (f * 10).round();
    if (tick != _lastTick) {
      _lastTick = tick;
      ZenHaptics.tap();
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onHorizontalDragStart: (d) {
            _set(true);
            final f = _fraction(d.localPosition.dx, w);
            widget.onChangeStart?.call(f);
            _emit(f);
          },
          onHorizontalDragUpdate: (d) =>
              _emit(_fraction(d.localPosition.dx, w)),
          onHorizontalDragEnd: (_) {
            _set(false);
            widget.onChangeEnd?.call(_lastFraction);
          },
          onHorizontalDragCancel: () => _set(false),
          onTapUp: (d) {
            final f = _fraction(d.localPosition.dx, w);
            widget.onChangeStart?.call(f);
            _emit(f);
            widget.onChangeEnd?.call(f);
          },
          child: SizedBox(
            height: 30,
            child: Center(
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 480),
                curve: Zen.springBouncy,
                height: _active ? widget.activeHeight : widget.height,
                decoration: BoxDecoration(
                  color: widget.inactiveColor,
                  borderRadius: BorderRadius.circular(widget.activeHeight),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(widget.activeHeight),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: FractionallySizedBox(
                      widthFactor: widget.value.clamp(0.0, 1.0),
                      heightFactor: 1,
                      child: ColoredBox(color: widget.activeColor),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AppleScrubber — track + elapsed / -remaining (no snap-back after a seek)
// ─────────────────────────────────────────────────────────────────────────────

class AppleScrubber extends StatefulWidget {
  const AppleScrubber({
    super.key,
    required this.position,
    required this.duration,
    required this.onSeek,
  });

  final ValueListenable<Duration> position;
  final Duration duration;
  final ValueChanged<Duration> onSeek;

  @override
  State<AppleScrubber> createState() => _AppleScrubberState();
}

class _AppleScrubberState extends State<AppleScrubber> {
  double? _drag;
  double _holdFraction = 0;
  DateTime? _holdUntil;

  static const _timeStyle = TextStyle(
    fontSize: 12,
    fontWeight: FontWeight.w500,
    color: Color(0x99FFFFFF),
    fontFeatures: [FontFeature.tabularFigures()],
  );

  @override
  Widget build(BuildContext context) {
    final totalMs = widget.duration.inMilliseconds.clamp(1, 1 << 31);

    return ValueListenableBuilder<Duration>(
      valueListenable: widget.position,
      builder: (context, pos, _) {
        final holding =
            _holdUntil != null && DateTime.now().isBefore(_holdUntil!);
        final fraction = (_drag ??
                (holding ? _holdFraction : pos.inMilliseconds / totalMs))
            .clamp(0.0, 1.0);
        final shown = Duration(milliseconds: (fraction * totalMs).round());
        final remaining = Duration(milliseconds: totalMs - shown.inMilliseconds);

        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SpringTrack(
              value: fraction,
              onChanged: (v) => setState(() => _drag = v),
              onChangeEnd: (v) {
                widget.onSeek(Duration(milliseconds: (v * totalMs).round()));
                setState(() {
                  _holdFraction = v;
                  _holdUntil =
                      DateTime.now().add(const Duration(milliseconds: 900));
                  _drag = null;
                });
              },
            ),
            const SizedBox(height: 2),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(formatDuration(shown), style: _timeStyle),
                Text('-${formatDuration(remaining)}', style: _timeStyle),
              ],
            ),
          ],
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AppleArtwork — large cover: shrinks when paused, springs up when playing
// ─────────────────────────────────────────────────────────────────────────────

class AppleArtwork extends StatelessWidget {
  const AppleArtwork({
    super.key,
    required this.track,
    required this.isPlaying,
    this.radius = 22,
  });

  final Track? track;
  final bool isPlaying;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return AnimatedScale(
      scale: isPlaying ? 1 : 0.86,
      duration: const Duration(milliseconds: 700),
      curve: Zen.spring,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 600),
        curve: Curves.easeOut,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isPlaying ? 0.5 : 0.25),
              blurRadius: isPlaying ? 50 : 22,
              offset: Offset(0, isPlaying ? 26 : 10),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(radius),
          child: AspectRatio(
            aspectRatio: 1,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 550),
              switchInCurve: Curves.easeOut,
              switchOutCurve: Curves.easeIn,
              transitionBuilder: (child, animation) => FadeTransition(
                opacity: animation,
                child: ScaleTransition(
                  scale: Tween<double>(begin: 0.9, end: 1)
                      .chain(CurveTween(curve: Zen.springSmooth))
                      .animate(animation),
                  child: child,
                ),
              ),
              child: _Cover(
                key: ValueKey(track?.id ?? 'none'),
                url: track?.coverUrl,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Cover extends StatelessWidget {
  const _Cover({super.key, this.url});
  final String? url;

  Widget _placeholder() => const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF48484A), Color(0xFF1C1C1F)],
          ),
        ),
        child: Center(
          child: Icon(CupertinoIcons.music_note_2,
              size: 64, color: Color(0x66FFFFFF)),
        ),
      );

  @override
  Widget build(BuildContext context) {
    if (url == null || url!.isEmpty) return _placeholder();
    return Image.network(
      url!,
      fit: BoxFit.cover,
      gaplessPlayback: true,
      frameBuilder: (context, child, frame, sync) => sync
          ? child
          : AnimatedOpacity(
              opacity: frame == null ? 0 : 1,
              duration: const Duration(milliseconds: 400),
              curve: Curves.easeOut,
              child: child,
            ),
      errorBuilder: (context, error, stackTrace) => _placeholder(),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport controls
// ─────────────────────────────────────────────────────────────────────────────

class AppleTransportControls extends StatelessWidget {
  const AppleTransportControls({
    super.key,
    required this.isPlaying,
    required this.onPlayPause,
    required this.onNext,
    required this.onPrevious,
    this.onScan,
  });

  final bool isPlaying;
  final VoidCallback onPlayPause;
  final VoidCallback onNext;
  final VoidCallback onPrevious;

  /// Press-and-hold on skip scrubs the song (±4 s every 160 ms).
  final ValueChanged<Duration>? onScan;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _SkipButton(
            icon: CupertinoIcons.backward_fill,
            forward: false,
            onTap: onPrevious,
            onScan: onScan),
        _PlayPauseButton(isPlaying: isPlaying, onTap: onPlayPause),
        _SkipButton(
            icon: CupertinoIcons.forward_fill,
            forward: true,
            onTap: onNext,
            onScan: onScan),
      ],
    );
  }
}

class _PlayPauseButton extends StatefulWidget {
  const _PlayPauseButton({required this.isPlaying, required this.onTap});
  final bool isPlaying;
  final VoidCallback onTap;

  @override
  State<_PlayPauseButton> createState() => _PlayPauseButtonState();
}

class _PlayPauseButtonState extends State<_PlayPauseButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 380),
    value: widget.isPlaying ? 1 : 0,
  );

  @override
  void didUpdateWidget(_PlayPauseButton old) {
    super.didUpdateWidget(old);
    if (old.isPlaying != widget.isPlaying) {
      widget.isPlaying ? _c.forward() : _c.reverse();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      downScale: 0.82,
      onTap: widget.onTap,
      child: SizedBox(
        width: 84,
        height: 84,
        child: Center(
          child: AnimatedIcon(
            icon: AnimatedIcons.play_pause,
            progress: CurvedAnimation(
                parent: _c, curve: Curves.easeInOutCubic),
            size: 64,
            color: Colors.white,
          ),
        ),
      ),
    );
  }
}

class _SkipButton extends StatefulWidget {
  const _SkipButton({
    required this.icon,
    required this.forward,
    required this.onTap,
    this.onScan,
  });

  final IconData icon;
  final bool forward;
  final VoidCallback onTap;
  final ValueChanged<Duration>? onScan;

  @override
  State<_SkipButton> createState() => _SkipButtonState();
}

class _SkipButtonState extends State<_SkipButton> {
  bool _nudge = false;
  Timer? _scan;

  void _bump() {
    setState(() => _nudge = true);
    Future.delayed(const Duration(milliseconds: 110), () {
      if (mounted) setState(() => _nudge = false);
    });
  }

  @override
  void dispose() {
    _scan?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dir = widget.forward ? 1.0 : -1.0;
    return SpringPress(
      downScale: 0.86,
      onTap: () {
        _bump();
        widget.onTap();
      },
      onLongPressStart: widget.onScan == null
          ? null
          : () {
              ZenHaptics.medium();
              _scan = Timer.periodic(const Duration(milliseconds: 160),
                  (_) => widget.onScan!(Duration(seconds: (4 * dir).round())));
            },
      onLongPressEnd: () => _scan?.cancel(),
      child: SizedBox(
        width: 84,
        height: 84,
        child: AnimatedSlide(
          offset: Offset(_nudge ? 0.16 * dir : 0, 0),
          duration: Duration(milliseconds: _nudge ? 90 : 520),
          curve: _nudge ? Curves.easeOut : Zen.springBouncy,
          child: Icon(widget.icon, size: 40, color: Colors.white),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume + mode buttons
// ─────────────────────────────────────────────────────────────────────────────

class AppleVolumeSlider extends StatelessWidget {
  const AppleVolumeSlider({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final double value;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    const iconColor = Color(0x99FFFFFF);
    return Row(
      children: [
        const Icon(CupertinoIcons.speaker_fill, size: 16, color: iconColor),
        const SizedBox(width: 10),
        Expanded(
          child: SpringTrack(
            value: value,
            onChanged: onChanged,
            height: 5,
            activeHeight: 11,
          ),
        ),
        const SizedBox(width: 10),
        const Icon(CupertinoIcons.speaker_3_fill, size: 18, color: iconColor),
      ],
    );
  }
}

/// Bottom-row toggle with Apple's rounded highlight pill.
class AppleModeButton extends StatelessWidget {
  const AppleModeButton({
    super.key,
    required this.icon,
    required this.active,
    required this.onTap,
    this.enabled = true,
  });

  final IconData icon;
  final bool active;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.35,
      child: SpringPress(
        onTap: enabled ? onTap : null,
        downScale: 0.9,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 450),
          curve: Zen.springSnappy,
          width: 52,
          height: 36,
          decoration: BoxDecoration(
            color: active
                ? Colors.white.withValues(alpha: 0.22)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon,
              size: 22,
              color: active ? Colors.white : const Color(0x99FFFFFF)),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Glass mini player
// ─────────────────────────────────────────────────────────────────────────────

class AppleMiniPlayer extends StatelessWidget {
  const AppleMiniPlayer({super.key, required this.bridge, this.onTap});

  final PlaybackBridge bridge;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: bridge,
      builder: (context, _) {
        final track = bridge.currentTrack;
        if (track == null) return const SizedBox.shrink();
        final playing = bridge.isPlaying;

        return SpringPress(
          downScale: 0.97,
          haptic: false,
          onTap: onTap,
          child: GlassPanel(
            borderRadius: BorderRadius.circular(24),
            blur: 30,
            tint: const Color(0xA6121214),
            child: Stack(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(10, 10, 6, 12),
                  child: Row(
                    children: [
                      AnimatedScale(
                        scale: playing ? 1 : 0.9,
                        duration: const Duration(milliseconds: 600),
                        curve: Zen.springBouncy,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: SizedBox.square(
                            dimension: 46,
                            child: _Cover(
                                key: ValueKey(track.id), url: track.coverUrl),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(track.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Zen.headline.copyWith(fontSize: 15)),
                            Text(track.artist,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Zen.subhead.copyWith(fontSize: 13)),
                          ],
                        ),
                      ),
                      SpringPress(
                        onTap: bridge.togglePlayPause,
                        child: SizedBox(
                          width: 44,
                          height: 44,
                          child: AnimatedSwitcher(
                            duration: const Duration(milliseconds: 300),
                            transitionBuilder: (c, a) => ScaleTransition(
                              scale: a.drive(
                                  CurveTween(curve: Zen.springBouncy)),
                              child: c,
                            ),
                            child: Icon(
                              playing
                                  ? CupertinoIcons.pause_fill
                                  : CupertinoIcons.play_fill,
                              key: ValueKey(playing),
                              size: 26,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                      SpringPress(
                        onTap: bridge.next,
                        child: const SizedBox(
                          width: 44,
                          height: 44,
                          child: Icon(CupertinoIcons.forward_fill,
                              size: 24, color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
                // hairline progress
                Positioned(
                  left: 14,
                  right: 14,
                  bottom: 5,
                  child: ValueListenableBuilder<Duration>(
                    valueListenable: bridge.position,
                    builder: (context, pos, _) {
                      final total =
                          bridge.duration.inMilliseconds.clamp(1, 1 << 31);
                      return ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: SizedBox(
                          height: 2.5,
                          child: Stack(children: [
                            const Positioned.fill(
                                child: ColoredBox(color: Color(0x26FFFFFF))),
                            FractionallySizedBox(
                              widthFactor:
                                  (pos.inMilliseconds / total).clamp(0.0, 1.0),
                              child: const ColoredBox(color: Zen.rose),
                            ),
                          ]),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// In-app playback notification (iOS-style banner)
// ─────────────────────────────────────────────────────────────────────────────

/// Drop into your root Stack (e.g. in ShellScreen, above the tabs, below or
/// above PlayerShell). Springs down from the top when the track changes,
/// swipe up to dismiss, tap to open the player.
///
///   NowPlayingBannerHost(bridge: player, onOpen: _expandPlayer,
///                        suppress: playerIsExpanded)
class NowPlayingBannerHost extends StatefulWidget {
  const NowPlayingBannerHost({
    super.key,
    required this.bridge,
    this.onOpen,
    this.suppress = false,
    this.visibleFor = const Duration(seconds: 4),
  });

  final PlaybackBridge bridge;
  final VoidCallback? onOpen;
  final bool suppress;
  final Duration visibleFor;

  @override
  State<NowPlayingBannerHost> createState() => _NowPlayingBannerHostState();
}

class _NowPlayingBannerHostState extends State<NowPlayingBannerHost> {
  String? _lastId;
  bool _visible = false;
  bool _dragging = false;
  double _dragY = 0;
  Timer? _hide;

  @override
  void initState() {
    super.initState();
    _lastId = widget.bridge.currentTrack?.id;
    widget.bridge.addListener(_onChange);
  }

  @override
  void didUpdateWidget(NowPlayingBannerHost old) {
    super.didUpdateWidget(old);
    if (old.bridge != widget.bridge) {
      old.bridge.removeListener(_onChange);
      widget.bridge.addListener(_onChange);
    }
    if (widget.suppress && _visible) _dismiss();
  }

  @override
  void dispose() {
    _hide?.cancel();
    widget.bridge.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() {
    final t = widget.bridge.currentTrack;
    if (t == null) return;
    if (t.id != _lastId) {
      _lastId = t.id;
      if (!widget.suppress && widget.bridge.isPlaying) _show();
    } else if (_visible && mounted) {
      setState(() {}); // refresh play/pause glyph
    }
  }

  void _show() {
    _hide?.cancel();
    ZenHaptics.light();
    setState(() {
      _visible = true;
      _dragY = 0;
    });
    _hide = Timer(widget.visibleFor, _dismiss);
  }

  void _dismiss() {
    _hide?.cancel();
    if (mounted) setState(() => _visible = false);
  }

  @override
  Widget build(BuildContext context) {
    final track = widget.bridge.currentTrack;
    return Align(
      alignment: Alignment.topCenter,
      child: IgnorePointer(
        ignoring: !_visible,
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: AnimatedSlide(
              offset: _visible ? Offset.zero : const Offset(0, -1.8),
              duration: const Duration(milliseconds: 750),
              curve: const SpringCurve(damping: 14, stiffness: 210),
              child: AnimatedOpacity(
                opacity: _visible ? 1 : 0,
                duration: const Duration(milliseconds: 250),
                child: GestureDetector(
                  onVerticalDragStart: (_) {
                    _hide?.cancel();
                    setState(() => _dragging = true);
                  },
                  onVerticalDragUpdate: (d) => setState(
                      () => _dragY = (_dragY + d.delta.dy).clamp(-200.0, 12.0)),
                  onVerticalDragEnd: (d) {
                    final close =
                        _dragY < -24 || d.velocity.pixelsPerSecond.dy < -400;
                    setState(() {
                      _dragging = false;
                      _dragY = 0;
                    });
                    close
                        ? _dismiss()
                        : _hide = Timer(widget.visibleFor, _dismiss);
                  },
                  child: AnimatedContainer(
                    duration:
                        Duration(milliseconds: _dragging ? 0 : 520),
                    curve: Zen.springBouncy,
                    transform: Matrix4.translationValues(0, _dragY, 0),
                    child: track == null
                        ? const SizedBox.shrink()
                        : _BannerCard(
                            bridge: widget.bridge,
                            track: track,
                            onOpen: () {
                              _dismiss();
                              widget.onOpen?.call();
                            },
                          ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BannerCard extends StatelessWidget {
  const _BannerCard({
    required this.bridge,
    required this.track,
    required this.onOpen,
  });

  final PlaybackBridge bridge;
  final Track track;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final playing = bridge.isPlaying;
    return SpringPress(
      downScale: 0.98,
      haptic: false,
      onTap: onOpen,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(26),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 28,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        child: GlassPanel(
          borderRadius: BorderRadius.circular(26),
          blur: 34,
          tint: const Color(0xB3161619),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: SizedBox.square(
                    dimension: 48,
                    child: _Cover(url: track.coverUrl),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('NOW PLAYING',
                          style: TextStyle(
                              fontSize: 10,
                              letterSpacing: 0.8,
                              fontWeight: FontWeight.w600,
                              color: Zen.rose)),
                      const SizedBox(height: 2),
                      Text(track.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Zen.headline.copyWith(fontSize: 15)),
                      Text(track.artist,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Zen.subhead.copyWith(fontSize: 13)),
                    ],
                  ),
                ),
                SpringPress(
                  onTap: bridge.togglePlayPause,
                  child: SizedBox(
                    width: 40,
                    height: 40,
                    child: Icon(
                        playing
                            ? CupertinoIcons.pause_fill
                            : CupertinoIcons.play_fill,
                        size: 24,
                        color: Colors.white),
                  ),
                ),
                SpringPress(
                  onTap: bridge.next,
                  child: const SizedBox(
                    width: 40,
                    height: 40,
                    child: Icon(CupertinoIcons.forward_fill,
                        size: 22, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
