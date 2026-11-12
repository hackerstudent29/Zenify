import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart' show CupertinoIcons;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../services/auth_state.dart';
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
/// No internal timer: the [_NotifTicker] widget decides when to dismiss.
class IslandNotifier extends ChangeNotifier {
  static final IslandNotifier instance = IslandNotifier._();
  IslandNotifier._();
  factory IslandNotifier() => instance;

  final _queue = <IslandNotification>[];
  IslandNotification? _current;

  IslandNotification? get current => _current;

  /// Helper for firing an in-app Dynamic Island notification from anywhere.
  static void showNotification(IslandNotification n) => instance.show(n);

  void show(IslandNotification n) {
    _queue.add(n);
    if (_current == null) _next();
  }

  void _next() {
    if (_queue.isEmpty) return;
    _current = _queue.removeAt(0);
    notifyListeners();
  }

  /// [id] guards against double calls (e.g. two headers alive during a route transition).
  void dismiss({String? id}) {
    if (_current == null || (id != null && id != _current!.id)) return;
    _current = null;
    notifyListeners();
    Future.delayed(const Duration(milliseconds: 450), () {
      if (_current == null) _next();
    });
  }
}

/// Notification ticker widget: 5s hold if text fits, or 1 seamless full marquee loop if long.
class _NotifTicker extends StatefulWidget {
  const _NotifTicker({super.key, required this.notif, required this.onDone});
  final IslandNotification notif;
  final VoidCallback onDone;

  static const Duration hold = Duration(seconds: 5);
  static const double speed = 40.0; // px / second
  static const double gap = 48.0;

  @override
  State<_NotifTicker> createState() => _NotifTickerState();
}

