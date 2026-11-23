import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart' show CupertinoIcons;
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

/// Apple Dynamic Island Notification model.
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

  /// Picks cleaned artist name when known, otherwise cleaned track title.
  static String artistOrTitle({String? artist, String? title}) {
    final a = MediaNormalizer.formatArtists(artist ?? '').trim();
    if (a.isNotEmpty &&
        a.toLowerCase() != 'unknown artist' &&
        a.toLowerCase() != 'unknown') {
      return a;
    }
    return MediaNormalizer.cleanTitle(title ?? '').trim();
  }

  /// Helper to create a consistent 22x22 thumbnail or icon badge.
  static Widget trackThumb(
    String? coverUrl, {
    IconData fallbackIcon = CupertinoIcons.music_note,
    Color iconColor = const Color(0xFFE11D48),
  }) {
    if (coverUrl != null && coverUrl.startsWith('http')) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: CachedNetworkImage(
          imageUrl: coverUrl,
          width: 22,
          height: 22,
          fit: BoxFit.cover,
          errorWidget: (_, _, _) => Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Center(child: Icon(fallbackIcon, color: iconColor, size: 13)),
          ),
        ),
      );
    }
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        color: iconColor.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Center(child: Icon(fallbackIcon, color: iconColor, size: 13)),
    );
  }
}

/// Global notifier driving the Dynamic Island Header notification queue.
/// Coordinates enter/exit animations with [_NotifTicker] & [DynamicIslandHeader].
class IslandNotifier extends ChangeNotifier {
  static final IslandNotifier instance = IslandNotifier._();
  IslandNotifier._();
  factory IslandNotifier() => instance;

  final _queue = <IslandNotification>[];
  IslandNotification? _current;
  bool _isClosing = false;
  Timer? _closeTimer;
  Timer? _nextTimer;

  IslandNotification? get current => _current;
  bool get isClosing => _isClosing;

  /// Helper for firing an in-app Dynamic Island notification from anywhere.
  static void showNotification(IslandNotification n) => instance.show(n);

  void show(IslandNotification n) {
    _queue.add(n);
    if (_current == null && !_isClosing) _next();
  }

  void _next() {
    if (_queue.isEmpty) return;
    _isClosing = false;
    _current = _queue.removeAt(0);
    notifyListeners();
  }

  /// Animates the active notification closed (~280ms) before dequeuing the next item.
  /// [id] guards against double calls when multiple headers are mounted.
  void dismiss({String? id}) {
    if (_current == null || _isClosing || (id != null && id != _current!.id)) return;
    _isClosing = true;
    notifyListeners();

    _closeTimer?.cancel();
    _nextTimer?.cancel();
    _closeTimer = Timer(const Duration(milliseconds: 280), () {
      _isClosing = false;
      _current = null;
      notifyListeners();
      _nextTimer = Timer(const Duration(milliseconds: 120), () {
        if (_current == null && !_isClosing) _next();
      });
    });
  }
}

/// Notification ticker widget:
/// - Fast ~220ms intro animation for icon + text
/// - 3s duration for short text, 3–5s with smooth right-to-left scroll for longer text
/// - Symmetric close transition when [isClosing] becomes true.
class _NotifTicker extends StatefulWidget {
  const _NotifTicker({
    super.key,
    required this.notif,
    required this.isClosing,
    required this.onDone,
  });

  final IslandNotification notif;
  final bool isClosing;
  final VoidCallback onDone;

  static const Duration minHold = Duration(milliseconds: 3000);
  static const Duration maxHold = Duration(milliseconds: 5000);
  static const double speed = 55.0; // px / second

  @override
  State<_NotifTicker> createState() => _NotifTickerState();
}

