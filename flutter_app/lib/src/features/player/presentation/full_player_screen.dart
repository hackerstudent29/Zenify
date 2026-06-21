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
import 'studio_fx_bottom_sheet.dart';
import 'queue_bottom_sheet.dart';
import 'lyrics_view.dart';
import '../../../core/api/api_client.dart';

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
  
  Widget? _cachedLyricsView;
  String? _cachedLyricsTrackId;
  String? _currentTrackId;
  bool _isLiked = false;

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

  Future<void> _checkLikedState(String trackId) async {
    try {
      final response = await apiClient.get('/tracks/liked');
      if (response.statusCode == 200 && response.data != null) {
        final List<dynamic> likedTracks = response.data;
        final isLiked = likedTracks.any((t) => t['id'].toString() == trackId);
        if (mounted && trackId == _currentTrackId) {
          setState(() {
            _isLiked = isLiked;
          });
        }
      }
    } catch (e) {
      print('Error checking liked state: $e');
    }
  }

  Future<void> _toggleLike(String trackId) async {
    setState(() {
      _isLiked = !_isLiked;
    });
    try {
      await apiClient.post('/tracks/$trackId/like');
    } catch (e) {
      if (mounted && _currentTrackId == trackId) {
        setState(() {
          _isLiked = !_isLiked;
        });
      }
      print('Error toggling like: $e');
    }
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

        if (_currentTrackId != mediaItem.id) {
          _currentTrackId = mediaItem.id;
          _isLiked = false;
          _checkLikedState(mediaItem.id);
        }

        return StreamBuilder<PlaybackState>(
          stream: audioHandler.playbackState,
          builder: (context, playbackSnapshot) {
            final playbackState = playbackSnapshot.data;
            final isPlaying = playbackState?.playing ?? false;
            final position = playbackState?.position ?? Duration.zero;
            final duration = mediaItem.duration ?? Duration.zero;

            return LayoutBuilder(
              builder: (context, constraints) {
                final double layoutHeight = constraints.maxHeight;
                final double layoutWidth = constraints.maxWidth;
                final bool isShortScreen = layoutHeight < 740;

                // Artwork limits dynamically based on layoutHeight
                double artworkSize = layoutWidth - 48;
                if (layoutHeight < 670) {
                  artworkSize = math.min(artworkSize, 210.0);
                } else if (layoutHeight < 740) {
                  artworkSize = math.min(artworkSize, 290.0);
                } else {
                  artworkSize = math.min(artworkSize, 360.0);
                }

                // Lyrics limits dynamically based on layoutHeight
                double lyricsHeight = layoutHeight * 0.55;
                if (layoutHeight < 670) {
                  lyricsHeight = layoutHeight * 0.45;
                } else if (layoutHeight < 740) {
                  lyricsHeight = layoutHeight * 0.50;
                }

                final double playBgSize = isShortScreen ? 64.0 : 80.0;
                final double playIconSize = isShortScreen ? 36.0 : 44.0;
                final double skipIconSize = isShortScreen ? 28.0 : 38.0;

                // Calculate layout heights to dynamically size/clamp the 3D Flip Area
                final double topBarHeight = 84.0;
                final double bottomMetaHeight = _isLyricsView ? 0.0 : (isShortScreen ? 65.0 : 85.0);
                final double scrubberHeight = 70.0;
                final double playbackControlsHeight = playBgSize + 16.0;
                final double actionRowHeight = 60.0;
                final double bottomSpacing = isShortScreen ? 8.0 : 16.0;

                final double totalNonFlipHeight = topBarHeight +
                    bottomMetaHeight +
                    scrubberHeight +
                    playbackControlsHeight +
                    actionRowHeight +
                    bottomSpacing +
                    40.0;

                double remainingHeight = layoutHeight - totalNonFlipHeight;
                if (remainingHeight < 50.0) {
                  remainingHeight = 50.0;
                }

                // Make sure artwork and lyrics fit in the remaining height
                artworkSize = math.min(artworkSize, remainingHeight);
                lyricsHeight = math.min(lyricsHeight, remainingHeight);

                return Scaffold(
                  backgroundColor: Colors.black,
                  body: Stack(
                    clipBehavior: Clip.hardEdge,
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
                        child: SingleChildScrollView(
                          physics: const NeverScrollableScrollPhysics(),
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
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Text(
                                            mediaItem.title, 
                                            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          const SizedBox(height: 2),
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
                              
                              // 3D Flip Area (Artwork or Lyrics)
                              SizedBox(
                                height: remainingHeight,
                                child: Center(
                                  child: AnimatedBuilder(
                                    animation: _flipAnimation,
                                    builder: (context, child) {
                                      final value = _flipAnimation.value;
                                      final isFront = value < math.pi / 2;
                                      
                                      final double currentHeight = isFront ? artworkSize : lyricsHeight;
                                      final double currentWidth = isFront ? artworkSize : (layoutWidth - 48);

                                      final matrix = Matrix4.identity()
                                        ..setEntry(3, 2, 0.001) // perspective
                                        ..rotateY(value);
                                        
                                      if (!isFront) {
                                        matrix.rotateY(math.pi);
                                      }

                                      return Transform(
                                        alignment: Alignment.center,
                                        transform: matrix,
                                        child: SizedBox(
                                          width: currentWidth,
                                          height: currentHeight,
                                          child: isFront 
                                              ? _buildCoverArt(mediaItem.artUri?.toString()) 
                                              : _buildLyrics(mediaItem),
                                        ),
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
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                // Meta Section (Title, Artist, and menu)
                                AnimatedOpacity(
                                  duration: const Duration(milliseconds: 400),
                                  opacity: _isLyricsView ? 0.0 : 1.0,
                                  child: AnimatedContainer(
                                    duration: const Duration(milliseconds: 400),
                                    curve: Curves.easeInOutCubic,
                                    height: _isLyricsView ? 0 : (isShortScreen ? 65 : 85),
                                    child: SingleChildScrollView(
                                      physics: const NeverScrollableScrollPhysics(),
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Row(
                                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                            children: [
                                              Expanded(
                                                child: mediaItem.title.length > 25 ? SizedBox(
                                                  height: 30,
                                                  child: Marquee(
                                                    text: mediaItem.title,
                                                    style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold, height: 1.1),
                                                    scrollAxis: Axis.horizontal,
                                                    blankSpace: 30.0,
                                                    velocity: 30.0,
                                                    pauseAfterRound: const Duration(seconds: 2),
                                                  ),
                                                ) : Text(
                                                  mediaItem.title,
                                                  style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold, height: 1.1),
                                                  maxLines: 1,
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                              ),
                                              PopupMenuButton<String>(
                                                icon: const Icon(LucideIcons.moreVertical, color: Colors.white54, size: 26),
                                                color: const Color(0xFF09090B),
                                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                                                onSelected: (val) {
                                                  // Menu items action stub (matches premium web player menu items)
                                                },
                                                itemBuilder: (context) => [
                                                  const PopupMenuItem(
                                                    value: 'artist',
                                                    child: Row(
                                                      children: [
                                                        Icon(LucideIcons.user, color: Colors.white70, size: 18),
                                                        SizedBox(width: 8),
                                                        Text('Go to Artist', style: TextStyle(color: Colors.white)),
                                                      ],
                                                    ),
                                                  ),
                                                  const PopupMenuItem(
                                                    value: 'download',
                                                    child: Row(
                                                      children: [
                                                        Icon(LucideIcons.download, color: Colors.white70, size: 18),
                                                        SizedBox(width: 8),
                                                        Text('Download Track', style: TextStyle(color: Colors.white)),
                                                      ],
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ],
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
                                  ),
                                ),
                                
                                SizedBox(height: _isLyricsView ? 8 : (isShortScreen ? 12 : 24)),
                                
                                // Scrubber
                                StreamBuilder<Duration>(
                                  stream: AudioService.position,
                                  builder: (context, posSnapshot) {
                                    final currentPos = posSnapshot.data ?? position;
                                    double sliderValue = currentPos.inMilliseconds.toDouble();
                                    double maxVal = duration.inMilliseconds.toDouble();
                                    if (sliderValue > maxVal) sliderValue = maxVal;
                                    if (maxVal <= 0) maxVal = 1.0;

                                    final remainingPos = duration - currentPos;

                                    return Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        SliderTheme(
                                          data: SliderThemeData(
                                            trackHeight: 6,
                                            activeTrackColor: const Color(0xFFF43F5E),
                                            inactiveTrackColor: Colors.white.withOpacity(0.15),
                                            thumbColor: const Color(0xFFF43F5E),
                                            overlayColor: const Color(0xFFF43F5E).withOpacity(0.1),
                                            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 4),
                                            overlayShape: const RoundSliderOverlayShape(overlayRadius: 8),
                                          ),
                                          child: Slider(
                                            value: sliderValue,
                                            max: maxVal,
                                            onChanged: (val) {
                                              audioHandler.seek(Duration(milliseconds: val.toInt()));
                                            },
                                          ),
                                        ),
                                        Padding(
                                          padding: const EdgeInsets.symmetric(horizontal: 6.0),
                                          child: Row(
                                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                            children: [
                                              Text(
                                                _formatDuration(currentPos), 
                                                style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                                              ),
                                              Text(
                                                '-${_formatDuration(remainingPos > Duration.zero ? remainingPos : Duration.zero)}', 
                                                style: TextStyle(color: Colors.white.withOpacity(0.8), fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                                              ),
                                            ],
                                          ),
                                        ),
                                      ],
                                    );
                                  }
                                ),
                                
                                SizedBox(height: _isLyricsView ? 12 : (isShortScreen ? 16 : 24)),
                                
                                // Main Playback Controls
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    IconButton(
                                      icon: Icon(Icons.skip_previous_rounded, color: Colors.white, size: skipIconSize),
                                      onPressed: () => audioHandler.skipToPrevious(),
                                    ),
                                    SizedBox(width: isShortScreen ? 30 : 40),
                                    ClipOval(
                                      child: Material(
                                        color: Colors.white,
                                        child: InkWell(
                                          onTap: () => isPlaying ? audioHandler.pause() : audioHandler.play(),
                                          child: SizedBox(
                                            width: playBgSize,
                                            height: playBgSize,
                                            child: Center(
                                              child: Icon(
                                                isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                                                color: Colors.black,
                                                size: playIconSize,
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                    SizedBox(width: isShortScreen ? 30 : 40),
                                    IconButton(
                                      icon: Icon(Icons.skip_next_rounded, color: Colors.white, size: skipIconSize),
                                      onPressed: () => audioHandler.skipToNext(),
                                    ),
                                  ],
                                ),
                                
                                SizedBox(height: _isLyricsView ? 16 : (isShortScreen ? 20 : 32)),
                                
                                // Action Row
                                Container(
                                  constraints: const BoxConstraints(maxWidth: 340),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      IconButton(
                                        icon: Icon(
                                          _isLiked ? Icons.favorite_rounded : Icons.favorite_border_rounded, 
                                          color: _isLiked ? const Color(0xFFE11D48) : Colors.white, 
                                          size: 26,
                                        ),
                                        onPressed: () {
                                          if (_currentTrackId != null) {
                                            _toggleLike(_currentTrackId!);
                                          }
                                        },
                                      ),
                                      IconButton(
                                        icon: Icon(LucideIcons.mic2, color: _isLyricsView ? const Color(0xFFE11D48) : Colors.white, size: 26),
                                        onPressed: _toggleLyrics,
                                      ),
                                      IconButton(
                                        icon: const Icon(LucideIcons.sparkles, color: Colors.white, size: 26),
                                        onPressed: () {
                                          showModalBottomSheet(
                                            context: context,
                                            isScrollControlled: true,
                                            backgroundColor: Colors.transparent,
                                            builder: (context) => const StudioFxBottomSheet(),
                                          );
                                        },
                                      ),
                                      IconButton(
                                        icon: const Icon(LucideIcons.listMusic, color: Colors.white, size: 26),
                                        onPressed: () {
                                          showModalBottomSheet(
                                            context: context,
                                            isScrollControlled: true,
                                            backgroundColor: Colors.transparent,
                                            builder: (context) => const QueueBottomSheet(),
                                          );
                                        },
                                      ),
                                    ],
                                  ),
                                ),
                                
                                SizedBox(height: isShortScreen ? 8 : 16),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
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
);
}


  Widget _buildCoverArt(String? artUrl) {
    return Container(
      width: double.infinity,
      height: double.infinity,
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

  Widget _buildLyrics(MediaItem mediaItem) {
    if (_cachedLyricsTrackId != mediaItem.id || _cachedLyricsView == null) {
      _cachedLyricsTrackId = mediaItem.id;
      _cachedLyricsView = LyricsView(
        trackId: mediaItem.id,
        title: mediaItem.title,
        artist: mediaItem.artist ?? 'Unknown Artist',
        rawLyrics: mediaItem.extras?['lyrics'] as String?,
      );
    }
    return Container(
      width: double.infinity,
      height: double.infinity,
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.5),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: _cachedLyricsView!,
      ),
    );
  }
}

