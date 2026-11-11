import 'dart:math' as math;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/room_models.dart';
import '../../../services/together_service.dart';

// ───────────────────────── Models (server-computed, see BACKEND §9) ─────────────────────────

class InsightBucket {
  InsightBucket(this.label, this.minutes);
  final String label;
  final double minutes;
}

class InsightSession {
  InsightSession({required this.id, required this.roomName, required this.startedAt, required this.minutes, required this.role, required this.tracks, required this.reactions});
  final String id;
  final String roomName;
  final DateTime startedAt;
  final double minutes;
  final RoomRole role;
  final int tracks;
  final int reactions;
  factory InsightSession.fromJson(Map<String, dynamic> j) => InsightSession(
        id: j['id'] as String,
        roomName: (j['roomName'] as String?) ?? 'Room',
        startedAt: DateTime.fromMillisecondsSinceEpoch((j['startedAtMs'] as num).toInt()),
        minutes: (j['minutes'] as num).toDouble(),
        role: RoomRole.parse(j['role'] as String?),
        tracks: (j['tracks'] as num?)?.toInt() ?? 0,
        reactions: (j['reactions'] as num?)?.toInt() ?? 0,
      );
}

class RoomInsights {
  RoomInsights({
    required this.roomsCreated,
    required this.roomsJoined,
    required this.listeningMinutes,
    required this.sessions,
    required this.avgSessionMinutes,
    required this.longestSessionMinutes,
    required this.tracksTogether,
    required this.reactions,
    required this.songsAdded,
    required this.voiceMinutes,
    required this.timeline,
    required this.roleMinutes,
    required this.topArtists,
    required this.history,
    required this.milestones,
  });
  final int roomsCreated, roomsJoined, sessions, tracksTogether, reactions, songsAdded;
  final double listeningMinutes, avgSessionMinutes, longestSessionMinutes, voiceMinutes;
  final List<InsightBucket> timeline;
  final Map<RoomRole, double> roleMinutes;
  final List<(String, int)> topArtists;
  final List<InsightSession> history;
  final List<String> milestones;

  factory RoomInsights.fromJson(Map<String, dynamic> j) {
    double d(String k) => (j[k] as num?)?.toDouble() ?? 0;
    int i(String k) => (j[k] as num?)?.toInt() ?? 0;
    return RoomInsights(
      roomsCreated: i('roomsCreated'),
      roomsJoined: i('roomsJoined'),
      listeningMinutes: d('listeningMinutes'),
      sessions: i('sessions'),
      avgSessionMinutes: d('avgSessionMinutes'),
      longestSessionMinutes: d('longestSessionMinutes'),
      tracksTogether: i('tracksTogether'),
      reactions: i('reactions'),
      songsAdded: i('songsAdded'),
      voiceMinutes: d('voiceMinutes'),
      timeline: ((j['timeline'] as List?) ?? const []).map((e) => InsightBucket(e['label'] as String, (e['minutes'] as num).toDouble())).toList(),
      roleMinutes: {for (final e in ((j['roleMinutes'] as Map?) ?? const {}).entries) RoomRole.parse(e.key as String): (e.value as num).toDouble()},
      topArtists: ((j['topArtists'] as List?) ?? const []).map((e) => (e['name'] as String, (e['plays'] as num).toInt())).toList(),
      history: ((j['history'] as List?) ?? const []).map((e) => InsightSession.fromJson(e as Map<String, dynamic>)).toList(),
      milestones: ((j['milestones'] as List?) ?? const []).cast<String>(),
    );
  }
}

String fmtMinutes(double m) {
  if (m < 60) return '${m.round()} min';
  final h = m ~/ 60;
  final r = (m % 60).round();
  return r == 0 ? '$h h' : '$h h $r m';
}

// ───────────────────────── Screen ─────────────────────────

class RoomInsightsScreen extends StatefulWidget {
  const RoomInsightsScreen({super.key});
  @override
  State<RoomInsightsScreen> createState() => _RoomInsightsScreenState();
}

