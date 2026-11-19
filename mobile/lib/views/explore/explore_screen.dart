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
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/monogram_avatar.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../design_system/zen.dart';
import '../../models/playback_context.dart';
import '../../models/track.dart';
import '../../services/innertube_service.dart';
import '../../services/library_store.dart';
import '../../services/player_state.dart';
import '../../services/user_preferences_service.dart';
import '../../utils/media_normalizer.dart';
import '../details/album_screen.dart';
import '../details/artist_popup.dart';
import '../details/artist_screen.dart';
import 'explore_data_service.dart';

// ═════════════════════════════════════════════════════════════════════════════
// Physics primitives
// ═════════════════════════════════════════════════════════════════════════════

const _kPressSpring = SpringDescription(mass: 1, stiffness: 430, damping: 21);
const _kRevealSpring = SpringDescription(mass: 1, stiffness: 170, damping: 22);

/// Apple Music media-card corner radius.
const double _kCardR = 10;

const _kGray = ColorFilter.matrix(<double>[
  0.2126, 0.7152, 0.0722, 0, 0, //
  0.2126, 0.7152, 0.0722, 0, 0,
  0.2126, 0.7152, 0.0722, 0, 0,
  0, 0, 0, 1, 0,
]);

typedef _Tile = ({
  String title,
  String query,
  IconData icon,
  List<Color> colors,
});

/// Horizontal shelf physics: flings settle on a card with a real spring.
class _SnapPhysics extends ScrollPhysics {
  const _SnapPhysics({super.parent, required this.itemExtent});
  final double itemExtent;

  @override
  _SnapPhysics applyTo(ScrollPhysics? ancestor) =>
      _SnapPhysics(parent: buildParent(ancestor), itemExtent: itemExtent);

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

/// Softer page snapping (slower, floaty settle) for the hero + paged rows.
class _SoftPagePhysics extends PageScrollPhysics {
  const _SoftPagePhysics({super.parent});

  @override
  _SoftPagePhysics applyTo(ScrollPhysics? ancestor) =>
      _SoftPagePhysics(parent: buildParent(ancestor));

  @override
  SpringDescription get spring =>
      SpringDescription.withDampingRatio(mass: 0.5, stiffness: 100, ratio: 0.9);
}

/// Press feedback with a real spring.
class _Press extends StatefulWidget {
  const _Press({required this.child, this.onTap, this.scale = 0.96});
  final Widget child;
  final VoidCallback? onTap;
  final double scale;

  @override
  State<_Press> createState() => _PressState();
}

class _PressState extends State<_Press> with SingleTickerProviderStateMixin {
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

/// Spring entrance (fade + rise); slivers build lazily so each section
/// animates in the moment it scrolls into view.
class _Reveal extends StatefulWidget {
  const _Reveal({super.key, required this.child});
  final Widget child;

  @override
  State<_Reveal> createState() => _RevealState();
}

class _RevealState extends State<_Reveal> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController.unbounded(
    vsync: this,
    value: 0,
  );

  @override
  void initState() {
    super.initState();
    _c.animateWith(SpringSimulation(_kRevealSpring, 0, 1, 0));
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

// ═════════════════════════════════════════════════════════════════════════════
// Small shared widgets
// ═════════════════════════════════════════════════════════════════════════════

TextStyle _display({
  double size = 20,
  FontWeight weight = FontWeight.w700,
  Color color = Colors.white,
  double spacing = -0.3,
  double? height,
}) => TextStyle(
  fontFamily: 'SF Pro Display',
  fontSize: size,
  fontWeight: weight,
  color: color,
  letterSpacing: spacing,
  height: height,
);

TextStyle _body({
  double size = 14,
  FontWeight weight = FontWeight.w500,
  Color color = AppColors.textSecondary,
  double? height,
}) => TextStyle(
  fontFamily: 'SF Pro',
  fontSize: size,
  fontWeight: weight,
  color: color,
  letterSpacing: -0.1,
  height: height,
);

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
    final img = CachedNetworkImage(
      imageUrl: MediaNormalizer.upgradeArtworkUrl(
        url,
        isArtistAvatar: circular,
      ),
      fit: BoxFit.cover,
      memCacheWidth: cacheWidth,
      fadeInDuration: const Duration(milliseconds: 220),
      placeholder: (context, u) => Container(color: AppColors.surface2),
      errorWidget: (context, u, e) => Container(
        color: AppColors.surface2,
        child: Icon(
          circular ? CupertinoIcons.person_fill : Icons.music_note_rounded,
          color: AppColors.textTertiary,
        ),
      ),
    );
    if (circular) return ClipOval(child: img);
    if (radius <= 0) return img;
    return ClipRRect(borderRadius: BorderRadius.circular(radius), child: img);
  }
}

class _EqBars extends StatefulWidget {
  const _EqBars({super.key, required this.playing, this.height = 16});
  final bool playing;
  final double height;

  @override
  State<_EqBars> createState() => _EqBarsState();
}

class _EqBarsState extends State<_EqBars> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

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
              ? 0.3 +
                    0.7 *
                        (0.5 +
                            0.5 *
                                math.sin(
                                  _c.value * 2 * math.pi * (1 + i * 0.35) +
                                      i * 1.3,
                                ))
              : 0.28;
          return Container(
            width: 3,
            height: widget.height * v,
            margin: const EdgeInsets.only(right: 2),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(1.5),
            ),
          );
        }),
      ),
    );
  }
}

/// Frosted round button (Apple Music artwork overlay).
class _GlassPlay extends StatelessWidget {
  const _GlassPlay({required this.playing, this.size = 42});
  final bool playing;
  final double size;

  @override
  Widget build(BuildContext context) {
    return ClipOval(
      child: BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          width: size,
          height: size,
          alignment: Alignment.center,
          color: Colors.white.withValues(alpha: 0.24),
          child: AnimatedSwitcher(
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
                    color: Colors.white,
                    size: size * 0.62,
                  ),
          ),
        ),
      ),
    );
  }
}

class _CircleBtn extends StatelessWidget {
  const _CircleBtn({
    required this.icon,
    required this.onTap,
    this.solid = false,
  });
  final IconData icon;
  final VoidCallback onTap;
  final bool solid;

