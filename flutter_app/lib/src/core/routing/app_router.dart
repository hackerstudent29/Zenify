import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../features/home/home_screen.dart';
import '../../features/search/search_screen.dart';
import '../../features/library/library_screen.dart';
import '../../shared/widgets/app_layout.dart';
import '../../features/library/presentation/artist_detail_screen.dart';
import '../../features/library/presentation/album_detail_screen.dart';
import '../../features/library/presentation/playlist_detail_screen.dart';
import '../../features/admin/admin_screen.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/admin/admin_tracks_screen.dart';
import '../../features/admin/admin_artists_screen.dart';
import '../../features/admin/admin_lyric_sync_screen.dart';
import '../../features/admin/admin_playlist_import_screen.dart';
import '../../features/local_files/local_files_screen.dart';
import '../models/models.dart';

final GlobalKey<NavigatorState> _rootNavigatorKey = GlobalKey<NavigatorState>();
final GlobalKey<NavigatorState> _homeNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'home');
final GlobalKey<NavigatorState> _adminNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'admin');
final GlobalKey<NavigatorState> _localFilesNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'localFiles');
final GlobalKey<NavigatorState> _searchNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'search');
final GlobalKey<NavigatorState> _libraryNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'library');

List<RouteBase> _getDetailRoutes() {
  return [
    GoRoute(
      path: 'artist/:id',
      builder: (context, state) {
        final artist = state.extra as Artist?;
        // If extra is null, we could fetch by id, but for now we expect extra
        if (artist == null) return const Scaffold(body: Center(child: Text('Error: No artist provided')));
        return ArtistDetailScreen(artist: artist);
      },
    ),
    GoRoute(
      path: 'album/:id',
      builder: (context, state) {
        final album = state.extra as Album?;
        if (album == null) return const Scaffold(body: Center(child: Text('Error: No album provided')));
        return AlbumDetailScreen(album: album);
      },
    ),
    GoRoute(
      path: 'playlist/:id',
      builder: (context, state) {
        final playlist = state.extra as Playlist?;
        if (playlist == null) return const Scaffold(body: Center(child: Text('Error: No playlist provided')));
        return PlaylistDetailScreen(playlist: playlist);
      },
    ),
    GoRoute(
      path: 'track/:id',
      builder: (context, state) {
        final track = state.extra as Track?;
        if (track == null) return const Scaffold(body: Center(child: Text('Error: No track provided')));
        // TODO: implement TrackDetailScreen if it exists, or just return empty for now
        return Scaffold(
          appBar: AppBar(title: Text(track.title)),
          body: Center(child: Text('Track Detail Screen Coming Soon')),
        );
      },
    ),
  ];
}

final goRouter = GoRouter(
  initialLocation: '/',
  navigatorKey: _rootNavigatorKey,
  routes: [
    GoRoute(
      path: '/login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/settings',
      builder: (context, state) => const SettingsScreen(),
    ),
    GoRoute(
      path: '/profile',
      builder: (context, state) => const ProfileScreen(),
    ),
    GoRoute(
      path: '/admin/tracks',
      builder: (context, state) => const AdminTracksScreen(),
    ),
    GoRoute(
      path: '/admin/artists',
      builder: (context, state) => const AdminArtistsScreen(),
    ),
    GoRoute(
      path: '/admin/lyric-sync',
      builder: (context, state) => const AdminLyricSyncScreen(),
    ),
    GoRoute(
      path: '/admin/playlist-import',
      builder: (context, state) => const AdminPlaylistImportScreen(),
    ),
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
              routes: _getDetailRoutes(),
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
          navigatorKey: _localFilesNavigatorKey,
          routes: [
            GoRoute(
              path: '/local-files',
              builder: (context, state) => const LocalFilesScreen(),
            ),
          ],
        ),
        StatefulShellBranch(
          navigatorKey: _searchNavigatorKey,
          routes: [
            GoRoute(
              path: '/search',
              builder: (context, state) => const SearchScreen(),
              routes: _getDetailRoutes(),
            ),
          ],
        ),
        StatefulShellBranch(
          navigatorKey: _libraryNavigatorKey,
          routes: [
            GoRoute(
              path: '/library',
              builder: (context, state) => const LibraryScreen(),
              routes: _getDetailRoutes(),
            ),
          ],
        ),
      ],
    ),
  ],
);
