import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'settings_service.dart';

/// Comprehensive OS-level System Notification Engine for Zenify Mobile.
///
/// Dispatches high-value, non-spammy system notifications to the Android status bar,
/// notification shade, and lock screen with rich artwork and deep-link routing.
class SystemNotificationService {
  SystemNotificationService._();
  static final SystemNotificationService instance = SystemNotificationService._();

  static const MethodChannel _channel = MethodChannel('com.zenify.mobile/notifications');

  // Android Notification Channels
  static const String chUpdates = 'zenify_updates';
  static const String chDiscovery = 'zenify_discovery';
  static const String chReleases = 'zenify_releases';
  static const String chSocial = 'zenify_social';
  static const String chDownloads = 'zenify_downloads';

  // SharedPreferences Keys
  static const String _kLastAtlasVisit = 'zen_last_atlas_visit_epoch';
  static const String _kLastReplayVisit = 'zen_last_replay_visit_epoch';
  static const String _kLastNotifDate = 'zen_notif_date_key';
  static const String _kDailyNotifCount = 'zen_notif_daily_count_key';
  static const String _kLastNotifiedVersion = 'zen_last_notified_update_version';
  static const String _kLastAtlasNudge = 'zen_last_atlas_nudge_epoch';
  static const String _kLastReplayNudge = 'zen_last_replay_nudge_epoch';
  static const String _kLastSundayDigest = 'zen_last_sunday_digest_epoch';

  final StreamController<String> _deepLinkController = StreamController<String>.broadcast();
  Stream<String> get onDeepLinkOpened => _deepLinkController.stream;

  bool _initialized = false;

  /// Initializes notification channel listener and checks for cold launch deep links.
  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;

    _channel.setMethodCallHandler((call) async {
      if (call.method == 'onNotificationOpened') {
        final route = call.arguments as String?;
        if (route != null && route.isNotEmpty) {
          if (kDebugMode) debugPrint('[SystemNotif] Deep link received: $route');
          _deepLinkController.add(route);
        }
      }
    });