class _NotifTickerState extends State<_NotifTicker> {
  final _ctrl = ScrollController();
  final _textKey = GlobalKey();
  bool _loop = false;
  bool _dead = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _run());
  }

  @override
  void dispose() {
    _dead = true;
    _ctrl.dispose();
    super.dispose();
  }

  bool get _ok => !_dead && mounted && _ctrl.hasClients;

  Future<void> _run() async {
    final sw = Stopwatch()..start();

    // let the pill finish growing so we measure the final width
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (!_ok) return;

    final overflow = _ctrl.position.maxScrollExtent > 1;

    if (overflow) {
      await Future<void>.delayed(const Duration(milliseconds: 700)); // read the start first
      if (!_ok) return;

      final w = (_textKey.currentContext?.findRenderObject() as RenderBox?)?.size.width ?? 0;
      if (w > 1) {
        setState(() => _loop = true); // add the duplicate for a seamless loop
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (!_ok) return;

        final dist = w + _NotifTicker.gap;
        await _ctrl.animateTo(
          dist,
          duration: Duration(milliseconds: (dist / _NotifTicker.speed * 1000).round()),
          curve: Curves.linear,
        );
        if (!_ok) return;
        _ctrl.jumpTo(0); // identical frame, so the loop is invisible
      }
    }

    // short messages: hold until 5s total. Long messages: already past 5s, so no extra wait
    final remaining = _NotifTicker.hold - sw.elapsed;
    if (remaining > Duration.zero) await Future<void>.delayed(remaining);
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
        if (n.body != null)
          TextSpan(
            text: '  ${n.body}',
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

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (n.leading != null) ...[
            SizedBox(
              width: 22,
              height: 22,
              child: ClipRRect(borderRadius: BorderRadius.circular(6), child: n.leading),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: ClipRect(
              child: SingleChildScrollView(
                controller: _ctrl,
                scrollDirection: Axis.horizontal,
                physics: const NeverScrollableScrollPhysics(),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    KeyedSubtree(key: _textKey, child: text),
                    if (_loop) ...[const SizedBox(width: _NotifTicker.gap), text],
                  ],
                ),
              ),
            ),
          ),
        ],
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
    this.height = 44.0,
    this.topPadding,
    this.horizontalMargin = 14.0,
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

  late final AnimationController _c =
      AnimationController.unbounded(vsync: this, value: widget.scrollController == null ? 1 : 0);
  late final AnimationController _n =
      AnimationController.unbounded(vsync: this, value: IslandNotifier.instance.current == null ? 0.0 : 1.0);
  bool _shown = false;

  void _listener() => _check(false);

  void _check(bool jump) {
    final sc = widget.scrollController;
    if (sc == null || !mounted || !sc.hasClients) return;
    final show = sc.offset > widget.revealOffset;
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
    final active = IslandNotifier.instance.current;
    final to = active != null ? 1.0 : 0.0;
    if (MediaQuery.disableAnimationsOf(context)) {
      _n.value = to;
    } else {
      _n.animateWith(SpringSimulation(_spring, _n.value, to, 0));
    }
    setState(() {});
  }

  @override
  void initState() {
    super.initState();
    widget.scrollController?.addListener(_listener);
    IslandNotifier.instance.addListener(_onNotifChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _check(true);
      if (IslandNotifier.instance.current != null) {
        _n.value = 1.0;
      }
    });
  }

  @override
  void didUpdateWidget(covariant DynamicIslandHeader old) {
    super.didUpdateWidget(old);
    if (old.scrollController != widget.scrollController) {
      old.scrollController?.removeListener(_listener);
      widget.scrollController?.addListener(_listener);
      if (widget.scrollController == null) {
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
    widget.scrollController?.removeListener(_listener);
    IslandNotifier.instance.removeListener(_onNotifChanged);
    _c.dispose();
    _n.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Sits slightly lower than before (+4px).
    final top = widget.topPadding ?? (MediaQuery.paddingOf(context).top + 10);
    final canPop = widget.showBack ?? Navigator.canPop(context);
    final isDock = widget.isDockPage ?? (!canPop && widget.showBack != true);
    final active = IslandNotifier.instance.current;
    final hasContent = (widget.showCenter && (widget.title.trim().isNotEmpty || widget.centerWidget != null)) || active != null;

    final double h = widget.height;
    // Symmetrical clearance so the Dynamic Island pill remains dead-center relative to screen
    // On dock root pages, the full transparent logo is ~86px wide.
    // On subpages with back button, left dock is 44px.
    final double leftDockW = isDock ? 108.0 : (canPop ? h : 0.0);
    final double rightDockW = widget.trailing != null
        ? 44.0
        : (widget.showProfile ? h : 0.0);
    final double leftClearance = leftDockW > 0 ? leftDockW + 10.0 : 8.0;
    final double rightClearance = rightDockW > 0 ? rightDockW + 10.0 : 8.0;

    return Padding(
      padding: EdgeInsets.fromLTRB(widget.horizontalMargin, top, widget.horizontalMargin, 0),
      child: SizedBox(
        height: h,
        child: AnimatedBuilder(
          animation: Listenable.merge([_c, _n]),
          builder: (context, _) {
            final double nVal = _n.value.clamp(0.0, 1.0);
            final double cVal = _c.value.clamp(0.0, 1.0);
            final double vis = math.max(cVal, nVal);
            final double f = vis.clamp(0.0, 1.0).toDouble();

            // Keep strict non-overlapping clearance around left & right docks so notifications
            // stay compact in the center space and never overlap Back, Brand, or Profile controls.
            const double dockScale = 1.0;
            const double dockOpacity = 1.0;

            return Stack(
              alignment: Alignment.center,
              children: [
                // Center Island Pill: strictly bounded inside the open gap between left & right docks
                Positioned.fill(
                  child: Padding(
                    padding: EdgeInsets.only(left: leftClearance, right: rightClearance),
                    child: Center(
                      child: AnimatedOpacity(
                        opacity: hasContent ? 1 : 0,
                        duration: const Duration(milliseconds: 240),
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () {
                            final cur = IslandNotifier.instance.current;
                            if (cur != null) {
                              HapticFeedback.lightImpact();
                              if (cur.onTap != null) {
                                cur.onTap!();
                              }
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
                          child: IgnorePointer(
                            ignoring: !hasContent || f < 0.5,
                            child: Opacity(
                              opacity: f,
                              child: Transform.translate(
                                offset: Offset(0, (1 - f) * 14),
                                child: Transform.scale(
                                  scale: 0.72 + 0.28 * f,
                                  child: _buildCenterIsland(context),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),

                // Left Dock (shrinks and fades as notification appears)
                Align(
                  alignment: Alignment.centerLeft,
                  child: IgnorePointer(
                    ignoring: false,
                    child: Transform.scale(
                      scale: dockScale,
                      alignment: Alignment.centerLeft,
                      child: Opacity(
                        opacity: dockOpacity,
                        child: _buildLeftDock(context, canPop, isDock),
                      ),
                    ),
                  ),
                ),

                // Right Dock (shrinks and fades as notification appears)
                Align(
                  alignment: Alignment.centerRight,
                  child: IgnorePointer(
                    ignoring: false,
                    child: Transform.scale(
                      scale: dockScale,
                      alignment: Alignment.centerRight,
                      child: Opacity(
                        opacity: dockOpacity,
                        child: _buildRightDock(context),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

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
        child: SizedBox(
          height: h,
          child: Align(
            alignment: Alignment.centerLeft,
            child: Image.asset(
              'assets/images/zenify_logo.png',
              height: 26,
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
        tint: const Color(0x26121216),
        child: SizedBox(
          width: h,
          height: h,
          child: const Center(
            child: Icon(CupertinoIcons.chevron_back, color: Colors.white, size: 20),
          ),
        ),
      ),
    );
  }

  Widget _buildCenterIsland(BuildContext context) {
    final h = widget.height;
    final active = IslandNotifier.instance.current;

    return AppleGlass(
      borderRadius: BorderRadius.circular(h / 2),
      tint: const Color(0x30121216),
      child: Container(
        height: h,
        padding: active != null
            ? const EdgeInsets.symmetric(horizontal: 4)
            : const EdgeInsets.symmetric(horizontal: 14),
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 220),
          child: active != null
              ? _NotifTicker(
                  key: ValueKey(active.id),
                  notif: active,
                  onDone: () => IslandNotifier.instance.dismiss(id: active.id),
                )
              : _titleContent(),
        ),
      ),
    );
  }

  Widget _titleContent() {
    return Row(
      key: const ValueKey('title'),
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Flexible(
          child: widget.centerWidget ??
              _HeaderMarquee(
                resetKey: widget.title,
                child: Text(
                  widget.title,
                  maxLines: 1,
                  softWrap: false,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontFamily: 'SF Pro Display',
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    letterSpacing: -0.3,
                  ),
                ),
              ),
        ),
      ],
    );
  }

  Widget _buildRightDock(BuildContext context) {
    if (widget.trailing != null) return widget.trailing!;
    if (!widget.showProfile) return const SizedBox(width: 44);
    final h = widget.height;

    return PressableScale(
      scale: 0.88,
      onTap: () {
        HapticFeedback.lightImpact();
        if (widget.onProfileTap != null) {
          widget.onProfileTap!();
        } else {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen()));
        }
      },
      child: AppleGlass(
        borderRadius: BorderRadius.circular(h / 2),
        tint: const Color(0x26121216),
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
                        placeholder: (_, _) => MonogramAvatar(name: auth.user?.name ?? 'Z', size: 30),
                        errorWidget: (_, _, _) => MonogramAvatar(name: auth.user?.name ?? 'Z', size: 30),
                      ),
                    );
                  }
                  return MonogramAvatar(name: auth.user?.name ?? 'Zenify', size: 30);
                },
              ),
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

/// Smooth right-to-left full loop ticker marquee every 5 seconds for long titles.
/// Scrolls continuously in one single direction across a full loop (never backs up).
class _HeaderMarquee extends StatefulWidget {
  const _HeaderMarquee({required this.child, this.resetKey});

  final Widget child;
  final Object? resetKey;
  static const Duration interval = Duration(seconds: 5);
  static const double speed = 36.0; // px / second

  @override
  State<_HeaderMarquee> createState() => _HeaderMarqueeState();
}

class _HeaderMarqueeState extends State<_HeaderMarquee> {
  final ScrollController _ctrl = ScrollController();
  final GlobalKey _childKey = GlobalKey();
  int _run = 0;
  bool _needsScroll = false;

  bool _alive(int id) => mounted && id == _run;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
  }

  @override
  void didUpdateWidget(covariant _HeaderMarquee old) {
    super.didUpdateWidget(old);
    if (old.resetKey != widget.resetKey) {
      if (_ctrl.hasClients) _ctrl.jumpTo(0);
      _needsScroll = false;
      _start();
    }
  }

  @override
  void dispose() {
    _run++;
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    final id = ++_run;
    while (_alive(id)) {
      await Future<void>.delayed(_HeaderMarquee.interval);
      if (!_alive(id) || !_ctrl.hasClients) continue;
      try {
        final renderBox = _childKey.currentContext?.findRenderObject() as RenderBox?;
        final childWidth = renderBox?.size.width ?? 0;
        final max = _ctrl.position.maxScrollExtent;
        if (max < 2 || childWidth < 2) continue;

        if (!_needsScroll) {
          if (mounted) setState(() => _needsScroll = true);
          await Future<void>.delayed(const Duration(milliseconds: 100));
          if (!_alive(id) || !_ctrl.hasClients) continue;
        }

        // Distance for one complete continuous seamless full loop
        const double gap = 48.0;
        final double loopDistance = childWidth + gap;

        // Smooth right-to-left animation across the full distance
        final duration = Duration(milliseconds: (loopDistance / _HeaderMarquee.speed * 1000).round());
        await _ctrl.animateTo(
          loopDistance,
          duration: duration,
          curve: Curves.linear,
        );

        if (!_alive(id) || !_ctrl.hasClients) return;
        // Instant seamless snap to 0 (visually identical duplicate) - full loop completed!
        _ctrl.jumpTo(0);
      } catch (_) {
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        controller: _ctrl,
        scrollDirection: Axis.horizontal,
        physics: const NeverScrollableScrollPhysics(),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            KeyedSubtree(key: _childKey, child: widget.child),
            if (_needsScroll) ...[
              const SizedBox(width: 48),
              widget.child,
            ],
          ],
        ),
      );
}