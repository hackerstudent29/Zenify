import 'package:flutter/material.dart';

import 'room_models.dart';

// ═════════════════ Lyrics ═════════════════

class LyricWord {
  const LyricWord(this.startMs, this.text);
  final int startMs;
  final String text;
}

class LyricLine {
  const LyricLine({required this.startMs, this.endMs, required this.text, this.translation, this.romanization, this.words = const []});
  final int startMs;
  final int? endMs;
  final String text;
  final String? translation;
  final String? romanization;
  final List<LyricWord> words;
}

class LyricsData {
  const LyricsData({required this.lines, this.provider, this.hasTranslation = false, this.hasRomanization = false});
  final List<LyricLine> lines;
  final String? provider;
  final bool hasTranslation;
  final bool hasRomanization;
  bool get isEmpty => lines.isEmpty;
}

// ═════════════════ Activity ═════════════════

class ActivityEvent {
  ActivityEvent({required this.id, required this.seq, required this.type, required this.actorId, required this.actorName, required this.atMs, this.payload = const {}, this.count = 1});
  final String id;
  final int seq;
  final String type;
  final String? actorId;
  final String? actorName;
  final int atMs;
  final Map<String, dynamic> payload;
  final int count; // grouped repeats

  factory ActivityEvent.fromJson(Map<String, dynamic> j) => ActivityEvent(
        id: j['eventId'] as String,
        seq: (j['seq'] as num?)?.toInt() ?? 0,
        type: j['type'] as String,
        actorId: j['actorId'] as String?,
        actorName: (j['payload'] as Map?)?['actorName'] as String?,
        atMs: (j['serverTimestampMs'] as num).toInt(),
        payload: Map<String, dynamic>.from((j['payload'] as Map?) ?? const {}),
      );

  ActivityEvent withCount(int c) => ActivityEvent(id: id, seq: seq, type: type, actorId: actorId, actorName: actorName, atMs: atMs, payload: payload, count: c);
}

// ═════════════════ Bookmarks ═════════════════

class RoomBookmark {
  RoomBookmark({required this.id, required this.trackId, required this.trackTitle, required this.artist, required this.userId, required this.userName, required this.positionMs, this.comment, required this.createdMs});
  final String id, trackId, trackTitle, artist, userId, userName;
  final int positionMs;
  final String? comment;
  final int createdMs;
  factory RoomBookmark.fromJson(Map<String, dynamic> j) => RoomBookmark(
        id: j['id'] as String,
        trackId: j['trackId'] as String,
        trackTitle: (j['trackTitle'] as String?) ?? '',
        artist: (j['artist'] as String?) ?? '',
        userId: j['userId'] as String,
        userName: (j['userName'] as String?) ?? '',
        positionMs: (j['positionMs'] as num).toInt(),
        comment: j['comment'] as String?,
        createdMs: (j['createdAtMs'] as num).toInt(),
      );
}

// ═════════════════ Song requests ═════════════════

enum RequestStatus {
  pending('PENDING'),
  approved('APPROVED'),
  rejected('REJECTED'),
  cancelled('CANCELLED'),
  expired('EXPIRED');

  const RequestStatus(this.wire);
  final String wire;
  static RequestStatus parse(String? s) => RequestStatus.values.firstWhere((e) => e.wire == s, orElse: () => RequestStatus.pending);
}

enum RequestMode {
  anyone('ANYONE', 'Anyone can add'),
  approval('APPROVAL', 'Host approval'),
  auto('AUTO', 'Auto-add'),
  limited('LIMITED', 'Limited per member');

  const RequestMode(this.wire, this.label);
  final String wire;
  final String label;
  static RequestMode parse(String? s) => RequestMode.values.firstWhere((e) => e.wire == s, orElse: () => RequestMode.anyone);
}

class SongRequest {
  SongRequest({required this.id, required this.userId, required this.userName, required this.title, required this.artist, this.coverUrl, required this.status, required this.requestedMs, this.reviewedBy, this.reviewedMs});
  final String id, userId, userName, title, artist;
  final String? coverUrl, reviewedBy;
  final RequestStatus status;
  final int requestedMs;
  final int? reviewedMs;
  factory SongRequest.fromJson(Map<String, dynamic> j) => SongRequest(
        id: j['id'] as String,
        userId: j['userId'] as String,
        userName: (j['userName'] as String?) ?? '',
        title: (j['title'] as String?) ?? '',
        artist: (j['artist'] as String?) ?? '',
        coverUrl: j['coverUrl'] as String?,
        status: RequestStatus.parse(j['status'] as String?),
        requestedMs: (j['requestedAtMs'] as num).toInt(),
        reviewedBy: j['reviewedBy'] as String?,
        reviewedMs: (j['reviewedAtMs'] as num?)?.toInt(),
      );
}

// ═════════════════ Reactions timeline ═════════════════

