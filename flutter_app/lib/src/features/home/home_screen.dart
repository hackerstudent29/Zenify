import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:go_router/go_router.dart';
import '../../core/models/models.dart';
import 'providers/home_providers.dart';
import 'package:audio_service/audio_service.dart';
import '../../shared/providers/audio_provider.dart';
import '../player/services/audio_handler.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trendingTracksAsync = ref.watch(trendingTracksProvider);
    final topArtistsAsync = ref.watch(topArtistsProvider);

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.only(top: 24.0, bottom: 120.0), // Room for nav and miniplayer
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top Action Bar
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'zenify',
                        style: TextStyle(
                          fontFamily: 'Hi',
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -1,
                          color: Colors.white,
                        ),
                      ),
                      Row(
                        children: [
                          IconButton(
                            icon: const Icon(LucideIcons.settings),
                            color: Colors.white54,
                            onPressed: () => context.push('/admin'),
                          ),
                          const SizedBox(width: 8),
                          const CircleAvatar(
                            radius: 16,
                            backgroundImage: NetworkImage('https://ui-avatars.com/api/?name=User&background=111&color=fff'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                
                const SizedBox(height: 32),

                // Trending Tracks Section
                trendingTracksAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFE11D48))),
                  error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Colors.white))),
                  data: (tracks) => _buildSection<Track>(
                    title: 'Trending',
                    icon: LucideIcons.sparkles,
                    items: tracks,
                    isCircular: false,
                    buildItem: (track) => _MiniTrackCard(
                      track: track,
                      isCircular: false,
                      onTap: () {
                        final handler = ref.read(audioHandlerProvider) as MyAudioHandler;
                        final item = MediaItem(
                          id: track.id,
                          title: track.title,
                          artist: track.artist?.name ?? 'Unknown Artist',
                          artUri: track.coverUrl != null ? Uri.parse(track.coverUrl!) : null,
                        );
                        handler.loadAndPlayTrack(track.audioUrl, item);
                      },
                    ),
                  ),
                ),
                
                const SizedBox(height: 48),

                // Top Artists Section
                topArtistsAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator(color: Color(0xFFE11D48))),
                  error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Colors.white))),
                  data: (artists) => _buildSection<Artist>(
                    title: 'Top Artists',
                    icon: LucideIcons.user,
                    items: artists,
                    isCircular: true,
                    buildItem: (artist) => _MiniTrackCard(
                      artist: artist,
                      isCircular: true,
                      onTap: () => context.push('/artist/${artist.id}', extra: artist),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSection<T>({
    required String title,
    required IconData icon,
    required List<T> items,
    required bool isCircular,
    required Widget Function(T) buildItem,
  }) {
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20.0),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(icon, color: Colors.white54, size: 18),
                  const SizedBox(width: 10),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 20, 
                      fontWeight: FontWeight.bold, 
                      color: Colors.white
                    ),
                  ),
                ],
              ),
              Row(
                children: [
                  const Text('VIEW ALL', style: TextStyle(color: Colors.white30, fontSize: 10, letterSpacing: 1.5, fontWeight: FontWeight.w900)),
                  const SizedBox(width: 4),
                  Icon(LucideIcons.chevronRight, color: Colors.white30, size: 12),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          height: isCircular ? 200 : 220,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16.0),
            itemCount: items.length,
            itemBuilder: (context, index) {
              return buildItem(items[index]);
            },
          ),
        ),
      ],
    );
  }
}

class _MiniTrackCard extends ConsumerWidget {
  final Track? track;
  final Artist? artist;
  final bool isCircular;
  final VoidCallback onTap;

  const _MiniTrackCard({
    this.track,
    this.artist,
    required this.isCircular,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = track?.title ?? artist?.name ?? '';
    final subtitle = track != null 
        ? (track!.artist?.name ?? 'Unknown Artist')
        : 'Artist';
    final imageUrl = track?.coverUrl ?? artist?.imageUrl;

    final audioHandler = ref.watch(audioHandlerProvider);
    
    return StreamBuilder<MediaItem?>(
      stream: audioHandler.mediaItem,
      builder: (context, mediaSnapshot) {
        final currentItem = mediaSnapshot.data;
        
        return StreamBuilder<PlaybackState>(
          stream: audioHandler.playbackState,
          builder: (context, playbackSnapshot) {
            final isPlaying = playbackSnapshot.data?.playing ?? false;
            final isCurrentlyPlaying = !isCircular && track != null && currentItem?.id == track!.id;

            return GestureDetector(
              onTap: onTap,
              child: Container(
                width: 140,
                margin: const EdgeInsets.only(right: 16.0),
                child: Column(
                  crossAxisAlignment: isCircular ? CrossAxisAlignment.center : CrossAxisAlignment.start,
                  children: [
                    Stack(
                      alignment: Alignment.center,
                      children: [
                        Container(
                          width: 140,
                          height: 140,
                          decoration: BoxDecoration(
                            color: const Color(0xFF151515),
                            borderRadius: isCircular ? BorderRadius.circular(70) : BorderRadius.circular(8),
                            border: Border.all(color: Colors.white.withOpacity(0.05)),
                            image: imageUrl != null ? DecorationImage(
                              image: CachedNetworkImageProvider(imageUrl),
                              fit: BoxFit.cover,
                            ) : null,
                          ),
                          child: imageUrl == null 
                              ? Icon(isCircular ? LucideIcons.user : LucideIcons.music, color: Colors.white24, size: 40)
                              : null,
                        ),
                        if (isCurrentlyPlaying && isPlaying)
                          Container(
                            width: 140,
                            height: 140,
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.4),
                              borderRadius: isCircular ? BorderRadius.circular(70) : BorderRadius.circular(8),
                            ),
                            child: const Center(
                              child: _DancingBars(),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      title,
                      style: TextStyle(
                        color: isCurrentlyPlaying ? const Color(0xFFE11D48) : Colors.white.withOpacity(0.95), 
                        fontWeight: FontWeight.w600, 
                        fontSize: 13,
                        height: 1.2,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      textAlign: isCircular ? TextAlign.center : TextAlign.left,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: Colors.white38, 
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: isCircular ? TextAlign.center : TextAlign.left,
                    ),
                  ],
                ),
              ),
            );
          }
        );
      }
    );
  }
}

class _DancingBars extends StatefulWidget {
  const _DancingBars();

  @override
  State<_DancingBars> createState() => _DancingBarsState();
}

class _DancingBarsState extends State<_DancingBars> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        _buildBar(0),
        const SizedBox(width: 3),
        _buildBar(0.4),
        const SizedBox(width: 3),
        _buildBar(0.2),
        const SizedBox(width: 3),
        _buildBar(0.6),
      ],
    );
  }

  Widget _buildBar(double delay) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final value = ((_controller.value + delay) % 1.0);
        final height = 4 + (value * 12);
        return Container(
          width: 3,
          height: height,
          decoration: BoxDecoration(
            color: const Color(0xFFE11D48),
            borderRadius: BorderRadius.circular(2),
          ),
        );
      },
    );
  }
}
