import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/room_phase2_models.dart';
import '../../../services/together_service.dart';
import '../../../utils/share_image.dart';

/// Opens after ROOM_CLOSED / ROOM_RECAP_READY, or from insights history.
/// [roomRef] = room code or room id the backend accepts at GET /recaps/{ref}.
class RoomRecapScreen extends StatefulWidget {
  const RoomRecapScreen({super.key, required this.roomRef});
  final String roomRef;
  @override
  State<RoomRecapScreen> createState() => _RoomRecapScreenState();
}

class _RoomRecapScreenState extends State<RoomRecapScreen> {
  RoomRecap? _r;
  bool _failed = false;
  int _tries = 0;
  final _page = PageController();
  int _idx = 0;
  final _shareKey = GlobalKey();
  bool _sharing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _failed = false);
    final r = await context.read<TogetherService>().fetchRecap(widget.roomRef);
    if (!mounted) return;
    if (r == null && _tries++ < 3) {
      // Recap is generated server-side after close; give it a moment.
      await Future<void>.delayed(const Duration(seconds: 2));
      if (mounted) return _load();
    }
    if (mounted) {
      setState(() {
        _r = r;
        _failed = r == null;
      });
    }
  }

  Future<void> _share() async {
    if (_sharing) return;
    setState(() => _sharing = true);
    final ok = await shareBoundaryAsImage(_shareKey, fileName: 'zenify_recap_${widget.roomRef}', text: 'Our Room Together recap on Zenify');
    if (!mounted) return;
    setState(() => _sharing = false);
    if (!ok) appleToast(context, 'Could not create the image.');
  }

  String _dur(double m) => m < 60 ? '${m.round()} min' : '${(m / 60).toStringAsFixed(m % 60 == 0 ? 0 : 1)} h';

  @override
  Widget build(BuildContext context) {
    final r = _r;
    return Scaffold(
      backgroundColor: AT.bg,
      body: Stack(children: [
        Positioned.fill(child: ArtworkAmbient(url: r?.coverUrl ?? '')),
        SafeArea(
          child: _failed
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Text('Recap is not ready', style: AT.headline),
                  const SizedBox(height: 12),
                  PillButton(label: 'Try again', compact: true, style: PillStyle.glass, onTap: () {
                    _tries = 0;
                    _load();
                  }),
                  const SizedBox(height: 8),
                  PillButton(label: 'Close', compact: true, style: PillStyle.plain, onTap: () => Navigator.pop(context)),
                ]))
              : r == null
                  ? const Center(child: CupertinoActivityIndicator())
                  : Column(children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                        child: Row(children: [
                          CircleIconButton(icon: CupertinoIcons.xmark, onTap: () => Navigator.pop(context)),
                          const Spacer(),
                          Row(children: [for (var i = 0; i < 5; i++) AnimatedContainer(duration: const Duration(milliseconds: 300), margin: const EdgeInsets.symmetric(horizontal: 3), width: i == _idx ? 18 : 6, height: 6, decoration: BoxDecoration(color: i == _idx ? AT.label : AT.label3, borderRadius: BorderRadius.circular(3)))]),
                          const Spacer(),
                          const SizedBox(width: 40),
                        ]),
                      ),
                      Expanded(
                        child: PageView(
                          controller: _page,
                          physics: const BouncingScrollPhysics(),
                          onPageChanged: (i) {
                            HapticFeedback.selectionClick();
                            setState(() => _idx = i);
                          },
                          children: [
                            _Hero(r: r, dur: _dur(r.durationMinutes)),
                            _Numbers(r: r),
                            _Tops(r: r),
                            _People(r: r),
                            _ShareCard(r: r, boundaryKey: _shareKey, dur: _dur(r.durationMinutes), sharing: _sharing, onShare: _share),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                    ]),
        ),
      ]),
    );
  }
}

class _CountUp extends StatelessWidget {
  const _CountUp(this.value, {this.style});
  final int value;
  final TextStyle? style;
  @override
  Widget build(BuildContext context) => TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: value.toDouble()),
        duration: MediaQuery.of(context).disableAnimations ? Duration.zero : const Duration(milliseconds: 900),
        curve: Curves.easeOutCubic,
        builder: (_, v, _) => Text('${v.round()}', style: style ?? AT.largeTitle.copyWith(fontSize: 88, letterSpacing: -3)),
      );
}

