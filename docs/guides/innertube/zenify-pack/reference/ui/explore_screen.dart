import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter, lerpDouble;

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../data/datasources/catalog_datasource.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/tokens/app_spacing.dart';
import '../../design_system/tokens/app_typography.dart';
import '../../design_system/widgets/media_card.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/section_header.dart';
import '../../services/player_state.dart';

// Move these to design_system/motion/springs.dart and share them app-wide.
const _smooth = SpringDescription(mass: 1, stiffness: 158, damping: 25.1);
const _snappy = SpringDescription(mass: 1, stiffness: 439, damping: 35.6);
const _bouncy = SpringDescription(mass: 1, stiffness: 158, damping: 16.3);

const _surface2 = Color(0xFF2C2C2E);
const _hairline = Color(0x14FFFFFF); // white 8%

/// Explore tab: Together and Blend entry cards, moods, charts, new picks, browse.
///
/// Motion model:
///  - Large title collapses into a frosted centered bar, driven 1:1 by scroll.
///  - Feature cards carry one quiet ambient animation each (ripples / orbit).
///  - Sections spring in once on first build.
///  - Every tap is a spring (PressableScale); mood pills use two springs.
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
    with SingleTickerProviderStateMixin {
  // One shared ticker for all ambient motion. It pauses automatically when the
  // tab is offstage (TickerMode) and is stopped under reduce-motion.
  late final AnimationController _ambient =
      AnimationController(vsync: this, duration: const Duration(seconds: 14));

  int? _mood;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _ambient.stop();
    } else if (!_ambient.isAnimating) {
      _ambient.repeat();
    }
  }

  @override
  void dispose() {
    _ambient.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tracks = CatalogDataSource.allTracks;
    final topInset = MediaQuery.paddingOf(context).top;

    // read, not watch: this screen must not rebuild on every player tick.
    void play(List list, int index) =>
        context.read<PlayerState>().setQueue(list.cast(), startIndex: index);

    final chart = <_SongRowData>[
      for (var i = 0; i < math.min(12, tracks.length); i++)
        _SongRowData(
          rank: i + 1,
          title: tracks[i].title,
          artist: tracks[i].artist,
          coverUrl: tracks[i].coverUrl,
          onTap: () => play(tracks, i),
        ),
    ];
    final fresh = tracks.reversed.toList();

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: AppColors.bg,
        body: CustomScrollView(
          physics: const BouncingScrollPhysics(),
          slivers: [
            SliverPersistentHeader(
              pinned: true,
              delegate: _CollapsingTitleDelegate(
                topInset: topInset,
                title: 'Explore',
                onAvatarTap: widget.onOpenProfile,
              ),
            ),
            SliverToBoxAdapter(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SizedBox(height: 8),

                  // Feature cards: the one expressive moment on this screen.
                  _SpringIn(
                    delayMs: 40,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: _FeatureCard(
                        colors: const [Color(0xFF831843), Color(0xFFE11D48)],
                        glow: AppColors.accent,
                        painter: _RipplePainter(_ambient),
                        badge: _GlassPill(
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _PulseDot(_ambient),
                              const SizedBox(width: 6),
                              const Text('Live now', style: _pillText),
                            ],
                          ),
                        ),
                        title: 'Listen Together',
                        subtitle: 'Synced rooms with friends',
                        trailing: const _AvatarStack(
                          ring: Color(0xFFBE123C),
                          label: '12 listening',
                        ),
                        onTap: widget.onOpenTogether ?? () {},
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  _SpringIn(
                    delayMs: 110,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: _FeatureCard(
                        colors: const [Color(0xFF1E1B4B), Color(0xFF4F46E5)],
                        glow: const Color(0xFF4F46E5),
                        painter: _OrbitPainter(_ambient),
                        badge: const _GlassPill(
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.all_inclusive_rounded,
                                  size: 13, color: Colors.white),
                              SizedBox(width: 6),
                              Text('Updated daily', style: _pillText),
                            ],
                          ),
                        ),
                        title: 'Daily Taste Blend',
                        subtitle: 'Your music, mixed with a friend’s',
                        trailing: const _GlassPill(
                          child: Text('86% match', style: _pillText),
                        ),
                        onTap: widget.onOpenBlend ?? () {},
                      ),
                    ),
                  ),
                  const SizedBox(height: 28),

                  // Moods
                  _SpringIn(
                    delayMs: 180,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _Title('Moods and activities'),
                        const SizedBox(height: 12),
                        SizedBox(
                          height: 40,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            physics: const BouncingScrollPhysics(),
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            itemCount: _moods.length,
                            separatorBuilder: (_, __) =>
                                const SizedBox(width: 8),
                            itemBuilder: (context, i) => _MoodPill(
                              label: _moods[i],
                              selected: _mood == i,
                              onTap: () {
                                HapticFeedback.selectionClick();
                                setState(() => _mood = _mood == i ? null : i);
                              },
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),

                  // Hot charts: Apple Music style paged columns of four.
                  _SpringIn(
                    delayMs: 250,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 20),
                          child: SectionHeader(
                              title: 'Hot Charts', actionTitle: 'More'),
                        ),
                        _ChartShelf(items: chart),
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),

                  // Fresh picks (design-system MediaCard, unchanged behavior)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 20),
                        child: SectionHeader(
                            title: 'Fresh picks', actionTitle: 'More'),
                      ),
                      SizedBox(
                        height: 210,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          physics: const BouncingScrollPhysics(),
                          padding: const EdgeInsets.symmetric(horizontal: 20),
                          itemCount: fresh.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 16),
                          itemBuilder: (context, i) {
                            final item = fresh[i];
                            return MediaCard(
                              title: item.title,
                              subtitle: item.artist,
                              imageUrl: item.coverUrl,
                              onTap: () => play(fresh, i),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 28),

                  // Browse all
                  const _Title('Browse all'),
                  const SizedBox(height: 12),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: GridView.count(
                      crossAxisCount: 2,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 1.85,
                      shrinkWrap: true,
                      padding: EdgeInsets.zero,
                      physics: const NeverScrollableScrollPhysics(),
                      children: [
                        for (final c in _browse)
                          _BrowseTile(
                            name: c.name,
                            icon: c.icon,
                            colors: c.colors,
                            onTap: () => widget.onOpenCategory?.call(c.name),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 120), // clears mini player + tab bar
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const _moods = ['Chill', 'Workout', 'Focus', 'Commute', 'Party', 'Sleep'];

class _Browse {
  const _Browse(this.name, this.icon, this.colors);
  final String name;
  final IconData icon;
  final List<Color> colors;
}

const _browse = <_Browse>[
  _Browse('Pop', Icons.auto_awesome_rounded, [Color(0xFFEC4899), Color(0xFFF97316)]),
  _Browse('Hip-Hop', Icons.headphones_rounded, [Color(0xFF7C3AED), Color(0xFFDB2777)]),
  _Browse('Indie', Icons.local_florist_rounded, [Color(0xFF059669), Color(0xFF65A30D)]),
  _Browse('Classical', Icons.piano_rounded, [Color(0xFF475569), Color(0xFF0EA5E9)]),
  _Browse('Rock', Icons.electric_bolt_rounded, [Color(0xFFB91C1C), Color(0xFFEA580C)]),
  _Browse('Tamil', Icons.graphic_eq_rounded, [Color(0xFFBE123C), Color(0xFF9333EA)]),
  _Browse('Telugu', Icons.library_music_rounded, [Color(0xFF0D9488), Color(0xFF2563EB)]),
  _Browse('Hindi', Icons.album_rounded, [Color(0xFFD97706), Color(0xFFE11D48)]),
  _Browse('Punjabi', Icons.celebration_rounded, [Color(0xFFCA8A04), Color(0xFFDC2626)]),
  _Browse('EDM', Icons.equalizer_rounded, [Color(0xFF4F46E5), Color(0xFF06B6D4)]),
];

const _pillText = TextStyle(
  fontSize: 12,
  fontWeight: FontWeight.w600,
  color: Colors.white,
  letterSpacing: 0.1,
);

// ---------------------------------------------------------------------------
// Collapsing large title -> frosted centered bar (scroll-driven, no tween)
// ---------------------------------------------------------------------------

class _CollapsingTitleDelegate extends SliverPersistentHeaderDelegate {
  _CollapsingTitleDelegate({
    required this.topInset,
    required this.title,
    this.onAvatarTap,
  });

  final double topInset;
  final String title;
  final VoidCallback? onAvatarTap;

  static const _expanded = 96.0;
  static const _collapsed = 44.0;

  @override
  double get maxExtent => topInset + _expanded;
  @override
  double get minExtent => topInset + _collapsed;

  @override
  bool shouldRebuild(covariant _CollapsingTitleDelegate old) =>
      old.topInset != topInset || old.title != title;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final t = (shrinkOffset / (maxExtent - minExtent)).clamp(0.0, 1.0).toDouble();

    final titleStyle = AppTypography.largeTitle.copyWith(
      fontSize: lerpDouble(34, 17, t)!,
      fontWeight: FontWeight.lerp(FontWeight.w700, FontWeight.w600, t),
      letterSpacing: lerpDouble(-0.6, -0.4, t)!,
      color: Colors.white,
    );
    final avatar = lerpDouble(36, 30, t)!;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        // Frosted layer. Blur is invisible over the flat background at t=0,
        // so it is simply skipped until the bar starts to collapse.
        if (t > 0.01)
          Positioned.fill(
            child: ClipRect(
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 25, sigmaY: 25),
                child: ColoredBox(
                  color: AppColors.bg.withValues(alpha: 0.72 * t),
                ),
              ),
            ),
          ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          height: 0.5,
          child: ColoredBox(color: Colors.white.withValues(alpha: 0.10 * t)),
        ),
        Padding(
          padding: EdgeInsets.only(
            top: topInset,
            left: lerpDouble(20, 0, t)!,
            bottom: lerpDouble(10, 12, t)!,
          ),
          child: Align(
            alignment:
                Alignment.lerp(Alignment.bottomLeft, Alignment.bottomCenter, t)!,
            child: Text(title, style: titleStyle),
          ),
        ),
        Positioned(
          right: 20,
          bottom: lerpDouble(8, 7, t)!,
          child: PressableScale(
            onTap: onAvatarTap ?? () {},
            child: Container(
              width: avatar,
              height: avatar,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFFE11D48), Color(0xFF831843)],
                ),
              ),
              child: Icon(Icons.person_rounded,
                  size: avatar * 0.58, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// One-shot spring entrance
// ---------------------------------------------------------------------------

class _SpringIn extends StatefulWidget {
  const _SpringIn({required this.delayMs, required this.child});
  final int delayMs;
  final Widget child;

  @override
  State<_SpringIn> createState() => _SpringInState();
}

class _SpringInState extends State<_SpringIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController.unbounded(vsync: this, value: 0);
  Timer? _timer;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.value = 1;
      return;
    }
    _timer = Timer(Duration(milliseconds: widget.delayMs), () {
      if (mounted) _c.animateWith(SpringSimulation(_smooth, 0, 1, 0));
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, child) {
          final v = _c.value;
          return Opacity(
            opacity: v.clamp(0.0, 1.0).toDouble(),
            child: Transform.translate(
              offset: Offset(0, (1 - v) * 28), // slight overshoot = settle
              child: child,
            ),
          );
        },
      );
}

