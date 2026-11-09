import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;
import 'api_service.dart';
import 'secure_storage_service.dart';

class AuthUser {
  AuthUser({
    required this.id,
    required this.email,
    required this.name,
    this.displayName,
    this.username,
    this.avatarUrl,
    this.role = 'LISTENER',
    this.isGuest = false,
    this.isVerified = false,
    this.preferences = const {},
  });

  final String id;
  final String email;
  String name;
  String? displayName;
  String? username;
  String? avatarUrl;
  final String role;
  final bool isGuest;
  final bool isVerified;
  Map<String, dynamic> preferences;

  String get effectiveName => displayName?.isNotEmpty == true
      ? displayName!
      : (name.isNotEmpty ? name : 'Listener');

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String? ?? 'guest_id',
      email: json['email'] as String? ?? '',
      name: json['name'] as String? ?? 'Listener',
      displayName: json['displayName'] as String? ?? json['name'] as String?,
      username: json['username'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      role: json['role'] as String? ?? 'LISTENER',
      isGuest: json['isGuest'] as bool? ?? false,
      isVerified: json['isVerified'] as bool? ?? false,
      preferences: json['preferences'] is Map<String, dynamic>
          ? json['preferences'] as Map<String, dynamic>
          : {},
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'name': name,
        'displayName': displayName,
        'username': username,
        'avatarUrl': avatarUrl,
        'role': role,
        'isGuest': isGuest,
        'isVerified': isVerified,
        'preferences': preferences,
      };
}

