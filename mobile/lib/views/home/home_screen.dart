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
import '../../design_system/zen.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/player_state.dart';
import '../details/artist_screen.dart';
import '../details/album_screen.dart';
import '../details/artist_popup.dart';
import '../../models/artist_ref.dart';
import '../../design_system/widgets/interactive_artists_text.dart';
import '../../services/country_service.dart';
import '../../services/listening_history_service.dart';
import '../../services/innertube_service.dart';
import '../../services/user_preferences_service.dart';
import '../../services/update_service.dart';
import '../../utils/media_normalizer.dart';

/* ------------------------------------------------------------------ */
/*  Physics primitives                                                  */
/* ------------------------------------------------------------------ */
const _kPressSpring = SpringDescription(mass: 1, stiffness: 430, damping: 21);
const _kRevealSpring = SpringDescription(mass: 1, stiffness: 170, damping: 22);

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
    return (t * itemExtent).clamp(m.minScrollExtent, m.maxScrollExtent).toDouble();
  }

  @override
  Simulation? createBallisticSimulation(ScrollMetrics position, double velocity) {
    if ((velocity <= 0 && position.pixels <= position.minScrollExtent) ||
        (velocity >= 0 && position.pixels >= position.maxScrollExtent)) {
      return super.createBallisticSimulation(position, velocity);
    }
    final target = _target(position, velocity);
    if ((target - position.pixels).abs() < 0.5) return null;
    return ScrollSpringSimulation(spring, position.pixels, target, velocity,
        tolerance: toleranceFor(position));
  }

  @override
  bool get allowImplicitScrolling => false;
}

/// Press feedback with a real spring (squash on touch-down, bounce back on release).
class SpringPress extends StatefulWidget {
  const SpringPress({super.key, required this.child, this.onTap, this.scale = 0.96});
  final Widget child;
  final VoidCallback? onTap;
  final double scale;

  @override
  State<SpringPress> createState() => _SpringPressState();
}

class _SpringPressState extends State<SpringPress> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 1);

  void _to(double v) => _c.animateWith(SpringSimulation(_kPressSpring, _c.value, v, 0));

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
  late final AnimationController _c = AnimationController.unbounded(vsync: this, value: 0);
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
          child: Transform.translate(offset: Offset(0, (1 - v) * 28), child: child),
        );
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Small shared widgets                                                */
/* ------------------------------------------------------------------ */
class _Img extends StatelessWidget {
  const _Img(this.url, {this.radius = 10, this.circular = false, this.cacheWidth = 520});
  final String url;
  final double radius;
  final bool circular;
  final int cacheWidth;

  @override
  Widget build(BuildContext context) {
    final resolved = MediaNormalizer.upgradeArtworkUrl(url, isArtistAvatar: circular);
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
                child: Icon(circular ? CupertinoIcons.person_fill : Icons.music_note_rounded, color: AppColors.textTertiary),
              ),
            ),
          );
        }
        return Container(
          color: AppColors.surface2,
          child: const Icon(Icons.music_note_rounded, color: AppColors.textTertiary),
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
  const _TintedArt({required this.url, required this.color, required this.size, this.radius = 12});
  final String url;
  final Color color;
  final double size, radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 12, offset: const Offset(0, 5))],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: Stack(
          fit: StackFit.expand,
          children: [
            ColorFiltered(colorFilter: _kGray, child: _Img(url, radius: 0, cacheWidth: 300)),
            ColoredBox(color: color.withValues(alpha: 0.62)),
          ],
        ),
      ),
    );
  }
}

class _EqBars extends StatefulWidget {
  const _EqBars({required this.playing, this.height = 16});
  final bool playing;
  final double height;

  @override
  State<_EqBars> createState() => _EqBarsState();
}

class _EqBarsState extends State<_EqBars> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

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
    return AnimatedBuilder(
      animation: _c,
      builder: (context, child) => Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: List.generate(4, (i) {
          final v = widget.playing
              ? 0.3 + 0.7 * (0.5 + 0.5 * math.sin(_c.value * 2 * math.pi * (1 + i * 0.35) + i * 1.3))
              : 0.28;
          return Container(
            width: 3,
            height: widget.height * v,
            margin: const EdgeInsets.only(right: 2),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(1.5)),
          );
        }),
      ),
    );
  }
}

/// Section title with Apple's trailing chevron. Optional small line above.
class _SecHeader extends StatelessWidget {
  const _SecHeader({required this.title, this.overline, this.onMore});
  final String title;
  final String? overline;
  final VoidCallback? onMore;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 34, 20, 14),
      child: SpringPress(
        scale: 0.985,
        onTap: onMore,
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (overline != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Text(
                        overline!.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.textSecondary,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.6,
                        ),
                      ),
                    ),
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          title,
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
                      ),
                      if (onMore != null) ...[
                        const SizedBox(width: 2),
                        const Icon(Icons.chevron_right_rounded, color: AppColors.textTertiary, size: 26),
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
  const _Shelf({required this.height, required this.itemExtent, required this.count, required this.builder});
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
        physics: SnapSpringPhysics(parent: const BouncingScrollPhysics(), itemExtent: itemExtent),
        itemExtent: itemExtent,
        itemCount: count,
        addAutomaticKeepAlives: false,
        // ignore: deprecated_member_use
        cacheExtent: itemExtent * 2,
        itemBuilder: (c, i) => RepaintBoundary(
          child: Padding(padding: const EdgeInsets.only(right: 14), child: builder(c, i)),
        ),
      ),
    );
  }
}

class _PlayPill extends StatelessWidget {
  const _PlayPill({required this.label, required this.icon, this.onTap});
  final String label;
  final IconData icon;
  final VoidCallback? onTap;
  final bool dark = false;

