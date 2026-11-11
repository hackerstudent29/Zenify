import 'package:flutter/foundation.dart';

import '../models/room_models.dart';
import '../models/room_phase2_models.dart';
import 'together_room_admin.dart';

/// Phase 2 features. Add to TogetherService:
///   class TogetherService extends ChangeNotifier with TogetherRoomAdmin, TogetherPhase2 { ... }
/// and in the WS handler's default branch: `if (handlePhase2Event(envelopeMap)) return;`
/// Contract: BACKEND_AGENT_SPEC.md §16+.
mixin TogetherPhase2 on ChangeNotifier, TogetherRoomAdmin {
  // ── state fed by WS ──
  final List<ActivityEvent> activity = []; // newest last
  final Set<String> _seenEventIds = {};
  List<SongRequest> requests = [];
  List<JoinRequest> joinRequests = [];
  RoomTheme roomTheme = const RoomTheme();
  DjSettings djSettings = DjSettings();
  String? announceText;
  int? announceUntilMs;
  AchievementItem? lastUnlocked; // UI shows overlay then clears
  bool recapReady = false;
  bool crossfadeSupported = false; // app sets true ONLY if audio engine can overlap sources

  int get pendingRequestCount => requests.where((r) => r.status == RequestStatus.pending).length;

  void clearPhase2State() {
    activity.clear();
    _seenEventIds.clear();
    requests = [];
    joinRequests = [];
    roomTheme = const RoomTheme();
    djSettings = DjSettings();
    announceText = null;
    announceUntilMs = null;
    lastUnlocked = null;
    recapReady = false;
  }

  /// Returns true if handled. Envelope per BACKEND §7.
  bool handlePhase2Event(Map<String, dynamic> e) {
    final type = e['type'] as String?;
    final payload = Map<String, dynamic>.from((e['payload'] as Map?) ?? const {});
    switch (type) {
      case 'ACTIVITY_CREATED':
        final ev = ActivityEvent.fromJson({...e, 'payload': payload['event'] ?? payload});
        if (_seenEventIds.add(ev.id)) {
          activity.add(ev);
          if (activity.length > 300) activity.removeAt(0);
          notifyListeners();
        }
        return true;
      case 'SONG_REQUESTED':
      case 'SONG_REQUEST_REVIEWED':
      case 'SONG_REQUEST_UPDATED':
        final rawReq = payload['request'] is Map
            ? Map<String, dynamic>.from(payload['request'] as Map)
            : payload;
        final r = SongRequest.fromJson(rawReq);
        final i = requests.indexWhere((x) => x.id == r.id);
        i >= 0 ? requests[i] = r : requests.insert(0, r);
        notifyListeners();
        return true;
      case 'JOIN_REQUESTED':
      case 'JOIN_REQUEST_CREATED':
        final rawJoin = payload['request'] is Map
            ? Map<String, dynamic>.from(payload['request'] as Map)
            : payload;
        final jr = JoinRequest.fromJson(rawJoin);
        if (!joinRequests.any((x) => x.id == jr.id)) {
          joinRequests = [...joinRequests, jr];
          notifyListeners();
        }
        return true;
      case 'JOIN_REQUEST_RESOLVED':
        final resolvedId = (payload['id'] ?? payload['requestId'] ?? (payload['request'] as Map?)?['id'])?.toString();
        if (resolvedId != null) {
          joinRequests = joinRequests.where((x) => x.id != resolvedId).toList();
          notifyListeners();
        }
        return true;
      case 'ROOM_THEME_UPDATED':
      case 'THEME_CHANGED':
        final rawTheme = payload['theme'] is Map ? Map<String, dynamic>.from(payload['theme'] as Map) : payload;
        roomTheme = RoomTheme.fromJson(rawTheme);
        notifyListeners();
        return true;
      case 'DJ_SETTINGS_UPDATED':
      case 'DJ_SETTINGS_CHANGED':
        final rawDj = payload['djSettings'] is Map
            ? Map<String, dynamic>.from(payload['djSettings'] as Map)
            : (payload['settings'] is Map ? Map<String, dynamic>.from(payload['settings'] as Map) : payload);
        djSettings = DjSettings.fromJson(rawDj);
        notifyListeners();
        return true;
      case 'ANNOUNCEMENT_POSTED':
        announceText = payload['text'] as String?;
        announceUntilMs = (payload['untilMs'] as num?)?.toInt();
        notifyListeners();
        return true;
      case 'ACHIEVEMENT_UNLOCKED':
        if (payload['userId'] == myUserId && payload['achievement'] is Map) {
          lastUnlocked = AchievementItem.fromJson(Map<String, dynamic>.from(payload['achievement'] as Map));
          notifyListeners();
        }
        return true;
      case 'ROOM_RECAP_READY':
        recapReady = true;
        notifyListeners();
        return true;
      default:
        return false;
    }
  }

  void applyRoomSnapshotPhase2(Map<String, dynamic> room) {
    roomTheme = RoomTheme.fromJson(room['theme'] as Map<String, dynamic>?);
    final rawDj = room['djSettings'] as Map<String, dynamic>?;
    djSettings = DjSettings.fromJson(rawDj);
    announceText = rawDj?['announceText'] as String?;
    announceUntilMs = (rawDj?['announceUntilMs'] as num?)?.toInt();
    notifyListeners();
  }

  void ackUnlocked() {
    lastUnlocked = null;
  }

  // ── Lyrics (server resolves via licensed provider; never scraped) ──
  Future<Map<String, dynamic>?> fetchLyrics({required String title, required String artist, required int durationSec}) =>
      apiCall('GET', '/lyrics?title=${Uri.encodeQueryComponent(title)}&artist=${Uri.encodeQueryComponent(artist)}&durationSec=$durationSec');

  // ── Playback seek (permission PLAYBACK enforced by server) ──
  Future<bool> seekRoom(int positionMs) async => await apiCall('POST', '/rooms/$roomCode/playback/seek', {'positionMs': positionMs}) != null;

  // ── Activity ──
  Future<List<ActivityEvent>> fetchActivity({int? beforeSeq, int limit = 40}) async {
    final r = await apiCall('GET', '/rooms/$roomCode/activity?limit=$limit${beforeSeq == null ? '' : '&beforeSeq=$beforeSeq'}');
    final list = (r?['events'] as List?) ?? const [];
    return list.map((e) => ActivityEvent.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  // ── Bookmarks ──
  Future<RoomBookmark?> createBookmark({required int positionMs, String? comment}) async {
    final r = await apiCall('POST', '/rooms/$roomCode/bookmarks', {'positionMs': positionMs, 'comment': comment});
    return r == null ? null : RoomBookmark.fromJson(Map<String, dynamic>.from(r['bookmark'] as Map));
  }

  Future<List<RoomBookmark>> fetchBookmarks() async {
    final r = await apiCall('GET', '/rooms/$roomCode/bookmarks');
    return ((r?['bookmarks'] as List?) ?? const []).map((e) => RoomBookmark.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  // ── Reaction timeline ──
  Future<List<TrackReactionStats>> fetchReactionTimeline() async {
    final r = await apiCall('GET', '/rooms/$roomCode/reactions/timeline');
    return ((r?['tracks'] as List?) ?? const []).map((t) {
      final m = Map<String, dynamic>.from(t as Map);
      return TrackReactionStats(
        trackTitle: m['trackTitle'] as String,
        total: (m['total'] as num).toInt(),
        moments: ((m['moments'] as List?) ?? const []).map((x) => ReactionMoment((x['positionMs'] as num).toInt(), (x['emojis'] as List).cast<String>())).toList(),
      );
    }).toList();
  }

  // ── Song requests ──
  Future<bool> loadRequests() async {
    final r = await apiCall('GET', '/rooms/$roomCode/requests');
    if (r == null) return false;
    requests = ((r['requests'] as List?) ?? const []).map((e) => SongRequest.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    notifyListeners();
    return true;
  }

  Future<bool> reviewRequest(String id, {required bool approve}) async => await apiCall('POST', '/rooms/$roomCode/requests/$id/${approve ? 'approve' : 'reject'}') != null;
  Future<bool> cancelRequest(String id) async => await apiCall('POST', '/rooms/$roomCode/requests/$id/cancel') != null;

  // ── Theme / DJ settings / privacy ──
  Future<bool> updateTheme(RoomTheme t) async => await apiCall('PATCH', '/rooms/$roomCode/theme', t.toJson()) != null;
  Future<bool> updateDjSettings(DjSettings s) async => await apiCall('PATCH', '/rooms/$roomCode/dj-settings', s.toJson()) != null;
  Future<bool> announce(String text) async => await apiCall('POST', '/rooms/$roomCode/announcements', {'text': text}) != null;
  Future<bool> setActivityVisibility(bool visible) async => await apiCall('PATCH', '/rooms/$roomCode/me/preferences', {'shareListeningActivity': visible}) != null;

  // ── Recommendations ──
  Future<RoomRecommendations?> fetchRecommendations() async {
    final r = await apiCall('GET', '/rooms/$roomCode/recommendations');
    return r == null ? null : RoomRecommendations.fromJson(r);
  }

  Future<bool> addRecommendation(String recId) async => await apiCall('POST', '/rooms/$roomCode/recommendations/$recId/add') != null;
  Future<bool> recommendationFeedback(String recId, String kind /* LIKE|DISLIKE|SKIP */) async => await apiCall('POST', '/rooms/$roomCode/recommendations/$recId/feedback', {'kind': kind}) != null;

  // ── Stats / recap / achievements ──
  Future<RoomStats?> fetchRoomStats() async {
    final r = await apiCall('GET', '/rooms/$roomCode/stats');
    return r == null ? null : RoomStats.fromJson(r);
  }

  Future<RoomRecap?> fetchRecap(String roomCodeOrId) async {
    final r = await apiCall('GET', '/recaps/$roomCodeOrId');
    return r == null ? null : RoomRecap.fromJson(r);
  }

  Future<List<AchievementItem>> fetchAchievements() async {
    final r = await apiCall('GET', '/achievements');
    return ((r?['achievements'] as List?) ?? const []).map((e) => AchievementItem.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  // ── Invitations / waiting room ──
  Future<RoomInvite?> createInvite({required Duration expiresIn, int? maxUses}) async {
    final r = await apiCall('POST', '/rooms/$roomCode/invites', {'expiresInSeconds': expiresIn.inSeconds, 'maxUses': maxUses});
    return r == null ? null : RoomInvite.fromJson(Map<String, dynamic>.from(r['invite'] as Map));
  }

  Future<List<RoomInvite>> fetchInvites() async {
    final r = await apiCall('GET', '/rooms/$roomCode/invites');
    return ((r?['invites'] as List?) ?? const []).map((e) => RoomInvite.fromJson(Map<String, dynamic>.from(e as Map))).toList();
  }

  Future<bool> revokeInvite(String id) async => await apiCall('DELETE', '/rooms/$roomCode/invites/$id') != null;
  Future<bool> resolveJoinRequest(String id, {required bool approve}) async => await apiCall('POST', '/rooms/$roomCode/join-requests/$id/${approve ? 'approve' : 'reject'}') != null;
  Future<bool> joinWithInvite(String token, {String? guestName}) async => await apiCall('POST', '/invites/join', {'token': token, 'guestName': guestName}) != null;

  // ── Chat extras (reply / edit / delete) ──
  Future<bool> sendChatReply(String text, String replyToId) async => await apiCall('POST', '/rooms/$roomCode/chat', {'text': text, 'replyToId': replyToId}) != null;
  Future<bool> editChat(String id, String text) async => await apiCall('PATCH', '/rooms/$roomCode/chat/$id', {'text': text}) != null;
  Future<bool> deleteChat(String id) async => await apiCall('DELETE', '/rooms/$roomCode/chat/$id') != null;

  bool get isStaff => myRole.isStaff;
  bool get canReviewRequests => can(RoomPermission.queueManage) || isHost;
}