// ---------------------------------------------------------------------------
// Feature cards
// ---------------------------------------------------------------------------

class _FeatureCard extends StatelessWidget {
  const _FeatureCard({
    required this.colors,
    required this.glow,
    required this.painter,
    required this.badge,
    required this.title,
    required this.subtitle,
    required this.trailing,
    required this.onTap,
  });

  final List<Color> colors;
  final Color glow;
  final CustomPainter painter;
  final Widget badge;
  final String title;
  final String subtitle;
  final Widget trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onTap,
      child: RepaintBoundary(
        child: Container(
          height: 148,
          clipBehavior: Clip.antiAlias,
          decoration: ShapeDecoration(
            shape: ContinuousRectangleBorder(
              borderRadius: BorderRadius.circular(AppSpacing.rCard * 2),
            ),
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: colors,
            ),
            shadows: [
              BoxShadow(
                color: glow.withValues(alpha: 0.30),
                blurRadius: 24,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Stack(
            children: [
              Positioned.fill(child: CustomPaint(painter: painter)),
              Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          badge,
                          const Spacer(),
                          Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.headline.copyWith(
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.4,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            subtitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.footnote
                                .copyWith(color: Colors.white70),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: Colors.white.withValues(alpha: 0.22),
                          ),
                          child: const Icon(Icons.chevron_right_rounded,
                              size: 20, color: Colors.white),
                        ),
                        trailing,
                      ],
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

class _GlassPill extends StatelessWidget {
  const _GlassPill({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: ShapeDecoration(
          shape: const StadiumBorder(),
          color: Colors.black.withValues(alpha: 0.22),
        ),
        child: child,
      );
}

class _PulseDot extends StatelessWidget {
  const _PulseDot(this.animation);
  final Animation<double> animation;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: animation,
        builder: (_, __) {
          final p = 0.5 + 0.5 * math.sin(animation.value * math.pi * 2 * 6);
          return SizedBox(
            width: 14,
            height: 14,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Container(
                  width: 6 + 8 * p,
                  height: 6 + 8 * p,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: const Color(0xFF4ADE80)
                        .withValues(alpha: 0.40 * (1 - p)),
                  ),
                ),
                Container(
                  width: 6,
                  height: 6,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: Color(0xFF4ADE80),
                  ),
                ),
              ],
            ),
          );
        },
      );
}

class _AvatarStack extends StatelessWidget {
  const _AvatarStack({required this.ring, required this.label});
  final Color ring;
  final String label;