  @override
  Widget build(BuildContext context) {
    final fg = dark ? Colors.white : Colors.black;
    return SpringPress(
      onTap: onTap,
      scale: 0.93,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 16, 8),
        decoration: BoxDecoration(
          color: dark ? Colors.white.withValues(alpha: 0.2) : Colors.white,
          borderRadius: BorderRadius.circular(22),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: fg, size: 20),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(color: fg, fontSize: 14, fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  HERO (Apple Music "Listen Now" carousel with parallax + ambience)   */
/* ------------------------------------------------------------------ */
class _HeroItem {
  const _HeroItem(this.track, this.tag);
  final Track track;
  final String tag;
}

class _Hero extends StatefulWidget {
  const _Hero({super.key, required this.items, required this.player, required this.onPlay});
  final List<_HeroItem> items;
  final PlayerState player;
  final void Function(int index) onPlay;

  @override
  State<_Hero> createState() => _HeroState();
}

class _HeroState extends State<_Hero> {
  final _pc = PageController(viewportFraction: 0.84);
  final ValueNotifier<int> _idx = ValueNotifier<int>(0);

  @override
  void dispose() {
    _pc.dispose();
    _idx.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.items;
    final w = MediaQuery.sizeOf(context).width;
    final h = math.min(450.0, w * 1.1);

    return SizedBox(
      height: h + 44,
      child: Stack(
        children: [
          // Ambient blurred backdrop that crossfades with the current artwork.
          Positioned.fill(
            child: RepaintBoundary(
              child: ValueListenableBuilder<int>(
                valueListenable: _idx,
                builder: (context, i, _) {
                  final url = MediaNormalizer.upgradeArtworkUrl(items[i.clamp(0, items.length - 1)].track.coverUrl,
                      isArtistAvatar: false);
                  return Stack(
                    fit: StackFit.expand,
                    children: [
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 700),
                        child: SizedBox.expand(
                          key: ValueKey(url),
                          child: ImageFiltered(
                            imageFilter: ui.ImageFilter.blur(sigmaX: 40, sigmaY: 40, tileMode: TileMode.clamp),
                            child: CachedNetworkImage(
                              imageUrl: url,
                              fit: BoxFit.cover,
                              memCacheWidth: 120,
                              errorWidget: (_, _, _) => const SizedBox.shrink(),
                            ),
                          ),
                        ),
                      ),
                      DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              AppColors.bg,
                              AppColors.bg.withValues(alpha: 0.35),
                              AppColors.bg.withValues(alpha: 0.55),
                              AppColors.bg,
                            ],
                            stops: const [0, 0.25, 0.7, 1],
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
          Column(
            children: [
              SizedBox(
                height: h,
                child: PageView.builder(
                  controller: _pc,
                  physics: const PageScrollPhysics(parent: BouncingScrollPhysics()),
                  itemCount: items.length,
                  onPageChanged: (i) => _idx.value = i,
                  itemBuilder: (context, i) {
                    return AnimatedBuilder(
                      animation: _pc,
                      builder: (context, _) {
                        double page = 0;
                        if (_pc.hasClients && _pc.position.haveDimensions) {
                          page = _pc.page ?? 0;
                        }
                        final d = (page - i).clamp(-1.0, 1.0).toDouble();
                        final scale = 1 - d.abs() * 0.07;
                        final it = items[i];
                        final cur = widget.player.currentTrack?.id == it.track.id;
                        return Transform.scale(
                          scale: scale,
                          child: _HeroCard(
                            item: it,
                            parallax: d,
                            current: cur,
                            playing: cur && widget.player.isPlaying,
                            onTap: () => widget.onPlay(i),
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
              const SizedBox(height: 16),
              ValueListenableBuilder<int>(
                valueListenable: _idx,
                builder: (context, cur, _) => Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(items.length, (i) {
                    final on = i == cur;
                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 350),
                      curve: Curves.easeOutCubic,
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      width: on ? 18 : 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: on ? Colors.white : Colors.white.withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    );
                  }),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({
    required this.item,
    required this.parallax,
    required this.current,
    required this.playing,
    required this.onTap,
  });
  final _HeroItem item;
  final double parallax;
  final bool current, playing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = item.track;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
      child: SpringPress(
        scale: 0.975,
        onTap: onTap,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 28, offset: const Offset(0, 14))],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(28),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Transform.translate(
                  offset: Offset(-parallax * 44, 0),
                  child: Transform.scale(scale: 1.2, child: _Img(t.coverUrl, radius: 0, cacheWidth: 900)),
                ),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.32),
                        Colors.transparent,
                        Colors.black.withValues(alpha: 0.88),
                      ],
                      stops: const [0, 0.4, 1],
                    ),
                  ),
                ),
                Positioned(
                  left: 18,
                  top: 18,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      item.tag.toUpperCase(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 20,
                  right: 20,
                  bottom: 20,
                  child: Transform.translate(
                    offset: Offset(parallax * 24, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          MediaNormalizer.cleanCompactTitle(t.title),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: 'SF Pro Display',
                            color: Colors.white,
                            fontSize: 28,
                            height: 1.05,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.9,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          MediaNormalizer.formatArtists(t.artist),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 15),
                        ),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            _PlayPill(
                              label: current && playing ? 'Playing' : 'Play',
                              icon: current && playing ? Icons.graphic_eq_rounded : Icons.play_arrow_rounded,
                              onTap: onTap,
                            ),
                            const Spacer(),
                            if (current) _EqBars(playing: playing, height: 18),
                          ],
                        ),
                      ],
                    ),
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

/* ------------------------------------------------------------------ */
/*  Card layouts (each section uses a different one)                    */
/* ------------------------------------------------------------------ */

/// Classic Apple card: art + title + artist underneath.
class _CoverCard extends StatelessWidget {
  const _CoverCard({
    required this.url,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.artists,
    this.playing = false,
    this.current = false,
    this.circular = false,
    this.radius = 12,
  });
  final String url, title, subtitle;
  final List<ArtistRef>? artists;
  final VoidCallback onTap;
  final bool playing, current, circular;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: circular ? CrossAxisAlignment.center : CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: circular ? BoxShape.circle : BoxShape.rectangle,
                borderRadius: circular ? null : BorderRadius.circular(radius),
                boxShadow: [
                  BoxShadow(color: Colors.black.withValues(alpha: 0.32), blurRadius: 14, offset: const Offset(0, 6)),
                ],
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _Img(url, circular: circular, radius: radius),
                  if (current)
                    Positioned(
                      left: 8,
                      bottom: 8,
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: _EqBars(playing: playing, height: 12),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            MediaNormalizer.cleanCompactTitle(title),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: circular ? TextAlign.center : TextAlign.start,
            style: TextStyle(
              color: current ? AppColors.accent : Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 2),
          if (artists != null && artists!.isNotEmpty && !circular)
            InteractiveArtistsText(
              artists: artists!,
              maxLines: 1,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13.5),
            )
          else
            Text(
              circular
                  ? (subtitle.trim().isNotEmpty && subtitle.trim().toLowerCase() != 'unknown artist'
                      ? subtitle.trim()
                      : 'Artist')
                  : MediaNormalizer.formatArtists(subtitle),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: circular ? TextAlign.center : TextAlign.start,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13.5),
            ),
        ],
      ),
    );
  }
}

/// Art-first card with title burned into the artwork + play button.
class _OverlayCard extends StatelessWidget {
  const _OverlayCard({required this.track, required this.current, required this.playing, required this.onTap});
  final Track track;
  final bool current, playing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: onTap,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 14, offset: const Offset(0, 6))],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: Stack(
            fit: StackFit.expand,
            children: [
              _Img(track.coverUrl, radius: 0),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Colors.black.withValues(alpha: 0.82)],
                    stops: const [0.45, 1],
                  ),
                ),
              ),
              Positioned(
                top: 10,
                right: 10,
                child: Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.4), shape: BoxShape.circle),
                  alignment: Alignment.center,
                  child: current
                      ? _EqBars(playing: playing, height: 14)
                      : const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 22),
                ),
              ),
              Positioned(
                left: 12,
                right: 12,
                bottom: 12,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      MediaNormalizer.cleanCompactTitle(track.title),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: current ? AppColors.accent : Colors.white,
                        fontSize: 15,
                        height: 1.1,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      MediaNormalizer.formatArtists(track.artist),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 12.5),
                    ),
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