class _RoomInsightsScreenState extends State<RoomInsightsScreen> {
  static const _ranges = ['week', 'month', 'all'];
  int _range = 0;
  RoomInsights? _data;
  bool _loading = true;
  bool _failed = false;
  int _req = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final my = ++_req;
    setState(() {
      _loading = true;
      _failed = false;
    });
    final raw = await context.read<TogetherService>().fetchInsights(_ranges[_range]);
    if (!mounted || my != _req) return; // drop stale response
    setState(() {
      _loading = false;
      if (raw == null) {
        _failed = true;
      } else {
        try {
          _data = RoomInsights.fromJson(raw);
        } catch (_) {
          _failed = true;
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      backgroundColor: AT.bg,
      body: SafeArea(
        bottom: false,
        child: CustomScrollView(physics: const BouncingScrollPhysics(), slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Row(children: [
                CircleIconButton(icon: CupertinoIcons.chevron_left, onTap: () => Navigator.pop(context)),
                const Spacer(),
                CircleIconButton(icon: CupertinoIcons.shield_lefthalf_fill, tooltip: 'Privacy', onTap: () => _privacy(context)),
              ]),
            ),
          ),
          const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.fromLTRB(20, 16, 20, 4), child: Text('Room Together', style: AT.largeTitle))),
          const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.fromLTRB(20, 0, 20, 16), child: Text('Your listening, together.', style: AT.subhead))),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: PillTabs(labels: const ['Week', 'Month', 'All time'], index: _range, onChanged: (i) {
                setState(() => _range = i);
                _load();
              }),
            ),
          ),
          if (_loading && d == null)
            const SliverFillRemaining(hasScrollBody: false, child: Center(child: CupertinoActivityIndicator()))
          else if (_failed && d == null)
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(CupertinoIcons.wifi_slash, color: AT.label3, size: 34),
                const SizedBox(height: 10),
                const Text('Could not load insights', style: AT.subhead),
                const SizedBox(height: 14),
                PillButton(label: 'Retry', compact: true, style: PillStyle.glass, onTap: _load),
              ])),
            )
          else if (d != null)
            SliverToBoxAdapter(child: AnimatedOpacity(opacity: _loading ? 0.5 : 1, duration: const Duration(milliseconds: 200), child: _content(d))),
          SliverToBoxAdapter(child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 32)),
        ]),
      ),
    );
  }

  Widget _content(RoomInsights d) {
    if (d.sessions == 0 && d.roomsCreated == 0 && d.roomsJoined == 0) {
      return const Padding(padding: EdgeInsets.all(48), child: Center(child: Text('No rooms yet. Start one and your stats will show here.', textAlign: TextAlign.center, style: AT.subhead)));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Hero
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: _Card(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('LISTENED TOGETHER', style: AT.micro.copyWith(color: AT.accent)),
            const SizedBox(height: 6),
            Text(fmtMinutes(d.listeningMinutes), style: AT.largeTitle.copyWith(fontSize: 44)),
            const SizedBox(height: 18),
            SizedBox(height: 120, child: _BarChart(buckets: d.timeline)),
          ]),
        ),
      ),

      // Stat grid
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 1.9,
          children: [
            _Stat('Rooms created', '${d.roomsCreated}'),
            _Stat('Rooms joined', '${d.roomsJoined}'),
            _Stat('Sessions', '${d.sessions}'),
            _Stat('Avg session', fmtMinutes(d.avgSessionMinutes)),
            _Stat('Longest', fmtMinutes(d.longestSessionMinutes)),
            _Stat('Tracks together', '${d.tracksTogether}'),
            _Stat('Reactions', '${d.reactions}'),
            _Stat('Songs added', '${d.songsAdded}'),
            _Stat('On voice', fmtMinutes(d.voiceMinutes)),
          ],
        ),
      ),

      // Role distribution
      if (d.roleMinutes.values.any((v) => v > 0))
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: _Card(child: _RoleBar(minutes: d.roleMinutes)),
        ),

      if (d.topArtists.isNotEmpty)
        GroupedSection(title: 'Favourite artists', children: [
          for (var i = 0; i < d.topArtists.length.clamp(0, 5); i++)
            AppleRow(leading: SizedBox(width: 20, child: Text('${i + 1}', style: AT.headline.copyWith(color: AT.accent))), title: d.topArtists[i].$1, trailing: Text('${d.topArtists[i].$2} plays', style: AT.subhead)),
        ]),

      if (d.milestones.isNotEmpty)
        GroupedSection(title: 'Milestones', children: [
          for (final m in d.milestones) AppleRow(leading: const IconTile(CupertinoIcons.rosette, color: AT.amber, size: 28), title: m),
        ]),

      if (d.history.isNotEmpty)
        GroupedSection(title: 'Session history', children: [
          for (final s in d.history)
            AppleRow(
              title: s.roomName,
              subtitle: '${_date(s.startedAt)} · ${fmtMinutes(s.minutes)} · ${s.role.label}',
              trailing: Text('${s.tracks} tracks', style: AT.subhead),
              chevron: true,
              onTap: () => _sessionSheet(s),
            ),
        ]),
    ]);
  }

  String _date(DateTime d) {
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${m[d.month - 1]} ${d.day}';
  }

  void _sessionSheet(InsightSession s) {
    AppleSheet.show<void>(context, initial: 0.5, builder: (ctx, sc) {
      return ListView(controller: sc, children: [
        SheetHeader(title: s.roomName, onClose: () => Navigator.pop(ctx)),
        GroupedSection(children: [
          AppleRow(title: 'Date', trailing: Text(_date(s.startedAt), style: AT.subhead)),
          AppleRow(title: 'Duration', trailing: Text(fmtMinutes(s.minutes), style: AT.subhead)),
          AppleRow(title: 'Your role', trailing: Text(s.role.label, style: AT.subhead)),
          AppleRow(title: 'Tracks', trailing: Text('${s.tracks}', style: AT.subhead)),
          AppleRow(title: 'Reactions', trailing: Text('${s.reactions}', style: AT.subhead)),
        ]),
      ]);
    });
  }

  void _privacy(BuildContext context) {
    final t = context.read<TogetherService>();
    AppleSheet.show<void>(context, initial: 0.5, builder: (ctx, sc) => _PrivacyBody(scroll: sc, together: t, onDeleted: _load));
  }
}

