import 'dart:async';
import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';

/// Data model for a single slide in the Replay Story.
class StorySlide {
  final String title;
  final String subtitle;
  final Widget content;
  final Color accentColor;

  const StorySlide({
    required this.title,
    required this.subtitle,
    required this.content,
    required this.accentColor,
  });
}

/// Computes the listener personality and reason from a [ReplayAggregate].
class StoryPersonality {
  final String name;
  final String reason;
  final IconData icon;

  const StoryPersonality({
    required this.name,
    required this.reason,
    required this.icon,
  });

  static StoryPersonality compute(ReplayAggregate s) {
    // 1. Midnight Melodist: lateNight (nightMs) share >= 40%
    final totalMs = s.totalListenedMs;
    final lateNightMs = s.daypart.nightMs;
    if (totalMs > 0 && (lateNightMs / totalMs) >= 0.40) {
      final pct = ((lateNightMs / totalMs) * 100).round();
      return StoryPersonality(
        name: 'Midnight Melodist',
        reason: 'Because $pct% of your listening happens after 10 PM.',
        icon: Icons.nightlight_round,
      );
    }

    // 2. Loyal Looper: top-song plays share >= 12% OR loop consecutiveRuns >= 5
    final topSong = s.topSongs.isNotEmpty ? s.topSongs.first : null;
    final totalPlays = s.totalQualifiedPlays;
    final loopRuns = s.loops.isNotEmpty ? s.loops.first.consecutiveRuns : 0;
    if ((topSong != null && totalPlays > 0 && (topSong.qualifiedPlays / totalPlays) >= 0.12) ||
        loopRuns >= 5) {
      return const StoryPersonality(
        name: 'Loyal Looper',
        reason: 'Because you kept your deepest favorites on continuous repeat.',
        icon: Icons.repeat_one_rounded,
      );
    }

    // 3. Explorer: discovery newRatio >= 40% OR new artists >= 25
    final newRatio = s.discovery.newRatio;
    final newArtists = s.discovery.newArtistsCount;
    if (newRatio >= 0.40 || newArtists >= 25) {
      return StoryPersonality(
        name: 'Explorer',
        reason: 'Because you discovered $newArtists new artists this period.',
        icon: Icons.explore_rounded,
      );
    }

    // 4. Beat Chaser: completion >= 85% AND skip rate <= 8% AND daytime share >= 50%
    final daytimeMs = s.daypart.morningMs + s.daypart.afternoonMs;
    final totalSkips = s.skips.fold<int>(0, (sum, sk) => sum + sk.skipCount);
    final skipRate = (totalPlays + totalSkips) > 0 ? (totalSkips / (totalPlays + totalSkips)) : 0.0;
    final daytimeShare = totalMs > 0 ? (daytimeMs / totalMs) : 0.0;
    if (s.completionRate >= 0.85 && skipRate <= 0.08 && daytimeShare >= 0.50) {
      return const StoryPersonality(
        name: 'Beat Chaser',
        reason: 'Because you rode songs through to the very last beat with zero skips.',
        icon: Icons.speed_rounded,
      );
    }

    // 5. Default: Steady Soul
    return const StoryPersonality(
      name: 'Steady Soul',
      reason: 'Because your listening rhythm is calm, reliable, and deeply focused.',
      icon: Icons.spa_rounded,
    );
  }
}

/// Full-screen animated story walkthrough (F19).
class StoryWalkthroughScreen extends StatefulWidget {
  final ReplayAggregate snapshot;
  final VoidCallback? onClose;
  final VoidCallback? onPlayMix;
  final Function(String trackId)? onPlayTrackPreview;

  const StoryWalkthroughScreen({
    super.key,
    required this.snapshot,
    this.onClose,
    this.onPlayMix,
    this.onPlayTrackPreview,
  });

  @override
  State<StoryWalkthroughScreen> createState() => _StoryWalkthroughScreenState();
}

