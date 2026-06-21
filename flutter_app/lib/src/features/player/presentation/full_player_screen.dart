import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:palette_generator/palette_generator.dart';
import 'dart:ui';
import 'dart:math' as math;
import 'package:audio_service/audio_service.dart';
import 'package:marquee/marquee.dart';
import '../../../shared/providers/audio_provider.dart';
import 'package:miniplayer/miniplayer.dart';
import 'player_overlay.dart' as import_overlay;

class FullScreenPlayer extends ConsumerStatefulWidget {
  final double percentage;
  const FullScreenPlayer({super.key, required this.percentage});

  @override
  ConsumerState<FullScreenPlayer> createState() => _FullScreenPlayerState();
}

class _FullScreenPlayerState extends ConsumerState<FullScreenPlayer> with SingleTickerProviderStateMixin {
  late AnimationController _flipController;
  late Animation<double> _flipAnimation;
  bool _isLyricsView = false;
  
  Color _dominantColor = const Color(0xFF111111);
  String? _lastArtUri;

  @override
  void initState() {
    super.initState();
    _flipController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _flipAnimation = Tween<double>(begin: 0, end: math.pi).animate(
      CurvedAnimation(parent: _flipController, curve: Curves.easeInOutBack),
    );
  }

  @override
  void dispose() {
    _flipController.dispose();
    super.dispose();
  }

  void _toggleLyrics() {
    if (_isLyricsView) {
      _flipController.reverse();
    } else {
      _flipController.forward();
    }
    setState(() {
      _isLyricsView = !_isLyricsView;
    });
  }

  Future<void> _updatePalette(String? artUri) async {
    if (artUri == null || artUri == _lastArtUri) return;
    _lastArtUri = artUri;
    
    try {
      final PaletteGenerator paletteGenerator = await PaletteGenerator.fromImageProvider(
        CachedNetworkImageProvider(artUri),
        maximumColorCount: 10,
      );
      if (mounted && paletteGenerator.dominantColor != null) {
        setState(() {
          _dominantColor = paletteGenerator.dominantColor!.color;
        });
      }
    } catch (e) {
      // Ignore palette extraction errors
    }
  }