  static const _colors = [
    [Color(0xFFFBBF24), Color(0xFFF97316)],
    [Color(0xFF38BDF8), Color(0xFF6366F1)],
    [Color(0xFF34D399), Color(0xFF059669)],
  ];
  static const _initials = ['A', 'R', 'S'];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 28 + 2 * 18,
          height: 28,
          child: Stack(
            children: [
              for (var i = 0; i < 3; i++)
                Positioned(
                  left: i * 18.0,
                  child: Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: ring, width: 2),
                      gradient: LinearGradient(colors: _colors[i]),
                    ),
                    child: Text(
                      _initials[i],
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 4),
        Text(label,
            style: AppTypography.footnote
                .copyWith(fontSize: 11, color: Colors.white70)),
      ],
    );
  }
}

/// Soft sonar rings radiating from the card's right side.
class _RipplePainter extends CustomPainter {
  _RipplePainter(this.animation) : super(repaint: animation);
  final Animation<double> animation;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width * 0.80, size.height * 0.42);
    for (var i = 0; i < 3; i++) {
      final t = (animation.value * 4 + i / 3) % 1;
      final e = Curves.easeOut.transform(t);
      canvas.drawCircle(
        center,
        lerpDouble(26, 130, e)!,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5
          ..color = Colors.white.withValues(alpha: 0.20 * (1 - t)),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RipplePainter old) => false;
}

