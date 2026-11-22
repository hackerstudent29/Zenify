// ignore_for_file: unused_element
import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart'
    show
        CupertinoActivityIndicator,
        CupertinoIcons,
        CupertinoSliverRefreshControl,
        RefreshIndicatorMode;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/equalizer_bars.dart';
import '../../design_system/zen.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/player_state.dart';
import '../details/artist_screen.dart';
import '../details/album_screen.dart';
import '../details/artist_popup.dart';
import '../details/category_screen.dart';
import '../../models/artist_ref.dart';
import '../../design_system/widgets/interactive_artists_text.dart';
import '../../services/artist_service.dart';
import '../../services/country_service.dart';
import '../../services/listening_history_service.dart';
import '../../services/innertube_service.dart';
import '../../services/recommendation_engine.dart';
import '../../services/user_preferences_service.dart';
import '../../services/update_service.dart';
import '../../utils/media_normalizer.dart';

/* ------------------------------------------------------------------ */
/*  Physics primitives                                                  */
/* ------------------------------------------------------------------ */
const _kPressSpring = SpringDescription(mass: 1, stiffness: 430, damping: 21);
const _kRevealSpring = SpringDescription(mass: 1, stiffness: 170, damping: 22);

/// Apple Music media-card corner radius (minimal, not bubbly).
const double _kCardR = 10;

const _kGray = ColorFilter.matrix(<double>[
  0.2126, 0.7152, 0.0722, 0, 0, //
  0.2126, 0.7152, 0.0722, 0, 0,
  0.2126, 0.7152, 0.0722, 0, 0,
  0, 0, 0, 1, 0,
]);

/// Horizontal shelf physics: flings settle on a card with a real spring.
class SnapSpringPhysics extends ScrollPhysics {
  const SnapSpringPhysics({super.parent, required this.itemExtent});
  final double itemExtent;

  @override
  SnapSpringPhysics applyTo(ScrollPhysics? ancestor) =>
      SnapSpringPhysics(parent: buildParent(ancestor), itemExtent: itemExtent);

  @override
  SpringDescription get spring =>
      SpringDescription.withDampingRatio(mass: 0.5, stiffness: 110, ratio: 1.0);

  double _target(ScrollMetrics m, double velocity) {
    final page = m.pixels / itemExtent;
    final tol = toleranceFor(m).velocity;
    final double t;
    if (velocity < -tol) {
      t = page.floorToDouble();
    } else if (velocity > tol) {
      t = page.ceilToDouble();
    } else {
      t = page.roundToDouble();
    }
    return (t * itemExtent)
        .clamp(m.minScrollExtent, m.maxScrollExtent)
        .toDouble();
  }

  @override
  Simulation? createBallisticSimulation(
    ScrollMetrics position,
    double velocity,
  ) {
    if ((velocity <= 0 && position.pixels <= position.minScrollExtent) ||
        (velocity >= 0 && position.pixels >= position.maxScrollExtent)) {
      return super.createBallisticSimulation(position, velocity);
    }
    final target = _target(position, velocity);
    if ((target - position.pixels).abs() < 0.5) return null;
    return ScrollSpringSimulation(
      spring,
      position.pixels,
      target,
      velocity,
      tolerance: toleranceFor(position),
    );
  }

  @override
  bool get allowImplicitScrolling => false;
}

/// Press feedback with a real spring (squash on touch-down, bounce back on release).
class SpringPress extends StatefulWidget {
  const SpringPress({
    super.key,
    required this.child,
    this.onTap,
    this.scale = 0.96,
  });
  final Widget child;
  final VoidCallback? onTap;
  final double scale;

  @override
  State<SpringPress> createState() => _SpringPressState();
}

class _SpringPressState extends State<SpringPress>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: 1,
  );

  void _to(double v) =>
      _c.animateWith(SpringSimulation(_kPressSpring, _c.value, v, 0));

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.onTap == null) return widget.child;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTapDown: (_) => _to(widget.scale),
      onTapUp: (_) => _to(1),
      onTapCancel: () => _to(1),
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, child) => Transform.scale(scale: _c.value, child: child),
      ),
    );
  }
}

/// Spring entrance (fade + rise). Slivers build lazily, so each section
/// animates in the moment it scrolls into view.
class Reveal extends StatefulWidget {
  const Reveal({super.key, required this.child, this.delay = Duration.zero});
  final Widget child;
  final Duration delay;

  @override
  State<Reveal> createState() => _RevealState();
}

class _RevealState extends State<Reveal> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );
  Timer? _t;

  @override
  void initState() {
    super.initState();
    void go() => _c.animateWith(SpringSimulation(_kRevealSpring, 0, 1, 0));
    if (widget.delay == Duration.zero) {
      go();
    } else {
      _t = Timer(widget.delay, () {
        if (mounted) go();
      });
    }
  }

  @override
  void dispose() {
    _t?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (_, child) {
        final v = _c.value;
        return Opacity(
          opacity: v.clamp(0.0, 1.0).toDouble(),
          child: Transform.translate(
            offset: Offset(0, (1 - v) * 24),
            child: child,
          ),
        );
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Small shared widgets                                                */
/* ------------------------------------------------------------------ */
class _Img extends StatelessWidget {
  const _Img(
    this.url, {
    this.radius = 10,
    this.circular = false,
    this.cacheWidth = 520,
  });
  final String url;
  final double radius;
  final bool circular;
  final int cacheWidth;

  @override
  Widget build(BuildContext context) {
    final resolved = MediaNormalizer.upgradeArtworkUrl(
      url,
      isArtistAvatar: circular,
    );
    final img = CachedNetworkImage(
      imageUrl: resolved,
      fit: BoxFit.cover,
      memCacheWidth: cacheWidth,
      fadeInDuration: const Duration(milliseconds: 220),
      placeholder: (context, url) => Container(color: AppColors.surface2),
      errorWidget: (context, errUrl, error) {
        if (errUrl.contains('maxresdefault.jpg')) {
          return CachedNetworkImage(
            imageUrl: errUrl.replaceAll('maxresdefault.jpg', 'sddefault.jpg'),
            fit: BoxFit.cover,
            memCacheWidth: cacheWidth,
            fadeInDuration: const Duration(milliseconds: 220),
            placeholder: (_, _) => Container(color: AppColors.surface2),
            errorWidget: (_, sdUrl, _) => CachedNetworkImage(
              imageUrl: sdUrl.replaceAll('sddefault.jpg', 'hqdefault.jpg'),
              fit: BoxFit.cover,
              memCacheWidth: cacheWidth,
              errorWidget: (_, _, _) => Container(
                color: AppColors.surface2,
                child: Icon(
                  circular
                      ? CupertinoIcons.person_fill
                      : Icons.music_note_rounded,
                  color: AppColors.textTertiary,
                ),
              ),
            ),
          );
        }
        return Container(
          color: AppColors.surface2,
          child: const Icon(
            Icons.music_note_rounded,
            color: AppColors.textTertiary,
          ),
        );
      },
    );
    if (circular) return ClipOval(child: img);
    if (radius <= 0) return img;
    return ClipRRect(borderRadius: BorderRadius.circular(radius), child: img);
  }
}

/// Duotone artwork (grey image washed with a colour) - Apple's category look.
class _TintedArt extends StatelessWidget {
  const _TintedArt({
    required this.url,
    required this.color,
    required this.size,
  });
  final String url;
  final Color color;
  final double size;
  final double radius = 12;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 12,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: Stack(
          fit: StackFit.expand,
          children: [
            ColorFiltered(
              colorFilter: _kGray,
              child: _Img(url, radius: 0, cacheWidth: 300),
            ),
            ColoredBox(color: color.withValues(alpha: 0.62)),
          ],
        ),
      ),
    );
  }
}

typedef _EqBars = EqualizerBars;

/// Section title with Apple's trailing chevron. Optional small line above.
class _SecHeader extends StatelessWidget {
  const _SecHeader({required this.title, this.overline, this.onMore});
  final String title;
  final String? overline;
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 10),
      child: SpringPress(
        scale: 0.985,
        onTap: onMore,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (overline != null && overline!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Text(
                        overline!.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: 'SF Pro Text',
                          color: AppColors.textSecondary,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.6,
                        ),
                      ),
                    ),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Flexible(
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: 'SF Pro Display',
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -0.4,
                          ),
                        ),
                      ),
                      if (onMore != null) ...[
                        const SizedBox(width: 4),
                        const Icon(
                          CupertinoIcons.chevron_right,
                          color: AppColors.textSecondary,
                          size: 16,
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Shelf extends StatelessWidget {
  const _Shelf({
    required this.height,
    required this.itemExtent,
    required this.count,
    required this.builder,
  });
  final double height, itemExtent;
  final int count;
  final Widget Function(BuildContext, int) builder;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        physics: SnapSpringPhysics(
          parent: const BouncingScrollPhysics(),
          itemExtent: itemExtent,
        ),
        itemExtent: itemExtent,
        itemCount: count,
        addAutomaticKeepAlives: false,
        // ignore: deprecated_member_use
        cacheExtent: itemExtent * 2,
        itemBuilder: (c, i) => RepaintBoundary(
          child: Padding(
            padding: const EdgeInsets.only(right: 14),
            child: builder(c, i),
          ),
        ),
      ),
    );
  }
}

/// Frosted round play button (Apple Music artwork overlay).
class _GlassPlay extends StatelessWidget {
  const _GlassPlay({required this.playing, this.size = 42, this.solid = false});
  final bool playing;
  final double size;
  final bool solid;

