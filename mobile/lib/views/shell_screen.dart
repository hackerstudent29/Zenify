import 'dart:math' as math;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../design_system/widgets/pressable_scale.dart';
import '../design_system/zen.dart';
import '../models/track.dart';
import 'details/album_screen.dart';
import 'details/artist_screen.dart';
import 'explore/explore_screen.dart';
import 'home/home_screen.dart';
import 'library/library_screen.dart';
import 'player/player_shell.dart';
import 'search/search_screen.dart';
import 'profile/profile_screen.dart';
import 'room_together/room_together_screen.dart';

/// AppShell: 4 tabs that cross-fade with a spring, a floating glass tab bar
/// with an interactive sliding rose highlight, and persistent morphing PlayerShell.
/// Dock gracefully slides down and mini player takes its place on pushed detail routes.
class ShellScreen extends StatefulWidget {
  const ShellScreen({super.key});

  @override
  State<ShellScreen> createState() => _ShellScreenState();
}

class _TabRouteObserver extends NavigatorObserver {
  _TabRouteObserver(this.onDepthChanged);
  final ValueChanged<int> onDepthChanged;
  int _depth = 0;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didPush(route, previousRoute);
    if (previousRoute != null) {
      _depth++;
      onDepthChanged(_depth);
    }
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didPop(route, previousRoute);
    if (previousRoute != null) {
      _depth = math.max(0, _depth - 1);
      onDepthChanged(_depth);
    }
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didRemove(route, previousRoute);
    _depth = math.max(0, _depth - 1);
    onDepthChanged(_depth);
  }
}

class _ShellScreenState extends State<ShellScreen> with SingleTickerProviderStateMixin {
  // Floating tab bar geometry.
  static const double _navHeight = 60;
  static const double _navMargin = 10; // gap below the bar (above safe area)

  int _currentIndex = 0;
  late final AnimationController _dockController;
  final List<int> _tabDepths = [0, 0, 0, 0];
  final List<int> _tabHistory = [];
  DateTime? _lastBackPress;
  final GlobalKey<PlayerShellState> _playerShellKey = GlobalKey<PlayerShellState>();

  final List<GlobalKey<NavigatorState>> _navKeys = [
    GlobalKey<NavigatorState>(),
    GlobalKey<NavigatorState>(),
    GlobalKey<NavigatorState>(),
    GlobalKey<NavigatorState>(),
  ];

  late final List<Widget> _tabNavigators = [
    _buildTabNav(0, const HomeScreen()),
    _buildTabNav(
      1,
      ExploreScreen(
        onOpenProfile: () => _openInActiveTab(const ProfileScreen()),
        onOpenTogether: () => _openInActiveTab(const RoomTogetherScreen()),
      ),
    ),
    _buildTabNav(2, const LibraryScreen()),
    _buildTabNav(3, SearchScreen(onBack: () => _select(0))),
  ];

  @override
  void initState() {
    super.initState();
    _dockController = AnimationController(
      vsync: this,
      value: 1.0,
      duration: const Duration(milliseconds: 320),
    );
  }

  @override
  void dispose() {
    _dockController.dispose();
    super.dispose();
  }

  void _onTabDepthChanged(int tabIndex, int depth) {
    _tabDepths[tabIndex] = depth;
    // Keep bottom navigation dock persistent across all pages and tabs (depth > 0 maintains dock).
    if (_dockController.value != 1.0) {
      _dockController.value = 1.0;
    }
  }

  Widget _buildTabNav(int index, Widget root) {
    return Navigator(
      key: _navKeys[index],
      observers: [_TabRouteObserver((d) => _onTabDepthChanged(index, d))],
      onGenerateRoute: (settings) => MaterialPageRoute(
        builder: (_) => root,
        settings: settings,
      ),
    );
  }

  void _openInActiveTab(Widget page) {
    _navKeys[_currentIndex].currentState?.push(
      MaterialPageRoute(builder: (_) => page),
    );
  }

