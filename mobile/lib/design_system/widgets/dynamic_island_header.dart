import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart' show CupertinoIcons, CupertinoPageRoute;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../services/auth_state.dart';
import '../../utils/media_normalizer.dart';
import '../../views/profile/profile_screen.dart';
import 'apple_glass.dart';
import 'monogram_avatar.dart';
import 'pressable_scale.dart';

/// Notification shown in the second-row island pill.
/// [title] = the action ("Added to Liked"), [body] = name of the item
/// (song name, album name, playlist name, or artist name for artist actions),
/// [leading] = optional artwork (use [trackThumb], omit for bulk actions).
class IslandNotification {
  IslandNotification({
    required this.id,
    required this.title,
    this.body,
    this.leading,
    this.onTap,
  });

  final String id;
  final String title;
  final String? body;
  final Widget? leading;
  final VoidCallback? onTap;

  /// Returns cleaned item title (song, album, or playlist name) with optional fallback.
  static String itemTitle(String? title, {String? fallback}) {
    final raw = (title ?? '').trim();
    if (raw.isNotEmpty) {
      final cleaned = MediaNormalizer.cleanTitle(raw).trim();
      if (cleaned.isNotEmpty && cleaned != 'Unknown Title') return cleaned;
    }
    return (fallback ?? '').trim();
  }

  /// Picks cleaned title when known (song/album/playlist), falling back to artist only if empty.
  static String artistOrTitle({String? artist, String? title}) =>
      itemTitle(title, fallback: MediaNormalizer.formatArtists(artist ?? ''));

  /// Consistent 26x26 artwork thumbnail / icon badge.
  static Widget trackThumb(
    String? coverUrl, {
    IconData fallbackIcon = CupertinoIcons.music_note,
    Color iconColor = const Color(0xFFE11D48),
  }) {
    Widget fallback() => Container(
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            color: iconColor.withValues(alpha: 0.18),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(child: Icon(fallbackIcon, color: iconColor, size: 15)),
        );

    if (coverUrl != null && coverUrl.startsWith('http')) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: CachedNetworkImage(
          imageUrl: coverUrl,
          width: 26,
          height: 26,
          fit: BoxFit.cover,
          errorWidget: (_, _, _) => fallback(),
        ),
      );
    }
    return fallback();
  }
}

/// Global queue for the notification pill.
///
/// Lifecycle of one notification (~3s total):
///   spring open (~0.3s) -> hold (2.4s) -> spring close (~0.4s) -> next.
/// Touching the pill pauses the hold timer; swipe-up dismisses instantly.
class IslandNotifier extends ChangeNotifier {
  static final IslandNotifier instance = IslandNotifier._();
  IslandNotifier._();
  factory IslandNotifier() => instance;

  static const Duration _openAndHold = Duration(milliseconds: 2700);
  static const Duration _resumeHold = Duration(milliseconds: 1400);
  static const Duration _closeAnim = Duration(milliseconds: 400);
  static const Duration _gap = Duration(milliseconds: 100);

  final _queue = <IslandNotification>[];
  IslandNotification? _current;
  bool _isClosing = false;
  Timer? _holdTimer;
  Timer? _closeTimer;
  Timer? _nextTimer;

  IslandNotification? get current => _current;
  bool get isClosing => _isClosing;

  static void showNotification(IslandNotification n) => instance.show(n);

  void show(IslandNotification n) {
    _queue.add(n);
    if (_current == null && !_isClosing) _next();
  }

  void _next() {
    if (_queue.isEmpty) return;
    _isClosing = false;
    _current = _queue.removeAt(0);
    _armHold(_openAndHold);
    notifyListeners();
  }

  void _armHold(Duration d) {
    _holdTimer?.cancel();
    final id = _current?.id;
    _holdTimer = Timer(d, () => dismiss(id: id));
  }

  /// Finger is on the pill: keep it open.
  void pause() => _holdTimer?.cancel();

  /// Finger lifted without dismissing: let it linger a little more.
  void resume() {
    if (_current != null && !_isClosing) _armHold(_resumeHold);
  }

