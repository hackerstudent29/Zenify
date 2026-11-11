import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../models/room_models.dart';
import 'together_service.dart' show TogetherMember;

/// Merge into the existing service:
///
///   class TogetherService extends ChangeNotifier with TogetherRoomAdmin { ... }
///
/// The class must already expose: apiBase-equivalent (implement [apiBase]),
/// [authHeaders], roomCode, myUserId, isHost, mode, members.
/// Backend contract: BACKEND_AGENT_SPEC.md §6. All calls are authoritative on the server;
/// UI hints from [can] are cosmetic only.
mixin TogetherRoomAdmin on ChangeNotifier {
  // ── provided by TogetherService ──
  String get apiBase; // e.g. https://api.zenify.app
  Future<Map<String, String>> authHeaders();
  String get roomCode;
  String get myUserId;
  bool get isHost;
  String get mode;
  List<TogetherMember> get members;

  // ── new state (fill from WS: ROOM_STATE_UPDATED / ROOM_CONFIG_UPDATED / MEMBER_ROLE_UPDATED) ──
  RoomConfig? roomConfig;
  DateTime? roomEndsAt; // server-provided, null = unlimited
  String? lastRoomError; // wire code, e.g. PASSWORD_REQUIRED, WAITING_APPROVAL, ROOM_FULL, BLOCKED
  Set<String> speakerUserIds = {}; // when speakPolicy == SELECTED
  int queueRevision = 0; // set from every QUEUE_* event / snapshot

  void applyRoomConfig(Map<String, dynamic> json) {
    roomConfig = RoomConfig.fromJson(json);
    final end = json['endsAtMs'];
    roomEndsAt = end is num ? DateTime.fromMillisecondsSinceEpoch(end.toInt()) : null;
    speakerUserIds = {...((json['speakerUserIds'] as List?) ?? const []).cast<String>()};
    notifyListeners();
  }

  RoomRole get myRole {
    for (final m in members) {
      if (m.userId == myUserId) return RoomRole.parse(m.role);
    }
    return isHost ? RoomRole.host : RoomRole.member;
  }

  RoomRole roleOf(TogetherMember m) => RoomRole.parse(m.role);

  /// Cosmetic permission hint. Falls back to legacy rules until backend config arrives.
  bool can(RoomPermission p) {
    final cfg = roomConfig;
    if (cfg == null) {
      if (p == RoomPermission.playback) return isHost || mode == 'collab';
      if (p == RoomPermission.queueManage || p == RoomPermission.moderateChat || p == RoomPermission.manageRoles) return isHost;
      return true;
    }
    return cfg.allows(myRole, p);
  }

  bool get canSpeak => roomConfig?.canSpeak(myRole, selected: speakerUserIds.contains(myUserId)) ?? isHost;

  // ── REST helper ──
  Future<Map<String, dynamic>?> apiCall(String method, String path, [Map<String, dynamic>? body]) async {
    try {
      final uri = Uri.parse('$apiBase/api/v1/together$path');
      final headers = {...await authHeaders(), 'Content-Type': 'application/json', 'Idempotency-Key': '${DateTime.now().microsecondsSinceEpoch}-$myUserId'};
      final res = await (switch (method) {
        'GET' => http.get(uri, headers: headers),
        'DELETE' => http.delete(uri, headers: headers, body: body == null ? null : jsonEncode(body)),
        'PATCH' => http.patch(uri, headers: headers, body: jsonEncode(body ?? {})),
        _ => http.post(uri, headers: headers, body: jsonEncode(body ?? {})),
      }).timeout(const Duration(seconds: 12));
      final decoded = res.body.isEmpty ? <String, dynamic>{} : (jsonDecode(res.body) as Map<String, dynamic>);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        lastRoomError = null;
        return decoded;
      }
      final errField = decoded['error'];
      final rawCode = decoded['code'] as String? ??
          (errField is Map ? errField['code'] as String? : errField as String?) ??
          'HTTP_${res.statusCode}';
      lastRoomError = rawCode == 'USER_BLOCKED'
          ? 'BLOCKED'
          : (rawCode == 'WRONG_PASSWORD' ? 'PASSWORD_INVALID' : rawCode);
      debugPrint('[together] $method $path -> ${res.statusCode} $lastRoomError');
      return null;
    } catch (e) {
      lastRoomError = 'NETWORK';
      debugPrint('[together] $method $path failed: $e');
      return null;
    }
  }

  // ── Roles & moderation ──
  Future<bool> setMemberRole(String userId, RoomRole role) async => await apiCall('PATCH', '/rooms/$roomCode/members/$userId/role', {'role': role.wire}) != null;
  Future<bool> transferOwnership(String userId) async => await apiCall('POST', '/rooms/$roomCode/transfer', {'userId': userId}) != null;
  Future<bool> removeMember(String userId) async => await apiCall('DELETE', '/rooms/$roomCode/members/$userId') != null;
  Future<bool> blockMember(String userId) async => await apiCall('POST', '/rooms/$roomCode/blocks', {'userId': userId}) != null;
  Future<bool> updateRoomConfig(Map<String, dynamic> patch) async => await apiCall('PATCH', '/rooms/$roomCode/config', patch) != null;

  // ── Lifecycle ──
  /// Ends the room for everyone. Host (or permitted role) only. Server-enforced.
  Future<bool> closeRoom() async => await apiCall('POST', '/rooms/$roomCode/close') != null;

  // ── Queue ──
  Future<bool> reorderQueue(String itemId, int toIndex, int queueRevision) async => await apiCall('POST', '/rooms/$roomCode/queue/reorder', {'itemId': itemId, 'toIndex': toIndex, 'baseRevision': queueRevision}) != null;

  // ── Voice ──
  /// Returns {url, token} for LiveKit, or null if voice not configured / not permitted.
  Future<Map<String, dynamic>?> fetchVoiceToken() => apiCall('POST', '/rooms/$roomCode/voice/token');
  Future<bool> setSpeakers(Set<String> userIds) async => await apiCall('PATCH', '/rooms/$roomCode/voice/speakers', {'userIds': userIds.toList()}) != null;
  Future<bool> muteMemberMic(String userId, {required bool muted}) async => await apiCall('POST', '/rooms/$roomCode/voice/members/$userId/${muted ? 'mute' : 'unmute'}') != null;
  Future<bool> revokeSpeaking(String userId) async => await apiCall('POST', '/rooms/$roomCode/voice/members/$userId/revoke') != null;

  // ── Cover upload (multipart) ──
  Future<bool> uploadRoomCover(String code, String path) async {
    try {
      final req = http.MultipartRequest('POST', Uri.parse('$apiBase/api/v1/together/rooms/$code/cover'))
        ..headers.addAll(await authHeaders())
        ..files.add(await http.MultipartFile.fromPath('file', path));
      final res = await req.send().timeout(const Duration(seconds: 30));
      return res.statusCode >= 200 && res.statusCode < 300;
    } on SocketException {
      return false;
    } catch (_) {
      return false;
    }
  }

  // ── Insights (server-computed) ──
  Future<Map<String, dynamic>?> fetchInsights(String range) => apiCall('GET', '/insights?range=$range');
  Future<Map<String, dynamic>?> fetchRoomSummary(String sessionId) => apiCall('GET', '/insights/sessions/$sessionId');
  Future<Map<String, dynamic>?> fetchInsightsPrivacy() => apiCall('GET', '/insights/privacy');
  Future<bool> setInsightsPrivacy({required bool saveHistory, int? retentionDays}) async => await apiCall('PATCH', '/insights/privacy', {'saveHistory': saveHistory, 'retentionDays': retentionDays}) != null;
  Future<bool> deleteInsightsHistory() async => await apiCall('DELETE', '/insights') != null;
}