class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  static const String googleWebClientId =
      '362498893988-fnrqfrbcb6nbs2j2gvnev10qabc4c2en.apps.googleusercontent.com';

  final GoogleSignIn _googleSignIn = GoogleSignIn(
    serverClientId: googleWebClientId,
    scopes: ['email', 'profile'],
  );

  Completer<bool>? _refreshCompleter;

  Future<String?> getAccessToken() async => SecureStorageService.instance.accessToken;

  // ---------------------------------------------------------------------------
  // Google Sign-In (Real Native Flow)
  // ---------------------------------------------------------------------------
  Future<({AuthUser user, bool isNewUser})> signInWithGoogle() async {
    try {
      final account = await _googleSignIn.signIn();
      if (account == null) {
        throw Exception('Google sign-in was cancelled by user');
      }

      final auth = await account.authentication;
      final idToken = auth.idToken;

      if (idToken == null || idToken.isEmpty) {
        throw Exception(
            'Failed to retrieve Google ID token. Please verify your network and keystore SHA-1.');
      }

      final deviceId = SecureStorageService.instance.deviceId;
      final payload = {
        'idToken': idToken,
        'deviceId': deviceId,
        'deviceName': 'Android Mobile',
        'platform': 'android',
        'appVersion': '1.0.1',
      };

      final response = await _postFirstSuccessful('/api/auth/google', payload);
      final data = jsonDecode(response.body) as Map<String, dynamic>;

      final accessToken = data['accessToken'] as String?;
      final refreshToken = data['refreshToken'] as String?;

      if (accessToken == null || refreshToken == null) {
        throw Exception('Server failed to return valid authentication tokens');
      }

      await SecureStorageService.instance
          .saveTokens(accessToken: accessToken, refreshToken: refreshToken);
      ApiService.setAuthToken(accessToken);

      final user = AuthUser.fromJson(data['user'] as Map<String, dynamic>);
      final isNew = data['isNewUser'] as bool? ?? false;

      return (user: user, isNewUser: isNew);
    } catch (e) {
      if (kDebugMode) debugPrint('[AuthService] Google sign-in failure: $e');
      rethrow;
    }
  }

  // ---------------------------------------------------------------------------
  // Email OTP Request
  // ---------------------------------------------------------------------------
  Future<({String message, int cooldownSec})> requestEmailOtp(String email) async {
    final cleanEmail = email.trim().toLowerCase();
    final payload = {'email': cleanEmail};

    final response = await _postFirstSuccessful('/api/auth/otp/request', payload,
        fallbackPath: '/api/auth/request-otp');

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    return (
      message: data['message'] as String? ?? 'Code sent',
      cooldownSec: (data['cooldownSec'] as num?)?.toInt() ?? 45
    );
  }

  // ---------------------------------------------------------------------------
  // Email OTP Verify
  // ---------------------------------------------------------------------------
  Future<({AuthUser user, bool isNewUser})> verifyEmailOtp(
      String email, String code) async {
    final cleanEmail = email.trim().toLowerCase();
    final deviceId = SecureStorageService.instance.deviceId;

    final payload = {
      'email': cleanEmail,
      'code': code.trim(),
      'otp': code.trim(),
      'deviceId': deviceId,
      'deviceName': 'Android Mobile',
      'platform': 'android',
      'appVersion': '1.0.1',
    };

    final response = await _postFirstSuccessful('/api/auth/otp/verify', payload,
        fallbackPath: '/api/auth/verify-otp');

    final data = jsonDecode(response.body) as Map<String, dynamic>;

    final accessToken = data['accessToken'] as String?;
    final refreshToken = data['refreshToken'] as String?;

    if (accessToken == null || refreshToken == null) {
      throw Exception('Server failed to return session tokens');
    }

    await SecureStorageService.instance
        .saveTokens(accessToken: accessToken, refreshToken: refreshToken);
    ApiService.setAuthToken(accessToken);

    final user = AuthUser.fromJson(data['user'] as Map<String, dynamic>);
    final isNew = data['isNewUser'] as bool? ?? false;

    return (user: user, isNewUser: isNew);
  }

  // ---------------------------------------------------------------------------
  // Guest Session
  // ---------------------------------------------------------------------------
  Future<AuthUser> continueAsGuest() async {
    final response = await _postFirstSuccessful('/api/auth/guest', {});
    final data = jsonDecode(response.body) as Map<String, dynamic>;

    final token = (data['accessToken'] ?? data['token']) as String?;
    if (token != null) {
      ApiService.setAuthToken(token);
      await SecureStorageService.instance
          .saveTokens(accessToken: token, refreshToken: token);
    }

    return AuthUser.fromJson(data['user'] as Map<String, dynamic>);
  }

  // ---------------------------------------------------------------------------
  // Single-Flight Rotating Token Refresh
  // ---------------------------------------------------------------------------
  Future<bool> refreshToken() async {
    if (_refreshCompleter != null) {
      return _refreshCompleter!.future;
    }

    final completer = Completer<bool>();
    _refreshCompleter = completer;

    try {
      final oldRefresh = SecureStorageService.instance.refreshToken;
      if (oldRefresh == null || oldRefresh.isEmpty) {
        completer.complete(false);
        return false;
      }

      final payload = {'refreshToken': oldRefresh};
      final response = await _postFirstSuccessful('/api/auth/refresh', payload);

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final newAccess = data['accessToken'] as String?;
        final newRefresh = data['refreshToken'] as String?;

        if (newAccess != null && newRefresh != null) {
          await SecureStorageService.instance
              .saveTokens(accessToken: newAccess, refreshToken: newRefresh);
          ApiService.setAuthToken(newAccess);
          completer.complete(true);
          return true;
        }
      }

      completer.complete(false);
      return false;
    } catch (e) {
      if (kDebugMode) debugPrint('[AuthService] Token refresh error: $e');
      completer.complete(false);
      return false;
    } finally {
      _refreshCompleter = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Sign Out
  // ---------------------------------------------------------------------------
  Future<void> signOut() async {
    try {
      final refresh = SecureStorageService.instance.refreshToken;
      if (refresh != null) {
        await _postFirstSuccessful('/api/auth/logout', {'refreshToken': refresh});
      }
      await _googleSignIn.signOut().catchError((_) => null);
    } catch (_) {}

    await SecureStorageService.instance.clearTokens();
    ApiService.setAuthToken(null);
  }

  // ---------------------------------------------------------------------------
  // Guest Account Upgrade
  // ---------------------------------------------------------------------------
  Future<void> upgradeGuest(String guestId) async {
    try {
      final token = SecureStorageService.instance.accessToken;
      if (token == null) return;

      final headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };
      await _postFirstSuccessful(
        '/api/auth/upgrade',
        {'guestId': guestId},
        customHeaders: headers,
      );
    } catch (e) {
      if (kDebugMode) debugPrint('[AuthService] Guest upgrade warning: $e');
    }
  }

  // ---------------------------------------------------------------------------
  // HTTP Multi-Host Helper with Resilience
  // ---------------------------------------------------------------------------
  Future<http.Response> _postFirstSuccessful(
    String path,
    Map<String, dynamic> body, {
    String? fallbackPath,
    Map<String, String>? customHeaders,
  }) async {
    final client = http.Client();
    final jsonStr = jsonEncode(body);
    final headers = customHeaders ??
        {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          if (ApiService.authToken != null)
            'Authorization': 'Bearer ${ApiService.authToken}',
        };

    final paths = [path, ?fallbackPath];
    Exception? lastError;

    for (final base in ApiService.bases) {
      for (final p in paths) {
        try {
          final uri = Uri.parse('$base$p');
          final response = await client
              .post(uri, headers: headers, body: jsonStr)
              .timeout(const Duration(seconds: 12));

          if (response.statusCode >= 200 && response.statusCode < 300) {
            return response;
          }

          if (response.statusCode == 400 ||
              response.statusCode == 401 ||
              response.statusCode == 403 ||
              response.statusCode == 429) {
            // Client/Auth error - throw message from response
            final errBody = jsonDecode(response.body);
            final msg = errBody['message'] ?? errBody['error'] ?? 'Authentication failed';
            throw Exception(msg);
          }
        } on Exception catch (e) {
          lastError = e;
          if (e.toString().contains('Verification code') ||
              e.toString().contains('Incorrect') ||
              e.toString().contains('locked') ||
              e.toString().contains('wait') ||
              e.toString().contains('limit')) {
            rethrow;
          }
        }
      }
    }

    throw lastError ?? Exception('Connection to Zenify network failed');
  }
}