  /// Springs the pill closed, then brings in the next queued item.
  void dismiss({String? id}) {
    if (_current == null || _isClosing || (id != null && id != _current!.id)) {
      return;
    }
    _holdTimer?.cancel();
    _isClosing = true;
    notifyListeners();

    _closeTimer?.cancel();
    _nextTimer?.cancel();
    _closeTimer = Timer(_closeAnim, () {
      _isClosing = false;
      _current = null;
      notifyListeners();
      _nextTimer = Timer(_gap, () {
        if (_current == null && !_isClosing) _next();
      });
    });
  }
}

/// The second-row notification pill: [artwork]  Action  Name
///
/// [progress] is a spring value (0 = tucked under the main pill, 1 = open,
/// may overshoot slightly for the Apple-Music style bounce).
class _NotifPill extends StatelessWidget {
  const _NotifPill({
    super.key,
    required this.notif,
    required this.progress,
    required this.height,
    required this.maxWidth,
  });

  final IslandNotification notif;
  final double progress;
  final double height;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    final p = progress;
    final pc = p.clamp(0.0, 1.0);

    // Pill grows out of the main island: slides down from behind it while
    // scaling from a small dot-like capsule to full size.
    final dy = -(1.0 - p) * (height + 14);
    final sx = 0.38 + 0.62 * p;
    final sy = 0.62 + 0.38 * p;
    final shellOpacity = Curves.easeOut.transform((pc / 0.45).clamp(0.0, 1.0));
    final contentOpacity =
        Curves.easeOut.transform(((pc - 0.4) / 0.5).clamp(0.0, 1.0));

    final hasBody = notif.body != null && notif.body!.trim().isNotEmpty;
    final notifier = IslandNotifier.instance;

