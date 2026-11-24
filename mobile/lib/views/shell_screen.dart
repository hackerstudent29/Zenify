import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../design_system/widgets/apple_glass.dart';
import '../design_system/zen.dart';
import '../models/track.dart';
import '../services/dock_visibility.dart';
import '../services/player_state.dart';
import '../services/room_deep_links.dart';
import '../services/search_nav.dart';
import '../services/update_service.dart';
import '../services/system_notification_service.dart';
import '../features/replay/presentation/replay_screen.dart';
import '../features/replay/data/replay_journal_reader.dart';
import '../utils/media_normalizer.dart';
import 'details/album_screen.dart';
import 'details/artist_screen.dart';
import '../atlas/atlas.dart';
import 'home/home_screen.dart';
import 'library/library_screen.dart';
import 'player/player_shell.dart';
import 'search/search_screen.dart';
import 'room_together/room_together_screen.dart';

/// AppShell: 4 tabs, an Apple Music style liquid-glass dock (slide-to-switch lens +
/// round search button) and the persistent morphing PlayerShell whose mini player
/// floats as a glass pill right above the dock.
/// Scope allowing descendant sheets and modals to open pages inside the active tab navigator
/// without covering or hiding the bottom dock and mini player.
class ShellNavigationScope extends InheritedWidget {
  const ShellNavigationScope({
    super.key,
    required this.openInActiveTab,
    required this.closePlayerSheet,
    required super.child,
  });

  final void Function(Widget page) openInActiveTab;
  final VoidCallback closePlayerSheet;

  static ShellNavigationScope? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ShellNavigationScope>();

  @override
  bool updateShouldNotify(ShellNavigationScope oldWidget) => false;
}

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
      if (previousRoute.isFirst) {
        _depth = 0;
      }
      onDepthChanged(_depth);
    }
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    super.didRemove(route, previousRoute);
    _depth = math.max(0, _depth - 1);
    if (previousRoute?.isFirst == true) {
      _depth = 0;
    }
    onDepthChanged(_depth);
  }
}

