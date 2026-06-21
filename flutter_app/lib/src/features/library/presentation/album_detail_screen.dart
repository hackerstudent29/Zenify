import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../../../core/models/models.dart';

class AlbumDetailScreen extends StatelessWidget {
  final Album album;

  const AlbumDetailScreen({super.key, required this.album});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 300,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  if (album.coverUrl != null)
                    CachedNetworkImage(
                      imageUrl: album.coverUrl!,
                      fit: BoxFit.cover,
                    )
                  else
                    Container(color: Colors.grey.shade900),
                  // Gradient overlay
                  Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Colors.transparent, Colors.black],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                  ),
                  Positioned(
                    bottom: 16,
                    left: 16,
                    right: 16,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          album.title,
                          style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Colors.white),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            CircleAvatar(
                              radius: 12,
                              backgroundImage: album.artist?.imageUrl != null 
                                  ? CachedNetworkImageProvider(album.artist!.imageUrl!) 
                                  : null,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              album.artist?.name ?? 'Unknown Artist',
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ],
                    ),
                  )
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(LucideIcons.heart, color: Colors.white54),
                    onPressed: () {},
                  ),
                  IconButton(
                    icon: const Icon(LucideIcons.downloadCloud, color: Colors.white54),
                    onPressed: () {},
                  ),
                  IconButton(
                    icon: const Icon(LucideIcons.moreVertical, color: Colors.white54),
                    onPressed: () {},
                  ),
                  const Spacer(),
                  FloatingActionButton(
                    onPressed: () {},
                    backgroundColor: Colors.greenAccent,
                    foregroundColor: Colors.black,
                    child: const Icon(LucideIcons.play),
                  ),
                ],
              ),
            ),
          ),
          SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, index) {
                return ListTile(
                  leading: const Text('1', style: TextStyle(color: Colors.white54)),
                  title: Text('Album Track ${index + 1}', style: const TextStyle(color: Colors.white)),
                  subtitle: Text(album.artist?.name ?? '', style: const TextStyle(color: Colors.white54)),
                  trailing: const Icon(LucideIcons.moreHorizontal, color: Colors.white54),
                  onTap: () {},
                );
              },
              childCount: 12,
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }
}
