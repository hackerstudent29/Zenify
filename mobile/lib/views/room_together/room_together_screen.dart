import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/apple/apple_kit.dart';
import '../../design_system/apple/apple_tokens.dart';
import '../../models/room_models.dart';
import '../../models/track.dart';
import '../../services/dock_visibility.dart';
import '../../services/innertube_service.dart';
import '../../services/player_state.dart';
import '../../services/together_service.dart';
import '../../models/room_phase2_models.dart';
import '../../services/room_deep_links.dart';
import 'achievements/achievements_screen.dart';
import 'bookmarks/moments_sheet.dart';
import 'insights/room_insights_screen.dart';
import 'lyrics/lyrics.dart';
import 'lyrics/lyrics_view.dart';
import 'recap/room_recap_screen.dart';
import 'theme/room_theme_ui.dart';
import 'room_config_sheet.dart';
import 'room_sheets.dart';
import 'widgets/floating_reactions.dart';

class RoomTogetherScreen extends StatefulWidget {
  const RoomTogetherScreen({super.key});
  @override
  State<RoomTogetherScreen> createState() => _RoomTogetherScreenState();
}

class _RoomTogetherScreenState extends State<RoomTogetherScreen> with HideDocksMixin, SingleTickerProviderStateMixin {
  static const _emojis = ['❤️', '🔥', '👏', '😭', '💃', '🎧'];

  // Lobby
  String _mode = 'dj';
  final _joinCtrl = TextEditingController();
  final _nameCtrl = TextEditingController(text: 'Guest Listener');
  bool _busy = false;

  // Live
  int _tab = 0; // 0 Queue · 1 Chat · 2 People
  final _chatCtrl = TextEditingController();
  final _scroll = ScrollController();
  final _fx = GlobalKey<FloatingReactionsState>();

  TogetherService? _together;
  Map<String, int> _lastReactions = {};
  int _lastChat = 0;
  String _queueSig = '';
  List<String>? _pendingOrder; // optimistic reorder until server echo

