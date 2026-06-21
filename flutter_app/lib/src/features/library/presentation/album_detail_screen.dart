import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:audio_service/audio_service.dart';
import '../../../core/models/models.dart';
import '../../../core/api/api_client.dart';
import '../../../shared/providers/audio_provider.dart';
import '../../player/services/audio_handler.dart';
import 'package:go_router/go_router.dart';

final albumDetailProvider = FutureProvider.family<Album, String>((ref, id) async {
  final response = await apiClient.get('/albums/$id');
  if (response.statusCode == 200) {
    return Album.fromJson(response.data);
  } else {
    throw Exception('Failed to load album');
  }
});

class AlbumDetailScreen extends ConsumerWidget {
  final Album album;

  const AlbumDetailScreen({super.key, required this.album});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final albumAsync = ref.watch(albumDetailProvider(album.id));

    return Scaffold(
      backgroundColor: const Color(0xFF000000),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
          onPressed: () => context.pop(),
        ),
      ),
      extendBodyBehindAppBar: true,
      body: albumAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFE11D48))),
        error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Colors.white))),
        data: (fullAlbum) {
          final tracks = fullAlbum.tracks ?? [];
          final releaseYear = fullAlbum.releaseDate != null ? fullAlbum.releaseDate!.year : 2024;
          
          return CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 100, 24, 32),
                  child: Column(
                    children: [
                      // Album Artwork
                      Container(
                        width: MediaQuery.of(context).size.width * 0.55,
                        height: MediaQuery.of(context).size.width * 0.55,
                        decoration: BoxDecoration(
                          color: const Color(0xFF18181B),
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.5),
                              blurRadius: 20,
                              offset: const Offset(0, 10),
                            )
                          ],
                          image: fullAlbum.coverUrl != null ? DecorationImage(
                            image: CachedNetworkImageProvider(fullAlbum.coverUrl!),
                            fit: BoxFit.cover,
                          ) : null,
                        ),
                        child: fullAlbum.coverUrl == null ? const Icon(LucideIcons.disc3, color: Colors.white24, size: 64) : null,
                      ),
                      
                      const SizedBox(height: 24),
                      
                      // Title
                      Text(
                        fullAlbum.title,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                          height: 1.2,
                        ),
                      ),
                      
                      const SizedBox(height: 8),
                      
                      // Artist
                      Text(
                        fullAlbum.artist?.name ?? 'Unknown Artist',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withOpacity(0.8),
                        ),
                      ),
                      
                      const SizedBox(height: 12),
                      
                      // Meta
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            fullAlbum.genre ?? 'Soundtrack',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white.withOpacity(0.4), letterSpacing: 1.5),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 8.0),
                            child: Text('•', style: TextStyle(fontSize: 11, color: Colors.white.withOpacity(0.4))),
                          ),
                          Text(
                            '$releaseYear',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white.withOpacity(0.4), letterSpacing: 1.5),
                          ),
                        ],
                      ),
                      
                      const SizedBox(height: 24),
                      
                      // Buttons
                      Row(
                        children: [
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: () {},
                              icon: const Icon(LucideIcons.play, color: Color(0xFFE11D48), size: 18),
                              label: const Text('Play', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF1C1C1E),
                                foregroundColor: Colors.white,
                                elevation: 0,
                                minimumSize: const Size(0, 48),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  side: BorderSide(color: Colors.white.withOpacity(0.05)),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: () {},
                              icon: const Icon(LucideIcons.shuffle, color: Color(0xFFE11D48), size: 18),
                              label: const Text('Shuffle', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF1C1C1E),
                                foregroundColor: Colors.white,
                                elevation: 0,
                                minimumSize: const Size(0, 48),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                  side: BorderSide(color: Colors.white.withOpacity(0.05)),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              
              // Tracks
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final track = tracks[index];
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                      leading: SizedBox(
                        width: 24,
                        child: Center(
                          child: Text(
                            '${index + 1}',
                            style: TextStyle(color: Colors.white.withOpacity(0.2), fontWeight: FontWeight.bold, fontSize: 14),
                          ),
                        ),
                      ),
                      title: Text(track.title, style: TextStyle(color: Colors.white.withOpacity(0.8), fontWeight: FontWeight.bold, fontSize: 14)),
                      subtitle: Text(track.artist?.name ?? fullAlbum.artist?.name ?? 'Unknown', style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 12, fontWeight: FontWeight.w500)),
                      trailing: Icon(LucideIcons.moreHorizontal, color: Colors.white.withOpacity(0.2), size: 20),
                      onTap: () {
                        final handler = ref.read(audioHandlerProvider) as MyAudioHandler;
                        final newQueue = tracks.map((t) => MediaItem(
                          id: t.id,
                          title: t.title,
                          artist: t.artist?.name ?? fullAlbum.artist?.name,
                          artUri: t.coverUrl != null ? Uri.parse(t.coverUrl!) : (fullAlbum.coverUrl != null ? Uri.parse(fullAlbum.coverUrl!) : null),
                          extras: {'audioUrl': t.audioUrl},
                        )).toList();
                        handler.playWithQueue(newQueue, index);
                      },
                    );
                  },
                  childCount: tracks.length,
                ),
              ),
              
              const SliverToBoxAdapter(child: SizedBox(height: 120)),
            ],
          );
        },
      ),
    );
  }
}