  @override
  Widget build(BuildContext context) {
    final icon = AnimatedSwitcher(
      duration: const Duration(milliseconds: 260),
      switchInCurve: Curves.easeOutCubic,
      transitionBuilder: (c, a) => FadeTransition(
        opacity: a,
        child: ScaleTransition(scale: a, child: c),
      ),
      child: playing
          ? _EqBars(
              key: const ValueKey('eq'),
              playing: true,
              height: size * 0.38,
            )
          : Icon(
              Icons.play_arrow_rounded,
              key: const ValueKey('pl'),
              color: solid ? Colors.black : Colors.white,
              size: size * 0.62,
            ),
    );
    if (solid) {
      return Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: playing ? AppColors.accent : Colors.white,
          shape: BoxShape.circle,
        ),
        child: icon,
      );
    }
    return ClipOval(
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          color: Colors.white.withValues(alpha: 0.24),
          child: icon,
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  HERO - Apple Music "Top Picks" carousel                             */
/*  Caption above the artwork, big square media card, soft parallax.    */
/* ------------------------------------------------------------------ */
class _HeroItem {
  const _HeroItem(this.track, this.tag);
  final Track track;
  final String tag;
}

class _Hero extends StatefulWidget {
  const _Hero({
    super.key,
    required this.items,
    required this.player,
    required this.onTapItem,
  });
  final List<_HeroItem> items;
  final PlayerState player;
  final void Function(int index) onTapItem;

  @override
  State<_Hero> createState() => _HeroState();
}

class _HeroState extends State<_Hero> {
  final _pc = PageController(viewportFraction: 0.72);
  int _cur = 0;
  Timer? _autoTimer;
  Timer? _resumeTimer;

  @override
  void initState() {
    super.initState();
    _startAutoLoop();
  }

  void _startAutoLoop() {
    _autoTimer?.cancel();
    if (widget.items.length <= 1) return;
    _autoTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !_pc.hasClients || widget.items.isEmpty) return;
      final next = (_cur + 1) % widget.items.length;
      _pc.animateToPage(
        next,
        duration: const Duration(milliseconds: 800),
        curve: Curves.easeInOutCubic,
      );
    });
  }

  void _pauseAutoLoop() {
    _autoTimer?.cancel();
    _resumeTimer?.cancel();
    _resumeTimer = Timer(const Duration(seconds: 6), () {
      if (mounted) _startAutoLoop();
    });
  }

  @override
  void dispose() {
    _autoTimer?.cancel();
    _resumeTimer?.cancel();
    _pc.dispose();
    super.dispose();
  }

  void _tapCard(int i) {
    if (i == _cur) {
      widget.onTapItem(i);
    } else {
      HapticFeedback.selectionClick();
      _pc.animateToPage(
        i,
        duration: const Duration(milliseconds: 500),
        curve: Curves.easeOutCubic,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.items;
    final w = MediaQuery.sizeOf(context).width;
    final cardW = w * 0.72 - 14;
    final cardH = cardW + 90; // square artwork + 90px caption window

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 16, 20, 12),
          child: Text(
            'Top Picks for You',
            style: TextStyle(
              fontFamily: 'SF Pro Display',
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.4,
            ),
          ),
        ),
        Listener(
          onPointerDown: (_) => _pauseAutoLoop(),
          child: SizedBox(
            height: cardH + 16,
            child: PageView.builder(
              controller: _pc,
              clipBehavior: Clip.none,
              physics: const PageScrollPhysics(parent: BouncingScrollPhysics()),
              itemCount: items.length,
              onPageChanged: (i) {
                _cur = i;
                HapticFeedback.selectionClick();
              },
              itemBuilder: (context, i) {
                return AnimatedBuilder(
                  animation: _pc,
                  builder: (context, _) {
                    double page = _cur.toDouble();
                    if (_pc.hasClients && _pc.position.haveDimensions) {
                      page = _pc.page ?? page;
                    }
                    final d = (page - i).clamp(-1.0, 1.0).toDouble();
                    final a = d.abs();
                    final it = items[i];
                    final t = it.track;

                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 7),
                      child: Transform.scale(
                        scale: 1 - a * 0.04,
                        child: SpringPress(
                          scale: 0.98,
                          onTap: () => _tapCard(i),
                          child: Container(
                            decoration: BoxDecoration(
                              color: const Color(0xFF18181B),
                              borderRadius: BorderRadius.circular(18),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.42),
                                  blurRadius: 18,
                                  offset: const Offset(0, 8),
                                ),
                              ],
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(18),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  // Top: Square artwork
                                  AspectRatio(
                                    aspectRatio: 1.0,
                                    child: Stack(
                                      fit: StackFit.expand,
                                      children: [
                                        _Img(
                                          t.coverUrl,
                                          radius: 0,
                                          cacheWidth: 800,
                                        ),
                                        Positioned(
                                          left: 0,
                                          right: 0,
                                          bottom: 0,
                                          height: 36,
                                          child: DecoratedBox(
                                            decoration: BoxDecoration(
                                              gradient: LinearGradient(
                                                begin: Alignment.topCenter,
                                                end: Alignment.bottomCenter,
                                                colors: [
                                                  Colors.transparent,
                                                  const Color(
                                                    0xFF18181B,
                                                  ).withValues(alpha: 0.8),
                                                ],
                                              ),
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  // Bottom: Song details window
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.fromLTRB(
                                      14,
                                      8,
                                      14,
                                      12,
                                    ),
                                    color: const Color(0xFF18181B),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          it.tag.isNotEmpty
                                              ? it.tag
                                              : 'Recently Added',
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontFamily: 'SF Pro Text',
                                            color: AppColors.textSecondary,
                                            fontSize: 12,
                                            fontWeight: FontWeight.w500,
                                            letterSpacing: 0.1,
                                          ),
                                        ),
                                        const SizedBox(height: 3),
                                        Text(
                                          MediaNormalizer.cleanCompactTitle(
                                            t.title,
                                          ),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontFamily: 'SF Pro Display',
                                            color: Colors.white,
                                            fontSize: 15.5,
                                            fontWeight: FontWeight.w600,
                                            letterSpacing: -0.3,
                                            height: 1.18,
                                          ),
                                        ),
                                        const SizedBox(height: 3),
                                        Text(
                                          MediaNormalizer.formatArtists(
                                            t.artist,
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                            fontFamily: 'SF Pro Text',
                                            color: AppColors.textSecondary,
                                            fontSize: 13,
                                            fontWeight: FontWeight.w400,
                                            letterSpacing: -0.1,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
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
}

/* ------------------------------------------------------------------ */
/*  Card layouts                                                        */
/* ------------------------------------------------------------------ */

/// Classic Apple card: art + title + artist underneath. (unchanged)
class _CoverCard extends StatelessWidget {
  const _CoverCard({
    required this.url,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.artists,
    this.playing = false,
    this.current = false,
  });
  final String url, title, subtitle;
  final List<ArtistRef>? artists;
  final VoidCallback onTap;
  final bool playing, current;
  final bool circular = false;
  final double radius = 6.0;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: circular
            ? CrossAxisAlignment.center
            : CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: circular ? BoxShape.circle : BoxShape.rectangle,
                borderRadius: circular ? null : BorderRadius.circular(radius),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.32),
                    blurRadius: 10,
                    offset: const Offset(0, 5),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: circular
                    ? BorderRadius.circular(999)
                    : BorderRadius.circular(radius),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _Img(url, circular: circular, radius: radius),
                    if (current)
                      ColoredBox(
                        color: Colors.black.withValues(alpha: 0.44),
                        child: Center(
                          child: Container(
                            width: 52.0,
                            height: 52.0,
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.52),
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: _EqBars(
                                playing: playing,
                                size: 30.0,
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            MediaNormalizer.cleanCompactTitle(title),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: circular ? TextAlign.center : TextAlign.start,
            style: TextStyle(
              fontFamily: 'SF Pro Display',
              color: current ? AppColors.accent : Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 2),
          if (artists != null && artists!.isNotEmpty && !circular)
            InteractiveArtistsText(
              artists: artists!,
              maxLines: 1,
              style: const TextStyle(
                fontFamily: 'SF Pro Text',
                color: AppColors.textSecondary,
                fontSize: 12.5,
                fontWeight: FontWeight.w400,
                letterSpacing: -0.1,
              ),
            )
          else
            Text(
              circular
                  ? (subtitle.trim().isNotEmpty &&
                            subtitle.trim().toLowerCase() != 'unknown artist'
                        ? subtitle.trim()
                        : 'Artist')
                  : MediaNormalizer.formatArtists(subtitle),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: circular ? TextAlign.center : TextAlign.start,
              style: const TextStyle(
                fontFamily: 'SF Pro Text',
                color: AppColors.textSecondary,
                fontSize: 12.5,
                fontWeight: FontWeight.w400,
                letterSpacing: -0.1,
              ),
            ),
        ],
      ),
    );
  }
}

/// Apple-style artwork card with a frosted caption bar (time-of-day shelf).
class _FrostCard extends StatelessWidget {
  const _FrostCard({
    required this.track,
    required this.current,
    required this.playing,
    required this.onTap,
  });
  final Track track;
  final bool current, playing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: onTap,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(_kCardR),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 14,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(_kCardR),
          child: Stack(
            fit: StackFit.expand,
            children: [
              _Img(track.coverUrl, radius: 0, cacheWidth: 640),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: ClipRect(
                  child: BackdropFilter(
                    filter: ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                    child: Container(
                      color: Colors.black.withValues(alpha: 0.34),
                      padding: const EdgeInsets.fromLTRB(12, 9, 10, 9),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  MediaNormalizer.cleanCompactTitle(
                                    track.title,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: current
                                        ? AppColors.accent
                                        : Colors.white,
                                    fontSize: 14.5,
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: -0.2,
                                  ),
                                ),
                                const SizedBox(height: 1),
                                Text(
                                  MediaNormalizer.formatArtists(track.artist),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: Colors.white.withValues(alpha: 0.7),
                                    fontSize: 12.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            width: 30,
                            height: 30,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.2),
                              shape: BoxShape.circle,
                            ),
                            child: current
                                ? _EqBars(playing: playing, height: 12)
                                : const Icon(
                                    Icons.play_arrow_rounded,
                                    color: Colors.white,
                                    size: 20,
                                  ),
                          ),
                        ],
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

/// Large Apple "New Music" card: art, accent overline, title, artist.
class _FeatureCard extends StatelessWidget {
  const _FeatureCard({
    required this.track,
    required this.tag,
    required this.current,
    required this.playing,
    required this.onTap,
  });
  final Track track;
  final String tag;
  final bool current, playing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(_kCardR),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.38),
                    blurRadius: 16,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(_kCardR),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _Img(track.coverUrl, radius: 0, cacheWidth: 720),
                    Positioned(
                      right: 10,
                      bottom: 10,
                      child: _GlassPlay(playing: current && playing, size: 36),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            tag.toUpperCase(),
            maxLines: 1,
            style: const TextStyle(
              color: AppColors.accent,
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            MediaNormalizer.cleanCompactTitle(track.title),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: current ? AppColors.accent : Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 1),
          Text(
            MediaNormalizer.formatArtists(track.artist),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppColors.textSecondary,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

/// Landscape card on a flat surface: art, index, title, artist, play.
class _WideCard extends StatelessWidget {
  const _WideCard({
    required this.track,
    required this.index,
    required this.onTap,
  });
  final Track track;
  final int index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: onTap,
      scale: 0.97,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surface2,
          borderRadius: BorderRadius.circular(_kCardR),
        ),
        child: Row(
          children: [
            AspectRatio(
              aspectRatio: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.4),
                      blurRadius: 12,
                      offset: const Offset(0, 5),
                    ),
                  ],
                ),
                child: _Img(track.coverUrl, radius: 8, cacheWidth: 360),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${index + 1}'.padLeft(2, '0'),
                    style: const TextStyle(
                      color: AppColors.textTertiary,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.1,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    MediaNormalizer.cleanCompactTitle(track.title),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      height: 1.1,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.4,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    MediaNormalizer.formatArtists(track.artist),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const _GlassPlay(playing: false, size: 34, solid: true),
          ],
        ),
      ),
    );
  }
}

/// One editorial collage page: 1 big tile + 2 small (mirrored on odd pages). (unchanged)
class _GalleryCluster extends StatelessWidget {
  const _GalleryCluster({
    required this.tracks,
    required this.flip,
    required this.width,
    required this.height,
    required this.onPlay,
  });
  final List<Track> tracks;
  final bool flip;
  final double width, height;
  final void Function(int local) onPlay;

  @override
  Widget build(BuildContext context) {
    const gap = 8.0;
    final n = tracks.length;
    final big = height;
    final rest = width - big - gap;

    Widget tile(int k, double w, double h, bool large) => SizedBox(
      width: w,
      height: h,
      child: _GalleryTile(
        track: tracks[k],
        large: large,
        onTap: () => onPlay(k),
      ),
    );

    final bigTile = tile(0, n == 1 ? width : big, height, true);
    final kids = <Widget>[bigTile];
    if (n == 2) {
      kids
        ..add(const SizedBox(width: gap))
        ..add(tile(1, rest, height, false));
    } else if (n >= 3) {
      kids
        ..add(const SizedBox(width: gap))
        ..add(
          Column(
            children: [
              tile(1, rest, (height - gap) / 2, false),
              const SizedBox(height: gap),
              tile(2, rest, (height - gap) / 2, false),
            ],
          ),
        );
    }
    return SizedBox(
      width: width,
      height: height,
      child: Row(children: flip ? kids.reversed.toList() : kids),
    );
  }
}

class _GalleryTile extends StatelessWidget {
  const _GalleryTile({
    required this.track,
    required this.large,
    required this.onTap,
  });
  final Track track;
  final bool large;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final r = large ? 22.0 : 16.0;
    final pad = large ? 14.0 : 10.0;
    return SpringPress(
      onTap: onTap,
      scale: 0.97,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(r),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 12,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(r),
          child: Stack(
            fit: StackFit.expand,
            children: [
              _Img(track.coverUrl, radius: 0, cacheWidth: large ? 640 : 360),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.transparent,
                      Colors.black.withValues(alpha: large ? 0.8 : 0.85),
                    ],
                    stops: const [0.4, 1],
                  ),
                ),
              ),
              if (large)
                Positioned(
                  top: 10,
                  right: 10,
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.4),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.play_arrow_rounded,
                      color: Colors.white,
                      size: 20,
                    ),
                  ),
                ),
              Positioned(
                left: pad,
                right: pad,
                bottom: pad,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      MediaNormalizer.cleanCompactTitle(track.title),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: large ? 20 : 12.5,
                        height: 1.05,
                        fontWeight: large ? FontWeight.w800 : FontWeight.w700,
                        letterSpacing: large ? -0.5 : -0.1,
                      ),
                    ),
                    if (large) ...[
                      const SizedBox(height: 3),
                      Text(
                        MediaNormalizer.formatArtists(track.artist),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.7),
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Grey artwork washed with a colour (used inside mix tiles).
class _Duo extends StatelessWidget {
  const _Duo(this.url, this.color);
  final String url;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        ColorFiltered(
          colorFilter: _kGray,
          child: _Img(url, radius: 0, cacheWidth: 420),
        ),
        ColoredBox(color: color.withValues(alpha: 0.55)),
      ],
    );
  }
}

class _MixSpec {
  const _MixSpec({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.gradient,
    required this.icon,
    required this.covers,
  });
  final String id, title, subtitle;
  final List<Color> gradient;
  final IconData icon;
  final List<String> covers;
}

/// Apple "Made for You" mix tile: duotone artwork, tiny label, title, play.
class _MixTile extends StatelessWidget {
  const _MixTile({
    required this.spec,
    required this.active,
    required this.playing,
    required this.onTap,
  });
  final _MixSpec spec;
  final bool active, playing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final g = spec.gradient;
    return SpringPress(
      onTap: onTap,
      scale: 0.97,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(_kCardR),
          boxShadow: [
            BoxShadow(
              color: g.first.withValues(alpha: 0.32),
              blurRadius: 16,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(_kCardR),
          child: Container(
            foregroundDecoration: BoxDecoration(
              borderRadius: BorderRadius.circular(_kCardR),
              border: Border.all(
                color: Colors.white.withValues(alpha: active ? 0.7 : 0),
                width: 1.5,
              ),
            ),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [g.first, g.last],
              ),
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (spec.covers.isNotEmpty)
                  _Duo(spec.covers.first, g.first)
                else
                  Center(
                    child: Icon(
                      spec.icon,
                      size: 72,
                      color: Colors.white.withValues(alpha: 0.3),
                    ),
                  ),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        g.last.withValues(alpha: 0.92),
                      ],
                      stops: const [0.3, 1],
                    ),
                  ),
                ),
                Positioned(
                  left: 12,
                  top: 12,
                  child: Row(
                    children: [
                      Icon(spec.icon, color: Colors.white, size: 15),
                      const SizedBox(width: 5),
                      Text(
                        'MIX',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.9),
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1,
                        ),
                      ),
                    ],
                  ),
                ),
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 12,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              spec.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 20,
                                height: 1.05,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.6,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              active && playing ? 'Now playing' : spec.subtitle,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.75),
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      _GlassPlay(playing: active && playing, size: 34),
                    ],
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

