import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';

class AdminTracksScreen extends ConsumerStatefulWidget {
  const AdminTracksScreen({super.key});

  @override
  ConsumerState<AdminTracksScreen> createState() => _AdminTracksScreenState();
}

class _AdminTracksScreenState extends ConsumerState<AdminTracksScreen> {
  bool _isLoading = true;
  List<Track> _tracks = [];
  String _searchQuery = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchTracks();
  }

  Future<void> _fetchTracks() async {
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });
      final response = await apiClient.get('/tracks?limit=100');
      if (response.statusCode == 200) {
        final List<dynamic> items = response.data['items'];
        setState(() {
          _tracks = items.map((e) => Track.fromJson(e)).toList();
          _isLoading = false;
        });
      } else {
        throw Exception('Failed to load tracks');
      }
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final filteredTracks = _tracks.where((t) {
      final matchesTitle = t.title.toLowerCase().contains(_searchQuery.toLowerCase());
      final matchesArtist = (t.artist?.name ?? '').toLowerCase().contains(_searchQuery.toLowerCase());
      return matchesTitle || matchesArtist;
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0B),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0A0A0B),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.chevronLeft, color: Colors.white),
          onPressed: () => context.pop(),
        ),
        title: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Management Center', style: TextStyle(color: Color(0xFFE11D48), fontSize: 20, fontFamily: 'Orange Avenue')),
            Text('ZENIFY ASSET REGISTRY PIPELINE', style: TextStyle(color: Colors.white30, fontSize: 8, letterSpacing: 1.5, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: TextField(
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Search frequencies...',
                hintStyle: TextStyle(color: Colors.white.withOpacity(0.3)),
                prefixIcon: const Icon(LucideIcons.search, color: Colors.white54, size: 18),
                filled: true,
                fillColor: Colors.white.withOpacity(0.05),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 0),
              ),
              onChanged: (v) => setState(() => _searchQuery = v),
            ),
          ),
          
          Expanded(
            child: _isLoading
                ? const Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        CircularProgressIndicator(color: Color(0xFFE11D48)),
                        SizedBox(height: 16),
                        Text('SYNCHRONIZING REGISTRY...', style: TextStyle(color: Colors.white54, fontSize: 10, letterSpacing: 2.0, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  )
                : _error != null
                    ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        itemCount: filteredTracks.length,
                        itemBuilder: (context, index) {
                          final track = filteredTracks[index];
                          return Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.02),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.white.withOpacity(0.05)),
                            ),
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              leading: Container(
                                width: 48,
                                height: 48,
                                decoration: BoxDecoration(
                                  color: const Color(0xFF18181B),
                                  borderRadius: BorderRadius.circular(8),
                                  image: track.coverUrl != null ? DecorationImage(
                                    image: CachedNetworkImageProvider(track.coverUrl!),
                                    fit: BoxFit.cover,
                                  ) : null,
                                ),
                                child: track.coverUrl == null ? const Icon(LucideIcons.music, color: Colors.white24) : null,
                              ),
                              title: Text(track.title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14), maxLines: 1, overflow: TextOverflow.ellipsis),
                              subtitle: Text(track.artist?.name ?? 'Unknown Artist', style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
                              trailing: IconButton(
                                icon: const Icon(LucideIcons.edit2, color: Colors.white54, size: 16),
                                onPressed: () {
                                  _showEditSheet(context, track);
                                },
                              ),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: const Color(0xFFE11D48),
        child: const Icon(LucideIcons.plus, color: Colors.white),
        onPressed: () => _showEditSheet(context, null),
      ),
    );
  }

  void _showEditSheet(BuildContext context, Track? track) {
    final titleController = TextEditingController(text: track?.title ?? '');
    final artistController = TextEditingController(text: track?.artist?.name ?? '');

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF111111),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom,
            left: 24,
            right: 24,
            top: 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                track == null ? 'NEW TRACK' : 'EDIT TRACK',
                style: const TextStyle(color: Color(0xFFE11D48), fontSize: 16, fontWeight: FontWeight.bold, fontFamily: 'Orange Avenue'),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: titleController,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Track Title',
                  labelStyle: TextStyle(color: Colors.white.withOpacity(0.5)),
                  filled: true,
                  fillColor: Colors.white.withOpacity(0.05),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: artistController,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Artist Name',
                  labelStyle: TextStyle(color: Colors.white.withOpacity(0.5)),
                  filled: true,
                  fillColor: Colors.white.withOpacity(0.05),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFE11D48),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () {
                    // Actual save logic would go here
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved track metadata.')));
                  },
                  child: const Text('Save Track', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        );
      },
    );
  }
}
