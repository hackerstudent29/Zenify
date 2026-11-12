import 'package:device_preview/device_preview.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'data/datasources/catalog_datasource.dart';
import 'design_system/zen.dart';
import 'services/player_state.dart';
import 'services/queue_state.dart';
import 'services/smart_queue_engine.dart';
import 'services/together_service.dart';
import 'services/studio_fx_state.dart';
import 'services/auth_state.dart';
import 'services/country_service.dart';
import 'services/listening_history_service.dart';
import 'services/listening_tracker_service.dart';
import 'services/room_deep_links.dart';
import 'services/settings_service.dart';
import 'services/cache_migration.dart';
import 'services/library_store.dart';
import 'services/zenify_audio_handler.dart';
import 'views/shell_screen.dart';
import 'views/splash/zenify_splash_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await runCacheMigration();
  await CountryService.instance.init();
  await ListeningHistoryService.instance.init();
  await SettingsState.instance.initialize();
  await ListeningTrackerService.instance.initialize();
  CatalogDataSource.initialize(); // non-blocking background initialization

  final playerState = PlayerState();
  final studioFxState = StudioFxState();
  await studioFxState.load();
  playerState.attachStudioFx(studioFxState);

  final queueState = QueueState();
  queueState.autoplayProvider = (seed, excludeIds, excludeSignatures) =>
      SmartQueueEngine.fetchAndRank(
        seed: seed,
        existingIds: excludeIds,
        existingSignatures: excludeSignatures,
        count: SmartQueueWeights.targetQueueSize,
      );
  playerState.attachQueue(queueState);
  await LibraryStore.instance.ensureLoaded();

  // Initialize background media notifications and lock screen controls
  try {
    await initZenifyAudioService(playerState);
  } catch (e) {
    if (kDebugMode) {
      debugPrint('AudioService initialization error: $e');
    }
  }

  // Edge-to-edge, transparent system bars with light icons (Apple dark look).
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
    systemNavigationBarColor: Colors.transparent,
    systemNavigationBarDividerColor: Colors.transparent,
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  SystemChrome.setPreferredOrientations(const [DeviceOrientation.portraitUp]);

  final bool enableDevicePreview = kIsWeb &&
      !Uri.base.queryParameters.containsKey('raw');

  WidgetsBinding.instance.addPostFrameCallback((_) {
    playerState.prewarm();
  });

  runApp(
    DevicePreview(
      enabled: enableDevicePreview,
      builder: (context) => ZenifyMobileApp(
        playerState: playerState,
        studioFxState: studioFxState,
        queueState: queueState,
      ),
    ),
  );
}

class ZenifyMobileApp extends StatelessWidget {
  const ZenifyMobileApp({
    super.key,
    this.playerState,
    this.studioFxState,
    this.queueState,
  });

  final PlayerState? playerState;
  final StudioFxState? studioFxState;
  final QueueState? queueState;

  static final ThemeData _theme = zenDarkTheme();

  @override
  Widget build(BuildContext context) {
    final fx = studioFxState ?? StudioFxState();
    final player = playerState ?? (PlayerState()..attachStudioFx(fx));
    final queue = queueState ?? QueueState();
    queue.autoplayProvider ??= (seed, excludeIds, excludeSignatures) =>
        SmartQueueEngine.fetchAndRank(
          seed: seed,
          existingIds: excludeIds,
          existingSignatures: excludeSignatures,
          count: SmartQueueWeights.targetQueueSize,
        );
    player.attachQueue(queue);
    final together = TogetherService.instance..attachPlayer(player);
    RoomDeepLinks.instance.start();

    return MultiProvider(
      providers: [
        ChangeNotifierProvider<StudioFxState>.value(value: fx),
        ChangeNotifierProvider<PlayerState>.value(value: player),
        ChangeNotifierProvider<QueueState>.value(value: queue),
        ChangeNotifierProvider<TogetherService>.value(value: together),
        ChangeNotifierProvider(create: (_) => AuthState()),
        ChangeNotifierProvider<SettingsState>.value(value: SettingsState.instance),
        ChangeNotifierProvider<IslandNotifier>.value(value: IslandNotifier.instance),
      ],
      child: MaterialApp(
        title: 'Zenify',
        debugShowCheckedModeBanner: false,
        locale: DevicePreview.locale(context),
        theme: _theme,
        darkTheme: _theme,
        themeMode: ThemeMode.dark,
        builder: (context, child) {
          final app = DevicePreview.appBuilder(context, child);
          // Rubber-band scrolling + mouse/trackpad drag everywhere.
          return ScrollConfiguration(
            behavior: const ZenScrollBehavior(),
            child: app,
          );
        },
        home: const _AppEntrance(child: ShellScreen()),
      ),
    );
  }
}

/// Orchestrated luxury launch entrance: Zenify 6-letter luxury entrance animation
/// runs first, then fluidly cross-fades into the main app shell with a smooth spring.
class _AppEntrance extends StatefulWidget {
  const _AppEntrance({required this.child});
  final Widget child;

  @override
  State<_AppEntrance> createState() => _AppEntranceState();
}

class _AppEntranceState extends State<_AppEntrance> {
  bool _splashDone = false;

  @override
  Widget build(BuildContext context) {
    if (!_splashDone) {
      return ZenifySplashScreen(
        onFinished: () {
          if (mounted) setState(() => _splashDone = true);
        },
      );
    }

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 650),
      curve: Curves.easeOutCubic,
      child: widget.child,
      builder: (context, t, child) => Opacity(
        opacity: t.clamp(0.0, 1.0),
        child: Transform.scale(scale: 0.98 + 0.02 * t, child: child),
      ),
    );
  }
}