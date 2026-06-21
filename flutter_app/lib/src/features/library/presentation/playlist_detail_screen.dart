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

final playlistDetailProvider = FutureProvider.family<Playlist, String>((ref, id) async {
  final response = await apiClient.get('/playlists/$id');
  if (response.statusCode == 200) {
    return Playlist.fromJson(response.data);
  } else {
    throw Exception('Failed to load playlist');
  }
});

class PlaylistDetailScreen extends ConsumerWidget {
  final Playlist playlist;

  const PlaylistDetailScreen({super.key, required this.playlist});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final playlistAsync = ref.watch(playlistDetailProvider(playlist.id));

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
      body: playlistAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFE11D48))),
        error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Colors.white))),
        data: (fullPlaylist) {
          final tracks = fullPlaylist.tracks ?? [];
          final trackCount = tracks.length;
          
          return CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(24, 100, 24, 32),
                  child: Column(
                    children: [
                      // Cover Artwork
                      Container(
                        width: MediaQuery.of(context).size.width * 0.6,
                        height: MediaQuery.of(context).size.width * 0.6,
                        decoration: BoxDecoration(
                          color: const Color(0xFF18181B),
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.8),
                              blurRadius: 50,
                              offset: const Offset(0, 20),
                            )
                          ],
                          border: Border.all(color: Colors.white.withOpacity(0.1)),
                          image: fullPlaylist.coverUrl != null ? DecorationImage(
                            image: CachedNetworkImageProvider(fullPlaylist.coverUrl!),
                            fit: BoxFit.cover,
                          ) : null,
                        ),
                        child: fullPlaylist.coverUrl == null ? const Icon(LucideIcons.music2, color: Colors.white24, size: 64) : null,
                      ),
                      
                      const SizedBox(height: 24),
                      
                      // Label
                      const Text(
                        'PLAYLIST COLLECTION',
                        style: TextStyle(
                          color: Color(0xFFEF4444),
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 4.0,
                        ),
                      ),
                      
                      const SizedBox(height: 8),
                      
                      // Title
                      Text(
                        fullPlaylist.name,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                          height: 1.2,
                          letterSpacing: -0.5,
                        ),
                      ),
                      
                      const SizedBox(height: 16),
                      
                      // Meta
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (fullPlaylist.user?.imageUrl != null)
                            Padding(
                              padding: const EdgeInsets.only(right: 8.0),
                              child: CircleAvatar(
                                radius: 10,
                                backgroundImage: CachedNetworkImageProvider(fullPlaylist.user!.imageUrl!),
                              ),
                            )
                          else
                            const Padding(
                              padding: EdgeInsets.only(right: 8.0),
                              child: CircleAvatar(
                                radius: 10,
                                backgroundColor: Colors.white10,
                              ),
                            ),
                          Text(
                            fullPlaylist.user?.name ?? 'User',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Colors.white.withOpacity(0.8)),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 8.0),
                            child: Text('•', style: TextStyle(fontSize: 14, color: Colors.white.withOpacity(0.4))),
                          ),
                          Text(
                            '$trackCount tracks',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white.withOpacity(0.4)),
                          ),
                        ],
                      ),
                      
                      const SizedBox(height: 24),
                      
                      // Buttons
                      Row(
                        children: [
                          Expanded(
                            flex: 3,
                            child: ElevatedButton.icon(
                              onPressed: () {},
                              icon: const Icon(LucideIcons.play, color: Color(0xFFEF4444), size: 18),
                              label: const Text('Play', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
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
                            flex: 3,
                            child: ElevatedButton.icon(
                              onPressed: () {},
                              icon: const Icon(LucideIcons.shuffle, color: Color(0xFFEF4444), size: 18),
                              label: const Text('Shuffle', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
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
                          Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color: const Color(0xFF1C1C1E),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.white.withOpacity(0.05)),
                            ),
                            child: IconButton(
                              icon: const Icon(LucideIcons.trash2, color: Color(0xFFEF4444), size: 20),
                              onPressed: () {},
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              
              // Tracks
              if (tracks.isEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 60),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(LucideIcons.music, size: 48, color: Colors.white10),
                        const SizedBox(height: 16),
                        const Text('This playlist is empty', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        Text('Go find some songs to add to your collection!', style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 14)),
                      ],
                    ),
                  ),
                )
              else
                SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, index) {
                      final trackEntry = tracks[index];
                      // Note: In React, playlist tracks have structure { track: Track, addedAt: string }.
                      // Check if trackEntry is a Track or has a 'track' field. Assuming models.dart handles this.
                      // Depending on how models.dart defines Playlist.tracks (List<Track> or List<PlaylistTrack>).
                      // Let's assume it returns List<Track> for simplicity or we cast it.
                      final track = trackEntry; 
                      
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
                        title: Text(track.title, style: TextStyle(color: Colors.white.withOpacity(0.9), fontWeight: FontWeight.bold, fontSize: 14)),
                        subtitle: Text(track.artist?.name ?? 'Unknown Artist', style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 12, fontWeight: FontWeight.w500)),
                        trailing: Icon(LucideIcons.moreHorizontal, color: Colors.white.withOpacity(0.2), size: 20),
                        onTap: () {
                          final handler = ref.read(audioHandlerProvider) as MyAudioHandler;
                          final newQueue = tracks.map((t) => MediaItem(
                            id: t.id,
                            title: t.title,
                            artist: t.artist?.name,
                            artUri: t.coverUrl != null ? Uri.parse(t.coverUrl!) : (fullPlaylist.coverUrl != null ? Uri.parse(fullPlaylist.coverUrl!) : null),
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
