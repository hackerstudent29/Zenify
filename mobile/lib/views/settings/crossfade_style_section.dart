import 'dart:math' as math;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../models/track.dart';
import '../../services/auto_crossfade.dart';
import '../../services/crossfade_controller.dart';
import '../../services/listening_history_service.dart';
import '../../services/player_state.dart';
import '../../services/settings_service.dart';
import '../player/player_kit.dart';

class CrossfadePreviewPair {
  const CrossfadePreviewPair({required this.tag, required this.from, required this.to});
  final String tag;
  final Track from, to;
}

class CrossfadeStyleSection extends StatefulWidget {
  const CrossfadeStyleSection({super.key});
  @override
  State<CrossfadeStyleSection> createState() => _CrossfadeStyleSectionState();
}

class _CrossfadeStyleSectionState extends State<CrossfadeStyleSection>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(seconds: 1))..repeat();
  int _sel = 0;

  @override
  void dispose() { _c.dispose(); super.dispose(); }

  /// Last 15 distinct songs -> consecutive pairs (older -> newer).
  List<CrossfadePreviewPair> _pairs(PlayerState p) {
    final songs = <Track>[];
    void add(Iterable<Track> it) {
      for (final t in it) {
        if (songs.length >= 15) return;
        if (t.isVideo || songs.any((s) => s.id == t.id)) continue;
        songs.add(t);
      }
    }
    add(p.history); // newest first
    add(ListeningHistoryService.instance.recentTracks); // flip if this one is oldest-first
    return [
      for (var i = 0; i < songs.length - 1; i++)
        CrossfadePreviewPair(tag: i == 0 ? 'Latest' : '#${i + 1}', from: songs[i + 1], to: songs[i]),
    ];
  }

  /// Seconds since the preview started, from the REAL engine clocks.
  double _t(PlayerState p, XfPreview v) {
    final cc = CrossfadeController.instance;
    final pos = p.livePosition.inMilliseconds / 1000;
    final double t;
    if (cc.session.value != null) {
      t = cc.outPosition.value.inMilliseconds / 1000 - v.startSec; // A is still audible
    } else if (p.currentTrack?.id == v.to.id) {
      t = v.lead + pos; // B alone
    } else {
      t = pos - v.startSec; // A lead-in
    }
    return t.clamp(0.0, v.total).toDouble();
  }

  @override
  Widget build(BuildContext context) {
    final st = context.watch<SettingsState>();
    final player = context.watch<PlayerState>();
    final setting = CrossfadeStyle.fromId(st.crossfadeStyle);
    final on = st.crossfadeSeconds > 0;
    final sec = on ? st.crossfadeSeconds : 6;
    const accent = AppColors.accent;

    final pairs = _pairs(player);
    final idx = pairs.isEmpty ? 0 : _sel.clamp(0, pairs.length - 1);
    final pair = pairs.isEmpty ? null : pairs[idx];
    final pick = pair == null
        ? null
        : AutoCrossfade.resolve(from: pair.from, to: pair.to, setting: st.crossfadeStyle,
            seconds: sec, allowFx: st.crossfadeAutoFx);
    final shown = pick?.style ?? (setting == CrossfadeStyle.auto ? CrossfadeStyle.smooth : setting);

    return AnimatedOpacity(
      opacity: on ? 1 : 0.4,
      duration: const Duration(milliseconds: 250),
      child: IgnorePointer(
        ignoring: !on,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // ── timeline: audio order + transition, driven by the real engine ──
          ValueListenableBuilder<XfPreview?>(
            valueListenable: player.previewNotifier,
            builder: (_, pv, _) {
              final style = pv?.style ?? shown;
              final lead = pv?.lead ?? XfPreview.kLead.toDouble();
              final xf = (pv?.xf ?? sec).toDouble();
              final a = (pv?.from ?? pair?.from)?.title ?? 'Song A';
              final b = (pv?.to ?? pair?.to)?.title ?? 'Song B';
              final why = pv?.reason ?? pick?.reason ?? '';
              return AnimatedBuilder(
                animation: _c,
                builder: (_, _) {
                  final t = pv == null ? -1.0 : _t(player, pv);
                  final phase = pv == null
                      ? 'Preview plan'
                      : t < lead ? 'Song A  ·  lead-in'
                      : t < lead + xf ? 'Transition  ·  ${style.label}'
                      : 'Song B  ·  after the fade';
                  return Container(
                    margin: const EdgeInsets.fromLTRB(16, 8, 16, 14),
                    padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(
                          child: Text(phase, style: const TextStyle(
                              fontFamily: 'SF Pro', fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white)),
                        ),
                        if (pv != null)
                          Text('${t.toStringAsFixed(1)}s / ${pv.total.toStringAsFixed(0)}s',
                              style: TextStyle(fontFamily: 'SF Pro', fontSize: 11, color: Colors.white.withValues(alpha: 0.5))),
                      ]),
                      const SizedBox(height: 8),
                      SizedBox(
                        height: 136,
                        width: double.infinity,
                        child: CustomPaint(
                          painter: _TimelinePainter(style: style, lead: lead, xf: xf,
                              tail: XfPreview.kTail.toDouble(), t: t, accent: accent, aName: a, bName: b),
                        ),
                      ),
                      if (why.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(
                            setting == CrossfadeStyle.auto ? 'Auto → ${style.label}: $why' : style.blurb,
                            style: TextStyle(fontFamily: 'SF Pro', fontSize: 12, color: Colors.white.withValues(alpha: 0.65)),
                          ),
                        ),
                    ]),
                  );
                },
              );
            },
          ),

          // ── style cards (Auto first) ──
          SizedBox(
            height: 92,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: CrossfadeStyle.values.length,
              separatorBuilder: (_, _) => const SizedBox(width: 10),
              itemBuilder: (_, i) {
                final s = CrossfadeStyle.values[i];
                final sel = s == setting;
                return PressableScale(
                  scale: 0.95,
                  onTap: () { HapticFeedback.selectionClick(); st.setCrossfadeStyle(s.id); },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 240),
                    curve: Curves.easeOutCubic,
                    width: 112,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: sel ? accent.withValues(alpha: 0.18) : Colors.white.withValues(alpha: 0.07),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: sel ? accent : Colors.transparent, width: 1.5),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      SizedBox(height: 26, width: double.infinity,
                          child: CustomPaint(painter: _MiniCurve(s, sel ? accent : Colors.white54))),
                      const Spacer(),
                      Row(children: [
                        Icon(s.icon, size: 14, color: sel ? accent : Colors.white70),
                        const SizedBox(width: 5),
                        Expanded(child: Text(s.label, maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontFamily: 'SF Pro', fontSize: 13, fontWeight: FontWeight.w600,
                                color: Colors.white.withValues(alpha: sel ? 1 : 0.8)))),
                      ]),
                    ]),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: Text('${setting.group.name.toUpperCase()}  ·  ${setting.blurb}',
                style: TextStyle(fontFamily: 'SF Pro', fontSize: 12.5, color: Colors.white.withValues(alpha: 0.6))),
          ),
          if (setting == CrossfadeStyle.auto)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 12, 0),
              child: Row(children: [
                Expanded(child: Text('Allow DJ & production effects',
                    style: TextStyle(fontFamily: 'SF Pro', fontSize: 13, color: Colors.white.withValues(alpha: 0.85)))),
                CupertinoSwitch(value: st.crossfadeAutoFx, onChanged: st.setCrossfadeAutoFx),
              ]),
            ),

          // ── last 15 songs -> consecutive pairs ──
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 8),
            child: Row(children: [
              const Icon(CupertinoIcons.music_albums, size: 14, color: Colors.white60),
              const SizedBox(width: 6),
              Text('PREVIEW WITH YOUR RECENT SONGS',
                  style: TextStyle(fontFamily: 'SF Pro', fontSize: 11, fontWeight: FontWeight.w700,
                      letterSpacing: 0.8, color: Colors.white.withValues(alpha: 0.55))),
              const Spacer(),
              if (pairs.isNotEmpty)
                Text('${idx + 1} of ${pairs.length}',
                    style: TextStyle(fontFamily: 'SF Pro', fontSize: 11, color: Colors.white.withValues(alpha: 0.4))),
            ]),
          ),
          if (pairs.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
              child: Text('Play at least two songs to preview a transition.',
                  style: TextStyle(fontFamily: 'SF Pro', fontSize: 13, color: Colors.white.withValues(alpha: 0.5))),
            )
          else
            SizedBox(
              height: 72,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: pairs.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (_, i) {
                  final p = pairs[i];
                  final sel = i == idx;
                  return PressableScale(
                    scale: 0.95,
                    onTap: () { HapticFeedback.selectionClick(); setState(() => _sel = i); },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 240),
                      width: 215,
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                      decoration: BoxDecoration(
                        color: sel ? accent.withValues(alpha: 0.16) : Colors.white.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: sel ? accent : Colors.white.withValues(alpha: 0.08), width: 1.5),
                      ),
                      child: Row(children: [
                        ClipRRect(borderRadius: BorderRadius.circular(8),
                            child: SizedBox(width: 30, height: 30, child: _PreviewCover(p.from))),
                        const Padding(padding: EdgeInsets.symmetric(horizontal: 4),
                            child: Icon(CupertinoIcons.arrow_right, size: 11, color: Colors.white54)),
                        ClipRRect(borderRadius: BorderRadius.circular(8),
                            child: SizedBox(width: 30, height: 30, child: _PreviewCover(p.to))),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(p.tag, style: const TextStyle(fontFamily: 'SF Pro', fontSize: 11.5,
                                fontWeight: FontWeight.w700, color: Colors.white)),
                            Text('${p.from.title} → ${p.to.title}', maxLines: 2, overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontFamily: 'SF Pro', fontSize: 10,
                                    color: Colors.white.withValues(alpha: sel ? 0.85 : 0.45))),
                          ]),
                        ),
                      ]),
                    ),
                  );
                },
              ),
            ),

          // ── play / stop ──
          ValueListenableBuilder<XfPreview?>(
            valueListenable: player.previewNotifier,
            builder: (_, pv, _) {
              final running = pv != null;
              return Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                child: PressableScale(
                  scale: 0.97,
                  onTap: pair == null && !running
                      ? null
                      : () {
                          HapticFeedback.mediumImpact();
                          running ? player.stopCrossfadePreview()
                                  : player.startCrossfadePreview(pair!.from, pair.to);
                        },
                  child: Container(
                    height: 48,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: running ? Colors.white.withValues(alpha: 0.14) : accent,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(running ? CupertinoIcons.stop_fill : CupertinoIcons.play_fill, size: 16, color: Colors.white),
                      const SizedBox(width: 8),
                      Text(running ? 'Stop preview' : 'Play preview',
                          style: const TextStyle(fontFamily: 'SF Pro', fontSize: 14,
                              fontWeight: FontWeight.w600, color: Colors.white)),
                    ]),
                  ),
                ),
              );
            },
          ),
          Center(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
              child: Text(
                'Plays the last ${sec + XfPreview.kLead}s of song A, crossfades ${sec}s, then ${XfPreview.kTail}s of song B. '
                'Your queue is restored afterwards.',
                textAlign: TextAlign.center,
                style: TextStyle(fontFamily: 'SF Pro', fontSize: 11, color: Colors.white.withValues(alpha: 0.4)),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}

/// Two lanes on one time axis: A (top) and B (bottom), shaded transition zone,
/// real gain curves, effect labels, and a playhead driven by the real engine.
class _TimelinePainter extends CustomPainter {
  _TimelinePainter({required this.style, required this.lead, required this.xf, required this.tail,
      required this.t, required this.accent, required this.aName, required this.bName});
  final CrossfadeStyle style;
  final double lead, xf, tail, t;
  final Color accent;
  final String aName, bName;

  void _txt(Canvas c, String s, Offset o, {double size = 10, Color? col, bool center = false,
      FontWeight w = FontWeight.w600, double maxW = 200}) {
    final tp = TextPainter(
      text: TextSpan(text: s, style: TextStyle(fontFamily: 'SF Pro', fontSize: size, fontWeight: w,
          color: col ?? Colors.white.withValues(alpha: 0.75))),
      textDirection: TextDirection.ltr, maxLines: 1, ellipsis: '…',
    )..layout(maxWidth: maxW);
    tp.paint(c, Offset(center ? o.dx - tp.width / 2 : o.dx, o.dy));
  }

  @override
  void paint(Canvas c, Size s) {
    final total = lead + xf + tail;
    const padX = 4.0, laneH = 40.0, aTop = 20.0, gap = 8.0;
    final bTop = aTop + laneH + gap;
    double x(double sec) => padX + sec / total * (s.width - padX * 2);

    // transition zone
    final zone = RRect.fromRectAndRadius(
        Rect.fromLTRB(x(lead), 2, x(lead + xf), bTop + laneH + 2), const Radius.circular(10));
    c.drawRRect(zone, Paint()..color = accent.withValues(alpha: 0.10));
    c.drawRRect(zone, Paint()..style = PaintingStyle.stroke..strokeWidth = 0.8..color = accent.withValues(alpha: 0.5));
    _txt(c, '${style.label} · ${xf.round()}s', Offset((x(lead) + x(lead + xf)) / 2, 5),
        center: true, col: accent, maxW: x(lead + xf) - x(lead));

    void lane(double top, double from, double to, double Function(double) gain, Color col, String name) {
      final path = Path()..moveTo(x(from), top + laneH);
      for (var i = 0; i <= 90; i++) {
        final sec = from + (to - from) * i / 90;
        path.lineTo(x(sec), top + laneH - gain(sec) * laneH);
      }
      path..lineTo(x(to), top + laneH)..close();
      c.drawPath(path, Paint()..color = col.withValues(alpha: 0.16));
      if (t >= 0) {
        c.save();
        c.clipRect(Rect.fromLTRB(0, top, x(t.clamp(from, to).toDouble()), top + laneH));
        c.drawPath(path, Paint()..color = col.withValues(alpha: 0.55));
        c.restore();
      }
      c.drawPath(path, Paint()..style = PaintingStyle.stroke..strokeWidth = 1.2..color = col.withValues(alpha: 0.9));
      _txt(c, name, Offset(x(from) + 6, top + 4), maxW: math.max(40, x(lead) - x(from) - 8), col: Colors.white);
    }

    double gA(double sec) => sec < lead ? 1.0 : CrossfadeCurves.gains(style, ((sec - lead) / xf).clamp(0.0, 1.0)).$1;
    double gB(double sec) => sec > lead + xf ? 1.0 : CrossfadeCurves.gains(style, ((sec - lead) / xf).clamp(0.0, 1.0)).$2;
    lane(aTop, 0, lead + xf, gA, accent, 'A  $aName');
    lane(bTop, lead, total, gB, Colors.white, 'B  $bName');

    final mid = (x(lead) + x(lead + xf)) / 2, zw = x(lead + xf) - x(lead);
    _txt(c, style.fxOut, Offset(mid, aTop + laneH / 2 - 6), center: true, size: 9.5, maxW: zw, col: Colors.white);
    _txt(c, style.fxIn, Offset(mid, bTop + laneH / 2 - 6), center: true, size: 9.5, maxW: zw, col: Colors.white);

    final ay = bTop + laneH + 8;
    _txt(c, '0s', Offset(x(0), ay), size: 9);
    _txt(c, 'fade ${lead.round()}s', Offset(x(lead), ay), center: true, size: 9);
    _txt(c, '${(lead + xf).round()}s', Offset(x(lead + xf), ay), center: true, size: 9);
    _txt(c, '${total.round()}s', Offset(s.width - 18, ay), size: 9);

    if (t >= 0) {
      final px = x(t);
      c.drawLine(Offset(px, 0), Offset(px, bTop + laneH + 4), Paint()..color = Colors.white..strokeWidth = 2);
      c.drawCircle(Offset(px, 2), 3.5, Paint()..color = Colors.white);
    }
  }

  @override
  bool shouldRepaint(_TimelinePainter o) =>
      o.t != t || o.style != style || o.lead != lead || o.xf != xf || o.aName != aName || o.bName != bName;
}

class _PreviewCover extends StatelessWidget {
  const _PreviewCover(this.track);
  final Track track;

  @override
  Widget build(BuildContext context) {
    if (track.coverUrl.isNotEmpty) {
      return CoverImage(track.coverUrl);
    }
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFF27272A), Color(0xFF18181B)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: const Center(
        child: Icon(CupertinoIcons.music_note, size: 18, color: Colors.white38),
      ),
    );
  }
}

class _MiniCurve extends CustomPainter {
  _MiniCurve(this.style, this.color);
  final CrossfadeStyle style;
  final Color color;

  @override
  void paint(Canvas c, Size s) {
    final a = Path(), b = Path();
    for (var i = 0; i <= 40; i++) {
      final f = i / 40;
      final (go, gi) = CrossfadeCurves.gains(style, f);
      final x = f * s.width;
      i == 0 ? a.moveTo(x, s.height * (1 - go)) : a.lineTo(x, s.height * (1 - go));
      i == 0 ? b.moveTo(x, s.height * (1 - gi)) : b.lineTo(x, s.height * (1 - gi));
    }
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    c.drawPath(a, p..color = color.withValues(alpha: 0.5));
    c.drawPath(b, p..color = color);
  }

  @override
  bool shouldRepaint(_MiniCurve o) => o.style != style || o.color != color;
}
