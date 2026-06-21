import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:audio_service/audio_service.dart';
import '../../../core/models/models.dart';
import '../../../core/api/api_client.dart';
import '../../../shared/providers/audio_provider.dart';
import '../../player/services/audio_handler.dart';

final artistDetailProvider = FutureProvider.family<Artist, String>((ref, id) async {
  final response = await apiClient.get('/artists/$id');
  if (response.statusCode == 200) {
    return Artist.fromJson(response.data);
  } else {
    throw Exception('Failed to load artist');
  }
});

class ArtistDetailScreen extends ConsumerWidget {
  final Artist artist;

  const ArtistDetailScreen({super.key, required this.artist});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final artistAsync = ref.watch(artistDetailProvider(artist.id));

    return Scaffold(
      backgroundColor: Colors.black,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: MediaQuery.of(context).size.height * 0.45,
            pinned: true,
            backgroundColor: Colors.black,
            leading: IconButton(
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.5),
                  shape: BoxShape.circle,
                ),
                child: const Icon(LucideIcons.arrowLeft, color: Colors.white, size: 20),
              ),
              onPressed: () => Navigator.pop(context),
            ),
            flexibleSpace: FlexibleSpaceBar(
              titlePadding: const EdgeInsets.only(left: 16, bottom: 16, right: 16),
              title: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    artist.name, 
                    style: const TextStyle(
                      fontFamily: 'Orange Avenue',
                      fontWeight: FontWeight.w900, 
                      color: Color(0xFFF43F5E), // rose-500
                      fontSize: 36, 
                      height: 1.1,
                      shadows: [Shadow(color: Colors.black45, blurRadius: 10, offset: Offset(0, 5))],
                    ),
                  ),
                  const Text(
                    'ARTIST',
                    style: TextStyle(
                      color: Colors.white70,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 2.0,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
              background: Stack(
                fit: StackFit.expand,
                children: [
                  if (artist.coverUrl != null || artist.imageUrl != null)
                    CachedNetworkImage(
                      imageUrl: artist.coverUrl ?? artist.imageUrl!,
                      fit: BoxFit.cover,
                    )
                  else
                    Container(color: const Color(0xFF151515)),
                    
                  // Gradient overlay matching React (black bottom to transparent top)
                  Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Colors.black, Colors.black.withOpacity(0.4), Colors.transparent],
                        begin: Alignment.bottomCenter,
                        end: Alignment.topCenter,
                        stops: const [0.0, 0.4, 1.0],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              child: Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () {},
                      icon: const Icon(LucideIcons.play, color: Color(0xFFEF4444), size: 18),
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
                      icon: const Icon(LucideIcons.shuffle, color: Color(0xFFEF4444), size: 18),
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
            ),
          ),
          
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Text('Popular', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            ),
          ),
          
          artistAsync.when(
            loading: () => const SliverToBoxAdapter(
              child: Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator(color: Color(0xFFE11D48))))
            ),
            error: (err, stack) => SliverToBoxAdapter(
              child: Padding(padding: const EdgeInsets.all(32), child: Center(child: Text('Error loading tracks: $err', style: const TextStyle(color: Colors.white54))))
            ),
            data: (fullArtist) {
              final tracks = fullArtist.tracks ?? [];
              if (tracks.isEmpty) {
                return const SliverToBoxAdapter(
                  child: Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No tracks available', style: TextStyle(color: Colors.white54))))
                );
              }
              
              return SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                    final track = tracks[index];
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                      leading: SizedBox(
                        width: 48,
                        child: Row(
                          children: [
                            SizedBox(width: 24, child: Text('${index + 1}', style: const TextStyle(color: Colors.white54, fontSize: 14))),
                            if (track.coverUrl != null)
                              Container(
                                width: 24,
                                height: 24,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(4),
                                  image: DecorationImage(image: CachedNetworkImageProvider(track.coverUrl!), fit: BoxFit.cover),
                                ),
                              )
                            else
                              const Icon(LucideIcons.music, color: Colors.white24, size: 24),
                          ],
                        ),
                      ),
                      title: Text(track.title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500, fontSize: 14)),
                      subtitle: Text(
                        (track.streams ?? 0).toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (Match m) => '${m[1]},'), 
                        style: const TextStyle(color: Colors.white54, fontSize: 12)
                      ),
                      trailing: const Icon(LucideIcons.moreVertical, color: Colors.white54, size: 20),
                      onTap: () {
                        final handler = ref.read(audioHandlerProvider) as MyAudioHandler;
                        final newQueue = tracks.map((t) => MediaItem(
                          id: t.id,
                          title: t.title,
                          artist: fullArtist.name,
                          artUri: t.coverUrl != null ? Uri.parse(t.coverUrl!) : null,
                          extras: {'audioUrl': t.audioUrl},
                        )).toList();
                        handler.playWithQueue(newQueue, index);
                      },
                    );
                  },
                  childCount: tracks.length,
                ),
              );
            },
          ),
          
          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }
}
