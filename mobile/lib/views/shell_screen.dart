import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../design_system/widgets/apple_glass.dart';
import '../design_system/zen.dart';
import '../models/track.dart';
import '../services/dock_visibility.dart';
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
  // Floating dock geometry (Apple Music: 64pt glass pill + round search).
  static const double _navHeight = 64;
  static const double _navMargin = 12; // gap below the dock (above safe area)
  static const double _miniGap = 10; // gap between mini player and dock

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
    // Keep bottom navigation dock persistent across all pages and tabs.
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
    final player = _playerShellKey.currentState;
    if (player != null && player.isOpen) {
      player.closeSheet();
    }
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
    final String artist;
    if (trackOrArtist is String) {
      artist = trackOrArtist;
    } else if (trackOrArtist is Track) {
      final names = trackOrArtist.artistNames;
      artist = names.isNotEmpty ? names.first : trackOrArtist.artist;
    } else {
      artist = trackOrArtist?.artist?.toString() ?? trackOrArtist?.toString() ?? '';
    }
    if (artist.isNotEmpty) {
      _openInActiveTab(ArtistScreen(artistName: artist));
    }
  }

  void _goToAlbum(dynamic track) {
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
  }

  @override
  Widget build(BuildContext context) {
    final safeBottom = MediaQuery.paddingOf(context).bottom;

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
                final dockProgress = _dockController.value;
                // mini player sits right above the dock; falls to the bottom if the dock hides
                final miniBottom = (_navHeight + _navMargin + _miniGap) * dockProgress + _miniGap;

                return Stack(
                  fit: StackFit.expand,
                  children: [
                    // 1. Tab views with persistent nested Navigators.
                    Positioned.fill(
                      child: IndexedStack(
                        index: _currentIndex,
                        children: _tabNavigators,
                      ),
                    ),

                    // 2. Apple Music style glass dock (slide lens + search circle).
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
                          child: IgnorePointer(
                            ignoring: hideDocks,
                            child: Transform.translate(
                              offset: Offset(0, (_navHeight + safeBottom + 24) * (1 - dockProgress)),
                              child: Opacity(
                                opacity: (dockProgress * 1.6).clamp(0.0, 1.0),
                                child: AppleDock(
                                  height: _navHeight,
                                  index: _currentIndex,
                                  onSelect: _select,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),

                    // 3. Morphing PlayerShell (mini player pill above the dock).
                    Positioned.fill(
                      child: PlayerShell(
                        key: _playerShellKey,
                        hideMini: hideDocks,
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