class ReactionMoment {
  ReactionMoment(this.positionMs, this.emojis);
  final int positionMs;
  final List<String> emojis;
}

class TrackReactionStats {
  TrackReactionStats({required this.trackTitle, required this.total, required this.moments});
  final String trackTitle;
  final int total;
  final List<ReactionMoment> moments;
}

// ═════════════════ Themes ═════════════════

class RoomThemePreset {
  const RoomThemePreset(this.id, this.name, this.colors, this.accent);
  final String id;
  final String name;
  final List<Color> colors; // top, mid
  final Color accent;

  static const midnight = RoomThemePreset('midnight', 'Midnight', [Color(0xFF1E1E22), Color(0xFF0C0C0E)], Color(0xFFFA586A));
  static const ocean = RoomThemePreset('ocean', 'Ocean', [Color(0xFF0B5563), Color(0xFF0A2A4A)], Color(0xFF64D2FF));
  static const aurora = RoomThemePreset('aurora', 'Aurora', [Color(0xFF4A2A8A), Color(0xFF0E5A66)], Color(0xFFBF5AF2));
  static const sunset = RoomThemePreset('sunset', 'Sunset', [Color(0xFF7A1F3A), Color(0xFF8A3A12)], Color(0xFFFF9F0A));
  static const minimal = RoomThemePreset('minimal', 'Minimal', [Color(0xFF1A1A1A), Color(0xFF000000)], Color(0xFFFFFFFF));
  static const all = [midnight, ocean, aurora, sunset, minimal];
  static RoomThemePreset byId(String? id) => all.firstWhere((t) => t.id == id, orElse: () => midnight);
}

class RoomTheme {
  const RoomTheme({this.presetId = 'midnight', this.useArtwork = true, this.accentHex, this.animateBackground = true});
  final String presetId;
  final bool useArtwork;
  final String? accentHex; // '#RRGGBB'
  final bool animateBackground;

  RoomThemePreset get preset => RoomThemePreset.byId(presetId);
  Color get accent {
    final h = accentHex;
    if (h != null && RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(h)) return Color(int.parse('FF${h.substring(1)}', radix: 16));
    return preset.accent;
  }

  RoomTheme copyWith({String? presetId, bool? useArtwork, String? accentHex, bool clearAccent = false, bool? animateBackground}) => RoomTheme(
        presetId: presetId ?? this.presetId,
        useArtwork: useArtwork ?? this.useArtwork,
        accentHex: clearAccent ? null : (accentHex ?? this.accentHex),
        animateBackground: animateBackground ?? this.animateBackground,
      );

  Map<String, dynamic> toJson() => {'presetId': presetId, 'useArtwork': useArtwork, 'accentHex': accentHex, 'animateBackground': animateBackground};
  factory RoomTheme.fromJson(Map<String, dynamic>? j) => j == null
      ? const RoomTheme()
      : RoomTheme(presetId: (j['presetId'] as String?) ?? 'midnight', useArtwork: (j['useArtwork'] as bool?) ?? true, accentHex: j['accentHex'] as String?, animateBackground: (j['animateBackground'] as bool?) ?? true);
}

// ═════════════════ Recommendations ═════════════════

class RecItem {
  RecItem({required this.id, required this.title, required this.artist, this.coverUrl, this.reason});
  final String id; // server recommendation id; server resolves playable track
  final String title, artist;
  final String? coverUrl, reason;
  factory RecItem.fromJson(Map<String, dynamic> j) => RecItem(id: j['id'] as String, title: (j['title'] as String?) ?? '', artist: (j['artist'] as String?) ?? '', coverUrl: j['coverUrl'] as String?, reason: j['reason'] as String?);
}

class RecSection {
  RecSection(this.key, this.title, this.items);
  final String key, title;
  final List<RecItem> items;
}

class RoomRecommendations {
  RoomRecommendations({required this.sections, required this.taste});
  final List<RecSection> sections;
  final List<(String, double)> taste; // genre, percent 0-100
  factory RoomRecommendations.fromJson(Map<String, dynamic> j) => RoomRecommendations(
        sections: ((j['sections'] as List?) ?? const []).map((s) => RecSection(s['key'] as String, s['title'] as String, ((s['items'] as List?) ?? const []).map((e) => RecItem.fromJson(e as Map<String, dynamic>)).toList())).toList(),
        taste: ((j['taste'] as List?) ?? const []).map((e) => (e['genre'] as String, (e['percent'] as num).toDouble())).toList(),
      );
}

// ═════════════════ Achievements ═════════════════