    try {
      final initialLink = await _channel.invokeMethod<String>('getInitialDeepLink');
      if (initialLink != null && initialLink.isNotEmpty) {
        if (kDebugMode) debugPrint('[SystemNotif] Cold-start deep link: $initialLink');
        Future.delayed(const Duration(milliseconds: 600), () {
          _deepLinkController.add(initialLink);
        });
      }
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Visit Recorders
  // ─────────────────────────────────────────────────────────────────────────

  /// Call whenever user visits or interacts with the Music Atlas tab.
  Future<void> recordAtlasVisit() async {
    try {
      final sp = await SharedPreferences.getInstance();
      await sp.setInt(_kLastAtlasVisit, DateTime.now().millisecondsSinceEpoch);
    } catch (_) {}
  }

  /// Call whenever user opens the Replay & Taste Insights screen.
  Future<void> recordReplayVisit() async {
    try {
      final sp = await SharedPreferences.getInstance();
      await sp.setInt(_kLastReplayVisit, DateTime.now().millisecondsSinceEpoch);
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Smart Guardrails: Fatigue Cap, Quiet Hours, and Cooldowns
  // ─────────────────────────────────────────────────────────────────────────

  Future<bool> _canDispatch({
    required String category,
    bool bypassQuietHours = false,
  }) async {
    try {
      final s = SettingsState.instance;

      // Category-level settings checks
      if (category == 'update' && !s.notifyUpdates) return false;
      if ((category == 'atlas' || category == 'replay') && !s.notifyDiscovery) return false;
      if (category == 'digest' && !s.notifyWeeklyDigest) return false;
      if (category == 'release' && !s.newReleaseAlerts) return false;
      if (category == 'download' && !s.notifyDownloads) return false;
      if (category == 'social' && !s.notifyTogetherInvites) return false;

      final now = DateTime.now();

      // 1. Quiet Hours: 10:00 PM (22:00) to 09:00 AM (only live party invites can bypass)
      if (!bypassQuietHours) {
        if (now.hour >= 22 || now.hour < 9) {
          if (kDebugMode) debugPrint('[SystemNotif] Blocked by quiet hours: ${now.hour}:00');
          return false;
        }
      }

      final sp = await SharedPreferences.getInstance();

      // 2. Daily Fatigue Cap: Maximum 2 system notifications per day
      final todayStr = '${now.year}-${now.month}-${now.day}';
      final recordedDate = sp.getString(_kLastNotifDate) ?? '';
      int count = 0;
      if (recordedDate == todayStr) {
        count = sp.getInt(_kDailyNotifCount) ?? 0;
      }

      // App updates and live room invites bypass the daily cap
      if (category != 'update' && category != 'social' && count >= 2) {
        if (kDebugMode) debugPrint('[SystemNotif] Blocked by daily fatigue cap (2/2 today)');
        return false;
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _recordDispatchSuccess() async {
    try {
      final sp = await SharedPreferences.getInstance();
      final now = DateTime.now();
      final todayStr = '${now.year}-${now.month}-${now.day}';
      final recordedDate = sp.getString(_kLastNotifDate) ?? '';
      int count = 1;
      if (recordedDate == todayStr) {
        count = (sp.getInt(_kDailyNotifCount) ?? 0) + 1;
      }
      await sp.setString(_kLastNotifDate, todayStr);
      await sp.setInt(_kDailyNotifCount, count);
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // High-Value System Notification Dispatchers
  // ─────────────────────────────────────────────────────────────────────────

  /// 1. App Update Available System Notification
  Future<void> notifyAppUpdate({
    required String latestVersion,
    String? releaseNotes,
  }) async {
    final sp = await SharedPreferences.getInstance();
    final lastNotified = sp.getString(_kLastNotifiedVersion) ?? '';
    if (lastNotified == latestVersion) return; // Don't notify the same version twice

    if (!await _canDispatch(category: 'update')) return;

    await _showNotification(
      id: 1001,
      title: 'Zenify Update Available (v$latestVersion) 🚀',
      body: 'A new version with performance improvements and new features is ready. Tap to install.',
      channelId: chUpdates,
      deepLink: 'zenify://update',
    );

    await sp.setString(_kLastNotifiedVersion, latestVersion);
    await _recordDispatchSuccess();
  }

  /// 2. Unexplored Music Atlas Discovery Nudge
  Future<void> notifyAtlasDiscovery() async {
    final sp = await SharedPreferences.getInstance();
    final lastVisit = sp.getInt(_kLastAtlasVisit) ?? 0;
    final lastNudge = sp.getInt(_kLastAtlasNudge) ?? 0;
    final nowMs = DateTime.now().millisecondsSinceEpoch;

    // Must be at least 3 days since last Atlas visit and at least 10 days since last nudge
    final daysSinceVisit = (nowMs - lastVisit) / (1000 * 60 * 60 * 24);
    final daysSinceNudge = (nowMs - lastNudge) / (1000 * 60 * 60 * 24);

    if (daysSinceVisit < 3.0 || daysSinceNudge < 10.0) return;
    if (!await _canDispatch(category: 'atlas')) return;

    await _showNotification(
      id: 1002,
      title: 'Explore Music Across the Globe 🌍',
      body: 'Travel the world with the interactive Music Atlas and hear what\'s trending across cities.',
      channelId: chDiscovery,
      deepLink: 'zenify://atlas',
    );

    await sp.setInt(_kLastAtlasNudge, nowMs);
    await _recordDispatchSuccess();
  }

  /// 3. Unexplored Replay & Taste Insights Nudge
  Future<void> notifyReplayInsights({
    required int totalMinutes,
    String? topArtist,
  }) async {
    final sp = await SharedPreferences.getInstance();
    final lastVisit = sp.getInt(_kLastReplayVisit) ?? 0;
    final lastNudge = sp.getInt(_kLastReplayNudge) ?? 0;
    final nowMs = DateTime.now().millisecondsSinceEpoch;

    final daysSinceVisit = (nowMs - lastVisit) / (1000 * 60 * 60 * 24);
    final daysSinceNudge = (nowMs - lastNudge) / (1000 * 60 * 60 * 24);

    // Requires at least 30 mins listening, >= 5 days unvisited, >= 7 days cooldown
    if (totalMinutes < 30 || daysSinceVisit < 5.0 || daysSinceNudge < 7.0) return;
    if (!await _canDispatch(category: 'replay')) return;

    final body = (topArtist != null && topArtist.isNotEmpty)
        ? 'You have over $totalMinutes mins listened with $topArtist in your rotation. Tap to see your Replay.'
        : 'See your top artists, total listening hours, and musical taste profile.';

    await _showNotification(
      id: 1003,
      title: 'Your Music Replay is Waiting 🎧',
      body: body,
      channelId: chDiscovery,
      deepLink: 'zenify://replay',
    );

    await sp.setInt(_kLastReplayNudge, nowMs);
    await _recordDispatchSuccess();
  }

  /// 4. Weekly Replay Sunday Digest (Sunday 8:00 PM)
  Future<void> notifySundayDigest({
    required double hours,
    String? topArtist,
  }) async {
    final now = DateTime.now();
    // Only send on Sunday between 19:30 and 22:00
    if (now.weekday != DateTime.sunday || now.hour < 19 || now.hour >= 22) return;

    final sp = await SharedPreferences.getInstance();
    final lastDigest = sp.getInt(_kLastSundayDigest) ?? 0;
    final daysSinceDigest = (now.millisecondsSinceEpoch - lastDigest) / (1000 * 60 * 60 * 24);
    if (daysSinceDigest < 5.0) return;

    if (!await _canDispatch(category: 'digest')) return;

    final body = (topArtist != null && topArtist.isNotEmpty)
        ? 'You listened to ${hours.toStringAsFixed(1)}h this week with $topArtist leading your rotation.'
        : 'You listened to ${hours.toStringAsFixed(1)}h of music this week. Tap to explore your breakdown.';

    await _showNotification(
      id: 1004,
      title: 'Your Week in Music is Ready 🎧',
      body: body,
      channelId: chDiscovery,
      deepLink: 'zenify://replay',
    );

    await sp.setInt(_kLastSundayDigest, now.millisecondsSinceEpoch);
    await _recordDispatchSuccess();
  }

  /// 5. Followed Artist New Release Alert
  Future<void> notifyArtistRelease({
    required String artist,
    required String title,
    String? coverUrl,
    required String targetId,
  }) async {
    if (!await _canDispatch(category: 'release')) return;

    await _showNotification(
      id: 2000 + (artist.hashCode % 5000).abs(),
      title: 'New Release from $artist 🎵',
      body: '\'$title\' is out now! Tap to stream with studio audio.',
      channelId: chReleases,
      deepLink: 'zenify://album/$targetId',
      imageUrl: coverUrl,
    );

    await _recordDispatchSuccess();
  }

  /// 6. Live Room Together Listening Party Invite
  Future<void> notifyRoomInvite({
    required String friendName,
    required String roomCode,
  }) async {
    // Live party invites bypass quiet hours since they are time-sensitive
    if (!await _canDispatch(category: 'social', bypassQuietHours: true)) return;

    await _showNotification(
      id: 3000 + (roomCode.hashCode % 5000).abs(),
      title: 'Listening Party Invite 👥',
      body: '$friendName invited you to join a live listening session. Tap to tune in.',
      channelId: chSocial,
      deepLink: 'zenify://room/$roomCode',
    );

    await _recordDispatchSuccess();
  }

  /// 7. Background Offline Download Complete
  Future<void> notifyDownloadComplete({
    required String title,
    int count = 1,
  }) async {
    if (!await _canDispatch(category: 'download')) return;

    final body = count > 1
        ? '$count songs from \'$title\' are downloaded and ready for offline listening.'
        : '\'$title\' is downloaded and ready for offline listening.';

    await _showNotification(
      id: 4001,
      title: 'Offline Download Complete ⬇️',
      body: body,
      channelId: chDownloads,
      deepLink: 'zenify://downloads',
    );

    await _recordDispatchSuccess();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Native Bridge Invocation
  // ─────────────────────────────────────────────────────────────────────────

  Future<void> _showNotification({
    required int id,
    required String title,
    required String body,
    required String channelId,
    required String deepLink,
    String? imageUrl,
  }) async {
    try {
      await _channel.invokeMethod('showNotification', {
        'id': id,
        'title': title,
        'body': body,
        'channelId': channelId,
        'deepLink': deepLink,
        'imageUrl': imageUrl,
      });
      if (kDebugMode) {
        debugPrint('[SystemNotif] Dispatched: $title -> $deepLink');
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[SystemNotif] Error dispatching notification: $e');
    }
  }

  /// Checks if system notification permission is granted.
  Future<bool> hasPermission() async {
    try {
      final res = await _channel.invokeMethod<bool>('hasPermission');
      return res ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Requests notification permission on Android 13+.
  Future<bool> requestPermission() async {
    try {
      const appChannel = MethodChannel('com.zenify.mobile/app');
      final res = await appChannel.invokeMethod<bool>('requestNotificationPermission');
      return res ?? false;
    } catch (_) {
      return false;
    }
  }
}
