import 'package:flutter/foundation.dart';

/// Data model representing a dedicated / gifted song card (F18).
@immutable
class GiftSong {
  final String token;
  final String trackId;
  final String title;
  final String artist;
  final String? coverUrl;
  final String note;
  final String senderName;
  final DateTime createdAt;
  final DateTime? openedAt;

  const GiftSong({
    required this.token,
    required this.trackId,
    required this.title,
    required this.artist,
    this.coverUrl,
    required this.note,
    required this.senderName,
    required this.createdAt,
    this.openedAt,
  });

  /// Sanitizes note text to max 140 characters with leading/trailing whitespace removed.
  static String sanitizeNote(String rawNote) {
    final trimmed = rawNote.trim();
    if (trimmed.length > 140) {
      return trimmed.substring(0, 140);
    }
    return trimmed;
  }

  Map<String, dynamic> toJson() => {
        'token': token,
        'trackId': trackId,
        'title': title,
        'artist': artist,
        if (coverUrl != null) 'coverUrl': coverUrl,
        'note': note,
        'senderName': senderName,
        'createdAt': createdAt.toIso8601String(),
        if (openedAt != null) 'openedAt': openedAt!.toIso8601String(),
      };

  factory GiftSong.fromJson(Map<String, dynamic> json) => GiftSong(
        token: json['token']?.toString() ?? '',
        trackId: json['trackId']?.toString() ?? '',
        title: json['title']?.toString() ?? '',
        artist: json['artist']?.toString() ?? '',
        coverUrl: json['coverUrl']?.toString(),
        note: sanitizeNote(json['note']?.toString() ?? ''),
        senderName: json['senderName']?.toString() ?? 'A Zenify Friend',
        createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
        openedAt: json['openedAt'] != null
            ? DateTime.tryParse(json['openedAt']?.toString() ?? '')
            : null,
      );
}
