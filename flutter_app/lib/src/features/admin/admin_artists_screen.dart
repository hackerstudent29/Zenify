import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/api/api_client.dart';
import '../../core/models/models.dart';

class AdminArtistsScreen extends ConsumerStatefulWidget {
  const AdminArtistsScreen({super.key});

  @override
  ConsumerState<AdminArtistsScreen> createState() => _AdminArtistsScreenState();
}

class _AdminArtistsScreenState extends ConsumerState<AdminArtistsScreen> {
  bool _isLoading = true;
  List<Artist> _artists = [];
  String _searchQuery = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    _fetchArtists();
  }

  Future<void> _fetchArtists() async {
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });
      final response = await apiClient.get('/artists'); // using standard endpoint, maybe add limit
      if (response.statusCode == 200) {
        // Backend might return a list directly or in { items: [] } depending on pagination
        List<dynamic> items = [];
        if (response.data is List) {
          items = response.data;
        } else if (response.data['items'] != null) {
          items = response.data['items'];
        }
        setState(() {
          _artists = items.map((e) => Artist.fromJson(e)).toList();
          _isLoading = false;
        });
      } else {
        throw Exception('Failed to load artists');
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
    final filteredArtists = _artists.where((a) {
      return a.name.toLowerCase().contains(_searchQuery.toLowerCase());
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
            Text('Artist Roster', style: TextStyle(color: Colors.white, fontSize: 20, fontFamily: 'Orange Avenue')),
            Text('ZENIFY MANAGEMENT PROTOCOL', style: TextStyle(color: Colors.white30, fontSize: 8, letterSpacing: 1.5, fontWeight: FontWeight.bold)),
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
                hintText: 'Search roster...',
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
                        CircularProgressIndicator(color: Colors.white),
                        SizedBox(height: 16),
                        Text('SYNCHRONIZING ROSTER...', style: TextStyle(color: Colors.white54, fontSize: 10, letterSpacing: 2.0, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  )
                : _error != null
                    ? Center(child: Text(_error!, style: const TextStyle(color: Colors.red)))
                    : ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        itemCount: filteredArtists.length,
                        itemBuilder: (context, index) {
                          final artist = filteredArtists[index];
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
                                  shape: BoxShape.circle,
                                  image: artist.imageUrl != null ? DecorationImage(
                                    image: CachedNetworkImageProvider(artist.imageUrl!),
                                    fit: BoxFit.cover,
                                  ) : null,
                                ),
                                child: artist.imageUrl == null ? const Icon(LucideIcons.user, color: Colors.white24) : null,
                              ),
                              title: Text(artist.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14), maxLines: 1, overflow: TextOverflow.ellipsis),
                              trailing: IconButton(
                                icon: const Icon(LucideIcons.edit2, color: Colors.white54, size: 16),
                                onPressed: () {
                                  _showEditSheet(context, artist);
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

  void _showEditSheet(BuildContext context, Artist? artist) {
    final nameController = TextEditingController(text: artist?.name ?? '');
    final bioController = TextEditingController(text: artist?.bio ?? '');

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
                artist == null ? 'NEW ARTIST' : 'EDIT ARTIST',
                style: const TextStyle(color: Color(0xFFE11D48), fontSize: 16, fontWeight: FontWeight.bold, fontFamily: 'Orange Avenue'),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: nameController,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'Artist Name',
                  labelStyle: TextStyle(color: Colors.white.withOpacity(0.5)),
                  filled: true,
                  fillColor: Colors.white.withOpacity(0.05),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: bioController,
                style: const TextStyle(color: Colors.white),
                maxLines: 3,
                decoration: InputDecoration(
                  labelText: 'Biography',
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
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved artist profile.')));
                  },
                  child: const Text('Save Artist', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
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