/// Tall poster card (3:4) with bold title at the bottom.
class _PosterCard extends StatelessWidget {
  const _PosterCard({required this.track, required this.onTap, required this.index});
  final Track track;
  final VoidCallback onTap;
  final int index;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: onTap,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 16, offset: const Offset(0, 8))],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(22),
          child: Stack(
            fit: StackFit.expand,
            children: [
              _Img(track.coverUrl, radius: 0, cacheWidth: 640),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Colors.black.withValues(alpha: 0.9)],
                    stops: const [0.5, 1],
                  ),
                ),
              ),
              Positioned(
                left: 14,
                top: 12,
                child: Text(
                  '${index + 1}'.padLeft(2, '0'),
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.85),
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1,
                  ),
                ),
              ),
              Positioned(
                left: 14,
                right: 14,
                bottom: 14,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      MediaNormalizer.cleanCompactTitle(track.title),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        height: 1.05,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      MediaNormalizer.formatArtists(track.artist),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 12.5),
                    ),
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

/// Cover with a vinyl record peeking out - for "Rediscover".
class _VinylCard extends StatelessWidget {
  const _VinylCard({required this.track, required this.onTap});
  final Track track;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: onTap,
      child: LayoutBuilder(
        builder: (context, box) {
          final s = box.maxWidth * 0.8;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: box.maxWidth,
                height: s,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned(
                      left: box.maxWidth - s,
                      top: 0,
                      child: Container(
                        width: s,
                        height: s,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(colors: [Color(0xFF2A2A2E), Color(0xFF050505)]),
                        ),
                        alignment: Alignment.center,
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            for (final f in [0.9, 0.78, 0.66])
                              Container(
                                width: s * f,
                                height: s * f,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  border: Border.all(color: Colors.white.withValues(alpha: 0.05), width: 1),
                                ),
                              ),
                            SizedBox(width: s * 0.34, height: s * 0.34, child: _Img(track.coverUrl, circular: true, cacheWidth: 200)),
                            Container(width: 7, height: 7, decoration: const BoxDecoration(color: Colors.black, shape: BoxShape.circle)),
                          ],
                        ),
                      ),
                    ),
                    Positioned(
                      left: 0,
                      top: 0,
                      child: Container(
                        width: s,
                        height: s,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 14, offset: const Offset(3, 6))],
                        ),
                        child: _Img(track.coverUrl, radius: 10),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: s,
                child: Text(
                  MediaNormalizer.cleanCompactTitle(track.title),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600, letterSpacing: -0.2),
                ),
              ),
              const SizedBox(height: 2),
              SizedBox(
                width: s,
                child: Text(
                  MediaNormalizer.formatArtists(track.artist),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 13.5),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Full-width artist feature banner.
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
        scale: 0.98,
        onTap: onOpen,
        child: SizedBox(
          height: 220,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(26),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 18, offset: const Offset(0, 8))],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(26),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Transform.scale(scale: 1.25, child: _Img(coverUrl, radius: 0, cacheWidth: 800)),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.centerLeft,
                        end: Alignment.centerRight,
                        colors: [Colors.black.withValues(alpha: 0.9), Colors.black.withValues(alpha: 0.15)],
                        stops: const [0.15, 1],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(20),
                    child: Column(
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
                        const SizedBox(height: 6),
                        SizedBox(
                          width: 210,
                          child: Text(
                            artist,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontFamily: 'SF Pro Display',
                              color: Colors.white,
                              fontSize: 30,
                              height: 1.02,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -1,
                            ),
                          ),
                        ),
                        const Spacer(),
                        _PlayPill(label: 'Play hits', icon: Icons.play_arrow_rounded, onTap: onPlay),
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
  }
}