class _StoryWalkthroughScreenState extends State<StoryWalkthroughScreen>
    with SingleTickerProviderStateMixin {
  late List<StorySlide> _slides;
  int _currentIndex = 0;
  Timer? _timer;
  double _currentProgress = 0.0;
  bool _isPaused = false;
  static const int _slideDurationMs = 5000;
  static const int _tickIntervalMs = 50;

  @override
  void initState() {
    super.initState();
    _slides = _buildSlides(widget.snapshot);
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  List<StorySlide> _buildSlides(ReplayAggregate s) {
    final slides = <StorySlide>[];

    // Slide 1: Total Minutes & Peak Time
    if (s.totalMinutes > 0) {
      slides.add(
        StorySlide(
          title: 'YOUR SOUNDTRACK',
          subtitle: 'A period of pure rhythm and melodies',
          accentColor: const Color(0xFFE11D48),
          content: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                '${s.totalMinutes}',
                style: const TextStyle(
                  fontSize: 72,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  letterSpacing: -2,
                ),
              ),
              const Text(
                'MINUTES LISTENED',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.brand,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: 32),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                ),
                child: Column(
                  children: [
                    Text(
                      'Peak Listening: ${s.daypart.dominantDaypart}',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${s.topSongs.length} different tracks played',
                      style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    // Slide 2: Top Song
    if (s.topSongs.isNotEmpty) {
      final top = s.topSongs.first;
      slides.add(
        StorySlide(
          title: '#1 SONG',
          subtitle: 'The one you couldn\'t get enough of',
          accentColor: const Color(0xFF9E2339),
          content: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 200,
                height: 200,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.brand.withValues(alpha: 0.35),
                      blurRadius: 36,
                      spreadRadius: 8,
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(24),
                  child: top.coverUrl != null && top.coverUrl!.isNotEmpty
                      ? Image.network(
                          top.coverUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => _buildArtPlaceholder(),
                        )
                      : _buildArtPlaceholder(),
                ),
              ),
              const SizedBox(height: 28),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(
                  top.title,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                top.artistRaw,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textSecondary,
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.brand.withValues(alpha: 0.3)),
                ),
                child: Text(
                  '${top.qualifiedPlays} plays · ${top.formattedDuration}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    // Slide 3: Top Artist
    if (s.topArtists.isNotEmpty) {
      final topArtist = s.topArtists.first;
      slides.add(
        StorySlide(
          title: '#1 ARTIST',
          subtitle: 'Your musical heartbeat this period',
          accentColor: const Color(0xFF671422),
          content: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 170,
                height: 170,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: AppTheme.brand, width: 3),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.brand.withValues(alpha: 0.3),
                      blurRadius: 30,
                    ),
                  ],
                ),
                child: ClipOval(
                  child: topArtist.imageUrl != null && topArtist.imageUrl!.isNotEmpty
                      ? Image.network(
                          topArtist.imageUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => _buildArtistPlaceholder(),
                        )
                      : _buildArtistPlaceholder(),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                topArtist.artistName,
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '${topArtist.trackCount} unique tracks · ${topArtist.qualifiedPlays} plays',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.brand,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Total listening time: ${formatDuration(topArtist.listenedMs)}',
                style: const TextStyle(
                  fontSize: 12,
                  color: AppTheme.textSecondary,
                ),
              ),
            ],
          ),
        ),
      );
    }

    // Slide 4: Listener Personality
    final personality = StoryPersonality.compute(s);
    slides.add(
      StorySlide(
        title: 'YOUR MUSIC PERSONALITY',
        subtitle: personality.name.toUpperCase(),
        accentColor: const Color(0xFF861E30),
        content: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppTheme.brand.withValues(alpha: 0.15),
                shape: BoxShape.circle,
                border: Border.all(color: AppTheme.brand, width: 2),
              ),
              child: Icon(
                personality.icon,
                size: 64,
                color: AppTheme.brand,
              ),
            ),
            const SizedBox(height: 28),
            Text(
              personality.name,
              style: const TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 36),
              child: Text(
                personality.reason,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: AppTheme.textSecondary,
                  height: 1.4,
                ),
              ),
            ),
          ],
        ),
      ),
    );

    // Slide 5: Recap & CTA
    slides.add(
      StorySlide(
        title: 'REPLAY RECAP',
        subtitle: s.period.label.toUpperCase(),
        accentColor: const Color(0xFF1C1C1E),
        content: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppTheme.border),
                ),
                child: Column(
                  children: [
                    _buildRecapRow('Total Time', '${s.totalMinutes} minutes'),
                    const Divider(color: AppTheme.border, height: 20),
                    _buildRecapRow(
                      'Top Song',
                      s.topSongs.isNotEmpty ? s.topSongs.first.title : '—',
                    ),
                    const Divider(color: AppTheme.border, height: 20),
                    _buildRecapRow(
                      'Top Artist',
                      s.topArtists.isNotEmpty ? s.topArtists.first.artistName : '—',
                    ),
                    const Divider(color: AppTheme.border, height: 20),
                    _buildRecapRow('Personality', personality.name),
                  ],
                ),
              ),
              const SizedBox(height: 28),
              if (widget.onPlayMix != null)
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: () {
                      if (widget.onClose != null) {
                        widget.onClose!();
                      } else {
                        Navigator.of(context).maybePop();
                      }
                      widget.onPlayMix?.call();
                    },
                    icon: const Icon(Icons.play_arrow_rounded, size: 20),
                    label: const Text(
                      'PLAY REPLAY MIX',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1,
                      ),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.brand,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );

    return slides;
  }

  Widget _buildRecapRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.end,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppTheme.textPrimary,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildArtPlaceholder() {
    return Container(
      color: Colors.white.withValues(alpha: 0.08),
      child: const Icon(Icons.music_note_rounded, size: 56, color: AppTheme.textMuted),
    );
  }

  Widget _buildArtistPlaceholder() {
    return Container(
      color: Colors.white.withValues(alpha: 0.08),
      child: const Icon(Icons.person_rounded, size: 56, color: AppTheme.textMuted),
    );
  }

  void _startTimer() {
    _timer?.cancel();
    _currentProgress = 0.0;
    _timer = Timer.periodic(const Duration(milliseconds: _tickIntervalMs), (timer) {
      if (_isPaused) return;
      setState(() {
        _currentProgress += _tickIntervalMs / _slideDurationMs;
        if (_currentProgress >= 1.0) {
          _nextSlide();
        }
      });
    });
  }

  void _nextSlide() {
    if (_currentIndex < _slides.length - 1) {
      setState(() {
        _currentIndex++;
        _currentProgress = 0.0;
      });
    } else {
      _timer?.cancel();
      if (widget.onClose != null) {
        widget.onClose!();
      } else {
        Navigator.of(context).maybePop();
      }
    }
  }

  void _prevSlide() {
    if (_currentIndex > 0) {
      setState(() {
        _currentIndex--;
        _currentProgress = 0.0;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_slides.isEmpty) {
      return const Scaffold(
        backgroundColor: Color(0xFF121214),
        body: Center(
          child: Text('No story data available', style: TextStyle(color: Colors.white)),
        ),
      );
    }

    final currentSlide = _slides[_currentIndex];

    return Scaffold(
      backgroundColor: const Color(0xFF121214),
      body: GestureDetector(
        onTapDown: (details) {
          final width = MediaQuery.of(context).size.width;
          if (details.globalPosition.dx < width * 0.35) {
            _prevSlide();
          } else {
            _nextSlide();
          }
        },
        onLongPressStart: (_) => setState(() => _isPaused = true),
        onLongPressEnd: (_) => setState(() => _isPaused = false),
        child: Stack(
          children: [
            // Ambient Backdrop Glow
            AnimatedContainer(
              duration: const Duration(milliseconds: 600),
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: Alignment.topCenter,
                  radius: 1.2,
                  colors: [
                    currentSlide.accentColor.withValues(alpha: 0.45),
                    const Color(0xFF121214),
                  ],
                ),
              ),
            ),

            // Main Content Area
            SafeArea(
              child: Column(
                children: [
                  const SizedBox(height: 8),

                  // Segmented Progress Bars
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: List.generate(_slides.length, (index) {
                        double factor = 0.0;
                        if (index < _currentIndex) {
                          factor = 1.0;
                        } else if (index == _currentIndex) {
                          factor = _currentProgress.clamp(0.0, 1.0);
                        }
                        return Expanded(
                          child: Container(
                            height: 3,
                            margin: const EdgeInsets.symmetric(horizontal: 2),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(2),
                            ),
                            child: FractionallySizedBox(
                              alignment: Alignment.centerLeft,
                              widthFactor: factor,
                              child: Container(
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(2),
                                ),
                              ),
                            ),
                          ),
                        );
                      }),
                    ),
                  ),

                  // Slide Header & Close Button
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 12, 0),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              currentSlide.title,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                                letterSpacing: 1.2,
                              ),
                            ),
                            Text(
                              currentSlide.subtitle,
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.white.withValues(alpha: 0.7),
                              ),
                            ),
                          ],
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, color: Colors.white, size: 26),
                          onPressed: () {
                            _timer?.cancel();
                            if (widget.onClose != null) {
                              widget.onClose!();
                            } else {
                              Navigator.of(context).maybePop();
                            }
                          },
                        ),
                      ],
                    ),
                  ),

                  // Active Slide Content
                  Expanded(
                    child: Center(
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 350),
                        child: KeyedSubtree(
                          key: ValueKey<int>(_currentIndex),
                          child: currentSlide.content,
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
