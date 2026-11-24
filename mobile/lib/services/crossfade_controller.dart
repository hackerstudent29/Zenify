import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/cupertino.dart';
import 'package:flutter/scheduler.dart';
import '../models/track.dart';

enum XfGroup { auto, classic, dj, production }

enum CrossfadeStyle {
  auto('auto', 'Auto', 'Picks the best transition for each pair of songs.', CupertinoIcons.sparkles, XfGroup.auto, 'Chosen per pair', 'Chosen per pair'),
  smooth('smooth', 'Smooth', 'Equal-power blend, constant loudness.', CupertinoIcons.waveform, XfGroup.classic, 'Volume down', 'Volume up'),
  linear('linear', 'Classic', 'Straight linear fade.', CupertinoIcons.arrow_right_arrow_left, XfGroup.classic, 'Linear out', 'Linear in'),
  sCurve('s_curve', 'Cinematic', 'Gentle start and finish, fast middle.', CupertinoIcons.wand_stars, XfGroup.classic, 'S-curve out', 'S-curve in'),
  dip('dip', 'Fade Through', 'Current song fades out fully, then the next fades in.', CupertinoIcons.circle_lefthalf_fill, XfGroup.classic, 'Dips to silence', 'Rises after dip'),
  djBlend('dj_blend', 'DJ Blend', 'Both play together, then a quick hand-off.', CupertinoIcons.bolt_fill, XfGroup.dj, 'Holds, then drops', 'Rises early'),
  bassSwap('bass_swap', 'Bass Swap', 'Low end swaps at the midpoint, no mud.', CupertinoIcons.arrow_2_circlepath, XfGroup.dj, 'Bass cut -30 dB', 'Bass returns'),
  filterSweep('filter_sweep', 'Filter Sweep', 'Resonant low-pass out, high-pass in.', CupertinoIcons.slider_horizontal_3, XfGroup.dj, 'Low-pass closes', 'High-pass opens'),
  stutterGate('stutter_gate', 'Stutter Gate', 'Tempo-synced chops get faster as it leaves.', CupertinoIcons.line_horizontal_3, XfGroup.dj, 'Gate chops speed up', 'Rises'),
  slamCut('slam_cut', 'Slam Cut', 'Hard cut mid-fade, reverb tail rings out.', CupertinoIcons.scissors, XfGroup.dj, 'Cut + reverb tail', 'Slams in'),
  hpRiser('hp_riser', 'Riser', 'Old song thins out, new one builds from the highs.', CupertinoIcons.arrow_up_circle_fill, XfGroup.dj, 'High-pass thins', 'Highs build up'),
  rnbGlide('rnb_glide', 'R&B Glide', 'One slides low and warm as the other rises bright.', CupertinoIcons.music_note_2, XfGroup.production, 'Low-pass closes', 'High-pass opens'),
  echoOut('echo_out', 'Echo Out', 'Last bar is thrown into a tempo-synced echo.', CupertinoIcons.dot_radiowaves_left_right, XfGroup.production, 'Echo tail', 'Rises'),
  reverbWash('reverb_wash', 'Reverb Wash', 'Old song dissolves into a dark reverb cloud.', CupertinoIcons.cloud_fill, XfGroup.production, 'Reverb + darker', 'High-pass opens'),
  tapeStop('tape_stop', 'Tape Stop', 'Old song winds down like a stopping tape.', CupertinoIcons.stop_fill, XfGroup.production, 'Slows + pitch drops', 'Rises'),
  turntable('turntable', 'Vinyl Brake', 'Old song slows as the next one rises.', CupertinoIcons.speedometer, XfGroup.production, 'Slows to half', 'Rises'),
  spinUp('spin_up', 'Spin-Up', 'New song spins up to speed from slow and muffled.', CupertinoIcons.arrow_clockwise, XfGroup.production, 'Fades fast', 'Speed + filter rise'),
  lofiDive('lofi_dive', 'Lo-Fi Dive', 'Old song crunches down to lo-fi, new one opens up.', CupertinoIcons.arrow_down_circle_fill, XfGroup.production, 'Bit-crush + low-pass', 'Low-pass opens'),
  flangerSweep('flanger_sweep', 'Jet Sweep', 'Flanger swirl on the way out.', CupertinoIcons.airplane, XfGroup.production, 'Flanger deepens', 'Flanger clears'),
  radioTune('radio_tune', 'Radio Tune', 'Old song narrows to a radio band, new one widens.', CupertinoIcons.antenna_radiowaves_left_right, XfGroup.production, 'Band narrows', 'Band widens');

  const CrossfadeStyle(this.id, this.label, this.blurb, this.icon, this.group, this.fxOut, this.fxIn);
  final String id, label, blurb, fxOut, fxIn;
  final IconData icon;
  final XfGroup group;
  static CrossfadeStyle fromId(String? id) =>
      values.firstWhere((s) => s.id == id, orElse: () => smooth);
}

/// MUST match xfGains() in ZenAudioPlugin.kt (audible dry gain).
class CrossfadeCurves {
  static double _ss(double x) { final v = x.clamp(0.0, 1.0).toDouble(); return v * v * (3 - 2 * v); }