  // Phase 2
  LyricsSession? _lyrics;
  PlayerState? _player;
  String _lyricsKey = '';
  String? _lastCode;
  String? _replyToId;
  String? _replyToPreview;
  final _deepLinks = RoomDeepLinks.instance;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_together == null) {
      _together = context.read<TogetherService>()..addListener(_onTogether);
      _lastReactions = Map.of(_together!.reactions);
      _lastChat = _together!.chat.length;
      _queueSig = _sig(_together!);
      _player = context.read<PlayerState>();
      _lyrics = LyricsSession(
        repo: LyricsRepository(({required String title, required String artist, required int durationSec}) => _together!.fetchLyrics(title: title, artist: artist, durationSec: durationSec)),
        vsync: this,
        position: () => _player!.livePosition.inMilliseconds,
      );
      _deepLinks.addListener(_onDeepLink);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _syncLyrics(_together!);
        _onDeepLink();
      });
    }
  }

  void _syncLyrics(TogetherService t) {
    final cur = t.currentTrack;
    if (!t.inRoom || cur == null) return;
    final k = LyricsRepository.key(cur.title, cur.artist);
    if (k == _lyricsKey) return;
    _lyricsKey = k;
    final next = t.queue.isEmpty ? null : t.queue.first.track;
    _lyrics?.setTrack(title: cur.title, artist: cur.artist, durationSec: cur.durationSeconds, nextTitle: next?.title, nextArtist: next?.artist, nextDurationSec: next?.durationSeconds);
  }

  void _onDeepLink() {
    final t = _together;
    if (t == null || t.inRoom || !mounted) return;
    final link = _deepLinks.consume();
    if (link == null) return;
    _joinCtrl.text = link.code;
    _join(t, inviteToken: link.token);
  }

  @override
  void dispose() {
    _together?.removeListener(_onTogether);
    _deepLinks.removeListener(_onDeepLink);
    _lyrics?.dispose();
    _joinCtrl.dispose();
    _nameCtrl.dispose();
    _chatCtrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  String _sig(TogetherService t) => t.queue.map((e) => e.id).join(',');

  // Side effects live here, never in build().
  void _onTogether() {
    final t = _together!;
    if (t.inRoom) _lastCode = t.roomCode;
    _syncLyrics(t);
    if (!t.inRoom) {
      _lyricsKey = '';
      // Recap: server says it is ready after a room ends.
      if (t.recapReady && _lastCode != null && mounted) {
        final code = _lastCode!;
        _lastCode = null;
        t.recapReady = false;
        t.clearPhase2State();
        Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => RoomRecapScreen(roomRef: code)));
      }
    }
    // Peer reactions → floating burst
    for (final e in t.reactions.entries) {
      final prev = _lastReactions[e.key] ?? 0;
      if (e.value > prev) _fx.currentState?.burst(e.key, count: math.min(3, e.value - prev));
    }
    _lastReactions = Map.of(t.reactions);

    // Server echo clears optimistic order
    final sig = _sig(t);
    if (sig != _queueSig) {
      _queueSig = sig;
      if (_pendingOrder != null && mounted) setState(() => _pendingOrder = null);
    }

    // Chat: stick to bottom only if user is already near it
    if (t.chat.length > _lastChat) {
      _lastChat = t.chat.length;
      if (_tab == 1) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!_scroll.hasClients) return;
          final nearBottom = _scroll.position.maxScrollExtent - _scroll.offset < 260;
          if (nearBottom) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 280), curve: Curves.easeOutCubic);
        });
      }
    }
  }

  // ───────────────────────── Actions ─────────────────────────

  void _react(TogetherService t, String e, {int burst = 1}) {
    _fx.currentState?.burst(e, count: burst);
    t.sendReaction(e);
  }

  String? get _guestName {
    final n = _nameCtrl.text.trim();
    return n.isEmpty ? null : n;
  }

  Future<void> _create(TogetherService t) async {
    final cfg = await showRoomConfigSheet(context, mode: _mode, hostName: _nameCtrl.text.trim().isEmpty ? 'My' : _nameCtrl.text.trim());
    if (cfg == null || !mounted) return;
    setState(() => _busy = true);
    final ok = await t.createRoom(mode: _mode, guestName: _guestName, config: cfg);
    if (ok && cfg.coverPath != null) {
      // Best-effort; room already exists. Failure is surfaced, not silent.
      final up = await t.uploadRoomCover(t.roomCode, cfg.coverPath!);
      if (!up && mounted) appleToast(context, 'Room created, but the cover could not upload.');
    }
    if (!mounted) return;
    setState(() => _busy = false);
    if (!ok) {
      HapticFeedback.heavyImpact();
      appleToast(context, _errorText(t.lastRoomError, 'Could not create the room.'), icon: CupertinoIcons.exclamationmark_circle);
    }
  }

  Future<void> _join(TogetherService t, {String? password, String? inviteToken}) async {
    final code = _joinCtrl.text.trim();
    if (code.length < 6) {
      HapticFeedback.heavyImpact();
      appleToast(context, 'Room codes have 6 characters.');
      return;
    }
    setState(() => _busy = true);
    final ok = await t.joinRoom(code, guestName: _guestName, password: password, inviteToken: inviteToken);
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) return;
    HapticFeedback.heavyImpact();
    final err = t.lastRoomError;
    if (err == 'PASSWORD_REQUIRED' || err == 'PASSWORD_INVALID') {
      final pw = await _askPassword(wrong: err == 'PASSWORD_INVALID');
      if (pw != null && mounted) await _join(t, password: pw, inviteToken: inviteToken);
    } else if (err == 'INVITE_INVALID') {
      appleToast(context, 'This invitation expired or was revoked.', icon: CupertinoIcons.link);
    } else if (err == 'WAITING_APPROVAL') {
      appleToast(context, 'Waiting for the host to let you in…', icon: CupertinoIcons.hourglass);
    } else {
      appleToast(context, _errorText(err, 'Could not join "$code".'), icon: CupertinoIcons.exclamationmark_circle);
    }
  }

  String _errorText(String? code, String fallback) => switch (code) {
        'ROOM_FULL' => 'This room is full.',
        'BLOCKED' => 'You cannot join this room.',
        'ROOM_NOT_FOUND' => 'No room with that code.',
        'ROOM_ENDED' => 'That room has ended.',
        'RATE_LIMITED' => 'Too many attempts. Wait a moment.',
        'NETWORK' => 'No connection. Check your network.',
        _ => fallback,
      };

  Future<String?> _askPassword({bool wrong = false}) {
    final c = TextEditingController();
    return showCupertinoDialog<String>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Room password'),
        content: Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Column(children: [
            if (wrong) const Padding(padding: EdgeInsets.only(bottom: 8), child: Text('Wrong password. Try again.', style: TextStyle(color: CupertinoColors.systemRed, fontSize: 13))),
            CupertinoTextField(controller: c, obscureText: true, autofocus: true, placeholder: 'Password'),
          ]),
        ),
        actions: [
          CupertinoDialogAction(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          CupertinoDialogAction(isDefaultAction: true, onPressed: () => Navigator.pop(ctx, c.text), child: const Text('Join')),
        ],
      ),
    ).whenComplete(c.dispose);
  }

  Future<void> _send(TogetherService t) async {
    final text = _chatCtrl.text.trim();
    if (text.isEmpty) return;
    HapticFeedback.selectionClick();
    final reply = _replyToId;
    _chatCtrl.clear();
    setState(() {
      _replyToId = null;
      _replyToPreview = null;
    });
    if (reply != null) {
      final ok = await t.sendChatReply(text, reply);
      if (!ok && mounted) {
        _chatCtrl.text = text;
        appleToast(context, 'Message not sent.');
      }
    } else {
      t.sendChat(text);
    }
  }

  String? _chatId(TogetherChatMessage m) => m.id.isEmpty ? null : m.id;

  Future<void> _chatActions(TogetherService t, TogetherChatMessage m) async {
    final id = _chatId(m);
    final mine = m.userId == t.myUserId;
    final canMod = t.can(RoomPermission.moderateChat);
    final choice = await appleActionSheet<String>(context, options: [
      if (id != null) ('Reply', 'reply', destructive: false),
      ('Copy', 'copy', destructive: false),
      if (id != null && mine) ('Edit', 'edit', destructive: false),
      if (id != null && (mine || canMod)) ('Delete', 'delete', destructive: true),
    ]);
    if (!mounted || choice == null) return;
    switch (choice) {
      case 'reply':
        setState(() {
          _replyToId = id;
          _replyToPreview = '${m.username}: ${m.text}';
        });
      case 'copy':
        Clipboard.setData(ClipboardData(text: m.text));
        appleToast(context, 'Copied');
      case 'edit':
        final c = TextEditingController(text: m.text);
        final txt = await showCupertinoDialog<String>(
          context: context,
          builder: (ctx) => CupertinoAlertDialog(
            title: const Text('Edit message'),
            content: Padding(padding: const EdgeInsets.only(top: 12), child: CupertinoTextField(controller: c, maxLength: 500, autofocus: true)),
            actions: [
              CupertinoDialogAction(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
              CupertinoDialogAction(isDefaultAction: true, onPressed: () => Navigator.pop(ctx, c.text.trim()), child: const Text('Save')),
            ],
          ),
        );
        c.dispose();
        if (txt != null && txt.isNotEmpty && txt != m.text && id != null) {
          final ok = await t.editChat(id, txt);
          if (!ok && mounted) appleToast(context, 'Could not edit.');
        }
      case 'delete':
        if (id != null) {
          final ok = await t.deleteChat(id);
          if (!ok && mounted) appleToast(context, 'Could not delete.');
        }
    }
  }

  void _openAdd(TogetherService t) {
    final mine = t.queue.where((i) => i.addedByUserId == t.myUserId).length;
    if (mine >= 3 && !t.can(RoomPermission.queueManage)) {
      HapticFeedback.heavyImpact();
      appleToast(context, 'You have 3 songs queued. Let others take a turn.', icon: CupertinoIcons.person_2);
      return;
    }
    AppleSheet.show<void>(context, initial: 0.85, builder: (ctx, sc) => _AddTrackBody(scroll: sc, together: t));
  }

  // ───────────────────────── Build ─────────────────────────

  @override
  Widget build(BuildContext context) {
    final t = context.watch<TogetherService>();
    final art = t.inRoom ? (t.currentTrack?.coverUrl ?? '') : '';

    return Scaffold(
      backgroundColor: AT.bg,
      resizeToAvoidBottomInset: true,
      body: RoomThemeScope(
        theme: t.roomTheme,
        child: Stack(children: [
          Positioned.fill(child: RoomAmbient(theme: t.inRoom ? t.roomTheme : const RoomTheme(), artworkUrl: art)),
          SafeArea(bottom: false, child: t.inRoom ? _live(t) : _lobby(t)),
          Positioned.fill(child: FloatingReactions(key: _fx)),
          if (t.inRoom) const AchievementUnlockOverlay(),
        ]),
      ),
    );
  }

  // ───────────────────────── Lobby ─────────────────────────

  Widget _lobby(TogetherService t) {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
        child: Row(children: [CircleIconButton(icon: CupertinoIcons.chevron_left, onTap: () => Navigator.of(context).pop())]),
      ),
      Expanded(
        child: ListView(
          physics: const BouncingScrollPhysics(),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: EdgeInsets.fromLTRB(24, 16, 24, MediaQuery.paddingOf(context).bottom + 32),
          children: [
            const Text('Room Together', style: AT.largeTitle),
            const SizedBox(height: 8),
            const Text('Listen to the same song at the same moment. Queue, chat and react together.', style: AT.subhead),
            const SizedBox(height: 28),
            PillTabs(labels: const ['DJ Session', 'Jam Session'], index: _mode == 'dj' ? 0 : 1, onChanged: (i) => setState(() => _mode = i == 0 ? 'dj' : 'collab')),
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 220),
              child: Padding(
                key: ValueKey(_mode),
                padding: const EdgeInsets.fromLTRB(8, 10, 8, 0),
                child: Text(_mode == 'dj' ? 'The host and chosen roles control playback. Everyone else listens and votes to skip.' : 'Everyone can play, pause and skip.', style: AT.footnote),
              ),
            ),
            const SizedBox(height: 28),
            _field(controller: _nameCtrl, placeholder: 'Your name', icon: CupertinoIcons.person_fill),
            const SizedBox(height: 14),
            PillButton(label: 'Create Room', icon: CupertinoIcons.plus, expand: true, loading: _busy, onTap: _busy ? null : () => _create(t)),
            const SizedBox(height: 28),
            Row(children: [
              const Expanded(child: Divider(color: AT.hairline, height: 0.5)),
              Padding(padding: const EdgeInsets.symmetric(horizontal: 12), child: Text('OR JOIN', style: AT.micro.copyWith(color: AT.label3))),
              const Expanded(child: Divider(color: AT.hairline, height: 0.5)),
            ]),
            const SizedBox(height: 20),
            Row(children: [
              Expanded(
                child: _field(
                  controller: _joinCtrl,
                  placeholder: 'ROOM CODE',
                  icon: CupertinoIcons.number,
                  formatters: [_CodeFormatter()],
                  textStyle: AT.headline.copyWith(letterSpacing: 3),
                  onSubmit: (_) => _busy ? null : _join(t),
                ),
              ),
              const SizedBox(width: 10),
              PillButton(label: 'Join', style: PillStyle.glass, onTap: _busy ? null : () => _join(t)),
            ]),
            const SizedBox(height: 36),
            Row(children: [
              Expanded(child: PillButton(label: 'Insights', icon: CupertinoIcons.chart_bar_fill, compact: true, style: PillStyle.glass, onTap: () => Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => const RoomInsightsScreen())))),
              const SizedBox(width: 10),
              Expanded(child: PillButton(label: 'Achievements', icon: CupertinoIcons.rosette, compact: true, style: PillStyle.glass, onTap: () => Navigator.of(context).push(CupertinoPageRoute<void>(builder: (_) => const AchievementsScreen())))),
            ]),
          ],
        ),
      ),
    ]);
  }

  Widget _field({required TextEditingController controller, required String placeholder, required IconData icon, List<TextInputFormatter>? formatters, TextStyle? textStyle, ValueChanged<String>? onSubmit}) {
    return CupertinoTextField(
      controller: controller,
      placeholder: placeholder,
      placeholderStyle: AT.callout.copyWith(color: AT.label3),
      style: textStyle ?? AT.callout,
      inputFormatters: formatters,
      onSubmitted: onSubmit,
      textCapitalization: TextCapitalization.characters,
      prefix: Padding(padding: const EdgeInsets.only(left: 16), child: Icon(icon, size: 18, color: AT.label2)),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 15),
      decoration: BoxDecoration(color: AT.fill, borderRadius: BorderRadius.circular(AT.rPill)),
    );
  }

  // ───────────────────────── Live room ─────────────────────────

  Widget _live(TogetherService t) {
    final player = context.watch<PlayerState>();
    final cfg = t.roomConfig;
    final bottom = MediaQuery.paddingOf(context).bottom;

    return Column(children: [
      _topBar(t, cfg),
      Expanded(
        child: CustomScrollView(
          controller: _scroll,
          physics: const BouncingScrollPhysics(),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          slivers: [
            SliverToBoxAdapter(child: _nowPlaying(t, player)),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 12),
                child: PillTabs(
                  labels: const ['Queue', 'Chat', 'People'],
                  index: _tab,
                  badges: [t.queue.length, null, t.memberCount],
                  onChanged: (i) {
                    setState(() => _tab = i);
                    if (i == 1) {
                      WidgetsBinding.instance.addPostFrameCallback((_) {
                        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 300), curve: Curves.easeOutCubic);
                      });
                    }
                  },
                ),
              ),
            ),
            ..._tabSlivers(t),
            SliverToBoxAdapter(child: SizedBox(height: _tab == 1 ? 12 : bottom + 40)),
          ],
        ),
      ),
      AnimatedSize(
        duration: const Duration(milliseconds: 260),
        curve: Curves.easeOutCubic,
        alignment: Alignment.bottomCenter,
        child: _tab == 1 ? _composer(t, bottom) : const SizedBox(width: double.infinity),
      ),
    ]);
  }

  Widget _topBar(TogetherService t, RoomConfig? cfg) {
    final title = (cfg?.name.isNotEmpty ?? false) ? cfg!.name : 'Room Together';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Row(children: [
        CircleIconButton(icon: CupertinoIcons.chevron_down, onTap: () => Navigator.of(context).pop(), tooltip: 'Minimise'),
        Expanded(
          child: Column(children: [
            Text(title, style: AT.headline, maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 2),
            Row(mainAxisSize: MainAxisSize.min, children: [
              _SyncDot(health: t.syncHealth),
              const SizedBox(width: 6),
              Text('${t.roomCode} · ${t.mode == 'collab' ? 'Jam' : 'DJ'}', style: AT.caption),
            ]),
          ]),
        ),
        CircleIconButton(icon: CupertinoIcons.ellipsis, onTap: () => showRoomMenu(context), tooltip: 'Room'),
      ]),
    );
  }

  // ───────────────────────── Now playing ─────────────────────────

  Widget _nowPlaying(TogetherService t, PlayerState player) {
    final Track? cur = t.currentTrack ?? player.currentTrack;
    final canPlay = t.can(RoomPermission.playback);
    final size = math.min(MediaQuery.sizeOf(context).width - 72, 320.0);
    final cover = cur?.coverUrl ?? '';

    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Artwork: tap → full screen (shared element), double-tap → hearts
        Center(
          child: GestureDetector(
            onDoubleTap: () {
              HapticFeedback.mediumImpact();
              _react(t, '❤️', burst: 5);
            },
            onTap: cover.isEmpty ? null : () => Navigator.of(context).push(PageRouteBuilder<void>(opaque: false, barrierColor: Colors.black87, transitionDuration: const Duration(milliseconds: 420), reverseTransitionDuration: const Duration(milliseconds: 320), pageBuilder: (_, a, _) => FadeTransition(opacity: a, child: _FullArtwork(url: cover)))),
            child: Hero(
              tag: 'room-artwork',
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 420),
                switchInCurve: Curves.easeOutCubic,
                transitionBuilder: (c, a) => FadeTransition(opacity: a, child: ScaleTransition(scale: Tween(begin: 0.96, end: 1.0).animate(a), child: c)),
                child: _Artwork(key: ValueKey(cover), url: cover, size: size),
              ),
            ),
          ),
        ),
        const SizedBox(height: 22),
        Text(cur?.title ?? 'Nothing playing', style: AT.title3, maxLines: 1, overflow: TextOverflow.ellipsis),
        const SizedBox(height: 2),
        Text(cur?.artist ?? (canPlay ? 'Add a song to start' : 'Waiting for the host'), style: AT.subhead.copyWith(fontSize: 17), maxLines: 1, overflow: TextOverflow.ellipsis),
        const SizedBox(height: 16),
        _ProgressBar(durationSeconds: cur?.durationSeconds ?? 0, onSeek: canPlay && cur != null ? (ms) async { final ok = await t.seekRoom(ms); if (!ok && mounted) appleToast(context, 'Could not seek.'); } : null),
        const SizedBox(height: 14),
        _controls(t, cur, canPlay),
        const SizedBox(height: 16),
        ReactionPill(emojis: _emojis, counts: t.reactions, onReact: (e) => _react(t, e)),
        const SizedBox(height: 16),
        if (_lyrics != null && cur != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: LyricsPreview(
              session: _lyrics!,
              onOpen: () => openFullscreenLyrics(context, session: _lyrics!, title: cur.title, artist: cur.artist, coverUrl: cur.coverUrl, onSeek: canPlay ? (ms) => t.seekRoom(ms) : null),
            ),
          ),
        _presence(t),
      ]),
    );
  }

  Widget _controls(TogetherService t, Track? cur, bool canPlay) {
    final detached = t.leaveSync;
    return Row(children: [
      Expanded(
        child: Align(
          alignment: Alignment.centerLeft,
          child: PillButton(
            label: detached ? 'Rejoin Live' : 'Live',
            icon: detached ? CupertinoIcons.arrow_2_circlepath : CupertinoIcons.dot_radiowaves_left_right,
            compact: true,
            style: detached ? PillStyle.filled : PillStyle.glass,
            onTap: () {
              HapticFeedback.mediumImpact();
              t.toggleLeaveSync();
            },
          ),
        ),
      ),
      _PlayPause(
        playing: t.isPlaying,
        enabled: canPlay,
        onTap: () {
          final pos = context.read<PlayerState>().livePosition.inMilliseconds / 1000.0;
          if (t.isPlaying) {
            t.hostPause(pos);
          } else if (cur != null) {
            t.hostPlay(cur, pos);
          }
        },
        onDenied: () => appleToast(context, 'Only people with playback control can do that.', icon: CupertinoIcons.lock_fill),
      ),
      Expanded(
        child: Align(
          alignment: Alignment.centerRight,
          child: PillButton(
            label: canPlay ? 'Skip' : 'Skip ${t.skipVotes.length}/${t.skipVotesNeeded}',
            icon: CupertinoIcons.forward_fill,
            compact: true,
            style: t.hasVotedSkip ? PillStyle.filled : PillStyle.glass,
            onTap: () => canPlay ? t.hostSkipNext() : t.voteSkip(),
          ),
        ),
      ),
    ]);
  }

  Widget _presence(TogetherService t) {
    final shown = t.members.take(5).toList();
    final extra = t.members.length - shown.length;
    return Row(children: [
      Expanded(
        child: SpringPressable(
          onTap: () => setState(() => _tab = 2),
          child: Row(children: [
            SizedBox(
              height: 32,
              width: 32.0 + (shown.length - 1).clamp(0, 5) * 22 + (extra > 0 ? 22 : 0),
              child: Stack(children: [
                for (var i = 0; i < shown.length; i++)
                  AnimatedPositioned(
                    key: ValueKey(shown[i].userId),
                    duration: const Duration(milliseconds: 380),
                    curve: SpringCurve(),
                    left: i * 22.0,
                    child: Container(
                      decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: AT.bg, width: 2)),
                      child: Avatar(name: shown[i].username, size: 32),
                    ),
                  ),
                if (extra > 0)
                  Positioned(
                    left: shown.length * 22.0,
                    child: Container(
                      width: 32,
                      height: 32,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: AT.surfaceHi, shape: BoxShape.circle, border: Border.all(color: AT.bg, width: 2)),
                      child: Text('+$extra', style: AT.micro.copyWith(color: AT.label)),
                    ),
                  ),
              ]),
            ),
            const SizedBox(width: 10),
            Text('${t.memberCount} listening', style: AT.footnote),
          ]),
        ),
      ),
      CircleIconButton(icon: CupertinoIcons.bookmark, size: 36, iconSize: 16, tooltip: 'Moments', onTap: () => showBookmarksSheet(context, momentActionsFor(context))),
    ]);
  }

  // ───────────────────────── Tabs ─────────────────────────

  List<Widget> _tabSlivers(TogetherService t) {
    switch (_tab) {
      case 0:
        return _queue(t);
      case 1:
        return _chat(t);
      default:
        return [SliverToBoxAdapter(child: _people(t))];
    }
  }

  List<_QItem> _orderedQueue(TogetherService t) {
    final items = t.queue.map((e) => _QItem(e)).toList();
    final order = _pendingOrder;
    if (order == null) return items;
    items.sort((a, b) {
      final ia = order.indexOf(a.item.id);
      final ib = order.indexOf(b.item.id);
      return (ia < 0 ? 1 << 20 : ia).compareTo(ib < 0 ? 1 << 20 : ib);
    });
    return items;
  }

  List<Widget> _queue(TogetherService t) {
    final items = _orderedQueue(t);
    final canManage = t.can(RoomPermission.queueManage);
    return [
      SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
          child: Row(children: [
            const Expanded(child: Text('Up Next', style: AT.title3)),
            if (t.can(RoomPermission.queueEdit)) PillButton(label: 'Add', icon: CupertinoIcons.plus, compact: true, style: PillStyle.tinted, color: RoomThemeScope.accentOf(context), onTap: () => _openAdd(t)),
          ]),
        ),
      ),
      if (items.isEmpty)
        const SliverToBoxAdapter(child: _Empty(icon: CupertinoIcons.music_note_list, title: 'Queue is empty', subtitle: 'Add songs for everyone to hear.'))
      else
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          sliver: SliverReorderableList(
            itemCount: items.length,
            onReorderStart: (_) => HapticFeedback.mediumImpact(),
            proxyDecorator: (child, i, anim) => AnimatedBuilder(
              animation: anim,
              builder: (_, c) => Transform.scale(scale: 1 + 0.03 * Curves.easeOut.transform(anim.value), child: Material(color: Colors.transparent, elevation: 8 * anim.value, shadowColor: Colors.black54, borderRadius: BorderRadius.circular(AT.rMd), child: c)),
              child: child,
            ),
            onReorderItem: (from, dest) {
              if (!canManage || dest == from) return;
              final ids = items.map((e) => e.item.id as String).toList();
              final moved = ids.removeAt(from);
              ids.insert(dest, moved);
              setState(() => _pendingOrder = ids);
              t.reorderQueue(moved, dest, t.queueRevision).then((ok) {
                if (!ok && mounted) {
                  setState(() => _pendingOrder = null);
                  appleToast(context, 'Queue changed. Reorder again.');
                }
              });
            },
            itemBuilder: (ctx, i) {
              final it = items[i].item;
              final canRemove = canManage || it.addedByUserId == t.myUserId;
              return Dismissible(
                key: ValueKey('q-${it.id}'),
                direction: canRemove ? DismissDirection.endToStart : DismissDirection.none,
                background: Container(alignment: Alignment.centerRight, padding: const EdgeInsets.only(right: 24), color: AT.red, child: const Icon(CupertinoIcons.delete, color: Colors.white)),
                onDismissed: (_) {
                  HapticFeedback.mediumImpact();
                  t.removeFromQueue(it.id);
                },
                child: _QueueTile(index: i, item: it, reorderable: canManage, mine: it.addedByUserId == t.myUserId),
              );
            },
          ),
        ),
    ];
  }

  List<Widget> _chat(TogetherService t) {
    if (t.chat.isEmpty) return [const SliverToBoxAdapter(child: _Empty(icon: CupertinoIcons.chat_bubble_2, title: 'No messages yet', subtitle: 'Say hi to the room.'))];
    return [
      SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        sliver: SliverList.builder(
          itemCount: t.chat.length,
          itemBuilder: (ctx, i) {
            final m = t.chat[i];
            final prev = i > 0 ? t.chat[i - 1] : null;
            final first = prev == null || prev.userId != m.userId;
            return _Bubble(msg: m, isMe: m.userId == t.myUserId, showName: first, accent: RoomThemeScope.accentOf(context), onLongPress: () => _chatActions(t, m));
          },
        ),
      ),
    ];
  }

  Widget _people(TogetherService t) {
    final members = [...t.members]..sort((a, b) => RoomRole.parse(b.role).rank.compareTo(RoomRole.parse(a.role).rank));
    return GroupedSection(children: [
      for (final m in members)
        AppleRow(
          leading: Avatar(name: m.username, size: 38, dot: m.lastPing > 0 ? AT.green : AT.label3),
          title: m.userId == t.myUserId ? '${m.username} (You)' : m.username,
          subtitle: m.lastPing > 0 ? '${m.lastPing} ms' : 'Offline',
          trailing: RolePill(RoomRole.parse(m.role)),
          chevron: true,
          onTap: () => showMemberSheet(context, m),
        ),
    ]);
  }

  Widget _composer(TogetherService t, double bottomInset) {
    return AppleBlur(
      borderRadius: BorderRadius.zero,
      tint: const Color(0xCC000000),
      border: false,
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 10, 16, math.max(10, bottomInset)),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (_replyToPreview != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(children: [
                const Icon(CupertinoIcons.reply, size: 14, color: AT.label2),
                const SizedBox(width: 8),
                Expanded(child: Text(_replyToPreview!, style: AT.caption, maxLines: 1, overflow: TextOverflow.ellipsis)),
                SpringPressable(onTap: () => setState(() { _replyToId = null; _replyToPreview = null; }), child: const Padding(padding: EdgeInsets.all(4), child: Icon(CupertinoIcons.xmark_circle_fill, size: 18, color: AT.label3))),
              ]),
            ),
          Row(children: [
          Expanded(
            child: CupertinoTextField(
              controller: _chatCtrl,
              placeholder: 'Message',
              placeholderStyle: AT.callout.copyWith(color: AT.label3),
              style: AT.callout,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => _send(t),
              maxLength: 500,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
              decoration: BoxDecoration(color: AT.fill, borderRadius: BorderRadius.circular(AT.rPill)),
            ),
          ),
          const SizedBox(width: 10),
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: _chatCtrl,
            builder: (_, v, _) => CircleIconButton(icon: CupertinoIcons.arrow_up, filled: true, color: RoomThemeScope.accentOf(context), size: 40, onTap: v.text.trim().isEmpty ? null : () => _send(t)),
          ),
        ]),
        ]),
      ),
    );
  }
}

