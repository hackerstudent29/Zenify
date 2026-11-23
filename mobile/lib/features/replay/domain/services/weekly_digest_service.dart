import 'package:shared_preferences/shared_preferences.dart';
import '../replay_aggregate.dart';

/// Service for F27: Weekly Replay Digest.
/// Handles calculation, message generation, and scheduling for Sunday 8:00 PM local time.
class WeeklyDigestService {
  const WeeklyDigestService();

  static const String lastScheduledKey = 'replay_weekly_digest_scheduled_epoch';

  /// Computes the upcoming Sunday at 8:00 PM (20:00) local time.
  static DateTime getNextSunday8PM([DateTime? from]) {
    final now = from ?? DateTime.now();

    int daysUntilSunday = (DateTime.sunday - now.weekday);
    if (daysUntilSunday < 0) {
      daysUntilSunday += 7;
    }

    DateTime targetDate = DateTime(now.year, now.month, now.day + daysUntilSunday, 20, 0, 0);

    // If today is Sunday and 8:00 PM has already passed, schedule for next Sunday
    if (daysUntilSunday == 0 && now.isAfter(targetDate)) {
      targetDate = targetDate.add(const Duration(days: 7));
    }

    return targetDate;
  }

  /// Builds notification title.
  static String buildDigestTitle() {
    return 'Your Week in Music is Ready 🎧';
  }

  /// Builds personalized notification body based on active week aggregate.
  static String buildDigestBody(ReplayAggregate aggregate) {
    if (aggregate.totalMinutes == 0) {
      return 'Your week in music is ready. Open Zenify to explore your Replay 🎧';
    }

    final hours = (aggregate.totalMinutes / 60.0).toStringAsFixed(1);
    if (aggregate.topArtists.isNotEmpty) {
      final topArtist = aggregate.topArtists.first.artistName;
      return 'You listened to ${hours}h this week with $topArtist leading your rotation 🎧';
    }

    return 'You listened to ${aggregate.totalMinutes} minutes this week. Tap to see your Replay 🎧';
  }

  /// Schedules the weekly notification and records the epoch in [SharedPreferences].
  static Future<bool> scheduleWeeklyDigest({
    required ReplayAggregate? weekAggregate,
    DateTime? now,
    SharedPreferences? prefs,
  }) async {
    final target = getNextSunday8PM(now);
    final sp = prefs ?? await SharedPreferences.getInstance();
    await sp.setInt(lastScheduledKey, target.millisecondsSinceEpoch);
    return true;
  }
}