class _PrivacyBody extends StatefulWidget {
  const _PrivacyBody({required this.scroll, required this.together, required this.onDeleted});
  final ScrollController scroll;
  final TogetherService together;
  final VoidCallback onDeleted;
  @override
  State<_PrivacyBody> createState() => _PrivacyBodyState();
}

class _PrivacyBodyState extends State<_PrivacyBody> {
  bool _save = true;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    widget.together.fetchInsightsPrivacy().then((r) {
      if (!mounted) return;
      setState(() {
        _save = (r?['saveHistory'] as bool?) ?? true;
        _loaded = true;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListView(controller: widget.scroll, children: [
      SheetHeader(title: 'Privacy', onClose: () => Navigator.pop(context)),
      GroupedSection(
        footer: 'Stats are calculated on the server from rooms you took part in. Turning this off stops new history from being saved.',
        children: [
          AppleSwitchRow(
            title: 'Save room history',
            value: _save,
            onChanged: !_loaded
                ? null
                : (v) async {
                    setState(() => _save = v);
                    final ok = await widget.together.setInsightsPrivacy(saveHistory: v);
                    if (!ok && mounted) {
                      setState(() => _save = !v);
                      if (context.mounted) {
                        appleToast(context, 'Could not update setting.');
                      }
                    }
                  },
          ),
        ],
      ),
      GroupedSection(children: [
        AppleRow(
          title: 'Delete all room history',
          destructive: true,
          onTap: () async {
            final yes = await showCupertinoDialog<bool>(
              context: context,
              builder: (ctx) => CupertinoAlertDialog(
                title: const Text('Delete history?'),
                content: const Text('All your Room Together stats are permanently removed.'),
                actions: [
                  CupertinoDialogAction(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                  CupertinoDialogAction(isDestructiveAction: true, onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
                ],
              ),
            );
            if (yes != true) return;
            final ok = await widget.together.deleteInsightsHistory();
            if (!mounted || !context.mounted) return;
            appleToast(context, ok ? 'History deleted' : 'Could not delete history');
            if (ok) {
              widget.onDeleted();
              Navigator.pop(context);
            }
          },
        ),
      ]),
    ]);
  }
}

// ───────────────────────── Widgets ─────────────────────────

class _Card extends StatelessWidget {
  const _Card({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(color: AT.surface, borderRadius: BorderRadius.circular(AT.rLg)),
        child: child,
      );
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value);
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(color: AT.surface, borderRadius: BorderRadius.circular(AT.rMd + 2)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
          FittedBox(fit: BoxFit.scaleDown, child: Text(value, style: AT.title2)),
          const SizedBox(height: 2),
          Text(label, style: AT.footnote, maxLines: 1, overflow: TextOverflow.ellipsis),
        ]),
      );
}

class _BarChart extends StatefulWidget {
  const _BarChart({required this.buckets});
  final List<InsightBucket> buckets;
  @override
  State<_BarChart> createState() => _BarChartState();
}

class _BarChartState extends State<_BarChart> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 700))..forward();

