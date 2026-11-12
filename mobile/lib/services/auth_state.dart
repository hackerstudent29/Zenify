import 'dart:async';
import 'dart:convert';
import 'package:flutter/cupertino.dart' show CupertinoIcons;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart' show Color, Colors, Icon;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../design_system/widgets/dynamic_island_header.dart';
import 'api_service.dart';
import 'auth_service.dart';
import 'secure_storage_service.dart';

class UserProfile {
  UserProfile({
    required this.id,
    required this.name,
    this.displayName,
    required this.username,
    required this.email,
    this.avatarUrl,
    this.tier = 'Zenify Hi-Fi Master',
    this.role = 'LISTENER',
    this.isGuest = false,
    this.isVerified = false,
    this.preferences = const {},
  });

  final String id;
  String name;
  String? displayName;
  String username;
  final String email;
  String? avatarUrl;
  final String tier;
  final String role;
  final bool isGuest;
  final bool isVerified;
  Map<String, dynamic> preferences;

  String get effectiveName => displayName?.isNotEmpty == true
      ? displayName!
      : (name.isNotEmpty ? name : 'Listener');

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'displayName': displayName,
        'username': username,
        'email': email,
        'avatarUrl': avatarUrl,
        'tier': tier,
        'role': role,
        'isGuest': isGuest,
        'isVerified': isVerified,
        'preferences': preferences,
      };

  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
        id: json['id'] as String? ?? 'user_1',
        name: json['name'] as String? ?? 'Zenify Listener',
        displayName: json['displayName'] as String? ?? json['name'] as String?,
        username: json['username'] as String? ?? 'zen_listener',
        email: json['email'] as String? ?? 'user@zenify.music',
        avatarUrl: json['avatarUrl'] as String?,
        tier: json['tier'] as String? ?? 'Zenify Hi-Fi Master',
        role: json['role'] as String? ?? 'LISTENER',
        isGuest: json['isGuest'] as bool? ?? false,
        isVerified: json['isVerified'] as bool? ?? false,
        preferences: json['preferences'] is Map<String, dynamic>
            ? json['preferences'] as Map<String, dynamic>
            : {},
      );

  factory UserProfile.fromAuthUser(AuthUser u) => UserProfile(
        id: u.id,
        name: u.name,
        displayName: u.displayName,
        username: u.username ?? u.email.split('@').first,
        email: u.email,
        avatarUrl: u.avatarUrl,
        tier: u.role == 'ADMIN' ? 'Zenify Hi-Fi Master (Admin)' : 'Zenify Hi-Fi Master',
        role: u.role,
        isGuest: u.isGuest,
        isVerified: u.isVerified,
        preferences: u.preferences,
      );
}

class AuthState extends ChangeNotifier {
  AuthState() {
    _loadFuture = _loadFromStorage();
  }

  static const String _kUserKey = 'zenify_auth_user';
  static const String _kQualityKey = 'zenify_audio_quality';
  static const String _kMeshKey = 'zenify_mesh_bg';
  static const String _kGuestDismissedAtKey = 'zenify_guest_dismissed_at_ms';
  static const Duration guestPromptInterval = Duration(days: 3);

  late final Future<void> _loadFuture;
  Future<void> ensureLoaded() => _loadFuture;

  UserProfile? _user;
  int? _lastGuestAcceptedAtMs;
  bool _isLoading = false;
  String _audioQuality = 'high';
  bool _enableMeshBackground = true;

  UserProfile? get user => _user;
  bool get isLoggedIn => _user != null && !_user!.isGuest;
  bool get isGuest => _user?.isGuest ?? false;
  bool get isLoading => _isLoading;
  String get audioQuality => _audioQuality;
  bool get enableMeshBackground => _enableMeshBackground;
  int? get lastGuestAcceptedAtMs => _lastGuestAcceptedAtMs;

  /// Returns whether the launch Sign-In screen should be shown:
  /// - NEVER shown if the user has signed in or signed up (`isLoggedIn == true`).
  /// - Shown on initial launch (no guest confirmation yet).
  /// - Shown again once every 3 days after the user taps "Continue as Guest".
  bool get shouldShowSignInPromptOnLaunch =>
      shouldShowSignInPromptAt(DateTime.now());

  bool shouldShowSignInPromptAt(DateTime now) {
    if (isLoggedIn) return false;
    final last = _lastGuestAcceptedAtMs;
    if (last == null) return true;
    return (now.millisecondsSinceEpoch - last) >=
        guestPromptInterval.inMilliseconds;
  }