  @override
  Widget build(BuildContext context) {
    return _Press(
      scale: 0.88,
      onTap: onTap,
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: solid ? Colors.white : Colors.white.withValues(alpha: 0.11),
        ),
        child: Icon(icon, size: 16, color: solid ? Colors.black : Colors.white),
      ),
    );
  }
}

/// Section title with Apple's trailing chevron + optional trailing widget.
class _SecHeader extends StatelessWidget {
  const _SecHeader({
    required this.title,
    this.overline,
    this.onMore,
    this.trailing,
  });
  final String title;
  final String? overline;
  final VoidCallback? onMore;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 34, 20, 14),
      child: Row(
        children: [
          Expanded(
            child: _Press(
              scale: 0.985,
              onTap: onMore,
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
                          style: _display(
                            size: 24,
                            weight: FontWeight.w800,
                            spacing: -0.7,
                          ),
                        ),
                      ),
                      if (onMore != null) ...[
                        const SizedBox(width: 2),
                        const Icon(
                          Icons.chevron_right_rounded,
                          color: AppColors.textTertiary,
                          size: 26,
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ),
          ?trailing,
        ],
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
        physics: _SnapPhysics(
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

// ═════════════════════════════════════════════════════════════════════════════
// HERO - "Spotlight Coverflow"
//   * 3D coverflow carousel (perspective + rotateY + scale, spring snapping)
//   * ambient blurred backdrop that cross-fades continuously with the swipe
//   * info block that springs up / fades on every card change
//   * stretchy page dots + pulsing live indicator
// ═════════════════════════════════════════════════════════════════════════════

class _PulseDot extends StatefulWidget {
  const _PulseDot();

  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1700),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 18,
      height: 18,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, child) {
          final v = Curves.easeOut.transform(_c.value);
          return Stack(
            alignment: Alignment.center,
            children: [
              Opacity(
                opacity: (1 - v) * 0.6,
                child: Container(
                  width: 7 + 11 * v,
                  height: 7 + 11 * v,
                  decoration: const BoxDecoration(
                    color: AppColors.accent,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
              child!,
            ],
          );
        },
        child: Container(
          width: 7,
          height: 7,
          decoration: const BoxDecoration(
            color: AppColors.accent,
            shape: BoxShape.circle,
          ),
        ),
      ),
    );
  }
}

class _LiveChip extends StatelessWidget {
  const _LiveChip({
    required this.week,
    required this.country,
    required this.onTap,
  });
  final String week, country;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _Press(
      scale: 0.96,
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: BackdropFilter(
          filter: ui.ImageFilter.blur(sigmaX: 14, sigmaY: 14),
          child: Container(
            padding: const EdgeInsets.fromLTRB(10, 6, 12, 6),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.12),
                width: 0.6,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const _PulseDot(),
                const SizedBox(width: 6),
                Text(
                  'LIVE CHARTS • WEEK $week IN ${country.toUpperCase()}',
                  style: _body(
                    size: 11,
                    weight: FontWeight.w700,
                    color: Colors.white,
                  ).copyWith(letterSpacing: 0.7),
                ),
                const SizedBox(width: 6),
                const Icon(
                  CupertinoIcons.chevron_down,
                  size: 11,
                  color: Colors.white70,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Blurred artwork that fades continuously between neighbours as you swipe.
class _HeroBackdrop extends StatelessWidget {
  const _HeroBackdrop({required this.page, required this.urls});
  final PageController page;
  final List<String> urls;

  @override
  Widget build(BuildContext context) {
    // Built once per parent rebuild; only the opacities change per frame, so
    // the expensive blurred layers are cached by their RepaintBoundaries.
    final layers = <Widget>[
      for (final u in urls)
        RepaintBoundary(
          child: ImageFiltered(
            imageFilter: ui.ImageFilter.blur(sigmaX: 46, sigmaY: 46),
            child: Transform.scale(
              scale: 1.7,
              child: _Img(u, radius: 0, cacheWidth: 120),
            ),
          ),
        ),
    ];

    return Stack(
      fit: StackFit.expand,
      children: [
        AnimatedBuilder(
          animation: page,
          builder: (context, _) {
            double p = 0;
            if (page.hasClients && page.position.haveDimensions) {
              p = page.page ?? 0;
            }
            return Stack(
              fit: StackFit.expand,
              children: [
                for (var i = 0; i < layers.length; i++)
                  if (1 - (p - i).abs() > 0.01)
                    KeyedSubtree(
                      key: ValueKey(i),
                      child: Opacity(
                        opacity: (1 - (p - i).abs()).clamp(0.0, 1.0) * 0.62,
                        child: layers[i],
                      ),
                    ),
              ],
            );
          },
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.black.withValues(alpha: 0.35),
                Colors.transparent,
                Zen.bg,
              ],
              stops: const [0, 0.3, 1],
            ),
          ),
        ),
      ],
    );
  }
}

class _HeroArt extends StatelessWidget {
  const _HeroArt({
    required this.url,
    required this.parallax,
    required this.playOpacity,
    required this.playing,
  });
  final String url;
  final double parallax, playOpacity;
  final bool playing;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.5),
            blurRadius: 26,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Transform.translate(
              offset: Offset(-parallax * 22, 0),
              child: Transform.scale(
                scale: 1.12,
                child: _Img(url, radius: 0, cacheWidth: 900),
              ),
            ),
            // subtle glossy sheen that slides with the swipe
            IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment(-1 - parallax * 1.4, -1),
                    end: Alignment(1 - parallax * 1.4, 1),
                    colors: [
                      Colors.white.withValues(alpha: 0.0),
                      Colors.white.withValues(alpha: 0.10),
                      Colors.white.withValues(alpha: 0.0),
                    ],
                    stops: const [0.3, 0.5, 0.7],
                  ),
                ),
              ),
            ),
            Positioned(
              right: 12,
              bottom: 12,
              child: Opacity(
                opacity: playOpacity.clamp(0.0, 1.0),
                child: _GlassPlay(playing: playing, size: 42),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Hero extends StatefulWidget {
  const _Hero({
    required this.tracks,
    required this.countryName,
    required this.week,
    required this.bleedTop,
    required this.isActive,
    required this.playing,
    required this.onPlay,
    required this.onPickCountry,
  });
  final List<Track> tracks;
  final String countryName, week;
  final double bleedTop;
  final bool Function(Track) isActive;
  final bool playing;
  final void Function(int index) onPlay;
  final VoidCallback onPickCountry;

  @override
  State<_Hero> createState() => _HeroState();
}

class _HeroState extends State<_Hero> {
  final _pc = PageController(viewportFraction: 0.6);
  int _cur = 0;

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  void _tap(int i) {
    if (i == _cur) {
      widget.onPlay(i);
    } else {
      HapticFeedback.selectionClick();
      _pc.animateToPage(
        i,
        duration: const Duration(milliseconds: 700),
        curve: Curves.easeOutQuart,
      );
    }
  }

  Widget _info(Track t, int i) {
    final isPreferred = UserPreferencesService
        .instance
        .currentPrefs
        .favoriteArtists
        .any((a) => t.artist.toLowerCase().contains(a.name.toLowerCase()));
    final eyebrow = isPreferred
        ? 'Recommended For You'
        : 'No. ${i + 1} in ${widget.countryName}';
    final active = widget.isActive(t);
    final playing = active && widget.playing;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            eyebrow.toUpperCase(),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _body(
              size: 11.5,
              weight: FontWeight.w700,
              color: AppColors.accent,
            ).copyWith(letterSpacing: 0.8),
          ),
          const SizedBox(height: 6),
          Text(
            MediaNormalizer.cleanCompactTitle(t.title),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: _display(size: 25, weight: FontWeight.w800, spacing: -0.7),
          ),
          const SizedBox(height: 2),
          Text(
            MediaNormalizer.formatArtists(t.artist),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: _body(size: 16),
          ),
          const SizedBox(height: 14),
          _Press(
            scale: 0.93,
            onTap: () {
              HapticFeedback.mediumImpact();
              widget.onPlay(i);
            },
            child: Container(
              height: 38,
              padding: const EdgeInsets.symmetric(horizontal: 22),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(19),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  playing
                      ? const _EqBarsDark()
                      : const Icon(
                          Icons.play_arrow_rounded,
                          color: Colors.black,
                          size: 22,
                        ),
                  const SizedBox(width: 6),
                  Text(
                    playing ? 'Playing' : 'Play',
                    style: _body(
                      size: 14.5,
                      weight: FontWeight.w700,
                      color: Colors.black,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.tracks;
    final n = items.length;
    final w = MediaQuery.sizeOf(context).width;
    final art = w * 0.56;
    final cur = _cur.clamp(0, n - 1);
    final dotCount = math.min(n, 10);

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Positioned(
          top: -widget.bleedTop,
          left: 0,
          right: 0,
          bottom: 0,
          child: _HeroBackdrop(
            page: _pc,
            urls: [for (final t in items) t.coverUrl],
          ),
        ),
        Column(
          children: [
            const SizedBox(height: 10),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Align(
                alignment: Alignment.centerLeft,
                child: _LiveChip(
                  week: widget.week,
                  country: widget.countryName,
                  onTap: widget.onPickCountry,
                ),
              ),
            ),
            const SizedBox(height: 22),
            SizedBox(
              height: art + 34,
              child: PageView.builder(
                controller: _pc,
                clipBehavior: Clip.none,
                physics: const _SoftPagePhysics(
                  parent: BouncingScrollPhysics(),
                ),
                itemCount: n,
                onPageChanged: (i) {
                  HapticFeedback.selectionClick();
                  setState(() => _cur = i);
                },
                itemBuilder: (context, i) {
                  return AnimatedBuilder(
                    animation: _pc,
                    builder: (context, _) {
                      double page = _cur.toDouble();
                      if (_pc.hasClients && _pc.position.haveDimensions) {
                        page = _pc.page ?? page;
                      }
                      final d = (i - page).clamp(-2.0, 2.0).toDouble();
                      final k = d.abs().clamp(0.0, 1.0).toDouble();
                      final m = Matrix4.identity()
                        ..setEntry(3, 2, 0.0014)
                        ..translateByDouble(-d.clamp(-1.0, 1.0) * art * 0.05, k * 10, 0.0, 1.0)
                        ..rotateY(-d.clamp(-1.0, 1.0) * 0.62)
                        ..scaleByDouble(1 - 0.16 * k, 1 - 0.16 * k, 1.0, 1.0);
                      final t = items[i];
                      final active = widget.isActive(t);
                      return Center(
                        child: Opacity(
                          opacity: (1 - 0.45 * k).clamp(0.0, 1.0),
                          child: Transform(
                            alignment: Alignment.center,
                            transform: m,
                            child: SizedBox(
                              width: art,
                              height: art,
                              child: _Press(
                                scale: 0.97,
                                onTap: () => _tap(i),
                                child: _HeroArt(
                                  url: t.coverUrl,
                                  parallax: d,
                                  playOpacity: 1 - k * 1.6,
                                  playing: active && widget.playing,
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
            const SizedBox(height: 14),
            SizedBox(
              height: 128,
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 520),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                transitionBuilder: (child, anim) => FadeTransition(
                  opacity: anim,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0, 0.22),
                      end: Offset.zero,
                    ).animate(anim),
                    child: child,
                  ),
                ),
                child: KeyedSubtree(
                  key: ValueKey(cur),
                  child: _info(items[cur], cur),
                ),
              ),
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < dotCount; i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 520),
                    curve: Curves.easeOutBack,
                    width: i == math.min(cur, dotCount - 1) ? 20 : 6,
                    height: 6,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(
                        alpha: i == math.min(cur, dotCount - 1) ? 0.95 : 0.28,
                      ),
                      borderRadius: BorderRadius.circular(3),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 6),
          ],
        ),
      ],
    );
  }
}

/// Dark equalizer used inside the white Play pill.
class _EqBarsDark extends StatefulWidget {
  const _EqBarsDark();

  @override
  State<_EqBarsDark> createState() => _EqBarsDarkState();
}

class _EqBarsDarkState extends State<_EqBarsDark>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 20,
      height: 20,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) => Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: List.generate(4, (i) {
            final v =
                0.3 +
                0.7 *
                    (0.5 +
                        0.5 *
                            math.sin(
                              _c.value * 2 * math.pi * (1 + i * 0.35) + i * 1.3,
                            ));
            return Container(
              width: 3,
              height: 16 * v,
              margin: const EdgeInsets.only(right: 1.5),
              decoration: BoxDecoration(
                color: Colors.black,
                borderRadius: BorderRadius.circular(1.5),
              ),
            );
          }),
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Pills (Apple filter pills)
// ═════════════════════════════════════════════════════════════════════════════

class _Pills extends StatelessWidget {
  const _Pills({required this.tiles, required this.onTap});
  final List<_Tile> tiles;
  final void Function(_Tile) onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 54,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
        itemCount: tiles.length,
        separatorBuilder: (context, i) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final t = tiles[i];
          return _Press(
            scale: 0.93,
            onTap: () => onTap(t),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.surface2,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(t.icon, size: 15, color: t.colors.first),
                  const SizedBox(width: 7),
                  Text(
                    t.title,
                    style: _body(
                      size: 14,
                      weight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Cards (same family as the Home screen)
// ═════════════════════════════════════════════════════════════════════════════

/// Art + title + subtitle (staggered album shelf).
class _CoverCard extends StatelessWidget {
  const _CoverCard({
    required this.url,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final String url, title, subtitle;
  final VoidCallback onTap;
  static const double radius = 8;

  @override
  Widget build(BuildContext context) {
    return _Press(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(radius),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.32),
                    blurRadius: 14,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: _Img(url, radius: radius),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _display(size: 15, weight: FontWeight.w600, spacing: -0.2),
          ),
          const SizedBox(height: 2),
          Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _body(size: 13.5),
          ),
        ],
      ),
    );
  }
}

/// Large Apple "New Music" card: art, accent overline, title, artist.
class _FeatureCard extends StatelessWidget {
  const _FeatureCard({
    required this.url,
    required this.tag,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final String url, tag, title, subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _Press(
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
              child: _Img(url, radius: _kCardR, cacheWidth: 720),
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
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _display(size: 17, spacing: -0.4),
          ),
          const SizedBox(height: 1),
          Text(
            subtitle,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: _body(size: 14),
          ),
        ],
      ),
    );
  }
}

/// Artwork card with a frosted caption bar.
class _FrostCard extends StatelessWidget {
  const _FrostCard({
    required this.url,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final String url, title, subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return _Press(
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
              _Img(url, radius: 0, cacheWidth: 640),
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
                                  title,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: _display(
                                    size: 14.5,
                                    weight: FontWeight.w600,
                                    spacing: -0.2,
                                  ),
                                ),
                                const SizedBox(height: 1),
                                Text(
                                  subtitle,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: _body(
                                    size: 12.5,
                                    color: Colors.white.withValues(alpha: 0.7),
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
                            child: const Icon(
                              CupertinoIcons.chevron_forward,
                              color: Colors.white,
                              size: 14,
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

/// Circular artist with a spring Follow pill.
class _ArtistCard extends StatelessWidget {
  const _ArtistCard({
    required this.name,
    required this.subs,
    required this.photo,
    required this.store,
    required this.onTap,
  });
  final String name, subs, photo;
  final LibraryStore store;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _Press(
          scale: 0.94,
          onTap: onTap,
          child: AspectRatio(
            aspectRatio: 1,
            child: DecoratedBox(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.38),
                    blurRadius: 12,
                    offset: const Offset(0, 5),
                  ),
                ],
              ),
              child: photo.isNotEmpty
                  ? _Img(photo, circular: true, cacheWidth: 320)
                  : MonogramAvatar(name: name, size: 100),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: _display(size: 14, weight: FontWeight.w600, spacing: -0.2),
        ),
        const SizedBox(height: 1),
        Text(
          subs,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
          style: _body(size: 12, color: AppColors.textTertiary),
        ),
        const SizedBox(height: 8),
        AnimatedBuilder(
          animation: store,
          builder: (context, _) {
            final followed = store.isFollowing(name);
            return _Press(
              scale: 0.92,
              onTap: () {
                HapticFeedback.selectionClick();
                store.toggleFollow(name, photo);
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 320),
                curve: Curves.easeOutBack,
                height: 28,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: followed
                      ? Colors.white.withValues(alpha: 0.12)
                      : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (followed) ...[
                      const Icon(
                        CupertinoIcons.checkmark_alt,
                        size: 12,
                        color: Colors.white,
                      ),
                      const SizedBox(width: 4),
                    ],
                    Text(
                      followed ? 'Following' : 'Follow',
                      style: _body(
                        size: 12,
                        weight: FontWeight.w700,
                        color: followed ? Colors.white : Colors.black,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

/// #1 chart feature card.
class _ChartHeroCard extends StatelessWidget {
  const _ChartHeroCard({
    required this.track,
    required this.country,
    required this.onTap,
    required this.playing,
    required this.current,
  });
  final Track track;
  final String country;
  final VoidCallback onTap;
  final bool playing, current;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
      child: _Press(
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
                          child: Text(
                            '#1 IN ${country.toUpperCase()}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
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
                          style: _display(
                            size: 21,
                            weight: FontWeight.w800,
                            spacing: -0.6,
                            color: current ? AppColors.accent : Colors.white,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          MediaNormalizer.formatArtists(track.artist),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: _body(
                            size: 14,
                            color: Colors.white.withValues(alpha: 0.72),
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
    required this.rank,
    required this.current,
    required this.playing,
    required this.onTap,
    required this.onMore,
    this.divider = true,
  });
  final Track track;
  final int rank;
  final bool current, playing, divider;
  final VoidCallback onTap, onMore;

  @override
  Widget build(BuildContext context) {
    return _Press(
      scale: 0.975,
      onTap: onTap,
      child: SizedBox(
        height: 64,
        child: Stack(
          children: [
            Row(
              children: [
                SizedBox(
                  width: 32,
                  child: Text(
                    '$rank',
                    style: _display(
                      size: 18,
                      color: rank <= 3
                          ? AppColors.accent
                          : AppColors.textSecondary,
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
                        style: _display(
                          size: 16,
                          weight: FontWeight.w500,
                          spacing: -0.2,
                          color: current ? AppColors.accent : Colors.white,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        MediaNormalizer.formatArtists(track.artist),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: _body(size: 14),
                      ),
                    ],
                  ),
                ),
                _Press(
                  scale: 0.88,
                  onTap: onMore,
                  child: const Padding(
                    padding: EdgeInsets.all(8),
                    child: Icon(
                      Icons.more_horiz_rounded,
                      color: AppColors.textTertiary,
                      size: 22,
                    ),
                  ),
                ),
              ],
            ),
            if (divider)
              Positioned(
                left: 92,
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

/// Swipeable pages of ranked rows.
class _PagedRows extends StatefulWidget {
  const _PagedRows({
    required this.tracks,
    required this.rankOffset,
    required this.isActive,
    required this.playing,
    required this.onPlay,
    required this.onMore,
  });
  final List<Track> tracks;
  final int rankOffset;
  final bool Function(Track) isActive;
  final bool playing;
  final void Function(int index) onPlay;
  final void Function(Track) onMore;

  @override
  State<_PagedRows> createState() => _PagedRowsState();
}

class _PagedRowsState extends State<_PagedRows> {
  static const rows = 4;
  final _pc = PageController(viewportFraction: 0.9);

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tracks = widget.tracks;
    final pages = (tracks.length / rows).ceil();

    return SizedBox(
      height: rows * 64.0,
      child: PageView.builder(
        controller: _pc,
        padEnds: false,
        physics: const _SoftPagePhysics(parent: BouncingScrollPhysics()),
        itemCount: pages,
        itemBuilder: (_, p) {
          return RepaintBoundary(
            child: Padding(
              padding: EdgeInsets.only(left: p == 0 ? 20 : 8, right: 8),
              child: Column(
                children: List.generate(rows, (r) {
                  final i = p * rows + r;
                  if (i >= tracks.length) return const SizedBox(height: 64);
                  final t = tracks[i];
                  final cur = widget.isActive(t);
                  return _SongRow(
                    track: t,
                    rank: i + 1 + widget.rankOffset,
                    current: cur,
                    playing: cur && widget.playing,
                    divider: r < rows - 1,
                    onTap: () => widget.onPlay(i),
                    onMore: () => widget.onMore(t),
                  );
                }),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Genre / mood marquee (auto-drifting rows)
// ═════════════════════════════════════════════════════════════════════════════

class _TintedArt extends StatelessWidget {
  const _TintedArt({
    required this.url,
    required this.color,
    required this.size,
  });
  final String url;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 12,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
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

class _GenreTile extends StatelessWidget {
  const _GenreTile({
    required this.tile,
    required this.onTap,
    this.imageUrl,
    this.tilt = 0.24,
  });
  final _Tile tile;
  final VoidCallback onTap;
  final String? imageUrl;
  final double tilt;

  @override
  Widget build(BuildContext context) {
    final c = tile.colors;
    final base = c.isNotEmpty ? c.first : AppColors.accent;
    final end = c.length > 1 ? c.last : Color.lerp(base, Colors.black, 0.35)!;
    return _Press(
      onTap: onTap,
      scale: 0.95,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [base, end],
            ),
          ),
          child: Stack(
            fit: StackFit.expand,
            children: [
              Positioned(
                right: -16,
                top: -14,
                child: Icon(
                  tile.icon,
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
                      ? _TintedArt(url: imageUrl!, color: base, size: 92)
                      : Icon(
                          tile.icon,
                          size: 80,
                          color: Colors.white.withValues(alpha: 0.3),
                        ),
                ),
              ),
              Positioned(
                left: 14,
                bottom: 12,
                right: 60,
                child: Text(
                  tile.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: _display(
                    size: 19,
                    weight: FontWeight.w800,
                    spacing: -0.4,
                  ),
                ),
              ),
              Positioned(
                left: 14,
                top: 12,
                child: Icon(
                  tile.icon,
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

class _MarqueeRow extends StatefulWidget {
  const _MarqueeRow({
    required this.tiles,
    required this.artFor,
    required this.onTap,
    this.reverse = false,
    this.speed = 24,
    this.startOffset = 0,
  });
  final List<_Tile> tiles;
  final String? Function(int index) artFor;
  final void Function(_Tile t) onTap;
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

  void _tick(Duration t) {
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
          final gi = i % widget.tiles.length;
          final t = widget.tiles[gi];
          return Padding(
            padding: const EdgeInsets.only(right: 12, bottom: 8),
            child: _GenreTile(
              tile: t,
              imageUrl: widget.artFor(gi),
              tilt: gi.isEven ? 0.24 : -0.2,
              onTap: () => widget.onTap(t),
            ),
          );
        },
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// "See all" sheet (above everything via the root navigator)
// ═════════════════════════════════════════════════════════════════════════════

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
    required this.onMenu,
    this.overline,
  });
  final String title;
  final String? overline;
  final List<_ListEntry> entries;
  final PlayerState player;
  final void Function(BuildContext ctx, Track t) onMenu;

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
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onVerticalDragStart: (_) => _back.stop(),
                    onVerticalDragUpdate: (d) =>
                        _dy.value = math.max(0, _dy.value + d.delta.dy),
                    onVerticalDragEnd: (d) {
                      if (_dy.value > 140 || (d.primaryVelocity ?? 0) > 800) {
                        Navigator.of(context).pop();
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
                                      style: _display(
                                        size: 24,
                                        weight: FontWeight.w800,
                                        spacing: -0.7,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              _Press(
                                scale: 0.9,
                                onTap: () => Navigator.of(context).pop(),
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
                                  : () => widget.onMenu(context, e.track!),
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
    return _Press(
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
                        style: _body(size: 13.5),
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

// ═════════════════════════════════════════════════════════════════════════════
// ExploreScreen
// ═════════════════════════════════════════════════════════════════════════════

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({
    super.key,
    this.onOpenTogether,
    this.onOpenBlend,
    this.onOpenProfile,
    this.onOpenCategory,
  });

  final VoidCallback? onOpenTogether;
  final VoidCallback? onOpenBlend;
  final VoidCallback? onOpenProfile;
  final ValueChanged<String>? onOpenCategory;

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  final ExploreDataService _dataService = ExploreDataService.instance;
  late ExploreCountry _country;

  ExplorePageData? _pageData;
  bool _isLoading = true;
  int _refresh = 0;

  final ScrollController _exploreScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _country = _dataService.currentCountry;
    _dataService.initCountry().then((_) {
      if (mounted) {
        setState(() => _country = _dataService.currentCountry);
        _loadData();
      }
    });
    _loadData();
    CatalogDataSource.tracksNotifier.addListener(_onCatalogUpdated);
  }

  void _onCatalogUpdated() {
    if (mounted &&
        (_pageData == null || _pageData!.weeklyTopSongs.isEmpty) &&
        !_isLoading) {
      _loadData();
    }
  }

  @override
  void dispose() {
    _exploreScrollController.dispose();
    CatalogDataSource.tracksNotifier.removeListener(_onCatalogUpdated);
    super.dispose();
  }

  Future<void> _loadData({bool force = false}) async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final data = await _dataService.getExploreDataForCountry(
        _country,
        forceRefresh: force,
      );
      if (mounted) {
        setState(() {
          _pageData = data;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _pickCountry() async {
    HapticFeedback.selectionClick();
    await ZenDropdown.show<void>(
      context: context,
      title: 'Explore Music Region',
      subtitle:
          'Select a country to discover live weekly charts, top artists, and fresh releases.',
      items: [
        for (final c in kExploreCountries)
          ZenDropdownItem(
            title: '${c.flag}  ${c.name} (${c.code})',
            icon: CupertinoIcons.globe,
            isSelected: c.code == _country.code,
            onTap: () {
              if (c.code != _country.code) {
                setState(() => _country = c);
                _dataService.setCountry(c);
                _loadData(force: false);
              }
            },
          ),
      ],
    );
  }

  // ── Playback / navigation ──────────────────────────────────────────────────

  void _play(List<Track> list, int index, {String title = 'Weekly Top'}) {
    if (list.isEmpty) return;
    final startIdx = index.clamp(0, list.length - 1);
    final ctx = PlaybackContext(
      type: PlaybackContextType.homeSection,
      id: 'explore_trending_${_country.code}',
      tracks: list,
      startTrack: list[startIdx],
      title: title,
    );
    context.read<PlayerState>().setQueue(
      list,
      startIndex: startIdx,
      context: ctx,
    );
  }

  void _shuffle(List<Track> list) {
    if (list.isEmpty) return;
    final ctx = PlaybackContext(
      type: PlaybackContextType.homeSection,
      id: 'explore_trending_${_country.code}',
      tracks: list,
      startTrack: list.first,
      title: 'Weekly Top • ${_country.name}',
    );
    context.read<PlayerState>().setQueue(
      list,
      startIndex: 0,
      shuffle: true,
      context: ctx,
    );
  }

  void _openCategory(String query, String title) {
    HapticFeedback.lightImpact();
    if (widget.onOpenCategory != null) {
      widget.onOpenCategory!(query);
      return;
    }
    InnerTubeService.instance.search(query).then((tracks) {
      if (!mounted || tracks.isEmpty) return;
      Navigator.push(
        context,
        ZenPageRoute(
          builder: (_) => AlbumScreen(
            albumTitle: title,
            artistName: 'Curated by Zenify',
            coverUrl: tracks.first.coverUrl,
            initialTracks: tracks,
          ),
        ),
      );
    });
  }

  void _openAlbum(
    String title,
    String artist,
    String cover, {
    String? browseId,
    List<Track>? initialTracks,
  }) {
    HapticFeedback.lightImpact();
    Navigator.push(
      context,
      ZenPageRoute(
        builder: (_) => AlbumScreen(
          albumTitle: title,
          artistName: artist,
          coverUrl: cover,
          browseId: browseId,
          initialTracks: initialTracks,
        ),
      ),
    );
  }

  void _openArtist(ExploreArtistItem a) {
    HapticFeedback.lightImpact();
    Navigator.push(
      context,
      ZenPageRoute(
        builder: (_) => ArtistScreen(
          artistName: a.name,
          imageUrl: a.photo,
          browseId: a.browseId,
        ),
      ),
    );
  }

  void _showTrackMenu(Track track, {BuildContext? ctx}) {
    HapticFeedback.mediumImpact();
    final c = ctx ?? context;
    final player = context.read<PlayerState>();
    final artists = track.resolvedArtists;
    ZenDropdown.showTrackMenu(
      context: c,
      track: track,
      trackTitle: track.title,
      artistName: track.artist,
      albumName: track.album,
      coverUrl: track.coverUrl,
      onPlayNext: () => player.playNext(track),
      onPlayLater: () => player.playLast(track),
      onGoToArtist: () {
        if (artists.length > 1) {
          showArtistPopup(c, artists: artists);
        } else if (artists.isNotEmpty) {
          Navigator.push(
            c,
            ZenPageRoute(
              builder: (_) => ArtistScreen(
                artistName: artists.first.name,
                browseId: artists.first.id,
              ),
            ),
          );
        }
      },
      onGoToAlbum: track.album.isNotEmpty
          ? () => _openAlbum(
              track.album,
              track.artist,
              track.coverUrl,
              browseId: track.albumBrowseId,
            )
          : null,
    );
  }

  bool _isActive(Track t, String? activeId) {
    if (activeId == null || activeId.isEmpty) return false;
    return activeId == t.id ||
        activeId == 'yt-${t.id}' ||
        t.id == 'yt-$activeId';
  }

  List<_ListEntry> _trackEntries(List<Track> list, String title) => [
    for (var i = 0; i < list.length; i++)
      _ListEntry(
        title: MediaNormalizer.cleanCompactTitle(list[i].title),
        subtitle: 'Song • ${MediaNormalizer.formatArtists(list[i].artist)}',
        cover: list[i].coverUrl,
        track: list[i],
        onTap: () => _play(list, i, title: title),
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
        onMenu: (c, t) => _showTrackMenu(t, ctx: c),
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

  Widget _sec(String key, Widget child) => SliverToBoxAdapter(
    child: _Reveal(key: ValueKey('$_refresh-$key'), child: child),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Build
  // ═══════════════════════════════════════════════════════════════════════════

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final topInset = MediaQuery.paddingOf(context).top;
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    final w = MediaQuery.sizeOf(context).width;

    // Rebuild only when the track / play state changes (not every position tick).
    final activeId = context.select<PlayerState, String?>(
      (p) => p.currentTrack?.id,
    );
    final playing = context.select<PlayerState, bool>((p) => p.isPlaying);
    bool isActive(Track t) => _isActive(t, activeId);

    final data = _pageData;
    final List<Widget> slivers = [
      SliverToBoxAdapter(child: SizedBox(height: topInset + 56)),
      CupertinoSliverRefreshControl(
        onRefresh: () async {
          await _loadData(force: true);
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
    ];

    if (data == null && _isLoading) {
      slivers.add(const SliverToBoxAdapter(child: _ExploreSkeleton()));
    } else if (data == null || data.weeklyTopSongs.isEmpty) {
      slivers.add(SliverToBoxAdapter(child: _buildEmpty()));
    } else {
      slivers.addAll(_buildSections(data, w, topInset, isActive, playing));
    }
    slivers.add(SliverToBoxAdapter(child: SizedBox(height: 180 + bottomInset)));

    return Scaffold(
      backgroundColor: Zen.bg,
      body: Stack(
        children: [
          CustomScrollView(
            controller: _exploreScrollController,
            key: const PageStorageKey<String>('explore_scroll_view'),
            physics: const BouncingScrollPhysics(
              parent: AlwaysScrollableScrollPhysics(),
            ),
            // ignore: deprecated_member_use
            cacheExtent: 900,
            slivers: slivers,
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandHeader(
              title: 'Explore',
              subtitle: '${_country.flag} ${_country.name} • Weekly Top',
              showBack: false,
              isDockPage: true,
              scrollController: _exploreScrollController,
              onCenterTap: _pickCountry,
              showProfile: true,
              onProfileTap: widget.onOpenProfile,
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildSections(
    ExplorePageData data,
    double w,
    double topInset,
    bool Function(Track) isActive,
    bool playing,
  ) {
    final country = _country.name;

    // Geometry (same family as Home)
    final ext = (w - 20) / 2.35;
    final cw = ext - 14;
    final frostExt = w * 0.64;
    final frostSize = frostExt - 14;
    final featExt = w * 0.72;
    final featSize = featExt - 14;
    final artistExt = (w - 20) / 3.3;
    final artistSize = artistExt - 14;

    final top = data.weeklyTopSongs.take(20).toList();
    final heroTracks = data.featured.isNotEmpty
        ? data.featured.take(10).toList()
        : top.take(8).toList();

    // Albums from real data
    final albumMap = <String, Track>{};
    for (final t in [...data.featured, ...top]) {
      final alb = MediaNormalizer.cleanTitle(t.album);
      if (alb.isNotEmpty &&
          alb.toLowerCase() != 'single' &&
          !MediaNormalizer.isMetadataNoise(alb)) {
        albumMap.putIfAbsent(alb, () => t);
      }
    }
    final albums = albumMap.values.take(10).toList();

    // Mood & genre tiles
    final prefs = UserPreferencesService.instance.currentPrefs;
    final genres = _dataService.getSortedGenres(
      preferredGenres: prefs.genres,
      preferredLanguages: prefs.languages,
    );
    final moods = _dataService.moods;
    final genreTiles = <_Tile>[
      for (final g in genres.take(8))
        (
          title: g.title,
          query: g.searchQuery,
          icon: g.icon,
          colors: List<Color>.from(g.gradient),
        ),
    ];
    final moodTiles = <_Tile>[
      for (final m in moods.take(8))
        (
          title: m.title,
          query: m.searchQuery,
          icon: m.icon,
          colors: List<Color>.from(m.gradient),
        ),
    ];
    final pillTiles = <_Tile>[...moodTiles.take(5), ...genreTiles.take(5)];

    // Artwork pool for tinted tiles
    final artPool = <String>[];
    for (final t in [...top, ...data.featured]) {
      if (t.coverUrl.isNotEmpty && !artPool.contains(t.coverUrl)) {
        artPool.add(t.coverUrl);
      }
    }
    String? tileArt(int i) =>
        artPool.isEmpty ? null : artPool[(i * 3 + 1) % artPool.length];

    return [
      // 1. HERO - spotlight coverflow
      SliverToBoxAdapter(
        child: _Hero(
          tracks: heroTracks,
          countryName: country,
          week: '${data.weekNumber}',
          bleedTop: topInset + 56,
          isActive: isActive,
          playing: playing,
          onPlay: (i) => _play(heroTracks, i, title: 'Featured'),
          onPickCountry: _pickCountry,
        ),
      ),

      // 2. Pills
      if (pillTiles.isNotEmpty)
        SliverToBoxAdapter(
          child: _Pills(
            tiles: pillTiles,
            onTap: (t) => _openCategory(t.query, t.title),
          ),
        ),

      // 3. Weekly Top Charts
      _sec(
        'charts',
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _SecHeader(
              title: 'Weekly Top Charts',
              overline: '${_country.flag} Top ${top.length} in $country',
              onMore: () => _openSection(
                title: 'Weekly Top Charts',
                overline: 'Top ${top.length} in $country',
                entries: _trackEntries(top, 'Weekly Top • $country'),
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _CircleBtn(
                    icon: CupertinoIcons.play_fill,
                    solid: true,
                    onTap: () => _play(top, 0, title: 'Weekly Top • $country'),
                  ),
                  const SizedBox(width: 8),
                  _CircleBtn(
                    icon: CupertinoIcons.shuffle,
                    onTap: () => _shuffle(top),
                  ),
                ],
              ),
            ),
            _ChartHeroCard(
              track: top.first,
              country: country,
              current: isActive(top.first),
              playing: playing,
              onTap: () => _play(top, 0, title: 'Weekly Top • $country'),
            ),
            if (top.length > 1) ...[
              const SizedBox(height: 10),
              _PagedRows(
                tracks: top.sublist(1),
                rankOffset: 1,
                isActive: isActive,
                playing: playing,
                onPlay: (i) =>
                    _play(top, i + 1, title: 'Weekly Top • $country'),
                onMore: _showTrackMenu,
              ),
            ],
          ],
        ),
      ),

      // 4. Famous artists
      if (data.topArtists.isNotEmpty)
        _sec(
          'artists',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SecHeader(
                title: 'Famous Artists of the Week',
                overline: 'Trending in $country',
                onMore: () => _openSection(
                  title: 'Famous Artists of the Week',
                  overline: 'Trending in $country',
                  entries: [
                    for (final a in data.topArtists)
                      _ListEntry(
                        title: a.name,
                        subtitle: a.subs,
                        cover: a.photo,
                        circular: true,
                        closeOnTap: true,
                        onTap: () => _openArtist(a),
                      ),
                  ],
                ),
              ),
              _Shelf(
                height: artistSize + 92,
                itemExtent: artistExt,
                count: data.topArtists.length,
                builder: (c, i) {
                  final a = data.topArtists[i];
                  return _ArtistCard(
                    name: a.name,
                    subs: a.subs,
                    photo: a.photo,
                    store: LibraryStore.instance,
                    onTap: () => _openArtist(a),
                  );
                },
              ),
            ],
          ),
        ),

      // 5. New releases (feature cards)
      if (data.newReleases.isNotEmpty)
        _sec(
          'new',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SecHeader(
                title: 'New Releases',
                overline: 'Fresh albums & singles in $country',
                onMore: () => _openSection(
                  title: 'New Releases',
                  overline: 'Fresh albums & singles in $country',
                  entries: [
                    for (final r in data.newReleases)
                      _ListEntry(
                        title: MediaNormalizer.cleanCompactTitle(r.title),
                        subtitle: '${r.type} • ${r.artist}',
                        cover: r.coverUrl,
                        closeOnTap: true,
                        onTap: () => _openAlbum(
                          r.title,
                          r.artist,
                          r.coverUrl,
                          browseId: r.browseId,
                          initialTracks: r.tracks,
                        ),
                      ),
                  ],
                ),
              ),
              _Shelf(
                height: featSize + 84,
                itemExtent: featExt,
                count: data.newReleases.length,
                builder: (c, i) {
                  final r = data.newReleases[i];
                  return _FeatureCard(
                    url: r.coverUrl,
                    tag: r.type,
                    title: MediaNormalizer.cleanCompactTitle(r.title),
                    subtitle: r.artist,
                    onTap: () => _openAlbum(
                      r.title,
                      r.artist,
                      r.coverUrl,
                      browseId: r.browseId,
                      initialTracks: r.tracks,
                    ),
                  );
                },
              ),
            ],
          ),
        ),

      // 6. Essential playlists (frosted cards)
      if (data.playlists.isNotEmpty)
        _sec(
          'playlists',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SecHeader(
                title: 'Essential Playlists',
                overline: 'Curated charts for $country',
                onMore: () => _openSection(
                  title: 'Essential Playlists',
                  overline: 'Curated charts for $country',
                  entries: [
                    for (final p in data.playlists)
                      _ListEntry(
                        title: p.title,
                        subtitle: p.description,
                        cover: p.coverUrl,
                        closeOnTap: true,
                        onTap: () => _openCategory(p.searchQuery, p.title),
                      ),
                  ],
                ),
              ),
              _Shelf(
                height: frostSize + 16,
                itemExtent: frostExt,
                count: data.playlists.length,
                builder: (c, i) {
                  final p = data.playlists[i];
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: _FrostCard(
                      url: p.coverUrl,
                      title: p.title,
                      subtitle: p.description,
                      onTap: () => _openCategory(p.searchQuery, p.title),
                    ),
                  );
                },
              ),
            ],
          ),
        ),

      // 7. Trending albums (staggered cards)
      if (albums.isNotEmpty)
        _sec(
          'albums',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _SecHeader(
                title: 'Trending Albums',
                overline: 'From this week\'s charts',
                onMore: () => _openSection(
                  title: 'Trending Albums',
                  entries: [
                    for (final t in albums)
                      _ListEntry(
                        title: MediaNormalizer.cleanTitle(t.album),
                        subtitle:
                            'Album • ${MediaNormalizer.formatArtists(t.artist)}',
                        cover: t.coverUrl,
                        closeOnTap: true,
                        onTap: () => _openAlbum(
                          MediaNormalizer.cleanTitle(t.album),
                          MediaNormalizer.formatArtists(t.artist),
                          t.coverUrl,
                          browseId: t.albumBrowseId,
                        ),
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
                      title: MediaNormalizer.cleanTitle(t.album),
                      subtitle: MediaNormalizer.formatArtists(t.artist),
                      onTap: () => _openAlbum(
                        MediaNormalizer.cleanTitle(t.album),
                        MediaNormalizer.formatArtists(t.artist),
                        t.coverUrl,
                        browseId: t.albumBrowseId,
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        ),

      // 8. Moods & genres - drifting marquee rows
      if (genreTiles.isNotEmpty || moodTiles.isNotEmpty)
        _sec(
          'browse',
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _SecHeader(
                title: 'Browse by Mood & Genre',
                overline: 'Explore sounds that fit your day',
              ),
              if (genreTiles.isNotEmpty)
                _MarqueeRow(
                  tiles: genreTiles,
                  artFor: tileArt,
                  onTap: (t) => _openCategory(t.query, t.title),
                  speed: 26,
                ),
              if (genreTiles.isNotEmpty && moodTiles.isNotEmpty)
                const SizedBox(height: 6),
              if (moodTiles.isNotEmpty)
                _MarqueeRow(
                  tiles: moodTiles,
                  artFor: (i) => tileArt(i + 5),
                  onTap: (t) => _openCategory(t.query, t.title),
                  reverse: true,
                  speed: 20,
                  startOffset: 160,
                ),
            ],
          ),
        ),
    ];
  }

  Widget _buildEmpty() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(32, 120, 32, 0),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Couldn\'t load music for ${_country.name}',
              style: _display(size: 19),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Check your connection and try again.',
              style: _body(size: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 22),
            _Press(
              onTap: () => _loadData(force: true),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 11,
                ),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(26),
                ),
                child: Text(
                  'Try Again',
                  style: _body(
                    size: 14,
                    weight: FontWeight.w700,
                    color: Colors.black,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Loading skeleton
// ═════════════════════════════════════════════════════════════════════════════

class _ExploreSkeleton extends StatefulWidget {
  const _ExploreSkeleton();

  @override
  State<_ExploreSkeleton> createState() => _ExploreSkeletonState();
}

class _ExploreSkeletonState extends State<_ExploreSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Widget _bone(double w, double h, {double r = 8}) => Container(
    width: w,
    height: h,
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.08),
      borderRadius: BorderRadius.circular(r),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final side = w * 0.56;
    return FadeTransition(
      opacity: Tween(
        begin: 0.45,
        end: 1.0,
      ).animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 10),
            _bone(210, 28, r: 14),
            const SizedBox(height: 22),
            Center(child: _bone(side, side, r: 14)),
            const SizedBox(height: 18),
            Center(child: _bone(180, 22, r: 6)),
            const SizedBox(height: 8),
            Center(child: _bone(110, 14, r: 6)),
            const SizedBox(height: 34),
            _bone(190, 22, r: 6),
            const SizedBox(height: 14),
            for (var i = 0; i < 4; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  children: [
                    _bone(50, 50),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _bone(180, 15, r: 5),
                        const SizedBox(height: 7),
                        _bone(110, 13, r: 5),
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