  @override
  void didUpdateWidget(covariant _BarChart old) {
    super.didUpdateWidget(old);
    if (old.buckets != widget.buckets) _c.forward(from: 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.of(context).disableAnimations;
    if (reduce) _c.value = 1;
    return AnimatedBuilder(animation: _c, builder: (_, _) => CustomPaint(painter: _BarPainter(widget.buckets, Curves.easeOutCubic.transform(_c.value)), size: Size.infinite));
  }
}

class _BarPainter extends CustomPainter {
  _BarPainter(this.b, this.t);
  final List<InsightBucket> b;
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    if (b.isEmpty) return;
    final maxV = b.map((e) => e.minutes).fold<double>(1, math.max);
    const labelH = 18.0;
    final chartH = size.height - labelH;
    final slot = size.width / b.length;
    final barW = math.min(22.0, slot * 0.5);
    for (var i = 0; i < b.length; i++) {
      final h = (b[i].minutes / maxV) * chartH * t;
      final x = slot * i + (slot - barW) / 2;
      final r = RRect.fromRectAndRadius(Rect.fromLTWH(x, chartH - math.max(h, 3), barW, math.max(h, 3)), const Radius.circular(6));
      canvas.drawRRect(r, Paint()..color = b[i].minutes > 0 ? AT.accent : AT.fillStrong);
      final tp = TextPainter(text: TextSpan(text: b[i].label, style: const TextStyle(color: AT.label3, fontSize: 10)), textDirection: TextDirection.ltr)..layout();
      tp.paint(canvas, Offset(slot * i + (slot - tp.width) / 2, size.height - tp.height));
    }
  }

  @override
  bool shouldRepaint(covariant _BarPainter old) => old.t != t || old.b != b;
}

class _RoleBar extends StatelessWidget {
  const _RoleBar({required this.minutes});
  final Map<RoomRole, double> minutes;
  @override
  Widget build(BuildContext context) {
    final total = minutes.values.fold<double>(0, (a, b) => a + b);
    const colors = {RoomRole.host: AT.amber, RoomRole.coHost: AT.accent, RoomRole.dj: AT.blue, RoomRole.member: AT.green, RoomRole.listener: AT.label3};
    final entries = RoomRole.values.reversed.where((r) => (minutes[r] ?? 0) > 0).toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('TIME IN EACH ROLE', style: AT.micro),
      const SizedBox(height: 12),
      ClipRRect(
        borderRadius: BorderRadius.circular(AT.rPill),
        child: SizedBox(
          height: 14,
          child: Row(children: [
            for (final r in entries)
              Expanded(flex: math.max(1, ((minutes[r]! / total) * 1000).round()), child: Container(margin: const EdgeInsets.only(right: 2), color: colors[r])),
          ]),
        ),
      ),
      const SizedBox(height: 14),
      Wrap(spacing: 16, runSpacing: 8, children: [
        for (final r in entries)
          Row(mainAxisSize: MainAxisSize.min, children: [
            Container(width: 8, height: 8, decoration: BoxDecoration(color: colors[r], shape: BoxShape.circle)),
            const SizedBox(width: 6),
            Text('${r.label} ${fmtMinutes(minutes[r]!)}', style: AT.footnote),
          ]),
      ]),
    ]);
  }
}