  Future<void> _loadFromStorage() async {
    try {
      await SecureStorageService.instance.init();
      final prefs = await SharedPreferences.getInstance();
      final rawQuality = prefs.getString(_kQualityKey);
      _audioQuality = (rawQuality == '320k' || rawQuality == 'yt-direct' || rawQuality == null) ? 'high' : rawQuality;
      _enableMeshBackground = prefs.getBool(_kMeshKey) ?? true;
      _lastGuestAcceptedAtMs = prefs.getInt(_kGuestDismissedAtKey);

      final token = SecureStorageService.instance.accessToken;
      if (token != null && token.isNotEmpty) {
        ApiService.setAuthToken(token);
      }

      final raw = prefs.getString(_kUserKey);
      if (raw != null) {
        _user = UserProfile.fromJson(jsonDecode(raw) as Map<String, dynamic>);
      }
      notifyListeners();
    } catch (e) {
      if (kDebugMode) debugPrint('[AuthState] storage load error: $e');
    }
  }

  // ---------------------------------------------------------------------------
  // Google Sign-In
  // ---------------------------------------------------------------------------
  Future<({bool success, bool isNewUser, String? error})> signInWithGoogle() async {
    _isLoading = true;
    notifyListeners();

    try {
      final prevGuestId = _user?.isGuest == true ? _user!.id : null;
      final result = await AuthService.instance.signInWithGoogle();

      _user = UserProfile.fromAuthUser(result.user);
      await _clearGuestPromptTimestamp();
      await _persistUser();

      // Upgrade previous guest session data if applicable
      if (prevGuestId != null) {
        unawaited(AuthService.instance.upgradeGuest(prevGuestId));
      }

      _isLoading = false;
      notifyListeners();
      if (result.isNewUser) {
        IslandNotifier.instance.show(
          IslandNotification(
            id: 'auth_create_${_user!.id}',
            title: 'Joined',
            body: _user!.effectiveName,
            leading: const Icon(CupertinoIcons.person_crop_circle_badge_checkmark, color: Color(0xFFE11D48), size: 18),
          ),
        );
      } else {
        IslandNotifier.instance.show(
          IslandNotification(
            id: 'auth_welcome_${_user!.id}',
            title: 'Signed In',
            body: _user!.effectiveName,
            leading: const Icon(CupertinoIcons.person_crop_circle_fill, color: Color(0xFFE11D48), size: 18),
          ),
        );
      }
      return (success: true, isNewUser: result.isNewUser, error: null);
    } catch (e) {
      _isLoading = false;
      notifyListeners();
      return (success: false, isNewUser: false, error: e.toString().replaceAll('Exception: ', ''));
    }
  }