class _ShellScreenState extends State<ShellScreen>
    with SingleTickerProviderStateMixin {
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
  final GlobalKey<PlayerShellState> _playerShellKey =
      GlobalKey<PlayerShellState>();
  StreamSubscription<String>? _notifSub;

  final List<GlobalKey<NavigatorState>> _navKeys = [
    GlobalKey<NavigatorState>(),
    GlobalKey<NavigatorState>(),
    GlobalKey<NavigatorState>(),
    GlobalKey<NavigatorState>(),
  ];

  late final List<Widget> _tabNavigators = [
    _buildTabNav(0, const HomeScreen()),
    _buildTabNav(1, const AtlasScreen()),
    _buildTabNav(2, const LibraryScreen()),
    _buildTabNav(3, SearchScreen(onBack: _onSearchBack)),
  ];

  void _onDockSelect(int i) {
    if (i == 3) {
      if (_currentIndex != 3) {
        _prevIndex = _currentIndex;
        // Coming to search from another page: reset search stack to default page
        if (_navKeys[3].currentState?.canPop() ?? false) {
          _navKeys[3].currentState?.popUntil((r) => r.isFirst);
        }
        SearchNav.phase.value = SearchPhase.off;
        _select(3);
      } else {
        // User is ALREADY on the Search tab:
        // 1. If deep in a pushed subpage (artist, album, etc.), pop back to default landing page
        if (_navKeys[3].currentState?.canPop() ?? false) {
          _navKeys[3].currentState?.popUntil((r) => r.isFirst);
          SearchNav.phase.value = SearchPhase.off;
          ZenHaptics.light();
          return;
        }
        // 2. Toggle between typing search mode and default landing page
        if (SearchNav.phase.value == SearchPhase.typing) {
          SearchNav.phase.value = SearchPhase.off;
        } else {
          SearchNav.phase.value = SearchPhase.typing;
        }
        ZenHaptics.light();
      }
    } else {
      // Switching to other tabs: reset search stack so returning later shows default page
      if (_currentIndex == 3 || (_navKeys[3].currentState?.canPop() ?? false)) {
        _navKeys[3].currentState?.popUntil((r) => r.isFirst);
      }
      SearchNav.phase.value = SearchPhase.off;
      _select(i);
    }
  }

  void _onSearchBack() {
    if (_navKeys[3].currentState?.canPop() ?? false) {
      _navKeys[3].currentState?.popUntil((r) => r.isFirst);
    }
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
    RoomDeepLinks.instance.addListener(_onRoomDeepLink);
    RoomDeepLinks.instance.start().then((_) {
      if (mounted) _onRoomDeepLink();
    });

    _notifSub = SystemNotificationService.instance.onDeepLinkOpened
        .listen(_handleNotificationDeepLink);

    // Automatic background update verification & smart engagement checks
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future.delayed(const Duration(seconds: 2));
      if (!mounted) return;
      final info = await UpdateService.instance.checkForUpdate(silent: true);
      if (!mounted) return;
      if (info != null &&
          info.hasUpdate &&
          !UpdateService.instance.hasDismissedPrompt) {
        UpdateService.instance.showUpdateSheet(context, info);
      }

      _runPeriodicEngagementChecks();
    });
  }

  void _handleNotificationDeepLink(String uri) {
    if (!mounted) return;
    final u = uri.trim();
    if (u == 'zenify://atlas') {
      _select(1);
      SystemNotificationService.instance.recordAtlasVisit();
    } else if (u == 'zenify://replay') {
      _openInActiveTab(const ReplayScreen());
      SystemNotificationService.instance.recordReplayVisit();
    } else if (u == 'zenify://update') {
      UpdateService.instance.checkForUpdate(silent: false).then((info) {
        if (mounted && info != null && info.hasUpdate) {
          UpdateService.instance.showUpdateSheet(context, info);
        }
      });
    } else if (u == 'zenify://downloads') {
      _select(2); // Library tab
    } else if (u.startsWith('zenify://room/')) {
      _openInActiveTab(const RoomTogetherScreen());
    }
  }

  Future<void> _runPeriodicEngagementChecks() async {
    await Future.delayed(const Duration(seconds: 4));
    if (!mounted) return;

    // 1. App Update system notification check
    final info = UpdateService.instance.availableUpdate;
    if (info != null && info.hasUpdate) {
      await SystemNotificationService.instance.notifyAppUpdate(
        latestVersion: info.latestVersion,
        releaseNotes: info.releaseNotes,
      );
    }

    if (!mounted) return;

    // 2. Unexplored Music Atlas discovery check
    await SystemNotificationService.instance.notifyAtlasDiscovery();

    if (!mounted) return;

    // 3. Replay Insights & Sunday Digest check
    try {
      final events = await ReplayJournalReader.readAll();
      final totalMins = events.fold<int>(
        0,
        (sum, e) => sum + (e.listenedMs ~/ 60000),
      );
      await SystemNotificationService.instance.notifyReplayInsights(
        totalMinutes: totalMins,
      );
      await SystemNotificationService.instance.notifySundayDigest(
        hours: totalMins / 60.0,
      );
    } catch (_) {}
  }

  void _onRoomDeepLink() {
    if (RoomDeepLinks.instance.pending == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || RoomDeepLinks.instance.pending == null) return;
      _openInActiveTab(const RoomTogetherScreen());
    });
  }

  @override
  void dispose() {
    _notifSub?.cancel();
    RoomDeepLinks.instance.removeListener(_onRoomDeepLink);
    _dockController.dispose();
    super.dispose();
  }

  void _onTabDepthChanged(int tabIndex, int depth) {
    _tabDepths[tabIndex] = depth;
    // Keep bottom navigation dock persistent across all pages and tabs.
    if (depth == 0) {
      DockVisibility.reset();
      _dockController.stop();
      _dockController.animateTo(
        1.0,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      );
      if (mounted) setState(() {});
    } else {
      if (_dockController.value != 1.0) {
        _dockController.value = 1.0;
      }
    }
  }

  Widget _buildTabNav(int index, Widget root) {
    return Navigator(
      key: _navKeys[index],
      observers: [_TabRouteObserver((d) => _onTabDepthChanged(index, d))],
      onGenerateRoute: (settings) =>
          ZenPageRoute(builder: (_) => root, settings: settings),
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
      if (index == 3) {
        SearchNav.phase.value = SearchPhase.off;
      }
      DockVisibility.reset();
      if (_dockController.value != 1.0) {
        _dockController.value = 1.0;
      }
      return;
    }
    // If leaving search tab to another tab, reset search navigator to default
    if (_currentIndex == 3 && (_navKeys[3].currentState?.canPop() ?? false)) {
      _navKeys[3].currentState?.popUntil((r) => r.isFirst);
      SearchNav.phase.value = SearchPhase.off;
    }
    // If switching to search tab, ensure it is at default root page
    if (index == 3) {
      if (_navKeys[3].currentState?.canPop() ?? false) {
        _navKeys[3].currentState?.popUntil((r) => r.isFirst);
      }
      SearchNav.phase.value = SearchPhase.off;
    }
    FocusManager.instance.primaryFocus?.unfocus();
    _tabHistory.remove(_currentIndex);
    _tabHistory.add(_currentIndex);
    setState(() => _currentIndex = index);
    if (index == 1) {
      SystemNotificationService.instance.recordAtlasVisit();
    }
    DockVisibility.reset();
    if (_dockController.value != 1.0) {
      _dockController.value = 1.0;
    }
  }

  Future<void> _handleBack() async {
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
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && (currentNav.canPop() == false)) {
          DockVisibility.reset();
          _dockController.stop();
          _dockController.animateTo(
            1.0,
            duration: const Duration(milliseconds: 280),
            curve: Curves.easeOutCubic,
          );
          setState(() {});
        }
      });
      return;
    }

    // If on search tab and typing search is active, dismiss it back to default page.
    if (_currentIndex == 3 && SearchNav.phase.value == SearchPhase.typing) {
      SearchNav.phase.value = SearchPhase.off;
      return;
    }

    // 2. When end of inner navigation stack is reached, navigate back to the Home page.
    // The app should ONLY consider exiting when the user is already on the Home page.
    if (_currentIndex != 0) {
      _tabHistory.clear();
      _select(0);
      return;
    }

    // 3. User is already on the Home page at root: double-back-to-exit guard.
    final now = DateTime.now();
    if (_lastBackPress == null ||
        now.difference(_lastBackPress!) > const Duration(seconds: 2)) {
      _lastBackPress = now;
      ZenHaptics.light();

      final scaffoldMessenger = ScaffoldMessenger.of(context);
      scaffoldMessenger.hideCurrentSnackBar();

      final safeBottom = MediaQuery.paddingOf(context).bottom;
      final hasTrack = context.read<PlayerState>().currentTrack != null;
      // Position snackbar cleanly above the MiniPlayer + bottom dock clearance without overlapping
      final bottomMargin = hasTrack
          ? (safeBottom + _navHeight + _navMargin + _miniGap + 60.0 + 14.0)
          : (safeBottom + _navHeight + _navMargin + 16.0);

      scaffoldMessenger.showSnackBar(
        SnackBar(
          content: const Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                CupertinoIcons.arrow_uturn_left,
                size: 14,
                color: Color(0xFFE11D48),
              ),
              SizedBox(width: 8),
              Text(
                'Press back again to exit the app.',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  letterSpacing: -0.2,
                ),
              ),
            ],
          ),
          backgroundColor: const Color(0xE618181B),
          duration: const Duration(seconds: 2),
          behavior: SnackBarBehavior.floating,
          elevation: 6,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(
              color: Colors.white.withValues(alpha: 0.12),
              width: 0.8,
            ),
          ),
          margin: EdgeInsets.fromLTRB(28, 0, 28, bottomMargin),
        ),
      );
      return;
    }

    // 4. Confirmed double-back exit: stop playback immediately, clear background service & exit.
    try {
      final playerState = context.read<PlayerState>();
      await playerState.stopAndCleanForExit();
    } catch (_) {}
    try {
      await SystemNavigator.pop();
    } catch (_) {}
    exit(0);
  }

  void _goToArtist(dynamic trackOrArtist) {
    final Track? t = trackOrArtist is Track ? trackOrArtist : null;
    final String raw = t != null
        ? (t.artistNames.isNotEmpty ? t.artistNames.first : t.artist)
        : (trackOrArtist is String
              ? trackOrArtist
              : trackOrArtist?.artist?.toString() ?? '');
    final clean = MediaNormalizer.cleanArtistName(raw);
    final split = MediaNormalizer.splitArtistNames(clean);
    final artist = split.isNotEmpty ? split.first : clean;
    final String? browseId =
        (t != null && t.artists.isNotEmpty && t.artists.first.id.isNotEmpty)
        ? t.artists.first.id
        : null;
    if (artist.isNotEmpty && artist != 'Unknown Artist') {
      _openInActiveTab(
        ArtistScreen(
          artistName: artist,
          browseId: browseId,
          imageUrl: t?.coverUrl,
        ),
      );
    }
  }

  void _goToAlbum(dynamic track) {
    final Track? t = track is Track ? track : null;
    final bool isVideoTrack = (t != null && (t.isVideo || Track.detectIsVideo(t.title, t.album) || t.album.toLowerCase() == 'music video')) ||
        (track != null && Track.detectIsVideo(track.title?.toString() ?? '', track.album?.toString() ?? ''));

    final String rawTitle;
    final dynamic rawArtist;
    final String? cover;
    if (t != null) {
      rawTitle = isVideoTrack
          ? t.title
          : ((t.album.isNotEmpty && t.album != 'Single') ? t.album : t.title);
      rawArtist = t.artist;
      cover = t.coverUrl;
    } else {
      final a = track?.album?.toString();
      final trTitle = track?.title?.toString() ?? 'Album';
      rawTitle = isVideoTrack
          ? trTitle
          : ((a != null && a.isNotEmpty && a != 'Single') ? a : trTitle);
      rawArtist = track?.artist;
      cover = track?.coverUrl?.toString();
    }
    final title = isVideoTrack ? MediaNormalizer.cleanTitle(rawTitle) : MediaNormalizer.cleanAlbumTitle(rawTitle);
    final artist = MediaNormalizer.formatArtists(rawArtist);

    if (isVideoTrack) {
      final vidTrack = (t ??
              Track(
                id: track?.id?.toString() ?? '',
                title: title,
                artist: artist,
                coverUrl: cover ?? '',
                album: 'Music Video',
                isVideo: true,
              ))
          .copyWith(isVideo: true);
      _openInActiveTab(
        AlbumScreen(
          albumTitle: vidTrack.title,
          artistName: vidTrack.artist,
          coverUrl: vidTrack.coverUrl,
          browseId: null,
          initialTracks: [vidTrack],
          isVideo: true,
        ),
      );
      return;
    }

    // CRITICAL: A song's album browseId MUST be an album (MPREb_... or OLAK5uy_...),
    // NEVER a user or curated playlist (PL..., VLPL..., RD...).
    String? albumBrowseId = t?.albumBrowseId;
    if (albumBrowseId != null &&
        (albumBrowseId.startsWith('VLPL') ||
            albumBrowseId.startsWith('PL') ||
            albumBrowseId.startsWith('RD'))) {
      albumBrowseId = null;
    }

    _openInActiveTab(
      AlbumScreen(
        albumTitle: title,
        artistName: artist,
        coverUrl: cover,
        browseId: albumBrowseId,
        initialTracks: t != null ? [t] : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    final hasTrack = context.select<PlayerState, bool>(
      (p) => p.currentTrack != null,
    );

    return ShellNavigationScope(
      openInActiveTab: _openInActiveTab,
      closePlayerSheet: () {
        final player = _playerShellKey.currentState;
        if (player != null && player.isOpen) {
          player.closeSheet();
        }
      },
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (didPop) return;
          _handleBack();
        },
        child: Scaffold(
          resizeToAvoidBottomInset: false,
          extendBody: true,
          backgroundColor: Zen.bg,
          body: ValueListenableBuilder<bool>(
            valueListenable: DockVisibility.hideNavDockNotifier,
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
                            if (notification.metrics.axis != Axis.vertical) {
                              return false;
                            }

                            final player = _playerShellKey.currentState;
                            if (player != null && player.isOpen) return false;

                            // Always restore dock near the top of the page
                            if (notification.metrics.pixels <= 15) {
                              if (_dockController.value < 1.0 &&
                                  !_dockController.isAnimating) {
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
                              if (delta > 1.5 &&
                                  notification.metrics.pixels > 20) {
                                // User is scrolling down: immediately morph into three-dock island layout
                                if (_dockController.value > 0.0 &&
                                    !_dockController.isAnimating) {
                                  _dockController.animateTo(
                                    0.0,
                                    duration: const Duration(milliseconds: 240),
                                    curve: Curves.easeOutCubic,
                                  );
                                }
                              } else if (delta < -3.0) {
                                // User scrolls up: restore to resting dock + floating mini player
                                if (_dockController.value < 1.0 &&
                                    !_dockController.isAnimating) {
                                  _dockController.animateTo(
                                    1.0,
                                    duration: const Duration(milliseconds: 240),
                                    curve: Curves.easeOutCubic,
                                  );
                                }
                              }
                            } else if (notification is UserScrollNotification) {
                              if (notification.direction ==
                                      ScrollDirection.reverse &&
                                  notification.metrics.pixels > 20) {
                                if (_dockController.value > 0.0 &&
                                    !_dockController.isAnimating) {
                                  _dockController.animateTo(
                                    0.0,
                                    duration: const Duration(milliseconds: 240),
                                    curve: Curves.easeOutCubic,
                                  );
                                }
                              } else if (notification.direction ==
                                  ScrollDirection.forward) {
                                if (_dockController.value < 1.0 &&
                                    !_dockController.isAnimating) {
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
                              child: TickerMode(
                                enabled: !isPlayerOpen,
                                child: child!,
                              ),
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
                          offset: hideDocks
                              ? const Offset(0, 3.0)
                              : Offset.zero,
                          duration: const Duration(milliseconds: 260),
                          curve: Curves.easeInOutCubic,
                          child: AnimatedOpacity(
                            opacity: hideDocks ? 0.0 : 1.0,
                            duration: const Duration(milliseconds: 200),
                            child: RepaintBoundary(
                              child: ValueListenableBuilder<double>(
                                valueListenable: PlayerShell.sheetProgress,
                                child: ValueListenableBuilder<SearchPhase>(
                                  valueListenable: SearchNav.phase,
                                  builder: (_, phase, _) => AppleDock(
                                    height: _navHeight,
                                    index: _currentIndex,
                                    searchExpanded: false,
                                    dockProgress: dockProgress,
                                    onSelect: _onDockSelect,
                                    onBack: _onSearchBack,
                                    onSearchTap: () {
                                      if (SearchNav.phase.value ==
                                          SearchPhase.typing) {
                                        SearchNav.phase.value = SearchPhase.off;
                                      } else {
                                        SearchNav.phase.value =
                                            SearchPhase.typing;
                                      }
                                    },
                                    onRestoreDockTap: () {
                                      _dockController.animateTo(
                                        1.0,
                                        duration: const Duration(
                                          milliseconds: 280,
                                        ),
                                        curve: Curves.easeOutCubic,
                                      );
                                    },
                                  ),
                                ),
                                builder: (_, p, child) {
                                  final k = Curves.easeOut.transform(
                                    (p / 0.2).clamp(0.0, 1.0),
                                  );
                                  return IgnorePointer(
                                    ignoring: hideDocks || k > 0.5,
                                    child: Opacity(
                                      opacity: 1 - k,
                                      child: Transform.translate(
                                        offset: Offset(0, 90 * k),
                                        child: child,
                                      ),
                                    ),
                                  );
                                },
                              ),
                            ),
                          ),
                        ),
                      ),

                      // 3. Morphing PlayerShell (mini player pill morphs into center island).
                      Positioned.fill(
                        child: ValueListenableBuilder<bool>(
                          valueListenable:
                              DockVisibility.hideMiniPlayerNotifier,
                          builder: (_, hideMini, _) => PlayerShell(
                            key: _playerShellKey,
                            hideMini: hideMini,
                            dockProgress: dockProgress,
                            miniBottomOffset: miniBottom,
                            onGoToArtist: _goToArtist,
                            onGoToAlbum: _goToAlbum,
                          ),
                        ),
                      ),
                    ],
                  );
                },
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Keeps state and scroll position of all tabs while smoothly animating
/// tab switches with an Apple-style subtle direction-aware fluid spring and fade.
class _AnimatedTabStack extends StatefulWidget {
  const _AnimatedTabStack({required this.index, required this.children});

  final int index;
  final List<Widget> children;

  @override
  State<_AnimatedTabStack> createState() => _AnimatedTabStackState();
}

class _AnimatedTabStackState extends State<_AnimatedTabStack>
    with SingleTickerProviderStateMixin {
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

        final double opacity = t.clamp(0.0, 1.0);
        final Widget childWidget = FractionalTranslation(
          translation: Offset(slideOffset, 0),
          child: Transform.scale(
            scale: 0.992 + 0.008 * t,
            alignment: Alignment.center,
            child: child,
          ),
        );
        if (opacity >= 0.999) return childWidget;
        return Opacity(
          opacity: opacity,
          child: childWidget,
        );
      },
      child: IndexedStack(
        index: widget.index,
        children: [
          for (var i = 0; i < widget.children.length; i++)
            DockActiveTabScope(
              isActive: i == widget.index,
              child: TickerMode(
                enabled: i == widget.index,
                child: widget.children[i],
              ),
            ),
        ],
      ),
    );
  }
}
