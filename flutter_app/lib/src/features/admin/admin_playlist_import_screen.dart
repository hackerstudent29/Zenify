import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class AdminPlaylistImportScreen extends StatelessWidget {
  const AdminPlaylistImportScreen({super.key});

  @override
  Widget build(BuildContext context) {
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
            Text('Batch Intake', style: TextStyle(color: Color(0xFFE11D48), fontSize: 20, fontFamily: 'Orange Avenue')),
            Text('ZENIFY MANAGEMENT PROTOCOL', style: TextStyle(color: Colors.white30, fontSize: 8, letterSpacing: 1.5, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFE11D48).withOpacity(0.1),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFE11D48).withOpacity(0.2)),
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.info, color: Color(0xFFE11D48)),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Text(
                      'Batch Intake automatically downloads and ingests metadata from Spotify playlists.',
                      style: TextStyle(color: const Color(0xFFE11D48).withOpacity(0.8), fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),
            const Text(
              'Spotify Playlist URL',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            TextField(
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'https://open.spotify.com/playlist/...',
                hintStyle: TextStyle(color: Colors.white.withOpacity(0.3)),
                prefixIcon: const Icon(LucideIcons.link, color: Colors.white54, size: 18),
                filled: true,
                fillColor: Colors.white.withOpacity(0.05),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFE11D48),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                icon: const Icon(LucideIcons.downloadCloud, color: Colors.white),
                label: const Text('Start Batch Ingestion', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Starting batch import...')));
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