// ═══════════════════════════ Pieces ═══════════════════════════

class _CodeFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue old, TextEditingValue v) {
    var s = v.text.toUpperCase().replaceAll(RegExp(r'[^0-9A-Z]'), '');
    if (s.length > 6) s = s.substring(0, 6);
    return TextEditingValue(text: s, selection: TextSelection.collapsed(offset: s.length));
  }
}

class _QItem {
  _QItem(this.item);
  final dynamic item; // TogetherQueueItem
}

class _Artwork extends StatelessWidget {
  const _Artwork({super.key, required this.url, required this.size});
  final String url;
  final double size;
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(color: AT.surfaceHi, borderRadius: BorderRadius.circular(AT.rLg), boxShadow: const [BoxShadow(color: Color(0x80000000), blurRadius: 32, offset: Offset(0, 16))]),
        child: url.isEmpty
            ? const Icon(CupertinoIcons.music_note, size: 64, color: AT.label3)
            : Image.network(url, fit: BoxFit.cover, cacheWidth: 720, gaplessPlayback: true, errorBuilder: (_, _, _) => const Icon(CupertinoIcons.music_note, size: 64, color: AT.label3)),
      );
}

class _FullArtwork extends StatelessWidget {
  const _FullArtwork({required this.url});
  final String url;
  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: () => Navigator.pop(context),
        onVerticalDragEnd: (d) {
          if ((d.primaryVelocity ?? 0).abs() > 300) Navigator.pop(context);
        },
        behavior: HitTestBehavior.opaque,
        child: Center(
          child: Hero(tag: 'room-artwork', child: _Artwork(url: url, size: MediaQuery.sizeOf(context).width - 32)),
        ),
      );
}