    return Opacity(
      opacity: shellOpacity,
      child: Transform.translate(
        offset: Offset(0, dy),
        child: Transform(
          alignment: Alignment.topCenter,
          transform: Matrix4.diagonal3Values(sx, sy, 1.0),
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: (_) => notifier.pause(),
            onTapCancel: notifier.resume,
            onTap: () {
              HapticFeedback.lightImpact();
              notif.onTap?.call();
              notifier.dismiss(id: notif.id);
            },
            onVerticalDragStart: (_) => notifier.pause(),
            onVerticalDragEnd: (d) {
              if ((d.primaryVelocity ?? 0) < -120) {
                notifier.dismiss(id: notif.id);
              } else {
                notifier.resume();
              }
            },
            child: AppleGlass(
              borderRadius: BorderRadius.circular(height / 2),
              child: Container(
                height: height,
                constraints: BoxConstraints(maxWidth: maxWidth),
                padding: const EdgeInsets.fromLTRB(7, 0, 18, 0),
                child: Opacity(
                  opacity: contentOpacity,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (notif.leading != null) ...[
                        SizedBox(
                          width: 26,
                          height: 26,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: notif.leading,
                          ),
                        ),
                        const SizedBox(width: 10),
                      ] else
                        const SizedBox(width: 11),
                      Flexible(
                        child: Text.rich(
                          TextSpan(children: [
                            TextSpan(
                              text: notif.title,
                              style: const TextStyle(
                                fontFamily: 'SF Pro Display',
                                fontWeight: FontWeight.w700,
                                fontSize: 13.5,
                                color: Colors.white,
                                letterSpacing: -0.2,
                              ),
                            ),
                            if (hasBody)
                              TextSpan(
                                text: '  ${notif.body!.trim()}',
                                style: const TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontWeight: FontWeight.w500,
                                  fontSize: 13,
                                  color: Colors.white70,
                                  letterSpacing: -0.1,
                                ),
                              ),
                          ]),
                          maxLines: 1,
                          softWrap: false,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
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

/// Renders ONLY the drop-down [IslandNotifier] pill (no top Dynamic Island chrome).
/// Used over full-screen surfaces like [PlayerShell] so in-app notifications appear
/// cleanly on top while reusing the exact same spring and dismiss gestures.
class IslandNotificationOverlay extends StatelessWidget {
  const IslandNotificationOverlay({
    super.key,
    this.topOffset,
    this.horizontalMargin = 16.0,
  });

  final double? topOffset;
  final double horizontalMargin;

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final isLandscape = mq.size.width > mq.size.height;
    final top =
        topOffset ??
        (isLandscape
            ? math.max(12.0, mq.padding.top + 8.0)
            : math.max(54.0, mq.padding.top + 4.0) + 46.0 + 8.0);
    final maxWidth = math.max(120.0, mq.size.width - horizontalMargin * 2 - 8);

    return Align(
      alignment: Alignment.topCenter,
      child: Padding(
        padding: EdgeInsets.fromLTRB(horizontalMargin, top, horizontalMargin, 0),
        child: _IslandNotifRunner(maxWidth: maxWidth),
      ),
    );
  }
}

class _IslandNotifRunner extends StatefulWidget {
  const _IslandNotifRunner({required this.maxWidth});

  final double maxWidth;

  @override
  State<_IslandNotifRunner> createState() => _IslandNotifRunnerState();
}

class _IslandNotifRunnerState extends State<_IslandNotifRunner>
    with SingleTickerProviderStateMixin {
  static const _openSpring = SpringDescription(
    mass: 1,
    stiffness: 420,
    damping: 23,
  );
  static const _closeSpring = SpringDescription(
    mass: 1,
    stiffness: 380,
    damping: 34,
  );
  static const double _notifHeight = 40.0;

  late final AnimationController _n = AnimationController.unbounded(
    vsync: this,
    value: IslandNotifier.instance.current == null ? 0.0 : 1.0,
  );

  @override
  void initState() {
    super.initState();
    IslandNotifier.instance.addListener(_onNotifChanged);
  }

  @override
  void dispose() {
    IslandNotifier.instance.removeListener(_onNotifChanged);
    _n.dispose();
    super.dispose();
  }

  void _onNotifChanged() {
    if (!mounted) return;
    final notifier = IslandNotifier.instance;
    final open = notifier.current != null && !notifier.isClosing;
    final to = open ? 1.0 : 0.0;
    if (MediaQuery.disableAnimationsOf(context)) {
      _n.value = to;
    } else {
      _n.animateWith(
        SpringSimulation(
          open ? _openSpring : _closeSpring,
          _n.value,
          to,
          _n.velocity,
        ),
      );
    }
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _n,
      builder: (context, _) {
        final cur = IslandNotifier.instance.current;
        final p = _n.value;
        if (cur == null || p < 0.002) return const SizedBox.shrink();
        return SizedBox(
          height: _notifHeight,
          child: Align(
            alignment: Alignment.topCenter,
            child: _NotifPill(
              key: ValueKey(cur.id),
              notif: cur,
              progress: p,
              height: _notifHeight,
              maxWidth: widget.maxWidth,
            ),
          ),
        );
      },
    );
  }
}

/// Apple Dynamic Island-style floating header.
///
/// Row 1 (main pill): left dock (back / logo) · centre title · right dock.
///   At rest the docks are two separate glass circles. When the title is
///   revealed they spring toward each other and merge into one capsule.
/// Row 2 (notification pill): independent glass pill below row 1 that springs
///   open, shows artwork + action + name for ~3s, then springs closed.
///   The main pill is never touched by notifications.
///
/// NOTE: this widget now reserves vertical room for row 2
/// (top + height + 8 + 40). Use it as an overlay (Stack/Positioned) as before.
class DynamicIslandHeader extends StatefulWidget {
  const DynamicIslandHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.showBack,
    this.onBack,
    this.showProfile = true,
    this.showCenter = true,
    this.onProfileTap,
    this.leading,
    this.centerWidget,
    this.trailing,
    this.onMore,
    this.height = 46.0,
    this.topPadding,
    this.horizontalMargin = 16.0,
    this.scrollController,
    this.revealOffset = 120,
    this.isDockPage,
    this.onCenterTap,
    this.alwaysShowTitle = false,
  });

  final String title;
  final String? subtitle;
  final bool? showBack;
  final VoidCallback? onBack;
  final bool showProfile;
  final bool showCenter;
  final VoidCallback? onProfileTap;
  final Widget? leading;
  final Widget? centerWidget;
  final Widget? trailing;
  final VoidCallback? onMore;
  final double height;
  final double? topPadding;
  final double horizontalMargin;

  /// Page scroll controller that drives the centre title (optional).
  final ScrollController? scrollController;

  /// Scroll offset at which the centre title spawns.
  final double revealOffset;

  /// Root page in the persistent navbar dock (shows the Zenify logo on left).
  final bool? isDockPage;

  /// Optional tap handler for the centre title.
  final VoidCallback? onCenterTap;

  /// Permanently display and center title in the island capsule (no scroll required).
  final bool alwaysShowTitle;

  @override
  State<DynamicIslandHeader> createState() => _DynamicIslandHeaderState();
}

class _DynamicIslandHeaderState extends State<DynamicIslandHeader>
    with SingleTickerProviderStateMixin {
  // Main pill merge: ~critically damped so circles glide together with just
  // a hint of softness (no visible rubber-banding on the glass).
  static const _mergeSpring =
      SpringDescription(mass: 1, stiffness: 380, damping: 32);

  static const double _notifGap = 8.0;
  static const double _notifHeight = 40.0;

  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: (widget.alwaysShowTitle || (widget.isDockPage == true && widget.scrollController == null))
        ? 1.0
        : 0.0,
  );
  bool _shown = false;
  ScrollController? _activeSc;
  double _scrollOffset = 0.0;

  bool get _isSubpage {
    if (widget.isDockPage == true) return false;
    if (widget.isDockPage == false) return true;
    if (widget.showBack != null) return widget.showBack!;
    return mounted && Navigator.canPop(context);
  }

  void _syncScrollOffset() {
    final sc = _findController();
    if (sc != null && sc.hasClients) {
      final off = sc.offset;
      if ((off - _scrollOffset).abs() > 0.5 && mounted) {
        setState(() => _scrollOffset = off);
      }
    }
  }

  void _listener() {
    _syncScrollOffset();
    _check(false);
  }

  ScrollController? _findController() {
    if (widget.scrollController != null) return widget.scrollController;
    if (mounted) return PrimaryScrollController.maybeOf(context);
    return null;
  }

  void _check(bool jump) {
    if (widget.alwaysShowTitle) {
      if (_c.value != 1.0) _c.value = 1.0;
      _shown = true;
      return;
    }
    final sc = _findController();
    final isSub = _isSubpage;

    if (sc == null || !mounted || !sc.hasClients) {
      if (isSub && _c.value > 0.0 && !_shown) _c.value = 0.0;
      return;
    }
    final show = isSub ? (sc.offset > widget.revealOffset) : true;
    if (show == _shown) return;
    _shown = show;
    final to = show ? 1.0 : 0.0;
    if (jump || MediaQuery.disableAnimationsOf(context)) {
      _c.value = to;
    } else {
      // Carry current velocity so reversing mid-flight stays fluid.
      _c.animateWith(SpringSimulation(_mergeSpring, _c.value, to, _c.velocity));
    }
  }

  @override
  void initState() {
    super.initState();
    if (widget.alwaysShowTitle) {
      _c.value = 1.0;
      _shown = true;
    }
    widget.scrollController?.addListener(_listener);
    _activeSc = widget.scrollController;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncScrollOffset();
      _check(true);
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (widget.alwaysShowTitle) {
      if (_c.value != 1.0) _c.value = 1.0;
      _shown = true;
      return;
    }
    if (_isSubpage && !_shown) _c.value = 0.0;
    final newSc = _findController();
    if (newSc != _activeSc) {
      _activeSc?.removeListener(_listener);
      _activeSc = newSc;
      _activeSc?.addListener(_listener);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _syncScrollOffset();
        _check(true);
      });
    }
  }

