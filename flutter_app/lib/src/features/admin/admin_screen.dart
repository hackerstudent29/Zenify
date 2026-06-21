import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:file_picker/file_picker.dart';
import 'package:dio/dio.dart';
import '../../core/api/api_client.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Admin Dashboard', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        backgroundColor: const Color(0xFF151515),
        elevation: 0,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFFE11D48),
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white54,
          tabs: const [
            Tab(text: 'Tracks'),
            Tab(text: 'Artists'),
            Tab(text: 'Playlists'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _AdminTracksTab(),
          Center(child: Text('Artists Management Coming Soon', style: TextStyle(color: Colors.white54))),
          Center(child: Text('Playlist Import Coming Soon', style: TextStyle(color: Colors.white54))),
        ],
      ),
    );
  }
}

class _AdminTracksTab extends StatefulWidget {
  const _AdminTracksTab();

  @override
  State<_AdminTracksTab> createState() => _AdminTracksTabState();
}

class _AdminTracksTabState extends State<_AdminTracksTab> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _artistController = TextEditingController();
  final _albumController = TextEditingController();
  
  PlatformFile? _audioFile;
  PlatformFile? _coverFile;
  bool _isUploading = false;
  double _uploadProgress = 0.0;

  Future<void> _pickAudio() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.audio,
      allowMultiple: false,
    );
    if (result != null) {
      setState(() => _audioFile = result.files.first);
    }
  }

  Future<void> _pickCover() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      allowMultiple: false,
    );
    if (result != null) {
      setState(() => _coverFile = result.files.first);
    }
  }

  Future<void> _upload() async {
    if (!_formKey.currentState!.validate()) return;
    if (_audioFile == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please select an audio file')));
      return;
    }

    setState(() {
      _isUploading = true;
      _uploadProgress = 0.0;
    });

    try {
      final formData = FormData.fromMap({
        'title': _titleController.text,
        'artistName': _artistController.text,
        if (_albumController.text.isNotEmpty) 'albumTitle': _albumController.text,
      });

      if (_audioFile!.path != null) {
        formData.files.add(MapEntry(
          'audio',
          await MultipartFile.fromFile(_audioFile!.path!, filename: _audioFile!.name),
        ));
      } else if (_audioFile!.bytes != null) {
        formData.files.add(MapEntry(
          'audio',
          MultipartFile.fromBytes(_audioFile!.bytes!, filename: _audioFile!.name),
        ));
      }

      if (_coverFile != null) {
        if (_coverFile!.path != null) {
          formData.files.add(MapEntry(
            'cover',
            await MultipartFile.fromFile(_coverFile!.path!, filename: _coverFile!.name),
          ));
        } else if (_coverFile!.bytes != null) {
          formData.files.add(MapEntry(
            'cover',
            MultipartFile.fromBytes(_coverFile!.bytes!, filename: _coverFile!.name),
          ));
        }
      }

      final response = await apiClient.post(
        '/tracks/upload',
        data: formData,
        onSendProgress: (count, total) {
          setState(() {
            _uploadProgress = count / total;
          });
        },
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Track uploaded successfully!')));
          _titleController.clear();
          _artistController.clear();
          _albumController.clear();
          setState(() {
            _audioFile = null;
            _coverFile = null;
            _isUploading = false;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Upload failed: $e')));
        setState(() => _isUploading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Upload New Track', style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 24),
            
            TextFormField(
              controller: _titleController,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: 'Track Title',
                labelStyle: const TextStyle(color: Colors.white54),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
                focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFE11D48))),
                filled: true,
                fillColor: const Color(0xFF151515),
              ),
              validator: (v) => v == null || v.isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 16),
            
            TextFormField(
              controller: _artistController,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: 'Artist Name',
                labelStyle: const TextStyle(color: Colors.white54),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
                focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFE11D48))),
                filled: true,
                fillColor: const Color(0xFF151515),
              ),
              validator: (v) => v == null || v.isEmpty ? 'Required' : null,
            ),
            const SizedBox(height: 16),

            TextFormField(
              controller: _albumController,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                labelText: 'Album Title (Optional)',
                labelStyle: const TextStyle(color: Colors.white54),
                enabledBorder: OutlineInputBorder(borderSide: BorderSide(color: Colors.white.withOpacity(0.1))),
                focusedBorder: const OutlineInputBorder(borderSide: BorderSide(color: Color(0xFFE11D48))),
                filled: true,
                fillColor: const Color(0xFF151515),
              ),
            ),
            const SizedBox(height: 24),

            // File Pickers
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _pickAudio,
                    icon: const Icon(LucideIcons.fileAudio, color: Colors.white),
                    label: Text(_audioFile != null ? _audioFile!.name : 'Select Audio', style: const TextStyle(color: Colors.white)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _audioFile != null ? const Color(0xFFE11D48).withOpacity(0.2) : const Color(0xFF222222),
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _pickCover,
                    icon: const Icon(LucideIcons.image, color: Colors.white),
                    label: Text(_coverFile != null ? _coverFile!.name : 'Select Cover Art (Optional)', style: const TextStyle(color: Colors.white)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _coverFile != null ? const Color(0xFFE11D48).withOpacity(0.2) : const Color(0xFF222222),
                      padding: const EdgeInsets.symmetric(vertical: 16),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 32),

            if (_isUploading) ...[
              LinearProgressIndicator(value: _uploadProgress, color: const Color(0xFFE11D48), backgroundColor: Colors.white12),
              const SizedBox(height: 8),
              Center(child: Text('${(_uploadProgress * 100).toStringAsFixed(1)}%', style: const TextStyle(color: Colors.white54))),
            ] else ...[
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _upload,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFE11D48),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  child: const Text('Upload Track', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
