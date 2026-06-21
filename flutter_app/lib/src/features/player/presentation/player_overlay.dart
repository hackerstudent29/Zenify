import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:miniplayer/miniplayer.dart';
import 'package:audio_service/audio_service.dart';
import '../../../shared/providers/audio_provider.dart';
import 'full_player_screen.dart';
import 'dart:ui';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:marquee/marquee.dart';
import 'package:cached_network_image/cached_network_image.dart';

final MiniplayerController miniplayerController = MiniplayerController();
final ValueNotifier<double> playerExpandProgress = ValueNotifier(0.0);

class PlayerOverlay extends ConsumerWidget {
  final double bottomNavHeight;

  const PlayerOverlay({super.key, required this.bottomNavHeight});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final audioHandler = ref.watch(audioHandlerProvider);

    return StreamBuilder<MediaItem?>(
      stream: audioHandler.mediaItem,
      builder: (context, mediaSnapshot) {
        final mediaItem = mediaSnapshot.data;
        if (mediaItem == null) return const SizedBox.shrink();

        return Miniplayer(
          controller: miniplayerController,
          minHeight: 60 + bottomNavHeight + 8, // 60px player + bottomNav + padding
          maxHeight: MediaQuery.of(context).size.height,
          duration: const Duration(milliseconds: 400),
          curve: Curves.easeOutQuart,
          builder: (height, percentage) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (playerExpandProgress.value != percentage) {
                playerExpandProgress.value = percentage;
              }
            });
            final isMini = percentage < 0.1;
            
            // Crossfade between mini and full player
            return Stack(
              children: [
                // We use opacity to crossfade. 
                // Full player fades in as percentage goes up — only built when large enough
                if (percentage > 0.15)
                  Opacity(
                    opacity: ((percentage - 0.15) / 0.5).clamp(0.0, 1.0),
                    child: FullScreenPlayer(percentage: percentage),
                  ),

                // Mini player fades out as percentage goes up
                if (percentage < 0.2)
                  Opacity(
                    opacity: (1 - percentage * 5).clamp(0.0, 1.0),
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: Container(
                        margin: const EdgeInsets.only(left: 12, right: 12),
                        height: 60,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(30),
                          border: Border.all(color: Colors.white.withOpacity(0.1)),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.5),
                              blurRadius: 20,
                              offset: const Offset(0, -4),
                            )
                          ],
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(30),
                          child: BackdropFilter(
                            filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                            child: Container(
                              color: Colors.white.withOpacity(0.05),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                              child: StreamBuilder<PlaybackState>(
                                stream: audioHandler.playbackState,
                                builder: (context, playbackSnapshot) {
                                  final isPlaying = playbackSnapshot.data?.playing ?? false;
                                  return Row(
                                    children: [
                                      Container(
                                        width: 44,
                                        height: 44,
                                        decoration: BoxDecoration(
                                          color: Colors.grey.shade900,
                                          borderRadius: BorderRadius.circular(4),
                                          image: mediaItem.artUri != null 
                                              ? DecorationImage(
                                                  image: CachedNetworkImageProvider(mediaItem.artUri!.toString()),
                                                  fit: BoxFit.cover,
                                                )
                                              : null,
                                        ),
                                        child: mediaItem.artUri == null 
                                            ? const Icon(Icons.music_note, color: Colors.white54)
                                            : null,
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          children: [
                                            SizedBox(
                                              height: 18,
                                              child: mediaItem.title.length > 20 ? Marquee(
                                                text: mediaItem.title,
                                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                                scrollAxis: Axis.horizontal,
                                                blankSpace: 20.0,
                                                velocity: 30.0,
                                                pauseAfterRound: const Duration(seconds: 2),
                                              ) : Text(
                                                mediaItem.title,
                                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              mediaItem.artist ?? 'Unknown Artist',
                                              style: const TextStyle(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.w500),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ],
                                        ),
                                      ),
                                      IconButton(
                                        icon: Icon(isPlaying ? LucideIcons.pause : LucideIcons.play, color: Colors.white, size: 24),
                                        onPressed: () => isPlaying ? audioHandler.pause() : audioHandler.play(),
                                      ),
                                      IconButton(
                                        icon: const Icon(LucideIcons.skipForward, color: Colors.white, size: 24),
                                        onPressed: () => audioHandler.skipToNext(),
                                      ),
                                    ],
                                  );
                                },
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            );
          },
        );
      },
    );
  }
}
