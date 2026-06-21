import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/models/models.dart';
import 'providers/library_providers.dart';

class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({super.key});

  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen> {
  int _selectedTabIndex = 0;
  final List<String> _tabs = ['Playlists', 'Liked Songs', 'Albums', 'Artists'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  const CircleAvatar(
                    radius: 16,
                    backgroundImage: NetworkImage('https://i.pravatar.cc/150?img=11'),
                  ),
                  const SizedBox(width: 16),
                  const Text(
                    'Your Library',
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(LucideIcons.search),
                    onPressed: () {},
                  ),
                  IconButton(
                    icon: const Icon(LucideIcons.plus),
                    onPressed: () {},
                  ),
                ],
              ),
            ),
            
            // Custom Tabs
            SizedBox(
              height: 40,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12.0),
                itemCount: _tabs.length,
                itemBuilder: (context, index) {
                  final isSelected = _selectedTabIndex == index;
                  return GestureDetector(
                    onTap: () => setState(() => _selectedTabIndex = index),
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 4.0),
                      padding: const EdgeInsets.symmetric(horizontal: 20.0),
                      decoration: BoxDecoration(
                        color: isSelected ? Colors.transparent : Colors.white.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(20),
                        border: isSelected 
                            ? Border.all(color: Theme.of(context).primaryColor, width: 1.5)
                            : Border.all(color: Colors.transparent),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        _tabs[index],
                        style: TextStyle(
                          color: isSelected ? Theme.of(context).primaryColor : Colors.white,
                          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            
            const SizedBox(height: 16),
            
            // Tab Content
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 300),
                child: _buildTabContent(),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTabContent() {
    switch (_selectedTabIndex) {
      case 0:
        return _buildPlaylistsTab();
      case 1:
        return _buildPlaceholderTab('Liked Songs', LucideIcons.heart);
      case 2:
        return _buildPlaceholderTab('Albums', LucideIcons.disc);
      case 3:
        return _buildPlaceholderTab('Artists', LucideIcons.user);
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _buildPlaylistsTab() {
    final playlistsAsync = ref.watch(myPlaylistsProvider);

    return playlistsAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, stack) => Center(child: Text('Error: $err', style: const TextStyle(color: Colors.white))),
      data: (playlists) {
        return ListView.builder(
          key: const ValueKey('playlists'),
          itemCount: playlists.length + 1, // +1 for "Create playlist"
          itemBuilder: (context, index) {
            if (index == 0) {
              return ListTile(
                leading: Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Icon(LucideIcons.plus, color: Colors.white),
                ),
                title: const Text('Create playlist', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                onTap: () {},
              );
            }
            final playlist = playlists[index - 1];
            return ListTile(
              leading: Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: Colors.grey.shade800,
                  borderRadius: BorderRadius.circular(4),
                  image: playlist.coverUrl != null ? DecorationImage(
                    image: CachedNetworkImageProvider(playlist.coverUrl!),
                    fit: BoxFit.cover,
                  ) : null,
                ),
                child: playlist.coverUrl == null ? const Icon(LucideIcons.music, color: Colors.white54) : null,
              ),
              title: Text(playlist.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              subtitle: Text(playlist.description ?? 'Playlist', style: const TextStyle(color: Colors.white54)),
              onTap: () {},
            );
          },
        );
      },
    );
  }

  Widget _buildPlaceholderTab(String title, IconData icon) {
    return Center(
      key: ValueKey(title),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 64, color: Colors.white24),
          const SizedBox(height: 16),
          Text(title, style: const TextStyle(color: Colors.white54, fontSize: 18)),
        ],
      ),
    );
  }
}
