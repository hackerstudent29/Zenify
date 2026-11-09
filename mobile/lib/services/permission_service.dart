import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Centralized permission service for Zenify Mobile.
///
/// Implements minimal, user-friendly permission management:
/// - POST_NOTIFICATIONS is requested when playback first starts (Android 13+)
/// - BLUETOOTH_CONNECT for direct device routing (Android 12+)
/// - READ_MEDIA_AUDIO / READ_EXTERNAL_STORAGE for local device music scanning
class PermissionService {
  PermissionService._();
  static final PermissionService instance = PermissionService._();

  static const MethodChannel _channel = MethodChannel('com.zenify.mobile/app');

  bool _notificationPromptTriggered = false;

  /// Ensures playback notification permission is granted on Android 13+ (API 33+).
  ///
  /// Safe to call on every track play: only triggers once per session if not yet granted.
  Future<bool> ensureNotificationPermission() async {
    if (kIsWeb || !Platform.isAndroid) return true;
    if (_notificationPromptTriggered) return true;
    _notificationPromptTriggered = true;

    try {
      final granted = await _channel.invokeMethod<bool>('requestNotificationPermission');
      return granted ?? false;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[PermissionService] Notification permission request error: $e');
      }
      return false;
    }
  }

  /// Checks if playback notification permission is currently granted.
  Future<bool> hasNotificationPermission() async {
    if (kIsWeb || !Platform.isAndroid) return true;
    try {
      final granted = await _channel.invokeMethod<bool>('hasNotificationPermission');
      return granted ?? false;
    } catch (e) {
      return false;
    }
  }

  /// Requests Bluetooth device connection permission (Android 12+ / API 31+).
  Future<bool> requestBluetoothPermission() async {
    if (kIsWeb || !Platform.isAndroid) return true;
    try {
      final granted = await _channel.invokeMethod<bool>('requestBluetoothPermission');
      return granted ?? false;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[PermissionService] Bluetooth permission request error: $e');
      }
      return false;
    }
  }

  /// Requests local media audio access permission (Android 13+ READ_MEDIA_AUDIO or legacy storage).
  Future<bool> requestAudioStoragePermission() async {
    if (kIsWeb || !Platform.isAndroid) return true;
    try {
      final granted = await _channel.invokeMethod<bool>('requestAudioStoragePermission');
      return granted ?? false;
    } catch (e) {
      if (kDebugMode) {
        debugPrint('[PermissionService] Storage permission request error: $e');
      }
      return false;
    }
  }
}