  static (double out, double inn) gains(CrossfadeStyle s, double f) {
    const h = math.pi / 2;
    switch (s) {
      case CrossfadeStyle.linear:
        return (1 - f, f);
      case CrossfadeStyle.sCurve:
      case CrossfadeStyle.rnbGlide:
      case CrossfadeStyle.hpRiser:
        final e = _ss(f);
        return (math.cos(e * h), math.sin(e * h));
      case CrossfadeStyle.djBlend:
      case CrossfadeStyle.bassSwap:
      case CrossfadeStyle.stutterGate:
        final i = _ss(f / 0.45), o = 1 - _ss((f - 0.55) / 0.45);
        final n = math.sqrt(i * i + o * o), g = n > 1 ? 1 / n : 1.0;
        return (o * g, i * g);
      case CrossfadeStyle.dip:
        return (1 - _ss(f / 0.55), _ss((f - 0.45) / 0.55));
      case CrossfadeStyle.turntable:
        return ((1 - f) * (1 - f), math.sin(_ss((f - 0.1) / 0.9) * h));
      case CrossfadeStyle.filterSweep:
        return (1 - _ss((f - 0.35) / 0.65), _ss(f / 0.65));
      case CrossfadeStyle.echoOut:
        return (1 - _ss(f / 0.5), _ss((f - 0.3) / 0.5));
      case CrossfadeStyle.reverbWash:
        return (1 - _ss(f / 0.6), _ss((f - 0.3) / 0.6));
      case CrossfadeStyle.tapeStop:
        return (1 - _ss((f - 0.55) / 0.45), _ss((f - 0.4) / 0.4));
      case CrossfadeStyle.spinUp:
        return (1 - _ss(f / 0.7), _ss(f / 0.6));
      case CrossfadeStyle.slamCut:
        return (1 - _ss((f - 0.46) / 0.06), _ss((f - 0.47) / 0.04));
      case CrossfadeStyle.smooth:
      case CrossfadeStyle.auto:
      case CrossfadeStyle.radioTune:
      case CrossfadeStyle.lofiDive:
      case CrossfadeStyle.flangerSweep:
        return (math.cos(f * h), math.sin(f * h));
    }
  }

  static (double out, double inn) visual(CrossfadeStyle s, double f) {
    switch (s) {
      case CrossfadeStyle.dip:
      case CrossfadeStyle.djBlend:
      case CrossfadeStyle.turntable:
        return gains(s, f);
      default:
        final e = _ss(f);
        return (1 - e, e);
    }
  }
}

/// Running preview (set by PlayerState, read by the settings UI).
class XfPreview {
  XfPreview({required this.from, required this.to, required this.startSec, required this.lead,
      required this.xf, required this.style, required this.reason});
  static const int kLead = 5, kTail = 5;   // seconds of A before the fade / B after it
  final Track from, to;
  final int startSec;       // where A starts
  final double lead;        // real lead-in seconds
  final int xf;             // crossfade seconds (user setting)
  final CrossfadeStyle style;   // resolved (never auto)
  final String reason;
  double get total => lead + xf + kTail;
}

class XfadeSession {
  XfadeSession({required this.from, required this.fromDuration, required this.style, required this.ms});
  final Track from;
  final Duration fromDuration;
  final CrossfadeStyle style;
  int ms;
}

/// Single source of truth for crossfade UI. Audio is native; this only mirrors it.
class CrossfadeController {
  CrossfadeController._();
  static final instance = CrossfadeController._();

  final ValueNotifier<XfadeSession?> session = ValueNotifier(null);
  final ValueNotifier<double> progress = ValueNotifier(0);          // 0..1, fade clock
  final ValueNotifier<Duration> outPosition = ValueNotifier(Duration.zero); // old track's live position

  late final Ticker _ticker = Ticker(_tick);
  final Stopwatch _posClock = Stopwatch(), _fadeClock = Stopwatch();
  Duration _basePos = Duration.zero;
  bool _started = false;
  Timer? _guard;

  /// Call BEFORE advancing to the next track (same frame).
  void arm({required Track from, required Duration pos, required Duration duration,
            required CrossfadeStyle style, required int ms}) {
    _guard?.cancel();
    _started = false;
    progress.value = 0;
    _basePos = pos;
    _posClock..reset()..start();
    _fadeClock..reset()..stop();
    outPosition.value = pos;
    session.value = XfadeSession(from: from, fromDuration: duration, style: style, ms: ms);
    if (!_ticker.isActive) _ticker.start();
    _guard = Timer(Duration(milliseconds: ms + 7000), end);          // safety net
  }

  void onNativeStart(int ms) {
    final s = session.value;
    if (s == null) return;
    s.ms = ms;
    _started = true;
    _fadeClock..reset()..start();
    _guard?.cancel();
    _guard = Timer(Duration(milliseconds: ms + 1500), end);
  }

  void setPlaying(bool playing) {
    if (session.value == null) return;
    if (playing) { _posClock.start(); if (_started) _fadeClock.start(); }
    else { _posClock.stop(); _fadeClock.stop(); }
  }

  void end() {
    _guard?.cancel();
    if (_ticker.isActive) _ticker.stop();
    _posClock.stop(); _fadeClock.stop();
    progress.value = 1;
    session.value = null;
  }

  void _tick(Duration _) {
    final s = session.value;
    if (s == null) return;
    var p = _basePos + _posClock.elapsed;
    if (p > s.fromDuration) p = s.fromDuration;
    outPosition.value = p;
    if (_started) {
      final f = (_fadeClock.elapsedMilliseconds / s.ms).clamp(0.0, 1.0).toDouble();
      progress.value = f;
      if (f >= 1) end();
    }
  }
}
