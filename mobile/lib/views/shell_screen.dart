import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../design_system/widgets/apple_glass.dart';
import '../design_system/zen.dart';
import '../models/track.dart';
import '../services/dock_visibility.dart';
import '../services/player_state.dart';
import '../services/search_nav.dart';
import '../utils/media_normalizer.dart';
import 'details/album_screen.dart';
import 'details/artist_screen.dart';
import 'explore/explore_screen.dart';
import 'home/home_screen.dart';
import 'library/library_screen.dart';
import 'player/player_shell.dart';
import 'search/search_screen.dart';
import 'profile/profile_screen.dart';
import 'room_together/room_together_screen.dart';

/// AppShell: 4 tabs, an Apple Music style liquid-glass dock (slide-to-switch lens +
/// round search button) and the persistent morphing PlayerShell whose mini player
/// floats as a glass pill right above the dock.
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
  // Floating dock geometry (Apple Music: 54pt glass pill + round search).
  static const double _navHeight = 54;
  static const double _navMargin = 8; // minimal bottom gap above gesture pill
  static const double _miniGap = 6; // distance between mini player and dock

  int _currentIndex = 0;
  int _prevIndex = 0; // tab to return to when "back" is tapped
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
    _buildTabNav(3, SearchScreen(onBack: _onSearchBack)),
  ];

  void _onDockSelect(int i) {
    if (i == 3) {
      if (_currentIndex != 3) _prevIndex = _currentIndex;
      if (SearchNav.phase.value == SearchPhase.off) {
        SearchNav.phase.value = SearchPhase.bar; // circle → wide bar
      }
    } else {
      SearchNav.phase.value = SearchPhase.off;
    }
    _select(i);
  }

  void _onSearchBack() {
    SearchNav.phase.value = SearchPhase.off;
    _select(_prevIndex);
  }

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
    // Keep bottom navigation dock persistent across all pages and tabs.
    if (_dockController.value != 1.0) {
      _dockController.value = 1.0;
    }
  }

  Widget _buildTabNav(int index, Widget root) {
    return Navigator(
      key: _navKeys[index],
      observers: [_TabRouteObserver((d) => _onTabDepthChanged(index, d))],
      onGenerateRoute: (settings) => ZenPageRoute(
        builder: (_) => root,
        settings: settings,
      ),
    );
  }

  void _openInActiveTab(Widget page) {
    final player = _playerShellKey.currentState;
    if (player != null && player.isOpen) {
      player.closeSheet();
    }
    _navKeys[_currentIndex].currentState?.push(
      ZenPageRoute(builder: (_) => page),
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
    _tabHistory.remove(_currentIndex);
    _tabHistory.add(_currentIndex);
    setState(() => _currentIndex = index);
    if (_dockController.value != 1.0) {
      _dockController.value = 1.0;
    }
  }

  void _handleBack() {
    // 0. Full player sheet (or a sub-panel like lyrics/queue) closes first.
    final player = _playerShellKey.currentState;
    if (player != null && player.isOpen) {
      if (player.isPanelOpen) {
        player.closePanel();
      } else {
        player.closeSheet();
      }
      return;
    }

    // 1. Pop nested subpages in the active tab.
    final currentNav = _navKeys[_currentIndex].currentState;
    if (currentNav != null && currentNav.canPop()) {
      currentNav.maybePop();
      return;
    }

    if (SearchNav.phase.value == SearchPhase.bar) {
      _onSearchBack();
      return;
    }

    // 2. Go back through tab history.
    if (_tabHistory.isNotEmpty) {
      final prevTab = _tabHistory.removeLast();
      FocusManager.instance.primaryFocus?.unfocus();
      ZenHaptics.tap();
      setState(() => _currentIndex = prevTab);
      return;
    }

    // 3. Any other tab with empty history → Home.
    if (_currentIndex != 0) {
      _select(0);
      return;
    }

    // 4. Double-back guard at the root of Home.
    final now = DateTime.now();
    if (_lastBackPress == null || now.difference(_lastBackPress!) > const Duration(seconds: 2)) {
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
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          margin: const EdgeInsets.fromLTRB(20, 0, 20, 90),
        ),
      );
      return;
    }

    SystemNavigator.pop();
  }

  void _goToArtist(dynamic trackOrArtist) {
    final String raw = trackOrArtist is Track
        ? (trackOrArtist.artistNames.isNotEmpty ? trackOrArtist.artistNames.first : trackOrArtist.artist)
        : (trackOrArtist is String ? trackOrArtist : trackOrArtist?.artist?.toString() ?? '');
    final clean = MediaNormalizer.cleanArtistName(raw);
    final split = MediaNormalizer.splitArtistNames(clean);
    final artist = split.isNotEmpty ? split.first : clean;
    if (artist.isNotEmpty && artist != 'Unknown Artist') {
      _openInActiveTab(ArtistScreen(artistName: artist));
    }
  }

  void _goToAlbum(dynamic track) {
    final String rawTitle;
    final dynamic rawArtist;
    final String? cover;
    if (track is Track) {
      rawTitle = (track.album.isNotEmpty && track.album != 'Single') ? track.album : track.title;
      rawArtist = track.artist;
      cover = track.coverUrl;
    } else {
      final a = track?.album?.toString();
      final t = track?.title?.toString() ?? 'Album';
      rawTitle = (a != null && a.isNotEmpty && a != 'Single') ? a : t;
      rawArtist = track?.artist;
      cover = track?.coverUrl?.toString();
    }
    final title = MediaNormalizer.cleanAlbumTitle(rawTitle);
    final artist = MediaNormalizer.formatArtists(rawArtist);
    _openInActiveTab(AlbumScreen(
      albumTitle: title,
      artistName: artist,
      coverUrl: cover,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    final hasTrack = context.select<PlayerState, bool>((p) => p.currentTrack != null);

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _handleBack();
      },
      child: Scaffold(
        resizeToAvoidBottomInset: false,
        backgroundColor: Zen.bg,
        body: ValueListenableBuilder<bool>(
          valueListenable: DockVisibility.hideDocksNotifier,
          builder: (context, hideDocks, _) {
            return AnimatedBuilder(
              animation: _dockController,
              builder: (context, _) {
                final dockProgress = hasTrack ? _dockController.value : 1.0;
                // Interpolate mini player bottom:
                // At dockProgress == 1.0 (resting): _navHeight + _navMargin + _miniGap
                // At dockProgress == 0.0 (three-dock): _navMargin (flush with left and right docks)
                final miniBottom = ui.lerpDouble(
                  _navMargin,
                  _navHeight + _navMargin + _miniGap,
                  dockProgress,
                )!;

                return Stack(
                  fit: StackFit.expand,
                  children: [
                    // 1. Tab views with intelligent scroll awareness & persistent nested Navigators.
                    Positioned.fill(
                      child: NotificationListener<ScrollNotification>(
                        onNotification: (notification) {
                          // Ignore horizontal lists (albums, artists, pills, shelves, filter tabs)
                          if (notification.metrics.axis != Axis.vertical) return false;

                          final player = _playerShellKey.currentState;
                          if (player != null && player.isOpen) return false;

                          // Always restore dock near the top of the page
                          if (notification.metrics.pixels <= 15) {
                            if (_dockController.value < 1.0 && !_dockController.isAnimating) {
                              _dockController.animateTo(
                                1.0,
                                duration: const Duration(milliseconds: 240),
                                curve: Curves.easeOutCubic,
                              );
                            }
                            return false;
                          }

                          if (notification is ScrollUpdateNotification) {
                            final delta = notification.scrollDelta ?? 0.0;
                            if (delta > 1.5 && notification.metrics.pixels > 20) {
                              // User is scrolling down: immediately morph into three-dock island layout
                              if (_dockController.value > 0.0 && !_dockController.isAnimating) {
                                _dockController.animateTo(
                                  0.0,
                                  duration: const Duration(milliseconds: 240),
                                  curve: Curves.easeOutCubic,
                                );
                              }
                            } else if (delta < -3.0) {
                              // User scrolls up: restore to resting dock + floating mini player
                              if (_dockController.value < 1.0 && !_dockController.isAnimating) {
                                _dockController.animateTo(
                                  1.0,
                                  duration: const Duration(milliseconds: 240),
                                  curve: Curves.easeOutCubic,
                                );
                              }
                            }
                          } else if (notification is UserScrollNotification) {
                            if (notification.direction == ScrollDirection.reverse &&
                                notification.metrics.pixels > 20) {
                              if (_dockController.value > 0.0 && !_dockController.isAnimating) {
                                _dockController.animateTo(
                                  0.0,
                                  duration: const Duration(milliseconds: 240),
                                  curve: Curves.easeOutCubic,
                                );
                              }
                            } else if (notification.direction == ScrollDirection.forward) {
                              if (_dockController.value < 1.0 && !_dockController.isAnimating) {
                                _dockController.animateTo(
                                  1.0,
                                  duration: const Duration(milliseconds: 240),
                                  curve: Curves.easeOutCubic,
                                );
                              }
                            }
                          }
                          return false;
                        },
                        child: ValueListenableBuilder<bool>(
                          valueListenable: PlayerShell.isPlayerOpenNotifier,
                          builder: (_, isPlayerOpen, child) => IgnorePointer(
                            ignoring: isPlayerOpen,
                            child: child!,
                          ),
                          child: _AnimatedTabStack(
                            index: _currentIndex,
                            children: _tabNavigators,
                          ),
                        ),
                      ),
                    ),

                    // 2. Apple Music style glass dock (morphs between full tabs and squircle explore + search buttons).
                    Positioned(
                      left: 16,
                      right: 16,
                      bottom: safeBottom + _navMargin,
                      child: AnimatedSlide(
                        offset: hideDocks ? const Offset(0, 2.0) : Offset.zero,
                        duration: const Duration(milliseconds: 260),
                        curve: Curves.easeInOutCubic,
                        child: AnimatedOpacity(
                          opacity: hideDocks ? 0.0 : 1.0,
                          duration: const Duration(milliseconds: 200),
                          child: ValueListenableBuilder<bool>(
                            valueListenable: PlayerShell.isPlayerOpenNotifier,
                            builder: (_, isPlayerOpen, child) => IgnorePointer(
                              ignoring: hideDocks || isPlayerOpen,
                              child: child!,
                            ),
                            child: ValueListenableBuilder<SearchPhase>(
                              valueListenable: SearchNav.phase,
                              builder: (_, phase, _) => AppleDock(
                                height: _navHeight,
                                index: _currentIndex,
                                searchExpanded: phase == SearchPhase.bar,
                                dockProgress: dockProgress,
                                onSelect: _onDockSelect,
                                onBack: _onSearchBack,
                                onSearchTap: () => SearchNav.phase.value = SearchPhase.typing,
                                onRestoreDockTap: () {
                                  _dockController.animateTo(
                                    1.0,
                                    duration: const Duration(milliseconds: 280),
                                    curve: Curves.easeOutCubic,
                                  );
                                },
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),

                    // 3. Morphing PlayerShell (mini player pill morphs into center island).
                    Positioned.fill(
                      child: PlayerShell(
                        key: _playerShellKey,
                        hideMini: hideDocks,
                        dockProgress: dockProgress,
                        miniBottomOffset: miniBottom,
                        onGoToArtist: _goToArtist,
                        onGoToAlbum: _goToAlbum,
                      ),
                    ),
                  ],
                );
              },
            );
          },
        ),
      ),
    );
  }
}

/// Keeps state and scroll position of all tabs while smoothly animating
/// tab switches with an Apple-style subtle direction-aware fluid spring and fade.
class _AnimatedTabStack extends StatefulWidget {
  const _AnimatedTabStack({
    required this.index,
    required this.children,
  });

  final int index;
  final List<Widget> children;

  @override
  State<_AnimatedTabStack> createState() => _AnimatedTabStackState();
}

class _AnimatedTabStackState extends State<_AnimatedTabStack> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  int _prevIndex = 0;

  @override
  void initState() {
    super.initState();
    _prevIndex = widget.index;
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 200),
      value: 1.0,
    );
  }

  @override
  void didUpdateWidget(_AnimatedTabStack oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.index != widget.index) {
      _prevIndex = oldWidget.index;
      _controller.forward(from: 0.0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bool isForward = widget.index >= _prevIndex;
    final double slideSign = isForward ? 1.0 : -1.0;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final t = Curves.easeOutCubic.transform(_controller.value);
        final double slideOffset = (1.0 - t) * 0.025 * slideSign;

        return Opacity(
          opacity: t.clamp(0.0, 1.0),
          child: FractionalTranslation(
            translation: Offset(slideOffset, 0),
            child: Transform.scale(
              scale: 0.992 + 0.008 * t,
              alignment: Alignment.center,
              child: child,
            ),
          ),
        );
      },
      child: IndexedStack(
        index: widget.index,
        children: widget.children,
      ),
    );
  }
}