class _ProgressBar extends StatefulWidget {
  const _ProgressBar({required this.durationSeconds, this.onSeek});
  final int durationSeconds;
  final Future<void> Function(int ms)? onSeek; // null = read-only (no PLAYBACK permission)
  @override
  State<_ProgressBar> createState() => _ProgressBarState();
}

class _ProgressBarState extends State<_ProgressBar> {
  double? _drag; // 0..1 while user drags

  String _fmt(int s) => '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    // Only this widget rebuilds with playback position.
    final pos = context.watch<PlayerState>().livePosition;
    final total = widget.durationSeconds > 0 ? widget.durationSeconds : 1;
    final live = (pos.inMilliseconds / 1000 / total).clamp(0.0, 1.0);
    final f = _drag ?? live;
    final canSeek = widget.onSeek != null && widget.durationSeconds > 0;
    final shownSec = (f * total).round();

    return LayoutBuilder(builder: (context, c) {
      return Column(children: [
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onHorizontalDragStart: canSeek ? (d) => setState(() => _drag = (d.localPosition.dx / c.maxWidth).clamp(0.0, 1.0)) : null,
          onHorizontalDragUpdate: canSeek ? (d) => setState(() => _drag = (d.localPosition.dx / c.maxWidth).clamp(0.0, 1.0)) : null,
          onHorizontalDragEnd: canSeek
              ? (_) {
                  final target = _drag;
                  setState(() => _drag = null);
                  if (target != null) {
                    HapticFeedback.selectionClick();
                    widget.onSeek!((target * total * 1000).round());
                  }
                }
              : null,
          onTapUp: canSeek
              ? (d) {
                  HapticFeedback.selectionClick();
                  widget.onSeek!(((d.localPosition.dx / c.maxWidth).clamp(0.0, 1.0) * total * 1000).round());
                }
              : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: SizedBox(
                height: _drag != null ? 9 : 5,
                child: Stack(children: [
                  Container(color: AT.fillStrong),
                  FractionallySizedBox(widthFactor: f, child: Container(color: AT.label)),
                ]),
              ),
            ),
          ),
        ),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(_fmt(shownSec), style: AT.caption),
          Text(widget.durationSeconds > 0 ? '-${_fmt(math.max(0, widget.durationSeconds - shownSec))}' : '--:--', style: AT.caption),
        ]),
      ]);
    });
  }
}

