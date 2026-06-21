import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../features/home/home_screen.dart';
import '../../features/search/search_screen.dart';
import '../../features/library/library_screen.dart';
import '../../shared/widgets/app_layout.dart';
import '../../features/library/presentation/artist_detail_screen.dart';
import '../../features/admin/admin_screen.dart';
import '../../features/pricing/pricing_screen.dart';
import '../models/models.dart';

final GlobalKey<NavigatorState> _rootNavigatorKey = GlobalKey<NavigatorState>();
final GlobalKey<NavigatorState> _homeNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'home');
final GlobalKey<NavigatorState> _adminNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'admin');
final GlobalKey<NavigatorState> _pricingNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'pricing');
final GlobalKey<NavigatorState> _searchNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'search');
final GlobalKey<NavigatorState> _libraryNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'library');

final goRouter = GoRouter(
  initialLocation: '/',
  navigatorKey: _rootNavigatorKey,
  routes: [
    StatefulShellRoute.indexedStack(
      builder: (context, state, navigationShell) {
        return AppLayout(navigationShell: navigationShell);
      },
      branches: [
        StatefulShellBranch(
          navigatorKey: _homeNavigatorKey,
          routes: [
            GoRoute(
              path: '/',
              builder: (context, state) => const HomeScreen(),
              routes: [
                GoRoute(
                  path: 'artist/:id',
                  builder: (context, state) {
                    final artist = state.extra as Artist?;
                    if (artist == null) return const Scaffold(body: Center(child: Text('Error: No artist provided')));
                    return ArtistDetailScreen(artist: artist);
                  },
                ),
              ],
            ),
          ],
        ),
        StatefulShellBranch(
          navigatorKey: _adminNavigatorKey,
          routes: [
            GoRoute(
              path: '/admin',
              builder: (context, state) => const AdminScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          navigatorKey: _pricingNavigatorKey,
          routes: [
            GoRoute(
              path: '/pricing',
              builder: (context, state) => const PricingScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          navigatorKey: _searchNavigatorKey,
          routes: [
            GoRoute(
              path: '/search',
              builder: (context, state) => const SearchScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          navigatorKey: _libraryNavigatorKey,
          routes: [
            GoRoute(
              path: '/library',
              builder: (context, state) => const LibraryScreen(),
            ),
          ],
        ),
      ],
    ),
  ],
);