/// Two overlapping discs orbiting each other: "two tastes, one mix".
class _OrbitPainter extends CustomPainter {
  _OrbitPainter(this.animation) : super(repaint: animation);
  final Animation<double> animation;

  @override
  void paint(Canvas canvas, Size size) {
    final c = Offset(size.width * 0.80, size.height * 0.46);
    final a = animation.value * math.pi * 2 * 2;
    final off = Offset(math.cos(a), math.sin(a)) * 20;
    canvas.drawCircle(
        c + off, 44, Paint()..color = Colors.white.withValues(alpha: 0.16));
    canvas.drawCircle(
        c - off, 44, Paint()..color = Colors.white.withValues(alpha: 0.11));
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2
      ..color = Colors.white.withValues(alpha: 0.18);
    canvas.drawCircle(c + off, 44, ring);
    canvas.drawCircle(c - off, 44, ring);
  }

  @override
  bool shouldRepaint(covariant _OrbitPainter old) => false;
}

// ---------------------------------------------------------------------------
// Mood pills (two springs: color settle + bouncy kick)
// ---------------------------------------------------------------------------

class _MoodPill extends StatefulWidget {
  const _MoodPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_MoodPill> createState() => _MoodPillState();
}

class _MoodPillState extends State<_MoodPill> with TickerProviderStateMixin {
  late final AnimationController _sel = AnimationController.unbounded(
      vsync: this, value: widget.selected ? 1 : 0);
  late final AnimationController _kick =
      AnimationController.unbounded(vsync: this, value: 1);

  @override
  void didUpdateWidget(covariant _MoodPill old) {
    super.didUpdateWidget(old);
    if (old.selected == widget.selected) return;
    _sel.animateWith(SpringSimulation(
        _snappy, _sel.value, widget.selected ? 1 : 0, _sel.velocity));
    if (widget.selected) {
      _kick.value = 0.88;
      _kick.animateWith(SpringSimulation(_bouncy, 0.88, 1, 0));
    }
  }

