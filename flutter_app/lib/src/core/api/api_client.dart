import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class ApiClient {
  late final Dio dio;

  ApiClient() {
    final rawApiUrl = dotenv.env['NEXT_PUBLIC_API_URL'] ?? 'https://zenify-production-111.up.railway.app/api';
    // Set baseUrl to the domain origin without '/api' suffix (e.g. 'https://zenify-production-111.up.railway.app')
    final baseOrigin = rawApiUrl.replaceAll(RegExp(r'/api$'), '');

    dio = Dio(
      BaseOptions(
        baseUrl: baseOrigin,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
        headers: {
          'Content-Type': 'application/json',
        },
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // Prepend '/api' prefix to all relative paths that do not already have it
          if (!options.path.startsWith('http') && !options.path.startsWith('/api')) {
            final cleanPath = options.path.startsWith('/') ? options.path : '/${options.path}';
            options.path = '/api$cleanPath';
          }

          // Get the current Supabase session token if user is logged in
          final session = Supabase.instance.client.auth.currentSession;
          if (session != null) {
            options.headers['Authorization'] = 'Bearer ${session.accessToken}';
          }
          return handler.next(options);
        },
        onError: (error, handler) {
          // Handle global errors here (e.g., 401 Unauthorized -> logout)
          return handler.next(error);
        },
      ),
    );
  }
}

final apiClient = ApiClient().dio;

String getProxiedAudioUrl(String? path) {
  if (path == null || path.isEmpty) return '';
  final trimmed = path.trim();

  if (trimmed.startsWith('blob:')) return trimmed;

  final apiUrl = dotenv.env['NEXT_PUBLIC_API_URL'] ?? 'https://zenify-production-111.up.railway.app/api';
  final baseOrigin = apiUrl.replaceAll(RegExp(r'/api$'), '');

  // Already proxied — use as-is
  if ((trimmed.startsWith('http://') || trimmed.startsWith('https://')) &&
      (trimmed.contains('/proxy-audio') || trimmed.contains('/stream-youtube'))) {
    return trimmed;
  }

  // YouTube must go through the server-side streaming proxy
  if (trimmed.startsWith('http') &&
      (trimmed.contains('youtube.com') || trimmed.contains('youtu.be'))) {
    return '$apiUrl/utils/stream-youtube?url=${Uri.encodeComponent(trimmed)}';
  }

  // Cloudflare R2 public CDN — supports CORS natively, use directly
  if (trimmed.contains('.r2.dev') || trimmed.contains('r2.cloudflarestorage.com')) {
    return trimmed;
  }

  // Cloudinary — supports CORS natively, use directly
  if (trimmed.contains('cloudinary.com') || trimmed.contains('res.cloudinary.com')) {
    return trimmed;
  }

  // Other external URLs — route through proxy to handle CORS
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return '$apiUrl/utils/proxy-audio?url=${Uri.encodeComponent(trimmed)}';
  }

  // Relative path — append to base origin
  final normalizedPath = trimmed.startsWith('/') ? trimmed : '/$trimmed';
  return '$baseOrigin$normalizedPath';
}