/// Apple-style circular artist (shelf item).
class _ArtistCircle extends StatefulWidget {
  const _ArtistCircle({
    required this.name,
    required this.image,
    required this.onTap,
  });
  final String name, image;
  final VoidCallback onTap;

  @override
  State<_ArtistCircle> createState() => _ArtistCircleState();
}

class _ArtistCircleState extends State<_ArtistCircle> {
  String _resolvedUrl = '';

  @override
  void initState() {
    super.initState();
    _checkAvatar();
  }

  @override
  void didUpdateWidget(covariant _ArtistCircle old) {
    super.didUpdateWidget(old);
    if (old.image != widget.image || old.name != widget.name) {
      _checkAvatar();
    }
  }

  void _checkAvatar() {
    if (widget.image.isNotEmpty) {
      _resolvedUrl = widget.image;
      return;
    }
    final cached = ArtistService.getCachedAvatar(widget.name);
    if (cached != null && cached.isNotEmpty) {
      _resolvedUrl = cached;
      return;
    }
    ArtistService.resolveArtistAvatar(widget.name).then((url) {
      if (mounted && url.isNotEmpty) {
        setState(() => _resolvedUrl = url);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final effectiveImg = widget.image.isNotEmpty ? widget.image : _resolvedUrl;
    return SpringPress(
      onTap: widget.onTap,
      scale: 0.94,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.surface2,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.38),
                    blurRadius: 12,
                    offset: const Offset(0, 5),
                  ),
                ],
              ),
              child: effectiveImg.isNotEmpty
                  ? _Img(effectiveImg, circular: true, cacheWidth: 320)
                  : const Center(
                      child: Icon(
                        CupertinoIcons.person_fill,
                        color: Colors.white54,
                        size: 42,
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            widget.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: 'SF Pro Display',
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 1),
          const Text(
            'Artist',
            style: TextStyle(
              fontFamily: 'SF Pro Text',
              color: AppColors.textSecondary,
              fontSize: 12.5,
            ),
          ),
        ],
      ),
    );
  }
}