class AchievementItem {
  AchievementItem({required this.id, required this.title, required this.description, required this.progress, required this.target, this.unlockedMs});
  final String id, title, description;
  final double progress, target;
  final int? unlockedMs;
  bool get unlocked => unlockedMs != null;
  double get fraction => target <= 0 ? 0 : (progress / target).clamp(0.0, 1.0);
  factory AchievementItem.fromJson(Map<String, dynamic> j) => AchievementItem(
        id: j['id'] as String,
        title: j['title'] as String,
        description: (j['description'] as String?) ?? '',
        progress: (j['progress'] as num?)?.toDouble() ?? 0,
        target: (j['target'] as num?)?.toDouble() ?? 1,
        unlockedMs: (j['unlockedAtMs'] as num?)?.toInt(),
      );
}

// ═════════════════ Recap & stats ═════════════════

class RoomRecap {
  RoomRecap({required this.roomName, required this.durationMinutes, required this.songs, required this.participants, required this.reactions, this.topTrack, this.topArtist, this.mostReactedTrack, this.topDj, this.mostActive, this.mostRequestedArtist, this.coverUrl, this.highlights = const []});
  final String roomName;
  final double durationMinutes;
  final int songs, participants, reactions;
  final String? topTrack, topArtist, mostReactedTrack, topDj, mostActive, mostRequestedArtist, coverUrl;
  final List<String> highlights;
  factory RoomRecap.fromJson(Map<String, dynamic> j) => RoomRecap(
        roomName: (j['roomName'] as String?) ?? 'Room',
        durationMinutes: (j['durationMinutes'] as num?)?.toDouble() ?? 0,
        songs: (j['songs'] as num?)?.toInt() ?? 0,
        participants: (j['participants'] as num?)?.toInt() ?? 0,
        reactions: (j['reactions'] as num?)?.toInt() ?? 0,
        topTrack: j['topTrack'] as String?,
        topArtist: j['topArtist'] as String?,
        mostReactedTrack: j['mostReactedTrack'] as String?,
        topDj: j['topDj'] as String?,
        mostActive: j['mostActive'] as String?,
        mostRequestedArtist: j['mostRequestedArtist'] as String?,
        coverUrl: j['coverUrl'] as String?,
        highlights: ((j['highlights'] as List?) ?? const []).cast<String>(),
      );
}

class RoomStats {
  RoomStats(this.values, this.awards);
  final Map<String, String> values; // label -> display value, server formatted
  final List<(String, String)> awards; // award title, member name
  factory RoomStats.fromJson(Map<String, dynamic> j) => RoomStats(
        {for (final e in ((j['metrics'] as List?) ?? const [])) e['label'] as String: e['value'].toString()},
        ((j['awards'] as List?) ?? const []).map((e) => (e['title'] as String, e['member'] as String)).toList(),
      );
}

// ═════════════════ Invitations ═════════════════

class RoomInvite {
  RoomInvite({required this.id, required this.url, required this.expiresMs, required this.uses});
  final String id, url;
  final int? expiresMs;
  final int uses;
  factory RoomInvite.fromJson(Map<String, dynamic> j) => RoomInvite(id: j['id'] as String, url: j['url'] as String, expiresMs: (j['expiresAtMs'] as num?)?.toInt(), uses: (j['uses'] as num?)?.toInt() ?? 0);
}

class JoinRequest {
  JoinRequest(this.id, this.userId, this.name);
  final String id, userId, name;
  factory JoinRequest.fromJson(Map<String, dynamic> j) => JoinRequest(j['id'] as String, j['userId'] as String, (j['displayName'] as String?) ?? 'Guest');
}

/// DJ / transition settings (host).
class DjSettings {
  DjSettings({this.requestMode = RequestMode.anyone, this.requestLimit = 3, this.queueLocked = false, this.gapless = true, this.crossfade = false, this.transitionSeconds = 4, this.preloadNext = true});
  RequestMode requestMode;
  int requestLimit;
  bool queueLocked, gapless, crossfade, preloadNext;
  int transitionSeconds;
  Map<String, dynamic> toJson() => {'requestMode': requestMode.wire, 'requestLimit': requestLimit, 'queueLocked': queueLocked, 'gapless': gapless, 'crossfade': crossfade, 'transitionSeconds': transitionSeconds, 'preloadNext': preloadNext};
  factory DjSettings.fromJson(Map<String, dynamic>? j) => j == null
      ? DjSettings()
      : DjSettings(
          requestMode: RequestMode.parse(j['requestMode'] as String?),
          requestLimit: (j['requestLimit'] as num?)?.toInt() ?? 3,
          queueLocked: (j['queueLocked'] as bool?) ?? false,
          gapless: (j['gapless'] as bool?) ?? true,
          crossfade: (j['crossfade'] as bool?) ?? false,
          transitionSeconds: (j['transitionSeconds'] as num?)?.toInt() ?? 4,
          preloadNext: (j['preloadNext'] as bool?) ?? true);
}

/// Cosmetic permission hint for phase 2 features.
extension RoomRoleX on RoomRole {
  bool get isStaff => rank >= RoomRole.coHost.rank;
}
