import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../repositories/library_repository.dart';

final libraryRepositoryProvider = Provider<LibraryRepository>((ref) {
  return LibraryRepository();
});

final myPlaylistsProvider = FutureProvider<List<Playlist>>((ref) async {
  final repository = ref.watch(libraryRepositoryProvider);
  return repository.getMyPlaylists();
});
