import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/models/models.dart';
import 'providers/library_providers.dart';
import 'package:go_router/go_router.dart';

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
      backgroundColor: const Color(0xFF000000),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text(
          'Your library',
          style: TextStyle(
            fontFamily: 'Orange Avenue',
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: Color(0xFF71717A),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.user, color: Colors.white),
            onPressed: () => context.push('/profile'),
          ),
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              shape: BoxShape.circle,
            ),
            child: IconButton(
              icon: const Icon(LucideIcons.search, color: Color(0xFFE11D48), size: 16),
              onPressed: () {},
              padding: EdgeInsets.zero,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              shape: BoxShape.circle,
            ),
            child: IconButton(
              icon: const Icon(LucideIcons.plus, color: Color(0xFFE11D48), size: 18),
              onPressed: () {},
              padding: EdgeInsets.zero,
            ),
          ),
          const SizedBox(width: 16),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Custom Tabs
            SizedBox(
              height: 32,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16.0),
                itemCount: _tabs.length,
                itemBuilder: (context, index) {
                  final isSelected = _selectedTabIndex == index;
                  IconData icon;
                  switch (index) {
                    case 0: icon = LucideIcons.library; break;
                    case 1: icon = LucideIcons.heart; break;
                    case 2: icon = LucideIcons.disc; break;
                    case 3: icon = LucideIcons.user; break;
                    default: icon = LucideIcons.library;
                  }
                  
                  return GestureDetector(
                    onTap: () => setState(() => _selectedTabIndex = index),
                    child: Container(
                      margin: const EdgeInsets.only(right: 8.0),
                      padding: const EdgeInsets.symmetric(horizontal: 16.0),
                      decoration: BoxDecoration(
                        color: isSelected ? Colors.transparent : const Color(0xFF18181B), // surface-hover
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: isSelected ? const Color(0xFFE11D48) : Colors.transparent,
                        ),
                      ),
                      alignment: Alignment.center,
                      child: Row(
                        children: [
                          Icon(
                            icon, 
                            size: 13, 
                            color: isSelected ? const Color(0xFFE11D48) : const Color(0xFFF43F5E), // red-500 vs rose-500
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _tabs[index],
                            style: TextStyle(
                              color: isSelected ? const Color(0xFF71717A) : const Color(0xFF71717A),
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                        ],
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
          padding: const EdgeInsets.fromLTRB(16, 24, 16, 120),
          itemCount: playlists.length + 1, // +1 for "Create playlist"
          itemBuilder: (context, index) {
            if (index == 0) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 16.0),
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.05),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: Colors.white.withOpacity(0.2), // dashed in react, using solid here for simplicity
                        width: 2,
                      ),
                    ),
                    child: Icon(LucideIcons.plus, color: Colors.white.withOpacity(0.5), size: 28),
                  ),
                  title: const Text('Create playlist', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                  subtitle: const Text('Curate your own collection', style: TextStyle(color: Color(0xFF71717A), fontSize: 12)),
                  onTap: () {},
                ),
              );
            }
            final playlist = playlists[index - 1];
            return Padding(
              padding: const EdgeInsets.only(bottom: 8.0),
              child: ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: const Color(0xFF18181B),
                    borderRadius: BorderRadius.circular(12),
                    image: playlist.coverUrl != null ? DecorationImage(
                      image: CachedNetworkImageProvider(playlist.coverUrl!),
                      fit: BoxFit.cover,
                    ) : null,
                  ),
                  child: playlist.coverUrl == null ? const Icon(LucideIcons.music, color: Colors.white54) : null,
                ),
                title: Text(playlist.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: const Text('Playlist', style: TextStyle(color: Color(0xFF71717A), fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
                trailing: Icon(LucideIcons.chevronRight, color: Colors.white.withOpacity(0.2), size: 18),
                onTap: () {},
              ),
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