class _Page extends StatelessWidget {
  const _Page({required this.kicker, required this.children});
  final String kicker;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(28, 24, 28, 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [Text(kicker.toUpperCase(), style: AT.micro.copyWith(color: AT.accent, letterSpacing: 1.2)), const SizedBox(height: 16), ...children]),
      );
}

class _Hero extends StatelessWidget {
  const _Hero({required this.r, required this.dur});
  final RoomRecap r;
  final String dur;
  @override
  Widget build(BuildContext context) => _Page(kicker: 'Room recap', children: [
        Text(r.roomName, style: AT.largeTitle.copyWith(fontSize: 44, letterSpacing: -1.5)),
        const SizedBox(height: 12),
        Text('You listened together for $dur.', style: AT.title3.copyWith(color: AT.label2)),
        const SizedBox(height: 40),
        const Text('Swipe', style: AT.footnote),
      ]);
}

class _Numbers extends StatelessWidget {
  const _Numbers({required this.r});
  final RoomRecap r;
  @override
  Widget build(BuildContext context) => _Page(kicker: 'By the numbers', children: [
        _CountUp(r.songs),
        const Text('songs played', style: AT.title3),
        const SizedBox(height: 28),
        Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_CountUp(r.participants, style: AT.largeTitle.copyWith(fontSize: 48)), const Text('people', style: AT.subhead)])),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_CountUp(r.reactions, style: AT.largeTitle.copyWith(fontSize: 48)), const Text('reactions', style: AT.subhead)])),
        ]),
      ]);
}

Widget _fact(String label, String? value) => value == null
    ? const SizedBox.shrink()
    : Padding(padding: const EdgeInsets.only(bottom: 22), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(label, style: AT.footnote), const SizedBox(height: 2), Text(value, style: AT.title1, maxLines: 2, overflow: TextOverflow.ellipsis)]));

class _Tops extends StatelessWidget {
  const _Tops({required this.r});
  final RoomRecap r;
  @override
  Widget build(BuildContext context) => _Page(kicker: 'On repeat', children: [_fact('Most played song', r.topTrack), _fact('Most played artist', r.topArtist), _fact('Most reacted song', r.mostReactedTrack)]);
}

class _People extends StatelessWidget {
  const _People({required this.r});
  final RoomRecap r;
  @override
  Widget build(BuildContext context) => _Page(kicker: 'The crowd', children: [
        _fact('Top DJ', r.topDj),
        _fact('Most active', r.mostActive),
        _fact('Most requested artist', r.mostRequestedArtist),
        for (final h in r.highlights.take(3)) Padding(padding: const EdgeInsets.only(bottom: 6), child: Text('• $h', style: AT.subhead)),
      ]);
}

class _ShareCard extends StatelessWidget {
  const _ShareCard({required this.r, required this.boundaryKey, required this.dur, required this.sharing, required this.onShare});
  final RoomRecap r;
  final GlobalKey boundaryKey;
  final String dur;
  final bool sharing;
  final VoidCallback onShare;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
      child: Column(children: [
        Expanded(
          child: Center(
            child: AspectRatio(
              aspectRatio: 4 / 5,
              child: RepaintBoundary(
                key: boundaryKey,
                child: Container(
                  padding: const EdgeInsets.all(26),
                  decoration: BoxDecoration(borderRadius: BorderRadius.circular(28), gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFA586A), Color(0xFF6A1B9A), Color(0xFF0D0D1A)])),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('ROOM TOGETHER', style: AT.micro.copyWith(color: Colors.white70, letterSpacing: 1.4)),
                    const SizedBox(height: 10),
                    Text(r.roomName, style: AT.title1.copyWith(fontSize: 30), maxLines: 2, overflow: TextOverflow.ellipsis),
                    const Spacer(),
                    Text('${r.songs}', style: AT.largeTitle.copyWith(fontSize: 78, letterSpacing: -3)),
                    const Text('songs together', style: AT.headline),
                    const SizedBox(height: 18),
                    Text('$dur · ${r.participants} people · ${r.reactions} reactions', style: AT.subhead.copyWith(color: Colors.white70)),
                    if (r.topArtist != null) ...[const SizedBox(height: 6), Text('Most played: ${r.topArtist}', style: AT.subhead.copyWith(color: Colors.white70), maxLines: 1, overflow: TextOverflow.ellipsis)],
                    const SizedBox(height: 18),
                    Text('zenify', style: AT.headline.copyWith(color: Colors.white54)),
                  ]),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        PillButton(label: 'Share image', icon: CupertinoIcons.share, expand: true, loading: sharing, onTap: onShare),
      ]),
    );
  }
}
