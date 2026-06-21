import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:file_picker/file_picker.dart';
import 'package:dio/dio.dart' as dio;
import '../../core/api/api_client.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AdminScreen extends ConsumerStatefulWidget {
  const AdminScreen({super.key});

  @override
  ConsumerState<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends ConsumerState<AdminScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _artistController = TextEditingController();
  final _albumController = TextEditingController();
  
  PlatformFile? _audioFile;
  PlatformFile? _coverFile;
  bool _isUploading = false;
  double _uploadProgress = 0.0;

  bool _isAdmin() {
    final user = Supabase.instance.client.auth.currentSession?.user;
    // For now, allow all or check role if metadata exists
    // final role = user?.userMetadata?['role'];
    return true; 
  }

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
      final formData = dio.FormData.fromMap({
        'title': _titleController.text,
        'artistName': _artistController.text,
        if (_albumController.text.isNotEmpty) 'albumTitle': _albumController.text,
      });

      if (_audioFile!.path != null) {
        formData.files.add(MapEntry(
          'audio',
          await dio.MultipartFile.fromFile(_audioFile!.path!, filename: _audioFile!.name),
        ));
      }

      if (_coverFile != null && _coverFile!.path != null) {
        formData.files.add(MapEntry(
          'cover',
          await dio.MultipartFile.fromFile(_coverFile!.path!, filename: _coverFile!.name),
        ));
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
    if (!_isAdmin()) {
      return Scaffold(
        backgroundColor: const Color(0xFF0A0A0B),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: const Color(0xFFEF4444).withOpacity(0.1),
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFFEF4444).withOpacity(0.2)),
                ),
                child: const Icon(LucideIcons.shield, color: Color(0xFFEF4444), size: 32),
              ),
              const SizedBox(height: 24),
              const Text('Access Restricted', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white)),
              const SizedBox(height: 8),
              Text('This terminal is reserved for platform administrators.', style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.5))),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: () => context.go('/'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: Colors.black,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                ),
                child: const Text('Return Home', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0B),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.only(bottom: 120),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 24, 16, 16),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: const Color(0xFF18181B), // zinc-900
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white.withOpacity(0.05)),
                        boxShadow: [
                          BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 10),
                        ],
                      ),
                      child: const Center(
                        child: Icon(LucideIcons.settings2, color: Color(0xFFE11D48), size: 16),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Distribution Terminal',
                          style: TextStyle(
                            fontFamily: 'Orange Avenue',
                            fontSize: 24,
                            color: Color(0xFFE11D48),
                            height: 1.2,
                          ),
                        ),
                        Text(
                          'ZENIFY ASSET MANAGEMENT PROTOCOL',
                          style: TextStyle(
                            fontSize: 10,
                            letterSpacing: 2.0,
                            fontWeight: FontWeight.w500,
                            color: Colors.white.withOpacity(0.3),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Navigation Grid
                    Text(
                      'MANAGEMENT',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 2.0,
                        color: Colors.white.withOpacity(0.4),
                      ),
                    ),
                    const SizedBox(height: 12),
                    GridView.count(
                      crossAxisCount: 2,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      childAspectRatio: 1.5,
                      children: [
                        _buildNavCard(
                          title: 'ARTISTS MANAGEMENT',
                          icon: LucideIcons.shield,
                          color: Colors.white.withOpacity(0.7),
                          bgColor: Colors.white.withOpacity(0.05),
                          borderColor: Colors.white.withOpacity(0.1),
                          onTap: () => context.push('/admin/artists'),
                        ),
                        _buildNavCard(
                          title: 'TRACK DATABASE',
                          icon: LucideIcons.music,
                          color: Colors.white.withOpacity(0.7),
                          bgColor: Colors.white.withOpacity(0.05),
                          borderColor: Colors.white.withOpacity(0.1),
                          onTap: () => context.push('/admin/tracks'),
                        ),
                        _buildNavCard(
                          title: 'LYRIC SYNC STUDIO',
                          icon: LucideIcons.mic,
                          color: Colors.white.withOpacity(0.7),
                          bgColor: Colors.white.withOpacity(0.05),
                          borderColor: Colors.white.withOpacity(0.1),
                          onTap: () => context.push('/admin/lyric-sync'),
                        ),
                        _buildNavCard(
                          title: 'BATCH INTAKE',
                          icon: LucideIcons.sparkles,
                          color: const Color(0xFFE11D48),
                          bgColor: const Color(0xFFE11D48).withOpacity(0.1),
                          borderColor: const Color(0xFFE11D48).withOpacity(0.2),
                          onTap: () => context.push('/admin/playlist-import'),
                        ),
                      ],
                    ),

                    const SizedBox(height: 32),

                    // Quick Upload
                    Text(
                      'QUICK UPLOAD',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 2.0,
                        color: Colors.white.withOpacity(0.5),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.02),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: Colors.white.withOpacity(0.05)),
                      ),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            TextFormField(
                              controller: _titleController,
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                              decoration: InputDecoration(
                                labelText: 'Track Title',
                                labelStyle: TextStyle(color: Colors.white.withOpacity(0.5)),
                                enabledBorder: OutlineInputBorder(
                                  borderSide: BorderSide(color: Colors.white.withOpacity(0.1)),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderSide: const BorderSide(color: Color(0xFFE11D48)),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                filled: true,
                                fillColor: const Color(0xFF151515),
                                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                              ),
                              validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _artistController,
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                              decoration: InputDecoration(
                                labelText: 'Artist Name',
                                labelStyle: TextStyle(color: Colors.white.withOpacity(0.5)),
                                enabledBorder: OutlineInputBorder(
                                  borderSide: BorderSide(color: Colors.white.withOpacity(0.1)),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderSide: const BorderSide(color: Color(0xFFE11D48)),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                filled: true,
                                fillColor: const Color(0xFF151515),
                                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                              ),
                              validator: (v) => v == null || v.isEmpty ? 'Required' : null,
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _albumController,
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                              decoration: InputDecoration(
                                labelText: 'Album Title (Optional)',
                                labelStyle: TextStyle(color: Colors.white.withOpacity(0.5)),
                                enabledBorder: OutlineInputBorder(
                                  borderSide: BorderSide(color: Colors.white.withOpacity(0.1)),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderSide: const BorderSide(color: Color(0xFFE11D48)),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                filled: true,
                                fillColor: const Color(0xFF151515),
                                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                              ),
                            ),
                            const SizedBox(height: 16),
                            
                            // File Pickers
                            Row(
                              children: [
                                Expanded(
                                  child: ElevatedButton.icon(
                                    onPressed: _pickAudio,
                                    icon: const Icon(LucideIcons.fileAudio, color: Colors.white, size: 16),
                                    label: Text(
                                      _audioFile != null ? _audioFile!.name : 'Select Audio', 
                                      style: const TextStyle(color: Colors.white, fontSize: 12),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: _audioFile != null ? const Color(0xFFE11D48).withOpacity(0.2) : const Color(0xFF222222),
                                      padding: const EdgeInsets.symmetric(vertical: 12),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: ElevatedButton.icon(
                                    onPressed: _pickCover,
                                    icon: const Icon(LucideIcons.image, color: Colors.white, size: 16),
                                    label: Text(
                                      _coverFile != null ? _coverFile!.name : 'Select Cover', 
                                      style: const TextStyle(color: Colors.white, fontSize: 12),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: _coverFile != null ? const Color(0xFFE11D48).withOpacity(0.2) : const Color(0xFF222222),
                                      padding: const EdgeInsets.symmetric(vertical: 12),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 24),

                            if (_isUploading) ...[
                              LinearProgressIndicator(value: _uploadProgress, color: const Color(0xFFE11D48), backgroundColor: Colors.white12),
                              const SizedBox(height: 8),
                              Center(child: Text('${(_uploadProgress * 100).toStringAsFixed(1)}%', style: const TextStyle(color: Colors.white54, fontSize: 12))),
                            ] else ...[
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton(
                                  onPressed: _upload,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(0xFFE11D48),
                                    padding: const EdgeInsets.symmetric(vertical: 16),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                  ),
                                  child: const Text('Upload Track', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavCard({
    required String title,
    required IconData icon,
    required Color color,
    required Color bgColor,
    required Color borderColor,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: borderColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(height: 12),
            Text(
              title,
              style: TextStyle(
                color: color,
                fontSize: 9,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.5,
              ),
              maxLines: 2,
            ),
          ],
        ),
      ),
    );
  }
}
