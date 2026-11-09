import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart' show CupertinoIcons;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../../services/auth_state.dart';
import '../../views/profile/profile_screen.dart';
import '../tokens/app_colors.dart';
import 'apple_glass.dart';
import 'monogram_avatar.dart';
import 'pressable_scale.dart';

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

  @override
  State<DynamicIslandHeader> createState() => _DynamicIslandHeaderState();
}

class _DynamicIslandHeaderState extends State<DynamicIslandHeader> with SingleTickerProviderStateMixin {
  static const _spring = SpringDescription(mass: 1, stiffness: 300, damping: 21);

  late final AnimationController _c =
      AnimationController.unbounded(vsync: this, value: widget.scrollController == null ? 1 : 0);
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

  @override
  void initState() {
    super.initState();
    widget.scrollController?.addListener(_listener);
    WidgetsBinding.instance.addPostFrameCallback((_) => _check(true));
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
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Sits slightly lower than before (+4px).
    final top = widget.topPadding ?? (MediaQuery.paddingOf(context).top + 10);
    final canPop = widget.showBack ?? Navigator.canPop(context);
    final hasTitle = widget.showCenter && (widget.title.trim().isNotEmpty || widget.centerWidget != null);

    final double h = widget.height;
    // Symmetrical clearance so the Dynamic Island pill remains dead-center relative to screen
    // Left dock is 44px, right dock is 44px (profile or trailing action).
    // sideClearance = 44 + 8 = 52px ensures ample breathing room and prevents congestion.
    final double leftDockW = h;
    final double rightDockW = widget.trailing != null
        ? 44.0
        : (widget.showProfile ? h : 0.0);
    final double sideClearance = math.max(leftDockW, rightDockW) + 8.0;

    return Padding(
      padding: EdgeInsets.fromLTRB(widget.horizontalMargin, top, widget.horizontalMargin, 0),
      child: SizedBox(
        height: h,
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Center Island Pill: 100% mathematically centered relative to screen/camera cutout
            Positioned.fill(
              child: Padding(
                padding: EdgeInsets.symmetric(horizontal: sideClearance),
                child: Center(
                  child: AnimatedBuilder(
                    animation: _c,
                    child: AnimatedOpacity(
                      opacity: hasTitle ? 1 : 0,
                      duration: const Duration(milliseconds: 240),
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () {
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
                        child: _buildCenterIsland(context),
                      ),
                    ),
                    builder: (_, child) {
                      final v = _c.value;
                      final f = v.clamp(0.0, 1.0).toDouble();
                      return IgnorePointer(
                        ignoring: !hasTitle || f < 0.5,
                        child: Opacity(
                          opacity: f,
                          child: Transform.translate(
                            offset: Offset(0, (1 - v) * 14),
                            child: Transform.scale(
                              scale: 0.72 + 0.28 * v,
                              child: child,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
            ),

            // Left Dock
            Align(
              alignment: Alignment.centerLeft,
              child: _buildLeftDock(context, canPop),
            ),

            // Right Dock
            Align(
              alignment: Alignment.centerRight,
              child: _buildRightDock(context),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLeftDock(BuildContext context, bool canPop) {
    if (widget.leading != null) return widget.leading!;
    final h = widget.height;

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
          child: Center(
            child: canPop
                ? const Icon(CupertinoIcons.chevron_back, color: Colors.white, size: 20)
                : Image.asset(
                    'assets/images/z_logo.png',
                    width: 20,
                    height: 20,
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) =>
                        const Icon(CupertinoIcons.music_note_2, color: AppColors.crimson, size: 18),
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildCenterIsland(BuildContext context) {
    final h = widget.height;
    return AppleGlass(
      borderRadius: BorderRadius.circular(h / 2),
      tint: const Color(0x30121216),
      child: Container(
        height: h,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: Row(
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
                      style: GoogleFonts.inter(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ),
            ),
          ],
        ),
      ),
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