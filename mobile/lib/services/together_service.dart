// lib/services/together_service.dart
//
// Real-Time Collaborative Room Engine for Zenify (Phase 1 + Phase 2)
// Supports NTP clock synchronization, scheduled start barriers,
// 3-tier drift correction, monotonic seq gap detection + RESUME replay,
// role-based access control, live chat/reactions, and recap.

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/room_models.dart';
import '../models/room_phase2_models.dart';
import '../models/track.dart';
import 'api_service.dart';
import 'player_state.dart';
import 'together_phase2.dart';
import 'together_room_admin.dart';

enum SyncHealth {
  connected,
  syncing,
  outOfSync,
  disconnected,
}

class TogetherMember {
  final String userId;
  final String username;
  final String? avatar;
  final String role; // 'HOST' | 'CO_HOST' | 'DJ' | 'MEMBER' | 'LISTENER' | ...
  final int joinedAt;
  final int lastPing;
  final bool bufferReady;
  final bool online;

  TogetherMember({
    required this.userId,
    required this.username,
    this.avatar,
    required this.role,
    this.joinedAt = 0,
    this.lastPing = 0,
    this.bufferReady = false,
    this.online = true,
  });

  bool get isHost {
    final u = role.toUpperCase();
    return u == 'HOST' || u == 'OWNER';
  }

  TogetherMember copyWith({
    String? role,
    bool? bufferReady,
    bool? online,
  }) {
    return TogetherMember(
      userId: userId,
      username: username,
      avatar: avatar,
      role: role ?? this.role,
      joinedAt: joinedAt,
      lastPing: lastPing,
      bufferReady: bufferReady ?? this.bufferReady,
      online: online ?? this.online,
    );
  }

  factory TogetherMember.fromJson(Map<String, dynamic> json) {
    return TogetherMember(
      userId: json['userId'] as String? ?? '',
      username: (json['username'] ?? json['displayName']) as String? ?? 'Listener',
      avatar: (json['avatar'] ?? json['avatarUrl']) as String?,
      role: json['role'] as String? ?? 'LISTENER',
      joinedAt: (json['joinedAt'] as num?)?.toInt() ?? 0,
      lastPing: (json['lastPing'] as num?)?.toInt() ?? 0,
      bufferReady: json['bufferReady'] as bool? ?? false,
      online: json['online'] as bool? ?? true,
    );
  }
}

class TogetherQueueItem {
  final String id;
  final String trackId;
  final Track track;
  final String addedByUserId;
  final String addedByName;
  final int addedAt;

  TogetherQueueItem({
    required this.id,
    required this.trackId,
    required this.track,
    required this.addedByUserId,
    required this.addedByName,
    required this.addedAt,
  });

  factory TogetherQueueItem.fromJson(Map<String, dynamic> json) {
    final rawTrack = json['track'];
    final t = rawTrack is Map
        ? Track.fromJson(Map<String, dynamic>.from(rawTrack))
        : Track(
            id: json['trackId'] as String? ?? '',
            title: json['title'] as String? ?? 'Unknown Title',
            artist: json['artist'] as String? ?? 'Unknown Artist',
            album: json['album'] as String? ?? '',
            coverUrl: json['coverUrl'] as String? ?? '',
          );
    return TogetherQueueItem(
      id: json['id'] as String? ?? '',
      trackId: json['trackId'] as String? ?? t.id,
      track: t,
      addedByUserId: json['addedByUserId'] as String? ?? '',
      addedByName: json['addedByName'] as String? ?? 'Listener',
      addedAt: (json['addedAt'] as num?)?.toInt() ?? 0,
    );
  }
}

class TogetherChatMessage {
  final String id;
  final String userId;
  final String username;
  final String? avatar;
  final String text;
  final String? replyToId;
  final String? replyToText;
  final int? editedAtMs;
  final int timestamp;

  TogetherChatMessage({
    required this.id,
    required this.userId,
    required this.username,
    this.avatar,
    required this.text,
    this.replyToId,
    this.replyToText,
    this.editedAtMs,
    required this.timestamp,
  });

  TogetherChatMessage copyWith({
    String? text,
    int? editedAtMs,
  }) {
    return TogetherChatMessage(
      id: id,
      userId: userId,
      username: username,
      avatar: avatar,
      text: text ?? this.text,
      replyToId: replyToId,
      replyToText: replyToText,
      editedAtMs: editedAtMs ?? this.editedAtMs,
      timestamp: timestamp,
    );
  }

  factory TogetherChatMessage.fromJson(Map<String, dynamic> json) {
    return TogetherChatMessage(
      id: json['id'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
      username: (json['username'] ?? json['displayName']) as String? ?? 'Guest',
      avatar: (json['avatar'] ?? json['avatarUrl']) as String?,
      text: json['text'] as String? ?? '',
      replyToId: json['replyToId'] as String?,
      replyToText: json['replyToText'] as String?,
      editedAtMs: (json['editedAtMs'] as num?)?.toInt(),
      timestamp: (json['timestamp'] as num?)?.toInt() ??
          (json['createdAtMs'] as num?)?.toInt() ??
          0,
    );
  }
}

class TogetherService extends ChangeNotifier with TogetherRoomAdmin, TogetherPhase2 {
  static final TogetherService instance = TogetherService._internal();
  TogetherService._internal();