  void _select(int index) {
    if (index == _currentIndex) {
      ZenHaptics.light();
      if (_navKeys[index].currentState?.canPop() ?? false) {
        _navKeys[index].currentState?.popUntil((r) => r.isFirst);
      }
      return;
    }
    FocusManager.instance.primaryFocus?.unfocus();
    ZenHaptics.tap();
    _tabHistory.remove(_currentIndex);
    _tabHistory.add(_currentIndex);
    setState(() => _currentIndex = index);
    if (_dockController.value != 1.0) {
      _dockController.value = 1.0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final safeBottom = MediaQuery.paddingOf(context).bottom;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;

        // 0. If the full player sheet is open (or a sub-panel like lyrics/queue), close it first
        final player = _playerShellKey.currentState;
        if (player != null && player.isOpen) {
          if (player.isPanelOpen) {
            player.closePanel();
          } else {
            player.closeSheet();
          }
          return;
        }

        final currentNav = _navKeys[_currentIndex].currentState;
        // 1. Pop nested subpages in the active tab (e.g. Artist, Album, Playlist, Profile)
        if (currentNav != null && currentNav.canPop()) {
          currentNav.maybePop();
          return;
        }

        // 2. Pop previous tab from history if the user moved across tabs
        if (_tabHistory.isNotEmpty) {
          final prevTab = _tabHistory.removeLast();
          FocusManager.instance.primaryFocus?.unfocus();
          ZenHaptics.tap();
          setState(() => _currentIndex = prevTab);
          return;
        }

        // 3. If on a tab other than Home with empty history, jump to Home
        if (_currentIndex != 0) {
          _select(0);
          return;
        }

        // 4. Double-back guard at the root of Home: prevent accidental exit
        final now = DateTime.now();
        if (_lastBackPress == null ||
            now.difference(_lastBackPress!) > const Duration(seconds: 2)) {
          _lastBackPress = now;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text(
                'Swipe or press back again to exit',
                style: TextStyle(color: Colors.white, fontSize: 13),
              ),
              backgroundColor: const Color(0xFF18181B),
              duration: const Duration(seconds: 2),
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
              margin: const EdgeInsets.fromLTRB(20, 0, 20, 90),
            ),
          );
          return;
        }