  // ---------------------------------------------------------------------------
  // Email OTP Request
  // ---------------------------------------------------------------------------
  Future<({bool success, String message, int cooldownSec})> requestEmailOtp(String email) async {
    try {
      final res = await AuthService.instance.requestEmailOtp(email);
      return (success: true, message: res.message, cooldownSec: res.cooldownSec);
    } catch (e) {
      return (
        success: false,
        message: e.toString().replaceAll('Exception: ', ''),
        cooldownSec: 45
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Email OTP Verify
  // ---------------------------------------------------------------------------
  Future<({bool success, bool isNewUser, String? error})> verifyEmailOtp(
      String email, String code) async {
    _isLoading = true;
    notifyListeners();

    try {
      final prevGuestId = _user?.isGuest == true ? _user!.id : null;
      final result = await AuthService.instance.verifyEmailOtp(email, code);

      _user = UserProfile.fromAuthUser(result.user);
      await _clearGuestPromptTimestamp();
      await _persistUser();

      if (prevGuestId != null) {
        unawaited(AuthService.instance.upgradeGuest(prevGuestId));
      }

      _isLoading = false;
      notifyListeners();
      if (result.isNewUser) {
        IslandNotifier.instance.show(
          IslandNotification(
            id: 'auth_create_${_user!.id}',
            title: 'Joined',
            body: _user!.effectiveName,
            leading: const Icon(CupertinoIcons.person_crop_circle_badge_checkmark, color: Color(0xFFE11D48), size: 18),
          ),
        );
      } else {
        IslandNotifier.instance.show(
          IslandNotification(
            id: 'auth_welcome_${_user!.id}',
            title: 'Signed In',
            body: _user!.effectiveName,
            leading: const Icon(CupertinoIcons.person_crop_circle_fill, color: Color(0xFFE11D48), size: 18),
          ),
        );
      }
      return (success: true, isNewUser: result.isNewUser, error: null);
    } catch (e) {
      _isLoading = false;
      notifyListeners();
      return (success: false, isNewUser: false, error: e.toString().replaceAll('Exception: ', ''));
    }
  }

  Future<void> signIn(String email, String password) async {
    _isLoading = true;
    notifyListeners();
    try {
      _user = UserProfile(
        id: 'user_${email.hashCode.abs()}',
        name: email.split('@').first,
        username: email.split('@').first,
        email: email,
      );
      await _persistUser();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> register(String name, String email, String password) async {
    _isLoading = true;
    notifyListeners();
    try {
      _user = UserProfile(
        id: 'user_${email.hashCode.abs()}',
        name: name.isNotEmpty ? name : email.split('@').first,
        username: email.split('@').first,
        email: email,
      );
      await _persistUser();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // ---------------------------------------------------------------------------
  // Continue as Guest
  // ---------------------------------------------------------------------------
  Future<void> continueAsGuest() async {
    _isLoading = true;
    notifyListeners();

    try {
      final guest = await AuthService.instance.continueAsGuest();
      _user = UserProfile.fromAuthUser(guest);
    } catch (e) {
      // Fallback local guest
      _user = UserProfile(
        id: 'guest_${DateTime.now().millisecondsSinceEpoch}',
        name: 'Guest Listener',
        username: 'guest',
        email: 'guest@zenify.music',
        isGuest: true,
      );
    } finally {
      _lastGuestAcceptedAtMs = DateTime.now().millisecondsSinceEpoch;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt(_kGuestDismissedAtKey, _lastGuestAcceptedAtMs!);
      await _persistUser();
      _isLoading = false;
      notifyListeners();
    }
  }

  // ---------------------------------------------------------------------------
  // Profile Updates
  // ---------------------------------------------------------------------------
  Future<void> updateProfile({
    String? name,
    String? displayName,
    String? username,
    String? avatarUrl,
  }) async {
    if (_user == null) return;
    if (name != null) _user!.name = name;
    if (displayName != null) _user!.displayName = displayName;
    if (username != null) _user!.username = username;
    if (avatarUrl != null) _user!.avatarUrl = avatarUrl;
    await _persistUser();
    notifyListeners();

    // Sync name / username remotely when authenticated
    final token = ApiService.authToken;
    if (_user?.isGuest == false && token != null && token.isNotEmpty) {
      final payload = <String, dynamic>{};
      if (name != null && name.isNotEmpty) payload['name'] = name;
      if (username != null && username.isNotEmpty) payload['username'] = username;
      if (avatarUrl != null) payload['avatarUrl'] = avatarUrl;
      try {
        await http
            .patch(
              Uri.parse('${ApiService.baseUrl}/api/auth/profile'),
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer $token',
              },
              body: jsonEncode(payload),
            )
            .timeout(const Duration(seconds: 8));
      } catch (_) {}
    }

    IslandNotifier.instance.show(
      IslandNotification(
        id: 'auth_prof_${DateTime.now().millisecondsSinceEpoch}',
        title: 'Saved',
        body: _user!.effectiveName,
        leading: const Icon(CupertinoIcons.checkmark_circle_fill, color: Color(0xFFE11D48), size: 18),
      ),
    );
  }

  Future<void> setAudioQuality(String quality) async {
    _audioQuality = quality;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kQualityKey, quality);
    final label = quality == 'flac' ? 'FLAC' : (quality == 'high' ? '320k HQ' : '160k');
    IslandNotifier.instance.show(
      IslandNotification(
        id: 'audio_qual_$quality',
        title: 'Quality',
        body: label,
        leading: const Icon(CupertinoIcons.waveform, color: Color(0xFFE11D48), size: 18),
      ),
    );
    notifyListeners();
  }

  Future<void> toggleMeshBackground(bool enabled) async {
    _enableMeshBackground = enabled;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kMeshKey, enabled);
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Sign Out
  // ---------------------------------------------------------------------------
  Future<void> signOut() async {
    await AuthService.instance.signOut();
    _user = null;
    _lastGuestAcceptedAtMs = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kUserKey);
    await prefs.remove(_kGuestDismissedAtKey);
    IslandNotifier.instance.show(
      IslandNotification(
        id: 'auth_signout_${DateTime.now().millisecondsSinceEpoch}',
        title: 'Signed Out',
        leading: const Icon(CupertinoIcons.arrow_right_square, color: Colors.white70, size: 18),
      ),
    );
    notifyListeners();
  }

  Future<void> _clearGuestPromptTimestamp() async {
    _lastGuestAcceptedAtMs = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kGuestDismissedAtKey);
  }

  Future<void> _persistUser() async {
    if (_user == null) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kUserKey, jsonEncode(_user!.toJson()));
  }
}