class _PlayPause extends StatefulWidget {
  const _PlayPause({required this.playing, required this.enabled, required this.onTap, required this.onDenied});
  final bool playing;
  final bool enabled;
  final VoidCallback onTap;
  final VoidCallback onDenied;
  @override
  State<_PlayPause> createState() => _PlayPauseState();
}

class _PlayPauseState extends State<_PlayPause> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 260), value: widget.playing ? 1 : 0);

  @override
  void didUpdateWidget(covariant _PlayPause old) {
    super.didUpdateWidget(old);
    if (old.playing != widget.playing) widget.playing ? _c.forward() : _c.reverse();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: widget.enabled ? 1 : 0.5,
      child: SpringPressable(
        pressedScale: 0.9,
        onTap: widget.enabled ? widget.onTap : widget.onDenied,
        child: Container(
          width: 68,
          height: 68,
          decoration: const BoxDecoration(color: AT.label, shape: BoxShape.circle),
          child: Center(child: AnimatedIcon(icon: AnimatedIcons.play_pause, progress: _c, size: 34, color: Colors.black)),
        ),
      ),
    );
  }
}

class _QueueTile extends StatelessWidget {
  const _QueueTile({required this.index, required this.item, required this.reorderable, required this.mine});
  final int index;
  final dynamic item;
  final bool reorderable;
  final bool mine;
  @override
  Widget build(BuildContext context) {
    final Track tr = item.track;
    return Container(
      color: AT.bg.withValues(alpha: 0.001),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
      child: Row(children: [
        Container(
          width: 48,
          height: 48,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(color: AT.surfaceHi, borderRadius: BorderRadius.circular(AT.rSm)),
          child: tr.coverUrl.isNotEmpty ? Image.network(tr.coverUrl, fit: BoxFit.cover, cacheWidth: 144, errorBuilder: (_, _, _) => const Icon(CupertinoIcons.music_note, size: 20, color: AT.label3)) : const Icon(CupertinoIcons.music_note, size: 20, color: AT.label3),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(tr.title, style: AT.body.copyWith(fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 1),
            Text('${tr.artist} · Added by ${mine ? 'you' : item.addedByName}', style: AT.footnote, maxLines: 1, overflow: TextOverflow.ellipsis),
          ]),
        ),
        if (reorderable)
          ReorderableDragStartListener(index: index, child: const Padding(padding: EdgeInsets.all(10), child: Icon(CupertinoIcons.line_horizontal_3, size: 18, color: AT.label3))),
      ]),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.msg, required this.isMe, required this.showName, required this.accent, this.onLongPress});
  final dynamic msg;
  final bool isMe;
  final bool showName;
  final Color accent;
  final VoidCallback? onLongPress;
  @override
  Widget build(BuildContext context) {
    final maxW = MediaQuery.sizeOf(context).width * 0.74;
    return Padding(
      padding: EdgeInsets.only(top: showName ? 10 : 2),
      child: Column(crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: [
        if (showName && !isMe) Padding(padding: const EdgeInsets.only(left: 12, bottom: 3), child: Text(msg.username, style: AT.caption)),
        GestureDetector(
          onLongPress: onLongPress,
          child: Container(
            constraints: BoxConstraints(maxWidth: maxW),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(color: isMe ? accent : AT.surfaceHi, borderRadius: BorderRadius.circular(18)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              if (_replyText(msg) != null) Container(margin: const EdgeInsets.only(bottom: 4), padding: const EdgeInsets.only(left: 8), decoration: const BoxDecoration(border: Border(left: BorderSide(color: Colors.white54, width: 2))), child: Text(_replyText(msg)!, maxLines: 2, overflow: TextOverflow.ellipsis, style: AT.caption.copyWith(color: Colors.white70))),
              Text(msg.text, style: AT.callout.copyWith(fontSize: 16, color: isMe && accent.computeLuminance() > 0.6 ? Colors.black : Colors.white)),
            ]),
          ),
        ),
      ]),
    );
  }
}

