import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import '../../data/replay_journal_reader.dart';
import '../../data/track_meta_store.dart';
import '../all_time_index.dart';
import '../replay_aggregate.dart';
import '../replay_engine.dart';
import '../replay_period.dart';

/// Metadata summary of an archived Replay snapshot.
@immutable
class ArchivePeriodEntry {
  final String periodKey;
  final String label;
  final String periodType;
  final int totalMinutes;
  final int uniqueSongs;
  final int uniqueArtists;
  final String? topSongTitle;
  final String? topSongArtist;
  final String? topSongArtwork;
  final DateTime savedAt;

  const ArchivePeriodEntry({
    required this.periodKey,
    required this.label,
    required this.periodType,
    required this.totalMinutes,
    required this.uniqueSongs,
    required this.uniqueArtists,
    this.topSongTitle,
    this.topSongArtist,
    this.topSongArtwork,
    required this.savedAt,
  });

  Map<String, dynamic> toJson() => {
        'periodKey': periodKey,
        'label': label,
        'periodType': periodType,
        'totalMinutes': totalMinutes,
        'uniqueSongs': uniqueSongs,
        'uniqueArtists': uniqueArtists,
        'topSongTitle': topSongTitle,
        'topSongArtist': topSongArtist,
        'topSongArtwork': topSongArtwork,
        'savedAt': savedAt.toIso8601String(),
      };

  factory ArchivePeriodEntry.fromSnapshot(ReplayAggregate s, {DateTime? savedAt}) {
    final topSong = s.topSongs.isNotEmpty ? s.topSongs.first : null;
    return ArchivePeriodEntry(
      periodKey: s.period.key,
      label: s.period.label,
      periodType: s.period.kind.name,
      totalMinutes: s.totalMinutes,
      uniqueSongs: s.topSongs.length,
      uniqueArtists: s.topArtists.length,
      topSongTitle: topSong?.title,
      topSongArtist: topSong?.artistRaw,
      topSongArtwork: topSong?.coverUrl,
      savedAt: savedAt ?? DateTime.now().toUtc(),
    );
  }
}

/// Service for F21: Replay Archive ("Time Machine").
/// Saves and retrieves immutable snapshots of finished periods.
class ReplayArchiveService {
  final Directory? _customDir;

  const ReplayArchiveService({Directory? customDirectory})
      : _customDir = customDirectory;

  Future<Directory> _getArchiveDir() async {
    final custom = _customDir;
    if (custom != null) {
      if (!custom.existsSync()) {
        custom.createSync(recursive: true);
      }
      return custom;
    }
    final docs = await getApplicationDocumentsDirectory();
    final dir = Directory('${docs.path}/replay_archive');
    if (!dir.existsSync()) {
      dir.createSync(recursive: true);
    }
    return dir;
  }

  /// Atomically saves a [ReplayAggregate] to the archive.
  Future<void> saveSnapshot(ReplayAggregate snapshot) async {
    final dir = await _getArchiveDir();
    final targetFile = File('${dir.path}/${snapshot.period.key}.json');
    final tempFile = File('${dir.path}/${snapshot.period.key}.json.tmp');

    final jsonStr = jsonEncode(snapshot.toJson());
    tempFile.writeAsStringSync(jsonStr, flush: true);

    // Atomic rename
    if (targetFile.existsSync()) {
      targetFile.deleteSync();
    }
    tempFile.renameSync(targetFile.path);
  }

  /// Loads an archived snapshot by [periodKey].
  Future<ReplayAggregate?> loadSnapshot(String periodKey) async {
    final dir = await _getArchiveDir();
    final file = File('${dir.path}/$periodKey.json');
    if (!file.existsSync()) return null;

    try {
      final jsonStr = file.readAsStringSync();
      final map = jsonDecode(jsonStr) as Map<String, dynamic>;
      return ReplayAggregate.fromJson(map);
    } catch (e) {
      debugPrint('[ReplayArchiveService] Failed to load snapshot $periodKey: $e');
      return null;
    }
  }

  /// Lists all archived period entries, sorted newest to oldest.
  Future<List<ArchivePeriodEntry>> listSnapshots() async {
    final dir = await _getArchiveDir();
    if (!dir.existsSync()) return [];

    final entries = <ArchivePeriodEntry>[];
    final files = dir.listSync().whereType<File>().where((f) => f.path.endsWith('.json'));

    for (final file in files) {
      try {
        final content = file.readAsStringSync();
        final map = jsonDecode(content) as Map<String, dynamic>;
        final snapshot = ReplayAggregate.fromJson(map);
        final stat = file.statSync();
        entries.add(ArchivePeriodEntry.fromSnapshot(snapshot, savedAt: stat.modified));
      } catch (e) {
        debugPrint('[ReplayArchiveService] Could not parse ${file.path}: $e');
      }
    }

    entries.sort((a, b) => b.periodKey.compareTo(a.periodKey));
    return entries;
  }

  /// Deletes an archived snapshot.
  Future<bool> deleteSnapshot(String periodKey) async {
    final dir = await _getArchiveDir();
    final file = File('${dir.path}/$periodKey.json');
    if (file.existsSync()) {
      file.deleteSync();
      return true;
    }
    return false;
  }

  /// Checks for finished past months and weeks, and generates snapshots
  /// for any that have listening events but no archived snapshot.
  Future<int> closeFinishedPeriods({
    required DateTime nowUtc,
    required File journalFile,
    required ReplayEngine engine,
    required TrackMetaStore metaStore,
    AllTimeIndex? allTimeIndex,
  }) async {
    int generatedCount = 0;
    final dir = await _getArchiveDir();
    const reader = ReplayJournalReader();

    // Check past 12 months
    for (int i = 1; i <= 12; i++) {
      final targetMonth = DateTime.utc(nowUtc.year, nowUtc.month - i, 1);
      final period = ReplayPeriod.month(targetMonth);
      final file = File('${dir.path}/${period.key}.json');

      if (!file.existsSync()) {
        final events = await reader.readEvents(journalFile).toList();
        final periodEvents = events.where((e) => period.contains(e)).toList();
        if (periodEvents.isNotEmpty) {
          final snapshot = await engine.compute(
            period: period,
            events: Stream.fromIterable(periodEvents),
            metaStore: metaStore,
            allTimeIndex: allTimeIndex,
          );
          if (snapshot.totalListenedMs > 0) {
            await saveSnapshot(snapshot);
            generatedCount++;
          }
        }
      }
    }

    return generatedCount;
  }
}
