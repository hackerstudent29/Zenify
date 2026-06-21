import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/models/models.dart';
import '../repositories/home_repository.dart';

final homeRepositoryProvider = Provider<HomeRepository>((ref) {
  return HomeRepository();
});

final trendingTracksProvider = FutureProvider<List<Track>>((ref) async {
  final repository = ref.watch(homeRepositoryProvider);
  return repository.getTrendingTracks();
});

final topArtistsProvider = FutureProvider<List<Artist>>((ref) async {
  final repository = ref.watch(homeRepositoryProvider);
  return repository.getTopArtists();
});

final featuredTracksProvider = FutureProvider<List<Track>>((ref) async {
  final repository = ref.watch(homeRepositoryProvider);
  return repository.getFeaturedTracks();
});

final newArrivalsProvider = FutureProvider<List<Track>>((ref) async {
  final repository = ref.watch(homeRepositoryProvider);
  return repository.getNewArrivals();
});

final recommendationsProvider = FutureProvider<List<Track>>((ref) async {
  final repository = ref.watch(homeRepositoryProvider);
  return repository.getRecommendations();
});
