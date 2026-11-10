// lib/services/together_service.dart
//
// Real-Time Collaborative Room Engine for Zenify
// Supports NTP clock synchronization, scheduled start barriers (1.5s),
// 3-tier drift correction, sequence gap detection, fair queueing,
// live chat, skip voting, and aggregated emoji reactions.

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../models/track.dart';
import 'api_service.dart';
import 'player_state.dart';

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
  final String role; // 'host' | 'listener'
  final int joinedAt;
  final int lastPing;
  final bool bufferReady;

  TogetherMember({
    required this.userId,
    required this.username,
    this.avatar,
    required this.role,
    this.joinedAt = 0,
    this.lastPing = 0,
    this.bufferReady = false,
  });

  bool get isHost => role == 'host';

  factory TogetherMember.fromJson(Map<String, dynamic> json) {
    return TogetherMember(
      userId: json['userId'] as String? ?? '',
      username: json['username'] as String? ?? 'Listener',
      avatar: json['avatar'] as String?,
      role: json['role'] as String? ?? 'listener',
      joinedAt: (json['joinedAt'] as num?)?.toInt() ?? 0,
      lastPing: (json['lastPing'] as num?)?.toInt() ?? 0,
      bufferReady: json['bufferReady'] as bool? ?? false,
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
    final t = rawTrack is Map<String, dynamic>
        ? Track.fromJson(rawTrack)
        : Track(
            id: json['trackId'] as String? ?? '',
            title: json['title'] as String? ?? 'Unknown Title',
            artist: json['artist'] as String? ?? 'Unknown Artist',
            album: json['album'] as String? ?? '',
            coverUrl: json['coverUrl'] as String? ?? '',
          );
    return TogetherQueueItem(
      id: json['id'] as String? ?? '',
      trackId: json['trackId'] as String? ?? '',
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
  final int timestamp;

  TogetherChatMessage({
    required this.id,
    required this.userId,
    required this.username,
    this.avatar,
    required this.text,
    required this.timestamp,
  });

  factory TogetherChatMessage.fromJson(Map<String, dynamic> json) {
    return TogetherChatMessage(
      id: json['id'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
      username: json['username'] as String? ?? 'Guest',
      avatar: json['avatar'] as String?,
      text: json['text'] as String? ?? '',
      timestamp: (json['timestamp'] as num?)?.toInt() ?? 0,
    );
  }
}

class TogetherService extends ChangeNotifier {
  static final TogetherService instance = TogetherService._internal();
  TogetherService._internal();

  PlayerState? _playerState;

  void attachPlayer(PlayerState player) {
    _playerState = player;
  }

  // Room State
  bool _inRoom = false;
  String _roomCode = '';
  String _myUserId = '';
  String _myUsername = '';
  String? _myAvatar;
  String _myRole = 'listener';
  String _mode = 'dj'; // 'dj' | 'collab'
  int _lastSeq = 0;

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
  int _reconnectAttempts = 0;
  bool _isDisposed = false;

  // Getters
  bool get inRoom => _inRoom;
  String get roomCode => _roomCode;
  String get myUserId => _myUserId;
  String get myUsername => _myUsername;
  String? get myAvatar => _myAvatar;
  String get myRole => _myRole;
  bool get isHost => _myRole == 'host';
  String get mode => _mode;
  int get memberCount => _members.length;

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

  // ────────────────────────── REST API ──────────────────────────

  /// Create a new collaborative session
  Future<bool> createRoom({
    String mode = 'dj',
    String? guestName,
    bool guestCanQueue = true,
    bool guestCanChat = true,
  }) async {
    try {
      final uri = Uri.parse('${ApiService.baseUrl}/api/together/rooms');
      final resp = await http.post(
        uri,
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: jsonEncode({
          'mode': mode,
          'guestName': guestName ?? 'Host DJ',
          'guestCanQueue': guestCanQueue,
          'guestCanChat': guestCanChat,
        }),
      );

      if (resp.statusCode == 201 || resp.statusCode == 200) {
        final data = jsonDecode(resp.body) as Map<String, dynamic>;
        final code = data['roomCode'] as String? ?? '';
        final ticket = data['ticket'] as String? ?? '';
        final roomData = data['room'] as Map<String, dynamic>? ?? {};

        _initFromRoomJson(roomData, code);
        _myRole = 'host';
        await _connectWs(ticket);
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('[TogetherService] createRoom error: $e');
      return false;
    }
  }

  /// Join an existing collaborative session via 6-char room code
  Future<bool> joinRoom(String code, {String? guestName}) async {
    try {
      final cleanCode = code.trim().toUpperCase();
      final uri = Uri.parse('${ApiService.baseUrl}/api/together/rooms/$cleanCode/join');
      final resp = await http.post(
        uri,
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: jsonEncode({
          'guestName': guestName ?? 'Listener ${math.Random().nextInt(900) + 100}',
        }),
      );

      if (resp.statusCode == 200) {
        final data = jsonDecode(resp.body) as Map<String, dynamic>;
        final ticket = data['ticket'] as String? ?? '';
        final roomData = data['room'] as Map<String, dynamic>? ?? {};

        _initFromRoomJson(roomData, cleanCode);
        await _connectWs(ticket);
        return true;
      }
      return false;
    } catch (e) {
      debugPrint('[TogetherService] joinRoom error: $e');
      return false;
    }
  }

  void _initFromRoomJson(Map<String, dynamic> json, String code) {
    _roomCode = code;
    _inRoom = true;
    _mode = json['mode'] as String? ?? 'dj';
    _lastSeq = (json['seq'] as num?)?.toInt() ?? 1;

    // Members
    final rawMembers = json['members'] as List<dynamic>? ?? [];
    _members = rawMembers
        .whereType<Map<String, dynamic>>()
        .map(TogetherMember.fromJson)
        .toList();

    // Queue
    final rawQueue = json['queue'] as List<dynamic>? ?? [];
    _queue = rawQueue
        .whereType<Map<String, dynamic>>()
        .map(TogetherQueueItem.fromJson)
        .toList();

    // Chat
    final rawChat = json['chat'] as List<dynamic>? ?? [];
    _chat = rawChat
        .whereType<Map<String, dynamic>>()
        .map(TogetherChatMessage.fromJson)
        .toList();

    // Skip votes & reactions
    final rawVotes = json['skipVotes'] as List<dynamic>? ?? [];
    _skipVotes = rawVotes.map((e) => e.toString()).toList();

    final rawReactions = json['reactions'] as Map<String, dynamic>? ?? {};
    _reactions = {
      '❤️': (rawReactions['❤️'] as num?)?.toInt() ?? 0,
      '🔥': (rawReactions['🔥'] as num?)?.toInt() ?? 0,
      '👏': (rawReactions['👏'] as num?)?.toInt() ?? 0,
      '😭': (rawReactions['😭'] as num?)?.toInt() ?? 0,
    };

    // Player
    final playerObj = json['player'] as Map<String, dynamic>?;
    if (playerObj != null) {
      _applyPlayerState(playerObj);
    }

    notifyListeners();
  }

  // ────────────────────────── WebSocket ──────────────────────────

  Future<void> _connectWs(String ticket) async {
    await _disconnectWs();

    final baseUri = Uri.parse(ApiService.baseUrl);
    final wsScheme = baseUri.scheme == 'https' ? 'wss' : 'ws';
    final portStr = baseUri.hasPort ? ':${baseUri.port}' : '';
    final wsUrl = '$wsScheme://${baseUri.host}$portStr/ws/together?ticket=$ticket';

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

      // Start periodic NTP ping/pong sync and drift monitor
      _startSyncTimers();
      _sendNtpPing();
    } catch (e) {
      debugPrint('[TogetherService] WS connect error: $e');
      _handleWsDisconnect();
    }
  }

  void _onWsMessage(dynamic raw) {
    try {
      final map = jsonDecode(raw.toString()) as Map<String, dynamic>;
      final type = map['type'] as String? ?? '';

      // Sequence gap detection: check if event missed
      final seq = (map['seq'] as num?)?.toInt();
      if (seq != null && seq > _lastSeq + 1) {
        debugPrint('[TogetherService] Sequence gap detected (expected ${_lastSeq + 1}, got $seq). Requesting resync...');
        _send({'type': 'REQUEST_RESYNC'});
      }
      if (seq != null) _lastSeq = seq;

      switch (type) {
        case 'INIT_STATE':
          final room = map['room'] as Map<String, dynamic>? ?? {};
          final self = map['self'] as Map<String, dynamic>? ?? {};
          _myUserId = self['userId'] as String? ?? _myUserId;
          _myUsername = self['username'] as String? ?? _myUsername;
          _myAvatar = self['avatar'] as String? ?? _myAvatar;
          _myRole = self['role'] as String? ?? _myRole;
          _initFromRoomJson(room, _roomCode);
          _syncWithRoomPlayback();
          break;

        case 'SYNC_PONG':
          _handleNtpPong(map);
          break;

        case 'PLAY_AT':
          _handlePlayAt(map);
          break;

        case 'PAUSE_AT':
          _handlePauseAt(map);
          break;

        case 'SEEK_TO':
          _handleSeekTo(map);
          break;

        case 'QUEUE_UPDATED':
          final rawQueue = map['queue'] as List<dynamic>? ?? [];
          _queue = rawQueue
              .whereType<Map<String, dynamic>>()
              .map(TogetherQueueItem.fromJson)
              .toList();
          notifyListeners();
          break;

        case 'SKIP_VOTES_UPDATED':
          final rawVoters = map['voters'] as List<dynamic>? ?? [];
          _skipVotes = rawVoters.map((e) => e.toString()).toList();
          notifyListeners();
          break;

        case 'REACTION':
          final rawReactions = map['reactions'] as Map<String, dynamic>?;
          if (rawReactions != null) {
            _reactions = {
              '❤️': (rawReactions['❤️'] as num?)?.toInt() ?? 0,
              '🔥': (rawReactions['🔥'] as num?)?.toInt() ?? 0,
              '👏': (rawReactions['👏'] as num?)?.toInt() ?? 0,
              '😭': (rawReactions['😭'] as num?)?.toInt() ?? 0,
            };
          }
          notifyListeners();
          break;

        case 'CHAT_MESSAGE':
          final chatItem = map['chatItem'] as Map<String, dynamic>?;
          if (chatItem != null) {
            _chat.add(TogetherChatMessage.fromJson(chatItem));
            if (_chat.length > 50) _chat = _chat.sublist(_chat.length - 50);
            notifyListeners();
          }
          break;

        case 'MEMBER_JOINED':
          final rawMembers = map['members'] as List<dynamic>?;
          if (rawMembers != null) {
            _members = rawMembers
                .whereType<Map<String, dynamic>>()
                .map(TogetherMember.fromJson)
                .toList();
            notifyListeners();
          }
          break;

        case 'MEMBER_LEFT':
          final newHostId = map['newHostId'] as String?;
          final rawMembers = map['members'] as List<dynamic>?;
          if (rawMembers != null) {
            _members = rawMembers
                .whereType<Map<String, dynamic>>()
                .map(TogetherMember.fromJson)
                .toList();
          }
          if (newHostId != null && newHostId == _myUserId) {
            _myRole = 'host';
          }
          notifyListeners();
          break;

        case 'HEARTBEAT':
          _send({'type': 'HEARTBEAT_ACK'});
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

    // NTP ping/pong sync every 45s
    _syncTimer = Timer.periodic(const Duration(seconds: 45), (_) => _sendNtpPing());

    // 3-Tier Drift Audit loop every 2s
    _driftTimer = Timer.periodic(const Duration(seconds: 2), (_) => _auditDrift());
  }

  void _sendNtpPing() {
    if (_ws?.readyState == WebSocket.open) {
      final t0 = DateTime.now().millisecondsSinceEpoch;
      _send({'type': 'SYNC_PING', 't0': t0});
    }
  }

  void _handleNtpPong(Map<String, dynamic> pong) {
    final t0 = (pong['t0'] as num).toInt();
    final t1 = (pong['t1'] as num).toInt();
    final t3 = DateTime.now().millisecondsSinceEpoch;

    final rtt = t3 - t0;
    _pingMs = rtt;
    // Clock offset = serverTime - (localSendTime + rtt / 2)
    _clockOffsetMs = t1 - (t0 + (rtt ~/ 2));

    notifyListeners();
  }

  int get currentServerTimeMs => DateTime.now().millisecondsSinceEpoch + _clockOffsetMs;

  void _handlePlayAt(Map<String, dynamic> map) {
    final rawTrack = map['track'];
    if (rawTrack is Map<String, dynamic>) {
      _currentTrack = Track.fromJson(rawTrack);
    }
    _positionSec = (map['positionSec'] as num?)?.toDouble() ?? 0.0;
    _startedAtServerMs = (map['startAtServerMs'] as num?)?.toInt() ?? currentServerTimeMs;
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

    // Send BUFFER_READY to room
    _send({'type': 'BUFFER_READY', 'trackId': _currentTrack!.id});

    if (delayMs > 0) {
      // Barrier window: prepare track now, trigger play at target timestamp
      _barrierTimer = Timer(Duration(milliseconds: delayMs), () {
        _playerState?.playMedia(
          _currentTrack!,
          startMs: (_positionSec * 1000).toInt(),
          source: 'room',
        );
      });
    } else {
      // Barrier passed (e.g. joined late): start immediately at extrapolated offset
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
    _positionSec = (map['positionSec'] as num?)?.toDouble() ?? _positionSec;
    _startedAtServerMs = 0;
    notifyListeners();

    if (!_leaveSync) {
      _playerState?.pause();
    }
  }

  void _handleSeekTo(Map<String, dynamic> map) {
    _barrierTimer?.cancel();
    _positionSec = (map['positionSec'] as num?)?.toDouble() ?? 0.0;
    _startedAtServerMs = (map['startAtServerMs'] as num?)?.toInt() ?? 0;
    notifyListeners();

    if (!_leaveSync && _playerState != null) {
      _playerState?.seek(Duration(milliseconds: (_positionSec * 1000).toInt()));
    }
  }

  /// 3-Tier Drift Audit Loop
  void _auditDrift() {
    if (!_isPlaying || _leaveSync || _playerState == null || _startedAtServerMs == 0) return;

    final elapsedMs = currentServerTimeMs - _startedAtServerMs;
    if (elapsedMs < 0) return; // Still waiting for barrier

    final expectedSec = _positionSec + (elapsedMs / 1000.0);
    final actualSec = _playerState!.livePosition.inMilliseconds / 1000.0;
    final delta = actualSec - expectedSec;
    final absDelta = delta.abs();

    // Tier 1: Delta < 150ms -> Perfectly in sync, ignore
    if (absDelta < 0.15) {
      if (_syncHealth != SyncHealth.connected) {
        _syncHealth = SyncHealth.connected;
        _playerState?.fxEngine.applyFx({'speed': 1.0});
        notifyListeners();
      }
      return;
    }

    // Tier 2: 150ms <= Delta <= 800ms -> Seamless speed nudge (1.02x / 0.98x)
    if (absDelta <= 0.80) {
      _syncHealth = SyncHealth.syncing;
      final speed = delta > 0 ? 0.98 : 1.02; // Ahead: slow down; Behind: speed up
      _playerState?.fxEngine.applyFx({'speed': speed});
      notifyListeners();
      return;
    }

    // Tier 3: Delta > 800ms -> Single clean micro-seek to catch up
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
    if (rawTrack is Map<String, dynamic>) {
      _currentTrack = Track.fromJson(rawTrack);
    }
    _isPlaying = player['state'] == 'playing';
    _positionSec = (player['positionSec'] as num?)?.toDouble() ?? 0.0;
    _startedAtServerMs = (player['startedAtServerMs'] as num?)?.toInt() ?? 0;
  }

  // ────────────────────────── User Actions ──────────────────────────

  void toggleLeaveSync() {
    _leaveSync = !_leaveSync;
    if (!_leaveSync) {
      // Rejoining live: immediately snap to current room position
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
    _send({'type': 'REACTION', 'emoji': emoji});
  }

  void voteSkip() {
    if (hasVotedSkip) return;
    _send({'type': 'SKIP_VOTE'});
  }

  void addToQueue(Track track) {
    _send({'type': 'QUEUE_ADD', 'track': track.toJson()});
  }

  void removeFromQueue(String itemId) {
    _send({'type': 'QUEUE_REMOVE', 'itemId': itemId});
  }

  void reorderQueue(int oldIndex, int newIndex) {
    _send({'type': 'QUEUE_REORDER', 'startIndex': oldIndex, 'endIndex': newIndex});
  }

  // Host Controls
  void hostPlay(Track track, double posSec) {
    if (!isHost && _mode != 'collab') return;
    _send({'type': 'HOST_PLAY', 'track': track.toJson(), 'positionSec': posSec});
  }

  void hostPause(double posSec) {
    if (!isHost && _mode != 'collab') return;
    _send({'type': 'HOST_PAUSE', 'positionSec': posSec});
  }

  void hostSeek(double posSec) {
    if (!isHost && _mode != 'collab') return;
    _send({'type': 'HOST_SEEK', 'positionSec': posSec});
  }

  void hostSkipNext() {
    if (!isHost && _mode != 'collab') return;
    if (_queue.isNotEmpty) {
      final next = _queue.first;
      removeFromQueue(next.id);
      hostPlay(next.track, 0.0);
    }
  }

  Future<void> leaveRoom() async {
    _inRoom = false;
    _leaveSync = false;
    _syncHealth = SyncHealth.disconnected;
    _barrierTimer?.cancel();
    _syncTimer?.cancel();
    _driftTimer?.cancel();
    await _disconnectWs();
    notifyListeners();
  }

  void _send(Map<String, dynamic> data) {
    if (_ws != null && _ws!.readyState == WebSocket.open) {
      _ws!.add(jsonEncode(data));
    }
  }

  void _handleWsDisconnect() {
    _syncHealth = SyncHealth.disconnected;
    notifyListeners();

    if (_inRoom && !_isDisposed && _reconnectAttempts < 5) {
      _reconnectAttempts++;
      final delay = math.min(10, math.pow(2, _reconnectAttempts).toInt());
      Timer(Duration(seconds: delay), () {
        if (_inRoom && !_isDisposed) {
          // Re-fetch snapshot and reconnect
          joinRoom(_roomCode, guestName: _myUsername);
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
    _barrierTimer?.cancel();
    _syncTimer?.cancel();
    _driftTimer?.cancel();
    _disconnectWs();
    super.dispose();
  }
}

