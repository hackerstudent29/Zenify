import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';

class LibraryRepository {
  final Dio _dio;

  LibraryRepository({Dio? dioOverride}) : _dio = dioOverride ?? apiClient;

  Future<List<Playlist>> getMyPlaylists() async {
    try {
      final response = await _dio.get('/playlists/my');
      if (response.data != null && response.data['playlists'] != null) {
        return (response.data['playlists'] as List)
            .map((e) => Playlist.fromJson(e))
            .toList();
      } else if (response.data is List) {
        return (response.data as List).map((e) => Playlist.fromJson(e)).toList();
      }
      return [];
    } catch (e) {
      throw Exception('Failed to load playlists: $e');
    }
  }
}
