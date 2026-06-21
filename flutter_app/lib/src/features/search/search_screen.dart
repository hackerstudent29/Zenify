import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:audio_service/audio_service.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../shared/providers/audio_provider.dart';
import '../player/services/audio_handler.dart';
import 'dart:async';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final TextEditingController _searchController = TextEditingController();
  bool _isSearching = false;
  bool _isLoading = false;
  List<Track> _searchResults = [];
  Timer? _debounce;

  final List<Map<String, dynamic>> _genres = [
    {"name": "Tamil Popular", "color": const Color(0xFFE11D48)},
    {"name": "Kollywood", "color": const Color(0xFF2563EB)},
    {"name": "Devotional", "color": const Color(0xFFF97316)},
    {"name": "Folk & Tribal", "color": const Color(0xFF059669)},
    {"name": "Hip-Hop", "color": const Color(0xFF9333EA)},
    {"name": "Acoustic", "color": const Color(0xFF52525B)},
  ];

  void _onSearchChanged(String query) {
    if (_debounce?.isActive ?? false) _debounce!.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (query.trim().isEmpty) {
        setState(() {
          _isSearching = false;
          _searchResults = [];
        });
        return;
      }
      _performSearch(query.trim());
    });
  }

  Future<void> _performSearch(String query) async {
    setState(() {
      _isSearching = true;
      _isLoading = true;
    });
    try {
      final response = await apiClient.get('/search', queryParameters: {'q': query});
      if (response.statusCode == 200 && response.data != null) {
        final data = response.data;
        final List<dynamic> list = (data is Map && data.containsKey('tracks'))
            ? data['tracks']
            : (data is List ? data : []);
        final tracks = list.map((e) => Track.fromJson(e)).toList();
        if (mounted) {
          setState(() {
            _searchResults = tracks;
            _isLoading = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _isLoading = false;
          });
        }
      }
    } catch (e) {
      print('Error performing search: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF09090B),
      body: SafeArea(
        child: Column(
          children: [
            // Sticky Search Bar Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withOpacity(0.1)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.2),
                      blurRadius: 20,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: TextField(
                  controller: _searchController,
                  onChanged: _onSearchChanged,
                  style: const TextStyle(color: Colors.white, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Search for anything...',
                    hintStyle: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 14),
                    prefixIcon: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12.0),
                      child: Icon(LucideIcons.search, color: Colors.white.withOpacity(0.4), size: 18),
                    ),
                    prefixIconConstraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                    suffixIcon: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12.0),
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.transparent,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(LucideIcons.sparkles, color: const Color(0xFFE11D48).withOpacity(0.5), size: 16),
                      ),
                    ),
                    suffixIconConstraints: const BoxConstraints(minWidth: 40, minHeight: 40),
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ),
            ),
            
            Expanded(
              child: _isSearching ? _buildSearchResults() : _buildCategoriesGrid(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategoriesGrid() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Browse all',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Colors.white,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 16),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
              childAspectRatio: 1.6,
            ),
            itemCount: _genres.length,
            itemBuilder: (context, index) {
              final genre = _genres[index];
              return Container(
                decoration: BoxDecoration(
                  color: genre["color"] as Color,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [
                    BoxShadow(
                      color: (genre["color"] as Color).withOpacity(0.2),
                      blurRadius: 10,
                      offset: const Offset(0, 5),
                    )
                  ]
                ),
                clipBehavior: Clip.hardEdge,
                child: Stack(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Text(
                        genre["name"] as String,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: -15,
                      right: -15,
                      child: Transform.rotate(
                        angle: 0.4,
                        child: Container(
                          width: 65,
                          height: 65,
                          decoration: BoxDecoration(
                            color: Colors.black.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(8),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.3),
                                blurRadius: 10,
                              )
                            ]
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildSearchResults() {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFFE11D48)));
    }

    if (_searchResults.isEmpty) {
      return Center(
        child: Text(
          'No results found for "${_searchController.text}"',
          style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 14),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
      itemCount: _searchResults.length,
      itemBuilder: (context, index) {
        final track = _searchResults[index];
        final title = track.title;
        final subtitle = track.artist?.name ?? 'Unknown Artist';
        final imageUrl = track.coverUrl;

        return GestureDetector(
          onTap: () {
            final handler = ref.read(audioHandlerProvider) as MyAudioHandler;
            final newQueue = _searchResults.map((t) => MediaItem(
              id: t.id,
              title: t.title,
              artist: t.artist?.name ?? 'Unknown Artist',
              artUri: t.coverUrl != null ? Uri.parse(t.coverUrl!) : null,
              extras: {'audioUrl': t.audioUrl},
            )).toList();
            handler.playWithQueue(newQueue, index);
          },
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              border: Border.all(color: Colors.white.withOpacity(0.05)),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: const Color(0xFF18181B),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withOpacity(0.1)),
                    image: imageUrl != null ? DecorationImage(
                      image: CachedNetworkImageProvider(imageUrl),
                      fit: BoxFit.cover,
                    ) : null,
                  ),
                  child: imageUrl == null
                      ? Icon(LucideIcons.music, color: Colors.white.withOpacity(0.2), size: 20)
                      : null,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.5),
                          fontWeight: FontWeight.w600,
                          fontSize: 11,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                Icon(LucideIcons.moreHorizontal, color: Colors.white.withOpacity(0.4), size: 16),
              ],
            ),
          ),
        );
      },
    );
  }
}