  static const _prefGuestIdKey = 'zenify_together_guest_id';
  static const _prefRoomCodeKey = 'zenify_together_active_room';
  static const _prefTicketKey = 'zenify_together_active_ticket';
  static const _prefUserIdKey = 'zenify_together_active_user';
  static const _prefUserNameKey = 'zenify_together_active_name';

  PlayerState? _playerState;
  bool _restoredOnce = false;

  void attachPlayer(PlayerState player) {
    _playerState = player;
    if (!_restoredOnce) {
      _restoredOnce = true;
      unawaited(resumeSavedSession());
    }
  }

  // Room State
  bool _inRoom = false;
  String _roomCode = '';
  String _hostId = '';
  String _myUserId = '';
  String _myUsername = '';
  String? _myAvatar;
  String _myRole = 'LISTENER';
  String _mode = 'dj'; // 'dj' | 'collab'
  int _lastSeq = 0;
  String? _ticket;
  String _guestId = '';

  List<TogetherMember> _members = [];
  List<TogetherQueueItem> _queue = [];
  List<TogetherChatMessage> _chat = [];
  List<String> _skipVotes = [];
  Map<String, int> _reactions = {'❤️': 0, '🔥': 0, '👏': 0, '😭': 0};

  // Playback sync properties
  Track? _currentTrack;
  bool _isPlaying = false;
  double _positionSec = 0.0;
  int _startedAtServerMs = 0;

  // Sync health & NTP offset
  SyncHealth _syncHealth = SyncHealth.disconnected;
  int _pingMs = 0;
  int _clockOffsetMs = 0;
  bool _leaveSync = false;

  // Timers & Sockets
  WebSocket? _ws;
  Timer? _syncTimer;
  Timer? _driftTimer;
  Timer? _barrierTimer;
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  bool _isDisposed = false;
  bool _intentionalClose = false;

  // Mixin contracts
  @override
  String get apiBase => ApiService.baseUrl;

  @override
  Future<Map<String, String>> authHeaders() async {
    await _ensureGuestId();
    final token = ApiService.authToken;
    return {
      'Accept': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
      if (_ticket != null && _ticket!.isNotEmpty) 'X-Together-Ticket': _ticket!,
      if (_guestId.isNotEmpty) 'X-Guest-Id': _guestId,
      if (_myUsername.isNotEmpty) 'X-Guest-Name': _myUsername,
    };
  }

  // Public Getters
  bool get inRoom => _inRoom;
  @override
  String get roomCode => _roomCode;
  @override
  String get myUserId => _myUserId;
  String get myUsername => _myUsername;
  String? get myAvatar => _myAvatar;
  @override
  bool get isHost {
    final u = _myRole.toUpperCase();
    return u == 'HOST' || u == 'OWNER' || (_hostId.isNotEmpty && _hostId == _myUserId);
  }

  @override
  String get mode => _mode;
  int get memberCount => _members.length;

  @override
  List<TogetherMember> get members => List.unmodifiable(_members);
  List<TogetherQueueItem> get queue => List.unmodifiable(_queue);
  List<TogetherChatMessage> get chat => List.unmodifiable(_chat);
  List<String> get skipVotes => List.unmodifiable(_skipVotes);
  Map<String, int> get reactions => Map.unmodifiable(_reactions);

  Track? get currentTrack => _currentTrack;
  bool get isPlaying => _isPlaying;
  double get positionSec => _positionSec;
  SyncHealth get syncHealth => _syncHealth;
  int get pingMs => _pingMs;
  int get clockOffsetMs => _clockOffsetMs;
  bool get leaveSync => _leaveSync;

  int get skipVotesNeeded => math.max(1, (_members.length * 0.5).ceil());
  bool get hasVotedSkip => _skipVotes.contains(_myUserId);

  // ────────────────────────── Session / Persistence ──────────────────────────

  Future<void> _ensureGuestId() async {
    if (_guestId.isNotEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final existing = prefs.getString(_prefGuestIdKey);
      if (existing != null && existing.isNotEmpty) {
        _guestId = existing;
      } else {
        final rand = math.Random.secure();
        final hex = List.generate(12, (_) => rand.nextInt(16).toRadixString(16)).join();
        _guestId = 'guest_$hex';
        await prefs.setString(_prefGuestIdKey, _guestId);
      }
    } catch (_) {
      _guestId = 'guest_${DateTime.now().microsecondsSinceEpoch}';
    }
  }

