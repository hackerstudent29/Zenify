import 'dart:math' as math;
import '../models/track.dart';
import 'crossfade_controller.dart';
import 'smart_queue_engine.dart';

class AutoPick {
  const AutoPick(this.style, this.reason, [this.bpm]);
  final CrossfadeStyle style;
  final String reason;
  final double? bpm;
  /// Sent to native as "style@bpm" (bpm tempo-syncs echo and gate).
  String get nativeId => bpm == null ? style.id : '${style.id}@${bpm!.round()}';
}

class AutoCrossfade {
  static AutoPick resolve({
    required Track from, required Track to, required String setting,
    required int seconds, required bool allowFx,
  }) {
    final a = _Traits(from), b = _Traits(to);
    final bpm = a.bpm ?? b.bpm;
    if (setting != 'auto') return AutoPick(CrossfadeStyle.fromId(setting), 'Your choice', bpm);

    final fx = allowFx && seconds >= 4; // effects need time to be audible
    AutoPick pick(CrossfadeStyle s, String why) {
      if (!fx && s.group != XfGroup.classic) {
        final plain = switch (s) {
          CrossfadeStyle.bassSwap || CrossfadeStyle.stutterGate || CrossfadeStyle.djBlend => CrossfadeStyle.djBlend,
          CrossfadeStyle.echoOut || CrossfadeStyle.reverbWash ||
          CrossfadeStyle.tapeStop || CrossfadeStyle.slamCut => CrossfadeStyle.dip,
          _ => CrossfadeStyle.sCurve,
        };
        return AutoPick(plain, why, bpm);
      }
      return AutoPick(s, why, bpm);
    }

    // 1. Short tracks / interludes
    if (from.durationSeconds < 100 || to.durationSeconds < 100) {
      return pick(CrossfadeStyle.linear, 'Short track: simple fade');
    }

    // 2. Same album / soundtrack: seamless continuity
    if (from.album.isNotEmpty && from.album == to.album && !a.remix && !b.remix) {
      return pick(CrossfadeStyle.smooth, 'Same album: seamless blend');
    }

    // 3. Live recordings: avoid clashing crowd acoustics
    if (a.live || b.live) {
      return pick(CrossfadeStyle.dip, 'Live recording: avoids mixing crowd noise');
    }

    // 4. Lo-Fi / Slowed & Reverb aesthetic
    if (a.lofi || b.lofi) {
      return pick(CrossfadeStyle.lofiDive, 'Lo-fi vibe: bit-crush & warm low-pass dive');
    }

    // 5. Vintage / Retro vinyl aesthetic
    if (a.retro) {
      return pick(CrossfadeStyle.turntable, 'Retro vintage: vinyl brake slowing to next track');
    }
    if (b.retro && !a.retro) {
      return pick(CrossfadeStyle.tapeStop, 'Vintage track: tape stop hand-off');
    }

    // 6. Hip-hop / Rap / Drill hand-off
    if (a.hiphop && b.hiphop) {
      final matched = _bpmClose(a.bpm!, b.bpm!);
      return matched
          ? pick(CrossfadeStyle.stutterGate, 'Hip-hop groove: tempo-synced stutter chop')
          : pick(CrossfadeStyle.turntable, 'Hip-hop hand-off: vinyl turntable brake');
    }

    // 7. Both High Energy (EDM / Club / Party / Kuthu / Mass)
    if (a.energy >= 0.60 && b.energy >= 0.60) {
      final matched = _bpmClose(a.bpm!, b.bpm!);
      if (matched) {
        if (_keysOk(a.key, b.key) || a.remix || b.remix) {
          return pick(CrossfadeStyle.bassSwap, 'Beat-matched club bangers: clean bass swap');
        } else if (a.electronic || b.electronic) {
          return pick(CrossfadeStyle.filterSweep, 'High-energy electronic: resonant filter sweep');
        } else {
          return pick(CrossfadeStyle.stutterGate, 'High-energy dance: tempo stutter gate');
        }
      } else {
        // High energy but contrasting tempos
        return (a.energy >= 0.75 && b.energy >= 0.75)
            ? pick(CrossfadeStyle.slamCut, 'High-tempo clash: slam cut with reverb tail')
            : pick(CrossfadeStyle.echoOut, 'Tempos differ: tempo-synced echo throw');
      }
    }

    // 8. Energy Dynamics (Climbing or Dropping)
    final d = b.energy - a.energy;
    if (d <= -0.28) {
      return pick(CrossfadeStyle.reverbWash, 'Energy drops: dissolves into ambient reverb wash');
    }
    if (d >= 0.28) {
      if (b.electronic || b.remix) {
        return pick(CrossfadeStyle.spinUp, 'Energy rises: new song spins up to speed');
      }
      return pick(CrossfadeStyle.hpRiser, 'Energy rises: high-pass riser build');
    }

    // 9. Both Soft / Calm / Acoustic
    if (a.soft && b.soft) {
      if (from.title.toLowerCase().contains('acoustic') ||
          to.title.toLowerCase().contains('acoustic') ||
          from.title.toLowerCase().contains('unplugged') ||
          to.title.toLowerCase().contains('unplugged')) {
        return pick(CrossfadeStyle.radioTune, 'Acoustic warmth: vintage radio band blend');
      }
      return pick(CrossfadeStyle.rnbGlide, 'Both soft melodies: slow warm filter glide');
    }

    // 10. Same Artist (different albums)
    if (from.artist.isNotEmpty && from.artist == to.artist) {
      return pick(CrossfadeStyle.rnbGlide, 'Same artist: smooth harmonic glide');
    }

    // 11. Different Languages: dip through silence to respect vocal switch
    if (from.language.isNotEmpty && to.language.isNotEmpty && from.language != to.language) {
      return pick(CrossfadeStyle.dip, 'Different language: fade through silence');
    }

    // 12. Electronic Pop / Synth
    if (a.electronic || b.electronic) {
      return pick(CrossfadeStyle.flangerSweep, 'Electronic pop: jet sweep swirl');
    }

    // 13. Pop / Dance Groove Hand-off
    if (a.energy >= 0.50 || b.energy >= 0.50) {
      return pick(CrossfadeStyle.djBlend, 'Pop groove: quick hand-off DJ blend');
    }

    // 14. Default balanced transition
    return pick(CrossfadeStyle.smooth, 'Balanced transition: equal-power blend');
  }

