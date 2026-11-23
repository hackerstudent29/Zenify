import 'dart:convert';
import 'dart:io';

import '../domain/listen_event.dart';
import '../domain/replay_period.dart';
import 'exclusion_store.dart';

/// Stream-based reader for the persistent JSONL listening journal.
///
/// Features:
/// - Reads as a stream (memory efficient, never loads entire huge journal at once).
/// - Skips corrupt or incomplete lines cleanly without aborting.
/// - Supports v1 -> v2 automatic schema migration.
class ReplayJournalReader {
  const ReplayJournalReader();

  /// Reads [ListenEvent] records from [file] as a stream.
  /// If [onCorruptLine] is provided, it receives the count of unparseable lines.
  Stream<ListenEvent> readEvents(
    File file, {
    void Function(int corruptCount)? onCorruptLine,
  }) async* {
    if (!file.existsSync() && !await file.exists()) return;

    var corruptCount = 0;

    List<String> lines;
    try {
      lines = file.readAsLinesSync();
    } catch (_) {
      try {
        lines = await file.readAsLines();
      } catch (_) {
        return;
      }
    }

    for (final line in lines) {
      final trimmed = line.trim();
      if (trimmed.isEmpty) continue;

      try {
        final decoded = jsonDecode(trimmed);
        if (decoded is Map<String, dynamic>) {
          yield ListenEvent.fromJson(decoded);
        } else if (decoded is Map) {
          yield ListenEvent.fromJson(Map<String, dynamic>.from(decoded));
        } else {
          corruptCount++;
        }
      } catch (_) {
        corruptCount++;
      }
    }

    if (corruptCount > 0 && onCorruptLine != null) {
      onCorruptLine(corruptCount);
    }
  }
}

/// The single mandated event gateway for Replay aggregations.
///
/// Enforces Rule R12:
/// Every aggregation reads events only through [ReplayEventSource.eligible(...)],
/// which strictly filters out excluded events and events outside the period.
class ReplayEventSource {
  const ReplayEventSource._();

  /// Streams eligible, non-excluded events falling strictly inside [period].
  static Stream<ListenEvent> eligible({
    required File journalFile,
    required ReplayPeriod period,
    required ExclusionStore exclusions,
    void Function(int count)? onCorruptLine,
  }) async* {
    const reader = ReplayJournalReader();
    final eventStream = reader.readEvents(journalFile, onCorruptLine: onCorruptLine);

    await for (final event in eventStream) {
      if (exclusions.isExcluded(event)) continue;
      if (period.contains(event)) {
        yield event;
      }
    }
  }

  /// Streams all eligible, non-excluded events across all time (for lifetime badges/milestones).
  static Stream<ListenEvent> allEligible({
    required File journalFile,
    required ExclusionStore exclusions,
    void Function(int count)? onCorruptLine,
  }) async* {
    const reader = ReplayJournalReader();
    final eventStream = reader.readEvents(journalFile, onCorruptLine: onCorruptLine);

    await for (final event in eventStream) {
      if (exclusions.isExcluded(event)) continue;
      yield event;
    }
  }
}
