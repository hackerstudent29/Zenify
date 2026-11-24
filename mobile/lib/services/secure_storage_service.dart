import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SecureStorageService {
  SecureStorageService._();
  static final SecureStorageService instance = SecureStorageService._();

  static const _kAccessTokenKey = 'zenify_access_token';
  static const _kRefreshTokenKey = 'zenify_refresh_token';
  static const _kDeviceIdKey = 'zenify_device_id';
  static const _kFallbackAccessTokenKey = 'zenify_persist_token_fallback';
  static const _kFallbackRefreshTokenKey = 'zenify_persist_refresh_fallback';

  final FlutterSecureStorage _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
      resetOnError: true,
    ),
  );

  String? _cachedAccessToken;
  String? _cachedRefreshToken;
  String? _cachedDeviceId;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    try {
      _cachedAccessToken = await _storage.read(key: _kAccessTokenKey);
      _cachedRefreshToken = await _storage.read(key: _kRefreshTokenKey);
      _cachedDeviceId = await _storage.read(key: _kDeviceIdKey);
    } catch (e) {
      if (kDebugMode) debugPrint('[SecureStorage] Initialization fallback: $e');
    }

    // Resilience recovery across app updates / Keystore resets:
    // If legacy unencrypted tokens exist, migrate them to encrypted _storage and wipe them from disk
    if (prefs.containsKey(_kFallbackAccessTokenKey) || prefs.containsKey(_kFallbackRefreshTokenKey)) {
      final fallbackAccess = prefs.getString(_kFallbackAccessTokenKey);
      final fallbackRefresh = prefs.getString(_kFallbackRefreshTokenKey);
      if ((_cachedAccessToken == null || _cachedAccessToken!.isEmpty) &&
          fallbackAccess != null &&
          fallbackAccess.isNotEmpty) {
        _cachedAccessToken = fallbackAccess;
        _cachedRefreshToken = fallbackRefresh;
        try {
          await _storage.write(key: _kAccessTokenKey, value: fallbackAccess);
          if (fallbackRefresh != null && fallbackRefresh.isNotEmpty) {
            await _storage.write(key: _kRefreshTokenKey, value: fallbackRefresh);
          }
        } catch (_) {}
      }
      // Security purge: remove unencrypted fallback keys from disk
      await prefs.remove(_kFallbackAccessTokenKey);
      await prefs.remove(_kFallbackRefreshTokenKey);
    }

    if (_cachedDeviceId == null || _cachedDeviceId!.isEmpty) {
      // Fallback to shared_preferences or generate new
      var id = prefs.getString(_kDeviceIdKey);
      if (id == null || id.isEmpty) {
        id = 'dev_${DateTime.now().millisecondsSinceEpoch}_${(1000 + (DateTime.now().microsecond % 9000))}';
        await prefs.setString(_kDeviceIdKey, id);
      }
      _cachedDeviceId = id;
      try {
        await _storage.write(key: _kDeviceIdKey, value: id);
      } catch (_) {}
    }
  }

  String? get accessToken => _cachedAccessToken;
  String? get refreshToken => _cachedRefreshToken;
  String get deviceId => _cachedDeviceId ?? 'android_client_id';

  Future<void> saveTokens({required String accessToken, required String refreshToken}) async {
    _cachedAccessToken = accessToken;
    _cachedRefreshToken = refreshToken;
    try {
      await _storage.write(key: _kAccessTokenKey, value: accessToken);
      await _storage.write(key: _kRefreshTokenKey, value: refreshToken);
    } catch (e) {
      if (kDebugMode) debugPrint('[SecureStorage] write tokens error: $e');
    }
    // Security hardening: ensure no unencrypted plaintext tokens are left on disk
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_kFallbackAccessTokenKey);
      await prefs.remove(_kFallbackRefreshTokenKey);
    } catch (_) {}
  }

  Future<void> clearTokens() async {
    _cachedAccessToken = null;
    _cachedRefreshToken = null;
    try {
      await _storage.delete(key: _kAccessTokenKey);
      await _storage.delete(key: _kRefreshTokenKey);
    } catch (e) {
      if (kDebugMode) debugPrint('[SecureStorage] clear tokens error: $e');
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_kFallbackAccessTokenKey);
      await prefs.remove(_kFallbackRefreshTokenKey);
    } catch (_) {}
  }

  Future<void> wipeAll() async {
    _cachedAccessToken = null;
    _cachedRefreshToken = null;
    try {
      await _storage.deleteAll();
    } catch (e) {
      if (kDebugMode) debugPrint('[SecureStorage] wipe all error: $e');
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_kFallbackAccessTokenKey);
      await prefs.remove(_kFallbackRefreshTokenKey);
    } catch (_) {}
  }
}

