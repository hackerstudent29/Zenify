import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/models.dart';

class HomeRepository {
  final Dio _dio;

  HomeRepository({Dio? dioOverride}) : _dio = dioOverride ?? apiClient;

  Future<List<Track>> getTrendingTracks() async {
    try {
      final response = await _dio.get('/homepage/trending');
      if (response.data != null && response.data['items'] != null) {
        return (response.data['items'] as List)
            .map((e) => Track.fromJson(e))
            .toList();
      } else if (response.data != null && response.data['tracks'] != null) {
        return (response.data['tracks'] as List)
            .map((e) => Track.fromJson(e))
            .toList();
      }
      return [];
    } catch (e) {
      throw Exception('Failed to load trending tracks: $e');
    }
  }

  Future<List<Artist>> getTopArtists() async {
    try {
      final response = await _dio.get('/homepage/top-artists');
      if (response.data != null && response.data['items'] != null) {
        return (response.data['items'] as List)
            .map((e) => Artist.fromJson(e))
            .toList();
      } else if (response.data != null && response.data['artists'] != null) {
        return (response.data['artists'] as List)
            .map((e) => Artist.fromJson(e))
            .toList();
      }
      return [];
    } catch (e) {
      throw Exception('Failed to load top artists: $e');
    }
  }

  Future<List<Track>> getFeaturedTracks() async {
    try {
      final response = await _dio.get('/homepage/featured');
      if (response.data != null && response.data['items'] != null) {
        return (response.data['items'] as List)
            .map((e) => Track.fromJson(e))
            .toList();
      } else if (response.data != null && response.data['tracks'] != null) {
        return (response.data['tracks'] as List)
            .map((e) => Track.fromJson(e))
            .toList();
      }
      return [];
    } catch (e) {
      throw Exception('Failed to load featured tracks: $e');
    }
  }

  Future<List<Track>> getNewArrivals() async {
    try {
      final response = await _dio.get('/homepage/new-arrivals');
      if (response.data != null && response.data['items'] != null) {
        return (response.data['items'] as List)
            .map((e) => Track.fromJson(e))
            .toList();
      } else if (response.data != null && response.data['tracks'] != null) {
        return (response.data['tracks'] as List)
            .map((e) => Track.fromJson(e))
            .toList();
      }
      return [];
    } catch (e) {
      throw Exception('Failed to load new arrivals: $e');
    }
  }

  Future<List<Track>> getRecommendations() async {
    try {
      final response = await _dio.get('/homepage/recommendations');
      if (response.data != null && response.data['items'] != null) {
        return (response.data['items'] as List)
            .map((e) => Track.fromJson(e))
            .toList();
      } else if (response.data != null && response.data['tracks'] != null) {
        return (response.data['tracks'] as List)
            .map((e) => Track.fromJson(e))
            .toList();
      }
      return [];
    } catch (e) {
      throw Exception('Failed to load recommendations: $e');
    }
  }
}