  String _formatDuration(Duration? duration) {
    if (duration == null) return "0:00";
    final minutes = duration.inMinutes;
    final seconds = duration.inSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final audioHandler = ref.watch(audioHandlerProvider);
    
    return StreamBuilder<MediaItem?>(
      stream: audioHandler.mediaItem,
      builder: (context, mediaSnapshot) {
        final mediaItem = mediaSnapshot.data;
        if (mediaItem == null) return const SizedBox.shrink();
        
        _updatePalette(mediaItem.artUri?.toString());

        return StreamBuilder<PlaybackState>(
          stream: audioHandler.playbackState,
          builder: (context, playbackSnapshot) {
            final playbackState = playbackSnapshot.data;
            final isPlaying = playbackState?.playing ?? false;
            final position = playbackState?.position ?? Duration.zero;
            final duration = mediaItem.duration ?? Duration.zero;

            return Scaffold(
              backgroundColor: Colors.black,
              body: Stack(
                children: [
                  // Dynamic Background Gradient based on Palette
                  Positioned.fill(
                    child: AnimatedContainer(
                      duration: const Duration(seconds: 1),
                      decoration: BoxDecoration(
                        gradient: RadialGradient(
                          center: const Alignment(-0.5, -0.5),
                          radius: 1.5,
                          colors: [
                            _dominantColor.withOpacity(0.5),
                            Colors.black,
                          ],
                        ),
                      ),
                    ),
                  ),
                  Positioned.fill(
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 80, sigmaY: 80),
                      child: const SizedBox(),
                    ),
                  ),
                  
                  // Drag Handle
                  Positioned(
                    top: 12,
                    left: 0,
                    right: 0,
                    child: Center(
                      child: Container(
                        width: 40,
                        height: 4,
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  ),
                  
                  SafeArea(
                    child: Column(
                      children: [
                        // Top Bar
                        Padding(
                          padding: const EdgeInsets.only(top: 12.0, left: 20.0, right: 20.0, bottom: 20.0),
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              Align(
                                alignment: Alignment.centerLeft,
                                child: IconButton(
                                  icon: const Icon(LucideIcons.chevronDown, color: Colors.white, size: 32),
                                  onPressed: () {
                                    import_overlay.miniplayerController.animateToHeight(state: PanelState.MIN);
                                  },
                                ),
                              ),
                              if (_isLyricsView)
                                Column(
                                  children: [
                                    Text(
                                      mediaItem.title, 
                                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    Text(
                                      mediaItem.artist ?? 'Unknown Artist', 
                                      style: const TextStyle(color: Colors.white54, fontSize: 12),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ],
                                )
                              else
                                const Text(
                                  'NOW PLAYING', 
                                  style: TextStyle(color: Colors.white54, fontSize: 10, letterSpacing: 2.0, fontWeight: FontWeight.w900),
                                ),
                            ],
                          ),
                        ),
                        
                        // 3D Flip Area
                        Expanded(
                          child: Center(
                            child: AnimatedBuilder(
                              animation: _flipAnimation,
                              builder: (context, child) {
                                final value = _flipAnimation.value;
                                final isFront = value < math.pi / 2;
                                
                                final matrix = Matrix4.identity()
                                  ..setEntry(3, 2, 0.001) // perspective
                                  ..rotateY(value);
                                  
                                if (!isFront) {
                                  matrix.rotateY(math.pi);
                                }

                                return Transform(
                                  alignment: Alignment.center,
                                  transform: matrix,
                                  child: isFront ? _buildCoverArt(mediaItem.artUri?.toString()) : _buildLyrics(),
                                );
                              },
                            ),
                          ),
                        ),
                        
                        // Bottom Controls Area
                        AnimatedOpacity(
                          opacity: 1.0,
                          duration: const Duration(milliseconds: 300),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 24.0),
                            child: Column(
                              children: [
                                // Title and Heart
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          SizedBox(
                                            height: 30,
                                            child: mediaItem.title.length > 25 ? Marquee(
                                              text: mediaItem.title,
                                              style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold, height: 1.1),
                                              scrollAxis: Axis.horizontal,
                                              blankSpace: 30.0,
                                              velocity: 30.0,
                                              pauseAfterRound: const Duration(seconds: 2),
                                            ) : Text(
                                              mediaItem.title,
                                              style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold, height: 1.1),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            mediaItem.artist ?? 'Unknown Artist', 
                                            style: const TextStyle(color: Color(0xFFE11D48), fontSize: 16, fontWeight: FontWeight.w500),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ],
                                      ),
                                    ),
                                    IconButton(
                                      icon: const Icon(LucideIcons.heart, color: Colors.white, size: 28),
                                      onPressed: () {},
                                    ),
                                  ],
                                ),
                                
                                const SizedBox(height: 24),
                                
                                // Scrubber
                                StreamBuilder<Duration>(
                                  stream: AudioService.position,
                                  builder: (context, posSnapshot) {
                                    final currentPos = posSnapshot.data ?? position;
                                    double sliderValue = currentPos.inMilliseconds.toDouble();
                                    double maxVal = duration.inMilliseconds.toDouble();
                                    if (sliderValue > maxVal) sliderValue = maxVal;
                                    if (maxVal <= 0) maxVal = 1.0;

                                    return Column(
                                      children: [
                                        SliderTheme(
                                          data: SliderThemeData(
                                            trackHeight: 4,
                                            activeTrackColor: Colors.white,
                                            inactiveTrackColor: Colors.white24,
                                            thumbColor: Colors.white,
                                            overlayColor: Colors.white.withOpacity(0.1),
                                            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                                          ),
                                          child: Slider(
                                            value: sliderValue,
                                            max: maxVal,
                                            onChanged: (val) {
                                              audioHandler.seek(Duration(milliseconds: val.toInt()));
                                            },
                                          ),
                                        ),
                                        Row(
                                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                          children: [
                                            Text(_formatDuration(currentPos), style: const TextStyle(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.w600)),
                                            Text(_formatDuration(duration), style: const TextStyle(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.w600)),
                                          ],
                                        ),
                                      ],
                                    );
                                  }
                                ),
                                
                                const SizedBox(height: 16),
                                
                                // Main Playback Controls
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    IconButton(
                                      icon: const Icon(LucideIcons.shuffle, color: Colors.white54, size: 24),
                                      onPressed: () {},
                                    ),
                                    IconButton(
                                      icon: const Icon(LucideIcons.skipBack, color: Colors.white, size: 40),
                                      onPressed: () => audioHandler.skipToPrevious(),
                                    ),
                                    GestureDetector(
                                      onTap: () => isPlaying ? audioHandler.pause() : audioHandler.play(),
                                      child: Container(
                                        width: 72,
                                        height: 72,
                                        decoration: const BoxDecoration(
                                          color: Colors.white,
                                          shape: BoxShape.circle,
                                        ),
                                        child: Icon(isPlaying ? LucideIcons.pause : LucideIcons.play, color: Colors.black, size: 36),
                                      ),
                                    ),
                                    IconButton(
                                      icon: const Icon(LucideIcons.skipForward, color: Colors.white, size: 40),
                                      onPressed: () => audioHandler.skipToNext(),
                                    ),
                                    IconButton(
                                      icon: const Icon(LucideIcons.repeat, color: Colors.white54, size: 24),
                                      onPressed: () {},
                                    ),
                                  ],
                                ),
                                
                                const SizedBox(height: 24),
                                
                                // Action Row
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                                  children: [
                                    IconButton(
                                      icon: Icon(LucideIcons.mic2, color: _isLyricsView ? const Color(0xFFE11D48) : Colors.white, size: 26),
                                      onPressed: _toggleLyrics,
                                    ),
                                    IconButton(
                                      icon: const Icon(LucideIcons.sparkles, color: Colors.white, size: 26),
                                      onPressed: () {},
                                    ),
                                    IconButton(
                                      icon: const Icon(LucideIcons.listMusic, color: Colors.white, size: 26),
                                      onPressed: () {},
                                    ),
                                  ],
                                ),
                                
                                const SizedBox(height: 16),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          }
        );
      }
    );
  }

  Widget _buildCoverArt(String? artUrl) {
    final targetSize = MediaQuery.of(context).size.width - 48;
    final size = math.max(60.0, targetSize * Curves.easeOutCubic.transform(widget.percentage));

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.5),
            blurRadius: 30,
            offset: const Offset(0, 15),
          )
        ],
        image: artUrl != null ? DecorationImage(
          image: CachedNetworkImageProvider(artUrl),
          fit: BoxFit.cover,
        ) : null,
        color: Colors.grey.shade900,
      ),
      child: artUrl == null 
          ? const Icon(LucideIcons.music, color: Colors.white24, size: 80)
          : null,
    );
  }

  Widget _buildLyrics() {
    return Container(
      width: MediaQuery.of(context).size.width - 48,
      height: MediaQuery.of(context).size.width - 48,
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.5),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
      padding: const EdgeInsets.all(24),
      child: const SingleChildScrollView(
        child: Text(
          "Lyrics synchronization coming soon...\n\n(Playing from backend stream)",
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
            height: 1.5,
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}
