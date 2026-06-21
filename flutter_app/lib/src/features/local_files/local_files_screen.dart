import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:file_picker/file_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:audio_service/audio_service.dart';
import '../../shared/providers/audio_provider.dart';
import '../player/services/audio_handler.dart';

class LocalFilesScreen extends ConsumerStatefulWidget {
  const LocalFilesScreen({super.key});

  @override
  ConsumerState<LocalFilesScreen> createState() => _LocalFilesScreenState();
}

class _LocalFilesScreenState extends ConsumerState<LocalFilesScreen> {
  List<File> _localFiles = [];
  bool _isLoading = true;
  bool _isScanning = false;

  @override
  void initState() {
    super.initState();
    _loadSavedFiles();
  }

  Future<void> _loadSavedFiles() async {
    setState(() {
      _isLoading = true;
    });
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedPaths = prefs.getStringList('local_audio_paths') ?? [];
      final List<File> existingFiles = [];
      for (final path in savedPaths) {
        final file = File(path);
        if (await file.exists()) {
          existingFiles.add(file);
        }
      }
      setState(() {
        _localFiles = existingFiles;
      });
    } catch (e) {
      print('Error loading saved local files: $e');
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _saveFiles(List<File> files) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final paths = files.map((f) => f.path).toList();
      await prefs.setStringList('local_audio_paths', paths);
    } catch (e) {
      print('Error saving local files paths: $e');
    }
  }

  Future<bool> _requestPermissions() async {
    if (!Platform.isAndroid) return true;
    
    final statusAudio = await Permission.audio.request();
    final statusStorage = await Permission.storage.request();
    return statusAudio.isGranted || statusStorage.isGranted;
  }

  Future<List<File>> _scanDirectoryForAudio(String path) async {
    final dir = Directory(path);
    if (!await dir.exists()) return [];
    
    final List<File> audioFiles = [];
    try {
      final list = dir.listSync(recursive: true, followLinks: false);
      for (final entity in list) {
        if (entity is File) {
          final ext = entity.path.toLowerCase();
          if (ext.endsWith('.mp3') || ext.endsWith('.wav') || ext.endsWith('.m4a') || ext.endsWith('.flac')) {
            audioFiles.add(entity);
          }
        }
      }
    } catch (e) {
      print('Error listing dir $path: $e');
    }
    return audioFiles;
  }

  Future<void> _scanStorage() async {
    final hasPermission = await _requestPermissions();
    if (!hasPermission) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Storage permission is required to scan files.'),
          backgroundColor: Color(0xFFE11D48),
        ),
      );
      return;
    }

    setState(() {
      _isScanning = true;
    });

    try {
      final directories = [
        '/storage/emulated/0/Music',
        '/storage/emulated/0/Download',
      ];
      final List<File> foundFiles = [];
      for (final path in directories) {
        final files = await _scanDirectoryForAudio(path);
        foundFiles.addAll(files);
      }

      // Add unique new files to the list
      final Set<String> existingPaths = _localFiles.map((f) => f.path).toSet();
      final List<File> uniqueNewFiles = [];
      for (final file in foundFiles) {
        if (!existingPaths.contains(file.path)) {
          uniqueNewFiles.add(file);
        }
      }

      if (uniqueNewFiles.isNotEmpty) {
        setState(() {
          _localFiles.addAll(uniqueNewFiles);
        });
        await _saveFiles(_localFiles);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Found and added ${uniqueNewFiles.length} new local files.'),
            backgroundColor: const Color(0xFF059669),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No new audio files found in Music or Download folders.'),
            backgroundColor: Color(0xFF52525B),
          ),
        );
      }
    } catch (e) {
      print('Error scanning storage: $e');
    } finally {
      setState(() {
        _isScanning = false;
      });
    }
  }

  Future<void> _pickFiles() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.audio,
        allowMultiple: true,
      );
      if (result != null && result.files.isNotEmpty) {
        final List<File> picked = result.paths
            .where((path) => path != null)
            .map((path) => File(path!))
            .toList();

        final Set<String> existingPaths = _localFiles.map((f) => f.path).toSet();
        final List<File> uniqueNewFiles = [];
        for (final file in picked) {
          if (!existingPaths.contains(file.path)) {
            uniqueNewFiles.add(file);
          }
        }

        if (uniqueNewFiles.isNotEmpty) {
          setState(() {
            _localFiles.addAll(uniqueNewFiles);
          });
          await _saveFiles(_localFiles);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Imported ${uniqueNewFiles.length} files successfully.'),
              backgroundColor: const Color(0xFF059669),
            ),
          );
        }
      }
    } catch (e) {
      print('Error picking files: $e');
    }
  }

  void _playLocalFile(File file, int index) {
    final handler = ref.read(audioHandlerProvider) as MyAudioHandler;
    final newQueue = _localFiles.map((f) {
      final name = f.path.split('/').last.split('\\').last;
      return MediaItem(
        id: f.path,
        title: name.replaceAll(RegExp(r'\.(mp3|wav|m4a|flac)$', caseSensitive: false), ''),
        artist: 'Local Audio',
        artUri: null,
        extras: {'audioUrl': f.path},
      );
    }).toList();
    
    handler.playWithQueue(newQueue, index);
  }

  void _removeFile(int index) async {
    setState(() {
      _localFiles.removeAt(index);
    });
    await _saveFiles(_localFiles);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF09090B),
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE11D48).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFFE11D48).withOpacity(0.2)),
                    ),
                    child: const Icon(LucideIcons.fileAudio, color: Color(0xFFE11D48), size: 24),
                  ),
                  const SizedBox(width: 16),
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'LOCAL FILES',
                        style: TextStyle(
                          fontFamily: 'Hi',
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          letterSpacing: 0.5,
                        ),
                      ),
                      Text(
                        'Play music from your device',
                        style: TextStyle(
                          color: Colors.white38,
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // Scan / Import Cards
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 8.0),
              child: Row(
                children: [
                  Expanded(
                    child: _ActionCard(
                      title: 'Scan Folders',
                      subtitle: '/Music, /Download',
                      icon: LucideIcons.scanLine,
                      color: const Color(0xFFE11D48),
                      isLoading: _isScanning,
                      onTap: _scanStorage,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _ActionCard(
                      title: 'Import Files',
                      subtitle: 'Manual selector',
                      icon: LucideIcons.plus,
                      color: const Color(0xFF2563EB),
                      isLoading: false,
                      onTap: _pickFiles,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Files count
            if (_localFiles.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 8.0),
                child: Text(
                  '${_localFiles.length} TRACKS FOUND',
                  style: const TextStyle(
                    color: Colors.white30,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.5,
                  ),
                ),
              ),

            // List of songs
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator(color: Color(0xFFE11D48)))
                  : _localFiles.isEmpty
                      ? _buildEmptyState()
                      : _buildSongsList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.02),
                borderRadius: BorderRadius.circular(100),
                border: Border.all(color: Colors.white.withOpacity(0.05)),
              ),
              child: Icon(LucideIcons.music, color: Colors.white.withOpacity(0.15), size: 48),
            ),
            const SizedBox(height: 24),
            const Text(
              'No Local Audio Files',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              'Scan standard directories or tap Import to select audio files from your phone storage.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 13, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSongsList() {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 120),
      itemCount: _localFiles.length,
      itemBuilder: (context, index) {
        final file = _localFiles[index];
        final filename = file.path.split('/').last.split('\\').last;
        final cleanTitle = filename.replaceAll(RegExp(r'\.(mp3|wav|m4a|flac)$', caseSensitive: false), '');

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.02),
            border: Border.all(color: Colors.white.withOpacity(0.04)),
            borderRadius: BorderRadius.circular(16),
          ),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            onTap: () => _playLocalFile(file, index),
            leading: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.04),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withOpacity(0.08)),
              ),
              child: const Icon(LucideIcons.fileAudio, color: Colors.white30, size: 20),
            ),
            title: Text(
              cleanTitle,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: const Text(
              'Local File',
              style: TextStyle(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.w500),
            ),
            trailing: IconButton(
              icon: Icon(LucideIcons.trash2, color: Colors.white.withOpacity(0.2), size: 18),
              onPressed: () => _removeFile(index),
            ),
          ),
        );
      },
    );
  }
}

class _ActionCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final bool isLoading;
  final VoidCallback onTap;

  const _ActionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.isLoading,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isLoading ? null : onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.02),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.1),
              blurRadius: 10,
              offset: const Offset(0, 5),
            )
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: isLoading
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(color: color, strokeWidth: 2),
                    )
                  : Icon(icon, color: color, size: 20),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
            ),
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}