/// Full-width artist feature: art, gradient, name, play.
class _ArtistBanner extends StatelessWidget {
  const _ArtistBanner({
    required this.artist,
    required this.overline,
    required this.coverUrl,
    required this.onPlay,
    required this.onOpen,
  });
  final String artist, overline, coverUrl;
  final VoidCallback onPlay, onOpen;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
      child: SpringPress(
        scale: 0.985,
        onTap: onOpen,
        child: SizedBox(
          height: 210,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(_kCardR),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.38),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(_kCardR),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _Img(coverUrl, radius: 0, cacheWidth: 900),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.85),
                        ],
                        stops: const [0.35, 1],
                      ),
                    ),
                  ),
                  Positioned(
                    left: 16,
                    right: 70,
                    bottom: 16,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          overline.toUpperCase(),
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.7),
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          artist,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: 'SF Pro Display',
                            color: Colors.white,
                            fontSize: 28,
                            height: 1.04,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.9,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Positioned(
                    right: 14,
                    bottom: 14,
                    child: SpringPress(
                      scale: 0.9,
                      onTap: onPlay,
                      child: const _GlassPlay(playing: false, size: 44),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// #1 chart feature card.
class _ChartHeroCard extends StatelessWidget {
  const _ChartHeroCard({
    required this.track,
    required this.onTap,
    required this.playing,
    required this.current,
  });
  final Track track;
  final VoidCallback onTap;
  final bool playing, current;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      child: SpringPress(
        scale: 0.985,
        onTap: onTap,
        child: SizedBox(
          height: 200,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(_kCardR),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.38),
                  blurRadius: 16,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(_kCardR),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _Img(track.coverUrl, radius: 0, cacheWidth: 900),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withValues(alpha: 0.85),
                        ],
                        stops: const [0.35, 1],
                      ),
                    ),
                  ),
                  Positioned(
                    left: 14,
                    top: 14,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: BackdropFilter(
                        filter: ui.ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 9,
                            vertical: 5,
                          ),
                          color: Colors.black.withValues(alpha: 0.35),
                          child: const Text(
                            '#1',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.6,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    left: 16,
                    right: 70,
                    bottom: 16,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          MediaNormalizer.cleanCompactTitle(track.title),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: current ? AppColors.accent : Colors.white,
                            fontSize: 21,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.6,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          MediaNormalizer.formatArtists(track.artist),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.72),
                            fontSize: 14,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Positioned(
                    right: 14,
                    bottom: 14,
                    child: _GlassPlay(playing: current && playing, size: 44),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SongRow extends StatelessWidget {
  const _SongRow({
    required this.track,
    required this.current,
    required this.playing,
    required this.onTap,
    this.rank,
    this.subtitleAlbum = false,
    this.divider = true,
  });
  final dynamic track;
  final bool current, playing, subtitleAlbum, divider;
  final int? rank;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      scale: 0.975,
      onTap: onTap,
      child: SizedBox(
        height: 64,
        child: Stack(
          children: [
            Row(
              children: [
                if (rank != null)
                  SizedBox(
                    width: 32,
                    child: Text(
                      '$rank',
                      style: TextStyle(
                        color: rank! <= 3
                            ? Colors.white
                            : AppColors.textSecondary,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                SizedBox(
                  width: 48,
                  height: 48,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _Img(track.coverUrl, radius: 6.0, cacheWidth: 200),
                      if (current)
                        Container(
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.5),
                            borderRadius: BorderRadius.circular(6.0),
                          ),
                          alignment: Alignment.center,
                          child: _EqBars(playing: playing, height: 16),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        MediaNormalizer.cleanCompactTitle(track.title),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: current ? AppColors.accent : Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Flexible(
                            child: InteractiveArtistsText(
                              artists: track is Track
                                  ? track.resolvedArtists
                                  : (track.artist as String),
                              style: const TextStyle(
                                color: AppColors.textSecondary,
                                fontSize: 14,
                              ),
                              maxLines: 1,
                            ),
                          ),
                          if (subtitleAlbum &&
                              track.album != null &&
                              track.album.toString().isNotEmpty &&
                              track.album != 'Single') ...[
                            const Text(
                              ' • ',
                              style: TextStyle(
                                color: AppColors.textTertiary,
                                fontSize: 14,
                              ),
                            ),
                            Flexible(
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () {
                                  HapticFeedback.lightImpact();
                                  Navigator.of(context).push(
                                    ZenPageRoute(
                                      builder: (_) => AlbumScreen(
                                        albumTitle: MediaNormalizer.cleanTitle(
                                          track.album,
                                        ),
                                        artistName:
                                            MediaNormalizer.formatArtists(
                                              track.artist,
                                            ),
                                        coverUrl: track.coverUrl,
                                      ),
                                    ),
                                  );
                                },
                                child: Text(
                                  MediaNormalizer.cleanCompactTitle(
                                    track.album,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: AppColors.textTertiary,
                                    fontSize: 14,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: IconButton(
                    icon: const Icon(
                      Icons.more_vert_rounded,
                      color: AppColors.textTertiary,
                      size: 22,
                    ),
                    onPressed: () {
                      final p = context.read<PlayerState>();
                      final resolvedArtists = track is Track
                          ? track.resolvedArtists
                          : ArtistRef.splitFromName(track.artist as String?);
                      ZenDropdown.showTrackMenu(
                        context: context,
                        track: track is Track ? track : null,
                        trackTitle: track.title,
                        artistName: track.artist,
                        albumName: track.album,
                        coverUrl: track.coverUrl,
                        onPlayNext: () => p.playNext(track),
                        onPlayLater: () => p.playLast(track),
                        onGoToArtist: () {
                          if (resolvedArtists.length > 1) {
                            showArtistPopup(context, artists: resolvedArtists);
                          } else if (resolvedArtists.isNotEmpty) {
                            Navigator.push(
                              context,
                              ZenPageRoute(
                                builder: (_) => ArtistScreen(
                                  artistName: resolvedArtists.first.name,
                                ),
                              ),
                            );
                          }
                        },
                        onGoToAlbum:
                            track.album.isNotEmpty && track.album != 'Single'
                            ? () => Navigator.push(
                                context,
                                ZenPageRoute(
                                  builder: (_) => AlbumScreen(
                                    albumTitle: MediaNormalizer.cleanTitle(
                                      track.album,
                                    ),
                                    artistName: MediaNormalizer.formatArtists(
                                      track.artist,
                                    ),
                                    coverUrl: track.coverUrl,
                                  ),
                                ),
                              )
                            : null,
                      );
                    },
                  ),
                ),
              ],
            ),
            if (divider)
              Positioned(
                left: rank != null ? 92 : 60,
                right: 0,
                bottom: 0,
                child: Container(height: 0.5, color: AppColors.hairline),
              ),
          ],
        ),
      ),
    );
  }
}

enum _RowStyle { plain, grouped, ranked }

/// Swipeable pages of song rows: plain list, rounded group, or numbered chart.
class _PagedRows extends StatefulWidget {
  const _PagedRows({
    required this.tracks,
    required this.rows,
    required this.player,
    required this.onPlay,
  });
  final List<dynamic> tracks;
  final int rows;
  final PlayerState player;
  final void Function(int index) onPlay;
  final _RowStyle style = _RowStyle.plain;
  final bool album = false;
  final int rankOffset = 0;

  @override
  State<_PagedRows> createState() => _PagedRowsState();
}

class _PagedRowsState extends State<_PagedRows> {
  final _pc = PageController(viewportFraction: 0.9);

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rows = widget.rows;
    final tracks = widget.tracks;
    final pages = (tracks.length / rows).ceil();
    final grouped = widget.style == _RowStyle.grouped;

    return SizedBox(
      height: rows * 64.0,
      child: PageView.builder(
        controller: _pc,
        padEnds: false,
        physics: const PageScrollPhysics(parent: BouncingScrollPhysics()),
        itemCount: pages,
        itemBuilder: (_, p) {
          final list = Column(
            children: List.generate(rows, (r) {
              final i = p * rows + r;
              if (i >= tracks.length) return const SizedBox(height: 64);
              final t = tracks[i];
              final cur = widget.player.currentTrack?.id == t.id;
              return _SongRow(
                track: t,
                current: cur,
                playing: cur && widget.player.isPlaying,
                rank: widget.style == _RowStyle.ranked
                    ? i + 1 + widget.rankOffset
                    : null,
                subtitleAlbum: widget.album,
                divider: !(grouped && r == rows - 1),
                onTap: () => widget.onPlay(i),
              );
            }),
          );
          return RepaintBoundary(
            child: Padding(
              padding: EdgeInsets.only(left: p == 0 ? 20 : 8, right: 8),
              child: grouped
                  ? Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: AppColors.surface2,
                        borderRadius: BorderRadius.circular(_kCardR),
                      ),
                      child: list,
                    )
                  : list,
            ),
          );
        },
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Mood chips (Apple filter pills, minimal radius)                     */
/* ------------------------------------------------------------------ */
const _moods = [
  'Energize',
  'Relax',
  'Workout',
  'Commute',
  'Focus',
  'Party',
  'Romance',
  'Sad',
  'Sleep',
];

class _Chips extends StatelessWidget {
  const _Chips({required this.selected, required this.onSelect});
  final int selected;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 54,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
        itemCount: _moods.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (ctx, i) {
          final on = i == selected;
          return Builder(
            builder: (c) => SpringPress(
              scale: 0.93,
              onTap: () {
                HapticFeedback.selectionClick();
                onSelect(on ? -1 : i);
                Scrollable.ensureVisible(
                  c,
                  alignment: 0.5,
                  duration: const Duration(milliseconds: 500),
                  curve: Curves.easeOutCubic,
                );
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 320),
                curve: Curves.easeOutCubic,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: on ? Colors.white : AppColors.surface2,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: AnimatedDefaultTextStyle(
                  duration: const Duration(milliseconds: 260),
                  style: TextStyle(
                    color: on ? Colors.black : Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                  child: Text(_moods[i]),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Categories - auto-drifting marquee of Apple-style browse tiles      */
/*  (unchanged)                                                         */
/* ------------------------------------------------------------------ */
class _Genre {
  const _Genre(this.name, this.icon, this.color);
  final String name;
  final IconData icon;
  final Color color;
}

const _genres = [
  _Genre('Pop', Icons.star_rounded, Color(0xFFFA2D48)),
  _Genre('Hip-Hop', Icons.mic_rounded, Color(0xFF8E5CE6)),
  _Genre('Chill', Icons.spa_rounded, Color(0xFF1FA2B8)),
  _Genre('Romance', Icons.favorite_rounded, Color(0xFFFF375F)),
  _Genre('Workout', Icons.fitness_center_rounded, Color(0xFFFF9F0A)),
  _Genre('Party', Icons.celebration_rounded, Color(0xFFBF5AF2)),
  _Genre('Focus', Icons.center_focus_strong_rounded, Color(0xFF1FB86B)),
  _Genre('Sleep', Icons.nightlight_round, Color(0xFF4A5AA8)),
  _Genre('Indie', Icons.headphones_rounded, Color(0xFF0A84FF)),
  _Genre('Dance', Icons.nightlife_rounded, Color(0xFFFF2D95)),
  _Genre('Rock', Icons.electric_bolt_rounded, Color(0xFF8B5A2B)),
  _Genre('Jazz', Icons.piano_rounded, Color(0xFFB8860B)),
];

class _GenreTile extends StatelessWidget {
  const _GenreTile(
    this.g, {
    required this.onTap,
    this.imageUrl,
    this.tilt = 0.24,
  });
  final _Genre g;
  final VoidCallback onTap;
  final String? imageUrl;
  final double tilt;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: onTap,
      scale: 0.95,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [g.color, Color.lerp(g.color, Colors.black, 0.35)!],
            ),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Positioned(
                right: -16,
                top: -14,
                child: Icon(
                  g.icon,
                  size: 92,
                  color: Colors.white.withValues(alpha: 0.12),
                ),
              ),
              Positioned(
                right: -14,
                bottom: -18,
                child: Transform.rotate(
                  angle: tilt,
                  child: imageUrl != null
                      ? _TintedArt(url: imageUrl!, color: g.color, size: 92)
                      : Icon(
                          g.icon,
                          size: 80,
                          color: Colors.white.withValues(alpha: 0.3),
                        ),
                ),
              ),
              Positioned(
                left: 14,
                bottom: 12,
                child: Text(
                  g.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
              Positioned(
                left: 14,
                top: 12,
                child: Icon(
                  g.icon,
                  size: 20,
                  color: Colors.white.withValues(alpha: 0.9),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Endlessly drifting row of genre tiles. Drag to take over, it resumes on its own.
class _MarqueeRow extends StatefulWidget {
  const _MarqueeRow({
    required this.indices,
    required this.artFor,
    required this.onTap,
    this.reverse = false,
    this.speed = 24,
    this.startOffset = 0,
  });
  final List<int> indices;
  final String? Function(int genreIndex) artFor;
  final void Function(_Genre g) onTap;
  final bool reverse;
  final double speed, startOffset;

  @override
  State<_MarqueeRow> createState() => _MarqueeRowState();
}

class _MarqueeRowState extends State<_MarqueeRow>
    with SingleTickerProviderStateMixin {
  static const double _tileW = 190, _tileH = 108;
  late final ScrollController _sc = ScrollController(
    initialScrollOffset: widget.startOffset,
  );
  late final _ticker = createTicker(_tick);
  Duration _last = Duration.zero;

  @override
  void initState() {
    super.initState();
    _ticker.start();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final isCurrent = ModalRoute.of(context)?.isCurrent ?? true;
    final enabled = TickerMode.valuesOf(context).enabled;
    if (!isCurrent || !enabled) {
      if (_ticker.isActive) _ticker.stop();
    } else {
      if (!_ticker.isActive) {
        _last = Duration.zero;
        _ticker.start();
      }
    }
  }

  void _tick(Duration t) {
    final isCurrent = ModalRoute.of(context)?.isCurrent ?? true;
    final enabled = TickerMode.valuesOf(context).enabled;
    if (!isCurrent || !enabled) {
      _ticker.stop();
      return;
    }
    final dt = (t - _last).inMicroseconds / 1e6;
    _last = t;
    if (dt <= 0 || dt > 0.1 || !_sc.hasClients) return;
    if (_sc.position.isScrollingNotifier.value) return;
    _sc.jumpTo(_sc.offset + widget.speed * dt);
  }

  @override
  void dispose() {
    _ticker.dispose();
    _sc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: _tileH + 8,
      child: ListView.builder(
        controller: _sc,
        scrollDirection: Axis.horizontal,
        reverse: widget.reverse,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemExtent: _tileW + 12,
        itemBuilder: (context, i) {
          final gi = widget.indices[i % widget.indices.length];
          final g = _genres[gi];
          return Padding(
            padding: const EdgeInsets.only(right: 12, bottom: 8),
            child: _GenreTile(
              g,
              imageUrl: widget.artFor(gi),
              tilt: gi.isEven ? 0.24 : -0.2,
              onTap: () => widget.onTap(g),
            ),
          );
        },
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  "See all" sheet (rendered above everything via the root navigator)  */
/* ------------------------------------------------------------------ */
class _ListEntry {
  const _ListEntry({
    required this.title,
    required this.subtitle,
    required this.cover,
    required this.onTap,
    this.track,
    this.circular = false,
    this.closeOnTap = false,
  });
  final String title, subtitle, cover;
  final Track? track;
  final bool circular, closeOnTap;
  final VoidCallback onTap;
}

class _SectionSheet extends StatefulWidget {
  const _SectionSheet({
    required this.title,
    required this.entries,
    required this.player,
    required this.open,
    this.overline,
  });
  final String title;
  final String? overline;
  final List<_ListEntry> entries;
  final PlayerState player;
  final void Function(Widget screen) open;

  @override
  State<_SectionSheet> createState() => _SectionSheetState();
}

class _SectionSheetState extends State<_SectionSheet>
    with SingleTickerProviderStateMixin {
  final ValueNotifier<double> _dy = ValueNotifier<double>(0);
  late final AnimationController _back = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 280),
  );
  double _from = 0;

  @override
  void initState() {
    super.initState();
    _back.addListener(
      () =>
          _dy.value = _from * (1 - Curves.easeOutCubic.transform(_back.value)),
    );
  }

  @override
  void dispose() {
    _back.dispose();
    _dy.dispose();
    super.dispose();
  }

  void _close() => Navigator.of(context).pop();

  void _go(Widget screen) {
    Navigator.of(context).pop();
    widget.open(screen);
  }

  void _menu(Track t) {
    final p = widget.player;
    final artists = t.resolvedArtists;
    ZenDropdown.showTrackMenu(
      context: context,
      track: t,
      trackTitle: t.title,
      artistName: t.artist,
      albumName: t.album,
      coverUrl: t.coverUrl,
      onPlayNext: () => p.playNext(t),
      onPlayLater: () => p.playLast(t),
      onGoToArtist: () {
        if (artists.length > 1) {
          showArtistPopup(context, artists: artists);
        } else if (artists.isNotEmpty) {
          _go(ArtistScreen(artistName: artists.first.name));
        }
      },
      onGoToAlbum: t.album.isNotEmpty && t.album != 'Single'
          ? () => _go(
              AlbumScreen(
                albumTitle: MediaNormalizer.cleanTitle(t.album),
                artistName: MediaNormalizer.formatArtists(t.artist),
                coverUrl: t.coverUrl,
              ),
            )
          : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    final topGap = mq.padding.top + 10;

    return Material(
      type: MaterialType.transparency,
      child: Align(
        alignment: Alignment.bottomCenter,
        child: ValueListenableBuilder<double>(
          valueListenable: _dy,
          builder: (context, dy, child) =>
              Transform.translate(offset: Offset(0, dy), child: child),
          child: Container(
            height: mq.size.height - topGap,
            decoration: const BoxDecoration(
              color: AppColors.bg,
              borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
            ),
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(16),
              ),
              child: Column(
                children: [
                  // Header (drag down to dismiss)
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onVerticalDragStart: (_) => _back.stop(),
                    onVerticalDragUpdate: (d) =>
                        _dy.value = math.max(0, _dy.value + d.delta.dy),
                    onVerticalDragEnd: (d) {
                      if (_dy.value > 140 || (d.primaryVelocity ?? 0) > 800) {
                        _close();
                      } else {
                        _from = _dy.value;
                        _back.forward(from: 0);
                      }
                    },
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(20, 8, 16, 14),
                      child: Column(
                        children: [
                          Container(
                            width: 38,
                            height: 5,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.25),
                              borderRadius: BorderRadius.circular(3),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (widget.overline != null)
                                      Text(
                                        widget.overline!.toUpperCase(),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          color: AppColors.textSecondary,
                                          fontSize: 11.5,
                                          fontWeight: FontWeight.w600,
                                          letterSpacing: 0.6,
                                        ),
                                      ),
                                    Text(
                                      widget.title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontFamily: 'SF Pro Display',
                                        color: Colors.white,
                                        fontSize: 24,
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: -0.7,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              SpringPress(
                                scale: 0.9,
                                onTap: _close,
                                child: Container(
                                  width: 32,
                                  height: 32,
                                  decoration: const BoxDecoration(
                                    color: AppColors.surface2,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(
                                    Icons.close_rounded,
                                    color: AppColors.textSecondary,
                                    size: 18,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  Container(height: 0.5, color: AppColors.hairline),
                  Expanded(
                    child: ListenableBuilder(
                      listenable: widget.player,
                      builder: (context, _) {
                        final cur = widget.player.currentTrack?.id;
                        return ListView.builder(
                          physics: const BouncingScrollPhysics(
                            parent: AlwaysScrollableScrollPhysics(),
                          ),
                          padding: EdgeInsets.only(
                            bottom: mq.padding.bottom + 24,
                          ),
                          itemExtent: 76,
                          itemCount: widget.entries.length,
                          addAutomaticKeepAlives: false,
                          itemBuilder: (context, i) {
                            final e = widget.entries[i];
                            final isCur = e.track != null && cur == e.track!.id;
                            return _SheetRow(
                              entry: e,
                              current: isCur,
                              playing: isCur && widget.player.isPlaying,
                              onTap: () {
                                if (e.closeOnTap) Navigator.of(context).pop();
                                e.onTap();
                              },
                              onMenu: e.track == null
                                  ? null
                                  : () => _menu(e.track!),
                            );
                          },
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SheetRow extends StatelessWidget {
  const _SheetRow({
    required this.entry,
    required this.current,
    required this.playing,
    required this.onTap,
    this.onMenu,
  });
  final _ListEntry entry;
  final bool current, playing;
  final VoidCallback onTap;
  final VoidCallback? onMenu;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      scale: 0.985,
      onTap: onTap,
      child: Stack(
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 20),
            child: Row(
              children: [
                SizedBox(
                  width: 56,
                  height: 56,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _Img(
                        entry.cover,
                        radius: 5,
                        circular: entry.circular,
                        cacheWidth: 220,
                      ),
                      if (current)
                        Container(
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.5),
                            borderRadius: BorderRadius.circular(5),
                          ),
                          alignment: Alignment.center,
                          child: _EqBars(playing: playing, height: 18),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: current ? AppColors.accent : Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w400,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        entry.subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 13.5,
                        ),
                      ),
                    ],
                  ),
                ),
                if (onMenu != null)
                  IconButton(
                    onPressed: onMenu,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(
                      minWidth: 48,
                      minHeight: 48,
                    ),
                    icon: const Icon(
                      Icons.more_vert_rounded,
                      color: AppColors.textSecondary,
                      size: 22,
                    ),
                  )
                else
                  const SizedBox(width: 20),
              ],
            ),
          ),
          Positioned(
            left: 90,
            right: 0,
            bottom: 0,
            child: Container(height: 0.5, color: AppColors.hairline),
          ),
        ],
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Screen                                                              */
/* ------------------------------------------------------------------ */
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final ScrollController _homeScrollController = ScrollController();
  int _mood = -1;
  String? _activeMix;
  int _refresh = 0;
  bool _loading = true;
  bool _loadingMood = false;

  // Personalized telemetry & shelves
  List<Track> _recentHistory = [];
  List<Track> _rediscover = [];
  List<Track> _quickPicks = [];
  List<Track> _timeOfDayTracks = [];
  String _timeOfDayGreeting = 'Good day';
  String _timeOfDayMoodLabel = 'Curated for you';

  String? _favoriteArtist;
  List<Track> _favoriteArtistTracks = [];
  String? _secondFavoriteArtist;
  List<Track> _secondFavoriteArtistTracks = [];

  List<Track> _chartTracks = [];
  List<({String name, String subs, String image})> _chartArtists = [];
  List<Track> _newReleases = [];
  List<Track> _moodTracks = [];

  @override
  void initState() {
    super.initState();
    CountryService.instance.countryNotifier.addListener(_onCountryChanged);
    UserPreferencesService.instance.prefsNotifier.addListener(
      _onCountryChanged,
    );
    ListeningHistoryService.instance.historyNotifier.addListener(
      _onHistoryChanged,
    );
    _loadAllHomeData();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkAppUpdate();
    });
  }

  Future<void> _checkAppUpdate() async {
    await Future.delayed(const Duration(milliseconds: 1800));
    if (!mounted) return;
    final info = await UpdateService.instance.checkForUpdate(silent: true);
    if (info != null && info.hasUpdate && mounted) {
      if (info.isForceUpdate || !UpdateService.instance.hasDismissedPrompt) {
        UpdateService.instance.showUpdateSheet(context, info);
      }
    }
  }

  void _onCountryChanged() {
    _loadAllHomeData(refresh: true);
  }

  List<String> get _effectiveLanguages =>
      UserPreferencesService.instance.effectiveLanguages;

  String get _effectivePrimaryLanguage =>
      UserPreferencesService.instance.primaryEffectiveLanguage;

  List<String> get _effectiveGenres =>
      UserPreferencesService.instance.effectiveGenres;

  List<String> get _effectiveArtists =>
      UserPreferencesService.instance.effectiveArtists;

  void _onHistoryChanged() {
    if (mounted) {
      setState(() {
        _recentHistory = ListeningHistoryService.instance.getRecentTracks();
        _rediscover = ListeningHistoryService.instance.getRediscoverTracks();
        final userArtists = _effectiveArtists;
        final fav =
            ListeningHistoryService.instance.getFavoriteArtist() ??
            (userArtists.isNotEmpty ? userArtists.first : null);
        final secondFav =
            ListeningHistoryService.instance.getSecondFavoriteArtist() ??
            (userArtists.length > 1 ? userArtists[1] : null);
        if (fav != _favoriteArtist) {
          _favoriteArtist = fav;
          if (fav != null) _loadFavoriteArtistTracks(fav);
        }
        if (secondFav != _secondFavoriteArtist) {
          _secondFavoriteArtist = secondFav;
          if (secondFav != null) _loadSecondFavoriteArtistTracks(secondFav);
        }
      });
    }
  }

  @override
  void dispose() {
    _homeScrollController.dispose();
    CountryService.instance.countryNotifier.removeListener(_onCountryChanged);
    UserPreferencesService.instance.prefsNotifier.removeListener(
      _onCountryChanged,
    );
    ListeningHistoryService.instance.historyNotifier.removeListener(
      _onHistoryChanged,
    );
    super.dispose();
  }

  Future<void> _loadAllHomeData({bool refresh = false}) async {
    if (!mounted) return;
    setState(() => _loading = true);

    try {
      final country = CountryService.instance.currentCountry;
      final userLangs = _effectiveLanguages;
      final userGenres = _effectiveGenres;
      final userArtists = _effectiveArtists;
      final primaryLang = _effectivePrimaryLanguage;
      final primaryGenre = userGenres.isNotEmpty ? userGenres.first : '';

      // 1. Load User Listening Telemetry (with saved onboarding tastes as Day-1 seed)
      _recentHistory = ListeningHistoryService.instance.getRecentTracks();
      _rediscover = ListeningHistoryService.instance.getRediscoverTracks();
      _favoriteArtist =
          ListeningHistoryService.instance.getFavoriteArtist() ??
          (userArtists.isNotEmpty ? userArtists.first : null);
      _secondFavoriteArtist =
          ListeningHistoryService.instance.getSecondFavoriteArtist() ??
          (userArtists.length > 1 ? userArtists[1] : null);

      // 2. Time-of-Day Context & Greeting (personalized to user's language & mood)
      final timeCtx = ListeningHistoryService.getTimeOfDayContext(primaryLang);
      _timeOfDayGreeting = timeCtx.greeting;
      _timeOfDayMoodLabel = primaryGenre.isNotEmpty && primaryLang.isNotEmpty
          ? '$primaryLang $primaryGenre • ${timeCtx.greeting}'
          : timeCtx.moodLabel;

      // 3. Time-of-day shelf powered by Global Recommendation Engine
      RecommendationEngine.instance
          .getTimeOfDayRecommendations()
          .then((tracks) {
            if (mounted && tracks.isNotEmpty) {
              setState(() => _timeOfDayTracks = tracks);
            }
          })
          .catchError((_) {});

      // 4. Truly Personalized Quick Picks (Made for You):
      // Filters for user's selected + qualified languages & top artists with anti-repetition
      RecommendationEngine.instance
          .getPersonalizedQuickPicks()
          .then((tracks) {
            if (mounted && tracks.isNotEmpty) {
              setState(() {
                _quickPicks = tracks;
                _loading = false;
              });
            }
          })
          .catchError((_) {});

      // 5. #1 Favorite Artist Spotlight
      if (_favoriteArtist != null && _favoriteArtist!.isNotEmpty) {
        RecommendationEngine.instance
            .getFavoriteArtistTracks(_favoriteArtist!)
            .then((tracks) {
              if (mounted && tracks.isNotEmpty) {
                setState(() => _favoriteArtistTracks = tracks);
              }
            })
            .catchError((_) {});
      }

      // 6. #2 Favorite Artist Spotlight
      if (_secondFavoriteArtist != null && _secondFavoriteArtist!.isNotEmpty) {
        RecommendationEngine.instance
            .getFavoriteArtistTracks(_secondFavoriteArtist!)
            .then((tracks) {
              if (mounted && tracks.isNotEmpty) {
                setState(() => _secondFavoriteArtistTracks = tracks);
              }
            })
            .catchError((_) {});
      }

      // 7. Multi-language New Releases strictly matching qualified languages & artists
      RecommendationEngine.instance
          .getRecommendedNewReleases()
          .then((tracks) {
            if (mounted && tracks.isNotEmpty) {
              setState(() {
                _newReleases = tracks;
                _loading = false;
              });
            }
          })
          .catchError((_) {});

      // 8. Regional Charts & Personalized Artists
      final chartsFutures = <Future>[
        InnerTubeService.instance
            .getCharts(countryCode: country.code)
            .timeout(
              const Duration(seconds: 5),
              onTimeout: () => (
                tracks: <Track>[],
                artists: <({String image, String name, String subs})>[],
              ),
            )
            .catchError(
              (_) => (
                tracks: <Track>[],
                artists: <({String image, String name, String subs})>[],
              ),
            ),
      ];
      if (primaryLang.isNotEmpty) {
        chartsFutures.add(
          InnerTubeService.instance
              .search('top $primaryLang songs charts')
              .timeout(const Duration(seconds: 4), onTimeout: () => <Track>[])
              .catchError((_) => <Track>[]),
        );
      }

      Future.wait(chartsFutures)
          .then((results) {
            if (!mounted) return;
            final chartData =
                results[0]
                    as ({
                      List<({String image, String name, String subs})> artists,
                      List<Track> tracks,
                    });
            final langChartTracks = results.length > 1
                ? (results[1] as List<Track>)
                : <Track>[];

            // Interleave language chart songs with national chart songs
            final seen = <String>{};
            final combinedChartTracks = <Track>[];
            for (final t in langChartTracks.take(8)) {
              if (seen.add(t.id)) combinedChartTracks.add(t);
            }
            for (final t in chartData.tracks) {
              if (seen.add(t.id)) combinedChartTracks.add(t);
            }

            // Build Personalized Artists shelf:
            // 1. History top played artists
            // 2. Favorite artists chosen by user
            // 3. Curated artists for user's selected languages
            // 4. Regional chart artists
            final personalizedArtists =
                <({String image, String name, String subs})>[];
            final seenArtists = <String>{};
            final prefs = UserPreferencesService.instance.currentPrefs;

            String resolveArtistImg(String artistName) {
              final target = artistName.trim().toLowerCase();
              for (final a in chartData.artists) {
                if (a.name.trim().toLowerCase() == target &&
                    a.image.isNotEmpty) {
                  return a.image;
                }
              }
              for (final fa in prefs.favoriteArtists) {
                if (fa.name.trim().toLowerCase() == target &&
                    fa.image.isNotEmpty) {
                  return fa.image;
                }
              }
              final cached = ArtistService.getCachedAvatar(artistName);
              if (cached != null && cached.isNotEmpty) {
                return cached;
              }
              return '';
            }

            // 1. User favorite artists (already have high-res photo)
            for (final fa in prefs.favoriteArtists) {
              final lower = fa.name.trim().toLowerCase();
              if (lower.isNotEmpty && seenArtists.add(lower)) {
                personalizedArtists.add((
                  name: fa.name,
                  subs: 'Favorite Artist',
                  image: fa.image,
                ));
              }
            }

            // 2. From user's actual listening history (proven affinity)
            final topHistory = ListeningHistoryService.instance.getTopArtists(
              limit: 6,
            );
            for (final h in topHistory) {
              final name = h.name.trim();
              final lower = name.toLowerCase();
              if (name.isNotEmpty &&
                  lower != 'unknown artist' &&
                  seenArtists.add(lower)) {
                personalizedArtists.add((
                  name: name,
                  subs: '${h.plays} plays • Top Artist',
                  image: resolveArtistImg(name),
                ));
              }
            }

            // 3. From user's qualified languages
            if (userLangs.isNotEmpty) {
              final curated = UserPreferencesService.curatedArtistsForLanguages(
                userLangs,
              );
              for (final name in curated.take(5)) {
                final lower = name.trim().toLowerCase();
                if (lower.isNotEmpty && seenArtists.add(lower)) {
                  personalizedArtists.add((
                    name: name,
                    subs: 'Top Artist • ${userLangs.first}',
                    image: resolveArtistImg(name),
                  ));
                }
              }
            }

            // 4. Regional chart artists (only as controlled discovery fill-in)
            if (personalizedArtists.length < 8) {
              for (final a in chartData.artists) {
                final lower = a.name.trim().toLowerCase();
                if (lower.isNotEmpty && seenArtists.add(lower)) {
                  personalizedArtists.add((
                    name: a.name,
                    subs: a.subs.isNotEmpty
                        ? a.subs
                        : 'Top Artist • ${country.name}',
                    image: a.image,
                  ));
                }
                if (personalizedArtists.length >= 10) break;
              }
            }

            // Pre-resolve missing authentic artist avatars in background
            for (final a in personalizedArtists) {
              if (a.image.isEmpty) {
                ArtistService.resolveArtistAvatar(a.name);
              }
            }

            // Ensure artists with resolved images appear first
            personalizedArtists.sort((a, b) {
              if (a.image.isNotEmpty && b.image.isEmpty) return -1;
              if (a.image.isEmpty && b.image.isNotEmpty) return 1;
              return 0;
            });

            setState(() {
              if (combinedChartTracks.isNotEmpty) {
                _chartTracks = combinedChartTracks.take(16).toList();
              }
              if (personalizedArtists.isNotEmpty) {
                _chartArtists = personalizedArtists;
              }
              _loading = false;
            });
          })
          .catchError((_) {});

      // Fallback guard: ensure loading spinner is dismissed after 3s
      Future.delayed(const Duration(milliseconds: 3000), () {
        if (mounted && _loading) setState(() => _loading = false);
      });
    } catch (e) {
      if (kDebugMode) debugPrint('[HomeScreen] load error: $e');
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadFavoriteArtistTracks(String artistName) async {
    try {
      final tracks = await InnerTubeService.instance.search('$artistName hits');
      if (mounted) {
        setState(() {
          _favoriteArtistTracks = tracks.take(8).toList();
        });
      }
    } catch (_) {}
  }

  Future<void> _loadSecondFavoriteArtistTracks(String artistName) async {
    try {
      final tracks = await InnerTubeService.instance.search('$artistName hits');
      if (mounted) {
        setState(() {
          _secondFavoriteArtistTracks = tracks.take(8).toList();
        });
      }
    } catch (_) {}
  }

  void _onSelectMood(int index) {
    if (_mood == index) {
      setState(() {
        _mood = -1;
        _moodTracks = [];
        _loadingMood = false;
      });
      return;
    }

    setState(() {
      _mood = index;
      _loadingMood = true;
    });

    final mood = _moods[index];
    final primaryLang = _effectivePrimaryLanguage;
    final country = CountryService.instance.currentCountry;
    final langPrefix = primaryLang.isNotEmpty
        ? '$primaryLang '
        : '${country.name} ';
    final query = '$langPrefix$mood hits';

    InnerTubeService.instance
        .search(query)
        .then((tracks) {
          if (mounted && _mood == index) {
            setState(() {
              _moodTracks = tracks.take(16).toList();
              _loadingMood = false;
            });
          }
        })
        .catchError((_) {
          if (mounted && _mood == index) {
            setState(() => _loadingMood = false);
          }
        });
  }

  void _playMix(String mixType) {
    HapticFeedback.mediumImpact();
    setState(() => _activeMix = mixType);
    final userGenres = _effectiveGenres;
    final primaryLang = _effectivePrimaryLanguage;
    final primaryGenre = userGenres.isNotEmpty ? userGenres.first : '';
    final country = CountryService.instance.currentCountry;
    final langPrefix = primaryLang.isNotEmpty
        ? '$primaryLang '
        : '${country.name} ';

    switch (mixType) {
      case 'supermix':
        final pool = <Track>{
          ..._favoriteArtistTracks,
          ..._secondFavoriteArtistTracks,
          ..._quickPicks,
          ..._recentHistory,
        }.toList();
        if (pool.isNotEmpty) {
          pool.shuffle();
          play(pool, 0);
        } else {
          InnerTubeService.instance
              .search(
                '$langPrefix${primaryGenre.isNotEmpty ? "$primaryGenre " : ""}top hits supermix',
              )
              .then((tracks) {
                if (tracks.isNotEmpty) play(tracks, 0);
              });
        }
        break;

      case 'discover':
        final q = primaryLang.isNotEmpty
            ? '$primaryLang ${primaryGenre.isNotEmpty ? primaryGenre : "indie"} fresh discoveries'
            : '${langPrefix}fresh discoveries indie tracks';
        InnerTubeService.instance.search(q).then((tracks) {
          if (tracks.isNotEmpty) play(tracks, 0);
        });
        break;

      case 'chill':
        final q = primaryLang.isNotEmpty
            ? '$primaryLang chill acoustic melodies $primaryGenre'
            : '${langPrefix}chill acoustic melodies';
        InnerTubeService.instance.search(q).then((tracks) {
          if (tracks.isNotEmpty) play(tracks, 0);
        });
        break;

      case 'energy':
        final q = primaryLang.isNotEmpty
            ? '$primaryLang workout high energy hits $primaryGenre'
            : '${langPrefix}workout high energy dance hits';
        InnerTubeService.instance.search(q).then((tracks) {
          if (tracks.isNotEmpty) play(tracks, 0);
        });
        break;
    }
  }

  // Sections are keyed on refresh only, so tapping a mood pill no longer rebuilds/resets every carousel.
  int get _seed => _refresh * 13;

  Widget _sec(String key, Widget child) => SliverToBoxAdapter(
    child: Reveal(key: ValueKey('$_seed-$key'), child: child),
  );

  void _open(Widget screen) =>
      Navigator.push(context, ZenPageRoute(builder: (_) => screen));

  void play(List<Track> list, int i) {
    if (list.isEmpty) return;
    HapticFeedback.lightImpact();
    final startIdx = i.clamp(0, list.length - 1);
    final ctx = PlaybackContext(
      type: PlaybackContextType.homeSection,
      id: 'home',
      tracks: list,
      startTrack: list[startIdx],
    );
    context.read<PlayerState>().setQueue(
      list,
      startIndex: startIdx,
      context: ctx,
    );
  }

  List<_ListEntry> _trackEntries(List<Track> list) => [
    for (var i = 0; i < list.length; i++)
      _ListEntry(
        title: MediaNormalizer.cleanCompactTitle(list[i].title),
        subtitle: 'Song • ${MediaNormalizer.formatArtists(list[i].artist)}',
        cover: list[i].coverUrl,
        track: list[i],
        onTap: () => play(list, i),
      ),
  ];

  void _openSection({
    required String title,
    String? overline,
    required List<_ListEntry> entries,
  }) {
    if (entries.isEmpty) return;
    HapticFeedback.selectionClick();
    final player = context.read<PlayerState>();
    showGeneralDialog(
      context: context,
      useRootNavigator: true,
      barrierDismissible: true,
      barrierLabel: 'Close',
      barrierColor: Colors.black.withValues(alpha: 0.55),
      transitionDuration: const Duration(milliseconds: 420),
      pageBuilder: (ctx, _, _) => _SectionSheet(
        title: title,
        overline: overline,
        entries: entries,
        player: player,
        open: _open,
      ),
      transitionBuilder: (ctx, anim, _, child) => SlideTransition(
        position: Tween<Offset>(begin: const Offset(0, 1), end: Offset.zero)
            .animate(
              CurvedAnimation(
                parent: anim,
                curve: Curves.easeOutCubic,
                reverseCurve: Curves.easeInCubic,
              ),
            ),
        child: child,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Rebuild only when the track / play state changes (not on every position tick).
    final player = context.read<PlayerState>();
    context.select<PlayerState, Object?>((p) => p.currentTrack?.id);
    context.select<PlayerState, bool>((p) => p.isPlaying);
    final top = MediaQuery.paddingOf(context).top;
    final country = CountryService.instance.currentCountry;
    final w = MediaQuery.sizeOf(context).width;

    // Square cards geometry: slightly enlarged sweet spot for Apple Music card presence
    final ext = (w - 20) / 2.18;
    final cw = ext - 14;

    // Specific geometries for non-square sections
    final artistExt = (w - 20) / 2.32;
    final artistSize = artistExt - 14;
    final mixExt = w * 0.56;
    final mixSize = mixExt - 14;

    // Real dynamic datasets
    final listenAgain = _recentHistory.isNotEmpty
        ? _recentHistory
        : (_quickPicks.isNotEmpty
              ? _quickPicks.take(10).toList()
              : _chartTracks.take(10).toList());

    final quick = _quickPicks.isNotEmpty
        ? _quickPicks.take(12).toList()
        : _chartTracks.take(12).toList();
    final charts = _chartTracks.isNotEmpty
        ? _chartTracks.take(12).toList()
        : const <Track>[];
    final fresh = _newReleases.isNotEmpty
        ? _newReleases.take(9).toList()
        : const <Track>[];

    // Albums for you (extracted from real dynamic releases & quickpicks)
    final albumMap = <String, Track>{};
    for (final t in [
      ..._newReleases,
      ..._quickPicks,
      ..._chartTracks,
      ..._recentHistory,
    ]) {
      final alb = MediaNormalizer.cleanTitle(t.album);
      if (alb.isNotEmpty &&
          alb.toLowerCase() != 'single' &&
          !MediaNormalizer.isMetadataNoise(alb)) {
        albumMap.putIfAbsent(alb, () => t);
      }
    }
    final albums = albumMap.values.take(10).toList();

    // Hero items (mixed from real data, de-duplicated)
    final heroItems = <_HeroItem>[];
    final seen = <String>{};
    void addHero(Iterable<Track> ts, String tag, int n) {
      var c = 0;
      for (final t in ts) {
        if (c >= n) break;
        if (seen.add(t.id)) {
          heroItems.add(_HeroItem(t, tag));
          c++;
        }
      }
    }

    addHero(_recentHistory, 'Jump back in', 1);
    addHero(quick, 'Made for you', 2);
    addHero(fresh, 'New release', 2);
    addHero(charts, 'Trending in ${country.name}', 2);
    final heroTracks = heroItems.map((e) => e.track).toList();

    // Artwork pool for category tiles
    final artPool = <String>[];
    for (final t in [
      ..._chartTracks,
      ..._newReleases,
      ..._quickPicks,
      ..._recentHistory,
      ..._timeOfDayTracks,
    ]) {
      if (t.coverUrl.isNotEmpty && !artPool.contains(t.coverUrl)) {
        artPool.add(t.coverUrl);
      }
    }
    String? genreArt(int i) =>
        artPool.isEmpty ? null : artPool[(i * 3 + 1) % artPool.length];

    List<String> covs(Iterable<Track> ts) {
      final out = <String>[];
      for (final t in ts) {
        if (t.coverUrl.isNotEmpty && !out.contains(t.coverUrl)) {
          out.add(t.coverUrl);
        }
        if (out.length == 4) break;
      }
      return out.isEmpty ? artPool.take(4).toList() : out;
    }

    final mixes = <_MixSpec>[
      _MixSpec(
        id: 'supermix',
        title: 'My Supermix',
        subtitle: 'Your blended favorites',
        gradient: const [Color(0xFFD13A57), Color(0xFF3A0A13)],
        icon: Icons.all_inclusive_rounded,
        covers: covs([
          ..._favoriteArtistTracks,
          ..._secondFavoriteArtistTracks,
          ..._quickPicks,
          ..._recentHistory,
        ]),
      ),
      _MixSpec(
        id: 'discover',
        title: 'Discover Mix',
        subtitle: 'Fresh weekly finds',
        gradient: const [Color(0xFF14B8A6), Color(0xFF0B3B38)],
        icon: Icons.explore_rounded,
        covers: covs(_newReleases),
      ),
      _MixSpec(
        id: 'chill',
        title: 'Chill Mix',
        subtitle: 'Mellow & unhurried',
        gradient: const [Color(0xFF3B82F6), Color(0xFF14264F)],
        icon: Icons.spa_rounded,
        covers: covs(_timeOfDayTracks),
      ),
      _MixSpec(
        id: 'energy',
        title: 'Energy Mix',
        subtitle: 'High-tempo momentum',
        gradient: const [Color(0xFFF59E0B), Color(0xFF4A2406)],
        icon: Icons.bolt_rounded,
        covers: covs(_chartTracks),
      ),
    ];

    void playGenre(_Genre g) {
      HapticFeedback.selectionClick();
      final userLang = _effectivePrimaryLanguage;
      final q = userLang.isNotEmpty
          ? '$userLang ${g.name} hits'
          : '${g.name} hits';
      Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) =>
              CategoryScreen(title: g.name, query: q, colors: [g.color]),
        ),
      );
    }

    final artistCount = math.min(_chartArtists.length, 10);

    return Scaffold(
      backgroundColor: AppColors.bg,
      body:
          _loading &&
              _quickPicks.isEmpty &&
              _chartTracks.isEmpty &&
              _recentHistory.isEmpty
          ? const Center(
              child: CupertinoActivityIndicator(
                color: Colors.white70,
                radius: 14,
              ),
            )
          : Stack(
              children: [
                CustomScrollView(
                  controller: _homeScrollController,
                  physics: const BouncingScrollPhysics(
                    parent: AlwaysScrollableScrollPhysics(),
                  ),
                  // ignore: deprecated_member_use
                  cacheExtent: 900,
                  slivers: [
                    SliverToBoxAdapter(child: SizedBox(height: top + 56)),
                    CupertinoSliverRefreshControl(
                      onRefresh: () async {
                        await _loadAllHomeData(refresh: true);
                        if (mounted) setState(() => _refresh++);
                      },
                      builder: (ctx, mode, pulled, trigger, extent) {
                        final p = (pulled / trigger).clamp(0.0, 1.0).toDouble();
                        final spinning =
                            mode == RefreshIndicatorMode.refresh ||
                            mode == RefreshIndicatorMode.done;
                        return Center(
                          child: Opacity(
                            opacity: p,
                            child: spinning
                                ? const CupertinoActivityIndicator(
                                    color: Colors.white70,
                                    radius: 12,
                                  )
                                : CupertinoActivityIndicator.partiallyRevealed(
                                    color: Colors.white70,
                                    radius: 12,
                                    progress: p,
                                  ),
                          ),
                        );
                      },
                    ),

                    // In-App Update Banner
                    SliverToBoxAdapter(
                      child: ValueListenableBuilder<UpdateInfo?>(
                        valueListenable:
                            UpdateService.instance.availableUpdateNotifier,
                        builder: (context, update, _) {
                          if (update == null || !update.hasUpdate) {
                            return const SizedBox.shrink();
                          }
                          return Padding(
                            padding: const EdgeInsets.fromLTRB(20, 12, 20, 6),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 10,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.surface2,
                                borderRadius: BorderRadius.circular(_kCardR),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 34,
                                    height: 34,
                                    decoration: BoxDecoration(
                                      color: AppColors.crimson.withValues(
                                        alpha: 0.18,
                                      ),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Icon(
                                      Icons.system_update_rounded,
                                      color: AppColors.crimson,
                                      size: 18,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Zenify v${update.latestVersion} Available',
                                          style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w700,
                                            color: Colors.white,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          'Tap to view release notes & update',
                                          style: TextStyle(
                                            fontSize: 11.5,
                                            color: Colors.white.withValues(
                                              alpha: 0.6,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  SpringPress(
                                    scale: 0.92,
                                    onTap: () {
                                      HapticFeedback.lightImpact();
                                      UpdateService.instance.showUpdateSheet(
                                        context,
                                        update,
                                      );
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        color: AppColors.crimson,
                                        borderRadius: BorderRadius.circular(6),
                                      ),
                                      child: const Text(
                                        'UPDATE',
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w900,
                                          color: Colors.white,
                                          letterSpacing: 0.8,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),

                    // HERO (Apple Music top-picks carousel) + mood pills
                    SliverToBoxAdapter(
                      child: Column(
                        children: [
                          if (heroItems.isNotEmpty)
                            _Hero(
                              key: ValueKey(
                                'hero-$_refresh-${heroItems.length}',
                              ),
                              items: heroItems,
                              player: player,
                              onTapItem: (i) {
                                final t = heroTracks[i];
                                final albumName =
                                    t.album.isNotEmpty &&
                                        t.album.toLowerCase() != 'single'
                                    ? MediaNormalizer.cleanTitle(t.album)
                                    : MediaNormalizer.cleanTitle(t.title);
                                _open(
                                  AlbumScreen(
                                    albumTitle: albumName,
                                    artistName: MediaNormalizer.formatArtists(
                                      t.artist,
                                    ),
                                    coverUrl: t.coverUrl,
                                  ),
                                );
                              },
                            ),
                          _Chips(selected: _mood, onSelect: _onSelectMood),
                        ],
                      ),
                    ),

                    // 1. Mood Spotlight Shelf (Active when a mood chip is tapped)
                    if (_mood != -1)
                      _sec(
                        'mood-spotlight',
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SecHeader(
                              title: '${_moods[_mood]} Spotlight',
                              overline: 'Curated for this moment',
                              onMore: () => _openSection(
                                title: '${_moods[_mood]} Spotlight',
                                overline: 'Curated for this moment',
                                entries: _trackEntries(_moodTracks),
                              ),
                            ),
                            if (_loadingMood)
                              const Padding(
                                padding: EdgeInsets.symmetric(vertical: 36),
                                child: Center(
                                  child: CupertinoActivityIndicator(
                                    color: Colors.white70,
                                    radius: 12,
                                  ),
                                ),
                              )
                            else if (_moodTracks.isNotEmpty)
                              _PagedRows(
                                tracks: _moodTracks.take(16).toList(),
                                rows: 4,
                                player: player,
                                onPlay: (i) => play(_moodTracks, i),
                              ),
                          ],
                        ),
                      ),

                    // 2. Time-of-day
                    if (_timeOfDayTracks.isNotEmpty)
                      _sec(
                        'time-of-day',
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SecHeader(
                              title: _timeOfDayMoodLabel,
                              overline: _timeOfDayGreeting,
                              onMore: () => Navigator.push(
                                context,
                                ZenPageRoute(
                                  builder: (_) => CategoryScreen(
                                    title: _timeOfDayMoodLabel,
                                    initialTracks: _timeOfDayTracks,
                                  ),
                                ),
                              ),
                            ),
                            _Shelf(
                              height: cw + 60,
                              itemExtent: ext,
                              count: _timeOfDayTracks.length,
                              builder: (c, i) {
                                final t = _timeOfDayTracks[i];
                                final cur = player.currentTrack?.id == t.id;
                                return _CoverCard(
                                  url: t.coverUrl,
                                  title: t.title,
                                  subtitle: t.artist,
                                  artists: t.resolvedArtists,
                                  current: cur,
                                  playing: cur && player.isPlaying,
                                  onTap: () => play(_timeOfDayTracks, i),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                    // 3. Listen again
                    if (listenAgain.isNotEmpty && _recentHistory.isNotEmpty)
                      _sec(
                        'again',
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SecHeader(
                              title: 'Listen again',
                              onMore: () => _openSection(
                                title: 'Listen again',
                                entries: _trackEntries(listenAgain),
                              ),
                            ),
                            _Shelf(
                              height: cw + 60,
                              itemExtent: ext,
                              count: listenAgain.length,
                              builder: (c, i) {
                                final t = listenAgain[i];
                                final cur = player.currentTrack?.id == t.id;
                                return _CoverCard(
                                  url: t.coverUrl,
                                  title: t.title,
                                  subtitle: t.artist,
                                  artists: t.resolvedArtists,
                                  current: cur,
                                  playing: cur && player.isPlaying,
                                  onTap: () => play(listenAgain, i),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                    // 4. Quick picks
                    if (quick.isNotEmpty)
                      _sec(
                        'quick',
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SecHeader(
                              title: 'Quick picks',
                              onMore: () => _openSection(
                                title: 'Quick picks',
                                entries: _trackEntries(quick),
                              ),
                            ),
                            _Shelf(
                              height: cw + 60,
                              itemExtent: ext,
                              count: quick.length,
                              builder: (c, i) {
                                final t = quick[i];
                                final cur = player.currentTrack?.id == t.id;
                                return _CoverCard(
                                  url: t.coverUrl,
                                  title: t.title,
                                  subtitle: t.artist,
                                  artists: t.resolvedArtists,
                                  current: cur,
                                  playing: cur && player.isPlaying,
                                  onTap: () => play(quick, i),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                    // 5. Artists
                    if (_chartArtists.isNotEmpty)
                      _sec(
                        'artists',
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SecHeader(
                              title: 'Top Artists for You',
                              onMore: () => _openSection(
                                title: 'Top Artists for You',
                                entries: [
                                  for (final a in _chartArtists.take(10))
                                    _ListEntry(
                                      title: a.name,
                                      subtitle: 'Artist',
                                      cover: a.image,
                                      circular: true,
                                      closeOnTap: true,
                                      onTap: () => _open(
                                        ArtistScreen(
                                          artistName: a.name,
                                          imageUrl: a.image,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            _Shelf(
                              height: artistSize + 56,
                              itemExtent: artistExt,
                              count: artistCount,
                              builder: (c, i) {
                                final a = _chartArtists[i];
                                return _ArtistCircle(
                                  name: a.name,
                                  image: a.image,
                                  onTap: () => _open(
                                    ArtistScreen(
                                      artistName: a.name,
                                      imageUrl: a.image,
                                    ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                    // 6. Made for you: mix tiles
                    _sec(
                      'mixes',
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const _SecHeader(title: 'Made for You'),
                          _Shelf(
                            height: mixSize + 20,
                            itemExtent: mixExt,
                            count: mixes.length,
                            builder: (c, i) {
                              final m = mixes[i];
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 20),
                                child: _MixTile(
                                  spec: m,
                                  active: _activeMix == m.id,
                                  playing: player.isPlaying,
                                  onTap: () => _playMix(m.id),
                                ),
                              );
                            },
                          ),
                        ],
                      ),
                    ),

                    // 7. Your top artist
                    if (_favoriteArtist != null &&
                        _favoriteArtistTracks.isNotEmpty)
                      _sec(
                        'similar',
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SecHeader(
                              title: _favoriteArtist!,
                              onMore: () => _openSection(
                                title: _favoriteArtist!,
                                entries: _trackEntries(_favoriteArtistTracks),
                              ),
                            ),
                            _Shelf(
                              height: cw + 60,
                              itemExtent: ext,
                              count: _favoriteArtistTracks.length,
                              builder: (c, i) {
                                final t = _favoriteArtistTracks[i];
                                final cur = player.currentTrack?.id == t.id;
                                return _CoverCard(
                                  url: t.coverUrl,
                                  title: t.title,
                                  subtitle: t.artist,
                                  artists: t.resolvedArtists,
                                  current: cur,
                                  playing: cur && player.isPlaying,
                                  onTap: () => play(_favoriteArtistTracks, i),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                    // 8. Second favorite artist
                    if (_secondFavoriteArtist != null &&
                        _secondFavoriteArtistTracks.isNotEmpty)
                      _sec(
                        'similar-second',
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SecHeader(
                              title: _secondFavoriteArtist!,
                              onMore: () => _openSection(
                                title: _secondFavoriteArtist!,
                                entries: _trackEntries(
                                  _secondFavoriteArtistTracks,
                                ),
                              ),
                            ),
                            _Shelf(
                              height: cw + 60,
                              itemExtent: ext,
                              count: _secondFavoriteArtistTracks.length,
                              builder: (c, i) {
                                final t = _secondFavoriteArtistTracks[i];
                                final cur = player.currentTrack?.id == t.id;
                                return _CoverCard(
                                  url: t.coverUrl,
                                  title: t.title,
                                  subtitle: t.artist,
                                  artists: t.resolvedArtists,
                                  current: cur,
                                  playing: cur && player.isPlaying,
                                  onTap: () =>
                                      play(_secondFavoriteArtistTracks, i),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                    // 9. Rediscover favorites
                    if (_rediscover.isNotEmpty)
                      _sec(
                        'rediscover',
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SecHeader(
                              title: 'Rediscover your favorites',
                              onMore: () => _openSection(
                                title: 'Rediscover your favorites',
                                entries: _trackEntries(_rediscover),
                              ),
                            ),
                            _Shelf(
                              height: cw + 60,
                              itemExtent: ext,
                              count: _rediscover.length,
                              builder: (c, i) {
                                final t = _rediscover[i];
                                final cur = player.currentTrack?.id == t.id;
                                return _CoverCard(
                                  url: t.coverUrl,
                                  title: t.title,
                                  subtitle: t.artist,
                                  artists: t.resolvedArtists,
                                  current: cur,
                                  playing: cur && player.isPlaying,
                                  onTap: () => play(_rediscover, i),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                    // 10. New releases
                    if (fresh.isNotEmpty)
                      _sec(
                        'new',
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SecHeader(
                              title: 'New releases',
                              onMore: () => _openSection(
                                title: 'New releases',
                                entries: _trackEntries(fresh),
                              ),
                            ),
                            _Shelf(
                              height: cw + 60,
                              itemExtent: ext,
                              count: fresh.length,
                              builder: (c, i) {
                                final t = fresh[i];
                                final cur = player.currentTrack?.id == t.id;
                                return _CoverCard(
                                  url: t.coverUrl,
                                  title: t.title,
                                  subtitle: t.artist,
                                  artists: t.resolvedArtists,
                                  current: cur,
                                  playing: cur && player.isPlaying,
                                  onTap: () => play(fresh, i),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                    // 11. Top Hits
                    if (charts.isNotEmpty)
                      _sec(
                        'charts',
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SecHeader(
                              title: 'Top Hits in ${country.name}',
                              onMore: () => _openSection(
                                title: 'Top Hits in ${country.name}',
                                entries: _trackEntries(charts),
                              ),
                            ),
                            _Shelf(
                              height: cw + 60,
                              itemExtent: ext,
                              count: charts.length,
                              builder: (c, i) {
                                final t = charts[i];
                                final cur = player.currentTrack?.id == t.id;
                                return _CoverCard(
                                  url: t.coverUrl,
                                  title: t.title,
                                  subtitle: t.artist,
                                  artists: t.resolvedArtists,
                                  current: cur,
                                  playing: cur && player.isPlaying,
                                  onTap: () => play(charts, i),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                    // 12. Albums for you
                    if (albums.isNotEmpty)
                      _sec(
                        'albums',
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _SecHeader(
                              title: 'Albums for you',
                              onMore: () => _openSection(
                                title: 'Albums for you',
                                entries: [
                                  for (final t in albums)
                                    _ListEntry(
                                      title: MediaNormalizer.cleanTitle(
                                        t.album,
                                      ),
                                      subtitle:
                                          'Album • ${MediaNormalizer.formatArtists(t.artist)}',
                                      cover: t.coverUrl,
                                      closeOnTap: true,
                                      onTap: () => _open(
                                        AlbumScreen(
                                          albumTitle:
                                              MediaNormalizer.cleanTitle(
                                                t.album,
                                              ),
                                          artistName:
                                              MediaNormalizer.formatArtists(
                                                t.artist,
                                              ),
                                          coverUrl: t.coverUrl,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            _Shelf(
                              height: cw + 60,
                              itemExtent: ext,
                              count: albums.length,
                              builder: (c, i) {
                                final t = albums[i];
                                return _CoverCard(
                                  url: t.coverUrl,
                                  title: t.album,
                                  subtitle: t.artist,
                                  artists: t.resolvedArtists,
                                  onTap: () => _open(
                                    AlbumScreen(
                                      albumTitle: MediaNormalizer.cleanTitle(
                                        t.album,
                                      ),
                                      artistName: MediaNormalizer.formatArtists(
                                        t.artist,
                                      ),
                                      coverUrl: t.coverUrl,
                                    ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ),

                    // 13. Browse categories: two drifting marquee rows (unchanged)
                    SliverToBoxAdapter(
                      child: Reveal(
                        key: ValueKey('$_seed-genres'),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const _SecHeader(
                              title: 'Moods & genres',
                              overline: 'Browse all',
                            ),
                            _MarqueeRow(
                              indices: const [0, 2, 4, 6, 8, 10],
                              artFor: genreArt,
                              onTap: playGenre,
                              speed: 26,
                            ),
                            const SizedBox(height: 6),
                            _MarqueeRow(
                              indices: const [1, 3, 5, 7, 9, 11],
                              artFor: genreArt,
                              onTap: playGenre,
                              reverse: true,
                              speed: 20,
                              startOffset: 160,
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Clearance for floating mini player + persistent dock
                    SliverToBoxAdapter(
                      child: SizedBox(
                        height: 180 + MediaQuery.paddingOf(context).bottom,
                      ),
                    ),
                  ],
                ),
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: DynamicIslandHeader(
                    title: 'Home',
                    showBack: false,
                    isDockPage: true,
                    scrollController: _homeScrollController,
                    showProfile: true,
                  ),
                ),
              ],
            ),
    );
  }
}