  @override
  void dispose() {
    _sel.dispose();
    _kick.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: Listenable.merge([_sel, _kick]),
        builder: (_, __) {
          final s = _sel.value.clamp(0.0, 1.0).toDouble();
          return Transform.scale(
            scale: _kick.value,
            child: Container(
              alignment: Alignment.center,
              padding: const EdgeInsets.symmetric(horizontal: 18),
              decoration: ShapeDecoration(
                shape: const StadiumBorder(),
                color: Color.lerp(_surface2, Colors.white, s),
              ),
              child: Text(
                widget.label,
                style: AppTypography.headline.copyWith(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: Color.lerp(Colors.white, Colors.black, s),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Hot charts: paged columns of four rows
// ---------------------------------------------------------------------------

class _SongRowData {
  const _SongRowData({
    required this.rank,
    required this.title,
    required this.artist,
    required this.coverUrl,
    required this.onTap,
  });
  final int rank;
  final String title;
  final String artist;
  final String? coverUrl;
  final VoidCallback onTap;
}

class _ChartShelf extends StatefulWidget {
  const _ChartShelf({required this.items});
  final List<_SongRowData> items;

  @override
  State<_ChartShelf> createState() => _ChartShelfState();
}

class _ChartShelfState extends State<_ChartShelf> {
  static const _rowH = 64.0;
  final _controller = PageController(viewportFraction: 0.88);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pages = <List<_SongRowData>>[];
    for (var i = 0; i < widget.items.length; i += 4) {
      pages.add(widget.items.sublist(i, math.min(i + 4, widget.items.length)));
    }
    if (pages.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: _rowH * 4 + 8,
      child: PageView.builder(
        controller: _controller,
        padEnds: false,
        physics: const PageScrollPhysics(parent: BouncingScrollPhysics()),
        itemCount: pages.length,
        itemBuilder: (context, p) => Padding(
          padding: const EdgeInsets.only(left: 20, right: 8),
          child: Column(
            children: [
              for (var r = 0; r < pages[p].length; r++)
                _ChartRow(
                  data: pages[p][r],
                  showDivider: r != pages[p].length - 1,
                  height: _rowH,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChartRow extends StatelessWidget {
  const _ChartRow({
    required this.data,
    required this.showDivider,
    required this.height,
  });
  final _SongRowData data;
  final bool showDivider;
  final double height;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      scale: 0.98,
      onTap: data.onTap,
      child: SizedBox(
        height: height,
        child: Column(
          children: [
            Expanded(
              child: Row(
                children: [
                  SizedBox(
                    width: 28,
                    child: Text(
                      '${data.rank}',
                      textAlign: TextAlign.center,
                      style: AppTypography.headline.copyWith(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: Colors.white54,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  _Artwork(url: data.coverUrl, size: 48, radius: 8),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          data.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.headline.copyWith(fontSize: 16),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          data.artist,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppTypography.footnote
                              .copyWith(color: Colors.white60),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.more_horiz_rounded,
                      size: 22, color: Colors.white54),
                ],
              ),
            ),
            if (showDivider)
              const Padding(
                padding: EdgeInsets.only(left: 38),
                child: SizedBox(
                  height: 0.5,
                  width: double.infinity,
                  child: ColoredBox(color: _hairline),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Artwork extends StatelessWidget {
  const _Artwork({required this.url, required this.size, required this.radius});
  final String? url;
  final double size;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final dpr = MediaQuery.devicePixelRatioOf(context);
    const placeholder = DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF3A3A3C), Color(0xFF2C2C2E)],
        ),
      ),
      child: Center(
        child: Icon(Icons.music_note_rounded, size: 20, color: Colors.white24),
      ),
    );

    return SizedBox(
      width: size,
      height: size,
      child: ClipPath(
        clipper: ShapeBorderClipper(
          shape: ContinuousRectangleBorder(
            borderRadius: BorderRadius.circular(radius * 2),
          ),
        ),
        child: (url == null || url!.isEmpty)
            ? placeholder
            : Stack(
                fit: StackFit.expand,
                children: [
                  placeholder,
                  Image.network(
                    url!,
                    fit: BoxFit.cover,
                    cacheWidth: (size * dpr).round(), // decode at display size
                    gaplessPlayback: true,
                    frameBuilder: (_, child, frame, sync) => AnimatedOpacity(
                      opacity: (sync || frame != null) ? 1 : 0,
                      duration: const Duration(milliseconds: 200),
                      child: child,
                    ),
                    errorBuilder: (_, __, ___) => placeholder,
                  ),
                ],
              ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Browse tiles + small bits
// ---------------------------------------------------------------------------

class _BrowseTile extends StatelessWidget {
  const _BrowseTile({
    required this.name,
    required this.icon,
    required this.colors,
    required this.onTap,
  });
  final String name;
  final IconData icon;
  final List<Color> colors;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return PressableScale(
      onTap: onTap,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: ShapeDecoration(
          shape: ContinuousRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.rCard * 1.6),
          ),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: colors,
          ),
        ),
        child: Stack(
          children: [
            Positioned(
              right: -8,
              bottom: -14,
              child: Transform.rotate(
                angle: 0.38,
                child: Icon(icon,
                    size: 76, color: Colors.white.withValues(alpha: 0.30)),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Align(
                alignment: Alignment.topLeft,
                child: Text(
                  name,
                  style: AppTypography.headline.copyWith(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
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

class _Title extends StatelessWidget {
  const _Title(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        child: Text(
          text,
          style: AppTypography.headline.copyWith(
            fontSize: 22,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.4,
          ),
        ),
      );
}