        // Second back within 2 seconds: close app
        SystemNavigator.pop();
      },
      child: Scaffold(
        resizeToAvoidBottomInset: false,
        backgroundColor: Zen.bg,
        body: AnimatedBuilder(
          animation: _dockController,
          builder: (context, _) {
            final dockProgress = _dockController.value;
            final miniBottom = (_navHeight + _navMargin) * dockProgress + 8;

            return Stack(
              fit: StackFit.expand,
              children: [
                // 1. Tab views in IndexedStack with persistent nested Navigators.
                Positioned.fill(
                  child: IndexedStack(
                    index: _currentIndex,
                    children: _tabNavigators,
                  ),
                ),

                // 2. Floating frosted-glass tab bar with synchronized slide & fade.
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: safeBottom + _navMargin,
                  child: Transform.translate(
                    offset: Offset(0, (_navHeight + safeBottom + 24) * (1 - dockProgress)),
                    child: Opacity(
                      opacity: (dockProgress * 1.6).clamp(0.0, 1.0),
                      child: _FloatingNavBar(
                        height: _navHeight,
                        index: _currentIndex,
                        onSelect: _select,
                      ),
                    ),
                  ),
                ),

                // 3. Fluid single-controller morphing PlayerShell with dynamic bottom clearance.
                Positioned.fill(
                  child: PlayerShell(
                    key: _playerShellKey,
                    miniBottomOffset: miniBottom,
                    onGoToArtist: (track) {
                      final artist = track is Track ? track.artist : track?.artist ?? track?.toString();
                      if (artist != null && artist.isNotEmpty) {
                        _openInActiveTab(ArtistScreen(artistName: artist));
                      }
                    },
                    onGoToAlbum: (track) {
                      final String title;
                      final String artist;
                      final String? cover;
                      if (track is Track) {
                        title = track.album.isNotEmpty ? track.album : track.title;
                        artist = track.artist;
                        cover = track.coverUrl;
                      } else {
                        final a = track?.album?.toString();
                        final t = track?.title?.toString() ?? 'Album';
                        title = (a != null && a.isNotEmpty) ? a : t;
                        artist = track?.artist?.toString() ?? 'Unknown Artist';
                        cover = track?.coverUrl?.toString();
                      }
                      _openInActiveTab(AlbumScreen(
                        albumTitle: title,
                        artistName: artist,
                        coverUrl: cover,
                      ));
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _NavSpec {
  const _NavSpec(this.label, this.active, this.inactive);
  final String label;
  final IconData active;
  final IconData inactive;
}

class _FloatingNavBar extends StatelessWidget {
  const _FloatingNavBar({
    required this.height,
    required this.index,
    required this.onSelect,
  });

  final double height;
  final int index;
  final ValueChanged<int> onSelect;

  static const _items = [
    _NavSpec('Home', Icons.home_rounded, Icons.home_outlined),
    _NavSpec('Explore', Icons.grid_view_rounded, Icons.grid_view_outlined),
    _NavSpec('Library', Icons.library_music_rounded,
        Icons.library_music_outlined),
    _NavSpec('Search', CupertinoIcons.search, CupertinoIcons.search),
  ];

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(32),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.28),
            blurRadius: 30,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: GlassPanel(
        borderRadius: BorderRadius.circular(32),
        blur: 32,
        tint: const Color(0xA6121214),
        child: SizedBox(
          height: height,
          child: Padding(
            padding: const EdgeInsets.all(4),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final itemWidth = constraints.maxWidth / _items.length;
                return Stack(
                  children: [
                    // Sliding rose highlight, driven by a spring.
                    AnimatedPositioned(
                      duration: const Duration(milliseconds: 650),
                      curve: Zen.springSnappy,
                      left: index * itemWidth,
                      top: 0,
                      bottom: 0,
                      width: itemWidth,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Zen.rose.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(26),
                          border: Border.all(
                            color: Zen.rose.withValues(alpha: 0.28),
                            width: 0.5,
                          ),
                        ),
                      ),
                    ),
                    Positioned.fill(
                      child: Row(
                        children: [
                          for (int i = 0; i < _items.length; i++)
                            Expanded(
                              child: _NavItem(
                                spec: _items[i],
                                selected: i == index,
                                onTap: () => onSelect(i),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.spec,
    required this.selected,
    required this.onTap,
  });

  final _NavSpec spec;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? Zen.rose : Zen.labelSecondary;

    return Semantics(
      button: true,
      selected: selected,
      label: spec.label,
      child: PressableScale(
        onTap: onTap,
        child: SizedBox.expand(
          child: ColoredBox(
            color: Colors.transparent, // makes the whole cell tappable
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AnimatedScale(
                  scale: selected ? 1.12 : 1.0,
                  duration: const Duration(milliseconds: 520),
                  curve: Zen.springBouncy,
                  child: TweenAnimationBuilder<Color?>(
                    tween: ColorTween(end: color),
                    duration: const Duration(milliseconds: 250),
                    builder: (context, c, _) => AnimatedSwitcher(
                      duration: const Duration(milliseconds: 220),
                      transitionBuilder: (child, animation) => FadeTransition(
                        opacity: animation,
                        child: ScaleTransition(scale: animation, child: child),
                      ),
                      child: Icon(
                        selected ? spec.active : spec.inactive,
                        key: ValueKey(selected),
                        color: c,
                        size: 24,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 3),
                AnimatedDefaultTextStyle(
                  duration: const Duration(milliseconds: 220),
                  style: TextStyle(
                    fontSize: 10,
                    letterSpacing: 0.1,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                    color: color,
                  ),
                  child: Text(spec.label),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}