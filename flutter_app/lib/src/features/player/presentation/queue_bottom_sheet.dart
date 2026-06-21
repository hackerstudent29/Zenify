import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:audio_service/audio_service.dart';
import '../../../shared/providers/audio_provider.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../services/audio_handler.dart';

class QueueBottomSheet extends ConsumerWidget {
  const QueueBottomSheet({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final audioHandler = ref.watch(audioHandlerProvider) as MyAudioHandler;

    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF111111),
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 0, vertical: 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 24),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 24.0),
            child: Row(
              children: [
                Icon(LucideIcons.listMusic, color: Colors.white, size: 24),
                SizedBox(width: 12),
                Text(
                  'Up Next',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    fontFamily: 'Orange Avenue',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          
          StreamBuilder<QueueState>(
            stream: audioHandler.queueState,
            builder: (context, snapshot) {
              final queueState = snapshot.data;
              final queue = queueState?.queue ?? [];
              
              if (queue.isEmpty) {
                return const Padding(
                  padding: EdgeInsets.all(24.0),
                  child: Center(
                    child: Text(
                      'Your queue is empty',
                      style: TextStyle(color: Colors.white54),
                    ),
                  ),
                );
              }
              
              return ConstrainedBox(
                constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.5),
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: queue.length,
                  itemBuilder: (context, index) {
                    final item = queue[index];
                    final isPlaying = queueState?.queueIndex == index;
                    
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
                      leading: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: Colors.grey.shade900,
                          borderRadius: BorderRadius.circular(8),
                          image: item.artUri != null ? DecorationImage(
                            image: CachedNetworkImageProvider(item.artUri!.toString()),
                            fit: BoxFit.cover,
                          ) : null,
                        ),
                        child: isPlaying ? const Center(
                          child: Icon(LucideIcons.barChart2, color: Color(0xFFE11D48)),
                        ) : (item.artUri == null ? const Icon(LucideIcons.music, color: Colors.white24) : null),
                      ),
                      title: Text(
                        item.title,
                        style: TextStyle(
                          color: isPlaying ? const Color(0xFFE11D48) : Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Text(
                        item.artist ?? 'Unknown Artist',
                        style: const TextStyle(color: Colors.white54, fontSize: 12),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: IconButton(
                        icon: const Icon(LucideIcons.moreHorizontal, color: Colors.white54),
                        onPressed: () {},
                      ),
                      onTap: () {
                        audioHandler.skipToQueueItem(index);
                      },
                    );
                  },
                ),
              );
            },
          ),
          
          SizedBox(height: MediaQuery.of(context).padding.bottom),
        ],
      ),
    );
  }
}