  @override
  void didUpdateWidget(covariant DynamicIslandHeader old) {
    super.didUpdateWidget(old);
    if (widget.alwaysShowTitle) {
      if (_c.value != 1.0) _c.value = 1.0;
      _shown = true;
      return;
    }
    if (old.scrollController != widget.scrollController) {
      _activeSc?.removeListener(_listener);
      _activeSc = widget.scrollController ?? PrimaryScrollController.maybeOf(context);
      _activeSc?.addListener(_listener);
      _syncScrollOffset();
      if (!_isSubpage && widget.scrollController == null) {
        _c.value = 1;
      } else {
        _shown = false;
        _c.value = 0;
        WidgetsBinding.instance.addPostFrameCallback((_) => _check(true));
      }
    } else if (old.revealOffset != widget.revealOffset) {
      _check(false);
    }
  }

  @override
  void dispose() {
    _activeSc?.removeListener(_listener);
    widget.scrollController?.removeListener(_listener);
    _c.dispose();
    super.dispose();
  }

  void _scrollToTop(int ms) {
    final sc = widget.scrollController;
    if (sc != null && sc.hasClients && sc.offset > 0) {
      HapticFeedback.lightImpact();
      sc.animateTo(0,
          duration: Duration(milliseconds: ms), curve: Curves.easeOutCubic);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mqTop = MediaQuery.paddingOf(context).top;
    final top = widget.topPadding ?? math.max(54.0, mqTop + 4.0);
    final canPop = widget.showBack ?? Navigator.canPop(context);
    final isDock = widget.isDockPage ?? (!canPop && widget.showBack != true);
    final hasContent = widget.showCenter &&
        (widget.title.trim().isNotEmpty || widget.centerWidget != null);

    final h = widget.height;
    final scrollProgress = (_scrollOffset / 50.0).clamp(0.0, 1.0);
    final screenW = MediaQuery.sizeOf(context).width;

    return SizedBox(
      height: top + h + _notifGap + _notifHeight,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Top-edge black vignette so status bar + island stay legible.
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: top + h + 24,
            child: IgnorePointer(
              child: Opacity(
                opacity: scrollProgress,
                child: const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black,
                        Color(0xD9000000),
                        Color(0x66000000),
                        Colors.transparent,
                      ],
                      stops: [0.0, 0.42, 0.78, 1.0],
                    ),
                  ),
                ),
              ),
            ),
          ),

          // ───────── Row 1: main pill ─────────
          Positioned(
            top: top,
            left: widget.horizontalMargin,
            right: widget.horizontalMargin,
            height: h,
            child: AnimatedBuilder(
              animation: Listenable.merge([_c, LiquidGlassController.instance]),
              builder: (context, _) {
                final f = hasContent ? _c.value.clamp(0.0, 1.0) : 0.0;
                return LayoutBuilder(
                  builder: (context, constraints) => _buildMainPill(
                    context,
                    constraints.maxWidth,
                    f,
                    canPop,
                    isDock,
                    hasContent,
                  ),
                );
              },
            ),
          ),

          // ───────── Row 2: notification pill ─────────
          Positioned(
            top: top + h + _notifGap,
            left: widget.horizontalMargin,
            right: widget.horizontalMargin,
            height: _notifHeight,
            child: _IslandNotifRunner(
              maxWidth: screenW - widget.horizontalMargin * 2 - 8,
            ),
          ),
        ],
      ),
    );
  }

  /// Layered so nothing ever cross-fades:
  ///  1. glass layer  – two capsules that grow toward each other, swapped for
  ///                    one identical full-width capsule once they touch
  ///  2. title layer  – fades/scales in as the glass closes
  ///  3. dock content – back/logo + right button, ALWAYS at the same spot, so
  ///                    they never jump between the "separate" and "merged" states
  Widget _buildMainPill(
    BuildContext context,
    double totalWidth,
    double f,
    bool canPop,
    bool isDock,
    bool hasContent,
  ) {
    final h = widget.height;
    final half = totalWidth / 2;
    final lw = (isDock && widget.leading == null) ? 98.0 : h;
    final rw = h;
    final leftW = lw + (half - lw) * f;
    final rightW = rw + (half - rw) * f;
    final merged = hasContent && f >= 0.995;

    final rightVisible =
        widget.trailing != null || widget.onMore != null || widget.showProfile;
    // Custom docks bring their own glass at rest: only draw ours as it merges.
    final leftGlassOpacity = widget.leading != null ? f : 1.0;
    final rightGlassOpacity =
        (widget.trailing != null || !rightVisible) ? f : 1.0;

    final side = math.max(lw, rw) + 4; // symmetric => title strictly centred

    return Stack(
      clipBehavior: Clip.none,
      children: [
        // 1. glass
        if (merged)
          Positioned.fill(
            child: IgnorePointer(
              child: AppleGlass(
                borderRadius: BorderRadius.circular(h / 2),
                child: const SizedBox.expand(),
              ),
            ),
          )
        else ...[
          Positioned(
            left: 0,
            top: 0,
            width: leftW,
            height: h,
            child: IgnorePointer(
              child: Opacity(
                opacity: leftGlassOpacity,
                child: AppleGlass(
                  borderRadius: BorderRadius.circular(h / 2),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          ),
          Positioned(
            right: 0,
            top: 0,
            width: rightW,
            height: h,
            child: IgnorePointer(
              child: Opacity(
                opacity: rightGlassOpacity,
                child: AppleGlass(
                  borderRadius: BorderRadius.circular(h / 2),
                  child: const SizedBox.expand(),
                ),
              ),
            ),
          ),
        ],

        // 2. title
        if (hasContent && f > 0.001)
          Positioned(
            left: side,
            right: side,
            top: 0,
            bottom: 0,
            child: IgnorePointer(
              ignoring: f < 0.5,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  if (widget.onCenterTap != null) {
                    HapticFeedback.lightImpact();
                    widget.onCenterTap!();
                  } else {
                    _scrollToTop(500);
                  }
                },
                child: Center(child: _titleContent(f)),
              ),
            ),
          ),

        // 3. dock content (fixed positions)
        Positioned(
          left: 0,
          top: 0,
          width: lw,
          height: h,
          child: Center(child: _buildLeft(context, canPop, isDock, lw)),
        ),
        Positioned(
          right: 0,
          top: 0,
          width: rw,
          height: h,
          child: Center(child: _buildRight(context)),
        ),
      ],
    );
  }

  Widget _buildLeft(BuildContext context, bool canPop, bool isDock, double lw) {
    if (widget.leading != null) return widget.leading!;
    final h = widget.height;

    if (isDock) {
      return PressableScale(
        scale: 0.94,
        onTap: () {
          HapticFeedback.lightImpact();
          _scrollToTop(400);
        },
        child: SizedBox(
          width: lw,
          height: h,
          child: Center(
            child: Image.asset(
              'assets/images/zenify_logo.png',
              height: 28,
              fit: BoxFit.contain,
              filterQuality: FilterQuality.high,
              errorBuilder: (_, _, _) => Image.asset(
                'assets/images/z_logo.png',
                height: 24,
                fit: BoxFit.contain,
              ),
            ),
          ),
        ),
      );
    }

    return PressableScale(
      scale: 0.88,
      onTap: () {
        HapticFeedback.lightImpact();
        if (widget.onBack != null) {
          widget.onBack!();
        } else if (canPop) {
          Navigator.maybePop(context);
        }
      },
      child: SizedBox(
        width: lw,
        height: h,
        child: Center(
          child: Icon(
            CupertinoIcons.chevron_back,
            color: LiquidGlassController.instance.c.foreground,
            size: 20,
          ),
        ),
      ),
    );
  }

  Widget _buildRight(BuildContext context) {
    if (widget.trailing != null) return widget.trailing!;
    final h = widget.height;

    if (widget.onMore != null) {
      return PressableScale(
        scale: 0.88,
        onTap: () {
          HapticFeedback.lightImpact();
          widget.onMore!();
        },
        child: SizedBox(
          width: h,
          height: h,
          child: Center(
            child: Icon(
              CupertinoIcons.ellipsis_vertical,
              color: LiquidGlassController.instance.c.foreground,
              size: 20,
            ),
          ),
        ),
      );
    }

    if (!widget.showProfile) return SizedBox(width: h);

    const av = 28.0;
    return PressableScale(
      scale: 0.88,
      onTap: () {
        HapticFeedback.lightImpact();
        if (widget.onProfileTap != null) {
          widget.onProfileTap!();
        } else {
          Navigator.of(context, rootNavigator: true).push(
            CupertinoPageRoute<void>(
              builder: (_) => const ProfileScreen(),
            ),
          );
        }
      },
      child: SizedBox(
        width: h,
        height: h,
        child: Center(
          child: SizedBox(
            width: av,
            height: av,
            child: Consumer<AuthState>(
              builder: (context, auth, _) {
                final avatar = auth.user?.avatarUrl;
                if (avatar != null && avatar.startsWith('http')) {
                  return ClipOval(
                    child: CachedNetworkImage(
                      imageUrl: avatar,
                      fit: BoxFit.cover,
                      placeholder: (_, _) =>
                          MonogramAvatar(name: auth.user?.name ?? 'Z', size: av),
                      errorWidget: (_, _, _) =>
                          MonogramAvatar(name: auth.user?.name ?? 'Z', size: av),
                    ),
                  );
                }
                return MonogramAvatar(name: auth.user?.name ?? 'Zenify', size: av);
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget _titleContent(double f) {
    final fg = LiquidGlassController.instance.c.foreground;
    // Title appears only once the glass is ~25% merged, so text never floats
    // over a half-formed capsule.
    final alpha =
        Curves.easeOutCubic.transform(((f - 0.25) / 0.75).clamp(0.0, 1.0));
    final scale = 0.9 + 0.1 * f;

    final child = widget.centerWidget ??
        Text(
          widget.title,
          key: ValueKey('title-${widget.title}'),
          maxLines: 1,
          softWrap: false,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'SF Pro Display',
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: fg,
            letterSpacing: -0.3,
          ),
        );

    if (f >= 0.999) return child;
    return Opacity(
      opacity: alpha,
      child: Transform.scale(scale: scale, child: child),
    );
  }
}

/// Standalone Apple-Glass circular action button.
class DynamicIslandActionButton extends StatelessWidget {
  const DynamicIslandActionButton({
    super.key,
    this.icon = CupertinoIcons.ellipsis_vertical,
    required this.onTap,
    this.size = 46.0,
    this.iconSize = 20.0,
  });

  final IconData icon;
  final VoidCallback onTap;
  final double size;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      scale: 0.88,
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: AppleGlass(
        borderRadius: BorderRadius.circular(size / 2),
        child: SizedBox(
          width: size,
          height: size,
          child: Center(
            child: Icon(
              icon,
              color: LiquidGlassController.instance.c.foreground,
              size: iconSize,
            ),
          ),
        ),
      ),
    );
  }
}

/// Wrap the big in-page title (hero name) with this. As you scroll, it is
/// "vacuumed" up and toward the centre while scaling down into the island.
class IslandTitleFade extends StatelessWidget {
  const IslandTitleFade({
    super.key,
    required this.controller,
    required this.revealOffset,
    required this.child,
    this.span = 140,
  });

  final ScrollController controller;
  final double revealOffset;
  final double span;
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: controller,
        child: child,
        builder: (context, child) {
          final o = controller.hasClients ? controller.offset : 0.0;
          final start = revealOffset - span;
          final t = ((o - start) / span).clamp(0.0, 1.0).toDouble();
          if (t <= 0) return child!;

          final curved = Curves.easeInOutCubic.transform(t);
          final screenWidth = MediaQuery.sizeOf(context).width;
          final double targetX = (screenWidth / 2) - 40;

          final dx = targetX * curved;
          final dy = -curved * 64.0;
          final scale = 1.0 - (0.58 * curved);
          final opacity = t > 0.82 ? (((1.0 - t) / 0.18)).clamp(0.0, 1.0) : 1.0;

          return IgnorePointer(
            ignoring: t >= 0.9,
            child: Opacity(
              opacity: opacity,
              child: Transform.translate(
                offset: Offset(dx, dy),
                child: Transform.scale(
                  scale: scale,
                  alignment: Alignment.centerLeft,
                  child: child,
                ),
              ),
            ),
          );
        },
      );
}