/// #1 chart feature card.
class _ChartHeroCard extends StatelessWidget {
  const _ChartHeroCard({required this.track, required this.onTap, required this.playing, required this.current});
  final Track track;
  final VoidCallback onTap;
  final bool playing, current;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      child: SpringPress(
        scale: 0.98,
        onTap: onTap,
        child: SizedBox(
          height: 190,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: Stack(
              fit: StackFit.expand,
              children: [
                ImageFiltered(
                  imageFilter: ui.ImageFilter.blur(sigmaX: 14, sigmaY: 14),
                  child: Transform.scale(scale: 1.4, child: _Img(track.coverUrl, radius: 0, cacheWidth: 200)),
                ),
                ColoredBox(color: Colors.black.withValues(alpha: 0.45)),
                Positioned(
                  left: 18,
                  top: 6,
                  child: Text(
                    '1',
                    style: TextStyle(
                      fontFamily: 'SF Pro Display',
                      color: Colors.white.withValues(alpha: 0.95),
                      fontSize: 120,
                      height: 1.05,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -6,
                    ),
                  ),
                ),
                Positioned(
                  right: 18,
                  top: 18,
                  bottom: 18,
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 16, offset: const Offset(0, 6))],
                      ),
                      child: _Img(track.coverUrl, radius: 16),
                    ),
                  ),
                ),
                Positioned(
                  left: 20,
                  bottom: 18,
                  right: 170,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        MediaNormalizer.cleanCompactTitle(track.title),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: current ? AppColors.accent : Colors.white,
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.4,
                        ),
                      ),
                      Text(
                        MediaNormalizer.formatArtists(track.artist),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 13),
                      ),
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
                        color: rank! <= 3 ? Colors.white : AppColors.textSecondary,
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
                      _Img(track.coverUrl, radius: 8, cacheWidth: 200),
                      if (current)
                        Container(
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.5),
                            borderRadius: BorderRadius.circular(8),
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
                              artists: track is Track ? track.resolvedArtists : (track.artist as String),
                              style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                              maxLines: 1,
                            ),
                          ),
                          if (subtitleAlbum && track.album != null && track.album.toString().isNotEmpty && track.album != 'Single') ...[
                            const Text(' • ', style: TextStyle(color: AppColors.textTertiary, fontSize: 14)),
                            Flexible(
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () {
                                  HapticFeedback.lightImpact();
                                  Navigator.of(context).push(
                                    ZenPageRoute(
                                      builder: (_) => AlbumScreen(
                                        albumTitle: MediaNormalizer.cleanTitle(track.album),
                                        artistName: MediaNormalizer.formatArtists(track.artist),
                                        coverUrl: track.coverUrl,
                                      ),
                                    ),
                                  );
                                },
                                child: Text(
                                  MediaNormalizer.cleanCompactTitle(track.album),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(color: AppColors.textTertiary, fontSize: 14),
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
                    icon: const Icon(Icons.more_horiz_rounded, color: AppColors.textTertiary, size: 22),
                    onPressed: () {
                      final p = context.read<PlayerState>();
                      final resolvedArtists = track is Track ? track.resolvedArtists : ArtistRef.splitFromName(track.artist as String?);
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
                              ZenPageRoute(builder: (_) => ArtistScreen(artistName: resolvedArtists.first.name)),
                            );
                          }
                        },
                        onGoToAlbum: track.album.isNotEmpty && track.album != 'Single'
                            ? () => Navigator.push(
                                  context,
                                  ZenPageRoute(
                                    builder: (_) => AlbumScreen(
                                      albumTitle: MediaNormalizer.cleanTitle(track.album),
                                      artistName: MediaNormalizer.formatArtists(track.artist),
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
    this.style = _RowStyle.plain,
    this.album = false,
    this.rankOffset = 0,
  });
  final List<dynamic> tracks;
  final int rows;
  final PlayerState player;
  final void Function(int index) onPlay;
  final _RowStyle style;
  final bool album;
  final int rankOffset;

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
                rank: widget.style == _RowStyle.ranked ? i + 1 + widget.rankOffset : null,
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
                        borderRadius: BorderRadius.circular(18),
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
/*  Mood chips                                                          */
/* ------------------------------------------------------------------ */
const _moods = ['Energize', 'Relax', 'Workout', 'Commute', 'Focus', 'Party', 'Romance', 'Sad', 'Sleep'];

class _Chips extends StatelessWidget {
  const _Chips({required this.selected, required this.onSelect});
  final int selected;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 8),
        itemCount: _moods.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (ctx, i) {
          final on = i == selected;
          return Builder(
            builder: (c) => SpringPress(
              scale: 0.92,
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
                duration: const Duration(milliseconds: 380),
                curve: Curves.easeOutBack,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: on ? Colors.white : AppColors.surface2,
                  borderRadius: BorderRadius.circular(18),
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
/*  Categories - Apple Music "Browse" tiles with tilted duotone art     */
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
];

class _GenreTile extends StatelessWidget {
  const _GenreTile(this.g, {required this.onTap, this.imageUrl, this.tilt = 0.24});
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
        borderRadius: BorderRadius.circular(14),
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [g.color, Color.lerp(g.color, Colors.black, 0.32)!],
            ),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Positioned(
                right: -16,
                top: -14,
                child: Icon(g.icon, size: 92, color: Colors.white.withValues(alpha: 0.12)),
              ),
              Positioned(
                right: -12,
                bottom: -16,
                child: Transform.rotate(
                  angle: tilt,
                  child: imageUrl != null
                      ? _TintedArt(url: imageUrl!, color: g.color, size: 96)
                      : Icon(g.icon, size: 84, color: Colors.white.withValues(alpha: 0.3)),
                ),
              ),
              Positioned(
                left: 14,
                bottom: 12,
                child: Text(
                  g.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
              Positioned(
                left: 14,
                top: 12,
                child: Icon(g.icon, size: 20, color: Colors.white.withValues(alpha: 0.9)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Mix cards (tall, duotone art peeking in)                            */
/* ------------------------------------------------------------------ */
class _MixCard extends StatelessWidget {
  const _MixCard({
    required this.title,
    required this.subtitle,
    required this.gradient,
    required this.icon,
    required this.onTap,
    this.imageUrl,
    this.tilt = 0.2,
  });

  final String title;
  final String subtitle;
  final List<Color> gradient;
  final IconData icon;
  final VoidCallback onTap;
  final String? imageUrl;
  final double tilt;

  @override
  Widget build(BuildContext context) {
    return SpringPress(
      onTap: onTap,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 14, offset: const Offset(0, 7))],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(22),
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: gradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Positioned(
                  right: -30,
                  top: 54,
                  child: Transform.rotate(
                    angle: tilt,
                    child: imageUrl != null
                        ? _TintedArt(url: imageUrl!, color: gradient.first, size: 140, radius: 16)
                        : Icon(icon, size: 130, color: Colors.white.withValues(alpha: 0.2)),
                  ),
                ),
                Positioned(
                  left: 14,
                  top: 14,
                  child: Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.22), shape: BoxShape.circle),
                    child: Icon(icon, color: Colors.white, size: 20),
                  ),
                ),
                Positioned(
                  left: 14,
                  right: 14,
                  bottom: 14,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        maxLines: 2,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 21,
                          height: 1.05,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.6,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.8), fontSize: 12.5, fontWeight: FontWeight.w500),
                      ),
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

class _SectionSheetState extends State<_SectionSheet> with SingleTickerProviderStateMixin {
  final ValueNotifier<double> _dy = ValueNotifier<double>(0);
  late final AnimationController _back =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 280));
  double _from = 0;

  @override
  void initState() {
    super.initState();
    _back.addListener(() => _dy.value = _from * (1 - Curves.easeOutCubic.transform(_back.value)));
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
          ? () => _go(AlbumScreen(
                albumTitle: MediaNormalizer.cleanTitle(t.album),
                artistName: MediaNormalizer.formatArtists(t.artist),
                coverUrl: t.coverUrl,
              ))
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
          builder: (context, dy, child) => Transform.translate(offset: Offset(0, dy), child: child),
          child: Container(
            height: mq.size.height - topGap,
            decoration: const BoxDecoration(
              color: AppColors.bg,
              borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
            ),
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(26)),
              child: Column(
                children: [
                  // Header (drag down to dismiss)
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onVerticalDragStart: (_) => _back.stop(),
                    onVerticalDragUpdate: (d) => _dy.value = math.max(0, _dy.value + d.delta.dy),
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
                                  decoration: const BoxDecoration(color: AppColors.surface2, shape: BoxShape.circle),
                                  child: const Icon(Icons.close_rounded, color: AppColors.textSecondary, size: 18),
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
                          physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
                          padding: EdgeInsets.only(bottom: mq.padding.bottom + 24),
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
                              onMenu: e.track == null ? null : () => _menu(e.track!),
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
                      _Img(entry.cover, radius: 5, circular: entry.circular, cacheWidth: 220),
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
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 13.5),
                      ),
                    ],
                  ),
                ),
                if (onMenu != null)
                  IconButton(
                    onPressed: onMenu,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                    icon: const Icon(Icons.more_vert_rounded, color: AppColors.textSecondary, size: 22),
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
  int _mood = -1;
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
    UserPreferencesService.instance.prefsNotifier.addListener(_onCountryChanged);
    ListeningHistoryService.instance.historyNotifier.addListener(_onHistoryChanged);
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

  String get _effectivePrimaryLanguage {
    final hist = ListeningHistoryService.instance.primaryLanguage;
    if (hist.isNotEmpty) return hist;
    return UserPreferencesService.instance.current?.primaryLanguage ?? '';
  }

  void _onHistoryChanged() {
    if (mounted) {
      setState(() {
        final onboard = UserPreferencesService.instance.current;
        _recentHistory = ListeningHistoryService.instance.getRecentTracks();
        _rediscover = ListeningHistoryService.instance.getRediscoverTracks();
        final fav = ListeningHistoryService.instance.getFavoriteArtist() ?? onboard?.primaryArtist;
        final secondFav = ListeningHistoryService.instance.getSecondFavoriteArtist() ?? onboard?.secondaryArtist;
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
    CountryService.instance.countryNotifier.removeListener(_onCountryChanged);
    UserPreferencesService.instance.prefsNotifier.removeListener(_onCountryChanged);
    ListeningHistoryService.instance.historyNotifier.removeListener(_onHistoryChanged);
    super.dispose();
  }

  Future<void> _loadAllHomeData({bool refresh = false}) async {
    if (!mounted) return;
    setState(() => _loading = true);

    try {
      final country = CountryService.instance.currentCountry;

      // 1. Load User Listening Telemetry (with saved onboarding tastes as Day-1 seed)
      final onboard = UserPreferencesService.instance.current;
      _recentHistory = ListeningHistoryService.instance.getRecentTracks();
      _rediscover = ListeningHistoryService.instance.getRediscoverTracks();
      _favoriteArtist = ListeningHistoryService.instance.getFavoriteArtist() ?? onboard?.primaryArtist;
      _secondFavoriteArtist = ListeningHistoryService.instance.getSecondFavoriteArtist() ?? onboard?.secondaryArtist;
      final userLang = _effectivePrimaryLanguage;

      // 2. Time-of-Day Context & Greeting
      final timeCtx = ListeningHistoryService.getTimeOfDayContext(userLang);
      _timeOfDayGreeting = timeCtx.greeting;
      _timeOfDayMoodLabel = timeCtx.moodLabel;

      // 3. Time-of-day shelf query
      InnerTubeService.instance.search(timeCtx.defaultSearchTerm).then((tracks) {
        if (mounted && tracks.isNotEmpty) {
          setState(() => _timeOfDayTracks = tracks.take(12).toList());
        }
      }).catchError((_) {});

      // 4. Personalized Quick Picks based on user's top artist / last track
      if (_favoriteArtist != null && _favoriteArtist!.isNotEmpty) {
        InnerTubeService.instance.search('${_favoriteArtist!} radio').then((tracks) {
          if (mounted && tracks.isNotEmpty) {
            setState(() {
              _quickPicks = tracks.take(12).toList();
              _loading = false;
            });
          }
        }).catchError((_) {});
      } else if (_recentHistory.isNotEmpty) {
        InnerTubeService.instance.fetchRelated(_recentHistory.first).then((tracks) {
          if (mounted && tracks.isNotEmpty) {
            setState(() {
              _quickPicks = tracks.take(12).toList();
              _loading = false;
            });
          }
        }).catchError((_) {});
      } else {
        // Zero history: fetch real live home feed
        InnerTubeService.instance.getHomeFeed(countryCode: country.code).then((tracks) {
          if (mounted && tracks.isNotEmpty && _quickPicks.isEmpty) {
            setState(() {
              _quickPicks = tracks.take(12).toList();
              _loading = false;
            });
          }
        }).catchError((_) {});
      }

      // 5. #1 Favorite Artist Spotlight
      if (_favoriteArtist != null && _favoriteArtist!.isNotEmpty) {
        _loadFavoriteArtistTracks(_favoriteArtist!);
      }

      // 6. #2 Favorite Artist Spotlight
      if (_secondFavoriteArtist != null && _secondFavoriteArtist!.isNotEmpty) {
        _loadSecondFavoriteArtistTracks(_secondFavoriteArtist!);
      }

      // 7. New Releases (filtered by user's dominant language)
      if (userLang.isNotEmpty) {
        InnerTubeService.instance.search('latest $userLang songs').then((tracks) {
          if (mounted && tracks.isNotEmpty) {
            setState(() {
              _newReleases = tracks.take(9).toList();
              _loading = false;
            });
          }
        }).catchError((_) {});
      } else {
        InnerTubeService.instance.getNewReleases(countryCode: country.code).then((tracks) {
          if (mounted && tracks.isNotEmpty) {
            setState(() {
              _newReleases = tracks.take(9).toList();
              _loading = false;
            });
          }
        }).catchError((_) {});
      }

      // 8. Regional Charts & Chart Artists
      InnerTubeService.instance.getCharts(countryCode: country.code).then((data) {
        if (mounted) {
          setState(() {
            if (data.tracks.isNotEmpty) _chartTracks = data.tracks.take(12).toList();
            if (data.artists.isNotEmpty) _chartArtists = data.artists.take(10).toList();
            _loading = false;
          });
        }
      }).catchError((_) {});

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
    final userLang = _effectivePrimaryLanguage;
    final country = CountryService.instance.currentCountry;
    final langPrefix = userLang.isNotEmpty ? '$userLang ' : '${country.name} ';
    final query = '$langPrefix$mood hits';

    InnerTubeService.instance.search(query).then((tracks) {
      if (mounted && _mood == index) {
        setState(() {
          _moodTracks = tracks.take(12).toList();
          _loadingMood = false;
        });
      }
    }).catchError((_) {
      if (mounted && _mood == index) {
        setState(() => _loadingMood = false);
      }
    });
  }

  void _playMix(String mixType) {
    HapticFeedback.mediumImpact();
    final userLang = _effectivePrimaryLanguage;
    final country = CountryService.instance.currentCountry;
    final langPrefix = userLang.isNotEmpty ? '$userLang ' : '${country.name} ';

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
          InnerTubeService.instance.search('${langPrefix}top hits supermix').then((tracks) {
            if (tracks.isNotEmpty) play(tracks, 0);
          });
        }
        break;

      case 'discover':
        InnerTubeService.instance.search('${langPrefix}fresh discoveries indie tracks').then((tracks) {
          if (tracks.isNotEmpty) play(tracks, 0);
        });
        break;

      case 'chill':
        InnerTubeService.instance.search('${langPrefix}chill acoustic melodies').then((tracks) {
          if (tracks.isNotEmpty) play(tracks, 0);
        });
        break;

      case 'energy':
        InnerTubeService.instance.search('${langPrefix}workout high energy dance hits').then((tracks) {
          if (tracks.isNotEmpty) play(tracks, 0);
        });
        break;
    }
  }

  int get _seed => (_mood + 1) * 7 + _refresh * 13;

  Widget _sec(String key, Widget child) => SliverToBoxAdapter(
        child: Reveal(key: ValueKey('$_seed-$key'), child: child),
      );

  void _open(Widget screen) => Navigator.push(context, ZenPageRoute(builder: (_) => screen));

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
    context.read<PlayerState>().setQueue(list, startIndex: startIdx, context: ctx);
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

  void _openSection({required String title, String? overline, required List<_ListEntry> entries}) {
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
        position: Tween<Offset>(begin: const Offset(0, 1), end: Offset.zero).animate(
          CurvedAnimation(parent: anim, curve: Curves.easeOutCubic, reverseCurve: Curves.easeInCubic),
        ),
        child: child,
      ),
    );
  }

  String? _cover(List<Track> l, int i) => l.length > i && l[i].coverUrl.isNotEmpty ? l[i].coverUrl : null;

  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final top = MediaQuery.paddingOf(context).top;
    final country = CountryService.instance.currentCountry;
    final w = MediaQuery.sizeOf(context).width;

    // Card geometry: ~2.35 cards visible (two full + a third peeking)
    final ext = (w - 20) / 2.35;
    final cw = ext - 14;

    // Real dynamic datasets
    final listenAgain = _recentHistory.isNotEmpty
        ? _recentHistory
        : (_quickPicks.isNotEmpty ? _quickPicks.take(10).toList() : _chartTracks.take(10).toList());

    final quick = _quickPicks.isNotEmpty ? _quickPicks.take(12).toList() : _chartTracks.take(12).toList();
    final charts = _chartTracks.isNotEmpty ? _chartTracks.take(12).toList() : const <Track>[];
    final fresh = _newReleases.isNotEmpty ? _newReleases.take(9).toList() : const <Track>[];

    // Albums for you (extracted from real dynamic releases & quickpicks)
    final albumMap = <String, Track>{};
    for (final t in [..._newReleases, ..._quickPicks, ..._chartTracks, ..._recentHistory]) {
      final alb = MediaNormalizer.cleanTitle(t.album);
      if (alb.isNotEmpty && alb.toLowerCase() != 'single' && !MediaNormalizer.isMetadataNoise(alb)) {
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
    for (final t in [..._chartTracks, ..._newReleases, ..._quickPicks, ..._recentHistory, ..._timeOfDayTracks]) {
      if (t.coverUrl.isNotEmpty && !artPool.contains(t.coverUrl)) artPool.add(t.coverUrl);
    }
    String? genreArt(int i) => artPool.isEmpty ? null : artPool[(i * 3 + 1) % artPool.length];

    return Scaffold(
      backgroundColor: AppColors.bg,
      body: _loading && _quickPicks.isEmpty && _chartTracks.isEmpty && _recentHistory.isEmpty
          ? const Center(child: CupertinoActivityIndicator(color: Colors.white70, radius: 14))
          : Stack(
              children: [
                CustomScrollView(
                  physics: const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics()),
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
                        final spinning = mode == RefreshIndicatorMode.refresh || mode == RefreshIndicatorMode.done;
                        return Center(
                          child: Opacity(
                            opacity: p,
                            child: spinning
                                ? const CupertinoActivityIndicator(color: Colors.white70, radius: 12)
                                : CupertinoActivityIndicator.partiallyRevealed(
                                    color: Colors.white70, radius: 12, progress: p),
                          ),
                        );
                      },
                    ),

                    // In-App Update Banner
                    SliverToBoxAdapter(
                      child: ValueListenableBuilder<UpdateInfo?>(
                        valueListenable: UpdateService.instance.availableUpdateNotifier,
                        builder: (context, update, _) {
                          if (update == null || !update.hasUpdate) return const SizedBox.shrink();
                          return Padding(
                            padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                              decoration: BoxDecoration(
                                color: const Color(0xFF18181B),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: AppColors.crimson.withValues(alpha: 0.35)),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 34,
                                    height: 34,
                                    decoration: BoxDecoration(
                                      color: AppColors.crimson.withValues(alpha: 0.18),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: const Icon(Icons.system_update_rounded, color: AppColors.crimson, size: 18),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Zenify v${update.latestVersion} Available',
                                          style: const TextStyle(
                                            fontSize: 12.5,
                                            fontWeight: FontWeight.w700,
                                            color: Colors.white,
                                          ),
                                        ),
                                        const SizedBox(height: 2),
                                        Text(
                                          'Tap to view release notes & update',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.white.withValues(alpha: 0.6),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  GestureDetector(
                                    onTap: () {
                                      HapticFeedback.lightImpact();
                                      UpdateService.instance.showUpdateSheet(context, update);
                                    },
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                      decoration: BoxDecoration(
                                        color: AppColors.crimson,
                                        borderRadius: BorderRadius.circular(8),
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

                    // Large title greeting
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 8, 20, 14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _timeOfDayMoodLabel.toUpperCase(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppColors.textSecondary,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.8,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _timeOfDayGreeting,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontFamily: 'SF Pro Display',
                                color: Colors.white,
                                fontSize: 36,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -1.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                    // HERO carousel
                    if (heroItems.isNotEmpty)
                      SliverToBoxAdapter(
                        child: _Hero(
                          key: ValueKey('hero-$_refresh-${heroItems.length}'),
                          items: heroItems,
                          player: player,
                          onPlay: (i) => play(heroTracks, i),
                        ),
                      ),

                    // Mood Chips (Interactive)
                    SliverToBoxAdapter(
                      child: _Chips(
                        selected: _mood,
                        onSelect: _onSelectMood,
                      ),
                    ),

                    // 1. Mood Spotlight Shelf (Active when a mood chip is tapped)
                    if (_mood != -1)
                      _sec('mood-spotlight', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: '${_moods[_mood]} Spotlight',
                            overline: 'Curated for this moment',
                            onMore: () => _openSection(title: '${_moods[_mood]} Spotlight', overline: 'Curated for this moment', entries: _trackEntries(_moodTracks)),
                          ),
                          if (_loadingMood)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 36),
                              child: Center(
                                child: CupertinoActivityIndicator(color: Colors.white70, radius: 12),
                              ),
                            )
                          else if (_moodTracks.isNotEmpty)
                            _PagedRows(
                              tracks: _moodTracks.take(12).toList(),
                              rows: 4,
                              player: player,
                              onPlay: (i) => play(_moodTracks, i),
                            ),
                        ],
                      )),

                    // 2. Time-of-day: art-first overlay cards
                    if (_timeOfDayTracks.isNotEmpty && _mood == -1)
                      _sec('time-of-day', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: _timeOfDayMoodLabel,
                            overline: _timeOfDayGreeting,
                            onMore: () => _openSection(title: _timeOfDayMoodLabel, overline: _timeOfDayGreeting, entries: _trackEntries(_timeOfDayTracks)),
                          ),
                          _Shelf(
                            height: cw * 1.12,
                            itemExtent: ext,
                            count: _timeOfDayTracks.length,
                            builder: (c, i) {
                              final t = _timeOfDayTracks[i];
                              final cur = player.currentTrack?.id == t.id;
                              return _OverlayCard(
                                track: t,
                                current: cur,
                                playing: cur && player.isPlaying,
                                onTap: () => play(_timeOfDayTracks, i),
                              );
                            },
                          ),
                        ],
                      )),

                    // 3. Listen again: classic big cards
                    if (listenAgain.isNotEmpty)
                      _sec('again', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: 'Listen again',
                            overline: _recentHistory.isNotEmpty ? 'Jump back in' : 'Trending for you',
                            onMore: () => _openSection(title: 'Listen again', overline: _recentHistory.isNotEmpty ? 'Jump back in' : 'Trending for you', entries: _trackEntries(listenAgain)),
                          ),
                          _Shelf(
                            height: cw + 62,
                            itemExtent: ext,
                            count: listenAgain.length,
                            builder: (c, i) {
                              final t = listenAgain[i];
                              final cur = player.currentTrack?.id == t.id;
                              return _CoverCard(
                                url: t.coverUrl,
                                title: MediaNormalizer.cleanCompactTitle(t.title),
                                subtitle: t.artist,
                                artists: t.resolvedArtists,
                                current: cur,
                                playing: cur && player.isPlaying,
                                onTap: () => play(listenAgain, i),
                              );
                            },
                          ),
                        ],
                      )),

                    // 4. Quick picks: swipeable pages of rows
                    if (quick.isNotEmpty)
                      _sec('quick', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: 'Quick picks',
                            overline: _favoriteArtist != null ? 'Tailored to your taste' : 'Start radio from a song',
                            onMore: () => _openSection(title: 'Quick picks', overline: 'Tailored to your taste', entries: _trackEntries(quick)),
                          ),
                          _PagedRows(
                            tracks: quick,
                            rows: 4,
                            player: player,
                            onPlay: (i) => play(quick, i),
                          ),
                        ],
                      )),

                    // 5. Mixed for you: tall gradient cards with duotone art
                    _sec('mixes', Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _SecHeader(title: 'Mixed for you', overline: 'Personalized stations'),
                        _Shelf(
                          height: cw * 1.3,
                          itemExtent: ext,
                          count: 4,
                          builder: (c, i) {
                            switch (i) {
                              case 0:
                                return _MixCard(
                                  title: 'My Supermix',
                                  subtitle: 'Your blended favorites',
                                  gradient: const [Color(0xFFB02A44), Color(0xFF4A0E17)],
                                  icon: Icons.all_inclusive_rounded,
                                  imageUrl: _cover(_favoriteArtistTracks, 0) ?? _cover(_quickPicks, 0),
                                  onTap: () => _playMix('supermix'),
                                );
                              case 1:
                                return _MixCard(
                                  title: 'Discover Mix',
                                  subtitle: 'Fresh weekly finds',
                                  gradient: const [Color(0xFF0F8F84), Color(0xFF134E4A)],
                                  icon: Icons.explore_rounded,
                                  imageUrl: _cover(_newReleases, 1),
                                  tilt: -0.2,
                                  onTap: () => _playMix('discover'),
                                );
                              case 2:
                                return _MixCard(
                                  title: 'Chill Mix',
                                  subtitle: 'Mellow & unhurried',
                                  gradient: const [Color(0xFF2563EB), Color(0xFF1E3A8A)],
                                  icon: Icons.spa_rounded,
                                  imageUrl: _cover(_timeOfDayTracks, 2),
                                  onTap: () => _playMix('chill'),
                                );
                              default:
                                return _MixCard(
                                  title: 'Energy Mix',
                                  subtitle: 'High-tempo momentum',
                                  gradient: const [Color(0xFFEA8A0A), Color(0xFF78350F)],
                                  icon: Icons.bolt_rounded,
                                  imageUrl: _cover(_chartTracks, 3),
                                  tilt: -0.2,
                                  onTap: () => _playMix('energy'),
                                );
                            }
                          },
                        ),
                      ],
                    )),

                    // 6. #1 artist: feature banner + compact shelf
                    if (_favoriteArtist != null && _favoriteArtistTracks.isNotEmpty)
                      _sec('similar', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: 'Your top artist',
                            overline: 'Because you listen to',
                            onMore: () => _openSection(title: _favoriteArtist!, overline: 'Because you listen to', entries: _trackEntries(_favoriteArtistTracks)),
                          ),
                          _ArtistBanner(
                            artist: _favoriteArtist!,
                            overline: 'Because you listen to',
                            coverUrl: _favoriteArtistTracks.first.coverUrl,
                            onPlay: () => play(_favoriteArtistTracks, 0),
                            onOpen: () => _open(ArtistScreen(artistName: _favoriteArtist!)),
                          ),
                          _Shelf(
                            height: cw * 0.78 + 58,
                            itemExtent: cw * 0.78 + 14,
                            count: _favoriteArtistTracks.length,
                            builder: (c, i) {
                              final t = _favoriteArtistTracks[i];
                              return _CoverCard(
                                url: t.coverUrl,
                                title: MediaNormalizer.cleanCompactTitle(t.title),
                                subtitle: t.artist,
                                artists: t.resolvedArtists,
                                radius: 10,
                                onTap: () => play(_favoriteArtistTracks, i),
                              );
                            },
                          ),
                        ],
                      )),

                    // 7. #2 artist: tall posters
                    if (_secondFavoriteArtist != null && _secondFavoriteArtistTracks.isNotEmpty)
                      _sec('similar-second', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            overline: 'More by',
                            title: _secondFavoriteArtist!,
                            onMore: () => _openSection(title: _secondFavoriteArtist!, overline: 'More by', entries: _trackEntries(_secondFavoriteArtistTracks)),
                          ),
                          _Shelf(
                            height: cw * 1.36,
                            itemExtent: ext,
                            count: _secondFavoriteArtistTracks.length,
                            builder: (c, i) {
                              final t = _secondFavoriteArtistTracks[i];
                              return _PosterCard(
                                track: t,
                                index: i,
                                onTap: () => play(_secondFavoriteArtistTracks, i),
                              );
                            },
                          ),
                        ],
                      )),

                    // 8. Rediscover: vinyl cards
                    if (_rediscover.isNotEmpty)
                      _sec('rediscover', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            overline: 'From your past listening',
                            title: 'Rediscover your favorites',
                            onMore: () => _openSection(title: 'Rediscover your favorites', overline: 'From your past listening', entries: _trackEntries(_rediscover)),
                          ),
                          _Shelf(
                            height: cw * 0.8 + 62,
                            itemExtent: ext,
                            count: _rediscover.length,
                            builder: (c, i) {
                              final t = _rediscover[i];
                              return _VinylCard(track: t, onTap: () => play(_rediscover, i));
                            },
                          ),
                        ],
                      )),

                    // 9. New releases: grouped rounded panels
                    if (fresh.isNotEmpty)
                      _sec('new', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: 'New releases',
                            overline: _effectivePrimaryLanguage.isNotEmpty
                                ? 'Fresh drops in ${_effectivePrimaryLanguage.toUpperCase()}'
                                : 'Just dropped',
                            onMore: () => _openSection(title: 'New releases', overline: 'Just dropped', entries: _trackEntries(fresh)),
                          ),
                          _PagedRows(
                            tracks: fresh,
                            rows: 3,
                            player: player,
                            album: true,
                            style: _RowStyle.grouped,
                            onPlay: (i) => play(fresh, i),
                          ),
                        ],
                      )),

                    // 10. Charts: #1 feature card + ranked pages
                    if (charts.isNotEmpty)
                      _sec('charts', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: 'Top Hits in ${country.name}',
                            overline: '${country.flag} Regional Charts',
                            onMore: () => _openSection(title: 'Top Hits in ${country.name}', overline: 'Regional Charts', entries: _trackEntries(charts)),
                          ),
                          _ChartHeroCard(
                            track: charts.first,
                            current: player.currentTrack?.id == charts.first.id,
                            playing: player.currentTrack?.id == charts.first.id && player.isPlaying,
                            onTap: () => play(charts, 0),
                          ),
                          if (charts.length > 1) ...[
                            const SizedBox(height: 10),
                            _PagedRows(
                              tracks: charts.sublist(1),
                              rows: 4,
                              player: player,
                              style: _RowStyle.ranked,
                              rankOffset: 1,
                              onPlay: (i) => play(charts, i + 1),
                            ),
                          ],
                        ],
                      )),

                    // 11. Top artists: big circles
                    if (_chartArtists.isNotEmpty)
                      _sec('artists', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: 'Top Artists for You',
                            overline: 'Trending in ${country.name}',
                            onMore: () => _openSection(
                              title: 'Top Artists for You',
                              overline: 'Trending in ${country.name}',
                              entries: [
                                for (final a in _chartArtists)
                                  _ListEntry(
                                    title: a.name,
                                    subtitle: 'Artist',
                                    cover: a.image,
                                    circular: true,
                                    closeOnTap: true,
                                    onTap: () => _open(ArtistScreen(artistName: a.name, imageUrl: a.image)),
                                  ),
                              ],
                            ),
                          ),
                          _Shelf(
                            height: cw + 58,
                            itemExtent: ext,
                            count: _chartArtists.length,
                            builder: (c, i) {
                              final a = _chartArtists[i];
                              return _CoverCard(
                                url: a.image,
                                title: a.name,
                                subtitle: a.subs,
                                circular: true,
                                onTap: () => _open(ArtistScreen(artistName: a.name, imageUrl: a.image)),
                              );
                            },
                          ),
                        ],
                      )),

                    // 12. Albums: staggered cards
                    if (albums.isNotEmpty)
                      _sec('albums', Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SecHeader(
                            title: 'Albums for you',
                            onMore: () => _openSection(
                              title: 'Albums for you',
                              entries: [
                                for (final t in albums)
                                  _ListEntry(
                                    title: MediaNormalizer.cleanTitle(t.album),
                                    subtitle: 'Album • ${MediaNormalizer.formatArtists(t.artist)}',
                                    cover: t.coverUrl,
                                    closeOnTap: true,
                                    onTap: () => _open(AlbumScreen(
                                      albumTitle: MediaNormalizer.cleanTitle(t.album),
                                      artistName: MediaNormalizer.formatArtists(t.artist),
                                      coverUrl: t.coverUrl,
                                    )),
                                  ),
                              ],
                            ),
                          ),
                          _Shelf(
                            height: cw + 62 + 26,
                            itemExtent: ext,
                            count: albums.length,
                            builder: (c, i) {
                              final t = albums[i];
                              return Padding(
                                padding: EdgeInsets.only(top: i.isOdd ? 26 : 0),
                                child: _CoverCard(
                                  url: t.coverUrl,
                                  title: t.album,
                                  subtitle: t.artist,
                                  artists: t.resolvedArtists,
                                  radius: 8,
                                  onTap: () => _open(AlbumScreen(
                                    albumTitle: MediaNormalizer.cleanTitle(t.album),
                                    artistName: MediaNormalizer.formatArtists(t.artist),
                                    coverUrl: t.coverUrl,
                                  )),
                                ),
                              );
                            },
                          ),
                        ],
                      )),

                    // 13. Browse categories: Apple Music style tiles
                    SliverToBoxAdapter(
                      child: Reveal(
                        key: ValueKey('$_seed-genres-h'),
                        child: const _SecHeader(title: 'Moods & genres', overline: 'Browse all'),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      sliver: SliverGrid(
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 14,
                          crossAxisSpacing: 14,
                          childAspectRatio: 1.62,
                        ),
                        delegate: SliverChildBuilderDelegate(
                          (c, i) => Reveal(
                            key: ValueKey('$_seed-g$i'),
                            delay: Duration(milliseconds: 40 * (i % 2) + 60 * (i ~/ 2)),
                            child: _GenreTile(
                              _genres[i],
                              imageUrl: genreArt(i),
                              tilt: i.isEven ? 0.24 : -0.2,
                              onTap: () {
                                HapticFeedback.selectionClick();
                                final genre = _genres[i].name;
                                final userLang = _effectivePrimaryLanguage;
                                final q = userLang.isNotEmpty ? '$userLang $genre hits' : '$genre hits';
                                InnerTubeService.instance.search(q).then((tracks) {
                                  if (tracks.isNotEmpty) play(tracks, 0);
                                });
                              },
                            ),
                          ),
                          childCount: _genres.length,
                        ),
                      ),
                    ),

                    // Clearance for floating mini player + persistent dock
                    SliverToBoxAdapter(
                      child: SizedBox(height: 180 + MediaQuery.paddingOf(context).bottom),
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
                    showProfile: true,
                  ),
                ),
              ],
            ),
    );
  }
}