String? _replyText(dynamic m) {
  try {
    return m.replyToText as String?;
  } catch (_) {
    return null;
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 32),
        child: Column(children: [
          Icon(icon, size: 38, color: AT.label3),
          const SizedBox(height: 12),
          Text(title, style: AT.headline),
          const SizedBox(height: 4),
          Text(subtitle, style: AT.footnote, textAlign: TextAlign.center),
        ]),
      );
}

class _SyncDot extends StatelessWidget {
  const _SyncDot({required this.health});
  final SyncHealth health;
  @override
  Widget build(BuildContext context) {
    final c = switch (health) {
      SyncHealth.connected => AT.green,
      SyncHealth.syncing => AT.amber,
      SyncHealth.outOfSync => AT.red,
      SyncHealth.disconnected => AT.label3,
    };
    return AnimatedContainer(duration: const Duration(milliseconds: 300), width: 7, height: 7, decoration: BoxDecoration(color: c, shape: BoxShape.circle));
  }
}

// ═══════════════════════════ Add track sheet ═══════════════════════════

class _AddTrackBody extends StatefulWidget {
  const _AddTrackBody({required this.scroll, required this.together});
  final ScrollController scroll;
  final TogetherService together;
  @override
  State<_AddTrackBody> createState() => _AddTrackBodyState();
}

