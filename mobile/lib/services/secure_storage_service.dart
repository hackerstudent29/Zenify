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
    try {
      _cachedAccessToken = await _storage.read(key: _kAccessTokenKey);
      _cachedRefreshToken = await _storage.read(key: _kRefreshTokenKey);
      _cachedDeviceId = await _storage.read(key: _kDeviceIdKey);

      if (_cachedDeviceId == null || _cachedDeviceId!.isEmpty) {
        // Fallback to shared_preferences or generate new
        final prefs = await SharedPreferences.getInstance();
        var id = prefs.getString(_kDeviceIdKey);
        if (id == null || id.isEmpty) {
          id = 'dev_${DateTime.now().millisecondsSinceEpoch}_${(1000 + (DateTime.now().microsecond % 9000))}';
          await prefs.setString(_kDeviceIdKey, id);
        }
        _cachedDeviceId = id;
        await _storage.write(key: _kDeviceIdKey, value: id);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[SecureStorage] Initialization fallback: $e');
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
  }

  Future<void> wipeAll() async {
    _cachedAccessToken = null;
    _cachedRefreshToken = null;
    try {
      await _storage.deleteAll();
    } catch (e) {
      if (kDebugMode) debugPrint('[SecureStorage] wipe all error: $e');
    }
  }
}