  Future<void> _saveActiveSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefRoomCodeKey, _roomCode);
      if (_ticket != null && _ticket!.isNotEmpty) {
        await prefs.setString(_prefTicketKey, _ticket!);
      }
      if (_myUserId.isNotEmpty) await prefs.setString(_prefUserIdKey, _myUserId);
      if (_myUsername.isNotEmpty) await prefs.setString(_prefUserNameKey, _myUsername);
    } catch (_) {}
  }

  Future<void> _clearSavedSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_prefRoomCodeKey);
      await prefs.remove(_prefTicketKey);
      await prefs.remove(_prefUserIdKey);
      await prefs.remove(_prefUserNameKey);
    } catch (_) {}
  }

  Future<bool> resumeSavedSession() async {
    if (_inRoom || _isDisposed) return false;
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedCode = prefs.getString(_prefRoomCodeKey);
      final savedTicket = prefs.getString(_prefTicketKey);
      if (savedCode == null || savedCode.isEmpty || savedTicket == null || savedTicket.isEmpty) {
        return false;
      }
      _ticket = savedTicket;
      _myUserId = prefs.getString(_prefUserIdKey) ?? _myUserId;
      _myUsername = prefs.getString(_prefUserNameKey) ?? _myUsername;
      final res = await apiCall('GET', '/rooms/$savedCode');
      if (res == null || res['state'] == 'CLOSED' || res['state'] == 'EXPIRED') {
        _ticket = null;
        await _clearSavedSession();
        return false;
      }
      _initFromRoomJson(res, savedCode);
      await _connectWs(savedTicket);
      return true;
    } catch (_) {
      return false;
    }
  }

  String _extractErrorCode(http.Response res) {
    try {
      if (res.body.isEmpty) return 'HTTP_${res.statusCode}';
      final decoded = jsonDecode(res.body);
      if (decoded is Map) {
        final err = decoded['error'];
        final raw = decoded['code'] as String? ??
            (err is Map ? err['code'] as String? : err as String?) ??
            'HTTP_${res.statusCode}';
        if (raw == 'USER_BLOCKED') return 'BLOCKED';
        if (raw == 'WRONG_PASSWORD') return 'PASSWORD_INVALID';
        return raw;
      }
    } catch (_) {}
    return 'HTTP_${res.statusCode}';
  }

  String _idempotencyKey() {
    final rand = math.Random().nextInt(999999);
    return '${DateTime.now().microsecondsSinceEpoch}-${_myUserId.isNotEmpty ? _myUserId : _guestId}-$rand';
  }

  // ────────────────────────── REST API (v1) ──────────────────────────

  /// Create a new collaborative session
  Future<bool> createRoom({
    String mode = 'dj',
    String? guestName,
    RoomConfig? config,
    bool guestCanQueue = true,
    bool guestCanChat = true,
  }) async {
    try {
      await _ensureGuestId();
      final effectiveName = (guestName ?? '').trim().isNotEmpty ? guestName!.trim() : 'Host DJ';
      _myUsername = effectiveName;
      lastRoomError = null;

      final uri = Uri.parse('$apiBase/api/v1/together/rooms');
      final headers = {
        ...await authHeaders(),
        'Content-Type': 'application/json',
        'Idempotency-Key': _idempotencyKey(),
      };
      final body = <String, dynamic>{
        'mode': config?.mode ?? mode,
        'guestName': effectiveName,
        'guestId': _guestId,
        if (config != null) 'config': config.toJson(),
        'guestCanQueue': config == null
            ? guestCanQueue
            : config.allows(RoomRole.listener, RoomPermission.queueEdit),
        'guestCanChat': guestCanChat,
      };

      final resp = await http.post(uri, headers: headers, body: jsonEncode(body)).timeout(const Duration(seconds: 15));
      if (resp.statusCode == 201 || resp.statusCode == 200) {
        final data = jsonDecode(resp.body) as Map<String, dynamic>;
        final code = data['roomCode'] as String? ?? '';
        _ticket = data['ticket'] as String?;
        _myUserId = data['userId'] as String? ?? _myUserId;
        _myRole = (data['role'] as String?) ?? 'HOST';
        final roomData = Map<String, dynamic>.from((data['room'] ?? data['snapshot']) as Map? ?? const {});

        clearPhase2State();
        _initFromRoomJson(roomData, code);
        await _saveActiveSession();
        if (_ticket != null && _ticket!.isNotEmpty) {
          await _connectWs(_ticket!);
        }
        return true;
      }
      lastRoomError = _extractErrorCode(resp);
      notifyListeners();
      return false;
    } catch (e) {
      debugPrint('[TogetherService] createRoom error: $e');
      lastRoomError = 'NETWORK';
      notifyListeners();
      return false;
    }
  }

  /// Join an existing collaborative session via 6-char room code
  Future<bool> joinRoom(
    String code, {
    String? guestName,
    String? password,
    String? inviteToken,
  }) async {
    try {
      await _ensureGuestId();
      final cleanCode = code.trim().toUpperCase();
      final effectiveName = (guestName ?? '').trim().isNotEmpty
          ? guestName!.trim()
          : (_myUsername.isNotEmpty ? _myUsername : 'Listener ${math.Random().nextInt(900) + 100}');
      _myUsername = effectiveName;
      lastRoomError = null;

      final uri = Uri.parse('$apiBase/api/v1/together/rooms/$cleanCode/join');
      final headers = {
        ...await authHeaders(),
        'Content-Type': 'application/json',
        'Idempotency-Key': _idempotencyKey(),
      };
      final body = <String, dynamic>{
        'guestName': effectiveName,
        'guestId': _guestId,
        if (password != null && password.isNotEmpty) 'password': password,
        if (inviteToken != null && inviteToken.isNotEmpty) 'inviteToken': inviteToken,
      };

      final resp = await http.post(uri, headers: headers, body: jsonEncode(body)).timeout(const Duration(seconds: 15));
      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        final data = jsonDecode(resp.body) as Map<String, dynamic>;
        return _handleJoinResponse(data, fallbackCode: cleanCode);
      }

      lastRoomError = _extractErrorCode(resp);
      notifyListeners();
      return false;
    } catch (e) {
      debugPrint('[TogetherService] joinRoom error: $e');
      lastRoomError = 'NETWORK';
      notifyListeners();
      return false;
    }
  }

  @override
  Future<bool> joinWithInvite(String token, {String? guestName}) async {
    try {
      await _ensureGuestId();
      final effectiveName = (guestName ?? '').trim().isNotEmpty
          ? guestName!.trim()
          : (_myUsername.isNotEmpty ? _myUsername : 'Listener ${math.Random().nextInt(900) + 100}');
      _myUsername = effectiveName;
      lastRoomError = null;

      final uri = Uri.parse('$apiBase/api/v1/together/invites/join');
      final headers = {
        ...await authHeaders(),
        'Content-Type': 'application/json',
        'Idempotency-Key': _idempotencyKey(),
      };
      final resp = await http
          .post(
            uri,
            headers: headers,
            body: jsonEncode({
              'token': token,
              'guestName': effectiveName,
              'guestId': _guestId,
            }),
          )
          .timeout(const Duration(seconds: 15));

      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        final data = jsonDecode(resp.body) as Map<String, dynamic>;
        return _handleJoinResponse(data);
      }
      lastRoomError = _extractErrorCode(resp);
      notifyListeners();
      return false;
    } catch (e) {
      debugPrint('[TogetherService] joinWithInvite error: $e');
      lastRoomError = 'NETWORK';
      notifyListeners();
      return false;
    }
  }

  Future<bool> _handleJoinResponse(Map<String, dynamic> data, {String fallbackCode = ''}) async {
    if (data['status'] == 'WAITING_APPROVAL') {
      lastRoomError = 'WAITING_APPROVAL';
      notifyListeners();
      return false;
    }

    final resolvedCode = (data['roomCode'] as String? ?? fallbackCode).trim().toUpperCase();
    _ticket = data['ticket'] as String?;
    _myUserId = data['userId'] as String? ?? _myUserId;
    if (data['role'] is String) {
      _myRole = data['role'] as String;
    }
    final roomData = Map<String, dynamic>.from((data['room'] ?? data['snapshot']) as Map? ?? const {});

    clearPhase2State();
    _initFromRoomJson(roomData, resolvedCode);
    await _saveActiveSession();
    if (_ticket != null && _ticket!.isNotEmpty) {
      await _connectWs(_ticket!);
    }
    return true;
  }

  void _initFromRoomJson(Map<String, dynamic> json, String code) {
    final normalizedCode = (json['roomCode'] as String? ?? code).trim().toUpperCase();
    if (normalizedCode.isNotEmpty) _roomCode = normalizedCode;
    _inRoom = true;
    _hostId = json['hostId'] as String? ?? _hostId;
    _mode = json['mode'] as String? ?? 'dj';
    _lastSeq = (json['seq'] as num?)?.toInt() ?? _lastSeq;
    queueRevision = (json['queueRevision'] as num?)?.toInt() ??
        (json['revision'] as num?)?.toInt() ??
        queueRevision;

    // Room Config (RoomConfig + endsAtMs)
    final rawConfig = json['config'];
    if (rawConfig is Map) {
      applyRoomConfig(Map<String, dynamic>.from(rawConfig));
    }

    // Theme & DJ settings
    applyRoomSnapshotPhase2(json);

    // Members
    final rawMembers = json['members'] as List<dynamic>? ?? [];
    _members = rawMembers
        .whereType<Map>()
        .map((m) => TogetherMember.fromJson(Map<String, dynamic>.from(m)))
        .toList();

    for (final m in _members) {
      if (m.userId == _myUserId) {
        _myRole = m.role;
        _myUsername = m.username;
        _myAvatar = m.avatar ?? _myAvatar;
      }
    }

    // Queue
    final rawQueue = json['queue'] as List<dynamic>? ?? [];
    _queue = rawQueue
        .whereType<Map>()
        .map((q) => TogetherQueueItem.fromJson(Map<String, dynamic>.from(q)))
        .toList();

    // Chat
    final rawChat = json['chat'] as List<dynamic>? ?? [];
    _chat = rawChat
        .whereType<Map>()
        .map((c) => TogetherChatMessage.fromJson(Map<String, dynamic>.from(c)))
        .toList();

    // Song requests snapshot if included
    final rawReqs = json['songRequests'] ?? json['requests'];
    if (rawReqs is List) {
      requests = rawReqs
          .whereType<Map>()
          .map((e) => SongRequest.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }

    // Join requests snapshot if included
    final rawJoins = json['joinRequests'];
    if (rawJoins is List) {
      joinRequests = rawJoins
          .whereType<Map>()
          .map((e) => JoinRequest.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    }

    // Skip votes & reactions
    final rawVotes = json['skipVotes'] as List<dynamic>? ?? [];
    _skipVotes = rawVotes.map((e) => e.toString()).toList();

    final rawReactions = json['reactions'] as Map? ?? const {};
    _applyReactionCounts(rawReactions);

    // Player
    final playerObj = json['player'];
    if (playerObj is Map) {
      _applyPlayerState(Map<String, dynamic>.from(playerObj));
    }

    notifyListeners();
  }

  void _applyReactionCounts(Map raw) {
    final next = <String, int>{'❤️': 0, '🔥': 0, '👏': 0, '😭': 0};
    for (final entry in raw.entries) {
      next[entry.key.toString()] = (entry.value as num?)?.toInt() ?? 0;
    }
    _reactions = next;
  }

  // ────────────────────────── WebSocket ──────────────────────────

  Future<void> _connectWs(String ticket) async {
    await _disconnectWs();
    _intentionalClose = false;

    final baseUri = Uri.parse(apiBase);
    final wsScheme = baseUri.scheme == 'https' ? 'wss' : 'ws';
    final portStr = baseUri.hasPort ? ':${baseUri.port}' : '';
    final seqQuery = _lastSeq > 0 ? '&lastSeq=$_lastSeq' : '';
    final wsUrl = '$wsScheme://${baseUri.host}$portStr/ws/together?ticket=${Uri.encodeQueryComponent(ticket)}$seqQuery';

    try {
      _syncHealth = SyncHealth.syncing;
      notifyListeners();

      _ws = await WebSocket.connect(wsUrl);
      _ws!.pingInterval = const Duration(seconds: 20);
      _reconnectAttempts = 0;
      _syncHealth = SyncHealth.connected;
      notifyListeners();

      _ws!.listen(
        _onWsMessage,
        onError: (err) {
          debugPrint('[TogetherService] WS error: $err');
          _handleWsDisconnect();
        },
        onDone: () {
          debugPrint('[TogetherService] WS closed');
          _handleWsDisconnect();
        },
      );

      _startSyncTimers();
      _sendNtpPing();
      if (_lastSeq > 0) {
        _send({'type': 'RESUME', 'lastSeq': _lastSeq});
      }
    } catch (e) {
      debugPrint('[TogetherService] WS connect error: $e');
      _handleWsDisconnect();
    }
  }

  void _onWsMessage(dynamic raw) {
    try {
      final map = jsonDecode(raw.toString()) as Map<String, dynamic>;
      final type = map['type'] as String? ?? '';
      final payload = map['payload'] is Map
          ? Map<String, dynamic>.from(map['payload'] as Map)
          : const <String, dynamic>{};

      // Track revision
      final rev = (map['revision'] as num?)?.toInt() ?? (payload['revision'] as num?)?.toInt();
      if (rev != null && rev > queueRevision) {
        queueRevision = rev;
      }

      // Sequence gap detection on persisted room events (seq > 0)
      final seq = (map['seq'] as num?)?.toInt();
      if (seq != null && seq > 0) {
        if (_lastSeq > 0 && seq > _lastSeq + 1 && type != 'INIT_STATE') {
          debugPrint('[TogetherService] Sequence gap (expected ${_lastSeq + 1}, got $seq). Resuming...');
          _send({'type': 'RESUME', 'lastSeq': _lastSeq});
        }
        if (seq > _lastSeq) _lastSeq = seq;
      }

      switch (type) {
        case 'INIT_STATE':
          final rawRoom = map['room'] ?? map['state'] ?? (payload.isNotEmpty ? payload : null);
          if (rawRoom is Map) {
            final room = Map<String, dynamic>.from(rawRoom);
            final self = map['self'] as Map<String, dynamic>?;
            if (self != null) {
              _myUserId = self['userId'] as String? ?? _myUserId;
              _myUsername = self['username'] as String? ?? _myUsername;
              _myAvatar = self['avatar'] as String? ?? _myAvatar;
              _myRole = self['role'] as String? ?? _myRole;
            }
            _initFromRoomJson(room, _roomCode);
            _syncWithRoomPlayback();
          }
          break;

        case 'SYNC_PONG':
          _handleNtpPong(map);
          break;

        case 'PLAY_AT':
          _handlePlayAt({...payload, ...map});
          break;

        case 'PAUSE_AT':
          _handlePauseAt({...payload, ...map});
          break;

        case 'SEEK_TO':
          _handleSeekTo({...payload, ...map});
          break;

        case 'QUEUE_UPDATED':
          final rawQueue = (payload['queue'] ?? map['queue']) as List<dynamic>? ?? [];
          _queue = rawQueue
              .whereType<Map>()
              .map((q) => TogetherQueueItem.fromJson(Map<String, dynamic>.from(q)))
              .toList();
          notifyListeners();
          break;

        case 'SKIP_VOTES_UPDATED':
        case 'SKIP_VOTE_UPDATE':
          final rawVoters = (payload['voters'] ?? map['voters']) as List<dynamic>? ?? [];
          _skipVotes = rawVoters.map((e) => e.toString()).toList();
          notifyListeners();
          break;

        case 'SKIP_TRIGGERED':
          _skipVotes.clear();
          notifyListeners();
          break;

        case 'REACTION':
        case 'REACTION_BURST':
          final rawReactions = payload['counts'] ?? payload['reactions'] ?? map['reactions'];
          if (rawReactions is Map) {
            _applyReactionCounts(rawReactions);
          } else {
            final emoji = (payload['emoji'] ?? map['emoji']) as String?;
            if (emoji != null && emoji.isNotEmpty) {
              _reactions[emoji] = (_reactions[emoji] ?? 0) + 1;
            }
          }
          notifyListeners();
          break;

        case 'CHAT_MESSAGE':
          final rawChat = map['chatItem'] ?? payload['message'] ?? (payload.containsKey('text') ? payload : null);
          if (rawChat is Map) {
            final item = TogetherChatMessage.fromJson(Map<String, dynamic>.from(rawChat));
            final exists = item.id.isNotEmpty && _chat.any((c) => c.id == item.id);
            if (!exists) {
              _chat.add(item);
              if (_chat.length > 60) _chat = _chat.sublist(_chat.length - 60);
              notifyListeners();
            }
          }
          break;

        case 'CHAT_MESSAGE_EDITED':
          final msgId = (payload['id'] ?? payload['messageId']) as String?;
          final newText = payload['text'] as String?;
          if (msgId != null && newText != null) {
            final idx = _chat.indexWhere((c) => c.id == msgId);
            if (idx >= 0) {
              _chat[idx] = _chat[idx].copyWith(
                text: newText,
                editedAtMs: (payload['editedAtMs'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch,
              );
              notifyListeners();
            }
          }
          break;

        case 'CHAT_MESSAGE_DELETED':
          final delId = (payload['id'] ?? payload['messageId']) as String?;
          if (delId != null) {
            _chat = _chat.where((c) => c.id != delId).toList();
            notifyListeners();
          }
          break;

        case 'MEMBER_JOINED':
        case 'USER_JOINED':
          final rawMembers = (map['members'] ?? payload['members']) as List<dynamic>?;
          if (rawMembers != null) {
            _members = rawMembers
                .whereType<Map>()
                .map((m) => TogetherMember.fromJson(Map<String, dynamic>.from(m)))
                .toList();
          } else if (payload['userId'] is String) {
            final joined = TogetherMember.fromJson(payload);
            final idx = _members.indexWhere((m) => m.userId == joined.userId);
            if (idx >= 0) {
              _members[idx] = joined;
            } else {
              _members = [..._members, joined];
            }
          }
          notifyListeners();
          break;

        case 'MEMBER_LEFT':
        case 'USER_LEFT':
          final newHostId = (map['newHostId'] ?? payload['newHostId']) as String?;
          final leftUserId = payload['userId'] as String?;
          final kicked = payload['kicked'] == true || payload['blocked'] == true;
          if (kicked && leftUserId == _myUserId) {
            lastRoomError = payload['blocked'] == true ? 'BLOCKED' : 'KICKED';
            unawaited(_handleLocalTermination(closedForRecap: false));
            return;
          }
          final rawMembers = (map['members'] ?? payload['members']) as List<dynamic>?;
          if (rawMembers != null) {
            _members = rawMembers
                .whereType<Map>()
                .map((m) => TogetherMember.fromJson(Map<String, dynamic>.from(m)))
                .toList();
          } else if (leftUserId != null) {
            _members = _members.where((m) => m.userId != leftUserId).toList();
          }
          if (newHostId != null && newHostId.isNotEmpty) {
            _hostId = newHostId;
            _members = _members
                .map((m) => m.userId == newHostId ? m.copyWith(role: 'HOST') : m)
                .toList();
            if (newHostId == _myUserId) _myRole = 'HOST';
          }
          notifyListeners();
          break;

        case 'MEMBER_ROLE_CHANGED':
        case 'MEMBER_ROLE_UPDATED':
          final targetId = payload['userId'] as String?;
          final role = payload['role'] as String?;
          if (targetId != null && role != null) {
            _members = _members
                .map((m) => m.userId == targetId
                    ? m.copyWith(role: role)
                    : m)
                .toList();
            if (targetId == _myUserId) _myRole = role;
            notifyListeners();
          }
          break;

        case 'HOST_TRANSFERRED':
          final toUserId = (payload['toUserId'] ?? payload['newHostId']) as String?;
          final fromUserId = payload['fromUserId'] as String?;
          if (toUserId != null && toUserId.isNotEmpty) {
            _hostId = toUserId;
            _members = _members.map((m) {
              if (m.userId == toUserId) return m.copyWith(role: 'HOST');
              if (m.userId == fromUserId) return m.copyWith(role: 'CO_HOST');
              return m;
            }).toList();
            if (toUserId == _myUserId) _myRole = 'HOST';
            if (fromUserId == _myUserId) _myRole = 'CO_HOST';
            notifyListeners();
          }
          break;

        case 'ROOM_CONFIG_UPDATED':
          final cfg = payload['config'];
          if (cfg is Map) {
            final cfgMap = Map<String, dynamic>.from(cfg);
            _mode = cfgMap['mode'] as String? ?? _mode;
            applyRoomConfig(cfgMap);
          }
          break;

        case 'ROOM_ENDING_SOON':
          final mins = (payload['minutesRemaining'] as num?)?.toInt();
          if (mins != null) {
            announceText = 'Room ends in $mins min';
            announceUntilMs = DateTime.now().millisecondsSinceEpoch + 120000;
            notifyListeners();
          }
          break;

        case 'ROOM_CLOSED':
          final ready = (payload['recapReady'] ?? map['recapReady']) as bool? ?? true;
          unawaited(_handleLocalTermination(closedForRecap: ready));
          break;

        case 'HEARTBEAT':
          _send({
            'type': 'HEARTBEAT_ACK',
            if (_playerState != null) 'offsetMs': _playerState!.livePosition.inMilliseconds,
            'isPlaying': _isPlaying,
          });
          break;

        case 'ERROR':
          final code = map['code'] as String?;
          if (code != null && code.isNotEmpty) {
            lastRoomError = code;
            debugPrint('[TogetherService] WS error code=$code msg=${map['message']}');
            notifyListeners();
          }
          break;

        default:
          if (handlePhase2Event(map)) return;
          break;
      }
    } catch (e) {
      debugPrint('[TogetherService] _onWsMessage error: $e');
    }
  }

  // ────────────────────────── Synchronization Engine ──────────────────────────

  void _startSyncTimers() {
    _syncTimer?.cancel();
    _driftTimer?.cancel();

    _syncTimer = Timer.periodic(const Duration(seconds: 45), (_) => _sendNtpPing());
    _driftTimer = Timer.periodic(const Duration(seconds: 2), (_) => _auditDrift());
  }

  void _sendNtpPing() {
    if (_ws?.readyState == WebSocket.open) {
      final t0 = DateTime.now().millisecondsSinceEpoch;
      _send({'type': 'SYNC_PING', 'clientSentAtMs': t0, 't0': t0});
    }
  }

  void _handleNtpPong(Map<String, dynamic> pong) {
    final t0 = ((pong['clientSentAtMs'] ?? pong['t0']) as num?)?.toInt();
    final t1 = ((pong['serverReceivedAtMs'] ?? pong['serverTimestampMs'] ?? pong['t1']) as num?)?.toInt();
    if (t0 == null || t1 == null) return;
    final t3 = DateTime.now().millisecondsSinceEpoch;

    final rtt = math.max(0, t3 - t0);
    _pingMs = rtt;
    _clockOffsetMs = t1 - (t0 + (rtt ~/ 2));

    notifyListeners();
  }

  int get currentServerTimeMs => DateTime.now().millisecondsSinceEpoch + _clockOffsetMs;

  void _handlePlayAt(Map<String, dynamic> map) {
    final rawTrack = map['track'];
    if (rawTrack is Map) {
      _currentTrack = Track.fromJson(Map<String, dynamic>.from(rawTrack));
    }
    final posMs = (map['positionMs'] as num?)?.toDouble();
    _positionSec = (map['positionSec'] as num?)?.toDouble() ?? (posMs != null ? posMs / 1000.0 : 0.0);
    _startedAtServerMs = ((map['startAtServerMs'] ?? map['startedAtServerMs']) as num?)?.toInt() ??
        currentServerTimeMs;
    _isPlaying = true;
    _skipVotes.clear();
    notifyListeners();

    if (!_leaveSync) {
      _scheduleBarrierPlay();
    }
  }

  void _scheduleBarrierPlay() {
    _barrierTimer?.cancel();
    if (_currentTrack == null || _playerState == null) return;

    final targetLocalStartMs = _startedAtServerMs - _clockOffsetMs;
    final delayMs = targetLocalStartMs - DateTime.now().millisecondsSinceEpoch;

    _send({'type': 'BUFFER_READY', 'trackId': _currentTrack!.id, 'ready': true});

    if (delayMs > 0) {
      _barrierTimer = Timer(Duration(milliseconds: delayMs), () {
        _playerState?.playMedia(
          _currentTrack!,
          startMs: (_positionSec * 1000).toInt(),
          source: 'room',
        );
      });
    } else {
      final elapsedSec = (-delayMs) / 1000.0;
      final targetSec = _positionSec + elapsedSec;
      _playerState?.playMedia(
        _currentTrack!,
        startMs: (targetSec * 1000).toInt(),
        source: 'room',
      );
    }
  }

  void _handlePauseAt(Map<String, dynamic> map) {
    _barrierTimer?.cancel();
    _isPlaying = false;
    final posMs = (map['positionMs'] as num?)?.toDouble();
    _positionSec = (map['positionSec'] as num?)?.toDouble() ??
        (posMs != null ? posMs / 1000.0 : _positionSec);
    _startedAtServerMs = 0;
    notifyListeners();

    if (!_leaveSync) {
      _playerState?.pause();
    }
  }

  void _handleSeekTo(Map<String, dynamic> map) {
    _barrierTimer?.cancel();
    final posMs = (map['positionMs'] as num?)?.toDouble();
    _positionSec = (map['positionSec'] as num?)?.toDouble() ??
        (posMs != null ? posMs / 1000.0 : 0.0);
    _startedAtServerMs = ((map['startAtServerMs'] ?? map['startedAtServerMs']) as num?)?.toInt() ?? 0;
    notifyListeners();

    if (!_leaveSync && _playerState != null) {
      _playerState?.seek(Duration(milliseconds: (_positionSec * 1000).toInt()));
    }
  }

  /// 3-Tier Drift Audit Loop
  void _auditDrift() {
    if (!_isPlaying || _leaveSync || _playerState == null || _startedAtServerMs == 0) return;

    final elapsedMs = currentServerTimeMs - _startedAtServerMs;
    if (elapsedMs < 0) return;

    final expectedSec = _positionSec + (elapsedMs / 1000.0);
    final actualSec = _playerState!.livePosition.inMilliseconds / 1000.0;
    final delta = actualSec - expectedSec;
    final absDelta = delta.abs();

    if (absDelta < 0.15) {
      if (_syncHealth != SyncHealth.connected) {
        _syncHealth = SyncHealth.connected;
        _playerState?.fxEngine.applyFx({'speed': 1.0});
        notifyListeners();
      }
      return;
    }

    if (absDelta <= 0.80) {
      _syncHealth = SyncHealth.syncing;
      final speed = delta > 0 ? 0.98 : 1.02;
      _playerState?.fxEngine.applyFx({'speed': speed});
      notifyListeners();
      return;
    }

    _syncHealth = SyncHealth.outOfSync;
    _playerState?.fxEngine.applyFx({'speed': 1.0});
    _playerState?.seek(Duration(milliseconds: (expectedSec * 1000).toInt()));
    notifyListeners();
  }

  void _syncWithRoomPlayback() {
    if (_currentTrack != null && _isPlaying && !_leaveSync) {
      _scheduleBarrierPlay();
    }
  }

  void _applyPlayerState(Map<String, dynamic> player) {
    final rawTrack = player['track'];
    if (rawTrack is Map) {
      _currentTrack = Track.fromJson(Map<String, dynamic>.from(rawTrack));
    } else {
      _currentTrack = null;
    }
    _isPlaying = player['state'] == 'playing';
    final posMs = (player['positionMs'] as num?)?.toDouble();
    _positionSec = (player['positionSec'] as num?)?.toDouble() ?? (posMs != null ? posMs / 1000.0 : 0.0);
    _startedAtServerMs = ((player['startedAtServerMs'] ?? player['startAtServerMs']) as num?)?.toInt() ?? 0;
  }

  // ────────────────────────── User Actions ──────────────────────────

  void toggleLeaveSync() {
    _leaveSync = !_leaveSync;
    if (!_leaveSync) {
      _syncHealth = SyncHealth.syncing;
      _syncWithRoomPlayback();
    }
    notifyListeners();
  }

  void sendChat(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    _send({'type': 'CHAT_MESSAGE', 'text': trimmed});
  }

  void sendReaction(String emoji) {
    _send({
      'type': 'REACTION',
      'emoji': emoji,
      if (_playerState != null) 'positionMs': _playerState!.livePosition.inMilliseconds,
      if (_currentTrack != null) 'trackId': _currentTrack!.id,
    });
  }

  void voteSkip() {
    if (hasVotedSkip) return;
    _send({'type': 'SKIP_VOTE', 'force': false});
  }

  void addToQueue(Track track) {
    _send({'type': 'QUEUE_ADD', 'track': track.toJson()});
  }

  void removeFromQueue(String itemId) {
    _send({'type': 'QUEUE_REMOVE', 'itemId': itemId, 'baseRevision': queueRevision});
  }

  // Host / Permitted Controls
  void hostPlay(Track track, double posSec) {
    if (!can(RoomPermission.playback)) return;
    _send({'type': 'HOST_PLAY', 'track': track.toJson(), 'positionSec': posSec});
  }

  void hostPause(double posSec) {
    if (!can(RoomPermission.playback)) return;
    _send({'type': 'HOST_PAUSE', 'positionSec': posSec});
  }

  void hostSeek(double posSec) {
    if (!can(RoomPermission.playback)) return;
    _send({'type': 'HOST_SEEK', 'positionSec': posSec});
  }

  void hostSkipNext() {
    if (!can(RoomPermission.playback)) return;
    _send({'type': 'SKIP_VOTE', 'force': true});
  }

  Future<void> _handleLocalTermination({required bool closedForRecap}) async {
    _intentionalClose = true;
    _reconnectTimer?.cancel();
    _barrierTimer?.cancel();
    _syncTimer?.cancel();
    _driftTimer?.cancel();
    await _disconnectWs();
    await _clearSavedSession();

    if (closedForRecap) {
      recapReady = true;
    } else {
      clearPhase2State();
    }
    _inRoom = false;
    _leaveSync = false;
    _syncHealth = SyncHealth.disconnected;
    _ticket = null;
    _lastSeq = 0;
    queueRevision = 0;
    roomConfig = null;
    roomEndsAt = null;
    _members = [];
    _queue = [];
    _chat = [];
    _skipVotes = [];
    _currentTrack = null;
    _isPlaying = false;
    notifyListeners();
  }

  Future<void> leaveRoom() async {
    final code = _roomCode;
    _intentionalClose = true;
    if (code.isNotEmpty) {
      try {
        await apiCall('POST', '/rooms/$code/leave');
      } catch (_) {}
    }
    await _handleLocalTermination(closedForRecap: false);
    _roomCode = '';
  }

  void _send(Map<String, dynamic> data) {
    if (_ws != null && _ws!.readyState == WebSocket.open) {
      _ws!.add(jsonEncode(data));
    }
  }

  void _handleWsDisconnect() {
    _syncHealth = SyncHealth.disconnected;
    notifyListeners();

    if (_inRoom && !_intentionalClose && !_isDisposed && _reconnectAttempts < 6) {
      _reconnectAttempts++;
      final delay = math.min(12, math.pow(2, _reconnectAttempts).toInt());
      _reconnectTimer?.cancel();
      _reconnectTimer = Timer(Duration(seconds: delay), () async {
        if (_inRoom && !_intentionalClose && !_isDisposed) {
          if (_ticket != null && _ticket!.isNotEmpty) {
            await _connectWs(_ticket!);
          } else {
            await joinRoom(_roomCode, guestName: _myUsername);
          }
        }
      });
    }
  }

  Future<void> _disconnectWs() async {
    try {
      await _ws?.close();
    } catch (_) {}
    _ws = null;
  }

  @override
  void dispose() {
    _isDisposed = true;
    _intentionalClose = true;
    _reconnectTimer?.cancel();
    _barrierTimer?.cancel();
    _syncTimer?.cancel();
    _driftTimer?.cancel();
    _disconnectWs();
    super.dispose();
  }
}