  static bool _bpmClose(double x, double y) =>
      [1.0, 2.0, 0.5].any((r) => (x / (y * r) - 1).abs() < 0.04);

  /// Camelot keys (e.g. 8A): same letter and number within 1, or same number.
  static bool _keysOk(String? x, String? y) {
    final re = RegExp(r'^(\d{1,2})([AB])$', caseSensitive: false);
    final m = x == null ? null : re.firstMatch(x.trim());
    final n = y == null ? null : re.firstMatch(y.trim());
    if (m == null || n == null) return false;
    final d = (int.parse(m[1]!) - int.parse(n[1]!)).abs();
    final diff = math.min(d, 12 - d);
    return diff == 0 || (diff == 1 && m[2]!.toUpperCase() == n[2]!.toUpperCase());
  }
}

class _Traits {
  _Traits(Track t) {
    final s = '${t.title} ${t.artist} ${t.album}'.toLowerCase();
    live = RegExp(r'\blive\b|concert|unplugged live|stadium|tour\b').hasMatch(s);
    remix = RegExp(r'remix|\bmix\b|club|edm|bass boost|extended|\bvip\b|party|dance|banger|mass|kuthu').hasMatch(s);
    soft = RegExp(r'acoustic|piano|unplugged|lo-?fi|slowed|ballad|instrumental|sleep|calm|chill|lullaby|melody|peaceful').hasMatch(s);
    hiphop = RegExp(r'\brap\b|hip hop|hip-hop|drill|trap|freestyle|cypher').hasMatch(s);
    lofi = RegExp(r'lo-?fi|slowed|reverb|chillhop|midnight|rainy|aesthetic').hasMatch(s);
    retro = RegExp(r'retro|vintage|disco|70s|80s|90s|classic|nostalgia|vinyl|oldies').hasMatch(s);
    electronic = RegExp(r'edm|electronic|synth|techno|house|future bass|dubstep|trance|electro').hasMatch(s);

    final rawBpm = _num(t, () => (t as dynamic).bpm);
    final rawEnergy = _num(t, () => (t as dynamic).energy);
    key = _str(() => (t as dynamic).key);

    // Multi-lingual NLP keyword scoring from SmartQueueEngine
    final estimatedEn = SmartQueueEngine.estimateEnergy(t);
    var e = rawEnergy ?? estimatedEn;
    if (rawEnergy == null) {
      if (remix || electronic) e = math.min(1.0, e + 0.15);
      if (soft || lofi) e = math.max(0.0, e - 0.20);
    }
    energy = e.clamp(0.0, 1.0).toDouble();

    // Estimate realistic tempo BPM for beat-synced native DSP (echo / stutter gate)
    if (rawBpm != null) {
      bpm = rawBpm;
    } else {
      if (hiphop) {
        bpm = 92.0;
      } else if (energy >= 0.70 || remix || electronic) {
        bpm = 128.0;
      } else if (energy <= 0.35 || soft) {
        bpm = 74.0;
      } else {
        bpm = 108.0;
      }
    }
  }

  late final bool live, remix, soft, hiphop, lofi, retro, electronic;
  late final double? bpm;
  late final double energy;
  late final String? key;

  static double? _num(Track t, dynamic Function() get) {
    try { final v = get(); return v is num && v > 0 ? v.toDouble() : null; } catch (_) { return null; }
  }
  static String? _str(dynamic Function() get) {
    try { final v = get(); return v is String && v.isNotEmpty ? v : null; } catch (_) { return null; }
  }
}
