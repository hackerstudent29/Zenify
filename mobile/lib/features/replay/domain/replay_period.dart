import 'listen_event.dart';

/// The kind of period over which Replay aggregates listening history.
enum PeriodKind { week, month, year }

/// Represents an immutable time interval in local wall-clock time.
///
/// [startWall] is inclusive, [endWall] is exclusive.
/// All bucketing uses local wall-clock time so events during travel or DST
/// changes are bucketed correctly into the user's perception of time.
class ReplayPeriod {
  ReplayPeriod({
    required this.kind,
    required DateTime startWall,
    required DateTime endWall,
  })  : startWall = _toWallUtc(startWall),
        endWall = _toWallUtc(endWall);

  static DateTime _toWallUtc(DateTime dt) => dt.isUtc
      ? dt
      : DateTime.utc(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second, dt.millisecond);

  final PeriodKind kind;

  /// Inclusive start timestamp (normalized wall clock).
  final DateTime startWall;

  /// Exclusive end timestamp (normalized wall clock).
  final DateTime endWall;

  /// True if the event's local wall clock falls strictly within [startWall, endWall).
  bool contains(ListenEvent e) {
    final w = e.localWall;
    return !w.isBefore(startWall) && w.isBefore(endWall);
  }

  /// Whether this period is completely closed (past) relative to [nowWall].
  bool isClosed(DateTime nowWall) => !_toWallUtc(nowWall).isBefore(endWall);

  /// Unique stable cache and archive storage key for this period.
  /// Examples: 'W-2026-11-16', 'M-2026-11', 'Y-2026'.
  String get key {
    final y = startWall.year.toString().padLeft(4, '0');
    final m = startWall.month.toString().padLeft(2, '0');
    final d = startWall.day.toString().padLeft(2, '0');
    switch (kind) {
      case PeriodKind.week:
        return 'W-$y-$m-$d';
      case PeriodKind.month:
        return 'M-$y-$m';
      case PeriodKind.year:
        return 'Y-$y';
    }
  }

  bool get isYear => kind == PeriodKind.year;
  bool get isMonth => kind == PeriodKind.month;
  bool get isWeek => kind == PeriodKind.week;

  static const _monthNames = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  static const _monthAbbr = [
    '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  String get label {
    switch (kind) {
      case PeriodKind.year:
        return '${startWall.year}';
      case PeriodKind.month:
        return '${_monthNames[startWall.month]} ${startWall.year}';
      case PeriodKind.week:
        return 'Week of ${_monthAbbr[startWall.month]} ${startWall.day}';
    }
  }

  /// Computes the exact previous period (for delta calculations and time-travel).
  /// - Week: shifts back exactly 7 calendar days.
  /// - Month: shifts back 1 calendar month (e.g. 2026-01 -> 2025-12).
  /// - Year: shifts back 1 calendar year (e.g. 2026 -> 2025).
  ReplayPeriod get previous {
    switch (kind) {
      case PeriodKind.week:
        final prevStart = startWall.subtract(const Duration(days: 7));
        final prevEnd = startWall;
        return ReplayPeriod(kind: PeriodKind.week, startWall: prevStart, endWall: prevEnd);

      case PeriodKind.month:
        // Dart normalizes DateTime.utc(year, month - 1) automatically across year boundaries
        final prevStart = DateTime.utc(startWall.year, startWall.month - 1, 1);
        final prevEnd = DateTime.utc(startWall.year, startWall.month, 1);
        return ReplayPeriod(kind: PeriodKind.month, startWall: prevStart, endWall: prevEnd);

      case PeriodKind.year:
        final prevStart = DateTime.utc(startWall.year - 1, 1, 1);
        final prevEnd = DateTime.utc(startWall.year, 1, 1);
        return ReplayPeriod(kind: PeriodKind.year, startWall: prevStart, endWall: prevEnd);
    }
  }

  // ---------------------------------------------------------------------------
  // Static Factory Helpers
  // ---------------------------------------------------------------------------

  /// Returns the Monday 00:00:00 representing the start of the week for [wall].
  /// Week starts Monday (weekday = 1).
  static DateTime startOfWeek(DateTime wall) {
    final dateOnly = DateTime.utc(wall.year, wall.month, wall.day);
    return dateOnly.subtract(Duration(days: wall.weekday - 1));
  }

  /// Factory for a calendar week starting on Monday at 00:00:00.
  factory ReplayPeriod.week(DateTime wall) {
    final start = startOfWeek(wall);
    final end = start.add(const Duration(days: 7));
    return ReplayPeriod(kind: PeriodKind.week, startWall: start, endWall: end);
  }

  /// Factory for a full calendar month (1st of month 00:00 to 1st of next month 00:00).
  factory ReplayPeriod.month(DateTime wall) {
    final start = DateTime.utc(wall.year, wall.month, 1);
    final end = DateTime.utc(wall.year, wall.month + 1, 1);
    return ReplayPeriod(kind: PeriodKind.month, startWall: start, endWall: end);
  }

  /// Factory for a full calendar year (Jan 1 00:00 to Jan 1 next year 00:00).
  factory ReplayPeriod.year(DateTime wall) {
    final start = DateTime.utc(wall.year, 1, 1);
    final end = DateTime.utc(wall.year + 1, 1, 1);
    return ReplayPeriod(kind: PeriodKind.year, startWall: start, endWall: end);
  }

  /// Reconstructs a period from its key string ('W-2026-11-16', 'M-2026-11', 'Y-2026').
  static ReplayPeriod? parseKey(String key) {
    final parts = key.split('-');
    if (parts.length < 2) return null;
    final prefix = parts[0].toUpperCase();
    final year = int.tryParse(parts[1]);
    if (year == null) return null;

    if (prefix == 'Y') {
      return ReplayPeriod.year(DateTime(year, 1, 1));
    } else if (prefix == 'M' && parts.length >= 3) {
      final month = int.tryParse(parts[2]);
      if (month == null || month < 1 || month > 12) return null;
      return ReplayPeriod.month(DateTime(year, month, 1));
    } else if (prefix == 'W' && parts.length >= 4) {
      final month = int.tryParse(parts[2]);
      final day = int.tryParse(parts[3]);
      if (month == null || day == null) return null;
      return ReplayPeriod.week(DateTime(year, month, day));
    }
    return null;
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ReplayPeriod &&
          runtimeType == other.runtimeType &&
          kind == other.kind &&
          startWall == other.startWall &&
          endWall == other.endWall;

  @override
  int get hashCode => Object.hash(kind, startWall, endWall);

  @override
  String toString() => 'ReplayPeriod($key: $startWall to $endWall)';
}
