import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../../../design_system/apple/apple_kit.dart';
import '../../../design_system/apple/apple_tokens.dart';
import '../../../models/room_phase2_models.dart';
import 'lyrics.dart';

/// Owns loading + sync for the current track. One per room screen.
/// The ticker only runs while synced lyrics exist, and only reads the authoritative position.
class LyricsSession extends ChangeNotifier {
  LyricsSession({required this.repo, required TickerProvider vsync, required this.position}) {
    _ticker = vsync.createTicker((_) => controller.update(position()));
  }

  final LyricsRepository repo;
  final int Function() position; // ms, authoritative playback position
  final LyricsSyncController controller = LyricsSyncController();
  late final Ticker _ticker;

  LyricsData? data;
  bool loading = false;
  bool failed = false;
  bool showTranslation = true;
  bool showRomanization = false;
  bool hidden = false; // user setting: lyrics visibility
  String _key = '';

  bool get unavailable => !loading && !failed && data == null && _key.isNotEmpty;

  void setTrack({required String title, required String artist, required int durationSec, String? nextTitle, String? nextArtist, int? nextDurationSec}) {
    final k = LyricsRepository.key(title, artist);
    if (k == _key) return;
    _key = k;
    data = null;
    failed = false;
    loading = title.isNotEmpty;
    _ticker.stop();
    controller.setLines(const []);
    notifyListeners();
    if (title.isEmpty) return;
    repo.load(title, artist, durationSec).then((d) {
      if (_key != k) return; // track changed meanwhile
      loading = false;
      data = d;
      failed = false;
      controller.setLines(d?.lines ?? const []);
      if (d != null && !hidden && !_ticker.isActive) _ticker.start();
      notifyListeners();
    }).catchError((_) {
      if (_key != k) return;
      loading = false;
      failed = true;
      notifyListeners();
    });
    if (nextTitle != null && nextTitle.isNotEmpty) repo.preload(nextTitle, nextArtist ?? '', nextDurationSec ?? 0);
  }

  void setHidden(bool v) {
    hidden = v;
    if (v) {
      _ticker.stop();
    } else if (data != null && !_ticker.isActive) {
      _ticker.start();
    }
    notifyListeners();
  }

  void toggleTranslation() {
    showTranslation = !showTranslation;
    notifyListeners();
  }

  void toggleRomanization() {
    showRomanization = !showRomanization;
    notifyListeners();
  }

  @override
  void dispose() {
    _ticker.dispose();
    controller.dispose();
    super.dispose();
  }
}

// ═════════════════ Inline preview card ═════════════════

class LyricsPreview extends StatelessWidget {
  const LyricsPreview({super.key, required this.session, required this.onOpen});
  final LyricsSession session;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        if (session.hidden) return const SizedBox.shrink();
        final d = session.data;
        if (session.loading) return const _PreviewShell(child: Center(child: CupertinoActivityIndicator()));
        if (d == null) {
          return _PreviewShell(
            child: Row(children: [
              const Icon(CupertinoIcons.text_quote, color: AT.label3, size: 20),
              const SizedBox(width: 10),
              Expanded(child: Text(session.failed ? 'Could not load lyrics' : 'Lyrics unavailable for this song', style: AT.footnote)),
            ]),
          );
        }
        return SpringPressable(
          onTap: onOpen,
          pressedScale: 0.985,
          child: _PreviewShell(
            child: ValueListenableBuilder<int>(
              valueListenable: session.controller.activeIndex,
              builder: (_, i, _) {
                final lines = d.lines;
                String at(int k) => k >= 0 && k < lines.length ? lines[k].text : '';
                return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(at(i - 1), maxLines: 1, overflow: TextOverflow.ellipsis, style: AT.subhead.copyWith(color: AT.label3)),
                  const SizedBox(height: 4),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 260),
                    child: Text(i < 0 ? '♪' : at(i), key: ValueKey(i), maxLines: 2, overflow: TextOverflow.ellipsis, style: AT.headline.copyWith(fontSize: 19)),
                  ),
                  const SizedBox(height: 4),
                  Text(at(i + 1), maxLines: 1, overflow: TextOverflow.ellipsis, style: AT.subhead.copyWith(color: AT.label2)),
                ]);
              },
            ),
          ),
        );
      },
    );
  }
}

class _PreviewShell extends StatelessWidget {
  const _PreviewShell({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        constraints: const BoxConstraints(minHeight: 84),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AT.fill, borderRadius: BorderRadius.circular(AT.rLg)),
        child: child,
      );
}

// ═════════════════ Full lyrics list ═════════════════

class LyricsView extends StatefulWidget {
  const LyricsView({super.key, required this.session, this.onSeek, this.karaoke = true, this.padding = const EdgeInsets.fromLTRB(24, 120, 24, 160)});
  final LyricsSession session;
  final ValueChanged<int>? onSeek; // null = user lacks permission
  final bool karaoke;
  final EdgeInsets padding;
  @override
  State<LyricsView> createState() => _LyricsViewState();
}