class _NotifTickerState extends State<_NotifTicker> with SingleTickerProviderStateMixin {
  final _ctrl = ScrollController();
  late final AnimationController _introCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  );
  bool _dead = false;

  @override
  void initState() {
    super.initState();
    _introCtrl.forward();
    WidgetsBinding.instance.addPostFrameCallback((_) => _run());
  }

  @override
  void dispose() {
    _dead = true;
    _introCtrl.dispose();
    _ctrl.dispose();
    super.dispose();
  }

  bool get _ok => !_dead && mounted && _ctrl.hasClients;

  Future<void> _run() async {
    var elapsedMs = 0;

    // Wait for intro + pill resize to finish before measuring horizontal overflow.
    await Future<void>.delayed(const Duration(milliseconds: 260));
    elapsedMs += 260;
    if (!_ok) return;

    final overflow = _ctrl.position.maxScrollExtent;

    if (overflow > 2.0) {
      // Brief pause so user sees the action title first before scrolling.
      await Future<void>.delayed(const Duration(milliseconds: 450));
      elapsedMs += 450;
      if (!_ok) return;

      // Fit right-to-left scroll cleanly inside the 3s..5s total lifetime budget.
      final idealScrollMs = (overflow / _NotifTicker.speed * 1000).round();
      final maxScrollBudgetMs =
          (_NotifTicker.maxHold.inMilliseconds - elapsedMs - 350).clamp(1200, 3900);
      final scrollMs = idealScrollMs.clamp(1200, maxScrollBudgetMs);

      await _ctrl.animateTo(
        overflow,
        duration: Duration(milliseconds: scrollMs),
        curve: Curves.linear,
      );
      elapsedMs += scrollMs;
      if (!_ok) return;

      final postPauseMs =
          (_NotifTicker.maxHold.inMilliseconds - elapsedMs).clamp(0, 350);
      if (postPauseMs > 0) {
        await Future<void>.delayed(Duration(milliseconds: postPauseMs));
        elapsedMs += postPauseMs;
      }
    }

    // Ensure minimum 3s display time while capping strictly at 5s.
    final minRemainingMs = _NotifTicker.minHold.inMilliseconds - elapsedMs;
    if (minRemainingMs > 0) {
      await Future<void>.delayed(Duration(milliseconds: minRemainingMs));
    }
    if (!_dead && mounted) widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.notif;
    final text = Text.rich(
      TextSpan(children: [
        TextSpan(
          text: n.title,
          style: const TextStyle(
            fontFamily: 'SF Pro Display',
            fontWeight: FontWeight.w700,
            fontSize: 13.5,
            color: Colors.white,
            letterSpacing: -0.2,
          ),
        ),
        if (n.body != null && n.body!.trim().isNotEmpty)
          TextSpan(
            text: '  ${n.body!.trim()}',
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
    );

    return AnimatedOpacity(
      opacity: widget.isClosing ? 0.0 : 1.0,
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeInCubic,
      child: AnimatedScale(
        scale: widget.isClosing ? 0.88 : 1.0,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeInCubic,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (n.leading != null) ...[
                FadeTransition(
                  opacity: _introCtrl,
                  child: ScaleTransition(
                    scale: Tween<double>(begin: 0.65, end: 1.0).animate(
                      CurvedAnimation(parent: _introCtrl, curve: Curves.easeOutBack),
                    ),
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: ClipRRect(borderRadius: BorderRadius.circular(6), child: n.leading),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Flexible(
                child: FadeTransition(
                  opacity: _introCtrl,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0.08, 0),
                      end: Offset.zero,
                    ).animate(CurvedAnimation(parent: _introCtrl, curve: Curves.easeOutCubic)),
                    child: ClipRect(
                      child: SingleChildScrollView(
                        controller: _ctrl,
                        scrollDirection: Axis.horizontal,
                        physics: const NeverScrollableScrollPhysics(),
                        child: text,
                      ),
                    ),
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

/// Apple Dynamic Island-style 3-dock floating header.
///
/// 1. Left dock: back button (or logo on root pages)
/// 2. Centre dock: pill with the page title
/// 3. Right dock: profile avatar (or your own [trailing])
///
/// SCROLL MODE (works on every page: artist, album, playlist, podcast…):
/// pass the page's [scrollController] and a [revealOffset]. The centre pill is
/// hidden at the top and springs into the centre once the scroll offset passes
/// [revealOffset] (the point where the big in-page title slides under the
/// island). Scrolling back up springs it away again.
/// Without [scrollController] the header behaves exactly as before.
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
    this.height = 52.0,
    this.topPadding,
    this.horizontalMargin = 16.0,
    this.scrollController,
    this.revealOffset = 120,
    this.isDockPage,
    this.onCenterTap,
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

  /// Page scroll controller that drives the centre pill (optional).
  final ScrollController? scrollController;

  /// Scroll offset at which the centre pill spawns.
  final double revealOffset;

  /// Whether this header is on a root page in the persistent navbar dock.
  /// When true, renders the full transparent Zenify logo on the left.
  final bool? isDockPage;

  /// Optional tap handler for the centre island pill.
  final VoidCallback? onCenterTap;

  @override
  State<DynamicIslandHeader> createState() => _DynamicIslandHeaderState();
}

class _DynamicIslandHeaderState extends State<DynamicIslandHeader> with TickerProviderStateMixin {
  static const _spring = SpringDescription(mass: 1, stiffness: 300, damping: 21);

  // Subpages / detail pages start at 0.0 (strictly hidden at rest).
  // Only root dock pages with no controller (Home, Explore) start at 1.0.
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: (widget.isDockPage == true && widget.scrollController == null) ? 1.0 : 0.0,
  );
  late final AnimationController _n =
      AnimationController.unbounded(vsync: this, value: IslandNotifier.instance.current == null ? 0.0 : 1.0);
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
      if ((off - _scrollOffset).abs() > 0.5) {
        if (mounted) {
          setState(() {
            _scrollOffset = off;
          });
        }
      }
    }
  }

  void _listener() {
    _syncScrollOffset();
    _check(false);
  }

  ScrollController? _findController() {
    if (widget.scrollController != null) return widget.scrollController;
    if (mounted) {
      return PrimaryScrollController.maybeOf(context);
    }
    return null;
  }

  void _check(bool jump) {
    final sc = _findController();
    final isSub = _isSubpage;

    if (sc == null || !mounted || !sc.hasClients) {
      // If this is a subpage with in-page title and no active scroll offset, keep island hidden
      if (isSub && _c.value > 0.0 && !_shown) {
        _c.value = 0.0;
      }
      return;
    }
    final show = isSub ? (sc.offset > widget.revealOffset) : true;
    if (show == _shown) return;
    _shown = show;
    final to = show ? 1.0 : 0.0;
    if (jump || MediaQuery.disableAnimationsOf(context)) {
      _c.value = to;
    } else {
      _c.animateWith(SpringSimulation(_spring, _c.value, to, 0));
    }
  }

  void _onNotifChanged() {
    if (!mounted) return;
    final notifier = IslandNotifier.instance;
    final showNotif = notifier.current != null && !notifier.isClosing;
    final to = showNotif ? 1.0 : 0.0;
    if (MediaQuery.disableAnimationsOf(context)) {
      _n.value = to;
    } else {
      _n.animateWith(
        SpringSimulation(
          showNotif
              ? const SpringDescription(mass: 1, stiffness: 320, damping: 19)
              : const SpringDescription(mass: 1, stiffness: 360, damping: 26),
          _n.value,
          to,
          0,
        ),
      );
    }
    setState(() {});
  }

  @override
  void initState() {
    super.initState();
    widget.scrollController?.addListener(_listener);
    _activeSc = widget.scrollController;
    IslandNotifier.instance.addListener(_onNotifChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncScrollOffset();
      _check(true);
      if (IslandNotifier.instance.current != null) {
        _n.value = 1.0;
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_isSubpage && !_shown) {
      _c.value = 0.0;
    }
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
    if (old.scrollController != widget.scrollController) {
      _activeSc?.removeListener(_listener);
      _activeSc = widget.scrollController ?? PrimaryScrollController.maybeOf(context);
      _activeSc?.addListener(_listener);
      _syncScrollOffset();
      if (_isSubpage) {
        _shown = false;
        _c.value = 0;
        WidgetsBinding.instance.addPostFrameCallback((_) => _check(true));
      } else if (widget.scrollController == null) {
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
    IslandNotifier.instance.removeListener(_onNotifChanged);
    _c.dispose();
    _n.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mqTop = MediaQuery.paddingOf(context).top;
    final top = widget.topPadding ?? math.max(54.0, mqTop + 4.0);
    final canPop = widget.showBack ?? Navigator.canPop(context);
    final isDock = widget.isDockPage ?? (!canPop && widget.showBack != true);
    final active = IslandNotifier.instance.current;
    final hasContent = (widget.showCenter &&
            (widget.title.trim().isNotEmpty || widget.centerWidget != null)) ||
        active != null;

    final double h = widget.height;
    final double scrollProgress = (_scrollOffset / 50.0).clamp(0.0, 1.0);

    return Stack(
      clipBehavior: Clip.none,
      children: [
        // Top edge black fade-in effect when content scrolls up.
        // Provides a dark background vignette so clock, notifications, battery and header
        // controls remain crystal clear and legible over bright scrolling artwork.
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

        // Header floating capsule / discrete glass buttons
        Padding(
          padding: EdgeInsets.fromLTRB(
            widget.horizontalMargin,
            top,
            widget.horizontalMargin,
            0,
          ),
          child: SizedBox(
            height: h,
            child: AnimatedBuilder(
              animation:
                  Listenable.merge([_c, _n, LiquidGlassController.instance]),
              builder: (context, _) {
                final double nVal = _n.value.clamp(0.0, 1.0);
                final double cVal = _c.value.clamp(0.0, 1.0);
                final double vis = hasContent ? math.max(cVal, nVal) : 0.0;
                final double f = vis.clamp(0.0, 1.0).toDouble();

                return LayoutBuilder(
                  builder: (context, constraints) {
                    final double totalWidth = constraints.maxWidth;
                    final double halfWidth = totalWidth / 2;
                    final double expandWidth = h + (halfWidth - h) * f;

                    return Stack(
                      clipBehavior: Clip.none,
                      alignment: Alignment.center,
                      children: [
                        // When transitioning between 0 and 1, render expanding glass capsules
                        if (hasContent && f > 0.001 && f < 0.999) ...[
                          // Left expanding glass capsule
                          Positioned(
                            left: 0,
                            top: 0,
                            width: expandWidth,
                            height: h,
                            child: IgnorePointer(
                              child: AppleGlass(
                                borderRadius: BorderRadius.circular(h / 2),
                                child: const SizedBox.expand(),
                              ),
                            ),
                          ),
                          // Right expanding glass capsule
                          Positioned(
                            right: 0,
                            top: 0,
                            width: expandWidth,
                            height: h,
                            child: IgnorePointer(
                              child: AppleGlass(
                                borderRadius: BorderRadius.circular(h / 2),
                                child: const SizedBox.expand(),
                              ),
                            ),
                          ),
                        ],

                        // State A: Individual discrete circular glass buttons (Left back & Right more)
                        // Visible when at top / title not presented
                        if (f < 0.999)
                          Positioned.fill(
                            child: Opacity(
                              opacity: (1.0 - f).clamp(0.0, 1.0),
                              child: IgnorePointer(
                                ignoring: f >= 0.5,
                                child: Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceBetween,
                                  crossAxisAlignment: CrossAxisAlignment.center,
                                  children: [
                                    _buildLeftDock(context, canPop, isDock),
                                    _buildRightDock(context),
                                  ],
                                ),
                              ),
                            ),
                          ),

                        // State B: Expanded single unified floating glass capsule
                        // Holding Left <, Page Title (strictly centered), and Right ⋮
                        if (hasContent && f > 0.001)
                          Positioned.fill(
                            child: Opacity(
                              opacity: f.clamp(0.0, 1.0),
                              child: IgnorePointer(
                                ignoring: f < 0.5,
                                child: _buildUnifiedCapsule(
                                  context,
                                  canPop,
                                  isDock,
                                  expansionProgress: f,
                                ),
                              ),
                            ),
                          ),
                      ],
                    );
                  },
                );
              },
            ),
          ),
        ),
      ],
    );
  }

  /// Discrete left circular button
  Widget _buildLeftDock(BuildContext context, bool canPop, bool isDock) {
    if (widget.leading != null) return widget.leading!;
    final h = widget.height;

    if (isDock) {
      return PressableScale(
        scale: 0.94,
        onTap: () {
          HapticFeedback.lightImpact();
          final sc = widget.scrollController;
          if (sc != null && sc.hasClients && sc.offset > 0) {
            sc.animateTo(
              0,
              duration: const Duration(milliseconds: 400),
              curve: Curves.easeOutCubic,
            );
          }
        },
        child: AppleGlass(
          borderRadius: BorderRadius.circular(h / 2),
          child: Container(
            height: h,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            alignment: Alignment.center,
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
      child: AppleGlass(
        borderRadius: BorderRadius.circular(h / 2),
        child: SizedBox(
          width: h,
          height: h,
          child: Center(
            child: Icon(
              CupertinoIcons.chevron_back,
              color: LiquidGlassController.instance.c.foreground,
              size: 20,
            ),
          ),
        ),
      ),
    );
  }

  /// Single unified floating glass capsule matching:
  /// height: 52px; border-radius: 26px; padding: 0 4px;
  /// Holding [ Back <    Title (centered)    Vertical ⋮ ]
  Widget _buildUnifiedCapsule(
    BuildContext context,
    bool canPop,
    bool isDock, {
    double expansionProgress = 1.0,
  }) {
    final h = widget.height;
    final notifier = IslandNotifier.instance;
    final active = notifier.current;
    final closing = notifier.isClosing;

    return AppleGlass(
      borderRadius: BorderRadius.circular(h / 2),
      child: Container(
        height: h,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Center: Page title / notification (strictly centered on the capsule)
            Positioned(
              left: 50,
              right: 50,
              top: 0,
              bottom: 0,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  final cur = IslandNotifier.instance.current;
                  if (cur != null) {
                    HapticFeedback.lightImpact();
                    cur.onTap?.call();
                    IslandNotifier.instance.dismiss(id: cur.id);
                    return;
                  }
                  if (widget.onCenterTap != null) {
                    HapticFeedback.lightImpact();
                    widget.onCenterTap!();
                    return;
                  }
                  final sc = widget.scrollController;
                  if (sc != null && sc.hasClients && sc.offset > 0) {
                    HapticFeedback.lightImpact();
                    sc.animateTo(
                      0,
                      duration: const Duration(milliseconds: 500),
                      curve: Curves.easeOutCubic,
                    );
                  }
                },
                child: Center(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    switchInCurve: Curves.easeOutCubic,
                    switchOutCurve: Curves.easeInCubic,
                    child: active != null
                        ? _NotifTicker(
                            key: ValueKey(active.id),
                            notif: active,
                            isClosing: closing,
                            onDone: () =>
                                IslandNotifier.instance.dismiss(id: active.id),
                          )
                        : _titleContent(expansionProgress: expansionProgress),
                  ),
                ),
              ),
            ),

            // Left: back button or logo
            Positioned(
              left: 0,
              top: 0,
              bottom: 0,
              child: Center(child: _buildCapsuleLeft(context, canPop, isDock)),
            ),

            // Right: Three-dot button or profile avatar
            Positioned(
              right: 0,
              top: 0,
              bottom: 0,
              child: Center(child: _buildCapsuleRight(context)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCapsuleLeft(BuildContext context, bool canPop, bool isDock) {
    if (widget.leading != null) return widget.leading!;
    if (isDock) {
      return PressableScale(
        scale: 0.94,
        onTap: () {
          HapticFeedback.lightImpact();
          final sc = widget.scrollController;
          if (sc != null && sc.hasClients && sc.offset > 0) {
            sc.animateTo(
              0,
              duration: const Duration(milliseconds: 400),
              curve: Curves.easeOutCubic,
            );
          }
        },
        child: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          alignment: Alignment.center,
          child: Image.asset(
            'assets/images/zenify_logo.png',
            height: 24,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
            errorBuilder: (_, _, _) => Image.asset(
              'assets/images/z_logo.png',
              height: 22,
              fit: BoxFit.contain,
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
        width: 44,
        height: 44,
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

  Widget _buildCapsuleRight(BuildContext context) {
    if (widget.trailing != null) return widget.trailing!;
    if (widget.onMore != null) {
      return PressableScale(
        scale: 0.88,
        onTap: () {
          HapticFeedback.lightImpact();
          widget.onMore!();
        },
        child: SizedBox(
          width: 44,
          height: 44,
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
    if (!widget.showProfile) return const SizedBox(width: 44);
    return PressableScale(
      scale: 0.88,
      onTap: () {
        HapticFeedback.lightImpact();
        if (widget.onProfileTap != null) {
          widget.onProfileTap!();
        } else {
          Navigator.push(
              context, MaterialPageRoute(builder: (_) => const ProfileScreen()));
        }
      },
      child: SizedBox(
        width: 44,
        height: 44,
        child: Center(
          child: SizedBox(
            width: 28,
            height: 28,
            child: Consumer<AuthState>(
              builder: (context, auth, _) {
                final avatar = auth.user?.avatarUrl;
                if (avatar != null && avatar.startsWith('http')) {
                  return ClipOval(
                    child: CachedNetworkImage(
                      imageUrl: avatar,
                      fit: BoxFit.cover,
                      placeholder: (_, _) => MonogramAvatar(
                          name: auth.user?.name ?? 'Z', size: 28),
                      errorWidget: (_, _, _) => MonogramAvatar(
                          name: auth.user?.name ?? 'Z', size: 28),
                    ),
                  );
                }
                return MonogramAvatar(
                    name: auth.user?.name ?? 'Zenify', size: 28);
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget _titleContent({double expansionProgress = 1.0}) {
    final fg = LiquidGlassController.instance.c.foreground;
    final titleAlpha = Curves.easeOutCubic
        .transform(((expansionProgress - 0.25) / 0.75).clamp(0.0, 1.0));
    final titleScale = 0.88 + 0.12 * expansionProgress;

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

    if (expansionProgress >= 0.999) return child;

    return Opacity(
      opacity: titleAlpha,
      child: Transform.scale(
        scale: titleScale,
        child: child,
      ),
    );
  }

  /// Discrete right circular button
  Widget _buildRightDock(BuildContext context) {
    if (widget.trailing != null) return widget.trailing!;
    if (widget.onMore != null) {
      return DynamicIslandActionButton(
        icon: CupertinoIcons.ellipsis_vertical,
        onTap: widget.onMore!,
        size: widget.height,
      );
    }
    if (!widget.showProfile) return SizedBox(width: widget.height);
    final h = widget.height;

    return PressableScale(
      scale: 0.88,
      onTap: () {
        HapticFeedback.lightImpact();
        if (widget.onProfileTap != null) {
          widget.onProfileTap!();
        } else {
          Navigator.push(
              context, MaterialPageRoute(builder: (_) => const ProfileScreen()));
        }
      },
      child: AppleGlass(
        borderRadius: BorderRadius.circular(h / 2),
        child: SizedBox(
          width: h,
          height: h,
          child: Center(
            child: SizedBox(
              width: 30,
              height: 30,
              child: Consumer<AuthState>(
                builder: (context, auth, _) {
                  final avatar = auth.user?.avatarUrl;
                  if (avatar != null && avatar.startsWith('http')) {
                    return ClipOval(
                      child: CachedNetworkImage(
                        imageUrl: avatar,
                        fit: BoxFit.cover,
                        placeholder: (_, _) => MonogramAvatar(
                            name: auth.user?.name ?? 'Z', size: 30),
                        errorWidget: (_, _, _) => MonogramAvatar(
                            name: auth.user?.name ?? 'Z', size: 30),
                      ),
                    );
                  }
                  return MonogramAvatar(
                      name: auth.user?.name ?? 'Zenify', size: 30);
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Standard Apple-Glass circular action button for Dynamic Island header docks
/// (e.g. Three-Dot more options button, search button, etc.).
class DynamicIslandActionButton extends StatelessWidget {
  const DynamicIslandActionButton({
    super.key,
    this.icon = CupertinoIcons.ellipsis_vertical,
    required this.onTap,
    this.size = 52.0,
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

/// Wrap the big in-page title (hero name) with this.
/// As you scroll down inch by inch, it creates a signature "vacuum pull" effect:
/// the hero name curves diagonally upward and horizontally toward the screen center
/// while scaling down to island size, smoothly being absorbed into the Dynamic Island pill.
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

          // Vacuum pull curve: gentle lift that accelerates directly into the center island
          final curved = Curves.easeInOutCubic.transform(t);

          final screenWidth = MediaQuery.sizeOf(context).width;
          // Vector from the left margin (~20px) toward the horizontal center of the screen
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