class _AddTrackBodyState extends State<_AddTrackBody> {
  final _ctrl = TextEditingController();
  List<Track> _results = [];
  bool _searching = false;
  Timer? _debounce;
  int _req = 0;
  final Set<String> _added = {};

  String _key(Track t) => '${t.title}|${t.artist}';

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    final query = q.trim();
    if (query.isEmpty) {
      setState(() {
        _results = [];
        _searching = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () async {
      final my = ++_req;
      setState(() => _searching = true);
      try {
        final r = await InnerTubeService.instance.search(query);
        if (mounted && my == _req) setState(() => _results = r);
      } catch (_) {
        if (mounted && my == _req) appleToast(context, 'Search failed. Try again.');
      } finally {
        if (mounted && my == _req) setState(() => _searching = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      SheetHeader(title: 'Add to Queue', onClose: () => Navigator.pop(context)),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        child: CupertinoSearchTextField(
          controller: _ctrl,
          autofocus: true,
          placeholder: 'Songs, artists, albums',
          style: AT.callout,
          backgroundColor: AT.fill,
          itemColor: AT.label2,
          onChanged: _onChanged,
        ),
      ),
      Expanded(
        child: _searching && _results.isEmpty
            ? const Center(child: CupertinoActivityIndicator())
            : _results.isEmpty
                ? Center(child: Text(_ctrl.text.isEmpty ? 'Search for something to play together.' : 'No results', style: AT.subhead))
                : ListView.builder(
                    controller: widget.scroll,
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    itemCount: _results.length,
                    itemBuilder: (ctx, i) {
                      final tr = _results[i];
                      final added = _added.contains(_key(tr));
                      return Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                        child: Row(children: [
                          Container(
                            width: 48,
                            height: 48,
                            clipBehavior: Clip.antiAlias,
                            decoration: BoxDecoration(color: AT.surfaceHi, borderRadius: BorderRadius.circular(AT.rSm)),
                            child: tr.coverUrl.isNotEmpty ? Image.network(tr.coverUrl, fit: BoxFit.cover, cacheWidth: 144, errorBuilder: (_, _, _) => const SizedBox()) : null,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(tr.title, style: AT.body.copyWith(fontSize: 16), maxLines: 1, overflow: TextOverflow.ellipsis),
                              Text(tr.artist, style: AT.footnote, maxLines: 1, overflow: TextOverflow.ellipsis),
                            ]),
                          ),
                          AnimatedSwitcher(
                            duration: const Duration(milliseconds: 220),
                            transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                            child: added
                                ? const Padding(key: ValueKey('done'), padding: EdgeInsets.all(8), child: Icon(CupertinoIcons.checkmark_circle_fill, color: AT.green, size: 28))
                                : CircleIconButton(
                                    key: const ValueKey('add'),
                                    icon: CupertinoIcons.plus,
                                    size: 34,
                                    iconSize: 16,
                                    onTap: () {
                                      // Mark first: blocks rapid duplicate taps.
                                      if (!_added.add(_key(tr))) return;
                                      setState(() {});
                                      HapticFeedback.lightImpact();
                                      widget.together.addToQueue(tr);
                                    },
                                  ),
                          ),
                        ]),
                      );
                    },
                  ),
      ),
    ]);
  }
}