class _LyricsViewState extends State<LyricsView> {
  final _scroll = ScrollController();
  final Map<int, GlobalKey> _keys = {};
  bool _userDragging = false;
  DateTime _lastUserScroll = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    widget.session.controller.activeIndex.addListener(_follow);
  }

  @override
  void dispose() {
    widget.session.controller.activeIndex.removeListener(_follow);
    _scroll.dispose();
    super.dispose();
  }

  void _follow() {
    if (_userDragging || DateTime.now().difference(_lastUserScroll) < const Duration(seconds: 3)) return;
    final i = widget.session.controller.activeIndex.value;
    final ctx = _keys[i]?.currentContext;
    if (ctx == null || !mounted) return;
    final reduce = MediaQuery.of(context).disableAnimations;
    Scrollable.ensureVisible(ctx, alignment: 0.32, duration: reduce ? Duration.zero : const Duration(milliseconds: 480), curve: Curves.easeOutCubic);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.session;
    return ListenableBuilder(
      listenable: s,
      builder: (context, _) {
        final d = s.data;
        if (s.loading) return const Center(child: CupertinoActivityIndicator());
        if (d == null) {
          return Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(CupertinoIcons.text_quote, size: 40, color: AT.label3),
              const SizedBox(height: 12),
              Text(s.failed ? 'Could not load lyrics' : 'No lyrics for this song', style: AT.headline),
              const SizedBox(height: 4),
              const Text('Lyrics come from a licensed provider when available.', style: AT.footnote),
            ]),
          );
        }
        return NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (n is ScrollStartNotification && n.dragDetails != null) _userDragging = true;
            if (n is ScrollEndNotification) {
              _userDragging = false;
              _lastUserScroll = DateTime.now();
            }
            return false;
          },
          child: SingleChildScrollView(
            controller: _scroll,
            physics: const BouncingScrollPhysics(),
            padding: widget.padding,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (var i = 0; i < d.lines.length; i++)
                _Line(
                  key: _keys.putIfAbsent(i, GlobalKey.new),
                  index: i,
                  line: d.lines[i],
                  session: s,
                  karaoke: widget.karaoke,
                  onTap: widget.onSeek == null ? null : () => widget.onSeek!(d.lines[i].startMs),
                ),
            ]),
          ),
        );
      },
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({super.key, required this.index, required this.line, required this.session, required this.karaoke, this.onTap});
  final int index;
  final LyricLine line;
  final LyricsSession session;
  final bool karaoke;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = session.controller;
    return ValueListenableBuilder<int>(
      valueListenable: c.activeIndex,
      builder: (_, active, _) {
        final dist = (index - active).abs();
        final isActive = index == active;
        final opacity = isActive ? 1.0 : (index < active ? 0.32 : (dist <= 2 ? 0.55 : 0.38));
        final size = isActive ? 30.0 : 26.0;
        final base = TextStyle(fontSize: size, fontWeight: FontWeight.w700, letterSpacing: -0.6, height: 1.2, color: AT.label.withValues(alpha: opacity));

        Widget text;
        if (isActive && karaoke && line.words.isNotEmpty) {
          text = ValueListenableBuilder<int>(
            valueListenable: c.positionMs,
            builder: (_, pos, _) => RichText(
              text: TextSpan(children: [
                for (final w in line.words) TextSpan(text: '${w.text} ', style: base.copyWith(color: pos >= w.startMs ? AT.label : AT.label.withValues(alpha: 0.4))),
              ]),
            ),
          );
        } else {
          text = AnimatedDefaultTextStyle(duration: const Duration(milliseconds: 260), style: base, child: Text(line.text.isEmpty ? '♪' : line.text));
        }

        return SpringPressable(
          onTap: onTap,
          haptic: onTap != null,
          pressedScale: 0.98,
          child: AnimatedPadding(
            duration: const Duration(milliseconds: 260),
            padding: EdgeInsets.symmetric(vertical: isActive ? 12 : 8),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              text,
              if (session.showRomanization && line.romanization != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(line.romanization!, style: AT.subhead.copyWith(color: AT.label.withValues(alpha: opacity * 0.8)))),
              if (session.showTranslation && line.translation != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(line.translation!, style: AT.subhead.copyWith(fontSize: 16, color: AT.label.withValues(alpha: opacity * 0.7)))),
            ]),
          ),
        );
      },
    );
  }
}

// ═════════════════ Fullscreen ═════════════════

Future<void> openFullscreenLyrics(BuildContext context, {required LyricsSession session, required String title, required String artist, required String coverUrl, ValueChanged<int>? onSeek}) {
  return Navigator.of(context).push(PageRouteBuilder<void>(
    transitionDuration: const Duration(milliseconds: 420),
    reverseTransitionDuration: const Duration(milliseconds: 300),
    pageBuilder: (_, a, _) => FadeTransition(
      opacity: a,
      child: Scaffold(
        backgroundColor: AT.bg,
        body: Stack(children: [
          Positioned.fill(child: ArtworkAmbient(url: coverUrl)),
          Positioned.fill(child: LyricsView(session: session, onSeek: onSeek)),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: ListenableBuilder(
                listenable: session,
                builder: (context, _) => Row(children: [
                  CircleIconButton(icon: CupertinoIcons.chevron_down, onTap: () => Navigator.pop(context)),
                  Expanded(
                    child: Column(children: [
                      Text(title, style: AT.headline, maxLines: 1, overflow: TextOverflow.ellipsis),
                      Text(artist, style: AT.caption, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ]),
                  ),
                  if (session.data?.hasTranslation ?? false) ...[
                    CircleIconButton(icon: CupertinoIcons.globe, filled: session.showTranslation, tooltip: 'Translation', onTap: session.toggleTranslation),
                    const SizedBox(width: 6),
                  ],
                  if (session.data?.hasRomanization ?? false) CircleIconButton(icon: CupertinoIcons.textformat_abc, filled: session.showRomanization, tooltip: 'Romanization', onTap: session.toggleRomanization),
                ]),
              ),
            ),
          ),
        ]),
      ),
    ),
  ));
}
